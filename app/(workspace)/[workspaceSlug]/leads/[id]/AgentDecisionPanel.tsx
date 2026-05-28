import type { Database } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type AgentDecisionRow = Database['public']['Tables']['agent_decisions']['Row']

interface AgentDecisionPanelProps {
  decisions:    AgentDecisionRow[]
  totalCostUsd: number
  callCount:    number
}

function formatAgentName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDecisionType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function relativeTime(isoString: string): string {
  const diff  = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function DecisionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    completed:  { label: 'Completed',  className: 'bg-green-100 text-green-800'   },
    blocked:    { label: 'Blocked',    className: 'bg-red-100 text-red-800'       },
    failed:     { label: 'Failed',     className: 'bg-orange-100 text-orange-800' },
    overridden: { label: 'Overridden', className: 'bg-yellow-100 text-yellow-800' },
  }
  const { label, className } = config[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full flex-none ${className}`}>
      {label}
    </span>
  )
}

export function AgentDecisionPanel({ decisions, totalCostUsd, callCount }: AgentDecisionPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Agent Decisions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {totalCostUsd > 0 && (
          <p className="text-xs text-muted-foreground border-b pb-2">
            AI Cost for this lead: ${totalCostUsd.toFixed(6)} total ({callCount} LLM call{callCount !== 1 ? 's' : ''})
          </p>
        )}

        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent decisions recorded for this lead.</p>
        ) : (
          <ol className="space-y-3">
            {decisions.map((d) => (
              <li key={d.id} className="text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{formatAgentName(d.agent_name)}</span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-muted-foreground text-xs">{formatDecisionType(d.decision_type)}</span>
                  <DecisionStatusBadge status={d.decision_status} />
                  {d.approval_required && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 flex-none">
                      Approval Required
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                    {relativeTime(d.created_at)}
                  </span>
                </div>

                {d.decision_status === 'blocked' && (
                  <p className="text-xs text-red-700 border border-red-200 bg-red-50 rounded px-2 py-1">
                    AI budget exhausted — this agent call was blocked by budget policy.
                  </p>
                )}

                {d.short_reason && (
                  <p className="text-xs text-muted-foreground">{d.short_reason}</p>
                )}

                {d.confidence != null && (
                  <p className="text-xs text-muted-foreground">
                    Confidence: {Math.round(Number(d.confidence) * 100)}%
                  </p>
                )}

                {d.recommended_action && (
                  <p className="text-xs text-muted-foreground">Action: {d.recommended_action}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
