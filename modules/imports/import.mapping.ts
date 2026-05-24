// Phase 3B.2 — Data Import Foundation: column mapping (pure functions)

import { IMPORT_FIELD_ALIASES, IMPORT_REQUIRED_FIELDS, type ColumnMapping } from './import.types'

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  for (const header of headers) {
    const key = header.trim().toLowerCase()
    const canonical = IMPORT_FIELD_ALIASES[key]
    if (canonical && !mapping[canonical]) {
      mapping[canonical] = header
    }
  }
  return mapping
}

export function applyMapping(
  rawRow: Record<string, unknown>,
  mapping: ColumnMapping,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [canonical, originalHeader] of Object.entries(mapping)) {
    if (originalHeader !== undefined) {
      result[canonical] = rawRow[originalHeader]
    }
  }
  return result
}

export function validateMapping(mapping: ColumnMapping): { valid: boolean; missingRequired: string[] } {
  const missingRequired: string[] = []
  for (const field of IMPORT_REQUIRED_FIELDS) {
    if (!mapping[field]) {
      missingRequired.push(field)
    }
  }
  return { valid: missingRequired.length === 0, missingRequired }
}
