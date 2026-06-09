import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  CampaignSequenceRow,
  CampaignSequenceInsert,
  CampaignSequenceUpdate,
} from '@/modules/campaign-sequence/types'

export async function insertCampaignSequence(data: CampaignSequenceInsert): Promise<CampaignSequenceRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('campaign_sequences')
    .insert(data)
    .select('*')
    .single()

  if (error) throw new Error(`insertCampaignSequence: ${error.message}`)
  return row
}

export async function getCampaignSequenceById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_sequences')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error) return null
  return data
}

export async function listCampaignSequencesForType(
  campaignTypeId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_sequences')
    .select('*')
    .eq('campaign_type_id', campaignTypeId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('version', { ascending: false })

  if (error) throw new Error(`listCampaignSequencesForType: ${error.message}`)
  return data ?? []
}

export async function getDefaultCampaignSequenceForType(
  campaignTypeId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_sequences')
    .select('*')
    .eq('campaign_type_id', campaignTypeId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .single()

  if (error) return null
  return data
}

export async function listCampaignSequencesForWorkspace(
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_sequences')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listCampaignSequencesForWorkspace: ${error.message}`)
  return data ?? []
}

export async function updateCampaignSequence(
  id: string,
  tenantId: string,
  workspaceId: string,
  data: CampaignSequenceUpdate,
): Promise<CampaignSequenceRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('campaign_sequences')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single()

  if (error) throw new Error(`updateCampaignSequence: ${error.message}`)
  return row
}
