// mcm-v2 — Inbound reply capture orchestration (P3.5). TC-IRX-01..07
// Real classify (isAutoReply/detectOptOut); all I/O deps mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InboundMatchResult } from '@/modules/messaging/inbound/inbound-reply-match.service'

const cfg = vi.hoisted(() => ({
  match: {} as InboundMatchResult,
  insert: { ok: true, id: 'r1' } as { ok: true; id: string } | { ok: false; duplicate: true },
  forwarded: true,
  stopResult: { stopped: 2 },
  // capture
  forwardInput: null as Record<string, unknown> | null,
  stopArgs: null as unknown[] | null,
  unsubCalled: false,
  contactUpdated: null as Record<string, unknown> | null,
  lastUpdate: null as Record<string, unknown> | null,
  insertedRow: null as Record<string, unknown> | null,
}))

vi.mock('@/modules/messaging/inbound/inbound-reply-match.service', () => ({
  matchInboundReply: vi.fn(async () => cfg.match),
}))
vi.mock('@/modules/messaging/inbound/inbound-reply.repo', () => ({
  insertInboundReply: vi.fn(async (row: Record<string, unknown>) => { cfg.insertedRow = row; return cfg.insert }),
  updateInboundReply: vi.fn(async (_id: string, patch: Record<string, unknown>) => { cfg.lastUpdate = patch }),
}))
vi.mock('@/modules/messaging/inbound/inbound-reply-forward.service', () => ({
  forwardInboundReply: vi.fn(async (input: Record<string, unknown>) => { cfg.forwardInput = input; return { forwarded: cfg.forwarded } }),
}))
vi.mock('@/modules/campaign-sequence/services/campaign-stop.service', () => ({
  stopAssignmentSchedule: vi.fn(async (...args: unknown[]) => { cfg.stopArgs = args; return cfg.stopResult }),
}))
vi.mock('@/modules/messaging/repositories/suppression.repo', () => ({
  addUnsubscribe: vi.fn(async () => { cfg.unsubCalled = true }),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getContact: vi.fn(async () => ({ first_name: 'Jane', last_name: 'Doe', company_id: 'co1' })),
  updateContact: vi.fn(async (_id: string, _t: string, patch: Record<string, unknown>) => { cfg.contactUpdated = patch; return {} }),
}))
vi.mock('@/modules/crm/repositories/company.repo', () => ({
  getCompanyByTenant: vi.fn(async () => ({ name: 'Acme Co' })),
}))

import { captureInboundReply } from '@/modules/messaging/inbound/inbound-reply.service'
import { stopAssignmentSchedule } from '@/modules/campaign-sequence/services/campaign-stop.service'
import { addUnsubscribe } from '@/modules/messaging/repositories/suppression.repo'
import { forwardInboundReply } from '@/modules/messaging/inbound/inbound-reply-forward.service'
import { insertInboundReply } from '@/modules/messaging/inbound/inbound-reply.repo'

const MATCHED: InboundMatchResult = {
  tenantId: 't1', workspaceId: 'ws1', matchStatus: 'matched',
  matchedEmailSendId: 's1', matchedContactId: 'c1', matchedLeadId: 'l1', matchedAssignmentId: 'a1',
}

function reply(over: Partial<Record<string, unknown>> = {}) {
  return {
    from: 'prospect@acme.com', to: 'reply@v.com', subject: 'Re: hi', text: 'Yes please call me',
    headers: {}, receivedAt: '2026-06-22T10:00:00Z',
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  cfg.match = { ...MATCHED }
  cfg.insert = { ok: true, id: 'r1' }
  cfg.forwarded = true
  cfg.stopResult = { stopped: 2 }
  cfg.forwardInput = null
  cfg.stopArgs = null
  cfg.unsubCalled = false
  cfg.contactUpdated = null
  cfg.lastUpdate = null
  cfg.insertedRow = null
})

describe('TC-IRX-01: matched human reply stops the sequence (responded)', () => {
  it('calls stopAssignmentSchedule with responded mode + records touches_stopped', async () => {
    const res = await captureInboundReply(reply())
    expect(res.status).toBe('persisted')
    expect(vi.mocked(stopAssignmentSchedule)).toHaveBeenCalledTimes(1)
    expect(cfg.stopArgs![3]).toBe('responded')
    expect(cfg.stopArgs![0]).toBe('a1')
    expect(cfg.lastUpdate!.touchesStopped).toBe(2)
    // forward fired with sequence-stopped annotation
    expect((cfg.forwardInput!.annotation as Record<string, unknown>).sequenceStopped).toBe(true)
  })
})

describe('TC-IRX-02: auto-reply does NOT stop', () => {
  it('matched auto-reply → no stop, still forwarded, is_auto_reply recorded', async () => {
    const res = await captureInboundReply(reply({ headers: { auto_submitted: 'auto-replied' }, text: 'I am out of office' }))
    expect(res.status).toBe('persisted')
    expect(vi.mocked(stopAssignmentSchedule)).not.toHaveBeenCalled()
    expect(cfg.insertedRow!.isAutoReply).toBe(true)
    expect(cfg.lastUpdate!.touchesStopped).toBe(0)
    expect(vi.mocked(forwardInboundReply)).toHaveBeenCalledTimes(1)
    expect((cfg.forwardInput!.annotation as Record<string, unknown>).autoReply).toBe(true)
  })
})

describe('TC-IRX-03: strict opt-out suppresses a matched contact', () => {
  it('addUnsubscribe + contact.do_not_contact + optout_suppressed', async () => {
    const res = await captureInboundReply(reply({ text: 'please unsubscribe me' }))
    expect(res.status).toBe('persisted')
    expect(vi.mocked(addUnsubscribe)).toHaveBeenCalledWith('t1', 'prospect@acme.com', 'recipient_reply_optout')
    expect(cfg.contactUpdated!.do_not_contact).toBe(true)
    expect(cfg.lastUpdate!.optoutSuppressed).toBe(true)
    expect(cfg.lastUpdate!.optoutDetected).toBe(true)
  })
})

describe('TC-IRX-04: interested reply is never auto-suppressed', () => {
  it('no strict phrase → addUnsubscribe not called, not suppressed', async () => {
    const res = await captureInboundReply(reply({ text: "let's talk, stop sending so many" }))
    expect(res.status).toBe('persisted')
    expect(vi.mocked(addUnsubscribe)).not.toHaveBeenCalled()
    expect(cfg.contactUpdated).toBeNull()
    expect(cfg.lastUpdate!.optoutSuppressed).toBe(false)
  })
})

describe('TC-IRX-05: idempotent — duplicate insert is a no-op', () => {
  it('insert duplicate → status duplicate, no side effects', async () => {
    cfg.insert = { ok: false, duplicate: true }
    const res = await captureInboundReply(reply())
    expect(res.status).toBe('duplicate')
    expect(vi.mocked(stopAssignmentSchedule)).not.toHaveBeenCalled()
    expect(vi.mocked(forwardInboundReply)).not.toHaveBeenCalled()
  })
})

describe('TC-IRX-06: unresolved tenant → not persisted', () => {
  it('match.tenantId null → status unresolved, insert not attempted', async () => {
    cfg.match = { ...MATCHED, tenantId: null, matchStatus: 'unmatched', matchedAssignmentId: null, matchedContactId: null }
    const res = await captureInboundReply(reply())
    expect(res.status).toBe('unresolved')
    expect(vi.mocked(insertInboundReply)).not.toHaveBeenCalled()
  })
})

describe('TC-IRX-07: forward failure does not fail capture', () => {
  it('forwarded false → still persisted, forwardedAt null', async () => {
    cfg.forwarded = false
    const res = await captureInboundReply(reply())
    expect(res.status).toBe('persisted')
    expect(cfg.lastUpdate!.forwardedAt).toBeNull()
  })
})
