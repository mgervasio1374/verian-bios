import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import * as commitmentRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import { isClosedProposalStatus } from '@/modules/proposals/lib/open-proposal'
import { PROPOSAL_ACTIVITY_EVENTS } from '@/modules/proposals/constants/proposal-activity-events'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import type { ProposalStatus } from '@/modules/proposals/repositories/proposal-events.repo'

const ALLOWED_STATUSES = ['sent', 'viewed', 'accepted', 'rejected', 'expired', 'withdrawn'] as const

export interface UpdateProposalStatusInput {
  proposalEventId: string
  status: string
}

export type UpdateProposalStatusResult =
  | { ok: true; proposalEventId: string; status: string; closedCommitmentIds: string[] }
  | { ok: false; error: 'proposal_not_found' | 'invalid_status' | 'update_failed' }

export async function updateProposalStatus(
  tenantId: string,
  workspaceId: string,
  input: UpdateProposalStatusInput
): Promise<UpdateProposalStatusResult> {
  // 1. Validate status — reject unknown values before any DB call.
  if (!(ALLOWED_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: 'invalid_status' }
  }

  // 2. Load and validate the proposal event.
  // getProposalEventById scopes to tenantId + workspaceId — returns null for missing or cross-workspace.
  const event = await eventRepo.getProposalEventById(tenantId, workspaceId, input.proposalEventId)
  if (!event) {
    return { ok: false, error: 'proposal_not_found' }
  }

  // 3. Update proposal status.
  let updated: Awaited<ReturnType<typeof eventRepo.updateProposalStatus>>
  try {
    updated = await eventRepo.updateProposalStatus(
      tenantId,
      workspaceId,
      input.proposalEventId,
      input.status as ProposalStatus
    )
  } catch {
    return { ok: false, error: 'update_failed' }
  }
  if (!updated) {
    // Row was deleted between the load and the update — return safely.
    return { ok: false, error: 'proposal_not_found' }
  }

  // 4. Close follow-up commitments for terminal statuses.
  // Open statuses (sent, viewed) leave commitments untouched.
  let closedCommitmentIds: string[] = []
  if (isClosedProposalStatus(input.status)) {
    try {
      closedCommitmentIds = await commitmentRepo.closeOpenCommitmentsForProposal(
        tenantId,
        workspaceId,
        input.proposalEventId
      )
    } catch {
      // Best-effort: a commitment close failure does not roll back the status update.
      // The status update is the authoritative record; commitments are supplementary.
    }
  }

  // Audit events — awaited but non-fatal (.catch): telemetry never blocks the
  // status update. PROPOSAL_FOLLOW_UP_SKIPPED is deliberately not emitted here:
  // this path closes commitments on terminal transitions (completed), and the
  // skip flow lives in the follow-up service.
  await recordActivity({
    tenantId,
    workspaceId,
    eventType:    PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_STATUS_UPDATED,
    eventSource:  'proposal_status',
    entityType:   'proposal_event',
    entityId:     input.proposalEventId,
    eventSummary: `Proposal status updated to ${input.status}`,
    metadata: {
      status:                  input.status,
      previous_status:         event.proposal_status ?? null,
      closed_commitment_count: closedCommitmentIds.length,
    },
  }).catch(() => null)
  if (closedCommitmentIds.length > 0) {
    await recordActivity({
      tenantId,
      workspaceId,
      eventType:    PROPOSAL_ACTIVITY_EVENTS.PROPOSAL_FOLLOW_UP_COMPLETED,
      eventSource:  'proposal_status',
      entityType:   'proposal_event',
      entityId:     input.proposalEventId,
      eventSummary: `${closedCommitmentIds.length} open commitment(s) closed on terminal status ${input.status}`,
      metadata:     { commitment_ids: closedCommitmentIds, status: input.status },
    }).catch(() => null)
  }

  return {
    ok: true,
    proposalEventId: input.proposalEventId,
    status: input.status,
    closedCommitmentIds,
  }
}
