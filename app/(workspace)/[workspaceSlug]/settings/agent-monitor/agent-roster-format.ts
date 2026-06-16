// Shared presentational helpers for the Agent Monitor roster + per-agent profile.
// Lifted out of AgentRosterSection so the roster table and the agent profile page
// render identical impl-state badges, category labels, and number/date formats —
// no divergent forks. Pure (no IO, no JSX).

import type { AgentImplState, AgentRosterCategory } from '@/modules/intelligence/agent-roster'

export const IMPL_VARIANT: Record<AgentImplState, 'default' | 'secondary' | 'outline'> = {
  live: 'default', gated: 'secondary', skeletal: 'outline', definition_only: 'outline', stub: 'outline',
}
export const IMPL_LABEL: Record<AgentImplState, string> = {
  live: 'live', gated: 'gated', skeletal: 'skeletal', definition_only: 'defined', stub: 'stub',
}
export const CATEGORY_LABEL: Record<AgentRosterCategory, string> = {
  messaging: 'Messaging', business_intelligence: 'Business intel',
  policy_safety: 'Policy / safety', development: 'Development', execution: 'Execution',
}
export const CATEGORY_ORDER: AgentRosterCategory[] = [
  'messaging', 'business_intelligence', 'policy_safety', 'development', 'execution',
]

export function fmtDate(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export function fmtTokens(n: number): string {
  if (n <= 0) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
export function fmtCost(n: number): string { return n > 0 ? `$${n.toFixed(2)}` : '—' }
