import type { RequestContext } from '@/types/context'
import * as repo from './structured-error.repo'
import type { CreateStructuredErrorInput, StructuredErrorStats } from './structured-error.types'
import type { Database } from '@/types/database'

type AutomationFailureRow = Database['public']['Tables']['automation_failures']['Row']

export interface OpenErrorsSummary {
  total:         number
  criticalErrors: number
  openCount:     number
  recentOpenErrors: AutomationFailureRow[]
  errorCountBySeverity: Record<string, number>
}

export async function createError(
  ctx:   RequestContext,
  input: Omit<CreateStructuredErrorInput, 'tenantId' | 'workspaceId'>,
): Promise<AutomationFailureRow> {
  return repo.createStructuredError({
    ...input,
    tenantId:    ctx.tenantId,
    workspaceId: ctx.workspaceId ?? null,
  })
}

export async function getOpenErrorsSummary(
  ctx: RequestContext,
): Promise<OpenErrorsSummary> {
  const [errors, stats] = await Promise.all([
    repo.listOpenErrors(ctx.tenantId, 20),
    repo.getErrorStats(ctx.tenantId),
  ])

  const errorCountBySeverity: Record<string, number> = {
    critical: stats.criticalCount,
    error:    stats.errorCount,
    warning:  stats.warningCount,
    info:     stats.infoCount,
  }

  return {
    total:                stats.total,
    criticalErrors:       stats.criticalCount,
    openCount:            stats.openCount,
    recentOpenErrors:     errors,
    errorCountBySeverity,
  }
}

export async function resolveError(
  ctx: RequestContext,
  id:  string,
): Promise<void> {
  return repo.resolveStructuredError(id, ctx.tenantId)
}

export async function getStats(
  ctx: RequestContext,
): Promise<StructuredErrorStats> {
  return repo.getErrorStats(ctx.tenantId)
}
