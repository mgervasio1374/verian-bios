// ============================================================
// Phase 3B — Event Tracking Audit Payload Builders
// Pure functions only — no I/O, no async, no side effects.
// No scoring logic. No copy generation. Observation only.
// ============================================================

import type {
  EtPhase3bMeta,
  EtActionType,
  EtSendEventPayload,
  EtOutcomeEventPayload,
} from './event-tracking.types'
import { ET_ACTION_TYPES } from './event-tracking.types'

// ---- buildSendInitiatedPayload ----
// Emitted after email_send record is created (status = queued),
// before Resend API call. Records that a human explicitly triggered send.

export function buildSendInitiatedPayload(params: {
  emailSendId:  string
  draftId:      string
  phase3bMeta:  EtPhase3bMeta | null
  toEmail:      string
}): EtSendEventPayload {
  return {
    action_type:        ET_ACTION_TYPES.ET_SEND_INITIATED,
    email_send_id:      params.emailSendId,
    draft_id:           params.draftId,
    message_version_id: params.phase3bMeta?.message_version_id ?? null,
    strategy_id:        params.phase3bMeta?.strategy_id ?? null,
    quality_review_id:  params.phase3bMeta?.quality_review_id ?? null,
    version_label:      params.phase3bMeta?.version_label ?? null,
    composite_score:    params.phase3bMeta?.composite_score ?? null,
    approved_by:        params.phase3bMeta?.approved_by ?? null,
    send_initiated_by:  params.phase3bMeta?.send_initiated_by ?? null,
    to_email:           params.toEmail,
    timestamp:          new Date().toISOString(),
  }
}

// ---- buildSendSucceededPayload ----
// Emitted after Resend accepts the message and email_sends.status = sent.
// Records the resend_message_id for future webhook attribution.

export function buildSendSucceededPayload(params: {
  emailSendId:      string
  draftId:          string
  phase3bMeta:      EtPhase3bMeta | null
  toEmail:          string
  resendMessageId:  string | null
}): EtSendEventPayload {
  return {
    action_type:        ET_ACTION_TYPES.ET_SEND_SUCCEEDED,
    email_send_id:      params.emailSendId,
    draft_id:           params.draftId,
    message_version_id: params.phase3bMeta?.message_version_id ?? null,
    strategy_id:        params.phase3bMeta?.strategy_id ?? null,
    quality_review_id:  params.phase3bMeta?.quality_review_id ?? null,
    version_label:      params.phase3bMeta?.version_label ?? null,
    composite_score:    params.phase3bMeta?.composite_score ?? null,
    approved_by:        params.phase3bMeta?.approved_by ?? null,
    send_initiated_by:  params.phase3bMeta?.send_initiated_by ?? null,
    to_email:           params.toEmail,
    resend_message_id:  params.resendMessageId,
    timestamp:          new Date().toISOString(),
  }
}

// ---- buildSendFailedPayload ----
// Emitted after Resend failure is recorded on email_sends.status = failed.

export function buildSendFailedPayload(params: {
  emailSendId:  string
  draftId:      string
  phase3bMeta:  EtPhase3bMeta | null
  toEmail:      string
  errorReason:  string
}): EtSendEventPayload {
  return {
    action_type:        ET_ACTION_TYPES.ET_SEND_FAILED,
    email_send_id:      params.emailSendId,
    draft_id:           params.draftId,
    message_version_id: params.phase3bMeta?.message_version_id ?? null,
    strategy_id:        params.phase3bMeta?.strategy_id ?? null,
    quality_review_id:  params.phase3bMeta?.quality_review_id ?? null,
    version_label:      params.phase3bMeta?.version_label ?? null,
    composite_score:    params.phase3bMeta?.composite_score ?? null,
    approved_by:        params.phase3bMeta?.approved_by ?? null,
    send_initiated_by:  params.phase3bMeta?.send_initiated_by ?? null,
    to_email:           params.toEmail,
    error_reason:       params.errorReason,
    timestamp:          new Date().toISOString(),
  }
}

// ---- buildWebhookOutcomePayload ----
// Used for all 6 webhook-driven ET_ events (delivered, bounced, complained,
// delivery_failed, opened, clicked). etActionType is resolved by the caller
// from RESEND_EVENT_TO_ET_TYPE.

export function buildWebhookOutcomePayload(params: {
  etActionType:    EtActionType
  emailSendId:     string
  draftId:         string | null
  phase3bMeta:     EtPhase3bMeta | null
  resendMessageId: string
  resendEventType: string
  occurredAt:      string
}): EtOutcomeEventPayload {
  return {
    action_type:        params.etActionType,
    email_send_id:      params.emailSendId,
    draft_id:           params.draftId,
    message_version_id: params.phase3bMeta?.message_version_id ?? null,
    strategy_id:        params.phase3bMeta?.strategy_id ?? null,
    quality_review_id:  params.phase3bMeta?.quality_review_id ?? null,
    version_label:      params.phase3bMeta?.version_label ?? null,
    composite_score:    params.phase3bMeta?.composite_score ?? null,
    approved_by:        params.phase3bMeta?.approved_by ?? null,
    send_initiated_by:  params.phase3bMeta?.send_initiated_by ?? null,
    resend_message_id:  params.resendMessageId,
    resend_event_type:  params.resendEventType,
    occurred_at:        params.occurredAt,
    timestamp:          new Date().toISOString(),
  }
}
