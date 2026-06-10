import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import { getCampaignSequenceStepById } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { getFirstTouchItemForAssignment } from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import { getAssignmentById } from '@/modules/messaging/repositories/campaign-assignment.repo'
import { updateScheduleItemStatus } from '@/modules/campaign-sequence/services/campaign-schedule-item.service'
import type { CampaignScheduleItemRow } from '@/modules/campaign-sequence/types'

export interface ApprovalRoutingCtx {
  tenantId:    string
  workspaceId: string
}

export type RouteDraftReadyItemResult =
  | { outcome: 'queued_for_approval'; approvalRequestId: string }
  | { outcome: 'auto_approved';       approvalRequestId: string }
  | { outcome: 'held' }
  | { outcome: 'skipped';  reason: string }
  | { outcome: 'failed';   reason: string }

// ---------------------------------------------------------------------------
// Pure helpers — no DB, fully unit-testable
// ---------------------------------------------------------------------------

/**
 * An assignment is "gated" when its first-touch item has already passed human review.
 * Steps 2-5 auto-approve only when gated.
 */
export function isAssignmentGated(firstTouchStatus: string | null): boolean {
  return (
    firstTouchStatus === 'approved' ||
    firstTouchStatus === 'scheduled' ||
    firstTouchStatus === 'sent'
  )
}

export function classifyDraftReadyItem(
  stepNumber: number,
  gated: boolean,
  autoApproveFirstTouch = false,
): 'requires_approval' | 'auto_approve' | 'hold' {
  if (stepNumber === 1) return autoApproveFirstTouch ? 'auto_approve' : 'requires_approval'
  return gated ? 'auto_approve' : 'hold'
}

// ---------------------------------------------------------------------------
// Effectful router
// ---------------------------------------------------------------------------

export async function routeDraftReadyItem(
  item: CampaignScheduleItemRow,
  ctx: ApprovalRoutingCtx,
): Promise<RouteDraftReadyItemResult> {
  const { tenantId, workspaceId } = ctx

  // Idempotency guards — skip without touching state
  if (item.status !== 'draft_ready') {
    return { outcome: 'skipped', reason: 'not_draft_ready' }
  }
  if (item.approval_request_id) {
    return { outcome: 'skipped', reason: 'approval_request_already_set' }
  }
  if (!item.email_draft_id) {
    return { outcome: 'skipped', reason: 'no_email_draft_id' }
  }

  try {
    const step = await getCampaignSequenceStepById(
      item.campaign_sequence_step_id,
      tenantId,
      workspaceId,
    )
    if (!step) return { outcome: 'failed', reason: 'step_not_found' }

    if (step.step_number === null || step.step_number === undefined) {
      return { outcome: 'failed', reason: 'step_number_missing' }
    }

    // Resolve gating via first-touch item status (only needed for step >= 2)
    let gated = false
    if (step.step_number !== 1 && item.campaign_assignment_id) {
      const firstTouchItem = await getFirstTouchItemForAssignment(
        item.campaign_assignment_id,
        tenantId,
        workspaceId,
      )
      gated = isAssignmentGated(firstTouchItem?.status ?? null)
    }

    // For step 1: check per-assignment flag to determine if first touch auto-approves
    let autoApproveFirstTouch = false
    if (step.step_number === 1 && item.campaign_assignment_id) {
      const assignment = await getAssignmentById(item.campaign_assignment_id)
      autoApproveFirstTouch = assignment?.auto_approve_first_touch ?? false
    }

    const classification = classifyDraftReadyItem(step.step_number, gated, autoApproveFirstTouch)

    if (classification === 'hold') {
      return { outcome: 'held' }
    }

    if (classification === 'requires_approval') {
      // Create a PENDING approval_request — human resolves via the existing approval workflow
      const approval = await approvalRepo.createApprovalRequest({
        tenantId,
        workspaceId,
        requestType: 'campaign_manual_first_touch',
        subjectType: 'email_draft',
        subjectId:   item.email_draft_id,
        payload: {
          draft_id:                  item.email_draft_id,
          campaign_schedule_item_id: item.id,
          campaign_assignment_id:    item.campaign_assignment_id,
          campaign_sequence_step_id: item.campaign_sequence_step_id,
          step_number:               step.step_number,
          lead_id:                   item.lead_id,
        },
      })

      // Link approval to the draft — draft stays at status 'draft' (NOT marked approved here)
      await emailDraftRepo.linkApprovalToEmailDraft(item.email_draft_id, approval.id)

      // Advance item to awaiting_approval with the linked approval_request_id
      await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'awaiting_approval', {
        approval_request_id: approval.id,
      })

      return { outcome: 'queued_for_approval', approvalRequestId: approval.id }
    }

    // classification === 'auto_approve' (gated, step >= 2)
    // Create AND resolve the approval_request via approvalRepo directly.
    // NOT via approveRequest — no permission check, no event emitted, no first-touch handler triggered.
    const approval = await approvalRepo.createApprovalRequest({
      tenantId,
      workspaceId,
      requestType: 'campaign_auto_send',
      subjectType: 'email_draft',
      subjectId:   item.email_draft_id,
      payload: {
        draft_id:                  item.email_draft_id,
        campaign_schedule_item_id: item.id,
        campaign_assignment_id:    item.campaign_assignment_id,
        campaign_sequence_step_id: item.campaign_sequence_step_id,
        step_number:               step.step_number,
        lead_id:                   item.lead_id,
      },
    })

    const resolveReason = step.step_number === 1 ? 'bulk_preapproved_first_touch' : 'hybrid_auto_send_gated'
    await approvalRepo.resolveApprovalRequest(
      approval.id,
      tenantId,
      null,
      'approved',
      { auto_approved: true, reason: resolveReason },
    )

    await emailDraftRepo.linkApprovalToEmailDraft(item.email_draft_id, approval.id)

    await emailDraftRepo.updateDraftStatus(item.email_draft_id, {
      status:          'approved',
      approvedAt:      new Date().toISOString(),
      approvedBy:      null,
      ifCurrentStatus: 'draft',
    })

    await updateScheduleItemStatus(item.id, tenantId, workspaceId, 'approved', {
      approval_request_id: approval.id,
    })

    return { outcome: 'auto_approved', approvalRequestId: approval.id }

  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown_error'
    return { outcome: 'failed', reason }
  }
}
