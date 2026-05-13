import type { RequestContext } from '@/types/context'
import type { LeadRow, UrgencyScoreCalculation, UrgencyScoreDimensions, UrgencyScoreRow } from '@/modules/intelligence/types'
import * as scoreRepo from '@/modules/intelligence/repositories/score.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'

const MODEL_ID = 'simple-rules-v1'
const SCORE_VERSION = 'v1'

const STAGE_PROGRESS: Record<string, number> = {
  new: 5,
  contacted: 10,
  statement_review: 15,
  proposal: 20,
  negotiation: 25,
  closed_won: 0,
  closed_lost: 0,
}

const PRIORITY_SIGNAL: Record<string, number> = {
  critical: 30,
  high: 22,
  medium: 13,
  low: 5,
}

/**
 * Calculate urgency score from lead data.
 * Pure function — no side effects, no DB access.
 *
 * Urgency = how important it is to act on this lead RIGHT NOW.
 * Dimensions:
 *   stage_progress       (0-25): how far into the pipeline
 *   priority_signal      (0-30): explicit priority set on lead
 *   close_date_proximity (0-30): days until expected close date
 *   lead_age             (0-15): time since creation (stale = needs attention)
 */
export function calculateUrgencyScore(lead: LeadRow): UrgencyScoreCalculation {
  const now = Date.now()

  const dimensions: UrgencyScoreDimensions = {
    stage_progress: STAGE_PROGRESS[lead.stage] ?? 5,
    priority_signal: PRIORITY_SIGNAL[lead.priority] ?? 13,
    close_date_proximity: 0,
    lead_age: 0,
  }

  // close_date_proximity (max 30)
  if (lead.expected_close_date) {
    const daysUntil = Math.floor(
      (new Date(lead.expected_close_date).getTime() - now) / 86_400_000
    )
    if (daysUntil <= 0) dimensions.close_date_proximity = 30      // overdue
    else if (daysUntil <= 14) dimensions.close_date_proximity = 28
    else if (daysUntil <= 30) dimensions.close_date_proximity = 22
    else if (daysUntil <= 60) dimensions.close_date_proximity = 16
    else if (daysUntil <= 90) dimensions.close_date_proximity = 10
    else dimensions.close_date_proximity = 5
  }

  // lead_age (max 15) — older = more urgent to action
  const ageInDays = Math.floor(
    (now - new Date(lead.created_at).getTime()) / 86_400_000
  )
  if (ageInDays >= 90) dimensions.lead_age = 15
  else if (ageInDays >= 60) dimensions.lead_age = 11
  else if (ageInDays >= 30) dimensions.lead_age = 7
  else if (ageInDays >= 14) dimensions.lead_age = 4
  else dimensions.lead_age = 1

  const score = Math.min(
    100,
    dimensions.stage_progress +
    dimensions.priority_signal +
    dimensions.close_date_proximity +
    dimensions.lead_age
  )

  // Confidence: higher when we have a close date and explicit priority
  const hasCloseDate = !!lead.expected_close_date
  const hasExplicitPriority = lead.priority !== 'medium'  // medium is the default
  const confidence = hasCloseDate && hasExplicitPriority ? 0.90
    : hasCloseDate ? 0.75
    : hasExplicitPriority ? 0.65
    : 0.45

  const reasoning = buildUrgencyReasoning(lead, dimensions, score, ageInDays)

  const key_inputs: Record<string, unknown> = {
    stage: lead.stage,
    priority: lead.priority,
    expected_close_date: lead.expected_close_date,
    age_in_days: ageInDays,
  }

  return { score, dimensions, reasoning, confidence, key_inputs }
}

function buildUrgencyReasoning(
  lead: LeadRow,
  dim: UrgencyScoreDimensions,
  score: number,
  ageInDays: number
): string {
  const parts: string[] = [`Urgency score: ${score}/100.`]

  if (dim.stage_progress >= 20)
    parts.push(`Advanced stage (${lead.stage}) indicates active deal progression.`)
  else
    parts.push(`Early stage (${lead.stage}).`)

  if (dim.priority_signal >= 22)
    parts.push(`Priority is ${lead.priority} — marked as needing immediate attention.`)

  if (dim.close_date_proximity >= 22)
    parts.push('Close date is approaching — action required soon.')
  else if (dim.close_date_proximity === 0)
    parts.push('No expected close date set.')

  if (ageInDays >= 60)
    parts.push(`Lead is ${ageInDays} days old with no close — needs attention to prevent stalling.`)

  return parts.join(' ')
}

/**
 * Calculate and persist urgency score for a lead.
 */
export async function scoreLead(
  ctx: RequestContext,
  leadId: string,
  scoringConfigId?: string | null
): Promise<UrgencyScoreRow> {
  const lead = await leadRepo.getLead(leadId, ctx.tenantId)
  if (!lead) throw new Error(`Lead not found: ${leadId}`)

  const calc = calculateUrgencyScore(lead)

  return scoreRepo.persistUrgencyScore({
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
