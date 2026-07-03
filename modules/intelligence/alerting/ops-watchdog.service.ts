import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { recordActivity } from '@/modules/intelligence/services/activity-event.service'
import type { RecordActivityInput } from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import {
  isAlertingEnabled,
  isAlertThrottled,
  markAlertSent,
  sendOpsEmail,
} from './alerting.service'
import {
  checkDispatcherStalled,
  checkSchedulerStalled,
  checkWebhookSilent,
  checkLearningRunMissed,
  checkErrorSpike,
  STALL_THRESHOLD_MINUTES,
  WEBHOOK_STUCK_MIN_HOURS,
  WEBHOOK_STUCK_MAX_HOURS,
  WEBHOOK_EVENT_WINDOW_HOURS,
  LEARNING_RUN_MAX_AGE_HOURS,
  ERROR_SPIKE_THRESHOLD,
  ERROR_SPIKE_WINDOW_MINUTES,
} from './ops-watchdog.checks'

// Ops Watchdog v1 orchestration. Runs the five silent-failure checks per active
// tenant, composes ONE digest email per run from the failing, non-throttled
// failures (throttle key `watchdog:<check>:<tenantId>` — an ongoing failure
// re-alerts at most hourly PER TENANT, so one tenant's alert never suppresses
// another's), and always records WATCHDOG_RAN so the watchdog itself is
// observable. A tenant whose monitoring queries fail surfaces as a
// `monitoringFailed` failure instead of silently reading healthy. All
// collaborators are injectable so the digest behavior is testable without a
// database. Tenant checks run sequentially by design — fine at current tenant
// counts; partition the work before scaling this to many tenants.

export const WATCHDOG_CHECK_NAMES = [
  'dispatcherStalled',
  'schedulerStalled',
  'webhookSilent',
  'learningRunMissed',
  'errorSpike',
] as const

export type WatchdogCheckName = (typeof WATCHDOG_CHECK_NAMES)[number]

// The five checks plus the meta-failure: monitoring itself broke for a tenant.
export type WatchdogFailureKind = WatchdogCheckName | 'monitoringFailed'

export interface TenantWatchdogData {
  staleApprovedItems: { id: string }[]
  stalePlannedItems: { id: string }[]
  stuckSentSends: { id: string }[]
  recentEmailEvents: { id: string }[]
  recentLearningEvents: { id: string }[]
  recentSevereErrors: { id: string }[]
}

export interface WatchdogFailure {
  tenantId: string
  check: WatchdogFailureKind
  detail: string
}

export interface WatchdogRunSummary {
  tenantsChecked: number
  checksRun: number
  failures: WatchdogFailure[]
  alertSent: boolean
  alertedChecks: WatchdogFailureKind[]
  throttledChecks: WatchdogFailureKind[]
  alertingEnabled: boolean
}

export interface OpsWatchdogDeps {
  listTenantIds: () => Promise<string[]>
  fetchTenantData: (tenantId: string, now: Date) => Promise<TenantWatchdogData>
  isAlertingEnabled: () => boolean
  isAlertThrottled: (key: string) => Promise<boolean>
  sendOpsEmail: (subject: string, body: string) => Promise<boolean>
  markAlertSent: (tenantId: string | undefined, key: string, subject: string) => Promise<void>
  recordActivity: (input: RecordActivityInput) => Promise<unknown>
  pingDeadman: () => Promise<void>
  now: Date
}

// Pure: run all five checks against one tenant's fetched data.
export function evaluateTenantChecks(
  tenantId: string,
  data: TenantWatchdogData,
): WatchdogFailure[] {
  const results: Array<[WatchdogCheckName, ReturnType<typeof checkDispatcherStalled>]> = [
    ['dispatcherStalled', checkDispatcherStalled(data.staleApprovedItems)],
    ['schedulerStalled',  checkSchedulerStalled(data.stalePlannedItems)],
    ['webhookSilent',     checkWebhookSilent(data.stuckSentSends, data.recentEmailEvents)],
    ['learningRunMissed', checkLearningRunMissed(data.recentLearningEvents)],
    ['errorSpike',        checkErrorSpike(data.recentSevereErrors)],
  ]
  const failures: WatchdogFailure[] = []
  for (const [check, result] of results) {
    if (!result.ok) failures.push({ tenantId, check, detail: result.detail })
  }
  return failures
}

// Pure: digest email content from the non-throttled failures.
export function composeWatchdogDigest(failures: WatchdogFailure[]): {
  subject: string
  body: string
} {
  const checkNames = [...new Set(failures.map((f) => f.check))]
  const subject = `[Verian watchdog] ${checkNames.length} failing check(s): ${checkNames.join(', ')}`
  const body = [
    `The ops watchdog found ${failures.length} failure(s):`,
    '',
    ...failures.map((f) => `[${f.check}] tenant ${f.tenantId}: ${f.detail}`),
    '',
    'An ongoing failure re-alerts at most hourly per check.',
  ].join('\n')
  return { subject, body }
}

async function defaultListTenantIds(): Promise<string[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('workspaces')
    .select('tenant_id')
    .order('tenant_id', { ascending: true })
  if (error) throw new Error(`ops-watchdog listTenantIds: ${error.message}`)
  return [...new Set((data ?? []).map((r) => r.tenant_id))]
}

async function defaultFetchTenantData(tenantId: string, now: Date): Promise<TenantWatchdogData> {
  const supabase = createSupabaseServiceClient()
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString()
  const stallCutoff        = iso(STALL_THRESHOLD_MINUTES * 60_000)
  const stuckMinCutoff     = iso(WEBHOOK_STUCK_MAX_HOURS * 3_600_000)   // created >= now-24h
  const stuckMaxCutoff     = iso(WEBHOOK_STUCK_MIN_HOURS * 3_600_000)   // created <= now-2h
  const eventWindowCutoff  = iso(WEBHOOK_EVENT_WINDOW_HOURS * 3_600_000)
  const learningCutoff     = iso(LEARNING_RUN_MAX_AGE_HOURS * 3_600_000)
  const errorSpikeCutoff   = iso(ERROR_SPIKE_WINDOW_MINUTES * 60_000)

  const [staleApproved, stalePlanned, stuckSent, recentEvents, recentLearning, severeErrors] =
    await Promise.all([
      supabase
        .from('campaign_schedule_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'approved')
        .lt('scheduled_for', stallCutoff)
        .limit(50),
      supabase
        .from('campaign_schedule_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'planned')
        .lt('scheduled_for', stallCutoff)
        .limit(50),
      supabase
        .from('email_sends')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'sent')
        .gte('created_at', stuckMinCutoff)
        .lte('created_at', stuckMaxCutoff)
        .limit(50),
      supabase
        .from('email_events')
        .select('id')
        .eq('tenant_id', tenantId)
        .gte('created_at', eventWindowCutoff)
        .limit(1),
      supabase
        .from('activity_events')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('event_type', ActivityEventType.LA_SIGNALS_COMPUTED)
        .gte('occurred_at', learningCutoff)
        .limit(1),
      supabase
        .from('automation_failures')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('severity', ['error', 'critical'])
        .gte('created_at', errorSpikeCutoff)
        .limit(ERROR_SPIKE_THRESHOLD),
    ])

  // A failed query must THROW, not read as an empty (healthy-looking) result —
  // otherwise a database problem silently disables the very monitoring that
  // should catch it. The caller surfaces this as a `monitoringFailed` failure.
  const rows = (
    label: string,
    res: { data: { id: string }[] | null; error: { message: string } | null },
  ) => {
    if (res.error) throw new Error(`ops-watchdog ${label} query failed: ${res.error.message}`)
    return res.data ?? []
  }

  return {
    staleApprovedItems:   rows('staleApproved', staleApproved),
    stalePlannedItems:    rows('stalePlanned', stalePlanned),
    stuckSentSends:       rows('stuckSent', stuckSent),
    recentEmailEvents:    rows('recentEvents', recentEvents),
    recentLearningEvents: rows('recentLearning', recentLearning),
    recentSevereErrors:   rows('severeErrors', severeErrors),
  }
}

// Dead-man hook: GET the configured monitor URL after every completed run.
// External services (healthchecks.io-style) alert when the ping STOPS arriving
// — the one failure mode the watchdog cannot self-report (its cron dying).
// No-op when OPS_DEADMAN_PING_URL is unset; never throws.
export async function pingDeadmanMonitor(): Promise<void> {
  const url = process.env.OPS_DEADMAN_PING_URL
  if (!url) return
  try {
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5_000) })
  } catch (err) {
    console.error('[ops-watchdog] dead-man ping failed:', err instanceof Error ? err.message : String(err))
  }
}

export async function runOpsWatchdog(
  overrides: Partial<OpsWatchdogDeps> = {},
): Promise<WatchdogRunSummary> {
  const deps: OpsWatchdogDeps = {
    listTenantIds:     defaultListTenantIds,
    fetchTenantData:   defaultFetchTenantData,
    isAlertingEnabled,
    isAlertThrottled,
    sendOpsEmail,
    markAlertSent,
    recordActivity,
    pingDeadman: pingDeadmanMonitor,
    now: new Date(),
    ...overrides,
  }

  const tenantIds = await deps.listTenantIds()
  const failures: WatchdogFailure[] = []

  for (const tenantId of tenantIds) {
    try {
      const data = await deps.fetchTenantData(tenantId, deps.now)
      failures.push(...evaluateTenantChecks(tenantId, data))
    } catch (err) {
      // One tenant's fetch failing must not blind the watchdog to the rest —
      // but it is NOT healthy either. Surface it as its own alertable failure.
      failures.push({
        tenantId,
        check: 'monitoringFailed',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const checksRun = tenantIds.length * WATCHDOG_CHECK_NAMES.length
  const alertingEnabled = deps.isAlertingEnabled()
  const alertedChecks: WatchdogFailureKind[] = []
  const throttledChecks: WatchdogFailureKind[] = []
  let alertSent = false

  if (failures.length > 0 && alertingEnabled) {
    // Throttle per (check, tenant) so an ongoing failure re-alerts at most
    // hourly WITHOUT one tenant's alert suppressing the same check elsewhere.
    const includedFailures: WatchdogFailure[] = []
    for (const failure of failures) {
      if (await deps.isAlertThrottled(`watchdog:${failure.check}:${failure.tenantId}`)) {
        if (!throttledChecks.includes(failure.check)) throttledChecks.push(failure.check)
      } else {
        includedFailures.push(failure)
      }
    }

    if (includedFailures.length > 0) {
      const { subject, body } = composeWatchdogDigest(includedFailures)
      alertSent = await deps.sendOpsEmail(subject, body)
      if (alertSent) {
        for (const failure of includedFailures) {
          if (!alertedChecks.includes(failure.check)) alertedChecks.push(failure.check)
          await deps.markAlertSent(
            failure.tenantId,
            `watchdog:${failure.check}:${failure.tenantId}`,
            subject,
          )
        }
      }
    }
  }

  // The watchdog itself must be observable — always leave a heartbeat, even
  // when alerting is disabled or nothing failed. Attributed to the first
  // tenant (activity_events requires one); skipped only with zero tenants.
  if (tenantIds.length > 0) {
    try {
      await deps.recordActivity({
        tenantId: tenantIds[0],
        eventType: ActivityEventType.WATCHDOG_RAN,
        eventSource: 'ops_watchdog',
        eventSummary: `Ops watchdog ran: ${checksRun} check(s), ${failures.length} failure(s)`,
        metadata: {
          checks_run: checksRun,
          failures: failures.map((f) => ({
            tenant_id: f.tenantId,
            check: f.check,
            detail: f.detail,
          })),
        },
      })
    } catch {
      // heartbeat is best-effort — never fail the run over it
    }
  }

  // Dead-man ping LAST: it asserts "a full watchdog run completed". An external
  // monitor alerting on missing pings covers the cron-death blind spot.
  await deps.pingDeadman()

  return {
    tenantsChecked: tenantIds.length,
    checksRun,
    failures,
    alertSent,
    alertedChecks,
    throttledChecks,
    alertingEnabled,
  }
}
