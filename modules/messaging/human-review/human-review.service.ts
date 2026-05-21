// ============================================================
// Phase 3B — Human Review / Approval Bridge Service
// Orchestration functions: select, reject, approve, event recording.
// All functions have I/O. All validate before acting.
// Uses Supabase service-role client via repo layer.
// Does NOT send email, create email_drafts, create approval_requests.
// ============================================================

import * as versionRepo from '@/modules/messaging/repositories/message-version.repo'
import * as qrRepo      from '@/modules/messaging/repositories/quality-review.repo'
import * as scRepo      from '@/modules/intelligence/repositories/system-control.repo'
import * as actSvc      from '@/modules/intelligence/services/activity-event.service'

import {
  validateSelectEligibility,
  validateRejectEligibility,
  validateApprovalEligibility as validateApprovalEligibilityPure,
} from './human-review.validation'

import {
  buildSelectEventPayload,
  buildDeselectEventPayload,
  buildRejectEventPayload,
  buildApproveEventPayload,
  buildRegenerationRequestedPayload,
} from './human-review.audit'

import type {
  SelectVersionInput,
  RejectVersionInput,
  ApproveVersionInput,
  RegenerationRequestInput,
  HumanReviewResult,
  ApprovalEligibilityResult,
  HumanReviewEventPayload,
  HumanReviewVersion,
  HumanReviewStrategy,
  HumanReviewQualityReview,
} from './human-review.types'

// ---- Internal helpers ----

function toHumanReviewVersion(
  row: versionRepo.HumanReviewVersionRow
): HumanReviewVersion {
  return {
    id:               row.id,
    tenant_id:        row.tenant_id,
    strategy_id:      row.strategy_id,
    version_label:    row.version_label,
    subject_line:     row.subject_line,
    body_text:        row.body_text,
    body_html:        row.body_html,
    approval_status:  row.approval_status,
    reviewed_by:      row.reviewed_by,
    reviewed_at:      row.reviewed_at,
    rejection_reason: row.rejection_reason,
  }
}

function toHumanReviewStrategy(
  row: versionRepo.HumanReviewStrategyRow
): HumanReviewStrategy {
  return {
    id:                   row.id,
    tenant_id:            row.tenant_id,
    lead_id:              row.lead_id,
    message_type:         row.message_type,
    status:               row.status,
    invalid_reasons:      row.invalid_reasons ?? [],
    requires_human_review:row.requires_human_review,
  }
}

function toHumanReviewQualityReview(
  qr: import('@/modules/messaging/quality-review/quality-review-agent.types').QualityReview
): HumanReviewQualityReview {
  return {
    id:             qr.id,
    tenant_id:      qr.tenantId,
    version_id:     qr.versionId,
    strategy_id:    qr.strategyId,
    composite_score:qr.compositeScore,
    score_band:     qr.scoreBand,
    is_recommended: qr.isRecommended,
    risk_flags:     qr.riskFlags.map(f => ({
      code:     f.code,
      severity: f.severity,
      message:  f.message,
    })),
    superseded_at:  qr.supersededAt,
  }
}

async function loadActiveQualityReview(
  versionId: string,
  tenantId:  string,
): Promise<HumanReviewQualityReview | null> {
  const reviews = await qrRepo.listQualityReviewsForVersion(versionId, tenantId)
  const active  = reviews.find(r => !r.supersededAt)
  return active ? toHumanReviewQualityReview(active) : null
}

async function loadSystemControls(tenantId: string) {
  const pause = await scRepo.getBooleanControl('global_agent_pause', tenantId, false)
  return { global_agent_pause: pause }
}

// ---- Select version ----

export async function selectVersion(
  input: SelectVersionInput
): Promise<HumanReviewResult> {
  try {
    // 1. Load version + strategy
    const pair = await versionRepo.getVersionWithStrategy(input.versionId, input.tenantId)
    if (!pair) {
      return {
        success:      false,
        error:        'HRB_001',
        errorMessage: 'Version not found.',
      }
    }

    const version  = toHumanReviewVersion(pair.version)
    const strategy = toHumanReviewStrategy(pair.strategy)

    // 2. Validate
    const check = validateSelectEligibility(version, strategy)
    if (!check.allowed) {
      return {
        success:      false,
        error:        check.error as HumanReviewResult['error'],
        errorMessage: `Select blocked: ${check.error}`,
      }
    }

    const now = new Date().toISOString()

    // 3. Find prior selected version for audit
    const priorSelected = await versionRepo.getSelectedVersion(input.strategyId, input.tenantId)
    const priorSelectedId = priorSelected ? priorSelected.id : null

    // 4. Deselect other versions
    await versionRepo.deselectOtherVersions(input.strategyId, input.versionId, input.tenantId)

    // 5. Set this version to selected
    await versionRepo.setVersionApprovalStatus(
      input.versionId, 'selected', input.userId, now, input.tenantId
    )

    // 6. Record DESELECTED event for prior version if any
    if (priorSelectedId && priorSelectedId !== input.versionId) {
      const deselectPayload = buildDeselectEventPayload({
        versionId:           priorSelectedId,
        strategyId:          input.strategyId,
        versionLabel:        priorSelected?.version_label ?? '',
        newSelectedVersionId:input.versionId,
        userId:              input.userId,
      })
      await recordReviewEvent(deselectPayload, input.tenantId)
    }

    // 7. Record SELECTED event
    const selectPayload = buildSelectEventPayload({
      versionId:              input.versionId,
      strategyId:             input.strategyId,
      versionLabel:           version.version_label,
      previousStatus:         version.approval_status,
      userId:                 input.userId,
      priorSelectedVersionId: priorSelectedId,
      selectReason:           input.selectReason,
    })
    await recordReviewEvent(selectPayload, input.tenantId)

    return { success: true, versionId: input.versionId, newStatus: 'selected' }
  } catch (err) {
    return {
      success:      false,
      error:        'HRB_001' as HumanReviewResult['error'],
      errorMessage: err instanceof Error ? err.message : 'Unknown error in selectVersion',
    }
  }
}

// ---- Reject version ----

export async function rejectVersion(
  input: RejectVersionInput
): Promise<HumanReviewResult> {
  try {
    // 1. Load version + strategy
    const pair = await versionRepo.getVersionWithStrategy(input.versionId, input.tenantId)
    if (!pair) {
      return {
        success:      false,
        error:        'HRB_001',
        errorMessage: 'Version not found.',
      }
    }

    const version = toHumanReviewVersion(pair.version)

    // 2. Validate
    const check = validateRejectEligibility(version, input.rejectionReason)
    if (!check.allowed) {
      return {
        success:      false,
        error:        check.error as HumanReviewResult['error'],
        errorMessage: `Reject blocked: ${check.error}`,
      }
    }

    const now = new Date().toISOString()

    // 3. Update approval_status
    await versionRepo.setVersionApprovalStatus(
      input.versionId, 'rejected', input.userId, now, input.tenantId
    )

    // 4. Set rejection_reason
    await versionRepo.setVersionRejectionReason(
      input.versionId, input.rejectionReason, input.tenantId
    )

    // 5. Record REJECTED event
    const rejectPayload = buildRejectEventPayload({
      versionId:       input.versionId,
      strategyId:      input.strategyId,
      versionLabel:    version.version_label,
      previousStatus:  version.approval_status,
      rejectionReason: input.rejectionReason,
      reviewerNote:    input.reviewerNote,
      userId:          input.userId,
    })
    await recordReviewEvent(rejectPayload, input.tenantId)

    return { success: true, versionId: input.versionId, newStatus: 'rejected' }
  } catch (err) {
    return {
      success:      false,
      error:        'HRB_001' as HumanReviewResult['error'],
      errorMessage: err instanceof Error ? err.message : 'Unknown error in rejectVersion',
    }
  }
}

// ---- Approve version for next step ----
// Does NOT send email. Does NOT create email_draft. Does NOT create approval_request.

export async function approveVersionForNextStep(
  input: ApproveVersionInput
): Promise<HumanReviewResult> {
  try {
    // 1. Load version + strategy
    const pair = await versionRepo.getVersionWithStrategy(input.versionId, input.tenantId)
    if (!pair) {
      return {
        success:      false,
        error:        'HRB_001',
        errorMessage: 'Version not found.',
      }
    }

    const version  = toHumanReviewVersion(pair.version)
    const strategy = toHumanReviewStrategy(pair.strategy)

    // 2. Load active quality review
    const qualityReview = await loadActiveQualityReview(input.versionId, input.tenantId)

    // 3. Load existing approved version (for HRB_018)
    const existingApproved = await versionRepo.getApprovedVersion(input.strategyId, input.tenantId)
    const existingApprovedVersion = existingApproved
      ? toHumanReviewVersion(existingApproved)
      : null

    // 4. Load system controls
    const systemControls = await loadSystemControls(input.tenantId)

    // 5. Full gate check
    const eligibility = validateApprovalEligibilityPure(
      version,
      strategy,
      qualityReview,
      existingApprovedVersion,
      systemControls,
      {
        overrideReason:   input.overrideReason,
        riskAcknowledged: input.riskAcknowledged,
        hasPermission:    true, // permission checked at action layer
      }
    )

    if (!eligibility.allowed) {
      return {
        success:      false,
        error:        eligibility.error as HumanReviewResult['error'],
        errorMessage: eligibility.errorMessage ?? undefined,
      }
    }

    const now = new Date().toISOString()

    // 6. Update approval_status — this is all the bridge writes to message_versions
    await versionRepo.setVersionApprovalStatus(
      input.versionId, 'approved', input.userId, now, input.tenantId
    )

    // 7. Record APPROVED event with full snapshot
    const approvePayload = buildApproveEventPayload({
      versionId:             input.versionId,
      strategyId:            input.strategyId,
      versionLabel:          version.version_label,
      previousStatus:        version.approval_status,
      userId:                input.userId,
      compositeScoreAtAction:qualityReview!.composite_score,
      scoreBandAtAction:     qualityReview!.score_band,
      isRecommendedAtAction: qualityReview!.is_recommended,
      riskFlagsAtAction:     qualityReview!.risk_flags,
      riskAcknowledged:      input.riskAcknowledged === true,
      overrideReason:        input.overrideReason,
    })
    await recordReviewEvent(approvePayload, input.tenantId)

    return { success: true, versionId: input.versionId, newStatus: 'approved' }
  } catch (err) {
    return {
      success:      false,
      error:        'HRB_001' as HumanReviewResult['error'],
      errorMessage: err instanceof Error ? err.message : 'Unknown error in approveVersionForNextStep',
    }
  }
}

// ---- Validate approval eligibility (no side effects) ----

export async function checkApprovalEligibility(
  versionId: string,
  tenantId:  string,
  options: { overrideReason?: string; riskAcknowledged?: boolean } = {}
): Promise<ApprovalEligibilityResult> {
  try {
    const pair = await versionRepo.getVersionWithStrategy(versionId, tenantId)
    if (!pair) {
      return {
        allowed:      false,
        error:        'HRB_001',
        errorMessage: 'Version not found.',
      }
    }

    const version  = toHumanReviewVersion(pair.version)
    const strategy = toHumanReviewStrategy(pair.strategy)

    const qualityReview = await loadActiveQualityReview(versionId, tenantId)

    const existingApproved = await versionRepo.getApprovedVersion(pair.version.strategy_id, tenantId)
    const existingApprovedVersion = existingApproved
      ? toHumanReviewVersion(existingApproved)
      : null

    const systemControls = await loadSystemControls(tenantId)

    return validateApprovalEligibilityPure(
      version,
      strategy,
      qualityReview,
      existingApprovedVersion,
      systemControls,
      { ...options, hasPermission: true }
    )
  } catch (err) {
    return {
      allowed:      false,
      error:        'HRB_001',
      errorMessage: err instanceof Error ? err.message : 'Eligibility check failed.',
    }
  }
}

// ---- Get selected version ----

export async function getSelectedVersionForStrategy(
  strategyId: string,
  tenantId:   string,
): Promise<HumanReviewVersion | null> {
  const row = await versionRepo.getSelectedVersion(strategyId, tenantId)
  return row ? toHumanReviewVersion(row) : null
}

// ---- Get approved version ----

export async function getApprovedVersionForStrategy(
  strategyId: string,
  tenantId:   string,
): Promise<HumanReviewVersion | null> {
  const row = await versionRepo.getApprovedVersion(strategyId, tenantId)
  return row ? toHumanReviewVersion(row) : null
}

// ---- Record review event (writes to activity_events) ----

export async function recordReviewEvent(
  payload:  HumanReviewEventPayload,
  tenantId: string,
): Promise<void> {
  await actSvc.recordActivity({
    tenantId,
    eventType:    payload.action_type,
    eventSource:  'human_review_bridge',
    entityType:   payload.version_id ? 'message_version' : 'message_strategy',
    entityId:     payload.version_id ?? payload.strategy_id,
    eventSummary: buildEventSummary(payload),
    metadata:     payload as unknown as Record<string, unknown>,
  })
}

// ---- Request version regeneration ----
// Delegates copy generation to the Copywriting Agent.
// Bridge does not generate copy itself.

export async function requestVersionRegeneration(
  input:         RegenerationRequestInput,
  workspaceSlug: string,
): Promise<HumanReviewResult> {
  try {
    // Dynamically import to avoid circular dependency
    const { generateMessageVersionsAction } = await import(
      '@/modules/messaging/actions/copywriting-agent.actions'
    )

    const result = await generateMessageVersionsAction(
      input.strategyId,
      input.leadId,
      workspaceSlug,
      true // forceRegenerate
    )

    // Record the regeneration request event
    const payload = buildRegenerationRequestedPayload({
      strategyId:       input.strategyId,
      userId:           input.userId,
      regenerationNote: input.regenerationNote,
    })
    await recordReviewEvent(payload, input.tenantId)

    if (!result.success) {
      return {
        success:      false,
        error:        'HRB_001' as HumanReviewResult['error'],
        errorMessage: result.errors?.[0]?.message ?? 'Regeneration failed.',
      }
    }

    return { success: true }
  } catch (err) {
    return {
      success:      false,
      error:        'HRB_001' as HumanReviewResult['error'],
      errorMessage: err instanceof Error ? err.message : 'Unknown error in requestVersionRegeneration',
    }
  }
}

// ---- Internal: build human-readable event summary ----

function buildEventSummary(payload: HumanReviewEventPayload): string {
  switch (payload.action_type) {
    case 'HRB_ACTION_SELECTED':
      return `Reviewer selected version ${payload.version_id ?? ''}`
    case 'HRB_ACTION_DESELECTED':
      return `Version deselected (replaced by new selection)`
    case 'HRB_ACTION_REJECTED':
      return `Reviewer rejected version (reason: ${payload.rejection_reason ?? 'unknown'})`
    case 'HRB_ACTION_APPROVED':
      return `Reviewer approved version for next step (score: ${payload.composite_score_at_action ?? '?'})`
    case 'HRB_ACTION_REGENERATION_REQUESTED':
      return `Reviewer requested version regeneration`
    case 'HRB_ACTION_RETURNED_TO_STRATEGY':
      return `Reviewer returned to strategy editing`
    default:
      return `Human review bridge action: ${payload.action_type}`
  }
}
