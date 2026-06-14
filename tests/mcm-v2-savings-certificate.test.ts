// #36 — Evidence Layer Phase 1: deterministic savings calculator + savings
// certificate. Behavioral tests for the pure engine, the calculated-analysis
// builder, and the certificate orchestration service.
// TC-SC-01..12

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeStatementSavings } from '@/lib/statement/savings-calculator'
import { buildCalculatedAnalysis, buildPlaceholderAnalysis } from '@/lib/statement/analysis'

// ---------------------------------------------------------------------------
// Pure savings engine
// ---------------------------------------------------------------------------

describe('TC-SC-01: computeStatementSavings — worked example', () => {
  it('$100k volume, $3,200 fees, 2,000 txns, 1.8% interchange → $915/mo, $10,980/yr', () => {
    const r = computeStatementSavings({
      monthlyVolume:          100_000,
      currentMonthlyFees:     3_200,
      transactionCount:       2_000,
      assumedInterchangeRate: 0.018,
    })
    // proposed = 1800 + 250 + 200 + 35 = 2285
    expect(r.proposedMonthlyCost).toBeCloseTo(2_285, 6)
    expect(r.monthlySavings).toBeCloseTo(915, 6)
    expect(r.annualSavings).toBeCloseTo(10_980, 6)
    expect(r.currentEffectiveRate).toBeCloseTo(0.032, 6)
    expect(r.hasSavings).toBe(true)
    expect(r.assumptions.length).toBeGreaterThan(0)
  })

  it('defaults interchange to 1.8% when omitted', () => {
    const withDefault  = computeStatementSavings({ monthlyVolume: 100_000, currentMonthlyFees: 3_200, transactionCount: 2_000 })
    const withExplicit = computeStatementSavings({ monthlyVolume: 100_000, currentMonthlyFees: 3_200, transactionCount: 2_000, assumedInterchangeRate: 0.018 })
    expect(withDefault.monthlySavings).toBeCloseTo(withExplicit.monthlySavings, 6)
  })
})

describe('TC-SC-02: computeStatementSavings — clamps to zero', () => {
  it('when proposed >= current, savings is 0 and hasSavings is false (never negative)', () => {
    const r = computeStatementSavings({
      monthlyVolume:          100_000,
      currentMonthlyFees:     1_000, // far below proposed (~2285)
      transactionCount:       2_000,
      assumedInterchangeRate: 0.018,
    })
    expect(r.monthlySavings).toBe(0)
    expect(r.annualSavings).toBe(0)
    expect(r.hasSavings).toBe(false)
    expect(r.monthlySavings).toBeGreaterThanOrEqual(0)
    // discloses that no savings are claimed
    expect(r.assumptions.some(a => /no savings/i.test(a))).toBe(true)
  })
})

describe('TC-SC-03: computeStatementSavings — divide-by-zero guard', () => {
  it('volume 0 → no savings, effective rate 0, clear assumption', () => {
    const r = computeStatementSavings({ monthlyVolume: 0, currentMonthlyFees: 3_200, transactionCount: 2_000 })
    expect(r.currentEffectiveRate).toBe(0)
    expect(r.monthlySavings).toBe(0)
    expect(r.annualSavings).toBe(0)
    expect(r.hasSavings).toBe(false)
    expect(Number.isFinite(r.currentEffectiveRate)).toBe(true)
    expect(r.assumptions.some(a => /no monthly processing volume/i.test(a))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Calculated analysis builder
// ---------------------------------------------------------------------------

describe('TC-SC-04: buildCalculatedAnalysis populates savings + confidence', () => {
  it("returns confidence 'calculated' with the engine's savings figures", () => {
    const a = buildCalculatedAnalysis({
      monthlyVolume:      100_000,
      currentMonthlyFees: 3_200,
      transactionCount:   2_000,
      companyName:        'Harbor Diner',
    })
    expect(a.confidence).toBe('calculated')
    expect(a.estimated_savings_monthly).toBeCloseTo(915, 6)
    expect(a.estimated_savings_annual).toBeCloseTo(10_980, 6)
    expect(a.effective_rate_estimate).toBeCloseTo(0.032, 6)
    expect(a.monthly_volume_estimate).toBe(100_000)
    expect(a.total_fees_estimate).toBe(3_200)
    expect(a.transaction_count_estimate).toBe(2_000)
    // proposed pricing single-sourced
    expect(a.proposed_basis_points).toBe(25)
    expect(a.proposed_monthly_fee).toBe(35)
    expect(a.proposed_per_txn_cents).toBe(10)
    // proposed cost stored for downstream rendering
    expect(a.extracted_fields.proposed_monthly_cost).toBeCloseTo(2_285, 6)
  })

  it('placeholder builder remains intact — null savings, placeholder confidence', () => {
    const p = buildPlaceholderAnalysis({ metadata: {}, source: 'web' }, 'statement.pdf', 'Acme')
    expect(p.confidence).toBe('placeholder')
    expect(p.estimated_savings_monthly).toBeNull()
    expect(p.estimated_savings_annual).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Certificate orchestration service
// ---------------------------------------------------------------------------

vi.mock('@/lib/pdf/proposal', () => ({
  generateProposalPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))
vi.mock('@/modules/artifacts/services/artifact.service', () => ({
  uploadGeneratedArtifact: vi.fn(async () => ({ artifactId: 'art-1', storagePath: 't/x.pdf' })),
  getArtifactDownloadUrl:  vi.fn(async () => 'https://signed.example/x.pdf'),
}))
vi.mock('@/modules/proposals/repositories/savings-analysis.repo', () => ({
  recordSavingsAnalysis: vi.fn(async () => ({ id: 'ext-1' })),
}))
vi.mock('@/modules/proposals/repositories/proposal-events.repo', () => ({
  createProposalEvent: vi.fn(async () => ({ id: 'pe-1' })),
}))

import { generateProposalPdf } from '@/lib/pdf/proposal'
import * as artifactService from '@/modules/artifacts/services/artifact.service'
import { recordSavingsAnalysis } from '@/modules/proposals/repositories/savings-analysis.repo'
import { generateSavingsCertificate } from '@/modules/proposals/services/savings-certificate.service'

const ctx = {
  tenantId: 'tenant-1', workspaceId: 'ws-1', userId: 'user-1',
  roleSlug: 'operator', permissions: ['*'], requestId: 'req-1',
}

describe('TC-SC-05: generateSavingsCertificate orchestration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('computes → builds calculated analysis → renders PDF → uploads → persists figure → returns URL', async () => {
    const result = await generateSavingsCertificate(ctx, {
      companyId:          'co-1',
      companyName:        'Harbor Diner',
      contactName:        'Pat Smith',
      contactEmail:       'pat@harbor.example',
      monthlyVolume:      100_000,
      currentMonthlyFees: 3_200,
      transactionCount:   2_000,
    })

    // generateProposalPdf received the *calculated* analysis with real savings
    const pdfArg = vi.mocked(generateProposalPdf).mock.calls[0][0]
    expect(pdfArg.analysis.confidence).toBe('calculated')
    expect(pdfArg.analysis.estimated_savings_monthly).toBeCloseTo(915, 6)

    // uploaded as a savings_certificate artifact
    const uploadArg = vi.mocked(artifactService.uploadGeneratedArtifact).mock.calls[0][1]
    expect(uploadArg.artifactType).toBe('savings_certificate')
    expect(uploadArg.companyId).toBe('co-1')
    expect(uploadArg.mimeType).toBe('application/pdf')

    // savings figure persisted via the repo (analysis carries the figure)
    const persistArg = vi.mocked(recordSavingsAnalysis).mock.calls[0][0]
    expect(persistArg.artifactId).toBe('art-1')
    expect(persistArg.analysis.estimated_savings_monthly).toBeCloseTo(915, 6)

    // returns a signed download URL + savings figures
    expect(result.downloadUrl).toBe('https://signed.example/x.pdf')
    expect(result.monthlySavings).toBeCloseTo(915, 6)
    expect(result.annualSavings).toBeCloseTo(10_980, 6)
    expect(result.hasSavings).toBe(true)
  })

  it('still generates a certificate when there are no savings (figure persists as 0)', async () => {
    const result = await generateSavingsCertificate(ctx, {
      companyId:          'co-1',
      companyName:        'Harbor Diner',
      contactName:        null,
      contactEmail:       null,
      monthlyVolume:      100_000,
      currentMonthlyFees: 1_000,
      transactionCount:   2_000,
    })
    expect(result.hasSavings).toBe(false)
    expect(result.monthlySavings).toBe(0)
    expect(vi.mocked(recordSavingsAnalysis)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(artifactService.uploadGeneratedArtifact)).toHaveBeenCalledTimes(1)
  })
})
