import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import { enqueueEvent } from './event-dispatch.service'
import { requirePermission } from '@/lib/auth/permissions'
import type { RequestContext } from '@/types/context'

export async function createApprovalRequest(
  ctx: RequestContext,
  opts: {
    workflowRunId?: string
    jobExecutionId?: string
    requestType: string
    assigneeId?: string
    subjectType?: string
    subjectId?: string
    payload: Record<string, unknown>
    expiresInHours?: number
  }
) {
  const expiresAt = opts.expiresInHours
    ? new Date(Date.now() + opts.expiresInHours * 3600 * 1000).toISOString()
    : undefined

  return approvalRepo.createApprovalRequest({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    ...opts,
    expiresAt,
  })
}

export async function approveRequest(
  ctx: RequestContext,
  approvalId: string,
  decisionData: Record<string, unknown> = {}
) {
  requirePermission(ctx, 'workflow.approve_requests')

  const approval = await approvalRepo.resolveApprovalRequest(
    approvalId, ctx.tenantId, ctx.userId, 'approved', decisionData
  )

  await enqueueEvent(ctx, 'approval.approved', {
    approvalId: approval.id,
    workflowRunId: approval.workflow_run_id,
    requestType: approval.request_type,
    approvedBy: ctx.userId,
  })

  return approval
}

export async function rejectRequest(
  ctx: RequestContext,
  approvalId: string,
  reason: string
) {
  requirePermission(ctx, 'workflow.approve_requests')

  const approval = await approvalRepo.resolveApprovalRequest(
    approvalId, ctx.tenantId, ctx.userId, 'rejected', { reason }
  )

  await enqueueEvent(ctx, 'approval.rejected', {
    approvalId: approval.id,
    workflowRunId: approval.workflow_run_id,
    requestType: approval.request_type,
    rejectedBy: ctx.userId,
    reason,
  })

  return approval
}

export async function listPendingApprovals(ctx: RequestContext) {
  requirePermission(ctx, 'workflow.approve_requests')
  return approvalRepo.listPendingApprovals(ctx.tenantId, ctx.workspaceId)
}
