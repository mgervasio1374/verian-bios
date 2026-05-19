'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext }         from '@/lib/auth/context'
import { requirePermission }           from '@/lib/auth/permissions'
import { revalidatePath }              from 'next/cache'
import * as svc                        from '@/modules/messaging/copywriting/copywriting-agent.service'
import type {
  CopywritingResult,
  MessageVersion,
} from '@/modules/messaging/copywriting/copywriting-agent.types'
import type { ActionResult }           from '@/modules/crm/actions/company.actions'

// ---- Generate message versions ----

export async function generateMessageVersionsAction(
  strategyId:       string,
  leadId:           string,
  workspaceSlug:    string,
  forceRegenerate = false
): Promise<CopywritingResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    // Server-side re-check of gate conditions (UI check is not sufficient)
    const gate = await svc.canGenerateMessageVersions(strategyId, ctx.tenantId)
    if (!gate.allowed) {
      return {
        success:    false,
        errors:     [{ code: gate.errorCode ?? 'COPY_002' as const, severity: 'critical', message: gate.reason ?? 'Cannot generate versions.', suggestedFix: 'Resolve the gate condition.', canOverride: false, blocking: true }],
        warnings:   [],
        agentRunId: null,
      }
    }

    const result = await svc.generateMessageVersions({
      strategyId,
      tenantId:        ctx.tenantId,
      forceRegenerate,
      requestedBy:     ctx.userId,
    })

    if (result.success) {
      revalidatePath(`/${workspaceSlug}/message-workspace/${leadId}`)
    }

    return result
  } catch (err) {
    return {
      success:    false,
      errors:     [{ code: 'COPY_002' as const, severity: 'critical', message: err instanceof Error ? err.message : 'Unknown error', suggestedFix: 'Check server logs.', canOverride: false, blocking: true }],
      warnings:   [],
      agentRunId: null,
    }
  }
}

// ---- List versions for strategy ----

export async function listMessageVersionsForStrategyAction(
  strategyId: string,
  opts: { includeSuperseded?: boolean } = {}
): Promise<ActionResult<MessageVersion[]>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const versions = await svc.listMessageVersionsForStrategy(strategyId, ctx.tenantId, opts)
    return { success: true, data: versions }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Get a single version ----

export async function getMessageVersionAction(
  versionId: string
): Promise<ActionResult<MessageVersion | null>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const version = await svc.getMessageVersion(versionId, ctx.tenantId)
    return { success: true, data: version }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Select version ----
// Sets approval_status = selected ONLY.
// Does NOT create email_drafts, approval_requests, or send anything.

export async function selectMessageVersionAction(
  versionId:    string,
  leadId:       string,
  workspaceSlug:string
): Promise<ActionResult<MessageVersion>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const updated = await svc.selectMessageVersion(versionId, ctx.tenantId, ctx.userId)
    if (!updated) return { success: false, error: 'Version not found.' }

    revalidatePath(`/${workspaceSlug}/message-workspace/${leadId}`)
    return { success: true, data: updated }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Reject version ----
// Sets approval_status = rejected ONLY.
// Does NOT affect lead status, campaign status, or send status.

export async function rejectMessageVersionAction(
  versionId:        string,
  leadId:           string,
  workspaceSlug:    string,
  rejectionReason?: string
): Promise<ActionResult<MessageVersion>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const updated = await svc.rejectMessageVersion(versionId, ctx.tenantId, ctx.userId, rejectionReason)
    if (!updated) return { success: false, error: 'Version not found.' }

    revalidatePath(`/${workspaceSlug}/message-workspace/${leadId}`)
    return { success: true, data: updated }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- canGenerateMessageVersions (for UI gate check) ----

export async function canGenerateMessageVersionsAction(
  strategyId: string
): Promise<ActionResult<{ allowed: boolean; reason?: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const result = await svc.canGenerateMessageVersions(strategyId, ctx.tenantId)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
