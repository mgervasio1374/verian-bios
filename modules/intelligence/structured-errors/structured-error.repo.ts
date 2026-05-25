import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'
import type {
  CreateStructuredErrorInput,
  StructuredErrorStats,
  SeStatus,
} from './structured-error.types'
import { SE_STATUS } from './structured-error.types'

type AutomationFailureRow = Database['public']['Tables']['automation_failures']['Row']

export async function createStructuredError(
  input: CreateStructuredErrorInput,
): Promise<AutomationFailureRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('automation_failures')
    .insert({
      tenant_id:        input.tenantId,
      workspace_id:     input.workspaceId     ?? null,
      failure_type:     input.failureType,
      error_code:       input.errorCode       ?? null,
      error_message:    input.errorMessage    ?? null,
      stack_trace:      input.stackTrace      ?? null,
      severity:         input.severity        ?? 'error',
      status:           SE_STATUS.OPEN,
      module:           input.module          ?? null,
      route:            input.route           ?? null,
      correlation_id:   input.correlationId   ?? null,
      payload_snapshot: input.payloadSnapshot ?? {},
      context:          input.context         ?? {},
      resolved:         false,
      workflow_run_id:  input.workflowRunId   ?? null,
      job_execution_id: input.jobExecutionId  ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`createStructuredError: ${error.message}`)
  return data
}

export async function listOpenErrors(
  tenantId: string,
  limit = 50,
): Promise<AutomationFailureRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('automation_failures')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', [SE_STATUS.OPEN, SE_STATUS.INVESTIGATING])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listOpenErrors: ${error.message}`)
  return data ?? []
}

export async function resolveStructuredError(
  id:       string,
  tenantId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('automation_failures')
    .update({
      status:      SE_STATUS.RESOLVED,
      resolved:    true,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`resolveStructuredError: ${error.message}`)
}

export async function updateErrorStatus(
  id:       string,
  tenantId: string,
  status:   SeStatus,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('automation_failures')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`updateErrorStatus: ${error.message}`)
}

export async function dismissRecommendation(
  id:       string,
  tenantId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('agent_recommendations')
    .update({ status: 'dismissed' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`dismissRecommendation: ${error.message}`)
}

export async function getErrorStats(
  tenantId: string,
): Promise<StructuredErrorStats> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('automation_failures')
    .select('severity, status')
    .eq('tenant_id', tenantId)

  if (error) throw new Error(`getErrorStats: ${error.message}`)
  const rows = data ?? []

  return {
    total:              rows.length,
    criticalCount:      rows.filter(r => r.severity === 'critical').length,
    errorCount:         rows.filter(r => r.severity === 'error').length,
    warningCount:       rows.filter(r => r.severity === 'warning').length,
    infoCount:          rows.filter(r => r.severity === 'info').length,
    openCount:          rows.filter(r => r.status   === 'open').length,
    investigatingCount: rows.filter(r => r.status   === 'investigating').length,
  }
}
