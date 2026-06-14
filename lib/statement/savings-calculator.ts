// Pure, deterministic savings engine.
//
// Given operator-entered statement figures, it computes the prospect's current
// effective rate and the proposed monthly cost under 321 Swipe's interchange-plus
// pricing, then derives monthly / annual savings. Savings are clamped to zero —
// the engine never produces a negative savings figure. Every assumption is
// disclosed. No I/O, no side effects, fully unit-testable.

import {
  PROPOSED_PRICING,
  PROPOSED_MARKUP_RATE,
  PROPOSED_PER_TXN_DOLLARS,
  DEFAULT_ASSUMED_INTERCHANGE_RATE,
} from '@/lib/statement/analysis'

export interface StatementSavingsInput {
  monthlyVolume:           number
  currentMonthlyFees:      number
  transactionCount:        number
  /** Estimated interchange rate as a decimal (e.g. 0.018 = 1.8 %). Defaults to 1.8 %. */
  assumedInterchangeRate?: number
}

export interface StatementSavingsResult {
  currentEffectiveRate: number
  proposedMonthlyCost:  number
  monthlySavings:       number
  annualSavings:        number
  assumptions:          string[]
  hasSavings:           boolean
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

function usd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// proposedMonthlyCost =
//   (volume × interchange) + (volume × markup) + (txns × per-txn) + monthly fee
// where markup (0.0025), per-txn ($0.10) and monthly fee ($35) come from the
// single-sourced PROPOSED_PRICING constants in analysis.ts.
export function computeStatementSavings(
  input: StatementSavingsInput
): StatementSavingsResult {
  const assumedInterchangeRate =
    input.assumedInterchangeRate ?? DEFAULT_ASSUMED_INTERCHANGE_RATE

  const monthlyVolume      = input.monthlyVolume
  const currentMonthlyFees = input.currentMonthlyFees
  const transactionCount   = input.transactionCount

  const baseAssumptions: string[] = [
    `Interchange is estimated at ${pct(assumedInterchangeRate)} of volume — your actual interchange depends on card mix and is confirmed during statement review.`,
    `Proposed 321 Swipe pricing: interchange-plus at ${PROPOSED_PRICING.basisPoints} bps (${pct(PROPOSED_MARKUP_RATE)}) markup, ${usd(PROPOSED_PER_TXN_DOLLARS)} per transaction, and a ${usd(PROPOSED_PRICING.monthlyFee)} monthly account fee.`,
    'Figures are based on operator-entered statement values.',
    'This is an estimate, not a binding quote.',
  ]

  // Divide-by-zero / no-volume guard: with no processing volume there is no
  // basis for a savings figure.
  if (!(monthlyVolume > 0)) {
    return {
      currentEffectiveRate: 0,
      proposedMonthlyCost:  0,
      monthlySavings:       0,
      annualSavings:        0,
      hasSavings:           false,
      assumptions: [
        'No monthly processing volume was provided, so no savings can be estimated.',
        ...baseAssumptions,
      ],
    }
  }

  const currentEffectiveRate = currentMonthlyFees / monthlyVolume

  const proposedMonthlyCost =
    monthlyVolume * assumedInterchangeRate +
    monthlyVolume * PROPOSED_MARKUP_RATE +
    transactionCount * PROPOSED_PER_TXN_DOLLARS +
    PROPOSED_PRICING.monthlyFee

  const monthlySavings = Math.max(0, currentMonthlyFees - proposedMonthlyCost)
  const annualSavings  = monthlySavings * 12
  const hasSavings     = monthlySavings > 0

  const assumptions = hasSavings
    ? baseAssumptions
    : [
        'At the figures provided, 321 Swipe\'s proposed pricing does not beat your current cost — no savings are claimed.',
        ...baseAssumptions,
      ]

  return {
    currentEffectiveRate,
    proposedMonthlyCost,
    monthlySavings,
    annualSavings,
    assumptions,
    hasSavings,
  }
}
