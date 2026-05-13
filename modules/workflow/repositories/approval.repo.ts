import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type ApprovalRow = Database['public']['Tables']['approval_requests']['Row']
type WorkflowRunRow = Database['public']['Tables']['workflow_runs']['Row']

export async function createWorkflowRun(data: {
  tenantId: string
  workspaceId?: string
  workflowConfigId?: string
  triggerEventId?: string
  subjectType?: string
  subjectId?: string
  context?: Record<string, unknown>
}): Promise<WorkflowRunRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('workflow_runs')
    .insert({
      tenant_id: data.tenantId,
      workspace_id: data.workspaceId ?? null,
      workflow_config_id: data.workflowConfigId ?? null,
      trigger_event_id: data.triggerEventId ?? null,
      status: 'running',
      subject_type: data.subjectType ?? null,
      subject_id: data.subjectId ?? null,
      started_at: new Date().toISOString(),
      context: data.context ?? {},
    })
    .select()
    .single()

  if (error) throw new Error(`createWorkflowRun: ${error.message}`)
  return row
}

export async function updateWorkflowRunStatus(
  id: string,
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled',
  extra: { errorMessage?: string } = {}
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const update: Record<string, unknown> = { status }
  if (status === 'completed') update.completed_at = new Date().toISOString()
  if (status === 'failed') {
    update.failed_at = new Date().toISOString()
    if (extra.errorMessage) update.error_message = extra.errorMessage
  }
  await supabase.from('workflow_runs').update(update).eq('id', id)
}

export async function createApprovalRequest(data: {
  tenantId: string
  workspaceId?: string
  workflowRunId?: string
  jobExecutionId?: string
  requestType: string
  assigneeId?: string
  subjectType?: string
  subjectId?: string
  payload: Record<string, unknown>
  expiresAt?: string
}): Promise<ApprovalRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('approval_requests')
    .insert({
      tenant_id: data.tenantId,
      workspace_id: data.workspaceId ?? null,
      workflow_run_id: data.workflowRunId ?? null,
      job_execution_id: data.jobExecutionId ?? null,
      request_type: data.requestType,
      status: 'pending',
      requested_by_system: true,
      assignee_id: data.assigneeId ?? null,
      subject_type: data.subjectType ?? null,
      subject_id: data.subjectId ?? null,
      payload: data.payload,
      expires_at: data.expiresAt ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`createApprovalRequest: ${error.message}`)
  return row
}

export async function resolveApprovalRequest(
  id: string,
  tenantId: string,
  userId: string,
  decision: 'approved' | 'rejected',
  decisionData: Record<string, unknown> = {}
): Promise<ApprovalRow> {
  const supabase = createSupabaseServiceClient()
  const update: Record<string, unknown> = {
    status: decision,
    decided_at: new Date().toISOString(),
    decision: decisionData,
  }
  if (decision === 'approved') update.approved_by = userId

  const { data: row, error } = await supabase
    .from('approval_requests')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .select()
    .single()

  if (error) throw new Error(`resolveApprovalRequest: ${error.message}`)
  return row
}

export async function getApprovalById(
  id: string,
  tenantId: string
): Promise<ApprovalRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()
  return data ?? null
}

export async function listPendingApprovals(
  tenantId: string,
  workspaceId: string,
  assigneeId?: string
): Promise<ApprovalRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('approval_requests')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (workspaceId) query = query.eq('workspace_id', workspaceId)
  if (assigneeId) query = query.eq('assignee_id', assigneeId)

  const { data, error } = await query
  if (error) throw new Error(`listPendingApprovals: ${error.message}`)
  return data ?? []
}
