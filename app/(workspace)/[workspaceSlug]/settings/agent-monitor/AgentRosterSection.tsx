import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import type { AgentRosterData } from '@/modules/intelligence/actions/agent-monitor.actions'
import {
  IMPL_VARIANT, IMPL_LABEL, CATEGORY_LABEL, CATEGORY_ORDER,
  fmtDate, fmtTokens, fmtCost,
} from './agent-roster-format'

export function AgentRosterSection({ data, workspaceSlug }: { data: AgentRosterData; workspaceSlug: string }) {
  const { rows, anomalyRows, leadsIngested, windowDays } = data

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All Agents ({rows.length}) — last {windowDays} days</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {anomalyRows.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>{leadsIngested} lead{leadsIngested === 1 ? '' : 's'}</strong> ingested this window, but{' '}
              {anomalyRows.map(r => r.label).join(', ')} logged <strong>zero runs</strong>. Expected activity is missing —
              check the trigger wiring or whether the upstream agent produced work.
            </span>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground [&>th]:cursor-help">
              <th className="text-left p-2 font-medium" title="The agent and its implementation state. live = runs + logs telemetry; gated = built but dry-run; skeletal/defined = registered, not yet logging; stub = placeholder.">Agent</th>
              <th className="text-left p-2 font-medium" title="live = executing + logging; gated = dry-run only; skeletal = logic exists, no telemetry; defined = registry entry only; stub = execution-gate placeholder.">State</th>
              <th className="text-right p-2 font-medium" title="Number of times this agent executed in the window (one agent_run per invocation). 'no telemetry' = the agent has never logged a run.">Runs</th>
              <th className="text-right p-2 font-medium" title="Runs that ended in status failed or killed. Click into a run on the list below to see the error and inputs.">Failed</th>
              <th className="text-right p-2 font-medium" title="Decisions logged: a recorded agent choice — what it decided, the input it saw, an output summary, a short reason, and a confidence. Distinct from runs (a run can record several decisions).">Decisions</th>
              <th className="text-right p-2 font-medium" title="Total prompt+completion tokens the agent consumed in the window (real counts from the LLM; deterministic agents record 0).">Tokens</th>
              <th className="text-right p-2 font-medium" title="Estimated USD cost of those tokens at the model's price (auto-computed). Deterministic agents cost $0.">Cost</th>
              <th className="text-right p-2 font-medium" title="Timestamp of this agent's most recent run.">Last run</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.flatMap(cat => {
              const catRows = rows.filter(r => r.category === cat)
              if (catRows.length === 0) return []
              return [
                <tr key={`h-${cat}`} className="bg-muted/40">
                  <td colSpan={8} className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABEL[cat]}
                  </td>
                </tr>,
                ...catRows.map(r => (
                  <tr key={r.key} className={`border-b last:border-0 ${r.anomaly ? 'bg-amber-50' : ''}`}>
                    <td className="p-2">
                      <Link
                        href={`/${workspaceSlug}/settings/agent-monitor/agent/${r.key}`}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {r.label}
                      </Link>
                      {r.anomaly && <AlertTriangle className="inline h-3.5 w-3.5 ml-1.5 text-amber-600" />}
                    </td>
                    <td className="p-2">
                      <Badge variant={IMPL_VARIANT[r.implState]} className="text-xs">{IMPL_LABEL[r.implState]}</Badge>
                    </td>
                    <td className="p-2 text-right">{r.hasTelemetry ? r.agg.runs : '—'}</td>
                    <td className={`p-2 text-right ${r.agg.failed > 0 ? 'text-destructive' : ''}`}>{r.hasTelemetry ? r.agg.failed : '—'}</td>
                    <td className="p-2 text-right">{r.hasTelemetry ? r.agg.decisions : '—'}</td>
                    <td className="p-2 text-right">{r.hasTelemetry ? fmtTokens(r.agg.totalTokens) : '—'}</td>
                    <td className="p-2 text-right">{r.hasTelemetry ? fmtCost(r.agg.costUsd) : '—'}</td>
                    <td className="p-2 text-right text-muted-foreground">{r.hasTelemetry ? fmtDate(r.agg.lastRunAt) : 'no telemetry'}</td>
                  </tr>
                )),
              ]
            })}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          "no telemetry" = the agent is defined/gated but does not yet log runs. Aggregated in-app at pilot volume.
        </p>
      </CardContent>
    </Card>
  )
}
