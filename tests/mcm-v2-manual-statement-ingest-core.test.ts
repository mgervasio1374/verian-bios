// mcm-v2 — Manual statement ingest (orchestration). Mocks the reused
// repos/services and asserts ingestStatementAndBuildProposal wires them together:
// calculated analysis from figures, a 'statement' artifact (company+contact), a
// 'proposal_pdf' artifact (company), a calculated document_extraction, and a
// 'draft' proposal_event with contact_id + share_token + capture_source 'manual'.
// TC-MSI-01..05

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mocks (hoisted) -------------------------------------------------------

const h = vi.hoisted(() => ({ leadRow: { id: 'lead-1' } as { id: string } | null }))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
    // Used only by the best-effort lead lookup.
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {}
      Object.assign(b, {
        select: () => b, eq: () => b, is: () => b, order: () => b, limit: () => b,
        maybeSingle: async () => ({ data: h.leadRow, error: null }),
      })
      return b
    },
  }),
}))

vi.mock('@/modules/crm/services/company.service', () => ({
  getCompany: vi.fn(async () => ({ id: 'co-1', name: 'Arthur Heating' })),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getContact: vi.fn(),
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
// Permission gate is real — requirePermission uses ctx.permissions.

import { ingestStatementAndBuildProposal } from '@/modules/proposals/services/statement-ingest.service'
import { getContact } from '@/modules/crm/repositories/contact.repo'
import { linkUploadedStatementToCompany } from '@/modules/artifacts/services/company-document.service'
import { uploadGeneratedArtifact } from '@/modules/artifacts/services/artifact.service'
import { recordSavingsAnalysis } from '@/modules/proposals/repositories/savings-analysis.repo'
import { createProposalEvent } from '@/modules/proposals/repositories/proposal-events.repo'
import { buildCalculatedAnalysis } from '@/lib/statement/analysis'

const ctx = {
  tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1',
  roleSlug: 'workspace_admin', permissions: ['crm.companies.edit', 'crm.leads.create', 'artifacts.upload'],
  requestId: 'r-1',
} as never

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 'co-1',
    contactId: 'ct-1',
    file: { bytes: new Uint8Array([9, 9, 9]), fileName: 'march.pdf', mimeType: 'application/pdf', sizeBytes: 3 },
    figures: { monthlyVolume: 100_000, currentMonthlyFees: 3_200, transactionCount: 2_000 },
    statementPeriod: 'March 2026',
    processor: 'Square',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.leadRow = { id: 'lead-1' }
  vi.mocked(getContact).mockResolvedValue({ id: 'ct-1', company_id: 'co-1', email: 'bob@arthur.example', first_name: 'Bob', last_name: 'Arthur' } as never)
})

describe('TC-MSI-01: happy path wires every builder', () => {
  it('calculated analysis, statement + proposal_pdf artifacts, extraction, draft proposal_event', async () => {
    const res = await ingestStatementAndBuildProposal(ctx, baseInput())

    // statement artifact linked to company + contact
    const stmtArg = vi.mocked(linkUploadedStatementToCompany).mock.calls[0][0]
    expect(stmtArg.companyId).toBe('co-1')
    expect(stmtArg.contactId).toBe('ct-1')

    // calculated analysis persisted as a document_extraction for the statement artifact
    const extArg = vi.mocked(recordSavingsAnalysis).mock.calls[0][0]
    expect(extArg.artifactId).toBe('stmt-art-1')
    expect(extArg.analysis.confidence).toBe('calculated')

    // proposal_pdf artifact linked to the company
    const pdfArg = vi.mocked(uploadGeneratedArtifact).mock.calls[0][1]
    expect(pdfArg.artifactType).toBe('proposal_pdf')
    expect(pdfArg.companyId).toBe('co-1')

    // draft proposal_event with contact_id, share_token, capture_source 'manual',
    // estimated_savings from the analysis, both artifact ids in metadata
    const eventArg = vi.mocked(createProposalEvent).mock.calls[0][0]
    expect(eventArg.proposalStatus).toBe('draft')
    expect(eventArg.contactId).toBe('ct-1')
    expect(eventArg.companyId).toBe('co-1')
    expect(eventArg.captureSource).toBe('manual')
    expect(eventArg.shareToken).toBeTruthy()
    const expected = buildCalculatedAnalysis({ monthlyVolume: 100_000, currentMonthlyFees: 3_200, transactionCount: 2_000 })
    expect(eventArg.estimatedSavings).toBeCloseTo(expected.estimated_savings_monthly ?? 0, 6)
    // proposal_amount carries ANNUAL savings (matches savings-certificate.service so
    // the Proposal Pipeline "Savings pipeline $" sums consistently) — NOT proposed cost.
    expect(eventArg.proposalAmount).toBeCloseTo(expected.estimated_savings_annual ?? 0, 6)
    const meta = eventArg.metadata as Record<string, unknown>
    expect(meta.statement_artifact_id).toBe('stmt-art-1')
    expect(meta.proposal_pdf_artifact_id).toBe('pdf-art-1')
    expect(meta.ingest_source).toBe('manual_operator')

    expect(res.proposalEventId).toBe('pe-1')
    expect(res.shareToken).toBe(eventArg.shareToken)
  })

  it('passes the operator figures to buildCalculatedAnalysis (analysis carries them)', async () => {
    await ingestStatementAndBuildProposal(ctx, baseInput())
    const extArg = vi.mocked(recordSavingsAnalysis).mock.calls[0][0]
    expect(extArg.analysis.monthly_volume_estimate).toBe(100_000)
    expect(extArg.analysis.total_fees_estimate).toBe(3_200)
    expect(extArg.analysis.transaction_count_estimate).toBe(2_000)
  })
})

describe('TC-MSI-02: contact without email → contact_email_required, no proposal_event', () => {
  it('throws and creates nothing downstream', async () => {
    vi.mocked(getContact).mockResolvedValue({ id: 'ct-1', company_id: 'co-1', email: '', first_name: 'Bob' } as never)
    await expect(ingestStatementAndBuildProposal(ctx, baseInput())).rejects.toThrow('contact_email_required')
    expect(vi.mocked(createProposalEvent)).not.toHaveBeenCalled()
    expect(vi.mocked(linkUploadedStatementToCompany)).not.toHaveBeenCalled()
  })
})

describe('TC-MSI-03: contact not belonging to the company → rejected', () => {
  it('throws contact_not_in_company, no writes', async () => {
    vi.mocked(getContact).mockResolvedValue({ id: 'ct-1', company_id: 'OTHER', email: 'x@y.com' } as never)
    await expect(ingestStatementAndBuildProposal(ctx, baseInput())).rejects.toThrow('contact_not_in_company')
    expect(vi.mocked(createProposalEvent)).not.toHaveBeenCalled()
  })
})

describe('TC-MSI-04: missing crm.companies.edit → rejected, no writes', () => {
  it('throws on the permission gate before any work', async () => {
    const memberCtx = { ...(ctx as object), roleSlug: 'member', permissions: ['crm.leads.view'] } as never
    await expect(ingestStatementAndBuildProposal(memberCtx, baseInput())).rejects.toThrow()
    expect(vi.mocked(linkUploadedStatementToCompany)).not.toHaveBeenCalled()
    expect(vi.mocked(createProposalEvent)).not.toHaveBeenCalled()
  })
})

describe('TC-MSI-05: lead parity is best-effort', () => {
  it('reuses an existing company lead as lead_id', async () => {
    h.leadRow = { id: 'lead-existing' }
    await ingestStatementAndBuildProposal(ctx, baseInput())
    const eventArg = vi.mocked(createProposalEvent).mock.calls[0][0]
    expect(eventArg.leadId).toBe('lead-existing')
  })

  it('a lead-step failure never blocks the proposal_event (leadId null)', async () => {
    h.leadRow = null
    const { createLead } = await import('@/modules/crm/services/lead.service')
    vi.mocked(createLead).mockRejectedValueOnce(new Error('no permission'))
    const res = await ingestStatementAndBuildProposal(ctx, baseInput())
    const eventArg = vi.mocked(createProposalEvent).mock.calls[0][0]
    expect(eventArg.leadId).toBeNull()
    expect(res.proposalEventId).toBe('pe-1')
  })
})
