import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getAgentRunTraceData } from '@/modules/intelligence/actions/agent-monitor.actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ShieldCheck, ShieldAlert } from 'lucide-react'
import type { AgentRunStepRow, GuardrailEventRow, ActivityEventRow } from '@/modules/intelligence/types.agent'

interface PageProps {
  params: Promise<{ workspaceSlug: string; runId: string }>
}

// ---- Helpers ----

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtConfidence(c: number | null | undefined): string {
  if (c == null) return '—'
  return `${(c * 100).toFixed(0)}%`
}

function wallClock(start: string, end: string | null): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return fmtDuration(ms)
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  completed: 'default',
  failed:    'destructive',
  killed:    'destructive',
  running:   'secondary',
  cancelled: 'outline',
  pending:   'outline',
  skipped:   'outline',
}

const SEVERITY_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high:     'destructive',
  medium:   'secondary',
  low:      'outline',
}

const PRIORITY_CLASSES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high:     'bg-orange-100 text-orange-800',
  medium:   'bg-blue-100 text-blue-800',
  low:      'bg-gray-100 text-gray-700',
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-muted-foreground italic">No data recorded.</p>
  }
  const text = JSON.stringify(value, null, 2)
  if (text === '{}' || text === '[]') {
    return <p className="text-xs text-muted-foreground italic">Empty.</p>
  }
  return (
    <pre className="text-xs font-mono bg-muted rounded-md p-3 overflow-auto max-h-48 leading-relaxed">
      {text}
    </pre>
  )
}

// ---- Page ----

export default async function AgentRunDetailPage({ params }: PageProps) {
  const { workspaceSlug, runId } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const trace = await getAgentRunTraceData(runId, ctx.tenantId)
  if (!trace) notFound()

  const { run, steps, guardrailEvents, activityEvents, relatedRecommendation, relatedCompanyScore, companyName } = trace

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back link */}
      <Link
        href={`/${workspaceSlug}/settings/agent-monitor`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Agent Monitor
      </Link>

      {/* Run header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold font-mono truncate">{run.agent_name}</h1>
                <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'}>{run.status}</Badge>
                {run.run_type && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">{run.run_type}</span>
                )}
              </div>
              {companyName && (
                <p className="text-sm font-medium text-muted-foreground">{companyName}</p>
              )}
            </div>
            <span className="text-xs font-mono text-muted-foreground shrink-0">
              {run.id.slice(0, 8)}…
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <MetaRow label="Subject" value={run.subject_type
              ? `${run.subject_type} · ${(run.subject_id ?? '').slice(0, 8)}…`
              : '—'} />
            <MetaRow label="Trigger" value={run.trigger_source ?? '—'} />
            <MetaRow label="Trigger Event" value={run.trigger_event ?? '—'} />
            <MetaRow label="Started" value={fmtDate(run.started_at)} />
            <MetaRow label="Completed" value={fmtDate(run.completed_at)} />
            <MetaRow label="Duration" value={wallClock(run.started_at, run.completed_at)} />
            <MetaRow label="Confidence" value={fmtConfidence(run.confidence)} />
            {run.model_used && <MetaRow label="Model" value={run.model_used} />}
            {run.prompt_tokens != null && (
              <MetaRow label="Tokens" value={`${run.prompt_tokens} in / ${run.completion_tokens ?? 0} out`} />
            )}
          </div>
          {run.error_message && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 font-mono">
              {run.error_message}
            </div>
          )}
          {run.killed_reason && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
              <span className="font-semibold">Killed: </span>{run.killed_reason}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run snapshots */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Input Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock value={run.input_snapshot} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Output Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock value={run.output_snapshot} />
          </CardContent>
        </Card>
      </div>

      {/* Step trace */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Step Trace</CardTitle>
            <span className="text-xs text-muted-foreground">{steps.length} steps</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps recorded.</p>
          ) : (
            steps.map(step => <StepRow key={step.id} step={step} />)
          )}
        </CardContent>
      </Card>

      {/* Guardrails */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {guardrailEvents.length === 0
              ? <ShieldCheck className="h-4 w-4 text-green-500" />
              : <ShieldAlert className="h-4 w-4 text-amber-500" />
            }
            <CardTitle className="text-sm">Guardrails</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {guardrailEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guardrails triggered.</p>
          ) : (
            <div className="space-y-3">
              {guardrailEvents.map(g => <GuardrailRow key={g.id} event={g} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related output */}
      {(relatedRecommendation || relatedCompanyScore) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Related Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {relatedRecommendation && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommendation</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{relatedRecommendation.title}</span>
                  <span className="text-xs text-muted-foreground font-mono">{relatedRecommendation.recommendation_type}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_CLASSES[relatedRecommendation.priority] ?? PRIORITY_CLASSES.low}`}>
                    {relatedRecommendation.priority}
                  </span>
                  <Badge variant={STATUS_VARIANT[relatedRecommendation.status] ?? 'outline'}>
                    {relatedRecommendation.status}
                  </Badge>
                </div>
                {relatedRecommendation.reason && (
                  <p className="text-xs text-muted-foreground">{relatedRecommendation.reason}</p>
                )}
              </div>
            )}
            {relatedCompanyScore && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company Score</p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold tabular-nums">{relatedCompanyScore.score}</span>
                  <span className="text-sm text-muted-foreground">/100 · {relatedCompanyScore.score_type}</span>
                  {relatedCompanyScore.confidence != null && (
                    <span className="text-xs text-muted-foreground">
                      {(relatedCompanyScore.confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activity events */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Activity Events</CardTitle>
            <span className="text-xs text-muted-foreground">{activityEvents.length} events</span>
          </div>
        </CardHeader>
        <CardContent>
          {activityEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity events linked to this run.</p>
          ) : (
            <div className="space-y-1.5">
              {activityEvents.map(e => <ActivityRow key={e.id} event={e} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Sub-components ----

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-sm">{value}</p>
    </div>
  )
}

function StepRow({ step }: { step: AgentRunStepRow }) {
  const hasError    = !!step.error_message
  const hasGuardrail = !!step.guardrail_status && step.guardrail_status !== 'passed'

  return (
    <div className={`rounded-lg border px-4 py-3 space-y-1.5 text-sm ${hasError ? 'border-red-200 bg-red-50' : 'bg-muted/20'}`}>
      {/* Step header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">{step.step_index}</span>
        <span className="font-mono font-medium">{step.step_name}</span>
        <Badge variant={STATUS_VARIANT[step.status] ?? 'outline'} className="text-xs">
          {step.status}
        </Badge>
        {step.duration_ms != null && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {fmtDuration(step.duration_ms)}
          </span>
        )}
      </div>

      {/* Output summary */}
      {step.output_summary && (
        <p className="text-sm pl-7 text-foreground">{step.output_summary}</p>
      )}

      {/* Decision summary */}
      {step.decision_summary && (
        <p className="text-xs pl-7 text-muted-foreground font-mono">{step.decision_summary}</p>
      )}

      {/* Bottom metadata row */}
      <div className="flex items-center gap-4 pl-7 text-xs text-muted-foreground flex-wrap">
        {step.confidence != null && (
          <span>confidence {fmtConfidence(step.confidence)}</span>
        )}
        {step.guardrail_status && (
          <span className={hasGuardrail ? 'text-amber-600 font-medium' : ''}>
            guardrail: {step.guardrail_status}
          </span>
        )}
        {step.error_message && (
          <span className="text-red-600 font-mono">{step.error_message}</span>
        )}
      </div>
    </div>
  )
}

function GuardrailRow({ event }: { event: GuardrailEventRow }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono font-medium text-sm">{event.guardrail_name}</span>
        <Badge variant={SEVERITY_VARIANT[event.severity] ?? 'outline'} className="text-xs">
          {event.severity}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {event.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div><span className="text-muted-foreground">Type: </span>{event.guardrail_type}</div>
        <div><span className="text-muted-foreground">Action: </span>{event.action_taken}</div>
        {event.control_key && (
          <div className="col-span-2"><span className="text-muted-foreground">Control: </span>
            <span className="font-mono">{event.control_key}</span>
          </div>
        )}
      </div>
      {event.reason && (
        <p className="text-xs text-amber-800">{event.reason}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {new Date(event.triggered_at).toLocaleString()}
      </p>
    </div>
  )
}

function ActivityRow({ event }: { event: ActivityEventRow }) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="text-muted-foreground whitespace-nowrap shrink-0">
        {new Date(event.occurred_at).toLocaleTimeString(undefined, {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })}
      </span>
      <span className="font-mono text-muted-foreground shrink-0">{event.event_type}</span>
      <span className="text-foreground">{event.event_summary ?? '—'}</span>
    </div>
  )
}
