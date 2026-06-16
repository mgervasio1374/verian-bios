import { resend } from '@/lib/resend/client'
import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import * as commitmentRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import { buildFollowUpCommitmentsFromRule, DEFAULT_SCHEDULE_RULE_KEY, getScheduleRule } from '@/modules/proposals/lib/schedule-rules'
import { checkSendEligibility } from '@/modules/messaging/services/send-eligibility.service'
import { buildComplianceFooter, appendFooter } from '@/modules/messaging/services/compliance-footer.service'
import { composeProposalEmail } from '@/modules/proposals/lib/proposal-email'
import type { RequestContext } from '@/types/context'

export interface ApproveAndSendInput {
  proposalEventId: string
  scheduleRuleKey?: string
}

export type ApproveAndSendResult =
  | { ok: true; status: 'sent'; commitmentsScheduled: number; publicUrl: string }
  | { ok: false; error:
      | 'proposal_not_found'
      | 'not_approvable'      // not in 'draft' status
      | 'sending_disabled'    // EMAIL_SENDING_ENABLED master control is off
      | 'no_contact_email'    // proposal has no contact / contact has no email
      | 'no_sender_identity'  // no verified sender configured (production)
      | 'invalid_rule'        // unknown schedule rule key
      | 'recipient_not_eligible' // do_not_contact or suppressed (unsubscribed/email/domain)
      | 'send_failed'         // Resend rejected the send
    }

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://verian-bios.vercel.app').replace(/\/$/, '')
}

// Approves a draft hosted proposal and sends the merchant the /p/{token} link,
// then transitions draft → sent and schedules the follow-up cadence through the
// same commitment repo path the capture-conversion flow uses. The operator click
// is the approval gate; EMAIL_SENDING_ENABLED is the master safety.
export async function approveAndSendProposal(
  ctx: RequestContext,
  input: ApproveAndSendInput
): Promise<ApproveAndSendResult> {
  const ruleKey = input.scheduleRuleKey ?? DEFAULT_SCHEDULE_RULE_KEY

  // Validate the cadence up front — never schedule against an unknown rule.
  try {
    getScheduleRule(ruleKey)
  } catch {
    return { ok: false, error: 'invalid_rule' }
  }

  // 1. Load + validate the proposal (tenant/workspace scoped).
  const event = await eventRepo.getProposalEventById(ctx.tenantId, ctx.workspaceId, input.proposalEventId)
  if (!event) return { ok: false, error: 'proposal_not_found' }
  if (event.proposal_status !== 'draft') return { ok: false, error: 'not_approvable' }

  // 2. Master send gate — opt-in; defaults to false when no row exists.
  const sendingEnabled = await systemControlRepo.getBooleanControl(
    SystemControlKey.EMAIL_SENDING_ENABLED,
    ctx.tenantId,
    false
  )
  if (!sendingEnabled) return { ok: false, error: 'sending_disabled' }

  // 3. Resolve the merchant contact email.
  const contact = event.contact_id
    ? await contactRepo.getContact(event.contact_id, ctx.tenantId).catch(() => null)
    : null
  const toEmail = contact?.email ?? null
  if (!toEmail) return { ok: false, error: 'no_contact_email' }

  // 3a. Suppression + do_not_contact enforcement — no external send may reach a
  // suppressed or do-not-contact recipient. DNC takes precedence (no suppression
  // read), matching sendApprovedDraft's order. Blocks before any send/transition/schedule.
  const eligibility = await checkSendEligibility(ctx.tenantId, toEmail, { doNotContact: contact?.do_not_contact })
  if (!eligibility.allowed) return { ok: false, error: 'recipient_not_eligible' }

  // 4. Sender identity — reuse the tenant's verified sender (approve-actions pattern).
  const senderIdentity = await emailDraftRepo.getDefaultSenderIdentity(ctx.tenantId).catch(() => null)
  const fromAddress = senderIdentity
    ? `${senderIdentity.name} <${senderIdentity.email}>`
    : process.env.NODE_ENV !== 'production'
      ? 'Verian BIOS <onboarding@resend.dev>'
      : null
  if (!fromAddress) return { ok: false, error: 'no_sender_identity' }

  // 5. Compose + send the merchant email with the public /p/{token} link.
  const metadata    = (event.metadata ?? {}) as Record<string, unknown>
  const companyName = typeof metadata.company_name === 'string' ? metadata.company_name : 'your business'
  const shareToken  = event.share_token
  if (!shareToken) return { ok: false, error: 'not_approvable' }
  const publicUrl   = `${appBaseUrl()}/p/${shareToken}`
  const toName      = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || null
  const firstName   = contact?.first_name ?? 'there'

  // Single-source composition (also drives the operator preview). Honors an
  // operator override stored on the event (subject/body); no override → byte-
  // identical to the default. The /p link is always guaranteed in the body.
  const override = (metadata.proposal_email_override ?? null) as
    | { subject?: string | null; bodyText?: string | null }
    | null
  const { subject, textBody, htmlBody } = composeProposalEmail(
    {
      companyName,
      firstName,
      senderName: senderIdentity?.name ?? '321 Swipe',
      publicUrl,
    },
    override ?? undefined,
  )

  // CAN-SPAM compliance footer + List-Unsubscribe header at send time.
  const footer = buildComplianceFooter(ctx.tenantId, toEmail)
  const composed = appendFooter(htmlBody, textBody, footer)
  const unsubHeaders = footer.listUnsubscribeHeader
    ? {
        'List-Unsubscribe': footer.listUnsubscribeHeader,
        ...(footer.listUnsubscribePostHeader ? { 'List-Unsubscribe-Post': footer.listUnsubscribePostHeader } : {}),
      }
    : undefined

  try {
    const { error } = await resend.emails.send({
      from:    fromAddress,
      to:      [toEmail],
      subject,
      text:    composed.text,
      html:    composed.html,
      ...(unsubHeaders ? { headers: unsubHeaders } : {}),
    })
    if (error) return { ok: false, error: 'send_failed' }
  } catch {
    return { ok: false, error: 'send_failed' }
  }

  // 6. Transition draft → sent (guarded against double-send) and stamp sent_at.
  const sentAt  = new Date().toISOString()
  const updated = await eventRepo.markProposalSent(ctx.tenantId, ctx.workspaceId, input.proposalEventId, sentAt)
  if (!updated) {
    // Lost the draft→sent race (already sent by a concurrent click). The email
    // went out; report success with no double-scheduling.
    return { ok: true, status: 'sent', commitmentsScheduled: 0, publicUrl }
  }

  // 7. Schedule the follow-up cadence — same repo path as capture conversion.
  const planned = buildFollowUpCommitmentsFromRule(sentAt, ruleKey)
  const senderUserId = ctx.userId !== 'system' ? ctx.userId : null
  let commitmentsScheduled = 0
  try {
    const created = await commitmentRepo.createFollowUpCommitments(
      planned.map(c => ({
        tenantId:         ctx.tenantId,
        workspaceId:      ctx.workspaceId,
        proposalEventId:  input.proposalEventId,
        leadId:           event.lead_id ?? null,
        assignedToUserId: senderUserId,
        followUpDueAt:    c.followUpDueAt,
        followUpSequence: c.followUpSequence,
        scheduleRuleKey:  c.scheduleRuleKey,
      }))
    )
    commitmentsScheduled = created.length
  } catch {
    // The proposal is sent and recorded; a scheduling failure is non-fatal and
    // recoverable. Report success with what was scheduled (0).
  }

  return { ok: true, status: 'sent', commitmentsScheduled, publicUrl }
}
