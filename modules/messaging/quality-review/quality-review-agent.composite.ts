// ============================================================
// Phase 3B — Quality Review Agent Composite Score
// Weighted composite calculation and score banding.
// Pure functions. No I/O.
// ============================================================

import { SCORE_BANDS, RISK_SEVERITY } from './quality-review-agent.types'
import type { ScoreBreakdown, RiskFlag, CompositeScoreResult } from './quality-review-agent.types'

// ---- Weights ----

const WEIGHTS = {
  strategicFit:           0.20,
  complianceConfidence:   0.20,
  ctaClarity:             0.15,
  specificity:            0.15,
  toneFit:                0.10,
  differentiation:        0.10,
  subjectBodyConsistency: 0.05,
  readability:            0.05,
} as const

// ---- Score band thresholds ----
// 90–100: Excellent | 80–89: Strong | 70–79: Usable | 50–69: Needs Review | 0–49: Do Not Use

export function deriveScoreBand(score: number): string {
  if (score >= 90) return SCORE_BANDS.EXCELLENT
  if (score >= 80) return SCORE_BANDS.STRONG
  if (score >= 70) return SCORE_BANDS.USABLE
  if (score >= 50) return SCORE_BANDS.NEEDS_REVIEW
  return SCORE_BANDS.DO_NOT_USE
}

// ---- Composite calculation ----

export function calculateCompositeScore(
  scoreBreakdown: ScoreBreakdown,
  riskFlags:      RiskFlag[]
): CompositeScoreResult {
  // Weighted sum
  const rawScore =
    scoreBreakdown.strategicFit           * WEIGHTS.strategicFit           +
    scoreBreakdown.complianceConfidence   * WEIGHTS.complianceConfidence   +
    scoreBreakdown.ctaClarity             * WEIGHTS.ctaClarity             +
    scoreBreakdown.specificity            * WEIGHTS.specificity            +
    scoreBreakdown.toneFit                * WEIGHTS.toneFit                +
    scoreBreakdown.differentiation        * WEIGHTS.differentiation        +
    scoreBreakdown.subjectBodyConsistency * WEIGHTS.subjectBodyConsistency +
    scoreBreakdown.readability            * WEIGHTS.readability

  const prePenaltyScore = Math.round(rawScore)

  // Determine highest severity flag present
  const hasCritical = riskFlags.some(f => f.severity === RISK_SEVERITY.CRITICAL)
  const hasHigh     = riskFlags.some(f => f.severity === RISK_SEVERITY.HIGH)

  let penaltyApplied = 'none'
  let penaltyAmount  = 0
  let compositeScore = prePenaltyScore

  if (hasCritical) {
    // Critical cap takes precedence — medium/low penalties do NOT additionally apply
    penaltyApplied = 'critical_cap'
    if (compositeScore > 49) {
      penaltyAmount  = compositeScore - 49
      compositeScore = 49
    }
  } else if (hasHigh) {
    // High cap takes precedence — medium/low penalties do NOT additionally apply
    penaltyApplied = 'high_cap'
    if (compositeScore > 69) {
      penaltyAmount  = compositeScore - 69
      compositeScore = 69
    }
  } else {
    // No cap — additive medium and low deductions apply
    const mediumCount = riskFlags.filter(f => f.severity === RISK_SEVERITY.MEDIUM).length
    const lowCount    = riskFlags.filter(f => f.severity === RISK_SEVERITY.LOW).length
    penaltyAmount     = (mediumCount * 10) + (lowCount * 3)
    if (penaltyAmount > 0) {
      penaltyApplied = mediumCount > 0 ? 'medium_deduction' : 'low_deduction'
      compositeScore = Math.max(0, compositeScore - penaltyAmount)
    }
  }

  compositeScore = Math.max(0, Math.min(100, compositeScore))
  const scoreBand = deriveScoreBand(compositeScore)

  return {
    compositeScore,
    prePenaltyScore,
    scoreBand,
    penaltyApplied,
    penaltyAmount,
  }
}
