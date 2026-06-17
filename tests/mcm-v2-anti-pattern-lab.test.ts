// mcm-v2 — Anti-Pattern Lab (Learning Loop P1). Control + rename + extraction
// fail-safe + gated apply (append-not-overwrite, v1). TC-APL-01..08

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
function read(rel: string): string { return readFileSync(join(ROOT, rel), 'utf8') }

// ---------------------------------------------------------------------------
// TC-APL-01: control key + group + warning
// ---------------------------------------------------------------------------

describe('TC-APL-01: ANTI_PATTERN_LAB_ENABLED control surfaced', () => {
  it('maps + appears in the group with a human-approval warning', async () => {
    const { SystemControlKey } = await import('@/modules/intelligence/types.agent')
    expect(SystemControlKey.ANTI_PATTERN_LAB_ENABLED).toBe('anti_pattern_lab_enabled')
    const src = read('modules/intelligence/actions/system-control.actions.ts')
    expect(src).toContain("'anti_pattern_lab_enabled'")
    expect(src).toContain('Learning & Automation Controls')
    expect(src).toContain('human-approved')
  })
})

describe('TC-APL-02: Agent Lab rename (label only, route intact)', () => {
  it('sidebar shows Agent Lab and still links agent-monitor', () => {
    const src = read('components/layout/Sidebar.tsx')
    expect(src).toContain("label: 'Agent Lab'")
    expect(src).toContain('/settings/agent-monitor`')
    expect(src).not.toContain("label: 'Agent Monitor'")
  })
  it('page H1 renamed to Agent Lab', () => {
    const src = read('app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx')
    expect(src).toContain('Agent Lab</h1>')
  })
})

// ---------------------------------------------------------------------------
// TC-APL-03: domain-leak guard in the prompt
// ---------------------------------------------------------------------------

import { ANTI_PATTERN_SYSTEM_PROMPT } from '@/modules/messaging/learning/anti-pattern-extraction.service'

describe('TC-APL-03: extraction prompt has the domain-leak guard', () => {
  it('tactics/structure-only + domain-neutral + never reference domain', () => {
    expect(ANTI_PATTERN_SYSTEM_PROMPT).toContain('DOMAIN-LEAK GUARD')
    expect(ANTI_PATTERN_SYSTEM_PROMPT).toContain('transferable')
    expect(ANTI_PATTERN_SYSTEM_PROMPT).toMatch(/NEVER reference the sample's industry/)
    expect(ANTI_PATTERN_SYSTEM_PROMPT).toContain('domain-neutral')
    expect(ANTI_PATTERN_SYSTEM_PROMPT).toContain('Avoid ')
  })
})

// ---------------------------------------------------------------------------
// TC-APL-04: extraction fail-safe
// ---------------------------------------------------------------------------

vi.mock('@/lib/llm/client', () => ({ chatComplete: vi.fn() }))
import { chatComplete } from '@/lib/llm/client'
import { extractAntiPatterns } from '@/modules/messaging/learning/anti-pattern-extraction.service'

beforeEach(() => vi.clearAllMocks())

describe('TC-APL-04: extractAntiPatterns is fail-safe', () => {
  it('chatComplete reject → { error }, no throw', async () => {
    vi.mocked(chatComplete).mockRejectedValueOnce(new Error('boom'))
    const res = await extractAntiPatterns({ tenantId: 't-1', targetSlug: 'cold_outreach', samples: ['bad email'] })
    expect('error' in res).toBe(true)
  })
  it('empty samples → { patterns: [] } (no LLM call)', async () => {
    const res = await extractAntiPatterns({ tenantId: 't-1', targetSlug: 'cold_outreach', samples: ['  ', ''] })
    expect(res).toEqual({ patterns: [] })
    expect(vi.mocked(chatComplete)).not.toHaveBeenCalled()
  })
  it('valid JSON → typed patterns', async () => {
    vi.mocked(chatComplete).mockResolvedValueOnce({
      text: JSON.stringify([{ flaggedSnippet: 'ACT NOW', patternName: 'False urgency', antiPatternRule: 'Avoid manufactured urgency.', rationale: 'Pressures the reader.', confidence: 'high' }]),
      promptTokens: 1, completionTokens: 1, modelName: 'm',
    } as never)
    const res = await extractAntiPatterns({ tenantId: 't-1', targetSlug: 'cold_outreach', samples: ['ACT NOW!!!'] })
    expect('patterns' in res && res.patterns[0].antiPatternRule).toBe('Avoid manufactured urgency.')
  })
})

// ---------------------------------------------------------------------------
// Actions — gating + append-not-overwrite
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  ctx: { tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin' } as Record<string, unknown>,
  permThrows: false,
  labOn: true,
  learned: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth/context', () => ({ buildRequestContext: vi.fn(async () => h.ctx) }))
vi.mock('@/lib/auth/permissions', () => ({
  requirePermission: vi.fn((_c: unknown, perm: string) => { if (h.permThrows) throw new Error(`forbidden: ${perm}`) }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => h.labOn),
}))
// NOTE: the extraction service is NOT mocked — TC-APL-04 exercises the real fn over
// the mocked chatComplete; the action tests below assert via chatComplete instead.
vi.mock('@/modules/messaging/skills/learned-skill.repo', () => ({
  getLearnedSkill: vi.fn(async () => h.learned),
  upsertLearnedSkill: vi.fn(async () => ({ id: 'ls-1' })),
}))
vi.mock('@/modules/messaging/copywriting/copywriting-agent.skill-definitions', () => ({
  getSkillDefinition: vi.fn(() => ({
    skillSlug: 'cold_outreach', skillVersion: 1, category: 'context',
    toneRules: 't', messagingRules: 'm', requiredElements: [], forbiddenElements: [],
    ctaGuidance: 'c', complianceNotes: 'n', examples: [], antiPatterns: [],
  })),
}))

import {
  runAntiPatternExtractionAction,
  applyAntiPatternsAction,
} from '@/modules/messaging/learning/anti-pattern-lab.actions'
import { requirePermission } from '@/lib/auth/permissions'
import { upsertLearnedSkill } from '@/modules/messaging/skills/learned-skill.repo'

beforeEach(() => {
  vi.clearAllMocks()
  h.ctx = { tenantId: 't-1', userId: 'u-1', roleSlug: 'tenant_admin' }
  h.permThrows = false
  h.labOn = true
  h.learned = null
})

describe('TC-APL-05: extraction action OFF → disabled, extraction not run', () => {
  it('returns disabled error and never calls the LLM', async () => {
    h.labOn = false
    const res = await runAntiPatternExtractionAction('cold_outreach', ['bad'])
    expect(res.success).toBe(false)
    expect(vi.mocked(chatComplete)).not.toHaveBeenCalled()
  })
})

describe('TC-APL-06: apply APPENDS (dedup), v1, source learned, family copywriting', () => {
  it('current [A] + approve [B] → antiPatterns contains A and B', async () => {
    h.learned = {
      id: 'ls-1', tenant_id: 't-1', skill_family: 'copywriting', skill_slug: 'cold_outreach',
      skill_version: 1, status: 'active', source: 'learned', category: 'context',
      definition: {
        category: 'context', toneRules: 't', messagingRules: 'm',
        requiredElements: [], forbiddenElements: [], ctaGuidance: 'c', complianceNotes: 'n',
        examples: [], antiPatterns: ['Avoid A'],
      },
    }
    const res = await applyAntiPatternsAction('cold_outreach', ['Avoid B', 'Avoid A']) // A is a dup
    expect(res.success).toBe(true)
    const arg = vi.mocked(upsertLearnedSkill).mock.calls[0][0]
    expect(arg.family).toBe('copywriting')
    expect(arg.version).toBe(1)
    expect(arg.source).toBe('learned')
    const aps = (arg.definition as Record<string, unknown>).antiPatterns as string[]
    expect(aps).toContain('Avoid A')
    expect(aps).toContain('Avoid B')
    expect(aps.filter(x => x === 'Avoid A')).toHaveLength(1) // dedup
    expect(res.success && res.data.appliedCount).toBe(1) // only B is new
  })

  it('preserves other fields (does not overwrite)', async () => {
    h.learned = null // seed path
    await applyAntiPatternsAction('cold_outreach', ['Avoid X'])
    const arg = vi.mocked(upsertLearnedSkill).mock.calls[0][0]
    const def = arg.definition as Record<string, unknown>
    expect(def.toneRules).toBe('t')
    expect(def.ctaGuidance).toBe('c')
  })
})

describe('TC-APL-07: both actions gate on permission + control', () => {
  it('permission failure blocks both, no write', async () => {
    h.permThrows = true
    const r1 = await runAntiPatternExtractionAction('cold_outreach', ['bad'])
    const r2 = await applyAntiPatternsAction('cold_outreach', ['Avoid X'])
    expect(r1.success).toBe(false)
    expect(r2.success).toBe(false)
    expect(vi.mocked(upsertLearnedSkill)).not.toHaveBeenCalled()
  })
  it('control off blocks apply', async () => {
    h.labOn = false
    const res = await applyAntiPatternsAction('cold_outreach', ['Avoid X'])
    expect(res.success).toBe(false)
    expect(vi.mocked(upsertLearnedSkill)).not.toHaveBeenCalled()
  })
  it('gate references checked', () => {
    const src = read('modules/messaging/learning/anti-pattern-lab.actions.ts')
    expect(src).toContain("requirePermission(ctx, 'messaging.manage_templates')")
    expect(src).toContain('ANTI_PATTERN_LAB_ENABLED')
    expect(vi.mocked(requirePermission)).toBeDefined()
  })
})

describe('TC-APL-08: Lab panel shows glass-box rationale + approve, mounted on profile', () => {
  it('panel renders rationale + approve control', () => {
    const panel = read('app/(workspace)/[workspaceSlug]/settings/agent-monitor/agent/[agentKey]/AntiPatternLab.tsx')
    expect(panel).toContain('Reasoning')
    expect(panel).toContain('{p.rationale')
    expect(panel).toContain('Approve')
    expect(panel).toContain('runAntiPatternExtractionAction')
    expect(panel).toContain('applyAntiPatternsAction')
  })
  it('mounted on the agent profile gated on the control', () => {
    const profile = read('app/(workspace)/[workspaceSlug]/settings/agent-monitor/agent/[agentKey]/page.tsx')
    expect(profile).toContain('<AntiPatternLab')
    expect(profile).toContain('antiPatternLabOn')
    expect(profile).toContain('ANTI_PATTERN_LAB_ENABLED')
  })
})
