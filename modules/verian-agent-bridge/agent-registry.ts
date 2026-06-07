// Verian Agent Bridge — static agent registry.
// Static dry-run-only registry data. No execution logic. No model calls.
// These descriptors describe agents and their constraints — they do not
// authorize execution, routing, sending, DB writes, or production access.
// All agents carry dryRunOnly: true for the MVP lifecycle.

import type { VerianBridgeAgentCategory, VerianBridgeModelFamily } from '@/modules/verian-agent-bridge/types'
import type { VerianPolicyProfileId } from '@/modules/verian-policy/types'

// ---------------------------------------------------------------------------
// Agent ID union
// ---------------------------------------------------------------------------

export type VerianBridgeAgentId =
  | 'claude_implementation_agent'
  | 'codex_review_agent'
  | 'architecture_review_agent'
  | 'documentation_agent'
  | 'sales_ops_intelligence_agent'
  | 'lead_scoring_agent'
  | 'campaign_recommendation_agent'
  | 'copywriting_agent'
  | 'subject_line_agent'
  | 'personalization_agent'
  | 'quality_review_agent'
  | 'prompt_policy_agent'
  | 'risk_classifier_agent'
  | 'approval_gate_agent'
  | 'execution_gate_agent'

// ---------------------------------------------------------------------------
// Agent descriptor type
// ---------------------------------------------------------------------------

// dryRunOnly is a literal type — must remain true for the entire MVP lifecycle.
// A proposal to remove this constraint requires a dedicated policy review slice,
// Codex review, and Michael approval before any implementation begins.
export type VerianBridgeAgentDescriptor = {
  readonly agentId: VerianBridgeAgentId
  readonly name: string
  readonly category: VerianBridgeAgentCategory
  readonly description: string
  readonly allowedModelFamilies: readonly VerianBridgeModelFamily[]
  readonly allowedTaskTypes: readonly string[]
  readonly allowedActions: readonly string[]
  readonly blockedActions: readonly string[]
  // Policies the Bridge must validate before routing a task to this agent.
  readonly requiredPolicyIds: readonly VerianPolicyProfileId[]
  readonly requiresHumanApproval: boolean
  readonly requiresCodexReview: boolean
  readonly dryRunOnly: true
}

// ---------------------------------------------------------------------------
// Shared blocked action baseline (all agents inherit this as a minimum)
// ---------------------------------------------------------------------------

const BASE_BLOCKED: readonly string[] = [
  'send-email',
  'campaign-sending',
  'touch-production',
  'apply-migration',
  'db-write',
  'enable-EMAIL_SENDING_ENABLED',
  'enable-CAMPAIGN_SENDING_ENABLED',
  'model-to-model-autonomous-routing',
  'bypass-human-approval',
] as const

// ---------------------------------------------------------------------------
// Development Agents
// ---------------------------------------------------------------------------

const CLAUDE_IMPLEMENTATION_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'claude_implementation_agent',
  name: 'Claude Implementation Agent',
  category: 'development',
  description:
    'Implements source files, services, repositories, and type modules under policy governance. ' +
    'Requires Codex review for high-risk slices and Michael approval before push.',
  allowedModelFamilies: ['claude'],
  allowedTaskTypes: [
    'create-repository-file',
    'create-service-file',
    'create-type-file',
    'create-test-file',
    'commit',
    'push',
  ],
  allowedActions: [
    'create-repository-file',
    'create-service-file',
    'create-type-file',
    'create-test-file',
    'commit',
    'push',
  ],
  blockedActions: [...BASE_BLOCKED, 'create-migration', 'create-ui', 'create-server-action', 'create-api-route', 'create-tag'],
  requiredPolicyIds: ['HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION', 'MEDIUM_RISK_BACKEND_NO_MIGRATION'],
  requiresHumanApproval: true,
  requiresCodexReview: true,
  dryRunOnly: true,
}

const CODEX_REVIEW_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'codex_review_agent',
  name: 'Codex Review Agent',
  category: 'development',
  description:
    'Performs independent code review, implementation review, and regression risk analysis. ' +
    'Produces review artifacts only — does not apply suggestions without human approval.',
  allowedModelFamilies: ['codex'],
  allowedTaskTypes: [
    'review-implementation',
    'review-commit',
    'review-regression-risk',
    'prepare-review-artifact',
    'receive-review-output',
  ],
  allowedActions: [
    'prepare-review-artifact',
    'pass-artifact-to-codex',
    'receive-codex-output',
    'commit-review-results',
  ],
  blockedActions: [...BASE_BLOCKED, 'apply-codex-suggestions-without-human-approval', 'auto-merge', 'create-tag'],
  requiredPolicyIds: ['CODEX_REVIEW_REQUIRED'],
  requiresHumanApproval: true,
  requiresCodexReview: false, // Codex IS the reviewer for this agent
  dryRunOnly: true,
}

const ARCHITECTURE_REVIEW_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'architecture_review_agent',
  name: 'Architecture Review Agent',
  category: 'development',
  description:
    'Reviews system architecture, module boundaries, and dependency design. ' +
    'Produces design documents and review summaries only.',
  allowedModelFamilies: ['claude', 'codex'],
  allowedTaskTypes: [
    'review-architecture',
    'review-module-boundaries',
    'review-dependency-design',
    'produce-design-summary',
  ],
  allowedActions: [
    'produce-design-summary',
    'create-design-document',
    'commit-design-document',
  ],
  blockedActions: [...BASE_BLOCKED, 'create-migration', 'create-tag', 'auto-merge'],
  requiredPolicyIds: ['HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION', 'CODEX_REVIEW_REQUIRED'],
  requiresHumanApproval: true,
  requiresCodexReview: true,
  dryRunOnly: true,
}

const DOCUMENTATION_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'documentation_agent',
  name: 'Documentation Agent',
  category: 'development',
  description:
    'Creates and updates markdown documentation, design documents, and productivity reports. ' +
    'No code changes, no migrations, no DB writes.',
  allowedModelFamilies: ['claude'],
  allowedTaskTypes: [
    'create-markdown-file',
    'update-markdown-file',
    'create-design-document',
    'create-productivity-report',
    'commit-docs',
    'push-docs',
  ],
  allowedActions: [
    'create-markdown-file',
    'update-markdown-file',
    'commit-docs',
    'push-docs',
  ],
  blockedActions: [...BASE_BLOCKED, 'create-code-file', 'create-migration', 'create-tag'],
  requiredPolicyIds: ['LOW_RISK_DOCS_ONLY'],
  requiresHumanApproval: false,
  requiresCodexReview: false,
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Business Intelligence Agents
// ---------------------------------------------------------------------------

const SALES_OPS_INTELLIGENCE_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'sales_ops_intelligence_agent',
  name: 'Sales Ops Intelligence Agent',
  category: 'business_intelligence',
  description:
    'Analyzes campaign performance and pipeline health. ' +
    'Produces insight reports and summaries only — does not write data or modify policy.',
  allowedModelFamilies: ['claude', 'gpt', 'qwen'],
  allowedTaskTypes: [
    'summarize-campaign-results',
    'analyze-pipeline-health',
    'generate-insight-report',
  ],
  allowedActions: [
    'read-scoring-data',
    'summarize-campaign-results',
    'generate-insight-report',
  ],
  blockedActions: [...BASE_BLOCKED, 'modify-campaign-policy', 'modify-scoring-thresholds', 'db-write', 'create-tag'],
  requiredPolicyIds: ['MEDIUM_RISK_BACKEND_NO_MIGRATION'],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

const LEAD_SCORING_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'lead_scoring_agent',
  name: 'Lead Scoring Agent',
  category: 'business_intelligence',
  description:
    'Classifies and summarizes lead behavior and scoring signals. ' +
    'Qwen may be used for structured extraction and classification. ' +
    'Does not modify scoring thresholds or write lead records.',
  allowedModelFamilies: ['qwen', 'claude'],
  allowedTaskTypes: [
    'classify-lead-behavior',
    'extract-scoring-signals',
    'summarize-lead-context',
  ],
  allowedActions: [
    'classify-lead-behavior',
    'extract-scoring-signals',
    'summarize-lead-context',
  ],
  blockedActions: [...BASE_BLOCKED, 'modify-scoring-thresholds', 'write-lead-record', 'create-tag'],
  requiredPolicyIds: ['MEDIUM_RISK_BACKEND_NO_MIGRATION'],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

const CAMPAIGN_RECOMMENDATION_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'campaign_recommendation_agent',
  name: 'Campaign Recommendation Agent',
  category: 'business_intelligence',
  description:
    'Recommends campaign sequences, templates, and targeting adjustments based on performance data. ' +
    'Produces structured recommendation artifacts only — does not apply changes.',
  allowedModelFamilies: ['claude', 'gpt', 'qwen'],
  allowedTaskTypes: [
    'recommend-campaign-sequence',
    'recommend-template',
    'recommend-targeting-adjustment',
    'produce-recommendation-artifact',
  ],
  allowedActions: [
    'produce-recommendation-artifact',
  ],
  blockedActions: [...BASE_BLOCKED, 'apply-campaign-change', 'modify-campaign-policy', 'create-tag'],
  requiredPolicyIds: ['MEDIUM_RISK_BACKEND_NO_MIGRATION'],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Messaging / Copy Agents
// ---------------------------------------------------------------------------

// NOTE: A future copywriting-specific policy profile (e.g. COPYWRITING_REVIEW_ONLY)
// should be added to the Verian Policy Layer in a future Goal 3 extension slice.
// Until that profile exists, copywriting agents reference BRIDGE_REVIEW_ONLY
// conservatively. This note should be revisited when the copywriting policy is designed.

const COPYWRITING_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'copywriting_agent',
  name: 'Copywriting Agent',
  category: 'messaging_copy',
  description:
    'Drafts and revises email copy using Qwen (default) with Claude/GPT escalation. ' +
    'Target score: 85. Max attempts: 3. Human approval required before approval queue. ' +
    'Auto-send blocked. Unsupported compliance/rate/savings claims must block or escalate.',
  allowedModelFamilies: ['qwen', 'claude', 'gpt'],
  allowedTaskTypes: [
    'draft-email-variant',
    'revise-email-draft',
    'score-draft',
    'flag-compliance-issue',
    'escalate-to-premium-model',
  ],
  allowedActions: [
    'draft-email-variant',
    'revise-email-draft',
    'score-draft',
    'flag-compliance-issue',
    'escalate-to-premium-model',
  ],
  blockedActions: [
    ...BASE_BLOCKED,
    'approve-final-output',
    'auto-send',
    'make-unsupported-savings-claim',
    'make-unsupported-rate-claim',
    'make-unsupported-compliance-claim',
    'create-tag',
  ],
  requiredPolicyIds: ['BRIDGE_REVIEW_ONLY'],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

const SUBJECT_LINE_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'subject_line_agent',
  name: 'Subject Line Agent',
  category: 'messaging_copy',
  description:
    'Generates email subject line options using Qwen. ' +
    'Returns a ranked list for human selection. Auto-send blocked.',
  allowedModelFamilies: ['qwen'],
  allowedTaskTypes: [
    'generate-subject-line-options',
    'rank-subject-lines',
  ],
  allowedActions: [
    'generate-subject-line-options',
    'rank-subject-lines',
  ],
  blockedActions: [...BASE_BLOCKED, 'approve-final-output', 'auto-send', 'create-tag'],
  requiredPolicyIds: ['BRIDGE_REVIEW_ONLY'],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

const PERSONALIZATION_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'personalization_agent',
  name: 'Personalization Agent',
  category: 'messaging_copy',
  description:
    'Generates short personalization snippets from structured lead data using Qwen. ' +
    'Does not make unsupported claims. Does not send.',
  allowedModelFamilies: ['qwen'],
  allowedTaskTypes: [
    'generate-personalization-snippet',
    'adjust-tone',
  ],
  allowedActions: [
    'generate-personalization-snippet',
    'adjust-tone',
  ],
  blockedActions: [
    ...BASE_BLOCKED,
    'make-unsupported-savings-claim',
    'make-unsupported-rate-claim',
    'make-unsupported-compliance-claim',
    'approve-final-output',
    'auto-send',
    'create-tag',
  ],
  requiredPolicyIds: ['BRIDGE_REVIEW_ONLY'],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

const QUALITY_REVIEW_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'quality_review_agent',
  name: 'Quality Review Agent',
  category: 'messaging_copy',
  description:
    'Scores and reviews draft copy against Verian quality standards. ' +
    'Flags compliance risks. Triggers escalation if score < 85 after 3 attempts.',
  allowedModelFamilies: ['verian_deterministic', 'claude', 'gpt'],
  allowedTaskTypes: [
    'score-draft',
    'flag-compliance-risk',
    'produce-quality-report',
    'trigger-escalation',
  ],
  allowedActions: [
    'score-draft',
    'flag-compliance-risk',
    'produce-quality-report',
    'trigger-escalation',
  ],
  blockedActions: [...BASE_BLOCKED, 'approve-final-output', 'auto-send', 'create-tag'],
  requiredPolicyIds: ['BRIDGE_REVIEW_ONLY'],
  requiresHumanApproval: true,
  requiresCodexReview: false,
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Policy / Safety Agents
// ---------------------------------------------------------------------------

const PROMPT_POLICY_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'prompt_policy_agent',
  name: 'Prompt Policy Agent',
  category: 'policy_safety',
  description:
    'Runs checkVerianPromptPolicy on task prompts before any routing decision. ' +
    'Returns pass/warning/blocked result. Does not execute tasks.',
  allowedModelFamilies: ['verian_deterministic'],
  allowedTaskTypes: [
    'run-policy-check',
    'validate-task-packet',
    'produce-audit-summary',
  ],
  allowedActions: [
    'run-policy-check',
    'validate-task-packet',
    'produce-audit-summary',
    'flag-policy-violation',
  ],
  blockedActions: [...BASE_BLOCKED, 'bypass-policy-check', 'self-approve-policy-result', 'create-tag'],
  requiredPolicyIds: ['BRIDGE_REVIEW_ONLY', 'CODEX_REVIEW_REQUIRED'],
  requiresHumanApproval: false,
  requiresCodexReview: false,
  dryRunOnly: true,
}

const RISK_CLASSIFIER_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'risk_classifier_agent',
  name: 'Risk Classifier Agent',
  category: 'policy_safety',
  description:
    'Classifies task risk level and recommends the appropriate policy profile ID. ' +
    'Does not execute tasks or modify policy profiles.',
  allowedModelFamilies: ['verian_deterministic', 'claude'],
  allowedTaskTypes: [
    'classify-task-risk',
    'recommend-policy-profile',
  ],
  allowedActions: [
    'classify-task-risk',
    'recommend-policy-profile',
  ],
  blockedActions: [...BASE_BLOCKED, 'modify-policy-profile', 'bypass-policy-check', 'create-tag'],
  requiredPolicyIds: ['BRIDGE_REVIEW_ONLY'],
  requiresHumanApproval: false,
  requiresCodexReview: false,
  dryRunOnly: true,
}

const APPROVAL_GATE_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'approval_gate_agent',
  name: 'Approval Gate Agent',
  category: 'policy_safety',
  description:
    'Surfaces human approval requirements and tracks approval state for task packets. ' +
    'Does not approve on behalf of Michael. Does not execute tasks.',
  allowedModelFamilies: ['verian_deterministic'],
  allowedTaskTypes: [
    'surface-approval-requirement',
    'track-approval-state',
    'block-on-missing-approval',
  ],
  allowedActions: [
    'surface-approval-requirement',
    'track-approval-state',
    'block-on-missing-approval',
  ],
  blockedActions: [...BASE_BLOCKED, 'self-approve', 'bypass-human-approval', 'create-tag'],
  requiredPolicyIds: ['BRIDGE_REVIEW_ONLY'],
  requiresHumanApproval: false, // This agent surfaces requirements; it does not require its own approval
  requiresCodexReview: false,
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Execution Agents
// ---------------------------------------------------------------------------

// NOTE: execution_gate_agent does not authorize execution in the MVP.
// It represents the future gate through which approved task packets will pass
// when autonomous execution is explicitly authorized in a dedicated future slice.
// Until that authorization exists, this agent reviews and holds packets only.

const EXECUTION_GATE_AGENT: VerianBridgeAgentDescriptor = {
  agentId: 'execution_gate_agent',
  name: 'Execution Gate Agent',
  category: 'execution',
  description:
    'Reviews approved task packets and verifies all gates are satisfied before any execution step. ' +
    'Does not execute in the MVP — holds packets pending explicit authorization. ' +
    'All execution requires human approval and policy check pass.',
  allowedModelFamilies: ['verian_deterministic'],
  allowedTaskTypes: [
    'verify-approval-gates',
    'verify-policy-check-pass',
    'verify-codex-review-complete',
    'hold-packet-for-authorization',
  ],
  allowedActions: [
    'verify-approval-gates',
    'verify-policy-check-pass',
    'verify-codex-review-complete',
    'hold-packet-for-authorization',
  ],
  blockedActions: [
    ...BASE_BLOCKED,
    'execute-task',
    'run-command',
    'push-commit',
    'apply-migration',
    'write-database',
    'bypass-human-approval',
    'bypass-policy-check',
    'create-tag',
  ],
  requiredPolicyIds: ['BRIDGE_REVIEW_ONLY'],
  requiresHumanApproval: true,
  requiresCodexReview: true,
  dryRunOnly: true,
}

// ---------------------------------------------------------------------------
// Registry exports
// ---------------------------------------------------------------------------

export const VERIAN_BRIDGE_AGENTS: readonly VerianBridgeAgentDescriptor[] = [
  CLAUDE_IMPLEMENTATION_AGENT,
  CODEX_REVIEW_AGENT,
  ARCHITECTURE_REVIEW_AGENT,
  DOCUMENTATION_AGENT,
  SALES_OPS_INTELLIGENCE_AGENT,
  LEAD_SCORING_AGENT,
  CAMPAIGN_RECOMMENDATION_AGENT,
  COPYWRITING_AGENT,
  SUBJECT_LINE_AGENT,
  PERSONALIZATION_AGENT,
  QUALITY_REVIEW_AGENT,
  PROMPT_POLICY_AGENT,
  RISK_CLASSIFIER_AGENT,
  APPROVAL_GATE_AGENT,
  EXECUTION_GATE_AGENT,
] as const

export const VERIAN_BRIDGE_AGENT_REGISTRY: Readonly<Record<VerianBridgeAgentId, VerianBridgeAgentDescriptor>> = {
  claude_implementation_agent: CLAUDE_IMPLEMENTATION_AGENT,
  codex_review_agent: CODEX_REVIEW_AGENT,
  architecture_review_agent: ARCHITECTURE_REVIEW_AGENT,
  documentation_agent: DOCUMENTATION_AGENT,
  sales_ops_intelligence_agent: SALES_OPS_INTELLIGENCE_AGENT,
  lead_scoring_agent: LEAD_SCORING_AGENT,
  campaign_recommendation_agent: CAMPAIGN_RECOMMENDATION_AGENT,
  copywriting_agent: COPYWRITING_AGENT,
  subject_line_agent: SUBJECT_LINE_AGENT,
  personalization_agent: PERSONALIZATION_AGENT,
  quality_review_agent: QUALITY_REVIEW_AGENT,
  prompt_policy_agent: PROMPT_POLICY_AGENT,
  risk_classifier_agent: RISK_CLASSIFIER_AGENT,
  approval_gate_agent: APPROVAL_GATE_AGENT,
  execution_gate_agent: EXECUTION_GATE_AGENT,
} as const
