// #33/#34 — convert action (permission-gated, double-convert guard) + UI wiring.
// TC-LTO-02..04

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({
  existingOpp: null as { id: string; name: string } | null,
  createCalls: 0,
  permArg:     null as string | null,
}))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({}) }))
vi.mock('@/lib/auth/context', () => ({
  buildRequestContext: () => Promise.resolve({ tenantId: 't1', workspaceId: 'w1', userId: 'u1' }),
}))
vi.mock('@/lib/auth/permissions', () => ({ requirePermission: (_ctx: unknown, perm: string) => { h.permArg = perm } }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/modules/crm/services/opportunity.service', () => ({
  getOpportunityForLead: () => Promise.resolve(h.existingOpp),
  createOpportunityFromLead: () => { h.createCalls++; return Promise.resolve({ opportunityId: 'opp1' }) },
}))

import { convertLeadToOpportunityAction } from '@/modules/crm/actions/opportunity.actions'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

beforeEach(() => {
  h.existingOpp = null
  h.createCalls = 0
  h.permArg = null
})

// ---------------------------------------------------------------------------
// TC-LTO-02: convert action — permission-gated, returns id
// ---------------------------------------------------------------------------

describe('TC-LTO-02: convertLeadToOpportunityAction (behavioral)', () => {
  it('is gated on crm.opportunities.create and returns the new opportunity id', async () => {
    const result = await convertLeadToOpportunityAction('lead1', {})
    expect(h.permArg).toBe('crm.opportunities.create')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.opportunityId).toBe('opp1')
    expect(h.createCalls).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// TC-LTO-03: double-convert guard
// ---------------------------------------------------------------------------

describe('TC-LTO-03: already-converted guard (behavioral)', () => {
  it('a second convert for a lead with a linked opportunity is blocked, no duplicate', async () => {
    h.existingOpp = { id: 'opp1', name: 'Acme Lead' }
    const result = await convertLeadToOpportunityAction('lead1', {})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('already converted')
    expect(h.createCalls).toBe(0) // no insert happened
  })
})

// ---------------------------------------------------------------------------
// TC-LTO-04: UI wiring (source-read — node test env, no DOM renderer)
// ---------------------------------------------------------------------------

describe('TC-LTO-04: lead-detail + activities UI (source-read)', () => {
  const convert    = read('app/(workspace)/[workspaceSlug]/leads/[id]/ConvertToOpportunity.tsx')
  const leadPage   = read('app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx')
  const activities = read('app/(workspace)/[workspaceSlug]/activities/page.tsx')

  it('the component branches: converted-link when an opportunity exists, button otherwise', () => {
    expect(convert).toContain('if (existingOpportunity)')
    expect(convert).toContain('Converted to opportunity:')
    expect(convert).toContain('Convert to Opportunity')
    expect(convert).toContain('convertLeadToOpportunityAction')
  })

  it('the lead page loads the linked opportunity and passes it to the component', () => {
    expect(leadPage).toContain('getOpportunityForLead')
    expect(leadPage).toContain('<ConvertToOpportunity')
    expect(leadPage).toContain('existingOpportunity={linkedOpportunity')
  })

  it('the activities page shows the awaiting-development banner without dropping the list', () => {
    expect(activities).toContain('<PageStatusBanner')
    expect(activities).toContain('Activity logging is coming soon')
    expect(activities).toContain('activityTypeIcon') // existing list rendering preserved
  })
})
