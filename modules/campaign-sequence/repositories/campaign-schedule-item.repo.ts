import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  CampaignScheduleItemRow,
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
