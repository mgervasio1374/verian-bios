// mcm-v2 — Learned-skill consumption in the rewrite loop (Agent Map 3b).
// off → static getSkillDefinition (unchanged); on → resolveCopywritingSkill with
// seed fallback on error. TC-LSC-01..06

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ learnedOn: false }))

vi.mock('@/lib/llm/client', () => ({ chatComplete: vi.fn() }))
vi.mock('@/modules/messaging/repositories/copy-exemplar.repo', () => ({
  listActiveExemplarsForSkill: vi.fn(async () => []),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => h.learnedOn),
}))
vi.mock('@/modules/messaging/copywriting/copywriting-skill.resolver', () => ({
  resolveCopywritingSkill: vi.fn(),
}))
vi.mock('@/modules/messaging/copywriting/copywriting-agent.skill-definitions', () => ({
  getSkillDefinition: vi.fn(),
}))

import { chatComplete } from '@/lib/llm/client'
import { generateLlmRewriteCandidates } from '@/modules/messaging/copywriting/rewrite-llm'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { resolveCopywritingSkill } from '@/modules/messaging/copywriting/copywriting-skill.resolver'
import { getSkillDefinition } from '@/modules/messaging/copywriting/copywriting-agent.skill-definitions'

function skill(tag: string) {
  return {
    skillSlug: 'cold_outreach', skillVersion: 1, category: 'context',
    toneRules: `tone ${tag}`, messagingRules: `msg ${tag}`,
    requiredElements: [], forbiddenElements: [],
    ctaGuidance: `cta ${tag}`, complianceNotes: `comp ${tag}`,
    examples: [], antiPatterns: [],
  }
}

const params = {
  tenantId: 't-1', relationshipContext: 'cold_outreach', trigger: 'manual_lead_created',
  primaryAngle: 'direct_intro', currentSubject: 'S', currentBody: 'B',
  first: 'Bob', company: 'Arthur Heating', senderName: 'Sam',
}

function systemOfLastCall(): string {
  const calls = vi.mocked(chatComplete).mock.calls
  return (calls[calls.length - 1][0] as { system: string }).system
}

beforeEach(() => {
  vi.clearAllMocks()
  h.learnedOn = false
  vi.mocked(chatComplete).mockResolvedValue({ text: '[]', promptTokens: 1, completionTokens: 1, modelName: 'm' } as never)
})

describe('TC-LSC-01: control OFF → static getSkillDefinition, resolver not called', () => {
  it('uses the seed lookup only', async () => {
    h.learnedOn = false
    vi.mocked(getSkillDefinition).mockReturnValue(skill('seed') as never)
    await generateLlmRewriteCandidates(params)
    expect(vi.mocked(getSkillDefinition)).toHaveBeenCalledWith('cold_outreach', 1)
    expect(vi.mocked(resolveCopywritingSkill)).not.toHaveBeenCalled()
    expect(systemOfLastCall()).toContain('tone seed')
  })
})

describe('TC-LSC-02: control ON → resolveCopywritingSkill(tenantId, slug, version) used', () => {
  it('grounds the prompt in the resolved skill', async () => {
    h.learnedOn = true
    vi.mocked(resolveCopywritingSkill).mockResolvedValue(skill('learned') as never)
    vi.mocked(getSkillDefinition).mockReturnValue(skill('seed') as never)
    await generateLlmRewriteCandidates(params)
    expect(vi.mocked(resolveCopywritingSkill)).toHaveBeenCalledWith('t-1', 'cold_outreach', 1)
    expect(systemOfLastCall()).toContain('tone learned')
  })
})

describe('TC-LSC-03: control ON + resolver returns null → seed fallback', () => {
  it('falls back to getSkillDefinition', async () => {
    h.learnedOn = true
    vi.mocked(resolveCopywritingSkill).mockResolvedValue(null as never)
    vi.mocked(getSkillDefinition).mockReturnValue(skill('seed') as never)
    await generateLlmRewriteCandidates(params)
    expect(systemOfLastCall()).toContain('tone seed')
  })
})

describe('TC-LSC-04: control ON + resolver throws → seed fallback, no throw', () => {
  it('does not throw and still grounds in the seed', async () => {
    h.learnedOn = true
    vi.mocked(resolveCopywritingSkill).mockRejectedValue(new Error('db down'))
    vi.mocked(getSkillDefinition).mockReturnValue(skill('seed') as never)
    const out = await generateLlmRewriteCandidates(params)
    expect(out).toBeNull() // empty candidates → null, but no throw
    expect(systemOfLastCall()).toContain('tone seed')
  })
})

describe('TC-LSC-05: getBooleanControl is consulted with the learned-skills key', () => {
  it('checks LEARNED_SKILLS_ENABLED', async () => {
    vi.mocked(getSkillDefinition).mockReturnValue(skill('seed') as never)
    await generateLlmRewriteCandidates(params)
    expect(vi.mocked(getBooleanControl)).toHaveBeenCalledWith('learned_skills_enabled', 't-1', false)
  })
})

describe('TC-LSC-06: control + warning surfaced in Learning & Automation Controls', () => {
  it('SystemControlKey maps + appears in the group with a warning', async () => {
    const { SystemControlKey } = await import('@/modules/intelligence/types.agent')
    expect(SystemControlKey.LEARNED_SKILLS_ENABLED).toBe('learned_skills_enabled')

    const src = readFileSync(
      join(__dirname, '..', 'modules', 'intelligence', 'actions', 'system-control.actions.ts'),
      'utf8',
    )
    expect(src).toContain("'learned_skills_enabled'")
    expect(src).toContain('Learning & Automation Controls')
    expect(src).toContain('override the built-in seed in the rewrite loop')
  })
})
