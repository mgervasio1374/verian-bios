// mcm-v2 — Companies pagination. Unit-tests countCompaniesFiltered's filter mirror,
// and source-reads the page wiring + CompaniesTable controls. TC-CP-01..09

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// countCompaniesFiltered — query-builder call mirror
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  eq: [] as Array<[string, unknown]>,
  ilike: [] as Array<[string, unknown]>,
  inCalls: [] as Array<[string, unknown]>,
  isCall: null as [string, unknown] | null,
  selectOpts: null as unknown,
  count: 7,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    Object.assign(b, {
      from: () => b,
      select: (_sel: string, opts: unknown) => { h.selectOpts = opts; return b },
      eq: (c: string, v: unknown) => { h.eq.push([c, v]); return b },
      is: (c: string, v: unknown) => { h.isCall = [c, v]; return b },
      ilike: (c: string, v: unknown) => { h.ilike.push([c, v]); return b },
      in: (c: string, v: unknown) => { h.inCalls.push([c, v]); return b },
      then: (resolve: (r: { count: number; error: null }) => unknown) => resolve({ count: h.count, error: null }),
    })
    return b
  },
}))

import { countCompaniesFiltered } from '@/modules/crm/repositories/company.repo'

beforeEach(() => { h.eq = []; h.ilike = []; h.inCalls = []; h.isCall = null; h.selectOpts = null; h.count = 7 })

describe('TC-CP-01: countCompaniesFiltered uses a head count and the base scope', () => {
  it('select head+exact, tenant+workspace eq, deleted_at IS NULL', async () => {
    const n = await countCompaniesFiltered({ tenantId: 't-1', workspaceId: 'ws-1' })
    expect(n).toBe(7)
    expect(h.selectOpts).toEqual({ count: 'exact', head: true })
    expect(h.eq).toContainEqual(['tenant_id', 't-1'])
    expect(h.eq).toContainEqual(['workspace_id', 'ws-1'])
    expect(h.isCall).toEqual(['deleted_at', null])
  })
})

describe('TC-CP-02: countCompaniesFiltered mirrors every listCompanies filter', () => {
  it('applies status/industry/customerStatus/search/ids when present', async () => {
    await countCompaniesFiltered({
      tenantId: 't-1', workspaceId: 'ws-1',
      status: 'active', industry: 'hvac', customerStatus: 'customer',
      search: 'acme', ids: ['a', 'b'],
    })
    expect(h.eq).toContainEqual(['status', 'active'])
    expect(h.eq).toContainEqual(['industry', 'hvac'])
    expect(h.eq).toContainEqual(['customer_status', 'customer'])
    expect(h.ilike).toContainEqual(['name', '%acme%'])
    expect(h.inCalls).toContainEqual(['id', ['a', 'b']])
  })
})

describe('TC-CP-03: countCompaniesFiltered omits absent filters', () => {
  it('no status/ilike/in when not provided', async () => {
    await countCompaniesFiltered({ tenantId: 't-1', workspaceId: 'ws-1' })
    expect(h.eq).not.toContainEqual(['status', expect.anything()])
    expect(h.ilike).toHaveLength(0)
    expect(h.inCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Page wiring — source-read
// ---------------------------------------------------------------------------

describe('TC-CP-04..06: companies page computes + passes pagination', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'companies', 'page.tsx'),
    'utf8',
  )

  it('TC-CP-04: derives total via countCompaniesFiltered with the shared filter opts', () => {
    expect(src).toContain('countCompaniesFiltered(ctx, filterOpts)')
    expect(src).toContain('const filterOpts =')
  })

  it('TC-CP-05: computes totalPages and shows the total in the header', () => {
    expect(src).toContain('Math.max(1, Math.ceil(total / pageSize))')
    expect(src).toContain('{total} records')
  })

  it('TC-CP-06: passes pagination props to CompaniesTable', () => {
    expect(src).toContain('total={total}')
    expect(src).toContain('currentPage={currentPage}')
    expect(src).toContain('pageSize={pageSize}')
    expect(src).toContain('totalPages={totalPages}')
  })
})

// ---------------------------------------------------------------------------
// CompaniesTable controls — source-read
// ---------------------------------------------------------------------------

describe('TC-CP-07..09: CompaniesTable pagination controls', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'companies', 'CompaniesTable.tsx'),
    'utf8',
  )

  it('TC-CP-07: renders Prev/Next + page-of label, disabled at bounds', () => {
    expect(src).toContain('Prev')
    expect(src).toContain('Next')
    expect(src).toContain('Page {currentPage} of {totalPages}')
    expect(src).toContain('disabled={currentPage <= 1}')
    expect(src).toContain('disabled={currentPage >= totalPages}')
  })

  it('TC-CP-08: paging goes through navigate (preserving params) via the page param', () => {
    expect(src).toContain('function goToPage(')
    expect(src).toContain("navigate({ page:")
  })

  it('TC-CP-09: navigate does not carry page → filter/sort reset to page 1', () => {
    // The param-merge object must not include a page key, so handleFilterChange /
    // handleSort (which call navigate without a page override) drop it.
    const navStart = src.indexOf('function navigate(')
    const navBody = src.slice(navStart, navStart + 500)
    expect(navBody).not.toContain('page:')
  })
})
