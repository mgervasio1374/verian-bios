import { listPendingScheduleItemsForAssignment } from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import { updateScheduleItemStatus } from '@/modules/campaign-sequence/services/campaign-schedule-item.service'

// ---------------------------------------------------------------------------
// Manual Campaign Mode — Slice 8: stop detection
// ---------------------------------------------------------------------------
// Shared stop primitives used by:
//   - stopCampaignSequenceAction (manual operator stop)
//   - Resend webhook bounce/complaint handler (auto stop)
//
// GUARDRAILS:
//   Transitions only to stopped_manual (manual) or blocked (bounce/complaint).
//   Does NOT transition to skipped — invalid from approved/scheduled.
//   Does NOT set stopped_responded — no reply signal exists in this system.
//   Stopping is purely schedule-item status transitions and assignment retire.
//   No email-sending code here — purely schedule-item transitions and assignment retire.
// ---------------------------------------------------------------------------

export type StopMode = 'manual' | 'bounced' | 'complained'

// Pure helpers — no DB, fully unit-testable

export function classifyStopTarget(mode: StopMode): 'stopped_manual' | 'blocked' {
  return mode === 'manual' ? 'stopped_manual' : 'blocked'
}

export function stopReasonFor(mode: StopMode): string {
  if (mode === 'manual')    return 'manual_stop'
  if (mode === 'bounced')   return 'recipient_bounced'
  return 'recipient_complained'
}

// Stop all pending schedule items for an assignment.
// Per-item try/catch ensures one failed transition doesn't abort the batch.
// Idempotent: already-terminal items are simply not in the pending list.

export async function stopAssignmentSchedule(
  assignmentId: string,
  tenantId: string,
  workspaceId: string,
  mode: StopMode,
): Promise<{ stopped: number }> {
  const target = classifyStopTarget(mode)
  const reason = stopReasonFor(mode)

  const items = await listPendingScheduleItemsForAssignment(assignmentId, tenantId, workspaceId)

  let stopped = 0
  for (const item of items) {
    try {
      if (target === 'stopped_manual') {
        await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'stopped_manual', {
          stopped_at: new Date().toISOString(),
          stopped_reason: reason,
        })
      } else {
        await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'blocked', {
          status_reason: reason,
        })
      }
      stopped++
    } catch {
      // Per-item isolation: one bad transition doesn't abort the batch
    }
  }

  return { stopped }
}
