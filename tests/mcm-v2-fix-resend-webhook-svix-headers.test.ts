// mcm-v2 — fix: accept Svix's svix-* signature headers (Resend signs via Svix).
// The presence check previously read only webhook-* and 401'd every delivery,
// auto-disabling the endpoint. TC-RSVX-01..03
//
// Scoped to the presence check: with a secret configured the handler returns
// before any parse/DB work, so a missing-headers 401 ("Missing webhook signature
// headers") is distinguishable from a present-but-invalid 401 ("Invalid webhook
// signature"). svix-* and webhook-* must both clear the presence gate.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const hdrs = vi.hoisted(() => ({ store: {} as Record<string, string> }))
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => hdrs.store[k.toLowerCase()] ?? null,
    entries: () => Object.entries(hdrs.store)[Symbol.iterator](),
  }),
}))

import { POST } from '@/app/api/webhooks/resend/route'
import { NextRequest } from 'next/server'

const URL = 'https://app.test/api/webhooks/resend'

function post(body: unknown = { type: 'email.delivered', created_at: '', data: {} }): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

async function errOf(res: Response): Promise<string> {
  try { return ((await res.json()) as { error?: string }).error ?? '' } catch { return '' }
}

beforeEach(() => {
  hdrs.store = {}
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_dGVzdHNlY3JldA=='
})

const NOW = () => String(Math.floor(Date.now() / 1000))

describe('TC-RSVX-01: svix-* headers clear the presence check', () => {
  it('present svix-* (bad signature) → 401 but NOT the missing-headers 401', async () => {
    hdrs.store['svix-id']        = 'msg_1'
    hdrs.store['svix-timestamp'] = NOW()
    hdrs.store['svix-signature'] = 'v1,not-a-real-signature'
    const res = await POST(post())
    expect(res.status).toBe(401)
    const err = await errOf(res)
    expect(err).not.toBe('Missing webhook signature headers')
    expect(err).toBe('Invalid webhook signature')
  })
})

describe('TC-RSVX-02: webhook-* headers still work', () => {
  it('present webhook-* (bad signature) → reaches signature check, not missing-headers', async () => {
    hdrs.store['webhook-id']        = 'msg_1'
    hdrs.store['webhook-timestamp'] = NOW()
    hdrs.store['webhook-signature'] = 'v1,not-a-real-signature'
    const res = await POST(post())
    expect(res.status).toBe(401)
    expect(await errOf(res)).toBe('Invalid webhook signature')
  })
})

describe('TC-RSVX-03: neither convention → missing-headers 401', () => {
  it('no signature headers → 401 Missing webhook signature headers', async () => {
    const res = await POST(post())
    expect(res.status).toBe(401)
    expect(await errOf(res)).toBe('Missing webhook signature headers')
  })
})
