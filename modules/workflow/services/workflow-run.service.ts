import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import type { RequestContext } from '@/types/context'
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import { WORKFLOW_FAILURE_TYPE } from '@/modules/intelligence/structured-errors/structured-error.types'

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
  ctx: RequestContext,
  runId: string,
  errorMessage: string
): Promise<void> {
  await approvalRepo.updateWorkflowRunStatus(runId, 'failed', { errorMessage })
  createStructuredError({
    tenantId:      ctx.tenantId,
    workspaceId:   ctx.workspaceId ?? null,
    failureType:   WORKFLOW_FAILURE_TYPE.WORKFLOW_RUN_FAILED,
    severity:      'error',
    module:        'workflow_runs',
    errorMessage,
    workflowRunId: runId,
  }).catch(() => {})
}
