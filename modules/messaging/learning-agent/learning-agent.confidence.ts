// ============================================================
// Phase 3B — Learning Agent Confidence Helpers
// Pure functions only — no I/O, no async, no side effects.
// ============================================================

import {
  LA_CONFIDENCE,
  LA_SIGNAL_NAMES,
  STANDARD_THRESHOLDS,
  ENGAGEMENT_THRESHOLDS,
} from './learning-agent.types'
import type { LaConfidence, LaSignalName } from './learning-agent.types'

// ---- classifyConfidence ----
// Returns 'insufficient' | 'low' | 'moderate' | 'high' based on n vs thresholds.

export function classifyConfidence(
  n:          number,
  thresholds: { insufficient: number; low: number; moderate: number }
): LaConfidence {
  if (n < thresholds.insufficient) return LA_CONFIDENCE.INSUFFICIENT
  if (n < thresholds.low)          return LA_CONFIDENCE.LOW
  if (n < thresholds.moderate)     return LA_CONFIDENCE.MODERATE
  return LA_CONFIDENCE.HIGH
}

// ---- calculateRate ----
// Returns null when denominator = 0; else numerator / denominator.

export function calculateRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return numerator / denominator
}

// ---- isEngagementSignal ----
// Returns true for open_rate and click_rate — these use ENGAGEMENT_THRESHOLDS.

export function isEngagementSignal(signalName: LaSignalName): boolean {
  return signalName === LA_SIGNAL_NAMES.OPEN_RATE || signalName === LA_SIGNAL_NAMES.CLICK_RATE
}

// ---- getThresholds ----
// Returns the correct threshold set for a given signal name.

export function getThresholds(
  signalName: LaSignalName
): typeof STANDARD_THRESHOLDS | typeof ENGAGEMENT_THRESHOLDS {
  return isEngagementSignal(signalName) ? ENGAGEMENT_THRESHOLDS : STANDARD_THRESHOLDS
}
