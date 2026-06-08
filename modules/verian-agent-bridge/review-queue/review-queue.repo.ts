import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type ReviewQueueItemRow = Database['public']['Tables']['bridge_review_queue_items']['Row']
type ReviewQueueItemInsert = Database['public']['Tables']['bridge_review_queue_items']['Insert']

export type ListReviewQueueItemsOptions = {
  tenantId: string
  workspaceId: string
  status?: string
  packetId?: string
  assignedReviewerId?: string
  limit?: number
}

export type ReviewQueueStatusUpdate = {
  status: string
  assignedReviewerId?: string | null
  lastDecisionSummary?: string | null
  policyCheckStatus?: string
}

export class StaleStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StaleStateError'
  }
}

export async function insertReviewQueueItem(
  data: ReviewQueueItemInsert
): Promise<ReviewQueueItemRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('bridge_review_queue_items')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(`insertReviewQueueItem: ${error.message}`)
  return row
}

export async function getReviewQueueItemById(
  id: string,
  tenantId: string,
  workspaceId: string
): Promise<ReviewQueueItemRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bridge_review_queue_items')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single()
  if (error) return null
  return data
}

export async function listReviewQueueItems(
  opts: ListReviewQueueItemsOptions
): Promise<ReviewQueueItemRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('bridge_review_queue_items')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .order('created_at', { ascending: false })

  if (opts.status) query = query.eq('status', opts.status)
  if (opts.packetId) query = query.eq('packet_id', opts.packetId)
  if (opts.assignedReviewerId) query = query.eq('assigned_reviewer_id', opts.assignedReviewerId)
  if (opts.limit) query = query.limit(opts.limit)

  const { data, error } = await query
  if (error) throw new Error(`listReviewQueueItems: ${error.message}`)
  return data ?? []
}

// Updates queue item status only if the current DB status matches expectedCurrentStatus.
// Throws StaleStateError if no row is updated (concurrent status change between fetch and write).
export async function updateReviewQueueItemStatus(
  id: string,
  tenantId: string,
  workspaceId: string,
  expectedCurrentStatus: string,
  update: ReviewQueueStatusUpdate
): Promise<ReviewQueueItemRow> {
  const supabase = createSupabaseServiceClient()
  const updatePayload: Partial<ReviewQueueItemRow> = {
    status: update.status,
  }
  if (update.assignedReviewerId !== undefined) {
    updatePayload.assigned_reviewer_id = update.assignedReviewerId
  }
  if (update.lastDecisionSummary !== undefined) {
    updatePayload.last_decision_summary = update.lastDecisionSummary
  }
  if (update.policyCheckStatus !== undefined) {
    updatePayload.current_policy_check_status = update.policyCheckStatus
  }

  const { data: row, error } = await supabase
    .from('bridge_review_queue_items')
    .update(updatePayload)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('status', expectedCurrentStatus)
    .select()
    .single()
  if (error || !row) {
    throw new StaleStateError(
      `updateReviewQueueItemStatus: no row updated — status may have changed from '${expectedCurrentStatus}' for item ${id}`
    )
  }
  return row
}
