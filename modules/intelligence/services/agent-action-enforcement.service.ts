import * as guardrail from '@/modules/intelligence/services/guardrail.service'
import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey, GuardrailSeverity } from '@/modules/intelligence/types.agent'
import { classifyAgentAction, type ActionDecision } from '@/modules/intelligence/agent-action-enforcement'

// Runtime governance harness — turns the declared agent action-contract into an
// enforced one. Every consequential agent action should route through
// enforceAgentAction() before it runs. Hybrid posture (see agent-action-enforcement.ts):
// BASE_BLOCKED + unknown-agent + control-pause are hard-blocked (throw); an agent's
// own blockedActions / unlisted actions are advisory (recorded, allowed) until
// AGENT_ACTION_ENFORCEMENT_ENABLED flips them to fail-closed.

export interface EnforceAgentActionCtx {
  tenantId:    string
  workspaceId?: string
  agentRunId?: string | null
}

export interface EnforceResult {
  allowed:  boolean       // may the action proceed?
  decision: ActionDecision
  advisory: boolean       // true when a non-allow verdict was let through (record-only)
  reason:   string
}

const GUARDRAIL_TYPE = 'agent_action_contract'

// Throws on a hard block (BASE_BLOCKED, unknown agent, or — when enforcement is on —
// an agent-specific/unlisted action). Returns a result otherwise; inspect `advisory`.
export async function enforceAgentAction(
  ctx:     EnforceAgentActionCtx,
  agentId: string,
  action:  string,
): Promise<EnforceResult> {
  // 1. Layer controls (global pause / agent layer off) are a hard pre-gate.
  //    evaluateAgentControls records its own guardrail event when it blocks.
  const controls = await guardrail.evaluateAgentControls(ctx.agentRunId ?? '', ctx.tenantId)
  if (!controls.allowed) {
    throw new Error(`[agent-enforcement] ${agentId}/${action} blocked by control: ${controls.reason}`)
  }

  // 2. Contract verdict.
  const verdict = classifyAgentAction(agentId, action)
  if (verdict.decision === 'allow') {
    return { allowed: true, decision: 'allow', advisory: false, reason: verdict.reason }
  }

  const base = {
    tenantId:      ctx.tenantId,
    workspaceId:   ctx.workspaceId,
    agentRunId:    ctx.agentRunId ?? undefined,
    guardrailName: `agent_action:${agentId}:${action}`,
    guardrailType: GUARDRAIL_TYPE,
    reason:        verdict.reason,
    context:       { agentId, action, decision: verdict.decision },
  }

  // 3. BASE_BLOCKED + unknown agent → always hard-block.
  if (verdict.decision === 'block_hard') {
    await guardrail.recordBlockingGuardrail({ ...base, severity: GuardrailSeverity.HIGH, actionTaken: 'blocked' })
    // recordBlockingGuardrail throws — unreachable, but satisfies the type checker.
    throw new Error(`[agent-enforcement] ${verdict.reason}`)
  }

  // 4. Agent-specific blocked / unlisted → advisory unless enforcement is flipped on.
  const enforce = await systemControlRepo.getBooleanControl(
    SystemControlKey.AGENT_ACTION_ENFORCEMENT_ENABLED, ctx.tenantId, false,
  )
  if (enforce) {
    await guardrail.recordBlockingGuardrail({ ...base, severity: GuardrailSeverity.HIGH, actionTaken: 'blocked' })
    throw new Error(`[agent-enforcement] ${verdict.reason}`)
  }

  await guardrail.recordGuardrail({
    ...base,
    severity:    GuardrailSeverity.MEDIUM,
    actionTaken: 'recorded_advisory',
    controlKey:  SystemControlKey.AGENT_ACTION_ENFORCEMENT_ENABLED,
  })
  return { allowed: true, decision: verdict.decision, advisory: true, reason: verdict.reason }
}
