// mcm-v2 — CAN-SPAM unsubscribe endpoint + compliance footer at every external send.
// Behavioral tests for the signed token, the footer service, footer injection into
// the proposal send path, and the public /unsubscribe route.
// TC-CS-01..14

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---- Module mocks (hoisted) ------------------------------------------------

vi.mock('@/lib/resend/client', () => ({
  resend: { emails: { send: vi.fn(async () => ({ data: { id: 'em-1' }, error: null })) } },
}))
vi.mock('@/modules/messaging/repositories/suppression.repo', () => ({
  checkEmailSuppression: vi.fn(async () => ({ blocked: false })),
  addUnsubscribe:        vi.fn(async () => {}),
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
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  getDefaultSenderIdentity: vi.fn(async () => ({ name: '321 Swipe', email: 'sales@321swipe.com' })),
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => true),
}))

import { NextRequest } from 'next/server'
import { signUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/unsubscribe-token'
import { buildComplianceFooter, appendFooter } from '@/modules/messaging/services/compliance-footer.service'
import { approveAndSendProposal } from '@/modules/proposals/services/proposal-approve-send.service'
import { GET, POST } from '@/app/unsubscribe/route'
import * as eventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import * as commitmentRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import * as suppressionRepo from '@/modules/messaging/repositories/suppression.repo'
import { resend } from '@/lib/resend/client'

const SECRET = 'test-unsub-secret'
const ctx = {
  tenantId: 'tenant-1', workspaceId: 'ws-1', userId: 'user-1',
  roleSlug: 'operator', permissions: ['*'], requestId: 'req-1',
}

let savedSecret: string | undefined
beforeEach(() => {
  savedSecret = process.env.UNSUBSCRIBE_TOKEN_SECRET
})
afterEach(() => {
  if (savedSecret === undefined) delete process.env.UNSUBSCRIBE_TOKEN_SECRET
  else process.env.UNSUBSCRIBE_TOKEN_SECRET = savedSecret
})

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

describe('TC-CS-01: unsubscribe token', () => {
  it('sign → verify roundtrip yields the same tenant + lowercased email', () => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET
    const token = signUnsubscribeToken('tenant-1', 'Person@Biz.COM')
    expect(token).toBeTruthy()
    expect(verifyUnsubscribeToken(token)).toEqual({ tenantId: 'tenant-1', email: 'person@biz.com' })
  })

  it('tampered payload or signature → null', () => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET
    const token = signUnsubscribeToken('tenant-1', 'a@b.com')
    const [payload, sig] = token.split('.')
    expect(verifyUnsubscribeToken(`${payload}x.${sig}`)).toBeNull()       // payload tampered
    expect(verifyUnsubscribeToken(`${payload}.${sig}x`)).toBeNull()       // signature tampered
    expect(verifyUnsubscribeToken('garbage')).toBeNull()
  })

  it('with the secret unset → sign returns "" and verify returns null', () => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET
    expect(signUnsubscribeToken('tenant-1', 'a@b.com')).toBe('')
    expect(verifyUnsubscribeToken('anything.here')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

describe('TC-CS-02: compliance footer', () => {
  it('with secret set → footer carries the /unsubscribe?token= URL, address, and List-Unsubscribe header', () => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET
    const f = buildComplianceFooter('tenant-1', 'merchant@biz.com')
    expect(f.html).toContain('/unsubscribe?token=')
    expect(f.text).toContain('/unsubscribe?token=')
    expect(f.html).toContain('321 Swipe')          // physical address (fallback)
    expect(f.listUnsubscribeHeader).toMatch(/^<.*\/unsubscribe\?token=.*>$/)
    expect(f.listUnsubscribePostHeader).toBe('List-Unsubscribe=One-Click')
  })

  it('with secret unset → footer falls back to a mailto opt-out', () => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET
    const f = buildComplianceFooter('tenant-1', 'merchant@biz.com')
    expect(f.html).toContain('mailto:')
    expect(f.text.toLowerCase()).toContain('unsubscribe')
    expect(f.listUnsubscribeHeader).toMatch(/^<mailto:/)
    expect(f.listUnsubscribePostHeader).toBeUndefined()
  })

  it('appendFooter is idempotent — no second link when html already has an unsubscribe href', () => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET
    const f = buildComplianceFooter('tenant-1', 'merchant@biz.com')
    const html = '<p>Hi</p><a href="https://x/unsubscribe?token=existing">Unsubscribe</a>'
    const out = appendFooter(html, 'Hi', f)
    // exactly one unsubscribe href in the html
    const count = (out.html.match(/href\s*=\s*["'][^"']*unsubscribe/gi) ?? []).length
    expect(count).toBe(1)
  })

  it('appendFooter injects into html lacking an unsubscribe link', () => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET
    const f = buildComplianceFooter('tenant-1', 'merchant@biz.com')
    const out = appendFooter('<p>Hello</p>', 'Hello', f)
    expect(out.html).toContain('/unsubscribe?token=')
    expect(out.text).toContain('/unsubscribe?token=')
  })
})

// ---------------------------------------------------------------------------
// Footer injection into the proposal send path
// ---------------------------------------------------------------------------

describe('TC-CS-03: proposal approve-send carries the footer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET
    vi.mocked(eventRepo.getProposalEventById).mockResolvedValue({
      id: 'pe-1', tenant_id: 'tenant-1', workspace_id: 'ws-1',
      proposal_status: 'draft', share_token: 'tok-1', contact_id: 'ct-1', lead_id: 'ld-1',
      metadata: { company_name: 'Harbor Diner' }, first_viewed_at: null,
    } as never)
    vi.mocked(eventRepo.markProposalSent).mockResolvedValue({ id: 'pe-1', proposal_status: 'sent' } as never)
    vi.mocked(commitmentRepo.createFollowUpCommitments).mockImplementation(async (inputs: unknown[]) => inputs.map((_, i) => ({ id: `c-${i}` })) as never)
    vi.mocked(suppressionRepo.checkEmailSuppression).mockResolvedValue({ blocked: false })
  })

  it('the sent email html+text contain an unsubscribe opt-out and the address; still sends + schedules', async () => {
    const result = await approveAndSendProposal(ctx, { proposalEventId: 'pe-1' })
    expect(result).toMatchObject({ ok: true, status: 'sent', commitmentsScheduled: 3 })

    const payload = vi.mocked(resend.emails.send).mock.calls[0][0] as { html: string; text: string; headers?: Record<string, string> }
    expect(payload.html).toContain('/unsubscribe?token=')
    expect(payload.text).toContain('/unsubscribe?token=')
    expect(payload.html).toContain('321 Swipe')
    expect(payload.headers?.['List-Unsubscribe']).toMatch(/\/unsubscribe\?token=/)
    expect(payload.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })
})

// ---------------------------------------------------------------------------
// /unsubscribe endpoint
// ---------------------------------------------------------------------------

describe('TC-CS-04: /unsubscribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET
  })

  it('GET with a valid token → 200 confirm page, NO write (prefetch-safe), shows POST form + email', async () => {
    const token = signUnsubscribeToken('tenant-9', 'Buyer@Shop.com')
    const res = await GET(new NextRequest(`https://app.test/unsubscribe?token=${encodeURIComponent(token)}`))
    expect(res.status).toBe(200)
    // GET must never write — a prefetch/scanner must not unsubscribe anyone.
    expect(vi.mocked(suppressionRepo.addUnsubscribe)).not.toHaveBeenCalled()
    const html = await res.text()
    expect(html).toMatch(/method="POST"/i)
    expect(html).toContain('buyer@shop.com')
  })

  it('GET with an invalid token → 400, addUnsubscribe NOT called', async () => {
    const res = await GET(new NextRequest('https://app.test/unsubscribe?token=bogus'))
    expect(res.status).toBe(400)
    expect(vi.mocked(suppressionRepo.addUnsubscribe)).not.toHaveBeenCalled()
  })

  it('POST (confirm / one-click) with a valid token → write once + 200', async () => {
    const token = signUnsubscribeToken('tenant-9', 'Buyer@Shop.com')
    const res = await POST(new NextRequest(`https://app.test/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(vi.mocked(suppressionRepo.addUnsubscribe)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(suppressionRepo.addUnsubscribe)).toHaveBeenCalledWith('tenant-9', 'buyer@shop.com', 'unsubscribe_link')
  })

  it('POST with an invalid token → 400, no write', async () => {
    const res = await POST(new NextRequest('https://app.test/unsubscribe?token=bogus', { method: 'POST' }))
    expect(res.status).toBe(400)
    expect(vi.mocked(suppressionRepo.addUnsubscribe)).not.toHaveBeenCalled()
  })
})
