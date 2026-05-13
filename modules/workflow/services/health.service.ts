import type { RequestContext } from '@/types/context'
import type { Database } from '@/types/database'
import * as healthRepo from '@/modules/workflow/repositories/health.repo'
import type { EmailSendStatusCount } from '@/modules/workflow/repositories/health.repo'
import { getEmailDraftMetrics, type EmailDraftMetrics } from '@/modules/messaging/services/email-draft-metrics.service'

type WorkflowRunRow = Database['public']['Tables']['workflow_runs']['Row']
type JobExecutionRow = Database['public']['Tables']['job_executions']['Row']
type EventQueueRow = Database['public']['Tables']['event_dispatch_queue']['Row']

export interface OutboxHealth {
  pendingCount: number
  failedCount: number
  failedEvents: EventQueueRow[]
}

export interface WorkflowHealth {
  stuckCount: number
  stuckWorkflows: WorkflowRunRow[]        // running > 10 min
  failedCount: number
  recentFailures: WorkflowRunRow[]
}

export interface ScoringJobHealth {
  recentJobs: JobExecutionRow[]
  completedCount: number
  failedCount: number
  avgDurationMs: number | null
}

export interface EmailSendHealth {
  /** Total sends by status — sent, delivered, bounced, complained, failed, queued */
  statusCounts: EmailSendStatusCount[]
  totalSent: number
  totalDelivered: number
  totalBounced: number
  totalFailed: number
}

export interface WorkflowHealthReport {
  outbox: OutboxHealth
  workflows: WorkflowHealth
  scoringJobs: ScoringJobHealth
  emailDrafts: EmailDraftMetrics
  emailSends: EmailSendHealth
  generatedAt: string
}

/**
 * Aggregate workflow and scoring health for a tenant.
 * Server-side utility — uses service client, no RLS.
 * Intended for ops dashboards and automated monitoring.
 */
export async function getWorkflowHealth(
  ctx: RequestContext
): Promise<WorkflowHealthReport> {
  const tenantId = ctx.tenantId

  const [
    outboxCounts,
    failedOutboxEvents,
    stuckWorkflows,
    failedWorkflows,
    latestScoringJobs,
    emailDrafts,
    emailSendStatusCounts,
  ] = await Promise.all([
    healthRepo.getOutboxCounts(tenantId),
    healthRepo.getFailedOutboxEvents(tenantId),
    healthRepo.getStuckWorkflows(tenantId, 10),
    healthRepo.getFailedWorkflows(tenantId),
    healthRepo.getLatestScoringJobs(tenantId),
    getEmailDraftMetrics(ctx),
    healthRepo.getEmailSendStatusCounts(tenantId),
  ])

  // Scoring job aggregates from the recent jobs sample
  const completedJobs = latestScoringJobs.filter(j => j.status === 'completed')
  const failedJobs = latestScoringJobs.filter(j => j.status === 'failed')
  const durationsMs = completedJobs
    .map(j => j.duration_ms)
    .filter((d): d is number => typeof d === 'number')
  const avgDurationMs = durationsMs.length > 0
    ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length)
    : null

  return {
    outbox: {
      pendingCount: outboxCounts.pending,
      failedCount: outboxCounts.failed,
      failedEvents: failedOutboxEvents,
    },
    workflows: {
      stuckCount: stuckWorkflows.length,
      stuckWorkflows,
      failedCount: failedWorkflows.length,
      recentFailures: failedWorkflows,
    },
    scoringJobs: {
      recentJobs: latestScoringJobs,
      completedCount: completedJobs.length,
      failedCount: failedJobs.length,
      avgDurationMs,
    },
    emailDrafts,
    emailSends: {
      statusCounts: emailSendStatusCounts,
      totalSent:      emailSendStatusCounts.find(r => r.status === 'sent')?.count      ?? 0,
      totalDelivered: emailSendStatusCounts.find(r => r.status === 'delivered')?.count ?? 0,
      totalBounced:   emailSendStatusCounts.find(r => r.status === 'bounced')?.count   ?? 0,
      totalFailed:    emailSendStatusCounts.find(r => r.status === 'failed')?.count    ?? 0,
    },
    generatedAt: new Date().toISOString(),
  }
}
