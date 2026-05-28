import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type AiBudgetEventRow = Database['public']['Tables']['ai_budget_events']['Row']

export interface RecordBudgetEventInput {
  tenantId:             string
  eventType:            string
  agentName:            string
  budgetLevel:          string
  policyId?:            string | null
  limitUsd?:            number | null
  consumedUsd?:         number | null
  blockedCallContext?:  Record<string, unknown>
  leadId?:              string | null
  campaignId?:          string | null
  overrideApprovedBy?:  string | null
}

export async function recordBudgetEvent(input: RecordBudgetEventInput): Promise<AiBudgetEventRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('ai_budget_events')
    .insert({
      tenant_id:             input.tenantId,
      event_type:            input.eventType,
      agent_name:            input.agentName,
      budget_level:          input.budgetLevel,
      policy_id:             input.policyId ?? null,
      limit_usd:             input.limitUsd ?? null,
      consumed_usd:          input.consumedUsd ?? null,
      blocked_call_context:  input.blockedCallContext ?? null,
      lead_id:               input.leadId ?? null,
      campaign_id:           input.campaignId ?? null,
      override_approved_by:  input.overrideApprovedBy ?? null,
    })
    .select()
    .single()

  if (error) throw new Error('recordBudgetEvent: ' + error.message)
  return data
}

export async function getBudgetEventsForTenant(
  tenantId: string,
  limit:    number = 50
): Promise<AiBudgetEventRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('ai_budget_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error('getBudgetEventsForTenant: ' + error.message)
  return data ?? []
}
