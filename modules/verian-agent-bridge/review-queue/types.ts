// Verian Agent Bridge — review queue type definitions.
// Type definitions only. No runtime objects, functions, classes, or side effects.
// These types define the shape of a future review queue — they do not authorize
// execution, model calls, DB writes, sending, or routing.
// dryRunOnly: true and executionAuthorized: false preserve the dry-run boundary.

import type { VerianPolicyProfileId } from '@/modules/verian-policy/types'
import type {
  VerianBridgeAgentCategory,
  VerianBridgeModelFamily,
  VerianBridgePolicyCheckStatus,
  VerianBridgeRequestedBy,
  VerianBridgeRiskLevel,
  VerianBridgeTaskId,
  VerianBridgeTaskPacket,
} from '@/modules/verian-agent-bridge/types'
import type { VerianBridgeAgentId } from '@/modules/verian-agent-bridge/agent-registry'

// ---------------------------------------------------------------------------
// Queue state
// ---------------------------------------------------------------------------

// Represents the lifecycle state of a review queue item.
// No state transition executes any action.
export type VerianBridgeReviewQueueState =
  | 'draft_packet'
  | 'pending_policy_review'
  | 'blocked_by_policy'
  | 'waiting_human_approval'
  | 'waiting_codex_review'
  | 'revision_requested'
  | 'approved_for_manual_handoff'
  | 'denied'
  | 'archived'

// Restricted subset of VerianBridgeReviewQueueState for queue submissions.
// A packet may only enter the queue in one of these two states.
export type VerianBridgeReviewQueueInitialState =
  | 'draft_packet'
  | 'pending_policy_review'

// ---------------------------------------------------------------------------
// Approval actions
// ---------------------------------------------------------------------------

// User-facing actions that drive state transitions.
// 'approve_for_manual_handoff' does not trigger execution.
export type VerianBridgeReviewQueueAction =
  | 'approve_for_manual_handoff'
  | 'deny'
  | 'request_revision'
  | 'mark_codex_review_received'
  | 'archive'
  | 'reopen_for_review'

// ---------------------------------------------------------------------------
// Queue item
// ---------------------------------------------------------------------------

// String alias for queue item IDs — will be refined to a branded type in a future slice.
export type VerianBridgeReviewQueueItemId = string

// A persisted queue item derived from a VerianBridgeTaskPacket.
// dryRunOnly: true mirrors the originating task packet boundary.
// stopConditions and blockedActions are surfaced to the reviewer at all times.
export type VerianBridgeReviewQueueItem = {
  readonly queueItemId: VerianBridgeReviewQueueItemId
  readonly packetId: string
  readonly taskId: VerianBridgeTaskId
  readonly goalId?: string
  readonly sliceId?: string
  readonly title: string
  readonly policyId: VerianPolicyProfileId
  readonly agentId: VerianBridgeAgentId
  readonly agentCategory: VerianBridgeAgentCategory
  readonly recommendedModel: VerianBridgeModelFamily
  readonly riskLevel: VerianBridgeRiskLevel
  readonly status: VerianBridgeReviewQueueState
  readonly policyCheckStatus: VerianBridgePolicyCheckStatus
  readonly requiresHumanApproval: boolean
  readonly requiresCodexReview: boolean
  readonly requiredEvidence: readonly string[]
  readonly stopConditions: readonly string[]
  readonly blockedActions: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Review decision
// ---------------------------------------------------------------------------

export type VerianBridgeReviewDecisionStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'revision_requested'
  | 'archived'

// Represents a human decision on a queue item.
// dryRunOnly: true — a decision record does not authorize execution.
export type VerianBridgeReviewDecision = {
  readonly queueItemId: VerianBridgeReviewQueueItemId
  readonly action: VerianBridgeReviewQueueAction
  readonly actor: VerianBridgeRequestedBy
  readonly status: VerianBridgeReviewDecisionStatus
  readonly reason?: string
  readonly evidence?: readonly string[]
  readonly createdAt: string
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Queue submission
// ---------------------------------------------------------------------------

// Represents the input required to submit a dry-run task packet to the queue.
// initialState should always be 'draft_packet' or 'pending_policy_review'.
export type VerianBridgeReviewQueueSubmission = {
  readonly packet: VerianBridgeTaskPacket
  readonly title: string
  readonly submittedBy: VerianBridgeRequestedBy
  readonly submittedAt: string
  readonly initialState: VerianBridgeReviewQueueInitialState
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Manual handoff approval
// ---------------------------------------------------------------------------

// Records that Michael has reviewed and approved a packet for manual handoff.
// executionAuthorized: false — approval is not execution authorization.
// dryRunOnly: true — the dry-run boundary is preserved post-approval.
// Approval authorizes use of the packet as context for a manual Claude/Codex session only.
export type VerianBridgeManualHandoffApproval = {
  readonly queueItemId: VerianBridgeReviewQueueItemId
  readonly approvedBy: 'michael'
  readonly approvedAt: string
  readonly approvalSummary: string
  readonly codexReviewLinked: boolean
  readonly executionAuthorized: false
  readonly dryRunOnly: true
}
