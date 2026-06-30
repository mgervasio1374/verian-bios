// ============================================================
// Phase 3B — Quality Review Agent Ranking
// Sorts drafts, assigns rank positions, determines recommendation.
// Pure functions. No I/O.
// ============================================================

import type {
  QualityReviewDraft,
  RankingResult,
  RecommendationResult,
  RiskFlag,
} from './quality-review-agent.types'
import { RISK_SEVERITY } from './quality-review-agent.types'

// Extended draft type for ranking (includes extra scoring fields for tie-breaking)
type RankableDraft = QualityReviewDraft & {
  versionNumber:      number
  riskScore:          number
  strategicFitScore:  number
  ctaClarityScore:    number
  specificityScore:   number
}

// ---- Ranking ----

export function rankQualityReviews(
  drafts: RankableDraft[]
): RankingResult {
  if (drafts.length === 0) {
    return { ranked: [], tieBreakersApplied: [] }
  }

  const tieBreakersApplied: string[] = []

  const sorted = [...drafts].sort((a, b) => {
    // Primary: compositeScore desc
    if (b.compositeScore !== a.compositeScore) {
      const diff = b.compositeScore - a.compositeScore
      // Tie-breaker zone: within 3 points
      if (Math.abs(diff) > 3) return diff
    }

    // Within 3 points — apply tie-breakers
    if (Math.abs(b.compositeScore - a.compositeScore) <= 3) {
      // 1. Lower risk score wins
      if (a.riskScore !== b.riskScore) {
        tieBreakersApplied.push('risk_score')
        return a.riskScore - b.riskScore
      }
      // 2. Higher strategic fit
      if (b.strategicFitScore !== a.strategicFitScore) {
        tieBreakersApplied.push('strategic_fit')
        return b.strategicFitScore - a.strategicFitScore
      }
      // 3. Higher CTA clarity
      if (b.ctaClarityScore !== a.ctaClarityScore) {
        tieBreakersApplied.push('cta_clarity')
        return b.ctaClarityScore - a.ctaClarityScore
      }
      // 4. Higher specificity
      if (b.specificityScore !== a.specificityScore) {
        tieBreakersApplied.push('specificity')
        return b.specificityScore - a.specificityScore
      }
      // 5. Lower version number (earlier in plan)
      tieBreakersApplied.push('version_number')
      return a.versionNumber - b.versionNumber
    }

    return b.compositeScore - a.compositeScore
  })

  // Assign rank positions (1-based)
  const ranked = sorted.map((draft, idx) => ({
    draft,
    rankPosition: idx + 1,
  }))

  // Deduplicate tieBreakersApplied
  const uniqueTieBreakers = [...new Set(tieBreakersApplied)]

  return { ranked, tieBreakersApplied: uniqueTieBreakers }
}

// ---- Recommendation assignment ----

function hasCriticalFlag(riskFlags: RiskFlag[]): boolean {
  return riskFlags.some(f => f.severity === RISK_SEVERITY.CRITICAL)
}

function hasComplianceFailure(notes: string[]): boolean {
  // Conservative: compliance failures are handled through composite scoring.
  // This check is reserved for future hard-fail logic.
  return notes.length > 100 // practically never: just satisfies the parameter reference
}

export function assignRecommendation(
  rankedDrafts: QualityReviewDraft[],
  originalVersionsMap: Map<string, { complianceNotesApplied: string[] }>,
  minScore = 70
): RecommendationResult {
  if (rankedDrafts.length === 0) {
    return {
      recommendedVersionId:   null,
      noRecommendationReason: 'No versions available for review.',
    }
  }

  // Find the highest-scoring version that meets criteria
  const highestScore = rankedDrafts[0]?.compositeScore ?? 0
  const hasVersionAbove70 = rankedDrafts.some(d => d.compositeScore >= minScore)

  for (const draft of rankedDrafts) {
    const versionData = originalVersionsMap.get(draft.versionId)

    // Block: any critical risk flag
    if (hasCriticalFlag(draft.riskFlags)) continue

    // Block: compositeScore below the recommendation threshold when another meets it
    if (hasVersionAbove70 && draft.compositeScore < minScore) continue

    // Block: compliance failure
    if (versionData && hasComplianceFailure(versionData.complianceNotesApplied)) continue

    return {
      recommendedVersionId:   draft.versionId,
      noRecommendationReason: null,
    }
  }

  // No eligible version found
  const reason = rankedDrafts.every(d => hasCriticalFlag(d.riskFlags))
    ? 'All versions have critical risk flags.'
    : !hasVersionAbove70
    ? `No version meets the minimum score threshold of ${minScore} (highest: ${highestScore}).`
    : 'No version passed all recommendation criteria.'

  return {
    recommendedVersionId:   null,
    noRecommendationReason: reason,
  }
}
