// Ops Alerting v1 — email alerts for silent failures. Covers the alert
// channel (env gating, activity_events-based hourly throttle, fail-safe),
// the createStructuredError severity hook, the five pure watchdog checks,
// and the watchdog digest orchestration.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Shared mocks ---------------------------------------------------------

const db = vi.hoisted(() => ({
  // resolved by .limit(...) per table
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  // resolved by .single() per table
  single: {} as Record<string, Record<string, unknown> | null>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {}
      for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'lt', 'contains', 'order']) {
        chain[m] = () => chain
      }
      chain.insert = (row: Record<string, unknown>) => {
        db.inserts.push({ table, row })
        return chain
      }
      chain.limit = async () => ({ data: db.rows[table] ?? [], error: null })
      chain.single = async () => ({ data: db.single[table] ?? null, error: null })
      return chain
    },
  }),
}))

const resendMock = vi.hoisted(() => ({
  send: vi.fn(async (_input?: unknown) => ({ data: { id: 'resend-1' }, error: null })),
}))
vi.mock('@/lib/resend/client', () => ({ resend: { emails: { send: resendMock.send } } }))

import { sendOpsAlert } from '@/modules/intelligence/alerting/alerting.service'
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import {
  checkDispatcherStalled,
  checkSchedulerStalled,
  checkWebhookSilent,
  checkLearningRunMissed,
  checkErrorSpike,
} from '@/modules/intelligence/alerting/ops-watchdog.checks'
import {
  runOpsWatchdog,
  evaluateTenantChecks,
  type TenantWatchdogData,
  type OpsWatchdogDeps,
} from '@/modules/intelligence/alerting/ops-watchdog.service'
import type { RecordActivityInput } from '@/modules/intelligence/services/activity-event.service'

beforeEach(() => {
  vi.clearAllMocks()
  db.rows = {}
  db.single = {}
  db.inserts = []
  process.env.ALERT_EMAIL = 'ops@verian.test'
  process.env.ALERT_FROM_EMAIL = 'Verian Ops <alerts@verian.test>'
  resendMock.send.mockImplementation(async () => ({ data: { id: 'resend-1' }, error: null }))
})

const flush = () => new Promise((r) => setTimeout(r, 5))

// ---- A) sendOpsAlert -------------------------------------------------------

describe('TC-OPS-A: sendOpsAlert channel', () => {
  it('returns alerting_disabled and skips Resend when either env is unset', async () => {
    delete process.env.ALERT_EMAIL
    const res = await sendOpsAlert({ tenantId: 't-1', key: 'k', subject: 's', body: 'b' })
    expect(res).toEqual({ sent: false, reason: 'alerting_disabled' })
    expect(resendMock.send).not.toHaveBeenCalled()

    process.env.ALERT_EMAIL = 'ops@verian.test'
    delete process.env.ALERT_FROM_EMAIL
    const res2 = await sendOpsAlert({ tenantId: 't-1', key: 'k', subject: 's', body: 'b' })
    expect(res2).toEqual({ sent: false, reason: 'alerting_disabled' })
    expect(resendMock.send).not.toHaveBeenCalled()
  })

  it('sends via Resend with env from/to and records OPS_ALERT_SENT with the key', async () => {
    const res = await sendOpsAlert({
      tenantId: 't-1',
      key: 'watchdog:webhookSilent',
      subject: 'Webhook silent',
      body: 'details',
    })
    expect(res).toEqual({ sent: true })
    expect(resendMock.send).toHaveBeenCalledTimes(1)
    expect(resendMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Verian Ops <alerts@verian.test>',
        to: ['ops@verian.test'],
        subject: 'Webhook silent',
      }),
    )
    const marker = db.inserts.find((i) => i.table === 'activity_events')
    expect(marker?.row).toMatchObject({
      tenant_id: 't-1',
      event_type: 'OPS_ALERT_SENT',
      metadata: { alert_key: 'watchdog:webhookSilent', subject: 'Webhook silent' },
    })
  })

  it('throttles when a recent OPS_ALERT_SENT with the same key exists', async () => {
    db.rows['activity_events'] = [{ id: 'evt-1' }]
    const res = await sendOpsAlert({ tenantId: 't-1', key: 'k', subject: 's', body: 'b' })
    expect(res).toEqual({ sent: false, reason: 'throttled' })
    expect(resendMock.send).not.toHaveBeenCalled()
  })

  it('catches a throwing Resend client and returns sent:false', async () => {
    resendMock.send.mockImplementation(async () => {
      throw new Error('resend down')
    })
    const res = await sendOpsAlert({ tenantId: 't-1', key: 'k', subject: 's', body: 'b' })
    expect(res).toEqual({ sent: false, reason: 'send_failed' })
  })
})

// ---- B) createStructuredError hook ------------------------------------------

const failureRow = (severity: string) => ({
  id: 'af-1',
  tenant_id: 't-1',
  severity,
  failure_type: 'send_dispatch',
  error_code: 'SEND_GATE_STUCK',
})

const errorInput = {
  tenantId: 't-1',
  failureType: 'send_dispatch',
  errorCode: 'SEND_GATE_STUCK',
  errorMessage: 'dispatcher wedged',
  severity: 'critical',
}

describe('TC-OPS-B: createStructuredError alert hook', () => {
  it("severity 'critical' fires sendOpsAlert (Resend called, keyed by error code)", async () => {
    db.single['automation_failures'] = failureRow('critical')
    const row = await createStructuredError(errorInput as never)
    expect(row).toMatchObject({ id: 'af-1', severity: 'critical' })
    await vi.waitFor(() => expect(resendMock.send).toHaveBeenCalledTimes(1))
    const call = resendMock.send.mock.calls[0][0] as { subject: string; text: string }
    expect(call.subject).toContain('SEND_GATE_STUCK')
    expect(call.subject).toContain('critical')
    expect(call.text).toContain('dispatcher wedged')
  })

  it("severity 'warning' does NOT fire sendOpsAlert", async () => {
    db.single['automation_failures'] = failureRow('warning')
    await createStructuredError({ ...errorInput, severity: 'warning' } as never)
    await flush()
    expect(resendMock.send).not.toHaveBeenCalled()
  })

  it('alert failure does not affect the inserted error being returned', async () => {
    db.single['automation_failures'] = failureRow('critical')
    resendMock.send.mockImplementation(async () => {
      throw new Error('resend down')
    })
    const row = await createStructuredError(errorInput as never)
    expect(row).toMatchObject({ id: 'af-1', severity: 'critical' })
    await flush()
  })
})

// ---- C) Pure watchdog checks ------------------------------------------------

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r-${i}` }))

describe('TC-OPS-C: pure watchdog checks', () => {
  it('dispatcherStalled: stale approved items → fail; none → pass', () => {
    expect(checkDispatcherStalled(ids(3)).ok).toBe(false)
    expect(checkDispatcherStalled([])).toEqual({ ok: true })
  })

  it('schedulerStalled: stale planned items → fail; none → pass', () => {
    expect(checkSchedulerStalled(ids(2)).ok).toBe(false)
    expect(checkSchedulerStalled([])).toEqual({ ok: true })
  })

  it('webhookSilent: stuck sent rows + no recent events → fail; recent events → pass', () => {
    const failing = checkWebhookSilent(ids(4), [])
    expect(failing.ok).toBe(false)
    if (!failing.ok) expect(failing.detail).toContain('webhook')
    expect(checkWebhookSilent(ids(4), ids(1))).toEqual({ ok: true })
    expect(checkWebhookSilent([], [])).toEqual({ ok: true })
  })

  it('learningRunMissed: no LA_SIGNALS_COMPUTED in window → fail; one present → pass', () => {
    const failing = checkLearningRunMissed([])
    expect(failing.ok).toBe(false)
    if (!failing.ok) expect(failing.detail).toContain('LA_SIGNALS_COMPUTED')
    expect(checkLearningRunMissed(ids(1))).toEqual({ ok: true })
  })

  it('errorSpike: >= 5 severe errors in the hour → fail; 4 → pass', () => {
    expect(checkErrorSpike(ids(5)).ok).toBe(false)
    expect(checkErrorSpike(ids(4))).toEqual({ ok: true })
  })
})

// ---- D) Watchdog digest orchestration ----------------------------------------

const passingData: TenantWatchdogData = {
  staleApprovedItems: [],
  stalePlannedItems: [],
  stuckSentSends: [],
  recentEmailEvents: [],
  recentLearningEvents: [{ id: 'la-1' }],
  recentSevereErrors: [],
}

// webhookSilent + learningRunMissed both fail
const failingData: TenantWatchdogData = {
  ...passingData,
  stuckSentSends: [{ id: 's-1' }, { id: 's-2' }],
  recentLearningEvents: [],
}

function makeDeps(data: TenantWatchdogData) {
  const sent: Array<{ subject: string; body: string }> = []
  const marked: string[] = []
  const recorded: RecordActivityInput[] = []
  const deps: Partial<OpsWatchdogDeps> = {
    listTenantIds: async () => ['t-1'],
    fetchTenantData: async () => data,
    isAlertingEnabled: () => true,
    isAlertThrottled: async () => false,
    sendOpsEmail: async (subject, body) => {
      sent.push({ subject, body })
      return true
    },
    markAlertSent: async (_tenantId, key) => {
      marked.push(key)
    },
    recordActivity: async (input) => {
      recorded.push(input)
      return {}
    },
    now: new Date('2026-07-03T12:00:00Z'),
  }
  return { deps, sent, marked, recorded }
}

describe('TC-OPS-D: watchdog digest', () => {
  it('evaluateTenantChecks names the failing checks', () => {
    const failures = evaluateTenantChecks('t-1', failingData)
    expect(failures.map((f) => f.check).sort()).toEqual(['learningRunMissed', 'webhookSilent'])
    expect(evaluateTenantChecks('t-1', passingData)).toEqual([])
  })

  it('two failing checks → ONE email naming both, throttle marked per check', async () => {
    const { deps, sent, marked, recorded } = makeDeps(failingData)
    const summary = await runOpsWatchdog(deps)

    expect(sent).toHaveLength(1)
    expect(sent[0].body).toContain('webhookSilent')
    expect(sent[0].body).toContain('learningRunMissed')
    expect(marked.sort()).toEqual(['watchdog:learningRunMissed', 'watchdog:webhookSilent'])
    expect(summary.alertSent).toBe(true)

    const heartbeat = recorded.find((r) => r.eventType === 'WATCHDOG_RAN')
    expect(heartbeat).toBeDefined()
    expect(heartbeat?.metadata).toMatchObject({ checks_run: 5 })
    expect((heartbeat?.metadata?.failures as unknown[]).length).toBe(2)
  })

  it('all checks passing → no email, WATCHDOG_RAN still recorded', async () => {
    const { deps, sent, recorded } = makeDeps(passingData)
    const summary = await runOpsWatchdog(deps)

    expect(sent).toHaveLength(0)
    expect(summary.failures).toEqual([])
    const heartbeat = recorded.find((r) => r.eventType === 'WATCHDOG_RAN')
    expect(heartbeat?.metadata).toMatchObject({ checks_run: 5, failures: [] })
  })

  it('a throttled check is excluded from the digest; the other still alerts', async () => {
    const { deps, sent, marked } = makeDeps(failingData)
    deps.isAlertThrottled = async (key) => key === 'watchdog:webhookSilent'
    await runOpsWatchdog(deps)

    expect(sent).toHaveLength(1)
    expect(sent[0].body).toContain('learningRunMissed')
    expect(sent[0].body).not.toContain('webhookSilent')
    expect(marked).toEqual(['watchdog:learningRunMissed'])
  })

  it('alerting disabled → no email and no throttle reads, WATCHDOG_RAN still recorded', async () => {
    const { deps, sent, recorded } = makeDeps(failingData)
    deps.isAlertingEnabled = () => false
    const throttleSpy = vi.fn(async () => false)
    deps.isAlertThrottled = throttleSpy
    const summary = await runOpsWatchdog(deps)

    expect(sent).toHaveLength(0)
    expect(throttleSpy).not.toHaveBeenCalled()
    expect(summary.failures).toHaveLength(2)
    expect(recorded.some((r) => r.eventType === 'WATCHDOG_RAN')).toBe(true)
  })
})
