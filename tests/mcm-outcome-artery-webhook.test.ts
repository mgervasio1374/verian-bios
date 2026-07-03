// mcm — Resend webhook attributes MCM outcome events to the campaign schedule
// item (Analytics + Learning Agent). Phase 3B byte-identical; unattributed no-op;
// emission failure never breaks the 200. TC-OAW-01..05

import { describe, it, expect, vi, beforeEach } from 'vitest'

const cfg = vi.hoisted(() => ({
  // the email_sends row returned for the resend_message_id
  send: {} as Record<string, unknown>,
  events: [] as Array<Record<string, unknown>>,
  recordThrows: false,
}))

vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null, entries: () => [][Symbol.iterator]() }),
}))

vi.mock('@/lib/supabase/service', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function builder(table: string): any {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b, eq: () => b,
      insert: () => (table === 'email_events' ? Promise.resolve({ error: null }) : b),
      update: () => b,
      single: () => Promise.resolve({ data: table === 'email_sends' ? cfg.send : { id: 'we-1' }, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    })
    return b
  }
  return { createSupabaseServiceClient: () => ({ from: (t: string) => builder(t) }) }
})

vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async (e: Record<string, unknown>) => {
    if (cfg.recordThrows) throw new Error('telemetry down')
    cfg.events.push(e)
  }),
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
// event-tracking.attribution + audit use the REAL pure functions (no mock).

import { POST } from '@/app/api/webhooks/resend/route'
import { NextRequest } from 'next/server'

function post(type: string): NextRequest {
  const body = JSON.stringify({ type, created_at: '2026-07-03T00:00:00Z', data: { email_id: 'msg-1', to: ['bob@x.com'] } })
  return new NextRequest('https://app.test/api/webhooks/resend', { method: 'POST', body, headers: { 'content-type': 'application/json' } })
}

const MCM_SEND = {
  id: 'es-1', tenant_id: 't-1', workspace_id: 'ws-1', contact_id: 'c-1', company_id: 'co-1', draft_id: 'd-1',
  message_version_id: null, strategy_id: null, status: 'sent',
  metadata: { source: 'mcm_campaign', campaign_assignment_id: 'a-1', campaign_sequence_id: 'seq-1', campaign_schedule_item_id: 'si-1', campaign_sequence_step_id: 'step-1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  cfg.events = []
  cfg.recordThrows = false
  cfg.send = { ...MCM_SEND }
  delete process.env.RESEND_WEBHOOK_SECRET
})

describe('TC-OAW-01: MCM send delivered → ET_EMAIL_DELIVERED on the campaign schedule item', () => {
  it('records the outcome with campaign entity + contact/company', async () => {
    const res = await POST(post('email.delivered'))
    expect(res.status).toBe(200)
    const ev = cfg.events.find(e => e.eventType === 'ET_EMAIL_DELIVERED')
    expect(ev).toBeTruthy()
    expect(ev!.entityType).toBe('campaign_schedule_item')
    expect(ev!.entityId).toBe('si-1')
    expect(ev!.contactId).toBe('c-1')
    expect(ev!.companyId).toBe('co-1')
    expect((ev!.metadata as Record<string, unknown>).campaign_assignment_id).toBe('a-1')
    expect((ev!.metadata as Record<string, unknown>).source).toBe('mcm_campaign')
  })
})

describe('TC-OAW-02: MCM send clicked → ET_EMAIL_CLICKED on the campaign schedule item', () => {
  it('records the click outcome', async () => {
    const res = await POST(post('email.clicked'))
    expect(res.status).toBe(200)
    const ev = cfg.events.find(e => e.eventType === 'ET_EMAIL_CLICKED')
    expect(ev?.entityType).toBe('campaign_schedule_item')
    expect(ev?.entityId).toBe('si-1')
  })
})

describe('TC-OAW-03: Phase 3B send is unchanged — message_version entity', () => {
  it('emits on message_version, not campaign_schedule_item', async () => {
    cfg.send = {
      id: 'es-2', tenant_id: 't-1', workspace_id: 'ws-1', contact_id: 'c-2', company_id: 'co-2', draft_id: 'd-2',
      message_version_id: 'mv-1', strategy_id: 'st-1', status: 'sent',
      metadata: { source: 'phase_3b_send_bridge', message_version_id: 'mv-1', version_label: 'V1', lead_id: 'l-2' },
    }
    const res = await POST(post('email.delivered'))
    expect(res.status).toBe(200)
    const ev = cfg.events.find(e => e.eventType === 'ET_EMAIL_DELIVERED')
    expect(ev!.entityType).toBe('message_version')
    expect(ev!.entityId).toBe('mv-1')
  })
})

describe('TC-OAW-04: unattributed send (no source, no FK) → NO activity event', () => {
  it('records nothing', async () => {
    cfg.send = {
      id: 'es-3', tenant_id: 't-1', workspace_id: 'ws-1', contact_id: 'c-3', company_id: null, draft_id: 'd-3',
      message_version_id: null, strategy_id: null, status: 'sent', metadata: { draft_id: 'd-3' },
    }
    const res = await POST(post('email.delivered'))
    expect(res.status).toBe(200)
    expect(cfg.events.filter(e => String(e.eventType).startsWith('ET_EMAIL_'))).toHaveLength(0)
  })
})

describe('TC-OAW-05: emission failure never breaks the webhook 200', () => {
  it('recordActivity throwing still returns 200', async () => {
    cfg.recordThrows = true
    const res = await POST(post('email.delivered'))
    expect(res.status).toBe(200)
  })
})
