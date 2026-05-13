import type { Database } from '@/types/database'

export type FitScoreRow = Database['public']['Tables']['fit_scores']['Row']
export type UrgencyScoreRow = Database['public']['Tables']['urgency_scores']['Row']
export type RecommendationRow = Database['public']['Tables']['agent_recommendations']['Row']
export type LeadRow = Database['public']['Tables']['leads']['Row']

// ---- Fit Score ----

export interface FitScoreDimensions {
  data_completeness: number  // 0-30: company, contact, value presence
  value_signal: number       // 0-30: estimated_value tiers
  source_quality: number     // 0-20: lead origin quality
  stage_signal: number       // 0-20: how far into pipeline
}

export interface FitScoreCalculation {
  score: number               // 0-100 integer
  dimensions: FitScoreDimensions
  reasoning: string
  confidence: number          // 0.0-1.0
  key_inputs: Record<string, unknown>
}

// ---- Urgency Score ----

export interface UrgencyScoreDimensions {
  stage_progress: number      // 0-25: pipeline advancement
  priority_signal: number     // 0-30: explicit priority field
  close_date_proximity: number // 0-30: days until expected close
  lead_age: number            // 0-15: time since creation
}

export interface UrgencyScoreCalculation {
  score: number
  dimensions: UrgencyScoreDimensions
  reasoning: string
  confidence: number
  key_inputs: Record<string, unknown>
}

// ---- Recommendation ----

export interface RecommendationRuleContext {
  lead: LeadRow
  fitScore: number
  urgencyScore: number
  fitDimensions: FitScoreDimensions
  urgencyDimensions: UrgencyScoreDimensions
}

export interface RecommendationResult {
  ruleId: string
  recommendation_type: 'next_action'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  body: string
  key_inputs_used: string[]
  reasoning: string
}

// ---- Pipeline ----

export interface ScoringPipelineResult {
  fitScore: FitScoreRow
  urgencyScore: UrgencyScoreRow
  recommendation: RecommendationRow
}
