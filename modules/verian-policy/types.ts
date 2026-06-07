// Verian Policy Layer — type definitions only.
// Concrete policy profiles will be created in the registry slice (Goal 3 Slice 3).
// The Verian Agent Bridge must not depend on these types until policy profiles
// and source-reading tests exist (Goal 3 Slices 3 and 4).

export type VerianPolicyRiskLevel = 'low' | 'medium' | 'high'

// String alias for named policy actions (e.g. 'push', 'commit', 'apply-migration').
// Concrete action name constants will be defined in the registry slice.
export type VerianPolicyAction = string

// String alias for named evidence requirements (e.g. 'git-status', 'vitest-output').
// Concrete evidence name constants will be defined in the registry slice.
export type VerianPolicyEvidenceRequirement = string

export type VerianPolicyReviewer = 'claude' | 'codex' | 'chatgpt' | 'michael' | 'verian'

// String alias for policy profile identifiers (e.g. 'MEDIUM_RISK_BACKEND_NO_MIGRATION').
// Concrete profile IDs will be defined in the registry slice.
export type VerianPolicyProfileId = string

export type VerianPolicyProfile = {
  policyId: VerianPolicyProfileId
  name: string
  description: string
  riskLevel: VerianPolicyRiskLevel
  allowedActions: VerianPolicyAction[]
  blockedActions: VerianPolicyAction[]
  requiredChecks: string[]
  requiredEvidence: VerianPolicyEvidenceRequirement[]
  requiredReviewers: VerianPolicyReviewer[]
  requiresCodexReview: boolean
  requiresHumanApproval: boolean
  requiresProductivityReport: boolean
  stopConditions: string[]
}

export type VerianPolicyValidationIssue = {
  severity: 'info' | 'warning' | 'blocking'
  message: string
  policyId?: VerianPolicyProfileId
  action?: VerianPolicyAction
}

export type VerianPolicyValidationResult = {
  policyId: VerianPolicyProfileId
  status: 'pass' | 'warning' | 'blocked'
  issues: VerianPolicyValidationIssue[]
}
