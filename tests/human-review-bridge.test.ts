// ============================================================
// Phase 3B — Human Review / Approval Bridge Test Suite
// Tests pure functions against all 35 approved fixtures.
// No database calls — only pure functions tested here.
// Mirrors the quality-review-agent.test.ts pattern.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

import {
  validateApprovalEligibility,
  validateSelectEligibility,
  validateRejectEligibility,
  hasCriticalRiskFlag,
  hasHighRiskFlag,
  isStrategyActive,
} from '../modules/messaging/human-review/human-review.validation'

import {
  buildSelectEventPayload,
  buildDeselectEventPayload,
  buildRejectEventPayload,
  buildApproveEventPayload,
  buildRegenerationRequestedPayload,
  buildReturnedToStrategyPayload,
} from '../modules/messaging/human-review/human-review.audit'

import {
  HRB_ERROR_CODES,
  HRB_ACTION_TYPES,
  REJECTION_REASONS,
  VALID_REJECTION_REASONS,
} from '../modules/messaging/human-review/human-review.types'

import type {
  HumanReviewVersion,
  HumanReviewStrategy,
  HumanReviewQualityReview,
  HumanReviewSystemControls,
} from '../modules/messaging/human-review/human-review.types'

// ---- Load fixtures ----

const FIXTURE_DIR = resolve(__dirname, 'fixtures/human-review-bridge')

interface HrbFixture {
  meta: {
    test_case_id: string
    scenario_name: string
    description: string
  }
  input: {
    action: string
    version:                 HumanReviewVersion
    strategy:                HumanReviewStrategy
    quality_review:          HumanReviewQualityReview | null
    other_versions:          HumanReviewVersion[]
    existing_approved_version: HumanReviewVersion | null
    user:                    { user_id: string; tenant_id: string }
    system_controls:         HumanReviewSystemControls
    options:                 Record<string, unknown>
  }
  expected: {
    success:                  boolean
    new_approval_status:      string
    reviewed_by_set:          boolean
    reviewed_at_set:          boolean
    error_code:               string | null
    activity_event_type:      string | null
    no_email_draft_created:   boolean
    no_approval_request_created: boolean
    no_send_triggered:        boolean
    notes:                    string
    [key: string]:            unknown
  }
}

function loadFixtures(): HrbFixture[] {
  const files = readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.json')).sort()
  return files.map(f => JSON.parse(readFileSync(resolve(FIXTURE_DIR, f), 'utf-8')) as HrbFixture)
}

const fixtures = loadFixtures()

// ---- Helper to build minimal valid structs ----

function makeVersion(overrides: Partial<HumanReviewVersion> = {}): HumanReviewVersion {
  return {
    id:               'uuid-version-a',
    tenant_id:        'uuid-tenant-1',
    strategy_id:      'uuid-strategy-1',
    version_label:    'A',
    subject_line:     'Test subject line',
    body_text:        'Test body text with some content here.',
    body_html:        null,
    approval_status:  'pending',
    reviewed_by:      null,
    reviewed_at:      null,
    rejection_reason: null,
    ...overrides,
  }
}

function makeStrategy(overrides: Partial<HumanReviewStrategy> = {}): HumanReviewStrategy {
  return {
    id:                   'uuid-strategy-1',
    tenant_id:            'uuid-tenant-1',
    lead_id:              'uuid-lead-1',
    message_type:         'cold_outreach',
    status:               'approved',
    invalid_reasons:      [],
    requires_human_review:false,
    ...overrides,
  }
}

function makeQualityReview(overrides: Partial<HumanReviewQualityReview> = {}): HumanReviewQualityReview {
  return {
    id:              'uuid-qr-a',
    tenant_id:       'uuid-tenant-1',
    version_id:      'uuid-version-a',
    strategy_id:     'uuid-strategy-1',
    composite_score: 80,
    score_band:      'strong',
    is_recommended:  true,
    risk_flags:      [],
    superseded_at:   null,
    ...overrides,
  }
}

function makeSystemControls(overrides: Partial<HumanReviewSystemControls> = {}): HumanReviewSystemControls {
  return { global_agent_pause: false, ...overrides }
}

// ============================================================
// UNIT TESTS — hasCriticalRiskFlag
// ============================================================

describe('Human Review Bridge — hasCriticalRiskFlag', () => {
  it('returns false for empty flags', () => {
    expect(hasCriticalRiskFlag([])).toBe(false)
  })

  it('returns false for low flags only', () => {
    expect(hasCriticalRiskFlag([{ severity: 'low' }])).toBe(false)
  })

  it('returns false for medium flags only', () => {
    expect(hasCriticalRiskFlag([{ severity: 'medium' }])).toBe(false)
  })

  it('returns false for high flags only', () => {
    expect(hasCriticalRiskFlag([{ severity: 'high' }])).toBe(false)
  })

  it('returns true for critical flag', () => {
    expect(hasCriticalRiskFlag([{ severity: 'critical' }])).toBe(true)
  })

  it('returns true when critical is mixed with others', () => {
    expect(hasCriticalRiskFlag([
      { severity: 'low' },
      { severity: 'critical' },
      { severity: 'high' },
    ])).toBe(true)
  })
})

// ============================================================
// UNIT TESTS — hasHighRiskFlag
// ============================================================

describe('Human Review Bridge — hasHighRiskFlag', () => {
  it('returns false for empty flags', () => {
    expect(hasHighRiskFlag([])).toBe(false)
  })

  it('returns false for low/medium flags only', () => {
    expect(hasHighRiskFlag([{ severity: 'low' }, { severity: 'medium' }])).toBe(false)
  })

  it('returns true for high flag', () => {
    expect(hasHighRiskFlag([{ severity: 'high' }])).toBe(true)
  })

  it('does not return true for critical-only (use hasCriticalRiskFlag for that)', () => {
    expect(hasHighRiskFlag([{ severity: 'critical' }])).toBe(false)
  })
})

// ============================================================
// UNIT TESTS — isStrategyActive
// ============================================================

describe('Human Review Bridge — isStrategyActive', () => {
  it('returns true for draft', () => {
    expect(isStrategyActive({ status: 'draft' })).toBe(true)
  })

  it('returns true for approved', () => {
    expect(isStrategyActive({ status: 'approved' })).toBe(true)
  })

  it('returns true for in_use', () => {
    expect(isStrategyActive({ status: 'in_use' })).toBe(true)
  })

  it('returns false for superseded', () => {
    expect(isStrategyActive({ status: 'superseded' })).toBe(false)
  })

  it('returns false for error', () => {
    expect(isStrategyActive({ status: 'error' })).toBe(false)
  })
})

// ============================================================
// UNIT TESTS — validateSelectEligibility
// ============================================================

describe('Human Review Bridge — validateSelectEligibility', () => {
  it('allows pending version', () => {
    const r = validateSelectEligibility(makeVersion({ approval_status: 'pending' }), makeStrategy())
    expect(r.allowed).toBe(true)
    expect(r.error).toBeNull()
  })

  it('allows re-selecting a selected version', () => {
    const r = validateSelectEligibility(makeVersion({ approval_status: 'selected' }), makeStrategy())
    expect(r.allowed).toBe(true)
  })

  it('blocks superseded version (HRB_006)', () => {
    const r = validateSelectEligibility(makeVersion({ approval_status: 'superseded' }), makeStrategy())
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_SUPERSEDED)
  })

  it('blocks rejected version (HRB_007)', () => {
    const r = validateSelectEligibility(makeVersion({ approval_status: 'rejected' }), makeStrategy())
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_REJECTED)
  })

  it('blocks approved version (HRB_008)', () => {
    const r = validateSelectEligibility(makeVersion({ approval_status: 'approved' }), makeStrategy())
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_ALREADY_APPROVED)
  })

  it('blocks when strategy is not active (HRB_017)', () => {
    const r = validateSelectEligibility(
      makeVersion({ approval_status: 'pending' }),
      makeStrategy({ status: 'superseded' })
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.NO_ACTIVE_STRATEGY)
  })
})

// ============================================================
// UNIT TESTS — validateRejectEligibility
// ============================================================

describe('Human Review Bridge — validateRejectEligibility', () => {
  it('allows pending version with valid reason', () => {
    const r = validateRejectEligibility(makeVersion({ approval_status: 'pending' }), 'weak_cta')
    expect(r.allowed).toBe(true)
  })

  it('allows selected version with valid reason', () => {
    const r = validateRejectEligibility(makeVersion({ approval_status: 'selected' }), 'wrong_tone')
    expect(r.allowed).toBe(true)
  })

  it('blocks superseded version', () => {
    const r = validateRejectEligibility(makeVersion({ approval_status: 'superseded' }), 'weak_cta')
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_SUPERSEDED)
  })

  it('blocks already rejected version (HRB_007)', () => {
    const r = validateRejectEligibility(makeVersion({ approval_status: 'rejected' }), 'weak_cta')
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_REJECTED)
  })

  it('blocks invalid reason code', () => {
    const r = validateRejectEligibility(makeVersion({ approval_status: 'pending' }), 'not_a_valid_reason')
    expect(r.allowed).toBe(false)
  })

  it('allows all 12 valid rejection reasons', () => {
    for (const reason of Object.values(REJECTION_REASONS)) {
      const r = validateRejectEligibility(makeVersion({ approval_status: 'pending' }), reason)
      expect(r.allowed).toBe(true)
    }
  })
})

// ============================================================
// UNIT TESTS — validateApprovalEligibility (all 18 gates)
// ============================================================

describe('Human Review Bridge — validateApprovalEligibility', () => {
  it('HRB_001 — version not found', () => {
    const r = validateApprovalEligibility(null, makeStrategy(), makeQualityReview(), null, makeSystemControls(), {})
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_NOT_FOUND)
  })

  it('HRB_002 — tenant mismatch', () => {
    const version  = makeVersion({ tenant_id: 'tenant-A' })
    const strategy = makeStrategy({ tenant_id: 'tenant-B' })
    const r = validateApprovalEligibility(version, strategy, makeQualityReview(), null, makeSystemControls(), {})
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.TENANT_MISMATCH)
  })

  it('HRB_003 — strategy not found', () => {
    const r = validateApprovalEligibility(makeVersion(), null, makeQualityReview(), null, makeSystemControls(), {})
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.STRATEGY_NOT_FOUND)
  })

  it('HRB_004 — strategy superseded', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy({ status: 'superseded' }),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.STRATEGY_SUPERSEDED)
  })

  it('HRB_005 — strategy has blocking invalid_reasons', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy({ invalid_reasons: ['MISSING_CTA'] }),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.STRATEGY_INVALID)
  })

  it('HRB_006 — version superseded', () => {
    const r = validateApprovalEligibility(
      makeVersion({ approval_status: 'superseded' }),
      makeStrategy(),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_SUPERSEDED)
  })

  it('HRB_007 — version rejected', () => {
    const r = validateApprovalEligibility(
      makeVersion({ approval_status: 'rejected' }),
      makeStrategy(),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_REJECTED)
  })

  it('HRB_008 — version already approved', () => {
    const r = validateApprovalEligibility(
      makeVersion({ approval_status: 'approved' }),
      makeStrategy(),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_ALREADY_APPROVED)
  })

  it('HRB_009 — quality review missing (null)', () => {
    const r = validateApprovalEligibility(makeVersion(), makeStrategy(), null, null, makeSystemControls(), {})
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.QUALITY_REVIEW_MISSING)
  })

  it('HRB_009 — quality review superseded', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview({ superseded_at: '2026-05-20T00:00:00Z' }),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.QUALITY_REVIEW_MISSING)
  })

  it('HRB_010 — critical risk flag present', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview({ risk_flags: [{ code: 'RFL-003', severity: 'critical', message: 'critical issue' }] }),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.CRITICAL_RISK_PRESENT)
  })

  it('HRB_011 — high risk not acknowledged', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview({ risk_flags: [{ code: 'RFL-004', severity: 'high', message: 'high issue' }] }),
      null,
      makeSystemControls(),
      { riskAcknowledged: false }
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.HIGH_RISK_NOT_ACKNOWLEDGED)
  })

  it('HRB_011 — high risk acknowledged allows approval', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview({ risk_flags: [{ code: 'RFL-004', severity: 'high', message: 'high issue' }] }),
      null,
      makeSystemControls(),
      { riskAcknowledged: true }
    )
    expect(r.allowed).toBe(true)
  })

  it('HRB_012 — body_text missing', () => {
    const r = validateApprovalEligibility(
      makeVersion({ body_text: '' }),
      makeStrategy(),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_CONTENT_MISSING)
  })

  it('HRB_012 — subject_line missing', () => {
    const r = validateApprovalEligibility(
      makeVersion({ subject_line: '' }),
      makeStrategy(),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_CONTENT_MISSING)
  })

  it('HRB_013 — body_html non-null', () => {
    const r = validateApprovalEligibility(
      makeVersion({ body_html: '<p>content</p>' }),
      makeStrategy(),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.BODY_HTML_POPULATED)
  })

  it('HRB_014 — permission denied (hasPermission=false)', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview(),
      null,
      makeSystemControls(),
      { hasPermission: false }
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.PERMISSION_DENIED)
  })

  it('HRB_015 — global_agent_pause', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview(),
      null,
      makeSystemControls({ global_agent_pause: true }),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.AGENT_PAUSED)
  })

  it('HRB_016 — low score without override', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview({ composite_score: 62 }),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.LOW_SCORE_NO_OVERRIDE)
  })

  it('HRB_016 — low score with override reason passes', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview({ composite_score: 62 }),
      null,
      makeSystemControls(),
      { overrideReason: 'Reviewer has context' }
    )
    expect(r.allowed).toBe(true)
  })

  it('HRB_016 — score exactly 70 does not require override', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview({ composite_score: 70 }),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(true)
  })

  it('HRB_017 — no active strategy (status=error)', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy({ status: 'error', invalid_reasons: [] }),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.NO_ACTIVE_STRATEGY)
  })

  it('HRB_018 — existing approved version blocks second approval', () => {
    const existingApproved = makeVersion({ id: 'uuid-version-existing', approval_status: 'approved' })
    const r = validateApprovalEligibility(
      makeVersion({ id: 'uuid-version-new' }),
      makeStrategy(),
      makeQualityReview(),
      existingApproved,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.EXISTING_APPROVED_VERSION)
  })

  it('HRB_018 — same version as existing approved does not double-block', () => {
    const existingApproved = makeVersion({ id: 'uuid-version-a', approval_status: 'approved' })
    // The version being approved is the SAME one already in approved state
    // This will hit HRB_008 (already approved) first, which is correct
    const r = validateApprovalEligibility(
      makeVersion({ id: 'uuid-version-a', approval_status: 'approved' }),
      makeStrategy(),
      makeQualityReview(),
      existingApproved,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(false)
    expect(r.error).toBe(HRB_ERROR_CODES.VERSION_ALREADY_APPROVED)
  })

  it('allows approval when all conditions are met', () => {
    const r = validateApprovalEligibility(
      makeVersion(),
      makeStrategy(),
      makeQualityReview(),
      null,
      makeSystemControls(),
      {}
    )
    expect(r.allowed).toBe(true)
    expect(r.error).toBeNull()
  })
})

// ============================================================
// UNIT TESTS — Audit event builders
// ============================================================

describe('Human Review Bridge — Audit builders', () => {
  it('buildSelectEventPayload includes required fields', () => {
    const payload = buildSelectEventPayload({
      versionId:              'v1',
      strategyId:             's1',
      versionLabel:           'A',
      previousStatus:         'pending',
      userId:                 'u1',
      priorSelectedVersionId: null,
    })
    expect(payload.action_type).toBe(HRB_ACTION_TYPES.HRB_ACTION_SELECTED)
    expect(payload.version_id).toBe('v1')
    expect(payload.strategy_id).toBe('s1')
    expect(payload.previous_status).toBe('pending')
    expect(payload.new_status).toBe('selected')
    expect(payload.user_id).toBe('u1')
    expect(payload.timestamp).toBeTruthy()
  })

  it('buildSelectEventPayload records prior_selected_version_id when provided', () => {
    const payload = buildSelectEventPayload({
      versionId:              'v2',
      strategyId:             's1',
      versionLabel:           'B',
      previousStatus:         'pending',
      userId:                 'u1',
      priorSelectedVersionId: 'v1',
    })
    expect(payload.prior_selected_version_id).toBe('v1')
  })

  it('buildDeselectEventPayload includes new_selected_version_id', () => {
    const payload = buildDeselectEventPayload({
      versionId:           'v1',
      strategyId:          's1',
      versionLabel:        'A',
      newSelectedVersionId:'v2',
      userId:              'u1',
    })
    expect(payload.action_type).toBe(HRB_ACTION_TYPES.HRB_ACTION_DESELECTED)
    expect(payload.new_selected_version_id).toBe('v2')
    expect(payload.previous_status).toBe('selected')
    expect(payload.new_status).toBe('pending')
  })

  it('buildRejectEventPayload includes rejection_reason', () => {
    const payload = buildRejectEventPayload({
      versionId:       'v1',
      strategyId:      's1',
      versionLabel:    'A',
      previousStatus:  'pending',
      rejectionReason: 'weak_cta',
      reviewerNote:    'Missing specific call to action',
      userId:          'u1',
    })
    expect(payload.action_type).toBe(HRB_ACTION_TYPES.HRB_ACTION_REJECTED)
    expect(payload.rejection_reason).toBe('weak_cta')
    expect(payload.reviewer_note).toBe('Missing specific call to action')
    expect(payload.new_status).toBe('rejected')
  })

  it('buildApproveEventPayload includes all required snapshot fields', () => {
    const payload = buildApproveEventPayload({
      versionId:             'v1',
      strategyId:            's1',
      versionLabel:          'A',
      previousStatus:        'selected',
      userId:                'u1',
      compositeScoreAtAction:85,
      scoreBandAtAction:     'strong',
      isRecommendedAtAction: true,
      riskFlagsAtAction:     [],
      riskAcknowledged:      false,
      overrideReason:        undefined,
    })
    expect(payload.action_type).toBe(HRB_ACTION_TYPES.HRB_ACTION_APPROVED)
    expect(payload.composite_score_at_action).toBe(85)
    expect(payload.score_band_at_action).toBe('strong')
    expect(payload.is_recommended_at_action).toBe(true)
    expect(payload.risk_flags_at_action).toEqual([])
    expect(payload.risk_acknowledged).toBe(false)
    expect(payload.new_status).toBe('approved')
  })

  it('buildApproveEventPayload records override_reason when provided', () => {
    const payload = buildApproveEventPayload({
      versionId:             'v1',
      strategyId:            's1',
      versionLabel:          'A',
      previousStatus:        'pending',
      userId:                'u1',
      compositeScoreAtAction:62,
      scoreBandAtAction:     'needs_review',
      isRecommendedAtAction: false,
      riskFlagsAtAction:     [],
      riskAcknowledged:      false,
      overrideReason:        'Reviewer has context',
    })
    expect(payload.override_reason).toBe('Reviewer has context')
  })

  it('buildRegenerationRequestedPayload has correct action type', () => {
    const payload = buildRegenerationRequestedPayload({
      strategyId:       's1',
      userId:           'u1',
      regenerationNote: 'Need better tone',
    })
    expect(payload.action_type).toBe(HRB_ACTION_TYPES.HRB_ACTION_REGENERATION_REQUESTED)
    expect(payload.strategy_id).toBe('s1')
    expect(payload.regeneration_note).toBe('Need better tone')
  })

  it('buildReturnedToStrategyPayload has correct action type', () => {
    const payload = buildReturnedToStrategyPayload({ strategyId: 's1', userId: 'u1' })
    expect(payload.action_type).toBe(HRB_ACTION_TYPES.HRB_ACTION_RETURNED_TO_STRATEGY)
    expect(payload.strategy_id).toBe('s1')
  })
})

// ============================================================
// UNIT TESTS — Constants and type guards
// ============================================================

describe('Human Review Bridge — Constants', () => {
  it('HRB_ERROR_CODES has 18 codes', () => {
    expect(Object.keys(HRB_ERROR_CODES)).toHaveLength(18)
  })

  it('HRB_ACTION_TYPES has 6 types', () => {
    expect(Object.keys(HRB_ACTION_TYPES)).toHaveLength(6)
  })

  it('REJECTION_REASONS has 12 reasons', () => {
    expect(Object.keys(REJECTION_REASONS)).toHaveLength(12)
  })

  it('VALID_REJECTION_REASONS includes all 12 reason values', () => {
    for (const reason of Object.values(REJECTION_REASONS)) {
      expect(VALID_REJECTION_REASONS.has(reason)).toBe(true)
    }
  })

  it('error codes follow HRB_NNN format', () => {
    for (const code of Object.values(HRB_ERROR_CODES)) {
      expect(code).toMatch(/^HRB_\d{3}$/)
    }
  })
})

// ============================================================
// FIXTURE-BASED TESTS (35 fixtures)
// ============================================================

describe('Human Review Bridge — Fixture-based tests', () => {
  expect(fixtures.length).toBeGreaterThanOrEqual(35)

  for (const fixture of fixtures) {
    it(`${fixture.meta.test_case_id}: ${fixture.meta.description}`, () => {
      const { action, version, strategy, quality_review, existing_approved_version, system_controls, options } = fixture.input
      const { expected } = fixture

      if (action === 'select') {
        const result = validateSelectEligibility(version, strategy)
        expect(result.allowed).toBe(expected.success)
        if (!expected.success && expected.error_code) {
          expect(result.error).toBe(expected.error_code)
        }
      }

      else if (action === 'reject') {
        const rejectionReason = (options?.rejection_reason as string) ?? 'weak_cta'
        const result = validateRejectEligibility(version, rejectionReason)
        expect(result.allowed).toBe(expected.success)
        if (!expected.success && expected.error_code) {
          expect(result.error).toBe(expected.error_code)
        }
      }

      else if (action === 'approve') {
        const result = validateApprovalEligibility(
          version,
          strategy,
          quality_review,
          existing_approved_version,
          system_controls,
          {
            overrideReason:   options?.override_reason as string | undefined,
            riskAcknowledged: options?.risk_acknowledged as boolean | undefined,
            hasPermission:    options?.has_permission !== false,
          }
        )
        expect(result.allowed).toBe(expected.success)
        if (!expected.success && expected.error_code) {
          expect(result.error).toBe(expected.error_code)
        }
      }

      else if (action === 'load') {
        // Load scenarios verify state representation, not validation.
        // The version's current approval_status should match expected.new_approval_status.
        expect(version.approval_status).toBe(expected.new_approval_status)
        // For load tests with critical risk, verify the flag helper detects it correctly
        if (quality_review && quality_review.risk_flags.some(f => f.severity === 'critical')) {
          expect(hasCriticalRiskFlag(quality_review.risk_flags)).toBe(true)
          if (expected.error_code) {
            expect(expected.error_code).toBe('HRB_010')
          }
        }
      }

      else if (action === 'regenerate') {
        // Regeneration scenarios verify the fixture structure is correct
        // Actual regeneration is an I/O operation tested via integration
        // We verify the fixture is coherent
        expect(expected.activity_event_type).toBe('HRB_ACTION_REGENERATION_REQUESTED')
      }

      // Guardrail checks — all fixtures must have these
      expect(expected.no_email_draft_created).toBe(true)
      expect(expected.no_approval_request_created).toBe(true)
      expect(expected.no_send_triggered).toBe(true)
    })
  }
})
