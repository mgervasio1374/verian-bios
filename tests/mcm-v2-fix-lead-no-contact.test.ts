// PROD-BUG-001 — lead-scoped campaign with no contact. Behavioral:
//  - promoter falls back to the company's first eligible contact → draft created
//  - promoter with no contact anywhere → failed, no_contact reason preserved
//  - the lead-detail failure banner maps status_reason to operator language
//
// TC-LNC-01..04

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  leadRow:         null as Record<string, unknown> | null,
  eligibleContact: null as Record<string, unknown> | null,
  statusUpdates:   [] as Array<{ status: string; reason?: string | null }>,
  createdDrafts:   [] as Array<Record<string, unknown>>,
}))

vi.mock('@/modules/crm/repositories/lead.repo', () => ({
  getLead: () => Promise.resolve(h.leadRow),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getFirstEligibleContactForCompany: () => Promise.resolve(h.eligibleContact),
  getContact: () => Promise.resolve(h.eligibleContact),
}))
vi.mock('@/modules/crm/repositories/company.repo', () => ({
  getCompanyByTenant: () => Promise.resolve({ name: 'Acme HVAC' }),
}))
vi.mock('@/modules/messaging/repositories/campaign-email-asset.repo', () => ({
  getAssetById: () => Promise.resolve({
    subject_template:   'Hi {{first_name}}',
    body_template_html: '<p>Hi {{first_name}}</p>',
    body_template_text: 'Hi {{first_name}}',
    required_fields:    [],
    fallback_values:    {},
  }),
}))
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  createEmailDraft: (d: Record<string, unknown>) => { h.createdDrafts.push(d); return Promise.resolve({ id: 'draft1' }) },
  getSenderIdentityById: () => Promise.resolve(null),
  getDefaultSenderIdentity: () => Promise.resolve(null),
}))
vi.mock('@/modules/campaign-sequence/repositories/campaign-sequence-step.repo', () => ({
  getCampaignSequenceStepById: () => Promise.resolve({ id: 'step1', step_number: 1, campaign_email_asset_id: 'asset1' }),
}))
vi.mock('@/modules/campaign-sequence/repositories/campaign-sequence.repo', () => ({
  getCampaignSequenceById: () => Promise.resolve(null),
}))
vi.mock('@/modules/campaign-sequence/services/campaign-schedule-item.service', () => ({
  updateScheduleItemStatus: (_id: string, _t: string, _w: string, status: string, opts?: { status_reason?: string | null }) => {
    h.statusUpdates.push({ status, reason: opts?.status_reason })
    return Promise.resolve()
  },
}))

import { promoteScheduleItemToDraft } from '@/modules/campaign-sequence/services/campaign-schedule-promoter.service'
import { describeScheduleFailure, dedupeFailureReasons } from '@/app/(workspace)/[workspaceSlug]/leads/[id]/schedule-failure'

const baseItem = {
  id: 'item1',
  contact_id: null,
  lead_id: 'lead1',
  company_id: 'co1',
  status: 'planned',
  email_draft_id: null,
  campaign_sequence_step_id: 'step1',
  campaign_sequence_id: 'seq1',
  campaign_assignment_id: 'asg1',
}

beforeEach(() => {
  h.leadRow = { contact_id: null, company_id: 'co1' }
  h.eligibleContact = null
  h.statusUpdates = []
  h.createdDrafts = []
})

// ---------------------------------------------------------------------------
// TC-LNC-01: company-contact fallback → draft created
// ---------------------------------------------------------------------------

describe('TC-LNC-01: promoter resolves company contact when lead has none (behavioral)', () => {
  it("creates a draft to the company's first eligible contact, not a failure", async () => {
    h.eligibleContact = { id: 'c1', email: 'ann@acme.com', first_name: 'Ann', last_name: 'Lee' }

    const result = await promoteScheduleItemToDraft(baseItem as never, { tenantId: 't1', workspaceId: 'w1' })

    expect(result).toEqual({ outcome: 'promoted', draftId: 'draft1' })
    expect(h.createdDrafts[0].toEmail).toBe('ann@acme.com')
    expect(h.createdDrafts[0].contactId).toBe('c1')
    // Advanced to draft_ready; never failed.
    expect(h.statusUpdates.some(u => u.status === 'draft_ready')).toBe(true)
    expect(h.statusUpdates.some(u => u.status === 'failed')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC-LNC-02: no contact anywhere → failed with no_contact preserved
// ---------------------------------------------------------------------------

describe('TC-LNC-02: promoter fails visibly when no contact exists (behavioral)', () => {
  it("sets status='failed' with the no_contact reason", async () => {
    h.eligibleContact = null // company has no usable contact either

    const result = await promoteScheduleItemToDraft(baseItem as never, { tenantId: 't1', workspaceId: 'w1' })

    expect(result).toEqual({ outcome: 'failed', reason: 'no_contact' })
    const failed = h.statusUpdates.find(u => u.status === 'failed')
    expect(failed?.reason).toBe('no_contact')
    expect(h.createdDrafts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// TC-LNC-03: lead-detail banner maps the reason to operator language
// ---------------------------------------------------------------------------

describe('TC-LNC-03: failure banner copy (pure)', () => {
  it('no_contact / no_contact_email → add-a-contact guidance', () => {
    const msg = describeScheduleFailure('no_contact')
    expect(msg).toContain('No contact is linked to this lead')
    expect(msg).toContain('re-assign')
    expect(describeScheduleFailure('no_contact_email')).toBe(msg)
  })

  it('other known reasons map to their own copy; unknown falls back', () => {
    expect(describeScheduleFailure('no_email_asset')).toContain('no email asset')
    expect(describeScheduleFailure('mystery')).toContain('mystery')
  })

  it('dedupes repeated reasons across items', () => {
    const reasons = dedupeFailureReasons([
      { status_reason: 'no_contact' },
      { status_reason: 'no_contact' },
      { status_reason: 'no_email_asset' },
    ])
    expect(reasons).toEqual(['no_contact', 'no_email_asset'])
  })
})
