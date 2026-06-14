// #38 — Proposal Approve & Send + open-tracking. Behavioral tests for the
// approve-and-send service (gate, contact, send, transition, cadence scheduling)
// and the idempotent first-open flip in the public loader.
// TC-AS-01..12

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Module mocks (hoisted) ------------------------------------------------

vi.mock('@/lib/resend/client', () => ({
  resend: { emails: { send: vi.fn(async () => ({ data: { id: 'em-1' }, error: null })) } },
}))
vi.mock('@/modules/proposals/repositories/proposal-events.repo', () => ({
  getProposalEventById:          vi.fn(),
  getProposalEventByShareToken:  vi.fn(),
  markProposalSent:              vi.fn(async () => ({ id: 'pe-1', proposal_status: 'sent' })),
  markProposalViewedIfUnseen:    vi.fn(async () => true),
}))
vi.mock('@/modules/proposals/repositories/proposal-follow-up-commitments.repo', () => ({
  createFollowUpCommitments: vi.fn(async (inputs: unknown[]) => inputs.map((_, i) => ({ id: `c-${i}` }))),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getContact: vi.fn(async () => ({ id: 'ct-1', email: 'merchant@biz.com', first_name: 'Pat', last_name: 'Smith' })),
}))
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  getDefaultSenderIdentity: vi.fn(async () => ({ name: '321 Swipe', email: 'sales@321swipe.com' })),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => true),
}))

import { approveAndSendProposal } from '@/modules/proposals/services/proposal-approve-send.service'
import { getPublicProposalByToken } from '@/modules/proposals/services/public-proposal.service'
import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import * as commitmentRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'
import { resend } from '@/lib/resend/client'
import { buildFollowUpCommitmentsFromRule } from '@/modules/proposals/lib/schedule-rules'

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
// Approve & Send
// ---------------------------------------------------------------------------

describe('TC-AS-01: approve & send a draft with sending enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(systemControlRepo.getBooleanControl).mockResolvedValue(true)
    vi.mocked(eventRepo.markProposalSent).mockResolvedValue({ id: 'pe-1', proposal_status: 'sent' } as never)
    vi.mocked(commitmentRepo.createFollowUpCommitments).mockImplementation(async (inputs: unknown[]) => inputs.map((_, i) => ({ id: `c-${i}` })) as never)
  })

  it('sends one email with the /p link, transitions to sent, schedules the chosen cadence (aggressive 2/4/7)', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)

    const result = await approveAndSendProposal(ctx, { proposalEventId: 'pe-1', scheduleRuleKey: 'aggressive_2_4_7' })

    expect(result).toMatchObject({ ok: true, status: 'sent', commitmentsScheduled: 3 })

    // one email to the merchant contact, containing the public link
    const send = vi.mocked(resend.emails.send)
    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0][0] as { to: string[]; subject: string; text: string }
    expect(payload.to).toEqual(['merchant@biz.com'])
    expect(payload.subject).toContain('Harbor Diner')
    expect(payload.text).toContain('/p/tok-1')

    // transition stamped sent_at
    expect(vi.mocked(eventRepo.markProposalSent)).toHaveBeenCalledTimes(1)
    const sentAt = vi.mocked(eventRepo.markProposalSent).mock.calls[0][3]

    // cadence: 3 commitments at +2/+4/+7 days from sent_at
    const created = vi.mocked(commitmentRepo.createFollowUpCommitments).mock.calls[0][0]
    expect(created).toHaveLength(3)
    const expected = buildFollowUpCommitmentsFromRule(sentAt, 'aggressive_2_4_7')
    expect(created.map(c => c.followUpDueAt)).toEqual(expected.map(e => e.followUpDueAt))
    expect(created.map(c => c.followUpSequence)).toEqual([1, 2, 3])
    expect(created.every(c => c.scheduleRuleKey === 'aggressive_2_4_7')).toBe(true)
  })
})

describe('TC-AS-02: default cadence is standard 3/5/10', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(systemControlRepo.getBooleanControl).mockResolvedValue(true)
    vi.mocked(eventRepo.markProposalSent).mockResolvedValue({ id: 'pe-1', proposal_status: 'sent' } as never)
    vi.mocked(commitmentRepo.createFollowUpCommitments).mockImplementation(async (inputs: unknown[]) => inputs.map((_, i) => ({ id: `c-${i}` })) as never)
  })

  it('omitting scheduleRuleKey schedules 3 commitments under standard_3_5_10', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)
    const result = await approveAndSendProposal(ctx, { proposalEventId: 'pe-1' })
    expect(result).toMatchObject({ ok: true, commitmentsScheduled: 3 })
    const created = vi.mocked(commitmentRepo.createFollowUpCommitments).mock.calls[0][0]
    expect(created.every(c => c.scheduleRuleKey === 'standard_3_5_10')).toBe(true)
  })
})

describe('TC-AS-03: send gate off blocks everything', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)
    vi.mocked(systemControlRepo.getBooleanControl).mockResolvedValue(false)
  })

  it('returns sending_disabled, no send, no transition, no schedule', async () => {
    const result = await approveAndSendProposal(ctx, { proposalEventId: 'pe-1' })
    expect(result).toEqual({ ok: false, error: 'sending_disabled' })
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
    expect(vi.mocked(eventRepo.markProposalSent)).not.toHaveBeenCalled()
    expect(vi.mocked(commitmentRepo.createFollowUpCommitments)).not.toHaveBeenCalled()
  })
})

describe('TC-AS-04: non-draft proposal is rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(systemControlRepo.getBooleanControl).mockResolvedValue(true)
  })

  it('a sent proposal returns not_approvable with no send', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent({ proposal_status: 'sent' }) as never)
    const result = await approveAndSendProposal(ctx, { proposalEventId: 'pe-1' })
    expect(result).toEqual({ ok: false, error: 'not_approvable' })
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
  })
})

describe('TC-AS-05: no contact email is rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(systemControlRepo.getBooleanControl).mockResolvedValue(true)
  })

  it('a proposal with no contact_id returns no_contact_email with no send', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent({ contact_id: null }) as never)
    const result = await approveAndSendProposal(ctx, { proposalEventId: 'pe-1' })
    expect(result).toEqual({ ok: false, error: 'no_contact_email' })
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
    expect(vi.mocked(eventRepo.markProposalSent)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Open-tracking
// ---------------------------------------------------------------------------

describe('TC-AS-06: open-tracking first-view flip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('first load of a sent proposal flips to viewed', async () => {
    vi.mocked(eventRepo.getProposalEventByShareToken).mockResolvedValue({
      id: 'pe-1', proposal_status: 'sent', first_viewed_at: null,
      estimated_savings: 915, proposal_amount: 10_980, created_at: 'x',
      metadata: { company_name: 'Harbor Diner', analysis: { confidence: 'calculated', assumptions: [] } },
    } as never)
    vi.mocked(eventRepo.markProposalViewedIfUnseen).mockResolvedValue(true)

    const view = await getPublicProposalByToken('tok-1')
    expect(view!.proposalStatus).toBe('viewed')
    expect(vi.mocked(eventRepo.markProposalViewedIfUnseen)).toHaveBeenCalledTimes(1)
  })

  it('second load (already viewed) is a no-op — no flip attempted', async () => {
    vi.mocked(eventRepo.getProposalEventByShareToken).mockResolvedValue({
      id: 'pe-1', proposal_status: 'viewed', first_viewed_at: '2026-06-14T00:00:00Z',
      estimated_savings: 915, proposal_amount: 10_980, created_at: 'x',
      metadata: { company_name: 'Harbor Diner', analysis: { confidence: 'calculated', assumptions: [] } },
    } as never)

    const view = await getPublicProposalByToken('tok-1')
    expect(view!.proposalStatus).toBe('viewed')
    expect(vi.mocked(eventRepo.markProposalViewedIfUnseen)).not.toHaveBeenCalled()
  })

  it('a draft proposal load does not change status', async () => {
    vi.mocked(eventRepo.getProposalEventByShareToken).mockResolvedValue({
      id: 'pe-1', proposal_status: 'draft', first_viewed_at: null,
      estimated_savings: 915, proposal_amount: 10_980, created_at: 'x',
      metadata: { company_name: 'Harbor Diner', analysis: { confidence: 'calculated', assumptions: [] } },
    } as never)

    const view = await getPublicProposalByToken('tok-1')
    expect(view!.proposalStatus).toBe('draft')
    expect(vi.mocked(eventRepo.markProposalViewedIfUnseen)).not.toHaveBeenCalled()
  })

  it('an accepted proposal load does not change status', async () => {
    vi.mocked(eventRepo.getProposalEventByShareToken).mockResolvedValue({
      id: 'pe-1', proposal_status: 'accepted', first_viewed_at: '2026-06-14T00:00:00Z',
      estimated_savings: 915, proposal_amount: 10_980, created_at: 'x',
      metadata: { company_name: 'Harbor Diner', analysis: { confidence: 'calculated', assumptions: [] } },
    } as never)

    const view = await getPublicProposalByToken('tok-1')
    expect(view!.proposalStatus).toBe('accepted')
    expect(vi.mocked(eventRepo.markProposalViewedIfUnseen)).not.toHaveBeenCalled()
  })
})
