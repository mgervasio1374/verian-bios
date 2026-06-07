// Verian Agent Bridge — task packet type definitions.
// Type definitions only. No runtime objects, functions, classes, or side effects.
// These types do not authorize execution, model calls, DB writes, or sending.
// The Bridge MVP is dry-run only: dryRunOnly must remain literal true.

import type { VerianPolicyProfileId } from '@/modules/verian-policy/types'

// ---------------------------------------------------------------------------
// Primitive type aliases
// ---------------------------------------------------------------------------

export type VerianBridgeRiskLevel = 'low' | 'medium' | 'high'

export type VerianBridgeRequestedBy = 'michael' | 'system' | 'agent'

export type VerianBridgePolicyCheckStatus = 'pass' | 'warning' | 'blocked'

export type VerianBridgeAgentCategory =
  | 'development'
  | 'business_intelligence'
  | 'messaging_copy'
  | 'policy_safety'
  | 'execution'

export type VerianBridgeModelFamily =
  | 'qwen'
  | 'claude'
  | 'gpt'
  | 'codex'
  | 'verian_deterministic'
  | 'human'

export type VerianBridgeCostTier = 'low' | 'standard' | 'premium' | 'human'

// String alias — will be refined to a branded or structured type in a future slice.
export type VerianBridgeTaskType = string

// String alias — will be refined to a branded type in a future slice.
export type VerianBridgeTaskId = string

// ---------------------------------------------------------------------------
// Task packet
// ---------------------------------------------------------------------------

// dryRunOnly is a literal type. It must remain true for the entire MVP lifecycle.
// A future slice that removes this constraint requires an explicit policy review,
// a dedicated implementation slice, Codex review, and Michael approval.
export type VerianBridgeTaskPacket = {
  readonly taskId: VerianBridgeTaskId
  readonly goalId?: string
  readonly sliceId?: string
  readonly taskType: VerianBridgeTaskType
  readonly riskLevel: VerianBridgeRiskLevel
  readonly policyId: VerianPolicyProfileId
  readonly requestedBy: VerianBridgeRequestedBy
  readonly intendedAgent: string
  readonly agentCategory: VerianBridgeAgentCategory
  readonly recommendedModel: VerianBridgeModelFamily
  readonly recommendedModelName?: string
  readonly modelCostTier: VerianBridgeCostTier
  readonly promptText: string
  // Set by checkVerianPromptPolicy — never self-assigned by the Bridge.
  readonly policyCheckStatus: VerianBridgePolicyCheckStatus
  readonly requiredEvidence: readonly string[]
  readonly requiredReviewers: readonly string[]
  readonly stopConditions: readonly string[]
  // Copied from the resolved VerianPolicyProfile — not computed by the Bridge.
  readonly allowedActions: readonly string[]
  readonly blockedActions: readonly string[]
  // Copied from the resolved VerianPolicyProfile — not disabled by a pass result.
  readonly requiresHumanApproval: boolean
  readonly requiresCodexReview: boolean
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Agent recommendation
// ---------------------------------------------------------------------------

export type VerianBridgeAgentRecommendation = {
  readonly agentCategory: VerianBridgeAgentCategory
  readonly intendedAgent: string
  readonly rationale: string
  readonly escalationTriggered: boolean
  readonly escalationReason?: string
}

// ---------------------------------------------------------------------------
// Model recommendation
// ---------------------------------------------------------------------------

export type VerianBridgeModelRecommendation = {
  readonly recommendedModel: VerianBridgeModelFamily
  readonly recommendedModelName?: string
  readonly alternativeModel?: VerianBridgeModelFamily
  readonly rationale: string
  readonly costTier: VerianBridgeCostTier
}

// ---------------------------------------------------------------------------
// Approval and review requirements
// ---------------------------------------------------------------------------

export type VerianBridgeApprovalRequirement = {
  readonly required: boolean
  readonly reason: string
  readonly status: 'pending' | 'approved' | 'denied'
}

export type VerianBridgeCodexReviewRequirement = {
  readonly required: boolean
  readonly artifactRequired: string
  readonly status: 'pending' | 'complete' | 'skipped'
}

// ---------------------------------------------------------------------------
// Audit record draft (design-only — no DB table or migration in this slice)
// ---------------------------------------------------------------------------

// Append-only design: no audit record may be modified after creation.
// Timestamp field is omitted from this type until a dedicated audit slice
// defines the persistence layer and migration.
export type VerianBridgeAuditRecordDraft = {
  readonly taskId: VerianBridgeTaskId
  readonly policyId: VerianPolicyProfileId
  readonly checkerResult: VerianBridgePolicyCheckStatus
  readonly promptSummary: string
  readonly selectedAgent: string
  readonly selectedModel: VerianBridgeModelFamily
  readonly status:
    | 'draft'
    | 'blocked'
    | 'waiting_approval'
    | 'approved'
    | 'denied'
  readonly reviewerRequirements: readonly string[]
  readonly approvalState: 'pending' | 'approved' | 'denied'
  readonly outputSummary: string
  readonly actor: VerianBridgeRequestedBy
}
