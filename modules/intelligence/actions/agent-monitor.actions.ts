import { createSupabaseServiceClient } from '@/lib/supabase/service'
import * as agentRunRepo from '@/modules/intelligence/repositories/agent-run.repo'
import * as agentRunStepRepo from '@/modules/intelligence/repositories/agent-run-step.repo'
import * as guardrailEventRepo from '@/modules/intelligence/repositories/guardrail-event.repo'
import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'
import * as recommendationRepo from '@/modules/intelligence/repositories/recommendation.repo'
import * as companyScoreRepo from '@/modules/intelligence/repositories/company-score.repo'
import * as companyRepo from '@/modules/crm/repositories/company.repo'
import type {
  AgentRunRow, AgentRunStepRow, GuardrailEventRow, ActivityEventRow,
  CompanyScoreRow, SystemControlRow,
} from '@/modules/intelligence/types.agent'
import type { Database } from '@/types/database'

type RecommendationRow = Database['public']['Tables']['agent_recommendations']['Row']

// ---- List page data ----

export interface AgentMonitorSummary {
  runsTodayCount:      number
  completedTodayCount: number
  failedTodayCount:    number
  openGuardrailCount:  number
}

export interface AgentRunListRow extends AgentRunRow {
  companyName?: string | null
}

export interface AgentMonitorListData {
  summary:  AgentMonitorSummary
  runs:     AgentRunListRow[]
  controls: SystemControlRow[]
}

const CONTROL_KEYS_TO_SHOW = [
  'global_agent_pause',
  'agent.enabled',
  'recommendation_engine_enabled',
  'auto_task_creation_enabled',
  'email_sending_enabled',
  'campaign_sending_enabled',
]

const SINCE_24H = () => new Date(Date.now() - 86_400_000).toISOString()

export async function getAgentMonitorListData(
  tenantId: string
): Promise<AgentMonitorListData> {
  const supabase = createSupabaseServiceClient()
  const since = SINCE_24H()

  const [
    { count: runsTodayCount },
    { count: completedTodayCount },
    { count: failedTodayCount },
    { count: openGuardrailCount },
    runs,
    allControls,
  ] = await Promise.all([
    supabase.from('agent_runs').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('started_at', since),
    supabase.from('agent_runs').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'completed').gte('started_at', since),
    supabase.from('agent_runs').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).in('status', ['failed', 'killed']).gte('started_at', since),
    supabase.from('guardrail_events').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'open'),
    agentRunRepo.listAgentRuns(tenantId, { limit: 50 }),
    systemControlRepo.listControls(null),
  ])

  // Enrich runs with company names via a single batch query
  const companyIds = [
    ...new Set(runs.filter(r => r.subject_type === 'company' && r.subject_id).map(r => r.subject_id!))
  ]
  let companyNameMap: Record<string, string> = {}
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds)
    companies?.forEach(c => { companyNameMap[c.id] = c.name })
  }

  const enrichedRuns: AgentRunListRow[] = runs.map(r => ({
    ...r,
    companyName: (r.subject_type === 'company' && r.subject_id)
      ? (companyNameMap[r.subject_id] ?? null)
      : null,
  }))

  const controls = allControls.filter(c => CONTROL_KEYS_TO_SHOW.includes(c.key))

  return {
    summary: {
      runsTodayCount:      runsTodayCount ?? 0,
      completedTodayCount: completedTodayCount ?? 0,
      failedTodayCount:    failedTodayCount ?? 0,
      openGuardrailCount:  openGuardrailCount ?? 0,
    },
    runs: enrichedRuns,
    controls,
  }
}

// ---- All-agents roster (read-only) ----

import {
  AGENT_ROSTER, buildRoster, anomalies,
  type AgentRosterRow, type RunAggregate,
} from '@/modules/intelligence/agent-roster'

export interface AgentRosterData {
  windowDays:    number
  rows:          AgentRosterRow[]
  anomalyRows:   AgentRosterRow[]
  leadsIngested: number
}

// Aggregates agent_runs / agent_decisions / ai_usage_events over the window by
// agent_name (in-app, matching the analytics pattern), then folds them onto the
// static roster. Read-only; no migration. Pilot-volume aggregation moves to an
// RPC/materialized view at scale.
export async function getAgentRosterData(
  tenantId:   string,
  windowDays: number = 7,
): Promise<AgentRosterData> {
  const supabase = createSupabaseServiceClient()
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()

  const [{ data: runRows }, { data: decisionRows }, { data: usageRows }, { count: leadsIngested }] = await Promise.all([
    supabase.from('agent_runs').select('agent_name, status, started_at').eq('tenant_id', tenantId).gte('started_at', since),
    supabase.from('agent_decisions').select('agent_name').eq('tenant_id', tenantId).gte('created_at', since),
    supabase.from('ai_usage_events').select('agent_name, total_tokens, estimated_cost_usd').eq('tenant_id', tenantId).gte('created_at', since),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', since),
  ])

  const runsByName = new Map<string, RunAggregate>()
  for (const r of runRows ?? []) {
    const cur = runsByName.get(r.agent_name) ?? { runs: 0, completed: 0, failed: 0, lastRunAt: null }
    cur.runs++
    if (r.status === 'completed') cur.completed++
    if (r.status === 'failed' || r.status === 'killed') cur.failed++
    if (!cur.lastRunAt || (r.started_at && r.started_at > cur.lastRunAt)) cur.lastRunAt = r.started_at
    runsByName.set(r.agent_name, cur)
  }

  const decisionsByName = new Map<string, number>()
  for (const d of decisionRows ?? []) decisionsByName.set(d.agent_name, (decisionsByName.get(d.agent_name) ?? 0) + 1)

  const usageByName = new Map<string, { tokens: number; cost: number }>()
  for (const u of usageRows ?? []) {
    const cur = usageByName.get(u.agent_name) ?? { tokens: 0, cost: 0 }
    cur.tokens += u.total_tokens ?? 0
    cur.cost   += Number(u.estimated_cost_usd ?? 0)
    usageByName.set(u.agent_name, cur)
  }

  const rows = buildRoster(AGENT_ROSTER, runsByName, decisionsByName, usageByName, leadsIngested ?? 0)
  return { windowDays, rows, anomalyRows: anomalies(rows), leadsIngested: leadsIngested ?? 0 }
}

// ---- Detail page data ----

export interface AgentRunFullTrace {
  run:                    AgentRunRow
  steps:                  AgentRunStepRow[]
  guardrailEvents:        GuardrailEventRow[]
  activityEvents:         ActivityEventRow[]
  relatedRecommendation:  RecommendationRow | null
  relatedCompanyScore:    CompanyScoreRow | null
  companyName:            string | null
}

export async function getAgentRunTraceData(
  runId: string,
  tenantId: string
): Promise<AgentRunFullTrace | null> {
  const supabase = createSupabaseServiceClient()

  const run = await agentRunRepo.getAgentRunById(runId, tenantId)
  if (!run) return null

  // Fetch steps, guardrails, and activity events in parallel
  const [steps, guardrailEvents, { data: activityRows }] = await Promise.all([
    agentRunStepRepo.listAgentRunSteps(runId),
    guardrailEventRepo.listGuardrailEvents(tenantId, { agentRunId: runId, limit: 100 }),
    supabase.from('activity_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .filter('metadata->>agent_run_id', 'eq', runId)
      .order('occurred_at', { ascending: true })
      .limit(20),
  ])

  const activityEvents: ActivityEventRow[] = activityRows ?? []

  // Load related outputs if this is a company run
  let relatedRecommendation: RecommendationRow | null = null
  let relatedCompanyScore: CompanyScoreRow | null = null
  let companyName: string | null = null

  if (run.subject_type === 'company' && run.subject_id) {
    const [rec, score, company] = await Promise.all([
      recommendationRepo.getLatestCompanyRecommendation(run.subject_id, tenantId),
      companyScoreRepo.getCurrentCompanyScore(run.subject_id, tenantId, 'overall'),
      companyRepo.getCompanyByTenant(run.subject_id, tenantId),
    ])
    relatedRecommendation = rec
    relatedCompanyScore   = score
    companyName           = company?.name ?? null
  }

  return { run, steps, guardrailEvents, activityEvents, relatedRecommendation, relatedCompanyScore, companyName }
}
