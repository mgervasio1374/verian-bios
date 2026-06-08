// Verian Agent Bridge — Bridge Intake Orchestration Service (Slice 12)
// Dry-run only. Ordered, non-atomic intake flow:
//   dry-run build → actorUserId preflight → queue submission → policy review submission
// The flow is NOT atomic and NOT transactional.
// No direct repo imports. No direct audit writes. No model calls. No sending.
// dryRunOnly: true is enforced on every submission produced.

import {
  buildVerianBridgeDryRunPacket,
} from '@/modules/verian-agent-bridge/dry-run.service'
import type {
  VerianBridgeDryRunInput,
  VerianBridgeDryRunResult,
} from '@/modules/verian-agent-bridge/dry-run.service'
import {
  submitPacketToQueue,
} from '@/modules/verian-agent-bridge/review-queue/review-queue.service'
import type {
  BridgeRequestContext,
} from '@/modules/verian-agent-bridge/review-queue/review-queue.service'
import {
  submitForPolicyReview,
} from '@/modules/verian-agent-bridge/policy-check/policy-check.service'
import type {
  VerianBridgeReviewQueueItem,
  VerianBridgeReviewQueueSubmission,
} from '@/modules/verian-agent-bridge/review-queue/types'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type BridgeIntakeContext = {
  tenantId: string
  workspaceId: string
  actorUserId?: string
  actorType: 'michael' | 'system'
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

type BridgeIntakeBlockedResult = {
  readonly status: 'blocked'
  readonly reason: string
  readonly dryRunResult: VerianBridgeDryRunResult
}

type BridgeIntakeSubmittedResult = {
  readonly status: 'submitted'
  readonly queueItem: VerianBridgeReviewQueueItem
  readonly dryRunResult: VerianBridgeDryRunResult
  readonly dryRunOnly: true
}

export type BridgeIntakeResult = BridgeIntakeBlockedResult | BridgeIntakeSubmittedResult

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function submitBridgeRequest(
  input: VerianBridgeDryRunInput,
  ctx: BridgeIntakeContext,
  summary?: string
): Promise<BridgeIntakeResult> {
  // Step 1: Build dry-run packet — synchronous, no DB, no model calls
  const dryRunResult = buildVerianBridgeDryRunPacket(input)

  // Step 2: Block immediately if dry-run returned blocked — no DB writes
  if (dryRunResult.status === 'blocked') {
    return {
      status: 'blocked',
      reason: dryRunResult.summary,
      dryRunResult,
    }
  }

  // Step 3: actorUserId preflight — fires before any DB write [step 1b in design §6]
  if (ctx.actorType === 'michael' && !ctx.actorUserId) {
    return {
      status: 'blocked',
      reason: 'actorUserId is required for michael intake submissions',
      dryRunResult,
    }
  }

  // Step 4: Defensive guard — taskPacket must be present after packet_created
  if (!dryRunResult.taskPacket) {
    return {
      status: 'blocked',
      reason: 'buildVerianBridgeDryRunPacket returned packet_created but taskPacket is absent',
      dryRunResult,
    }
  }

  const packet = dryRunResult.taskPacket
  const title = `${packet.taskId} — ${packet.taskType}`

  // BridgeIntakeContext.actorType ('michael' | 'system') is a subset of BridgeRequestContext —
  // direct assignment is type-safe; PolicyCheckContext is structurally identical to BridgeRequestContext
  const downstreamCtx: BridgeRequestContext = {
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    actorType: ctx.actorType,
  }

  const submission: VerianBridgeReviewQueueSubmission = {
    packet,
    title,
    submittedBy: ctx.actorType,
    submittedAt: new Date().toISOString(),
    initialState: 'draft_packet',
    dryRunOnly: true,
  }

  // Step 8: First DB write — inserts task packet + queue item, appends packet_created audit event
  // If this throws, error propagates — no cleanup needed
  const initialQueueItem = await submitPacketToQueue(submission, downstreamCtx)

  // Step 9: Second DB write — updates queue item to pending_policy_review,
  // appends policy_review_submitted audit event.
  // If this throws after step 8 succeeded: error propagates unchanged.
  // Queue item remains in draft_packet — a valid, recoverable partial-success state.
  const queueItem = await submitForPolicyReview(
    initialQueueItem.queueItemId,
    downstreamCtx,
    summary
  )

  return {
    status: 'submitted',
    queueItem,
    dryRunResult,
    dryRunOnly: true,
  }
}
