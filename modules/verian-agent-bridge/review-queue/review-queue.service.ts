import * as queueRepo from '@/modules/verian-agent-bridge/review-queue/review-queue.repo'
import * as packetRepo from '@/modules/verian-agent-bridge/task-packets/task-packet.repo'
import * as auditService from '@/modules/verian-agent-bridge/audit-ledger/audit-ledger.service'
import {
  ReviewerAuthorizationError,
  assertReviewerIsWorkspaceMember,
  assertActorCanTransitionState,
  assertValidStateTransition,
} from '@/modules/verian-agent-bridge/review-queue/reviewer-authorization'
import type { Database } from '@/types/database'
import type {
  VerianBridgeReviewQueueItem,
  VerianBridgeReviewQueueSubmission,
  VerianBridgeManualHandoffApproval,
} from '@/modules/verian-agent-bridge/review-queue/types'
import type { BridgeAuditRequestContext } from '@/modules/verian-agent-bridge/audit-ledger/audit-ledger.service'

type TaskPacketRow = Database['public']['Tables']['bridge_task_packets']['Row']
type ReviewQueueItemRow = Database['public']['Tables']['bridge_review_queue_items']['Row']

export type BridgeRequestContext = BridgeAuditRequestContext & {
  actorType: 'michael' | 'system' | 'agent' | 'codex'
}

export type ListQueueItemsOptions = {
  status?: string
  packetId?: string
  assignedReviewerId?: string
  limit?: number
}

export class QueueItemNotFoundError extends Error {
  constructor(id: string) {
    super(`QueueItemNotFoundError: queue item ${id} not found`)
    this.name = 'QueueItemNotFoundError'
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidStateTransitionError'
  }
}

// Builds a VerianBridgeReviewQueueItem from a queue row + the associated task packet row.
// All metadata fields (policyId, agentId, etc.) are sourced from the packet — never placeholder values.
function mapRowAndPacketToQueueItem(
  row: ReviewQueueItemRow,
  packet: TaskPacketRow
): VerianBridgeReviewQueueItem {
  return {
    queueItemId: row.id,
    packetId: row.packet_id,
    taskId: row.task_id,
    goalId: packet.goal_id ?? undefined,
    sliceId: packet.slice_id ?? undefined,
    title: row.title,
    status: row.status as VerianBridgeReviewQueueItem['status'],
    policyCheckStatus: row.current_policy_check_status as VerianBridgeReviewQueueItem['policyCheckStatus'],
    requiresHumanApproval: row.requires_human_approval,
    requiresCodexReview: row.requires_codex_review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dryRunOnly: true,
    policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
    agentId: packet.agent_id as VerianBridgeReviewQueueItem['agentId'],
    agentCategory: packet.agent_category as VerianBridgeReviewQueueItem['agentCategory'],
    recommendedModel: packet.recommended_model as VerianBridgeReviewQueueItem['recommendedModel'],
    riskLevel: packet.risk_level as VerianBridgeReviewQueueItem['riskLevel'],
    requiredEvidence: Array.isArray(packet.required_evidence)
      ? (packet.required_evidence as unknown as string[])
      : [],
    stopConditions: Array.isArray(packet.stop_conditions)
      ? (packet.stop_conditions as unknown as string[])
      : [],
    blockedActions: Array.isArray(packet.blocked_actions)
      ? (packet.blocked_actions as unknown as string[])
      : [],
  }
}

// Requires actorUserId to be present; throws ReviewerAuthorizationError if absent.
// Required for all human (michael) actor transitions.
function requireActorUserId(ctx: BridgeRequestContext): string {
  if (!ctx.actorUserId) {
    throw new ReviewerAuthorizationError('actorUserId is required for human approval transitions')
  }
  return ctx.actorUserId
}

// Loads a task packet and throws if not found — used to get the true policy_id for audit events.
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

// Submits a dry-run packet to the review queue.
// Inserts a task packet row and a queue item row.
// Appends a packet_created audit event.
// submission.dryRunOnly and submission.packet.dryRunOnly must both be true.
export async function submitPacketToQueue(
  submission: VerianBridgeReviewQueueSubmission,
  ctx: BridgeRequestContext
): Promise<VerianBridgeReviewQueueItem> {
  if (submission.dryRunOnly !== true) {
    throw new Error('submitPacketToQueue: submission.dryRunOnly must be true')
  }
  if (submission.packet.dryRunOnly !== true) {
    throw new Error('submitPacketToQueue: submission.packet.dryRunOnly must be true')
  }

  const packet = submission.packet

  const packetRow = await packetRepo.insertTaskPacket({
    task_id: packet.taskId,
    goal_id: packet.goalId ?? null,
    slice_id: packet.sliceId ?? null,
    policy_id: packet.policyId,
    agent_id: packet.intendedAgent,
    agent_category: packet.agentCategory,
    recommended_model: packet.recommendedModel,
    risk_level: packet.riskLevel,
    policy_check_status: packet.policyCheckStatus,
    prompt_summary: packet.promptText.slice(0, 500),
    required_evidence: packet.requiredEvidence as unknown as string[],
    stop_conditions: packet.stopConditions as unknown as string[],
    blocked_actions: packet.blockedActions as unknown as string[],
    packet_payload: packet as unknown as import('@/types/database').Database['public']['Tables']['bridge_task_packets']['Insert']['packet_payload'],
    dry_run_only: true,
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    created_by: ctx.actorUserId ?? null,
  })

  const queueRow = await queueRepo.insertReviewQueueItem({
    packet_id: packetRow.id,
    task_id: packet.taskId,
    title: submission.title,
    status: submission.initialState,
    current_policy_check_status: packet.policyCheckStatus,
    requires_human_approval: packet.requiresHumanApproval,
    requires_codex_review: packet.requiresCodexReview,
    dry_run_only: true,
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
  })

  await auditService.appendAuditEvent(
    {
      eventType: 'packet_created',
      actor: ctx.actorType,
      taskId: packet.taskId,
      packetId: packetRow.id,
      queueItemId: queueRow.id,
      policyId: packet.policyId,
      nextState: submission.initialState,
      summary: `Packet submitted to review queue with initial state '${submission.initialState}'`,
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(queueRow, packetRow)
}

export async function getQueueItem(
  queueItemId: string,
  ctx: BridgeRequestContext
): Promise<VerianBridgeReviewQueueItem | null> {
  const row = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!row) return null
  const packet = await packetRepo.getTaskPacketById(row.packet_id, ctx.tenantId, ctx.workspaceId)
  if (!packet) return null
  return mapRowAndPacketToQueueItem(row, packet)
}

export async function listQueueItems(
  opts: ListQueueItemsOptions,
  ctx: BridgeRequestContext
): Promise<VerianBridgeReviewQueueItem[]> {
  const rows = await queueRepo.listReviewQueueItems({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    status: opts.status,
    packetId: opts.packetId,
    assignedReviewerId: opts.assignedReviewerId,
    limit: opts.limit,
  })
  if (rows.length === 0) return []

  const packetIds = [...new Set(rows.map(r => r.packet_id))]
  const packets = await packetRepo.listTaskPacketsByIds(packetIds, ctx.tenantId, ctx.workspaceId)
  const packetMap = new Map(packets.map(p => [p.id, p]))

  return rows.map(row => {
    const packet = packetMap.get(row.packet_id)
    if (!packet) throw new Error(`listQueueItems: task packet ${row.packet_id} not found`)
    return mapRowAndPacketToQueueItem(row, packet)
  })
}

// Approves a queue item for manual handoff.
// actorUserId is required — michael is always a workspace member.
// Reviewer authorization and state machine checks run before any write.
// Fetches task packet to use its policy_id (not current_policy_check_status) for audit events.
// Returns VerianBridgeManualHandoffApproval with executionAuthorized: false.
// executionAuthorized: false does NOT authorize execution of any kind.
export async function approveForManualHandoff(
  queueItemId: string,
  ctx: BridgeRequestContext,
  approvalSummary: string
): Promise<VerianBridgeManualHandoffApproval> {
  const actorUserId = requireActorUserId(ctx)
  await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  assertActorCanTransitionState(ctx.actorType, 'waiting_human_approval', 'approve_for_manual_handoff')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'approve_for_manual_handoff'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'approveForManualHandoff')

  await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'approved_for_manual_handoff', lastDecisionSummary: approvalSummary }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'human_approved',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'approved_for_manual_handoff',
      summary: approvalSummary,
      dryRunOnly: true,
    },
    ctx
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'manual_handoff_prepared',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: 'approved_for_manual_handoff',
      nextState: 'approved_for_manual_handoff',
      summary: 'Packet prepared for manual handoff. Execution is NOT authorized.',
      dryRunOnly: true,
    },
    ctx
  )

  return {
    queueItemId,
    approvedBy: 'michael',
    approvedAt: new Date().toISOString(),
    approvalSummary,
    codexReviewLinked: current.requires_codex_review,
    executionAuthorized: false,
    dryRunOnly: true,
  }
}

// Denies a queue item.
// actorUserId is required. Reviewer authorization and state machine checks run first.
export async function denyQueueItem(
  queueItemId: string,
  ctx: BridgeRequestContext,
  reason: string
): Promise<VerianBridgeReviewQueueItem> {
  const actorUserId = requireActorUserId(ctx)
  await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  assertActorCanTransitionState(ctx.actorType, 'waiting_human_approval', 'deny')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'deny'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'denyQueueItem')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'denied', lastDecisionSummary: reason }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'human_denied',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'denied',
      summary: reason,
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}

// Requests a revision of a queue item.
// actorUserId is required. Reviewer authorization and state machine checks run first.
export async function requestRevision(
  queueItemId: string,
  ctx: BridgeRequestContext,
  reason: string
): Promise<VerianBridgeReviewQueueItem> {
  const actorUserId = requireActorUserId(ctx)
  await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  assertActorCanTransitionState(ctx.actorType, 'waiting_human_approval', 'request_revision')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'request_revision'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'requestRevision')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'revision_requested', lastDecisionSummary: reason }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'revision_requested',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'revision_requested',
      summary: reason,
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}

// Records receipt of a Codex review artifact; transitions to waiting_human_approval.
// actorUserId required when actorType is michael.
export async function markCodexReviewReceived(
  queueItemId: string,
  codexReviewId: string,
  ctx: BridgeRequestContext
): Promise<VerianBridgeReviewQueueItem> {
  if (ctx.actorType === 'michael') {
    const actorUserId = requireActorUserId(ctx)
    await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  }
  assertActorCanTransitionState(ctx.actorType, 'waiting_codex_review', 'mark_codex_review_received')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'mark_codex_review_received'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'markCodexReviewReceived')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'waiting_human_approval' }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'codex_review_received',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'waiting_human_approval',
      summary: `Codex review artifact ${codexReviewId} received; moved to waiting_human_approval`,
      evidence: [codexReviewId],
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}

// Archives a queue item. Items must be archived, never deleted.
// actorUserId required when actorType is michael.
export async function archiveQueueItem(
  queueItemId: string,
  ctx: BridgeRequestContext
): Promise<VerianBridgeReviewQueueItem> {
  if (ctx.actorType === 'michael') {
    const actorUserId = requireActorUserId(ctx)
    await assertReviewerIsWorkspaceMember(actorUserId, ctx.workspaceId, ctx.tenantId)
  }
  assertActorCanTransitionState(ctx.actorType, 'approved_for_manual_handoff', 'archive')

  const current = await queueRepo.getReviewQueueItemById(queueItemId, ctx.tenantId, ctx.workspaceId)
  if (!current) throw new QueueItemNotFoundError(queueItemId)

  assertValidStateTransition(
    current.status as VerianBridgeReviewQueueItem['status'],
    'archive'
  )

  const packet = await requireTaskPacket(current.packet_id, ctx.tenantId, ctx.workspaceId, 'archiveQueueItem')

  const updated = await queueRepo.updateReviewQueueItemStatus(
    queueItemId, ctx.tenantId, ctx.workspaceId,
    current.status,
    { status: 'archived' }
  )

  await auditService.appendAuditEvent(
    {
      eventType: 'packet_archived',
      actor: ctx.actorType,
      taskId: current.task_id,
      packetId: current.packet_id,
      queueItemId,
      policyId: packet.policy_id as VerianBridgeReviewQueueItem['policyId'],
      previousState: current.status as VerianBridgeReviewQueueItem['status'],
      nextState: 'archived',
      summary: 'Queue item archived',
      dryRunOnly: true,
    },
    ctx
  )

  return mapRowAndPacketToQueueItem(updated, packet)
}
