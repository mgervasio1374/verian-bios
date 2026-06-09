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
