// ============================================================
// Phase 3B — Human Review / Approval Bridge Audit Builders
// Pure functions that construct activity_event payloads per action.
// No I/O, no side effects, no async.
// ============================================================

import { HRB_ACTION_TYPES } from './human-review.types'
import type { HumanReviewEventPayload } from './human-review.types'

// ---- Select event ----

export function buildSelectEventPayload(params: {
  versionId:              string
  strategyId:             string
  versionLabel:           string
  previousStatus:         string
  userId:                 string
  priorSelectedVersionId: string | null
  selectReason?:          string
}): HumanReviewEventPayload {
  return {
    action_type:               HRB_ACTION_TYPES.HRB_ACTION_SELECTED,
    version_id:                params.versionId,
    strategy_id:               params.strategyId,
    previous_status:           params.previousStatus,
    new_status:                'selected',
    user_id:                   params.userId,
    prior_selected_version_id: params.priorSelectedVersionId ?? undefined,
    timestamp:                 new Date().toISOString(),
  }
}

// ---- Deselect event (for the version being reverted to pending) ----

export function buildDeselectEventPayload(params: {
  versionId:           string
  strategyId:          string
  versionLabel:        string
  newSelectedVersionId:string
  userId:              string
}): HumanReviewEventPayload {
  return {
    action_type:          HRB_ACTION_TYPES.HRB_ACTION_DESELECTED,
    version_id:           params.versionId,
    strategy_id:          params.strategyId,
    previous_status:      'selected',
    new_status:           'pending',
    user_id:              params.userId,
    new_selected_version_id: params.newSelectedVersionId,
    timestamp:            new Date().toISOString(),
  }
}

// ---- Reject event ----

export function buildRejectEventPayload(params: {
  versionId:       string
  strategyId:      string
  versionLabel:    string
  previousStatus:  string
  rejectionReason: string
  reviewerNote:    string | undefined
  userId:          string
}): HumanReviewEventPayload {
  return {
    action_type:      HRB_ACTION_TYPES.HRB_ACTION_REJECTED,
    version_id:       params.versionId,
    strategy_id:      params.strategyId,
    previous_status:  params.previousStatus,
    new_status:       'rejected',
    user_id:          params.userId,
    rejection_reason: params.rejectionReason,
    reviewer_note:    params.reviewerNote,
    timestamp:        new Date().toISOString(),
  }
}

// ---- Approve event ----

export function buildApproveEventPayload(params: {
  versionId:             string
  strategyId:            string
  versionLabel:          string
  previousStatus:        string
  userId:                string
  compositeScoreAtAction:number
  scoreBandAtAction:     string
  isRecommendedAtAction: boolean
  riskFlagsAtAction:     Array<{ code: string; severity: string; message: string }>
  riskAcknowledged:      boolean
  overrideReason:        string | undefined
}): HumanReviewEventPayload {
  return {
    action_type:               HRB_ACTION_TYPES.HRB_ACTION_APPROVED,
    version_id:                params.versionId,
    strategy_id:               params.strategyId,
    previous_status:           params.previousStatus,
    new_status:                'approved',
    user_id:                   params.userId,
    composite_score_at_action: params.compositeScoreAtAction,
    score_band_at_action:      params.scoreBandAtAction,
    is_recommended_at_action:  params.isRecommendedAtAction,
    risk_flags_at_action:      params.riskFlagsAtAction,
    risk_acknowledged:         params.riskAcknowledged,
    override_reason:           params.overrideReason,
    timestamp:                 new Date().toISOString(),
  }
}

// ---- Regeneration requested event ----

export function buildRegenerationRequestedPayload(params: {
  strategyId:       string
  userId:           string
  regenerationNote: string | undefined
}): HumanReviewEventPayload {
  return {
    action_type:      HRB_ACTION_TYPES.HRB_ACTION_REGENERATION_REQUESTED,
    strategy_id:      params.strategyId,
    user_id:          params.userId,
    regeneration_note:params.regenerationNote,
    timestamp:        new Date().toISOString(),
  }
}

// ---- Returned to strategy event ----

export function buildReturnedToStrategyPayload(params: {
  strategyId: string
  userId:     string
}): HumanReviewEventPayload {
  return {
    action_type: HRB_ACTION_TYPES.HRB_ACTION_RETURNED_TO_STRATEGY,
    strategy_id: params.strategyId,
    user_id:     params.userId,
    timestamp:   new Date().toISOString(),
  }
}
