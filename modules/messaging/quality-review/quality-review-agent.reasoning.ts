// ============================================================
// Phase 3B — Quality Review Agent Reasoning
// Generates human-readable scoring reasoning, strengths,
// weaknesses, review notes, and edit suggestions.
// Pure functions. No I/O.
// ============================================================

import { RISK_SEVERITY, SCORE_BANDS } from './quality-review-agent.types'
import type {
  ScoreBreakdown,
  ScoringReasoning,
  RiskFlag,
  QualityReviewDraft,
} from './quality-review-agent.types'

// ---- Scoring reasoning ----

export function generateScoringReasoning(
  scoreBreakdown: ScoreBreakdown,
  riskFlags:      RiskFlag[]
): ScoringReasoning {
  const critFlags  = riskFlags.filter(f => f.severity === RISK_SEVERITY.CRITICAL)
  const highFlags  = riskFlags.filter(f => f.severity === RISK_SEVERITY.HIGH)

  function reasonFor(dimension: string, score: number, specific?: string): string {
    if (score >= 85) return `${dimension} is strong (${score}). ${specific ?? ''}`
    if (score >= 70) return `${dimension} is adequate (${score}). ${specific ?? ''}`
    if (score >= 55) return `${dimension} needs improvement (${score}). ${specific ?? ''}`
    return `${dimension} is weak (${score}). ${specific ?? ''}`
  }

  const complianceRiskNote = critFlags.length > 0
    ? ` Critical flags: ${critFlags.map(f => f.code).join(', ')}.`
    : highFlags.length > 0
    ? ` High-risk flags: ${highFlags.map(f => f.code).join(', ')}.`
    : ''

  return {
    strategicFit:
      reasonFor('Strategic fit', scoreBreakdown.strategicFit,
        scoreBreakdown.strategicFit < 70 ? 'Required inclusions or CTA alignment may be missing.' : 'Required inclusions and offer angle are present.'),

    complianceConfidence:
      reasonFor('Compliance confidence', scoreBreakdown.complianceConfidence,
        complianceRiskNote || (scoreBreakdown.complianceConfidence < 70 ? 'Compliance notes or residual issues detected.' : 'No major compliance concerns.')),

    ctaClarity:
      reasonFor('CTA clarity', scoreBreakdown.ctaClarity,
        scoreBreakdown.ctaClarity < 50 ? 'CTA is absent or only vague phrases found.' : 'Clear call-to-action present.'),

    specificity:
      reasonFor('Specificity', scoreBreakdown.specificity,
        scoreBreakdown.specificity < 65 ? 'Personalization gaps reduce specificity.' : 'Good use of lead-specific context.'),

    toneFit:
      reasonFor('Tone fit', scoreBreakdown.toneFit,
        scoreBreakdown.toneFit < 65 ? 'AI/corporate language or inappropriate tone patterns detected.' : 'Tone aligns with strategy target.'),

    differentiation:
      reasonFor('Differentiation', scoreBreakdown.differentiation,
        scoreBreakdown.differentiation < 60 ? 'Version may be too similar to sibling versions.' : 'Version offers a distinct angle from siblings.'),

    subjectBodyConsistency:
      reasonFor('Subject/body consistency', scoreBreakdown.subjectBodyConsistency,
        scoreBreakdown.subjectBodyConsistency < 65 ? 'Subject line topics are not reflected in body content.' : 'Subject and body are topically consistent.'),

    readability:
      reasonFor('Readability', scoreBreakdown.readability,
        scoreBreakdown.readability < 65 ? 'Word count or paragraph structure needs adjustment.' : 'Word count and structure are appropriate.'),
  }
}

// ---- Strengths ----

export function generateStrengths(
  scoreBreakdown: ScoreBreakdown,
  riskFlags:      RiskFlag[]
): string[] {
  const strengths: string[] = []

  if (scoreBreakdown.strategicFit >= 80)
    strengths.push('Strong alignment with strategy goals and required content.')
  if (scoreBreakdown.complianceConfidence >= 80)
    strengths.push('High compliance confidence — no major compliance issues detected.')
  if (scoreBreakdown.ctaClarity >= 80)
    strengths.push('Clear, specific call-to-action.')
  if (scoreBreakdown.specificity >= 80)
    strengths.push('Good use of lead-specific personalization context.')
  if (scoreBreakdown.toneFit >= 80)
    strengths.push('Tone is well-matched to the strategy target.')
  if (scoreBreakdown.differentiation >= 80)
    strengths.push('Meaningfully differentiated from sibling versions.')
  if (scoreBreakdown.subjectBodyConsistency >= 80)
    strengths.push('Subject line and body are consistent and topically aligned.')
  if (scoreBreakdown.readability >= 80)
    strengths.push('Readability is strong — appropriate length and structure.')

  const criticalOrHighFlags = riskFlags.filter(
    f => f.severity === RISK_SEVERITY.CRITICAL || f.severity === RISK_SEVERITY.HIGH
  )
  if (criticalOrHighFlags.length === 0) {
    strengths.push('No compliance or content risk detected.')
  }

  return strengths
}

// ---- Weaknesses ----

export function generateWeaknesses(
  scoreBreakdown: ScoreBreakdown,
  riskFlags:      RiskFlag[]
): string[] {
  const weaknesses: string[] = []

  if (scoreBreakdown.strategicFit < 70)
    weaknesses.push('Strategic fit is below threshold — required inclusions or CTA may be missing.')
  if (scoreBreakdown.complianceConfidence < 70)
    weaknesses.push('Compliance confidence is low — review compliance notes and residual risk patterns.')
  if (scoreBreakdown.ctaClarity < 70)
    weaknesses.push('CTA clarity is weak — the call-to-action is absent or too vague.')
  if (scoreBreakdown.specificity < 70)
    weaknesses.push('Specificity is insufficient — personalization gaps reduce contextual relevance.')
  if (scoreBreakdown.toneFit < 70)
    weaknesses.push('Tone fit needs improvement — AI/corporate language or wrong tone pattern detected.')
  if (scoreBreakdown.differentiation < 70)
    weaknesses.push('Differentiation is low — version may be too similar to other versions.')
  if (scoreBreakdown.subjectBodyConsistency < 70)
    weaknesses.push('Subject/body consistency is weak — subject implies content not present in body.')
  if (scoreBreakdown.readability < 70)
    weaknesses.push('Readability needs attention — word count or paragraph structure is off.')

  // Add one entry per high/critical/medium risk flag (max 3 extra entries)
  const notableFlags = riskFlags.filter(
    f => f.severity === RISK_SEVERITY.CRITICAL ||
         f.severity === RISK_SEVERITY.HIGH ||
         f.severity === RISK_SEVERITY.MEDIUM
  ).slice(0, 3)

  for (const flag of notableFlags) {
    weaknesses.push(`${flag.code}: ${flag.message}`)
  }

  return weaknesses
}

// ---- Human review notes ----

export function generateHumanReviewNotes(
  draft:     Pick<QualityReviewDraft, 'compositeScore' | 'scoreBand' | 'rankPosition' | 'isRecommended' | 'versionLabel'>,
  strengths: string[],
  weaknesses:string[],
  riskFlags: RiskFlag[],
  minScore = 70
): string {
  const parts: string[] = []

  // Opening summary
  parts.push(`Version "${draft.versionLabel}" scored ${draft.compositeScore} (${draft.scoreBand}), ranked #${draft.rankPosition}.`)

  // Key strength
  if (strengths.length > 0) {
    parts.push(`Strength: ${strengths[0]}`)
  }

  // Critical/high risk
  const blocking = riskFlags.filter(
    f => f.severity === RISK_SEVERITY.CRITICAL || f.severity === RISK_SEVERITY.HIGH
  )
  if (blocking.length > 0) {
    parts.push(`Risk: ${blocking[0]?.code} — ${blocking[0]?.message}`)
  }

  // Recommendation status
  if (draft.isRecommended) {
    parts.push('This is the recommended version.')
  } else if (draft.scoreBand === SCORE_BANDS.DO_NOT_USE) {
    parts.push('This version is not suitable for use.')
  } else if (draft.compositeScore < minScore) {
    parts.push('This version does not meet the minimum quality threshold.')
  }

  return parts.join(' ')
}

// ---- Comparison summary ----

export function generateComparisonSummary(
  thisDraft:     Pick<QualityReviewDraft, 'versionLabel' | 'compositeScore' | 'rankPosition' | 'isRecommended'>,
  siblingDrafts: Array<Pick<QualityReviewDraft, 'versionLabel' | 'compositeScore' | 'rankPosition' | 'isRecommended'>>
): string {
  if (siblingDrafts.length === 0) {
    return `Version "${thisDraft.versionLabel}" is the only version reviewed (score: ${thisDraft.compositeScore}).`
  }

  const totalVersions = siblingDrafts.length + 1
  const recommended   = siblingDrafts.find(s => s.isRecommended) ?? (thisDraft.isRecommended ? thisDraft : null)

  const parts: string[] = []
  parts.push(`Version "${thisDraft.versionLabel}" ranked #${thisDraft.rankPosition} of ${totalVersions} (score: ${thisDraft.compositeScore}).`)

  if (thisDraft.isRecommended) {
    parts.push('This is the recommended version.')
  } else if (recommended) {
    parts.push(`"${recommended.versionLabel}" is recommended (score: ${recommended.compositeScore}).`)
  } else {
    parts.push('No version was recommended in this review.')
  }

  return parts.join(' ')
}

// ---- Recommended edits ----

export function generateRecommendedEdits(
  scoreBreakdown: ScoreBreakdown,
  riskFlags:      RiskFlag[],
  strategy:       { cta: string; proofPoint: string | null; industrySegment: string | null }
): string[] {
  const edits: string[] = []

  // Max 3 edits, based on weakest dimensions or risk flags

  if (scoreBreakdown.ctaClarity < 70) {
    edits.push('Consider making the CTA more specific — use a direct ask tied to the next step.')
  }

  if (scoreBreakdown.specificity < 70) {
    edits.push(
      strategy.industrySegment
        ? `The opening could reference the ${strategy.industrySegment} industry context more directly.`
        : 'The opening could reference the industry or business context more directly.'
    )
  }

  if (scoreBreakdown.complianceConfidence < 70 || riskFlags.some(f => f.severity === RISK_SEVERITY.CRITICAL)) {
    edits.push('Review compliance flags and remove any claims or phrases that may not be supported.')
  }

  if (edits.length < 3 && scoreBreakdown.strategicFit < 70 && strategy.cta) {
    edits.push(`Ensure the body text includes or closely mirrors the strategy CTA: "${strategy.cta.split(' ').slice(0, 5).join(' ')}…"`)
  }

  if (edits.length < 3 && scoreBreakdown.toneFit < 70) {
    edits.push('Remove AI/corporate language patterns and ensure the tone feels direct and human.')
  }

  if (edits.length < 3 && scoreBreakdown.subjectBodyConsistency < 70) {
    edits.push('Align the opening body text more closely with the subject line topic.')
  }

  return edits.slice(0, 3)
}
