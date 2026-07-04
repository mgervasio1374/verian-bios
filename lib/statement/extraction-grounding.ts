// Deterministic grounding guard for the statement-extraction agent — the
// hallucination kill-switch. A figure the LLM returns is only trusted if it
// literally appears in the statement's source text; anything else is dropped
// before it can reach the ingest form. Pure, IO-free, fully unit-testable.
//
// Strategy: normalize the SOURCE, not the value. Every number-looking token in
// the source is stripped of '$' and thousands separators and parsed, building
// a set of numbers the document actually contains. An extracted numeric field
// is grounded iff its exact value is in that set — which makes "$123,456.78",
// "123456.78", and "123,456.78" all match 123456.78, and "2,000" / "2000"
// match 2000, without generating format permutations (exotic spacing between
// tokens is irrelevant because each token normalizes independently).

import type { ExtractedFigures } from './extraction-parse'

// Minimum per-field confidence for a grounded value to prefill the ingest
// form. Below this the operator is told to enter the field manually.
export const EXTRACTION_PREFILL_MIN_CONFIDENCE = 0.6

export interface FieldGrounding {
  grounded: boolean
}

export type ExtractionFieldKey = keyof ExtractedFigures

const NUMERIC_FIELDS = ['monthlyVolume', 'currentMonthlyFees', 'transactionCount'] as const

// Candidate number tokens: optional '$', digits with optional comma groups,
// optional decimals. '$1,234.56' → '1234.56'; '2000' → '2000'.
const NUMBER_TOKEN = /\$?\d[\d,]*(?:\.\d+)?/g

function sourceNumberSet(sourceText: string): Set<number> {
  const numbers = new Set<number>()
  for (const token of sourceText.match(NUMBER_TOKEN) ?? []) {
    const n = Number(token.replace(/[$,]/g, ''))
    if (Number.isFinite(n)) numbers.add(n)
  }
  return numbers
}

// Per-field grounded flags. Null fields are vacuously grounded (nothing was
// claimed); statementPeriod is exempt (date renderings are too variable) and
// passes through with its LLM confidence.
export function groundExtractedFields(
  fields: ExtractedFigures,
  sourceText: string,
): Record<ExtractionFieldKey, FieldGrounding> {
  const numbers = sourceNumberSet(sourceText)
  const lowerSource = sourceText.toLowerCase()

  const result = {} as Record<ExtractionFieldKey, FieldGrounding>

  for (const key of NUMERIC_FIELDS) {
    const value = fields[key]
    result[key] = { grounded: value === null || numbers.has(value) }
  }

  result.processor = {
    grounded:
      fields.processor === null ||
      lowerSource.includes(fields.processor.trim().toLowerCase()),
  }

  result.statementPeriod = { grounded: true }

  return result
}

// A field may prefill the ingest form only when it survived grounding (value
// still non-null) AND the LLM's own confidence clears the threshold.
export function computePrefillable(
  fields: ExtractedFigures,
  fieldConfidence: Record<string, number>,
): Record<ExtractionFieldKey, boolean> {
  const result = {} as Record<ExtractionFieldKey, boolean>
  for (const key of Object.keys(fields) as ExtractionFieldKey[]) {
    result[key] =
      fields[key] !== null &&
      (fieldConfidence[key] ?? 0) >= EXTRACTION_PREFILL_MIN_CONFIDENCE
  }
  return result
}
