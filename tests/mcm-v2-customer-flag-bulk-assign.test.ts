// MCM v2 — customer-status flag: bulk-assign cold-campaign exclusion gate.
// Behavioral — drives the real bulkAssignCampaignToCompanies with its repo
// dependencies mocked, proving a customer is skipped and never produces an
// assignment (hence no activation event / schedule materialization).
//
// TC-CF-07

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  inserted:   [] as Array<Record<string, unknown>>,
  activations: 0,
}))

// Sequence + type + steps: a valid sequence with no steps (no assets to load).
vi.mock('@/modules/campaign-sequence/repositories/campaign-sequence.repo', () => ({
  getCampaignSequenceById: () => Promise.resolve({
    id: 'seq1', tenant_id: 't1', workspace_id: 'w1',
    campaign_type_id: 'type1', name: 'Cold Outreach',
  }),
}))
vi.mock('@/modules/campaign-sequence/repositories/campaign-type.repo', () => ({
  getCampaignTypeById: () => Promise.resolve({ id: 'type1', slug: 'initial_contact' }),
}))
vi.mock('@/modules/campaign-sequence/repositories/campaign-sequence-step.repo', () => ({
  listCampaignSequenceStepsForSequence: () => Promise.resolve([]),
}))

// The cohort: a prospect, a customer, and a former customer — one contact each.
vi.mock('@/modules/crm/repositories/company.repo', () => ({
  listCompanies: () => Promise.resolve([
    { id: 'co-prospect', customer_status: 'prospect' },
    { id: 'co-customer', customer_status: 'customer' },
    { id: 'co-former',   customer_status: 'former_customer' },
  ]),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  listContacts: (opts: { companyId: string }) => Promise.resolve([
    { id: `contact-${opts.companyId}`, email: `${opts.companyId}@example.com`, do_not_contact: false },
  ]),
}))

// Assignment repo: no duplicates; capture each insert.
vi.mock('@/modules/messaging/repositories/campaign-assignment.repo', () => ({
  getActiveDuplicateAssignment: () => Promise.resolve(null),
  getActiveDuplicateAssignmentContact: () => Promise.resolve(null),
  insertCampaignAssignment: (row: Record<string, unknown>) => {
    const persisted = { ...row, id: `asg-${h.inserted.length + 1}`, starts_at: null }
    h.inserted.push(persisted)
    return Promise.resolve(persisted)
  },
}))

// Asset repo (only used when a sequence has asset-bearing steps — none here).
vi.mock('@/modules/messaging/repositories/campaign-email-asset.repo', () => ({
  getAssetById: () => Promise.resolve(null),
}))

vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: () => Promise.resolve(null),
}))

// Inngest activation emit — count it; a skipped customer must never trigger one.
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: () => { h.activations++; return Promise.resolve({ ids: [] }) } },
}))

import { bulkAssignCampaignToCompanies } from '@/modules/messaging/services/campaign-assignment.service'

beforeEach(() => {
  h.inserted    = []
  h.activations = 0
})

describe('TC-CF-07: bulk-assign hard-skips customers (behavioral)', () => {
  it('creates assignments for prospect + former only; tallies the skipped customer', async () => {
    const tally = await bulkAssignCampaignToCompanies({
      tenantId:    't1',
      workspaceId: 'w1',
      companyIds:  ['co-prospect', 'co-customer', 'co-former'],
      campaignSequenceId:    'seq1',
      autoApproveFirstTouch: false,
    })

    expect(tally.created).toBe(2)
    expect(tally.skippedCustomers).toBe(1)

    // The customer's contact never reached assignment creation.
    const contactIds = h.inserted.map(r => r.contact_id)
    expect(contactIds).toContain('contact-co-prospect')
    expect(contactIds).toContain('contact-co-former')
    expect(contactIds).not.toContain('contact-co-customer')

    // No activation event (→ no schedule materialization) for the customer:
    // exactly two activations, one per created assignment.
    expect(h.activations).toBe(2)
  })

  it('former_customer stays eligible (win-back) — not counted as a skip', async () => {
    const tally = await bulkAssignCampaignToCompanies({
      tenantId:    't1',
      workspaceId: 'w1',
      companyIds:  ['co-former'],
      campaignSequenceId:    'seq1',
      autoApproveFirstTouch: false,
    })
    expect(tally.created).toBe(1)
    expect(tally.skippedCustomers).toBe(0)
  })
})
