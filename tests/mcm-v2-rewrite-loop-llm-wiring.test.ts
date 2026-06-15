// mcm-v2 — runEmailRewriteLoop LLM wiring. Behavioral tests with the data layer
// mocked: flag ON + LLM candidates record REAL token usage and get scored/
// persisted; flag ON + LLM null falls back to templates (0-token); flag OFF is
// the template path (regression); best-selection picks the highest score
// regardless of source. classifyEmailMessageStrategy + violatesMessageTruth +
// the skill library are real.
// TC-RLW-01..05

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mocks (hoisted) -------------------------------------------------------

const ORIGINAL_BODY = 'Hi Bob,\n\nThis is the original draft body for Arthur Heating.\n\nSam'

const h = vi.hoisted(() => ({
  createdVersions: [] as Array<Record<string, unknown>>,
  usageCalls:      [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/supabase/service', () => {
  const draft = {
    id: 'draft-1', subject: 'Original subject', body_text: 'Hi Bob,\n\nThis is the original draft body for Arthur Heating.\n\nSam',
    body_html: null, lead_id: 'lead-1', company_id: 'co-1', workspace_id: 'ws-1', ai_generation_metadata: {},
  }
  const SINGLE: Record<string, unknown> = {
    email_drafts:      { data: draft, error: null },
    leads:             { data: { name: 'Arthur Heating Lead', stage: 'new', source: 'manual', company_id: 'co-1', contact_id: 'ct-1' }, error: null },
    companies:         { data: { name: 'Arthur Heating', industry: 'hvac' }, error: null },
    contacts:          { data: { first_name: 'Bob' }, error: null },
    sender_identities: { data: { name: 'Sam' }, error: null },
  }
  const AWAIT: Record<string, unknown> = { artifacts: { count: 0, data: null, error: null } }
  return {
    createSupabaseServiceClient: () => ({
      from: (table: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {}
        Object.assign(b, {
          select: () => b, eq: () => b, is: () => b, in: () => b, limit: () => b, order: () => b,
          single: () => Promise.resolve(SINGLE[table] ?? { data: null, error: null }),
          then: (res: any, rej: any) => Promise.resolve(AWAIT[table] ?? { data: null, error: null, count: 0 }).then(res, rej),
        })
        return b
      },
    }),
  }
})

vi.mock('@/modules/messaging/services/email-quality.service', () => ({
  reviewEmailDraftQuality: vi.fn((inp: { subject: string; bodyText: string }) => {
    let score = 50
    const m = /score (\d+)/.exec(inp.subject)
    if (m) score = Number(m[1])
    else if (inp.bodyText !== ORIGINAL_BODY) score = 90
    return {
      overallScore: score,
      status: score >= 85 ? 'pass' : 'needs_revision',
      strengths: [], weaknesses: [], riskFlags: [],
      suggestedSubject: undefined, suggestedBody: undefined,
    }
  }),
}))

vi.mock('@/modules/messaging/repositories/email-draft-version.repo', () => ({
  listEmailDraftVersions: vi.fn(async () => []),
  createEmailDraftVersion: vi.fn(async (row: Record<string, unknown>) => {
    h.createdVersions.push(row)
    return { id: `v-${h.createdVersions.length}`, version_number: row.versionNumber as number, body_text: row.bodyText as string }
  }),
}))

vi.mock('@/modules/messaging/repositories/email-quality.repo', () => ({
  getEmailQualityReview: vi.fn(async () => null),
  updateEmailQualityReviewLoopResult: vi.fn(async () => undefined),
}))

vi.mock('@/modules/intelligence/services/activity-event.service', () => ({ recordActivity: vi.fn(async () => undefined) }))
vi.mock('@/modules/intelligence/repositories/agent-decision.repo', () => ({ createDecision: vi.fn(async () => undefined) }))
vi.mock('@/modules/intelligence/repositories/ai-usage-event.repo', () => ({
  recordUsage: vi.fn(async (row: Record<string, unknown>) => { h.usageCalls.push(row); return undefined }),
}))
vi.mock('@/modules/intelligence/services/ai-budget-enforcer.service', () => ({
  preflightCheck: vi.fn(async () => ({ allowed: true })),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({ getBooleanControl: vi.fn() }))
vi.mock('@/lib/llm/client', () => ({ chatComplete: vi.fn() }))

import { runEmailRewriteLoop } from '@/modules/messaging/services/email-rewrite-loop.service'
import { reviewEmailDraftQuality } from '@/modules/messaging/services/email-quality.service'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { chatComplete } from '@/lib/llm/client'

const input = { tenantId: 't-1', workspaceId: 'ws-1', emailDraftId: 'draft-1' }

beforeEach(() => {
  h.createdVersions = []
  h.usageCalls = []
  vi.clearAllMocks()
  // re-apply the scoring impl after clearAllMocks
  vi.mocked(reviewEmailDraftQuality).mockImplementation((inp) => {
    let score = 50
    const m = /score (\d+)/.exec(inp.subject)
    if (m) score = Number(m[1])
    else if (inp.bodyText !== ORIGINAL_BODY) score = 90
    return {
      overallScore: score,
      status: score >= 85 ? 'pass' : 'needs_revision',
      strengths: [], weaknesses: [], riskFlags: [],
      suggestedSubject: undefined, suggestedBody: undefined,
    } as never
  })
})

function rewriteRows() {
  return h.createdVersions.filter(r => r.versionType === 'rewrite')
}

describe('TC-RLW-01: flag ON + LLM candidates → REAL token usage recorded', () => {
  it('records non-zero tokens and the mocked model, and persists llm_rewrite versions', async () => {
    vi.mocked(getBooleanControl).mockResolvedValue(true)
    vi.mocked(chatComplete).mockResolvedValue({
      text: JSON.stringify([
        { subject: 'Reviewing your processing setup', bodyText: 'Hi Bob,\n\nA quick review of how Arthur Heating processes cards could surface something worth a look. Open to a short call this week?\n\nSam' },
        { subject: 'A look at Arthur Heating', bodyText: 'Hi Bob,\n\nHappy to take a closer look at your current processing and flag anything that stands out. Worth a quick call?\n\nSam' },
      ]),
      promptTokens: 120, completionTokens: 240, modelName: 'gpt-4o-mini',
    } as never)

    const res = await runEmailRewriteLoop(input)
    expect(res.success).toBe(true)

    expect(h.usageCalls.length).toBe(1)
    const usage = h.usageCalls[0]
    expect(usage.modelName).toBe('gpt-4o-mini')
    expect(usage.modelName).not.toBe('claude-sonnet-4-6')
    expect(usage.promptTokens).toBe(120)
    expect(usage.completionTokens).toBe(240)
    expect(usage.totalTokens).toBe(360)

    // at least one persisted rewrite came from the LLM path
    const rows = rewriteRows()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect((rows[0].metadata as Record<string, unknown>).strategy_key).toBe('llm_rewrite')
  })
})

describe('TC-RLW-02: flag ON + LLM null → template fallback, 0-token usage', () => {
  it('falls back without crashing and records 0 tokens', async () => {
    vi.mocked(getBooleanControl).mockResolvedValue(true)
    vi.mocked(chatComplete).mockResolvedValue({ text: 'not json at all', promptTokens: 99, completionTokens: 99, modelName: 'gpt-4o-mini' } as never)

    const res = await runEmailRewriteLoop(input)
    expect(res.success).toBe(true)

    const usage = h.usageCalls[0]
    expect(usage.promptTokens).toBe(0)
    expect(usage.completionTokens).toBe(0)
    expect(usage.totalTokens).toBe(0)

    // template strategy keys (not llm_rewrite)
    const keys = rewriteRows().map(r => (r.metadata as Record<string, unknown>).strategy_key)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    expect(keys).not.toContain('llm_rewrite')
  })
})

describe('TC-RLW-03: flag OFF → template path (regression), 0-token usage', () => {
  it('uses templates and records 0 tokens; chatComplete never called', async () => {
    vi.mocked(getBooleanControl).mockResolvedValue(false)

    const res = await runEmailRewriteLoop(input)
    expect(res.success).toBe(true)
    expect(vi.mocked(chatComplete)).not.toHaveBeenCalled()

    const usage = h.usageCalls[0]
    expect(usage.promptTokens).toBe(0)
    expect(usage.totalTokens).toBe(0)

    const keys = rewriteRows().map(r => (r.metadata as Record<string, unknown>).strategy_key)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    expect(keys).not.toContain('llm_rewrite')
  })
})

describe('TC-RLW-04: best-selection picks the highest score regardless of source', () => {
  it('with target unreachable, the highest-scoring LLM variant wins', async () => {
    vi.mocked(getBooleanControl).mockResolvedValue(true)
    vi.mocked(chatComplete).mockResolvedValue({
      text: JSON.stringify([
        { subject: 'Variant A score 70', bodyText: 'Hi Bob,\n\nA review of Arthur Heating processing could be useful. Open to a short call this week?\n\nSam' },
        { subject: 'Variant B score 95', bodyText: 'Hi Bob,\n\nHappy to look at how your card processing is set up and flag anything notable. Worth fifteen minutes soon?\n\nSam' },
        { subject: 'Variant C score 80', bodyText: 'Hi Bob,\n\nI can check your current setup and let you know whether anything deserves a closer review. Open to a quick chat?\n\nSam' },
      ]),
      promptTokens: 100, completionTokens: 200, modelName: 'gpt-4o-mini',
    } as never)

    const res = await runEmailRewriteLoop({ ...input, targetScore: 999 })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.bestScore).toBe(95)
    expect(res.bestVersionSubject).toContain('score 95')
  })
})

describe('TC-RLW-05: getBooleanControl failure is fail-open (template path)', () => {
  it('flag read rejects → templates, no crash, 0-token usage', async () => {
    vi.mocked(getBooleanControl).mockRejectedValue(new Error('control store down'))

    const res = await runEmailRewriteLoop(input)
    expect(res.success).toBe(true)
    expect(vi.mocked(chatComplete)).not.toHaveBeenCalled()
    expect(h.usageCalls[0].totalTokens).toBe(0)
  })
})
