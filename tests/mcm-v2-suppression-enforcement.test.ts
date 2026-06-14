// mcm-v2 — Centralized suppression + consent enforcement at every external send.
// Behavioral tests for checkSendEligibility, the two proposal send paths, and the
// review-token approve-send path.
// TC-SE-01..12

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Module mocks (hoisted) ------------------------------------------------

vi.mock('@/modules/messaging/repositories/suppression.repo', () => ({
  checkEmailSuppression: vi.fn(async () => ({ blocked: false })),
}))
vi.mock('@/lib/resend/client', () => ({
  resend: { emails: { send: vi.fn(async () => ({ data: { id: 'em-1' }, error: null })) } },
}))
vi.mock('@/modules/proposals/repositories/proposal-events.repo', () => ({
  getProposalEventById:       vi.fn(),
  getProposalEventByShareToken: vi.fn(),
  markProposalSent:           vi.fn(async () => ({ id: 'pe-1', proposal_status: 'sent' })),
  markProposalViewedIfUnseen: vi.fn(async () => true),
}))
vi.mock('@/modules/proposals/repositories/proposal-follow-up-commitments.repo', () => ({
  createFollowUpCommitments: vi.fn(async (inputs: unknown[]) => inputs.map((_, i) => ({ id: `c-${i}` }))),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getContact: vi.fn(async () => ({ id: 'ct-1', email: 'merchant@biz.com', first_name: 'Pat', last_name: 'Smith', do_not_contact: false })),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => true),
}))
// Review-token path dependencies
vi.mock('@/modules/workflow/repositories/approval.repo', () => ({
  getApprovalByReviewToken: vi.fn(async () => ({ id: 'ap-1', tenant_id: 't1', status: 'pending', payload: { draft_id: 'd1', contact_id: 'c1' } })),
  resolveApprovalRequest:   vi.fn(async () => ({})),
}))
vi.mock('@/modules/intelligence/services/recommendation-completion.service', () => ({
  completeRecommendationsForApprovedAction: vi.fn(async () => ({})),
}))
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {}
    q.select = () => q
    q.eq = () => q
    q.single = async () => ({ data: { id: 'd1', to_email: 'merchant@biz.com', to_name: null, subject: 's', body_html: null, body_text: 'b', sender_identity_id: null, tenant_id: 't1' } })
    q.insert = () => ({ select: () => ({ single: async () => ({ data: { id: 'es1' } }) }) })
    return { from: () => q, storage: { from: () => ({ download: async () => ({ data: null, error: 'none' }) }) } }
  },
}))
// email-draft.repo needs extra members for the review-token path
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  getDefaultSenderIdentity: vi.fn(async () => ({ name: '321 Swipe', email: 'sales@321swipe.com' })),
  getSenderIdentityById:    vi.fn(async () => null),
  updateEmailDraftContent:  vi.fn(async () => ({})),
  updateDraftStatus:        vi.fn(async () => ({})),
}))

import { checkSendEligibility } from '@/modules/messaging/services/send-eligibility.service'
import { approveAndSendProposal } from '@/modules/proposals/services/proposal-approve-send.service'
import { approveAndSendAction } from '@/app/approve/[token]/actions'
import * as suppressionRepo from '@/modules/messaging/repositories/suppression.repo'
import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import * as commitmentRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import { resend } from '@/lib/resend/client'

const ctx = {
  tenantId: 'tenant-1', workspaceId: 'ws-1', userId: 'user-1',
  roleSlug: 'operator', permissions: ['*'], requestId: 'req-1',
}

function draftEvent(over: Record<string, unknown> = {}) {
  return {
    id: 'pe-1', tenant_id: 'tenant-1', workspace_id: 'ws-1',
    proposal_status: 'draft', share_token: 'tok-1', contact_id: 'ct-1', lead_id: 'ld-1',
    metadata: { company_name: 'Harbor Diner' }, first_viewed_at: null,
    ...over,
  }
}

// ---------------------------------------------------------------------------
// checkSendEligibility (unit)
// ---------------------------------------------------------------------------

describe('TC-SE-01: checkSendEligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(suppressionRepo.checkEmailSuppression).mockResolvedValue({ blocked: false })
  })

  it('doNotContact:true → do_not_contact, suppression NOT consulted', async () => {
    const r = await checkSendEligibility('t1', 'a@b.com', { doNotContact: true })
    expect(r).toEqual({ allowed: false, reason: 'do_not_contact' })
    expect(vi.mocked(suppressionRepo.checkEmailSuppression)).not.toHaveBeenCalled()
  })

  it('maps each suppression reason to the eligibility vocabulary', async () => {
    const cases: Array<['email_unsubscribed' | 'email_suppressed' | 'domain_suppressed', string]> = [
      ['email_unsubscribed', 'suppressed_unsubscribed'],
      ['email_suppressed',   'suppressed_email'],
      ['domain_suppressed',  'suppressed_domain'],
    ]
    for (const [repoReason, mapped] of cases) {
      vi.mocked(suppressionRepo.checkEmailSuppression).mockResolvedValueOnce({ blocked: true, reason: repoReason })
      const r = await checkSendEligibility('t1', 'a@b.com')
      expect(r).toEqual({ allowed: false, reason: mapped })
    }
  })

  it('clean recipient → allowed:true', async () => {
    vi.mocked(suppressionRepo.checkEmailSuppression).mockResolvedValue({ blocked: false })
    expect(await checkSendEligibility('t1', 'a@b.com')).toEqual({ allowed: true })
  })
})

// ---------------------------------------------------------------------------
// approveAndSendProposal — suppression / DNC enforcement
// ---------------------------------------------------------------------------

describe('TC-SE-02: approveAndSendProposal enforces eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)
    vi.mocked(eventRepo.markProposalSent).mockResolvedValue({ id: 'pe-1', proposal_status: 'sent' } as never)
    vi.mocked(commitmentRepo.createFollowUpCommitments).mockImplementation(async (inputs: unknown[]) => inputs.map((_, i) => ({ id: `c-${i}` })) as never)
    vi.mocked(contactRepo.getContact).mockResolvedValue({ id: 'ct-1', email: 'merchant@biz.com', first_name: 'Pat', last_name: 'Smith', do_not_contact: false } as never)
    vi.mocked(suppressionRepo.checkEmailSuppression).mockResolvedValue({ blocked: false })
  })

  it('suppressed recipient → recipient_not_eligible, no send, no transition, no commitments', async () => {
    vi.mocked(suppressionRepo.checkEmailSuppression).mockResolvedValue({ blocked: true, reason: 'email_unsubscribed' })
    const result = await approveAndSendProposal(ctx, { proposalEventId: 'pe-1' })
    expect(result).toEqual({ ok: false, error: 'recipient_not_eligible' })
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
    expect(vi.mocked(eventRepo.markProposalSent)).not.toHaveBeenCalled()
    expect(vi.mocked(commitmentRepo.createFollowUpCommitments)).not.toHaveBeenCalled()
  })

  it('do_not_contact recipient → recipient_not_eligible, suppression NOT consulted, no send', async () => {
    vi.mocked(contactRepo.getContact).mockResolvedValue({ id: 'ct-1', email: 'merchant@biz.com', do_not_contact: true } as never)
    const result = await approveAndSendProposal(ctx, { proposalEventId: 'pe-1' })
    expect(result).toEqual({ ok: false, error: 'recipient_not_eligible' })
    expect(vi.mocked(suppressionRepo.checkEmailSuppression)).not.toHaveBeenCalled()
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
    expect(vi.mocked(eventRepo.markProposalSent)).not.toHaveBeenCalled()
  })

  it('clean recipient → still sends + schedules (regression)', async () => {
    const result = await approveAndSendProposal(ctx, { proposalEventId: 'pe-1', scheduleRuleKey: 'aggressive_2_4_7' })
    expect(result).toMatchObject({ ok: true, status: 'sent', commitmentsScheduled: 3 })
    expect(vi.mocked(resend.emails.send)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(eventRepo.markProposalSent)).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Review-token approve-send path
// ---------------------------------------------------------------------------

describe('TC-SE-03: review-token approve-send enforces eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(contactRepo.getContact).mockResolvedValue({ id: 'c1', email: 'merchant@biz.com', do_not_contact: false } as never)
  })

  it('suppressed recipient → no Resend call, clear error', async () => {
    vi.mocked(suppressionRepo.checkEmailSuppression).mockResolvedValue({ blocked: true, reason: 'domain_suppressed' })
    const res = await approveAndSendAction('tok', 's', 'b', '<p>b</p>')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/cannot be emailed/i)
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
  })
})
