import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type RecommendationRow  = Database['public']['Tables']['agent_recommendations']['Row']
type AgentRunRow        = Database['public']['Tables']['agent_runs']['Row']
type GuardrailEventRow  = Database['public']['Tables']['guardrail_events']['Row']
type SystemControlRow   = Database['public']['Tables']['system_controls']['Row']
type ArtifactRow        = Database['public']['Tables']['artifacts']['Row']
type ActivityEventRow   = Database['public']['Tables']['activity_events']['Row']

// ---- Enriched types ----

export interface EnrichedRecommendation extends RecommendationRow {
  companyName: string | null
  leadName:    string | null
}

export interface EnrichedAgentRun extends AgentRunRow {
  companyName: string | null
}

export interface EnrichedDocument extends ArtifactRow {
  companyName: string | null
}

// ---- Return shape ----

export interface DashboardIntelligenceSummary {
  openRecommendations:      number
  highPriorityRecommendations: number
  agentRunsToday:           number
  failedRunsToday:          number
  openGuardrails:           number
  documentsThisWeek:        number
  companiesScoredThisWeek:  number
}

export interface DashboardIntelligenceData {
  summary:           DashboardIntelligenceSummary
  recommendations:   EnrichedRecommendation[]
  recentAgentRuns:   EnrichedAgentRun[]
  openGuardrailEvents: GuardrailEventRow[]
  coreControls:      SystemControlRow[]
  recentDocuments:   EnrichedDocument[]
  recentActivity:    ActivityEventRow[]
  isGlobalPaused:    boolean
}

// ---- Internal helper ----

function getJsonStr(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const val = (obj as Record<string, unknown>)[key]
  return typeof val === 'string' ? val : null
}

// ---- Constants ----

const DASHBOARD_CONTROL_KEYS = [
  'global_agent_pause',
  'agent.enabled',
  'recommendation_engine_enabled',
  'auto_task_creation_enabled',
  'email_sending_enabled',
  'campaign_sending_enabled',
]

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
}

// ---- Main function ----

export async function getDashboardIntelligenceData(
  tenantId:    string,
  workspaceId: string
): Promise<DashboardIntelligenceData> {
  const supabase = createSupabaseServiceClient()
  const since24h = new Date(Date.now() -     86_400_000).toISOString()
  const since7d  = new Date(Date.now() - 7 * 86_400_000).toISOString()

  // ---- Batch 1: parallel count queries ----
  const [
    { count: openRecCount },
    { count: highPriorityRecCount },
    { count: runsTodayCount },
    { count: failedTodayCount },
    { count: openGuardrailCount },
    { count: docsThisWeekCount },
    { count: scoredThisWeekCount },
  ] = await Promise.all([
    supabase.from('agent_recommendations')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'pending'),

    supabase.from('agent_recommendations')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'pending')
      .in('priority', ['high', 'critical']),

    supabase.from('agent_runs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('started_at', since24h),

    supabase.from('agent_runs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).in('status', ['failed', 'killed'])
      .gte('started_at', since24h),

    supabase.from('guardrail_events')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'open'),

    supabase.from('artifacts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).is('deleted_at', null)
      .gte('created_at', since7d),

    supabase.from('company_scores')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('scored_at', since7d),
  ])

  // ---- Batch 2: parallel list queries ----
  const [
    { data: rawRecs },
    { data: rawRuns },
    { data: rawGuardrails },
    { data: rawControls },
    { data: rawDocs },
    { data: rawActivity },
  ] = await Promise.all([
    supabase.from('agent_recommendations')
      .select('*')
      .eq('tenant_id', tenantId).eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10),

    supabase.from('agent_runs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase.from('guardrail_events')
      .select('*')
      .eq('tenant_id', tenantId).eq('status', 'open')
      .order('triggered_at', { ascending: false })
      .limit(5),

    supabase.from('system_controls')
      .select('*')
      .is('tenant_id', null)
      .in('key', DASHBOARD_CONTROL_KEYS),

    supabase.from('artifacts')
      .select('*')
      .eq('tenant_id', tenantId).is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase.from('activity_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('occurred_at', { ascending: false })
      .limit(10),
  ])

  // ---- Batch 3: entity name resolution ----

  const companyIdSet = new Set<string>()
  const leadIdSet    = new Set<string>()

  // Company IDs: direct subject or from evidence.company_id
  rawRecs?.forEach(r => {
    if (r.subject_type === 'company' && r.subject_id) companyIdSet.add(r.subject_id)
    const evCo = getJsonStr(r.evidence, 'company_id')
    if (evCo) companyIdSet.add(evCo)
    // Collect lead IDs so we can resolve their company later
    if (r.subject_type === 'lead' && r.subject_id) leadIdSet.add(r.subject_id)
  })
  rawRuns?.forEach(r => { if (r.subject_type === 'company' && r.subject_id) companyIdSet.add(r.subject_id) })
  rawDocs?.forEach(a => { if (a.company_id) companyIdSet.add(a.company_id) })

  // Batch 3a: fetch leads (for lead-based recs) to get their company_id and name
  const leadMap = new Map<string, { companyId: string | null; name: string }>()
  if (leadIdSet.size > 0) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, company_id')
      .in('id', [...leadIdSet])
    leads?.forEach(l => {
      leadMap.set(l.id, { companyId: l.company_id, name: l.name })
      if (l.company_id) companyIdSet.add(l.company_id)
    })
  }

  // Batch 3b: fetch company names for all collected IDs
  const companyMap = new Map<string, string>()
  if (companyIdSet.size > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', [...companyIdSet])
    companies?.forEach(c => companyMap.set(c.id, c.name))
  }

  // ---- Sort recommendations by priority then date ----
  const sortedRecs = [...(rawRecs ?? [])].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 4
    const pb = PRIORITY_ORDER[b.priority] ?? 4
    if (pa !== pb) return pa - pb
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const recommendations: EnrichedRecommendation[] = sortedRecs.slice(0, 5).map(r => {
    let companyName: string | null = null
    let leadName: string | null = null

    if (r.subject_type === 'company' && r.subject_id) {
      companyName = companyMap.get(r.subject_id) ?? null
    } else if (r.subject_type === 'lead' && r.subject_id) {
      const lead = leadMap.get(r.subject_id)
      leadName    = lead?.name ?? null
      if (lead?.companyId) companyName = companyMap.get(lead.companyId) ?? null
    }
    // Fallback: evidence.company_id (for older records)
    if (!companyName) {
      const evCo = getJsonStr(r.evidence, 'company_id')
      if (evCo) companyName = companyMap.get(evCo) ?? null
    }

    return { ...r, companyName, leadName }
  })

  const recentAgentRuns: EnrichedAgentRun[] = (rawRuns ?? []).map(r => ({
    ...r,
    companyName: (r.subject_type === 'company' && r.subject_id)
      ? (companyMap.get(r.subject_id) ?? null)
      : null,
  }))

  const recentDocuments: EnrichedDocument[] = (rawDocs ?? []).map(a => ({
    ...a,
    companyName: a.company_id ? (companyMap.get(a.company_id) ?? null) : null,
  }))

  // ---- Check global pause ----
  const globalPauseControl = (rawControls ?? []).find(c => c.key === 'global_agent_pause')
  const isGlobalPaused = globalPauseControl?.value === true

  return {
    summary: {
      openRecommendations:       openRecCount      ?? 0,
      highPriorityRecommendations: highPriorityRecCount ?? 0,
      agentRunsToday:            runsTodayCount    ?? 0,
      failedRunsToday:           failedTodayCount  ?? 0,
      openGuardrails:            openGuardrailCount ?? 0,
      documentsThisWeek:         docsThisWeekCount  ?? 0,
      companiesScoredThisWeek:   scoredThisWeekCount ?? 0,
    },
    recommendations,
    recentAgentRuns,
    openGuardrailEvents: rawGuardrails ?? [],
    coreControls:        rawControls   ?? [],
    recentDocuments,
    recentActivity:      rawActivity   ?? [],
    isGlobalPaused,
  }
}
