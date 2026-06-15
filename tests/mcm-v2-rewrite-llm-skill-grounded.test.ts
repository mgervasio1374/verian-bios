// mcm-v2 — Skill-grounded LLM rewrite candidate generator. Behavioral tests for
// mapRelationshipToSkillSlug and generateLlmRewriteCandidates with chatComplete
// mocked. The skill library + house-style + truth guard are real.
// TC-RLG-01..09

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm/client', () => ({ chatComplete: vi.fn() }))
// No exemplars by default — these tests cover the skill-grounded path itself.
vi.mock('@/modules/messaging/repositories/copy-exemplar.repo', () => ({
  listActiveExemplarsForSkill: vi.fn(async () => []),
}))
import { chatComplete } from '@/lib/llm/client'
import {
  mapRelationshipToSkillSlug,
  generateLlmRewriteCandidates,
  type RewriteLlmTelemetry,
} from '@/modules/messaging/copywriting/rewrite-llm'

const baseParams = {
  tenantId:            't-1',
  relationshipContext: 'cold_outreach',
  trigger:             'manual_lead_created',
  primaryAngle:        'direct_intro',
  currentSubject:      'Payment review for Arthur Heating',
  currentBody:         'Hi Bob,\n\nI work with 321 Swipe.\n\nBest,\nSam',
  first:               'Bob',
  company:             'Arthur Heating',
  senderName:          'Sam',
}

function llmReturns(text: string) {
  vi.mocked(chatComplete).mockResolvedValueOnce({ text, promptTokens: 120, completionTokens: 240, modelName: 'gpt-4o-mini' })
}

describe('TC-RLG-01: mapRelationshipToSkillSlug', () => {
  it('maps each known context to its existing context-category slug', () => {
    expect(mapRelationshipToSkillSlug('cold_outreach')).toBe('cold_outreach')
    expect(mapRelationshipToSkillSlug('inbound_inquiry')).toBe('new_inquiry_response')
    expect(mapRelationshipToSkillSlug('statement_submitted')).toBe('statement_review_follow_up')
    expect(mapRelationshipToSkillSlug('reengagement')).toBe('re_engagement')
  })

  it('unknown / unmatched → cold_outreach', () => {
    expect(mapRelationshipToSkillSlug('unknown')).toBe('cold_outreach')
    expect(mapRelationshipToSkillSlug('something_else')).toBe('cold_outreach')
  })
})

describe('TC-RLG-02: valid JSON array → RewriteCandidates with house-style + telemetry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 3 candidates, house-style applied, strategyKey llm_rewrite, telemetry set', async () => {
    llmReturns(JSON.stringify([
      { subject: 'Reviewing your processing setup', bodyText: 'Hi Bob,\n\nA quick review of Arthur Heating could surface something worth a look. Open to a short call this week?\n\nSam' },
      { subject: 'A look at Arthur Heating costs', bodyText: 'Hi Bob,\n\nHappy to review how Arthur Heating processes cards and flag anything worth discussing. Worth a short call?\n\nSam' },
      { subject: 'Processing review', bodyText: 'Hi Bob,\n\nI can take a closer look at your current setup and let you know if anything stands out. Open to a quick call?\n\nSam' },
    ]))
    const telemetry: RewriteLlmTelemetry = { promptTokens: 0, completionTokens: 0, modelName: '' }
    const out = await generateLlmRewriteCandidates(baseParams, telemetry)

    expect(out).not.toBeNull()
    expect(out!.length).toBe(3)
    for (const c of out!) {
      expect(c.strategyKey).toBe('llm_rewrite')
      expect(c.strategyLabel).toBe('AI Rewrite · cold_outreach')
      expect(c.bodyText).not.toMatch(/—|–/) // house style
    }
    expect(telemetry).toEqual({ promptTokens: 120, completionTokens: 240, modelName: 'gpt-4o-mini' })
  })

  it('house-style strips an em-dash a model emitted', async () => {
    llmReturns(JSON.stringify([
      { subject: 'Quick review', bodyText: 'Hi Bob — happy to review Arthur Heating and share what stands out. Open to a short call this week?\n\nSam' },
    ]))
    const out = await generateLlmRewriteCandidates(baseParams)
    expect(out).not.toBeNull()
    expect(out![0].bodyText).not.toMatch(/—|–/)
  })
})

describe('TC-RLG-03: guardrails drop bad candidates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a candidate containing a GLOBAL_BANNED_PHRASE is dropped', async () => {
    llmReturns(JSON.stringify([
      { subject: 'Good one', bodyText: 'Hi Bob,\n\nA quick review of Arthur Heating could be useful. Open to a short call this week?\n\nSam' },
      { subject: 'Bad one', bodyText: 'Hi Bob,\n\nJust checking in to see if you want to talk. Open to a call?\n\nSam' }, // banned: "Just checking in"
    ]))
    const out = await generateLlmRewriteCandidates(baseParams)
    expect(out!.length).toBe(1)
    expect(out![0].subject).toBe('Good one')
  })

  it('a cold-context candidate with inbound language is dropped by violatesMessageTruth', async () => {
    llmReturns(JSON.stringify([
      { subject: 'Cold ok', bodyText: 'Hi Bob,\n\nHappy to review Arthur Heating processing and flag anything worth a look. Open to a short call?\n\nSam' },
      { subject: 'Wrong context', bodyText: 'Hi Bob,\n\nThanks for reaching out to 321 Swipe. Happy to review your setup. Open to a call?\n\nSam' },
    ]))
    const out = await generateLlmRewriteCandidates(baseParams)
    expect(out!.length).toBe(1)
    expect(out![0].subject).toBe('Cold ok')
  })

  it('all candidates dropped → null (zero survivors)', async () => {
    llmReturns(JSON.stringify([
      { subject: 'x', bodyText: 'Hi Bob, just checking in.' }, // banned phrase
    ]))
    expect(await generateLlmRewriteCandidates(baseParams)).toBeNull()
  })
})

describe('TC-RLG-04: fail-open → null', () => {
  beforeEach(() => vi.clearAllMocks())

  it('malformed / non-JSON output → null', async () => {
    llmReturns('Sure! Here are some great rewrites for you:')
    expect(await generateLlmRewriteCandidates(baseParams)).toBeNull()
  })

  it('chatComplete throws → null', async () => {
    vi.mocked(chatComplete).mockRejectedValueOnce(new Error('LLM not configured'))
    expect(await generateLlmRewriteCandidates(baseParams)).toBeNull()
  })

  it('missing skill → null (mapped slug not in library is impossible, but a bad context still maps to cold_outreach which exists; verify resolution path returns candidates)', async () => {
    // cold_outreach skill exists, so an unknown context resolves and still works.
    llmReturns(JSON.stringify([
      { subject: 'ok', bodyText: 'Hi Bob,\n\nHappy to review Arthur Heating and flag anything worth a look. Open to a short call?\n\nSam' },
    ]))
    const out = await generateLlmRewriteCandidates({ ...baseParams, relationshipContext: 'unknown' })
    expect(out!.length).toBe(1)
  })

  it('telemetry is left untouched on a fail-open path', async () => {
    vi.mocked(chatComplete).mockRejectedValueOnce(new Error('boom'))
    const telemetry: RewriteLlmTelemetry = { promptTokens: 0, completionTokens: 0, modelName: '' }
    const out = await generateLlmRewriteCandidates(baseParams, telemetry)
    expect(out).toBeNull()
    expect(telemetry).toEqual({ promptTokens: 0, completionTokens: 0, modelName: '' })
  })
})
