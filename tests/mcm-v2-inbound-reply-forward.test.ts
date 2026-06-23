// mcm-v2 — Inbound reply forwarding (P3.5). TC-IRF-01..03

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const cap = vi.hoisted(() => ({
  sendArgs: null as Record<string, unknown> | null,
  sendError: null as unknown,
  throwOnSend: false,
}))

vi.mock('@/lib/resend/client', () => ({
  resend: {
    emails: {
      send: vi.fn(async (args: Record<string, unknown>) => {
        cap.sendArgs = args
        if (cap.throwOnSend) throw new Error('network')
        return { data: cap.sendError ? null : { id: 'fwd-1' }, error: cap.sendError }
      }),
    },
  },
}))

import { forwardInboundReply } from '@/modules/messaging/inbound/inbound-reply-forward.service'

const ORIG_ENV = { ...process.env }

beforeEach(() => {
  cap.sendArgs = null
  cap.sendError = null
  cap.throwOnSend = false
  process.env.REPLY_FORWARD_TO = 'sales@321swipe.com'
  process.env.REPLY_FORWARD_FROM = 'Verian Notifications <notify@txn.321swipe.com>'
})
afterEach(() => {
  process.env = { ...ORIG_ENV }
})

const baseInput = {
  fromEmail: 'prospect@acme.com',
  subject: 'Re: card processing',
  text: 'Sounds good, call me.',
  annotation: { matchedLabel: 'Acme — Jane', sequenceStopped: true, touchesStopped: 3, optOut: false, autoReply: false },
}

describe('TC-IRF-01: forwards with transactional From + prospect reply-to', () => {
  it('sends to the team from the transactional identity, reply-to = prospect', async () => {
    const res = await forwardInboundReply(baseInput)
    expect(res.forwarded).toBe(true)
    const a = cap.sendArgs!
    expect(a.from).toBe('Verian Notifications <notify@txn.321swipe.com>')
    expect(a.to).toEqual(['sales@321swipe.com'])
    expect(a.replyTo).toBe('prospect@acme.com')
    expect(String(a.subject)).toMatch(/^Re: /)
    expect(String(a.text)).toContain('Sounds good')
    expect(String(a.text)).toContain('Acme — Jane')
    expect(String(a.text)).toContain('Sequence stopped: yes (3 touches)')
  })

  it('forwards auto-replies too (annotation marks auto-reply)', async () => {
    const res = await forwardInboundReply({ ...baseInput, annotation: { ...baseInput.annotation, autoReply: true } })
    expect(res.forwarded).toBe(true)
    expect(String(cap.sendArgs!.text)).toContain('Auto-reply: yes')
  })
})

describe('TC-IRF-02: forward failure is non-fatal', () => {
  it('resend returns error → { forwarded: false }', async () => {
    cap.sendError = { message: 'rejected' }
    const res = await forwardInboundReply(baseInput)
    expect(res.forwarded).toBe(false)
  })
  it('resend throws → { forwarded: false }', async () => {
    cap.throwOnSend = true
    const res = await forwardInboundReply(baseInput)
    expect(res.forwarded).toBe(false)
  })
})

describe('TC-IRF-03: no forward target configured → no send', () => {
  it('missing REPLY_FORWARD_TO → { forwarded: false } and resend not called', async () => {
    delete process.env.REPLY_FORWARD_TO
    const res = await forwardInboundReply(baseInput)
    expect(res.forwarded).toBe(false)
    expect(cap.sendArgs).toBeNull()
  })
})
