import Link from 'next/link'
import { formatCompanyName } from '@/lib/format'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { countCompanies } from '@/modules/crm/services/company.service'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import { getDashboardIntelligenceData } from '@/modules/intelligence/actions/dashboard-intelligence.actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Building2, Zap, CheckCircle2, TrendingUp,
  Bot, ShieldAlert, FileText, Activity,
  AlertTriangle, ArrowRight, ExternalLink,
} from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

// ---- Helpers ----

// Safely extracts a string from any JSONB field.
function getJsonString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === 'string' ? val : null
}

// Alias kept for backward compat with extractPayloadString call sites.
const extractPayloadString = getJsonString

// ---- Action target helpers ----

interface ActionTarget { href: string; label: string; isReview?: boolean }

// Resolves the best available action link for a recommendation row.
// Priority: subject entity → evidence/raw/metadata entities → agent_run trace → workflow monitor
function resolveRecommendationTarget(
  rec: {
    subject_type:   string | null
    subject_id:     string | null
    evidence:       unknown
    raw_output:     unknown
    metadata:       unknown
    agent_run_id:   string | null
    workflow_run_id: string | null
  },
  workspaceSlug: string
): ActionTarget | null {
  if (rec.subject_type === 'company' && rec.subject_id)
    return { href: `/${workspaceSlug}/companies/${rec.subject_id}`, label: 'View Company' }
  if (rec.subject_type === 'lead' && rec.subject_id)
    return { href: `/${workspaceSlug}/leads/${rec.subject_id}`, label: 'View Lead' }

  const evCo = getJsonString(rec.evidence, 'company_id')
  if (evCo) return { href: `/${workspaceSlug}/companies/${evCo}`, label: 'View Company' }
  const rawCo = getJsonString(rec.raw_output, 'company_id')
  if (rawCo) return { href: `/${workspaceSlug}/companies/${rawCo}`, label: 'View Company' }
  const metaCo = getJsonString(rec.metadata, 'company_id')
  if (metaCo) return { href: `/${workspaceSlug}/companies/${metaCo}`, label: 'View Company' }

  const evLead = getJsonString(rec.evidence, 'lead_id')
  if (evLead) return { href: `/${workspaceSlug}/leads/${evLead}`, label: 'View Lead' }
  const rawLead = getJsonString(rec.raw_output, 'lead_id')
  if (rawLead) return { href: `/${workspaceSlug}/leads/${rawLead}`, label: 'View Lead' }
  const metaLead = getJsonString(rec.metadata, 'lead_id')
  if (metaLead) return { href: `/${workspaceSlug}/leads/${metaLead}`, label: 'View Lead' }

  // agent_run_id → specific trace page
  if (rec.agent_run_id)
    return { href: `/${workspaceSlug}/settings/agent-monitor/${rec.agent_run_id}`, label: 'View Trace' }

  // workflow_run_id → agent monitor list (different table, no detail page for workflow runs)
  if (rec.workflow_run_id)
    return { href: `/${workspaceSlug}/settings/agent-monitor`, label: 'View Monitor' }

  return null
}

// Extracts a review token from multiple possible locations in an approval row.
function extractReviewToken(payload: unknown, decision?: unknown): string | null {
  return (
    getJsonString(payload, 'review_token') ??
    getJsonString(payload, 'reviewToken') ??
    getJsonString(payload, 'token') ??
    getJsonString(decision, 'review_token') ??
    getJsonString(decision, 'reviewToken') ??
    null
  )
}

// Resolves the best action link for an approval row: review token first, entity fallback.
function resolveApprovalTarget(
  approval: { subject_type: string | null; subject_id: string | null; payload: unknown; decision: unknown },
  workspaceSlug: string
): ActionTarget | null {
  const token = extractReviewToken(approval.payload, approval.decision)
  if (token) return { href: `/approve/${token}`, label: 'Review', isReview: true }

  // Entity fallbacks
  if (approval.subject_type === 'company' && approval.subject_id)
    return { href: `/${workspaceSlug}/companies/${approval.subject_id}`, label: 'View Company' }
  if (approval.subject_type === 'lead' && approval.subject_id)
    return { href: `/${workspaceSlug}/leads/${approval.subject_id}`, label: 'View Lead' }

  const payloadCo = getJsonString(approval.payload, 'company_id')
  if (payloadCo) return { href: `/${workspaceSlug}/companies/${payloadCo}`, label: 'View Company' }
  const payloadLead = getJsonString(approval.payload, 'lead_id')
  if (payloadLead) return { href: `/${workspaceSlug}/leads/${payloadLead}`, label: 'View Lead' }

  return null
}

const PRIORITY_CLASSES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high:     'bg-orange-100 text-orange-800',
  medium:   'bg-blue-100 text-blue-800',
  low:      'bg-gray-100 text-gray-600',
}

const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  statement:   'Merchant Statement',
  proposal_pdf: 'Proposal PDF',
  other:       'Document',
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  completed: 'default',
  failed:    'destructive',
  killed:    'destructive',
  running:   'secondary',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  })
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtConfidence(c: number | null | undefined): string {
  if (c == null) return '—'
  return `${(c * 100).toFixed(0)}%`
}

// ---- Page ----

export default async function DashboardPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [companyCount, openLeads, pendingApprovals, intel] = await Promise.all([
    countCompanies(ctx).catch(() => 0),
    leadRepo.listLeads({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, status: 'open', limit: 500 }).catch(() => []),
    approvalRepo.listPendingApprovals(ctx.tenantId, ctx.workspaceId).catch(() => []),
    getDashboardIntelligenceData(ctx.tenantId, ctx.workspaceId).catch(() => null),
  ])

  const highPriorityLeads = openLeads.filter(l => l.priority === 'high' || l.priority === 'critical')
  const s = intel?.summary

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Verian operational intelligence and recommended actions.
        </p>
      </div>

      {/* Global pause banner */}
      {intel?.isGlobalPaused && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-800">Global Agent Pause is Active</p>
            <p className="text-sm text-red-700 mt-0.5">
              All agent activity is suspended. Scoring and recommendations are blocked.
            </p>
          </div>
          <Link
            href={`/${workspaceSlug}/settings/system-controls`}
            className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap"
          >
            Manage Controls →
          </Link>
        </div>
      )}

      {/* ---- Intelligence Summary Stats ---- */}
      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <IntelCard
            label="Open Recommendations"
            value={s.openRecommendations}
            highlight={s.highPriorityRecommendations > 0}
            color={s.highPriorityRecommendations > 0 ? 'text-orange-600' : undefined}
          />
          <IntelCard
            label="High Priority"
            value={s.highPriorityRecommendations}
            highlight={s.highPriorityRecommendations > 0}
            color={s.highPriorityRecommendations > 0 ? 'text-red-600' : undefined}
          />
          <IntelCard
            label="Agent Runs Today"
            value={s.agentRunsToday}
          />
          <IntelCard
            label="Failed Today"
            value={s.failedRunsToday}
            highlight={s.failedRunsToday > 0}
            color={s.failedRunsToday > 0 ? 'text-destructive' : undefined}
          />
          <IntelCard
            label="Open Guardrails"
            value={s.openGuardrails}
            highlight={s.openGuardrails > 0}
            color={s.openGuardrails > 0 ? 'text-amber-600' : undefined}
          />
          <IntelCard label="Docs This Week"       value={s.documentsThisWeek} />
          <IntelCard label="Companies Scored"      value={s.companiesScoredThisWeek} />
        </div>
      )}

      {/* ---- Recommended Actions ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Recommended Actions
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {intel?.recommendations.length ?? 0} active
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {!intel?.recommendations.length ? (
            <p className="text-sm text-muted-foreground">No active recommendations.</p>
          ) : (
            <div className="divide-y">
              {intel.recommendations.map(rec => {
                const actionTarget = resolveRecommendationTarget(rec, workspaceSlug)
                const entityLabel  = formatCompanyName(rec.companyName) ?? rec.leadName ?? null
                return (
                  <div key={rec.id} className="py-3 flex items-start justify-between gap-3 first:pt-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{rec.title}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_CLASSES[rec.priority] ?? PRIORITY_CLASSES.low}`}>
                          {rec.priority}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">{rec.recommendation_type}</span>
                        {entityLabel && actionTarget && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <Link href={actionTarget.href} className="text-xs text-blue-600 hover:underline">
                              {entityLabel}
                            </Link>
                          </>
                        )}
                        {entityLabel && !actionTarget && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{entityLabel}</span>
                          </>
                        )}
                        {rec.confidence != null && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{fmtConfidence(rec.confidence)} confidence</span>
                          </>
                        )}
                      </div>
                      {rec.reason && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic truncate">{rec.reason}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge variant={rec.status === 'pending' ? 'secondary' : 'outline'} className="text-xs">
                        {rec.status}
                      </Badge>
                      {actionTarget ? (
                        <Link
                          href={actionTarget.href}
                          className="flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                        >
                          {actionTarget.label} <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">No linked record</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Agent Health + Guardrail Watch ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Agent Health */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                Agent Health
              </CardTitle>
              <Link
                href={`/${workspaceSlug}/settings/agent-monitor`}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Monitor →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {s && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold tabular-nums">{s.agentRunsToday}</p>
                  <p className="text-xs text-muted-foreground">Today</p>
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums text-green-600">
                    {s.agentRunsToday - s.failedRunsToday}
                  </p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div>
                  <p className={`text-xl font-bold tabular-nums ${s.failedRunsToday > 0 ? 'text-destructive' : ''}`}>
                    {s.failedRunsToday}
                  </p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            )}
            {intel?.recentAgentRuns.length ? (
              <div className="space-y-1.5 border-t pt-3">
                {intel.recentAgentRuns.slice(0, 3).map(run => (
                  <div key={run.id} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'} className="text-[10px] shrink-0">
                        {run.status}
                      </Badge>
                      <span className="font-mono truncate text-muted-foreground">{run.agent_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {run.companyName && (
                        <span className="text-muted-foreground truncate max-w-[80px]">{formatCompanyName(run.companyName)}</span>
                      )}
                      <Link
                        href={`/${workspaceSlug}/settings/agent-monitor/${run.id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground border-t pt-3">No recent agent runs.</p>
            )}
          </CardContent>
        </Card>

        {/* Guardrail Watch */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {(intel?.openGuardrailEvents.length ?? 0) > 0
                  ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                  : <ShieldAlert className="h-4 w-4 text-green-500" />
                }
                Guardrail Watch
              </CardTitle>
              {(intel?.openGuardrailEvents.length ?? 0) > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {intel!.openGuardrailEvents.length} open
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!intel?.openGuardrailEvents.length ? (
              <p className="text-sm text-muted-foreground">No open guardrails.</p>
            ) : (
              <div className="space-y-2">
                {intel.openGuardrailEvents.map(g => (
                  <div key={g.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium truncate">{g.guardrail_name}</span>
                      <span className={`shrink-0 font-medium px-1.5 py-0.5 rounded-full text-[10px] ${
                        g.severity === 'critical' ? 'bg-red-100 text-red-800' :
                        g.severity === 'high'     ? 'bg-orange-100 text-orange-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>{g.severity}</span>
                    </div>
                    {g.reason && <p className="text-muted-foreground mt-0.5 truncate">{g.reason}</p>}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-muted-foreground">{fmtDatetime(g.triggered_at)}</span>
                      {g.agent_run_id && (
                        <Link
                          href={`/${workspaceSlug}/settings/agent-monitor/${g.agent_run_id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Trace →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- System Controls Status ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              System Controls
            </CardTitle>
            <Link
              href={`/${workspaceSlug}/settings/system-controls`}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Manage Controls →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {!intel?.coreControls.length ? (
            <p className="text-sm text-muted-foreground">System controls not loaded.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {intel.coreControls.map(ctrl => {
                const isOn = ctrl.value === true
                const isGlobalPause = ctrl.key === 'global_agent_pause'
                return (
                  <div
                    key={ctrl.key}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                      isGlobalPause && isOn ? 'border-red-300 bg-red-50' : ''
                    }`}
                  >
                    <span className="text-xs text-muted-foreground truncate mr-2">{ctrl.label}</span>
                    <Badge
                      variant={isOn ? 'default' : 'secondary'}
                      className={`text-xs shrink-0 ${isGlobalPause && isOn ? 'bg-red-600 text-white hover:bg-red-600' : ''}`}
                    >
                      {isGlobalPause && isOn ? 'PAUSED' : isOn ? 'On' : 'Off'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Recent Documents + Recent Activity ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Documents */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Recent Documents
              </CardTitle>
              <span className="text-xs text-muted-foreground">{s?.documentsThisWeek ?? 0} this week</span>
            </div>
          </CardHeader>
          <CardContent>
            {!intel?.recentDocuments.length ? (
              <p className="text-sm text-muted-foreground">No recent documents.</p>
            ) : (
              <div className="space-y-2">
                {intel.recentDocuments.map(doc => (
                  <div key={doc.id} className="flex items-start gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" title={doc.name}>{doc.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-muted-foreground">
                          {ARTIFACT_TYPE_LABELS[doc.artifact_type] ?? doc.artifact_type}
                        </span>
                        {doc.companyName && doc.company_id && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <Link
                              href={`/${workspaceSlug}/companies/${doc.company_id}`}
                              className="text-blue-600 hover:underline truncate"
                            >
                              {formatCompanyName(doc.companyName)}
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-muted-foreground shrink-0">{fmtDate(doc.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!intel?.recentActivity.length ? (
              <p className="text-sm text-muted-foreground">No recent activity yet.</p>
            ) : (
              <div className="space-y-1.5">
                {intel.recentActivity.map(evt => (
                  <div key={evt.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0 pt-0.5 tabular-nums">
                      {fmtDate(evt.occurred_at)}
                    </span>
                    <div className="min-w-0">
                      <span className="font-mono text-muted-foreground">{evt.event_type}</span>
                      {evt.event_summary && (
                        <p className="text-foreground truncate">{evt.event_summary}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Existing CRM Metrics ---- */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">CRM Overview</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            title="Companies"
            value={companyCount}
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          />
          <MetricCard
            title="Open Leads"
            value={openLeads.length}
            icon={<Zap className="h-4 w-4 text-muted-foreground" />}
          />
          <MetricCard
            title="High Priority"
            value={highPriorityLeads.length}
            icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            highlight={highPriorityLeads.length > 0}
          />
          <MetricCard
            title="Pending Approvals"
            value={pendingApprovals.length}
            icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
            highlight={pendingApprovals.length > 0}
          />
        </div>
      </div>

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Open Leads</CardTitle>
        </CardHeader>
        <CardContent>
          {openLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open leads yet.</p>
          ) : (
            <div className="divide-y">
              {openLeads.slice(0, 8).map((lead) => (
                <div key={lead.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{lead.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{lead.stage.replace(/_/g, ' ')}</p>
                  </div>
                  <PriorityBadge priority={lead.priority} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pendingApprovals.slice(0, 5).map((a) => {
                const actionTarget = resolveApprovalTarget(a, workspaceSlug)
                const entityLabel  =
                  extractPayloadString(a.payload, 'company_name') ??
                  extractPayloadString(a.payload, 'lead_name') ??
                  null
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{a.request_type.replace(/_/g, ' ')}</p>
                      {entityLabel && (
                        <p className="text-xs text-muted-foreground truncate">{entityLabel}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{fmtDate(a.created_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Pending</span>
                      {actionTarget ? (
                        <Link
                          href={actionTarget.href}
                          className="flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                        >
                          {actionTarget.label} <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">No review link</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---- Sub-components ----

function IntelCard({
  label, value, highlight = false, color,
}: {
  label: string
  value: number
  highlight?: boolean
  color?: string
}) {
  return (
    <Card className={highlight ? 'border-amber-300' : ''}>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        <p className={`text-2xl font-bold tabular-nums mt-0.5 ${color ?? ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function MetricCard({
  title, value, icon, highlight = false,
}: {
  title: string
  value: number
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? 'border-amber-300' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${PRIORITY_CLASSES[priority] ?? PRIORITY_CLASSES.medium}`}>
      {priority}
    </span>
  )
}
