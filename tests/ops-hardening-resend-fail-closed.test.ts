// ops-hardening — Resend webhook is FAIL-CLOSED: a missing RESEND_WEBHOOK_SECRET
// rejects the delivery (503) instead of processing unsigned provider events.
// Previously the entire signature check was skipped when the env var was unset,
// so any unsigned POST was accepted (audit finding). TC-RFC-01..03

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

const hdrs = vi.hoisted(() => ({ store: {} as Record<string, string> }))
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => hdrs.store[k.toLowerCase()] ?? null,
    entries: () => Object.entries(hdrs.store)[Symbol.iterator](),
  }),
}))

// Minimal service-client mock so a validly-signed request can run the full
// handler (webhook_events audit insert + processing) without a database.
vi.mock('@/lib/supabase/service', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function builder(table: string): any {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      insert: () => (table === 'email_events' ? Promise.resolve({ error: null }) : b),
      update: () => b,
      single: () => Promise.resolve({ data: table === 'email_sends' ? null : { id: 'we-1' }, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    })
    return b
  }
  return { createSupabaseServiceClient: () => ({ from: (t: string) => builder(t) }) }
})
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async () => undefined),
}))
vi.mock('@/modules/intelligence/structured-errors/structured-error.repo', () => ({
  createStructuredError: vi.fn(async () => ({})),
}))
vi.mock('@/modules/messaging/services/bounce-termination.service', () => ({
  terminateOnHardBounce: vi.fn(async () => {}),
  markContactComplained: vi.fn(async () => {}),
}))
vi.mock('@/modules/campaign-sequence/services/campaign-stop.service', () => ({
  stopAssignmentSchedule: vi.fn(async () => ({ stopped: 0 })),
}))

import { POST } from '@/app/api/webhooks/resend/route'
import { NextRequest } from 'next/server'

const TEST_KEY = 'testsecret'
const TEST_SECRET = 'whsec_' + Buffer.from(TEST_KEY).toString('base64')
const BODY = JSON.stringify({ type: 'email.delivered', created_at: '2026-07-03T00:00:00Z', data: { email_id: 'msg-1' } })

function signBody(body: string): void {
  const id = 'msg_test'
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = crypto.createHmac('sha256', Buffer.from(TEST_KEY)).update(`${id}.${ts}.${body}`, 'utf8').digest('base64')
  hdrs.store['webhook-id'] = id
  hdrs.store['webhook-timestamp'] = ts
  hdrs.store['webhook-signature'] = `v1,${sig}`
}

function post(body: string = BODY): NextRequest {
  return new NextRequest('https://app.test/api/webhooks/resend', {
    method: 'POST', body, headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  hdrs.store = {}
  delete process.env.RESEND_WEBHOOK_SECRET
})

describe('TC-RFC-01: missing secret → fail closed', () => {
  it('rejects with 503 even when the payload looks valid', async () => {
    const res = await POST(post())
    expect(res.status).toBe(503)
    const json = (await res.json()) as { error?: string }
    expect(json.error).toBe('Webhook signing secret not configured')
  })

  it('rejects signed requests too — no secret means no verification is possible', async () => {
    signBody(BODY) // headers present, but the server has nothing to verify against
    const res = await POST(post())
    expect(res.status).toBe(503)
  })
})

describe('TC-RFC-02: configured secret + valid signature → processed', () => {
  it('accepts a genuinely HMAC-signed delivery end-to-end', async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET
    signBody(BODY)
    const res = await POST(post())
    expect(res.status).toBe(200)
    expect(((await res.json()) as { received?: boolean }).received).toBe(true)
  })
})

describe('TC-RFC-03: configured secret + unsigned request → 401', () => {
  it('still distinguishes missing headers from missing secret', async () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET
    const res = await POST(post())
    expect(res.status).toBe(401)
    const json = (await res.json()) as { error?: string }
    expect(json.error).toBe('Missing webhook signature headers')
  })
})
