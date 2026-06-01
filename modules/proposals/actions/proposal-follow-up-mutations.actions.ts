'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { completeFollowUpCommitmentForWorkspace } from '@/modules/proposals/services/proposal-follow-up-mutations.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface CompleteFollowUpCommitmentActionInput {
  commitmentId?: string
  completionNotes?: string
}

export interface CompleteFollowUpCommitmentActionData {
  commitmentId: string
  status: 'completed'
}

// ---------------------------------------------------------------------------
// Complete a follow-up commitment.
//
// tenantId, workspaceId, and actorUserId are derived from the server-side
// request context — they are never read from client input.
//
// Permission: crm.leads.edit (same permission used for all Phase 3R mutations).
// Audit: handled by the service layer — do not call recordActivityEvent here.
// ---------------------------------------------------------------------------

export async function completeFollowUpCommitmentAction(
  input: CompleteFollowUpCommitmentActionInput,
): Promise<ActionResult<CompleteFollowUpCommitmentActionData>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.edit')

    const commitmentId = input.commitmentId?.trim() ?? ''
    if (!commitmentId) {
      return { success: false, error: 'commitmentId is required.' }
    }

    const rawNotes = input.completionNotes?.trim()
    const completionNotes = rawNotes || undefined

    const result = await completeFollowUpCommitmentForWorkspace(
      ctx.tenantId,
      ctx.workspaceId,
      commitmentId,
      ctx.userId,
      completionNotes,
    )

    if (result.ok) {
      return {
        success: true,
        data: { commitmentId: result.commitment.id, status: 'completed' },
      }
    }

    switch (result.error) {
      case 'not_found':
        return { success: false, error: 'Follow-up commitment not found.' }
      case 'not_open':
        return { success: false, error: 'Follow-up commitment is no longer open.' }
      case 'write_failed':
        return { success: false, error: 'Failed to complete follow-up commitment.' }
      case 'audit_failed':
        return {
          success: false,
          error: 'Follow-up commitment completed but audit logging failed.',
        }
      default:
        return { success: false, error: 'An unexpected error occurred.' }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
