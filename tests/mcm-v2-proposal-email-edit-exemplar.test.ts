// mcm-v2 — Editable proposal email + 'proposal_send' exemplar. Covers the
// composeProposalEmail override (subject/body with guaranteed /p link, no-override
// regression), the send path honoring metadata.proposal_email_override, the
// override service (save/clear, gated, draft-only), and the new exemplar slug.
// TC-PEE-01..09

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- composeProposalEmail (pure, no mocks) ---------------------------------

import { composeProposalEmail } from '@/modules/proposals/lib/proposal-email'

const composeParams = {
  companyName: 'Harbor Diner',
  firstName:   'Pat',
  senderName:  'Bruce Hughes',
  publicUrl:   'https://app.example/p/tok-1',
}

describe('TC-PEE-01: composeProposalEmail override', () => {
  it('uses the override subject', () => {
    const out = composeProposalEmail(composeParams, { subject: 'Custom subject', bodyText: null })
    expect(out.subject).toBe('Custom subject')
  })

  it('uses the override body and guarantees the /p link in BOTH text and html (append-if-absent)', () => {
    const out = composeProposalEmail(composeParams, { bodyText: 'Hi Pat,\n\nHere is your custom proposal.' })
    expect(out.textBody).toContain('Here is your custom proposal.')
    expect(out.textBody).toContain('https://app.example/p/tok-1')      // appended
    expect(out.htmlBody).toContain('Here is your custom proposal.')
    expect(out.htmlBody).toContain('href="https://app.example/p/tok-1"') // button appended
    expect(out.htmlBody).toContain('View your savings proposal')
  })

  it('linkifies the URL in place when the override body already contains it (no duplicate)', () => {
    const body = 'Hi Pat,\n\nSee it here: https://app.example/p/tok-1\n\nThanks.'
    const out = composeProposalEmail(composeParams, { bodyText: body })
    // text keeps the body as-is (no second URL appended)
    expect(out.textBody).toBe(body)
    expect((out.textBody.match(/tok-1/g) ?? []).length).toBe(1)
    // html linkifies that occurrence as the button; URL appears once (in the href)
    expect((out.htmlBody.match(/tok-1/g) ?? []).length).toBe(1)
    expect(out.htmlBody).toContain('View your savings proposal')
  })

  it('no override → byte-identical to the default composition (regression)', () => {
    const withUndef = composeProposalEmail(composeParams)
    const withEmpty = composeProposalEmail(composeParams, { subject: null, bodyText: null })
    const baseline = composeProposalEmail(composeParams)
    expect(withUndef).toEqual(baseline)
    expect(withEmpty).toEqual(baseline)
    expect(baseline.textBody).toContain('We put together a savings analysis')
  })
})

// ---- Send path honoring the override ---------------------------------------

vi.mock('@/lib/resend/client', () => ({
  resend: { emails: { send: vi.fn(async () => ({ data: { id: 'em-1' }, error: null })) } },
}))
vi.mock('@/modules/proposals/repositories/proposal-events.repo', () => ({
  getProposalEventById:       vi.fn(),
  markProposalSent:           vi.fn(async () => ({ id: 'pe-1', proposal_status: 'sent' })),
  setProposalEmailOverride:   vi.fn(async () => ({ id: 'pe-1' })),
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
vi.mock('@/modules/messaging/repositories/suppression.repo', () => ({
  checkEmailSuppression: vi.fn(async () => ({ blocked: false })),
}))
vi.mock('@/modules/messaging/services/copy-exemplar.service', async (orig) => {
  // keep EXEMPLAR_SKILL_SLUGS real; the override-service tests don't need it mocked
  return await orig()
})

import { approveAndSendProposal } from '@/modules/proposals/services/proposal-approve-send.service'
import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import { resend } from '@/lib/resend/client'

const sendCtx = { tenantId: 'tenant-1', workspaceId: 'ws-1', userId: 'user-1', roleSlug: 'operator', permissions: ['*'], requestId: 'r-1' } as never

function draftEvent(over: Record<string, unknown> = {}) {
  return {
    id: 'pe-1', tenant_id: 'tenant-1', workspace_id: 'ws-1',
    proposal_status: 'draft', share_token: 'tok-1', contact_id: 'ct-1', lead_id: 'ld-1',
    metadata: { company_name: 'Harbor Diner' }, first_viewed_at: null, ...over,
  }
}

describe('TC-PEE-02: approveAndSendProposal honors the metadata override', () => {
  beforeEach(() => vi.clearAllMocks())

  it('the sent subject + text reflect the override AND still contain the /p link', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent({
      metadata: {
        company_name: 'Harbor Diner',
        proposal_email_override: { subject: 'A custom proposal for Harbor', bodyText: 'Hi Pat, your tailored proposal is ready.' },
      },
    }) as never)
    vi.mocked(eventRepo.markProposalSent).mockResolvedValue({ id: 'pe-1', proposal_status: 'sent' } as never)

    const res = await approveAndSendProposal(sendCtx, { proposalEventId: 'pe-1' })
    expect(res.ok).toBe(true)

    const payload = vi.mocked(resend.emails.send).mock.calls[0][0] as { subject: string; text: string }
    expect(payload.subject).toBe('A custom proposal for Harbor')
    expect(payload.text).toContain('your tailored proposal is ready')
    expect(payload.text).toContain('/p/tok-1') // guaranteed link
  })

  it('no override → default email (unchanged)', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)
    vi.mocked(eventRepo.markProposalSent).mockResolvedValue({ id: 'pe-1', proposal_status: 'sent' } as never)

    await approveAndSendProposal(sendCtx, { proposalEventId: 'pe-1' })
    const payload = vi.mocked(resend.emails.send).mock.calls[0][0] as { subject: string; text: string }
    expect(payload.subject).toContain('Harbor Diner')
    expect(payload.text).toContain('We put together a savings analysis')
    expect(payload.text).toContain('/p/tok-1')
  })
})

// ---- Override service: save / clear / gate / draft-only ---------------------

import {
  saveProposalEmailOverride,
  clearProposalEmailOverride,
} from '@/modules/proposals/services/proposal-email-override.service'

const adminCtx  = { tenantId: 'tenant-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'workspace_admin', permissions: ['messaging.send_emails'], requestId: 'r-1' } as never
const memberCtx = { tenantId: 'tenant-1', workspaceId: 'ws-1', userId: 'u-2', roleSlug: 'member', permissions: ['crm.leads.view'], requestId: 'r-2' } as never

describe('TC-PEE-03: setProposalEmailOverride service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('save persists a normalized override on a draft', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)
    await saveProposalEmailOverride(adminCtx, 'pe-1', { subject: '  Hi  ', bodyText: '  Body  ' })
    const call = vi.mocked(eventRepo.setProposalEmailOverride).mock.calls[0]
    expect(call[3]).toEqual({ subject: 'Hi', bodyText: 'Body' })
  })

  it('clear removes the override', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)
    await clearProposalEmailOverride(adminCtx, 'pe-1')
    expect(vi.mocked(eventRepo.setProposalEmailOverride).mock.calls[0][3]).toBeNull()
  })

  it('unauthorized (no messaging.send_emails) → throws, no write', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)
    await expect(saveProposalEmailOverride(memberCtx, 'pe-1', { subject: 'x' })).rejects.toThrow()
    expect(vi.mocked(eventRepo.setProposalEmailOverride)).not.toHaveBeenCalled()
  })

  it('not draft → not_editable, no write', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent({ proposal_status: 'sent' }) as never)
    await expect(saveProposalEmailOverride(adminCtx, 'pe-1', { subject: 'x' })).rejects.toThrow('not_editable')
    expect(vi.mocked(eventRepo.setProposalEmailOverride)).not.toHaveBeenCalled()
  })
})

// ---- Exemplar: 'proposal_send' is an accepted slug -------------------------

describe('TC-PEE-04: proposal_send is an accepted exemplar slug', () => {
  it('EXEMPLAR_SKILL_SLUGS includes proposal_send', async () => {
    const { EXEMPLAR_SKILL_SLUGS } = await import('@/modules/messaging/services/copy-exemplar.service')
    expect(EXEMPLAR_SKILL_SLUGS).toContain('proposal_send')
  })
})
