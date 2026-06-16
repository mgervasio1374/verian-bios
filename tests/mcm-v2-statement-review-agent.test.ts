// mcm-v2 — Statement Review Agent (Phase 0 of the statement learning loop).
// Covers the pure deterministic grader (each check + verdict/score), the migration
// shape, the gated service (off → no-op; on → writes review + logs run/decision),
// and roster visibility. TC-SRA-01..16

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  reviewStatementAnalysis,
  SCORE_START, WARN_PENALTY, FAIL_SCORE,
} from '@/lib/statement/analysis-review'
import { buildCalculatedAnalysis, buildPlaceholderAnalysis } from '@/lib/statement/analysis'
import type { StatementAnalysis } from '@/lib/statement/analysis'

// A clean, reconciling calculated analysis: 2.8% rate, $50 avg ticket, modest savings.
function cleanAnalysis(): StatementAnalysis {
  return buildCalculatedAnalysis({
    monthlyVolume:      100_000,
    currentMonthlyFees: 2_800,
    transactionCount:   2_000,
    companyName:        'Acme',
    source:             'operator_entered',
  })
}

// ---------------------------------------------------------------------------
// Pure grader
// ---------------------------------------------------------------------------

describe('TC-SRA-01: clean calculated analysis → pass / 100', () => {
  it('no findings, full score', () => {
    const r = reviewStatementAnalysis(cleanAnalysis())
    expect(r.verdict).toBe('pass')
    expect(r.score).toBe(SCORE_START)
    expect(r.findings.filter(f => f.status !== 'ok')).toHaveLength(0)
  })
})

describe('TC-SRA-02: placeholder → flagged (not fail) with a single placeholder finding', () => {
  it('flagged, one finding, score 85', () => {
    const r = reviewStatementAnalysis(buildPlaceholderAnalysis({}, 'stmt.pdf', 'Acme'))
    expect(r.verdict).toBe('flagged')
    expect(r.score).toBe(SCORE_START - WARN_PENALTY)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0].check).toBe('placeholder')
    expect(r.findings[0].detail).toContain('placeholder')
  })
})

describe('TC-SRA-03: non-positive monthly volume → fail', () => {
  it('fail verdict, score floored', () => {
    const a = { ...cleanAnalysis(), monthly_volume_estimate: 0 }
    const r = reviewStatementAnalysis(a)
    expect(r.verdict).toBe('fail')
    expect(r.score).toBe(FAIL_SCORE)
    expect(r.findings.some(f => f.check === 'monthly_volume' && f.status === 'fail')).toBe(true)
  })
})

describe('TC-SRA-04: non-positive total fees → fail', () => {
  it('fail verdict with the total_fees finding', () => {
    const a = { ...cleanAnalysis(), total_fees_estimate: 0 }
    const r = reviewStatementAnalysis(a)
    expect(r.verdict).toBe('fail')
    expect(r.findings.some(f => f.check === 'total_fees' && f.status === 'fail')).toBe(true)
  })
})

describe('TC-SRA-05: bridge null on a calculated analysis → fail', () => {
  it('savings cannot be reconciled', () => {
    // estimated_savings_monthly = null makes deriveCostSavingsBridge return null
    const a = { ...cleanAnalysis(), estimated_savings_monthly: null }
    const r = reviewStatementAnalysis(a)
    expect(r.verdict).toBe('fail')
    expect(r.findings.some(f => f.check === 'savings_reconciliation' && f.detail === 'savings cannot be reconciled')).toBe(true)
  })
})

describe('TC-SRA-06: effective rate outside band → warn (flagged)', () => {
  it('rate 0.10 flags', () => {
    const a = { ...cleanAnalysis(), effective_rate_estimate: 0.10 }
    const r = reviewStatementAnalysis(a)
    expect(r.verdict).toBe('flagged')
    expect(r.score).toBe(SCORE_START - WARN_PENALTY)
    expect(r.findings.some(f => f.check === 'effective_rate' && f.status === 'warn')).toBe(true)
  })
})

describe('TC-SRA-07: savings ratio implausibly high → warn (flagged)', () => {
  it('savings/fees > 0.6 flags', () => {
    const a = { ...cleanAnalysis(), estimated_savings_monthly: 2_000 } // 2000/2800 = 0.71
    const r = reviewStatementAnalysis(a)
    expect(r.verdict).toBe('flagged')
    expect(r.findings.some(f => f.check === 'savings_ratio' && f.detail === 'claimed savings implausibly high')).toBe(true)
  })
})

describe('TC-SRA-08: average ticket outside band → warn (flagged)', () => {
  it('avg ticket > 50000 flags', () => {
    const a = { ...cleanAnalysis(), transaction_count_estimate: 1 } // 100000/1 = 100000
    const r = reviewStatementAnalysis(a)
    expect(r.verdict).toBe('flagged')
    expect(r.findings.some(f => f.check === 'avg_ticket' && f.status === 'warn')).toBe(true)
  })
})

describe('TC-SRA-09: multiple warns stack the penalty', () => {
  it('two warns → score 70', () => {
    const a = { ...cleanAnalysis(), effective_rate_estimate: 0.10, transaction_count_estimate: 1 }
    const r = reviewStatementAnalysis(a)
    expect(r.verdict).toBe('flagged')
    expect(r.score).toBe(SCORE_START - 2 * WARN_PENALTY)
  })
})

// ---------------------------------------------------------------------------
// Migration shape
// ---------------------------------------------------------------------------

describe('TC-SRA-10: migration 20240064 defines the table, checks, indexes, RLS', () => {
  const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20240064_statement_analysis_reviews.sql'), 'utf8')

  it('creates the table with the listed columns', () => {
    expect(sql).toContain('CREATE TABLE statement_analysis_reviews')
    for (const col of [
      'tenant_id', 'workspace_id', 'document_extraction_id', 'proposal_event_id',
      'company_id', 'review_type', 'verdict', 'quality_score', 'confidence',
      'findings', 'field_grades', 'agent_run_id', 'model_used', 'source',
      'reviewer_user_id', 'created_at', 'updated_at',
    ]) {
      expect(sql).toContain(col)
    }
  })

  it('enforces verdict / review_type / source CHECK constraints', () => {
    expect(sql).toMatch(/verdict\s+text\s+NOT NULL\s+CHECK \(verdict IN \('pass','flagged','fail'\)\)/)
    expect(sql).toContain("review_type IN ('plausibility','extraction_accuracy')")
    expect(sql).toContain("source IN ('agent','human')")
  })

  it('references document_extractions ON DELETE CASCADE and creates the indexes', () => {
    expect(sql).toContain('REFERENCES document_extractions(id) ON DELETE CASCADE')
    expect(sql).toContain('idx_statement_analysis_reviews_extraction')
    expect(sql).toContain('idx_statement_analysis_reviews_verdict')
  })

  it('enables RLS with tenant-scoped select + service-role writes (no global tier)', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('current_tenant_id()')
    expect(sql).toContain('is_workspace_member')
    expect(sql).toContain('"statement_analysis_reviews_select"')
    expect(sql).toContain("auth.role() = 'service_role'")
    expect(sql).not.toContain('tenant_id IS NULL')
    expect(sql).toContain('GRANT SELECT ON statement_analysis_reviews TO authenticated')
  })

  it('uses the update_updated_at() trigger', () => {
    expect(sql).toContain('update_updated_at()')
    expect(sql).toContain('set_statement_analysis_reviews_updated_at')
  })
})

// ---------------------------------------------------------------------------
// Service — gated default-off no-op vs gated-on run+write
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ enabled: false }))

vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => h.enabled),
}))
vi.mock('@/modules/intelligence/repositories/agent-run.repo', () => ({
  createAgentRun:   vi.fn(async () => ({ id: 'run-1' })),
  completeAgentRun: vi.fn(async () => undefined),
  failAgentRun:     vi.fn(async () => undefined),
}))
vi.mock('@/modules/intelligence/repositories/agent-decision.repo', () => ({
  createDecision: vi.fn(async () => ({ id: 'dec-1' })),
}))
vi.mock('@/modules/proposals/repositories/savings-analysis.repo', () => ({
  getDocumentExtractionById: vi.fn(async () => ({ id: 'ext-1', structured_data: cleanAnalysis() })),
}))
vi.mock('@/modules/proposals/repositories/statement-analysis-review.repo', () => ({
  recordAnalysisReview: vi.fn(async () => ({ id: 'rev-1' })),
}))

import { reviewAnalysisForExtraction } from '@/modules/proposals/services/statement-review.service'
import { getBooleanControl } from '@/modules/intelligence/repositories/system-control.repo'
import { createAgentRun, completeAgentRun } from '@/modules/intelligence/repositories/agent-run.repo'
import { createDecision } from '@/modules/intelligence/repositories/agent-decision.repo'
import { recordAnalysisReview } from '@/modules/proposals/repositories/statement-analysis-review.repo'

beforeEach(() => { h.enabled = false; vi.clearAllMocks() })

describe('TC-SRA-11: gated OFF → pure no-op', () => {
  it('returns skipped, writes nothing, starts no run', async () => {
    h.enabled = false
    const res = await reviewAnalysisForExtraction('t-1', { documentExtractionId: 'ext-1' })
    expect(res).toEqual({ ok: true, skipped: true })
    expect(vi.mocked(createAgentRun)).not.toHaveBeenCalled()
    expect(vi.mocked(recordAnalysisReview)).not.toHaveBeenCalled()
    expect(vi.mocked(createDecision)).not.toHaveBeenCalled()
  })
})

describe('TC-SRA-12: gated ON → run + review + decision + complete', () => {
  it('writes a review and logs telemetry; returns verdict', async () => {
    h.enabled = true
    const res = await reviewAnalysisForExtraction('t-1', {
      documentExtractionId: 'ext-1', workspaceId: 'ws-1', proposalEventId: 'pe-1', companyId: 'co-1',
    })
    expect(res.ok).toBe(true)
    expect(res.reviewId).toBe('rev-1')
    expect(res.verdict).toBe('pass')

    expect(vi.mocked(getBooleanControl)).toHaveBeenCalledWith('statement_review_agent_enabled', 't-1', false)
    const runArg = vi.mocked(createAgentRun).mock.calls[0][0]
    expect(runArg.agentName).toBe('statement_review_agent')
    expect(runArg.subjectType).toBe('document_extraction')

    const revArg = vi.mocked(recordAnalysisReview).mock.calls[0][0]
    expect(revArg.agentRunId).toBe('run-1')
    expect(revArg.verdict).toBe('pass')
    expect(revArg.documentExtractionId).toBe('ext-1')
    expect(revArg.proposalEventId).toBe('pe-1')

    const decArg = vi.mocked(createDecision).mock.calls[0][0]
    expect(decArg.agentName).toBe('statement_review_agent')
    expect(decArg.decisionType).toBe('analysis_reviewed')
    expect(decArg.recommendedAction).toBe('pass')
    expect(decArg.learningTags).toContain('statement_review')

    expect(vi.mocked(completeAgentRun)).toHaveBeenCalledWith('run-1', expect.anything())
  })
})

describe('TC-SRA-13: service is advisory — no enforceAgentAction, not in the bridge registry', () => {
  it('the service source does not enforce or register', () => {
    const src = readFileSync(join(__dirname, '..', 'modules', 'proposals', 'services', 'statement-review.service.ts'), 'utf8')
    expect(src).not.toContain('enforceAgentAction')
    expect(src).not.toContain('verian-agent-bridge')
    expect(src).not.toContain('agent-registry')
  })
})

// ---------------------------------------------------------------------------
// Roster visibility
// ---------------------------------------------------------------------------

describe('TC-SRA-14: roster contains statement_review_agent with the right telemetry name', () => {
  it('gated, business_intelligence, telemetryNames includes statement_review_agent', async () => {
    const { AGENT_ROSTER } = await import('@/modules/intelligence/agent-roster')
    const row = AGENT_ROSTER.find(a => a.key === 'statement_review_agent')
    expect(row).toBeTruthy()
    expect(row!.label).toBe('Statement Review')
    expect(row!.category).toBe('business_intelligence')
    expect(row!.implState).toBe('gated')
    expect(row!.telemetryNames).toEqual(['statement_review_agent'])
    expect(row!.processesLeads).toBe(false)
  })
})

describe('TC-SRA-15: SystemControlKey gained STATEMENT_REVIEW_AGENT_ENABLED', () => {
  it('maps to statement_review_agent_enabled', async () => {
    const { SystemControlKey } = await import('@/modules/intelligence/types.agent')
    expect(SystemControlKey.STATEMENT_REVIEW_AGENT_ENABLED).toBe('statement_review_agent_enabled')
  })
})

describe('TC-SRA-16: chokepoints wire the review best-effort and awaited', () => {
  it('both ingest services call reviewAnalysisForExtraction', () => {
    const ingest = readFileSync(join(__dirname, '..', 'modules', 'proposals', 'services', 'statement-ingest.service.ts'), 'utf8')
    const cert   = readFileSync(join(__dirname, '..', 'modules', 'proposals', 'services', 'savings-certificate.service.ts'), 'utf8')
    expect(ingest).toContain('await reviewAnalysisForExtraction(')
    expect(cert).toContain('await reviewAnalysisForExtraction(')
  })
})
