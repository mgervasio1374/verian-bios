// MCM v2 — Slice S2: Companies list — segment filter, multi-select, bulk add-to-segment
// TC-S2-01 through TC-S2-06
//
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const REPO    = 'modules/crm/repositories/segment.repo.ts'
const SERVICE = 'modules/crm/services/segment.service.ts'
const ACTIONS = 'modules/crm/actions/segment.actions.ts'
const PAGE    = 'app/(workspace)/[workspaceSlug]/companies/page.tsx'
const TABLE   = 'app/(workspace)/[workspaceSlug]/companies/CompaniesTable.tsx'

// ---------------------------------------------------------------------------
// TC-S2-01: repository — bulk functions, idempotent upsert
// ---------------------------------------------------------------------------

describe('TC-S2-01: segment.repo bulk functions (source-read)', () => {
  const repo = read(REPO)

  it('exports listCompanyIdsForSegment', () => {
    expect(repo).toContain('export async function listCompanyIdsForSegment')
  })

  it('exports addCompaniesToSegment', () => {
    expect(repo).toContain('export async function addCompaniesToSegment')
  })

  it('bulk add is one idempotent upsert on the composite PK', () => {
    const idx = repo.indexOf('export async function addCompaniesToSegment')
    expect(idx).toBeGreaterThan(-1)
    const body = repo.slice(idx, idx + 900)
    expect(body).toContain('upsert')
    expect(body).toContain("onConflict: 'company_id,segment_id'")
    expect(body).toContain('ignoreDuplicates: true')
  })

  it('bulk add no-ops on an empty batch', () => {
    const idx  = repo.indexOf('export async function addCompaniesToSegment')
    const body = repo.slice(idx, idx + 900)
    expect(body).toContain('companyIds.length === 0')
  })
})

// ---------------------------------------------------------------------------
// TC-S2-02: service — permission + batch cap
// ---------------------------------------------------------------------------

describe('TC-S2-02: segment.service bulk add (source-read)', () => {
  const service = read(SERVICE)

  it('exports addCompaniesToSegment requiring crm.companies.edit', () => {
    const idx = service.indexOf('export async function addCompaniesToSegment')
    expect(idx).toBeGreaterThan(-1)
    const body = service.slice(idx, idx + 700)
    expect(body).toContain("requirePermission(ctx, 'crm.companies.edit')")
  })

  it('caps the batch at 500 with a friendly error', () => {
    expect(service).toContain('MAX_BULK_ADD_COMPANIES = 500')
    const idx  = service.indexOf('export async function addCompaniesToSegment')
    const body = service.slice(idx, idx + 700)
    expect(body).toContain('MAX_BULK_ADD_COMPANIES')
  })

  it('verifies the segment exists before writing', () => {
    const idx  = service.indexOf('export async function addCompaniesToSegment')
    const body = service.slice(idx, idx + 900)
    expect(body).toContain('getSegmentById')
    expect(body).toContain("NotFoundError('Segment')")
  })

  it('exports listCompanyIdsForSegment requiring crm.companies.view', () => {
    const idx = service.indexOf('export async function listCompanyIdsForSegment')
    expect(idx).toBeGreaterThan(-1)
    const body = service.slice(idx, idx + 500)
    expect(body).toContain("requirePermission(ctx, 'crm.companies.view')")
  })
})

// ---------------------------------------------------------------------------
// TC-S2-03: action — validation + revalidation of both paths
// ---------------------------------------------------------------------------

describe('TC-S2-03: addCompaniesToSegmentAction (source-read)', () => {
  const actions = read(ACTIONS)

  it('exports addCompaniesToSegmentAction returning ActionResult<{ added: number }>', () => {
    expect(actions).toContain('export async function addCompaniesToSegmentAction')
    expect(actions).toContain('ActionResult<{ added: number }>')
  })

  it('rejects an empty selection', () => {
    const idx  = actions.indexOf('export async function addCompaniesToSegmentAction')
    const body = actions.slice(idx, idx + 1000)
    expect(body).toContain('companyIds.length === 0')
    expect(body).toContain('Select at least one company.')
  })

  it('revalidates both the companies page and the segments settings page', () => {
    const idx  = actions.indexOf('export async function addCompaniesToSegmentAction')
    const body = actions.slice(idx, idx + 1000)
    expect(body).toContain("revalidatePath('/[workspaceSlug]/companies', 'page')")
    expect(body).toContain('revalidatePath(SETTINGS_PATH')
  })
})

// ---------------------------------------------------------------------------
// TC-S2-04: companies page — segment searchParam + segments load
// ---------------------------------------------------------------------------

describe('TC-S2-04: companies page wiring (source-read)', () => {
  const page = read(PAGE)

  it('stays a server component', () => {
    expect(page).not.toContain("'use client'")
    expect(page).toContain('createSupabaseServerClient')
    expect(page).toContain('buildRequestContext')
  })

  it('reads the segment searchParam alongside search (U3 added more params)', () => {
    expect(page).toContain('segment?: string')
    expect(page).toContain('const { search, page, segment, status, industry, customer, sort, dir } = await searchParams')
  })

  it('filters companies by segment membership ids (AND with search)', () => {
    expect(page).toContain('listCompanyIdsForSegment')
    expect(page).toContain('ids')
  })

  it('an empty segment yields an empty list without a companies query', () => {
    expect(page).toContain('ids.length === 0')
  })

  it('loads segments for the dropdown and renders CompaniesTable', () => {
    expect(page).toContain('listSegmentsForWorkspace')
    expect(page).toContain('<CompaniesTable')
  })
})

// ---------------------------------------------------------------------------
// TC-S2-05: CompaniesTable — select-all, filter select, gated toolbar
// ---------------------------------------------------------------------------

describe('TC-S2-05: CompaniesTable client component (source-read)', () => {
  const table = read(TABLE)

  it('is a client component using house state conventions', () => {
    expect(table.startsWith("'use client'")).toBe(true)
    expect(table).toContain('useState')
    expect(table).toContain('useTransition')
  })

  it('has a header select-all checkbox over the displayed rows', () => {
    expect(table).toContain('toggleSelectAll')
    expect(table).toContain('Select all companies')
    expect(table).toContain('allSelected')
  })

  it('has per-row selection checkboxes', () => {
    expect(table).toContain('toggleSelected')
    expect(table).toContain('selectedIds.has(c.id)')
  })

  it('segment filter navigates via router.push, preserving the other params (U3 generalized navigate())', () => {
    expect(table).toContain('router.push')
    expect(table).toContain("handleFilterChange('segment', e.target.value)")
    // navigate() merges current params (search, segment, status, industry, sort) before overrides
    expect(table).toContain('segment:  activeSegmentId')
    expect(table).toContain('search,')
  })

  it('bulk toolbar is gated on selection count and calls addCompaniesToSegmentAction', () => {
    expect(table).toContain('selectedIds.size > 0 &&')
    expect(table).toContain('selected</span>')
    expect(table).toContain('addCompaniesToSegmentAction')
  })

  it('clears selection and refreshes on success', () => {
    expect(table).toContain('setSelectedIds(new Set())')
    expect(table).toContain('router.refresh()')
  })

  it('preserves the existing columns and row links (U3 made headers sortable buttons)', () => {
    for (const col of ['Name', 'Industry', 'Location', 'Status', 'Source']) {
      expect(table).toContain(`label: '${col}'`)
    }
    expect(table).toContain('companies/${c.id}')
  })
})

// ---------------------------------------------------------------------------
// TC-S2-06: scope guard — campaign surface in CompaniesTable is limited to the
// S3 bulk-assign action (no sequence/send/draft module imports)
// ---------------------------------------------------------------------------

describe('TC-S2-06: scope guard — campaign imports in CompaniesTable limited to bulkAssignCampaignAction (source-read)', () => {
  const table = read(TABLE)

  it('the only campaign import is bulkAssignCampaignAction from campaign-assignment.actions', () => {
    const campaignImports = (table.match(/import[^\n]*campaign[^\n]*/gi) ?? [])
    expect(campaignImports).toHaveLength(1)
    expect(campaignImports[0]).toContain('bulkAssignCampaignAction')
    expect(campaignImports[0]).toContain('campaign-assignment.actions')
  })

  it('does not import sequence services, send, or draft modules (V5 allows the pure schedule-timing helper)', () => {
    expect(table).not.toContain('campaign-sequence/services')
    expect(table).not.toContain('campaign-sequence/repositories')
    expect(table).not.toContain('campaign-sequence/actions')
    expect(table).not.toContain('email-draft')
    expect(table).not.toContain('send-bridge')
    expect(table).not.toContain('sendFollowUp')
    // the only campaign-sequence import is the pure, client-safe timing helper
    expect(table).toContain("from '@/modules/campaign-sequence/schedule-timing'")
  })
})
