// Builds a structured statement analysis record from available metadata.
// Real PDF parsing (OCR / Claude extraction) is a future phase.
//
// Two builders exist:
//   - buildPlaceholderAnalysis: confidence 'placeholder', savings deliberately
//     null — used when no operator-entered figures exist yet.
//   - buildCalculatedAnalysis:  confidence 'calculated', savings computed
//     deterministically from operator-entered statement figures via the pure
//     savings engine (lib/statement/savings-calculator.ts).

import { computeStatementSavings } from '@/lib/statement/savings-calculator'

// ---------------------------------------------------------------------------
// Proposed 321 Swipe pricing — single source of truth.
// The savings calculator and both analysis builders read these constants so
// the proposed-cost math is never re-hardcoded in more than one place.
// ---------------------------------------------------------------------------

export const PROPOSED_PRICING = {
  pricingModel: 'interchange-plus' as const,
  basisPoints:  25, // 0.25 % markup above interchange  → 0.0025 as a rate
  monthlyFee:   35, // $35 / month account fee
  perTxnCents:  10, // $0.10 / transaction             → 0.10 as dollars
}

// Derived rates (so callers never re-derive the magic numbers themselves)
export const PROPOSED_MARKUP_RATE   = PROPOSED_PRICING.basisPoints / 10000 // 0.0025
export const PROPOSED_PER_TXN_DOLLARS = PROPOSED_PRICING.perTxnCents / 100  // 0.10

// Default assumed interchange rate when no statement-derived rate is available.
export const DEFAULT_ASSUMED_INTERCHANGE_RATE = 0.018

export interface StatementAnalysis {
  confidence:                 'placeholder' | 'calculated'
  processor_name:             string | null
  statement_period:           string | null
  monthly_volume_estimate:    number | null
  transaction_count_estimate: number | null
  total_fees_estimate:        number | null
  effective_rate_estimate:    number | null
  // Savings: null for placeholder, never negative for calculated
  estimated_savings_monthly:  number | null
  estimated_savings_annual:   number | null
  // Proposed pricing
  proposed_pricing_model:     'interchange-plus'
  proposed_basis_points:      number
  proposed_monthly_fee:       number
  proposed_per_txn_cents:     number
  // Transparency
  assumptions:                string[]
  extracted_fields:           Record<string, unknown>
  generated_at:               string
}

interface LeadMeta {
  metadata?: Record<string, unknown> | null
  source?:   string | null
}

export function buildPlaceholderAnalysis(
  lead:         LeadMeta,
  artifactName: string,
  companyName:  string | null
): StatementAnalysis {
  const meta         = (lead.metadata ?? {}) as Record<string, unknown>
  const processorName = typeof meta.processor === 'string' && meta.processor
    ? meta.processor
    : null

  const assumptions: string[] = [
    'This analysis is preliminary — full statement review is pending.',
    'Savings estimates cannot be provided without reviewing the actual statement.',
    processorName
      ? `Current processor identified as ${processorName}.`
      : 'Current processor not yet identified from submission.',
    'Proposed pricing is based on 321 Swipe\'s standard interchange-plus rate card.',
    'Final pricing may vary after reviewing your actual processing volume and statement.',
  ]

  return {
    confidence:                 'placeholder',
    processor_name:             processorName,
    statement_period:           null,
    monthly_volume_estimate:    null,
    transaction_count_estimate: null,
    total_fees_estimate:        null,
    effective_rate_estimate:    null,
    estimated_savings_monthly:  null,
    estimated_savings_annual:   null,
    proposed_pricing_model:     PROPOSED_PRICING.pricingModel,
    proposed_basis_points:      PROPOSED_PRICING.basisPoints,
    proposed_monthly_fee:       PROPOSED_PRICING.monthlyFee,
    proposed_per_txn_cents:     PROPOSED_PRICING.perTxnCents,
    assumptions,
    extracted_fields: {
      artifact_name: artifactName,
      source:        lead.source ?? null,
      company:       companyName ?? null,
    },
    generated_at: new Date().toISOString(),
  }
}

export interface CalculatedAnalysisInput {
  monthlyVolume:           number
  currentMonthlyFees:      number
  transactionCount:        number
  assumedInterchangeRate?: number
  processorName?:          string | null
  statementPeriod?:        string | null
  artifactName?:           string | null
  companyName?:            string | null
  source?:                 string | null
}

// Builds a StatementAnalysis with real, deterministic savings computed from
// operator-entered statement figures. confidence: 'calculated'. Savings are
// clamped to zero by the engine — never negative.
export function buildCalculatedAnalysis(
  input: CalculatedAnalysisInput
): StatementAnalysis {
  const savings = computeStatementSavings({
    monthlyVolume:          input.monthlyVolume,
    currentMonthlyFees:     input.currentMonthlyFees,
    transactionCount:       input.transactionCount,
    assumedInterchangeRate: input.assumedInterchangeRate,
  })

  return {
    confidence:                 'calculated',
    processor_name:             input.processorName ?? null,
    statement_period:           input.statementPeriod ?? null,
    monthly_volume_estimate:    input.monthlyVolume,
    transaction_count_estimate: input.transactionCount,
    total_fees_estimate:        input.currentMonthlyFees,
    effective_rate_estimate:    savings.currentEffectiveRate,
    estimated_savings_monthly:  savings.monthlySavings,
    estimated_savings_annual:   savings.annualSavings,
    proposed_pricing_model:     PROPOSED_PRICING.pricingModel,
    proposed_basis_points:      PROPOSED_PRICING.basisPoints,
    proposed_monthly_fee:       PROPOSED_PRICING.monthlyFee,
    proposed_per_txn_cents:     PROPOSED_PRICING.perTxnCents,
    assumptions:                savings.assumptions,
    extracted_fields: {
      artifact_name:          input.artifactName ?? null,
      source:                 input.source ?? null,
      company:                input.companyName ?? null,
      // Stored so downstream renderers can show proposed vs current rate
      // without re-running the engine.
      proposed_monthly_cost:  savings.proposedMonthlyCost,
      assumed_interchange_rate: input.assumedInterchangeRate ?? DEFAULT_ASSUMED_INTERCHANGE_RATE,
    },
    generated_at: new Date().toISOString(),
  }
}
