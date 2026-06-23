import { listPendingScheduleItemsForAssignment } from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import { updateScheduleItemStatus } from '@/modules/campaign-sequence/services/campaign-schedule-item.service'

// ---------------------------------------------------------------------------
// Manual Campaign Mode — Slice 8: stop detection
// ---------------------------------------------------------------------------
// Shared stop primitives used by:
//   - stopCampaignSequenceAction (manual operator stop)
//   - Resend webhook bounce/complaint handler (auto stop)
//   - Inbound-reply webhook (P3.5 — auto stop on a matched human reply)
//
// GUARDRAILS:
//   Transitions only to stopped_manual (manual), blocked (bounce/complaint), or
//   stopped_responded (a matched human reply — P3.5).
//   Does NOT transition to skipped — invalid from approved/scheduled.
//   Stopping is purely schedule-item status transitions and assignment retire.
//   No email-sending code here — purely schedule-item transitions and assignment retire.
// ---------------------------------------------------------------------------

export type StopMode = 'manual' | 'bounced' | 'complained' | 'responded'

export interface StopAssignmentScheduleOpts {
  // P3.5: timestamp of the detected reply, written to response_detected_at on
  // each stopped item for the 'responded' mode. Defaults to now().
  respondedAt?: string
}

// Pure helpers — no DB, fully unit-testable

export function classifyStopTarget(mode: StopMode): 'stopped_manual' | 'blocked' | 'stopped_responded' {
  if (mode === 'manual')    return 'stopped_manual'
  if (mode === 'responded') return 'stopped_responded'
  return 'blocked'
}

export function stopReasonFor(mode: StopMode): string {
  if (mode === 'manual')    return 'manual_stop'
  if (mode === 'responded') return 'response_detected'
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
  opts?: StopAssignmentScheduleOpts,
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
      } else if (target === 'stopped_responded') {
        // P3.5: a matched human reply — write response_detected_at + stopped_reason.
        await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'stopped_responded', {
          response_detected_at: opts?.respondedAt ?? new Date().toISOString(),
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
