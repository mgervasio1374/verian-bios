import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  CampaignSequenceStepRow,
  CampaignSequenceStepInsert,
  CampaignSequenceStepUpdate,
} from '@/modules/campaign-sequence/types'

export async function insertCampaignSequenceStep(
  data: CampaignSequenceStepInsert,
): Promise<CampaignSequenceStepRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('campaign_sequence_steps')
    .insert(data)
    .select('*')
    .single()

  if (error) throw new Error(`insertCampaignSequenceStep: ${error.message}`)
  return row
}

export async function getCampaignSequenceStepById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceStepRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_sequence_steps')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error) return null
  return data
}

export async function listCampaignSequenceStepsForSequence(
  campaignSequenceId: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceStepRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_sequence_steps')
    .select('*')
    .eq('campaign_sequence_id', campaignSequenceId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('step_number', { ascending: true })

  if (error) throw new Error(`listCampaignSequenceStepsForSequence: ${error.message}`)
  return data ?? []
}

export async function updateCampaignSequenceStep(
  id: string,
  tenantId: string,
  workspaceId: string,
  data: CampaignSequenceStepUpdate,
): Promise<CampaignSequenceStepRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('campaign_sequence_steps')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single()

  if (error) throw new Error(`updateCampaignSequenceStep: ${error.message}`)
  return row
}

// MCM v2 Slice V1 — step deletion (never-used sequences only) + asset usage probe

export async function deleteCampaignSequenceStep(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('campaign_sequence_steps')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error(`deleteCampaignSequenceStep: ${error.message}`)
}

export async function deleteStepsForSequence(
  campaignSequenceId: string,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('campaign_sequence_steps')
    .delete()
    .eq('campaign_sequence_id', campaignSequenceId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error(`deleteStepsForSequence: ${error.message}`)
}

export async function listStepsReferencingAsset(
  assetId: string,
  tenantId: string,
): Promise<{ id: string; campaign_sequence_id: string }[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_sequence_steps')
    .select('id, campaign_sequence_id')
    .eq('tenant_id', tenantId)
    .eq('campaign_email_asset_id', assetId)

  if (error) throw new Error(`listStepsReferencingAsset: ${error.message}`)
  return (data ?? []) as { id: string; campaign_sequence_id: string }[]
}

// Set-based usage check: of the given asset ids, which are referenced by ANY
// sequence step? Used to protect in-use assets from bulk/inline hard delete
// (campaign_sequence_steps.campaign_email_asset_id would break the FK).
export async function listAssetIdsReferencedBySteps(
  assetIds: string[],
  tenantId: string,
): Promise<Set<string>> {
  if (assetIds.length === 0) return new Set()
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_sequence_steps')
    .select('campaign_email_asset_id')
    .eq('tenant_id', tenantId)
    .in('campaign_email_asset_id', assetIds)

  if (error) throw new Error(`listAssetIdsReferencedBySteps: ${error.message}`)
  const referenced = new Set<string>()
  for (const row of (data ?? []) as { campaign_email_asset_id: string | null }[]) {
    if (row.campaign_email_asset_id) referenced.add(row.campaign_email_asset_id)
  }
  return referenced
}
