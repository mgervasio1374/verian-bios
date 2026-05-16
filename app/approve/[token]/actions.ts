'use server'

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { resend } from '@/lib/resend/client'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import type { StatementAnalysis } from '@/lib/statement/analysis'

// ---- Token resolution helper ----

type ApprovalRow = Awaited<ReturnType<typeof approvalRepo.getApprovalByReviewToken>>

async function resolveApprovalByToken(
  token: string
): Promise<{ error: string } | { approval: NonNullable<ApprovalRow>; payload: Record<string, unknown> }> {
  const approval = await approvalRepo.getApprovalByReviewToken(token)
  if (!approval) return { error: 'Invalid or expired review link.' }

  const payload   = (approval.payload ?? {}) as Record<string, unknown>
  const expiresAt = typeof payload.review_token_expires_at === 'string'
    ? new Date(payload.review_token_expires_at)
    : null

  if (expiresAt && expiresAt < new Date()) return { error: 'This review link has expired.' }
  if (approval.status !== 'pending') return { error: `This approval has already been ${approval.status}.` }

  return { approval, payload }
}

// ---- Approve & send customer email ----

export async function approveAndSendAction(
  token: string,
  editedSubject: string,
  editedBodyText: string,
  editedBodyHtml: string
): Promise<ActionResult<{ draftId: string; sendId: string | null }>> {
  try {
    const resolved = await resolveApprovalByToken(token)
    if ('error' in resolved) return { success: false, error: resolved.error }

    const { approval, payload } = resolved
    const draftId = typeof payload.draft_id === 'string' ? payload.draft_id : null
    if (!draftId) return { success: false, error: 'Approval payload is missing draft_id.' }

    const supabase = createSupabaseServiceClient()

    // 1. Apply edits to the draft
    await emailDraftRepo.updateEmailDraftContent(draftId, approval.tenant_id, {
      subject:  editedSubject.trim() || undefined,
      bodyText: editedBodyText,
      bodyHtml: editedBodyHtml || undefined,
    })

    // 2. Resolve the approval_request
    // approved_by is null for token-based approvals (no authenticated Verian user)
    await approvalRepo.resolveApprovalRequest(
      approval.id,
      approval.tenant_id,
      null,
      'approved',
      { approved_via: 'review_link', review_token: token }
    )

    // 3. Mark draft approved
    await emailDraftRepo.updateDraftStatus(draftId, {
      status:          'approved',
      approvedAt:      new Date().toISOString(),
      ifCurrentStatus: 'pending_approval',
    })

    // 4. Fetch approved draft for sending
    const { data: draft } = await supabase
      .from('email_drafts')
      .select('id, to_email, to_name, subject, body_html, body_text, sender_identity_id, tenant_id')
      .eq('id', draftId)
      .single()

    if (!draft) return { success: false, error: 'Draft not found after approval.' }

    // 5. Sender identity
    const senderIdentity = await emailDraftRepo.getDefaultSenderIdentity(draft.tenant_id)
    const fromAddress = senderIdentity
      ? `${senderIdentity.name} <${senderIdentity.email}>`
      : process.env.NODE_ENV !== 'production'
        ? 'Verian BIOS <onboarding@resend.dev>'
        : null

    if (!fromAddress) {
      return { success: true, data: { draftId, sendId: null } }
    }

    // 6. Fetch PDF bytes from Supabase Storage (if proposal PDF was generated)
    const pdfStoragePath = typeof payload.proposal_pdf_storage_path === 'string'
      ? payload.proposal_pdf_storage_path
      : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachments: any[] = []

    if (pdfStoragePath) {
      try {
        const { data: pdfData, error: pdfErr } = await supabase.storage
          .from('artifacts')
          .download(pdfStoragePath)

        if (!pdfErr && pdfData) {
          const pdfBuffer = Buffer.from(await pdfData.arrayBuffer())
          const companySlug = typeof payload.company_name === 'string'
            ? payload.company_name.replace(/\s+/g, '-').toLowerCase()
            : 'merchant'
          attachments.push({
            filename: `321swipe-proposal-${companySlug}.pdf`,
            content:  pdfBuffer,
          })
        }
      } catch {
        // Non-fatal — email still sends without attachment
      }
    }

    // 7. Send customer email via Resend
    const { data: resendData, error: resendErr } = await resend.emails.send({
      from:        fromAddress,
      to:          [draft.to_email],
      subject:     draft.subject,
      html:        draft.body_html ?? `<p>${draft.body_text ?? ''}</p>`,
      text:        draft.body_text ?? undefined,
      attachments: attachments.length ? attachments : undefined,
    })

    const now = new Date().toISOString()

    if (resendErr || !resendData) {
      await supabase.from('email_sends').insert({
        tenant_id:     draft.tenant_id,
        draft_id:      draftId,
        to_email:      draft.to_email,
        subject:       draft.subject,
        status:        'failed',
        error_message: (resendErr as { message?: string } | null)?.message ?? 'Resend error',
      })
      return { success: false, error: 'Draft approved but email delivery failed. Check settings/health.' }
    }

    const resendMessageId = resendData.id ?? null

    // 8. Record the send
    const { data: emailSend } = await supabase
      .from('email_sends')
      .insert({
        tenant_id:         draft.tenant_id,
        draft_id:          draftId,
        sender_identity_id: senderIdentity?.id ?? null,
        to_email:          draft.to_email,
        subject:           draft.subject,
        resend_message_id: resendMessageId,
        status:            'sent',
        sent_at:           now,
        metadata: {
          approved_via:   'review_link',
          review_token:   token,
          pdf_attached:   attachments.length > 0,
        },
      })
      .select('id')
      .single()

    // 9. Mark draft sent
    await emailDraftRepo.updateDraftStatus(draftId, {
      status:          'sent',
      sentAt:          now,
      ifCurrentStatus: 'approved',
    })

    // 10. Log activity
    const leadId     = typeof payload.lead_id      === 'string' ? payload.lead_id      : null
    const contactId  = typeof payload.contact_id   === 'string' ? payload.contact_id   : null
    const companyId  = typeof payload.company_id   === 'string' ? payload.company_id   : null
    const workspaceId = approval.workspace_id

    if (leadId) {
      await supabase.from('activities').insert({
        tenant_id:     approval.tenant_id,
        workspace_id:  workspaceId,
        activity_type: 'email_sent',
        subject:       `Proposal email sent to ${draft.to_email}`,
        body:          `Approved via Verian review link. Subject: ${draft.subject}. ` +
                       `PDF proposal ${attachments.length > 0 ? 'attached' : 'not attached'}.`,
        lead_id:       leadId,
        contact_id:    contactId,
        company_id:    companyId,
        metadata: {
          draft_id:          draftId,
          email_send_id:     emailSend?.id ?? null,
          resend_message_id: resendMessageId,
          approved_via:      'review_link',
          pdf_attached:      attachments.length > 0,
        },
      })

      // 11. Advance lead stage to proposal_sent
      await supabase
        .from('leads')
        .update({ stage: 'proposal_sent' })
        .eq('id', leadId)
        .eq('tenant_id', approval.tenant_id)
        .eq('stage', 'statement_received')
    }

    return { success: true, data: { draftId, sendId: emailSend?.id ?? null } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Reject ----

export async function rejectTokenAction(
  token: string,
  reason: string
): Promise<ActionResult> {
  try {
    const resolved = await resolveApprovalByToken(token)
    if ('error' in resolved) return { success: false, error: resolved.error }

    const { approval, payload } = resolved
    const draftId = typeof payload.draft_id === 'string' ? payload.draft_id : null

    await approvalRepo.resolveApprovalRequest(
      approval.id,
      approval.tenant_id,
      null,
      'rejected',
      { reason, rejected_via: 'review_link', review_token: token }
    )

    if (draftId) {
      await emailDraftRepo.updateDraftStatus(draftId, {
        status:          'rejected',
        rejectedAt:      new Date().toISOString(),
        ifCurrentStatus: 'pending_approval',
      })
    }

    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Hold (keep pending, add notes) ----

export async function holdTokenAction(
  token: string,
  notes: string
): Promise<ActionResult> {
  try {
    const resolved = await resolveApprovalByToken(token)
    if ('error' in resolved) return { success: false, error: resolved.error }

    const { approval } = resolved
    await approvalRepo.updateApprovalDecision(approval.id, {
      held_at:    new Date().toISOString(),
      hold_notes: notes.trim(),
    })

    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Page data ----

export type AnalysisSummary = {
  confidence:          string
  processor_name:      string | null
  proposed_model:      string
  proposed_basis_pts:  number
  proposed_monthly_fee: number
  proposed_per_txn:    number
}

export type ReviewPageData = {
  approvalId:        string
  status:            string
  subject:           string
  bodyText:          string
  bodyHtml:          string | null
  toEmail:           string
  toName:            string | null
  leadName:          string | null
  companyName:       string | null
  contactEmail:      string | null
  source:            string | null
  expiresAt:         string | null
  analysis:          AnalysisSummary | null
  proposalPdfUrl:    string | null   // signed URL (7-day TTL)
  proposalPdfArtifactId: string | null
}

export async function getReviewPageData(
  token: string
): Promise<ActionResult<ReviewPageData>> {
  try {
    const approval = await approvalRepo.getApprovalByReviewToken(token)
    if (!approval) return { success: false, error: 'Invalid or expired review link.' }

    const payload   = (approval.payload ?? {}) as Record<string, unknown>
    const expiresAt = typeof payload.review_token_expires_at === 'string'
      ? payload.review_token_expires_at
      : null

    if (expiresAt && new Date(expiresAt) < new Date()) {
      return { success: false, error: 'This review link has expired.' }
    }

    const draftId = typeof payload.draft_id === 'string' ? payload.draft_id : null

    // Fetch current draft body (may have been edited)
    const supabase = createSupabaseServiceClient()
    let bodyText = typeof payload.body_text === 'string' ? payload.body_text : ''
    let bodyHtml: string | null = typeof payload.body_html === 'string' ? payload.body_html : null
    let subject  = typeof payload.subject === 'string' ? payload.subject : ''

    if (draftId) {
      const { data: draft } = await supabase
        .from('email_drafts')
        .select('subject, body_text, body_html')
        .eq('id', draftId)
        .eq('tenant_id', approval.tenant_id)
        .single()
      if (draft) {
        subject  = draft.subject   ?? subject
        bodyText = draft.body_text ?? bodyText
        bodyHtml = draft.body_html ?? bodyHtml
      }
    }

    // Build analysis summary from payload fields (stored there at approval creation time)
    let analysis: AnalysisSummary | null = null
    if (payload.analysis_confidence) {
      analysis = {
        confidence:           String(payload.analysis_confidence),
        processor_name:       typeof payload.analysis_processor === 'string' ? payload.analysis_processor : null,
        proposed_model:       typeof payload.analysis_pricing_model === 'string' ? payload.analysis_pricing_model : 'interchange-plus',
        proposed_basis_pts:   typeof payload.analysis_basis_points === 'number' ? payload.analysis_basis_points : 25,
        proposed_monthly_fee: typeof payload.analysis_monthly_fee === 'number' ? payload.analysis_monthly_fee : 35,
        proposed_per_txn:     10, // cents — fixed standard
      }
    }

    // Generate a signed URL for the PDF proposal (7-day TTL matching approval expiry)
    let proposalPdfUrl: string | null = null
    const pdfStoragePath = typeof payload.proposal_pdf_storage_path === 'string'
      ? payload.proposal_pdf_storage_path
      : null

    if (pdfStoragePath) {
      try {
        const { data: signedData } = await supabase.storage
          .from('artifacts')
          .createSignedUrl(pdfStoragePath, 7 * 24 * 3600)
        proposalPdfUrl = signedData?.signedUrl ?? null
      } catch {
        // Non-fatal
      }
    }

    return {
      success: true,
      data: {
        approvalId:           approval.id,
        status:               approval.status,
        subject,
        bodyText,
        bodyHtml,
        toEmail:              typeof payload.to_email     === 'string' ? payload.to_email     : '',
        toName:               typeof payload.to_name      === 'string' ? payload.to_name      : null,
        leadName:             typeof payload.lead_name    === 'string' ? payload.lead_name    : null,
        companyName:          typeof payload.company_name === 'string' ? payload.company_name : null,
        contactEmail:         typeof payload.contact_email === 'string' ? payload.contact_email : null,
        source:               typeof payload.source       === 'string' ? payload.source       : null,
        expiresAt,
        analysis,
        proposalPdfUrl,
        proposalPdfArtifactId: typeof payload.proposal_pdf_artifact_id === 'string'
          ? payload.proposal_pdf_artifact_id
          : null,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
