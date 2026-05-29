'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import type { AssetTemplateContent } from '@/modules/messaging/campaign-assets/campaign-asset.types'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import * as assetService from '@/modules/messaging/services/campaign-asset.service'
import * as aiService from '@/modules/messaging/services/campaign-asset-ai.service'
import { createDraftFromAsset } from '@/modules/messaging/services/campaign-asset-draft.service'

async function getCtx() {
  const supabase = await createSupabaseServerClient()
  return buildRequestContext(supabase)
}

export async function createHumanAssetAction(
  workspaceSlug: string,
  input: { campaignType: string; assetName: string } & AssetTemplateContent
) {
  const ctx  = await getCtx()
  const asset = await assetService.createHumanAsset(ctx.tenantId, ctx.workspaceId, input)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets`)
  return { assetId: asset.id }
}

export async function updateAssetContentAction(
  workspaceSlug: string,
  assetId:       string,
  content:       AssetTemplateContent & { assetName?: string; campaignType?: string }
) {
  const ctx = await getCtx()
  await assetRepo.updateAssetContent(ctx.tenantId, assetId, content)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets`)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets/${assetId}`)
}

export async function submitForReviewAction(
  workspaceSlug: string,
  assetId:       string
) {
  const ctx = await getCtx()
  await assetService.submitAssetForReview(ctx.tenantId, assetId)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets`)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets/${assetId}`)
}

export async function approveAssetAction(
  workspaceSlug: string,
  assetId:       string
) {
  const ctx = await getCtx()
  // approvedBy is always derived server-side from ctx.userId — client cannot pass this
  await assetService.approveAsset(ctx.tenantId, assetId, ctx.userId)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets`)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets/${assetId}`)
}

export async function activateAssetAction(
  workspaceSlug: string,
  assetId:       string
) {
  const ctx = await getCtx()
  // approvedBy is always derived server-side from ctx.userId — client cannot pass this
  await assetService.activateAsset(ctx.tenantId, assetId, ctx.userId)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets`)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets/${assetId}`)
}

export async function retireAssetAction(
  workspaceSlug: string,
  assetId:       string
) {
  const ctx = await getCtx()
  await assetService.retireAsset(ctx.tenantId, assetId)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets`)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets/${assetId}`)
}

export async function cloneAssetAction(
  workspaceSlug: string,
  sourceId:      string,
  newName:       string
) {
  const ctx   = await getCtx()
  const clone = await assetService.cloneAsset(ctx.tenantId, ctx.workspaceId, sourceId, newName)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets`)
  return { assetId: clone.id }
}

export async function generateAiDraftAction(
  workspaceSlug: string,
  input: { campaignType: string; promptBrief: string; modelName?: string }
) {
  const ctx    = await getCtx()
  const result = await aiService.generateAiAssetDraft({
    tenantId:     ctx.tenantId,
    workspaceId:  ctx.workspaceId,
    campaignType: input.campaignType,
    promptBrief:  input.promptBrief,
    modelName:    input.modelName,
  })

  if (result.blocked) {
    return {
      blocked:     true,
      blockReason: result.blockReason,
      assetId:     null,
      error:       'AI generation unavailable — budget exhausted. Check System Intelligence for details.',
    }
  }

  revalidatePath(`/${workspaceSlug}/settings/campaign-assets`)
  return { blocked: false, assetId: result.asset?.id ?? null, preflightWarning: result.preflightWarning }
}

export async function createDraftFromAssetAction(
  assetId: string,
  leadId:  string
): Promise<{ ok: boolean; draftId?: string; approvalRequestId?: string; missingFields?: string[]; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!assetId) return { ok: false, error: 'Asset ID is required.' }
    if (!leadId)  return { ok: false, error: 'Lead ID is required.' }

    const result = await createDraftFromAsset({
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId,
      assetId,
      leadId,
      requestedBy: ctx.userId === 'system' ? 'system' : ctx.userId,
    })

    if (!result.ok) return { ok: false, error: result.reason }

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    revalidatePath('/[workspaceSlug]/settings/campaign-assets/[assetId]', 'page')
    return { ok: true, draftId: result.draftId, approvalRequestId: result.approvalRequestId, missingFields: result.missingFields }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function reviseWithAiAction(
  workspaceSlug: string,
  assetId:       string,
  changeBrief:   string,
  modelName?:    string
) {
  const ctx    = await getCtx()
  const result = await aiService.reviseAssetWithAi({
    tenantId:    ctx.tenantId,
    workspaceId: ctx.workspaceId,
    assetId,
    changeBrief,
    modelName,
  })

  if (result.blocked) {
    return {
      blocked:     true,
      blockReason: result.blockReason,
      error:       'AI generation unavailable — budget exhausted. Check System Intelligence for details.',
    }
  }

  revalidatePath(`/${workspaceSlug}/settings/campaign-assets`)
  revalidatePath(`/${workspaceSlug}/settings/campaign-assets/${assetId}`)
  return { blocked: false, updated: result.updated }
}
