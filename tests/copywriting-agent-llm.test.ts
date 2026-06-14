// Agent sweep — copywriting agent LLM adapter (gated path). Tests the tolerant
// JSON parse and the generate-or-fallback behavior (any failure → null so the
// caller uses deterministic generation). chatComplete is mocked — no real LLM call.
// TC-CL-01..08

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm/client', () => ({ chatComplete: vi.fn() }))

import { generateBodyWithLlm, parseLlmBodyText } from '@/modules/messaging/copywriting/copywriting-agent.llm'
import { chatComplete } from '@/lib/llm/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const angle    = { strategyAngle: 'value_first', differentiationProfile: {} } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const strategy = { message_type: 'cold_outreach', primary_goal: 'book_meeting', required_inclusions: [], avoid: [] } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx      = { companyName: 'Harbor Diner' } as any

describe('TC-CL-01: parseLlmBodyText', () => {
  it('parses a clean JSON body', () => {
    expect(parseLlmBodyText('{"bodyText":"Hi there"}')).toBe('Hi there')
  })
  it('strips code fences around the JSON', () => {
    expect(parseLlmBodyText('```json\n{"bodyText":"fenced body"}\n```')).toBe('fenced body')
  })
  it('returns null on non-JSON, missing bodyText, or empty body', () => {
    expect(parseLlmBodyText('not json at all')).toBeNull()
    expect(parseLlmBodyText('{"foo":1}')).toBeNull()
    expect(parseLlmBodyText('{"bodyText":"   "}')).toBeNull()
  })
})

describe('TC-CL-02: generateBodyWithLlm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('valid LLM output → BodyGenerationResult + real token counts', async () => {
    vi.mocked(chatComplete).mockResolvedValue({
      text: '{"bodyText":"Hello {{company_name}}, quick question about your processing."}',
      promptTokens: 120, completionTokens: 60, modelName: 'gpt-4o-mini',
    } as never)
    const out = await generateBodyWithLlm(angle, strategy, ctx)
    expect(out).not.toBeNull()
    expect(out!.result.bodyText).toContain('Hello')
    expect(out!.promptTokens).toBe(120)
    expect(out!.completionTokens).toBe(60)
    expect(out!.modelName).toBe('gpt-4o-mini')
  })

  it('unparseable LLM output → null (caller falls back to deterministic)', async () => {
    vi.mocked(chatComplete).mockResolvedValue({ text: 'sorry, here is your email!', promptTokens: 5, completionTokens: 5, modelName: 'gpt-4o-mini' } as never)
    expect(await generateBodyWithLlm(angle, strategy, ctx)).toBeNull()
  })

  it('LLM client throws (config/timeout/etc) → null, never propagates', async () => {
    vi.mocked(chatComplete).mockRejectedValue(new Error('LlmConfigError'))
    expect(await generateBodyWithLlm(angle, strategy, ctx)).toBeNull()
  })
})
