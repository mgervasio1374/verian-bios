// PROD-BUG-001 prevention — createLead auto-links the company's sole contact
// when no contact_id is supplied; conservative (skips when 0 or >1).
//
// TC-LAL-01..03

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  companyContacts: [] as Array<{ id: string }>,
  insertedLead:    null as Record<string, unknown> | null,
}))

vi.mock('@/modules/crm/repositories/lead.repo', () => ({
  createLead: (data: Record<string, unknown>) => { h.insertedLead = data; return Promise.resolve({ id: 'lead1', ...data }) },
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  listContacts: () => Promise.resolve(h.companyContacts),
}))
vi.mock('@/modules/workflow/services/event-dispatch.service', () => ({ enqueueEvent: () => Promise.resolve() }))
vi.mock('@/lib/auth/permissions', () => ({ requirePermission: () => {} }))

import { createLead } from '@/modules/crm/services/lead.service'

const ctx = { tenantId: 't1', workspaceId: 'w1', userId: 'u1' } as never

beforeEach(() => {
  h.companyContacts = []
  h.insertedLead = null
})

describe('TC-LAL: createLead auto-links the sole company contact (behavioral)', () => {
  it('links the company contact when there is exactly one', async () => {
    h.companyContacts = [{ id: 'c1' }]
    await createLead(ctx, { name: 'Acme', stage: 'new', company_id: 'co1' } as never)
    expect(h.insertedLead?.contact_id).toBe('c1')
  })

  it('leaves contact_id null when the company has no contacts', async () => {
    h.companyContacts = []
    await createLead(ctx, { name: 'Acme', stage: 'new', company_id: 'co1' } as never)
    expect(h.insertedLead?.contact_id).toBeNull()
  })

  it('does not guess when the company has multiple contacts', async () => {
    h.companyContacts = [{ id: 'c1' }, { id: 'c2' }]
    await createLead(ctx, { name: 'Acme', stage: 'new', company_id: 'co1' } as never)
    expect(h.insertedLead?.contact_id).toBeNull()
  })

  it('respects an explicitly supplied contact_id (no lookup override)', async () => {
    h.companyContacts = [{ id: 'c1' }]
    await createLead(ctx, { name: 'Acme', stage: 'new', company_id: 'co1', contact_id: 'explicit' } as never)
    expect(h.insertedLead?.contact_id).toBe('explicit')
  })
})
