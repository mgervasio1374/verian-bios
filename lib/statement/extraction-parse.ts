// Pure parse/validate for the statement-extraction LLM response. IO-free, fully
// unit-testable. Tolerant JSON parse (strips prose/code fences), coerces numerics
// (strips $/commas), rejects non-finite/negative → null, clamps confidence to
// [0,1]. Never fabricates: a missing/unclear value → null + confidence 0.

export interface ExtractedFigures {
  monthlyVolume:    number | null
  currentMonthlyFees: number | null
  transactionCount: number | null
  processor:        string | null
  statementPeriod:  string | null
}

export interface ParsedExtraction {
  fields:          ExtractedFigures
  fieldConfidence: Record<string, number>
}

const FIELD_KEYS = ['monthlyVolume', 'currentMonthlyFees', 'transactionCount', 'processor', 'statementPeriod'] as const

const ALL_NULL_FIELDS: ExtractedFigures = {
  monthlyVolume:      null,
  currentMonthlyFees: null,
  transactionCount:   null,
  processor:          null,
  statementPeriod:    null,
}

function zeroConfidence(): Record<string, number> {
  return Object.fromEntries(FIELD_KEYS.map(k => [k, 0]))
}

// Coerce a possibly-stringy numeric ("$1,000,000", "1000000", 1000000) to a finite
// non-negative number, else null. Booleans / objects / NaN / Infinity / negatives → null.
function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number') {
    return Number.isFinite(v) && v >= 0 ? v : null
  }
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,\s]/g, '')
    if (cleaned === '') return null
    const n = Number(cleaned)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  return null
}

function coerceString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function clampConfidence(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

// Extract the first {...} JSON object from a possibly-fenced/prose-wrapped string.
function parseJsonObject(raw: string): Record<string, unknown> | null {
  const s = raw.trim()
  const start = s.indexOf('{')
  const end   = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const obj = JSON.parse(s.slice(start, end + 1))
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function parseExtractedFigures(raw: string): ParsedExtraction {
  const obj = parseJsonObject(raw)
  if (!obj) {
    return { fields: { ...ALL_NULL_FIELDS }, fieldConfidence: zeroConfidence() }
  }

  // Accept either {fields:{...}, fieldConfidence:{...}} or a flat object with a
  // sibling/nested confidence map — prefer explicit nesting, fall back to flat.
  const fieldsSrc = (obj.fields && typeof obj.fields === 'object' ? obj.fields : obj) as Record<string, unknown>
  const confSrc   = (obj.fieldConfidence && typeof obj.fieldConfidence === 'object'
    ? obj.fieldConfidence
    : (obj.confidence && typeof obj.confidence === 'object' ? obj.confidence : {})) as Record<string, unknown>

  const fields: ExtractedFigures = {
    monthlyVolume:      coerceNumber(fieldsSrc.monthlyVolume),
    currentMonthlyFees: coerceNumber(fieldsSrc.currentMonthlyFees),
    transactionCount:   coerceNumber(fieldsSrc.transactionCount),
    processor:          coerceString(fieldsSrc.processor),
    statementPeriod:    coerceString(fieldsSrc.statementPeriod),
  }

  const fieldConfidence: Record<string, number> = {}
  for (const key of FIELD_KEYS) {
    // A field that resolved to null carries 0 confidence regardless of what the
    // model claimed — we never report confidence in a value we discarded.
    const resolved = (fields as unknown as Record<string, unknown>)[key]
    fieldConfidence[key] = resolved === null ? 0 : clampConfidence(confSrc[key])
  }

  return { fields, fieldConfidence }
}
