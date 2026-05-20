import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'
import type { AgentRunStepStatus } from '@/modules/intelligence/types.agent'

type AgentRunStepRow = Database['public']['Tables']['agent_run_steps']['Row']

export interface CreateAgentRunStepInput {
  tenantId: string
  agentRunId: string
  stepName: string
  stepIndex?: number
  input?: Record<string, unknown>
  inputSummary?: string
}

export async function createAgentRunStep(
  input: CreateAgentRunStepInput
): Promise<AgentRunStepRow> {
  const supabase = createSupabaseServiceClient()
  const row = {
    tenant_id:    input.tenantId,
    agent_run_id: input.agentRunId,
    step_name:    input.stepName,
    step_index:   input.stepIndex   ?? 0,
    status:       'running',
    input:        input.input       ?? {},
    input_summary: input.inputSummary ?? null,
    started_at:   new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('agent_run_steps')
    .insert(row)
    .select()
    .single()

  if (error) throw new Error(`createAgentRunStep: ${error.message}`)
  return data
}

export async function completeAgentRunStep(
  id: string,
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
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('agent_run_steps')
    .update({
      status:           'completed',
      completed_at:     new Date().toISOString(),
      output:           output.output           ?? undefined,
      input_summary:    output.inputSummary     ?? null,
      decision_summary: output.decisionSummary  ?? null,
      output_summary:   output.outputSummary    ?? null,
      confidence:       output.confidence       ?? null,
      guardrail_status: output.guardrailStatus  ?? null,
      duration_ms:      output.durationMs       ?? null,
      metadata:         output.metadata         ?? undefined,
    })
    .eq('id', id)
}

export async function failAgentRunStep(
  id: string,
  errorMessage: string,
  guardrailStatus?: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('agent_run_steps')
    .update({
      status:           'failed',
      completed_at:     new Date().toISOString(),
      error_message:    errorMessage,
      guardrail_status: guardrailStatus ?? null,
    })
    .eq('id', id)
}

export async function skipAgentRunStep(id: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('agent_run_steps')
    .update({ status: 'skipped', completed_at: new Date().toISOString() })
    .eq('id', id)
}

export async function listAgentRunSteps(
  agentRunId: string,
  opts: { status?: AgentRunStepStatus } = {}
): Promise<AgentRunStepRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('agent_run_steps')
    .select('*')
    .eq('agent_run_id', agentRunId)
    .order('step_index', { ascending: true })

  if (opts.status) query = query.eq('status', opts.status)

  const { data, error } = await query
  if (error) throw new Error(`listAgentRunSteps: ${error.message}`)
  return data ?? []
}
