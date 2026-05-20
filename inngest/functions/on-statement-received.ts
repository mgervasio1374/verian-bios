import { inngest } from '@/lib/inngest/client'
import { buildSystemContext } from '@/lib/auth/context'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { resend } from '@/lib/resend/client'
import * as workflowRunService from '@/modules/workflow/services/workflow-run.service'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import { buildPlaceholderAnalysis } from '@/lib/statement/analysis'
import { generateProposalPdf } from '@/lib/pdf/proposal'
import { reviewAndPersistEmailDraftQuality } from '@/modules/messaging/services/email-quality-review-runner.service'
import type { StatementAnalysis } from '@/lib/statement/analysis'

// ---- Lead priority tiers ----
// P1 Immediate Action → 'critical' (statement uploaded, strong buying signal)
// P2 High Priority    → 'high'     (partner lead, phone lead)
// P3 Standard Nurture → 'medium'   (imported list, form fill)
// P4 Enrichment Needed → 'low'     (cold, incomplete)

interface StatementReceivedPayload {
  artifactId: string
  leadId: string
  contactId: string
  companyId: string | null
  tenantId: string
  workspaceId: string
  source: string
  firstName: string
  lastName: string
  email: string
  companyName: string | null
}

const STORAGE_BUCKET = 'artifacts'

export const onStatementReceived = inngest.createFunction(
  {
    id: 'on-statement-received',
    name: 'On Statement Received: P1 Statement Review Workflow',
    retries: 2,
    triggers: [{ event: 'statement.received' }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as StatementReceivedPayload
    const ctx = buildSystemContext(data.tenantId, data.workspaceId)
    const supabase = createSupabaseServiceClient()

    logger.info('statement.received: starting P1 workflow', {
      lead_id: data.leadId,
      artifact_id: data.artifactId,
      source: data.source,
    })

    // ── Create workflow run ────────────────────────────────────────────────
    const run = await step.run('create-workflow-run', () =>
      workflowRunService.createWorkflowRun(ctx, {
        subjectType: 'lead',
        subjectId: data.leadId,
        context: {
          trigger: 'statement.received',
          leadId: data.leadId,
          artifactId: data.artifactId,
          source: data.source,
        },
      })
    )

    // ── Classify as P1 ────────────────────────────────────────────────────
    const lead = await step.run('classify-p1', async () => {
      const { data: current } = await supabase
        .from('leads')
        .select('metadata, name, company_id, contact_id, source, estimated_value')
        .eq('id', data.leadId)
        .eq('tenant_id', data.tenantId)
        .single()

      const existing = (current?.metadata ?? {}) as Record<string, unknown>
      const merged = {
        ...existing,
        priority_tier: 'P1',
        priority_reason: 'Merchant statement uploaded; prospect requested analysis.',
        classified_at: new Date().toISOString(),
      }
      await supabase
        .from('leads')
        .update({ priority: 'critical', stage: 'statement_received', metadata: merged })
        .eq('id', data.leadId)
        .eq('tenant_id', data.tenantId)

      logger.info('statement.received: lead classified P1', { lead_id: data.leadId })
      return current
    })

    // ── Fetch artifact name for analysis context ───────────────────────────
    const artifactMeta = await step.run('fetch-artifact', async () => {
      const { data: art } = await supabase
        .from('artifacts')
        .select('name, mime_type')
        .eq('id', data.artifactId)
        .eq('tenant_id', data.tenantId)
        .single()
      return { name: art?.name ?? 'statement.pdf', mimeType: art?.mime_type ?? '' }
    })

    // ── Build placeholder statement analysis ──────────────────────────────
    const analysis: StatementAnalysis = await step.run('build-analysis', () => {
      const leadMeta = {
        metadata: (lead?.metadata ?? {}) as Record<string, unknown>,
        source: lead?.source ?? data.source,
      }
      return buildPlaceholderAnalysis(leadMeta, artifactMeta.name, data.companyName)
    })

    // ── Persist analysis in document_extractions ───────────────────────────
    const extractionId = await step.run('persist-analysis', async () => {
      // Upsert: if a pending record already exists, update it with analysis data
      const { data: existing } = await supabase
        .from('document_extractions')
        .select('id')
        .eq('tenant_id', data.tenantId)
        .eq('artifact_id', data.artifactId)
        .eq('extraction_type', 'statement_analysis')
        .maybeSingle()

      if (existing?.id) {
        await supabase
          .from('document_extractions')
          .update({
            status: 'placeholder',
            structured_data: analysis as unknown as Record<string, unknown>,
            processed_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        return existing.id
      }

      const { data: row } = await supabase
        .from('document_extractions')
        .insert({
          tenant_id: data.tenantId,
          artifact_id: data.artifactId,
          extraction_type: 'statement_analysis',
          status: 'placeholder',
          structured_data: analysis as unknown as Record<string, unknown>,
          processed_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      return row?.id ?? null
    })

    // ── Generate PDF proposal + upload to Supabase Storage ─────────────────
    const pdfArtifact = await step.run('generate-pdf-and-upload', async () => {
      const calendlyLink = process.env.CALENDLY_LINK ?? 'https://calendly.com/321swipe'
      const contactFirst = data.firstName
      const contactLast  = data.lastName
      const contactName  = [contactFirst, contactLast].filter(Boolean).join(' ') || null

      let pdfBytes: Uint8Array
      try {
        pdfBytes = await generateProposalPdf({
          companyName:  data.companyName,
          contactName,
          contactEmail: data.email,
          analysis,
          calendlyLink,
          generatedAt:  new Date().toISOString(),
        })
      } catch (err) {
        logger.error('generate-pdf-and-upload: PDF generation failed', {
          error: err instanceof Error ? err.message : String(err),
        })
        return null
      }

      // Upload to Supabase Storage
      const filename    = `proposal-${data.leadId}-${Date.now()}.pdf`
      const storagePath = `${data.tenantId}/proposals/${data.leadId}/${filename}`

      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })

      if (uploadErr) {
        logger.error('generate-pdf-and-upload: storage upload failed', { error: uploadErr.message })
        return null
      }

      // Create artifact record for the PDF
      const { data: artifactRow, error: artErr } = await supabase
        .from('artifacts')
        .insert({
          tenant_id:     data.tenantId,
          workspace_id:  data.workspaceId,
          name:          filename,
          artifact_type: 'proposal_pdf',
          mime_type:     'application/pdf',
          file_size_bytes: pdfBytes.byteLength,
          storage_bucket: STORAGE_BUCKET,
          storage_path:   storagePath,
          status:        'active',
          is_latest:     true,
          company_id:    data.companyId,
          contact_id:    data.contactId,
          lead_id:       data.leadId,
          description:   `321 Swipe proposal package for ${data.companyName ?? data.email}`,
        })
        .select('id')
        .single()

      if (artErr || !artifactRow) {
        logger.error('generate-pdf-and-upload: artifact insert failed', { error: artErr?.message })
        return null
      }

      logger.info('statement.received: PDF generated and uploaded', {
        artifact_id: artifactRow.id,
        storage_path: storagePath,
        size_bytes: pdfBytes.byteLength,
      })

      return { id: artifactRow.id, storagePath, pdfBytes: Array.from(pdfBytes) }
    })

    // ── Fetch contact + sender identity ────────────────────────────────────
    const contactAndSender = await step.run('fetch-contact-sender', async () => {
      const [contactResult, senderResult] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email, phone')
          .eq('id', data.contactId)
          .eq('tenant_id', data.tenantId)
          .single(),
        emailDraftRepo.getDefaultSenderIdentity(data.tenantId),
      ])
      return { contact: contactResult.data, sender: senderResult }
    })

    const contact = contactAndSender.contact
    const sender  = contactAndSender.sender

    if (!contact?.email) {
      logger.warn('statement.received: no contact email, skipping draft', {
        lead_id: data.leadId,
        contact_id: data.contactId,
      })
      await step.run('complete-no-email', () => workflowRunService.completeWorkflowRun(ctx, run.id))
      return { runId: run.id, status: 'skipped_no_email' }
    }

    // ── Build customer email draft content ─────────────────────────────────
    const proposalResult = await step.run('build-proposal', () => {
      const companyName  = data.companyName ?? 'your business'
      const contactFirst = contact?.first_name ?? data.firstName
      const senderName   = sender?.name ?? '321 Swipe'
      const calendlyLink = process.env.CALENDLY_LINK ?? 'https://calendly.com/321swipe'

      const hasPdf = pdfArtifact !== null

      // ── Customer-facing email copy ─────────────────────────────────────────
      // Conservative language only — no unsupported savings claims.
      const companyLine = data.companyName ? ` for ${data.companyName}` : ''
      const pdfLine = hasPdf
        ? 'The attached document outlines the preliminary pricing structure, the assumptions used for this review, and the recommended next steps.'
        : 'Our team will follow up shortly with a personalized pricing proposal once the review is complete.'

      const bodyText =
        `Hi ${contactFirst},\n\n` +
        `Thank you for submitting your merchant processing statement${companyLine}.\n\n` +
        `We completed an initial review and prepared a proposal package for your business. ` +
        `${pdfLine}\n\n` +
        `Because every merchant statement can include different fees, card mix, and processor-specific charges, ` +
        `we would like to walk through the details with you before finalizing any savings estimate.\n\n` +
        `You can schedule a quick statement review here:\n` +
        `${calendlyLink}\n\n` +
        `If you have any questions before then, simply reply to this email.\n\n` +
        `Best,\n${senderName}\n321 Swipe`

      const bodyHtml =
        `<p>Hi ${contactFirst},</p>` +
        `<p>Thank you for submitting your merchant processing statement` +
        (data.companyName ? ` for <strong>${data.companyName}</strong>` : '') +
        `.</p>` +
        `<p>We completed an initial review and prepared a proposal package for your business. ` +
        `${pdfLine}</p>` +
        `<p>Because every merchant statement can include different fees, card mix, and processor-specific charges, ` +
        `we would like to walk through the details with you before finalizing any savings estimate.</p>` +
        `<p>You can schedule a quick statement review here:</p>` +
        `<p><a href="${calendlyLink}" style="display:inline-block;background:#2563eb;color:#fff;` +
        `padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">` +
        `Schedule Your Statement Review</a></p>` +
        `<p>If you have any questions before then, simply reply to this email.</p>` +
        `<p>Best,<br>${senderName}<br>321 Swipe</p>`

      const subject = `Your merchant processing proposal — ${companyName}`

      return { bodyText, bodyHtml, subject, contactFirst, senderName, calendlyLink }
    })

    // ── Supersede old drafts + create proposal draft ───────────────────────
    const draftResult = await step.run('create-proposal-draft', async () => {
      await emailDraftRepo.supersedePendingDraftsForLead(data.tenantId, data.leadId)

      const toName = `${contact!.first_name ?? ''} ${contact!.last_name ?? ''}`.trim() || null

      const draft = await emailDraftRepo.createEmailDraft({
        tenantId:       data.tenantId,
        workspaceId:    data.workspaceId,
        senderIdentityId: sender?.id ?? null,
        toEmail:        contact!.email!,
        toName,
        subject:        proposalResult.subject,
        bodyHtml:       proposalResult.bodyHtml,
        bodyText:       proposalResult.bodyText,
        status:         'pending_approval',
        leadId:         data.leadId,
        contactId:      data.contactId,
        companyId:      data.companyId,
        workflowRunId:  run.id,
        generatedByAi:  false,
        aiGenerationMetadata: {
          source:                  data.source,
          artifact_id:             data.artifactId,
          analysis_extraction_id:  extractionId,
          proposal_pdf_artifact_id: pdfArtifact?.id ?? null,
          workflow:                'statement_review_p1',
          calendly_link:           proposalResult.calendlyLink,
          reason_created:          'statement_received_workflow',
          generated_at:            new Date().toISOString(),
        },
      })

      logger.info('statement.received: proposal draft created', {
        draft_id: draft.id,
        lead_id: data.leadId,
      })
      return draft
    })

    // ── Auto quality review for proposal draft (non-fatal) ────────────────
    await step.run('auto-quality-review', async () => {
      try {
        await reviewAndPersistEmailDraftQuality(draftResult.id, data.tenantId, data.workspaceId)
        logger.info('statement.received: quality review complete', { draft_id: draftResult.id })
        return { ok: true }
      } catch (err) {
        logger.warn('statement.received: quality review failed (non-fatal)', {
          draft_id: draftResult.id,
          error: err instanceof Error ? err.message : String(err),
        })
        return { ok: false }
      }
    })

    // ── Create approval request with review token ──────────────────────────
    const approvalResult = await step.run('create-approval-request', async () => {
      const existing = await supabase
        .from('approval_requests')
        .select('id, payload')
        .eq('tenant_id', data.tenantId)
        .eq('subject_type', 'lead')
        .eq('subject_id', data.leadId)
        .eq('request_type', 'statement_proposal_review')
        .eq('status', 'pending')
        .maybeSingle()

      if (existing.data) {
        const p = existing.data.payload as Record<string, unknown>
        logger.info('statement.received: approval already exists', { approval_id: existing.data.id })
        return { id: existing.data.id, reviewToken: String(p.review_token ?? '') }
      }

      const reviewToken = crypto.randomUUID()
      const expiresAt   = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

      const approval = await approvalRepo.createApprovalRequest({
        tenantId:     data.tenantId,
        workspaceId:  data.workspaceId,
        workflowRunId: run.id,
        requestType:  'statement_proposal_review',
        subjectType:  'lead',
        subjectId:    data.leadId,
        expiresAt,
        payload: {
          draft_id:                  draftResult.id,
          subject:                   proposalResult.subject,
          to_email:                  contact!.email,
          to_name:                   draftResult.to_name,
          body_text:                 proposalResult.bodyText,
          body_html:                 proposalResult.bodyHtml,
          lead_id:                   data.leadId,
          contact_id:                data.contactId,
          company_id:                data.companyId,
          company_name:              data.companyName,
          lead_name:                 lead?.name ?? `${data.firstName} ${data.lastName}`.trim(),
          contact_name:              `${contact!.first_name ?? ''} ${contact!.last_name ?? ''}`.trim(),
          contact_email:             contact!.email,
          source:                    data.source,
          artifact_id:               data.artifactId,
          analysis_extraction_id:    extractionId,
          proposal_pdf_artifact_id:  pdfArtifact?.id ?? null,
          proposal_pdf_storage_path: pdfArtifact?.storagePath ?? null,
          analysis_confidence:       analysis.confidence,
          analysis_processor:        analysis.processor_name,
          analysis_pricing_model:    analysis.proposed_pricing_model,
          analysis_basis_points:     analysis.proposed_basis_points,
          analysis_monthly_fee:      analysis.proposed_monthly_fee,
          review_token:              reviewToken,
          review_token_expires_at:   expiresAt,
        },
      })

      await emailDraftRepo.linkApprovalToEmailDraft(draftResult.id, approval.id)

      logger.info('statement.received: approval request created', {
        approval_id: approval.id,
        pdf_artifact_id: pdfArtifact?.id ?? null,
        review_token: reviewToken,
      })
      return { id: approval.id, reviewToken }
    })

    // ── Send internal sales notification ───────────────────────────────────
    await step.run('send-internal-notification', async () => {
      const salesEmail = process.env.SALES_EMAIL
      if (!salesEmail) {
        logger.warn('statement.received: SALES_EMAIL not configured')
        return { skipped: true }
      }

      const appUrl     = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://verian-bios.vercel.app').replace(/\/$/, '')
      const reviewLink = `${appUrl}/approve/${approvalResult.reviewToken}`
      const fromAddress = sender
        ? `${sender.name} <${sender.email}>`
        : process.env.NODE_ENV !== 'production'
          ? 'Verian BIOS <onboarding@resend.dev>'
          : null

      if (!fromAddress) {
        logger.warn('statement.received: no sender identity for internal email')
        return { skipped: true }
      }

      const companyLabel  = data.companyName ?? contact!.email
      const contactLabel  = `${contact!.first_name ?? ''} ${contact!.last_name ?? ''}`.trim()
      const processorLine = analysis.processor_name
        ? `Current Processor: ${analysis.processor_name}`
        : 'Current Processor: Not yet identified'

      // Build analysis summary for the email
      const analysisSummaryHtml =
        `<table style="border-collapse:collapse;width:100%;margin-bottom:12px;font-size:13px">` +
        `<tr style="background:#f9fafb"><td style="padding:6px 12px;color:#6b7280;width:200px">Confidence</td>` +
        `<td style="padding:6px 12px;font-weight:600;color:#d97706">Preliminary — Pending Review</td></tr>` +
        `<tr><td style="padding:6px 12px;color:#6b7280">${processorLine.split(':')[0]}</td>` +
        `<td style="padding:6px 12px">${analysis.processor_name ?? '—'}</td></tr>` +
        `<tr style="background:#f9fafb"><td style="padding:6px 12px;color:#6b7280">Proposed Model</td>` +
        `<td style="padding:6px 12px">Interchange-Plus</td></tr>` +
        `<tr><td style="padding:6px 12px;color:#6b7280">Proposed Markup</td>` +
        `<td style="padding:6px 12px">${analysis.proposed_basis_points} bps + ` +
        `$${(analysis.proposed_per_txn_cents / 100).toFixed(2)}/txn + ` +
        `$${analysis.proposed_monthly_fee}/mo</td></tr>` +
        `</table>`

      const internalBodyHtml =
        `<h2 style="color:#b91c1c;margin-bottom:4px">Action Required: New Statement Submission</h2>` +
        `<p style="color:#6b7280;margin-top:0">A prospect has submitted a merchant statement and is awaiting proposal review.</p>` +
        `<table style="border-collapse:collapse;margin-bottom:16px;font-size:13px">` +
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top">Lead</td>` +
        `<td style="padding:4px 0"><strong>${lead?.name ?? contactLabel}</strong></td></tr>` +
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Company</td>` +
        `<td style="padding:4px 0">${companyLabel}</td></tr>` +
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Contact</td>` +
        `<td style="padding:4px 0">${contactLabel} &lt;${contact!.email}&gt;</td></tr>` +
        `</table>` +
        `<h3 style="margin-bottom:8px">Analysis Summary</h3>` +
        `${analysisSummaryHtml}` +
        `<h3 style="margin-bottom:8px">Proposed Customer Email</h3>` +
        `<p style="margin:0"><strong>Subject:</strong> ${proposalResult.subject}</p>` +
        `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;` +
        `white-space:pre-wrap;font-family:monospace;font-size:12px;line-height:1.5;margin:8px 0">` +
        `${proposalResult.bodyText}</div>` +
        (pdfArtifact
          ? `<p style="font-size:13px;color:#6b7280">📎 Proposal PDF attached to this email.</p>`
          : '') +
        `<br><a href="${reviewLink}" style="display:inline-block;background:#2563eb;color:#fff;` +
        `padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">` +
        `Review &amp; Approve Proposal →</a>` +
        `<p style="color:#6b7280;font-size:12px;margin-top:12px">` +
        `Link expires in 7 days. You can review, edit, approve, reject, or hold from the Verian review page.</p>` +
        `<p style="color:#9ca3af;font-size:11px;margin-top:8px">Verian BIOS — Statement Review Workflow</p>`

      const internalBodyText =
        `[ACTION REQUIRED] New Statement Submission — ${companyLabel}\n\n` +
        `Lead: ${lead?.name ?? contactLabel}\nCompany: ${companyLabel}\n` +
        `Contact: ${contactLabel} <${contact!.email}>\n\n` +
        `Analysis Summary:\n` +
        `  Confidence:    Preliminary — Pending Review\n` +
        `  Processor:     ${analysis.processor_name ?? 'Not identified'}\n` +
        `  Proposed:      Interchange-Plus, ${analysis.proposed_basis_points}bps ` +
        `+ $${(analysis.proposed_per_txn_cents/100).toFixed(2)}/txn + $${analysis.proposed_monthly_fee}/mo\n\n` +
        `Proposed Customer Email:\nSubject: ${proposalResult.subject}\n` +
        `─────────────\n${proposalResult.bodyText}\n─────────────\n\n` +
        `Review & Approve: ${reviewLink}\n\n` +
        `This link expires in 7 days.`

      // Build attachment array — include PDF if generated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachments: any[] = []
      if (pdfArtifact?.pdfBytes) {
        attachments.push({
          filename: `321swipe-proposal-${(data.companyName ?? 'merchant').replace(/\s+/g, '-').toLowerCase()}.pdf`,
          content:  Buffer.from(pdfArtifact.pdfBytes),
        })
      }

      try {
        const { error } = await resend.emails.send({
          from:    fromAddress,
          to:      [salesEmail],
          subject: `[Review Required] New Statement — ${companyLabel}`,
          html:    internalBodyHtml,
          text:    internalBodyText,
          attachments: attachments.length ? attachments : undefined,
        })

        if (error) {
          logger.error('statement.received: internal email failed', {
            error: (error as { message?: string }).message,
          })
          return { ok: false }
        }

        logger.info('statement.received: internal notification sent', {
          to: salesEmail,
          pdf_attached: attachments.length > 0,
        })
        return { ok: true }
      } catch (err) {
        logger.error('statement.received: internal email exception', {
          error: err instanceof Error ? err.message : String(err),
        })
        return { ok: false }
      }
    })

    // ── Log activity ───────────────────────────────────────────────────────
    await step.run('log-activity', () =>
      supabase.from('activities').insert({
        tenant_id:    data.tenantId,
        workspace_id: data.workspaceId,
        activity_type: 'statement_workflow_initiated',
        subject:      'P1 Statement Review workflow started',
        body: `Statement uploaded via ${data.source}. Placeholder analysis generated. ` +
              `Proposal PDF ${pdfArtifact ? 'generated and ' : ''}attached to internal review email.`,
        lead_id:    data.leadId,
        contact_id: data.contactId,
        company_id: data.companyId,
        metadata: {
          artifact_id:               data.artifactId,
          analysis_extraction_id:    extractionId,
          proposal_pdf_artifact_id:  pdfArtifact?.id ?? null,
          approval_id:               approvalResult.id,
          review_token:              approvalResult.reviewToken,
          source:                    data.source,
          priority_tier:             'P1',
        },
      })
    )

    await step.run('complete-workflow', () =>
      workflowRunService.completeWorkflowRun(ctx, run.id)
    )

    logger.info('statement.received: P1 workflow complete', {
      lead_id:     data.leadId,
      run_id:      run.id,
      approval_id: approvalResult.id,
      pdf_generated: pdfArtifact !== null,
    })

    return {
      runId:         run.id,
      leadId:        data.leadId,
      draftId:       draftResult.id,
      approvalId:    approvalResult.id,
      pdfArtifactId: pdfArtifact?.id ?? null,
      status:        'completed',
    }
  }
)
