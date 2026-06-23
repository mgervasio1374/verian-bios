// mcm-v2 — Inbound reply webhook route (P3.5). Auth + always-200 contract.
// TC-IRR-01..05

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hdrs = vi.hoisted(() => ({ store: {} as Record<string, string> }))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => hdrs.store[k.toLowerCase()] ?? null }),
}))

const cap = vi.hoisted(() => ({
  result: { status: 'persisted', replyId: 'r1', stopped: 0, optoutSuppressed: false, forwarded: true } as Record<string, unknown>,
  throws: false,
}))
vi.mock('@/modules/messaging/inbound/inbound-reply.service', () => ({
  captureInboundReply: vi.fn(async () => { if (cap.throws) throw new Error('boom'); return cap.result }),
}))

import { POST } from '@/app/api/webhooks/inbound-email/route'
import { captureInboundReply } from '@/modules/messaging/inbound/inbound-reply.service'
import { NextRequest } from 'next/server'

const URL = 'https://app.test/api/webhooks/inbound-email'
const VALID = { from: 'p@x.com', to: 'reply@v.com', subject: 'Re: hi', text: 'yes', headers: { message_id: 'm1' } }

function req(body: string): NextRequest {
  return new NextRequest(URL, { method: 'POST', body, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  hdrs.store = {}
  cap.throws = false
  cap.result = { status: 'persisted', replyId: 'r1' }
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = 'secret'
})

describe('TC-IRR-01: auth — missing/bad secret → 401, no processing', () => {
  it('missing header → 401', async () => {
    const res = await POST(req(JSON.stringify(VALID)))
    expect(res.status).toBe(401)
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
  })
  it('wrong secret → 401', async () => {
    hdrs.store['x-inbound-secret'] = 'nope-it'
    const res = await POST(req(JSON.stringify(VALID)))
    expect(res.status).toBe(401)
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
  })
})

describe('TC-IRR-02: valid secret → 200, captures', () => {
  it('processes and returns 200', async () => {
    hdrs.store['x-inbound-secret'] = 'secret'
    const res = await POST(req(JSON.stringify(VALID)))
    expect(res.status).toBe(200)
    expect(vi.mocked(captureInboundReply)).toHaveBeenCalledTimes(1)
  })
})

describe('TC-IRR-03: capture failure still returns 200', () => {
  it('thrown error → 200 status error', async () => {
    hdrs.store['x-inbound-secret'] = 'secret'
    cap.throws = true
    const res = await POST(req(JSON.stringify(VALID)))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('error')
  })
})

describe('TC-IRR-04: idempotency surfaced — duplicate → 200', () => {
  it('duplicate capture result → 200', async () => {
    hdrs.store['x-inbound-secret'] = 'secret'
    cap.result = { status: 'duplicate' }
    const res = await POST(req(JSON.stringify(VALID)))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('duplicate')
  })
})

describe('TC-IRR-05: validation', () => {
  it('invalid JSON → 400', async () => {
    hdrs.store['x-inbound-secret'] = 'secret'
    const res = await POST(req('not json'))
    expect(res.status).toBe(400)
  })
  it('missing from → 400', async () => {
    hdrs.store['x-inbound-secret'] = 'secret'
    const res = await POST(req(JSON.stringify({ to: 'reply@v.com' })))
    expect(res.status).toBe(400)
  })
})
