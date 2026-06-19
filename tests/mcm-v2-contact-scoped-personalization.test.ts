// mcm-v2 — contact-scoped campaign personalization. The schedule promoter must
// resolve the company from the contact when the item is contact-scoped (company_id
// null), so {{company_name}} (+ industry/city/state) personalize instead of falling
// back. TC-CSP-01..03

import { describe, it, expect, vi, beforeEach } from 'vitest'

const cap = vi.hoisted(() => ({
  fields: null as Record<string, unknown> | null,
  contact: null as Record<string, unknown> | null,
  company: null as Record<string, unknown> | null,
  companyByTenantCalls: [] as string[],
}))

vi.mock('@/modules/campaign-sequence/repositories/campaign-sequence-step.repo', () => ({
  getCampaignSequenceStepById: vi.fn(async () => ({ campaign_email_asset_id: 'asset-1', step_number: 1 })),
}))
vi.mock('@/modules/messaging/repositories/campaign-email-asset.repo', () => ({
  getAssetById: vi.fn(async () => ({
    subject_template: 'Card processing for {{company_name}}',
    body_template_html: '<p>Hi {{first_name}}</p>',
    body_template_text: 'Hi {{first_name}}',
    required_fields: [],
    fallback_values: {},
  })),
}))
vi.mock('@/modules/crm/services/lead-contact-resolver', () => ({
  resolveContactForLead: vi.fn(async () => cap.contact),
}))
vi.mock('@/modules/crm/repositories/company.repo', () => ({
  getCompanyByTenant: vi.fn(async (id: string) => { cap.companyByTenantCalls.push(id); return cap.company }),
}))
vi.mock('@/modules/crm/repositories/lead.repo', () => ({ getLead: vi.fn(async () => null) }))
vi.mock('@/modules/campaign-sequence/repositories/campaign-sequence.repo', () => ({
  getCampaignSequenceById: vi.fn(async () => null),
}))
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  getSenderIdentityById:   vi.fn(async () => null),
  getDefaultSenderIdentity: vi.fn(async () => ({ id: 'si-1', name: 'Sam', email: 'sam@321.com' })),
  createEmailDraft:        vi.fn(async () => ({ id: 'draft-1' })),
}))
vi.mock('@/modules/messaging/services/campaign-personalization.service', () => ({
  renderCampaignAsset: vi.fn((_asset: unknown, fields: Record<string, unknown>) => {
    cap.fields = fields
    return {
      renderedSubject:  `Card processing for ${fields.company_name ?? 'your company'}`,
      renderedBodyHtml: '<p>Hi</p>',
      renderedBodyText: 'Hi',
      personalizationSnapshot: fields,
      missingRequiredFields: [],
    }
  }),
}))
vi.mock('@/modules/campaign-sequence/services/campaign-schedule-item.service', () => ({
  updateScheduleItemStatus: vi.fn(async () => undefined),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => false),
}))
vi.mock('@/modules/messaging/services/email-quality-review-runner.service', () => ({
  reviewAndPersistEmailDraftQuality: vi.fn(async () => undefined),
}))

import { promoteScheduleItemToDraft } from '@/modules/campaign-sequence/services/campaign-schedule-promoter.service'
import { getCompanyByTenant } from '@/modules/crm/repositories/company.repo'

function item(over: Record<string, unknown> = {}) {
  return {
    id: 'item-1', tenant_id: 't-1', workspace_id: 'ws-1',
    campaign_assignment_id: 'asgn-1', campaign_sequence_id: 'seq-1',
    campaign_sequence_step_id: 'step-1', lead_id: null, contact_id: 'c-1',
    company_id: null, scheduled_for: '2026-01-15T00:00:00Z', status: 'planned',
    email_draft_id: null, approval_request_id: null, status_reason: null,
    stopped_at: null, stopped_reason: null, response_detected_at: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}
const ctx = { tenantId: 't-1', workspaceId: 'ws-1' }

beforeEach(() => {
  vi.clearAllMocks()
  cap.fields = null
  cap.companyByTenantCalls = []
  cap.contact = { id: 'c-1', first_name: 'Bob', email: 'bob@x.com', company_id: 'co-1' }
  cap.company = { name: 'Collins Comfort Masters', industry: 'HVAC', city: 'Phoenix', state: 'AZ' }
})

describe('TC-CSP-01: contact-scoped item resolves company via contact.company_id', () => {
  it('loads the company from contact.company_id and renders the real company name', async () => {
    const res = await promoteScheduleItemToDraft(item({ company_id: null }), ctx)
    expect(res.outcome).toBe('promoted')
    expect(cap.companyByTenantCalls).toContain('co-1')
    expect(cap.fields!.company_name).toBe('Collins Comfort Masters')
    expect(cap.fields!.company_name).not.toBe('your company')
  })

  it('item.company_id wins when present', async () => {
    await promoteScheduleItemToDraft(item({ company_id: 'co-item' }), ctx)
    expect(cap.companyByTenantCalls).toContain('co-item')
  })
})

describe('TC-CSP-02: industry from company; city/state prefer contact', () => {
  it('derives company-scoped fields with contact-preferred location', async () => {
    cap.contact = { id: 'c-1', first_name: 'Bob', email: 'bob@x.com', company_id: 'co-1', city: 'Mesa', state: 'AZ' }
    cap.company = { name: 'Collins Comfort Masters', industry: 'HVAC', city: 'Phoenix', state: 'CA' }
    await promoteScheduleItemToDraft(item(), ctx)
    expect(cap.fields!.industry).toBe('HVAC')   // from company
    expect(cap.fields!.city).toBe('Mesa')        // contact preferred
    expect(cap.fields!.state).toBe('AZ')         // contact preferred
  })

  it('falls back to company location when the contact has none', async () => {
    cap.contact = { id: 'c-1', first_name: 'Bob', email: 'bob@x.com', company_id: 'co-1' }
    cap.company = { name: 'Collins Comfort Masters', industry: 'HVAC', city: 'Phoenix', state: 'AZ' }
    await promoteScheduleItemToDraft(item(), ctx)
    expect(cap.fields!.city).toBe('Phoenix')
    expect(cap.fields!.state).toBe('AZ')
  })
})

describe('TC-CSP-03: no company anywhere → company_name null, no throw', () => {
  it('company stays null when neither item nor contact has a company id', async () => {
    cap.contact = { id: 'c-1', first_name: 'Bob', email: 'bob@x.com', company_id: null }
    const res = await promoteScheduleItemToDraft(item({ company_id: null }), ctx)
    expect(res.outcome).toBe('promoted')
    expect(vi.mocked(getCompanyByTenant)).not.toHaveBeenCalled()
    expect(cap.fields!.company_name).toBeNull()
    expect(cap.fields!.industry).toBeNull()
  })
})
