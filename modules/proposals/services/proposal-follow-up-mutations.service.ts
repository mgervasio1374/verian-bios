import {
  completeFollowUpCommitment,
  skipFollowUpCommitment,
  rescheduleFollowUpCommitment,
  ProposalFollowUpMutationError,
  type ProposalFollowUpMutationCommitmentRow,
} from '@/modules/proposals/repositories/proposal-follow-up-mutations.repo'
import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'
import { ActivityEventType } from '@/modules/intelligence/types.agent'

export type { ProposalFollowUpMutationCommitmentRow }

export type CompleteFollowUpCommitmentResult =
  | { ok: true;  commitment: ProposalFollowUpMutationCommitmentRow }
  | { ok: false; error: 'not_found' | 'not_open' | 'write_failed' | 'audit_failed' | 'unknown_error' }

// ---------------------------------------------------------------------------
// Complete a follow-up commitment for a workspace operator.
//
// Calls the repository mutation, then records an activity_events audit entry.
// tenantId and workspaceId always come from server-side session context —
// they are passed as function args and never read from client input.
//
// Audit failure behavior: if the commitment is already written and the audit
// call subsequently throws, the commitment is NOT rolled back (no transaction
// support at this layer). The service returns audit_failed so the server action
// can surface the partial-success state to the caller. Full transactional
// rollback is deferred until there is a demonstrated need.
// ---------------------------------------------------------------------------

export async function completeFollowUpCommitmentForWorkspace(
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  actorUserId: string,
  completionNotes?: string,
): Promise<CompleteFollowUpCommitmentResult> {
  let commitment: ProposalFollowUpMutationCommitmentRow

  try {
    commitment = await completeFollowUpCommitment(
      tenantId,
      workspaceId,
      commitmentId,
      actorUserId,
      completionNotes,
    )
  } catch (err) {
    if (err instanceof ProposalFollowUpMutationError) {
      return { ok: false, error: err.code }
    }
    return { ok: false, error: 'unknown_error' }
  }

  try {
    await recordActivityEvent({
      tenantId,
      workspaceId,
      eventType:    ActivityEventType.PROPOSAL_FOLLOW_UP_COMPLETED,
      eventSource:  'operator_action',
      entityType:   'proposal_follow_up_commitment',
      entityId:     commitment.id,
      leadId:       commitment.lead_id ?? undefined,
      eventSummary: 'Follow-up commitment completed',
      properties: {
        previous_status:         'open',
        next_status:             'completed',
        actor_user_id:           actorUserId,
        proposal_event_id:       commitment.proposal_event_id,
        follow_up_commitment_id: commitment.id,
        follow_up_sequence:      commitment.follow_up_sequence,
        completed_at:            commitment.completed_at,
        completion_notes:        commitment.completion_notes,
      },
    })
  } catch {
    return { ok: false, error: 'audit_failed' }
  }

  return { ok: true, commitment }
}

// ---------------------------------------------------------------------------
// Skip a follow-up commitment for a workspace operator.
//
// Calls the repository mutation, then records an activity_events audit entry.
// tenantId and workspaceId always come from server-side session context —
// they are passed as function args and never read from client input.
//
// Audit failure behavior: if the commitment is already written and the audit
// call subsequently throws, the commitment is NOT rolled back (no transaction
// support at this layer). The service returns audit_failed so the server action
// can surface the partial-success state to the caller. Full transactional
// rollback is deferred until there is a demonstrated need.
// ---------------------------------------------------------------------------

export type SkipFollowUpCommitmentResult =
  | { ok: true;  commitment: ProposalFollowUpMutationCommitmentRow }
  | { ok: false; error: 'not_found' | 'not_open' | 'write_failed' | 'audit_failed' | 'unknown_error' }

export async function skipFollowUpCommitmentForWorkspace(
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  actorUserId: string,
  skippedReason?: string,
): Promise<SkipFollowUpCommitmentResult> {
  let commitment: ProposalFollowUpMutationCommitmentRow

  try {
    commitment = await skipFollowUpCommitment(
      tenantId,
      workspaceId,
      commitmentId,
      actorUserId,
      skippedReason,
    )
  } catch (err) {
    if (err instanceof ProposalFollowUpMutationError) {
      return { ok: false, error: err.code }
    }
    return { ok: false, error: 'unknown_error' }
  }

  try {
    await recordActivityEvent({
      tenantId,
      workspaceId,
      eventType:    ActivityEventType.PROPOSAL_FOLLOW_UP_SKIPPED,
      eventSource:  'operator_action',
      entityType:   'proposal_follow_up_commitment',
      entityId:     commitment.id,
      leadId:       commitment.lead_id ?? undefined,
      eventSummary: 'Follow-up commitment skipped',
      properties: {
        previous_status:         'open',
        next_status:             'skipped',
        actor_user_id:           actorUserId,
        proposal_event_id:       commitment.proposal_event_id,
        follow_up_commitment_id: commitment.id,
        follow_up_sequence:      commitment.follow_up_sequence,
        skipped_at:              commitment.skipped_at,
        skipped_reason:          commitment.skipped_reason,
      },
    })
  } catch {
    return { ok: false, error: 'audit_failed' }
  }

  return { ok: true, commitment }
}

// ---------------------------------------------------------------------------
// Reschedule a follow-up commitment for a workspace operator.
//
// Calls the repository mutation, then records an activity_events audit entry.
// tenantId and workspaceId always come from server-side session context —
// they are passed as function args and never read from client input.
//
// Audit failure behavior: if the commitment is already written and the audit
// call subsequently throws, the commitment is NOT rolled back (no transaction
// support at this layer). The service returns audit_failed so the server action
// can surface the partial-success state to the caller. Full transactional
// rollback is deferred until there is a demonstrated need.
// ---------------------------------------------------------------------------

export type RescheduleFollowUpCommitmentResult =
  | { ok: true;  commitment: ProposalFollowUpMutationCommitmentRow }
  | { ok: false; error: 'not_found' | 'not_open' | 'write_failed' | 'audit_failed' | 'unknown_error' }

export async function rescheduleFollowUpCommitmentForWorkspace(
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  actorUserId: string,
  nextFollowUpDueAt: string,
): Promise<RescheduleFollowUpCommitmentResult> {
  let repoResult: { previousFollowUpDueAt: string; commitment: ProposalFollowUpMutationCommitmentRow }

  try {
    repoResult = await rescheduleFollowUpCommitment(
      tenantId,
      workspaceId,
      commitmentId,
      actorUserId,
      nextFollowUpDueAt,
    )
  } catch (err) {
    if (err instanceof ProposalFollowUpMutationError) {
      return { ok: false, error: err.code }
    }
    return { ok: false, error: 'unknown_error' }
  }

  const { previousFollowUpDueAt, commitment } = repoResult

  try {
    await recordActivityEvent({
      tenantId,
      workspaceId,
      eventType:    ActivityEventType.PROPOSAL_FOLLOW_UP_RESCHEDULED,
      eventSource:  'operator_action',
      entityType:   'proposal_follow_up_commitment',
      entityId:     commitment.id,
      leadId:       commitment.lead_id ?? undefined,
      eventSummary: 'Follow-up commitment rescheduled',
      properties: {
        previous_status:           'open',
        next_status:               'open',
        actor_user_id:             actorUserId,
        proposal_event_id:         commitment.proposal_event_id,
        follow_up_commitment_id:   commitment.id,
        follow_up_sequence:        commitment.follow_up_sequence,
        previous_follow_up_due_at: previousFollowUpDueAt,
        next_follow_up_due_at:     commitment.follow_up_due_at,
      },
    })
  } catch {
    return { ok: false, error: 'audit_failed' }
  }

  return { ok: true, commitment }
}
