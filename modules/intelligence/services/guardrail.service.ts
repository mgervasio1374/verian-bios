import * as guardrailEventRepo from '@/modules/intelligence/repositories/guardrail-event.repo'
import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey, GuardrailSeverity, GuardrailStatus } from '@/modules/intelligence/types.agent'

// ---- Types ----

export interface GuardrailResult {
  allowed: boolean
  severity: GuardrailSeverity | string
  status: GuardrailStatus | string
  reason: string
  actionTaken: string
}

const ALLOWED: GuardrailResult = {
  allowed:     true,
  severity:    GuardrailSeverity.LOW,
  status:      GuardrailStatus.RESOLVED,
  reason:      'Check passed.',
  actionTaken: 'none',
}

interface RecordGuardrailInput {
  tenantId: string
  workspaceId?: string
  agentRunId?: string
  guardrailName: string
  guardrailType: string
  severity: GuardrailSeverity
  subjectType?: string
  subjectId?: string
  reason: string
  actionTaken: string
  controlKey?: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

// ---- Non-blocking guardrail record ----

// Records a guardrail event without halting execution.
// Use for warnings or audit trail entries.
export async function recordGuardrail(
  input: RecordGuardrailInput
): Promise<GuardrailResult> {
  await guardrailEventRepo.recordGuardrailEvent(input)
  return {
    allowed:     true,
    severity:    input.severity,
    status:      GuardrailStatus.OPEN,
    reason:      input.reason,
    actionTaken: input.actionTaken,
  }
}

// ---- Blocking guardrail record ----

// Records a guardrail event AND throws, halting the agent step.
// Use when the violation must prevent the action from proceeding.
export async function recordBlockingGuardrail(
  input: RecordGuardrailInput
): Promise<never> {
  await guardrailEventRepo.recordGuardrailEvent(input)
  throw new Error(
    `[guardrail:${input.guardrailName}] Blocked — ${input.reason} ` +
    `(${input.guardrailType}, severity=${input.severity})`
  )
}

// ---- Confidence check ----

// Returns a blocked result if confidence is below the configured minimum threshold.
// Does NOT automatically record a guardrail event — callers decide whether to record.
export async function checkLowConfidence(
  agentRunId: string,
  tenantId: string,
  confidence: number
): Promise<GuardrailResult> {
  const thresholdValue = await systemControlRepo.getControlValue(
    SystemControlKey.AGENT_CONFIDENCE_THRESHOLD_MIN,
    tenantId
  )

  const threshold = typeof thresholdValue === 'number' ? thresholdValue : 0.7

  if (confidence < threshold) {
    return {
      allowed:     false,
      severity:    GuardrailSeverity.MEDIUM,
      status:      GuardrailStatus.OPEN,
      reason:      `Confidence ${confidence.toFixed(2)} is below threshold ${threshold.toFixed(2)}.`,
      actionTaken: 'blocked',
    }
  }

  return ALLOWED
}

// ---- Required data check ----

// Returns a blocked result if any required fields are missing.
// missingFields: array of field names that are absent.
export function checkRequiredData(
  _agentRunId: string,
  _tenantId: string,
  entityLabel: string,
  missingFields: string[]
): GuardrailResult {
  if (missingFields.length === 0) return ALLOWED

  return {
    allowed:     false,
    severity:    GuardrailSeverity.HIGH,
    status:      GuardrailStatus.OPEN,
    reason:      `${entityLabel} is missing required fields: ${missingFields.join(', ')}.`,
    actionTaken: 'blocked',
  }
}

// ---- Duplicate recommendation check ----

// Placeholder — always returns allowed until the recommendation service is built.
// A real implementation will query agent_recommendations for existing pending recs
// of the same type for the same subject before allowing a new one to be created.
export function checkDuplicateRecommendationPlaceholder(
  _subjectType: string,
  _subjectId: string,
  _recommendationType: string
): GuardrailResult {
  return ALLOWED
}

// ---- Agent control evaluation ----

// Evaluates whether agent controls permit execution.
// Returns a GuardrailResult — does NOT throw.
// Callers who need to halt should call assertAgentsAllowed() from system-control.service.
export async function evaluateAgentControls(
  agentRunId: string,
  tenantId: string
): Promise<GuardrailResult> {
  const paused = await systemControlRepo.getBooleanControl(
    SystemControlKey.GLOBAL_AGENT_PAUSE,
    tenantId,
    false
  )

  if (paused) {
    await guardrailEventRepo.recordGuardrailEvent({
      tenantId,
      agentRunId,
      guardrailName: 'global_agent_pause',
      guardrailType: 'kill_switch',
      severity:      GuardrailSeverity.CRITICAL,
      controlKey:    SystemControlKey.GLOBAL_AGENT_PAUSE,
      actionTaken:   'blocked',
      reason:        'global_agent_pause is enabled — all agent activity is suspended.',
    })

    return {
      allowed:     false,
      severity:    GuardrailSeverity.CRITICAL,
      status:      GuardrailStatus.OPEN,
      reason:      'Global agent pause is active.',
      actionTaken: 'blocked',
    }
  }

  const agentEnabled = await systemControlRepo.getBooleanControl(
    SystemControlKey.AGENT_ENABLED,
    tenantId,
    true
  )

  if (!agentEnabled) {
    await guardrailEventRepo.recordGuardrailEvent({
      tenantId,
      agentRunId,
      guardrailName: 'agent_layer_disabled',
      guardrailType: 'kill_switch',
      severity:      GuardrailSeverity.HIGH,
      controlKey:    SystemControlKey.AGENT_ENABLED,
      actionTaken:   'blocked',
      reason:        'agent.enabled is false — agent layer is disabled.',
    })

    return {
      allowed:     false,
      severity:    GuardrailSeverity.HIGH,
      status:      GuardrailStatus.OPEN,
      reason:      'Agent layer is disabled.',
      actionTaken: 'blocked',
    }
  }

  return ALLOWED
}
