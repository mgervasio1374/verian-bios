import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as captureRepo from '@/modules/proposals/repositories/proposal-captures.repo'
import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import * as commitmentRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import { buildFollowUpCommitmentsFromRule } from '@/modules/proposals/lib/schedule-rules'
import { isFutureDate } from '@/modules/proposals/lib/date-math'
import { PROPOSAL_ACTIVITY_EVENTS } from '@/modules/proposals/constants/proposal-activity-events'

// DEFAULT_SCHEDULE_RULE_KEY value — imported inline to avoid circular lib deps.
const DEFAULT_RULE_KEY = 'standard_3_5_10'

export interface CreateManualProposalCaptureInput {
  leadId: string
  contactId?: string | null
  proposalSentAt: string
  proposalReference?: string | null
  proposalAmount?: number | null
  proposalCurrency?: string
  estimatedSavings?: number | null
  opportunityId?: string | null
  scheduleRuleKey?: string
}

export type CreateManualProposalCaptureResult =
  | { ok: true; proposalEventId: string; captureId: string | null; commitmentIds: string[] }
  | { ok: false; error: 'lead_not_found' | 'open_proposal_exists' | 'invalid_proposal_sent_at' | 'invalid_input' | 'create_failed' }

// Marks a proposal_event as withdrawn when compensating cleanup is needed.
// Used when commitment creation fails after the event is already inserted.
// Withdrawn events are not open (not in 'sent'|'viewed'), so they do not
// block future attempts and satisfy the one-open-proposal constraint.
async function withdrawEventForCleanup(
  tenantId: string,
  workspaceId: string,
  eventId: string
): Promise<void> {
  try {
    await eventRepo.updateProposalStatus(tenantId, workspaceId, eventId, 'withdrawn')
  } catch {
    // Best-effort cleanup. A withdrawn event without commitments is benign:
    // it is not open and will not block a retry.
  }
}

export async function createManualProposalCapture(
  tenantId: string,
  workspaceId: string,
  userId: string,
  input: CreateManualProposalCaptureInput
): Promise<CreateManualProposalCaptureResult> {
  // 1. Validate proposal_sent_at — reject future dates.
  const sentAt = new Date(input.proposalSentAt)
  if (isNaN(sentAt.getTime())) {
    return { ok: false, error: 'invalid_proposal_sent_at' }
  }
  if (isFutureDate(sentAt)) {
    return { ok: false, error: 'invalid_proposal_sent_at' }
  }

  // 2. Load and validate the lead — must belong to this tenant + workspace.
  // company_id is derived from the lead; never accepted from client input.
  const lead = await leadRepo.getLead(input.leadId, tenantId)
  if (!lead || lead.workspace_id !== workspaceId) {
    // Do not leak cross-workspace existence.
    return { ok: false, error: 'lead_not_found' }
  }

  // company_id comes from lead — never from the account domain field or client input.
  const companyId: string | null = lead.company_id ?? null

  // 3. Enforce one-open-proposal rule (server-side guard).
  // The DB partial unique index idx_proposal_events_one_open_per_lead is the
  // final race-safe enforcement layer. This guard avoids the round-trip in the
  // common case.
  const existingOpen = await eventRepo.getOpenProposalEventForLead(
    tenantId,
    workspaceId,
    input.leadId
  )
  if (existingOpen) {
    return { ok: false, error: 'open_proposal_exists' }
  }

  const ruleKey = input.scheduleRuleKey ?? DEFAULT_RULE_KEY

  // 4. Begin compensating-cleanup bundle.
  //
  // Supabase JS does not expose multi-statement transactions. Steps are
  // sequential; each step compensates if a later step fails.
  //
  // Future option: replace with a Postgres RPC (create_proposal_capture_bundle)
  // for true atomicity — deferred until authorized in a later migration.

  // Step A: Create the capture record.
  let captureRow: Awaited<ReturnType<typeof captureRepo.createProposalCapture>> | null = null
  try {
    captureRow = await captureRepo.createProposalCapture({
      tenantId,
      workspaceId,
      captureSource: 'manual',
    })
  } catch {
    return { ok: false, error: 'create_failed' }
  }

  // Step B: Create the proposal event.
  let eventRow: Awaited<ReturnType<typeof eventRepo.createProposalEvent>> | null = null
  try {
    eventRow = await eventRepo.createProposalEvent({
      tenantId,
      workspaceId,
      leadId: input.leadId,
      contactId: input.contactId ?? null,
      companyId,
      accountId: null,  // reserved — Phase 3N always sets null
      senderUserId: userId !== 'system' ? userId : null,
      proposalSentAt: input.proposalSentAt,
      proposalReference: input.proposalReference ?? null,
      proposalAmount: input.proposalAmount ?? null,
      proposalCurrency: input.proposalCurrency ?? 'USD',
      estimatedSavings: input.estimatedSavings ?? null,
      opportunityId: input.opportunityId ?? null,
      proposalStatus: 'sent',
      captureSource: 'manual',
      captureId: captureRow.id,
    })
  } catch (err) {
    // Compensate: soft-delete the capture so inbox queries ignore it.
    await captureRepo.softDeleteCapture(tenantId, workspaceId, captureRow.id)

    // Handle the DB unique-constraint violation on idx_proposal_events_one_open_per_lead.
    // Postgres error code 23505 = unique_violation. Map to open_proposal_exists.
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('23505') || msg.includes('idx_proposal_events_one_open_per_lead')) {
      return { ok: false, error: 'open_proposal_exists' }
    }
    return { ok: false, error: 'create_failed' }
  }

  // Step C: Link capture → event.
  try {
    await captureRepo.updateCaptureMatchStatus(tenantId, workspaceId, captureRow.id, {
      matchStatus: 'matched',
      matchedLeadId: input.leadId,
      matchedCompanyId: companyId,
      matchedAt: new Date().toISOString(),
      captureConfidence: 100,
      resolvedEventId: eventRow.id,
    })
  } catch {
    // Non-fatal: the capture + event exist; the linkage is cosmetic for Phase 3N.
    // Continue — do not abort commitment creation over a linking failure.
  }

  // Step D: Create follow-up commitments.
  let commitmentIds: string[] = []
  try {
    const planned = buildFollowUpCommitmentsFromRule(input.proposalSentAt, ruleKey)
    const created = await commitmentRepo.createFollowUpCommitments(
      planned.map(c => ({
        tenantId,
        workspaceId,
        proposalEventId: eventRow.id,
        leadId: input.leadId,
        assignedToUserId: userId !== 'system' ? userId : null,
        followUpDueAt: c.followUpDueAt,
        followUpSequence: c.followUpSequence,
        scheduleRuleKey: c.scheduleRuleKey,
      }))
    )
    commitmentIds = created.map(r => r.id)
    if (created.length === 0 || created.length !== planned.length) {
      await withdrawEventForCleanup(tenantId, workspaceId, eventRow.id)
      await captureRepo.softDeleteCapture(tenantId, workspaceId, captureRow.id)
      return { ok: false, error: 'create_failed' }
    }
  } catch {
    // Compensate: withdraw event so it does not block future attempts.
    // An open proposal without commitments is an inconsistent state.
    await withdrawEventForCleanup(tenantId, workspaceId, eventRow.id)
    await captureRepo.softDeleteCapture(tenantId, workspaceId, captureRow.id)
    return { ok: false, error: 'create_failed' }
  }

  // TODO: emit audit events once activity logging is integrated:
  //   PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_SENT_RECORDED  (proposal event created)
  //   PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_FOLLOW_UP_CREATED  (commitments created)
  // Pattern: activityEventService.recordActivity(...).catch(() => null)
  void PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_SENT_RECORDED  // reference for tree-shaking safety

  return {
    ok: true,
    proposalEventId: eventRow.id,
    captureId: captureRow.id,
    commitmentIds,
  }
}
