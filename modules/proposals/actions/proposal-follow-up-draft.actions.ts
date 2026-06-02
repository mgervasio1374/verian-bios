'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { generateProposalFollowUpDraftForWorkspace } from '@/modules/proposals/services/proposal-follow-up-draft.service'
import type { ActionResult } from '@/modules/crm/actions/company.actions'

export interface GenerateFollowUpDraftActionInput {
  commitmentId?: string
}

export interface GenerateFollowUpDraftActionData {
  commitmentId: string
  draftId: string
  approvalRequestId: string | null
  linkWritten: boolean
  approvalLinked: boolean
  warning?: string
}

// ---------------------------------------------------------------------------
// Generate a follow-up email draft for an open proposal follow-up commitment.
//
// tenantId, workspaceId, and actorUserId are derived from the server-side
// request context — they are never read from client input.
//
// Permission: crm.leads.edit (consistent with Phase 3R mutation controls).
// Audit: handled by the service layer — not called directly here.
//
// This action does NOT:
//   - Send email (no delivery layer call, no email send rows)
//   - Mutate commitment_status
//   - Reference feature flags for sending
//   - Import email delivery, workflow queue, or AI model clients
// ---------------------------------------------------------------------------

export async function generateFollowUpDraftAction(
  input: GenerateFollowUpDraftActionInput,
): Promise<ActionResult<GenerateFollowUpDraftActionData>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.edit')

    const commitmentId = input.commitmentId?.trim() ?? ''
    if (!commitmentId) {
      return { success: false, error: 'commitmentId is required.' }
    }

    const result = await generateProposalFollowUpDraftForWorkspace({
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId,
      commitmentId,
      actorUserId: ctx.userId,
    })

    if (result.ok) {
      return {
        success: true,
        data: {
          commitmentId,
          draftId:           result.draftId,
          approvalRequestId: result.approvalRequestId,
          linkWritten:       result.linkWritten,
          approvalLinked:    result.approvalLinked,
          warning:           result.warning,
        },
      }
    }

    switch (result.error) {
      case 'not_found':
        return { success: false, error: 'Follow-up commitment not found.' }
      case 'read_failed':
        return { success: false, error: 'Failed to read commitment data. Please try again.' }
      case 'commitment_not_open':
        return { success: false, error: 'Follow-up commitment is no longer open.' }
      case 'draft_already_exists':
        return {
          success: false,
          error: result.existingDraftId
            ? `A draft already exists for this commitment (${result.existingDraftId}).`
            : 'A draft already exists for this commitment.',
        }
      case 'lead_not_found':
        return { success: false, error: 'Lead not found for this commitment.' }
      case 'no_contact_linked':
        return { success: false, error: 'No contact linked to this lead.' }
      case 'no_contact_email':
        return { success: false, error: 'Contact has no email address.' }
      case 'contact_do_not_contact':
        return { success: false, error: 'Contact is marked do not contact.' }
      case 'suppressed':
        return { success: false, error: 'Contact email is suppressed.' }
      case 'no_template_found':
        return { success: false, error: 'No follow-up email template found for this commitment.' }
      case 'write_failed':
        return { success: false, error: 'Failed to create follow-up draft.' }
      default:
        return { success: false, error: 'An unexpected error occurred.' }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
