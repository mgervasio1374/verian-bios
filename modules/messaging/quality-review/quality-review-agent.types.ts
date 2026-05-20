// ============================================================
// Phase 3B — Quality Review Agent Types
// All interfaces, constants, and type aliases for the
// Quality Review Agent. Evaluation-only — no LLMs, no sends,
// no approval, no copy modification.
// ============================================================

import { GLOBAL_BANNED_PHRASES } from '@/modules/messaging/copywriting/copywriting-agent.types'

// ---- Error codes ----

export const QRA_ERROR_CODES = {
  QRA_001: 'QRA_001',  // Strategy not found
  QRA_002: 'QRA_002',  // No message versions found
  QRA_003: 'QRA_003',  // Global agent pause active
  QRA_004: 'QRA_004',  // Phase 3B not enabled
  QRA_005: 'QRA_005',  // Version already has non-superseded review (and force=false)
  QRA_006: 'QRA_006',  // Subject line empty
  QRA_007: 'QRA_007',  // Body text empty
  QRA_008: 'QRA_008',  // body_html is populated (v1 invariant violated)
  QRA_009: 'QRA_009',  // Version belongs to different strategy
  QRA_010: 'QRA_010',  // Version belongs to different tenant
  QRA_011: 'QRA_011',  // Strategy has blocking invalid_reasons
  QRA_012: 'QRA_012',  // Structural or compliance failure (body < 20 chars)
  QRA_013: 'QRA_013',  // Version approval_status is superseded
} as const
export type QRAErrorCode = typeof QRA_ERROR_CODES[keyof typeof QRA_ERROR_CODES]

// ---- Risk flag codes ----

export const RISK_FLAG_CODES = {
  RFL_001: 'RFL-001',  // Banned phrase detected
  RFL_002: 'RFL-002',  // Urgency language detected
  RFL_003: 'RFL-003',  // Guaranteed outcome language
  RFL_004: 'RFL-004',  // Dollar amount claim without confirmed savings offer
  RFL_005: 'RFL-005',  // Percentage savings claim without confirmed savings
  RFL_006: 'RFL-006',  // Cold/inbound context mismatch
  RFL_007: 'RFL-007',  // Partner name without confirmed membership
  RFL_008: 'RFL-008',  // body_html populated (always high)
  RFL_009: 'RFL-009',  // Review-complete language without proof
  RFL_010: 'RFL-010',  // Invented dollar finding in statement review
  RFL_011: 'RFL-011',  // Conversation reference without conversation notes
  RFL_012: 'RFL-012',  // Specific numeric claim not in strategy context
  RFL_013: 'RFL-013',  // Low tone fit detected
  RFL_014: 'RFL-014',  // AI/corporate language detected
  RFL_015: 'RFL-015',  // Guilt language in follow-up
  RFL_016: 'RFL-016',  // Vague or missing CTA
  RFL_017: 'RFL-017',  // Subject/body mismatch
  RFL_018: 'RFL-018',  // Generic subject line
  RFL_019: 'RFL-019',  // Subject/body topical disconnect
  RFL_020: 'RFL-020',  // Low differentiation score
  RFL_021: 'RFL-021',  // Near-duplicate version detected
  RFL_022: 'RFL-022',  // Company name overuse
  RFL_023: 'RFL-023',  // Missing personalization fields
  RFL_024: 'RFL-024',  // Strategy angle repeated from prior context
  RFL_025: 'RFL-025',  // Relationship risk language in follow-up
} as const

// ---- Score bands ----

export const SCORE_BANDS = {
  EXCELLENT:    'excellent',
  STRONG:       'strong',
  USABLE:       'usable',
  NEEDS_REVIEW: 'needs_review',
  DO_NOT_USE:   'do_not_use',
} as const
export type ScoreBand = typeof SCORE_BANDS[keyof typeof SCORE_BANDS]

// ---- Risk severity ----

export const RISK_SEVERITY = {
  CRITICAL: 'critical',
  HIGH:     'high',
  MEDIUM:   'medium',
  LOW:      'low',
} as const
export type RiskSeverity = typeof RISK_SEVERITY[keyof typeof RISK_SEVERITY]

// ---- QRA agent step names ----

export const QRA_AGENT_STEPS = {
  LOAD_STRATEGY:              'load_strategy',
  LOAD_VERSIONS:              'load_versions',
  GATE_CHECK:                 'gate_check',
  LOAD_SKILL_DEFINITIONS:     'load_skill_definitions',
  LOAD_PRIOR_CONTEXT:         'load_prior_context',
  SCORE_VERSIONS:             'score_versions',
  GENERATE_RISK_FLAGS:        'generate_risk_flags',
  CALCULATE_COMPOSITE_SCORES: 'calculate_composite_scores',
  RANK_VERSIONS:              'rank_versions',
  GENERATE_REASONING:         'generate_reasoning',
  PERSISTENCE:                'persistence',
  RESULT_RETURNED:            'result_returned',
} as const

// ---- QRA-owned pattern constants ----

export const QRA_BANNED_PHRASES: readonly string[] = GLOBAL_BANNED_PHRASES

export const QRA_URGENCY_PATTERNS: readonly string[] = [
  'limited time',
  'this offer expires',
  "don't miss out",
  'act now',
  'expires soon',
  'last chance',
] as const

export const QRA_GUARANTEED_OUTCOME_PATTERNS: readonly string[] = [
  'guaranteed savings',
  'guaranteed results',
  'we guarantee',
  'you will save',
  'certain to reduce',
  'definitely save',
  'will definitely',
] as const

export const QRA_INBOUND_LANGUAGE_PATTERNS: readonly string[] = [
  'thanks for reaching out',
  'thank you for reaching out',
  'got your inquiry',
  'received your inquiry',
  'received your message',
] as const

export const QRA_COLD_DISCOVERY_PATTERNS: readonly string[] = [
  'i came across your business',
  'i stumbled upon your company',
  'i came across',
  'i stumbled upon',
  'found your business',
  'discovered your company',
] as const

export const QRA_PARTNER_NAME_PATTERNS: readonly string[] = [
  'certainpath',
  'bcsg',
  'blue collar success group',
] as const

export const QRA_EXCLUSIVITY_CLAIM_PATTERNS: readonly string[] = [
  'exclusive partner',
  'preferred partner',
  'official partner of',
  'endorsed by',
  'authorized partner',
] as const

export const QRA_REVIEW_COMPLETE_PATTERNS: readonly string[] = [
  'review complete',
  'review is complete',
  'statement review complete',
  'completed the review',
] as const

export const QRA_AI_CORPORATE_PATTERNS: readonly string[] = [
  'i hope this email finds you well',
  'i hope you',
  'i wanted to circle back',
  'per my previous email',
  'as per my last',
  'as mentioned previously',
  'as i mentioned',
  "i'm reaching out because",
  "i'm following up on",
  "please don't hesitate",
  'i look forward to hearing',
  'feel free to reach out',
  'thank you for your time and consideration',
] as const

export const QRA_GUILT_LANGUAGE_PATTERNS: readonly string[] = [
  "i haven't heard from you",
  'i was hoping to hear back',
  'you must be busy',
  "i don't want to bother you",
  "didn't fall through the cracks",
] as const

export const QRA_CONVERSATION_REFERENCE_PATTERNS: readonly string[] = [
  'as we discussed',
  'based on our conversation',
  'after our call',
  'you mentioned',
] as const

export const QRA_RELATIONSHIP_RISK_PATTERNS: readonly string[] = [
  'per my previous email',
  'as per my last',
  'per our previous conversation',
  'as i mentioned before',
] as const

export const QRA_FINDINGS_LANGUAGE: readonly string[] = [
  'what we found in your statement',
  'the review found',
  'our analysis found',
  'your statement shows',
] as const

// ---- Inbound vs cold source sets ----

export const QRA_INBOUND_SOURCES: ReadonlySet<string> = new Set([
  'website',
  'tawk.to',
  'calendly',
  'app.321swipe.com',
  'upload.321swipe.com',
])

export const QRA_COLD_SOURCES: ReadonlySet<string> = new Set([
  'manual',
  'import',
  'cold_outreach',
  'referral',
])

// ---- Length targets by message type (word count ranges) ----

export const QRA_LENGTH_TARGETS: Record<string, { min: number; max: number }> = {
  cold_outreach:                       { min: 130, max: 220 },
  new_inquiry_response:                { min: 100, max: 170 },
  statement_submitted_confirmation:    { min: 70,  max: 120 },
  statement_review_follow_up:          { min: 140, max: 240 },
  statement_not_submitted_follow_up:   { min: 70,  max: 140 },
  proposal_follow_up:                  { min: 60,  max: 100 },
  no_response_follow_up:               { min: 60,  max: 100 },
  re_engagement:                       { min: 80,  max: 130 },
  partner_member_specific_campaign:    { min: 100, max: 170 },
  event_expo_follow_up:                { min: 100, max: 170 },
  referral_request:                    { min: 80,  max: 130 },
  customer_nurture:                    { min: 100, max: 170 },
}

// ---- Follow-up message types ----

export const QRA_FOLLOW_UP_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'statement_review_follow_up',
  'statement_not_submitted_follow_up',
  'proposal_follow_up',
  'no_response_follow_up',
  're_engagement',
  'event_expo_follow_up',
])

// ============================================================
// Interfaces
// ============================================================

export interface QualityReviewError {
  code:         string
  message:      string
  blocking:     boolean
  suggestedFix: string
}

export interface RiskFlag {
  code:        string
  severity:    string
  message:     string
  triggeredBy: string
}

export interface RiskFlagResult {
  flags:           RiskFlag[]
  complianceFlags: RiskFlag[]
  riskScore:       number
}

export interface ScoreBreakdown {
  strategicFit:            number
  complianceConfidence:    number
  ctaClarity:              number
  specificity:             number
  toneFit:                 number
  differentiation:         number
  subjectBodyConsistency:  number
  readability:             number
}

export interface ScoringReasoning {
  strategicFit:           string
  complianceConfidence:   string
  ctaClarity:             string
  specificity:            string
  toneFit:                string
  differentiation:        string
  subjectBodyConsistency: string
  readability:            string
}

export interface DimensionScoreResult {
  score:         number
  reasoning:     string
  suggestedFlags:string[]
}

export interface CompositeScoreResult {
  compositeScore:   number
  prePenaltyScore:  number
  scoreBand:        string
  penaltyApplied:   string
  penaltyAmount:    number
}

// In-memory draft before persistence
export interface QualityReviewDraft {
  tenantId:                  string
  strategyId:                string
  versionId:                 string
  leadId:                    string
  companyId:                 string | null
  campaignId:                string | null
  agentRunId:                string | null
  messageType:               string
  versionLabel:              string
  strategyAngle:             string
  compositeScore:            number
  scoreBand:                 string
  rankPosition:              number
  isRecommended:             boolean
  strategicFitScore:         number
  complianceConfidenceScore: number
  ctaClarityScore:           number
  specificityScore:          number
  toneFitScore:              number
  differentiationScore:      number
  subjectBodyConsistencyScore:number
  readabilityScore:          number
  riskScore:                 number
  scoreBreakdown:            ScoreBreakdown
  scoringReasoning:          ScoringReasoning
  strengths:                 string[]
  weaknesses:                string[]
  riskFlags:                 RiskFlag[]
  complianceFlags:           RiskFlag[]
  humanReviewNotes:          string | null
  recommendedEdits:          string[]
  comparedAgainstVersionIds: string[]
  comparisonSummary:         string
  supersededAt:              string | null
  createdByAgent:            string
}

// Persisted quality review
export interface QualityReview extends QualityReviewDraft {
  id:        string
  createdAt: string
  updatedAt: string
}

// Service result discriminated union
export type QualityReviewResult =
  | {
      success:     true
      reviews:     QualityReview[]
      recommended: QualityReview | null
      agentRunId:  string
    }
  | {
      success:     false
      error:       QualityReviewError
      agentRunId:  string | null
    }
  | {
      success:     'partial'
      reviews:     QualityReview[]
      excluded:    Array<{ versionId: string; reason: string }>
      recommended: QualityReview | null
      agentRunId:  string
    }

export interface MessageTypeRuleResult {
  adjustedScores: Partial<ScoreBreakdown>
  suggestedFlags: string[]
  reviewNotes:    string[]
}

export interface RankingResult {
  ranked:               Array<{ draft: QualityReviewDraft; rankPosition: number }>
  tieBreakersApplied:   string[]
}

export interface RecommendationResult {
  recommendedVersionId:     string | null
  noRecommendationReason:   string | null
}
