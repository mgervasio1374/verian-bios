// mcm-v2 — Inbound reply webhook route (P3.5). Auth + always-200 contract.
// ops-hardening: raw-payload ledger (webhook_events, source 'inbound_email')
// written BEFORE processing; 500 only when the ledger write itself fails.
// TC-IRR-01..07

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

// Ledger mock: records inserts/updates against webhook_events so the tests can
// assert the write-before-process durability contract.
const ledger = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  insertFails: false,
}))
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (table === 'webhook_events') ledger.inserts.push(row)
        return {
          select: () => ({
            single: () => Promise.resolve(
              ledger.insertFails
                ? { data: null, error: { message: 'db down' } }
                : { data: { id: 'we-1' }, error: null },
            ),
          }),
        }
      },
      update: (patch: Record<string, unknown>) => {
        if (table === 'webhook_events') ledger.updates.push(patch)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  }),
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
  ledger.inserts = []
  ledger.updates = []
  ledger.insertFails = false
  process.env.INBOUND_EMAIL_WEBHOOK_SECRET = 'secret'
})

describe('TC-IRR-01: auth — missing/bad secret → 401, no processing', () => {
  it('missing header → 401', async () => {
    const res = await POST(req(JSON.stringify(VALID)))
    expect(res.status).toBe(401)
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
    expect(ledger.inserts).toHaveLength(0)
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

describe('TC-IRR-06: durable ledger — raw payload persisted before processing', () => {
  it('writes the full raw payload to webhook_events with source inbound_email', async () => {
    hdrs.store['x-inbound-secret'] = 'secret'
    await POST(req(JSON.stringify(VALID)))
    expect(ledger.inserts).toHaveLength(1)
    const row = ledger.inserts[0]
    expect(row.source).toBe('inbound_email')
    expect(row.event_type).toBe('email.inbound')
    expect((row.payload as Record<string, unknown>).from).toBe('p@x.com')
    expect((row.payload as Record<string, unknown>).text).toBe('yes')
  })

  it('success → ledger row marked processed', async () => {
    hdrs.store['x-inbound-secret'] = 'secret'
    await POST(req(JSON.stringify(VALID)))
    expect(ledger.updates).toHaveLength(1)
    expect(ledger.updates[0].processed).toBe(true)
    expect(ledger.updates[0].processed_at).toBeTruthy()
  })

  it('capture failure → error_message recorded, row stays unprocessed (replayable)', async () => {
    hdrs.store['x-inbound-secret'] = 'secret'
    cap.throws = true
    const res = await POST(req(JSON.stringify(VALID)))
    expect(res.status).toBe(200)
    expect(ledger.inserts).toHaveLength(1)          // raw payload is safe
    expect(ledger.updates).toHaveLength(1)
    expect(ledger.updates[0].error_message).toBe('boom')
    expect(ledger.updates[0].processed).toBeUndefined() // never flipped to true
  })
})

describe('TC-IRR-07: ledger write failure → 500 (provider retry is the only copy)', () => {
  it('returns 500 and never invokes capture', async () => {
    hdrs.store['x-inbound-secret'] = 'secret'
    ledger.insertFails = true
    const res = await POST(req(JSON.stringify(VALID)))
    expect(res.status).toBe(500)
    expect(vi.mocked(captureInboundReply)).not.toHaveBeenCalled()
  })
})
