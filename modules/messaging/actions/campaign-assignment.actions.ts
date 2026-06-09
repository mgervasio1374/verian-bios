'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import type { ActionResult } from '@/modules/crm/actions/company.actions'
import { ASSIGNMENT_SOURCE } from '@/modules/messaging/types/campaign-assignment.types'
import {
  createCampaignAssignment,
  approveProposedAssignment,
  rejectProposedAssignment,
  retireCampaignAssignment,
} from '@/modules/messaging/services/campaign-assignment.service'
import { getAssignmentById } from '@/modules/messaging/repositories/campaign-assignment.repo'
import { stopAssignmentSchedule } from '@/modules/campaign-sequence/services/campaign-stop.service'

export async function createManualAssignmentAction(
  leadId:              string,
  campaignType:        string,
  campaignAssetId?:    string,
  assignmentReason?:   string,
  campaignSequenceId?: string,
): Promise<ActionResult<{ assignmentId: string }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!leadId) return { success: false, error: 'Lead ID is required.' }
    if (!campaignType) return { success: false, error: 'Campaign type is required.' }

    const result = await createCampaignAssignment({
      tenantId:           ctx.tenantId,
      workspaceId:        ctx.workspaceId,
      leadId,
      campaignType,
      campaignAssetId:    campaignAssetId || undefined,
      campaignSequenceId: campaignSequenceId || undefined,
      assignmentSource:   ASSIGNMENT_SOURCE.MANUAL,
      assignedByUserId:   ctx.userId === 'system' ? undefined : ctx.userId,
      assignmentReason:   assignmentReason || undefined,
    })

    if (!result.ok) return { success: false, error: result.reason }

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: { assignmentId: result.assignmentId } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function approveProposedAssignmentAction(
  assignmentId: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!assignmentId) return { success: false, error: 'Assignment ID is required.' }

    const result = await approveProposedAssignment(
      assignmentId,
      ctx.userId === 'system' ? 'system' : ctx.userId
    )

    if (!result.ok) return { success: false, error: result.reason ?? 'Approval failed.' }

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function rejectProposedAssignmentAction(
  assignmentId: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!assignmentId) return { success: false, error: 'Assignment ID is required.' }

    const result = await rejectProposedAssignment(assignmentId)

    if (!result.ok) return { success: false, error: result.reason ?? 'Rejection failed.' }

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function stopCampaignSequenceAction(
  assignmentId: string
): Promise<ActionResult<{ stopped: number }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!assignmentId) return { success: false, error: 'Assignment ID is required.' }

    const assignment = await getAssignmentById(assignmentId)
    if (!assignment) return { success: false, error: 'Assignment not found.' }

    const { stopped } = await stopAssignmentSchedule(
      assignmentId,
      assignment.tenant_id,
      assignment.workspace_id,
      'manual',
    )

    // Best-effort retire — if assignment isn't assigned/paused, skip gracefully
    const retireResult = await retireCampaignAssignment(assignmentId)
    if (!retireResult.ok) {
      console.warn('[stopCampaignSequenceAction] retire skipped:', retireResult.reason)
    }

    revalidatePath('/[workspaceSlug]/leads/[id]', 'page')
    return { success: true, data: { stopped } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function retireCampaignAssignmentAction(
  assignmentId: string,
  workspaceSlug: string
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.leads.view')

    if (!assignmentId) return { success: false, error: 'Assignment ID is required.' }

    const result = await retireCampaignAssignment(assignmentId)

    if (!result.ok) return { success: false, error: result.reason ?? 'Retire failed.' }

    revalidatePath(`/${workspaceSlug}/leads/[id]`, 'page')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
