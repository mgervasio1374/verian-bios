// send-circuit-breaker — automatic kill switch on deliverability. Trips the
// global dispatch gate when the rolling bounce (2%) or complaint (0.1%) rate
// breaches its limit, before a stale list can get the domain blocked or the
// Resend account suspended. TC-SCB-01..09

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  evaluateSendHealth,
  BOUNCE_RATE_LIMIT,
  COMPLAINT_RATE_LIMIT,
  MIN_SAMPLE,
} from '@/modules/messaging/services/send-circuit-breaker.service'

// ---- Pure threshold logic ----------------------------------------------------

describe('TC-SCB-01: thresholds are the intended values', () => {
  it('2% bounce, 0.1% complaint, 50-send minimum sample', () => {
    expect(BOUNCE_RATE_LIMIT).toBe(0.02)
    expect(COMPLAINT_RATE_LIMIT).toBe(0.001)
    expect(MIN_SAMPLE).toBe(50)
  })
})

describe('TC-SCB-02: bounce rate at or above 2% trips', () => {
  it('trips at exactly 2%', () => {
    const v = evaluateSendHealth({ total: 100, bounced: 2, complained: 0 })
    expect(v.trip).toBe(true)
    if (v.trip) {
      expect(v.reason).toBe('bounce_rate')
      expect(v.detail).toContain('2.00%')
      expect(v.detail).toContain('2/100')
    }
  })
  it('does not trip just below', () => {
    const v = evaluateSendHealth({ total: 1000, bounced: 19, complained: 0 })
    expect(v.trip).toBe(false)
    if (!v.trip) expect(v.reason).toBe('healthy')
  })
  it('trips hard on a genuinely dirty list (the 10% case)', () => {
    const v = evaluateSendHealth({ total: 200, bounced: 20, complained: 0 })
    expect(v.trip).toBe(true)
  })
})

describe('TC-SCB-03: complaints trip at the much lower 0.1%', () => {
  it('1 complaint in 1000 trips, while 1 bounce in 1000 does not', () => {
    expect(evaluateSendHealth({ total: 1000, bounced: 0, complained: 1 }).trip).toBe(true)
    expect(evaluateSendHealth({ total: 1000, bounced: 1, complained: 0 }).trip).toBe(false)
  })
  it('complaint reason wins when both breach', () => {
    const v = evaluateSendHealth({ total: 100, bounced: 10, complained: 5 })
    expect(v.trip && v.reason).toBe('complaint_rate')
  })
})

describe('TC-SCB-04: below the minimum sample it never trips', () => {
  it('warmup noise does not fire the breaker', () => {
    // Day one of warmup: 20 sends, 1 bounce = 5%. Real rate, meaningless sample.
    const v = evaluateSendHealth({ total: 20, bounced: 1, complained: 0 })
    expect(v.trip).toBe(false)
    if (!v.trip) expect(v.reason).toBe('below_sample')
  })
  it('engages the moment the sample is large enough', () => {
    expect(evaluateSendHealth({ total: 49, bounced: 5, complained: 0 }).trip).toBe(false)
    expect(evaluateSendHealth({ total: 50, bounced: 5, complained: 0 }).trip).toBe(true)
  })
  it('zero sends is safe, not a divide-by-zero', () => {
    const v = evaluateSendHealth({ total: 0, bounced: 0, complained: 0 })
    expect(v.trip).toBe(false)
    expect(v.bounceRate).toBe(0)
  })
})

// ---- Trip action -------------------------------------------------------------

const h = vi.hoisted(() => ({
  dispatchOn: true,
  rows: [] as Array<{ status: string }>,
  gateWrites: [] as Array<{ key: string; value: boolean }>,
  errors: [] as Array<Record<string, unknown>>,
  activities: [] as Array<Record<string, unknown>>,
  loadThrows: false,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {}
      Object.assign(b, {
        select: () => b,
        eq: () => b,
        gte: () => h.loadThrows
          ? Promise.resolve({ data: null, error: { message: 'db down' } })
          : Promise.resolve({ data: h.rows, error: null }),
      })
      return b
    },
  }),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => h.dispatchOn),
  upsertTenantBooleanControl: vi.fn(async (key: string, value: boolean) => {
    h.gateWrites.push({ key, value })
  }),
}))
vi.mock('@/modules/intelligence/structured-errors/structured-error.repo', () => ({
  createStructuredError: vi.fn(async (e: Record<string, unknown>) => { h.errors.push(e); return { id: 'af-1' } }),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async (a: Record<string, unknown>) => { h.activities.push(a) }),
}))

import { checkSendCircuitBreaker } from '@/modules/messaging/services/send-circuit-breaker.service'

const sends = (total: number, bounced = 0, complained = 0) => [
  ...Array.from({ length: bounced },    () => ({ status: 'bounced' })),
  ...Array.from({ length: complained }, () => ({ status: 'complained' })),
  ...Array.from({ length: total - bounced - complained }, () => ({ status: 'delivered' })),
]

beforeEach(() => {
  vi.clearAllMocks()
  h.dispatchOn = true
  h.rows = []
  h.gateWrites = []
  h.errors = []
  h.activities = []
  h.loadThrows = false
})

describe('TC-SCB-05: a breach kills the dispatch gate', () => {
  it('flips campaign_send_dispatch_enabled to false', async () => {
    h.rows = sends(200, 20)
    const out = await checkSendCircuitBreaker('t-1')
    expect(out.tripped).toBe(true)
    expect(h.gateWrites).toEqual([{ key: 'campaign_send_dispatch_enabled', value: false }])
  })

  it('raises a CRITICAL structured error (which pages a human)', async () => {
    h.rows = sends(200, 20)
    await checkSendCircuitBreaker('t-1')
    expect(h.errors).toHaveLength(1)
    expect(h.errors[0].errorCode).toBe('SEND_CIRCUIT_BREAKER_TRIPPED')
    expect(h.errors[0].severity).toBe('critical')
    expect(String(h.errors[0].errorMessage)).toContain('will NOT re-arm')
  })

  it('records why, durably', async () => {
    h.rows = sends(200, 20)
    await checkSendCircuitBreaker('t-1')
    const a = h.activities.find(x => x.eventType === 'SEND_CIRCUIT_BREAKER_TRIPPED')
    expect(a).toBeTruthy()
    expect((a!.metadata as Record<string, unknown>).reason).toBe('bounce_rate')
    expect((a!.metadata as Record<string, unknown>).sample).toBe(200)
  })
})

describe('TC-SCB-06: healthy sending is left alone', () => {
  it('no gate write, no error, no alert', async () => {
    h.rows = sends(500, 4)   // 0.8%
    const out = await checkSendCircuitBreaker('t-1')
    expect(out.tripped).toBe(false)
    expect(h.gateWrites).toHaveLength(0)
    expect(h.errors).toHaveLength(0)
  })
})

describe('TC-SCB-07: idempotent — never re-alerts once dispatch is already off', () => {
  it('short-circuits without querying or writing', async () => {
    h.dispatchOn = false
    h.rows = sends(200, 20)
    const out = await checkSendCircuitBreaker('t-1')
    expect(out.tripped).toBe(false)
    expect(out.tripped === false && out.reason).toBe('dispatch_already_off')
    expect(h.gateWrites).toHaveLength(0)
    expect(h.errors).toHaveLength(0)
  })
})

describe('TC-SCB-08: never throws — it runs inside the Resend webhook', () => {
  it('a failed count load returns cleanly instead of propagating', async () => {
    h.loadThrows = true
    const out = await checkSendCircuitBreaker('t-1')
    expect(out.tripped).toBe(false)
    expect(out.tripped === false && out.reason).toBe('error')
  })
})

describe('TC-SCB-09: wired into both trigger paths', () => {
  it('the Resend webhook evaluates it on bounce and complaint', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'api', 'webhooks', 'resend', 'route.ts'), 'utf8')
    expect(src).toContain('checkSendCircuitBreaker')
    expect(src).toContain("eventType === 'email.bounced' || eventType === 'email.complained'")
    expect(src).toContain('await checkSendCircuitBreaker')   // awaited, not fire-and-forget
  })
  it('the ops watchdog backstops it every 30 minutes', () => {
    const src = readFileSync(
      join(__dirname, '..', 'modules', 'intelligence', 'alerting', 'ops-watchdog.service.ts'), 'utf8')
    expect(src).toContain('checkCircuitBreaker')
    expect(src).toContain('checkSendCircuitBreaker')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
