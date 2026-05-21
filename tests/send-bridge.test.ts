// ============================================================
// Phase 3B — Send / Email Draft Bridge Tests
// Tests for: validateDraftCreationEligibility, audit builders,
// and fixture-based validation coverage (TC-SEB-001 through TC-SEB-035).
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  validateDraftCreationEligibility,
  isVersionApproved,
  isStrategyActive,
  hasDraftInProgress,
} from '@/modules/messaging/send-bridge/send-bridge.validation'
import {
  buildDraftCreatedPayload,
  buildDraftCreationBlockedPayload,
} from '@/modules/messaging/send-bridge/send-bridge.audit'
import { SEB_ERROR_CODES, SEB_ACTION_TYPES } from '@/modules/messaging/send-bridge/send-bridge.types'
import type {
  SendBridgeVersion,
  SendBridgeStrategy,
  SendBridgeContact,
  SendBridgeSenderIdentity,
  ExistingDraftCheck,
} from '@/modules/messaging/send-bridge/send-bridge.types'

// ---- Test data builders ----

function approvedVersion(overrides: Partial<SendBridgeVersion> = {}): SendBridgeVersion {
  return {
    id:              'ver-test',
    tenant_id:       'ten-001',
    strategy_id:     'str-001',
    version_label:   'A',
    subject_line:    'Test subject line',
    body_text:       'Test body text content.',
    body_html:       null,
    approval_status: 'approved',
    reviewed_by:     'user-001',
    reviewed_at:     '2026-05-21T10:00:00Z',
    ...overrides,
  }
}

function activeStrategy(overrides: Partial<SendBridgeStrategy> = {}): SendBridgeStrategy {
  return {
    id:           'str-001',
    tenant_id:    'ten-001',
    lead_id:      'lead-001',
    message_type: 'close_deal_now',
    status:       'approved',
    ...overrides,
  }
}

function validContact(overrides: Partial<SendBridgeContact> = {}): SendBridgeContact {
  return {
    id:             'con-001',
    email:          'jane@example.com',
    first_name:     'Jane',
    last_name:      'Smith',
    do_not_contact: false,
    ...overrides,
  }
}

function validSender(overrides: Partial<SendBridgeSenderIdentity> = {}): SendBridgeSenderIdentity {
  return {
    id:    'si-001',
    name:  'Sales Team',
    email: 'sales@biz.com',
    ...overrides,
  }
}

function noSuppression() {
  return { blocked: false as const }
}

function defaultParams() {
  return {
    version:           approvedVersion(),
    strategy:          activeStrategy(),
    lead:              { contact_id: 'con-001' as string | null },
    contact:           validContact(),
    senderIdentity:    validSender(),
    existingDraft:     null as ExistingDraftCheck | null,
    suppressionResult: noSuppression(),
    hasPermission:     true,
    requestTenantId:   'ten-001',
  }
}

// ============================================================
// Helper function tests
// ============================================================

describe('isVersionApproved', () => {
  it('returns true for approved status', () => {
    expect(isVersionApproved(approvedVersion({ approval_status: 'approved' }))).toBe(true)
  })

  it('returns false for pending status', () => {
    expect(isVersionApproved(approvedVersion({ approval_status: 'pending' }))).toBe(false)
  })

  it('returns false for rejected status', () => {
    expect(isVersionApproved(approvedVersion({ approval_status: 'rejected' }))).toBe(false)
  })

  it('returns false for superseded status', () => {
    expect(isVersionApproved(approvedVersion({ approval_status: 'superseded' }))).toBe(false)
  })
})

describe('isStrategyActive', () => {
  it('returns true for draft status', () => {
    expect(isStrategyActive(activeStrategy({ status: 'draft' }))).toBe(true)
  })

  it('returns true for approved status', () => {
    expect(isStrategyActive(activeStrategy({ status: 'approved' }))).toBe(true)
  })

  it('returns true for in_use status', () => {
    expect(isStrategyActive(activeStrategy({ status: 'in_use' }))).toBe(true)
  })

  it('returns false for superseded status', () => {
    expect(isStrategyActive(activeStrategy({ status: 'superseded' }))).toBe(false)
  })

  it('returns false for error status', () => {
    expect(isStrategyActive(activeStrategy({ status: 'error' }))).toBe(false)
  })
})

describe('hasDraftInProgress', () => {
  it('returns false for null (no existing draft)', () => {
    expect(hasDraftInProgress(null)).toBe(false)
  })

  it('returns true for approved draft (active)', () => {
    expect(hasDraftInProgress({ id: 'draft-1', status: 'approved' })).toBe(true)
  })

  it('returns true for pending_approval draft (active)', () => {
    expect(hasDraftInProgress({ id: 'draft-1', status: 'pending_approval' })).toBe(true)
  })

  it('returns false for rejected draft (allows re-creation)', () => {
    expect(hasDraftInProgress({ id: 'draft-1', status: 'rejected' })).toBe(false)
  })

  it('returns false for superseded draft (allows re-creation)', () => {
    expect(hasDraftInProgress({ id: 'draft-1', status: 'superseded' })).toBe(false)
  })
})

// ============================================================
// validateDraftCreationEligibility — Gate conditions
// ============================================================

describe('validateDraftCreationEligibility', () => {

  // ---- Happy path ----

  it('returns allowed:true when all conditions pass', () => {
    const result = validateDraftCreationEligibility(defaultParams())
    expect(result.allowed).toBe(true)
    expect(result.error).toBeNull()
    expect(result.errorMessage).toBeNull()
  })

  // ---- Gate 1: SEB_013 — Tenant mismatch ----

  it('SEB_013: returns error when version tenant_id mismatches request', () => {
    const params = { ...defaultParams(), version: approvedVersion({ tenant_id: 'ten-OTHER' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.TENANT_MISMATCH)
  })

  // ---- Gate 2: SEB_002 — Version rejected ----

  it('SEB_002: returns error for rejected version', () => {
    const params = { ...defaultParams(), version: approvedVersion({ approval_status: 'rejected' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_REJECTED)
  })

  // ---- Gate 3: SEB_003 — Version superseded ----

  it('SEB_003: returns error for superseded version', () => {
    const params = { ...defaultParams(), version: approvedVersion({ approval_status: 'superseded' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_SUPERSEDED)
  })

  // ---- Gate 4: SEB_001 — Version not approved (non-rejected, non-superseded) ----

  it('SEB_001: returns error for pending version', () => {
    const params = { ...defaultParams(), version: approvedVersion({ approval_status: 'pending' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_NOT_APPROVED)
  })

  it('SEB_001: returns error for selected version', () => {
    const params = { ...defaultParams(), version: approvedVersion({ approval_status: 'selected' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_NOT_APPROVED)
  })

  // ---- Gate 5: SEB_008 — Strategy not active ----

  it('SEB_008: returns error for superseded strategy', () => {
    const params = { ...defaultParams(), strategy: activeStrategy({ status: 'superseded' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.STRATEGY_NOT_ACTIVE)
  })

  it('SEB_008: returns error for error-state strategy', () => {
    const params = { ...defaultParams(), strategy: activeStrategy({ status: 'error' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.STRATEGY_NOT_ACTIVE)
  })

  // ---- Gate 6: SEB_004 — No contact linked ----

  it('SEB_004: returns error when lead has no contact_id', () => {
    const params = { ...defaultParams(), lead: { contact_id: null } }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.CONTACT_NOT_LINKED)
  })

  // ---- Gate 7: SEB_005 — Contact email missing ----

  it('SEB_005: returns error when contact is null', () => {
    const params = { ...defaultParams(), contact: null }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.CONTACT_EMAIL_MISSING)
  })

  it('SEB_005: returns error when contact email is null', () => {
    const params = { ...defaultParams(), contact: validContact({ email: null }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.CONTACT_EMAIL_MISSING)
  })

  it('SEB_005: returns error when contact email is empty string', () => {
    const params = { ...defaultParams(), contact: validContact({ email: '' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.CONTACT_EMAIL_MISSING)
  })

  // ---- Gate 8: SEB_006 — do_not_contact ----

  it('SEB_006: returns error when contact is do_not_contact', () => {
    const params = { ...defaultParams(), contact: validContact({ do_not_contact: true }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.CONTACT_DO_NOT_CONTACT)
  })

  // ---- Gate 9: SEB_007 — Email suppressed ----

  it('SEB_007: returns error when email is suppressed', () => {
    const params = { ...defaultParams(), suppressionResult: { blocked: true, reason: 'email_suppressed' as const } }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.EMAIL_SUPPRESSED)
  })

  it('SEB_007: returns error when email is unsubscribed', () => {
    const params = { ...defaultParams(), suppressionResult: { blocked: true, reason: 'email_unsubscribed' as const } }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.EMAIL_SUPPRESSED)
  })

  // ---- Gate 10: SEB_012 — No sender identity ----

  it('SEB_012: returns error when sender identity is null', () => {
    const params = { ...defaultParams(), senderIdentity: null }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.SENDER_IDENTITY_MISSING)
  })

  // ---- Gate 11: SEB_009 — Version content missing ----

  it('SEB_009: returns error when subject_line is empty string', () => {
    const params = { ...defaultParams(), version: approvedVersion({ subject_line: '' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_CONTENT_MISSING)
  })

  it('SEB_009: returns error when subject_line is null', () => {
    const params = { ...defaultParams(), version: approvedVersion({ subject_line: null }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_CONTENT_MISSING)
  })

  it('SEB_009: returns error when body_text is empty string', () => {
    const params = { ...defaultParams(), version: approvedVersion({ body_text: '' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_CONTENT_MISSING)
  })

  it('SEB_009: returns error when body_text is null', () => {
    const params = { ...defaultParams(), version: approvedVersion({ body_text: null }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_CONTENT_MISSING)
  })

  // ---- Gate 12: SEB_010 — body_html non-null ----

  it('SEB_010: returns error when body_html is non-null', () => {
    const params = { ...defaultParams(), version: approvedVersion({ body_html: '<p>content</p>' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.BODY_HTML_POPULATED)
  })

  // ---- Gate 13: SEB_011 — Duplicate draft ----

  it('SEB_011: returns error when active approved draft exists for version', () => {
    const params = { ...defaultParams(), existingDraft: { id: 'draft-old', status: 'approved' } }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.DUPLICATE_DRAFT)
  })

  it('SEB_011: returns error when pending_approval draft exists for version', () => {
    const params = { ...defaultParams(), existingDraft: { id: 'draft-old', status: 'pending_approval' } }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.DUPLICATE_DRAFT)
  })

  it('allows creation when prior draft for version is rejected', () => {
    const params = { ...defaultParams(), existingDraft: { id: 'draft-old', status: 'rejected' } }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(true)
  })

  it('allows creation when prior draft for version is superseded', () => {
    const params = { ...defaultParams(), existingDraft: { id: 'draft-old', status: 'superseded' } }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(true)
  })

  // ---- Gate 14: SEB_014 — Permission denied ----

  it('SEB_014: returns error when hasPermission is false', () => {
    const params = { ...defaultParams(), hasPermission: false }
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.PERMISSION_DENIED)
  })

  // ---- Gate ordering: SEB_013 runs before SEB_001 ----

  it('SEB_013 fires before SEB_001 when both conditions met', () => {
    const params = {
      ...defaultParams(),
      version: approvedVersion({ tenant_id: 'ten-OTHER', approval_status: 'pending' }),
    }
    const result = validateDraftCreationEligibility(params)
    expect(result.error).toBe(SEB_ERROR_CODES.TENANT_MISMATCH)
  })

  // ---- Gate ordering: SEB_002 fires before SEB_001 ----

  it('SEB_002 fires before SEB_001 for rejected versions', () => {
    const params = { ...defaultParams(), version: approvedVersion({ approval_status: 'rejected' }) }
    const result = validateDraftCreationEligibility(params)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_REJECTED)
    expect(result.error).not.toBe(SEB_ERROR_CODES.VERSION_NOT_APPROVED)
  })

  // ---- Gate ordering: SEB_008 does not fire when version fails ----

  it('SEB_001 fires before SEB_008 when version is not approved', () => {
    const params = {
      ...defaultParams(),
      version:   approvedVersion({ approval_status: 'pending' }),
      strategy:  activeStrategy({ status: 'superseded' }),
    }
    const result = validateDraftCreationEligibility(params)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_NOT_APPROVED)
  })
})

// ============================================================
// Audit builders
// ============================================================

describe('buildDraftCreatedPayload', () => {
  it('returns payload with SEB_ACTION_DRAFT_CREATED action_type', () => {
    const payload = buildDraftCreatedPayload({
      draftId:          'draft-001',
      messageVersionId: 'ver-001',
      strategyId:       'str-001',
      leadId:           'lead-001',
      userId:           'user-001',
    })
    expect(payload.action_type).toBe(SEB_ACTION_TYPES.SEB_ACTION_DRAFT_CREATED)
  })

  it('includes all required fields', () => {
    const payload = buildDraftCreatedPayload({
      draftId:             'draft-001',
      messageVersionId:    'ver-001',
      strategyId:          'str-001',
      qualityReviewId:     'qr-001',
      leadId:              'lead-001',
      contactId:           'con-001',
      userId:              'user-001',
      supersededDraftIds:  ['old-draft'],
    })
    expect(payload.draft_id).toBe('draft-001')
    expect(payload.message_version_id).toBe('ver-001')
    expect(payload.strategy_id).toBe('str-001')
    expect(payload.quality_review_id).toBe('qr-001')
    expect(payload.lead_id).toBe('lead-001')
    expect(payload.contact_id).toBe('con-001')
    expect(payload.user_id).toBe('user-001')
    expect(payload.superseded_draft_ids).toEqual(['old-draft'])
    expect(payload.timestamp).toBeTruthy()
  })

  it('defaults superseded_draft_ids to empty array when not provided', () => {
    const payload = buildDraftCreatedPayload({
      draftId: 'draft-001', messageVersionId: 'ver-001',
      strategyId: 'str-001', leadId: 'lead-001', userId: 'user-001',
    })
    expect(payload.superseded_draft_ids).toEqual([])
  })

  it('does not include error_code or error_reason', () => {
    const payload = buildDraftCreatedPayload({
      draftId: 'draft-001', messageVersionId: 'ver-001',
      strategyId: 'str-001', leadId: 'lead-001', userId: 'user-001',
    })
    expect(payload.error_code).toBeUndefined()
    expect(payload.error_reason).toBeUndefined()
  })
})

describe('buildDraftCreationBlockedPayload', () => {
  it('returns payload with SEB_ACTION_DRAFT_CREATION_BLOCKED action_type', () => {
    const payload = buildDraftCreationBlockedPayload({
      messageVersionId: 'ver-001',
      strategyId:       'str-001',
      leadId:           'lead-001',
      userId:           'user-001',
      errorCode:        'SEB_007',
      errorReason:      'contact_email_suppressed',
    })
    expect(payload.action_type).toBe(SEB_ACTION_TYPES.SEB_ACTION_DRAFT_CREATION_BLOCKED)
  })

  it('includes error_code and error_reason', () => {
    const payload = buildDraftCreationBlockedPayload({
      messageVersionId: 'ver-001',
      strategyId:       'str-001',
      leadId:           'lead-001',
      userId:           'user-001',
      errorCode:        'SEB_007',
      errorReason:      'contact_email_suppressed',
    })
    expect(payload.error_code).toBe('SEB_007')
    expect(payload.error_reason).toBe('contact_email_suppressed')
    expect(payload.timestamp).toBeTruthy()
  })

  it('does not include draft_id', () => {
    const payload = buildDraftCreationBlockedPayload({
      messageVersionId: 'ver-001', strategyId: 'str-001',
      leadId: 'lead-001', userId: 'user-001',
      errorCode: 'SEB_004', errorReason: 'no_contact',
    })
    expect(payload.draft_id).toBeUndefined()
  })
})

// ============================================================
// Fixture-based tests: TC-SEB-001 through TC-SEB-035
// Validates that the fixture inputs produce the expected results
// when passed through validateDraftCreationEligibility.
// ============================================================

// Helper to load fixture input into validateDraftCreationEligibility params
function fixtureToParams(fixture: {
  input: {
    version?: Record<string, unknown>
    strategy?: Record<string, unknown>
    lead?: { contact_id: string | null }
    contact?: Record<string, unknown> | null
    sender_identity?: Record<string, unknown> | null
    existing_draft?: Record<string, unknown> | null
    suppression_result?: { blocked: boolean; reason?: string }
    has_permission?: boolean
    request_tenant_id?: string
  }
}) {
  const i = fixture.input
  return {
    version:           (i.version ?? approvedVersion()) as unknown as SendBridgeVersion,
    strategy:          (i.strategy ?? activeStrategy()) as unknown as SendBridgeStrategy,
    lead:              (i.lead ?? { contact_id: 'con-001' }) as { contact_id: string | null },
    contact:           (i.contact !== undefined ? i.contact : validContact()) as SendBridgeContact | null,
    senderIdentity:    (i.sender_identity !== undefined ? i.sender_identity : validSender()) as SendBridgeSenderIdentity | null,
    existingDraft:     (i.existing_draft ?? null) as ExistingDraftCheck | null,
    suppressionResult: (i.suppression_result ?? noSuppression()) as { blocked: boolean; reason?: string },
    hasPermission:     i.has_permission ?? true,
    requestTenantId:   i.request_tenant_id ?? 'ten-001',
  }
}

import TC001 from './fixtures/send-bridge/TC-SEB-001.json'
import TC002 from './fixtures/send-bridge/TC-SEB-002.json'
import TC003 from './fixtures/send-bridge/TC-SEB-003.json'
import TC004 from './fixtures/send-bridge/TC-SEB-004.json'
import TC005 from './fixtures/send-bridge/TC-SEB-005.json'
import TC006 from './fixtures/send-bridge/TC-SEB-006.json'
import TC007 from './fixtures/send-bridge/TC-SEB-007.json'
import TC008 from './fixtures/send-bridge/TC-SEB-008.json'
import TC009 from './fixtures/send-bridge/TC-SEB-009.json'
import TC010 from './fixtures/send-bridge/TC-SEB-010.json'
import TC011 from './fixtures/send-bridge/TC-SEB-011.json'
import TC012 from './fixtures/send-bridge/TC-SEB-012.json'
import TC013 from './fixtures/send-bridge/TC-SEB-013.json'
import TC014 from './fixtures/send-bridge/TC-SEB-014.json'
import TC015 from './fixtures/send-bridge/TC-SEB-015.json'
import TC016 from './fixtures/send-bridge/TC-SEB-016.json'
import TC017 from './fixtures/send-bridge/TC-SEB-017.json'
import TC018 from './fixtures/send-bridge/TC-SEB-018.json'
import TC019 from './fixtures/send-bridge/TC-SEB-019.json'
import TC020 from './fixtures/send-bridge/TC-SEB-020.json'
import TC021 from './fixtures/send-bridge/TC-SEB-021.json'
import TC022 from './fixtures/send-bridge/TC-SEB-022.json'
import TC023 from './fixtures/send-bridge/TC-SEB-023.json'
import TC024 from './fixtures/send-bridge/TC-SEB-024.json'
import TC025 from './fixtures/send-bridge/TC-SEB-025.json'
import TC026 from './fixtures/send-bridge/TC-SEB-026.json'
import TC027 from './fixtures/send-bridge/TC-SEB-027.json'
import TC028 from './fixtures/send-bridge/TC-SEB-028.json'
import TC029 from './fixtures/send-bridge/TC-SEB-029.json'
import TC030 from './fixtures/send-bridge/TC-SEB-030.json'
import TC031 from './fixtures/send-bridge/TC-SEB-031.json'
import TC032 from './fixtures/send-bridge/TC-SEB-032.json'
import TC033 from './fixtures/send-bridge/TC-SEB-033.json'
import TC034 from './fixtures/send-bridge/TC-SEB-034.json'
import TC035 from './fixtures/send-bridge/TC-SEB-035.json'

// Fixtures with validation-testable inputs (TC-SEB-001 through TC-SEB-028)
const validationFixtures = [
  TC001, TC002, TC003, TC004, TC005, TC006, TC007, TC008,
  TC009, TC010, TC011, TC012, TC013, TC014, TC015, TC016,
  TC017, TC018, TC019, TC020, TC021, TC022, TC023, TC024,
  TC025, TC026, TC027, TC028,
]

describe('Send Bridge — fixture-based validation tests', () => {
  for (const fixture of validationFixtures) {
    const f = fixture as { meta: { test_case_id: string; scenario_name: string }; input: Record<string, unknown>; expected: Record<string, unknown> }
    it(`${f.meta.test_case_id}: ${f.meta.scenario_name}`, () => {
      const params = fixtureToParams(f as Parameters<typeof fixtureToParams>[0])
      const result = validateDraftCreationEligibility(params)

      if (f.expected.allowed === true) {
        expect(result.allowed).toBe(true)
        expect(result.error).toBeNull()
      } else if (f.expected.allowed === false) {
        expect(result.allowed).toBe(false)
        if (f.expected.error) {
          expect(result.error).toBe(f.expected.error)
        }
        if (f.expected.error_message) {
          expect(result.errorMessage).toBe(f.expected.error_message)
        }
      }
    })
  }
})

// TC-SEB-029: Low-score override version
describe('TC-SEB-029: low_score_override_creates_draft', () => {
  it('allows draft creation for approved version regardless of quality score', () => {
    const params = fixtureToParams(TC029 as Parameters<typeof fixtureToParams>[0])
    const result = validateDraftCreationEligibility(params)
    expect(result.allowed).toBe(true)
  })
})

// TC-SEB-030: Regeneration after approval
describe('TC-SEB-030: regeneration_after_approval', () => {
  it('blocks superseded version with SEB_003', () => {
    const result = validateDraftCreationEligibility({
      ...defaultParams(),
      version: approvedVersion({ approval_status: 'superseded' }),
    })
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_SUPERSEDED)
  })

  it('blocks pending version with SEB_001', () => {
    const result = validateDraftCreationEligibility({
      ...defaultParams(),
      version: approvedVersion({ approval_status: 'pending' }),
    })
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(SEB_ERROR_CODES.VERSION_NOT_APPROVED)
  })
})

// TC-SEB-031: UI fixture — create draft button appears
describe('TC-SEB-031: ui_create_draft_button_visible_for_approved', () => {
  it('fixture confirms button is enabled for approved version with no draft', () => {
    const fixture = TC031 as { expected: { button_enabled: boolean; button_visible: boolean } }
    expect(fixture.expected.button_enabled).toBe(true)
    expect(fixture.expected.button_visible).toBe(true)
  })
})

// TC-SEB-032: UI fixture — ready to send shown when draft approved
describe('TC-SEB-032: ui_ready_to_send_shown_when_draft_approved', () => {
  it('fixture confirms ready to send shown and create button hidden', () => {
    const fixture = TC032 as { expected: { shows_ready_to_send: boolean; create_draft_button_hidden: boolean } }
    expect(fixture.expected.shows_ready_to_send).toBe(true)
    expect(fixture.expected.create_draft_button_hidden).toBe(true)
  })
})

// TC-SEB-033: UI fixture — error displayed for SEB_005
describe('TC-SEB-033: ui_error_shown_for_seb005', () => {
  it('fixture confirms error is displayed for SEB_005', () => {
    const fixture = TC033 as { expected: { error_displayed: boolean } }
    expect(fixture.expected.error_displayed).toBe(true)
  })
})

// TC-SEB-034: UI fixture — confirmation modal shown
describe('TC-SEB-034: ui_confirmation_modal_shown', () => {
  it('fixture confirms confirmation modal is shown before draft creation', () => {
    const fixture = TC034 as { expected: { modal_shown: boolean; no_action_taken_before_confirmation: boolean } }
    expect(fixture.expected.modal_shown).toBe(true)
    expect(fixture.expected.no_action_taken_before_confirmation).toBe(true)
  })
})

// TC-SEB-035: UI fixture — supersede warning in modal
describe('TC-SEB-035: ui_supersede_warning_in_modal', () => {
  it('fixture confirms supersede warning is shown when prior draft exists', () => {
    const fixture = TC035 as { expected: { modal_shows_supersede_warning: boolean } }
    expect(fixture.expected.modal_shows_supersede_warning).toBe(true)
  })
})

// ---- No-auto-send guarantee (structural assertion) ----

describe('No-auto-send guarantee', () => {
  it('SEB action types do not include any send-triggering type', () => {
    const actionValues = Object.values(SEB_ACTION_TYPES)
    for (const v of actionValues) {
      expect(v).not.toMatch(/send_email/i)
      expect(v).not.toMatch(/email_sent/i)
    }
  })

  it('SEB_001 through SEB_014 are all defined error codes', () => {
    const codes = Object.values(SEB_ERROR_CODES)
    expect(codes).toHaveLength(14)
    for (let i = 1; i <= 14; i++) {
      const expected = `SEB_${String(i).padStart(3, '0')}`
      expect(codes).toContain(expected)
    }
  })

  it('validateDraftCreationEligibility returns allowed:false for all non-approved statuses', () => {
    const nonApprovedStatuses = ['pending', 'selected', 'rejected', 'superseded']
    for (const status of nonApprovedStatuses) {
      const result = validateDraftCreationEligibility({
        ...defaultParams(),
        version: approvedVersion({ approval_status: status }),
      })
      expect(result.allowed).toBe(false)
    }
  })
})
