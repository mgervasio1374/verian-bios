'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext }         from '@/lib/auth/context'
import { requirePermission }           from '@/lib/auth/permissions'
import { revalidatePath }              from 'next/cache'
import * as qraSvc                     from '@/modules/messaging/quality-review/quality-review-agent.service'
import type { QualityReview }          from '@/modules/messaging/quality-review/quality-review-agent.types'

// ---- Run quality review ----

export async function runQualityReviewAction(
  strategyId:    string,
  leadId:        string,
  workspaceSlug: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const result = await qraSvc.runQualityReview({
      strategyId,
      tenantId: ctx.tenantId,
      force:    false,
    })

    if (result.success === false) {
      return { success: false, error: result.error.message }
    }

    revalidatePath(`/${workspaceSlug}/message-workspace/${leadId}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ---- Get quality reviews for a strategy ----

export async function getQualityReviewsAction(
  strategyId: string
): Promise<{ success: boolean; reviews?: QualityReview[]; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const reviews = await qraSvc.listQualityReviewsForStrategy(strategyId, ctx.tenantId)
    return { success: true, reviews }
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ---- Get recommended version review for a strategy ----

export async function getRecommendedVersionReviewAction(
  strategyId: string
): Promise<{ success: boolean; review?: QualityReview | null; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const review = await qraSvc.getRecommendedVersionForStrategy(strategyId, ctx.tenantId)
    return { success: true, review }
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ---- Can run quality review gate check ----

export async function canRunQualityReviewAction(
  strategyId: string
): Promise<{ canRun: boolean; reason: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    return await qraSvc.canRunQualityReview(strategyId, ctx.tenantId)
  } catch {
    return { canRun: false, reason: 'Error checking quality review status.' }
  }
}
