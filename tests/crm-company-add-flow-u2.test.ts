// CRM — Slice U2: Add-Company flow — segment at creation + optional lead
// TC-U2-01 through TC-U2-04
//
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const COMPANY_ACTIONS = 'modules/crm/actions/company.actions.ts'
const ADD_COMPANY     = 'app/(workspace)/[workspaceSlug]/companies/AddCompanyDialog.tsx'
const COMPANIES_PAGE  = 'app/(workspace)/[workspaceSlug]/companies/page.tsx'

// ---------------------------------------------------------------------------
// TC-U2-01: action accepts segmentId/createLead and wires the services
// ---------------------------------------------------------------------------

describe('TC-U2-01: createCompanyFromDialogAction follow-on steps (source-read)', () => {
  const actions = read(COMPANY_ACTIONS)
  const idx     = actions.indexOf('export async function createCompanyFromDialogAction')
  const body    = actions.slice(idx, actions.indexOf('export async function updateCompanyFromDialogAction'))

  it('accepts optional segmentId and createLead', () => {
    expect(body).toContain('segmentId?:     string')
    expect(body).toContain('createLead?:    boolean')
  })

  it('adds the company to the segment via the S1 segment service', () => {
    expect(actions).toContain("from '@/modules/crm/services/segment.service'")
    expect(body).toContain('segmentService.addCompanyToSegment(ctx, input.segmentId, company.id)')
  })

  it('creates the lead via the existing lead service — minimal working-list shape', () => {
    expect(actions).toContain("from '@/modules/crm/services/lead.service'")
    expect(body).toContain('leadService.createLead(ctx, {')
    expect(body).toContain("stage:      'new'")
    expect(body).toContain("priority:   'medium'")
    expect(body).toContain('company_id: company.id')
    expect(body).toContain("source:     parsed.data.source ?? 'manual'")
  })

  it('does not duplicate insert logic — no raw leads insert in the action file', () => {
    expect(actions).not.toContain(".from('leads')")
  })

  it('follow-on failures are non-fatal warnings, not create failures', () => {
    expect(body).toContain('const warnings: string[] = []')
    expect(body).toContain('warnings.push(')
    expect(body).toContain('ActionResult<{ id: string; warnings?: string[] }>')
    // Both follow-on steps are individually try/caught
    const tryCount = (body.match(/try \{/g) ?? []).length
    expect(tryCount).toBeGreaterThanOrEqual(3) // outer + segment + lead
  })

  it('lead creation is opt-in (guarded by input.createLead)', () => {
    expect(body).toContain('if (input.createLead) {')
  })
})

// ---------------------------------------------------------------------------
// TC-U2-02: dialog renders the segment select
// ---------------------------------------------------------------------------

describe('TC-U2-02: AddCompanyDialog segment select (source-read)', () => {
  const dialog = read(ADD_COMPANY)

  it('accepts a segments prop', () => {
    expect(dialog).toContain('segments?:     SegmentOption[]')
  })

  it('renders the select with the no-segment default option', () => {
    expect(dialog).toContain('— No segment —')
    expect(dialog).toContain('ac-segment')
    expect(dialog).toContain('segments.map(s => (')
  })

  it('passes segmentId to the action only when chosen', () => {
    expect(dialog).toContain('segmentId:  segmentId || undefined')
  })
})

// ---------------------------------------------------------------------------
// TC-U2-03: dialog renders the opt-in lead checkbox
// ---------------------------------------------------------------------------

describe('TC-U2-03: AddCompanyDialog lead checkbox (source-read)', () => {
  const dialog = read(ADD_COMPANY)

  it('renders the checkbox with the working-list helper text', () => {
    expect(dialog).toContain('Also create a lead for this company')
    expect(dialog).toContain('Leave unchecked for imports/reference companies — keep Leads a working list.')
  })

  it('defaults unchecked and resets on close', () => {
    expect(dialog).toContain('useState(false)')
    expect(dialog).toContain('setCreateLead(false)')
  })

  it('passes createLead to the action', () => {
    expect(dialog).toContain('createLead,')
  })
})

// ---------------------------------------------------------------------------
// TC-U2-04: segments threaded from the companies page
// ---------------------------------------------------------------------------

describe('TC-U2-04: companies page threads segments into the dialog (source-read)', () => {
  const page = read(COMPANIES_PAGE)

  it('passes the loaded workspace segments as the dialog prop', () => {
    expect(page).toContain('segments={segments.map(s => ({ id: s.id, name: s.name }))}')
  })
})
