'use server'

// ============================================================
// Phase 3B — Human Review / Approval Bridge Server Actions
// All Next.js server actions for the bridge workflow.
// Each action: builds context, checks auth, calls service, revalidates.
// Does NOT send email, create email_drafts, create approval_requests.
// ============================================================

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext }         from '@/lib/auth/context'
import { requirePermission }           from '@/lib/auth/permissions'
import { revalidatePath }              from 'next/cache'
import * as svc                        from '@/modules/messaging/human-review/human-review.service'
import { recordReviewEvent }           from '@/modules/messaging/human-review/human-review.service'
import {
  buildRegenerationRequestedPayload,
  buildReturnedToStrategyPayload,
} from '@/modules/messaging/human-review/human-review.audit'
import { generateMessageVersionsAction } from '@/modules/messaging/actions/copywriting-agent.actions'

// ---- Permission used for all HRB actions ----
// Maps to the existing permission in the codebase.
// No separate messaging.review or messaging.approve permission system exists in v1.
const HRB_PERMISSION = 'crm.companies.view' as const

// ---- Select version ----

export async function selectMessageVersionForReviewAction(
  versionId:     string,
  strategyId:    string,
  workspaceSlug: string,
  leadId:        string,
  selectReason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, HRB_PERMISSION)

    const result = await svc.selectVersion({
      versionId,
      strategyId,
      userId:   ctx.userId,
      tenantId: ctx.tenantId,
      selectReason,
    })

    if (result.success) {
      revalidatePath(`/${workspaceSlug}/message-workspace/${leadId}`)
    }

    return result.success
      ? { success: true }
      : { success: false, error: result.errorMessage ?? result.error ?? 'Select failed.' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Reject version ----

export async function rejectMessageVersionForReviewAction(
  versionId:       string,
  strategyId:      string,
  rejectionReason: string,
  workspaceSlug:   string,
  leadId:          string,
  reviewerNote?:   string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, HRB_PERMISSION)

    const result = await svc.rejectVersion({
      versionId,
      strategyId,
      userId:   ctx.userId,
      tenantId: ctx.tenantId,
      rejectionReason,
      reviewerNote,
    })

    if (result.success) {
      revalidatePath(`/${workspaceSlug}/message-workspace/${leadId}`)
    }

    return result.success
      ? { success: true }
      : { success: false, error: result.errorMessage ?? result.error ?? 'Reject failed.' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Approve version for next step ----
// Does NOT send email. Does NOT create email_draft. Does NOT create approval_request.

export async function approveMessageVersionForNextStepAction(
  versionId:     string,
  strategyId:    string,
  workspaceSlug: string,
  leadId:        string,
  options: { overrideReason?: string; riskAcknowledged?: boolean } = {},
): Promise<{ success: boolean; error?: string; errorCode?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, HRB_PERMISSION)

    const result = await svc.approveVersionForNextStep({
      versionId,
      strategyId,
      userId:   ctx.userId,
      tenantId: ctx.tenantId,
      overrideReason:   options.overrideReason,
      riskAcknowledged: options.riskAcknowledged,
    })

    if (result.success) {
      revalidatePath(`/${workspaceSlug}/message-workspace/${leadId}`)
    }

    return result.success
      ? { success: true }
      : {
          success:   false,
          error:     result.errorMessage ?? result.error ?? 'Approve failed.',
          errorCode: result.error,
        }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Acknowledge risk and approve ----
// riskAcknowledged is forced to true.

export async function acknowledgeRiskAndApproveAction(
  versionId:      string,
  strategyId:     string,
  workspaceSlug:  string,
  leadId:         string,
  overrideReason?:string,
): Promise<{ success: boolean; error?: string; errorCode?: string }> {
  return approveMessageVersionForNextStepAction(
    versionId,
    strategyId,
    workspaceSlug,
    leadId,
    { overrideReason, riskAcknowledged: true }
  )
}

// ---- Request version regeneration ----
// Calls generateMessageVersionsAction (Copywriting Agent) with forceRegenerate=true.
// Records HRB_ACTION_REGENERATION_REQUESTED audit event.

export async function requestVersionRegenerationAction(
  strategyId:       string,
  leadId:           string,
  workspaceSlug:    string,
  regenerationNote?:string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, HRB_PERMISSION)

    // Delegate copy generation to Copywriting Agent
    const result = await generateMessageVersionsAction(strategyId, leadId, workspaceSlug, true)

    // Record the regeneration request event regardless of generation outcome
    const payload = buildRegenerationRequestedPayload({
      strategyId,
      userId:           ctx.userId,
      regenerationNote: regenerationNote,
    })
    await recordReviewEvent(payload, ctx.tenantId)

    if (!result.success) {
      return {
        success: false,
        error:   result.errors?.[0]?.message ?? 'Regeneration failed.',
      }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Return to strategy ----
// Records HRB_ACTION_RETURNED_TO_STRATEGY and returns redirect path.

export async function returnToStrategyAction(
  strategyId:    string,
  leadId:        string,
  workspaceSlug: string,
): Promise<{ success: boolean; redirectTo: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, HRB_PERMISSION)

    const payload = buildReturnedToStrategyPayload({
      strategyId,
      userId: ctx.userId,
    })
    await recordReviewEvent(payload, ctx.tenantId)

    const redirectTo = `/${workspaceSlug}/message-workspace/${leadId}`
    revalidatePath(redirectTo)

    return { success: true, redirectTo }
  } catch {
    return { success: false, redirectTo: `/${workspaceSlug}/message-workspace/${leadId}` }
  }
}
