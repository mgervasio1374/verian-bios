import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type AiUsageEventRow = Database['public']['Tables']['ai_usage_events']['Row']

export interface RecordUsageInput {
  tenantId:            string
  workspaceId?:        string | null
  agentName:           string
  featureName?:        string | null
  provider?:           string
  modelName:           string
  promptTokens?:       number | null
  completionTokens?:   number | null
  totalTokens?:        number | null
  estimatedCostUsd?:   number | null
  providerRequestId?:  string | null
  decisionId?:         string | null
  relatedEntityType?:  string | null
  relatedEntityId?:    string | null
  leadId?:             string | null
  draftId?:            string | null
  campaignId?:         string | null
  campaignAssetId?:    string | null
  success?:            boolean
  errorReason?:        string | null
}

export interface UsageSummary {
  totalTokensToday:  number
  totalTokensMonth:  number
  totalCostUsdToday: number
  totalCostUsdMonth: number
  callCountToday:    number
  callCountMonth:    number
  failedCallsToday:  number
}

export interface UsageByAgent {
  agentName:         string
  callsToday:        number
  tokensToday:       number
  costUsdToday:      number
  callsMonth:        number
  costUsdMonth:      number
}

export interface UsageByModel {
  modelName:        string
  calls:            number
  promptTokens:     number
  completionTokens: number
  estimatedCostUsd: number
}

export interface UsageByFeature {
  featureName:      string
  calls:            number
  tokens:           number
  estimatedCostUsd: number
}

export interface UsageByLead {
  leadId:           string
  leadName:         string | null
  companyName:      string | null
  calls:            number
  estimatedCostUsd: number
}

export interface UsageTrendRow {
  date:             string
  totalTokens:      number
  estimatedCostUsd: number
  failedCalls:      number
}

export async function recordUsage(input: RecordUsageInput): Promise<AiUsageEventRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('ai_usage_events')
    .insert({
      tenant_id:            input.tenantId,
      workspace_id:         input.workspaceId ?? null,
      agent_name:           input.agentName,
      feature_name:         input.featureName ?? null,
      provider:             input.provider ?? 'anthropic',
      model_name:           input.modelName,
      prompt_tokens:        input.promptTokens ?? null,
      completion_tokens:    input.completionTokens ?? null,
      total_tokens:         input.totalTokens ?? null,
      estimated_cost_usd:   input.estimatedCostUsd ?? null,
      provider_request_id:  input.providerRequestId ?? null,
      decision_id:          input.decisionId ?? null,
      related_entity_type:  input.relatedEntityType ?? null,
      related_entity_id:    input.relatedEntityId ?? null,
      lead_id:              input.leadId ?? null,
      draft_id:             input.draftId ?? null,
      campaign_id:          input.campaignId ?? null,
      campaign_asset_id:    input.campaignAssetId ?? null,
      success:              input.success ?? true,
      error_reason:         input.errorReason ?? null,
    })
    .select()
    .single()

  if (error) throw new Error('recordUsage: ' + error.message)
  return data
}

export async function getUsageSummary(
  tenantId: string,
  _period:  'today' | 'month'
): Promise<UsageSummary> {
  const supabase = createSupabaseServiceClient()
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const [todayResult, monthResult, failedTodayResult] = await Promise.all([
    supabase
      .from('ai_usage_events')
      .select('total_tokens, estimated_cost_usd')
      .eq('tenant_id', tenantId)
      .gte('created_at', todayStart),
    supabase
      .from('ai_usage_events')
      .select('total_tokens, estimated_cost_usd')
      .eq('tenant_id', tenantId)
      .gte('created_at', monthStart),
    supabase
      .from('ai_usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('success', false)
      .gte('created_at', todayStart),
  ])

  const todayRows  = todayResult.data ?? []
  const monthRows  = monthResult.data ?? []

  return {
    totalTokensToday:  todayRows.reduce((s, r) => s + (r.total_tokens ?? 0), 0),
    totalTokensMonth:  monthRows.reduce((s, r) => s + (r.total_tokens ?? 0), 0),
    totalCostUsdToday: todayRows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
    totalCostUsdMonth: monthRows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
    callCountToday:    todayRows.length,
    callCountMonth:    monthRows.length,
    failedCallsToday:  failedTodayResult.count ?? 0,
  }
}

export async function getUsageByAgent(
  tenantId: string,
  _period:  'today' | 'month'
): Promise<UsageByAgent[]> {
  const supabase = createSupabaseServiceClient()
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const [todayRows, monthRows] = await Promise.all([
    supabase
      .from('ai_usage_events')
      .select('agent_name, total_tokens, estimated_cost_usd')
      .eq('tenant_id', tenantId)
      .gte('created_at', todayStart),
    supabase
      .from('ai_usage_events')
      .select('agent_name, estimated_cost_usd')
      .eq('tenant_id', tenantId)
      .gte('created_at', monthStart),
  ])

  const agentMap = new Map<string, UsageByAgent>()

  for (const r of todayRows.data ?? []) {
    const key = r.agent_name
    if (!agentMap.has(key)) {
      agentMap.set(key, { agentName: key, callsToday: 0, tokensToday: 0, costUsdToday: 0, callsMonth: 0, costUsdMonth: 0 })
    }
    const entry = agentMap.get(key)!
    entry.callsToday += 1
    entry.tokensToday += r.total_tokens ?? 0
    entry.costUsdToday += r.estimated_cost_usd ?? 0
  }

  for (const r of monthRows.data ?? []) {
    const key = r.agent_name
    if (!agentMap.has(key)) {
      agentMap.set(key, { agentName: key, callsToday: 0, tokensToday: 0, costUsdToday: 0, callsMonth: 0, costUsdMonth: 0 })
    }
    const entry = agentMap.get(key)!
    entry.callsMonth += 1
    entry.costUsdMonth += r.estimated_cost_usd ?? 0
  }

  return Array.from(agentMap.values()).sort((a, b) => b.costUsdMonth - a.costUsdMonth)
}

export async function getUsageByModel(
  tenantId: string,
  _period:  'today' | 'month'
): Promise<UsageByModel[]> {
  const supabase = createSupabaseServiceClient()
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { data } = await supabase
    .from('ai_usage_events')
    .select('model_name, prompt_tokens, completion_tokens, estimated_cost_usd')
    .eq('tenant_id', tenantId)
    .gte('created_at', monthStart)

  const modelMap = new Map<string, UsageByModel>()
  for (const r of data ?? []) {
    if (!modelMap.has(r.model_name)) {
      modelMap.set(r.model_name, { modelName: r.model_name, calls: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 })
    }
    const entry = modelMap.get(r.model_name)!
    entry.calls += 1
    entry.promptTokens += r.prompt_tokens ?? 0
    entry.completionTokens += r.completion_tokens ?? 0
    entry.estimatedCostUsd += r.estimated_cost_usd ?? 0
  }

  return Array.from(modelMap.values()).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
}

export async function getUsageByFeature(
  tenantId: string,
  _period:  'today' | 'month'
): Promise<UsageByFeature[]> {
  const supabase = createSupabaseServiceClient()
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { data } = await supabase
    .from('ai_usage_events')
    .select('feature_name, total_tokens, estimated_cost_usd')
    .eq('tenant_id', tenantId)
    .gte('created_at', monthStart)

  const featureMap = new Map<string, UsageByFeature>()
  for (const r of data ?? []) {
    const key = r.feature_name ?? 'unknown'
    if (!featureMap.has(key)) {
      featureMap.set(key, { featureName: key, calls: 0, tokens: 0, estimatedCostUsd: 0 })
    }
    const entry = featureMap.get(key)!
    entry.calls += 1
    entry.tokens += r.total_tokens ?? 0
    entry.estimatedCostUsd += r.estimated_cost_usd ?? 0
  }

  return Array.from(featureMap.values()).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
}

export async function getTopLeadsByUsage(
  tenantId: string,
  limit:    number = 10
): Promise<UsageByLead[]> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('ai_usage_events')
    .select('lead_id, estimated_cost_usd')
    .eq('tenant_id', tenantId)
    .not('lead_id', 'is', null)

  const leadMap = new Map<string, { calls: number; estimatedCostUsd: number }>()
  for (const r of data ?? []) {
    const key = r.lead_id!
    if (!leadMap.has(key)) leadMap.set(key, { calls: 0, estimatedCostUsd: 0 })
    const entry = leadMap.get(key)!
    entry.calls += 1
    entry.estimatedCostUsd += r.estimated_cost_usd ?? 0
  }

  const sorted = Array.from(leadMap.entries())
    .sort((a, b) => b[1].estimatedCostUsd - a[1].estimatedCostUsd)
    .slice(0, limit)

  if (sorted.length === 0) return []

  const leadIds = sorted.map(([id]) => id)
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, company_id')
    .in('id', leadIds)
    .eq('tenant_id', tenantId)

  const companyIds = (leads ?? []).map(l => l.company_id).filter(Boolean) as string[]
  const { data: companies } = companyIds.length > 0
    ? await supabase.from('companies').select('id, name').in('id', companyIds)
    : { data: [] }

  const leadMap2 = new Map((leads ?? []).map(l => [l.id, l]))
  const companyMap = new Map((companies ?? []).map(c => [c.id, c]))

  return sorted.map(([leadId, stats]) => {
    const lead    = leadMap2.get(leadId)
    const company = lead?.company_id ? companyMap.get(lead.company_id) : null
    return {
      leadId,
      leadName:         lead?.name ?? null,
      companyName:      company?.name ?? null,
      calls:            stats.calls,
      estimatedCostUsd: stats.estimatedCostUsd,
    }
  })
}

export async function getUsageTrend(
  tenantId: string,
  days:     number = 30
): Promise<UsageTrendRow[]> {
  const supabase = createSupabaseServiceClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('ai_usage_events')
    .select('created_at, total_tokens, estimated_cost_usd, success')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const dayMap = new Map<string, UsageTrendRow>()
  for (const r of data ?? []) {
    const date = r.created_at.slice(0, 10)
    if (!dayMap.has(date)) dayMap.set(date, { date, totalTokens: 0, estimatedCostUsd: 0, failedCalls: 0 })
    const entry = dayMap.get(date)!
    entry.totalTokens += r.total_tokens ?? 0
    entry.estimatedCostUsd += r.estimated_cost_usd ?? 0
    if (!r.success) entry.failedCalls += 1
  }

  return Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date))
}

export async function getFailedCalls(
  tenantId: string,
  limit:    number = 20
): Promise<AiUsageEventRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('ai_usage_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('success', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error('getFailedCalls: ' + error.message)
  return data ?? []
}

export async function getLeadUsageSummary(
  tenantId: string,
  leadId:   string
): Promise<{ totalCostUsd: number; callCount: number }> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('ai_usage_events')
    .select('estimated_cost_usd')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)

  const rows = data ?? []
  return {
    totalCostUsd: rows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
    callCount:    rows.length,
  }
}
