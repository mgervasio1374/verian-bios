import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'
import type { AgentRunStatus, AgentRunType } from '@/modules/intelligence/types.agent'

type AgentRunRow = Database['public']['Tables']['agent_runs']['Row']

export interface CreateAgentRunInput {
  tenantId: string
  workspaceId?: string
  agentName: string
  runType?: AgentRunType
  triggerEvent?: string
  triggerSource?: string
  triggerId?: string
  subjectType?: string
  subjectId?: string
  workflowRunId?: string
  modelUsed?: string
  inputSnapshot?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export async function createAgentRun(
  input: CreateAgentRunInput
): Promise<AgentRunRow> {
  const supabase = createSupabaseServiceClient()
  const row = {
    tenant_id:       input.tenantId,
    workspace_id:    input.workspaceId    ?? null,
    agent_name:      input.agentName,
    run_type:        input.runType        ?? null,
    trigger_event:   input.triggerEvent   ?? null,
    trigger_source:  input.triggerSource  ?? null,
    trigger_id:      input.triggerId      ?? null,
    subject_type:    input.subjectType    ?? null,
    subject_id:      input.subjectId      ?? null,
    workflow_run_id: input.workflowRunId  ?? null,
    model_used:      input.modelUsed      ?? null,
    input_snapshot:  input.inputSnapshot  ?? {},
    metadata:        input.metadata       ?? {},
    status:          'running',
    started_at:      new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('agent_runs')
    .insert(row)
    .select()
    .single()

  if (error) throw new Error(`createAgentRun: ${error.message}`)
  return data
}

export async function completeAgentRun(
  id: string,
  output: {
    outputSnapshot?: Record<string, unknown>
    confidence?: number
    promptTokens?: number
    completionTokens?: number
    durationMs?: number
  } = {}
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const now = new Date().toISOString()
  await supabase
    .from('agent_runs')
    .update({
      status:            'completed',
      completed_at:      now,
      output_snapshot:   output.outputSnapshot   ?? undefined,
      confidence:        output.confidence        ?? null,
      prompt_tokens:     output.promptTokens      ?? null,
      completion_tokens: output.completionTokens  ?? null,
      duration_ms:       output.durationMs        ?? null,
    })
    .eq('id', id)
}

export async function failAgentRun(
  id: string,
  errorMessage: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('agent_runs')
    .update({
      status:        'failed',
      completed_at:  new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', id)
}

export async function killAgentRun(
  id: string,
  killedBy: string | null,
  killedReason: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('agent_runs')
    .update({
      status:        'killed',
      completed_at:  new Date().toISOString(),
      killed_by:     killedBy,
      killed_reason: killedReason,
    })
    .eq('id', id)
}

export async function getAgentRunById(
  id: string,
  tenantId: string
): Promise<AgentRunRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data ?? null
}

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
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('agent_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.status)       query = query.eq('status', opts.status)
  if (opts.agentName)    query = query.eq('agent_name', opts.agentName)
  if (opts.subjectType)  query = query.eq('subject_type', opts.subjectType)
  if (opts.subjectId)    query = query.eq('subject_id', opts.subjectId)
  if (opts.workflowRunId) query = query.eq('workflow_run_id', opts.workflowRunId)

  const { data, error } = await query
  if (error) throw new Error(`listAgentRuns: ${error.message}`)
  return data ?? []
}
