// mcm-v2 — System Controls tenant-aware read fix (companion to surface-advisory).
// getSystemControlsAction must resolve tenant rows with precedence over platform
// and display the EFFECTIVE on-state (both flags). page.tsx must no longer disable
// the toggle for unseeded controls. TC-SCT-01..05

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({
  ctx: { tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin', workspaceId: 'ws-1' } as Record<string, unknown>,
  platform: [] as unknown[],
  tenant:   [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth/context', () => ({ buildRequestContext: vi.fn(async () => h.ctx) }))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  // listControls(null) → platform rows; listControls(tenantId) → tenant rows.
  listControls: vi.fn(async (tenantId?: string | null) => (tenantId == null ? h.platform : h.tenant)),
  resolveSystemControl:       vi.fn(async () => null),
  upsertTenantBooleanControl: vi.fn(async () => undefined),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async () => undefined),
}))

import { getSystemControlsAction } from '@/modules/intelligence/actions/system-control.actions'

function ctrl(key: string, over: Record<string, unknown> = {}) {
  return { key, label: key, description: null, value: true, is_enabled: true, ...over }
}

function find(data: Awaited<ReturnType<typeof getSystemControlsAction>>, key: string) {
  if (!data.success) throw new Error('action failed')
  for (const g of data.data) {
    const c = g.controls.find(x => x.key === key)
    if (c) return c
  }
  throw new Error(`control ${key} not found`)
}

beforeEach(() => {
  vi.clearAllMocks()
  h.ctx = { tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin', workspaceId: 'ws-1' }
  h.platform = []
  h.tenant = []
})

describe('TC-SCT-01: a tenant-only row renders exists=true + booleanValue=true', () => {
  it('reads tenant rows (platform absent)', async () => {
    h.tenant = [ctrl('statement_review_agent_enabled', { is_enabled: true, value: true })]
    const res = await getSystemControlsAction()
    const c = find(res, 'statement_review_agent_enabled')
    expect(c.exists).toBe(true)
    expect(c.booleanValue).toBe(true)
  })
})

describe('TC-SCT-02: a tenant row overrides a conflicting platform row', () => {
  it('tenant ON wins over platform OFF', async () => {
    h.platform = [ctrl('copywriting_agent_llm_enabled', { is_enabled: false, value: false })]
    h.tenant   = [ctrl('copywriting_agent_llm_enabled', { is_enabled: true,  value: true })]
    const res = await getSystemControlsAction()
    const c = find(res, 'copywriting_agent_llm_enabled')
    expect(c.exists).toBe(true)
    expect(c.booleanValue).toBe(true)
  })
})

describe('TC-SCT-03: effective-state — one flag false renders booleanValue=false', () => {
  it('is_enabled=true, value=false → false', async () => {
    h.tenant = [ctrl('quality_auto_approve_enabled', { is_enabled: true, value: false })]
    const a = find(await getSystemControlsAction(), 'quality_auto_approve_enabled')
    expect(a.booleanValue).toBe(false)
    expect(a.isEnabled).toBe(true) // unchanged: reflects row.is_enabled
  })

  it('is_enabled=false, value=true → false', async () => {
    h.tenant = [ctrl('quality_auto_approve_enabled', { is_enabled: false, value: true })]
    const b = find(await getSystemControlsAction(), 'quality_auto_approve_enabled')
    expect(b.booleanValue).toBe(false)
  })
})

describe('TC-SCT-04: a never-seeded control still renders with sane off defaults', () => {
  it('exists=false, booleanValue=null when no row at any scope', async () => {
    const c = find(await getSystemControlsAction(), 'agent_action_enforcement_enabled')
    expect(c.exists).toBe(false)
    expect(c.booleanValue).toBeNull()
  })
})

describe('TC-SCT-05: page.tsx no longer disables the toggle for unseeded controls', () => {
  it('toggleDisabled does not reference control.exists', () => {
    const src = readFileSync(
      join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'settings', 'system-controls', 'page.tsx'),
      'utf8',
    )
    const line = src.split('\n').find(l => l.includes('toggleDisabled')) ?? ''
    expect(line).toContain('toggleDisabled')
    expect(line).not.toContain('control.exists')
    expect(line).not.toContain('!control.exists')
  })
})
