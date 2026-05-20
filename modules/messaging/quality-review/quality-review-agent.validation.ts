// ============================================================
// Phase 3B — Quality Review Agent Validation
// Gate checks and per-version eligibility validation.
// Pure functions. No I/O.
// ============================================================

import { QRA_ERROR_CODES } from './quality-review-agent.types'
import type { QualityReviewError } from './quality-review-agent.types'

// ---- Per-version eligibility check ----

export function checkVersionEligibility(
  version: {
    id:                    string
    strategyId:            string
    tenantId:              string
    bodyText:              string
    subjectLine:           string
    bodyHtml:              unknown
    approvalStatus:        string
    complianceNotesApplied:string[]
  },
  targetStrategyId:       string,
  targetTenantId:         string,
  existingReviewVersionIds:Set<string>,
  forceRerun:             boolean
): QualityReviewError | null {
  // QRA_013: superseded version
  if (version.approvalStatus === 'superseded') {
    return {
      code:         QRA_ERROR_CODES.QRA_013,
      message:      `Version ${version.id} is superseded.`,
      blocking:     false,
      suggestedFix: 'Only review active versions.',
    }
  }

  // QRA_010: wrong tenant
  if (version.tenantId !== targetTenantId) {
    return {
      code:         QRA_ERROR_CODES.QRA_010,
      message:      `Version ${version.id} belongs to a different tenant.`,
      blocking:     false,
      suggestedFix: 'Ensure version belongs to the correct tenant.',
    }
  }

  // QRA_009: wrong strategy
  if (version.strategyId !== targetStrategyId) {
    return {
      code:         QRA_ERROR_CODES.QRA_009,
      message:      `Version ${version.id} belongs to a different strategy.`,
      blocking:     false,
      suggestedFix: 'Ensure version belongs to the target strategy.',
    }
  }

  // QRA_005: already has a non-superseded review (and force=false)
  if (!forceRerun && existingReviewVersionIds.has(version.id)) {
    return {
      code:         QRA_ERROR_CODES.QRA_005,
      message:      `Version ${version.id} already has an active quality review.`,
      blocking:     false,
      suggestedFix: 'Use force=true to re-run review for this version.',
    }
  }

  // QRA_008: body_html populated (v1 invariant violated)
  if (version.bodyHtml !== null && version.bodyHtml !== undefined) {
    return {
      code:         QRA_ERROR_CODES.QRA_008,
      message:      `Version ${version.id} has body_html populated — v1 invariant violated.`,
      blocking:     false,
      suggestedFix: 'Remove body_html from this version before review.',
    }
  }

  // QRA_006: subject line empty
  if (!version.subjectLine || version.subjectLine.trim().length === 0) {
    return {
      code:         QRA_ERROR_CODES.QRA_006,
      message:      `Version ${version.id} has an empty subject line.`,
      blocking:     false,
      suggestedFix: 'Ensure subject line is populated.',
    }
  }

  // QRA_007: body text empty
  if (!version.bodyText || version.bodyText.trim().length === 0) {
    return {
      code:         QRA_ERROR_CODES.QRA_007,
      message:      `Version ${version.id} has empty body text.`,
      blocking:     false,
      suggestedFix: 'Ensure body text is populated.',
    }
  }

  // QRA_012: structural failure — body too short
  if (version.bodyText.trim().length < 20) {
    return {
      code:         QRA_ERROR_CODES.QRA_012,
      message:      `Version ${version.id} body text is too short (< 20 characters) — structural failure.`,
      blocking:     false,
      suggestedFix: 'Body text must be at least 20 characters.',
    }
  }

  return null
}

// ---- Full input validation ----

export function validateQualityReviewInputs(
  strategy: { invalidReasons: unknown[]; id: string } | null,
  versions: Array<{
    id:                    string
    strategyId:            string
    tenantId:              string
    bodyText:              string
    subjectLine:           string
    bodyHtml:              unknown
    approvalStatus:        string
    complianceNotesApplied:string[]
  }>,
  systemControls: {
    emailGenerationEngine: string | null
    globalAgentPause:      boolean
  },
  targetStrategyId:        string,
  targetTenantId:          string,
  existingReviewVersionIds:Set<string>,
  forceRerun:              boolean
): {
  blockingErrors: QualityReviewError[]
  versionErrors:  Map<string, QualityReviewError>
} {
  const blockingErrors: QualityReviewError[] = []
  const versionErrors  = new Map<string, QualityReviewError>()

  // QRA_001: strategy not found
  if (!strategy) {
    blockingErrors.push({
      code:         QRA_ERROR_CODES.QRA_001,
      message:      'Strategy not found.',
      blocking:     true,
      suggestedFix: 'Check strategy_id and tenant.',
    })
    return { blockingErrors, versionErrors }
  }

  // QRA_011: strategy has blocking invalid_reasons
  const invalidReasons = strategy.invalidReasons ?? []
  if (Array.isArray(invalidReasons) && invalidReasons.some((r: unknown) => {
    if (typeof r === 'object' && r !== null && 'blocking' in r) {
      return (r as { blocking: boolean }).blocking === true
    }
    return false
  })) {
    blockingErrors.push({
      code:         QRA_ERROR_CODES.QRA_011,
      message:      'Strategy has blocking invalid_reasons — resolve before running quality review.',
      blocking:     true,
      suggestedFix: 'Resolve strategy invalid_reasons.',
    })
  }

  // QRA_003: global agent pause
  if (systemControls.globalAgentPause) {
    blockingErrors.push({
      code:         QRA_ERROR_CODES.QRA_003,
      message:      'Global agent pause is active.',
      blocking:     true,
      suggestedFix: 'Disable global_agent_pause control.',
    })
  }

  // QRA_004: phase 3B not enabled
  if (!systemControls.emailGenerationEngine || systemControls.emailGenerationEngine !== 'phase3b') {
    blockingErrors.push({
      code:         QRA_ERROR_CODES.QRA_004,
      message:      'Phase 3B email generation engine is not enabled.',
      blocking:     true,
      suggestedFix: 'Set email_generation_engine control to "phase3b".',
    })
  }

  // QRA_002: no versions
  if (versions.length === 0) {
    blockingErrors.push({
      code:         QRA_ERROR_CODES.QRA_002,
      message:      'No message versions found for strategy.',
      blocking:     true,
      suggestedFix: 'Generate message versions before running quality review.',
    })
    return { blockingErrors, versionErrors }
  }

  // Per-version checks
  for (const version of versions) {
    const err = checkVersionEligibility(
      version,
      targetStrategyId,
      targetTenantId,
      existingReviewVersionIds,
      forceRerun
    )
    if (err) {
      versionErrors.set(version.id, err)
    }
  }

  return { blockingErrors, versionErrors }
}
