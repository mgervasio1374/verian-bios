// Verian Agent Bridge — dry-run task packet builder.
// Deterministic only. No model calls. No shell commands. No file I/O.
// No network access. No environment variable access. No DB writes. No sending.
// This service is a safety-checked packet builder, not an execution engine.
// dryRunOnly: true is enforced on every packet produced.

import type {
  VerianBridgeAgentRecommendation,
  VerianBridgeApprovalRequirement,
  VerianBridgeCodexReviewRequirement,
  VerianBridgeModelRecommendation,
  VerianBridgeRequestedBy,
  VerianBridgeTaskId,
  VerianBridgeTaskPacket,
  VerianBridgeTaskType,
} from '@/modules/verian-agent-bridge/types'
import {
  VERIAN_BRIDGE_AGENT_REGISTRY,
} from '@/modules/verian-agent-bridge/agent-registry'
import type { VerianBridgeAgentId } from '@/modules/verian-agent-bridge/agent-registry'
import {
  VERIAN_BRIDGE_MODEL_ROUTES,
} from '@/modules/verian-agent-bridge/model-router'
import type { VerianPolicyProfileId, VerianPolicyValidationResult } from '@/modules/verian-policy/types'
import { VERIAN_POLICY_REGISTRY } from '@/modules/verian-policy/registry'
import { checkVerianPromptPolicy } from '@/modules/verian-policy/checker'

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export type VerianBridgeDryRunInput = {
  taskId: VerianBridgeTaskId
  goalId?: string
  sliceId?: string
  taskType: VerianBridgeTaskType
  policyId: VerianPolicyProfileId
  requestedBy: VerianBridgeRequestedBy
  intendedAgent: VerianBridgeAgentId
  promptText: string
  intendedActionSummary?: string
  evidenceProvided?: string[]
}

export type VerianBridgeDryRunResult = {
  status: 'packet_created' | 'blocked'
  taskPacket?: VerianBridgeTaskPacket
  policyResult: VerianPolicyValidationResult
  agentRecommendation?: VerianBridgeAgentRecommendation
  modelRecommendation?: VerianBridgeModelRecommendation
  humanApprovalRequirement: VerianBridgeApprovalRequirement
  codexReviewRequirement: VerianBridgeCodexReviewRequirement
  summary: string
}

// ---------------------------------------------------------------------------
// Route selection — deterministic, no model calls
// ---------------------------------------------------------------------------

function selectModelRoute(
  agentCategory: string,
  agentAllowedFamilies: readonly string[],
  taskType: string,
  riskLevel: string,
  requiresHumanApproval: boolean,
) {
  // Scoring: pick the best matching route from the static registry
  let best: (typeof VERIAN_BRIDGE_MODEL_ROUTES)[number] | undefined

  // 1. codex_code_review for development/review task types
  if (
    agentCategory === 'development' &&
    (taskType.includes('review') || taskType.includes('codex'))
  ) {
    const r = VERIAN_BRIDGE_MODEL_ROUTES.find(r => r.routeId === 'codex_code_review')
    if (r && agentAllowedFamilies.includes(r.modelFamily)) best = r
  }

  // 2. verian_deterministic_policy for policy_safety or execution agents
  if (!best && (agentCategory === 'policy_safety' || agentCategory === 'execution')) {
    const r = VERIAN_BRIDGE_MODEL_ROUTES.find(r => r.routeId === 'verian_deterministic_policy')
    if (r && agentAllowedFamilies.includes(r.modelFamily)) best = r
  }

  // 3. qwen routes for low-risk messaging_copy or low-risk BI only
  if (
    !best &&
    riskLevel === 'low' &&
    (agentCategory === 'messaging_copy' || agentCategory === 'business_intelligence')
  ) {
    const qwenRouteId =
      agentCategory === 'messaging_copy' ? 'qwen_low_cost_copy' : 'qwen_low_cost_classification'
    const r = VERIAN_BRIDGE_MODEL_ROUTES.find(r => r.routeId === qwenRouteId)
    if (r && agentAllowedFamilies.includes(r.modelFamily)) best = r
  }

  // 4. claude_premium_reasoning for development, BI, copy, policy_safety at any risk
  if (!best) {
    const r = VERIAN_BRIDGE_MODEL_ROUTES.find(r => r.routeId === 'claude_premium_reasoning')
    if (
      r &&
      agentAllowedFamilies.includes(r.modelFamily) &&
      r.allowedAgentCategories.includes(agentCategory as never)
    )
      best = r
  }

  // 5. gpt_premium_reasoning as fallback for same categories
  if (!best) {
    const r = VERIAN_BRIDGE_MODEL_ROUTES.find(r => r.routeId === 'gpt_premium_reasoning')
    if (
      r &&
      agentAllowedFamilies.includes(r.modelFamily) &&
      r.allowedAgentCategories.includes(agentCategory as never)
    )
      best = r
  }

  // 6. human_high_risk_approval when approval required and nothing else fits
  if (!best && requiresHumanApproval) {
    best = VERIAN_BRIDGE_MODEL_ROUTES.find(r => r.routeId === 'human_high_risk_approval')
  }

  return best
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildVerianBridgeDryRunPacket(
  input: VerianBridgeDryRunInput,
): VerianBridgeDryRunResult {
  const {
    taskId,
    goalId,
    sliceId,
    taskType,
    policyId,
    requestedBy,
    intendedAgent,
    promptText,
    intendedActionSummary,
    evidenceProvided,
  } = input

  // 1. Resolve policy profile — block immediately on unknown policyId
  const profile = VERIAN_POLICY_REGISTRY[policyId]
  if (!profile) {
    const policyResult: VerianPolicyValidationResult = {
      policyId,
      status: 'blocked',
      issues: [
        {
          severity: 'blocking',
          message: `Unknown policy ID: '${policyId}'. Verify against VERIAN_POLICY_REGISTRY before proceeding.`,
          policyId,
        },
      ],
    }
    return {
      status: 'blocked',
      policyResult,
      humanApprovalRequirement: {
        required: true,
        reason: `Unknown policy '${policyId}' — cannot determine approval requirements.`,
        status: 'pending',
      },
      codexReviewRequirement: {
        required: false,
        artifactRequired: '',
        status: 'skipped',
      },
      summary: `BLOCKED — Unknown policy ID '${policyId}'. No task packet created.`,
    }
  }

  // 2. Resolve agent descriptor — block on unknown intendedAgent
  const agent = VERIAN_BRIDGE_AGENT_REGISTRY[intendedAgent]
  if (!agent) {
    const policyResult: VerianPolicyValidationResult = {
      policyId,
      status: 'blocked',
      issues: [
        {
          severity: 'blocking',
          message: `Unknown agent ID: '${intendedAgent}'. Verify against VERIAN_BRIDGE_AGENT_REGISTRY before proceeding.`,
          policyId,
        },
      ],
    }
    return {
      status: 'blocked',
      policyResult,
      humanApprovalRequirement: {
        required: true,
        reason: `Unknown agent '${intendedAgent}' — cannot determine approval requirements.`,
        status: 'pending',
      },
      codexReviewRequirement: {
        required: profile.requiresCodexReview,
        artifactRequired: profile.requiresCodexReview
          ? 'Codex review artifact for the selected policy profile.'
          : '',
        status: profile.requiresCodexReview ? 'pending' : 'skipped',
      },
      summary: `BLOCKED — Unknown agent ID '${intendedAgent}'. No task packet created.`,
    }
  }

  // 3. Run policy check
  const policyResult = checkVerianPromptPolicy({
    policyId,
    promptText,
    intendedActionSummary,
    evidenceProvided,
  })

  // 4. Block if policy check is blocked
  if (policyResult.status === 'blocked') {
    const blockingIssues = policyResult.issues.filter(i => i.severity === 'blocking')
    const firstMsg = blockingIssues[0]?.message ?? 'Policy check blocked.'
    return {
      status: 'blocked',
      policyResult,
      humanApprovalRequirement: {
        required: true,
        reason: `Policy check blocked: ${firstMsg}`,
        status: 'pending',
      },
      codexReviewRequirement: {
        required: profile.requiresCodexReview,
        artifactRequired: profile.requiresCodexReview
          ? 'Codex review artifact for the selected policy profile.'
          : '',
        status: profile.requiresCodexReview ? 'pending' : 'skipped',
      },
      summary: `BLOCKED — ${blockingIssues.length} blocking violation(s) under policy '${policyId}'. No task packet created.`,
    }
  }

  // 5. Select a model route deterministically
  const requiresHumanApproval =
    profile.requiresHumanApproval ||
    agent.requiresHumanApproval ||
    policyResult.status === 'warning'
  const requiresCodexReview = profile.requiresCodexReview || agent.requiresCodexReview

  const route = selectModelRoute(
    agent.category,
    agent.allowedModelFamilies,
    taskType,
    profile.riskLevel,
    requiresHumanApproval,
  )

  // If no route fits, return a warning/blocked conservatively
  if (!route) {
    return {
      status: 'blocked',
      policyResult,
      humanApprovalRequirement: {
        required: true,
        reason: `No model route found for agent '${intendedAgent}' (category: ${agent.category}) under policy '${policyId}'.`,
        status: 'pending',
      },
      codexReviewRequirement: {
        required: requiresCodexReview,
        artifactRequired: requiresCodexReview ? 'Codex review artifact.' : '',
        status: requiresCodexReview ? 'pending' : 'skipped',
      },
      summary: `BLOCKED — No suitable model route found for agent '${intendedAgent}' and task type '${taskType}'. No task packet created.`,
    }
  }

  // 6. Build structured recommendations
  const agentRecommendation: VerianBridgeAgentRecommendation = {
    agentCategory: agent.category,
    intendedAgent,
    rationale: `Agent '${agent.name}' selected for category '${agent.category}' under policy '${policyId}'.`,
    escalationTriggered: false,
  }

  const modelRecommendation: VerianBridgeModelRecommendation = {
    recommendedModel: route.modelFamily,
    rationale: `Route '${route.routeId}' selected: ${route.description}`,
    costTier: route.costTier,
  }

  // 7. Build task packet
  const taskPacket: VerianBridgeTaskPacket = {
    taskId,
    goalId,
    sliceId,
    taskType,
    riskLevel: profile.riskLevel,
    policyId,
    requestedBy,
    intendedAgent,
    agentCategory: agent.category,
    recommendedModel: route.modelFamily,
    modelCostTier: route.costTier,
    promptText,
    policyCheckStatus: policyResult.status,
    requiredEvidence: profile.requiredEvidence,
    requiredReviewers: profile.requiredReviewers,
    stopConditions: profile.stopConditions,
    allowedActions: profile.allowedActions,
    blockedActions: profile.blockedActions,
    requiresHumanApproval,
    requiresCodexReview,
    dryRunOnly: true,
  }

  // 8. Build approval and Codex review requirements
  const humanApprovalRequirement: VerianBridgeApprovalRequirement = {
    required: requiresHumanApproval,
    reason: requiresHumanApproval
      ? policyResult.status === 'warning'
        ? `Policy check returned WARNING — human approval required before proceeding.`
        : `Policy '${policyId}' or agent '${intendedAgent}' requires human approval.`
      : `Policy '${policyId}' and agent '${intendedAgent}' do not require human approval for this task.`,
    status: 'pending',
  }

  const codexReviewRequirement: VerianBridgeCodexReviewRequirement = {
    required: requiresCodexReview,
    artifactRequired: requiresCodexReview
      ? `Codex review artifact for policy '${policyId}' and agent '${intendedAgent}'.`
      : '',
    status: requiresCodexReview ? 'pending' : 'skipped',
  }

  // 9. Compute summary
  const warningCount = policyResult.issues.filter(i => i.severity === 'warning').length
  const summary =
    policyResult.status === 'warning'
      ? `WARNING — ${warningCount} warning(s) under policy '${policyId}'. Task packet created for dry-run review. Human approval required before any action.`
      : `PASS — Policy check passed under '${policyId}'. Task packet created for dry-run review.${requiresHumanApproval ? ' Human approval required.' : ''}${requiresCodexReview ? ' Codex review required.' : ''}`

  return {
    status: 'packet_created',
    taskPacket,
    policyResult,
    agentRecommendation,
    modelRecommendation,
    humanApprovalRequirement,
    codexReviewRequirement,
    summary,
  }
}
