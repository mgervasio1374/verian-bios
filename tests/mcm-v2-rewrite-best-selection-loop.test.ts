// mcm-v2 — runEmailRewriteLoop best-selection persistence (source-agnostic).
// The loop now persists best_version_id via selectBestVersion over ALL persisted
// versions: never a blocked one, and a re-run that only produces duplicates keeps
// the existing best (no regression to a blocked original; status != blocked_risk).
// TC-BSL-01..03

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORIGINAL_BODY = 'Hi Bob,\n\nThis is the original draft body for Arthur Heating.\n\nSam'
const EXISTING_REWRITE_BODY = 'Hi Bob,\n\nHappy to review how Arthur Heating processes cards and flag anything that stands out. Worth a short call this week?\n\nSam'

const h = vi.hoisted(() => ({
  existingVersions: [] as Array<Record<string, unknown>>,
  createdVersions:  [] as Array<Record<string, unknown>>,
  loopResults:      [] as Array<Record<string, unknown>>,
  versionSeq:       0,
}))

vi.mock('@/lib/supabase/service', () => {
  // Literal (not the outer const) — vi.mock factories are hoisted above consts.
  const ORIGINAL_BODY = 'Hi Bob,\n\nThis is the original draft body for Arthur Heating.\n\nSam'
  const draft = {
    id: 'draft-1', subject: 'Original subject', body_text: ORIGINAL_BODY,
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
    const ORIGINAL_BODY = 'Hi Bob,\n\nThis is the original draft body for Arthur Heating.\n\nSam'
    let score = 50
    const m = /score (\d+)/.exec(inp.subject)
    if (m) score = Number(m[1])
    else if (inp.bodyText !== ORIGINAL_BODY) score = 90
    const status = /blocked/.test(inp.subject) ? 'blocked' : (score >= 85 ? 'pass' : 'needs_revision')
    return { overallScore: score, status, strengths: [], weaknesses: [], riskFlags: [], suggestedSubject: undefined, suggestedBody: undefined }
  }),
}))

vi.mock('@/modules/messaging/repositories/email-draft-version.repo', () => ({
  listEmailDraftVersions: vi.fn(async () => h.existingVersions),
  createEmailDraftVersion: vi.fn(async (row: Record<string, unknown>) => {
    h.versionSeq += 1
    const created = {
      id: `new-${h.versionSeq}`,
      version_number: row.versionNumber as number,
      version_type:   row.versionType as string,
      quality_score:  row.qualityScore as number | null,
      quality_status: row.qualityStatus as string | null,
      subject:        row.subject as string,
      body_text:      row.bodyText as string,
      metadata:       row.metadata,
    }
    h.createdVersions.push(created)
    return created
  }),
}))

vi.mock('@/modules/messaging/repositories/email-quality.repo', () => ({
  getEmailQualityReview: vi.fn(async () => null),
  updateEmailQualityReviewLoopResult: vi.fn(async (_d: string, _t: string, r: Record<string, unknown>) => { h.loopResults.push(r) }),
}))

vi.mock('@/modules/intelligence/services/activity-event.service', () => ({ recordActivity: vi.fn(async () => undefined) }))
vi.mock('@/modules/intelligence/repositories/agent-decision.repo', () => ({ createDecision: vi.fn(async () => undefined) }))
vi.mock('@/modules/intelligence/repositories/ai-usage-event.repo', () => ({ recordUsage: vi.fn(async () => undefined) }))
vi.mock('@/modules/intelligence/services/ai-budget-enforcer.service', () => ({ preflightCheck: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({ getBooleanControl: vi.fn() }))
vi.mock('@/lib/llm/client', () => ({ chatComplete: vi.fn() }))

import { runEmailRewriteLoop } from '@/modules/messaging/services/email-rewrite-loop.service'
import { reviewEmailDraftQuality } from '@/modules/messaging/services/email-quality.service'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { chatComplete } from '@/lib/llm/client'

const input = { tenantId: 't-1', workspaceId: 'ws-1', emailDraftId: 'draft-1' }

beforeEach(() => {
  h.existingVersions = []
  h.createdVersions = []
  h.loopResults = []
  h.versionSeq = 0
  vi.clearAllMocks()
  vi.mocked(reviewEmailDraftQuality).mockImplementation((inp) => {
    let score = 50
    const m = /score (\d+)/.exec(inp.subject)
    if (m) score = Number(m[1])
    else if (inp.bodyText !== ORIGINAL_BODY) score = 90
    const status = /blocked/.test(inp.subject) ? 'blocked' : (score >= 85 ? 'pass' : 'needs_revision')
    return { overallScore: score, status, strengths: [], weaknesses: [], riskFlags: [], suggestedSubject: undefined, suggestedBody: undefined } as never
  })
})

describe('TC-BSL-01: best is the highest NON-blocked version, never a blocked one', () => {
  it('a blocked 90 loses to a non-blocked 80', async () => {
    vi.mocked(getBooleanControl).mockResolvedValue(true)
    vi.mocked(chatComplete).mockResolvedValue({
      text: JSON.stringify([
        { subject: 'Variant A score 90 blocked', bodyText: 'Hi Bob,\n\nA review of how Arthur Heating handles card processing could surface something notable. Open to a short call this week?\n\nSam' },
        { subject: 'Variant B score 80', bodyText: 'Hi Bob,\n\nI can take a closer look at your current setup and let you know whether anything deserves attention. Worth fifteen minutes soon?\n\nSam' },
      ]),
      promptTokens: 100, completionTokens: 200, modelName: 'gpt-4o-mini',
    } as never)

    const res = await runEmailRewriteLoop({ ...input, targetScore: 999 })
    expect(res.success).toBe(true)
    if (!res.success) return

    // The blocked 90 must not win; the non-blocked 80 does.
    expect(res.bestScore).toBe(80)
    const blockedRow = h.createdVersions.find(r => r.quality_status === 'blocked')
    expect(blockedRow).toBeTruthy()
    expect(res.bestVersionId).not.toBe(blockedRow!.id)

    const persisted = h.loopResults[0]
    expect(persisted.bestVersionScore).toBe(80)
    expect(persisted.bestVersionId).toBe(res.bestVersionId)
  })
})

describe('TC-BSL-02: re-run with only duplicates keeps the existing 78 (no regression, not blocked_risk)', () => {
  it('best stays on the prior non-blocked 78 even though this run adds nothing', async () => {
    h.existingVersions = [
      { id: 'orig', version_number: 1, version_type: 'original', quality_score: 62, quality_status: 'blocked', subject: 'Original subject', body_text: ORIGINAL_BODY },
      { id: 'r78',  version_number: 2, version_type: 'rewrite',  quality_score: 78, quality_status: 'needs_revision', subject: 'Existing 78', body_text: EXISTING_REWRITE_BODY },
    ]
    vi.mocked(getBooleanControl).mockResolvedValue(true)
    // LLM returns a near-duplicate of the existing 78 → dedup skips it → 0 new rows.
    vi.mocked(chatComplete).mockResolvedValue({
      text: JSON.stringify([{ subject: 'Dup of 78', bodyText: EXISTING_REWRITE_BODY }]),
      promptTokens: 50, completionTokens: 60, modelName: 'gpt-4o-mini',
    } as never)

    const res = await runEmailRewriteLoop(input)
    expect(res.success).toBe(true)
    if (!res.success) return

    // No new rewrite rows were created this run.
    expect(h.createdVersions.filter(r => r.version_type === 'rewrite').length).toBe(0)
    // Best stays pinned to the existing 78 rewrite — NOT the blocked original.
    expect(res.bestVersionId).toBe('r78')
    expect(res.bestScore).toBe(78)
    expect(res.status).not.toBe('blocked_risk')

    const persisted = h.loopResults[0]
    expect(persisted.bestVersionId).toBe('r78')
    expect(persisted.loopStatus).not.toBe('blocked_risk')
  })
})

describe('TC-BSL-03: identical behavior for template-sourced versions (flag OFF)', () => {
  it('flag OFF → template candidates scored; best is a non-blocked rewrite, persisted', async () => {
    vi.mocked(getBooleanControl).mockResolvedValue(false)

    const res = await runEmailRewriteLoop({ ...input, targetScore: 999 })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(vi.mocked(chatComplete)).not.toHaveBeenCalled()

    // template rewrites scored 90 (non-original, non-blocked) → best is one of them
    expect(res.bestVersionId).toBeTruthy()
    expect(res.bestScore).toBe(90)
    const best = h.createdVersions.find(r => r.id === res.bestVersionId)
    expect(best).toBeTruthy()
    expect(best!.version_type).toBe('rewrite')
    expect(best!.quality_status).not.toBe('blocked')
    expect(h.loopResults[0].bestVersionId).toBe(res.bestVersionId)
  })
})
