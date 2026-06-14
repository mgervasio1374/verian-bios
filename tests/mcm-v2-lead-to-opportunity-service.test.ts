// #33 — lead → opportunity conversion service. Behavioral (mock repos).
// TC-LTO-01

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  leadRow:        null as Record<string, unknown> | null,
  companyRow:     null as Record<string, unknown> | null,
  insertedOpp:    null as Record<string, unknown> | null,
}))

vi.mock('@/modules/crm/repositories/lead.repo', () => ({
  getLead: () => Promise.resolve(h.leadRow),
}))
vi.mock('@/modules/crm/repositories/company.repo', () => ({
  getCompanyByTenant: () => Promise.resolve(h.companyRow),
}))
vi.mock('@/modules/crm/repositories/opportunity.repo', () => ({
  createOpportunity: (data: Record<string, unknown>) => { h.insertedOpp = data; return Promise.resolve({ id: 'opp1' }) },
  getOpportunityForLead: () => Promise.resolve(null),
}))

import { createOpportunityFromLead } from '@/modules/crm/services/opportunity.service'

beforeEach(() => {
  h.leadRow = { id: 'lead1', name: 'Acme Lead', company_id: 'co1', estimated_value: 5000 }
  h.companyRow = null
  h.insertedOpp = null
})

describe('TC-LTO-01: createOpportunityFromLead (behavioral)', () => {
  it('inserts an opportunity in discovery/open with value + links from the lead', async () => {
    const result = await createOpportunityFromLead({ leadId: 'lead1', tenantId: 't1', workspaceId: 'w1', userId: 'u1' })

    expect(result).toEqual({ opportunityId: 'opp1' })
    expect(h.insertedOpp).toMatchObject({
      tenant_id:    't1',
      workspace_id: 'w1',
      name:         'Acme Lead',
      stage:        'discovery',
      status:       'open',
      value:        5000,
      company_id:   'co1',
      lead_id:      'lead1',
      created_by:   'u1',
    })
  })

  it('an explicit value/name/closeDate overrides the lead defaults', async () => {
    await createOpportunityFromLead({
      leadId: 'lead1', tenantId: 't1', workspaceId: 'w1', userId: 'u1',
      name: 'Custom Deal', value: 12000, expectedCloseDate: '2026-09-01',
    })
    expect(h.insertedOpp).toMatchObject({ name: 'Custom Deal', value: 12000, expected_close_date: '2026-09-01' })
  })

  it('falls back to the company name when the lead has no name', async () => {
    h.leadRow = { id: 'lead1', name: '', company_id: 'co1', estimated_value: null }
    h.companyRow = { name: 'Acme HVAC' }
    await createOpportunityFromLead({ leadId: 'lead1', tenantId: 't1', workspaceId: 'w1', userId: 'u1' })
    expect(h.insertedOpp).toMatchObject({ name: 'Acme HVAC', value: null })
  })

  it('throws when the lead does not exist', async () => {
    h.leadRow = null
    await expect(createOpportunityFromLead({ leadId: 'nope', tenantId: 't1', workspaceId: 'w1', userId: 'u1' }))
      .rejects.toThrow('Lead not found.')
  })
})
