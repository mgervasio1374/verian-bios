import { matchInboundReply } from '@/modules/messaging/inbound/inbound-reply-match.service'
import { isAutoReply, detectOptOut, type InboundReplyHeaders } from '@/modules/messaging/inbound/inbound-reply-classify'
import {
  insertInboundReply,
  updateInboundReply,
} from '@/modules/messaging/inbound/inbound-reply.repo'
import { forwardInboundReply } from '@/modules/messaging/inbound/inbound-reply-forward.service'
import { stopAssignmentSchedule } from '@/modules/campaign-sequence/services/campaign-stop.service'
import { addUnsubscribe } from '@/modules/messaging/repositories/suppression.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as companyRepo from '@/modules/crm/repositories/company.repo'

// MCM v2 — Inbound reply capture orchestration (P3.5).
//   match → persist (idempotent) → (human reply only) STOP sequence
//          → opt-out safety net → FORWARD to the sales team (always), annotated.
// Every side effect after the capture insert is best-effort/non-fatal: the reply
// row is the durable record and must persist even if a stop/forward/opt-out step
// fails. The webhook always returns 200 (see the route).

const EXCERPT_MAX = 2000

export interface NormalizedInboundReply {
  from: string
  to: string | null
  subject: string | null
  text: string | null
  headers: InboundReplyHeaders
  receivedAt: string | null
}

export type CaptureInboundReplyResult =
  | { status: 'persisted'; replyId: string; stopped: number; optoutSuppressed: boolean; forwarded: boolean }
  | { status: 'duplicate' }
  | { status: 'unresolved' }

export async function captureInboundReply(
  reply: NormalizedInboundReply,
): Promise<CaptureInboundReplyResult> {
  const match = await matchInboundReply({
    from:       reply.from,
    to:         reply.to,
    inReplyTo:  reply.headers.in_reply_to ?? null,
    references: reply.headers.references ?? null,
  })

  // No resolvable tenant — we cannot persist a tenant-scoped row. Log and exit.
  if (!match.tenantId) {
    console.warn('[inbound-email] unresolved reply (no tenant)', { from: reply.from, to: reply.to })
    return { status: 'unresolved' }
  }

  const auto = isAutoReply(reply.headers, reply.subject)

  // Idempotent capture — (tenant_id, message_id) duplicate → no-op.
  const ins = await insertInboundReply({
    tenantId:            match.tenantId,
    workspaceId:         match.workspaceId,
    fromEmail:           reply.from,
    toEmail:             reply.to,
    subject:             reply.subject,
    bodyExcerpt:         (reply.text ?? '').slice(0, EXCERPT_MAX),
    messageId:           reply.headers.message_id ?? null,
    inReplyTo:           reply.headers.in_reply_to ?? null,
    references:          reply.headers.references ?? null,
    receivedAt:          reply.receivedAt,
    isAutoReply:         auto,
    matchStatus:         match.matchStatus,
    matchedEmailSendId:  match.matchedEmailSendId,
    matchedContactId:    match.matchedContactId,
    matchedLeadId:       match.matchedLeadId,
    matchedAssignmentId: match.matchedAssignmentId,
  })
  if (!ins.ok) return { status: 'duplicate' }
  const replyId = ins.id

  // ---- STOP the cadence — matched HUMAN reply only (mirror bounce/complaint,
  // item-level). Auto-replies never stop. ----
  let touchesStopped = 0
  if (
    match.matchStatus === 'matched' &&
    !auto &&
    match.matchedAssignmentId &&
    match.workspaceId
  ) {
    try {
      const res = await stopAssignmentSchedule(
        match.matchedAssignmentId,
        match.tenantId,
        match.workspaceId,
        'responded',
        { respondedAt: reply.receivedAt ?? undefined },
      )
      touchesStopped = res.stopped
    } catch {
      // non-fatal — the reply is captured; a stop failure must not fail capture
    }
  }

  // ---- Opt-out safety net — strict phrase + matched contact → suppress. Never
  // auto-suppress an interested reply (soft signals are logged for review only). ----
  const optout = detectOptOut(reply.text)
  let optoutSuppressed = false
  if (optout.strict && match.matchedContactId) {
    try {
      await addUnsubscribe(match.tenantId, reply.from, 'recipient_reply_optout')
      await contactRepo.updateContact(match.matchedContactId, match.tenantId, { do_not_contact: true } as never)
      optoutSuppressed = true
    } catch {
      // non-fatal
    }
  }

  // ---- Forward to the sales team — ALWAYS (human + auto), annotated. ----
  const matchedLabel = await buildMatchedLabel(match.tenantId, match.matchedContactId, reply.from)
  let forwarded = false
  try {
    const fwd = await forwardInboundReply({
      fromEmail: reply.from,
      subject:   reply.subject,
      text:      reply.text,
      annotation: {
        matchedLabel,
        sequenceStopped: touchesStopped > 0,
        touchesStopped,
        optOut:          optout.detected,
        autoReply:       auto,
      },
    })
    forwarded = fwd.forwarded
  } catch {
    // non-fatal
  }

  await updateInboundReply(replyId, {
    touchesStopped,
    optoutDetected:   optout.detected,
    optoutSuppressed,
    forwardedAt:      forwarded ? new Date().toISOString() : null,
  }).catch(() => {})

  return { status: 'persisted', replyId, stopped: touchesStopped, optoutSuppressed, forwarded }
}

async function buildMatchedLabel(
  tenantId: string,
  contactId: string | null,
  fallbackEmail: string,
): Promise<string> {
  if (!contactId) return 'Unmatched'
  try {
    const contact = await contactRepo.getContact(contactId, tenantId)
    if (!contact) return 'Unmatched'
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || fallbackEmail
    const companyId = (contact as unknown as Record<string, unknown>).company_id as string | null
    let companyName: string | null = null
    if (companyId) {
      const company = await companyRepo.getCompanyByTenant(companyId, tenantId).catch(() => null)
      companyName = company?.name ?? null
    }
    return companyName ? `${companyName} — ${name}` : name
  } catch {
    return 'Unmatched'
  }
}
