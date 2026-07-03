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
// checks (throttle key `watchdog:<check>` — an ongoing failure re-alerts at
// most hourly), and always records WATCHDOG_RAN so the watchdog itself is
// observable. All collaborators are injectable so the digest behavior is
// testable without a database.

export const WATCHDOG_CHECK_NAMES = [
  'dispatcherStalled',
  'schedulerStalled',
  'webhookSilent',
  'learningRunMissed',
  'errorSpike',
] as const

export type WatchdogCheckName = (typeof WATCHDOG_CHECK_NAMES)[number]

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
  check: WatchdogCheckName
  detail: string
}

export interface WatchdogRunSummary {
  tenantsChecked: number
  checksRun: number
  failures: WatchdogFailure[]
  alertSent: boolean
  alertedChecks: WatchdogCheckName[]
  throttledChecks: WatchdogCheckName[]
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

  const rows = (res: { data: { id: string }[] | null; error: { message: string } | null }) =>
    res.error ? [] : (res.data ?? [])

  return {
    staleApprovedItems:   rows(staleApproved),
    stalePlannedItems:    rows(stalePlanned),
    stuckSentSends:       rows(stuckSent),
    recentEmailEvents:    rows(recentEvents),
    recentLearningEvents: rows(recentLearning),
    recentSevereErrors:   rows(severeErrors),
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
    now: new Date(),
    ...overrides,
  }

  const tenantIds = await deps.listTenantIds()
  const failures: WatchdogFailure[] = []

  for (const tenantId of tenantIds) {
    try {
      const data = await deps.fetchTenantData(tenantId, deps.now)
      failures.push(...evaluateTenantChecks(tenantId, data))
    } catch {
      // One tenant's fetch failing must not blind the watchdog to the rest.
    }
  }

  const checksRun = tenantIds.length * WATCHDOG_CHECK_NAMES.length
  const alertingEnabled = deps.isAlertingEnabled()
  const alertedChecks: WatchdogCheckName[] = []
  const throttledChecks: WatchdogCheckName[] = []
  let alertSent = false

  if (failures.length > 0 && alertingEnabled) {
    // Throttle per check key so an ongoing failure re-alerts at most hourly.
    const failingChecks = [...new Set(failures.map((f) => f.check))]
    const includedChecks: WatchdogCheckName[] = []
    for (const check of failingChecks) {
      if (await deps.isAlertThrottled(`watchdog:${check}`)) throttledChecks.push(check)
      else includedChecks.push(check)
    }

    if (includedChecks.length > 0) {
      const includedFailures = failures.filter((f) => includedChecks.includes(f.check))
      const { subject, body } = composeWatchdogDigest(includedFailures)
      alertSent = await deps.sendOpsEmail(subject, body)
      if (alertSent) {
        alertedChecks.push(...includedChecks)
        for (const check of includedChecks) {
          const firstFailure = includedFailures.find((f) => f.check === check)
          await deps.markAlertSent(firstFailure?.tenantId, `watchdog:${check}`, subject)
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
