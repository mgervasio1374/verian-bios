// #32 — both lead-page draft widgets resolve the company contact via the
// shared resolver. Behavioral: a lead with no contact but a company contact
// produces a draft to that contact; a true no-contact errors clearly; the
// persisted draft's contactId is the resolved contact's id.
//
// TC-DPR-01..04

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  resolved:      null as Record<string, unknown> | null,
  createdDrafts: [] as Array<Record<string, unknown>>,
  leadRow:       { id: 'lead1', name: 'Acme', contact_id: null, company_id: 'co1' } as Record<string, unknown>,
}))

// The shared resolver is mocked — these tests verify each path USES it and
// persists the resolved contact, not the raw lead.contact_id.
vi.mock('@/modules/crm/services/lead-contact-resolver', () => ({
  resolveContactForLead: () => Promise.resolve(h.resolved),
}))

// Shared repo/service stubs for both paths.
vi.mock('@/modules/crm/repositories/company.repo', () => ({
  getCompanyByTenant: () => Promise.resolve({ name: 'Acme HVAC' }),
}))
vi.mock('@/modules/workflow/repositories/approval.repo', () => ({
  createApprovalRequest: () => Promise.resolve({ id: 'appr1' }),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({ recordActivity: () => Promise.resolve() }))
vi.mock('@/modules/intelligence/repositories/agent-decision.repo', () => ({ createDecision: () => Promise.resolve({}) }))
vi.mock('@/modules/messaging/services/email-quality-review-runner.service', () => ({
  reviewAndPersistEmailDraftQuality: () => Promise.resolve(),
}))
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  getDefaultSenderIdentity: () => Promise.resolve(null),
  getPendingDraftForLead:   () => Promise.resolve(null),
  getTemplateBySlug:        () => Promise.resolve(null),
  createEmailDraft: (d: Record<string, unknown>) => { h.createdDrafts.push(d); return Promise.resolve({ id: 'draft1' }) },
  linkApprovalToEmailDraft: () => Promise.resolve(),
}))

// createDraftFromAsset deps
vi.mock('@/modules/messaging/repositories/campaign-email-asset.repo', () => ({
  getAssetById: () => Promise.resolve({
    status: 'active', asset_name: 'A1', campaign_type: 'initial_contact',
    subject_template: 'Hi {{first_name}}', body_template_html: '<p>Hi</p>', body_template_text: 'Hi',
    required_fields: [], fallback_values: {},
  }),
}))
vi.mock('@/modules/crm/repositories/lead.repo', () => ({
  getLead: () => Promise.resolve(h.leadRow),
}))

// generateManualCampaignDraft loads the lead via the raw service client.
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      from: () => builder, select: () => builder, eq: () => builder, is: () => builder,
      single: () => Promise.resolve({ data: h.leadRow }),
    })
    return builder
  },
}))

import { createDraftFromAsset } from '@/modules/messaging/services/campaign-asset-draft.service'
import { generateManualCampaignDraft } from '@/modules/messaging/services/manual-campaign-draft.service'

beforeEach(() => {
  h.resolved = null
  h.createdDrafts = []
  h.leadRow = { id: 'lead1', name: 'Acme', contact_id: null, company_id: 'co1' }
})

// ---------------------------------------------------------------------------
// TC-DPR-01/02: createDraftFromAsset
// ---------------------------------------------------------------------------

describe('TC-DPR-01: createDraftFromAsset resolves the company contact (behavioral)', () => {
  it('lead has no contact but company does → draft created to the resolved contact', async () => {
    h.resolved = { id: 'c1', email: 'ann@acme.com', first_name: 'Ann', last_name: 'Lee' }

    const result = await createDraftFromAsset({
      tenantId: 't1', workspaceId: 'w1', assetId: 'asset1', leadId: 'lead1', requestedBy: 'u1',
    })

    expect(result.ok).toBe(true)
    expect(h.createdDrafts[0].contactId).toBe('c1') // resolved, not lead.contact_id (null)
    expect(h.createdDrafts[0].toEmail).toBe('ann@acme.com')
  })

  it('no contact anywhere → no_contact_linked, no draft', async () => {
    h.resolved = null
    const result = await createDraftFromAsset({
      tenantId: 't1', workspaceId: 'w1', assetId: 'asset1', leadId: 'lead1', requestedBy: 'u1',
    })
    expect(result).toEqual({ ok: false, reason: 'no_contact_linked' })
    expect(h.createdDrafts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// TC-DPR-03/04: generateManualCampaignDraft
// ---------------------------------------------------------------------------

describe('TC-DPR-03: generateManualCampaignDraft resolves the company contact (behavioral)', () => {
  it('lead has no contact but company does → draft created to the resolved contact', async () => {
    h.resolved = { id: 'c1', email: 'ann@acme.com', first_name: 'Ann', last_name: 'Lee' }

    const result = await generateManualCampaignDraft({
      tenantId: 't1', workspaceId: 'w1', leadId: 'lead1', campaignType: 'initial_contact',
    })

    expect(result.ok).toBe(true)
    expect(h.createdDrafts[0].contactId).toBe('c1')
    expect(h.createdDrafts[0].toEmail).toBe('ann@acme.com')
  })

  it('no contact anywhere → clear no-contact error, no draft', async () => {
    h.resolved = null
    const result = await generateManualCampaignDraft({
      tenantId: 't1', workspaceId: 'w1', leadId: 'lead1', campaignType: 'initial_contact',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('No contact linked to this lead')
    expect(h.createdDrafts).toHaveLength(0)
  })
})
