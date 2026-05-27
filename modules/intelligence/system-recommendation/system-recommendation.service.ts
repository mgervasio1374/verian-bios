import type { RequestContext } from '@/types/context'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { getOpenErrorsSummary } from '@/modules/intelligence/structured-errors/structured-error.service'
import { getWorkflowHealth } from '@/modules/workflow/services/health.service'
import {
  listPendingSystemRecs,
  persistRecommendation,
} from '@/modules/intelligence/repositories/recommendation.repo'
import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import type { OpenErrorsSummary } from '@/modules/intelligence/structured-errors/structured-error.service'
import type { WorkflowHealthReport } from '@/modules/workflow/services/health.service'
import {
  REC_THRESHOLD,
  type RecCheckResult,
  type SystemRecGeneratorResult,
} from './system-recommendation.types'

// ---- Pure condition-check functions ----

function checkErrorDiagnosis(summary: OpenErrorsSummary): RecCheckResult | null {
  const errCount = summary.errorCountBySeverity['error'] ?? 0
  if (summary.criticalErrors < 1 && errCount < REC_THRESHOLD.ERROR_COUNT_MIN) return null
  const severity = summary.criticalErrors >= 1 ? 'critical' : 'error'
  const total    = summary.criticalErrors + errCount
  return {
    recommendationType: 'SYSTEM_ERROR_DIAGNOSIS',
    title:   `${total} open critical/error-level failure${total === 1 ? '' : 's'} require investigation`,
    body:    `${summary.criticalErrors} critical and ${errCount} error-level failures are currently open. ` +
             `Review the Critical & Open Errors table on the System Intelligence page and use Resolve, ` +
             `Investigate, or Ignore to triage each one.`,
    severity,
    priority: 'high',
  }
}

function checkImportHealth(failedBatchCount: number): RecCheckResult | null {
  if (failedBatchCount === 0) return null
  return {
    recommendationType: 'SYSTEM_IMPORT_HEALTH',
    title:   `${failedBatchCount} import batch${failedBatchCount === 1 ? '' : 'es'} failed or partially committed`,
    body:    `${failedBatchCount} import batch${failedBatchCount === 1 ? '' : 'es'} are in a failed or ` +
             `partially-committed state. Review the Failed & Partially-Committed Imports table and ` +
             `check each batch detail page.`,
    severity: 'error',
    priority: 'high',
  }
}

function checkWorkflowRecommendation(health: WorkflowHealthReport): RecCheckResult | null {
  const { stuckCount, failedCount } = health.workflows
  if (stuckCount < 1 && failedCount < 1) return null
  return {
    recommendationType: 'SYSTEM_WORKFLOW_RECOMMENDATION',
    title:   `${stuckCount} stuck and ${failedCount} failed workflow${failedCount === 1 ? '' : 's'} detected`,
    body:    `${stuckCount} stuck and ${failedCount} failed workflow${failedCount === 1 ? '' : 's'} were ` +
             `detected. Review the Workflow Health page for details.`,
    severity: 'warning',
    priority: 'medium',
  }
}

// ---- Orchestration ----

export async function runSystemRecommendationGenerator(
  ctx: RequestContext,
): Promise<SystemRecGeneratorResult> {
  try {
    const supabase = createSupabaseServiceClient()

    const [errorsSummary, healthReport, failedBatchesResult, pendingRecs] = await Promise.all([
      getOpenErrorsSummary(ctx),
      getWorkflowHealth(ctx),
      supabase
        .from('import_batches')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .in('status', ['failed', 'partially_committed'])
        .is('deleted_at', null),
      listPendingSystemRecs(ctx.tenantId),
    ])

    const failedBatchCount = (failedBatchesResult.data ?? []).length
    const pendingTypes     = new Set(pendingRecs.map(r => r.recommendation_type))

    const checks: (RecCheckResult | null)[] = [
      checkErrorDiagnosis(errorsSummary),
      checkImportHealth(failedBatchCount),
      checkWorkflowRecommendation(healthReport),
    ]

    let created            = 0
    let skippedDedup       = 0
    let skippedNoCondition = 0

    for (const check of checks) {
      if (check === null) { skippedNoCondition++; continue }
      if (pendingTypes.has(check.recommendationType)) { skippedDedup++; continue }
      await persistRecommendation({
        tenantId:           ctx.tenantId,
        workspaceId:        ctx.workspaceId ?? undefined,
        subjectType:        'system',
        subjectId:          ctx.tenantId,
        recommendationType: check.recommendationType,
        title:              check.title,
        body:               check.body,
        priority:           check.priority,
        rawOutput:          {},
        sourceAgent:        'system_recommendation_generator',
        severity:           check.severity,
      })
      created++
    }

    recordActivityEvent({
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId ?? undefined,
      eventType:   ActivityEventType.SYSTEM_REC_GENERATOR_RUN,
      eventSource: 'system_intelligence_ui',
      entityType:  'system_recommendation_generator',
      entityId:    ctx.tenantId,
      properties:  { created, skippedDedup, skippedNoCondition },
    }).catch(() => {})

    return { created, skippedDedup, skippedNoCondition }
  } catch (err) {
    recordActivityEvent({
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId ?? undefined,
      eventType:   ActivityEventType.SYSTEM_REC_GENERATOR_FAILED,
      eventSource: 'system_intelligence_ui',
      entityType:  'system_recommendation_generator',
      entityId:    ctx.tenantId,
      properties:  { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {})
    throw err
  }
}
