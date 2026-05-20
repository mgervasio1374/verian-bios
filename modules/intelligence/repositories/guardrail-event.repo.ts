import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'
import type { GuardrailSeverity, GuardrailStatus } from '@/modules/intelligence/types.agent'

type GuardrailEventRow = Database['public']['Tables']['guardrail_events']['Row']

export interface RecordGuardrailEventInput {
  tenantId: string
  workspaceId?: string
  agentRunId?: string
  guardrailName: string
  guardrailType: string
  severity?: GuardrailSeverity
  controlKey?: string
  subjectType?: string
  subjectId?: string
  actionTaken: string
  reason?: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export async function recordGuardrailEvent(
  input: RecordGuardrailEventInput
): Promise<GuardrailEventRow> {
  const supabase = createSupabaseServiceClient()
  const row = {
    tenant_id:      input.tenantId,
    workspace_id:   input.workspaceId  ?? null,
    agent_run_id:   input.agentRunId   ?? null,
    guardrail_name: input.guardrailName,
    guardrail_type: input.guardrailType,
    severity:       input.severity     ?? 'medium',
    status:         'open',
    control_key:    input.controlKey   ?? null,
    subject_type:   input.subjectType  ?? null,
    subject_id:     input.subjectId    ?? null,
    action_taken:   input.actionTaken,
    reason:         input.reason       ?? null,
    context:        input.context      ?? {},
    metadata:       input.metadata     ?? {},
  }
  const { data, error } = await supabase
    .from('guardrail_events')
    .insert(row)
    .select()
    .single()

  if (error) throw new Error(`recordGuardrailEvent: ${error.message}`)
  return data
}

export async function acknowledgeGuardrailEvent(
  id: string,
  tenantId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('guardrail_events')
    .update({ status: 'acknowledged' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
}

export async function resolveGuardrailEvent(
  id: string,
  tenantId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  await supabase
    .from('guardrail_events')
    .update({ status: 'resolved' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .in('status', ['open', 'acknowledged'])
}

export async function listGuardrailEvents(
  tenantId: string,
  opts: {
    agentRunId?: string
    status?: GuardrailStatus
    severity?: GuardrailSeverity
    limit?: number
  } = {}
): Promise<GuardrailEventRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('guardrail_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('triggered_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.agentRunId) query = query.eq('agent_run_id', opts.agentRunId)
  if (opts.status)     query = query.eq('status', opts.status)
  if (opts.severity)   query = query.eq('severity', opts.severity)

  const { data, error } = await query
  if (error) throw new Error(`listGuardrailEvents: ${error.message}`)
  return data ?? []
}

export async function countOpenGuardrailEvents(tenantId: string): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { count, error } = await supabase
    .from('guardrail_events')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'open')

  if (error) throw new Error(`countOpenGuardrailEvents: ${error.message}`)
  return count ?? 0
}
