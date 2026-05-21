// ============================================================
// Phase 3B — Send / Email Draft Bridge Audit Builders
// Pure event payload builders — no I/O, no async, no side effects.
// ============================================================

import type { SebEventPayload, SebErrorCode } from './send-bridge.types'
import { SEB_ACTION_TYPES } from './send-bridge.types'

export function buildDraftCreatedPayload(params: {
  draftId:             string
  messageVersionId:    string
  strategyId:          string
  qualityReviewId?:    string | null
  leadId:              string
  contactId?:          string | null
  userId:              string
  supersededDraftIds?: string[]
}): SebEventPayload {
  return {
    action_type:          SEB_ACTION_TYPES.SEB_ACTION_DRAFT_CREATED,
    draft_id:             params.draftId,
    message_version_id:   params.messageVersionId,
    strategy_id:          params.strategyId,
    quality_review_id:    params.qualityReviewId ?? null,
    lead_id:              params.leadId,
    contact_id:           params.contactId ?? null,
    user_id:              params.userId,
    superseded_draft_ids: params.supersededDraftIds ?? [],
    timestamp:            new Date().toISOString(),
  }
}

export function buildDraftCreationBlockedPayload(params: {
  messageVersionId: string
  strategyId:       string
  leadId:           string
  userId:           string
  errorCode:        SebErrorCode
  errorReason:      string
}): SebEventPayload {
  return {
    action_type:        SEB_ACTION_TYPES.SEB_ACTION_DRAFT_CREATION_BLOCKED,
    message_version_id: params.messageVersionId,
    strategy_id:        params.strategyId,
    lead_id:            params.leadId,
    user_id:            params.userId,
    error_code:         params.errorCode,
    error_reason:       params.errorReason,
    timestamp:          new Date().toISOString(),
  }
}
