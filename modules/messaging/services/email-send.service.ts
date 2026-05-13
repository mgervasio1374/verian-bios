import type { RequestContext } from '@/types/context'
import { requirePermission } from '@/lib/auth/permissions'
import { resend } from '@/lib/resend/client'
import * as emailSendRepo from '@/modules/messaging/repositories/email-send.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as suppressionRepo from '@/modules/messaging/repositories/suppression.repo'
import * as rateLimitService from '@/modules/messaging/services/rate-limit.service'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'

// ---- Result type ----

export type SendResult =
  | { ok: true;  sendId: string; resendMessageId: string | null }
  | { ok: false; reason: string; alreadySent?: boolean }

// ---- Main export ----

/**
 * Send an approved email draft to its recipient.
 *
 * Enforces ALL of the following before calling Resend:
 *   1. Permission check (messaging.send_emails)
 *   2. Draft ownership (tenant + workspace)
 *   3. Lifecycle double-gate: BOTH email_drafts.status AND
 *      approval_request.status must be 'approved'
 *   4. Idempotency guard: block if a queued/sent send already exists
 *   5. Recipient validation: email present, do_not_contact false
 *   6. Suppression checks: unsubscribes, suppression_rules (email + domain)
 *   7. Rate limit policy check
 *   8. Sender identity present
 *
 * On success:  email_sends.status = 'sent', email_drafts.status = 'sent'
 * On failure:  email_sends.status = 'failed', email_drafts UNCHANGED ('approved')
 *
 * No auto-retry. No campaign logic. No bulk sends.
 */
export async function sendApprovedDraft(
  ctx: RequestContext,
  draftId: string
): Promise<SendResult> {
  // ---- 1. Permission ----
  requirePermission(ctx, 'messaging.send_emails')

  // ---- 2. Fetch draft (scoped to tenant + workspace) ----
  const draft = await emailSendRepo.getEmailDraftForSending(
    draftId, ctx.tenantId, ctx.workspaceId
  )
  if (!draft) {
    return { ok: false, reason: 'draft_not_found' }
  }

  // ---- 3. Lifecycle double-gate ----
  // BOTH the draft record AND its approval_request must be 'approved'.
  // Checking both independently prevents approving-via-DB-edit bypassing the workflow.
  if (draft.status !== 'approved') {
    return {
      ok: false,
      reason: `draft_not_approved (current status: ${draft.status})`,
    }
  }

  if (!draft.approval_request_id) {
    return { ok: false, reason: 'draft_has_no_linked_approval_request' }
  }

  const approval = await approvalRepo.getApprovalById(
    draft.approval_request_id, ctx.tenantId
  )
  if (!approval || approval.status !== 'approved') {
    return {
      ok: false,
      reason: `approval_request_not_approved (status: ${approval?.status ?? 'not found'})`,
    }
  }

  // ---- 4. Idempotency: block duplicate sends ----
  const existingSend = await emailSendRepo.getActiveSendForDraft(draftId, ctx.tenantId)
  if (existingSend) {
    return {
      ok: false,
      reason: `duplicate_send_blocked (existing send ${existingSend.id} status: ${existingSend.status})`,
      alreadySent: existingSend.status === 'sent',
    }
  }

  // ---- 5. Recipient validation ----
  const contact = draft.contact_id
    ? await contactRepo.getContact(draft.contact_id, ctx.tenantId)
    : null

  if (!contact) {
    return { ok: false, reason: 'recipient_contact_not_found' }
  }
  if (!contact.email) {
    return { ok: false, reason: 'recipient_email_missing' }
  }
  if (contact.do_not_contact) {
    return { ok: false, reason: 'recipient_do_not_contact' }
  }

  const toEmail = contact.email

  // ---- 6. Suppression ----
  // Check against draft.to_email, not contact.email — this is the address we are
  // actually sending to. The contact's current email may differ if it was edited
  // after draft creation; the suppression check must match the outbound address.
  const suppression = await suppressionRepo.checkEmailSuppression(ctx.tenantId, draft.to_email)
  if (suppression.blocked) {
    return { ok: false, reason: `suppression_blocked (${suppression.reason})` }
  }

  // ---- 7. Rate limit ----
  try {
    await rateLimitService.checkEmailRateLimit(ctx, toEmail, 'ai_draft')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'rate_limit_exceeded'
    return { ok: false, reason: msg }
  }

  // ---- 8. Sender identity ----
  const senderIdentity = await emailDraftRepo.getDefaultSenderIdentity(ctx.tenantId)

  const fromAddress = senderIdentity
    ? `${senderIdentity.name} <${senderIdentity.email}>`
    : process.env.NODE_ENV !== 'production'
      ? 'Verian BIOS <onboarding@resend.dev>'
      : null

  if (!fromAddress) {
    return { ok: false, reason: 'no_sender_identity_configured' }
  }

  // ---- Persist email_send (status='queued') ----
  const draftMeta = (draft.ai_generation_metadata ?? {}) as Record<string, unknown>
  const sendMetadata: Record<string, unknown> = {
    template_used:       draftMeta.template_used       ?? null,
    recommendation_used: draftMeta.recommendation_used ?? null,
    score_snapshot:      draftMeta.score_snapshot       ?? null,
    send_initiated_by:   ctx.userId,
    draft_id:            draftId,
  }

  let emailSend
  try {
    emailSend = await emailSendRepo.createEmailSend({
      tenantId:         ctx.tenantId,
      workspaceId:      ctx.workspaceId,
      draftId,
      senderIdentityId: senderIdentity?.id ?? null,
      toEmail:          draft.to_email,
      subject:          draft.subject,
      contactId:        draft.contact_id,
      companyId:        draft.company_id,
      metadata:         sendMetadata,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed_to_queue_send'
    return { ok: false, reason: msg }
  }

  // ---- Call Resend ----
  const now = new Date().toISOString()
  let resendMessageId: string | null = null

  try {
    // Resend SDK expects a discriminated union — always provide html to satisfy
    // the html-branch. body_html is always set by our template rendering;
    // if somehow null, fall back to wrapping body_text in a paragraph.
    const { data: resendData, error: resendError } = await resend.emails.send({
      from:    fromAddress,
      to:      [draft.to_email],
      subject: draft.subject,
      html:    draft.body_html ?? `<p>${draft.body_text ?? ''}</p>`,
      text:    draft.body_text ?? undefined,
    })

    if (resendError || !resendData) {
      throw new Error(
        (resendError as { message?: string } | null)?.message ?? 'Resend returned no data'
      )
    }

    resendMessageId = resendData.id ?? null

    // ---- Success path ----
    await Promise.all([
      emailSendRepo.updateEmailSend(emailSend.id, {
        status:           'sent',
        sentAt:           now,
        resendMessageId,
        metadata:         { ...sendMetadata, resend_response_id: resendMessageId },
      }),
      // Mark draft sent; ifCurrentStatus guards against double-transition
      emailDraftRepo.updateDraftStatus(draftId, {
        status:          'sent',
        sentAt:          now,
        ifCurrentStatus: 'approved',
      }),
    ])

    return { ok: true, sendId: emailSend.id, resendMessageId }
  } catch (err) {
    // ---- Failure path ----
    // email_sends → failed, email_drafts stays 'approved'
    const errorMessage = err instanceof Error ? err.message : String(err)

    await emailSendRepo.updateEmailSend(emailSend.id, {
      status:        'failed',
      errorMessage,
      metadata:      { ...sendMetadata, error: errorMessage },
    })

    return { ok: false, reason: `send_failed: ${errorMessage}` }
  }
}
