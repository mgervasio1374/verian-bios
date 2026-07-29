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

// ---------------------------------------------------------------------------
// Send schedule
// ---------------------------------------------------------------------------

export interface BroadcastSchedule {
  startsAt:         string | null   // ISO instant, or null for "as soon as active"
  sendWindowStart:  string          // 'HH:MM' local
  sendWindowEnd:    string          // 'HH:MM' local
  timeZone:         string          // IANA
}

export type SendTimingVerdict =
  | { canSend: true }
  | { canSend: false; reason: 'before_start'; startsAt: string }
  | { canSend: false; reason: 'outside_window'; window: string }
  | { canSend: false; reason: 'bad_window' }

/** Minutes past local midnight, or null if the value is not 'HH:MM'. */
function minutesOfDay(hhmm: string): number | null {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Local wall-clock minutes past midnight for an instant in a zone. */
export function localMinutesOfDay(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  let hour = get('hour')
  if (hour === 24) hour = 0            // some ICU versions render midnight as 24
  return hour * 60 + get('minute')
}

/**
 * May the broadcast send at this instant?
 *
 * Two independent gates. `startsAt` governs only the first send; the window
 * governs every day after, which is the one that actually matters for a drip
 * lasting weeks. Without the window the governor's allowance would reset at
 * UTC midnight (7-8pm Eastern) and fire the whole day's quota that evening.
 *
 * A malformed window fails CLOSED rather than defaulting to all-day: a
 * broadcast that sends at the wrong hour is worse than one that does not send.
 */
export function evaluateSendTiming(
  schedule: BroadcastSchedule,
  now:      Date,
): SendTimingVerdict {
  if (schedule.startsAt) {
    const start = new Date(schedule.startsAt)
    if (!Number.isNaN(start.getTime()) && now < start) {
      return { canSend: false, reason: 'before_start', startsAt: schedule.startsAt }
    }
  }

  const from = minutesOfDay(schedule.sendWindowStart)
  const to   = minutesOfDay(schedule.sendWindowEnd)
  if (from === null || to === null || from >= to) return { canSend: false, reason: 'bad_window' }

  const nowMinutes = localMinutesOfDay(now, schedule.timeZone)
  if (nowMinutes < from || nowMinutes >= to) {
    return {
      canSend: false,
      reason:  'outside_window',
      window:  `${schedule.sendWindowStart}-${schedule.sendWindowEnd} ${schedule.timeZone}`,
    }
  }
  return { canSend: true }
}
