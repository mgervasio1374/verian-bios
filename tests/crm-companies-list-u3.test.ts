// CRM — Slice U3: Companies list — marketing-status column, sorting, filters
// TC-U3-01 through TC-U3-06
//
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const ASSIGNMENT_REPO = 'modules/messaging/repositories/campaign-assignment.repo.ts'
const COMPANY_REPO    = 'modules/crm/repositories/company.repo.ts'
const CONSTANTS       = 'modules/crm/constants.ts'
const PAGE            = 'app/(workspace)/[workspaceSlug]/companies/page.tsx'
const TABLE           = 'app/(workspace)/[workspaceSlug]/companies/CompaniesTable.tsx'
const ADD_COMPANY     = 'app/(workspace)/[workspaceSlug]/companies/AddCompanyDialog.tsx'
const EDIT_COMPANY    = 'app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx'

// ---------------------------------------------------------------------------
// TC-U3-01: marketing-status rollup
// ---------------------------------------------------------------------------

describe('TC-U3-01: getCompaniesInActiveCampaigns rollup (source-read)', () => {
  const repo = read(ASSIGNMENT_REPO)
  const idx  = repo.indexOf('export async function getCompaniesInActiveCampaigns')
  const body = repo.slice(idx)

  it('exists and returns a Set of company ids', () => {
    expect(idx).toBeGreaterThan(-1)
    expect(body).toContain('Promise<Set<string>>')
  })

  it('filters to active assignment statuses only', () => {
    expect(body).toContain(".in('assignment_status', ['proposed', 'assigned'])")
  })

  it('resolves companies via the contact path', () => {
    expect(body).toContain(".from('contacts')")
    expect(body).toContain(".in('id', contactIds)")
  })

  it('resolves companies via the lead path (legacy lead-scoped campaigns)', () => {
    expect(body).toContain(".from('leads')")
    expect(body).toContain(".in('id', leadIds)")
  })

  it('intersects with the passed page of company ids', () => {
    expect(body).toContain('companyIds.filter(id => companiesInCampaigns.has(id))')
  })
})

// ---------------------------------------------------------------------------
// TC-U3-02: listCompanies sorting whitelist
// ---------------------------------------------------------------------------

describe('TC-U3-02: listCompanies sort whitelist (source-read)', () => {
  const repo = read(COMPANY_REPO)

  it('declares the whitelist of orderable columns', () => {
    expect(repo).toContain(
      "const COMPANY_ORDERABLE_COLUMNS = ['name', 'industry', 'city', 'status', 'source', 'created_at'] as const"
    )
  })

  it('.order() only ever receives a whitelisted value', () => {
    // orderBy falls back to created_at unless whitelisted; .order uses the validated variable
    expect(repo).toContain("(COMPANY_ORDERABLE_COLUMNS as readonly string[]).includes(opts.orderBy ?? '')")
    expect(repo).toContain('.order(orderBy, { ascending })')
    // The raw option is never interpolated into .order directly
    expect(repo).not.toContain('.order(opts.orderBy')
  })

  it('default ordering stays created_at desc', () => {
    expect(repo).toContain("'created_at'")
    expect(repo).toContain('// default stays created_at desc')
  })

  it('supports the industry filter alongside status', () => {
    expect(repo).toContain("if (opts.industry) query = query.eq('industry', opts.industry)")
  })
})

// ---------------------------------------------------------------------------
// TC-U3-03: sortable headers
// ---------------------------------------------------------------------------

describe('TC-U3-03: CompaniesTable sortable headers (source-read)', () => {
  const table = read(TABLE)

  it('maps header labels to whitelisted columns (Location -> city)', () => {
    expect(table).toContain("{ label: 'Location', column: 'city' }")
    for (const col of ['name', 'industry', 'status', 'source']) {
      expect(table).toContain(`column: '${col}'`)
    }
  })

  it('clicking a header sorts, toggling direction on the active column', () => {
    expect(table).toContain('function handleSort(column: string)')
    expect(table).toContain("activeSort === column && activeDir === 'asc' ? 'desc' : 'asc'")
    expect(table).toContain('handleSort(col.column)')
  })

  it('shows the direction indicator on the active column', () => {
    expect(table).toContain("activeDir === 'asc' ? ' ▲' : ' ▼'")
  })

  it('navigation preserves the other params', () => {
    const idx  = table.indexOf('function navigate')
    const body = table.slice(idx, idx + 800)
    for (const key of ['search', 'segment', 'status', 'industry', 'sort']) {
      expect(body).toContain(key)
    }
    expect(body).toContain('router.push')
  })

  it('Marketing header is plain (not sortable)', () => {
    expect(table).toContain('>Marketing</th>')
    expect(table).not.toContain("column: 'marketing'")
  })
})

// ---------------------------------------------------------------------------
// TC-U3-04: status/industry filters
// ---------------------------------------------------------------------------

describe('TC-U3-04: status and industry filters (source-read)', () => {
  const table = read(TABLE)
  const page  = read(PAGE)

  it('renders the Status select with the shared options', () => {
    expect(table).toContain('status-filter')
    expect(table).toContain('COMPANY_STATUS_OPTIONS.map')
  })

  it('renders the Industry select from the shared INDUSTRY_OPTIONS', () => {
    expect(table).toContain('industry-filter')
    expect(table).toContain('INDUSTRY_OPTIONS.map')
  })

  it('option constants live in one shared module used by table and dialogs', () => {
    const constants = read(CONSTANTS)
    expect(constants).toContain('export const INDUSTRY_OPTIONS')
    expect(constants).toContain('export const COMPANY_STATUS_OPTIONS')
    expect(table).toContain("from '@/modules/crm/constants'")
    expect(read(ADD_COMPANY)).toContain("from '@/modules/crm/constants'")
    expect(read(EDIT_COMPANY)).toContain("from '@/modules/crm/constants'")
  })

  it('changing any filter clears the selection set', () => {
    const idx  = table.indexOf('function handleFilterChange')
    const body = table.slice(idx, idx + 300)
    expect(body).toContain('setSelectedIds(new Set())')
  })

  it('page applies status/industry server-side through listCompanies', () => {
    expect(page).toContain('status,')
    expect(page).toContain('industry,')
    expect(page).toContain('orderBy:  sort')
  })
})

// ---------------------------------------------------------------------------
// TC-U3-05: Marketing column
// ---------------------------------------------------------------------------

describe('TC-U3-05: Marketing column (source-read)', () => {
  const table = read(TABLE)
  const page  = read(PAGE)

  it('page computes the rollup for the displayed page and passes an array', () => {
    expect(page).toContain('getCompaniesInActiveCampaigns(')
    expect(page).toContain('companies.map(c => c.id)')
    expect(page).toContain('inCampaignIds={[...inCampaign]}')
  })

  it('badge is gated on rollup membership', () => {
    expect(table).toContain('inCampaign.has(c.id)')
    expect(table).toContain('In campaign')
  })

  it('badge uses the teal style like status badges', () => {
    const idx  = table.indexOf('In campaign')
    const near = table.slice(idx - 300, idx)
    expect(near).toContain('bg-teal-50 text-teal-700 border border-teal-200')
  })
})
