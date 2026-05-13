import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type AutomationFailureRow = Database['public']['Tables']['automation_failures']['Row']

interface AutomationFailureInput {
  tenantId: string
  workflowRunId?: string | null
  jobExecutionId?: string | null
  failureType: string
  errorCode?: string | null
  errorMessage?: string | null
  stackTrace?: string | null
  context?: Record<string, unknown>
}

export async function createAutomationFailure(
  input: AutomationFailureInput
): Promise<AutomationFailureRow> {
  const supabase = createSupabaseServiceClient()

  const { data, error } = await supabase
    .from('automation_failures')
    .insert({
      tenant_id: input.tenantId,
      workflow_run_id: input.workflowRunId ?? null,
      job_execution_id: input.jobExecutionId ?? null,
      failure_type: input.failureType,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      stack_trace: input.stackTrace ?? null,
      context: input.context ?? {},
      resolved: false,
    })
    .select()
    .single()

  if (error) throw new Error(`createAutomationFailure: ${error.message}`)
  return data
}

export async function getUnresolvedFailures(
  tenantId: string,
  limit = 50
): Promise<AutomationFailureRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('automation_failures')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getUnresolvedFailures: ${error.message}`)
  return data ?? []
}
