// mcm — Surface the campaign send-dispatch AND scheduler operational gates in the
// System Controls UI catalog. The keys/enum/action/dispatcher already exist; this
// only makes the gates visible + toggleable. TC-SDV-01..05

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  ctx: { tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin', workspaceId: 'ws-1' } as Record<string, unknown>,
  listControls: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth/context', () => ({ buildRequestContext: vi.fn(async () => h.ctx) }))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  listControls:               vi.fn(async () => h.listControls),
  resolveSystemControl:       vi.fn(async () => null),
  upsertTenantBooleanControl: vi.fn(async () => undefined),
  setControlValue:            vi.fn(async () => undefined),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async () => undefined),
}))

import { getSystemControlsAction, updateSystemControlValueAction } from '@/modules/intelligence/actions/system-control.actions'

const KEY = 'campaign_send_dispatch_enabled'
const SCHED_KEY = 'campaign_scheduler_enabled'

beforeEach(() => {
  vi.clearAllMocks()
  h.ctx = { tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin', workspaceId: 'ws-1' }
  h.listControls = []
})

describe('TC-SDV-01: campaign_send_dispatch_enabled is visible in the catalog', () => {
  it('appears in the Email & Campaign Controls group, co-located with the other send gates', async () => {
    const res = await getSystemControlsAction()
    expect(res.success).toBe(true)
    const group = res.success ? res.data.find(g => g.group === 'Email & Campaign Controls') : undefined
    expect(group).toBeTruthy()
    const keys = group!.controls.map(c => c.key)
    expect(keys).toContain(KEY)
    expect(keys).toContain('email_sending_enabled')
    expect(keys).toContain('campaign_sending_enabled')
  })
})

describe('TC-SDV-02: it carries a non-empty danger warning', () => {
  it('warning text is present and conveys the blast radius', async () => {
    const res = await getSystemControlsAction()
    const control = res.success
      ? res.data.flatMap(g => g.controls).find(c => c.key === KEY)
      : undefined
    expect(control).toBeTruthy()
    expect(typeof control!.warning).toBe('string')
    expect((control!.warning ?? '').length).toBeGreaterThan(0)
    expect(control!.warning).toMatch(/DANGER/i)
  })
})

describe('TC-SDV-03: it is NOT flagged as a future control', () => {
  it('isFuture is false (operational gate, available now)', async () => {
    const res = await getSystemControlsAction()
    const control = res.success
      ? res.data.flatMap(g => g.controls).find(c => c.key === KEY)
      : undefined
    expect(control!.isFuture).toBe(false)
    // and the group it lives in is not a future group
    const group = res.success ? res.data.find(g => g.controls.some(c => c.key === KEY)) : undefined
    expect(group!.isFuture).toBe(false)
  })
})

describe('TC-SDV-04: campaign_scheduler_enabled is visible in the catalog', () => {
  it('appears in the Email & Campaign Controls group, non-future, with a non-empty warning', async () => {
    const res = await getSystemControlsAction()
    expect(res.success).toBe(true)
    const group = res.success ? res.data.find(g => g.group === 'Email & Campaign Controls') : undefined
    expect(group!.controls.map(c => c.key)).toContain(SCHED_KEY)
    const control = group!.controls.find(c => c.key === SCHED_KEY)
    expect(control).toBeTruthy()
    expect((control!.warning ?? '').length).toBeGreaterThan(0)
    expect(control!.isFuture).toBe(false)
  })
})

describe('TC-SDV-05: both MCM operational gates are toggleable (write path accepts the keys)', () => {
  it('updateSystemControlValueAction does not reject either key as unknown', async () => {
    for (const key of [KEY, SCHED_KEY]) {
      const res = await updateSystemControlValueAction(key, true)
      expect(res.success).toBe(true)
      expect(res.success && res.data.newValue).toBe(true)
    }
  })
})
