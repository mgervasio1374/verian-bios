// CRM — Slice U1: contact editing, phone formatting, primary-contact option
// TC-U1-01 through TC-U1-06
//
// formatPhone/normalizePhone tests are behavioral (pure helpers, imported and
// called). Everything else is source-read. No Supabase. No model calls.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatPhone, normalizePhone } from '@/lib/format'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const CONTACT_ACTIONS = 'modules/crm/actions/contact.actions.ts'
const ADD_CONTACT     = 'app/(workspace)/[workspaceSlug]/contacts/AddContactDialog.tsx'
const EDIT_CONTACT    = 'app/(workspace)/[workspaceSlug]/contacts/EditContactDialog.tsx'
const CONTACTS_PAGE   = 'app/(workspace)/[workspaceSlug]/contacts/page.tsx'
const DETAIL_PAGE     = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'
const ADD_COMPANY     = 'app/(workspace)/[workspaceSlug]/companies/AddCompanyDialog.tsx'
const EDIT_COMPANY    = 'app/(workspace)/[workspaceSlug]/companies/[id]/CompanyEditDialog.tsx'

// ---------------------------------------------------------------------------
// TC-U1-01: formatPhone / normalizePhone (behavioral)
// ---------------------------------------------------------------------------

describe('TC-U1-01: formatPhone behavior', () => {
  it('formats 10 digits as AAA-BBB-CCCC', () => {
    expect(formatPhone('5555520725')).toBe('555-552-0725')
  })

  it('strips punctuation before formatting', () => {
    expect(formatPhone('(555) 552-0725')).toBe('555-552-0725')
    expect(formatPhone('555.552.0725')).toBe('555-552-0725')
  })

  it('drops a leading 1 on 11-digit numbers', () => {
    expect(formatPhone('15555520725')).toBe('555-552-0725')
    expect(formatPhone('+1 555 552 0725')).toBe('555-552-0725')
  })

  it('returns anything else unchanged — never lose data', () => {
    expect(formatPhone('123')).toBe('123')
    expect(formatPhone('555-0725 ext. 12')).toBe('555-0725 ext. 12')
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(formatPhone(null)).toBe('')
    expect(formatPhone(undefined)).toBe('')
    expect(formatPhone('')).toBe('')
  })
})

describe('TC-U1-02: normalizePhone behavior', () => {
  it('returns digits only', () => {
    expect(normalizePhone('(555) 552-0725')).toBe('5555520725')
    expect(normalizePhone('+1 555.552.0725')).toBe('15555520725')
    expect(normalizePhone('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// TC-U1-03: updateContactFromDialogAction
// ---------------------------------------------------------------------------

describe('TC-U1-03: updateContactFromDialogAction (source-read)', () => {
  const actions = read(CONTACT_ACTIONS)
  const idx     = actions.indexOf('export async function updateContactFromDialogAction')
  const body    = actions.slice(idx)

  it('exists and goes through contactService.updateContact', () => {
    expect(idx).toBeGreaterThan(-1)
    expect(body).toContain('contactService.updateContact(ctx, contactId,')
  })

  it('passes is_primary_contact through', () => {
    expect(body).toContain('is_primary_contact: input.isPrimaryContact ?? false')
  })

  it('revalidates the contacts page and company detail pages', () => {
    expect(body).toContain("revalidatePath('/[workspaceSlug]/contacts', 'page')")
    expect(body).toContain("revalidatePath('/[workspaceSlug]/companies/[id]', 'page')")
  })

  it('create action also accepts and persists isPrimaryContact', () => {
    const createIdx  = actions.indexOf('export async function createContactFromDialogAction')
    const createBody = actions.slice(createIdx, idx)
    expect(createBody).toContain('isPrimaryContact?: boolean')
    expect(createBody).toContain('is_primary_contact: input.isPrimaryContact ?? false')
  })
})

// ---------------------------------------------------------------------------
// TC-U1-04: EditContactDialog
// ---------------------------------------------------------------------------

describe('TC-U1-04: EditContactDialog (source-read)', () => {
  const dialog = read(EDIT_CONTACT)

  it('pre-fills form state from the contact row', () => {
    expect(dialog).toContain('function contactToForm')
    expect(dialog).toContain('useState(() => contactToForm(contact))')
    expect(dialog).toContain('useState(contact.is_primary_contact)')
  })

  it('calls updateContactFromDialogAction with the contact id', () => {
    expect(dialog).toContain('updateContactFromDialogAction(contact.id,')
  })

  it('normalizes phone on submit', () => {
    expect(dialog).toContain('phone:            normalizePhone(form.phone)')
  })

  it('supports fixedCompany pinning like AddContactDialog', () => {
    expect(dialog).toContain('fixedCompany?: Company')
    expect(dialog).toContain('fixedCompany?.id ?? (form.companyId || undefined)')
  })
})

// ---------------------------------------------------------------------------
// TC-U1-05: primary-contact checkbox in both dialogs
// ---------------------------------------------------------------------------

describe('TC-U1-05: primary-contact checkbox (source-read)', () => {
  it('AddContactDialog renders the checkbox and passes the flag', () => {
    const add = read(ADD_CONTACT)
    expect(add).toContain('Is primary contact')
    expect(add).toContain('isPrimaryContact: isPrimary')
  })

  it('EditContactDialog renders the checkbox and passes the flag', () => {
    const edit = read(EDIT_CONTACT)
    expect(edit).toContain('Is primary contact')
    expect(edit).toContain('isPrimaryContact: isPrimary')
  })

  it('company detail Contacts card badges primaries from the field', () => {
    const page = read(DETAIL_PAGE)
    expect(page).toContain('c.is_primary_contact &&')
    expect(page).toContain('>Primary</span>')
  })
})

// ---------------------------------------------------------------------------
// TC-U1-06: display sites format, dialogs normalize, edit affordances wired
// ---------------------------------------------------------------------------

describe('TC-U1-06: phone display/storage and edit surfacing (source-read)', () => {
  it('contacts page formats the phone column', () => {
    const page = read(CONTACTS_PAGE)
    expect(page).toContain('formatPhone(c.phone)')
  })

  it('company detail page formats the company phone and contact phones', () => {
    const page = read(DETAIL_PAGE)
    expect(page).toContain('formatPhone(company.phone)')
    expect(page).toContain('formatPhone(c.phone)')
  })

  it('contact dialogs normalize phone for storage', () => {
    expect(read(ADD_CONTACT)).toContain('normalizePhone(form.phone)')
    expect(read(EDIT_CONTACT)).toContain('normalizePhone(form.phone)')
  })

  it('company dialogs normalize phone for storage', () => {
    expect(read(ADD_COMPANY)).toContain('normalizePhone(form.phone)')
    expect(read(EDIT_COMPANY)).toContain('normalizePhone(form.phone)')
  })

  it('contacts page rows render EditContactDialog with companies', () => {
    const page = read(CONTACTS_PAGE)
    expect(page).toContain('<EditContactDialog')
    expect(page).toContain('companies={companies.map(')
  })

  it('company detail Contacts card renders EditContactDialog pinned to the company', () => {
    const page = read(DETAIL_PAGE)
    expect(page).toContain('<EditContactDialog')
    expect(page).toContain('fixedCompany={{ id: company.id, name: company.name }}')
  })
})
