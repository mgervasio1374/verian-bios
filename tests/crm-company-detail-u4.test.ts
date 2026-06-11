// CRM — Slice U4: company detail — Campaigns card + delete company with contacts
// TC-U4-01 through TC-U4-05
//
// Source-reading tests only. No Supabase connection. No model calls. No DB writes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const ASSIGNMENT_REPO = 'modules/messaging/repositories/campaign-assignment.repo.ts'
const COMPANY_ACTIONS = 'modules/crm/actions/company.actions.ts'
const DETAIL_PAGE     = 'app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx'
const DELETE_BUTTON   = 'app/(workspace)/[workspaceSlug]/companies/[id]/DeleteCompanyButton.tsx'

// ---------------------------------------------------------------------------
// TC-U4-01: per-company rollup — both paths, dispatched sends only
// ---------------------------------------------------------------------------

describe('TC-U4-01: listAssignmentsForCompany rollup (source-read)', () => {
  const repo = read(ASSIGNMENT_REPO)
  const idx  = repo.indexOf('export async function listAssignmentsForCompany')
  const body = repo.slice(idx)

  it('exists and returns the rollup shape', () => {
    expect(idx).toBeGreaterThan(-1)
    expect(repo).toContain('export interface CompanyAssignmentRollup')
    for (const field of ['campaign_type', 'sequence_name', 'assignment_status', 'created_at', 'emails_sent']) {
      expect(repo).toContain(field)
    }
  })

  it('resolves assignments via contacts AND leads of the company', () => {
    expect(body).toContain(".in('contact_id', contactIds)")
    expect(body).toContain(".in('lead_id', leadIds)")
  })

  it('unions and de-dupes assignments by id', () => {
    expect(body).toContain('const byId = new Map<string, AssignmentRow>()')
  })

  it('resolves sequence names with a null-sequence fallback', () => {
    expect(body).toContain(".from('campaign_sequences')")
    expect(body).toContain("?? '—'")
  })

  it('counts only dispatched send statuses', () => {
    expect(repo).toContain("const DISPATCHED_SEND_STATUSES = ['sent', 'delivered', 'bounced', 'complained']")
    expect(body).toContain(".in('status', DISPATCHED_SEND_STATUSES)")
  })

  it('groups send counts back per assignment via the draft linkage', () => {
    expect(body).toContain(".from('email_drafts')")
    expect(body).toContain("'id, campaign_assignment_id'")
    expect(body).toContain('assignmentIdByDraftId')
  })
})

// ---------------------------------------------------------------------------
// TC-U4-02: Campaigns card
// ---------------------------------------------------------------------------

describe('TC-U4-02: company detail Campaigns card (source-read)', () => {
  const page = read(DETAIL_PAGE)

  it('loads the rollup and renders the card', () => {
    expect(page).toContain('listAssignmentsForCompany(ctx.tenantId, ctx.workspaceId, id)')
    expect(page).toContain('Campaigns ({campaignRollup.length})')
  })

  it('maps statuses to operator labels including Running', () => {
    expect(page).toContain("assigned:  { label: 'Running'")
    expect(page).toContain("proposed:  { label: 'Proposed'")
    expect(page).toContain("completed: { label: 'Completed'")
    expect(page).toContain("retired:   { label: 'Stopped'")
    expect(page).toContain("rejected:  { label: 'Rejected'")
  })

  it('renders type (humanized), sequence, assigned date, and emails sent', () => {
    expect(page).toContain('humanizeCampaignType(a.campaign_type)')
    expect(page).toContain('{a.sequence_name}')
    expect(page).toContain('new Date(a.created_at).toLocaleDateString()')
    expect(page).toContain('{a.emails_sent}')
  })

  it('has the empty state', () => {
    expect(page).toContain('No campaigns yet.')
  })
})

// ---------------------------------------------------------------------------
// TC-U4-03: delete action — guard first, soft-delete only, via services
// ---------------------------------------------------------------------------

describe('TC-U4-03: deleteCompanyAction (source-read)', () => {
  const actions = read(COMPANY_ACTIONS)
  const idx     = actions.indexOf('export async function deleteCompanyAction')
  const body    = actions.slice(idx)

  it('guards on active campaigns BEFORE any deletion', () => {
    const guardIdx  = body.indexOf('getCompaniesInActiveCampaigns')
    const deleteIdx = body.indexOf('deleteContact')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(deleteIdx)
    expect(body).toContain('This company has an active campaign. Stop the campaign(s) first, then delete.')
  })

  it('deletes contacts first, then the company, through the service layer', () => {
    const contactsIdx = body.indexOf('contactService.deleteContact(ctx, contact.id)')
    const companyIdx  = body.indexOf('companyService.deleteCompany(ctx, id)')
    expect(contactsIdx).toBeGreaterThan(-1)
    expect(companyIdx).toBeGreaterThan(-1)
    expect(contactsIdx).toBeLessThan(companyIdx)
  })

  it('never hard-deletes — no raw .delete() on companies/contacts in the action file', () => {
    expect(actions).not.toContain('.delete()')
    expect(actions).not.toContain(".from('companies')")
    expect(actions).not.toContain(".from('contacts')")
  })
})

// ---------------------------------------------------------------------------
// TC-U4-04: delete button wiring
// ---------------------------------------------------------------------------

describe('TC-U4-04: DeleteCompanyButton (source-read)', () => {
  const button = read(DELETE_BUTTON)
  const page   = read(DETAIL_PAGE)

  it('confirms before deleting and pushes to the companies list on success', () => {
    expect(button).toContain('window.confirm')
    expect(button).toContain('This cannot be undone from the UI.')
    expect(button).toContain('router.push(`/${workspaceSlug}/companies`)')
  })

  it('is destructive-styled and calls deleteCompanyAction', () => {
    expect(button).toContain('variant="destructive"')
    expect(button).toContain('deleteCompanyAction(companyId)')
  })

  it('surfaces the active-campaign guard error inline', () => {
    expect(button).toContain('setError(result.error)')
  })

  it('renders in the detail header next to Edit', () => {
    expect(page).toContain('<CompanyEditDialog company={company} />')
    expect(page).toContain('<DeleteCompanyButton')
  })
})
