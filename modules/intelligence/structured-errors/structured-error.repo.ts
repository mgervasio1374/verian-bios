import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { sendOpsAlert } from '@/modules/intelligence/alerting/alerting.service'
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

  // Ops Alerting v1: severe errors page a human. AWAITED — on Vercel the
  // function freezes at response time and an unawaited promise is killed, which
  // silently dropped the alert email (proven 2026-07-04: structured error row
  // existed, no OPS_ALERT_SENT, no email). sendOpsAlert never throws by
  // contract and the .catch is belt-and-braces, so awaiting cannot break the
  // code path that errored — it only adds ~100ms to error paths. Keyed by
  // error code / failure type so a repeat alerts at most once per throttle window.
  if (data.severity === 'critical' || data.severity === 'error') {
    const code = input.errorCode ?? input.failureType
    const refs = [
      `failure id: ${data.id}`,
      `tenant: ${input.tenantId}`,
      input.module          ? `module: ${input.module}`                     : null,
      input.route           ? `route: ${input.route}`                       : null,
      input.correlationId   ? `correlation id: ${input.correlationId}`      : null,
      input.workflowRunId   ? `workflow run: ${input.workflowRunId}`        : null,
      input.jobExecutionId  ? `job execution: ${input.jobExecutionId}`      : null,
    ].filter(Boolean)
    await sendOpsAlert({
      tenantId: input.tenantId,
      key: `structured_error:${code}`,
      subject: `[Verian ${data.severity}] structured error: ${code}`,
      body: [input.errorMessage ?? '(no error message)', '', ...refs].join('\n'),
    }).catch(() => {})
  }

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
  id:          string,
  tenantId:    string,
  resolvedBy?: string | null,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('automation_failures')
    .update({
      status:      SE_STATUS.RESOLVED,
      resolved:    true,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy ?? null,
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

export async function getStructuredErrorById(
  id:       string,
  tenantId: string,
): Promise<AutomationFailureRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('automation_failures')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()
  if (error) return null
  return data
}

export async function getWorkflowErrorsForLead(
  tenantId: string,
  leadId:   string,
): Promise<AutomationFailureRow[]> {
  const supabase = createSupabaseServiceClient()

  const { data: runs, error: runsError } = await supabase
    .from('workflow_runs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('subject_type', 'lead')
    .eq('subject_id', leadId)
    .limit(20)

  if (runsError) throw new Error(`getWorkflowErrorsForLead (runs): ${runsError.message}`)
  const runIds = (runs ?? []).map((r) => r.id)
  if (runIds.length === 0) return []

  const { data, error } = await supabase
    .from('automation_failures')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('workflow_run_id', runIds)
    .in('status', ['open', 'investigating'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw new Error(`getWorkflowErrorsForLead (failures): ${error.message}`)
  return data ?? []
}
