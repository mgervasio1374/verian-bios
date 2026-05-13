'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as approvalService from '@/modules/workflow/services/approval.service'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailDraftService from '@/modules/messaging/services/email-draft.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export async function approveRequestAction(
  approvalId: string,
  decisionData: Record<string, unknown> = {}
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    // Pre-flight: if this is an email_draft_review, verify the linked draft is
    // still approvable before resolving the approval_request.
    // This prevents approving a superseded draft when a newer draft has replaced it.
    const currentApproval = await approvalRepo.getApprovalById(approvalId, ctx.tenantId)
    if (!currentApproval) {
      return { success: false, error: 'Approval request not found' }
    }
    const draftGuard = await emailDraftService.assertDraftIsApprovable(ctx, currentApproval)
    if (draftGuard) {
      return { success: false, error: draftGuard }
    }

    // Resolve the approval_request (permission check + event enqueue inside)
    const approval = await approvalService.approveRequest(ctx, approvalId, decisionData)

    // Post-resolve: sync draft status (action layer is the cross-module coordinator)
    await emailDraftService.syncApprovalDecisionToDraft(ctx, approval, 'approved')

    revalidatePath('/[workspaceSlug]/inbox', 'page')
    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function rejectRequestAction(
  approvalId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)

    // Pre-flight: same guard for rejections — can't reject a superseded draft
    const currentApproval = await approvalRepo.getApprovalById(approvalId, ctx.tenantId)
    if (!currentApproval) {
      return { success: false, error: 'Approval request not found' }
    }
    const draftGuard = await emailDraftService.assertDraftIsApprovable(ctx, currentApproval)
    if (draftGuard) {
      return { success: false, error: draftGuard }
    }

    // Resolve the approval_request
    const approval = await approvalService.rejectRequest(ctx, approvalId, reason)

    // Sync draft status
    await emailDraftService.syncApprovalDecisionToDraft(ctx, approval, 'rejected')

    revalidatePath('/[workspaceSlug]/inbox', 'page')
    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
