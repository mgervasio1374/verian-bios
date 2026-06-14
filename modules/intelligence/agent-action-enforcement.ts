import { VERIAN_BRIDGE_AGENT_REGISTRY, BASE_BLOCKED } from '@/modules/verian-agent-bridge/agent-registry'

// Pure runtime classifier for agent action-contracts. Turns the previously
// DECLARED-ONLY registry contract (allowedActions / blockedActions / BASE_BLOCKED)
// into a verdict the enforcement service can act on. No IO — fully unit-testable.
// Lives in the intelligence layer (not the verian-agent-bridge module) because the
// bridge is kept pure/file-inventory-locked; enforcement + its IO belong here.
//
// Posture (decided in the agent sweep — hybrid):
//   - BASE_BLOCKED actions are UNIVERSAL hard-blocks (send-email, db-write,
//     apply-migration, bypass-human-approval, …) — they must never run, for any
//     agent, so the service always throws on 'block_hard'.
//   - An action in an agent's own blockedActions, or one that is neither allowed
//     nor blocked ('unlisted'), is advisory by default (recorded, allowed to
//     proceed) and only fail-closed when AGENT_ACTION_ENFORCEMENT_ENABLED is on.
//   - An unknown agent id is a hard block (an unregistered actor may do nothing).

export type ActionDecision = 'allow' | 'block_hard' | 'block_agent' | 'unlisted'

export interface ActionVerdict {
  decision: ActionDecision
  reason:   string
}

const BASE_BLOCKED_SET = new Set(BASE_BLOCKED)

export function classifyAgentAction(agentId: string, action: string): ActionVerdict {
  // BASE_BLOCKED is universal — check it before the registry lookup so even an
  // unknown agent can never be classified as allowed for a base-blocked action.
  if (BASE_BLOCKED_SET.has(action)) {
    return { decision: 'block_hard', reason: `'${action}' is a base-blocked action (universal)` }
  }

  const descriptor = VERIAN_BRIDGE_AGENT_REGISTRY[agentId as keyof typeof VERIAN_BRIDGE_AGENT_REGISTRY]
  if (!descriptor) {
    return { decision: 'block_hard', reason: `unknown agent '${agentId}' — not in the registry` }
  }

  if (descriptor.blockedActions.includes(action)) {
    return { decision: 'block_agent', reason: `'${action}' is in ${agentId}'s blockedActions` }
  }
  if (descriptor.allowedActions.includes(action)) {
    return { decision: 'allow', reason: `'${action}' is allowed for ${agentId}` }
  }
  return { decision: 'unlisted', reason: `'${action}' is not in ${agentId}'s allowed or blocked actions` }
}
