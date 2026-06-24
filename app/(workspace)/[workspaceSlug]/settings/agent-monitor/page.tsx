import Link from 'next/link'
import { formatCompanyName } from '@/lib/format'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getAgentMonitorListData, getAgentRosterData, type AgentRosterData } from '@/modules/intelligence/actions/agent-monitor.actions'
import { AgentRosterSection } from './AgentRosterSection'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bot, ShieldAlert, ArrowRight, Brain } from 'lucide-react'
import { ReconcileButton } from './ReconcileButton'
import { RunAnalysisButton } from './RunAnalysisButton'
import * as learningSnapshotRepo from '@/modules/messaging/repositories/learning-snapshot.repo'
import type { LearningSnapshotRow } from '@/modules/messaging/learning-agent/learning-agent.types'
import * as operationalHealthRepo from '@/modules/messaging/repositories/operational-health.repo'
import type { SebStuckDraftCounts, LatestLaRunStatus } from '@/modules/messaging/repositories/operational-health.repo'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

// ---- Helpers ----

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtConfidence(c: number | null): string {
  if (c === null) return '—'
  return `${(c * 100).toFixed(0)}%`
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  completed: 'default',
  failed:    'destructive',
  killed:    'destructive',
  running:   'secondary',
  cancelled: 'outline',
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500',
  failed:    'bg-red-500',
  killed:    'bg-red-700',
  running:   'bg-blue-500 animate-pulse',
  cancelled: 'bg-gray-400',
}

const CONTROL_KEYS_TO_SHOW = [
  'global_agent_pause',
  'agent.enabled',
  'recommendation_engine_enabled',
  'auto_task_creation_enabled',
  'email_sending_enabled',
  'campaign_sending_enabled',
]

const CONTROL_LABELS: Record<string, string> = {
  'global_agent_pause':              'Global Agent Pause',
  'agent.enabled':                   'Agent Layer',
  'recommendation_engine_enabled':   'Recommendation Engine',
  'auto_task_creation_enabled':      'Auto Task Creation',
  'email_sending_enabled':           'Email Sending',
  'campaign_sending_enabled':        'Campaign Sending',
}

// ---- Page ----

export default async function AgentMonitorPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const { summary, runs, controls } = await getAgentMonitorListData(ctx.tenantId)

  // Load latest learning snapshots (non-fatal)
  let learningSnapshots: LearningSnapshotRow[] = []
  try {
    learningSnapshots = await learningSnapshotRepo.getLatestSnapshotsForTenant(ctx.tenantId)
  } catch {
    // Silent — snapshots are advisory; failure must not break the agent monitor page
  }

  // Phase 3B.1: Load operational health metrics (all non-fatal)
  let sebStuckCounts: SebStuckDraftCounts = { stateA: 0, stateB: 0 }
  let failedSendCount = 0
  let latestLaRun: LatestLaRunStatus | null = null

  try {
    sebStuckCounts = await operationalHealthRepo.getSebStuckDraftCounts(ctx.tenantId)
  } catch { /* silent */ }

  try {
    const metrics = await operationalHealthRepo.getFailedSendCount(ctx.tenantId)
    failedSendCount = metrics.count
  } catch { /* silent */ }

  try {
    latestLaRun = await operationalHealthRepo.getLatestLaRunStatus(ctx.tenantId)
  } catch { /* silent */ }

  const isAdmin = ['system', 'platform_admin', 'tenant_admin'].includes(ctx.roleSlug)

  // All-agents roster (read-only, non-fatal — advisory like the other panels)
  let roster: AgentRosterData | null = null
  try {
    roster = await getAgentRosterData(ctx.tenantId)
  } catch { /* silent — roster must not break the monitor */ }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Agent Lab</h1>
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Inspect Verian agent runs, decisions, guardrails, and execution traces.
        </p>
        {isAdmin && (
          <div className="mt-3">
            <ReconcileButton />
          </div>
        )}
      </div>

      {/* Summary stats (last 24h) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Runs Today"  value={summary.runsTodayCount}      color="text-foreground" />
        <StatCard label="Completed"   value={summary.completedTodayCount} color="text-green-600" />
        <StatCard label="Failed"      value={summary.failedTodayCount}     color={summary.failedTodayCount > 0 ? 'text-destructive' : 'text-foreground'} />
        <StatCard label="Open Guardrails" value={summary.openGuardrailCount} color={summary.openGuardrailCount > 0 ? 'text-amber-600' : 'text-foreground'} icon={summary.openGuardrailCount > 0 ? <ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> : undefined} />
      </div>

      {/* All-agents roster + expected-vs-actual anomaly */}
      <div className="flex justify-end">
        <Link
          href={`/${workspaceSlug}/settings/agent-monitor/map`}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          View agent map →
        </Link>
      </div>
      {roster && <AgentRosterSection data={roster} workspaceSlug={workspaceSlug} />}

      {/* System Controls (read-only) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">System Controls</CardTitle>
            <Link
              href={`/${workspaceSlug}/settings/system-controls`}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Manage controls →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {controls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No platform controls found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CONTROL_KEYS_TO_SHOW.map(key => {
                const row = controls.find(c => c.key === key)
                if (!row) return null
                const isOn = row.value === true
                return (
                  <div key={key} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-xs text-muted-foreground truncate mr-2">
                      {CONTROL_LABELS[key] ?? key}
                    </span>
                    <Badge variant={isOn ? 'default' : 'secondary'} className="text-xs shrink-0">
                      {isOn ? 'On' : 'Off'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent runs table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recent Agent Runs</CardTitle>
            <span className="text-xs text-muted-foreground">{runs.length} shown</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No agent runs recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Agent</th>
                    <th className="px-4 py-2.5 text-left font-medium">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium">Subject</th>
                    <th className="px-4 py-2.5 text-left font-medium">Trigger</th>
                    <th className="px-4 py-2.5 text-left font-medium">Confidence</th>
                    <th className="px-4 py-2.5 text-left font-medium">Started</th>
                    <th className="px-4 py-2.5 text-left font-medium">Duration</th>
                    <th className="px-4 py-2.5 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {runs.map(run => {
                    const durationMs = run.completed_at && run.started_at
                      ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
                      : null
                    const subjectLabel = run.companyName
                      ? formatCompanyName(run.companyName)
                      : run.subject_id
                        ? `${run.subject_type} · ${run.subject_id.slice(0, 8)}…`
                        : run.subject_type ?? '—'

                    return (
                      <tr key={run.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[run.status] ?? 'bg-gray-400'}`} />
                            <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'}>
                              {run.status}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-2 font-mono">{run.agent_name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{run.run_type ?? '—'}</td>
                        <td className="px-4 py-2 max-w-[160px] truncate" title={run.subject_id ?? ''}>
                          {subjectLabel}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{run.trigger_source ?? '—'}</td>
                        <td className="px-4 py-2 tabular-nums">{fmtConfidence(run.confidence)}</td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                          {fmtDate(run.started_at)}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                          {fmtDuration(durationMs)}
                        </td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/${workspaceSlug}/settings/agent-monitor/${run.id}`}
                            className="flex items-center gap-0.5 text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Trace <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 3B.1 Operational Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Operational Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stuck Phase 3B Drafts */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Stuck Phase 3B Drafts</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">No approval link (State A)</span>
                {sebStuckCounts.stateA === 0 ? (
                  <span className="text-xs text-muted-foreground">None</span>
                ) : (
                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                    {sebStuckCounts.stateA} stuck
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Pending approval (State B)</span>
                {sebStuckCounts.stateB === 0 ? (
                  <span className="text-xs text-muted-foreground">None</span>
                ) : (
                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                    {sebStuckCounts.stateB} stuck
                  </Badge>
                )}
              </div>
            </div>
            {(sebStuckCounts.stateA > 0 || sebStuckCounts.stateB > 0) && (
              <p className="text-xs text-amber-700 mt-1.5">
                Stuck drafts cannot be sent until resolved. Contact your administrator.
              </p>
            )}
          </div>

          {/* Failed sends */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Failed sends (last 24h)</span>
            {failedSendCount === 0 ? (
              <span className="text-xs text-muted-foreground">None</span>
            ) : (
              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                {failedSendCount} failed
              </Badge>
            )}
          </div>

          {/* Learning Agent last run */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Learning Agent Last Run</p>
            {latestLaRun === null ? (
              <p className="text-xs text-muted-foreground">No analysis has run yet.</p>
            ) : (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(latestLaRun.computedAt).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <Badge
                    variant={latestLaRun.ok ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {latestLaRun.ok ? 'Completed' : 'Failed'}
                  </Badge>
                </div>
                {latestLaRun.ok && latestLaRun.snapshotCount !== null && (
                  <p className="text-xs text-muted-foreground">
                    {latestLaRun.snapshotCount} signals · {latestLaRun.totalSends ?? 0} sends analysed
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            All indicators above are informational only. No automatic action is taken.
          </p>
        </CardContent>
      </Card>

      {/* Learning Signals (Phase 3B Revenue Learning Engine) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Learning Signals — Phase 3B Revenue Learning Engine</CardTitle>
            </div>
            <RunAnalysisButton workspaceSlug={workspaceSlug} />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            All signals are advisory only. No automatic actions are taken based on these findings.
          </p>
          {learningSnapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No learning analysis has been run yet. Click &quot;Run Learning Analysis&quot; to compute outcome signals from your Phase 3B send history.
            </p>
          ) : (
            <>
              {(() => {
                const first = learningSnapshots[0]
                const computedAt = first ? new Date(first.computed_at).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                }) : '—'
                const tenantWideSend = learningSnapshots.find(s => s.signal_name === 'send_success_rate' && s.dimension === 'tenant_wide')
                const totalSends = tenantWideSend?.denominator ?? 0
                return (
                  <p className="text-xs text-muted-foreground mb-3">
                    Last computed: {computedAt} · {totalSends} Phase 3B sends analysed · {first?.lookback_days ?? 90}-day window
                  </p>
                )
              })()}

              {/* Advisory alerts */}
              {learningSnapshots
                .filter(s => {
                  if (s.confidence === 'insufficient' || s.confidence === 'low') return false
                  if (s.rate === null) return false
                  if (s.signal_name === 'complaint_rate' && s.rate >= 0.005 && s.denominator >= 20) return true
                  if (s.signal_name === 'bounce_rate' && s.rate >= 0.10 && s.denominator >= 20) return true
                  return false
                })
                .map(s => (
                  <div key={`${s.run_id}-${s.signal_name}-${s.dimension}-${s.dimension_value}`}
                    className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  >
                    ⚠ Advisory: {s.signal_name.replace(/_/g, ' ')} for {s.dimension.replace(/_/g, ' ')} ={' '}
                    {s.dimension_value} is {((s.rate ?? 0) * 100).toFixed(1)}% — review send practices.
                    This is informational only. No automatic action has been taken.
                  </div>
                ))
              }

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Signal</th>
                      <th className="px-3 py-2 text-left font-medium">Dimension</th>
                      <th className="px-3 py-2 text-left font-medium">Value</th>
                      <th className="px-3 py-2 text-right font-medium">Rate</th>
                      <th className="px-3 py-2 text-right font-medium">N</th>
                      <th className="px-3 py-2 text-left font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {learningSnapshots.map(s => (
                      <tr key={`${s.run_id}-${s.signal_name}-${s.dimension}-${s.dimension_value}`} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono">{s.signal_name.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.dimension.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2">{s.dimension_value}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.confidence === 'insufficient' || s.rate === null
                            ? <span className="text-muted-foreground">—</span>
                            : `${(s.rate * 100).toFixed(1)}%`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.sample_n}</td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={
                              s.confidence === 'high'     ? 'default'  :
                              s.confidence === 'moderate' ? 'secondary' :
                              'outline'
                            }
                            className="text-xs"
                          >
                            {s.confidence}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Sub-components ----

function StatCard({
  label, value, color, icon,
}: {
  label: string
  value: number
  color: string
  icon?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}
