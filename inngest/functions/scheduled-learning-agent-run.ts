import { inngest } from '@/lib/inngest/client'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { runLearningAnalysis } from '@/modules/messaging/learning-agent/learning-agent.service'
import { LEARNING_AGENT_LOOKBACK_DAYS } from '@/modules/messaging/learning-agent/learning-agent.types'

// Sentinel value distinguishing scheduled runs from manual runs in LA_ audit events.
const SCHEDULED_TRIGGERED_BY = 'scheduled:inngest'

interface TenantRunResult {
  tenantId:      string
  workspaceId:   string
  ok:            boolean
  snapshotCount: number
  totalSends:    number
  errorReason?:  string
}

interface ScheduledLearningAgentResult {
  tenantsProcessed: number
  tenantsWithData:  number
  tenantsWithError: number
  results:          TenantRunResult[]
}

/**
 * Phase 3B.1 — Daily scheduled Learning Agent run.
 *
 * Fires at 06:00 UTC daily. Runs the advisory Learning Agent for every active tenant.
 * Each tenant is processed independently — one tenant's failure does not abort others.
 *
 * workspace_id passed to runLearningAnalysis is execution context only (used for
 * learning_snapshots.workspace_id). It is not a signal dimension.
 *
 * The triggeredBy field is set to 'scheduled:inngest' so LA_ audit events are
 * distinguishable from manual "Run Analysis" button events.
 *
 * GUARDRAILS:
 *   Does NOT change strategy selection or strategy records.
 *   Does NOT update QRA scores or rankings.
 *   Does NOT modify message_version copy.
 *   Does NOT create email_drafts or email_sends.
 *   Does NOT call Resend.
 *   Does NOT call external LLMs.
 *   All learning_snapshots rows have advisory = true (enforced by DB constraint).
 */
export const scheduledLearningAgentRun = inngest.createFunction(
  {
    id: 'scheduled-learning-agent-run',
    name: 'Scheduled Learning Agent Run',
    // retries: 0 — a full retry would re-run all tenants; per-tenant errors are caught individually.
    retries: 0,
    triggers: [{ cron: '0 6 * * *' }],
  },
  async ({ step, logger }) => {
    // STEP 1: Enumerate active tenants (one workspace per tenant, stable order)
    const tenants = await step.run('enumerate-active-tenants', async () => {
      const supabase = createSupabaseServiceClient()
      const { data, error } = await supabase
        .from('workspaces')
        .select('tenant_id, id')
        .order('tenant_id', { ascending: true })
        .order('id', { ascending: true })

      if (error) throw new Error(`enumerate-active-tenants: ${error.message}`)

      // Keep only the first workspace per tenant (stable: lowest id alphabetically)
      const tenantMap = new Map<string, string>()
      for (const row of data ?? []) {
        if (!tenantMap.has(row.tenant_id)) {
          tenantMap.set(row.tenant_id, row.id)
        }
      }

      return [...tenantMap.entries()].map(([tenantId, workspaceId]) => ({
        tenantId,
        workspaceId,
      }))
    })

    logger.info(`Scheduled Learning Agent: ${tenants.length} tenant(s) to process`)

    // STEP 2: Run Learning Agent per tenant
    const results: TenantRunResult[] = []

    for (const { tenantId, workspaceId } of tenants) {
      const result = await step.run(`run-tenant-${tenantId}`, async (): Promise<TenantRunResult> => {
        try {
          const analysisResult = await runLearningAnalysis({
            tenantId,
            workspaceId,
            triggeredBy:  SCHEDULED_TRIGGERED_BY,
            lookbackDays: LEARNING_AGENT_LOOKBACK_DAYS,
          })
          return {
            tenantId,
            workspaceId,
            ok:            analysisResult.ok,
            snapshotCount: analysisResult.snapshotCount ?? 0,
            totalSends:    analysisResult.totalSends ?? 0,
            errorReason:   analysisResult.errorReason,
          }
        } catch (err) {
          return {
            tenantId,
            workspaceId,
            ok:            false,
            snapshotCount: 0,
            totalSends:    0,
            errorReason:   err instanceof Error ? err.message : 'unknown_error',
          }
        }
      })

      results.push(result)
    }

    // STEP 3: Summarize
    const summary: ScheduledLearningAgentResult = {
      tenantsProcessed: results.length,
      tenantsWithData:  results.filter(r => r.ok && r.totalSends > 0).length,
      tenantsWithError: results.filter(r => !r.ok).length,
      results,
    }

    if (summary.tenantsWithError > 0) {
      logger.warn('Scheduled Learning Agent: some tenants had errors', {
        errored: results
          .filter(r => !r.ok)
          .map(r => ({ tenantId: r.tenantId, reason: r.errorReason })),
      })
    } else {
      logger.info('Scheduled Learning Agent: all tenants processed', {
        tenantsProcessed: summary.tenantsProcessed,
        tenantsWithData:  summary.tenantsWithData,
      })
    }

    return summary
  }
)
