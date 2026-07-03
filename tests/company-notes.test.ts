// Company notes — behavioral tests: permission gates, validation, storage in
// the CRM activities table, and the activity_events timeline mirror. TC-CN-01..03

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RequestContext } from '@/types/context'

const repo = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  notes: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/modules/crm/repositories/company-note.repo', () => ({
  insertCompanyNote: vi.fn(async (input: Record<string, unknown>) => {
    repo.inserts.push(input)
    return { id: 'note-1' }
  }),
  listCompanyNotes: vi.fn(async () => repo.notes),
}))

const audit = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async (e: Record<string, unknown>) => { audit.events.push(e) }),
}))

import { createCompanyNote, listCompanyNotes, NOTE_MAX_LENGTH } from '@/modules/crm/services/company-note.service'

function ctxWith(permissions: string[]): RequestContext {
  return {
    tenantId: 't-1', workspaceId: 'ws-1', userId: 'user-me',
    roleSlug: 'member', permissions, requestId: 'req-1',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.inserts = []
  repo.notes = []
  audit.events = []
})

describe('TC-CN-01: permission gates', () => {
  it('create requires crm.companies.edit; list requires crm.companies.view', async () => {
    await expect(createCompanyNote(ctxWith(['crm.companies.view']), { companyId: 'co-1', body: 'hi' }))
      .rejects.toThrow('crm.companies.edit')
    await expect(listCompanyNotes(ctxWith([]), 'co-1'))
      .rejects.toThrow('crm.companies.view')
  })
})

describe('TC-CN-02: create validates and stores as a CRM note activity', () => {
  it('trims, stores, and mirrors into the activity timeline', async () => {
    const ctx = ctxWith(['crm.companies.edit'])
    const result = await createCompanyNote(ctx, { companyId: 'co-1', body: '  Called Mike — wants Q4 pricing.  ' })
    expect(result.id).toBe('note-1')
    expect(repo.inserts).toHaveLength(1)
    expect(repo.inserts[0].body).toBe('Called Mike — wants Q4 pricing.')
    expect(repo.inserts[0].company_id).toBe('co-1')
    expect(repo.inserts[0].performed_by).toBe('user-me')

    const mirror = audit.events.find((e) => e.eventType === 'note_added')
    expect(mirror).toBeDefined()
    expect(mirror?.companyId).toBe('co-1')
    expect(String(mirror?.eventSummary)).toContain('Called Mike')
  })

  it('rejects empty and oversized notes before any write', async () => {
    const ctx = ctxWith(['crm.companies.edit'])
    await expect(createCompanyNote(ctx, { companyId: 'co-1', body: '   ' }))
      .rejects.toThrow('note_empty')
    await expect(createCompanyNote(ctx, { companyId: 'co-1', body: 'x'.repeat(NOTE_MAX_LENGTH + 1) }))
      .rejects.toThrow('note_too_long')
    expect(repo.inserts).toHaveLength(0)
  })
})

describe('TC-CN-03: long notes get an excerpted timeline summary', () => {
  it('caps the mirrored summary at ~120 chars', async () => {
    const ctx = ctxWith(['crm.companies.edit'])
    await createCompanyNote(ctx, { companyId: 'co-1', body: 'a'.repeat(500) })
    const mirror = audit.events.find((e) => e.eventType === 'note_added')
    expect(String(mirror?.eventSummary).length).toBeLessThanOrEqual(130)
    expect(String(mirror?.eventSummary)).toContain('…')
  })
})
