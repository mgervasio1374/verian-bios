// mcm — MCM sends flow into the same activity/outcome event stream as Phase 3B,
// so Analytics + the Learning Agent feel every delivery/open/click. TC-OA-01..05
// (send-side: stamp + emit; helpers; learning-agent reader compatibility).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Pure helper tests ---------------------------------------------------------

import {
  buildMcmSendMetadata,
  resolveMcmAttributionFromSend,
  type McmCampaignContext,
} from '@/modules/messaging/event-tracking/event-tracking.attribution'

const MCM: McmCampaignContext = {
  campaignAssignmentId:   'a-1',
  campaignSequenceId:     'seq-1',
  campaignScheduleItemId: 'si-1',
  campaignSequenceStepId: 'step-1',
}

describe('TC-OA-01: MCM metadata stamp + resolver helpers', () => {
  it('buildMcmSendMetadata stamps source + campaign ids over existing fields', () => {
    const md = buildMcmSendMetadata(MCM, 'system', { draft_id: 'd-1' })
    expect(md).toMatchObject({
      draft_id: 'd-1',
      source: 'mcm_campaign',
      campaign_assignment_id: 'a-1',
      campaign_sequence_id: 'seq-1',
      campaign_schedule_item_id: 'si-1',
      campaign_sequence_step_id: 'step-1',
      send_initiated_by: 'system',
    })
  })
  it('resolveMcmAttributionFromSend matches source=mcm_campaign, else null', () => {
    const meta = { source: 'mcm_campaign', campaign_assignment_id: 'a-1', campaign_sequence_id: 'seq-1', campaign_schedule_item_id: 'si-1', campaign_sequence_step_id: 'step-1' }
    expect(resolveMcmAttributionFromSend({ metadata: meta })?.campaign_schedule_item_id).toBe('si-1')
    expect(resolveMcmAttributionFromSend({ metadata: { source: 'phase_3b_send_bridge' } })).toBeNull()
    expect(resolveMcmAttributionFromSend({ metadata: null })).toBeNull()
    expect(resolveMcmAttributionFromSend({ metadata: {} })).toBeNull()
  })
})

// ---- Learning-agent reader compatibility (zero reader changes) -----------------

import { calculateAllSignals } from '@/modules/messaging/learning-agent/learning-agent.signals'
import type { Phase3bEventRecord } from '@/modules/messaging/learning-agent/learning-agent.types'

describe('TC-OA-02: MCM-emitted ET events compute delivery/open/click via calculateAllSignals', () => {
  it('rates compute with NO reader change (grouped by generic entityId)', () => {
    // 12 campaign schedule items, each fully succeeded + delivered + opened + clicked.
    // Engagement threshold (open/click) is 10; standard (delivery) is 5.
    const events: Phase3bEventRecord[] = []
    for (let i = 0; i < 12; i++) {
      const entityId = `si-${i}` // campaign_schedule_item_id (MCM entityId)
      for (const eventType of ['ET_SEND_SUCCEEDED', 'ET_EMAIL_DELIVERED', 'ET_EMAIL_OPENED', 'ET_EMAIL_CLICKED']) {
        events.push({ entityId, eventType, strategyId: null, qualityReviewId: null, versionLabel: null, compositeScore: null, occurredAt: '2026-07-03T00:00:00Z' })
      }
    }
    const signals = calculateAllSignals({ events, dimensionContextMap: new Map(), approvedVersionIds: new Set() })

    const byName = (n: string) => signals.find(s => s.signalName === n && s.dimension === 'tenant_wide')
    expect(byName('delivery_rate')?.rate).toBe(1)
    expect(byName('open_rate')?.rate).toBe(1)
    expect(byName('click_rate')?.rate).toBe(1)
  })
})

// ---- sendApprovedDraft MCM integration: stamp + ET_SEND_INITIATED ---------------

const cap = vi.hoisted(() => ({ createMeta: null as Record<string, unknown> | null, events: [] as Array<Record<string, unknown>> }))

const draft = {
  id: 'd-1', status: 'approved', approval_request_id: 'ar-1', to_email: 'bob@x.com',
  contact_id: 'c-1', company_id: 'co-1', ai_generation_metadata: { generated_by: 'campaign_scheduler' },
  lead_id: 'l-1', campaign_assignment_id: 'a-1', sender_identity_id: 'si-id',
  body_html: '<p>hi</p>', body_text: 'hi', subject: 'Hello',
}

vi.mock('@/lib/auth/permissions', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/resend/client', () => ({ resend: { emails: { send: vi.fn(async () => ({ data: { id: 'resend-1' }, error: null })) } } }))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({ getBooleanControl: vi.fn(async () => true) }))
vi.mock('@/modules/messaging/repositories/email-send.repo', () => ({
  getEmailDraftForSending: vi.fn(async () => draft),
  getBlockingSendForDraft: vi.fn(async () => null),
  createEmailSend: vi.fn(async (input: { metadata: Record<string, unknown> }) => { cap.createMeta = input.metadata; return { id: 'es-1' } }),
  updateEmailSend: vi.fn(async () => undefined),
}))
vi.mock('@/modules/messaging/repositories/email-draft.repo', () => ({
  getSenderIdentityById:    vi.fn(async () => ({ id: 'si-id', name: 'Sam', email: 'sam@x.com', is_verified: true, reply_to: null })),
  getDefaultSenderIdentity: vi.fn(async () => ({ id: 'si-id', name: 'Sam', email: 'sam@x.com', is_verified: true, reply_to: null })),
  updateDraftStatus:        vi.fn(async () => true),
}))
vi.mock('@/modules/workflow/repositories/approval.repo', () => ({ getApprovalById: vi.fn(async () => ({ status: 'approved' })) }))
vi.mock('@/modules/crm/repositories/contact.repo', () => ({ getContact: vi.fn(async () => ({ email: 'bob@x.com', do_not_contact: false })) }))
vi.mock('@/modules/messaging/repositories/suppression.repo', () => ({ checkEmailSuppression: vi.fn(async () => ({ blocked: false })) }))
vi.mock('@/modules/messaging/services/rate-limit.service', () => ({ checkEmailRateLimit: vi.fn(async () => undefined) }))
vi.mock('@/modules/messaging/services/compliance-footer.service', () => ({
  buildComplianceFooter: () => ({ html: '', text: '', listUnsubscribeHeader: undefined }),
  appendFooter: (h: string | null, t: string | null) => ({ html: h ?? '', text: t ?? '' }),
}))
vi.mock('@/modules/intelligence/services/activity-event.service', () => ({ recordActivity: vi.fn(async (e: Record<string, unknown>) => { cap.events.push(e) }) }))
vi.mock('@/modules/messaging/services/campaign-assignment.service', () => ({ completeCampaignAssignment: vi.fn(async () => undefined) }))
vi.mock('@/modules/campaign-sequence/repositories/campaign-schedule-item.repo', () => ({ countPendingScheduleItemsForAssignment: vi.fn(async () => 0) }))

import { sendApprovedDraft } from '@/modules/messaging/services/email-send.service'

const ctx = { tenantId: 't-1', workspaceId: 'ws-1', userId: 'system', roleSlug: 'system' } as never

beforeEach(() => { vi.clearAllMocks(); cap.createMeta = null; cap.events = [] })

describe('TC-OA-03: MCM send stamps metadata + emits campaign-attributed ET_SEND_INITIATED', () => {
  it('email_sends.metadata carries source=mcm_campaign + campaign ids', async () => {
    const res = await sendApprovedDraft(ctx, 'd-1', MCM)
    expect(res.ok).toBe(true)
    expect(cap.createMeta).toMatchObject({
      source: 'mcm_campaign',
      campaign_assignment_id: 'a-1',
      campaign_sequence_id: 'seq-1',
      campaign_schedule_item_id: 'si-1',
      campaign_sequence_step_id: 'step-1',
    })
  })
  it('records ET_SEND_INITIATED on the campaign schedule item with campaign metadata', async () => {
    await sendApprovedDraft(ctx, 'd-1', MCM)
    const initiated = cap.events.find(e => e.eventType === 'ET_SEND_INITIATED')
    expect(initiated).toBeTruthy()
    expect(initiated!.entityType).toBe('campaign_schedule_item')
    expect(initiated!.entityId).toBe('si-1')
    expect(initiated!.contactId).toBe('c-1')
    expect((initiated!.metadata as Record<string, unknown>).send_path).toBe('mcm_campaign')
    expect((initiated!.metadata as Record<string, unknown>).campaign_assignment_id).toBe('a-1')
  })
})

describe('TC-OA-04: a manual send (no MCM context) is unchanged — email_draft entity, no campaign marker', () => {
  it('stamps no mcm_campaign source and emits on the email_draft entity', async () => {
    const res = await sendApprovedDraft(ctx, 'd-1') // no mcmContext
    expect(res.ok).toBe(true)
    expect(cap.createMeta?.source).toBeUndefined()
    const initiated = cap.events.find(e => e.eventType === 'ET_SEND_INITIATED')
    expect(initiated!.entityType).toBe('email_draft')
    expect((initiated!.metadata as Record<string, unknown>).send_path).toBe('phase_3a_template')
  })
})
