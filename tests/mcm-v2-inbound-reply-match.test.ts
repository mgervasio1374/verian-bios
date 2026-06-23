// mcm-v2 — Inbound reply matching (P3.5). TC-IRM-01..03
// Correlate a reply → originating send → draft → contact/lead/assignment, and
// resolve tenant via the reply-to sender identity when unmatched.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  emailSendsByMsgId: null as Record<string, unknown> | null,
  emailSendsByEmail: null as Record<string, unknown> | null,
  draft:             null as Record<string, unknown> | null,
  senderIdentity:    null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(table: string): any {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = { _table: table, _in: false, _ilike: false }
      b.select = () => b
      b.in     = () => { b._in = true; return b }
      b.ilike  = () => { b._ilike = true; return b }
      b.eq     = () => b
      b.is     = () => b
      b.order  = () => b
      b.limit  = () => b
      b.maybeSingle = () => {
        if (b._table === 'email_sends') {
          if (b._in)    return Promise.resolve({ data: db.emailSendsByMsgId, error: null })
          if (b._ilike) return Promise.resolve({ data: db.emailSendsByEmail, error: null })
        }
        if (b._table === 'email_drafts')      return Promise.resolve({ data: db.draft, error: null })
        if (b._table === 'sender_identities') return Promise.resolve({ data: db.senderIdentity, error: null })
        return Promise.resolve({ data: null, error: null })
      }
      return b
    },
  }),
}))

import { matchInboundReply } from '@/modules/messaging/inbound/inbound-reply-match.service'

beforeEach(() => {
  db.emailSendsByMsgId = null
  db.emailSendsByEmail = null
  db.draft = null
  db.senderIdentity = null
})

describe('TC-IRM-01: in-reply-to → correct send/assignment', () => {
  it('resolves matched + linkage from the threaded send', async () => {
    db.emailSendsByMsgId = { id: 's1', tenant_id: 't1', workspace_id: 'ws1', draft_id: 'd1' }
    db.draft = { contact_id: 'c1', lead_id: 'l1', campaign_assignment_id: 'a1' }
    const res = await matchInboundReply({ from: 'p@x.com', to: 'reply@v.com', inReplyTo: '<m-1>' })
    expect(res.matchStatus).toBe('matched')
    expect(res.tenantId).toBe('t1')
    expect(res.workspaceId).toBe('ws1')
    expect(res.matchedEmailSendId).toBe('s1')
    expect(res.matchedContactId).toBe('c1')
    expect(res.matchedLeadId).toBe('l1')
    expect(res.matchedAssignmentId).toBe('a1')
  })
})

describe('TC-IRM-02: fallback from_email → most-recent send', () => {
  it('matches by recipient address when no thread header matches', async () => {
    db.emailSendsByMsgId = null
    db.emailSendsByEmail = { id: 's2', tenant_id: 't2', workspace_id: 'ws2', draft_id: 'd2' }
    db.draft = { contact_id: 'c2', lead_id: null, campaign_assignment_id: 'a2' }
    const res = await matchInboundReply({ from: 'p@x.com', to: 'reply@v.com' })
    expect(res.matchStatus).toBe('matched')
    expect(res.matchedEmailSendId).toBe('s2')
    expect(res.tenantId).toBe('t2')
    expect(res.matchedAssignmentId).toBe('a2')
  })
})

describe('TC-IRM-03: unmatched → tenant from sender identity, no linkage', () => {
  it('resolves tenant via reply-to, match_status unmatched, no assignment', async () => {
    db.emailSendsByMsgId = null
    db.emailSendsByEmail = null
    db.senderIdentity = { tenant_id: 't3' }
    const res = await matchInboundReply({ from: 'stranger@x.com', to: 'reply@v.com', inReplyTo: '<nope>' })
    expect(res.matchStatus).toBe('unmatched')
    expect(res.tenantId).toBe('t3')
    expect(res.workspaceId).toBeNull()
    expect(res.matchedEmailSendId).toBeNull()
    expect(res.matchedAssignmentId).toBeNull()
  })

  it('fully unresolved (no send, no identity) → tenantId null', async () => {
    const res = await matchInboundReply({ from: 'stranger@x.com', to: 'reply@v.com' })
    expect(res.matchStatus).toBe('unmatched')
    expect(res.tenantId).toBeNull()
  })
})
