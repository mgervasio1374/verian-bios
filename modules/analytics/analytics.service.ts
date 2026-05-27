import type { RequestContext } from '@/types/context'
import type { RevenueDashboard } from './analytics.types'
import * as repo from './analytics.repo'

export async function buildRevenueDashboard(ctx: RequestContext): Promise<RevenueDashboard> {
  const [pipeline, emailMetrics, learningSignals, openErrorCount] = await Promise.all([
    repo.getLeadPipelineStats(ctx.tenantId),
    repo.getEmailSendMetrics(ctx.tenantId, 30),
    repo.getLatestLearningSignals(ctx.tenantId),
    repo.getOpenErrorCount(ctx.tenantId),
  ])

  return {
    pipeline,
    emailMetrics,
    learningSignals,
    openErrorCount,
    generatedAt: new Date().toISOString(),
  }
}
