import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as captureRepo from '@/modules/proposals/repositories/proposal-captures.repo'
import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import * as commitmentRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import { buildFollowUpCommitmentsFromRule } from '@/modules/proposals/lib/schedule-rules'
import { isFutureDate } from '@/modules/proposals/lib/date-math'
import { PROPOSAL_ACTIVITY_EVENTS } from '@/modules/proposals/constants/proposal-activity-events'

// DEFAULT_SCHEDULE_RULE_KEY value — imported inline to avoid circular lib deps.
const DEFAULT_RULE_KEY = 'standard_3_5_10'

// Only 'matched' captures with a null resolved_event_id are eligible for conversion.
const ELIGIBLE_STATUSES_FOR_CONVERSION = ['matched'] as const

export interface ConvertCaptureToProposalEventInput {
  captureId: string
  proposalSentAt: string          // operator-confirmed ISO 8601 UTC
  proposalReference?: string | null
  proposalAmount?: number | null
  proposalCurrency?: string       // default: 'USD'
  estimatedSavings?: number | null
  scheduleRuleKey?: string        // default: 'standard_3_5_10'
}

export type ConvertCaptureToProposalEventResult =
  | { ok: true; proposalEventId: string; captureId: string; commitmentCount: number }
  | { ok: false; error:
      | 'capture_not_found'
      | 'capture_not_eligible'     // pending, dismissed, unmatched, or no matched_lead_id
      | 'already_resolved'         // resolved_event_id already set — conversion is idempotent
      | 'lead_not_found'           // lead no longer exists in this workspace
      | 'open_proposal_exists'     // one-open-proposal rule violation
      | 'invalid_proposal_sent_at' // null, unparseable, or future date
      | 'create_failed'            // unexpected DB write failure
    }

// Marks a proposal_event as withdrawn when compensating cleanup is needed.
// Used when resolved_event_id linking or commitment creation fails after
// the event is already inserted. A withdrawn event is not open and does
// not block future conversion attempts or satisfy the one-open-proposal constraint.
async function withdrawEventForCleanup(
  tenantId: string,
  workspaceId: string,
  eventId: string
): Promise<void> {
  try {
    await eventRepo.updateProposalStatus(tenantId, workspaceId, eventId, 'withdrawn')
  } catch {
    // Best-effort cleanup. The caller always returns create_failed regardless.
  }
}

// Used only after resolved_event_id was successfully set (Step 9 succeeded, Step 10 failed).
// Clears the idempotency key so a retry is not permanently blocked by already_resolved.
// Step 9 link failure still uses withdrawEventForCleanup alone — resolved_event_id was never set.
async function cleanupFailedConversion(
  tenantId: string,
  workspaceId: string,
  captureId: string,
  eventId: string
): Promise<void> {
  // Close any partial open commitments before withdrawing the event.
  try {
    await commitmentRepo.closeOpenCommitmentsForProposal(tenantId, workspaceId, eventId)
  } catch {
    // Best-effort.
  }
  // Withdraw the event so it is no longer open and does not block future attempts.
  await withdrawEventForCleanup(tenantId, workspaceId, eventId)
  // Clear resolved_event_id so the capture is retryable.
  try {
    await captureRepo.clearCaptureResolvedEventId(tenantId, workspaceId, captureId, eventId)
  } catch {
    // Best-effort.
  }
}

export async function convertCaptureToProposalEvent(
  tenantId: string,
  workspaceId: string,
  userId: string,
  input: ConvertCaptureToProposalEventInput
): Promise<ConvertCaptureToProposalEventResult> {
  // 1. Validate proposalSentAt — reject invalid or future dates before any DB call.
  const sentAt = new Date(input.proposalSentAt)
  if (isNaN(sentAt.getTime())) {
    return { ok: false, error: 'invalid_proposal_sent_at' }
  }
  if (isFutureDate(sentAt)) {
    return { ok: false, error: 'invalid_proposal_sent_at' }
  }

  // 2. Load and validate the capture — must belong to this tenant + workspace.
  // getCaptureById scopes to tenantId + workspaceId; returns null for missing or cross-workspace.
  const capture = await captureRepo.getCaptureById(tenantId, workspaceId, input.captureId)
  if (!capture) {
    return { ok: false, error: 'capture_not_found' }
  }

  // 3. Check idempotency — resolved_event_id is the capture-level idempotency key.
  // It is only a reliable guard because setting it is mandatory and fatal on failure (Step 9).
  // A non-null value means the capture was already fully converted; do not create a duplicate event.
  if (capture.resolved_event_id !== null) {
    return { ok: false, error: 'already_resolved' }
  }

  // 4. Validate eligibility — only 'matched' captures may be converted.
  // pending, dismissed, unmatched, and manual_override captures are ineligible.
  if (!(ELIGIBLE_STATUSES_FOR_CONVERSION as readonly string[]).includes(capture.match_status)) {
    return { ok: false, error: 'capture_not_eligible' }
  }

  // 5. Validate that a lead was matched (required for proposal event creation).
  if (!capture.matched_lead_id) {
    return { ok: false, error: 'capture_not_eligible' }
  }

  // 6. Re-load the matched lead — must still exist in this workspace.
  // company_id is derived from lead — never from the account domain field or client input.
  const lead = await leadRepo.getLead(capture.matched_lead_id, tenantId)
  if (!lead || lead.workspace_id !== workspaceId) {
    // Do not leak cross-workspace existence.
    return { ok: false, error: 'lead_not_found' }
  }
  const companyId: string | null = lead.company_id ?? null

  // 7. Enforce one-open-proposal rule (server-side guard).
  // The DB partial unique index idx_proposal_events_one_open_per_lead is the
  // final race-safe enforcement layer. This guard avoids the round-trip in the common case.
  const existingOpen = await eventRepo.getOpenProposalEventForLead(
    tenantId,
    workspaceId,
    capture.matched_lead_id
  )
  if (existingOpen) {
    return { ok: false, error: 'open_proposal_exists' }
  }

  const ruleKey = input.scheduleRuleKey ?? DEFAULT_RULE_KEY
  const senderUserId = userId !== 'system' ? userId : null

  // 8. Create the proposal event.
  let eventRow: Awaited<ReturnType<typeof eventRepo.createProposalEvent>>
  try {
    eventRow = await eventRepo.createProposalEvent({
      tenantId,
      workspaceId,
      leadId:            capture.matched_lead_id,
      contactId:         capture.matched_contact_id ?? null,
      companyId,
      accountId:         null,   // reserved — Phase 3O always sets null
      senderUserId,
      proposalSentAt:    input.proposalSentAt,
      proposalReference: input.proposalReference ?? null,
      proposalAmount:    input.proposalAmount ?? null,
      proposalCurrency:  input.proposalCurrency ?? 'USD',
      estimatedSavings:  input.estimatedSavings ?? null,
      opportunityId:     null,
      proposalStatus:    'sent',
      captureSource:     capture.capture_source,
      captureId:         capture.id,
    })
  } catch (err) {
    // Handle the DB unique-constraint violation on idx_proposal_events_one_open_per_lead.
    // Postgres error code 23505 = unique_violation.
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('23505') || msg.includes('idx_proposal_events_one_open_per_lead')) {
      return { ok: false, error: 'open_proposal_exists' }
    }
    return { ok: false, error: 'create_failed' }
  }

  // 9. Link capture → event via resolved_event_id.
  //
  // MANDATORY AND FATAL: A live open event must never be left unlinked to its capture.
  // resolved_event_id is the capture-level idempotency key — it is only reliable because
  // this step is treated as a required part of the conversion, not a best-effort side-effect.
  // If linking fails, withdraw the created event and return create_failed.
  // Do NOT continue to commitment creation with resolved_event_id unset.
  try {
    const linked = await captureRepo.updateCaptureMatchStatus(tenantId, workspaceId, capture.id, {
      matchStatus:     capture.match_status as 'matched',
      resolvedEventId: eventRow.id,
    })
    if (!linked) {
      await withdrawEventForCleanup(tenantId, workspaceId, eventRow.id)
      return { ok: false, error: 'create_failed' }
    }
  } catch {
    await withdrawEventForCleanup(tenantId, workspaceId, eventRow.id)
    return { ok: false, error: 'create_failed' }
  }

  // 10. Create follow-up commitments.
  //
  // A conversion is complete only when all three conditions hold simultaneously:
  //   (a) proposal_event exists
  //   (b) capture.resolved_event_id points to it  ← guaranteed by Step 9
  //   (c) commitments were created at the expected full count (non-zero, equals planned.length)
  // Zero or partial commitments leave an open event without follow-up obligations —
  // an inconsistent state. Withdraw and return create_failed so the operator can retry.
  const planned = buildFollowUpCommitmentsFromRule(input.proposalSentAt, ruleKey)
  let commitmentCount = 0
  try {
    const created = await commitmentRepo.createFollowUpCommitments(
      planned.map(c => ({
        tenantId,
        workspaceId,
        proposalEventId:  eventRow.id,
        leadId:           capture.matched_lead_id!,
        assignedToUserId: senderUserId,
        followUpDueAt:    c.followUpDueAt,
        followUpSequence: c.followUpSequence,
        scheduleRuleKey:  c.scheduleRuleKey,
      }))
    )
    if (created.length === 0 || created.length !== planned.length) {
      await cleanupFailedConversion(tenantId, workspaceId, capture.id, eventRow.id)
      return { ok: false, error: 'create_failed' }
    }
    commitmentCount = created.length
  } catch {
    await cleanupFailedConversion(tenantId, workspaceId, capture.id, eventRow.id)
    return { ok: false, error: 'create_failed' }
  }

  // TODO: emit audit events once activity logging is integrated:
  //   PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_SENT_RECORDED    (proposal event created from capture)
  //   PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_FOLLOW_UP_CREATED (commitments created)
  // Pattern: activityEventService.recordActivity(...).catch(() => null)
  void PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_SENT_RECORDED    // reference for tree-shaking safety
  void PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_FOLLOW_UP_CREATED // reference for tree-shaking safety

  return {
    ok: true,
    proposalEventId: eventRow.id,
    captureId:       capture.id,
    commitmentCount,
  }
}
