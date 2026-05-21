// ============================================================
// Phase 3B — Human Review / Approval Bridge Validation
// Pure functions ONLY — no I/O, no async, no side effects.
// All gate conditions for approval, selection, and rejection.
// ============================================================

import {
  HRB_ERROR_CODES,
  VALID_REJECTION_REASONS,
} from './human-review.types'
import type {
  HumanReviewVersion,
  HumanReviewStrategy,
  HumanReviewQualityReview,
  HumanReviewSystemControls,
  ApprovalEligibilityResult,
} from './human-review.types'

// ---- Risk flag helpers ----

export function hasCriticalRiskFlag(
  riskFlags: Array<{ severity: string }>
): boolean {
  return riskFlags.some(f => f.severity === 'critical')
}

export function hasHighRiskFlag(
  riskFlags: Array<{ severity: string }>
): boolean {
  return riskFlags.some(f => f.severity === 'high')
}

// ---- Strategy status helper ----

export function isStrategyActive(strategy: { status: string }): boolean {
  return (
    strategy.status === 'draft' ||
    strategy.status === 'approved' ||
    strategy.status === 'in_use'
  )
}

// ---- Select eligibility ----

// Checks that a version is eligible for selection.
// Returns { allowed: true } or { allowed: false, error: HRB_xxx }.
export function validateSelectEligibility(
  version:  HumanReviewVersion,
  strategy: HumanReviewStrategy,
): { allowed: boolean; error: string | null } {
  // Version must not be superseded
  if (version.approval_status === 'superseded') {
    return { allowed: false, error: HRB_ERROR_CODES.VERSION_SUPERSEDED }
  }

  // Version must not be rejected
  if (version.approval_status === 'rejected') {
    return { allowed: false, error: HRB_ERROR_CODES.VERSION_REJECTED }
  }

  // Version must not be already approved (cannot select an approved version)
  if (version.approval_status === 'approved') {
    return { allowed: false, error: HRB_ERROR_CODES.VERSION_ALREADY_APPROVED }
  }

  // Strategy must be active
  if (!isStrategyActive(strategy)) {
    return { allowed: false, error: HRB_ERROR_CODES.NO_ACTIVE_STRATEGY }
  }

  return { allowed: true, error: null }
}

// ---- Reject eligibility ----

// Checks that a version is eligible for rejection.
// Returns { allowed: true } or { allowed: false, error: HRB_xxx }.
export function validateRejectEligibility(
  version:         HumanReviewVersion,
  rejectionReason: string,
): { allowed: boolean; error: string | null } {
  // Version must not be superseded
  if (version.approval_status === 'superseded') {
    return { allowed: false, error: HRB_ERROR_CODES.VERSION_SUPERSEDED }
  }

  // Version must not be already rejected
  if (version.approval_status === 'rejected') {
    return { allowed: false, error: HRB_ERROR_CODES.VERSION_REJECTED }
  }

  // Rejection reason must be valid
  if (!VALID_REJECTION_REASONS.has(rejectionReason)) {
    return { allowed: false, error: HRB_ERROR_CODES.VERSION_CONTENT_MISSING }
  }

  return { allowed: true, error: null }
}

// ---- Approval eligibility ----

// Full gate check: 18 conditions in order.
// Returns the first failing condition or { allowed: true }.
// HRB_014 (permission) is enforced at the action layer — pass hasPermission = true
// to skip the permission check in the pure function.
export function validateApprovalEligibility(
  version:                 HumanReviewVersion | null,
  strategy:                HumanReviewStrategy | null,
  qualityReview:           HumanReviewQualityReview | null,
  existingApprovedVersion: HumanReviewVersion | null,
  systemControls:          HumanReviewSystemControls,
  options: {
    overrideReason?:   string
    riskAcknowledged?: boolean
    hasPermission?:    boolean
  } = {},
): ApprovalEligibilityResult {
  // 1. Version exists — HRB_001
  if (!version) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.VERSION_NOT_FOUND,
      errorMessage: 'Version record not found. Verify version ID and refresh.',
    }
  }

  // 2. Strategy exists — HRB_003 (checked before tenant to give useful error)
  if (!strategy) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.STRATEGY_NOT_FOUND,
      errorMessage: 'Strategy record not found. Verify strategy ID and refresh.',
    }
  }

  // Tenant mismatch — HRB_002 (version tenant vs strategy tenant)
  if (version.tenant_id !== strategy.tenant_id) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.TENANT_MISMATCH,
      errorMessage: 'Tenant mismatch between version and strategy. Authentication issue.',
    }
  }

  // 4. Strategy superseded — HRB_004
  if (strategy.status === 'superseded') {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.STRATEGY_SUPERSEDED,
      errorMessage: 'Strategy is superseded. Generate a new strategy.',
    }
  }

  // 5. Strategy has blocking invalid_reasons — HRB_005
  if (strategy.invalid_reasons && strategy.invalid_reasons.length > 0) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.STRATEGY_INVALID,
      errorMessage: 'Strategy has blocking validation errors. Fix strategy first.',
    }
  }

  // 6. Version superseded — HRB_006
  if (version.approval_status === 'superseded') {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.VERSION_SUPERSEDED,
      errorMessage: 'Version is superseded. Select a current version.',
    }
  }

  // 7. Version rejected — HRB_007
  if (version.approval_status === 'rejected') {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.VERSION_REJECTED,
      errorMessage: 'Version is rejected. Cannot reopen in v1. Request regeneration.',
    }
  }

  // 8. Version already approved — HRB_008
  if (version.approval_status === 'approved') {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.VERSION_ALREADY_APPROVED,
      errorMessage: 'Version is already approved.',
    }
  }

  // 9. QRA missing or all superseded — HRB_009
  if (!qualityReview || qualityReview.superseded_at !== null) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.QUALITY_REVIEW_MISSING,
      errorMessage: 'No active quality review found. Run Quality Review first.',
    }
  }

  // 10. Critical risk flag — HRB_010 (no override in v1)
  if (hasCriticalRiskFlag(qualityReview.risk_flags)) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.CRITICAL_RISK_PRESENT,
      errorMessage: 'Critical risk flag present. Cannot approve. Resolve the flagged issue or reject and regenerate.',
    }
  }

  // 11. High risk, not acknowledged — HRB_011
  if (hasHighRiskFlag(qualityReview.risk_flags) && options.riskAcknowledged !== true) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.HIGH_RISK_NOT_ACKNOWLEDGED,
      errorMessage: 'High-severity risk flags present. Confirm risk acknowledgement in the approval modal.',
    }
  }

  // 12. Subject or body missing — HRB_012
  if (!version.subject_line || version.subject_line.trim() === '' ||
      !version.body_text    || version.body_text.trim()    === '') {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.VERSION_CONTENT_MISSING,
      errorMessage: 'Version body_text or subject_line is empty. Version is incomplete.',
    }
  }

  // 13. body_html non-null — HRB_013
  if (version.body_html !== null) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.BODY_HTML_POPULATED,
      errorMessage: 'body_html must be null in v1. Contact support.',
    }
  }

  // 14. User permission — HRB_014 (enforced at action layer; checked via hasPermission param)
  if (options.hasPermission === false) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.PERMISSION_DENIED,
      errorMessage: 'User lacks required permission. Request permission from workspace admin.',
    }
  }

  // 15. global_agent_pause — HRB_015
  if (systemControls.global_agent_pause) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.AGENT_PAUSED,
      errorMessage: 'Agent is paused. Check System Controls.',
    }
  }

  // 16. Low score without override — HRB_016
  if (qualityReview.composite_score < 70 &&
      (!options.overrideReason || options.overrideReason.trim() === '')) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.LOW_SCORE_NO_OVERRIDE,
      errorMessage: `Version scores ${qualityReview.composite_score}/100, below threshold of 70. Provide an override reason.`,
    }
  }

  // 17. No active strategy — HRB_017 (strategy exists but is not active)
  if (!isStrategyActive(strategy)) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.NO_ACTIVE_STRATEGY,
      errorMessage: 'No active strategy. Generate a strategy first.',
    }
  }

  // 18. Existing approved version — HRB_018
  if (existingApprovedVersion && existingApprovedVersion.id !== version.id) {
    return {
      allowed:      false,
      error:        HRB_ERROR_CODES.EXISTING_APPROVED_VERSION,
      errorMessage: 'Another version under this strategy is already approved. One approved version per strategy in v1.',
    }
  }

  return { allowed: true, error: null, errorMessage: null }
}
