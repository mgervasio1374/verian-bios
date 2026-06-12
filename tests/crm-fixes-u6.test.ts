// CRM — Slice U6: artifacts bucket migration, company-profile segment
// management, strict 10-digit phone validation
// TC-U6-01 through TC-U6-06
//
// validatePhone tests are behavioral (imported + called). Everything else is
// source-read. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { validatePhone } from '@/lib/format'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const MIGRATION       = 'supabase/migrations/20240049_artifacts_storage_bucket.sql'
const SEGMENT_REPO    = 'modules/crm/repositories/segment.repo.ts'
const SEGMENT_SERVICE = 'modules/crm/services/segment.service.ts'
const SEGMENT_ACTIONS = 'modules/crm/actions/segment.actions.ts'
const SEGMENTS_ROW    = 'app/(workspace)/[workspaceSlug]/companies/[id]/CompanySegmentsRow.tsx'
const DETAIL_PAGE     = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'
const CONTACT_ACTIONS = 'modules/crm/actions/contact.actions.ts'
const COMPANY_ACTIONS = 'modules/crm/actions/company.actions.ts'

const DIALOGS = [
  'app/(workspace)/[workspaceSlug]/contacts/AddContactDialog.tsx',
  'app/(workspace)/[workspaceSlug]/contacts/EditContactDialog.tsx',
  'app/(workspace)/[workspaceSlug]/companies/AddCompanyDialog.tsx',
  'app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx',
]

// ---------------------------------------------------------------------------
// TC-U6-01: artifacts bucket migration
// ---------------------------------------------------------------------------

describe('TC-U6-01: migration 20240049 artifacts bucket (source-read)', () => {
  it('migration file exists', () => {
    expect(existsSync(join(process.cwd(), MIGRATION))).toBe(true)
  })

  const sql = read(MIGRATION)

  it('inserts the artifacts bucket idempotently', () => {
    expect(sql).toContain('INSERT INTO storage.buckets')
    expect(sql).toContain("'artifacts'")
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING')
  })

  it('is private with the 20 MB limit and the upload whitelist', () => {
    expect(sql).toContain('false')
    expect(sql).toContain('20971520')
    expect(sql).toContain("'application/pdf'")
    expect(sql).toContain("'text/csv'")
  })
})

// ---------------------------------------------------------------------------
// TC-U6-02: validatePhone (behavioral)
// ---------------------------------------------------------------------------

describe('TC-U6-02: validatePhone behavior', () => {
  it('empty/whitespace is OK — phone is optional', () => {
    expect(validatePhone('')).toEqual({ ok: true, normalized: '' })
    expect(validatePhone('   ')).toEqual({ ok: true, normalized: '' })
  })

  it('accepts exactly 10 digits (punctuation stripped)', () => {
    expect(validatePhone('5555520725')).toEqual({ ok: true, normalized: '5555520725' })
    expect(validatePhone('(555) 552-0725')).toEqual({ ok: true, normalized: '5555520725' })
  })

  it('11 digits starting with 1 normalize to the 10', () => {
    expect(validatePhone('+1 555 552 0725')).toEqual({ ok: true, normalized: '5555520725' })
  })

  it('rejects short numbers', () => {
    expect(validatePhone('555-0725')).toEqual({ ok: false, error: 'Enter a 10-digit phone number.' })
  })

  it('rejects garbage and wrong lengths', () => {
    expect(validatePhone('abc').ok).toBe(false)
    expect(validatePhone('123456789012').ok).toBe(false)
    expect(validatePhone('25555207251').ok).toBe(false) // 11 digits, not leading 1
  })
})

// ---------------------------------------------------------------------------
// TC-U6-03: server-side enforcement in all four actions
// ---------------------------------------------------------------------------

describe('TC-U6-03: actions enforce validatePhone (source-read)', () => {
  const contactActions = read(CONTACT_ACTIONS)
  const companyActions = read(COMPANY_ACTIONS)

  it('both contact actions validate and persist the normalized phone', () => {
    const matches = contactActions.match(/validatePhone\(input\.phone\)/g) ?? []
    expect(matches.length).toBe(2)
    expect(contactActions).toContain('phoneCheck.normalized || null')
  })

  it('both company dialog actions validate and persist the normalized phone', () => {
    const matches = companyActions.match(/validatePhone\(input\.phone\)/g) ?? []
    expect(matches.length).toBe(2)
    expect(companyActions).toContain('phoneCheck.normalized      || null')
  })

  it('a failed check returns the error as a failed ActionResult', () => {
    for (const src of [contactActions, companyActions]) {
      expect(src).toContain('if (!phoneCheck.ok) return { success: false, error: phoneCheck.error }')
    }
  })
})

// ---------------------------------------------------------------------------
// TC-U6-04: client-side validation in all four dialogs
// ---------------------------------------------------------------------------

describe('TC-U6-04: dialogs validate before submit (source-read)', () => {
  it.each(DIALOGS)('%s validates phone and shows the error inline', rel => {
    const src = read(rel)
    expect(src).toContain('validatePhone(form.phone)')
    expect(src).toContain('setError(phoneCheck.error)')
    expect(src).toContain('phoneCheck.normalized')
  })
})

// ---------------------------------------------------------------------------
// TC-U6-05: segment management on the company profile
// ---------------------------------------------------------------------------

describe('TC-U6-05: company-profile segment management (source-read)', () => {
  it('repo exports listSegmentsForCompany joining through company_segments', () => {
    const repo = read(SEGMENT_REPO)
    expect(repo).toContain('export async function listSegmentsForCompany')
    expect(repo).toContain("'segment_id, segments(name)'")
  })

  it('service wraps it behind crm.companies.view', () => {
    const service = read(SEGMENT_SERVICE)
    const idx = service.indexOf('export async function listSegmentsForCompany')
    expect(idx).toBeGreaterThan(-1)
    expect(service.slice(idx, idx + 300)).toContain("requirePermission(ctx, 'crm.companies.view')")
  })

  it('segments row renders chips with remove and the add-select', () => {
    const row = read(SEGMENTS_ROW)
    expect(row).toContain('removeCompanyFromSegmentAction(segmentId, companyId)')
    expect(row).toContain('addCompanyToSegmentAction(segmentId, companyId)')
    expect(row).toContain('Add to segment…')
    expect(row).toContain('No segments')
    // only segments the company is not already in are offered
    expect(row).toContain('workspaceSegments.filter(s => !memberIds.has(s.id))')
  })

  it('detail page threads both segment lists', () => {
    const page = read(DETAIL_PAGE)
    expect(page).toContain('listSegmentsForWorkspace(ctx.tenantId, ctx.workspaceId)')
    expect(page).toContain('listSegmentsForCompany(id, ctx.tenantId)')
    expect(page).toContain('<CompanySegmentsRow')
  })
})

// ---------------------------------------------------------------------------
// TC-U6-06: add/remove actions revalidate the company detail path
// ---------------------------------------------------------------------------

describe('TC-U6-06: segment add/remove revalidate the detail page (source-read)', () => {
  const actions = read(SEGMENT_ACTIONS)

  it.each(['addCompanyToSegmentAction', 'removeCompanyFromSegmentAction'])(
    '%s revalidates the company detail path',
    fn => {
      const idx  = actions.indexOf(`export async function ${fn}`)
      const body = actions.slice(idx, idx + 900)
      expect(body).toContain("revalidatePath('/[workspaceSlug]/companies/[id]', 'page')")
    }
  )
})
