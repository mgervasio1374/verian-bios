import type { Database } from '@/types/database'
import type { VerianBridgeReviewQueueItem } from '@/modules/verian-agent-bridge/review-queue/types'

type TaskPacketRow = Database['public']['Tables']['bridge_task_packets']['Row']
type ReviewQueueItemRow = Database['public']['Tables']['bridge_review_queue_items']['Row']

export class QueueItemNotFoundError extends Error {
  constructor(id: string) {
    super(`QueueItemNotFoundError: queue item ${id} not found`)
    this.name = 'QueueItemNotFoundError'
  }
}

// Builds a VerianBridgeReviewQueueItem from a queue row + the associated task packet row.
// All metadata fields (policyId, agentId, etc.) are sourced from the packet — never placeholder values.
export function mapRowAndPacketToQueueItem(
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
