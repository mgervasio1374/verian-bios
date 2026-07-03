// Ops Watchdog v1 — pure check functions over injected rows. Each detects one
// proven-or-plausible silent-failure mode; the queries that feed them live in
// ops-watchdog.service.ts. Pure so tests exercise fail/pass fixtures directly.

export type WatchdogCheckResult = { ok: true } | { ok: false; detail: string }

export const STALL_THRESHOLD_MINUTES = 45
export const WEBHOOK_STUCK_MIN_HOURS = 2
export const WEBHOOK_STUCK_MAX_HOURS = 24
export const WEBHOOK_EVENT_WINDOW_HOURS = 2
export const LEARNING_RUN_MAX_AGE_HOURS = 26
export const ERROR_SPIKE_THRESHOLD = 5
export const ERROR_SPIKE_WINDOW_MINUTES = 60

interface IdRow {
  id: string
}

// Dispatcher dead or send gate off with due mail: approved schedule items whose
// scheduled_for passed more than 45 minutes ago and were never sent.
export function checkDispatcherStalled(staleApprovedItems: IdRow[]): WatchdogCheckResult {
  if (staleApprovedItems.length === 0) return { ok: true }
  return {
    ok: false,
    detail:
      `${staleApprovedItems.length} approved campaign schedule item(s) due more than ` +
      `${STALL_THRESHOLD_MINUTES} minutes ago and still not dispatched`,
  }
}

// Scheduler dead: planned items past due by the same margin, never promoted.
export function checkSchedulerStalled(stalePlannedItems: IdRow[]): WatchdogCheckResult {
  if (stalePlannedItems.length === 0) return { ok: true }
  return {
    ok: false,
    detail:
      `${stalePlannedItems.length} planned campaign schedule item(s) due more than ` +
      `${STALL_THRESHOLD_MINUTES} minutes ago and still not promoted to drafts`,
  }
}

// The Svix failure mode: sends from 2-24h ago stuck at status='sent' (never
// delivered/bounced) while the webhook has written zero email_events in the
// last 2h → the Resend webhook endpoint is likely disabled.
export function checkWebhookSilent(
  stuckSentSends: IdRow[],
  recentEmailEvents: IdRow[],
): WatchdogCheckResult {
  if (stuckSentSends.length === 0) return { ok: true }
  if (recentEmailEvents.length > 0) return { ok: true }
  return {
    ok: false,
    detail:
      `${stuckSentSends.length} email send(s) created ${WEBHOOK_STUCK_MIN_HOURS}-` +
      `${WEBHOOK_STUCK_MAX_HOURS}h ago still status='sent' and zero email_events in the last ` +
      `${WEBHOOK_EVENT_WINDOW_HOURS}h — Resend webhook endpoint likely disabled`,
  }
}

// The Learning Agent failure mode: the daily 06:00 UTC run leaves an
// LA_SIGNALS_COMPUTED activity event; 26h of silence means it missed.
export function checkLearningRunMissed(recentLearningEvents: IdRow[]): WatchdogCheckResult {
  if (recentLearningEvents.length > 0) return { ok: true }
  return {
    ok: false,
    detail:
      `no LA_SIGNALS_COMPUTED activity event in the last ${LEARNING_RUN_MAX_AGE_HOURS}h — ` +
      'daily Learning Agent run missed',
  }
}

// Backstop: a burst of severe structured errors even if each individual alert
// was throttled or mis-keyed.
export function checkErrorSpike(recentSevereErrors: IdRow[]): WatchdogCheckResult {
  if (recentSevereErrors.length < ERROR_SPIKE_THRESHOLD) return { ok: true }
  return {
    ok: false,
    detail:
      `${recentSevereErrors.length}+ structured errors with severity error/critical in the ` +
      `last ${ERROR_SPIKE_WINDOW_MINUTES} minutes`,
  }
}
