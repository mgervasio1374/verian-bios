// ops-hardening — watchdog blind-spot fixes (audit findings):
//   (a) a tenant whose monitoring queries fail surfaces as `monitoringFailed`
//       instead of silently reading healthy,
//   (b) alert throttling is keyed per (check, tenant) so one tenant's alert
//       never suppresses the same check for other tenants,
//   (c) a dead-man ping fires after every completed run (external monitor
//       covers the cron-death blind spot), no-op when unconfigured.
// TC-OHW-01..04

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runOpsWatchdog,
  pingDeadmanMonitor,
  type TenantWatchdogData,
  type OpsWatchdogDeps,
} from '@/modules/intelligence/alerting/ops-watchdog.service'
import type { RecordActivityInput } from '@/modules/intelligence/services/activity-event.service'

const passing: TenantWatchdogData = {
  staleApprovedItems: [],
  stalePlannedItems: [],
  stuckSentSends: [],
  recentEmailEvents: [{ id: 'ev-1' }],
  recentLearningEvents: [{ id: 'le-1' }],
  recentSevereErrors: [],
}

const failing: TenantWatchdogData = {
  ...passing,
  stuckSentSends: [{ id: 's-1' }],
  recentEmailEvents: [],
}

function makeDeps(overrides: Partial<OpsWatchdogDeps> = {}) {
  const sent: Array<{ subject: string; body: string }> = []
  const marked: string[] = []
  const recorded: RecordActivityInput[] = []
  const pings: number[] = []
  const deps: Partial<OpsWatchdogDeps> = {
    listTenantIds: async () => ['t-1'],
    fetchTenantData: async () => passing,
    isAlertingEnabled: () => true,
    isAlertThrottled: async () => false,
    sendOpsEmail: async (subject, body) => { sent.push({ subject, body }); return true },
    markAlertSent: async (_tenantId, key) => { marked.push(key) },
    recordActivity: async (input) => { recorded.push(input); return {} },
    pingDeadman: async () => { pings.push(1) },
    now: new Date('2026-07-03T12:00:00Z'),
    ...overrides,
  }
  return { deps, sent, marked, recorded, pings }
}

beforeEach(() => {
  vi.restoreAllMocks()
  delete process.env.OPS_DEADMAN_PING_URL
})

describe('TC-OHW-01: monitoring failure is a failure, not silence', () => {
  it('fetchTenantData throwing → monitoringFailed failure + alert email', async () => {
    const { deps, sent } = makeDeps({
      fetchTenantData: async () => { throw new Error('db connection refused') },
    })
    const summary = await runOpsWatchdog(deps)

    expect(summary.failures).toHaveLength(1)
    expect(summary.failures[0].check).toBe('monitoringFailed')
    expect(summary.failures[0].detail).toContain('db connection refused')
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toContain('monitoringFailed')
  })

  it('one tenant failing to fetch does not blind the watchdog to the other', async () => {
    const { deps } = makeDeps({
      listTenantIds: async () => ['t-1', 't-2'],
      fetchTenantData: async (tenantId) => {
        if (tenantId === 't-1') throw new Error('boom')
        return failing
      },
    })
    const summary = await runOpsWatchdog(deps)
    const kinds = summary.failures.map((f) => `${f.check}@${f.tenantId}`).sort()
    expect(kinds).toEqual(['monitoringFailed@t-1', 'webhookSilent@t-2'])
  })
})

describe('TC-OHW-02: per-tenant throttle keys', () => {
  it("tenant A's throttled alert does not suppress tenant B's same check", async () => {
    const { deps, sent, marked } = makeDeps({
      listTenantIds: async () => ['t-a', 't-b'],
      fetchTenantData: async () => failing, // webhookSilent fails for both
      isAlertThrottled: async (key) => key === 'watchdog:webhookSilent:t-a',
    })
    const summary = await runOpsWatchdog(deps)

    expect(sent).toHaveLength(1)
    expect(sent[0].body).toContain('t-b')
    expect(sent[0].body).not.toContain('tenant t-a')
    expect(marked).toEqual(['watchdog:webhookSilent:t-b'])
    expect(summary.throttledChecks).toContain('webhookSilent')
    expect(summary.alertedChecks).toContain('webhookSilent')
  })

  it('throttle marker carries the exact failing tenant, per failure', async () => {
    const tenants: Array<string | undefined> = []
    const { deps } = makeDeps({
      listTenantIds: async () => ['t-a', 't-b'],
      fetchTenantData: async () => failing,
      markAlertSent: async (tenantId, _key) => { tenants.push(tenantId) },
    })
    await runOpsWatchdog(deps)
    expect(tenants.sort()).toEqual(['t-a', 't-b'])
  })
})

describe('TC-OHW-03: dead-man ping fires after every completed run', () => {
  it('pings on an all-healthy run', async () => {
    const { deps, pings } = makeDeps()
    await runOpsWatchdog(deps)
    expect(pings).toHaveLength(1)
  })

  it('pings on a failing run too — the ping means "watchdog ran", not "all healthy"', async () => {
    const { deps, pings } = makeDeps({ fetchTenantData: async () => failing })
    await runOpsWatchdog(deps)
    expect(pings).toHaveLength(1)
  })
})

describe('TC-OHW-04: pingDeadmanMonitor default implementation', () => {
  it('no-op when OPS_DEADMAN_PING_URL is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await pingDeadmanMonitor()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('GETs the configured URL and never throws on failure', async () => {
    process.env.OPS_DEADMAN_PING_URL = 'https://hc.test/ping/abc'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(pingDeadmanMonitor()).resolves.toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledWith('https://hc.test/ping/abc', expect.objectContaining({ method: 'GET' }))
  })
})
