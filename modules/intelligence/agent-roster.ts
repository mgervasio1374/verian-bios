// Pure agent-roster model + aggregation for the Agent Monitor "all agents" view.
//
// The 15 "defined" registry agents (modules/verian-agent-bridge/agent-registry.ts)
// mostly carry no telemetry, while several LIVE runtime agents log under names that
// differ from the registry ids (e.g. lead_scoring_pipeline, company_scoring_v1).
// This module maps every agent to the agent_name(s) it logs under and folds run /
// decision / usage aggregates into one roster row each, so an operator can see which
// agents are actually running — and flag the ones that should have run but didn't.
// No IO — fully unit-testable.

export type AgentImplState = 'live' | 'gated' | 'skeletal' | 'definition_only' | 'stub'

export type AgentRosterCategory =
  | 'messaging' | 'business_intelligence' | 'policy_safety' | 'development' | 'execution'

export interface AgentRosterDef {
  key:            string
  label:          string
  category:       AgentRosterCategory
  implState:      AgentImplState
  telemetryNames: string[]   // agent_name values to aggregate ([] = no telemetry yet)
  processesLeads?: boolean    // participates in the lead → draft pipeline (anomaly check)
}

// The full roster: the 15 registry agents + the 3 live runtime agents that log under
// their own names (message_strategy, company_scoring, learning).
export const AGENT_ROSTER: readonly AgentRosterDef[] = [
  // Messaging
  { key: 'copywriting_agent',      label: 'Copywriting',      category: 'messaging', implState: 'live', telemetryNames: ['copywriting_agent'], processesLeads: true },
  { key: 'message_strategy_agent', label: 'Message Strategy', category: 'messaging', implState: 'live', telemetryNames: ['message_strategy_agent'], processesLeads: true },
  { key: 'quality_review_agent',   label: 'Quality Review',   category: 'messaging', implState: 'live', telemetryNames: ['quality_review_agent'] },
  { key: 'subject_line_agent',     label: 'Subject Line',     category: 'messaging', implState: 'gated', telemetryNames: [] },
  { key: 'personalization_agent',  label: 'Personalization',  category: 'messaging', implState: 'gated', telemetryNames: [] },
  // Business intelligence
  { key: 'lead_scoring_agent',            label: 'Lead Scoring',            category: 'business_intelligence', implState: 'live', telemetryNames: ['lead_scoring_pipeline'], processesLeads: true },
  { key: 'company_scoring_agent',         label: 'Company Scoring',         category: 'business_intelligence', implState: 'live', telemetryNames: ['company_scoring_v1'] },
  { key: 'campaign_recommendation_agent', label: 'Campaign Recommendation', category: 'business_intelligence', implState: 'live', telemetryNames: ['recommendation_generation_v1', 'recommendation_generator'] },
  { key: 'learning_agent',                label: 'Learning',                category: 'business_intelligence', implState: 'live', telemetryNames: ['learning_agent'] },
  { key: 'sales_ops_intelligence_agent',  label: 'Sales-Ops Intelligence',  category: 'business_intelligence', implState: 'skeletal', telemetryNames: [] },
  // MCM v2 Phase 0 — deterministic statement-analysis review/grader (gated default-off).
  { key: 'statement_review_agent',         label: 'Statement Review',         category: 'business_intelligence', implState: 'gated', telemetryNames: ['statement_review_agent'], processesLeads: false },
  // MCM v2 Phase 1a — text-first statement figure extraction (LLM; gated default-off).
  { key: 'statement_extraction_agent',     label: 'Statement Extraction',     category: 'business_intelligence', implState: 'gated', telemetryNames: ['statement_extraction_agent'], processesLeads: false },
  // Policy / safety
  { key: 'prompt_policy_agent',    label: 'Prompt Policy',   category: 'policy_safety', implState: 'gated',    telemetryNames: [] },
  { key: 'risk_classifier_agent',  label: 'Risk Classifier', category: 'policy_safety', implState: 'skeletal', telemetryNames: [] },
  { key: 'approval_gate_agent',    label: 'Approval Gate',   category: 'policy_safety', implState: 'skeletal', telemetryNames: [] },
  // Development
  { key: 'claude_implementation_agent', label: 'Implementation',      category: 'development', implState: 'definition_only', telemetryNames: [] },
  { key: 'codex_review_agent',          label: 'Code Review',         category: 'development', implState: 'definition_only', telemetryNames: [] },
  { key: 'architecture_review_agent',   label: 'Architecture Review', category: 'development', implState: 'definition_only', telemetryNames: [] },
  { key: 'documentation_agent',         label: 'Documentation',       category: 'development', implState: 'definition_only', telemetryNames: [] },
  // Execution
  { key: 'execution_gate_agent',   label: 'Execution Gate',  category: 'execution', implState: 'stub', telemetryNames: [] },
]

export interface RunAggregate { runs: number; completed: number; failed: number; lastRunAt: string | null }

export interface AgentAggregate {
  runs:        number
  completed:   number
  failed:      number
  lastRunAt:   string | null
  decisions:   number
  totalTokens: number
  costUsd:     number
}

export interface AgentRosterRow extends AgentRosterDef {
  agg:          AgentAggregate
  hasTelemetry: boolean
  // expected to have processed the leads ingested this window, but logged zero runs
  anomaly:      boolean
}

function emptyAgg(): AgentAggregate {
  return { runs: 0, completed: 0, failed: 0, lastRunAt: null, decisions: 0, totalTokens: 0, costUsd: 0 }
}

function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

/**
 * Fold per-agent_name aggregates into one row per roster entry.
 * Inputs are name-keyed maps produced by the read-only action.
 */
export function buildRoster(
  defs:           readonly AgentRosterDef[],
  runsByName:     Map<string, RunAggregate>,
  decisionsByName: Map<string, number>,
  usageByName:    Map<string, { tokens: number; cost: number }>,
  leadsIngested:  number,
): AgentRosterRow[] {
  return defs.map(def => {
    const agg = emptyAgg()
    for (const name of def.telemetryNames) {
      const r = runsByName.get(name)
      if (r) {
        agg.runs      += r.runs
        agg.completed += r.completed
        agg.failed    += r.failed
        agg.lastRunAt  = laterIso(agg.lastRunAt, r.lastRunAt)
      }
      agg.decisions   += decisionsByName.get(name) ?? 0
      const u = usageByName.get(name)
      if (u) { agg.totalTokens += u.tokens; agg.costUsd += u.cost }
    }
    const hasTelemetry = def.telemetryNames.length > 0
    const anomaly = !!def.processesLeads && leadsIngested > 0 && agg.runs === 0
    return { ...def, agg, hasTelemetry, anomaly }
  })
}

/** Agents that should have run on this window's ingested leads but logged nothing. */
export function anomalies(rows: AgentRosterRow[]): AgentRosterRow[] {
  return rows.filter(r => r.anomaly)
}
