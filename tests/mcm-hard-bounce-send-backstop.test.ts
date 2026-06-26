// mcm — After a hard bounce suppresses an address, sendApprovedDraft must block
// the send at the suppression check and never call Resend. TC-HBS-01

import { describe, it, expect, vi, beforeEach } from 'vitest'

const cap = vi.hoisted(() => ({ sendCalls: 0 }))

vi.mock('@/lib/auth/permissions', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/resend/client', () => ({
  resend: { emails: { send: vi.fn(async () => { cap.sendCalls++; return { data: { id: 'x' }, error: null } }) } },
}))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => true), // EMAIL_SENDING_ENABLED on
}))
vi.mock('@/modules/messaging/repositories/email-send.repo', () => ({
  getEmailDraftForSending: vi.fn(async () => ({
    id: 'd-1', status: 'approved', approval_request_id: 'ar-1',
    to_email: 'tricoac@gmail.com', contact_id: 'c-1', company_id: 'co-1',
    ai_generation_metadata: {}, lead_id: 'l-1',
  })),
  getBlockingSendForDraft: vi.fn(async () => null),
  createEmailSend: vi.fn(async () => ({ id: 'es-1' })),
  updateEmailSend: vi.fn(async () => undefined),
}))
vi.mock('@/modules/workflow/repositories/approval.repo', () => ({
  getApprovalById: vi.fn(async () => ({ status: 'approved' })),
}))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({
  getContact: vi.fn(async () => ({ email: 'tricoac@gmail.com', do_not_contact: false })),
}))
// The suppression rule written by hard-bounce termination -> blocked at send time.
vi.mock('@/modules/messaging/repositories/suppression.repo', () => ({
  checkEmailSuppression: vi.fn(async () => ({ blocked: true, reason: 'email_suppressed' })),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({
  recordActivity: vi.fn(async () => undefined),
}))

import { sendApprovedDraft } from '@/modules/messaging/services/email-send.service'
import { resend } from '@/lib/resend/client'
import { checkEmailSuppression } from '@/modules/messaging/repositories/suppression.repo'

const ctx = { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'tenant_admin' } as never

beforeEach(() => {
  vi.clearAllMocks()
  cap.sendCalls = 0
})

describe('TC-HBS-01: suppressed (bounced) address blocks the send', () => {
  it('returns the suppression-blocked outcome and never calls Resend', async () => {
    const res = await sendApprovedDraft(ctx, 'd-1')
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toMatch(/suppression_blocked/)
    expect(vi.mocked(checkEmailSuppression)).toHaveBeenCalledWith('t-1', 'tricoac@gmail.com')
    expect(cap.sendCalls).toBe(0)
    expect(vi.mocked(resend.emails.send)).not.toHaveBeenCalled()
  })
})
