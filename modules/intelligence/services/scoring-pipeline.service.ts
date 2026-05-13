import type { RequestContext } from '@/types/context'
import type { ScoringPipelineResult } from '@/modules/intelligence/types'
import * as recommendationService from '@/modules/intelligence/services/recommendation.service'
import * as scoreRepo from '@/modules/intelligence/repositories/score.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import { calculateFitScore } from '@/modules/intelligence/services/fit-score.service'
import { calculateUrgencyScore } from '@/modules/intelligence/services/urgency-score.service'

export async function runLeadScoringPipeline(
  ctx: RequestContext,
  leadId: string,
  workflowRunId?: string | null
): Promise<ScoringPipelineResult> {
  const lead = await leadRepo.getLead(leadId, ctx.tenantId)
  if (!lead) throw new Error(`Lead not found: ${leadId}`)

  // Run calculations synchronously — pure functions, no DB
  const fitCalc = calculateFitScore(lead)
  const urgencyCalc = calculateUrgencyScore(lead)

  // Persist both scores in parallel
  const [fitScoreRow, urgencyScoreRow] = await Promise.all([
    scoreRepo.persistFitScore({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      subjectType: 'lead',
      subjectId: leadId,
      score: fitCalc.score,
      scoreVersion: 'v1',
      scoringConfigId: null,
      dimensions: fitCalc.dimensions as unknown as Record<string, unknown>,
      reasoning: fitCalc.reasoning,
      modelUsed: 'simple-rules-v1',
      confidence: fitCalc.confidence,
    }),
    scoreRepo.persistUrgencyScore({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      subjectType: 'lead',
      subjectId: leadId,
      score: urgencyCalc.score,
      scoreVersion: 'v1',
      scoringConfigId: null,
      dimensions: urgencyCalc.dimensions as unknown as Record<string, unknown>,
      reasoning: urgencyCalc.reasoning,
      modelUsed: 'simple-rules-v1',
      confidence: urgencyCalc.confidence,
    }),
  ])

  const recommendation = await recommendationService.generateRecommendation(
    ctx,
    leadId,
    fitCalc.score,
    urgencyCalc.score,
    fitCalc.dimensions,
    urgencyCalc.dimensions,
    workflowRunId
  )

  return { fitScore: fitScoreRow, urgencyScore: urgencyScoreRow, recommendation }
}
