// Pure cost→savings "bridge" derivation — the testable core of the proposal
// intelligence panel ("how we calculated this").
//
// It decomposes the proposed monthly cost into its four interchange-plus
// components (interchange pass-through, markup, per-transaction, monthly fee),
// reconciles them back to the proposed cost, and derives the savings view.
// Every number traces to the immutable StatementAnalysis snapshot — nothing is
// fabricated. Returns null (rather than guessing) when the snapshot is a
// placeholder or lacks the figures needed to show real work.
//
// No I/O, no side effects, fully unit-testable.

import type { StatementAnalysis } from '@/lib/statement/analysis'
import {
  PROPOSED_MARKUP_RATE,
  PROPOSED_PER_TXN_DOLLARS,
  DEFAULT_ASSUMED_INTERCHANGE_RATE,
} from '@/lib/statement/analysis'

export interface CostSavingsBridge {
  // Context
  monthlyVolume:       number
  transactionCount:    number
  avgTicket:           number
  // Current cost (what's being deducted today)
  currentMonthlyCost:  number
  currentRate:         number
  // Proposed 321 Swipe components — these four sum to proposedCost
  interchange:         number // implied pass-through, clamped ≥ 0
  markup:              number // volume × markup rate
  markupBps:           number
  perTxn:              number // txns × per-txn dollars
  perTxnDollars:       number
  monthlyFee:          number
  proposedCost:        number
  proposedRate:        number
  // Savings view
  monthlySavings:      number
  annualSavings:       number
  threeYearSavings:    number
  savingsPctOfCurrent: number
  assumedInterchangeRate: number
}

// Returns a fully-reconciled bridge, or null when the snapshot can't support an
// honest derivation (placeholder confidence, no calculated savings, or no
// volume to divide by).
export function deriveCostSavingsBridge(
  analysis: StatementAnalysis | null | undefined
): CostSavingsBridge | null {
  if (!analysis) return null
  if (analysis.confidence !== 'calculated') return null
  if (analysis.estimated_savings_monthly == null) return null

  const volume = analysis.monthly_volume_estimate
  if (volume == null || !(volume > 0)) return null

  const txnCount          = analysis.transaction_count_estimate ?? 0
  const currentMonthlyCost = analysis.total_fees_estimate ?? 0

  const markup     = volume * PROPOSED_MARKUP_RATE
  const perTxn     = txnCount * PROPOSED_PER_TXN_DOLLARS
  const monthlyFee = analysis.proposed_monthly_fee

  const assumedInterchangeRate =
    typeof analysis.extracted_fields?.assumed_interchange_rate === 'number'
      ? (analysis.extracted_fields.assumed_interchange_rate as number)
      : DEFAULT_ASSUMED_INTERCHANGE_RATE

  // Prefer the snapshot's stored proposed cost; otherwise recompute it from the
  // default-interchange model so the bridge still reconciles.
  const storedProposed = analysis.extracted_fields?.proposed_monthly_cost
  const proposedCost =
    typeof storedProposed === 'number'
      ? storedProposed
      : volume * assumedInterchangeRate + markup + perTxn + monthlyFee

  // Interchange is the implied pass-through: whatever's left of the proposed
  // cost after our three transparent charges. Clamp ≥ 0 (never imply a negative
  // wholesale fee). When non-clamped, the four components reconcile exactly to
  // proposedCost (the invariant the tests assert).
  const interchange = Math.max(0, proposedCost - markup - perTxn - monthlyFee)

  const monthlySavings   = Math.max(0, currentMonthlyCost - proposedCost)
  const annualSavings    = monthlySavings * 12
  const threeYearSavings = monthlySavings * 36

  const currentRate         = analysis.effective_rate_estimate ?? (currentMonthlyCost / volume)
  const proposedRate        = proposedCost / volume
  const savingsPctOfCurrent = currentMonthlyCost > 0 ? monthlySavings / currentMonthlyCost : 0
  const avgTicket           = txnCount > 0 ? volume / txnCount : 0

  return {
    monthlyVolume:       volume,
    transactionCount:    txnCount,
    avgTicket,
    currentMonthlyCost,
    currentRate,
    interchange,
    markup,
    markupBps:           analysis.proposed_basis_points,
    perTxn,
    perTxnDollars:       PROPOSED_PER_TXN_DOLLARS,
    monthlyFee,
    proposedCost,
    proposedRate,
    monthlySavings,
    annualSavings,
    threeYearSavings,
    savingsPctOfCurrent,
    assumedInterchangeRate,
  }
}
