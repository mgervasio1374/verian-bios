// #39 — Proposal follow-up open-state copy (Slice C). Behavioral tests for the
// open-state branch in the follow-up draft generator: the opening line and the
// recorded metadata change depending on whether the merchant has opened the
// hosted proposal (proposal_events.first_viewed_at / status='viewed', see #38).
// TC-OS-01..04

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Module mocks (hoisted) ------------------------------------------------

vi.mock('@/modules/proposals/repositories/proposal-follow-up-draft.repo', () => ({
  fetchCommitmentForDraftGeneration: vi.fn(),
  getActiveDraftForCommitment:       vi.fn(async () => null),
  createFollowUpEmailDraft:          vi.fn(async () => ({ id: 'draft-1' })),
  linkDraftToCommitment:             vi.fn(async () => true),
}))
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  getTemplateBySlug: vi.fn(async () => ({
    id: 'tmpl-1',
    subject_template:   'Following up on your savings analysis — {{company_name}}',
    body_html_template: '<p>Hi {{contact_first_name}},</p><p>{{proposal_state_line}}</p><p>Best,<br>{{sender_name}}</p>',
    body_text_template: 'Hi {{contact_first_name}},\n\n{{proposal_state_line}}\n\nBest,\n{{sender_name}}',
  })),
  getDefaultSenderIdentity: vi.fn(async () => ({ id: 'si-1', name: 'Casey Rivera' })),
  linkApprovalToEmailDraft: vi.fn(async () => undefined),
}))
vi.mock('@/modules/proposals/repositories/proposal-events.repo', () => ({
  getProposalEventById: vi.fn(),
}))
vi.mock('@/modules/crm/repositories/lead.repo', () => ({
  getLead: vi.fn(async () => ({ id: 'ld-1', workspace_id: 'ws-1', contact_id: 'ct-1', name: 'Harbor Diner', company_id: 'co-1' })),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getContact: vi.fn(async () => ({ id: 'ct-1', workspace_id: 'ws-1', email: 'merchant@biz.com', first_name: 'Pat', last_name: 'Smith', do_not_contact: false })),
}))
vi.mock('@/modules/messaging/repositories/suppression.repo', () => ({
  checkEmailSuppression: vi.fn(async () => ({ blocked: false })),
}))
vi.mock('@/modules/workflow/repositories/approval.repo', () => ({
  createApprovalRequest: vi.fn(async () => ({ id: 'ap-1' })),
}))
vi.mock('@/modules/intelligence/repositories/activity-event.repo', () => ({
  recordActivityEvent: vi.fn(async () => undefined),
}))

import { generateProposalFollowUpDraftForWorkspace } from '@/modules/proposals/services/proposal-follow-up-draft.service'
import * as draftRepo from '@/modules/proposals/repositories/proposal-follow-up-draft.repo'
import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'

const input = { tenantId: 'tenant-1', workspaceId: 'ws-1', commitmentId: 'cm-1', actorUserId: 'user-1' }

function commitment(over: Record<string, unknown> = {}) {
  return {
    id: 'cm-1', tenant_id: 'tenant-1', workspace_id: 'ws-1',
    commitment_status: 'open', draft_id: null, lead_id: 'ld-1',
    proposal_event_id: 'pe-1', follow_up_sequence: 1,
    follow_up_due_at: '2026-06-20T00:00:00Z', schedule_rule_key: 'standard_3_5_10',
    ...over,
  }
}

function lastDraftArgs() {
  const call = vi.mocked(draftRepo.createFollowUpEmailDraft).mock.calls.at(-1)
  return call![0] as { bodyText: string | null; bodyHtml: string | null; aiGenerationMetadata: Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(draftRepo.fetchCommitmentForDraftGeneration).mockResolvedValue(commitment() as never)
  vi.mocked(draftRepo.getActiveDraftForCommitment).mockResolvedValue(null as never)
  vi.mocked(draftRepo.createFollowUpEmailDraft).mockResolvedValue({ id: 'draft-1' } as never)
})

describe('TC-OS-01: opened proposal gets the opened opening line', () => {
  it('first_viewed_at set → "Glad you had a chance to look over" + metadata.proposal_opened true', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue({
      id: 'pe-1', proposal_status: 'viewed', first_viewed_at: '2026-06-14T10:00:00Z',
    } as never)

    const result = await generateProposalFollowUpDraftForWorkspace(input)
    expect(result.ok).toBe(true)

    const args = lastDraftArgs()
    expect(args.bodyText).toContain('Glad you had a chance to look over the savings analysis for Harbor Diner')
    expect(args.bodyText).not.toContain('reached you')
    expect(args.aiGenerationMetadata.proposal_opened).toBe(true)
    expect(args.aiGenerationMetadata.proposal_first_viewed_at).toBe('2026-06-14T10:00:00Z')
  })
})

describe('TC-OS-02: unopened proposal gets the not-yet-opened line', () => {
  it('status sent, first_viewed_at null → "I wanted to make sure...reached you" + metadata.proposal_opened false', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue({
      id: 'pe-1', proposal_status: 'sent', first_viewed_at: null,
    } as never)

    const result = await generateProposalFollowUpDraftForWorkspace(input)
    expect(result.ok).toBe(true)

    const args = lastDraftArgs()
    expect(args.bodyText).toContain('I wanted to make sure the savings analysis I put together for Harbor Diner reached you')
    expect(args.bodyText).not.toContain('Glad you had a chance')
    expect(args.aiGenerationMetadata.proposal_opened).toBe(false)
    expect(args.aiGenerationMetadata.proposal_first_viewed_at).toBeNull()
  })
})

describe('TC-OS-03: accepted proposal counts as opened', () => {
  it('status accepted, first_viewed_at set → opened line', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue({
      id: 'pe-1', proposal_status: 'accepted', first_viewed_at: '2026-06-13T00:00:00Z',
    } as never)

    await generateProposalFollowUpDraftForWorkspace(input)
    expect(lastDraftArgs().aiGenerationMetadata.proposal_opened).toBe(true)
  })
})

describe('TC-OS-04: proposal-state read failure falls back to unopened, draft still created', () => {
  it('getProposalEventById throws → unopened line, draft still generated', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockRejectedValue(new Error('db down'))

    const result = await generateProposalFollowUpDraftForWorkspace(input)
    expect(result.ok).toBe(true)

    const args = lastDraftArgs()
    expect(args.bodyText).toContain('reached you')
    expect(args.aiGenerationMetadata.proposal_opened).toBe(false)
    expect(args.aiGenerationMetadata.proposal_first_viewed_at).toBeNull()
  })
})
