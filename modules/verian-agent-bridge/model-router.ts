// Verian Agent Bridge — static model router design/types.
// Static dry-run-only model routing metadata. No executable routing logic.
// These routes describe which model families are appropriate for which tasks —
// they do not call providers, send prompts, read credentials, or authorize execution.
// No provider SDK imports. No environment variable access. No side effects.

import type {
  VerianBridgeAgentCategory,
  VerianBridgeCostTier,
  VerianBridgeModelFamily,
  VerianBridgeRiskLevel,
} from '@/modules/verian-agent-bridge/types'

// agent-registry import is type-only — only VerianBridgeAgentId is used for documentation
// consistency; it is not strictly required but keeps imports aligned with the module graph.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { VerianBridgeAgentId } from '@/modules/verian-agent-bridge/agent-registry'

import type { VerianPolicyProfileId } from '@/modules/verian-policy/types'

// ---------------------------------------------------------------------------
// Route ID union
// ---------------------------------------------------------------------------

export type VerianBridgeModelRouteId =
  | 'qwen_low_cost_copy'
  | 'qwen_low_cost_classification'
  | 'claude_premium_reasoning'
  | 'gpt_premium_reasoning'
  | 'codex_code_review'
  | 'verian_deterministic_policy'
  | 'human_high_risk_approval'

// ---------------------------------------------------------------------------
// Model route descriptor type
// ---------------------------------------------------------------------------

// dryRunOnly is a literal type — must remain true for the entire MVP lifecycle.
// Routes do not authorize calls to any model provider.
// No route may include provider API keys, endpoint URLs, or SDK imports.
export type VerianBridgeModelRoute = {
  readonly routeId: VerianBridgeModelRouteId
  readonly name: string
  readonly description: string
  readonly modelFamily: VerianBridgeModelFamily
  readonly costTier: VerianBridgeCostTier
  readonly allowedAgentCategories: readonly VerianBridgeAgentCategory[]
  readonly allowedTaskTypes: readonly string[]
  readonly allowedRiskLevels: readonly VerianBridgeRiskLevel[]
  readonly blockedTaskTypes: readonly string[]
  readonly blockedActions: readonly string[]
  readonly escalationTriggers: readonly string[]
  readonly requiresHumanApproval: boolean
  readonly requiresCodexReview: boolean
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Routing decision draft type (design-only — no builder in this slice)
// ---------------------------------------------------------------------------

// VerianBridgeRoutingDecisionDraft represents the shape of a future routing
// recommendation produced by the dry-run service. No builder function exists yet.
export type VerianBridgeRoutingDecisionDraft = {
  readonly routeId: VerianBridgeModelRouteId
  readonly recommendedModel: VerianBridgeModelFamily
  readonly modelCostTier: VerianBridgeCostTier
  readonly rationale: string
  readonly escalationTriggered: boolean
  readonly escalationReason?: string
  readonly requiresHumanApproval: boolean
  readonly requiresCodexReview: boolean
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Shared blocked action baseline (all routes enforce this minimum)
// ---------------------------------------------------------------------------

const ROUTE_BASE_BLOCKED: readonly string[] = [
  'send-email',
  'campaign-sending',
  'touch-production',
  'db-write',
  'apply-migration',
  'enable-EMAIL_SENDING_ENABLED',
  'enable-CAMPAIGN_SENDING_ENABLED',
  'bypass-human-approval',
  'bypass-policy-check',
  'autonomous-execution',
] as const

// ---------------------------------------------------------------------------
// Qwen routes
// NOTE: Qwen is a low-cost worker model only.
// Qwen may draft/rewrite/classify/summarize.
// Qwen may NOT approve output, send, change policy, make unsupported claims,
// touch production, or approve its own output.
// ---------------------------------------------------------------------------

const QWEN_LOW_COST_COPY: VerianBridgeModelRoute = {
  routeId: 'qwen_low_cost_copy',
  name: 'Qwen — Low-Cost Copy Worker',
  description:
    'Low-cost repetitive copy tasks: email drafting, subject lines, tone adjustment, ' +
    'personalization snippets. Qwen output must be scored by Verian before entering ' +
    'any approval queue. Auto-send is blocked. Human approval is required.',
  modelFamily: 'qwen',
  costTier: 'low',
  allowedAgentCategories: ['messaging_copy'],
  allowedTaskTypes: [
    'draft-email-variant',
    'revise-email-draft',
    'generate-subject-line-options',
    'generate-personalization-snippet',
    'adjust-tone',
    'score-draft',
  ],
  allowedRiskLevels: ['low'],
  blockedTaskTypes: [
    'approve-final-output',
    'approve-task-packet',
    'apply-campaign-change',
    'modify-campaign-policy',
    'send-to-lead',
  ],
  blockedActions: [
    ...ROUTE_BASE_BLOCKED,
    'approve-final-output',
    'auto-send',
    'make-unsupported-savings-claim',
    'make-unsupported-rate-claim',
    'make-unsupported-compliance-claim',
    'change-campaign-policy',
    'approve-own-output',
  ],
  escalationTriggers: [
    'score-below-85-after-3-attempts',
    'compliance-risk-detected',
    'unsupported-savings-claim-found',
    'unsupported-rate-claim-found',
    'high-value-prospect-flag',
    'new-campaign-template',
    'human-requests-premium-review',
  ],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

const QWEN_LOW_COST_CLASSIFICATION: VerianBridgeModelRoute = {
  routeId: 'qwen_low_cost_classification',
  name: 'Qwen — Low-Cost BI Classification Worker',
  description:
    'Low-cost structured extraction, classification, lead notes, and summarization for ' +
    'business intelligence tasks. Does not modify scoring thresholds, write lead records, ' +
    'or apply campaign changes.',
  modelFamily: 'qwen',
  costTier: 'low',
  allowedAgentCategories: ['business_intelligence'],
  allowedTaskTypes: [
    'classify-lead-behavior',
    'extract-scoring-signals',
    'summarize-lead-context',
    'summarize-campaign-results',
    'generate-lead-note',
  ],
  allowedRiskLevels: ['low'],
  blockedTaskTypes: [
    'modify-scoring-thresholds',
    'apply-campaign-change',
    'write-lead-record',
    'approve-task-packet',
  ],
  blockedActions: [
    ...ROUTE_BASE_BLOCKED,
    'modify-scoring-thresholds',
    'write-lead-record',
    'apply-campaign-change',
    'change-campaign-policy',
    'approve-own-output',
  ],
  escalationTriggers: [
    'compliance-sensitive-data-detected',
    'ambiguous-classification-result',
    'human-requests-premium-review',
  ],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Claude / GPT premium reasoning routes
// ---------------------------------------------------------------------------

const CLAUDE_PREMIUM_REASONING: VerianBridgeModelRoute = {
  routeId: 'claude_premium_reasoning',
  name: 'Claude — Premium Reasoning',
  description:
    'Architecture review, strategy, implementation planning, policy design, ' +
    'compliance-sensitive reasoning, and copy escalation review. ' +
    'Requires human approval for high-risk outputs.',
  modelFamily: 'claude',
  costTier: 'premium',
  allowedAgentCategories: ['development', 'business_intelligence', 'messaging_copy', 'policy_safety'],
  allowedTaskTypes: [
    'review-architecture',
    'review-module-boundaries',
    'produce-design-summary',
    'create-design-document',
    'recommend-campaign-sequence',
    'produce-recommendation-artifact',
    'premium-copy-review',
    'escalation-review',
    'review-implementation',
    'flag-compliance-risk',
    'produce-quality-report',
  ],
  allowedRiskLevels: ['low', 'medium', 'high'],
  blockedTaskTypes: [
    'autonomous-execution',
    'auto-merge',
    'auto-send',
    'apply-migration-command',
  ],
  blockedActions: [
    ...ROUTE_BASE_BLOCKED,
    'autonomous-execution',
    'auto-merge',
    'create-tag',
  ],
  escalationTriggers: [
    'codex-review-required-but-absent',
    'human-approval-required-but-absent',
    'high-risk-task-without-approval',
  ],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

const GPT_PREMIUM_REASONING: VerianBridgeModelRoute = {
  routeId: 'gpt_premium_reasoning',
  name: 'GPT — Premium Reasoning',
  description:
    'Premium reasoning alternative to Claude for strategy review, escalation, ' +
    'and comparative analysis. Same restrictions as Claude premium route.',
  modelFamily: 'gpt',
  costTier: 'premium',
  allowedAgentCategories: ['development', 'business_intelligence', 'messaging_copy', 'policy_safety'],
  allowedTaskTypes: [
    'review-architecture',
    'produce-design-summary',
    'premium-copy-review',
    'escalation-review',
    'strategy-review',
    'produce-recommendation-artifact',
    'flag-compliance-risk',
    'produce-quality-report',
  ],
  allowedRiskLevels: ['low', 'medium', 'high'],
  blockedTaskTypes: [
    'autonomous-execution',
    'auto-merge',
    'auto-send',
    'apply-migration-command',
  ],
  blockedActions: [
    ...ROUTE_BASE_BLOCKED,
    'autonomous-execution',
    'auto-merge',
    'create-tag',
  ],
  escalationTriggers: [
    'codex-review-required-but-absent',
    'human-approval-required-but-absent',
    'high-risk-task-without-approval',
  ],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Codex review route
// ---------------------------------------------------------------------------

const CODEX_CODE_REVIEW: VerianBridgeModelRoute = {
  routeId: 'codex_code_review',
  name: 'Codex — Code Review',
  description:
    'Independent code review, implementation review, regression risk analysis, ' +
    'and commit review. Produces review artifacts only. ' +
    'Does not apply suggestions without human approval.',
  modelFamily: 'codex',
  costTier: 'standard',
  allowedAgentCategories: ['development'],
  allowedTaskTypes: [
    'review-implementation',
    'review-commit',
    'review-regression-risk',
    'prepare-review-artifact',
    'receive-review-output',
    'commit-review-results',
  ],
  allowedRiskLevels: ['low', 'medium', 'high'],
  blockedTaskTypes: [
    'apply-codex-suggestions-without-human-approval',
    'auto-merge',
    'auto-push',
    'create-tag',
  ],
  blockedActions: [
    ...ROUTE_BASE_BLOCKED,
    'apply-codex-suggestions-without-human-approval',
    'auto-merge',
    'push-commit',
    'create-tag',
  ],
  escalationTriggers: [
    'regression-risk-detected',
    'blocking-issue-found-in-review',
    'human-approval-required-before-merge',
  ],
  requiresHumanApproval: true,
  requiresCodexReview: false, // Codex IS the reviewer on this route
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Verian deterministic policy route
// ---------------------------------------------------------------------------

const VERIAN_DETERMINISTIC_POLICY: VerianBridgeModelRoute = {
  routeId: 'verian_deterministic_policy',
  name: 'Verian Deterministic — Policy Gate',
  description:
    'Deterministic policy checks, risk classification, approval gate verification, ' +
    'and execution gate verification. Uses checkVerianPromptPolicy only. ' +
    'No external model calls.',
  modelFamily: 'verian_deterministic',
  costTier: 'low',
  allowedAgentCategories: ['policy_safety', 'execution'],
  allowedTaskTypes: [
    'run-policy-check',
    'validate-task-packet',
    'classify-task-risk',
    'recommend-policy-profile',
    'surface-approval-requirement',
    'track-approval-state',
    'block-on-missing-approval',
    'verify-approval-gates',
    'verify-policy-check-pass',
    'verify-codex-review-complete',
    'hold-packet-for-authorization',
    'produce-audit-summary',
    'flag-policy-violation',
  ],
  allowedRiskLevels: ['low', 'medium', 'high'],
  blockedTaskTypes: [
    'call-external-model',
    'execute-task',
    'run-command',
    'push-commit',
    'apply-migration-command',
    'send-to-lead',
  ],
  blockedActions: [
    ...ROUTE_BASE_BLOCKED,
    'call-external-model',
    'execute-task',
    'run-command',
    'self-approve-policy-result',
    'bypass-policy-check',
    'create-tag',
  ],
  escalationTriggers: [
    'policy-check-blocked',
    'policy-check-warning-without-approval',
    'unknown-policy-id',
  ],
  requiresHumanApproval: false,
  requiresCodexReview: false,
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Human high-risk approval route
// ---------------------------------------------------------------------------

const HUMAN_HIGH_RISK_APPROVAL: VerianBridgeModelRoute = {
  routeId: 'human_high_risk_approval',
  name: 'Human — High-Risk Approval Gate',
  description:
    'Human approval for high-risk decisions and final gates. ' +
    'Michael is the approver — this route surfaces decisions for explicit sign-off. ' +
    'It does not delegate approval to any model and does not authorize autonomous execution.',
  modelFamily: 'human',
  costTier: 'human',
  allowedAgentCategories: ['development', 'business_intelligence', 'messaging_copy', 'policy_safety', 'execution'],
  allowedTaskTypes: [
    'approve-task-packet',
    'deny-task-packet',
    'request-revision',
    'approve-high-risk-work',
    'approve-premium-review',
    'approve-codex-output',
    'sign-off-on-push',
  ],
  allowedRiskLevels: ['low', 'medium', 'high'],
  blockedTaskTypes: [
    'auto-approve',
    'delegate-approval-to-model',
    'bypass-codex-review',
    'bypass-policy-check',
    'send-email-without-send-gate',
    'production-touch-without-explicit-authorization',
  ],
  blockedActions: [
    ...ROUTE_BASE_BLOCKED,
    'auto-approve',
    'delegate-approval-to-model',
    'create-tag',
  ],
  escalationTriggers: [],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Registry exports
// ---------------------------------------------------------------------------

export const VERIAN_BRIDGE_MODEL_ROUTES: readonly VerianBridgeModelRoute[] = [
  QWEN_LOW_COST_COPY,
  QWEN_LOW_COST_CLASSIFICATION,
  CLAUDE_PREMIUM_REASONING,
  GPT_PREMIUM_REASONING,
  CODEX_CODE_REVIEW,
  VERIAN_DETERMINISTIC_POLICY,
  HUMAN_HIGH_RISK_APPROVAL,
] as const

export const VERIAN_BRIDGE_MODEL_ROUTE_REGISTRY: Readonly<Record<VerianBridgeModelRouteId, VerianBridgeModelRoute>> = {
  qwen_low_cost_copy: QWEN_LOW_COST_COPY,
  qwen_low_cost_classification: QWEN_LOW_COST_CLASSIFICATION,
  claude_premium_reasoning: CLAUDE_PREMIUM_REASONING,
  gpt_premium_reasoning: GPT_PREMIUM_REASONING,
  codex_code_review: CODEX_CODE_REVIEW,
  verian_deterministic_policy: VERIAN_DETERMINISTIC_POLICY,
  human_high_risk_approval: HUMAN_HIGH_RISK_APPROVAL,
} as const
