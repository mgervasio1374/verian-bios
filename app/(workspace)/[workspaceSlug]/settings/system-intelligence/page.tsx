import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getOpenErrorsSummary } from '@/modules/intelligence/structured-errors/structured-error.service'
import {
  resolveErrorAction,
  investigateErrorAction,
  ignoreErrorAction,
  dismissRecommendationAction,
} from '@/modules/intelligence/structured-errors/structured-error.actions'
import { getWorkflowHealth } from '@/modules/workflow/services/health.service'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Activity, Database, ArrowRight } from 'lucide-react'
import { GenerateRecsButton } from './GenerateRecsButton'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

const SEVERITY_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  error:    'destructive',
  warning:  'outline',
  info:     'secondary',
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  failed:              'destructive',
  partially_committed: 'outline',
  committed:           'default',
  canceled:            'secondary',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const SYSTEM_REC_TYPES = [
  'SYSTEM_ERROR_DIAGNOSIS',
  'SYSTEM_WORKFLOW_RECOMMENDATION',
  'SYSTEM_PERFORMANCE_WARNING',
  'SYSTEM_IMPORT_HEALTH',
  'SYSTEM_DOCUMENTATION_NEEDED',
]

export default async function SystemIntelligencePage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const serviceClient = createSupabaseServiceClient()

  const [errorsSummary, healthReport, systemRecsResult, failedBatchesResult] = await Promise.all([
    getOpenErrorsSummary(ctx),
    getWorkflowHealth(ctx),
    serviceClient
      .from('agent_recommendations')
      .select('id, recommendation_type, title, body, priority, severity, source_agent, created_at, status')
      .eq('tenant_id', ctx.tenantId)
      .in('recommendation_type', SYSTEM_REC_TYPES)
      .in('status', ['pending', 'new'])
      .order('created_at', { ascending: false })
      .limit(20),
    serviceClient
      .from('import_batches')
      .select('id, original_filename, status, total_rows, committed_rows, failed_commit_rows, created_at')
      .eq('tenant_id', ctx.tenantId)
      .in('status', ['failed', 'partially_committed'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const systemRecs = systemRecsResult.data ?? []
  const failedBatches = failedBatchesResult.data ?? []
  const criticalErrors = errorsSummary.recentOpenErrors.filter(e => e.severity === 'critical' || e.severity === 'error')
  const base = `/${workspaceSlug}`

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only triage view. All data is advisory — no auto-actions are triggered from this page.
        </p>
      </div>

      {/* Open Errors Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Open Errors</p>
            <p className="text-3xl font-bold mt-1">{errorsSummary.openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Critical / Error</p>
            <p className={`text-3xl font-bold mt-1 ${errorsSummary.criticalErrors > 0 ? 'text-destructive' : ''}`}>
              {errorsSummary.criticalErrors}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Failed Batches</p>
            <p className={`text-3xl font-bold mt-1 ${failedBatches.length > 0 ? 'text-orange-600' : ''}`}>
              {failedBatches.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">System Recs</p>
            <p className="text-3xl font-bold mt-1">{systemRecs.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical / Open Errors Table */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <CardTitle className="text-base">Critical &amp; Open Errors</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {criticalErrors.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No critical or error-level open issues.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Severity</th>
                  <th className="text-left p-3 font-medium">Module</th>
                  <th className="text-left p-3 font-medium">Message</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {criticalErrors.map(err => (
                  <tr key={err.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3 font-mono text-xs">{err.failure_type}</td>
                    <td className="p-3">
                      <Badge variant={SEVERITY_VARIANT[err.severity] ?? 'secondary'}>
                        {err.severity}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{err.module ?? '—'}</td>
                    <td className="p-3 text-muted-foreground max-w-xs truncate">{err.error_message ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{fmtDate(err.created_at)}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <form action={resolveErrorAction}>
                          <input type="hidden" name="id" value={err.id} />
                          <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
                          <button type="submit" className="text-xs text-primary hover:underline">
                            Resolve
                          </button>
                        </form>
                        <form action={investigateErrorAction}>
                          <input type="hidden" name="id" value={err.id} />
                          <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
                          <button type="submit" className="text-xs text-muted-foreground hover:underline">
                            Investigate
                          </button>
                        </form>
                        <form action={ignoreErrorAction}>
                          <input type="hidden" name="id" value={err.id} />
                          <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
                          <button type="submit" className="text-xs text-muted-foreground hover:underline">
                            Ignore
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Workflow Health Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <CardTitle className="text-base">Workflow Health</CardTitle>
          </div>
          <Link href={`${base}/settings/health`} className="text-xs text-primary hover:underline flex items-center gap-1">
            Full Health Page <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Stuck Workflows</p>
              <p className={`text-2xl font-bold ${healthReport.workflows.stuckCount > 0 ? 'text-orange-600' : ''}`}>
                {healthReport.workflows.stuckCount}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Failed Workflows</p>
              <p className={`text-2xl font-bold ${healthReport.workflows.failedCount > 0 ? 'text-destructive' : ''}`}>
                {healthReport.workflows.failedCount}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Pending Outbox</p>
              <p className="text-2xl font-bold">{healthReport.outbox.pendingCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Failed / Partially-Committed Import Batches */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <CardTitle className="text-base">Failed &amp; Partially-Committed Imports</CardTitle>
          </div>
          <Link href={`${base}/settings/imports`} className="text-xs text-primary hover:underline flex items-center gap-1">
            All Imports <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {failedBatches.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No failed or partially-committed import batches.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Filename</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  <th className="text-right p-3 font-medium">Committed</th>
                  <th className="text-right p-3 font-medium">Failed</th>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {failedBatches.map(batch => (
                  <tr key={batch.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3 font-mono text-xs">{batch.original_filename ?? '—'}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[batch.status] ?? 'secondary'}>
                        {batch.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">{batch.total_rows}</td>
                    <td className="p-3 text-right">{batch.committed_rows}</td>
                    <td className="p-3 text-right text-destructive">{batch.failed_commit_rows}</td>
                    <td className="p-3 text-muted-foreground">{fmtDate(batch.created_at)}</td>
                    <td className="p-3 text-right">
                      <Link
                        href={`${base}/settings/imports/${batch.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Generate Recommendations */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">System Recommendations</p>
          <p className="text-xs text-muted-foreground">
            Analyse current system state and generate advisory recommendations.
          </p>
        </div>
        <GenerateRecsButton workspaceSlug={workspaceSlug} />
      </div>

      {/* Pending System Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending System Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {systemRecs.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No pending system recommendations.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Title</th>
                  <th className="text-left p-3 font-medium">Severity</th>
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {systemRecs.map(rec => (
                  <tr key={rec.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3 font-mono text-xs">{rec.recommendation_type}</td>
                    <td className="p-3">{rec.title}</td>
                    <td className="p-3">
                      {rec.severity ? (
                        <Badge variant={SEVERITY_VARIANT[rec.severity] ?? 'secondary'}>
                          {rec.severity}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground">{rec.source_agent ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{fmtDate(rec.created_at)}</td>
                    <td className="p-3 text-right">
                      <form action={dismissRecommendationAction}>
                        <input type="hidden" name="id" value={rec.id} />
                        <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
                        <button type="submit" className="text-xs text-muted-foreground hover:underline">
                          Dismiss
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Navigation Links */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <Link href={`${base}/settings/health`} className="text-primary hover:underline">
          → Workflow Health
        </Link>
        <Link href={`${base}/settings/agent-monitor`} className="text-primary hover:underline">
          → Agent Monitor
        </Link>
        <Link href={`${base}/settings/imports`} className="text-primary hover:underline">
          → Data Imports
        </Link>
      </div>
    </div>
  )
}
