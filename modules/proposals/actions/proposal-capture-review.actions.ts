'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import {
  listProposalCapturesForReview,
  reviewProposalCapture,
} from '@/modules/proposals/services/proposal-capture-review.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface ReviewProposalCaptureActionInput {
  captureId: string
  action: 'match' | 'dismiss'
  leadId?: string | null
  contactId?: string | null
  reviewNotes?: string | null
}

export async function listProposalCapturesForReviewAction(): Promise<ActionResult<{ captures: unknown[] }>> {
  try {
    const supabase = await createSupabaseServerClient()
    // tenantId and workspaceId come from server-side context — never from client input.
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    const result = await listProposalCapturesForReview(ctx.tenantId, ctx.workspaceId)
    if (!result.ok) {
      return { success: false, error: result.error }
    }
    return { success: true, data: { captures: result.captures } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function reviewProposalCaptureAction(
  input: ReviewProposalCaptureActionInput
): Promise<ActionResult<{ captureId: string; status: 'matched' | 'dismissed' }>> {
  try {
    const supabase = await createSupabaseServerClient()
    // tenantId and workspaceId come from server-side context — never from client input.
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!input.captureId) {
      return { success: false, error: 'invalid_input: captureId is required' }
    }
    if (!input.action) {
      return { success: false, error: 'invalid_input: action is required' }
    }

    const result = await reviewProposalCapture(ctx.tenantId, ctx.workspaceId, ctx.userId, {
      captureId:   input.captureId,
      action:      input.action,
      leadId:      input.leadId ?? null,
      contactId:   input.contactId ?? null,
      reviewNotes: input.reviewNotes ?? null,
    })

    if (!result.ok) {
      return { success: false, error: result.error }
    }
    return { success: true, data: { captureId: result.captureId, status: result.status } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
