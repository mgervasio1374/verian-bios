// Pure deterministic grader for a StatementAnalysis snapshot — the testable core
// of the Phase 0 statement review agent. Scores an analysis for plausibility and
// internal consistency and flags outliers. No I/O, no side effects, fully
// unit-testable like cost-bridge.ts. An LLM-based review is a later enhancement.

import type { StatementAnalysis } from '@/lib/statement/analysis'
import { deriveCostSavingsBridge } from '@/lib/statement/cost-bridge'

// ---- Thresholds (named exported constants — no magic numbers in the logic) ----

export const EFFECTIVE_RATE_MIN = 0.005   // 0.5 %
export const EFFECTIVE_RATE_MAX = 0.06    // 6 %
export const SAVINGS_RATIO_MAX  = 0.6     // estimated_savings_monthly / total_fees_estimate
export const AVG_TICKET_MIN     = 2       // $2
export const AVG_TICKET_MAX     = 50_000  // $50,000

// ---- Score mapping ----
//   start at SCORE_START (100)
//   each 'warn' check        → −WARN_PENALTY (15)
//   any 'fail' check present  → score floored to FAIL_SCORE (low band, 20)
// Verdict: 'fail' if any check failed; else 'flagged' if any warn (or placeholder);
//          else 'pass'. Score is clamped to [0, 100].
export const SCORE_START   = 100
export const WARN_PENALTY  = 15
export const FAIL_SCORE    = 20

export type ReviewCheckStatus = 'ok' | 'warn' | 'fail'

export interface ReviewFinding {
  check:  string
  status: ReviewCheckStatus
  detail: string
}

export interface StatementAnalysisReview {
  verdict:  'pass' | 'flagged' | 'fail'
  score:    number
  findings: ReviewFinding[]
}

export function reviewStatementAnalysis(analysis: StatementAnalysis): StatementAnalysisReview {
  const findings: ReviewFinding[] = []

  // Placeholder analyses carry no figures — flag (not fail) and short-circuit the
  // numeric checks, which have nothing to operate on.
  if (analysis.confidence === 'placeholder') {
    findings.push({
      check:  'placeholder',
      status: 'warn',
      detail: 'analysis is a placeholder (no figures entered)',
    })
    return { verdict: 'flagged', score: SCORE_START - WARN_PENALTY, findings }
  }

  const volume = analysis.monthly_volume_estimate
  const fees   = analysis.total_fees_estimate
  const txns   = analysis.transaction_count_estimate
  const rate   = analysis.effective_rate_estimate
  const savings = analysis.estimated_savings_monthly

  // 1. Non-positive core figures on a calculated analysis → fail.
  if (volume == null || !(volume > 0)) {
    findings.push({ check: 'monthly_volume', status: 'fail', detail: 'monthly_volume_estimate is missing or non-positive' })
  }
  if (fees == null || !(fees > 0)) {
    findings.push({ check: 'total_fees', status: 'fail', detail: 'total_fees_estimate is missing or non-positive' })
  }

  // 2. Savings must reconcile via the pure bridge on a calculated analysis → fail.
  const bridge = deriveCostSavingsBridge(analysis)
  if (bridge == null) {
    findings.push({ check: 'savings_reconciliation', status: 'fail', detail: 'savings cannot be reconciled' })
  }

  // 3. Effective rate plausibility band → warn.
  if (rate != null && (rate < EFFECTIVE_RATE_MIN || rate > EFFECTIVE_RATE_MAX)) {
    findings.push({
      check:  'effective_rate',
      status: 'warn',
      detail: `effective_rate_estimate ${rate} outside [${EFFECTIVE_RATE_MIN}, ${EFFECTIVE_RATE_MAX}]`,
    })
  }

  // 4. Claimed savings ratio implausibly high → warn.
  if (savings != null && fees != null && fees > 0 && savings / fees > SAVINGS_RATIO_MAX) {
    findings.push({
      check:  'savings_ratio',
      status: 'warn',
      detail: 'claimed savings implausibly high',
    })
  }

  // 5. Average ticket plausibility band → warn.
  if (volume != null && volume > 0 && txns != null && txns > 0) {
    const avgTicket = volume / txns
    if (avgTicket < AVG_TICKET_MIN || avgTicket > AVG_TICKET_MAX) {
      findings.push({
        check:  'avg_ticket',
        status: 'warn',
        detail: `average ticket ${avgTicket} outside [${AVG_TICKET_MIN}, ${AVG_TICKET_MAX}]`,
      })
    }
  }

  const hasFail = findings.some(f => f.status === 'fail')
  const warnCount = findings.filter(f => f.status === 'warn').length

  let score: number
  let verdict: 'pass' | 'flagged' | 'fail'
  if (hasFail) {
    score   = FAIL_SCORE
    verdict = 'fail'
  } else if (warnCount > 0) {
    score   = SCORE_START - warnCount * WARN_PENALTY
    verdict = 'flagged'
  } else {
    score   = SCORE_START
    verdict = 'pass'
  }

  score = Math.max(0, Math.min(100, score))
  return { verdict, score, findings }
}
