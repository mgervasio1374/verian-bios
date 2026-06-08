import * as auditRepo from '@/modules/verian-agent-bridge/audit-ledger/audit-ledger.repo'
import type {
  VerianBridgeAuditRecord,
  VerianBridgeAuditAppendRequest,
} from '@/modules/verian-agent-bridge/audit-ledger/types'

export type BridgeAuditRequestContext = {
  tenantId: string
  workspaceId: string
  actorUserId?: string
}

function mapRowToRecord(row: Awaited<ReturnType<typeof auditRepo.appendAuditEvent>>): VerianBridgeAuditRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    packetId: row.packet_id,
    queueItemId: row.queue_item_id ?? undefined,
    policyId: row.policy_id as VerianBridgeAuditRecord['policyId'],
    eventType: row.event_type as VerianBridgeAuditRecord['eventType'],
    actor: row.actor_type as VerianBridgeAuditRecord['actor'],
    previousState: (row.previous_state ?? undefined) as VerianBridgeAuditRecord['previousState'],
    nextState: (row.next_state ?? undefined) as VerianBridgeAuditRecord['nextState'],
    summary: row.summary,
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : undefined,
    promptSummary: row.prompt_summary ?? undefined,
    promptHash: row.prompt_hash ?? undefined,
    createdAt: row.created_at,
    dryRunOnly: true,
  }
}

// Appends an audit event to the ledger.
// Enforces dryRunOnly: true on every request — throws if absent or false.
// Enforces tenant/workspace match — throws on mismatch.
export async function appendAuditEvent(
  request: VerianBridgeAuditAppendRequest,
  ctx: BridgeAuditRequestContext
): Promise<VerianBridgeAuditRecord> {
  if (request.dryRunOnly !== true) {
    throw new Error('appendAuditEvent: dryRunOnly must be true on all audit append requests')
  }

  const row = await auditRepo.appendAuditEvent({
    event_type: request.eventType,
    actor_type: request.actor,
    actor_user_id: ctx.actorUserId ?? null,
    task_id: request.taskId,
    packet_id: request.packetId,
    queue_item_id: request.queueItemId ?? null,
    policy_id: request.policyId,
    previous_state: request.previousState ?? null,
    next_state: request.nextState ?? null,
    summary: request.summary,
    evidence: (request.evidence as string[] | undefined) ?? [],
    prompt_summary: request.promptSummary ?? null,
    prompt_hash: request.promptHash ?? null,
    tenant_id: ctx.tenantId,
    workspace_id: ctx.workspaceId,
    dry_run_only: true,
  })

  return mapRowToRecord(row)
}

// Returns the full chronological audit history for a packet.
export async function getAuditHistory(
  packetId: string,
  ctx: BridgeAuditRequestContext
): Promise<VerianBridgeAuditRecord[]> {
  const rows = await auditRepo.getAuditEventsForPacket(packetId, ctx.tenantId, ctx.workspaceId)
  return rows.map(mapRowToRecord)
}

// Returns the full chronological audit history for a queue item.
export async function getQueueItemAuditHistory(
  queueItemId: string,
  ctx: BridgeAuditRequestContext
): Promise<VerianBridgeAuditRecord[]> {
  const rows = await auditRepo.getAuditEventsForQueueItem(queueItemId, ctx.tenantId, ctx.workspaceId)
  return rows.map(mapRowToRecord)
}
