import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import { getCampaignScheduleItemById } from '@/modules/campaign-sequence/repositories/campaign-schedule-item.repo'
import { updateScheduleItemStatus } from '@/modules/campaign-sequence/services/campaign-schedule-item.service'

/**
 * Called when a human approves a 'campaign_manual_first_touch' approval_request.
 * Sets the linked email_draft to 'approved' and advances the schedule item to 'approved'.
 * This gates the assignment — downstream held steps (2-5) will auto-approve on the next tick.
 * Does NOT send anything; does not call the email-send path.
 */
export async function handleCampaignFirstTouchApproved(
  approvalId: string,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  const approval = await approvalRepo.getApprovalById(approvalId, tenantId)
  if (!approval) {
    throw new Error(`handleCampaignFirstTouchApproved: approval not found: ${approvalId}`)
  }

  const payload = (approval.payload ?? {}) as Record<string, unknown>
  const scheduleItemId = payload.campaign_schedule_item_id as string | undefined
  const draftId        = payload.draft_id                  as string | undefined

  if (!scheduleItemId || !draftId) {
    throw new Error(
      `handleCampaignFirstTouchApproved: missing payload fields on approval ${approvalId}`,
    )
  }

  // Idempotency: item may already be 'approved' on retry
  const item = await getCampaignScheduleItemById(scheduleItemId, tenantId, workspaceId)
  if (!item) {
    throw new Error(`handleCampaignFirstTouchApproved: schedule item not found: ${scheduleItemId}`)
  }
  if (item.status === 'approved') return

  // Mark draft 'approved' — the linked approval_request is now 'approved', satisfying the double-gate
  await emailDraftRepo.updateDraftStatus(draftId, {
    status:          'approved',
    approvedAt:      new Date().toISOString(),
    approvedBy:      null,
    ifCurrentStatus: 'draft',
  })

  // Advance schedule item awaiting_approval -> approved
  await updateScheduleItemStatus(scheduleItemId, tenantId, workspaceId, 'approved')
}

/**
 * Called when a human rejects a 'campaign_manual_first_touch' approval_request.
 * Advances the schedule item awaiting_approval -> skipped; leaves the draft unchanged.
 * Downstream held steps (2-5) remain in 'draft_ready' — they never gate since the first touch
 * was rejected. A later slice will sweep them to 'skipped'.
 */
export async function handleCampaignFirstTouchRejected(
  approvalId: string,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  const approval = await approvalRepo.getApprovalById(approvalId, tenantId)
  if (!approval) {
    throw new Error(`handleCampaignFirstTouchRejected: approval not found: ${approvalId}`)
  }

  const payload = (approval.payload ?? {}) as Record<string, unknown>
  const scheduleItemId = payload.campaign_schedule_item_id as string | undefined

  if (!scheduleItemId) {
    throw new Error(
      `handleCampaignFirstTouchRejected: missing campaign_schedule_item_id on approval ${approvalId}`,
    )
  }

  // Idempotency: item may already be 'skipped' on retry
  const item = await getCampaignScheduleItemById(scheduleItemId, tenantId, workspaceId)
  if (!item) {
    throw new Error(`handleCampaignFirstTouchRejected: schedule item not found: ${scheduleItemId}`)
  }
  if (item.status === 'skipped') return

  await updateScheduleItemStatus(scheduleItemId, tenantId, workspaceId, 'skipped')
}
