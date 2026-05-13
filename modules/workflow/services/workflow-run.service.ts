import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import type { RequestContext } from '@/types/context'

export async function createWorkflowRun(
  ctx: RequestContext,
  opts: {
    workflowConfigId?: string
    triggerEventId?: string
    subjectType?: string
    subjectId?: string
    context?: Record<string, unknown>
  }
) {
  return approvalRepo.createWorkflowRun({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    ...opts,
  })
}

export async function completeWorkflowRun(
  _ctx: RequestContext,
  runId: string
): Promise<void> {
  await approvalRepo.updateWorkflowRunStatus(runId, 'completed')
}

export async function failWorkflowRun(
  _ctx: RequestContext,
  runId: string,
  errorMessage: string
): Promise<void> {
  await approvalRepo.updateWorkflowRunStatus(runId, 'failed', { errorMessage })
}
