import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import type { AgentRosterData } from '@/modules/intelligence/actions/agent-monitor.actions'
import type { AgentImplState, AgentRosterCategory } from '@/modules/intelligence/agent-roster'

const IMPL_VARIANT: Record<AgentImplState, 'default' | 'secondary' | 'outline'> = {
  live: 'default', gated: 'secondary', skeletal: 'outline', definition_only: 'outline', stub: 'outline',
}
const IMPL_LABEL: Record<AgentImplState, string> = {
  live: 'live', gated: 'gated', skeletal: 'skeletal', definition_only: 'defined', stub: 'stub',
}
const CATEGORY_LABEL: Record<AgentRosterCategory, string> = {
  messaging: 'Messaging', business_intelligence: 'Business intel',
  policy_safety: 'Policy / safety', development: 'Development', execution: 'Execution',
}
const CATEGORY_ORDER: AgentRosterCategory[] = [
  'messaging', 'business_intelligence', 'policy_safety', 'development', 'execution',
]

function fmtDate(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtTokens(n: number): string {
  if (n <= 0) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
function fmtCost(n: number): string { return n > 0 ? `$${n.toFixed(2)}` : '—' }

export function AgentRosterSection({ data }: { data: AgentRosterData }) {
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
            <tr className="border-b text-muted-foreground">
              <th className="text-left p-2 font-medium">Agent</th>
              <th className="text-left p-2 font-medium">State</th>
              <th className="text-right p-2 font-medium">Runs</th>
              <th className="text-right p-2 font-medium">Failed</th>
              <th className="text-right p-2 font-medium">Decisions</th>
              <th className="text-right p-2 font-medium">Tokens</th>
              <th className="text-right p-2 font-medium">Cost</th>
              <th className="text-right p-2 font-medium">Last run</th>
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
                      <span className="font-medium">{r.label}</span>
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
