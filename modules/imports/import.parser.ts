import 'server-only'
// Phase 3B.2 — Data Import Foundation: file parsing (server-only)

import * as XLSX from 'xlsx'
import Papa from 'papaparse'

export interface ParseResult {
  headers: string[]
  rows:    Record<string, unknown>[]
  errors:  string[]
}

export function parseXlsx(buffer: Buffer | ArrayBuffer): ParseResult {
  const errors: string[] = []
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return { headers: [], rows: [], errors: ['No worksheets found in XLSX file'] }
    }
    const sheet = workbook.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    if (raw.length === 0) {
      return { headers: [], rows: [], errors: [] }
    }
    const headers = (raw[0] as unknown[]).map(h => String(h ?? '').trim())
    const rows: Record<string, unknown>[] = []
    for (let i = 1; i < raw.length; i++) {
      const rowArr = raw[i] as unknown[]
      const allEmpty = rowArr.every(v => v === '' || v == null)
      if (allEmpty) continue
      const obj: Record<string, unknown> = {}
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = rowArr[j] ?? ''
      }
      rows.push(obj)
    }
    return { headers, rows, errors }
  } catch (err) {
    return { headers: [], rows: [], errors: [String(err)] }
  }
}

export function parseCsv(content: string): ParseResult {
  const errors: string[] = []
  const result = Papa.parse<Record<string, unknown>>(content, {
    header:          true,
    skipEmptyLines:  'greedy',
    transformHeader: (h: string) => h.trim(),
  })
  for (const e of result.errors) {
    errors.push(`Row ${e.row ?? '?'}: ${e.message}`)
  }
  const headers = result.meta.fields ?? []
  return { headers, rows: result.data, errors }
}

export function parseFile(
  file:       Buffer | ArrayBuffer | string,
  sourceType: 'csv' | 'xlsx',
): ParseResult {
  if (sourceType === 'xlsx') {
    if (typeof file === 'string') {
      return { headers: [], rows: [], errors: ['XLSX parser requires a Buffer, not a string'] }
    }
    return parseXlsx(file)
  }
  if (typeof file !== 'string') {
    const str = Buffer.isBuffer(file)
      ? (file as Buffer).toString('utf-8')
      : Buffer.from(file as ArrayBuffer).toString('utf-8')
    return parseCsv(str)
  }
  return parseCsv(file)
}
