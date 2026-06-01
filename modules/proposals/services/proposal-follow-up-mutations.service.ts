import {
  completeFollowUpCommitment,
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
