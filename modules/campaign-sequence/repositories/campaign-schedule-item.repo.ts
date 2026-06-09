import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  CampaignScheduleItemRow,
  CampaignScheduleItemInsert,
  CampaignScheduleItemStatus,
  ListCampaignScheduleItemsOptions,
} from '@/modules/campaign-sequence/types'

export async function getCampaignScheduleItemById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_schedule_items')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error) return null
  return data
}

export async function listCampaignScheduleItems(
  opts: ListCampaignScheduleItemsOptions,
): Promise<CampaignScheduleItemRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('campaign_schedule_items')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .order('scheduled_for', { ascending: true })

  if (opts.status) query = query.eq('status', opts.status)
  if (opts.limit) query = query.limit(opts.limit)

  const { data, error } = await query
  if (error) throw new Error(`listCampaignScheduleItems: ${error.message}`)
  return data ?? []
}

export async function listCampaignScheduleItemsForAssignment(
  campaignAssignmentId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_schedule_items')
    .select('*')
    .eq('campaign_assignment_id', campaignAssignmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('scheduled_for', { ascending: true })

  if (error) throw new Error(`listCampaignScheduleItemsForAssignment: ${error.message}`)
  return data ?? []
}

export async function listCampaignScheduleItemsForSequence(
  campaignSequenceId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_schedule_items')
    .select('*')
    .eq('campaign_sequence_id', campaignSequenceId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('scheduled_for', { ascending: true })

  if (error) throw new Error(`listCampaignScheduleItemsForSequence: ${error.message}`)
  return data ?? []
}

export async function listDueScheduleItems(
  tenantId: string,
  workspaceId: string,
  now: string,
  limit: number,
): Promise<CampaignScheduleItemRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_schedule_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('status', ['planned', 'draft_needed'])
    .is('email_draft_id', null)
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`listDueScheduleItems: ${error.message}`)
  return data ?? []
}

export async function listDraftReadyItems(
  tenantId: string,
  workspaceId: string,
  limit: number,
): Promise<CampaignScheduleItemRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_schedule_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'draft_ready')
    .not('email_draft_id', 'is', null)
    .is('approval_request_id', null)
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`listDraftReadyItems: ${error.message}`)
  return data ?? []
}

export async function getFirstTouchItemForAssignment(
  assignmentId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow | null> {
  const supabase = createSupabaseServiceClient()

  // Get the sequence_id from any item in this assignment
  const { data: sample } = await supabase
    .from('campaign_schedule_items')
    .select('campaign_sequence_id')
    .eq('campaign_assignment_id', assignmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .limit(1)
    .single()

  if (!sample) return null

  // Find the step with step_number = 1 for this sequence
  const { data: firstStep } = await supabase
    .from('campaign_sequence_steps')
    .select('id')
    .eq('campaign_sequence_id', sample.campaign_sequence_id)
    .eq('step_number', 1)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!firstStep) return null

  // Find the schedule item for the first step in this assignment
  const { data: item } = await supabase
    .from('campaign_schedule_items')
    .select('*')
    .eq('campaign_assignment_id', assignmentId)
    .eq('campaign_sequence_step_id', firstStep.id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single()

  return item ?? null
}

export async function listSendableScheduleItems(
  tenantId: string,
  workspaceId: string,
  now: string,
  limit: number,
): Promise<CampaignScheduleItemRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_schedule_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
    .not('email_draft_id', 'is', null)
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`listSendableScheduleItems: ${error.message}`)
  return data ?? []
}

/**
 * Count non-terminal schedule items for an assignment.
 * excludeDraftId: items whose email_draft_id matches this are excluded — used to
 * skip the current item (still 'approved' at call time) when determining if all
 * other steps are done. NULL email_draft_id items are always counted.
 */
export async function countPendingScheduleItemsForAssignment(
  assignmentId: string,
  tenantId: string,
  workspaceId: string,
  excludeDraftId?: string,
): Promise<number> {
  // Non-terminal statuses — items in these states are still "pending" work
  const pendingStatuses = [
    'planned', 'draft_needed', 'draft_ready',
    'awaiting_approval', 'approved', 'scheduled',
  ] as const

  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('campaign_schedule_items')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_assignment_id', assignmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('status', pendingStatuses)

  if (excludeDraftId) {
    // Include items where email_draft_id IS NULL (not yet promoted) OR != excludeDraftId.
    // Without the IS NULL arm, neq() would incorrectly exclude null rows.
    query = query.or(`email_draft_id.is.null,email_draft_id.neq.${excludeDraftId}`)
  }

  const { count, error } = await query
  if (error) throw new Error(`countPendingScheduleItemsForAssignment: ${error.message}`)
  return count ?? 0
}

export async function listPendingScheduleItemsForAssignment(
  assignmentId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignScheduleItemRow[]> {
  // Non-terminal statuses — mirrors countPendingScheduleItemsForAssignment exactly
  const pendingStatuses = [
    'planned', 'draft_needed', 'draft_ready',
    'awaiting_approval', 'approved', 'scheduled',
  ] as const

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_schedule_items')
    .select('*')
    .eq('campaign_assignment_id', assignmentId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .in('status', pendingStatuses)
    .order('scheduled_for', { ascending: true })

  if (error) throw new Error(`listPendingScheduleItemsForAssignment: ${error.message}`)
  return data ?? []
}

export async function insertCampaignScheduleItems(
  rows: CampaignScheduleItemInsert[],
): Promise<CampaignScheduleItemRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_schedule_items')
    .insert(rows)
    .select('*')

  if (error) throw new Error(`insertCampaignScheduleItems: ${error.message}`)
  return data ?? []
}

export type UpdateScheduleItemStatusOpts = {
  status_reason?: string | null
  stopped_at?: string | null
  stopped_reason?: string | null
  response_detected_at?: string | null
  email_draft_id?: string | null
  approval_request_id?: string | null
}

export async function updateCampaignScheduleItemStatus(
  id: string,
  tenantId: string,
  workspaceId: string,
  nextStatus: CampaignScheduleItemStatus,
  opts?: UpdateScheduleItemStatusOpts,
): Promise<CampaignScheduleItemRow> {
  const supabase = createSupabaseServiceClient()
  const patch: Record<string, unknown> = { status: nextStatus }
  if (opts?.status_reason !== undefined)        patch.status_reason        = opts.status_reason
  if (opts?.stopped_at !== undefined)           patch.stopped_at           = opts.stopped_at
  if (opts?.stopped_reason !== undefined)       patch.stopped_reason       = opts.stopped_reason
  if (opts?.response_detected_at !== undefined) patch.response_detected_at = opts.response_detected_at
  if (opts?.email_draft_id !== undefined)       patch.email_draft_id       = opts.email_draft_id
  if (opts?.approval_request_id !== undefined)  patch.approval_request_id  = opts.approval_request_id

  const { data, error } = await supabase
    .from('campaign_schedule_items')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single()

  if (error) throw new Error(`updateCampaignScheduleItemStatus: ${error.message}`)
  return data
}
