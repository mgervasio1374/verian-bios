// Builds a structured statement analysis record from available metadata.
// Real PDF parsing (OCR / Claude extraction) is a future phase.
// Until then, every analysis is confidence: 'placeholder' and savings
// estimates are deliberately omitted to avoid unsupported claims.

export interface StatementAnalysis {
  confidence:                 'placeholder'
  processor_name:             string | null
  statement_period:           string | null
  monthly_volume_estimate:    number | null
  transaction_count_estimate: number | null
  total_fees_estimate:        number | null
  effective_rate_estimate:    number | null
  // Savings: always null for placeholder — never fabricate estimates
  estimated_savings_monthly:  null
  estimated_savings_annual:   null
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
    proposed_pricing_model:     'interchange-plus',
    proposed_basis_points:      25,   // 0.25 % markup above interchange
    proposed_monthly_fee:       35,   // $35 /month account fee
    proposed_per_txn_cents:     10,   // $0.10 /transaction
    assumptions,
    extracted_fields: {
      artifact_name: artifactName,
      source:        lead.source ?? null,
      company:       companyName ?? null,
    },
    generated_at: new Date().toISOString(),
  }
}
