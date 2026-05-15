import { inngest } from '@/lib/inngest/client'
import { buildSystemContext } from '@/lib/auth/context'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { resend } from '@/lib/resend/client'
import * as workflowRunService from '@/modules/workflow/services/workflow-run.service'
import * as automationFailureRepo from '@/modules/workflow/repositories/automation-failure.repo'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'

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

    // ---- Create workflow run ----
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

    // ---- Classify as P1: Immediate Action ----
    const lead = await step.run('classify-p1', async () => {
      // Fetch first so we can merge metadata non-destructively
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

    // ---- Create document_extractions record (pending analysis) ----
    await step.run('create-extraction-record', async () => {
      const existing = await supabase
        .from('document_extractions')
        .select('id')
        .eq('tenant_id', data.tenantId)
        .eq('artifact_id', data.artifactId)
        .eq('extraction_type', 'statement_analysis')
        .maybeSingle()

      if (existing.data) return { id: existing.data.id, skipped: true }

      const { data: row, error } = await supabase
        .from('document_extractions')
        .insert({
          tenant_id: data.tenantId,
          artifact_id: data.artifactId,
          extraction_type: 'statement_analysis',
          status: 'pending',
          structured_data: {},
        })
        .select('id')
        .single()

      if (error) logger.warn('document_extractions insert failed', { error: error.message })
      return { id: row?.id ?? null, skipped: false }
    })

    // ---- Fetch contact + sender identity ----
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

      return {
        contact: contactResult.data,
        sender: senderResult,
      }
    })

    const contact = contactAndSender.contact
    const sender = contactAndSender.sender

    if (!contact?.email) {
      logger.warn('statement.received: no contact email, skipping draft', {
        lead_id: data.leadId,
        contact_id: data.contactId,
      })
      await step.run('complete-workflow-no-email', () =>
        workflowRunService.completeWorkflowRun(ctx, run.id)
      )
      return { runId: run.id, status: 'skipped_no_email' }
    }

    // ---- Build proposal content ----
    const proposalResult = await step.run('build-proposal', () => {
      const companyName = data.companyName ?? 'your business'
      const contactFirst = contact?.first_name ?? data.firstName
      const senderName = sender?.name ?? '321 Swipe'
      const calendlyLink = process.env.CALENDLY_LINK ?? 'https://calendly.com/321swipe'

      const proposalSummary =
        '321 Swipe offers interchange-plus pricing — you only pay what the card networks charge, ' +
        'plus a small fixed margin. Our clients typically reduce processing costs by 15-25% ' +
        'compared to flat-rate processors. We\'ll provide an exact savings estimate after ' +
        'reviewing your statement.'

      const bodyText =
        `Hi ${contactFirst},\n\n` +
        `Thank you for submitting your merchant processing statement. ` +
        `We've reviewed your account and prepared a personalized proposal for ${companyName}.\n\n` +
        `${proposalSummary}\n\n` +
        `We'd love to walk you through the details. ` +
        `Schedule a free 15-minute call at a time that works for you:\n` +
        `${calendlyLink}\n\n` +
        `If you have any questions before then, just reply to this email.\n\n` +
        `Best,\n${senderName}\n321 Swipe`

      const bodyHtml =
        `<p>Hi ${contactFirst},</p>` +
        `<p>Thank you for submitting your merchant processing statement. ` +
        `We've reviewed your account and prepared a personalized proposal for ${companyName}.</p>` +
        `<p>${proposalSummary}</p>` +
        `<p>We'd love to walk you through the details. ` +
        `Schedule a free 15-minute call at a time that works for you:</p>` +
        `<p><a href="${calendlyLink}" style="display:inline-block;background:#2563eb;color:#fff;` +
        `padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">` +
        `Schedule Your Free Review Call</a></p>` +
        `<p>If you have any questions before then, just reply to this email.</p>` +
        `<p>Best,<br>${senderName}<br>321 Swipe</p>`

      const subject = `Your merchant processing proposal — ${companyName}`

      return { bodyText, bodyHtml, subject, contactFirst, senderName, calendlyLink }
    })

    // ---- Supersede existing drafts + create statement proposal draft ----
    const draftResult = await step.run('create-proposal-draft', async () => {
      await emailDraftRepo.supersedePendingDraftsForLead(data.tenantId, data.leadId)

      const toName = `${contact!.first_name ?? ''} ${contact!.last_name ?? ''}`.trim() || null

      const draft = await emailDraftRepo.createEmailDraft({
        tenantId: data.workspaceId ? data.tenantId : data.tenantId,
        workspaceId: data.workspaceId,
        senderIdentityId: sender?.id ?? null,
        toEmail: contact!.email!,
        toName,
        subject: proposalResult.subject,
        bodyHtml: proposalResult.bodyHtml,
        bodyText: proposalResult.bodyText,
        status: 'pending_approval',
        leadId: data.leadId,
        contactId: data.contactId,
        companyId: data.companyId,
        workflowRunId: run.id,
        generatedByAi: false,
        aiGenerationMetadata: {
          source: data.source,
          artifact_id: data.artifactId,
          workflow: 'statement_review_p1',
          calendly_link: proposalResult.calendlyLink,
          reason_created: 'statement_received_workflow',
          generated_at: new Date().toISOString(),
        },
      })

      logger.info('statement.received: proposal draft created', {
        draft_id: draft.id,
        lead_id: data.leadId,
      })
      return draft
    })

    // ---- Create approval request with secure review token ----
    const approvalResult = await step.run('create-approval-request', async () => {
      // Guard: don't create a second approval if one already exists for this draft
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
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

      const approval = await approvalRepo.createApprovalRequest({
        tenantId: data.tenantId,
        workspaceId: data.workspaceId,
        workflowRunId: run.id,
        requestType: 'statement_proposal_review',
        subjectType: 'lead',
        subjectId: data.leadId,
        expiresAt,
        payload: {
          draft_id: draftResult.id,
          subject: proposalResult.subject,
          to_email: contact!.email,
          to_name: draftResult.to_name,
          body_text: proposalResult.bodyText,
          body_html: proposalResult.bodyHtml,
          lead_id: data.leadId,
          contact_id: data.contactId,
          company_id: data.companyId,
          company_name: data.companyName,
          lead_name: lead?.name ?? data.firstName + ' ' + data.lastName,
          contact_name: `${contact!.first_name ?? ''} ${contact!.last_name ?? ''}`.trim(),
          contact_email: contact!.email,
          source: data.source,
          artifact_id: data.artifactId,
          review_token: reviewToken,
          review_token_expires_at: expiresAt,
        },
      })

      // Link approval back to draft
      await emailDraftRepo.linkApprovalToEmailDraft(draftResult.id, approval.id)

      logger.info('statement.received: approval request created', {
        approval_id: approval.id,
        review_token: reviewToken,
        expires_at: expiresAt,
      })
      return { id: approval.id, reviewToken }
    })

    // ---- Send internal notification email to sales team ----
    await step.run('send-internal-notification', async () => {
      const salesEmail = process.env.SALES_EMAIL
      if (!salesEmail) {
        logger.warn('statement.received: SALES_EMAIL not configured, skipping internal notification')
        return { skipped: true }
      }

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://verian-bios.vercel.app').replace(/\/$/, '')
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

      const companyLabel = data.companyName ?? contact!.email
      const contactLabel = `${contact!.first_name ?? ''} ${contact!.last_name ?? ''}`.trim()

      const internalBodyText =
        `[ACTION REQUIRED] New Statement Submission — ${companyLabel}\n\n` +
        `A prospect has submitted a merchant processing statement and is awaiting a proposal review.\n\n` +
        `Details:\n` +
        `  Lead:    ${lead?.name ?? contactLabel}\n` +
        `  Company: ${companyLabel}\n` +
        `  Contact: ${contactLabel} <${contact!.email}>\n` +
        `  Source:  ${data.source}\n\n` +
        `PROPOSED CUSTOMER EMAIL\n` +
        `Subject: ${proposalResult.subject}\n` +
        `─────────────────────────────\n` +
        `${proposalResult.bodyText}\n` +
        `─────────────────────────────\n\n` +
        `REVIEW, EDIT & APPROVE:\n${reviewLink}\n\n` +
        `This link expires in 7 days. Click to review the proposed email, ` +
        `make any edits, and approve or reject.\n\n` +
        `—\nVerian BIOS — Statement Review Workflow`

      const internalBodyHtml =
        `<h2 style="color:#b91c1c">Action Required: New Statement Submission</h2>` +
        `<p>A prospect has submitted a merchant processing statement and is awaiting a proposal review.</p>` +
        `<table style="border-collapse:collapse;margin-bottom:16px">` +
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top">Lead</td>` +
        `<td style="padding:4px 0"><strong>${lead?.name ?? contactLabel}</strong></td></tr>` +
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Company</td>` +
        `<td style="padding:4px 0">${companyLabel}</td></tr>` +
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Contact</td>` +
        `<td style="padding:4px 0">${contactLabel} &lt;${contact!.email}&gt;</td></tr>` +
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Source</td>` +
        `<td style="padding:4px 0">${data.source}</td></tr>` +
        `</table>` +
        `<h3>Proposed Customer Email</h3>` +
        `<p><strong>Subject:</strong> ${proposalResult.subject}</p>` +
        `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;` +
        `white-space:pre-wrap;font-family:monospace;font-size:13px;line-height:1.6">${proposalResult.bodyText}</div>` +
        `<br>` +
        `<a href="${reviewLink}" style="display:inline-block;background:#2563eb;color:#fff;` +
        `padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">` +
        `Review &amp; Approve Proposal →</a>` +
        `<p style="color:#6b7280;font-size:12px;margin-top:12px">` +
        `This link expires in 7 days. You can review, edit, approve, reject, or hold from the Verian review page.</p>` +
        `<p style="color:#9ca3af;font-size:11px">Verian BIOS — Statement Review Workflow</p>`

      try {
        const { error } = await resend.emails.send({
          from: fromAddress,
          to: [salesEmail],
          subject: `[Review Required] New Statement — ${companyLabel}`,
          html: internalBodyHtml,
          text: internalBodyText,
        })

        if (error) {
          logger.error('statement.received: internal email send failed', {
            error: (error as { message?: string }).message,
          })
          return { ok: false }
        }

        logger.info('statement.received: internal notification sent', { to: salesEmail })
        return { ok: true }
      } catch (err) {
        logger.error('statement.received: internal email exception', {
          error: err instanceof Error ? err.message : String(err),
        })
        return { ok: false }
      }
    })

    // ---- Log activity ----
    await step.run('log-activity', () =>
      supabase.from('activities').insert({
        tenant_id: data.tenantId,
        workspace_id: data.workspaceId,
        activity_type: 'statement_workflow_initiated',
        subject: `P1 Statement Review workflow started`,
        body: `Statement uploaded via ${data.source}. Internal review notification sent. Awaiting sales approval.`,
        lead_id: data.leadId,
        contact_id: data.contactId,
        company_id: data.companyId,
        metadata: {
          artifact_id: data.artifactId,
          approval_id: approvalResult.id,
          review_token: approvalResult.reviewToken,
          source: data.source,
          priority_tier: 'P1',
        },
      })
    )

    await step.run('complete-workflow', () =>
      workflowRunService.completeWorkflowRun(ctx, run.id)
    )

    logger.info('statement.received: P1 workflow complete', {
      lead_id: data.leadId,
      run_id: run.id,
      approval_id: approvalResult.id,
    })

    return {
      runId: run.id,
      leadId: data.leadId,
      draftId: draftResult.id,
      approvalId: approvalResult.id,
      status: 'completed',
    }
  }
)
