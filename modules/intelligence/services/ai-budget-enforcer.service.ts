import * as policyRepo      from '@/modules/intelligence/repositories/ai-budget-policy.repo'
import * as usageRepo       from '@/modules/intelligence/repositories/ai-usage-event.repo'
import * as budgetEventRepo from '@/modules/intelligence/repositories/ai-budget-event.repo'
import * as errorRepo       from '@/modules/intelligence/structured-errors/structured-error.repo'
import { estimateCostUsd }  from './ai-cost-estimator.service'
import { AI_BUDGET_FAILURE_TYPE, SE_SEVERITY } from '@/modules/intelligence/structured-errors/structured-error.types'

export interface PreflightInput {
  tenantId:        string
  workspaceId?:    string | null
  agentName:       string
  leadId?:         string | null
  draftId?:        string | null
  campaignId?:     string | null
  workflowRunId?:  string | null
  estimatedTokens: number
  modelName:       string
}

export interface PreflightResult {
  allowed:       boolean
  reason?:       string
  budgetLevel?:  string
  remainingUsd?: number
  warning?:      string
  usedPct?:      number
}

export async function preflightCheck(input: PreflightInput): Promise<PreflightResult> {
  const policies = await policyRepo.listActivePoliciesForTenant(input.tenantId, input.workspaceId ?? undefined)

  // No active policies — no constraints; allow immediately
  if (policies.length === 0) return { allowed: true }

  const estimatedCallCostUsd = estimateCostUsd(input.modelName, input.estimatedTokens, 0)

  const now       = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  let warningResult: Pick<PreflightResult, 'warning' | 'usedPct'> | undefined

  for (const policy of policies) {
    // Determine time window based on budget_level
    const windowStart = policy.budget_level === 'monthly' ? monthStart : todayStart

    // Aggregate consumed cost for this policy scope
    const supabase = (await import('@/lib/supabase/service')).createSupabaseServiceClient()
    let query = supabase
      .from('ai_usage_events')
      .select('estimated_cost_usd')
      .eq('tenant_id', input.tenantId)
      .eq('success', true)
      .gte('created_at', windowStart)

    if (policy.scope_key) query = query.eq('agent_name', policy.scope_key)

    const { data: usageRows } = await query
    const consumedUsd = (usageRows ?? []).reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0)
    const limitUsd    = Number(policy.limit_usd)
    const usedPct     = limitUsd > 0 ? (consumedUsd / limitUsd) * 100 : 0

    if (usedPct >= 100) {
      // Budget exhausted — block
      budgetEventRepo.recordBudgetEvent({
        tenantId:             input.tenantId,
        eventType:            'CALL_BLOCKED',
        agentName:            input.agentName,
        budgetLevel:          policy.budget_level,
        policyId:             policy.id,
        limitUsd:             limitUsd,
        consumedUsd:          consumedUsd,
        blockedCallContext:   {
          agent_name:       input.agentName,
          model_name:       input.modelName,
          estimated_tokens: input.estimatedTokens,
          lead_id:          input.leadId,
        },
        leadId:               input.leadId ?? null,
        campaignId:           input.campaignId ?? null,
      }).catch((err: unknown) => console.error('[budget-enforcer] Failed to record budget event:', err))

      errorRepo.createStructuredError({
        tenantId:      input.tenantId,
        workspaceId:   input.workspaceId ?? null,
        failureType:   AI_BUDGET_FAILURE_TYPE.AI_CALL_BLOCKED_BY_BUDGET,
        severity:      SE_SEVERITY.CRITICAL,
        errorMessage:  `AI budget exhausted at ${policy.budget_level} level (${usedPct.toFixed(1)}% used). Agent: ${input.agentName}`,
        context: {
          budget_level:     policy.budget_level,
          limit_usd:        limitUsd,
          consumed_usd:     consumedUsd,
          agent_name:       input.agentName,
          model_name:       input.modelName,
          policy_id:        policy.id,
        },
      }).catch((err: unknown) => console.error('[budget-enforcer] Failed to create structured error:', err))

      return {
        allowed:      false,
        reason:       'budget_exhausted',
        budgetLevel:  policy.budget_level,
        remainingUsd: 0,
      }
    }

    if (usedPct >= Number(policy.alert_threshold_pct)) {
      budgetEventRepo.recordBudgetEvent({
        tenantId:    input.tenantId,
        eventType:   'THRESHOLD_ALERT',
        agentName:   input.agentName,
        budgetLevel: policy.budget_level,
        policyId:    policy.id,
        limitUsd:    limitUsd,
        consumedUsd: consumedUsd,
      }).catch((err: unknown) => console.error('[budget-enforcer] Failed to record alert event:', err))

      errorRepo.createStructuredError({
        tenantId:     input.tenantId,
        workspaceId:  input.workspaceId ?? null,
        failureType:  AI_BUDGET_FAILURE_TYPE.AI_BUDGET_THRESHOLD_ALERT,
        severity:     SE_SEVERITY.ERROR,
        errorMessage: `AI budget alert: ${usedPct.toFixed(1)}% consumed at ${policy.budget_level} level. Agent: ${input.agentName}`,
        context: { budget_level: policy.budget_level, limit_usd: limitUsd, consumed_usd: consumedUsd, agent_name: input.agentName },
      }).catch((err: unknown) => console.error('[budget-enforcer] Failed to create alert structured error:', err))

      warningResult = { warning: 'approaching_limit', usedPct }

    } else if (usedPct >= Number(policy.warn_threshold_pct)) {
      budgetEventRepo.recordBudgetEvent({
        tenantId:    input.tenantId,
        eventType:   'THRESHOLD_WARNING',
        agentName:   input.agentName,
        budgetLevel: policy.budget_level,
        policyId:    policy.id,
        limitUsd:    limitUsd,
        consumedUsd: consumedUsd,
      }).catch((err: unknown) => console.error('[budget-enforcer] Failed to record warning event:', err))

      errorRepo.createStructuredError({
        tenantId:     input.tenantId,
        workspaceId:  input.workspaceId ?? null,
        failureType:  AI_BUDGET_FAILURE_TYPE.AI_BUDGET_THRESHOLD_WARNING,
        severity:     SE_SEVERITY.WARNING,
        errorMessage: `AI budget warning: ${usedPct.toFixed(1)}% consumed at ${policy.budget_level} level. Agent: ${input.agentName}`,
        context: { budget_level: policy.budget_level, limit_usd: limitUsd, consumed_usd: consumedUsd, agent_name: input.agentName },
      }).catch((err: unknown) => console.error('[budget-enforcer] Failed to create warning structured error:', err))

      if (!warningResult) warningResult = { warning: 'approaching_limit', usedPct }
    }
  }

  return { allowed: true, ...warningResult }
}
