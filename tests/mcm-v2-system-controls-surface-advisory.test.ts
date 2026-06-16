// mcm-v2 — Surface advisory learning/automation controls + fix the toggle write path.
// Confirms the four advisory keys render (new group + warnings) via the read action,
// and that the toggle now upserts a TENANT row with BOTH flags + non-null label/desc.
// TC-SCA-01..08

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks for the 'use server' action's dependencies
// ---------------------------------------------------------------------------

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

import {
  getSystemControlsAction,
  updateSystemControlValueAction,
} from '@/modules/intelligence/actions/system-control.actions'
import * as repo from '@/modules/intelligence/repositories/system-control.repo'
import { buildRequestContext } from '@/lib/auth/context'

const ADVISORY_KEYS = [
  'statement_review_agent_enabled',
  'copywriting_agent_llm_enabled',
  'quality_auto_approve_enabled',
  'agent_action_enforcement_enabled',
]

beforeEach(() => {
  vi.clearAllMocks()
  h.ctx = { tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin', workspaceId: 'ws-1' }
  h.listControls = []
})

// ---------------------------------------------------------------------------
// Group + warnings surfaced via the read action
// ---------------------------------------------------------------------------

describe('TC-SCA-01: the advisory controls render in a Learning & Automation group', () => {
  it('group exists and contains the advisory keys (in order, more may be appended)', async () => {
    const res = await getSystemControlsAction()
    expect(res.success).toBe(true)
    const group = res.success ? res.data.find(g => g.group === 'Learning & Automation Controls') : undefined
    expect(group).toBeTruthy()
    expect(group!.isFuture).toBe(false)
    // The original four advisory controls lead the group, in order. Later slices
    // (e.g. learned_skills_enabled) may append more keys after them.
    expect(group!.controls.map(c => c.key).slice(0, ADVISORY_KEYS.length)).toEqual(ADVISORY_KEYS)
  })
})

describe('TC-SCA-02: each advisory control carries a warning', () => {
  it('warnings are non-null for all four', async () => {
    const res = await getSystemControlsAction()
    const group = res.success ? res.data.find(g => g.group === 'Learning & Automation Controls') : undefined
    for (const c of group!.controls) {
      expect(c.warning).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Toggle write path
// ---------------------------------------------------------------------------

describe('TC-SCA-03: toggling ON upserts a tenant row with both flags + non-null label/description', () => {
  it('routes to upsertTenantBooleanControl(key, true, tenantId, {label, description})', async () => {
    const res = await updateSystemControlValueAction('statement_review_agent_enabled', true)
    expect(res.success).toBe(true)

    expect(vi.mocked(repo.upsertTenantBooleanControl)).toHaveBeenCalledTimes(1)
    const [key, value, tenantId, meta] = vi.mocked(repo.upsertTenantBooleanControl).mock.calls[0]
    expect(key).toBe('statement_review_agent_enabled')
    expect(value).toBe(true)
    expect(tenantId).toBe('t-1')
    expect(meta.label).toBe('Statement Review Agent') // humanized
    expect(typeof meta.description).toBe('string')
    expect(meta.description.length).toBeGreaterThan(0)
    expect(meta.updatedBy).toBe('u-1')

    // Old platform value-only write path is no longer used.
    expect(vi.mocked(repo.setControlValue)).not.toHaveBeenCalled()
  })
})

describe('TC-SCA-04: toggling OFF writes value=false (helper sets both flags false)', () => {
  it('passes value=false to the upsert helper', async () => {
    const res = await updateSystemControlValueAction('copywriting_agent_llm_enabled', false)
    expect(res.success).toBe(true)
    const [, value] = vi.mocked(repo.upsertTenantBooleanControl).mock.calls[0]
    expect(value).toBe(false)
  })
})

describe('TC-SCA-05: an existing row label is preserved over the humanized fallback', () => {
  it('uses existing.label when a row already exists', async () => {
    vi.mocked(repo.resolveSystemControl).mockResolvedValueOnce(
      { label: 'Custom Label', description: 'Existing desc', value: false } as never,
    )
    await updateSystemControlValueAction('quality_auto_approve_enabled', true)
    const [, , , meta] = vi.mocked(repo.upsertTenantBooleanControl).mock.calls[0]
    expect(meta.label).toBe('Custom Label')
    expect(meta.description).toBe('Existing desc')
  })
})

describe('TC-SCA-06: unknown keys are rejected and never written', () => {
  it('KNOWN_CONTROL_KEYS guard holds', async () => {
    const res = await updateSystemControlValueAction('not_a_real_control', true)
    expect(res.success).toBe(false)
    expect(vi.mocked(repo.upsertTenantBooleanControl)).not.toHaveBeenCalled()
  })
})

describe('TC-SCA-07: numeric controls are rejected and never written', () => {
  it('NUMERIC_CONTROLS guard holds', async () => {
    const res = await updateSystemControlValueAction('agent.confidence_threshold.min', true)
    expect(res.success).toBe(false)
    expect(vi.mocked(repo.upsertTenantBooleanControl)).not.toHaveBeenCalled()
  })
})

describe('TC-SCA-08: non-admins are forbidden from toggling', () => {
  it('member role cannot write', async () => {
    h.ctx = { tenantId: 't-1', userId: 'u-2', roleSlug: 'member', workspaceId: 'ws-1' }
    const res = await updateSystemControlValueAction('statement_review_agent_enabled', true)
    expect(res.success).toBe(false)
    expect(vi.mocked(repo.upsertTenantBooleanControl)).not.toHaveBeenCalled()
    expect(vi.mocked(buildRequestContext)).toHaveBeenCalled()
  })
})
