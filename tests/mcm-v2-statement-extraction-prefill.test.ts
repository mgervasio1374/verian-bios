// mcm-v2 — Phase 1b: extraction pre-fill + agent-vs-human accuracy capture.
// TC-SEP-01..12

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { computeExtractionFieldGrades, EXTRACTION_MATCH_TOLERANCE } from '@/lib/statement/extraction-grade'

const FINAL = {
  monthlyVolume: 100000, currentMonthlyFees: 2800, transactionCount: 2000,
  processor: 'Stripe', statementPeriod: 'May 2026',
}

describe('TC-SEP-01: exact numeric match → match', () => {
  it('all exact → matchRate 1', () => {
    const r = computeExtractionFieldGrades({ fields: { ...FINAL } }, FINAL)
    expect(r.matchRate).toBe(1)
    expect(r.fieldGrades.monthlyVolume.match).toBe(true)
    expect(r.fieldGrades.processor.match).toBe(true)
  })
})

describe('TC-SEP-02: within-tolerance numeric → match; off-by-more → no match', () => {
  it('100000 vs 100500 (0.5%) matches; vs 110000 (10%) does not', () => {
    const within = computeExtractionFieldGrades({ fields: { monthlyVolume: 100500 } }, FINAL)
    expect(within.fieldGrades.monthlyVolume.match).toBe(true)

    const off = computeExtractionFieldGrades({ fields: { monthlyVolume: 110000 } }, FINAL)
    expect(off.fieldGrades.monthlyVolume.match).toBe(false)
  })

  it('tolerance constant is 0.01', () => {
    expect(EXTRACTION_MATCH_TOLERANCE).toBe(0.01)
  })
})

describe('TC-SEP-03: string match is case-insensitive + trimmed', () => {
  it('"  stripe " matches "Stripe"', () => {
    const r = computeExtractionFieldGrades({ fields: { processor: '  stripe ' } }, FINAL)
    expect(r.fieldGrades.processor.match).toBe(true)
  })
})

describe('TC-SEP-04: agent-null field is excluded from the rate denominator', () => {
  it('only proposed fields count', () => {
    // Agent proposed only monthlyVolume (correct); everything else null.
    const r = computeExtractionFieldGrades({ fields: { monthlyVolume: 100000 } }, FINAL)
    expect(r.matchRate).toBe(1) // 1 graded, 1 match
    expect(r.fieldGrades.transactionCount.match).toBe(false)
    expect(r.fieldGrades.transactionCount.agent).toBeNull()
  })

  it('mixed: one right one wrong of two proposed → 0.5', () => {
    const r = computeExtractionFieldGrades({ fields: { monthlyVolume: 100000, transactionCount: 9999 } }, FINAL)
    expect(r.matchRate).toBe(0.5)
  })
})

describe('TC-SEP-05: all-match → matchRate 1 (verdict pass upstream)', () => {
  it('carries confidence through when supplied', () => {
    const r = computeExtractionFieldGrades(
      { fields: { monthlyVolume: 100000 }, fieldConfidence: { monthlyVolume: 0.9 } },
      FINAL,
    )
    expect(r.fieldGrades.monthlyVolume.confidence).toBe(0.9)
    expect(r.matchRate).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Server — captureExtractionAccuracy
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ throwOnReview: false }))

vi.mock('@/modules/proposals/repositories/statement-analysis-review.repo', () => ({
  recordAnalysisReview: vi.fn(async () => {
    if (h.throwOnReview) throw new Error('db down')
    return { id: 'rev-1' }
  }),
}))

import { captureExtractionAccuracy } from '@/modules/proposals/services/statement-ingest.service'
import { recordAnalysisReview } from '@/modules/proposals/repositories/statement-analysis-review.repo'

beforeEach(() => { vi.clearAllMocks(); h.throwOnReview = false })

const baseArgs = {
  tenantId: 't-1', workspaceId: 'ws-1', documentExtractionId: 'ext-1',
  proposalEventId: 'pe-1', companyId: 'co-1',
  finalFigures: FINAL,
}

describe('TC-SEP-06: records an extraction_accuracy review when a proposal is present', () => {
  it('writes field_grades + verdict from matchRate', async () => {
    await captureExtractionAccuracy({ ...baseArgs, agentExtraction: { fields: { monthlyVolume: 100000 } } })
    expect(vi.mocked(recordAnalysisReview)).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(recordAnalysisReview).mock.calls[0][0]
    expect(arg.reviewType).toBe('extraction_accuracy')
    expect(arg.verdict).toBe('pass') // matchRate 1
    expect(arg.source).toBe('agent')
    expect(arg.fieldGrades).toBeTruthy()
    expect(arg.documentExtractionId).toBe('ext-1')
  })

  it('verdict flagged when not a perfect match', async () => {
    await captureExtractionAccuracy({ ...baseArgs, agentExtraction: { fields: { monthlyVolume: 999 } } })
    const arg = vi.mocked(recordAnalysisReview).mock.calls[0][0]
    expect(arg.verdict).toBe('flagged')
  })
})

describe('TC-SEP-07: no proposal → no review written', () => {
  it('skips when agentExtraction is null', async () => {
    await captureExtractionAccuracy({ ...baseArgs, agentExtraction: null })
    expect(vi.mocked(recordAnalysisReview)).not.toHaveBeenCalled()
  })
})

describe('TC-SEP-08: a review-write failure does not throw', () => {
  it('swallows the error', async () => {
    h.throwOnReview = true
    await expect(
      captureExtractionAccuracy({ ...baseArgs, agentExtraction: { fields: { monthlyVolume: 100000 } } }),
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Form source-read
// ---------------------------------------------------------------------------

describe('TC-SEP-09..12: IngestStatementForm wiring', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'companies', '[id]', 'IngestStatementForm.tsx'),
    'utf8',
  )

  it('TC-SEP-09: has an "Extract figures with AI" button calling the 1a action', () => {
    expect(src).toContain('Extract figures with AI')
    expect(src).toContain('extractStatementFiguresAction(fd)')
  })

  it('TC-SEP-10: populates the figure inputs from the agent result', () => {
    expect(src).toContain('setIfPresent(setMonthlyVolume,      fields.monthlyVolume)')
    expect(src).toContain('setIfPresent(setCurrentMonthlyFees, fields.currentMonthlyFees)')
    expect(src).toContain('setIfPresent(setTransactionCount,   fields.transactionCount)')
  })

  it('TC-SEP-11: handles no_extractable_text inline and carries the proposal to submit', () => {
    expect(src).toContain("res.data.warning === 'no_extractable_text'")
    expect(src).toContain("Couldn't read text from this PDF")
    expect(src).toContain("formData.set('agentExtraction', JSON.stringify(agentExtraction))")
  })

  it('TC-SEP-12: resets the carried proposal when the file changes (no stale leak)', () => {
    expect(src).toContain('function handleFileChange')
    expect(src).toContain('setAgentExtraction(null)')
    // figure inputs remain editable (still controlled via onChange)
    expect(src).toContain('onChange={e => setMonthlyVolume(e.target.value)}')
  })
})
