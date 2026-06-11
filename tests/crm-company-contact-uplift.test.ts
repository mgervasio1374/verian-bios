// CRM — company create/contacts UX uplift
// TC-CCU-01 through TC-CCU-05
//
// Full Add-Company field set + add contacts from the company detail page.
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const COMPANY_ACTIONS = 'modules/crm/actions/company.actions.ts'
const ADD_COMPANY     = 'app/(workspace)/[workspaceSlug]/companies/AddCompanyDialog.tsx'
const EDIT_COMPANY    = 'app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx'
const ADD_CONTACT     = 'app/(workspace)/[workspaceSlug]/contacts/AddContactDialog.tsx'
const COMPANIES_PAGE  = 'app/(workspace)/[workspaceSlug]/companies/page.tsx'
const DETAIL_PAGE     = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'

const FULL_FIELDS = [
  'status',
  'domain',
  'source',
  'address_line1',
  'address_line2',
  'zip',
  'country',
  'employee_count',
  'annual_revenue',
]

// ---------------------------------------------------------------------------
// TC-CCU-01: create action accepts and passes the full field set
// ---------------------------------------------------------------------------

describe('TC-CCU-01: createCompanyFromDialogAction full field set (source-read)', () => {
  const actions = read(COMPANY_ACTIONS)
  const idx     = actions.indexOf('export async function createCompanyFromDialogAction')
  const body    = actions.slice(idx, actions.indexOf('export async function updateCompanyFromDialogAction'))

  it('input signature includes every edit-dialog field', () => {
    for (const field of FULL_FIELDS) {
      expect(body).toContain(field)
    }
  })

  it('validates through createCompanySchema (coerces employee_count/annual_revenue)', () => {
    expect(body).toContain('createCompanySchema.safeParse')
  })

  it('only name is required', () => {
    expect(body).toContain("if (!input.name.trim()) return { success: false, error: 'Company name is required.' }")
  })

  it('returns the created company id', () => {
    expect(body).toContain("ActionResult<{ id: string }>")
    expect(body).toContain('data: { id: company.id }')
  })
})

// ---------------------------------------------------------------------------
// TC-CCU-02: AddCompanyDialog renders the same fields as CompanyEditDialog
// ---------------------------------------------------------------------------

describe('TC-CCU-02: AddCompanyDialog matches the edit dialog field set (source-read)', () => {
  const add  = read(ADD_COMPANY)
  const edit = read(EDIT_COMPANY)

  it.each(FULL_FIELDS)('renders %s like the edit dialog', field => {
    expect(add).toContain(field)
    expect(edit).toContain(field)
  })

  it('uses the same status options as the edit dialog', () => {
    for (const status of ["'active'", "'inactive'", "'prospect'", "'churned'"]) {
      expect(add).toContain(status)
    }
  })

  it('uses the same grid grouping and Source placeholder as the edit dialog', () => {
    expect(add).toContain('grid grid-cols-2 gap-3')
    expect(add).toContain('grid grid-cols-3 gap-3')
    expect(add).toContain('e.g. Referral')
  })

  it('only name is marked required', () => {
    const requiredMarks = add.match(/text-red-500/g) ?? []
    expect(requiredMarks).toHaveLength(1)
    expect(add).toContain('Company Name <span className="text-red-500">*</span>')
  })
})

// ---------------------------------------------------------------------------
// TC-CCU-03: AddCompanyDialog lands on the new company's detail page
// ---------------------------------------------------------------------------

describe('TC-CCU-03: create flow pushes to the new company page (source-read)', () => {
  const add  = read(ADD_COMPANY)
  const page = read(COMPANIES_PAGE)

  it('pushes to the company detail route with the returned id', () => {
    expect(add).toContain('router.push(`/${workspaceSlug}/companies/${result.data.id}`)')
  })

  it('takes workspaceSlug as a prop, passed by the companies page', () => {
    expect(add).toContain('workspaceSlug: string')
    expect(page).toContain('<AddCompanyDialog workspaceSlug={workspaceSlug} />')
  })
})

// ---------------------------------------------------------------------------
// TC-CCU-04: AddContactDialog supports fixedCompany without breaking
// its Contacts-page usage
// ---------------------------------------------------------------------------

describe('TC-CCU-04: AddContactDialog fixedCompany support (source-read)', () => {
  const dialog = read(ADD_CONTACT)

  it('accepts an optional fixedCompany prop', () => {
    expect(dialog).toContain('fixedCompany?: Company')
  })

  it('shows the company as static text when pinned (no select)', () => {
    expect(dialog).toContain('{fixedCompany.name}')
    expect(dialog).toContain('!fixedCompany && companies.length > 0')
  })

  it('still renders the company select for the Contacts page (no fixedCompany)', () => {
    expect(dialog).toContain('ct-company')
    expect(dialog).toContain('companies.map(c => (')
  })

  it('pinned company wins when passing companyId to the action', () => {
    expect(dialog).toContain('fixedCompany?.id ?? (form.companyId || undefined)')
  })
})

// ---------------------------------------------------------------------------
// TC-CCU-05: company detail page wires the Add Contact button
// ---------------------------------------------------------------------------

describe('TC-CCU-05: company detail page Add Contact (source-read)', () => {
  const page = read(DETAIL_PAGE)

  it('imports AddContactDialog', () => {
    expect(page).toContain("import { AddContactDialog } from '../../contacts/AddContactDialog'")
  })

  it('renders it in the Contacts card header with fixedCompany set', () => {
    expect(page).toContain('<AddContactDialog fixedCompany={{ id: company.id, name: company.name }} />')
  })
})
