'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as assignmentRepo from '@/modules/messaging/repositories/campaign-assignment.repo'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { createDraftFromAsset } from '@/modules/messaging/services/campaign-asset-draft.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'

export type CreateDraftFromAssignmentResult =
  | { ok: true;  draftId: string; approvalRequestId: string; missingFields: string[] }
  | { ok: false; reason: string }

export async function createDraftFromAssignmentAction(
  assignmentId:  string,
  workspaceSlug: string
): Promise<CreateDraftFromAssignmentResult> {
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  // 1. Resolve assignment
  const assignment = await assignmentRepo.getAssignmentById(assignmentId)
  if (!assignment) return { ok: false, reason: 'assignment_not_found' }

  // 2. Validate assignment belongs to this tenant and workspace
  if (assignment.tenant_id !== ctx.tenantId) return { ok: false, reason: 'assignment_not_found' }
  if (assignment.workspace_id !== ctx.workspaceId) return { ok: false, reason: 'assignment_not_found' }

  // 3. Validate assignment is in 'assigned' status
  if (assignment.assignment_status !== 'assigned') return { ok: false, reason: 'assignment_not_active' }

  // 4. Validate lead is present
  if (!assignment.lead_id) return { ok: false, reason: 'assignment_has_no_lead' }

  // 5. Block if lead already has an active or approved draft
  const blockingDraft = await emailDraftRepo.getBlockingDraftForLead(ctx.tenantId, assignment.lead_id)
  if (blockingDraft) return { ok: false, reason: 'pending_draft_exists' }

  // 6. Resolve and validate asset
  let resolvedAssetId: string | null = null

  if (assignment.campaign_asset_id) {
    const asset = await assetRepo.getAssetById(ctx.tenantId, assignment.campaign_asset_id)
    if (!asset) return { ok: false, reason: 'asset_not_found' }
    if (asset.workspace_id !== ctx.workspaceId) return { ok: false, reason: 'asset_not_found' }
    if (asset.status !== 'active' && asset.status !== 'approved') return { ok: false, reason: 'asset_not_active' }
    if (asset.campaign_type !== assignment.campaign_type) return { ok: false, reason: 'asset_type_mismatch' }
    resolvedAssetId = asset.id
  } else {
    const allAssets = await assetRepo.listAssetsForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => [])
    const activeAsset = allAssets.find(
      a => (a.status === 'active' || a.status === 'approved') && a.campaign_type === assignment.campaign_type
    )
    if (!activeAsset) return { ok: false, reason: 'no_active_asset_for_campaign_type' }
    resolvedAssetId = activeAsset.id
  }

  // 7. Call Phase 3K service with assignment FK threaded through
  const result = await createDraftFromAsset({
    tenantId:             ctx.tenantId,
    workspaceId:          ctx.workspaceId,
    assetId:              resolvedAssetId,
    leadId:               assignment.lead_id,
    requestedBy:          ctx.userId,
    campaignAssignmentId: assignmentId,
  })

  if (!result.ok) return result

  // 8. Revalidate both lead page and queue page
  revalidatePath(`/${workspaceSlug}/leads/${assignment.lead_id}`)
  revalidatePath(`/${workspaceSlug}/settings/campaign-queue`)

  // 9. Emit assignment-side traceability event (non-fatal)
  activityEventService.recordActivity({
    tenantId:     ctx.tenantId,
    workspaceId:  ctx.workspaceId,
    eventType:    ActivityEventType.CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT,
    eventSource:  'campaign_assignment_draft',
    entityType:   'email_draft',
    entityId:     result.draftId,
    leadId:       assignment.lead_id,
    eventSummary: `Draft created from assignment ${assignmentId}`,
    metadata: {
      assignment_id:       assignmentId,
      draft_id:            result.draftId,
      approval_request_id: result.approvalRequestId,
      campaign_type:       assignment.campaign_type,
    },
  }).catch(() => null)

  return {
    ok:               true,
    draftId:          result.draftId,
    approvalRequestId: result.approvalRequestId,
    missingFields:    result.missingFields,
  }
}
