// #37 — Hosted proposal web page (Slice A). Behavioral tests for the share-token
// generator, the extended certificate service (creates a hosted proposal_event),
// the public loader, and the public Contact-Us inquiry action.
// TC-HP-01..12

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Module mocks (hoisted) ------------------------------------------------

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
  createProposalEvent:           vi.fn(async () => ({ id: 'pe-1' })),
  getProposalEventByShareToken:  vi.fn(async () => null),
}))
vi.mock('@/lib/resend/client', () => ({
  resend: { emails: { send: vi.fn(async () => ({ data: { id: 'em-1' }, error: null })) } },
}))
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  getDefaultSenderIdentity: vi.fn(async () => ({ name: '321 Swipe', email: 'sales@321swipe.com' })),
}))

import { generateShareToken, SHARE_TOKEN_REGEX, SHARE_TOKEN_MIN_LENGTH } from '@/lib/proposals/share-token'
import { generateSavingsCertificate } from '@/modules/proposals/services/savings-certificate.service'
import { getPublicProposalByToken } from '@/modules/proposals/services/public-proposal.service'
import { submitProposalInquiry } from '@/modules/proposals/actions/proposal-inquiry.actions'
import { createProposalEvent, getProposalEventByShareToken } from '@/modules/proposals/repositories/proposal-events.repo'
import { resend } from '@/lib/resend/client'

const ctx = {
  tenantId: 'tenant-1', workspaceId: 'ws-1', userId: 'user-1',
  roleSlug: 'operator', permissions: ['*'], requestId: 'req-1',
}

// ---------------------------------------------------------------------------
// Share token
// ---------------------------------------------------------------------------

describe('TC-HP-01: share token is unguessable', () => {
  it('is url-safe, long enough, and differs between calls', () => {
    const a = generateShareToken()
    const b = generateShareToken()
    expect(a.length).toBeGreaterThanOrEqual(SHARE_TOKEN_MIN_LENGTH)
    expect(SHARE_TOKEN_REGEX.test(a)).toBe(true)
    expect(SHARE_TOKEN_REGEX.test(b)).toBe(true)
    expect(a).not.toBe(b)
  })
})

// ---------------------------------------------------------------------------
// Extended certificate service → creates hosted proposal_event
// ---------------------------------------------------------------------------

describe('TC-HP-02: generateSavingsCertificate creates a hosted proposal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a draft proposal_event with a unique share_token, snapshot, links, and returns a /p URL', async () => {
    const result = await generateSavingsCertificate(ctx, {
      companyId:          'co-1',
      companyName:        'Harbor Diner',
      contactName:        'Pat Smith',
      contactEmail:       'pat@harbor.example',
      contactId:          'ct-1',
      leadId:             'ld-1',
      monthlyVolume:      100_000,
      currentMonthlyFees: 3_200,
      transactionCount:   2_000,
    })

    const arg = vi.mocked(createProposalEvent).mock.calls[0][0]
    expect(arg.proposalStatus).toBe('draft')
    expect(arg.captureSource).toBe('savings_analysis')
    expect(arg.shareToken).toBeTruthy()
    expect(SHARE_TOKEN_REGEX.test(arg.shareToken as string)).toBe(true)
    // company / contact / lead links
    expect(arg.companyId).toBe('co-1')
    expect(arg.contactId).toBe('ct-1')
    expect(arg.leadId).toBe('ld-1')
    // immutable analysis snapshot in metadata + savings figure
    const snapshot = (arg.metadata as Record<string, unknown>)?.analysis as { confidence: string; estimated_savings_monthly: number }
    expect(snapshot.confidence).toBe('calculated')
    expect(snapshot.estimated_savings_monthly).toBeCloseTo(915, 6)
    expect(arg.estimatedSavings).toBeCloseTo(915, 6)
    expect(arg.proposalAmount).toBeCloseTo(10_980, 6) // annual

    // returns a public /p/{token} URL matching the generated token
    expect(result.shareToken).toBe(arg.shareToken)
    expect(result.publicUrl).toContain(`/p/${result.shareToken}`)
    expect(result.downloadUrl).toBe('https://signed.example/x.pdf')
  })
})

// ---------------------------------------------------------------------------
// Public loader
// ---------------------------------------------------------------------------

describe('TC-HP-03: public loader', () => {
  beforeEach(() => vi.clearAllMocks())

  it('known token returns the proposal view with the snapshot', async () => {
    vi.mocked(getProposalEventByShareToken).mockResolvedValueOnce({
      id: 'pe-1', proposal_status: 'draft', estimated_savings: 915, proposal_amount: 10_980,
      created_at: '2026-06-14T00:00:00Z',
      metadata: { company_name: 'Harbor Diner', analysis: { confidence: 'calculated', estimated_savings_monthly: 915, assumptions: [] } },
    } as never)

    const view = await getPublicProposalByToken('tok-known')
    expect(view).not.toBeNull()
    expect(view!.companyName).toBe('Harbor Diner')
    expect(view!.estimatedSavings).toBe(915)
    expect(view!.analysis?.confidence).toBe('calculated')
  })

  it('unknown token returns null', async () => {
    vi.mocked(getProposalEventByShareToken).mockResolvedValueOnce(null)
    expect(await getPublicProposalByToken('nope')).toBeNull()
  })

  it('empty token returns null without hitting the repo', async () => {
    vi.clearAllMocks()
    expect(await getPublicProposalByToken('')).toBeNull()
    expect(vi.mocked(getProposalEventByShareToken)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Contact-Us inquiry action
// ---------------------------------------------------------------------------

describe('TC-HP-04: submitProposalInquiry', () => {
  beforeEach(() => vi.clearAllMocks())

  function mockKnownProposal() {
    vi.mocked(getProposalEventByShareToken).mockResolvedValue({
      id: 'pe-1', tenant_id: 'tenant-1', proposal_status: 'draft',
      metadata: { company_name: 'Harbor Diner' },
    } as never)
  }

  it('valid input sends exactly one email to the inbox with company + link + message', async () => {
    mockKnownProposal()
    const res = await submitProposalInquiry('tok-1', 'Jane Doe', 'jane@biz.com', 'Tell me more about my savings.')
    expect(res.success).toBe(true)

    const send = vi.mocked(resend.emails.send)
    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0][0] as { to: string[]; subject: string; text: string }
    expect(payload.to).toContain('sales@321swipe.com')
    expect(payload.subject).toContain('Harbor Diner')
    expect(payload.text).toContain('Harbor Diner')
    expect(payload.text).toContain('/p/tok-1')
    expect(payload.text).toContain('Tell me more about my savings.')
  })

  it('invalid email is rejected with no send', async () => {
    mockKnownProposal()
    const res = await submitProposalInquiry('tok-1', 'Jane', 'not-an-email', 'hi there')
    expect(res.success).toBe(false)
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
  })

  it('empty name / message is rejected with no send', async () => {
    mockKnownProposal()
    const r1 = await submitProposalInquiry('tok-1', '', 'jane@biz.com', 'hi')
    const r2 = await submitProposalInquiry('tok-1', 'Jane', 'jane@biz.com', '   ')
    expect(r1.success).toBe(false)
    expect(r2.success).toBe(false)
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
  })

  it('unknown token fails gracefully with no send', async () => {
    vi.mocked(getProposalEventByShareToken).mockResolvedValue(null)
    const res = await submitProposalInquiry('ghost', 'Jane Doe', 'jane@biz.com', 'hello there')
    expect(res.success).toBe(false)
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
  })
})
