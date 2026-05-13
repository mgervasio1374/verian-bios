import type { RequestContext } from '@/types/context'
import type { LeadRow, FitScoreCalculation, FitScoreDimensions, FitScoreRow } from '@/modules/intelligence/types'
import * as scoreRepo from '@/modules/intelligence/repositories/score.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'

// ---- Scoring model identifier ----
const MODEL_ID = 'simple-rules-v1'
const SCORE_VERSION = 'v1'

// ---- Source quality weights ----
const SOURCE_SCORES: Record<string, number> = {
  referral: 20,
  inbound: 16,
  import: 12,
  manual: 10,
  cold_outreach: 7,
}

// ---- Stage signal weights ----
const STAGE_SCORES: Record<string, number> = {
  negotiation: 20,
  proposal: 16,
  statement_review: 12,
  contacted: 8,
  new: 4,
  closed_won: 0,
  closed_lost: 0,
}

/**
 * Calculate fit score from lead data.
 * Pure function — no side effects, no DB access.
 *
 * Fit = how well this lead matches an ideal prospect.
 * Dimensions:
 *   data_completeness (0-30): company, contact, value presence
 *   value_signal      (0-30): estimated_value tier
 *   source_quality    (0-20): origin of the lead
 *   stage_signal      (0-20): how far they are in the pipeline already
 */
export function calculateFitScore(lead: LeadRow): FitScoreCalculation {
  const dimensions: FitScoreDimensions = {
    data_completeness: 0,
    value_signal: 0,
    source_quality: 0,
    stage_signal: 0,
  }

  // data_completeness (max 30)
  if (lead.company_id) dimensions.data_completeness += 12
  if (lead.contact_id) dimensions.data_completeness += 12
  if (lead.estimated_value) dimensions.data_completeness += 6

  // value_signal (max 30)
  const ev = Number(lead.estimated_value ?? 0)
  if (ev >= 20000) dimensions.value_signal = 30
  else if (ev >= 15000) dimensions.value_signal = 26
  else if (ev >= 10000) dimensions.value_signal = 22
  else if (ev >= 8000) dimensions.value_signal = 18
  else if (ev >= 5000) dimensions.value_signal = 14
  else if (ev >= 3000) dimensions.value_signal = 10
  else if (ev >= 1000) dimensions.value_signal = 5

  // source_quality (max 20)
  dimensions.source_quality = SOURCE_SCORES[lead.source ?? ''] ?? 4

  // stage_signal (max 20)
  dimensions.stage_signal = STAGE_SCORES[lead.stage] ?? 4

  const score = Math.min(
    100,
    dimensions.data_completeness +
    dimensions.value_signal +
    dimensions.source_quality +
    dimensions.stage_signal
  )

  // Confidence: driven by data completeness
  const confidence =
    dimensions.data_completeness >= 24 ? 0.85
    : dimensions.data_completeness >= 18 ? 0.70
    : dimensions.data_completeness >= 12 ? 0.50
    : 0.30

  const reasoning = buildFitReasoning(lead, dimensions, score)

  const key_inputs: Record<string, unknown> = {
    has_company: !!lead.company_id,
    has_contact: !!lead.contact_id,
    estimated_value: lead.estimated_value,
    source: lead.source,
    stage: lead.stage,
  }

  return { score, dimensions, reasoning, confidence, key_inputs }
}

function buildFitReasoning(
  lead: LeadRow,
  dim: FitScoreDimensions,
  score: number
): string {
  const parts: string[] = [`Fit score: ${score}/100.`]

  if (dim.data_completeness < 18)
    parts.push('Data completeness is low — missing company, contact, or value info reduces confidence.')
  else
    parts.push('Good data completeness.')

  if (dim.value_signal >= 22)
    parts.push(`Strong value signal (estimated $${lead.estimated_value?.toLocaleString()}).`)
  else if (dim.value_signal === 0)
    parts.push('No estimated value provided.')

  if (dim.source_quality >= 16)
    parts.push(`High-quality source (${lead.source}).`)
  else if (dim.source_quality <= 7)
    parts.push(`Lower-quality source (${lead.source ?? 'unknown'}).`)

  if (dim.stage_signal >= 12)
    parts.push(`Lead is already in "${lead.stage}" stage, indicating active engagement.`)

  return parts.join(' ')
}

/**
 * Calculate and persist fit score for a lead.
 */
export async function scoreLead(
  ctx: RequestContext,
  leadId: string,
  scoringConfigId?: string | null
): Promise<FitScoreRow> {
  const lead = await leadRepo.getLead(leadId, ctx.tenantId)
  if (!lead) throw new Error(`Lead not found: ${leadId}`)

  const calc = calculateFitScore(lead)

  return scoreRepo.persistFitScore({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    subjectType: 'lead',
    subjectId: leadId,
    score: calc.score,
    scoreVersion: SCORE_VERSION,
    scoringConfigId: scoringConfigId ?? null,
    dimensions: calc.dimensions as unknown as Record<string, unknown>,
    reasoning: calc.reasoning,
    modelUsed: MODEL_ID,
    confidence: calc.confidence,
  })
}
