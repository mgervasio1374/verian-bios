// ============================================================
// Phase 3B — Send / Email Draft Bridge Service
// Orchestration layer: validation → write sequence → audit.
//
// Guardrails enforced here:
//   - No Resend call
//   - No email_sends insert
//   - No sendApprovedDraftAction call
//   - No message_version modification
//   - No QRA modification
//   - Supersede runs LAST (after all writes succeed)
// ============================================================

import * as emailDraftRepo      from '@/modules/messaging/repositories/email-draft.repo'
import * as approvalRepo         from '@/modules/workflow/repositories/approval.repo'
import * as suppressionRepo      from '@/modules/messaging/repositories/suppression.repo'
import * as contactRepo          from '@/modules/crm/repositories/contact.repo'
import * as leadRepo             from '@/modules/crm/repositories/lead.repo'
import * as qrRepo               from '@/modules/messaging/repositories/quality-review.repo'
import * as versionRepo          from '@/modules/messaging/repositories/message-version.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'

import {
  validateDraftCreationEligibility,
} from './send-bridge.validation'
import {
  buildDraftCreatedPayload,
  buildDraftCreationBlockedPayload,
} from './send-bridge.audit'
import type {
  CreateDraftInput,
  DraftStatusResult,
  SendBridgeResult,
} from './send-bridge.types'
import { SEB_ERROR_CODES } from './send-bridge.types'

// ============================================================
// createEmailDraftFromApprovedVersion
//
// Full 17-step flow:
//   Steps 1–9  — validation (read-only, no writes)
//   Steps 10–17 — write phase (ordered for partial-failure safety)
//
// Write ordering (supersede runs LAST — see design Section 13.3):
//   11. INSERT email_draft (pending_approval)
//   12. INSERT approval_request (pending)
//   13. UPDATE email_draft.approval_request_id
//   14. RESOLVE approval_request → approved
//   15. UPDATE email_draft.status → approved
//   16. SUPERSEDE prior pending drafts for lead
//   17. Emit SEB_ACTION_DRAFT_CREATED activity event
// ============================================================

export async function createEmailDraftFromApprovedVersion(
  input: CreateDraftInput
): Promise<SendBridgeResult> {

  // ---- VALIDATION PHASE (read-only) ----

  // 1. Load version + strategy together
  const versionAndStrategy = await versionRepo.getVersionWithStrategy(
    input.versionId,
    input.tenantId
  )
  if (!versionAndStrategy) {
    await emitBlockedEvent({
      messageVersionId: input.versionId,
      strategyId:       input.strategyId,
      leadId:           input.leadId,
      userId:           input.userId,
      tenantId:         input.tenantId,
      workspaceId:      input.workspaceId,
      errorCode:        SEB_ERROR_CODES.TENANT_MISMATCH,
      errorReason:      'version_not_found_or_tenant_mismatch',
    })
    return { ok: false, error: SEB_ERROR_CODES.TENANT_MISMATCH, errorMessage: 'Version not found or tenant mismatch.' }
  }
  const { version, strategy } = versionAndStrategy

  // 2. Load latest non-superseded quality review for provenance (non-fatal if missing)
  const qrList = await qrRepo.listQualityReviewsForVersion(input.versionId, input.tenantId).catch(() => [])
  const qualityReview = qrList.find(r => !r.supersededAt) ?? null

  // 3. Load lead
  const lead = await leadRepo.getLead(input.leadId, input.tenantId)
  if (!lead) {
    await emitBlockedEvent({
      messageVersionId: input.versionId,
      strategyId:       input.strategyId,
      leadId:           input.leadId,
      userId:           input.userId,
      tenantId:         input.tenantId,
      workspaceId:      input.workspaceId,
      errorCode:        SEB_ERROR_CODES.TENANT_MISMATCH,
      errorReason:      'lead_not_found',
    })
    return { ok: false, error: SEB_ERROR_CODES.TENANT_MISMATCH, errorMessage: 'Lead not found.' }
  }

  // 4. Load contact (if linked)
  const contact = lead.contact_id
    ? await contactRepo.getContact(lead.contact_id, input.tenantId)
    : null

  // 5. Suppression check (run only if contact has email)
  const suppressionResult = (contact?.email)
    ? await suppressionRepo.checkEmailSuppression(input.tenantId, contact.email).catch(() => ({ blocked: false as const }))
    : { blocked: false as const }

  // 6. Sender identity
  const senderIdentity = await emailDraftRepo.getDefaultSenderIdentity(input.tenantId)

  // 7. Existing draft (duplicate guard)
  const existingDraft = await emailDraftRepo.getEmailDraftForVersion(input.versionId, input.tenantId)

  // 8. Run pure validation (all 14 gates in order)
  const eligibility = validateDraftCreationEligibility({
    version: {
      id:              version.id,
      tenant_id:       version.tenant_id,
      strategy_id:     version.strategy_id,
      version_label:   version.version_label,
      subject_line:    version.subject_line,
      body_text:       version.body_text,
      body_html:       version.body_html,
      approval_status: version.approval_status,
      reviewed_by:     version.reviewed_by,
      reviewed_at:     version.reviewed_at,
    },
    strategy: {
      id:           strategy.id,
      tenant_id:    strategy.tenant_id,
      lead_id:      strategy.lead_id,
      message_type: strategy.message_type,
      status:       strategy.status,
    },
    lead:              { contact_id: lead.contact_id },
    contact:           contact ? {
      id:             contact.id,
      email:          contact.email ?? null,
      first_name:     contact.first_name ?? null,
      last_name:      contact.last_name ?? null,
      do_not_contact: contact.do_not_contact ?? false,
    } : null,
    senderIdentity:    senderIdentity ? {
      id:    senderIdentity.id,
      name:  senderIdentity.name,
      email: senderIdentity.email,
    } : null,
    existingDraft:     existingDraft ? { id: existingDraft.id, status: existingDraft.status } : null,
    suppressionResult,
    hasPermission:     true, // already checked at action layer
    requestTenantId:   input.tenantId,
  })

  if (!eligibility.allowed) {
    await emitBlockedEvent({
      messageVersionId: input.versionId,
      strategyId:       input.strategyId,
      leadId:           input.leadId,
      userId:           input.userId,
      tenantId:         input.tenantId,
      workspaceId:      input.workspaceId,
      errorCode:        eligibility.error!,
      errorReason:      eligibility.errorMessage ?? eligibility.error!,
    })
    return {
      ok:           false,
      error:        eligibility.error!,
      errorMessage: eligibility.errorMessage ?? undefined,
    }
  }

  // ---- WRITE PHASE (ordered for partial-failure safety) ----

  const now = new Date().toISOString()

  // 10. Build ai_generation_metadata payload
  const aiGenerationMetadata: Record<string, unknown> = {
    source:                 'phase_3b_send_bridge',
    message_version_id:     input.versionId,
    strategy_id:            input.strategyId,
    quality_review_id:      qualityReview?.id ?? null,
    version_label:          version.version_label,
    composite_score:        qualityReview?.compositeScore ?? null,
    score_band:             qualityReview?.scoreBand ?? null,
    is_recommended:         qualityReview?.isRecommended ?? null,
    approved_by:            version.reviewed_by,
    approved_at:            version.reviewed_at,
    override_reason:        null,
    risk_flags_at_approval: qualityReview?.riskFlags ?? [],
    reason_created:         'phase_3b_hrb_approval',
    generated_at:           now,
  }

  const toName = [contact!.first_name, contact!.last_name]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ') || null

  // 11. INSERT email_draft (status = pending_approval)
  const draft = await emailDraftRepo.createEmailDraft({
    tenantId:             input.tenantId,
    workspaceId:          input.workspaceId,
    senderIdentityId:     senderIdentity!.id,
    templateId:           null,
    toEmail:              contact!.email!,
    toName,
    subject:              version.subject_line!,
    bodyHtml:             null,
    bodyText:             version.body_text,
    status:               'pending_approval',
    leadId:               input.leadId,
    contactId:            lead.contact_id,
    companyId:            lead.company_id,
    workflowRunId:        null,
    generatedByAi:        true,
    aiGenerationMetadata,
  })

  // 12. INSERT approval_request (status = pending)
  const approvalRequest = await approvalRepo.createApprovalRequest({
    tenantId:    input.tenantId,
    workspaceId: input.workspaceId,
    requestType: 'email_draft_review',
    subjectType: 'lead',
    subjectId:   input.leadId,
    payload: {
      draft_id:          draft.id,
      message_version_id: input.versionId,
      hrb_approved_by:   version.reviewed_by,
      hrb_approved_at:   version.reviewed_at,
      strategy_id:       input.strategyId,
      quality_review_id: qualityReview?.id ?? null,
      composite_score:   qualityReview?.compositeScore ?? null,
    },
  })

  // 13. UPDATE email_draft.approval_request_id = new approval_request.id
  await emailDraftRepo.linkApprovalToEmailDraft(draft.id, approvalRequest.id)

  // 14. RESOLVE approval_request → approved
  // HRB approval is the human gate; this auto-resolution satisfies the Phase 3A double-gate.
  await approvalRepo.resolveApprovalRequest(
    approvalRequest.id,
    input.tenantId,
    input.userId,
    'approved',
    { hrb_authority: true, message_version_id: input.versionId }
  )

  // 15. SYNC email_draft.status → approved
  // Calls updateDraftStatus directly (same effect as syncApprovalDecisionToDraft
  // but without requiring a full RequestContext construction).
  await emailDraftRepo.updateDraftStatus(draft.id, {
    status:          'approved',
    approvedAt:      now,
    approvedBy:      input.userId,
    ifCurrentStatus: 'pending_approval',
  })

  // 16. SUPERSEDE prior pending/pending_approval drafts for lead (runs last)
  // Only runs after all previous writes succeed, so the lead is never left without a usable draft.
  const supersededIds = await emailDraftRepo.supersedePendingDraftsForLead(
    input.tenantId,
    input.leadId
  )

  // 17. Emit SEB_ACTION_DRAFT_CREATED activity event (non-fatal)
  await activityEventService.recordActivity({
    tenantId:     input.tenantId,
    workspaceId:  input.workspaceId,
    eventType:    'SEB_ACTION_DRAFT_CREATED',
    entityType:   'message_version',
    entityId:     input.versionId,
    eventSummary: `Reviewer ${input.userId} created email draft from approved version ${version.version_label}`,
    leadId:       input.leadId,
    contactId:    lead.contact_id ?? undefined,
    metadata:     buildDraftCreatedPayload({
      draftId:             draft.id,
      messageVersionId:    input.versionId,
      strategyId:          input.strategyId,
      qualityReviewId:     qualityReview?.id ?? null,
      leadId:              input.leadId,
      contactId:           lead.contact_id ?? null,
      userId:              input.userId,
      supersededDraftIds:  supersededIds,
    }) as unknown as Record<string, unknown>,
  }).catch(() => {})

  return { ok: true, draftId: draft.id }
}

// ============================================================
// getDraftStatusForVersion
// Read-only: returns the most recent draft for a version (or null).
// Used by the page loader to surface draft state in the UI.
// ============================================================

export async function getDraftStatusForVersion(
  versionId: string,
  tenantId:  string
): Promise<DraftStatusResult | null> {
  const draft = await emailDraftRepo.getEmailDraftForVersion(versionId, tenantId)
  if (!draft) return null
  return { draftId: draft.id, status: draft.status }
}

// ---- Internal helper: emit a blocked activity event (non-fatal) ----

async function emitBlockedEvent(params: {
  messageVersionId: string
  strategyId:       string
  leadId:           string
  userId:           string
  tenantId:         string
  workspaceId:      string
  errorCode:        string
  errorReason:      string
}): Promise<void> {
  await activityEventService.recordActivity({
    tenantId:     params.tenantId,
    workspaceId:  params.workspaceId,
    eventType:    'SEB_ACTION_DRAFT_CREATION_BLOCKED',
    entityType:   'message_version',
    entityId:     params.messageVersionId,
    eventSummary: `Draft creation blocked for version: ${params.errorCode}`,
    leadId:       params.leadId,
    metadata:     buildDraftCreationBlockedPayload({
      messageVersionId: params.messageVersionId,
      strategyId:       params.strategyId,
      leadId:           params.leadId,
      userId:           params.userId,
      errorCode:        params.errorCode as import('./send-bridge.types').SebErrorCode,
      errorReason:      params.errorReason,
    }) as unknown as Record<string, unknown>,
  }).catch(() => {})
}
