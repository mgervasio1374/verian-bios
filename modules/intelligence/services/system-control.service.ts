import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
import type { SystemControlRow } from '@/modules/intelligence/types.agent'

// ---- Read ----

export async function getControl(
  key: SystemControlKey | string,
  tenantId: string
): Promise<SystemControlRow | null> {
  return systemControlRepo.resolveSystemControl(key, tenantId)
}

// Reads the boolean value of a control from the value field.
// is_enabled is NOT used for runtime behavior — it only marks whether
// the row is visible/active in the admin UI.
export async function getBooleanControl(
  key: SystemControlKey | string,
  tenantId: string,
  defaultValue = false
): Promise<boolean> {
  return systemControlRepo.getBooleanControl(key, tenantId, defaultValue)
}

// ---- Assertions (throw on blocked) ----

// Throws if global_agent_pause=true OR agent.enabled=false.
// Call at the top of any agent entry point before starting a run.
export async function assertAgentsAllowed(tenantId: string): Promise<void> {
  // global_agent_pause: value=true → agents are halted. Default false (not paused).
  const paused = await systemControlRepo.getBooleanControl(
    SystemControlKey.GLOBAL_AGENT_PAUSE,
    tenantId,
    false
  )
  if (paused) {
    throw new Error(
      `[system-control] Agent activity blocked: global_agent_pause is enabled. ` +
      `Disable it in Admin → System Controls before running agents.`
    )
  }

  // agent.enabled: value=false → agent layer disabled. Default true (enabled).
  const agentEnabled = await systemControlRepo.getBooleanControl(
    SystemControlKey.AGENT_ENABLED,
    tenantId,
    true
  )
  if (!agentEnabled) {
    throw new Error(
      `[system-control] Agent activity blocked: agent.enabled is false.`
    )
  }
}

// Throws if recommendation_engine_enabled=false.
export async function assertRecommendationEngineAllowed(tenantId: string): Promise<void> {
  const enabled = await systemControlRepo.getBooleanControl(
    SystemControlKey.RECOMMENDATION_ENGINE_ENABLED,
    tenantId,
    true
  )
  if (!enabled) {
    throw new Error(
      `[system-control] Recommendation engine is disabled (recommendation_engine_enabled=false).`
    )
  }
}

// Throws if auto_task_creation_enabled=false.
export async function assertAutoTaskCreationAllowed(tenantId: string): Promise<void> {
  const enabled = await systemControlRepo.getBooleanControl(
    SystemControlKey.AUTO_TASK_CREATION_ENABLED,
    tenantId,
    true
  )
  if (!enabled) {
    throw new Error(
      `[system-control] Auto task creation is disabled (auto_task_creation_enabled=false).`
    )
  }
}

// Generic assertion for any boolean control.
// Throws if the control's value is false (or absent and defaultValue is false).
export async function requireControlEnabled(
  key: SystemControlKey | string,
  tenantId: string,
  featureName: string,
  defaultValue = false
): Promise<void> {
  const enabled = await systemControlRepo.getBooleanControl(key, tenantId, defaultValue)
  if (!enabled) {
    throw new Error(`[system-control] "${featureName}" is disabled (${key}=false).`)
  }
}

// ---- Non-throwing checks ----

// Returns true if global_agent_pause=true (agents should halt).
export async function isGlobalAgentPaused(tenantId: string): Promise<boolean> {
  return systemControlRepo.getBooleanControl(
    SystemControlKey.GLOBAL_AGENT_PAUSE,
    tenantId,
    false
  )
}
