import type { VerianPolicyRiskLevel } from '@/modules/verian-policy/types'

// Approval-gate agent (logic core). Previously skeletal — a registered descriptor
// with no implementation. This is what it does: SURFACE the approvals a task
// requires (from its risk + agent contract) and CHECK whether they are satisfied.
// It never approves on anyone's behalf and never executes — it only reports the
// requirement and whether the provided approvals clear it. Pure, no IO, dry-run.
// Consumes the risk-classifier's output (requiresHumanApproval / requiresCodexReview).

export type ApprovalReviewer = 'michael' | 'codex'

export interface ApprovalRequirementInput {
  riskLevel:             VerianPolicyRiskLevel
  requiresHumanApproval: boolean
  requiresCodexReview:   boolean
}

export interface ApprovalRequirement {
  reviewersRequired: ApprovalReviewer[]
  reasons:           string[]
}

export interface ProvidedApproval {
  reviewer: ApprovalReviewer
  approved: boolean
}

export interface ApprovalGateResult {
  satisfied: boolean
  missing:   ApprovalReviewer[]
}

// Determines who must sign off. High risk always needs the human owner; codex review
// is required whenever the agent contract demands it (independent review).
export function surfaceApprovalRequirements(input: ApprovalRequirementInput): ApprovalRequirement {
  const reviewers = new Set<ApprovalReviewer>()
  const reasons: string[] = []

  if (input.requiresHumanApproval || input.riskLevel === 'high') {
    reviewers.add('michael')
    reasons.push(input.riskLevel === 'high' ? 'high-risk task requires owner approval' : 'task contract requires human approval')
  }
  if (input.requiresCodexReview) {
    reviewers.add('codex')
    reasons.push('task contract requires independent (codex) review')
  }

  return { reviewersRequired: [...reviewers], reasons }
}

// Checks the provided approvals against the requirement. A reviewer counts only when
// present AND approved. Never infers or self-approves a missing reviewer.
export function evaluateApprovalGate(
  requirement: ApprovalRequirement,
  provided:    ProvidedApproval[],
): ApprovalGateResult {
  const approved = new Set(provided.filter(p => p.approved).map(p => p.reviewer))
  const missing = requirement.reviewersRequired.filter(r => !approved.has(r))
  return { satisfied: missing.length === 0, missing }
}
