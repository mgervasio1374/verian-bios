import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  LeadPipelineStats,
  EmailSendMetrics,
  LearningSignalRow,
  LearningSignalSummary,
} from './analytics.types'

const WINDOW_DAYS = 30

function windowStart(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function getLeadPipelineStats(tenantId: string): Promise<LeadPipelineStats> {
  const supabase = createSupabaseServiceClient()
  const thirtyDaysAgo = windowStart(WINDOW_DAYS)

  const [allLeads, newLeads] = await Promise.all([
    supabase
      .from('leads')
      .select('stage, priority, workflow_enabled')
      .eq('tenant_id', tenantId),
    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', thirtyDaysAgo),
  ])

  const rows = allLeads.data ?? []
  const byStage:    Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  let workflowEnabled  = 0
  let workflowDisabled = 0

  for (const row of rows) {
    if (row.stage)    byStage[row.stage]       = (byStage[row.stage] ?? 0) + 1
    if (row.priority) byPriority[row.priority] = (byPriority[row.priority] ?? 0) + 1
    if (row.workflow_enabled) workflowEnabled++
    else workflowDisabled++
  }

  return {
    total:            rows.length,
    newLast30Days:    newLeads.count ?? 0,
    workflowEnabled,
    workflowDisabled,
    byStage,
    byPriority,
  }
}

export async function getEmailSendMetrics(
  tenantId:   string,
  windowDays: number = WINDOW_DAYS,
): Promise<EmailSendMetrics> {
  const supabase = createSupabaseServiceClient()
  const since = windowStart(windowDays)

  const [sendsResult, activityResult] = await Promise.all([
    supabase
      .from('email_sends')
      .select('status')
      .eq('tenant_id', tenantId)
      .gte('created_at', since),
    supabase
      .from('activity_events')
      .select('event_type')
      .eq('tenant_id', tenantId)
      .in('event_type', ['ET_EMAIL_OPENED', 'ET_EMAIL_CLICKED'])
      .gte('occurred_at', since),
  ])

  const sends   = sendsResult.data ?? []
  const counts: Record<string, number> = {}
  for (const row of sends) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }

  let openEvents  = 0
  let clickEvents = 0
  for (const row of activityResult.data ?? []) {
    if (row.event_type === 'ET_EMAIL_OPENED') openEvents++
    if (row.event_type === 'ET_EMAIL_CLICKED') clickEvents++
  }

  const totalSends = sends.length
  const delivered  = counts['delivered']  ?? 0
  const bounced    = counts['bounced']    ?? 0
  const complained = counts['complained'] ?? 0
  const failed     = counts['failed']     ?? 0

  return {
    windowDays,
    totalSends,
    delivered,
    bounced,
    complained,
    failed,
    openEvents,
    clickEvents,
    deliveryRate:  totalSends > 0 ? delivered / totalSends : null,
    bounceRate:    totalSends > 0 ? bounced / totalSends : null,
    complaintRate: totalSends > 0 ? complained / totalSends : null,
    openRate:      delivered > 0 ? openEvents / delivered : null,
    clickRate:     delivered > 0 ? clickEvents / delivered : null,
  }
}

export async function getLatestLearningSignals(tenantId: string): Promise<LearningSignalSummary> {
  const supabase = createSupabaseServiceClient()

  const { data: latest } = await supabase
    .from('learning_snapshots')
    .select('run_id, computed_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) {
    return { latestRunId: null, latestRunAt: null, signals: [] }
  }

  const { data: rows } = await supabase
    .from('learning_snapshots')
    .select('dimension, dimension_value, signal_name, rate, sample_n, confidence, computed_at')
    .eq('tenant_id', tenantId)
    .eq('run_id', latest.run_id)
    .is('deleted_at', null)
    .in('dimension', ['strategy_angle', 'message_type'])

  const signals: LearningSignalRow[] = (rows ?? []).map(r => ({
    dimension:      r.dimension,
    dimensionValue: r.dimension_value,
    signalName:     r.signal_name,
    rate:           r.rate !== null ? Number(r.rate) : null,
    sampleN:        r.sample_n,
    confidence:     r.confidence,
    computedAt:     r.computed_at,
  }))

  return {
    latestRunId: latest.run_id,
    latestRunAt: latest.computed_at,
    signals,
  }
}

export async function getOpenErrorCount(tenantId: string): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { count } = await supabase
    .from('automation_failures')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('status', ['open', 'investigating'])
  return count ?? 0
}
