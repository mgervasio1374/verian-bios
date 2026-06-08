// Verian Agent Bridge — Policy-Check Service (Slice 11)
// Dry-run only. Records policy-review outcomes handed to it by an approved caller.
// Does NOT evaluate policies, run models, execute work, send emails, or route agents.
// Every transition appends an audit event and updates queue status via the repo layer only.

import * as queueRepo from '@/modules/verian-agent-bridge/review-queue/review-queue.repo'
import * as packetRepo from '@/modules/verian-agent-bridge/task-packets/task-packet.repo'
import * as auditService from '@/modules/verian-agent-bridge/audit-ledger/audit-ledger.service'
import {
  ReviewerAuthorizationError,
  assertReviewerIsWorkspaceMember,
  assertActorCanTransitionState,
  assertValidStateTransition,
} from '@/modules/verian-agent-bridge/review-queue/reviewer-authorization'
import {
  QueueItemNotFoundError,
  mapRowAndPacketToQueueItem,
} from '@/modules/verian-agent-bridge/review-queue/review-queue.mapper'
import type { BridgeAuditRequestContext } from '@/modules/verian-agent-bridge/audit-ledger/audit-ledger.service'
import type { VerianBridgeAuditActor } from '@/modules/verian-agent-bridge/audit-ledger/types'
import type { VerianBridgeReviewQueueItem } from '@/modules/verian-agent-bridge/review-queue/types'
import type { Database } from '@/types/database'

type TaskPacketRow = Database['public']['Tables']['bridge_task_packets']['Row']

export type PolicyCheckContext = BridgeAuditRequestContext & {
  actorType: VerianBridgeAuditActor
}

function requireActorUserId(ctx: PolicyCheckContext): string {
  if (!ctx.actorUserId) {
    throw new ReviewerAuthorizationError('actorUserId is required for policy-check transitions')
  }
  return ctx.actorUserId
}

async function requireTaskPacket(
  packetId: string,
  tenantId: string,
  workspaceId: string,
  callerName: string
): Promise<TaskPacketRow> {
  const packet = await packetRepo.getTaskPacketById(packetId, tenantId, workspaceId)
  if (!packet) {
    throw new Error(`${callerName}: task packet ${packetId} not found`)
  }
  return packet
}

// Transitions draft_packet → pending_policy_review.
// actorType system or michael only.
// Does NOT update current_policy_check_status — policy review has not yet completed.
// Appends policy_review_submitted audit event.
export async function submitForPolicyReview(
  queueItemId: string,
  ctx: PolicyCheckContext,
  summary?: string
): Promise<VerianBridgeReviewQueueItem> {
  if (ctx.actorType === 'michael') {
    const actorUserId = requireActorUserId(ctx)
    await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  }
  assertActorCanTransitionState(ctx.actorType, 'draft_packet', 'submit_for_policy_review')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'submit_for_policy_review'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'submitForPolicyReview')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'pending_policy_review' }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'policy_review_submitted',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'pending_policy_review',
      summary: summary ?? 'Packet submitted for policy review',
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}

// Records a clean policy pass. Transitions pending_policy_review → waiting_human_approval.
// Sets current_policy_check_status = 'pass'.
// Appends policy_check_passed audit event.
export async function markPolicyCheckPassed(
  queueItemId: string,
  ctx: PolicyCheckContext,
  summary: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem> {
  if (ctx.actorType === 'michael') {
    const actorUserId = requireActorUserId(ctx)
    await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  }
  assertActorCanTransitionState(ctx.actorType, 'pending_policy_review', 'policy_check_passed')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'policy_check_passed'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'markPolicyCheckPassed')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'waiting_human_approval', policyCheckStatus: 'pass' }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'policy_check_passed',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'waiting_human_approval',
      summary,
      evidence,
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}

// Records a policy warning. Transitions pending_policy_review → waiting_human_approval.
// Sets current_policy_check_status = 'warning'.
// Appends policy_check_warning audit event.
export async function markPolicyCheckWarning(
  queueItemId: string,
  ctx: PolicyCheckContext,
  summary: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem> {
  if (ctx.actorType === 'michael') {
    const actorUserId = requireActorUserId(ctx)
    await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  }
  assertActorCanTransitionState(ctx.actorType, 'pending_policy_review', 'policy_check_warning')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'policy_check_warning'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'markPolicyCheckWarning')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'waiting_human_approval', policyCheckStatus: 'warning' }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'policy_check_warning',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'waiting_human_approval',
      summary,
      evidence,
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}

// Records a policy hard block. Transitions pending_policy_review → blocked_by_policy.
// Sets current_policy_check_status = 'blocked'.
// Appends policy_check_blocked audit event.
export async function markPolicyCheckBlocked(
  queueItemId: string,
  ctx: PolicyCheckContext,
  reason: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem> {
  if (ctx.actorType === 'michael') {
    const actorUserId = requireActorUserId(ctx)
    await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  }
  assertActorCanTransitionState(ctx.actorType, 'pending_policy_review', 'policy_check_blocked')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'policy_check_blocked'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'markPolicyCheckBlocked')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'blocked_by_policy', policyCheckStatus: 'blocked' }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'policy_check_blocked',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'blocked_by_policy',
      summary: reason,
      evidence,
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}

// Records that the policy check requires Codex review.
// Transitions pending_policy_review → waiting_codex_review.
// Sets current_policy_check_status = 'warning'.
// Appends codex_review_required audit event (existing event type — no new DB value needed).
export async function markPolicyCheckRequiresCodex(
  queueItemId: string,
  ctx: PolicyCheckContext,
  reason: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem> {
  if (ctx.actorType === 'michael') {
    const actorUserId = requireActorUserId(ctx)
    await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  }
  assertActorCanTransitionState(ctx.actorType, 'pending_policy_review', 'policy_check_requires_codex')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'policy_check_requires_codex'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'markPolicyCheckRequiresCodex')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'waiting_codex_review', policyCheckStatus: 'warning' }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'codex_review_required',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'waiting_codex_review',
      summary: reason,
      evidence,
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}

// Records that the policy check requires human review.
// Transitions pending_policy_review → waiting_human_approval.
// Sets current_policy_check_status = 'warning'.
// Appends human_approval_requested audit event (existing event type — no new DB value needed).
export async function markPolicyCheckRequiresHuman(
  queueItemId: string,
  ctx: PolicyCheckContext,
  reason: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem> {
  if (ctx.actorType === 'michael') {
    const actorUserId = requireActorUserId(ctx)
    await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  }
  assertActorCanTransitionState(ctx.actorType, 'pending_policy_review', 'policy_check_requires_human')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'policy_check_requires_human'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'markPolicyCheckRequiresHuman')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'waiting_human_approval', policyCheckStatus: 'warning' }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'human_approval_requested',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'waiting_human_approval',
      summary: reason,
      evidence,
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}
