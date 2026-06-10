// MCM v2 — Slice S1: Segments foundation (model + admin page)
// TC-S1-01 through TC-S1-06
//
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const MIGRATION = 'supabase/migrations/20240048_segments_foundation.sql'
const REPO      = 'modules/crm/repositories/segment.repo.ts'
const SERVICE   = 'modules/crm/services/segment.service.ts'
const ACTIONS   = 'modules/crm/actions/segment.actions.ts'
const PAGE      = 'app/(workspace)/[workspaceSlug]/settings/segments/page.tsx'
const SIDEBAR   = 'components/layout/Sidebar.tsx'

// ---------------------------------------------------------------------------
// TC-S1-01: migration 20240048 — tables, RLS, unique name index
// ---------------------------------------------------------------------------

describe('TC-S1-01: migration 20240048 segments foundation (source-read)', () => {
  it('migration file exists', () => {
    expect(existsSync(join(process.cwd(), MIGRATION))).toBe(true)
  })

  const sql = read(MIGRATION)

  it('creates segments table with tenant/workspace scoping', () => {
    expect(sql).toContain('CREATE TABLE segments')
    expect(sql).toContain('tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE')
    expect(sql).toContain('workspace_id        uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE')
  })

  it('creates company_segments join table with composite PK and cascading FKs', () => {
    expect(sql).toContain('CREATE TABLE company_segments')
    expect(sql).toContain('PRIMARY KEY (company_id, segment_id)')
    expect(sql).toContain('REFERENCES companies(id) ON DELETE CASCADE')
    expect(sql).toContain('REFERENCES segments(id) ON DELETE CASCADE')
  })

  it('enables RLS on both tables with tenant-member SELECT + service_role ALL', () => {
    expect(sql).toContain('ALTER TABLE segments ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE company_segments ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('public.current_tenant_id()')
    expect(sql).toContain('public.is_workspace_member(workspace_id)')
    expect(sql).toContain('public.is_workspace_member(s.workspace_id)')
    expect(sql).toContain('"segments_service_role"')
    expect(sql).toContain('"company_segments_service_role"')
  })

  it('company_segments SELECT policy resolves scope through the parent segment', () => {
    expect(sql).toContain('SELECT 1 FROM segments s')
    expect(sql).toContain('s.id = segment_id')
  })

  it('has updated_at trigger on segments', () => {
    expect(sql).toContain('set_segments_updated_at')
    expect(sql).toContain('update_updated_at()')
  })

  it('has unique index on (tenant_id, workspace_id, lower(name))', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX uq_segments_workspace_name')
    expect(sql).toContain('(tenant_id, workspace_id, lower(name))')
  })

  it('has grants for authenticated SELECT and service_role ALL', () => {
    expect(sql).toContain('GRANT SELECT ON segments         TO authenticated')
    expect(sql).toContain('GRANT ALL    ON segments         TO service_role')
    expect(sql).toContain('GRANT SELECT ON company_segments TO authenticated')
    expect(sql).toContain('GRANT ALL    ON company_segments TO service_role')
  })
})

// ---------------------------------------------------------------------------
// TC-S1-02: repository exports
// ---------------------------------------------------------------------------

describe('TC-S1-02: segment.repo exports the full function surface (source-read)', () => {
  const repo = read(REPO)

  it.each([
    'insertSegment',
    'listSegmentsForWorkspace',
    'getSegmentById',
    'updateSegment',
    'deleteSegment',
    'addCompanyToSegment',
    'removeCompanyFromSegment',
    'listSegmentMembers',
    'searchCompaniesNotInSegment',
  ])('exports %s', fn => {
    expect(repo).toContain(`export async function ${fn}`)
  })

  it('uses the service client', () => {
    expect(repo).toContain('createSupabaseServiceClient')
  })

  it('listSegmentsForWorkspace includes a member count', () => {
    expect(repo).toContain('member_count')
  })
})

// ---------------------------------------------------------------------------
// TC-S1-03: addCompanyToSegment is idempotent
// ---------------------------------------------------------------------------

describe('TC-S1-03: addCompanyToSegment is idempotent (source-read)', () => {
  const repo = read(REPO)

  it('uses upsert with ignoreDuplicates on the composite PK', () => {
    const idx = repo.indexOf('export async function addCompanyToSegment')
    expect(idx).toBeGreaterThan(-1)
    const body = repo.slice(idx, idx + 700)
    expect(body).toContain('upsert')
    expect(body).toContain("onConflict: 'company_id,segment_id'")
    expect(body).toContain('ignoreDuplicates: true')
  })
})

// ---------------------------------------------------------------------------
// TC-S1-04: service enforces permissions; actions return ActionResult
// ---------------------------------------------------------------------------

describe('TC-S1-04: service permission enforcement and action shape (source-read)', () => {
  const service = read(SERVICE)
  const actions = read(ACTIONS)

  it('service uses requirePermission on every exported function', () => {
    expect(service).toContain('requirePermission')
    const exported = service.match(/export async function/g) ?? []
    const checks   = service.match(/requirePermission\(ctx,/g) ?? []
    expect(exported.length).toBeGreaterThan(0)
    expect(checks.length).toBe(exported.length)
  })

  it('service reuses seeded crm.companies permissions (no invented permission strings)', () => {
    expect(service).toContain("'crm.companies.view'")
    expect(service).toContain("'crm.companies.edit'")
    expect(service).toContain("'crm.companies.create'")
    expect(service).not.toContain('crm.segments')
  })

  it('actions are server actions returning the ActionResult shape', () => {
    expect(actions.startsWith("'use server'")).toBe(true)
    expect(actions).toContain('export type ActionResult<T = void>')
    expect(actions).toContain('{ success: true; data: T }')
    expect(actions).toContain('{ success: false; error: string }')
  })

  it.each([
    'createSegmentAction',
    'updateSegmentAction',
    'deleteSegmentAction',
    'addCompanyToSegmentAction',
    'removeCompanyFromSegmentAction',
  ])('exports %s', fn => {
    expect(actions).toContain(`export async function ${fn}`)
  })

  it('actions go through the service (not the repo directly)', () => {
    expect(actions).toContain("from '@/modules/crm/services/segment.service'")
    expect(actions).not.toContain('segmentRepo')
  })

  it('createSegmentAction validates non-empty name and maps the unique-name violation', () => {
    expect(actions).toContain('Segment name is required.')
    expect(actions).toContain('A segment with this name already exists.')
    expect(actions).toContain('uq_segments_workspace_name')
  })

  it('actions revalidate the settings page', () => {
    expect(actions).toContain('revalidatePath')
    expect(actions).toContain('/settings/segments')
  })
})

// ---------------------------------------------------------------------------
// TC-S1-05: settings page wiring
// ---------------------------------------------------------------------------

describe('TC-S1-05: segments settings page (source-read)', () => {
  const page = read(PAGE)

  it('is a server component using the request-context pattern', () => {
    expect(page).toContain('createSupabaseServerClient')
    expect(page).toContain('buildRequestContext')
    expect(page).not.toContain("'use client'")
  })

  it('loads segments via listSegmentsForWorkspace', () => {
    expect(page).toContain('listSegmentsForWorkspace')
  })

  it('renders SegmentList and NewSegmentForm', () => {
    expect(page).toContain('<SegmentList')
    expect(page).toContain('<NewSegmentForm')
  })

  it('SegmentList renders SegmentManager for the expanded segment', () => {
    const list = read('app/(workspace)/[workspaceSlug]/settings/segments/SegmentList.tsx')
    expect(list).toContain('<SegmentManager')
    expect(list).toContain('window.confirm')
  })

  it('SegmentManager wires add/remove member actions', () => {
    const manager = read('app/(workspace)/[workspaceSlug]/settings/segments/SegmentManager.tsx')
    expect(manager).toContain('addCompanyToSegmentAction')
    expect(manager).toContain('removeCompanyFromSegmentAction')
    expect(manager).toContain('searchCompaniesNotInSegmentAction')
  })
})

// ---------------------------------------------------------------------------
// TC-S1-06: sidebar navigation
// ---------------------------------------------------------------------------

describe('TC-S1-06: sidebar contains the Segments link (source-read)', () => {
  const sidebar = read(SIDEBAR)

  it('has a Segments nav item pointing at settings/segments', () => {
    expect(sidebar).toContain("label: 'Segments'")
    expect(sidebar).toContain('/settings/segments')
  })

  it('uses the Tags lucide icon', () => {
    expect(sidebar).toContain('Tags')
    expect(sidebar).toContain('<Tags className="h-4 w-4" />')
  })
})
