// mcm-v2 — Slice 2: wire skills into the main copy path (#5b). The gated LLM body
// generator now grounds its system prompt in the resolved copywriting skill, the
// same way rewrite-llm does. TC-CMPW-01..06

import { describe, it, expect, vi, beforeEach } from 'vitest'

const cap = vi.hoisted(() => ({ system: '' as string }))

vi.mock('@/lib/llm/client', () => ({
  chatComplete: vi.fn(async (args: { system: string }) => {
    cap.system = args.system
    return { text: '{"bodyText":"Hello Acme, a quick note about your card processing setup."}', promptTokens: 10, completionTokens: 10, modelName: 'gpt-4o-mini' }
  }),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => false),
}))
vi.mock('@/modules/messaging/copywriting/copywriting-skill.resolver', () => ({
  resolveCopywritingSkill: vi.fn(async () => null),
}))

import { generateBodyWithLlm } from '@/modules/messaging/copywriting/copywriting-agent.llm'
import { chatComplete } from '@/lib/llm/client'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { resolveCopywritingSkill } from '@/modules/messaging/copywriting/copywriting-skill.resolver'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const angle = { strategyAngle: 'value_first', differentiationProfile: {} } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { companyName: 'Acme' } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const strat = (message_type: string) => ({ message_type, primary_goal: 'book_meeting', required_inclusions: [], avoid: [] } as any)

const TENANT = 't1'

beforeEach(() => {
  vi.clearAllMocks()
  cap.system = ''
  vi.mocked(getBooleanControl).mockResolvedValue(false as never)
  vi.mocked(resolveCopywritingSkill).mockResolvedValue(null as never)
})

describe('TC-CMPW-01: skill present → guidance block injected', () => {
  it('system prompt carries tone/messaging/required/forbidden/cta/compliance/anti-patterns', async () => {
    const out = await generateBodyWithLlm(angle, strat('cold_outreach'), ctx, TENANT)
    expect(out).not.toBeNull()
    expect(cap.system).toContain('Skill guidance for this context (follow it precisely):')
    expect(cap.system).toContain('- Tone:')
    expect(cap.system).toContain('- Messaging:')
    expect(cap.system).toContain('- Required elements:')
    expect(cap.system).toContain('- Forbidden elements:')
    expect(cap.system).toContain('- CTA guidance:')
    expect(cap.system).toContain('- Compliance:')
    expect(cap.system).toContain('- Anti-patterns to avoid:')
    // grounded in the cold_outreach seed specifically
    expect(cap.system).toContain('Professional and observational')
    // hard rules retained
    expect(cap.system).toContain('Do NOT use em dashes or en dashes.')
  })
})

describe('TC-CMPW-02: no skill resolves → block omitted, generation proceeds', () => {
  it('unknown message_type → no guidance block, still returns a body', async () => {
    const out = await generateBodyWithLlm(angle, strat('not_a_real_type'), ctx, TENANT)
    expect(out).not.toBeNull()
    expect(cap.system).not.toContain('Skill guidance for this context')
    // generic prompt still present
    expect(cap.system).toContain('Do NOT use em dashes or en dashes.')
  })
})

describe('TC-CMPW-03: gating — control OFF uses the static seed (resolver not consulted)', () => {
  it('resolveCopywritingSkill is not called when LEARNED_SKILLS_ENABLED is off', async () => {
    await generateBodyWithLlm(angle, strat('cold_outreach'), ctx, TENANT)
    expect(vi.mocked(getBooleanControl)).toHaveBeenCalled()
    expect(vi.mocked(resolveCopywritingSkill)).not.toHaveBeenCalled()
    expect(cap.system).toContain('Professional and observational') // seed
  })
})

describe('TC-CMPW-04: gating — control ON consults the resolver (tenant override wins)', () => {
  it('resolver result grounds the prompt', async () => {
    vi.mocked(getBooleanControl).mockResolvedValue(true as never)
    vi.mocked(resolveCopywritingSkill).mockResolvedValue({
      skillSlug: 'cold_outreach', skillVersion: 1, category: 'context',
      toneRules: 'TENANT TONE', messagingRules: 'TENANT MSG',
      requiredElements: ['req1'], forbiddenElements: ['forb1'],
      ctaGuidance: 'TENANT CTA', complianceNotes: 'TENANT COMPLIANCE',
      examples: [], antiPatterns: ['anti1'],
    } as never)
    await generateBodyWithLlm(angle, strat('cold_outreach'), ctx, TENANT)
    expect(vi.mocked(resolveCopywritingSkill)).toHaveBeenCalledWith(TENANT, 'cold_outreach', 1)
    expect(cap.system).toContain('TENANT TONE')
    expect(cap.system).toContain('TENANT CTA')
    expect(cap.system).toContain('anti1')
  })
})

describe('TC-CMPW-05: gating — resolver error falls back to the static seed', () => {
  it('control on + resolver throws → seed-grounded prompt, never breaks', async () => {
    vi.mocked(getBooleanControl).mockResolvedValue(true as never)
    vi.mocked(resolveCopywritingSkill).mockRejectedValue(new Error('db down') as never)
    const out = await generateBodyWithLlm(angle, strat('cold_outreach'), ctx, TENANT)
    expect(out).not.toBeNull()
    expect(vi.mocked(resolveCopywritingSkill)).toHaveBeenCalled()
    expect(cap.system).toContain('Professional and observational') // seed fallback
  })
})

describe('TC-CMPW-06: contract preserved — null on LLM failure', () => {
  it('chatComplete throws → null (deterministic fallback depends on it)', async () => {
    vi.mocked(chatComplete).mockRejectedValueOnce(new Error('boom') as never)
    const out = await generateBodyWithLlm(angle, strat('cold_outreach'), ctx, TENANT)
    expect(out).toBeNull()
  })
})
