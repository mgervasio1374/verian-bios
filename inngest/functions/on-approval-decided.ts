import { inngest } from '@/lib/inngest/client'
import { buildSystemContext } from '@/lib/auth/context'
import * as workflowRunService from '@/modules/workflow/services/workflow-run.service'
import {
  handleCampaignFirstTouchApproved,
  handleCampaignFirstTouchRejected,
} from '@/modules/campaign-sequence/services/campaign-approval-resolution.service'

interface ApprovalDecidedPayload {
  approvalId:    string
  workflowRunId?: string
  tenantId:      string
  workspaceId:   string
  requestType:   string
}

export const onApprovalApproved = inngest.createFunction(
  { id: 'on-approval-approved', name: 'On Approval Approved: Resume Workflow', retries: 2, triggers: [{ event: 'approval.approved' }] },
  async ({ event, step, logger }) => {
    const data = event.data as ApprovalDecidedPayload

    // Manual Campaign Mode: first-touch approval side effects
    if (data.requestType === 'campaign_manual_first_touch') {
      await step.run('campaign-first-touch-approved', () =>
        handleCampaignFirstTouchApproved(data.approvalId, data.tenantId, data.workspaceId)
      )
      return { campaignFirstTouchApproved: true, approvalId: data.approvalId }
    }

    // Existing path: resume a paused workflow run
    if (!data.workflowRunId) return { skipped: true }

    const ctx = buildSystemContext(data.tenantId, data.workspaceId)
    logger.info('Resuming workflow after approval', { runId: data.workflowRunId })

    await step.run('resume-workflow', () =>
      workflowRunService.completeWorkflowRun(ctx, data.workflowRunId!)
    )

    return { resumed: true, runId: data.workflowRunId }
  }
)

export const onApprovalRejected = inngest.createFunction(
  { id: 'on-approval-rejected', name: 'On Approval Rejected: Cancel Workflow', retries: 2, triggers: [{ event: 'approval.rejected' }] },
  async ({ event, step, logger }) => {
    const data = event.data as ApprovalDecidedPayload & { reason?: string }

    // Manual Campaign Mode: first-touch rejection side effects
    if (data.requestType === 'campaign_manual_first_touch') {
      await step.run('campaign-first-touch-rejected', () =>
        handleCampaignFirstTouchRejected(data.approvalId, data.tenantId, data.workspaceId)
      )
      return { campaignFirstTouchRejected: true, approvalId: data.approvalId }
    }

    // Existing path: cancel a paused workflow run
    if (!data.workflowRunId) return { skipped: true }

    const ctx = buildSystemContext(data.tenantId, data.workspaceId)
    logger.info('Cancelling workflow after rejection', { runId: data.workflowRunId })

    await step.run('cancel-workflow', () =>
      workflowRunService.failWorkflowRun(ctx, data.workflowRunId!, data.reason ?? 'Rejected by user')
    )

    return { cancelled: true, runId: data.workflowRunId }
  }
)
