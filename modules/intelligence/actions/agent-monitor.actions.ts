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
      companyRepo.getCompany(run.subject_id, tenantId),
    ])
    relatedRecommendation = rec
    relatedCompanyScore   = score
    companyName           = company?.name ?? null
  }

  return { run, steps, guardrailEvents, activityEvents, relatedRecommendation, relatedCompanyScore, companyName }
}
