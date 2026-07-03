// mcm — Resend webhook gates termination on Permanent bounces only. Permanent ->
// status='bounced' AND terminateOnHardBounce called; Transient -> status='bounced'
// ONLY (no termination). TC-HBR-01..02

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

const cap = vi.hoisted(() => ({ statusUpdates: [] as string[] }))

// Mutable header store so requests can carry real Standard-Webhooks signatures
// (the route is fail-closed: unsigned deliveries are rejected).
const hdrs = vi.hoisted(() => ({ store: {} as Record<string, string> }))
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => hdrs.store[k.toLowerCase()] ?? null,
    entries: () => Object.entries(hdrs.store)[Symbol.iterator](),
  }),
}))

vi.mock('@/lib/supabase/service', () => {
  const send = {
    id: 'es-1', tenant_id: 't-1', workspace_id: 'ws-1', contact_id: 'c-1',
    company_id: 'co-1', draft_id: 'd-1', metadata: {}, status: 'sent',
    message_version_id: null, strategy_id: null,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function builder(table: string): any {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      _table: table,
      select: () => b,
      eq: () => b,
      insert: (p: Record<string, unknown>) => {
        if (table === 'email_events') return Promise.resolve({ error: null })
        return b // webhook_events.insert(...).select().single()
      },
      update: (p: Record<string, unknown>) => {
        if (table === 'email_sends' && typeof p.status === 'string') cap.statusUpdates.push(p.status as string)
        return b
      },
      single: () => Promise.resolve({ data: table === 'email_sends' ? send : { id: 'we-1' }, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    })
    return b
  }
  return { createSupabaseServiceClient: () => ({ from: (t: string) => builder(t) }) }
})

const term = vi.hoisted(() => ({ hard: 0, complaint: 0 }))
vi.mock('@/modules/messaging/services/bounce-termination.service', () => ({
  terminateOnHardBounce: vi.fn(async () => { term.hard++ }),
  markContactComplained: vi.fn(async () => { term.complaint++ }),
}))
vi.mock('@/modules/intelligence/structured-errors/structured-error.repo', () => ({
  createStructuredError: vi.fn(async () => ({})),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async () => undefined),
}))
vi.mock('@/modules/messaging/event-tracking/event-tracking.attribution', () => ({
  RESEND_EVENT_TO_ET_TYPE: {},
  resolvePhase3bAttributionFromSend: () => null,
  resolveMcmAttributionFromSend: () => null,
}))
vi.mock('@/modules/messaging/event-tracking/event-tracking.audit', () => ({
  buildWebhookOutcomePayload: () => ({}),
}))
vi.mock('@/modules/campaign-sequence/services/campaign-stop.service', () => ({
  stopAssignmentSchedule: vi.fn(async () => ({ stopped: 0 })),
}))

import { POST } from '@/app/api/webhooks/resend/route'
import { NextRequest } from 'next/server'
import { terminateOnHardBounce } from '@/modules/messaging/services/bounce-termination.service'

const TEST_KEY = 'testsecret'
const TEST_SECRET = 'whsec_' + Buffer.from(TEST_KEY).toString('base64')

// Sign the exact body per the Standard Webhooks spec (HMAC-SHA256 of id.ts.body)
function signBody(body: string): void {
  const id = 'msg_test'
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = crypto.createHmac('sha256', Buffer.from(TEST_KEY)).update(`${id}.${ts}.${body}`, 'utf8').digest('base64')
  hdrs.store['webhook-id'] = id
  hdrs.store['webhook-timestamp'] = ts
  hdrs.store['webhook-signature'] = `v1,${sig}`
}

function bouncePost(bounceType: string): NextRequest {
  const body = JSON.stringify({
    type: 'email.bounced',
    created_at: new Date().toISOString(),
    data: { email_id: 'msg-1', to: ['x@y.com'], bounce: { type: bounceType } },
  })
  signBody(body)
  return new NextRequest('https://app.test/api/webhooks/resend', {
    method: 'POST', body, headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  cap.statusUpdates = []
  term.hard = 0
  term.complaint = 0
  hdrs.store = {}
  process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET // requests are genuinely signed
})

describe('TC-HBR-01: Permanent bounce -> status=bounced + termination', () => {
  it('sets status and invokes terminateOnHardBounce', async () => {
    const res = await POST(bouncePost('Permanent'))
    expect(res.status).toBe(200)
    expect(cap.statusUpdates).toContain('bounced')
    expect(vi.mocked(terminateOnHardBounce)).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(terminateOnHardBounce).mock.calls[0][0]
    expect(arg).toMatchObject({ tenantId: 't-1', contactId: 'c-1', companyId: 'co-1', draftId: 'd-1', toEmail: 'x@y.com' })
  })
})

describe('TC-HBR-02: Transient bounce -> status only, NO termination', () => {
  it('sets status=bounced but never calls terminateOnHardBounce', async () => {
    const res = await POST(bouncePost('Transient'))
    expect(res.status).toBe(200)
    expect(cap.statusUpdates).toContain('bounced')
    expect(vi.mocked(terminateOnHardBounce)).not.toHaveBeenCalled()
  })
})
