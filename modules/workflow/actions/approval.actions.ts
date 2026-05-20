'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import * as approvalService from '@/modules/workflow/services/approval.service'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailDraftService from '@/modules/messaging/services/email-draft.service'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import { completeRecommendationsForApprovedAction } from '@/modules/intelligence/services/recommendation-completion.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import type { RequestContext } from '@/types/context'

export type DraftDetail = {
  id:         string
  subject:    string
  body_html:  string | null
  body_text:  string | null
  to_email:   string
  to_name:    string | null
  status:     string
  // Email quality / rewrite context (null if no review has run)
  qualityScore:        number | null
  bestVersionScore:    number | null
  bestVersionNumber:   number | null
  bestVersionSubject:  string | null
  bestVersionBody:     string | null
}

export async function getDraftForReviewAction(
  draftId: string
): Promise<ActionResult<DraftDetail>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    const svc      = createSupabaseServiceClient()

    const { data, error } = await svc
      .from('email_drafts')
      .select('id, subject, body_html, body_text, to_email, to_name, status')
      .eq('id', draftId)
      .eq('tenant_id', ctx.tenantId)
      .single()

    if (error || !data) return { success: false, error: 'Draft not found' }

    // Load quality review summary
    const { data: qr } = await svc
      .from('email_quality_reviews')
      .select('overall_score, best_version_score, best_version_number, best_version_id')
      .eq('email_draft_id', draftId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()

    // Load best rewrite version if the review recorded one
    let bestVersionSubject:  string | null = null
    let bestVersionBody:     string | null = null

    if (qr?.best_version_id) {
      const { data: bv } = await svc
        .from('email_draft_versions')
        .select('subject, body_text')
        .eq('id', qr.best_version_id)
        .eq('tenant_id', ctx.tenantId)
        .single()
      if (bv) {
        bestVersionSubject = bv.subject
        bestVersionBody    = bv.body_text
      }
    }

    return {
      success: true,
      data: {
        ...(data as { id: string; subject: string; body_html: string | null; body_text: string | null; to_email: string; to_name: string | null; status: string }),
        qualityScore:       qr ? Math.round(Number(qr.overall_score)) : null,
        bestVersionScore:   qr?.best_version_score != null ? Math.round(Number(qr.best_version_score)) : null,
        bestVersionNumber:  qr?.best_version_number ?? null,
        bestVersionSubject,
        bestVersionBody,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Private: shared approval execution logic ----

async function executeApproval(
  ctx: RequestContext,
  approvalId: string,
  decisionData: Record<string, unknown> = {}
): Promise<void> {
  const currentApproval = await approvalRepo.getApprovalById(approvalId, ctx.tenantId)
  if (!currentApproval) throw new Error('Approval request not found')

  const draftGuard = await emailDraftService.assertDraftIsApprovable(ctx, currentApproval)
  if (draftGuard) throw new Error(draftGuard)

  const approval = await approvalService.approveRequest(ctx, approvalId, decisionData)
  await emailDraftService.syncApprovalDecisionToDraft(ctx, approval, 'approved')

  if (currentApproval.subject_type === 'lead' && currentApproval.subject_id) {
    const draftId = typeof (currentApproval.payload as Record<string, unknown>)?.draft_id === 'string'
      ? (currentApproval.payload as Record<string, unknown>).draft_id as string
      : undefined
    await completeRecommendationsForApprovedAction({
      tenantId:          ctx.tenantId,
      workspaceId:       ctx.workspaceId,
      subjectType:       'lead',
      subjectId:         currentApproval.subject_id,
      leadId:            currentApproval.subject_id,
      reason:            'Email draft approved via workspace action',
      approvalRequestId: currentApproval.id,
      emailDraftId:      draftId,
    }).catch(() => null)
  }
}

// ---- Approve (existing — quick approve without edit) ----

export async function approveRequestAction(
  approvalId: string,
  decisionData: Record<string, unknown> = {}
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    await executeApproval(ctx, approvalId, decisionData)

    revalidatePath('/[workspaceSlug]/inbox', 'page')
    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Approve with edits (inbox drawer) ----

export async function updateDraftAndApproveAction(
  approvalId: string,
  draftId:    string,
  subject:    string,
  bodyText:   string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    // Save edits to the draft before approving (tenant-scoped; guards against sent/deleted drafts)
    const trimmedSubject  = subject.trim()
    const trimmedBodyText = bodyText.trim()

    if (trimmedSubject || trimmedBodyText) {
      const bodyHtml = trimmedBodyText
        ? trimmedBodyText
            .split('\n\n')
            .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
            .join('')
        : null

      await emailDraftRepo.updateEmailDraftContent(draftId, ctx.tenantId, {
        subject:  trimmedSubject  || undefined,
        bodyText: trimmedBodyText || undefined,
        bodyHtml,
      })
    }

    // Then execute the standard approval flow
    await executeApproval(ctx, approvalId)

    revalidatePath('/[workspaceSlug]/inbox', 'page')
    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Reject ----

export async function rejectRequestAction(
  approvalId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)

    const currentApproval = await approvalRepo.getApprovalById(approvalId, ctx.tenantId)
    if (!currentApproval) return { success: false, error: 'Approval request not found' }

    const draftGuard = await emailDraftService.assertDraftIsApprovable(ctx, currentApproval)
    if (draftGuard) return { success: false, error: draftGuard }

    const approval = await approvalService.rejectRequest(ctx, approvalId, reason)
    await emailDraftService.syncApprovalDecisionToDraft(ctx, approval, 'rejected')

    revalidatePath('/[workspaceSlug]/inbox', 'page')
    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
