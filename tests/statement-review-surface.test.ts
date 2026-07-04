// statement-review-surface — the Statement Review agent's verdict is threaded
// from the ingest chokepoint into the success payload and surfaced in
// IngestStatementForm. Advisory only: absent on gate-off/skip/failure, and a
// review failure never fails the ingest. TC-SRS-01..07

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ---- Mocks (same scaffolding as mcm-v2-manual-statement-ingest-core) --------

const h = vi.hoisted(() => ({
  review: { ok: true, skipped: true } as Record<string, unknown>,
  reviewThrows: false,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {}
      Object.assign(b, {
        select: () => b, eq: () => b, is: () => b, order: () => b, limit: () => b,
        maybeSingle: async () => ({ data: { id: 'lead-1' }, error: null }),
      })
      return b
    },
  }),
}))
vi.mock('@/modules/crm/services/company.service', () => ({
  getCompany: vi.fn(async () => ({ id: 'co-1', name: 'Arthur Heating' })),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getContact: vi.fn(async () => ({
    id: 'ct-1', company_id: 'co-1', email: 'bob@arthur.example', first_name: 'Bob', last_name: 'Arthur',
  })),
}))
vi.mock('@/modules/crm/services/lead.service', () => ({
  createLead: vi.fn(async () => ({ id: 'lead-new' })),
}))
vi.mock('@/modules/artifacts/services/company-document.service', () => ({
  linkUploadedStatementToCompany: vi.fn(async () => ({ id: 'stmt-art-1' })),
}))
vi.mock('@/modules/artifacts/services/artifact.service', () => ({
  uploadGeneratedArtifact: vi.fn(async () => ({ artifactId: 'pdf-art-1', storagePath: 't/x.pdf' })),
}))
vi.mock('@/modules/proposals/repositories/savings-analysis.repo', () => ({
  recordSavingsAnalysis: vi.fn(async () => ({ id: 'ext-1' })),
}))
vi.mock('@/modules/proposals/repositories/proposal-events.repo', () => ({
  createProposalEvent: vi.fn(async (input: Record<string, unknown>) => ({ id: 'pe-1', ...input })),
}))
vi.mock('@/lib/pdf/proposal', () => ({
  generateProposalPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))
vi.mock('@/modules/proposals/repositories/statement-analysis-review.repo', () => ({
  recordAnalysisReview: vi.fn(async () => ({ id: 'rev-1' })),
}))
vi.mock('@/modules/intelligence/repositories/activity-event.repo', () => ({
  recordActivityEvent: vi.fn(async () => ({ id: 'ae-1' })),
}))
vi.mock('@/modules/proposals/services/statement-review.service', () => ({
  reviewAnalysisForExtraction: vi.fn(async () => {
    if (h.reviewThrows) throw new Error('review exploded')
    return h.review
  }),
}))

import { ingestStatementAndBuildProposal } from '@/modules/proposals/services/statement-ingest.service'
import { reviewAnalysisForExtraction } from '@/modules/proposals/services/statement-review.service'

const ctx = {
  tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1',
  roleSlug: 'workspace_admin', permissions: ['crm.companies.edit', 'crm.leads.create', 'artifacts.upload'],
  requestId: 'r-1',
} as never

const baseInput = () => ({
  companyId: 'co-1',
  contactId: 'ct-1',
  file: { bytes: new Uint8Array([9, 9, 9]), fileName: 'march.pdf', mimeType: 'application/pdf', sizeBytes: 3 },
  figures: { monthlyVolume: 100_000, currentMonthlyFees: 3_200, transactionCount: 2_000 },
})

beforeEach(() => {
  vi.clearAllMocks()
  h.review = { ok: true, skipped: true }
  h.reviewThrows = false
})

// ---- Ingest service threading ------------------------------------------------

describe('TC-SRS-01: flagged review → success payload carries statementReview', () => {
  it('threads verdict, qualityScore, and mapped findings', async () => {
    h.review = {
      ok: true,
      reviewId: 'rev-1',
      verdict: 'flagged',
      qualityScore: 70,
      findings: [
        { check: 'effective_rate', status: 'warn', detail: 'effective_rate_estimate 0.09 outside [0.005, 0.06]' },
        { check: 'savings_ratio',  status: 'warn', detail: 'claimed savings implausibly high' },
      ],
    }
    const res = await ingestStatementAndBuildProposal(ctx, baseInput())
    expect(res.proposalEventId).toBe('pe-1')
    expect(res.statementReview).toEqual({
      verdict: 'flagged',
      qualityScore: 70,
      findings: [
        { level: 'warn', message: 'effective_rate_estimate 0.09 outside [0.005, 0.06]' },
        { level: 'warn', message: 'claimed savings implausibly high' },
      ],
    })
  })

  it("threads a 'fail' verdict with fail-level findings", async () => {
    h.review = {
      ok: true, reviewId: 'rev-1', verdict: 'fail', qualityScore: 20,
      findings: [{ check: 'total_fees', status: 'fail', detail: 'total_fees_estimate is missing or non-positive' }],
    }
    const res = await ingestStatementAndBuildProposal(ctx, baseInput())
    expect(res.statementReview?.verdict).toBe('fail')
    expect(res.statementReview?.findings).toEqual([
      { level: 'fail', message: 'total_fees_estimate is missing or non-positive' },
    ])
  })
})

describe('TC-SRS-02: gate off / agent skipped → field absent', () => {
  it('skip result leaves statementReview out of the payload entirely', async () => {
    h.review = { ok: true, skipped: true }
    const res = await ingestStatementAndBuildProposal(ctx, baseInput())
    expect(res.proposalEventId).toBe('pe-1')
    expect('statementReview' in res).toBe(false)
  })

  it('ok:false (agent error path) also leaves the field absent', async () => {
    h.review = { ok: false }
    const res = await ingestStatementAndBuildProposal(ctx, baseInput())
    expect('statementReview' in res).toBe(false)
  })
})

describe('TC-SRS-03: review call throwing → ingest still succeeds, field absent', () => {
  it('preserves the existing try/catch behavior', async () => {
    h.reviewThrows = true
    const res = await ingestStatementAndBuildProposal(ctx, baseInput())
    expect(vi.mocked(reviewAnalysisForExtraction)).toHaveBeenCalledTimes(1)
    expect(res.proposalEventId).toBe('pe-1')
    expect('statementReview' in res).toBe(false)
  })
})

// ---- Form + action surface (source-read, repo convention) --------------------

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const FORM   = 'app/(workspace)/[workspaceSlug]/companies/[id]/IngestStatementForm.tsx'
const ACTION = 'modules/proposals/actions/statement-ingest.actions.ts'

describe('TC-SRS-04: action threads statementReview through unchanged', () => {
  it('success data includes result.statementReview when present', () => {
    const src = read(ACTION)
    expect(src).toContain('statementReview: result.statementReview')
    expect(src).toContain('StatementReviewSummary')
  })
})

describe('TC-SRS-05: form renders the amber flagged banner with finding messages', () => {
  const src = read(FORM)

  it('amber banner gated on verdict flagged, with count + findings + score', () => {
    expect(src).toContain("result.statementReview?.verdict === 'flagged'")
    expect(src).toContain('bg-amber-50')
    expect(src).toContain('Statement review flagged {result.statementReview.findings.length} item(s)')
    expect(src).toContain('result.statementReview.findings.map')
    expect(src).toContain('Quality score: {result.statementReview.qualityScore}/100')
  })
})

describe('TC-SRS-06: form renders the red fail banner with implausible copy', () => {
  const src = read(FORM)

  it('red banner gated on verdict fail, says implausible + correct before approving', () => {
    expect(src).toContain("result.statementReview?.verdict === 'fail'")
    expect(src).toContain('bg-red-50')
    expect(src).toContain('figures look implausible')
    expect(src).toContain('Correct the figures before')
  })
})

describe('TC-SRS-07: pass renders a quiet line; absent field renders nothing new', () => {
  const src = read(FORM)

  it('quiet muted pass line with score', () => {
    expect(src).toContain("result.statementReview?.verdict === 'pass'")
    expect(src).toContain('Statement review: pass (score {result.statementReview.qualityScore})')
    expect(src).toContain('text-muted-foreground')
  })

  it('every review block is optional-chained off statementReview (absent ⇒ unchanged success state)', () => {
    // All three banners key off result.statementReview?.verdict — an absent
    // field renders none of them, leaving today's success state untouched.
    const occurrences = src.match(/result\.statementReview\?\.verdict === '/g) ?? []
    expect(occurrences.length).toBe(3)
    expect(src).toContain('Draft proposal created.')
  })
})
