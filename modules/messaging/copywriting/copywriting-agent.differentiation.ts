// ============================================================
// Phase 3B — Differentiation Validator
// Pure function. No I/O. No side effects.
// Compares differentiation profiles across all generated
// version candidates to enforce meaningful variation.
// Does not decide which version is better.
// Does not score quality.
// ============================================================

import { COPY_ERROR_CODES, DIFF_DIMENSIONS } from './copywriting-agent.types'
import type {
  MessageVersionDraft,
  DifferentiationCheckResult,
  DifferentiationProfile,
} from './copywriting-agent.types'

// ---- How many dimensions must differ between any pair ----
const MINIMUM_DIFF_DIMENSIONS = 2

// ---- Compare two profiles and count differing dimensions ----

function countDifferingDimensions(
  a: DifferentiationProfile,
  b: DifferentiationProfile
): number {
  let count = 0
  if (a.openingPremise  !== b.openingPremise)  count++
  if (a.primaryAngle    !== b.primaryAngle)    count++
  if (a.trustAngle      !== b.trustAngle)      count++
  if (a.ctaFraming      !== b.ctaFraming)      count++
  if (a.length          !== b.length)          count++
  if (a.specificity     !== b.specificity)     count++
  if (a.structure       !== b.structure)       count++
  if (a.evidence        !== b.evidence)        count++
  return count
}

// ---- Enrich profiles with length field from body text ----

function enrichProfile(
  draft: MessageVersionDraft
): DifferentiationProfile {
  const body = draft.bodyText ?? ''
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length
  const length =
    wordCount <= 60  ? 'ultra_short' :
    wordCount <= 140 ? 'short' :
    wordCount <= 250 ? 'medium' :
    'long'

  return {
    ...draft.differentiationProfile,
    length,
    openingPremise: draft.differentiationProfile.openingPremise ?? 'observation',
    primaryAngle:   draft.differentiationProfile.primaryAngle   ?? draft.strategyAngle,
    trustAngle:     draft.differentiationProfile.trustAngle     ?? 'direct',
    ctaFraming:     draft.differentiationProfile.ctaFraming     ?? 'soft_ask',
    specificity:    draft.differentiationProfile.specificity    ?? 'lead_specific',
    structure:      draft.differentiationProfile.structure      ?? 'observation_led',
    evidence:       draft.differentiationProfile.evidence       ?? 'none',
  }
}

// ---- Main differentiation check ----

export function checkDifferentiation(
  drafts: MessageVersionDraft[]
): DifferentiationCheckResult {
  if (drafts.length < 2) {
    // Single version — trivially passes (no pairs to compare)
    return {
      passed:          true,
      pairwiseResults: {},
      failingPairs:    [],
    }
  }

  const enriched = drafts.map(d => ({ draft: d, profile: enrichProfile(d) }))
  const pairwiseResults: Record<string, { dimensionsDifferent: number; differencesMet: boolean }> = {}
  const failingPairs: string[] = []

  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      const a   = enriched[i]
      const b   = enriched[j]
      const key = `v${a.draft.versionNumber}_vs_v${b.draft.versionNumber}`

      const dimensionsDifferent = countDifferingDimensions(a.profile, b.profile)
      const differencesMet      = dimensionsDifferent >= MINIMUM_DIFF_DIMENSIONS

      pairwiseResults[key] = { dimensionsDifferent, differencesMet }

      if (!differencesMet) {
        failingPairs.push(key)
      }
    }
  }

  const passed = failingPairs.length === 0

  return {
    passed,
    pairwiseResults,
    failingPairs,
    error: passed ? undefined : COPY_ERROR_CODES.COPY_018,
  }
}

// ---- Find the weaker duplicate in a failing pair ----
// Returns the version number of the draft that should be retried.
// Heuristic: pick the one whose profile is most similar to OTHER versions.

export function identifyWeakerVersionInPair(
  drafts:      MessageVersionDraft[],
  failingPair: string
): number | null {
  const match = failingPair.match(/v(\d+)_vs_v(\d+)/)
  if (!match) return null

  const vA = parseInt(match[1], 10)
  const vB = parseInt(match[2], 10)

  const draftA = drafts.find(d => d.versionNumber === vA)
  const draftB = drafts.find(d => d.versionNumber === vB)
  if (!draftA || !draftB) return null

  // Count how many OTHER pairs each version fails in
  const otherDrafts = drafts.filter(d => d.versionNumber !== vA && d.versionNumber !== vB)

  let failsA = 0
  let failsB = 0

  for (const other of otherDrafts) {
    const profA = enrichProfile(draftA)
    const profB = enrichProfile(draftB)
    const profO = enrichProfile(other)

    if (countDifferingDimensions(profA, profO) < MINIMUM_DIFF_DIMENSIONS) failsA++
    if (countDifferingDimensions(profB, profO) < MINIMUM_DIFF_DIMENSIONS) failsB++
  }

  // Retry the one that fails more often (the weaker one)
  // If tied, retry the higher version number (later generated)
  if (failsA >= failsB) return vA
  return vB
}

export { DIFF_DIMENSIONS }
