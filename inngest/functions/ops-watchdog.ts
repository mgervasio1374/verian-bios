import { inngest } from '@/lib/inngest/client'
import { runOpsWatchdog } from '@/modules/intelligence/alerting/ops-watchdog.service'

/**
 * Ops Alerting v1 — watchdog cron.
 *
 * Runs every 30 minutes. For each active tenant, evaluates the five
 * silent-failure checks (dispatcher stalled, scheduler stalled, webhook
 * silent, learning run missed, error spike) and sends ONE digest email per
 * run for the failing, non-throttled checks via the ops alerting service.
 * Always records a WATCHDOG_RAN activity event so the watchdog itself is
 * observable. Read-only against business tables; no sends, no mutations
 * beyond activity_events.
 */
export const opsWatchdog = inngest.createFunction(
  {
    id: 'ops-watchdog',
    name: 'Ops Watchdog',
    retries: 0,
    triggers: [{ cron: '*/30 * * * *' }],
  },
  async ({ step, logger }) => {
    const summary = await step.run('run-watchdog-checks', () => runOpsWatchdog())

    logger.info('Ops watchdog complete', {
      tenantsChecked:  summary.tenantsChecked,
      checksRun:       summary.checksRun,
      failures:        summary.failures.length,
      alertSent:       summary.alertSent,
      throttledChecks: summary.throttledChecks,
      alertingEnabled: summary.alertingEnabled,
    })

    return summary
  },
)
