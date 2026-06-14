// #32 — shared lead-contact resolver. Behavioral (mock contactRepo, real resolver).
// TC-LCR-01..04

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getContactReturn: null as Record<string, unknown> | null,
  eligibleReturn:   null as Record<string, unknown> | null,
  getContactCalls:  0,
  eligibleCalls:    0,
}))

vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getContact: () => { h.getContactCalls++; return Promise.resolve(h.getContactReturn) },
  getFirstEligibleContactForCompany: () => { h.eligibleCalls++; return Promise.resolve(h.eligibleReturn) },
}))

import { resolveContactForLead } from '@/modules/crm/services/lead-contact-resolver'

beforeEach(() => {
  h.getContactReturn = null
  h.eligibleReturn = null
  h.getContactCalls = 0
  h.eligibleCalls = 0
})

describe('TC-LCR: resolveContactForLead (behavioral)', () => {
  it('explicit contactId → returns that contact, even with no email', async () => {
    h.getContactReturn = { id: 'c1', email: null }
    const out = await resolveContactForLead({ contactId: 'c1', companyId: 'co1', tenantId: 't1' })
    expect(out).toEqual({ id: 'c1', email: null })
    // crucially: did NOT fall through to the company (preserves #29 no_contact_email)
    expect(h.eligibleCalls).toBe(0)
  })

  it('no contactId + companyId with an eligible contact → returns the company contact', async () => {
    h.eligibleReturn = { id: 'c2', email: 'x@y.com' }
    const out = await resolveContactForLead({ contactId: null, companyId: 'co1', tenantId: 't1' })
    expect(out).toEqual({ id: 'c2', email: 'x@y.com' })
    expect(h.getContactCalls).toBe(0)
  })

  it('no contactId and no companyId → null (no repo reads)', async () => {
    const out = await resolveContactForLead({ contactId: null, companyId: null, tenantId: 't1' })
    expect(out).toBeNull()
    expect(h.getContactCalls).toBe(0)
    expect(h.eligibleCalls).toBe(0)
  })

  it('no contactId + companyId but company has no eligible contact → null', async () => {
    h.eligibleReturn = null
    const out = await resolveContactForLead({ contactId: null, companyId: 'co1', tenantId: 't1' })
    expect(out).toBeNull()
  })
})
