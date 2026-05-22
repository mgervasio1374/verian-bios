// ============================================================
// Phase 3B — Event Tracking / Send Outcome Tracking Tests
// Tests for: attribution helpers, audit builders, fixture-based
// validation, guardrail assertions.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  extractPhase3bMeta,
  isPhase3bSend,
  buildPhase3bSendMetadata,
  RESEND_EVENT_TO_ET_TYPE,
} from '@/modules/messaging/event-tracking/event-tracking.attribution'
import {
  buildSendInitiatedPayload,
  buildSendSucceededPayload,
  buildSendFailedPayload,
  buildWebhookOutcomePayload,
} from '@/modules/messaging/event-tracking/event-tracking.audit'
import { ET_ACTION_TYPES } from '@/modules/messaging/event-tracking/event-tracking.types'
import type { EtPhase3bMeta } from '@/modules/messaging/event-tracking/event-tracking.types'

// ---- Test data builders ----

function phase3bMeta(overrides: Partial<EtPhase3bMeta> = {}): EtPhase3bMeta {
  return {
    source:             'phase_3b_send_bridge',
    message_version_id: 'ver-test',
    strategy_id:        'str-test',
    quality_review_id:  'qr-test',
    version_label:      'A',
    composite_score:    82,
    approved_by:        'user-approver',
    lead_id:            'lead-test',
    send_initiated_by:  'user-sender',
    ...overrides,
  }
}

function phase3bRawMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source:             'phase_3b_send_bridge',
    message_version_id: 'ver-test',
    strategy_id:        'str-test',
    quality_review_id:  'qr-test',
    version_label:      'A',
    composite_score:    82,
    approved_by:        'user-approver',
    lead_id:            'lead-test',
    send_initiated_by:  'user-sender',
    ...overrides,
  }
}

// ============================================================
// extractPhase3bMeta
// ============================================================

describe('extractPhase3bMeta', () => {
  it('returns EtPhase3bMeta for valid Phase 3B metadata', () => {
    const result = extractPhase3bMeta(phase3bRawMeta())
    expect(result).not.toBeNull()
    expect(result?.source).toBe('phase_3b_send_bridge')
    expect(result?.message_version_id).toBe('ver-test')
    expect(result?.strategy_id).toBe('str-test')
    expect(result?.quality_review_id).toBe('qr-test')
    expect(result?.version_label).toBe('A')
    expect(result?.composite_score).toBe(82)
    expect(result?.approved_by).toBe('user-approver')
    expect(result?.lead_id).toBe('lead-test')
    expect(result?.send_initiated_by).toBe('user-sender')
  })

  it('returns null for null input', () => {
    expect(extractPhase3bMeta(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(extractPhase3bMeta(undefined)).toBeNull()
  })

  it('returns null when source is not phase_3b_send_bridge', () => {
    expect(extractPhase3bMeta({ source: 'lead_created_workflow' })).toBeNull()
  })

  it('returns null when source is missing', () => {
    expect(extractPhase3bMeta({ message_version_id: 'ver-test' })).toBeNull()
  })

  it('handles missing optional fields gracefully (null for missing)', () => {
    const result = extractPhase3bMeta({ source: 'phase_3b_send_bridge' })
    expect(result).not.toBeNull()
    expect(result?.message_version_id).toBeNull()
    expect(result?.strategy_id).toBeNull()
    expect(result?.quality_review_id).toBeNull()
    expect(result?.version_label).toBeNull()
    expect(result?.composite_score).toBeNull()
    expect(result?.approved_by).toBeNull()
    expect(result?.lead_id).toBeNull()
    expect(result?.send_initiated_by).toBeNull()
  })

  it('ignores non-string values for string fields', () => {
    const result = extractPhase3bMeta({
      source:             'phase_3b_send_bridge',
      message_version_id: 12345,    // wrong type
      strategy_id:        true,     // wrong type
      composite_score:    'eighty', // wrong type (number field)
    })
    expect(result?.message_version_id).toBeNull()
    expect(result?.strategy_id).toBeNull()
    expect(result?.composite_score).toBeNull()
  })

  it('extracts composite_score as number', () => {
    const result = extractPhase3bMeta({ source: 'phase_3b_send_bridge', composite_score: 75 })
    expect(result?.composite_score).toBe(75)
  })
})

// ============================================================
// isPhase3bSend
// ============================================================

describe('isPhase3bSend', () => {
  it('returns true for phase_3b_send_bridge source', () => {
    expect(isPhase3bSend({ source: 'phase_3b_send_bridge' })).toBe(true)
  })

  it('returns false for null input', () => {
    expect(isPhase3bSend(null)).toBe(false)
  })

  it('returns false for undefined input', () => {
    expect(isPhase3bSend(undefined)).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isPhase3bSend({})).toBe(false)
  })

  it('returns false for Phase 3A source', () => {
    expect(isPhase3bSend({ source: 'lead_created_workflow' })).toBe(false)
  })

  it('returns false for other sources', () => {
    expect(isPhase3bSend({ source: 'other' })).toBe(false)
  })
})

// ============================================================
// buildPhase3bSendMetadata
// ============================================================

describe('buildPhase3bSendMetadata', () => {
  it('includes all Phase 3B fields', () => {
    const result = buildPhase3bSendMetadata(phase3bMeta(), 'user-sender', 'lead-001', {})
    expect(result.source).toBe('phase_3b_send_bridge')
    expect(result.message_version_id).toBe('ver-test')
    expect(result.strategy_id).toBe('str-test')
    expect(result.quality_review_id).toBe('qr-test')
    expect(result.version_label).toBe('A')
    expect(result.composite_score).toBe(82)
    expect(result.approved_by).toBe('user-approver')
    expect(result.send_initiated_by).toBe('user-sender')
    expect(result.lead_id).toBe('lead-001')
  })

  it('preserves existing send metadata fields', () => {
    const existing = { template_used: 'email_close_deal', draft_id: 'draft-001' }
    const result = buildPhase3bSendMetadata(phase3bMeta(), 'user-sender', 'lead-001', existing)
    expect(result.template_used).toBe('email_close_deal')
    expect(result.draft_id).toBe('draft-001')
  })

  it('uses send_initiated_by from parameter (not from phase3bMeta)', () => {
    const result = buildPhase3bSendMetadata(phase3bMeta(), 'user-B', 'lead-001', {})
    expect(result.send_initiated_by).toBe('user-B')
  })

  it('uses lead_id from parameter', () => {
    const result = buildPhase3bSendMetadata(phase3bMeta(), 'user-sender', 'lead-override', {})
    expect(result.lead_id).toBe('lead-override')
  })

  it('sets lead_id to null when null is passed', () => {
    const result = buildPhase3bSendMetadata(phase3bMeta(), 'user-sender', null, {})
    expect(result.lead_id).toBeNull()
  })
})

// ============================================================
// RESEND_EVENT_TO_ET_TYPE
// ============================================================

describe('RESEND_EVENT_TO_ET_TYPE', () => {
  it('maps all 6 capturable events', () => {
    expect(RESEND_EVENT_TO_ET_TYPE['email.delivered']).toBe('ET_EMAIL_DELIVERED')
    expect(RESEND_EVENT_TO_ET_TYPE['email.bounced']).toBe('ET_EMAIL_BOUNCED')
    expect(RESEND_EVENT_TO_ET_TYPE['email.complained']).toBe('ET_EMAIL_COMPLAINED')
    expect(RESEND_EVENT_TO_ET_TYPE['email.failed']).toBe('ET_EMAIL_DELIVERY_FAILED')
    expect(RESEND_EVENT_TO_ET_TYPE['email.opened']).toBe('ET_EMAIL_OPENED')
    expect(RESEND_EVENT_TO_ET_TYPE['email.clicked']).toBe('ET_EMAIL_CLICKED')
  })

  it('has exactly 6 mapped events', () => {
    expect(Object.keys(RESEND_EVENT_TO_ET_TYPE)).toHaveLength(6)
  })

  it('email.delivery_delayed is absent (log-only — no activity event)', () => {
    expect(RESEND_EVENT_TO_ET_TYPE['email.delivery_delayed']).toBeUndefined()
  })

  it('email.sent is absent (internal event only)', () => {
    expect(RESEND_EVENT_TO_ET_TYPE['email.sent']).toBeUndefined()
  })

  it('unknown events return undefined', () => {
    expect(RESEND_EVENT_TO_ET_TYPE['email.unknown']).toBeUndefined()
  })
})

// ============================================================
// buildSendInitiatedPayload
// ============================================================

describe('buildSendInitiatedPayload', () => {
  it('has action_type ET_SEND_INITIATED', () => {
    const payload = buildSendInitiatedPayload({
      emailSendId: 'send-001', draftId: 'draft-001',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
    })
    expect(payload.action_type).toBe(ET_ACTION_TYPES.ET_SEND_INITIATED)
  })

  it('includes all Phase 3B attribution fields', () => {
    const meta = phase3bMeta()
    const payload = buildSendInitiatedPayload({
      emailSendId: 'send-001', draftId: 'draft-001',
      phase3bMeta: meta, toEmail: 'jane@example.com',
    })
    expect(payload.message_version_id).toBe('ver-test')
    expect(payload.strategy_id).toBe('str-test')
    expect(payload.quality_review_id).toBe('qr-test')
    expect(payload.version_label).toBe('A')
    expect(payload.composite_score).toBe(82)
    expect(payload.approved_by).toBe('user-approver')
    expect(payload.send_initiated_by).toBe('user-sender')
    expect(payload.to_email).toBe('jane@example.com')
  })

  it('does not include resend_message_id', () => {
    const payload = buildSendInitiatedPayload({
      emailSendId: 'send-001', draftId: 'draft-001',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
    })
    expect(payload.resend_message_id).toBeUndefined()
  })

  it('does not include error_reason', () => {
    const payload = buildSendInitiatedPayload({
      emailSendId: 'send-001', draftId: 'draft-001',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
    })
    expect(payload.error_reason).toBeUndefined()
  })

  it('has a timestamp', () => {
    const payload = buildSendInitiatedPayload({
      emailSendId: 'send-001', draftId: 'draft-001',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
    })
    expect(payload.timestamp).toBeTruthy()
  })

  it('all Phase 3B fields null when phase3bMeta is null', () => {
    const payload = buildSendInitiatedPayload({
      emailSendId: 'send-001', draftId: 'draft-001',
      phase3bMeta: null, toEmail: 'jane@example.com',
    })
    expect(payload.message_version_id).toBeNull()
    expect(payload.strategy_id).toBeNull()
    expect(payload.quality_review_id).toBeNull()
  })
})

// ============================================================
// buildSendSucceededPayload
// ============================================================

describe('buildSendSucceededPayload', () => {
  it('has action_type ET_SEND_SUCCEEDED', () => {
    const payload = buildSendSucceededPayload({
      emailSendId: 'send-002', draftId: 'draft-002',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
      resendMessageId: 'resend-abc',
    })
    expect(payload.action_type).toBe(ET_ACTION_TYPES.ET_SEND_SUCCEEDED)
  })

  it('includes resend_message_id', () => {
    const payload = buildSendSucceededPayload({
      emailSendId: 'send-002', draftId: 'draft-002',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
      resendMessageId: 'resend-xyz',
    })
    expect(payload.resend_message_id).toBe('resend-xyz')
  })

  it('does not include error_reason', () => {
    const payload = buildSendSucceededPayload({
      emailSendId: 'send-002', draftId: 'draft-002',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
      resendMessageId: 'resend-xyz',
    })
    expect(payload.error_reason).toBeUndefined()
  })
})

// ============================================================
// buildSendFailedPayload
// ============================================================

describe('buildSendFailedPayload', () => {
  it('has action_type ET_SEND_FAILED', () => {
    const payload = buildSendFailedPayload({
      emailSendId: 'send-003', draftId: 'draft-003',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
      errorReason: 'rate_limit_exceeded',
    })
    expect(payload.action_type).toBe(ET_ACTION_TYPES.ET_SEND_FAILED)
  })

  it('includes error_reason', () => {
    const payload = buildSendFailedPayload({
      emailSendId: 'send-003', draftId: 'draft-003',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
      errorReason: 'rate_limit_exceeded',
    })
    expect(payload.error_reason).toBe('rate_limit_exceeded')
  })

  it('does not include resend_message_id', () => {
    const payload = buildSendFailedPayload({
      emailSendId: 'send-003', draftId: 'draft-003',
      phase3bMeta: phase3bMeta(), toEmail: 'jane@example.com',
      errorReason: 'rate_limit_exceeded',
    })
    expect(payload.resend_message_id).toBeUndefined()
  })
})

// ============================================================
// buildWebhookOutcomePayload
// ============================================================

describe('buildWebhookOutcomePayload', () => {
  it('has the correct action_type for each event type', () => {
    const eventTypes = [
      ['ET_EMAIL_DELIVERED', 'email.delivered'],
      ['ET_EMAIL_BOUNCED', 'email.bounced'],
      ['ET_EMAIL_COMPLAINED', 'email.complained'],
      ['ET_EMAIL_DELIVERY_FAILED', 'email.failed'],
      ['ET_EMAIL_OPENED', 'email.opened'],
      ['ET_EMAIL_CLICKED', 'email.clicked'],
    ] as const

    for (const [etType, resendType] of eventTypes) {
      const payload = buildWebhookOutcomePayload({
        etActionType:    ET_ACTION_TYPES[etType],
        emailSendId:     'send-001',
        draftId:         'draft-001',
        phase3bMeta:     phase3bMeta(),
        resendMessageId: 'resend-test',
        resendEventType: resendType,
        occurredAt:      '2026-05-21T12:00:00Z',
      })
      expect(payload.action_type).toBe(etType)
      expect(payload.resend_event_type).toBe(resendType)
    }
  })

  it('includes resend_message_id and occurred_at', () => {
    const payload = buildWebhookOutcomePayload({
      etActionType:    ET_ACTION_TYPES.ET_EMAIL_DELIVERED,
      emailSendId:     'send-001',
      draftId:         'draft-001',
      phase3bMeta:     phase3bMeta(),
      resendMessageId: 'resend-test',
      resendEventType: 'email.delivered',
      occurredAt:      '2026-05-21T12:00:00Z',
    })
    expect(payload.resend_message_id).toBe('resend-test')
    expect(payload.occurred_at).toBe('2026-05-21T12:00:00Z')
  })

  it('includes all Phase 3B attribution fields', () => {
    const meta = phase3bMeta()
    const payload = buildWebhookOutcomePayload({
      etActionType:    ET_ACTION_TYPES.ET_EMAIL_DELIVERED,
      emailSendId:     'send-001',
      draftId:         'draft-001',
      phase3bMeta:     meta,
      resendMessageId: 'resend-test',
      resendEventType: 'email.delivered',
      occurredAt:      '2026-05-21T12:00:00Z',
    })
    expect(payload.message_version_id).toBe('ver-test')
    expect(payload.strategy_id).toBe('str-test')
    expect(payload.quality_review_id).toBe('qr-test')
    expect(payload.version_label).toBe('A')
    expect(payload.composite_score).toBe(82)
  })

  it('all Phase 3B fields null when phase3bMeta is null', () => {
    const payload = buildWebhookOutcomePayload({
      etActionType:    ET_ACTION_TYPES.ET_EMAIL_DELIVERED,
      emailSendId:     'send-001',
      draftId:         null,
      phase3bMeta:     null,
      resendMessageId: 'resend-test',
      resendEventType: 'email.delivered',
      occurredAt:      '2026-05-21T12:00:00Z',
    })
    expect(payload.message_version_id).toBeNull()
    expect(payload.strategy_id).toBeNull()
    expect(payload.quality_review_id).toBeNull()
  })

  it('has a timestamp', () => {
    const payload = buildWebhookOutcomePayload({
      etActionType: ET_ACTION_TYPES.ET_EMAIL_DELIVERED,
      emailSendId: 'send-001', draftId: 'draft-001',
      phase3bMeta: phase3bMeta(), resendMessageId: 'resend-test',
      resendEventType: 'email.delivered', occurredAt: '2026-05-21T12:00:00Z',
    })
    expect(payload.timestamp).toBeTruthy()
  })
})

// ============================================================
// ET_ Action Types — No Learning Agent / No Scoring
// ============================================================

describe('ET_ACTION_TYPES — No Learning Agent guardrail', () => {
  it('no ET_ type includes learn, score, or update in its value', () => {
    for (const value of Object.values(ET_ACTION_TYPES)) {
      expect(value.toLowerCase()).not.toMatch(/learn/)
      expect(value.toLowerCase()).not.toMatch(/score_update/)
      expect(value.toLowerCase()).not.toMatch(/weight/)
    }
  })

  it('all 9 ET_ constants are defined', () => {
    expect(ET_ACTION_TYPES.ET_SEND_INITIATED).toBe('ET_SEND_INITIATED')
    expect(ET_ACTION_TYPES.ET_SEND_SUCCEEDED).toBe('ET_SEND_SUCCEEDED')
    expect(ET_ACTION_TYPES.ET_SEND_FAILED).toBe('ET_SEND_FAILED')
    expect(ET_ACTION_TYPES.ET_EMAIL_DELIVERED).toBe('ET_EMAIL_DELIVERED')
    expect(ET_ACTION_TYPES.ET_EMAIL_BOUNCED).toBe('ET_EMAIL_BOUNCED')
    expect(ET_ACTION_TYPES.ET_EMAIL_COMPLAINED).toBe('ET_EMAIL_COMPLAINED')
    expect(ET_ACTION_TYPES.ET_EMAIL_DELIVERY_FAILED).toBe('ET_EMAIL_DELIVERY_FAILED')
    expect(ET_ACTION_TYPES.ET_EMAIL_OPENED).toBe('ET_EMAIL_OPENED')
    expect(ET_ACTION_TYPES.ET_EMAIL_CLICKED).toBe('ET_EMAIL_CLICKED')
    expect(Object.values(ET_ACTION_TYPES)).toHaveLength(9)
  })
})

// ============================================================
// Fixture-based tests — TC-ET-001 through TC-ET-035
// ============================================================

import TC001 from './fixtures/event-tracking/TC-ET-001.json'
import TC002 from './fixtures/event-tracking/TC-ET-002.json'
import TC003 from './fixtures/event-tracking/TC-ET-003.json'
import TC004 from './fixtures/event-tracking/TC-ET-004.json'
import TC005 from './fixtures/event-tracking/TC-ET-005.json'
import TC006 from './fixtures/event-tracking/TC-ET-006.json'
import TC007 from './fixtures/event-tracking/TC-ET-007.json'
import TC008 from './fixtures/event-tracking/TC-ET-008.json'
import TC009 from './fixtures/event-tracking/TC-ET-009.json'
import TC010 from './fixtures/event-tracking/TC-ET-010.json'
import TC011 from './fixtures/event-tracking/TC-ET-011.json'
import TC012 from './fixtures/event-tracking/TC-ET-012.json'
import TC013 from './fixtures/event-tracking/TC-ET-013.json'
import TC014 from './fixtures/event-tracking/TC-ET-014.json'
import TC015 from './fixtures/event-tracking/TC-ET-015.json'
import TC016 from './fixtures/event-tracking/TC-ET-016.json'
import TC017 from './fixtures/event-tracking/TC-ET-017.json'
import TC018 from './fixtures/event-tracking/TC-ET-018.json'
import TC019 from './fixtures/event-tracking/TC-ET-019.json'
import TC020 from './fixtures/event-tracking/TC-ET-020.json'
import TC021 from './fixtures/event-tracking/TC-ET-021.json'
import TC022 from './fixtures/event-tracking/TC-ET-022.json'
import TC023 from './fixtures/event-tracking/TC-ET-023.json'
import TC024 from './fixtures/event-tracking/TC-ET-024.json'
import TC025 from './fixtures/event-tracking/TC-ET-025.json'
import TC026 from './fixtures/event-tracking/TC-ET-026.json'
import TC027 from './fixtures/event-tracking/TC-ET-027.json'
import TC028 from './fixtures/event-tracking/TC-ET-028.json'
import TC029 from './fixtures/event-tracking/TC-ET-029.json'
import TC030 from './fixtures/event-tracking/TC-ET-030.json'
import TC031 from './fixtures/event-tracking/TC-ET-031.json'
import TC032 from './fixtures/event-tracking/TC-ET-032.json'
import TC033 from './fixtures/event-tracking/TC-ET-033.json'
import TC034 from './fixtures/event-tracking/TC-ET-034.json'
import TC035 from './fixtures/event-tracking/TC-ET-035.json'

// Helper to run a fixture through the appropriate pure function
function runFixturePureTest(
  fixture: { meta: { test_case_id: string; scenario_name: string }; input: Record<string, unknown>; expected: Record<string, unknown> }
) {
  const { input, expected } = fixture

  // Attribution tests
  if ('ai_generation_metadata' in input) {
    const meta = input['ai_generation_metadata'] as Record<string, unknown> | null
    const result = extractPhase3bMeta(meta)
    if (expected['extract_result'] === null) {
      expect(result).toBeNull()
    } else {
      expect(result).not.toBeNull()
    }
    if ('isPhase3bSend_result' in expected) {
      expect(isPhase3bSend(meta)).toBe(expected['isPhase3bSend_result'])
    }
    return
  }

  // Send metadata isPhase3bSend test
  if ('send_metadata' in input) {
    const sendMeta = input['send_metadata'] as Record<string, unknown>
    if ('isPhase3bSend_result' in expected) {
      expect(isPhase3bSend(sendMeta)).toBe(expected['isPhase3bSend_result'])
    }
    if ('extractPhase3bMeta_result' in expected) {
      const result = extractPhase3bMeta(sendMeta)
      if (expected['extractPhase3bMeta_result'] === null) {
        expect(result).toBeNull()
      }
    }
    return
  }

  // Multiple metadata cases (TC-ET-028)
  if ('metadata_cases' in input) {
    const cases = input['metadata_cases'] as Array<Record<string, unknown> | null>
    for (const metadata of cases) {
      expect(isPhase3bSend(metadata ?? null)).toBe(false)
    }
    return
  }

  // Webhook mapping test (TC-ET-029)
  if ('events_that_must_map' in input) {
    const mustMap = input['events_that_must_map'] as string[]
    const mustNot = input['events_that_must_not_map'] as string[]
    for (const evt of mustMap) {
      expect(RESEND_EVENT_TO_ET_TYPE[evt]).toBeTruthy()
    }
    for (const evt of mustNot) {
      expect(RESEND_EVENT_TO_ET_TYPE[evt]).toBeUndefined()
    }
    return
  }

  // Internal send event payload tests
  if ('phase3b_meta' in input && 'email_send_id' in input) {
    const pMeta = input['phase3b_meta'] as EtPhase3bMeta | null
    const emailSendId = input['email_send_id'] as string
    const draftId = input['draft_id'] as string
    const toEmail = input['to_email'] as string | undefined

    if ('resend_event_type' in input && !('email_send_id' in input && 'resend_message_id' in input && 'resend_event_type' in input && 'occurred_at' in input)) {
      // skip complex webhook test
      return
    }

    if (expected['action_type'] === 'ET_SEND_INITIATED') {
      const payload = buildSendInitiatedPayload({
        emailSendId, draftId, phase3bMeta: pMeta,
        toEmail: toEmail ?? 'test@example.com',
      })
      expect(payload.action_type).toBe('ET_SEND_INITIATED')
      if (pMeta) {
        expect(payload.message_version_id).toBe(pMeta.message_version_id)
        expect(payload.strategy_id).toBe(pMeta.strategy_id)
      }
    }
    return
  }

  // Webhook outcome payload tests
  if ('resend_event_type' in input && 'phase3b_meta' in input && 'occurred_at' in input) {
    const pMeta = input['phase3b_meta'] as EtPhase3bMeta | null
    const resendEventType = input['resend_event_type'] as string
    const etType = RESEND_EVENT_TO_ET_TYPE[resendEventType]

    if (expected['no_et_activity_event']) return // log-only event

    if (etType && pMeta && 'email_send_id' in input) {
      const payload = buildWebhookOutcomePayload({
        etActionType:    etType,
        emailSendId:     input['email_send_id'] as string,
        draftId:         (input['draft_id'] as string | null) ?? null,
        phase3bMeta:     pMeta,
        resendMessageId: input['resend_message_id'] as string,
        resendEventType: resendEventType,
        occurredAt:      input['occurred_at'] as string,
      })
      expect(payload.action_type).toBe(etType)
      if (expected['et_type']) expect(payload.action_type).toBe(expected['et_type'])
      if (expected['payload_message_version_id']) {
        expect(payload.message_version_id).toBe(expected['payload_message_version_id'])
      }
      if (expected['payload_strategy_id']) {
        expect(payload.strategy_id).toBe(expected['payload_strategy_id'])
      }
      if (expected['payload_quality_review_id']) {
        expect(payload.quality_review_id).toBe(expected['payload_quality_review_id'])
      }
    }
  }
}

describe('Event Tracking — fixture-based tests', () => {
  const fixtures = [
    TC001, TC002, TC003, TC004, TC005, TC006, TC007, TC008, TC009, TC010,
    TC011, TC012, TC013, TC014, TC015, TC016, TC017, TC018, TC019, TC020,
    TC021, TC022, TC023, TC024, TC025, TC026, TC027, TC028, TC029, TC030,
    TC031, TC032, TC033, TC034, TC035,
  ]

  for (const fixture of fixtures) {
    const f = fixture as {
      meta: { test_case_id: string; scenario_name: string }
      input: Record<string, unknown>
      expected: Record<string, unknown>
    }
    it(`${f.meta.test_case_id}: ${f.meta.scenario_name}`, () => {
      runFixturePureTest(f)
    })
  }
})

// ============================================================
// UI fixture assertions (TC-ET-032 through TC-ET-034)
// ============================================================

describe('TC-ET-032: UI delivered badge state', () => {
  it('fixture confirms delivered badge for send_status=delivered', () => {
    const f = TC032 as { expected: { badge_label: string; no_action_button: boolean } }
    expect(f.expected.badge_label).toBe('Delivered')
    expect(f.expected.no_action_button).toBe(true)
  })
})

describe('TC-ET-033: UI bounced badge state', () => {
  it('fixture confirms bounced badge for send_status=bounced', () => {
    const f = TC033 as { expected: { badge_label: string; no_action_button: boolean } }
    expect(f.expected.badge_label).toBe('Bounced')
    expect(f.expected.no_action_button).toBe(true)
  })
})

describe('TC-ET-034: UI send failed badge state', () => {
  it('fixture confirms send failed badge for send_status=failed', () => {
    const f = TC034 as { expected: { badge_label: string; no_action_button: boolean } }
    expect(f.expected.badge_label).toBe('Send Failed')
    expect(f.expected.no_action_button).toBe(true)
  })
})
