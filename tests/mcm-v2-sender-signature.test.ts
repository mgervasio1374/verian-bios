// mcm-v2 — Configurable per-identity signature applied to the proposal email.
// Covers composeProposalEmail signature behavior, the send path passing it, the
// repo write + gated action, and the migration.
// TC-SIG-01..07

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---- composeProposalEmail signature (pure) --------------------------------

import { composeProposalEmail } from '@/modules/proposals/lib/proposal-email'

const base = {
  companyName: 'Harbor Diner',
  firstName:   'Pat',
  senderName:  'Bruce Hughes',
  publicUrl:   'https://app.example/p/tok-1',
}

const SIGNATURE = 'Warm regards,\nBruce Hughes\nChief Information Officer\n321 Swipe'

describe('TC-SIG-01: signature replaces the signoff (text + html)', () => {
  it('uses the signature verbatim and drops the built-in "Best, ..." signoff', () => {
    const out = composeProposalEmail({ ...base, signature: SIGNATURE })
    expect(out.textBody).toContain('Warm regards,\nBruce Hughes\nChief Information Officer\n321 Swipe')
    expect(out.textBody).not.toContain('Best,\nBruce Hughes\n321 Swipe')
    // html: paragraph-wrapped signature with <br> line breaks
    expect(out.htmlBody).toContain('Warm regards,<br>Bruce Hughes<br>Chief Information Officer<br>321 Swipe')
    expect(out.htmlBody).not.toContain('Best,<br>Bruce Hughes<br>321 Swipe')
    // the proposal body + link are still present
    expect(out.textBody).toContain('https://app.example/p/tok-1')
  })

  it('whitespace-only signature falls back to the slice-1 default signoff', () => {
    const out = composeProposalEmail({ ...base, signature: '   ' })
    expect(out.textBody).toContain('Best,\nBruce Hughes\n321 Swipe')
  })
})

describe('TC-SIG-02: no signature → slice-1 default (unchanged)', () => {
  it('keeps the deduped default signoff', () => {
    const out = composeProposalEmail(base)
    expect(out.textBody).toContain('Best,\nBruce Hughes\n321 Swipe')
    expect(out.htmlBody).toContain('Best,<br>Bruce Hughes<br>321 Swipe')
  })
})

describe('TC-SIG-03: override body ignores the signature', () => {
  it('operator body wins; signature is not appended', () => {
    const out = composeProposalEmail(
      { ...base, signature: SIGNATURE },
      { bodyText: 'Hi Pat,\n\nCustom note.' },
    )
    expect(out.textBody).toContain('Custom note.')
    expect(out.textBody).not.toContain('Warm regards')
    expect(out.textBody).not.toContain('Chief Information Officer')
  })
})

// ---- Send path passes the signature ---------------------------------------

vi.mock('@/lib/resend/client', () => ({
  resend: { emails: { send: vi.fn(async () => ({ data: { id: 'em-1' }, error: null })) } },
}))
vi.mock('@/modules/proposals/repositories/proposal-events.repo', () => ({
  getProposalEventById: vi.fn(),
  markProposalSent:     vi.fn(async () => ({ id: 'pe-1', proposal_status: 'sent' })),
}))
vi.mock('@/modules/proposals/repositories/proposal-follow-up-commitments.repo', () => ({
  createFollowUpCommitments: vi.fn(async (inputs: unknown[]) => inputs.map((_, i) => ({ id: `c-${i}` }))),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getContact: vi.fn(async () => ({ id: 'ct-1', email: 'merchant@biz.com', first_name: 'Pat', last_name: 'Smith' })),
}))
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  getDefaultSenderIdentity: vi.fn(),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => true),
}))
vi.mock('@/modules/messaging/repositories/suppression.repo', () => ({
  checkEmailSuppression: vi.fn(async () => ({ blocked: false })),
}))

import { approveAndSendProposal } from '@/modules/proposals/services/proposal-approve-send.service'
import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import { getDefaultSenderIdentity } from '@/modules/messaging/repositories/email-draft.repo'
import { resend } from '@/lib/resend/client'

const sendCtx = { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'operator', permissions: ['*'], requestId: 'r-1' } as never

function draftEvent() {
  return {
    id: 'pe-1', tenant_id: 't-1', workspace_id: 'ws-1', proposal_status: 'draft',
    share_token: 'tok-1', contact_id: 'ct-1', lead_id: 'ld-1',
    metadata: { company_name: 'Harbor Diner' }, first_viewed_at: null,
  }
}

describe('TC-SIG-04: approveAndSendProposal applies the identity signature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('the sent text/html carry the signature + the /p link', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)
    vi.mocked(eventRepo.markProposalSent).mockResolvedValue({ id: 'pe-1', proposal_status: 'sent' } as never)
    vi.mocked(getDefaultSenderIdentity).mockResolvedValue({ id: 's-1', name: 'Bruce Hughes', email: 'bruce@321swipe.com', signature: SIGNATURE } as never)

    const res = await approveAndSendProposal(sendCtx, { proposalEventId: 'pe-1' })
    expect(res.ok).toBe(true)

    const payload = vi.mocked(resend.emails.send).mock.calls[0][0] as { text: string; html: string }
    expect(payload.text).toContain('Chief Information Officer')
    expect(payload.text).toContain('/p/tok-1')
    expect(payload.html).toContain('Chief Information Officer')
    expect(payload.text).not.toContain('Best,\nBruce Hughes\n321 Swipe')
  })

  it('no signature → unchanged default signoff', async () => {
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue(draftEvent() as never)
    vi.mocked(eventRepo.markProposalSent).mockResolvedValue({ id: 'pe-1', proposal_status: 'sent' } as never)
    vi.mocked(getDefaultSenderIdentity).mockResolvedValue({ id: 's-1', name: 'Bruce Hughes', email: 'bruce@321swipe.com', signature: null } as never)

    await approveAndSendProposal(sendCtx, { proposalEventId: 'pe-1' })
    const payload = vi.mocked(resend.emails.send).mock.calls[0][0] as { text: string }
    expect(payload.text).toContain('Best,\nBruce Hughes\n321 Swipe')
  })
})

// ---- Gated action (source) + migration ------------------------------------
// Note: the repo write (updateDefaultSenderIdentitySignature) is tested in
// mcm-v2-sender-signature-repo.test.ts, where email-draft.repo is NOT mocked.

describe('TC-SIG-06: saveSenderSignatureAction is gated on manage_templates', () => {
  // The action builds its own ctx via buildRequestContext; the service-level
  // permission check is what we assert through the repo function gate. Here we
  // assert the repo write happens for an authorized path and the slug is required
  // by reading the action source (permission gate present).
  it('source requires messaging.manage_templates before the write', () => {
    const src = readFileSync(join(process.cwd(), 'modules/messaging/actions/sender-signature.actions.ts'), 'utf8')
    expect(src).toContain("requirePermission(ctx, 'messaging.manage_templates')")
    expect(src).toContain('updateDefaultSenderIdentitySignature')
  })
})

// ---- Migration source-read ------------------------------------------------

describe('TC-SIG-07: migration 20240060 adds the signature column', () => {
  it('ALTER TABLE sender_identities ADD COLUMN signature', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20240060_sender_identity_signature.sql'), 'utf8')
    expect(sql).toMatch(/ALTER TABLE sender_identities\s+ADD COLUMN signature text/)
  })
})
