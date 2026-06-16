// Pure accuracy grader: the extraction agent's proposed figures vs the operator's
// final figures. This agent-vs-human delta is the learning label captured into
// statement_analysis_reviews.field_grades (review_type='extraction_accuracy').
// IO-free, fully unit-testable.

import type { ExtractedFigures } from '@/lib/statement/extraction-parse'

// Numeric fields match within this relative tolerance (or exactly). 1% absorbs
// rounding (e.g. operator types 100000, agent read 100000.00 / 99999.5).
export const EXTRACTION_MATCH_TOLERANCE = 0.01

const NUMERIC_FIELDS = ['monthlyVolume', 'currentMonthlyFees', 'transactionCount'] as const
const STRING_FIELDS  = ['processor', 'statementPeriod'] as const

export interface FieldGrade {
  agent:       unknown
  final:       unknown
  match:       boolean
  confidence?: number
}

export interface ExtractionGradeResult {
  fieldGrades: Record<string, FieldGrade>
  matchRate:   number
}

function numMatch(a: number, f: number): boolean {
  if (a === f) return true
  const denom = Math.max(Math.abs(f), 1e-9)
  return Math.abs(a - f) / denom <= EXTRACTION_MATCH_TOLERANCE
}

function strMatch(a: string, f: string): boolean {
  return a.trim().toLowerCase() === f.trim().toLowerCase()
}

export interface FinalFigures {
  monthlyVolume:      number | null
  currentMonthlyFees: number | null
  transactionCount:   number | null
  processor:          string | null
  statementPeriod:    string | null
}

// Grades only the fields the agent actually proposed (agent null ⇒ match:false and
// EXCLUDED from the rate denominator). matchRate = matches / proposed-field-count.
export function computeExtractionFieldGrades(
  agent: { fields: Partial<ExtractedFigures> | Record<string, unknown>; fieldConfidence?: Record<string, number> },
  final: FinalFigures,
): ExtractionGradeResult {
  const af = agent.fields as Record<string, unknown>
  const fieldGrades: Record<string, FieldGrade> = {}
  let graded = 0
  let matches = 0

  for (const key of NUMERIC_FIELDS) {
    const a = (af[key] ?? null) as number | null
    const f = final[key]
    const conf = agent.fieldConfidence?.[key]
    if (a === null) {
      fieldGrades[key] = { agent: null, final: f, match: false, ...(conf !== undefined ? { confidence: conf } : {}) }
      continue
    }
    graded++
    const match = f !== null && numMatch(a, f)
    if (match) matches++
    fieldGrades[key] = { agent: a, final: f, match, ...(conf !== undefined ? { confidence: conf } : {}) }
  }

  for (const key of STRING_FIELDS) {
    const a = (af[key] ?? null) as string | null
    const f = final[key]
    const conf = agent.fieldConfidence?.[key]
    if (a === null) {
      fieldGrades[key] = { agent: null, final: f, match: false, ...(conf !== undefined ? { confidence: conf } : {}) }
      continue
    }
    graded++
    const match = f !== null && strMatch(a, f)
    if (match) matches++
    fieldGrades[key] = { agent: a, final: f, match, ...(conf !== undefined ? { confidence: conf } : {}) }
  }

  const matchRate = graded > 0 ? matches / graded : 0
  return { fieldGrades, matchRate }
}
