import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type AiBudgetPolicyRow = Database['public']['Tables']['ai_budget_policies']['Row']

export interface CreateBudgetPolicyInput {
  tenantId:                 string
  workspaceId?:             string | null
  budgetLevel:              string
  scopeKey?:                string | null
  limitUsd:                 number
  warnThresholdPct?:        number
  alertThresholdPct?:       number
  isActive?:                boolean
  overrideRequiresApproval?: boolean
}

export async function createPolicy(input: CreateBudgetPolicyInput): Promise<AiBudgetPolicyRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('ai_budget_policies')
    .insert({
      tenant_id:                  input.tenantId,
      workspace_id:               input.workspaceId ?? null,
      budget_level:               input.budgetLevel,
      scope_key:                  input.scopeKey ?? null,
      limit_usd:                  input.limitUsd,
      warn_threshold_pct:         input.warnThresholdPct ?? 75,
      alert_threshold_pct:        input.alertThresholdPct ?? 90,
      is_active:                  input.isActive ?? true,
      override_requires_approval: input.overrideRequiresApproval ?? true,
    })
    .select()
    .single()

  if (error) throw new Error('createPolicy: ' + error.message)
  return data
}

export async function listActivePoliciesForTenant(
  tenantId:    string,
  _workspaceId?: string
): Promise<AiBudgetPolicyRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('ai_budget_policies')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  if (error) throw new Error('listActivePoliciesForTenant: ' + error.message)
  return data ?? []
}

export async function updatePolicyLimit(
  tenantId:  string,
  policyId:  string,
  limitUsd:  number
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('ai_budget_policies')
    .update({ limit_usd: limitUsd, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', policyId)

  if (error) throw new Error('updatePolicyLimit: ' + error.message)
}
