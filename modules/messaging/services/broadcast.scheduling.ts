/**
 * Pure, DB-free scheduling logic for one-time broadcasts.
 *
 * Isolated from broadcast.service so tests can import it without pulling in the
 * Resend/Supabase chain, matching campaign-send-dispatcher.helpers.
 */

export const BROADCAST_PRIORITY = 2
export const CAMPAIGN_PRIORITY  = 1

export type BroadcastStatus = 'draft' | 'active' | 'queued' | 'completed' | 'terminated'

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDaysKey(key: string, days: number): string {
  return toDateKey(new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * 86_400_000))
}

export type ResumeDecision =
  | { action: 'wait';        reason: 'campaigns_active' | 'grace_period'; until?: string }
  | { action: 'start_grace'; resumeAfter: string }
  | { action: 'resume' }

/**
 * Whether a queued broadcast may resume.
 *
 * The grace clock starts when campaigns FINISH, not when the broadcast was
 * queued. Starting it at queue time would let a long campaign burn the whole
 * grace period while it ran, so the blast would resume the morning after the
 * campaign ended — exactly what the grace period exists to prevent.
 *
 * A campaign starting during the grace window voids the accrued grace, so the
 * full period is served after that campaign finishes too.
 */
export function evaluateResume(params: {
  broadcast:           { gracePeriodDays: number; resumeAfter: string | null }
  activeCampaignCount: number
  today:               string
}): ResumeDecision {
  const { broadcast, activeCampaignCount, today } = params

  if (activeCampaignCount > 0) return { action: 'wait', reason: 'campaigns_active' }
  if (!broadcast.resumeAfter) {
    return { action: 'start_grace', resumeAfter: addDaysKey(today, broadcast.gracePeriodDays) }
  }
  if (today < broadcast.resumeAfter) {
    return { action: 'wait', reason: 'grace_period', until: broadcast.resumeAfter }
  }
  return { action: 'resume' }
}

/** How much of the day's remaining allowance a broadcast may use. */
export function broadcastAllowance(params: {
  remainingAfterCampaigns: number
  broadcastStatus:         BroadcastStatus
}): number {
  if (params.broadcastStatus !== 'active') return 0
  return Math.max(0, params.remainingAfterCampaigns)
}
