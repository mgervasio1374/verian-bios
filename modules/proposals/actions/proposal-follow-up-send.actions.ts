'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { sendApprovedDraft } from '@/modules/messaging/services/email-send.service'
import { checkDraftSendReadiness } from '@/modules/messaging/services/draft-send-readiness.service'
import { getEmailDraftForSending } from '@/modules/messaging/repositories/email-send.repo'
import { fetchCommitmentForDraftGeneration } from '@/modules/proposals/repositories/proposal-follow-up-draft.repo'
import { DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'
import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface SendFollowUpDraftActionInput {
  commitmentId?: string
}

export interface SendFollowUpDraftActionData {
  commitmentId: string
  draftId: string
  sendId: string
  resendMessageId: string | null
}

// ---------------------------------------------------------------------------
// Send an already-approved proposal follow-up email draft.
//
// Permission: messaging.send_emails
//   sendApprovedDraft already independently requires messaging.send_emails.
//   This action mirrors that send authority at the action layer.
//   crm.leads.edit is NOT sufficient for sending — it grants mutation rights
//   over commitment records but does not authorize email delivery.
//
// Input: { commitmentId } — NOT { draftId }
//   draftId is derived server-side from proposal_follow_up_commitments.draft_id.
//   This prevents this action from becoming a generic "send any approved draft
//   by ID" wrapper that bypasses proposal-follow-up context validation.
//
// Context validation (in order before sendApprovedDraft):
//   A. commitmentId present
//   B. commitment exists (tenant/workspace scoped)
//   C. commitment.draft_id non-null
//   D. draft exists (tenant/workspace scoped)
//   E. draft.subject_type = 'proposal_follow_up_commitment'
//   F. draft.subject_id = commitmentId
//   G. draft.source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP
//   H. draft.campaign_assignment_id = null (blocks campaign side-effect)
//   I. draft.superseded_at = null (fills gap in getEmailDraftForSending)
//   J. checkDraftSendReadiness (subject, body, approval_request_id, status)
//   K. sendApprovedDraft (feature flag gate, lifecycle double-gate, idempotency)
//
// Phase 3U hardening (ef8eb2f):
//   sendApprovedDraft now preserves provider-known send state via:
//   - getBlockingSendForDraft (blocks queued/sent/provider_accepted and failed+resend_message_id)
//   - provider_accepted intermediate status written immediately after provider success
//   - hardened catch block that writes top-level resendMessageId and preserves
//     provider_accepted status if local finalization subsequently fails
//   resend_message_id is no longer lost if Promise.all fails after provider success.
//   EMAIL_SENDING_ENABLED still remains the required delivery gate and must be
//   enabled only through a separate explicit production readiness step.
//
// This action does NOT:
//   - Call the email delivery provider directly
//   - Insert send records directly
//   - Write to commitment or proposal status fields
//   - Reference the campaign sending feature flag
//   - Reference or write the email sending feature flag (enforced by sendApprovedDraft)
//   - Call Complete / Skip / Reschedule actions
// ---------------------------------------------------------------------------

export async function sendFollowUpDraftAction(
  input: SendFollowUpDraftActionInput,
): Promise<ActionResult<SendFollowUpDraftActionData>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    // ---- Permission gate ----
    // messaging.send_emails is required; crm.leads.edit alone is not sufficient.
    requirePermission(ctx, 'messaging.send_emails')

    // ---- A. Validate input ----
    const commitmentId = input.commitmentId?.trim() ?? ''
    if (!commitmentId) {
      return { success: false, error: 'commitmentId is required.' }
    }

    // ---- B. Load commitment (tenant/workspace scoped) ----
    const commitment = await fetchCommitmentForDraftGeneration(
      commitmentId,
      ctx.tenantId,
      ctx.workspaceId,
    )
    if (!commitment) {
      return { success: false, error: 'Commitment not found.' }
    }

    // ---- C. Require linked draft ----
    if (!commitment.draft_id) {
      return { success: false, error: 'No draft is linked to this commitment.' }
    }

    const draftId = commitment.draft_id

    // ---- D. Load draft (tenant/workspace scoped) ----
    // getEmailDraftForSending scopes by tenant_id and filters deleted_at, but only
    // rejects workspace mismatches when workspace_id is non-null. A draft with
    // workspace_id = null would pass that check. The explicit guard below closes
    // this gap for proposal-follow-up sends.
    const draft = await getEmailDraftForSending(draftId, ctx.tenantId, ctx.workspaceId)
    if (!draft) {
      return { success: false, error: 'Draft not found.' }
    }

    // ---- D1. Strict workspace validation ----
    // Explicit guard: reject if draft.workspace_id does not strictly match the
    // request context workspace, including the null case not caught by
    // getEmailDraftForSending. Proposal-follow-up drafts are always workspace-scoped.
    if (draft.workspace_id !== ctx.workspaceId) {
      return { success: false, error: 'Draft not found.' }
    }

    // ---- E. Verify subject_type = 'proposal_follow_up_commitment' ----
    if (draft.subject_type !== 'proposal_follow_up_commitment') {
      return { success: false, error: 'Draft is not a proposal follow-up draft.' }
    }

    // ---- F. Verify subject_id = commitmentId ----
    if (draft.subject_id !== commitmentId) {
      return {
        success: false,
        error: 'Draft subject does not match the requested commitment.',
      }
    }

    // ---- G. Verify source_type = FUTURE_FOLLOW_UP ----
    if (draft.source_type !== DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP) {
      return { success: false, error: 'Draft has unexpected source type.' }
    }

    // ---- H. Block campaign assignment side effect ----
    // sendApprovedDraft calls completeCampaignAssignment when campaign_assignment_id
    // is non-null. Follow-up drafts must not have a campaign assignment.
    if (draft.campaign_assignment_id !== null) {
      return {
        success: false,
        error: 'Draft is linked to a campaign assignment and cannot be sent via this path.',
      }
    }

    // ---- I. Block superseded drafts ----
    // getEmailDraftForSending does NOT filter superseded_at. This explicit check
    // fills that confirmed gap — superseded drafts must not be sent.
    if (draft.superseded_at !== null) {
      return { success: false, error: 'Draft has been superseded and cannot be sent.' }
    }

    // ---- J. Readiness check ----
    // checkDraftSendReadiness is NOT called by sendApprovedDraft; the wrapper must
    // call it explicitly to block missing subject/body/approval before provider call.
    const readiness = checkDraftSendReadiness(
      {
        status:               draft.status,
        toEmail:              draft.to_email,
        subject:              draft.subject,
        bodyHtml:             draft.body_html,
        bodyText:             draft.body_text,
        approvalRequestId:    draft.approval_request_id,
        sourceType:           draft.source_type,
        sourceAssetId:        draft.source_asset_id,
        aiGenerationMetadata: (draft.ai_generation_metadata ?? {}) as Record<string, unknown>,
      },
      {
        approvalRequestStatus:        null, // not checked for FUTURE_FOLLOW_UP source type
        emailSendingEnabled:          true, // sending flag enforced by sendApprovedDraft; pass true here
        missingPersonalizationFields: [],
      },
    )
    if (!readiness.ready) {
      return {
        success: false,
        error: `Draft is not ready to send: ${readiness.blockedReasons.join(', ')}.`,
      }
    }

    // ---- K. Send via sendApprovedDraft ----
    // All proposal-follow-up context checks have passed.
    // sendApprovedDraft enforces: email sending feature flag, lifecycle double-gate,
    // idempotency, suppression, rate limit, and sender identity.
    const sendResult = await sendApprovedDraft(ctx, draftId)

    if (!sendResult.ok) {
      return { success: false, error: sendResult.reason }
    }

    // ---- Emit proposal-follow-up-specific audit event (non-fatal) ----
    recordActivityEvent({
      tenantId:     ctx.tenantId,
      workspaceId:  ctx.workspaceId,
      eventType:    ActivityEventType.PROPOSAL_FOLLOW_UP_DRAFT_SENT,
      eventSource:  'operator_action',
      entityType:   'proposal_follow_up_commitment',
      entityId:     commitmentId,
      leadId:       commitment.lead_id ?? undefined,
      eventSummary: 'Proposal follow-up draft sent',
      properties: {
        commitment_id:         commitmentId,
        draft_id:              draftId,
        send_id:               sendResult.sendId,
        resend_message_id:     sendResult.resendMessageId,
        actor_user_id:         ctx.userId,
        subject_type:          draft.subject_type,
        subject_id:            draft.subject_id,
        source_type:           draft.source_type,
        approval_request_id:   draft.approval_request_id,
        proposal_event_id:     commitment.proposal_event_id,
        follow_up_sequence:    commitment.follow_up_sequence,
        schedule_rule_key:     commitment.schedule_rule_key,
      },
    }).catch(() => {})

    return {
      success: true,
      data: {
        commitmentId,
        draftId,
        sendId:          sendResult.sendId,
        resendMessageId: sendResult.resendMessageId,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
