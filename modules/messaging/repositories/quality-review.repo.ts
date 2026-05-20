// ============================================================
// Phase 3B — Quality Review Repository
// All database operations for quality_reviews table.
// No business logic — database access only.
// Uses local row type until migration is applied and
// types/database.ts is regenerated.
// ============================================================

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  QualityReview,
  QualityReviewDraft,
  ScoreBreakdown,
  ScoringReasoning,
  RiskFlag,
} from '@/modules/messaging/quality-review/quality-review-agent.types'

// ---- Local row type (mirrors migration schema) ----

interface QualityReviewRow {
  id:                               string
  tenant_id:                        string
  strategy_id:                      string
  version_id:                       string
  lead_id:                          string
  company_id:                       string | null
  campaign_id:                      string | null
  agent_run_id:                     string | null
  message_type:                     string
  version_label:                    string
  strategy_angle:                   string
  composite_score:                  number
  score_band:                       string
  rank_position:                    number
  is_recommended:                   boolean
  strategic_fit_score:              number
  compliance_confidence_score:      number
  cta_clarity_score:                number
  specificity_score:                number
  tone_fit_score:                   number
  differentiation_score:            number
  subject_body_consistency_score:   number
  readability_score:                number
  risk_score:                       number
  score_breakdown:                  Record<string, unknown>
  scoring_reasoning:                Record<string, unknown>
  strengths:                        string[]
  weaknesses:                       string[]
  risk_flags:                       unknown[]
  compliance_flags:                 unknown[]
  human_review_notes:               string | null
  recommended_edits:                string[]
  compared_against_version_ids:     string[]
  comparison_summary:               string
  superseded_at:                    string | null
  created_by_agent:                 string
  created_at:                       string
  updated_at:                       string
}

// ---- Insert type ----

export type CreateQualityReviewInput = Omit<
  QualityReviewDraft,
  never  // all draft fields are insertable
>

// ---- Row → domain model ----

function rowToQualityReview(row: QualityReviewRow): QualityReview {
  return {
    id:                           row.id,
    tenantId:                     row.tenant_id,
    strategyId:                   row.strategy_id,
    versionId:                    row.version_id,
    leadId:                       row.lead_id,
    companyId:                    row.company_id,
    campaignId:                   row.campaign_id,
    agentRunId:                   row.agent_run_id,
    messageType:                  row.message_type,
    versionLabel:                 row.version_label,
    strategyAngle:                row.strategy_angle,
    compositeScore:               row.composite_score,
    scoreBand:                    row.score_band,
    rankPosition:                 row.rank_position,
    isRecommended:                row.is_recommended,
    strategicFitScore:            row.strategic_fit_score,
    complianceConfidenceScore:    row.compliance_confidence_score,
    ctaClarityScore:              row.cta_clarity_score,
    specificityScore:             row.specificity_score,
    toneFitScore:                 row.tone_fit_score,
    differentiationScore:         row.differentiation_score,
    subjectBodyConsistencyScore:  row.subject_body_consistency_score,
    readabilityScore:             row.readability_score,
    riskScore:                    row.risk_score,
    scoreBreakdown:               row.score_breakdown as unknown as ScoreBreakdown,
    scoringReasoning:             row.scoring_reasoning as unknown as ScoringReasoning,
    strengths:                    row.strengths ?? [],
    weaknesses:                   row.weaknesses ?? [],
    riskFlags:                    (row.risk_flags ?? []) as RiskFlag[],
    complianceFlags:              (row.compliance_flags ?? []) as RiskFlag[],
    humanReviewNotes:             row.human_review_notes,
    recommendedEdits:             row.recommended_edits ?? [],
    comparedAgainstVersionIds:    row.compared_against_version_ids ?? [],
    comparisonSummary:            row.comparison_summary ?? '',
    supersededAt:                 row.superseded_at,
    createdByAgent:               row.created_by_agent,
    createdAt:                    row.created_at,
    updatedAt:                    row.updated_at,
  }
}

// ---- Repository functions ----

export async function insertQualityReview(
  input: CreateQualityReviewInput
): Promise<QualityReview> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('quality_reviews')
    .insert({
      tenant_id:                      input.tenantId,
      strategy_id:                    input.strategyId,
      version_id:                     input.versionId,
      lead_id:                        input.leadId,
      company_id:                     input.companyId ?? null,
      campaign_id:                    input.campaignId ?? null,
      agent_run_id:                   input.agentRunId ?? null,
      message_type:                   input.messageType,
      version_label:                  input.versionLabel,
      strategy_angle:                 input.strategyAngle,
      composite_score:                input.compositeScore,
      score_band:                     input.scoreBand,
      rank_position:                  input.rankPosition,
      is_recommended:                 input.isRecommended,
      strategic_fit_score:            input.strategicFitScore,
      compliance_confidence_score:    input.complianceConfidenceScore,
      cta_clarity_score:              input.ctaClarityScore,
      specificity_score:              input.specificityScore,
      tone_fit_score:                 input.toneFitScore,
      differentiation_score:          input.differentiationScore,
      subject_body_consistency_score: input.subjectBodyConsistencyScore,
      readability_score:              input.readabilityScore,
      risk_score:                     input.riskScore,
      score_breakdown:                input.scoreBreakdown as unknown as Record<string, unknown>,
      scoring_reasoning:              input.scoringReasoning as unknown as Record<string, unknown>,
      strengths:                      input.strengths as unknown as string[],
      weaknesses:                     input.weaknesses as unknown as string[],
      risk_flags:                     input.riskFlags as unknown as unknown[],
      compliance_flags:               input.complianceFlags as unknown as unknown[],
      human_review_notes:             input.humanReviewNotes ?? null,
      recommended_edits:              input.recommendedEdits as unknown as string[],
      compared_against_version_ids:   input.comparedAgainstVersionIds as unknown as string[],
      comparison_summary:             input.comparisonSummary,
      superseded_at:                  input.supersededAt ?? null,
      created_by_agent:               input.createdByAgent,
    } as never)
    .select()
    .single()

  if (error) throw new Error(`insertQualityReview: ${error.message}`)
  return rowToQualityReview(data as unknown as QualityReviewRow)
}

export async function insertManyQualityReviews(
  inputs: CreateQualityReviewInput[]
): Promise<QualityReview[]> {
  const results: QualityReview[] = []
  for (const input of inputs) {
    results.push(await insertQualityReview(input))
  }
  return results
}

export async function getQualityReviewById(
  id:       string,
  tenantId: string
): Promise<QualityReview | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('quality_reviews')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data ? rowToQualityReview(data as unknown as QualityReviewRow) : null
}

export async function listQualityReviewsForStrategy(
  strategyId: string,
  tenantId:   string
): Promise<QualityReview[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('quality_reviews')
    .select('*')
    .eq('strategy_id', strategyId)
    .eq('tenant_id', tenantId)
    .order('rank_position', { ascending: true })

  if (error) throw new Error(`listQualityReviewsForStrategy: ${error.message}`)
  return (data ?? []).map(r => rowToQualityReview(r as unknown as QualityReviewRow))
}

export async function listQualityReviewsForVersion(
  versionId: string,
  tenantId:  string
): Promise<QualityReview[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('quality_reviews')
    .select('*')
    .eq('version_id', versionId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listQualityReviewsForVersion: ${error.message}`)
  return (data ?? []).map(r => rowToQualityReview(r as unknown as QualityReviewRow))
}

export async function getRecommendedForStrategy(
  strategyId: string,
  tenantId:   string
): Promise<QualityReview | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('quality_reviews')
    .select('*')
    .eq('strategy_id', strategyId)
    .eq('tenant_id', tenantId)
    .eq('is_recommended', true)
    .is('superseded_at', null)
    .maybeSingle()
  return data ? rowToQualityReview(data as unknown as QualityReviewRow) : null
}

export async function supersedeForStrategy(
  strategyId: string,
  tenantId:   string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('quality_reviews')
    .update({ superseded_at: new Date().toISOString() } as never)
    .eq('strategy_id', strategyId)
    .eq('tenant_id', tenantId)
    .is('superseded_at', null)
}

export async function qualityReviewExistsForVersion(
  versionId: string,
  tenantId:  string
): Promise<boolean> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('quality_reviews')
    .select('id')
    .eq('version_id', versionId)
    .eq('tenant_id', tenantId)
    .is('superseded_at', null)
    .limit(1)
    .maybeSingle()
  return !!data
}
