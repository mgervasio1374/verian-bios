// MCM v2 — customer-status flag: normalization, list filter, bulk-set, and
// import upgrade-only rule. Behavioral (not just source-read).
//
// TC-CF-01..07

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Flexible mocked service client driven by hoisted state. from() resets the
// per-chain state; the chain is thenable so `await query` resolves.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  // configurable per test
  existingCompany: null as Record<string, unknown> | null,
  listData:        [] as Array<Record<string, unknown>>,
  updateData:      [] as Array<Record<string, unknown>>,
  // captured by the mock
  lastFilters:     [] as Array<[string, string, unknown]>,
  capturedInsert:  null as Record<string, unknown> | null,
  capturedUpdate:  null as Record<string, unknown> | null,
}))

function makeBuilder() {
  const state = { op: 'select' as 'select' | 'insert' | 'update', filters: [] as Array<[string, string, unknown]>, payload: null as Record<string, unknown> | null }
  const resolve = (kind: 'list' | 'single' | 'maybeSingle') => {
    if (state.op === 'insert') {
      h.capturedInsert = state.payload
      return { data: { id: 'company-new', ...state.payload }, error: null }
    }
    if (state.op === 'update') {
      h.capturedUpdate = state.payload
      if (kind === 'single') return { data: { ...(h.existingCompany ?? {}), ...state.payload }, error: null }
      return { data: h.updateData, error: null }
    }
    // select
    h.lastFilters = state.filters
    if (kind === 'maybeSingle' || kind === 'single') return { data: h.existingCompany, error: null }
    return { data: h.listData, error: null }
  }
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    from:   () => { state.op = 'select'; state.filters = []; state.payload = null; return builder },
    select: () => builder,
    insert: (p: Record<string, unknown>) => { state.op = 'insert'; state.payload = p; return builder },
    update: (p: Record<string, unknown>) => { state.op = 'update'; state.payload = p; return builder },
    eq:    (c: string, v: unknown) => { state.filters.push(['eq', c, v]); return builder },
    in:    (c: string, v: unknown) => { state.filters.push(['in', c, v]); return builder },
    is:    (c: string, v: unknown) => { state.filters.push(['is', c, v]); return builder },
    ilike: (c: string, v: unknown) => { state.filters.push(['ilike', c, v]); return builder },
    contains: (c: string, v: unknown) => { state.filters.push(['contains', c, v]); return builder },
    order: () => builder,
    range: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(resolve('maybeSingle')),
    single:      () => Promise.resolve(resolve('single')),
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(resolve('list')).then(onF, onR),
  })
  return builder
}

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => makeBuilder(),
}))

// Action-layer mocks (only used by TC-CF-06)
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({}) }))
vi.mock('@/lib/auth/context', () => ({
  buildRequestContext: () => Promise.resolve({ tenantId: 't1', workspaceId: 'w1', userId: 'u1' }),
}))
vi.mock('@/lib/auth/permissions', () => ({ requirePermission: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { normalizeCustomerStatus, normalizeRow } from '@/modules/imports/import.normalization'
import { detectColumnMapping } from '@/modules/imports/import.mapping'
import { listCompanies, updateCompaniesCustomerStatus } from '@/modules/crm/repositories/company.repo'
import { findOrCreateCompany } from '@/modules/imports/import.commit'
import { updateCompaniesCustomerStatusAction } from '@/modules/crm/actions/company.actions'
import type { NormalizedImportRow } from '@/modules/imports/import.types'

beforeEach(() => {
  h.existingCompany = null
  h.listData        = []
  h.updateData      = []
  h.lastFilters     = []
  h.capturedInsert  = null
  h.capturedUpdate  = null
})

// ---------------------------------------------------------------------------
// TC-CF-01: normalizeCustomerStatus value mapping
// ---------------------------------------------------------------------------

describe('TC-CF-01: normalizeCustomerStatus (behavioral)', () => {
  it('maps customer-ish tokens to customer (case-insensitive, trimmed)', () => {
    for (const v of ['customer', 'Customer', ' YES ', 'true', 'y', '1', 'existing', 'EXISTING']) {
      expect(normalizeCustomerStatus(v)).toBe('customer')
    }
  })

  it('maps former-ish tokens to former_customer', () => {
    for (const v of ['former', 'Past', 'churned', 'FORMER CUSTOMER']) {
      expect(normalizeCustomerStatus(v)).toBe('former_customer')
    }
  })

  it('maps blank / unknown / null to prospect', () => {
    for (const v of ['', '   ', 'maybe', 'prospect', null, undefined]) {
      expect(normalizeCustomerStatus(v)).toBe('prospect')
    }
  })
})

// ---------------------------------------------------------------------------
// TC-CF-02: import column detection + row normalization
// ---------------------------------------------------------------------------

describe('TC-CF-02: "Customer Status" column maps and normalizes (behavioral)', () => {
  it('detects the column via aliases and normalizes the cell', () => {
    const mapping = detectColumnMapping(['Company', 'Email', 'Customer Status'])
    expect(mapping.customer_status).toBe('Customer Status')

    const row = normalizeRow(
      { Company: 'Acme', Email: 'a@acme.com', 'Customer Status': 'Yes' },
      mapping,
    )
    expect(row.customerStatus).toBe('customer')
  })

  it('blank cell normalizes to prospect; former → former_customer', () => {
    const mapping = detectColumnMapping(['company', 'customer'])
    expect(mapping.customer_status).toBe('customer')
    expect(normalizeRow({ company: 'A', customer: '' }, mapping).customerStatus).toBe('prospect')
    expect(normalizeRow({ company: 'A', customer: 'former' }, mapping).customerStatus).toBe('former_customer')
  })
})

// ---------------------------------------------------------------------------
// TC-CF-03: list filter passes customer_status to the query
// ---------------------------------------------------------------------------

describe('TC-CF-03: listCompanies customer_status filter (behavioral)', () => {
  it('applies .eq(customer_status, …) only when the option is set', async () => {
    await listCompanies({ tenantId: 't1', workspaceId: 'w1', customerStatus: 'customer' })
    expect(h.lastFilters).toContainEqual(['eq', 'customer_status', 'customer'])
  })

  it('does not filter by customer_status when the option is absent', async () => {
    await listCompanies({ tenantId: 't1', workspaceId: 'w1' })
    expect(h.lastFilters.some(f => f[1] === 'customer_status')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC-CF-04: bulk-set repo update
// ---------------------------------------------------------------------------

describe('TC-CF-04: updateCompaniesCustomerStatus repo (behavioral)', () => {
  it('updates customer_status for the given ids and returns the count', async () => {
    h.updateData = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const n = await updateCompaniesCustomerStatus(['a', 'b', 'c'], 'customer', 't1', 'w1')
    expect(h.capturedUpdate).toEqual({ customer_status: 'customer' })
    expect(n).toBe(3)
  })

  it('no-ops (returns 0) for an empty id set', async () => {
    const n = await updateCompaniesCustomerStatus([], 'customer', 't1', 'w1')
    expect(n).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// TC-CF-05: import upgrade-only rule on existing match
// ---------------------------------------------------------------------------

function normalized(extra: Partial<NormalizedImportRow>): NormalizedImportRow {
  return {
    companyName: 'Acme', contactFirstName: null, contactLastName: null,
    email: null, phone: null, website: 'acme.com', industry: null,
    city: null, state: null, zip: null, country: null, addressLine1: null,
    externalId: null, notes: null, customerStatus: 'prospect',
    rawData: {}, ...extra,
  }
}

describe('TC-CF-05: findOrCreateCompany customer_status (behavioral)', () => {
  it('new company is created with the normalized customer_status', async () => {
    h.existingCompany = null
    await findOrCreateCompany(normalized({ customerStatus: 'customer' }), 't1', 'w1')
    expect(h.capturedInsert?.customer_status).toBe('customer')
  })

  it('existing prospect is upgraded to customer', async () => {
    h.existingCompany = { id: 'c1', customer_status: 'prospect' }
    await findOrCreateCompany(normalized({ customerStatus: 'customer' }), 't1', 'w1')
    expect(h.capturedUpdate).toEqual({ customer_status: 'customer' })
  })

  it('existing customer is NOT downgraded by a sparse (prospect) import row', async () => {
    h.existingCompany = { id: 'c1', customer_status: 'customer' }
    const result = await findOrCreateCompany(normalized({ customerStatus: 'prospect' }), 't1', 'w1')
    expect(h.capturedUpdate).toBeNull()
    expect((result as unknown as Record<string, unknown>).customer_status).toBe('customer')
  })
})

// ---------------------------------------------------------------------------
// TC-CF-06: bulk-set action persists for a set of ids
// ---------------------------------------------------------------------------

describe('TC-CF-06: updateCompaniesCustomerStatusAction (behavioral)', () => {
  it('persists the status and reports the number updated', async () => {
    h.updateData = [{ id: 'a' }, { id: 'b' }]
    const result = await updateCompaniesCustomerStatusAction(['a', 'b'], 'customer')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.updated).toBe(2)
    expect(h.capturedUpdate).toEqual({ customer_status: 'customer' })
  })

  it('rejects an invalid status value', async () => {
    const result = await updateCompaniesCustomerStatusAction(['a'], 'bogus')
    expect(result.success).toBe(false)
  })

  it('rejects an empty id set', async () => {
    const result = await updateCompaniesCustomerStatusAction([], 'customer')
    expect(result.success).toBe(false)
  })
})
