'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import * as strategySvc from '@/modules/messaging/strategy/message-strategy.service'
import { normalizeStrategyInput } from '@/modules/messaging/strategy/message-strategy.normalizer'
import type {
  StrategyInput,
  StrategyResult,
  StrategyOverrideRequest,
  MessageStrategy,
} from '@/modules/messaging/strategy/message-strategy.types'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import { revalidatePath } from 'next/cache'

// ---- Generate strategy ----

export async function generateMessageStrategyAction(
  input: Omit<StrategyInput, 'systemControls'>
): Promise<StrategyResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const controls = await strategySvc.loadSystemControls(ctx.tenantId)

    const fullInput: StrategyInput = {
      ...input,
      systemControls: controls,
    }

    const result = await strategySvc.generateMessageStrategy(fullInput, ctx.tenantId)

    if (result.success) {
      revalidatePath(`/${ctx.workspaceId}/message-workspace/${input.lead.lead_id}`)
    }

    return result
  } catch (err) {
    return {
      success:      false,
      errors:       [{ code: 'STRAT_003', severity: 'critical', message: err instanceof Error ? err.message : 'Unknown error', suggested_fix: 'Check server logs.', can_override: false, blocking: true }],
      warnings:     [],
      strategy:     null,
      agent_run_id: null,
    }
  }
}

// ---- Get strategy ----

export async function getMessageStrategyAction(
  strategyId: string
): Promise<ActionResult<MessageStrategy | null>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const strategy = await strategySvc.getMessageStrategy(strategyId, ctx.tenantId)
    return { success: true, data: strategy }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Approve strategy ----

export async function approveMessageStrategyAction(
  strategyId: string,
  leadId:     string
): Promise<ActionResult<MessageStrategy>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const approved = await strategySvc.approveStrategy(strategyId, ctx.tenantId, ctx.userId)
    if (!approved) return { success: false, error: 'Strategy not found or has blocking errors.' }

    revalidatePath(`/${ctx.workspaceId}/message-workspace/${leadId}`)
    return { success: true, data: approved }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Override strategy ----

export async function overrideMessageStrategyAction(
  strategyId:      string,
  overrideRequest: Omit<StrategyOverrideRequest, 'strategy_id' | 'overriding_user_id'> & { lead_input?: Omit<StrategyInput, 'systemControls'> },
  leadId:          string
): Promise<StrategyResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const controls = await strategySvc.loadSystemControls(ctx.tenantId)

    // We need a NormalizedStrategyInput for guardrail checks in override
    // Use whatever lead input was passed, or build a minimal one
    const leadInput = overrideRequest.lead_input ?? { lead: { lead_id: '' } }
    const fullInput: StrategyInput = { ...(leadInput as unknown as Omit<StrategyInput, 'systemControls'>), systemControls: controls }
    const n = normalizeStrategyInput(fullInput)

    const fullRequest: StrategyOverrideRequest = {
      strategy_id:          strategyId,
      overriding_user_id:   ctx.userId,
      override_reason:      overrideRequest.override_reason,
      ...(overrideRequest as Partial<StrategyOverrideRequest>),
    }

    const result = await strategySvc.updateMessageStrategyOverride(strategyId, fullRequest, ctx.tenantId, n)

    if (result.success) {
      revalidatePath(`/${ctx.workspaceId}/message-workspace/${leadId}`)
    }

    return result
  } catch (err) {
    return {
      success:      false,
      errors:       [{ code: 'STRAT_003', severity: 'critical', message: err instanceof Error ? err.message : 'Unknown error', suggested_fix: 'Check server logs.', can_override: false, blocking: true }],
      warnings:     [],
      strategy:     null,
      agent_run_id: null,
    }
  }
}

// ---- List strategies for lead ----

export async function listStrategiesForLeadAction(
  leadId: string
): Promise<ActionResult<MessageStrategy[]>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const strategies = await strategySvc.listStrategiesForLead(leadId, ctx.tenantId)
    return { success: true, data: strategies }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Can proceed to copy generation ----

export async function canProceedToCopyGenerationAction(
  strategyId: string
): Promise<ActionResult<{ allowed: boolean; reason?: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const result = await strategySvc.canProceedToCopyGeneration(strategyId, ctx.tenantId)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
