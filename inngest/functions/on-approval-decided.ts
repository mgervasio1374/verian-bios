import { inngest } from '@/lib/inngest/client'
import { buildSystemContext } from '@/lib/auth/context'
import * as workflowRunService from '@/modules/workflow/services/workflow-run.service'

interface ApprovalDecidedPayload {
  approvalId: string
  workflowRunId?: string
  tenantId: string
  workspaceId: string
  requestType: string
}

export const onApprovalApproved = inngest.createFunction(
  { id: 'on-approval-approved', name: 'On Approval Approved: Resume Workflow', retries: 2, triggers: [{ event: 'approval.approved' }] },
  async ({ event, step, logger }) => {
    const data = event.data as ApprovalDecidedPayload
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
    if (!data.workflowRunId) return { skipped: true }

    const ctx = buildSystemContext(data.tenantId, data.workspaceId)
    logger.info('Cancelling workflow after rejection', { runId: data.workflowRunId })

    await step.run('cancel-workflow', () =>
      workflowRunService.failWorkflowRun(ctx, data.workflowRunId!, data.reason ?? 'Rejected by user')
    )

    return { cancelled: true, runId: data.workflowRunId }
  }
)
