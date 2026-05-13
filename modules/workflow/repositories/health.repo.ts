import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type WorkflowRunRow = Database['public']['Tables']['workflow_runs']['Row']
type JobExecutionRow = Database['public']['Tables']['job_executions']['Row']
type EventQueueRow = Database['public']['Tables']['event_dispatch_queue']['Row']

// ---- Outbox health ----

export async function getOutboxCounts(tenantId: string): Promise<{
  pending: number
  failed: number
}> {
  const supabase = createSupabaseServiceClient()

  // Supabase count queries — use `head: true` to get count without data
  const [pendingResult, failedResult] = await Promise.all([
    supabase
      .from('event_dispatch_queue')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending'),
    supabase
      .from('event_dispatch_queue')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'failed'),
  ])

  return {
    pending: pendingResult.count ?? 0,
    failed: failedResult.count ?? 0,
  }
}

export async function getFailedOutboxEvents(
  tenantId: string,
  limit = 20
): Promise<EventQueueRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('event_dispatch_queue')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getFailedOutboxEvents: ${error.message}`)
  return data ?? []
}

// ---- Workflow run health ----

export async function getStuckWorkflows(
  tenantId: string,
  stuckAfterMinutes = 10
): Promise<WorkflowRunRow[]> {
  const supabase = createSupabaseServiceClient()
  const cutoff = new Date(Date.now() - stuckAfterMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .order('started_at', { ascending: true })
    .limit(50)

  if (error) throw new Error(`getStuckWorkflows: ${error.message}`)
  return data ?? []
}

export async function getFailedWorkflows(
  tenantId: string,
  limit = 20
): Promise<WorkflowRunRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'failed')
    .order('failed_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getFailedWorkflows: ${error.message}`)
  return data ?? []
}

// ---- Email send health ----

export interface EmailSendStatusCount {
  status: string
  count: number
}

/**
 * Aggregate email_sends by status for this tenant.
 * Single query; pivoted in JS.
 */
export async function getEmailSendStatusCounts(
  tenantId: string
): Promise<EmailSendStatusCount[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_sends')
    .select('status')
    .eq('tenant_id', tenantId)

  if (error) throw new Error(`getEmailSendStatusCounts: ${error.message}`)

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return Object.entries(counts).map(([status, count]) => ({ status, count }))
}

// ---- Job execution health ----

export async function getLatestScoringJobs(
  tenantId: string,
  limit = 20
): Promise<JobExecutionRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('job_executions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('job_type', 'score_lead')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getLatestScoringJobs: ${error.message}`)
  return data ?? []
}
