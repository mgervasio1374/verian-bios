import * as agentRunRepo from '@/modules/intelligence/repositories/agent-run.repo'
import * as agentRunStepRepo from '@/modules/intelligence/repositories/agent-run-step.repo'
import * as guardrailEventRepo from '@/modules/intelligence/repositories/guardrail-event.repo'
import type {
  AgentRunRow,
  AgentRunStepRow,
  GuardrailEventRow,
  AgentRunType,
  AgentRunStatus,
} from '@/modules/intelligence/types.agent'
import type { CreateAgentRunInput } from '@/modules/intelligence/repositories/agent-run.repo'
import type { CreateAgentRunStepInput } from '@/modules/intelligence/repositories/agent-run-step.repo'

// ---- Types ----

export interface AgentRunTrace {
  run: AgentRunRow
  steps: AgentRunStepRow[]
  guardrailEvents: GuardrailEventRow[]
}

export type { CreateAgentRunInput, CreateAgentRunStepInput }

// ---- Run lifecycle ----

export async function startAgentRun(
  input: CreateAgentRunInput
): Promise<AgentRunRow> {
  return agentRunRepo.createAgentRun(input)
}

export async function completeAgentRun(
  runId: string,
  output: {
    outputSnapshot?: Record<string, unknown>
    confidence?: number
    promptTokens?: number
    completionTokens?: number
    durationMs?: number
  } = {}
): Promise<void> {
  return agentRunRepo.completeAgentRun(runId, output)
}

export async function failAgentRun(
  runId: string,
  errorMessage: string
): Promise<void> {
  return agentRunRepo.failAgentRun(runId, errorMessage)
}

export async function killAgentRun(
  runId: string,
  killedBy: string | null,
  killedReason: string
): Promise<void> {
  return agentRunRepo.killAgentRun(runId, killedBy, killedReason)
}

// ---- Step lifecycle ----

export async function logAgentRunStep(
  input: CreateAgentRunStepInput
): Promise<AgentRunStepRow> {
  return agentRunStepRepo.createAgentRunStep(input)
}

export async function completeAgentRunStep(
  stepId: string,
  output: {
    output?: Record<string, unknown>
    inputSummary?: string
    decisionSummary?: string
    outputSummary?: string
    confidence?: number
    guardrailStatus?: string
    durationMs?: number
    metadata?: Record<string, unknown>
  } = {}
): Promise<void> {
  return agentRunStepRepo.completeAgentRunStep(stepId, output)
}

export async function failAgentRunStep(
  stepId: string,
  errorMessage: string,
  guardrailStatus?: string
): Promise<void> {
  return agentRunStepRepo.failAgentRunStep(stepId, errorMessage, guardrailStatus)
}

// ---- Trace ----

// Returns the complete decision trace for a run: run + ordered steps + guardrail events.
export async function getAgentRunTrace(
  runId: string,
  tenantId: string
): Promise<AgentRunTrace | null> {
  const run = await agentRunRepo.getAgentRunById(runId, tenantId)
  if (!run) return null

  const [steps, guardrailEvents] = await Promise.all([
    agentRunStepRepo.listAgentRunSteps(runId),
    guardrailEventRepo.listGuardrailEvents(tenantId, { agentRunId: runId, limit: 100 }),
  ])

  return { run, steps, guardrailEvents }
}

// ---- Query ----

export async function listAgentRuns(
  tenantId: string,
  opts: {
    status?: AgentRunStatus
    agentName?: string
    subjectType?: string
    subjectId?: string
    workflowRunId?: string
    limit?: number
  } = {}
): Promise<AgentRunRow[]> {
  return agentRunRepo.listAgentRuns(tenantId, opts)
}
