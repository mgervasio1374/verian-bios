// MCM v2 — fix: import within-batch dedup self-match
//
// Bug: checkWithinBatchDuplicate queried import_rows for ANY row in the batch
// containing the email — but the row being checked is already persisted in
// import_rows, so every emailed row matched itself and batches committed 0
// rows. Fix: pass the current row_number and filter `row_number < current`,
// which excludes self AND keeps the first occurrence unique.
//
// TC-IWB-01..04 — source-read + behavioral.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const DEDUPE  = 'modules/imports/import.dedupe.ts'
const SERVICE = 'modules/imports/import.service.ts'

// ---------------------------------------------------------------------------
// Behavioral harness — an in-memory import_rows table the mocked service
// client filters by row_number/email exactly as the real query would.
// contacts/companies/leads always return no existing-data duplicate here.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  // persisted import_rows for the batch: { id, row_number, email }
  rows: [] as Array<{ id: string; row_number: number; email: string }>,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    const state: { table: string; ltRowNumber: number | null; email: string | null } = {
      table: '', ltRowNumber: null, email: null,
    }
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      from: (t: string) => { state.table = t; return builder },
      select: () => builder,
      eq:   () => builder,
      is:   () => builder,
      ilike: () => builder,
      contains: (_col: string, obj: Record<string, unknown>) => {
        if (typeof obj.email === 'string') state.email = obj.email
        return builder
      },
      lt: (_col: string, val: number) => { state.ltRowNumber = val; return builder },
      limit: () => builder,
      maybeSingle: () => {
        if (state.table !== 'import_rows') {
          // existing-data dedup tables — no match in these tests
          return Promise.resolve({ data: null, error: null })
        }
        const match = h.rows.find(r =>
          r.email === state.email &&
          (state.ltRowNumber == null || r.row_number < state.ltRowNumber),
        )
        return Promise.resolve({ data: match ? { id: match.id } : null, error: null })
      },
    })
    return builder
  },
}))

import { checkWithinBatchDuplicate, checkRowForDuplicates } from '@/modules/imports/import.dedupe'
import type { NormalizedImportRow } from '@/modules/imports/import.types'

function normalized(email: string): NormalizedImportRow {
  return {
    companyName: null, email, phone: null, website: null, city: null, externalId: null,
  } as unknown as NormalizedImportRow
}

beforeEach(() => { h.rows = [] })

// ---------------------------------------------------------------------------
// TC-IWB-01: query shape — filters by row_number < current (source-read)
// ---------------------------------------------------------------------------

describe('TC-IWB-01: within-batch query excludes self via row_number (source-read)', () => {
  const src = read(DEDUPE)

  it('checkWithinBatchDuplicate takes currentRowNumber and filters row_number < it', () => {
    expect(src).toContain('currentRowNumber: number')
    expect(src).toContain(".lt('row_number', currentRowNumber)")
  })

  it('checkRowForDuplicates threads the row number into the within-batch check', () => {
    expect(src).toContain('checkWithinBatchDuplicate(normalized.email, batchId, currentRowNumber)')
  })

  it('dedupeBatch passes the row’s row_number through', () => {
    expect(read(SERVICE)).toContain('checkRowForDuplicates(normalized, tenantId, batchId, row.row_number)')
  })
})

// ---------------------------------------------------------------------------
// TC-IWB-02: a singleton email is unique (no self-match)
// ---------------------------------------------------------------------------

describe('TC-IWB-02: singleton email is unique (behavioral)', () => {
  it('does not flag a row whose email appears only once — even though it is persisted', async () => {
    // The row itself is in the table at row_number 1; checking it must not self-match.
    h.rows = [{ id: 'r1', row_number: 1, email: 'alpha@example.com' }]
    const match = await checkWithinBatchDuplicate('alpha@example.com', 'batch-1', 1)
    expect(match).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// TC-IWB-03: first occurrence unique, second occurrence duplicate
// ---------------------------------------------------------------------------

describe('TC-IWB-03: repeated email — first unique, second duplicate (behavioral)', () => {
  beforeEach(() => {
    h.rows = [
      { id: 'r1', row_number: 1, email: 'alpha@example.com' },
      { id: 'r2', row_number: 2, email: 'alpha@example.com' },
    ]
  })

  it('first occurrence (row 1) is unique', async () => {
    const match = await checkWithinBatchDuplicate('alpha@example.com', 'batch-1', 1)
    expect(match).toBeNull()
  })

  it('second occurrence (row 2) is a within_batch duplicate of the first', async () => {
    const match = await checkWithinBatchDuplicate('alpha@example.com', 'batch-1', 2)
    expect(match).not.toBeNull()
    expect(match?.matchType).toBe('within_batch')
    expect(match?.entityId).toBe('r1')
  })
})

// ---------------------------------------------------------------------------
// TC-IWB-04: checkRowForDuplicates end-to-end status
// ---------------------------------------------------------------------------

describe('TC-IWB-04: checkRowForDuplicates honors row_number (behavioral)', () => {
  it('first emailed row is unique, repeat is duplicate', async () => {
    h.rows = [
      { id: 'r1', row_number: 1, email: 'beta@example.com' },
      { id: 'r2', row_number: 2, email: 'beta@example.com' },
    ]
    const first  = await checkRowForDuplicates(normalized('beta@example.com'), 't1', 'batch-1', 1)
    const second = await checkRowForDuplicates(normalized('beta@example.com'), 't1', 'batch-1', 2)
    expect(first.status).toBe('unique')
    expect(second.status).toBe('duplicate')
    expect(second.matches.some(m => m.matchType === 'within_batch')).toBe(true)
  })
})
