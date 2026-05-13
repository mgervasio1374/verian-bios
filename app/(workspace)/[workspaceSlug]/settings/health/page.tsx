import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { getWorkflowHealth } from '@/modules/workflow/services/health.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function WorkflowHealthPage({ params }: PageProps) {
  await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  const health = await getWorkflowHealth(ctx)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Workflow Health</h1>
        <p className="text-muted-foreground text-sm">
          Generated {new Date(health.generatedAt).toLocaleString()}
        </p>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Pending Outbox"
          value={health.outbox.pendingCount}
          variant={health.outbox.pendingCount > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label="Failed Outbox"
          value={health.outbox.failedCount}
          variant={health.outbox.failedCount > 0 ? 'error' : 'ok'}
        />
        <StatCard
          label="Stuck Workflows"
          value={health.workflows.stuckCount}
          variant={health.workflows.stuckCount > 0 ? 'error' : 'ok'}
        />
        <StatCard
          label="Failed Workflows"
          value={health.workflows.failedCount}
          variant={health.workflows.failedCount > 0 ? 'warn' : 'ok'}
        />
      </div>

      {/* Scoring job summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Scoring Jobs (last 20)</CardTitle>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>✓ {health.scoringJobs.completedCount} completed</span>
              <span>✗ {health.scoringJobs.failedCount} failed</span>
              {health.scoringJobs.avgDurationMs !== null && (
                <span>avg {health.scoringJobs.avgDurationMs}ms</span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <JobTable jobs={health.scoringJobs.recentJobs} />
        </CardContent>
      </Card>

      {/* Stuck workflows */}
      {health.workflows.stuckWorkflows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-destructive">
              Stuck Workflows (&gt;10 min)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WorkflowTable runs={health.workflows.stuckWorkflows} />
          </CardContent>
        </Card>
      )}

      {/* Failed workflows */}
      {health.workflows.recentFailures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Failed Workflows</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkflowTable runs={health.workflows.recentFailures} />
          </CardContent>
        </Card>
      )}

      {/* Failed outbox events */}
      {health.outbox.failedEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Failed Outbox Events</CardTitle>
          </CardHeader>
          <CardContent>
            <OutboxTable events={health.outbox.failedEvents} />
          </CardContent>
        </Card>
      )}

      {/* Email Draft Metrics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Email Draft Metrics</CardTitle>
            <span className="text-xs text-muted-foreground">
              {health.emailDrafts.total_drafts_created} total
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DraftMetricCell
              label="Pending Review"
              value={health.emailDrafts.drafts_pending_approval}
              className="text-amber-600"
            />
            <DraftMetricCell
              label="Approved"
              value={health.emailDrafts.drafts_approved}
              className="text-green-600"
            />
            <DraftMetricCell
              label="Rejected"
              value={health.emailDrafts.drafts_rejected}
              className="text-destructive"
            />
            <DraftMetricCell
              label="Superseded"
              value={health.emailDrafts.drafts_superseded}
              className="text-muted-foreground"
            />
          </div>
          {health.emailDrafts.drafts_blocked_by_safety === null && (
            <p className="text-xs text-muted-foreground mt-3">
              Safety-blocked draft count requires additional logging instrumentation.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Email Send Metrics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Email Send Metrics</CardTitle>
            <span className="text-xs text-muted-foreground">
              {health.emailSends.statusCounts.reduce((n, r) => n + r.count, 0)} total
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DraftMetricCell label="Sent"      value={health.emailSends.totalSent}      className="text-blue-600" />
            <DraftMetricCell label="Delivered" value={health.emailSends.totalDelivered} className="text-green-600" />
            <DraftMetricCell label="Bounced"   value={health.emailSends.totalBounced}   className="text-destructive" />
            <DraftMetricCell label="Failed"    value={health.emailSends.totalFailed}    className="text-destructive" />
          </div>
          {(health.emailSends.totalBounced > 0 || health.emailSends.totalFailed > 0) && (
            <p className="text-xs text-destructive mt-3">
              Review bounced and failed sends — contacts may need to be updated or suppressed.
            </p>
          )}
        </CardContent>
      </Card>

      {/* All-clear */}
      {health.outbox.failedCount === 0 &&
        health.workflows.stuckCount === 0 &&
        health.workflows.failedCount === 0 && (
          <p className="text-sm text-muted-foreground">No workflow issues detected.</p>
        )}
    </div>
  )
}

function DraftMetricCell({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${className ?? ''}`}>{value}</p>
    </div>
  )
}

// ---- Sub-components ----

function StatCard({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: 'ok' | 'warn' | 'error'
}) {
  const color =
    variant === 'error' ? 'text-destructive' :
    variant === 'warn' ? 'text-yellow-600' :
    'text-green-600'
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

type JobRow = {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  failed_at: string | null
  duration_ms: number | null
  error_message: string | null
}

function JobTable({ jobs }: { jobs: JobRow[] }) {
  if (jobs.length === 0) {
    return <p className="text-sm text-muted-foreground">No scoring jobs recorded.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 text-left font-medium">Status</th>
            <th className="pb-2 text-left font-medium">Started</th>
            <th className="pb-2 text-left font-medium">Duration</th>
            <th className="pb-2 text-left font-medium">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="py-1.5 pr-4">
                <StatusBadge status={j.status} />
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">
                {j.started_at ? new Date(j.started_at).toLocaleString() : '—'}
              </td>
              <td className="py-1.5 pr-4 tabular-nums text-muted-foreground">
                {j.duration_ms != null ? `${j.duration_ms}ms` : '—'}
              </td>
              <td className="py-1.5 text-destructive max-w-xs truncate">
                {j.error_message ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type WorkflowRun = {
  id: string
  status: string
  subject_type: string | null
  subject_id: string | null
  started_at: string | null
  failed_at: string | null
  error_message: string | null
}

function WorkflowTable({ runs }: { runs: WorkflowRun[] }) {
  if (runs.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 text-left font-medium">Status</th>
            <th className="pb-2 text-left font-medium">Subject</th>
            <th className="pb-2 text-left font-medium">Started</th>
            <th className="pb-2 text-left font-medium">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="py-1.5 pr-4">
                <StatusBadge status={r.status} />
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground font-mono">
                {r.subject_type ?? '—'}{r.subject_id ? ` · ${r.subject_id.slice(0, 8)}…` : ''}
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">
                {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
              </td>
              <td className="py-1.5 text-destructive max-w-xs truncate">
                {r.error_message ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type OutboxEvent = {
  id: string
  event_type: string
  status: string
  attempts: number
  last_error: string | null
  created_at: string
}

function OutboxTable({ events }: { events: OutboxEvent[] }) {
  if (events.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 text-left font-medium">Event Type</th>
            <th className="pb-2 text-left font-medium">Attempts</th>
            <th className="pb-2 text-left font-medium">Created</th>
            <th className="pb-2 text-left font-medium">Last Error</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {events.map((e) => (
            <tr key={e.id}>
              <td className="py-1.5 pr-4 font-mono">{e.event_type}</td>
              <td className="py-1.5 pr-4 tabular-nums">{e.attempts}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">
                {new Date(e.created_at).toLocaleString()}
              </td>
              <td className="py-1.5 text-destructive max-w-xs truncate">
                {e.last_error ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'completed' ? 'default' :
    status === 'failed' ? 'destructive' :
    status === 'running' ? 'secondary' :
    'outline'
  return <Badge variant={variant as 'default' | 'destructive' | 'secondary' | 'outline'}>{status}</Badge>
}
