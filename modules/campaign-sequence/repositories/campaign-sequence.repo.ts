import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  CampaignSequenceRow,
  CampaignSequenceInsert,
  CampaignSequenceUpdate,
} from '@/modules/campaign-sequence/types'

export async function insertCampaignSequence(data: CampaignSequenceInsert): Promise<CampaignSequenceRow> {
  const supabase = createSupabaseServiceClient()

  // Version is assigned here, centrally — callers (manual create, V6 AI
  // generation) never set it, and the column defaults to 1, so a 2nd
  // sequence of the same type would collide on uq_campaign_sequences_type_version
  // (tenant_id, workspace_id, campaign_type_id, version). Compute max+1 from
  // the existing sequences of this type and override any incoming version.
  // is_default is intentionally left as the caller passed it (defaults false):
  // forcing true would collide on uq_campaign_sequences_default (one default
  // per type). The theoretical race between two concurrent creates picking the
  // same version is acceptable — the unique index still guards it and at this
  // app's volume a retry is unnecessary.
  const fields = data as unknown as Record<string, unknown>
  const existing = await listCampaignSequencesForType(
    fields.campaign_type_id as string,
    fields.tenant_id as string,
    fields.workspace_id as string,
  )
  const nextVersion = (existing[0]?.version ?? 0) + 1

  const { data: row, error } = await supabase
    .from('campaign_sequences')
    .insert({ ...data, version: nextVersion })
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

export async function listManualSequencesForWorkspace(
  tenantId: string,
  workspaceId: string,
): Promise<CampaignSequenceRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_sequences')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('authoring_mode', 'manual')
    .neq('status', 'retired') // archived sequences are hidden from all pickers
    .order('name', { ascending: true })

  if (error) throw new Error(`listManualSequencesForWorkspace: ${error.message}`)
  return data ?? []
}

// Hard delete — only legal for never-used sequences (steps must be deleted
// first: campaign_sequence_steps FK is ON DELETE RESTRICT).
export async function deleteCampaignSequence(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('campaign_sequences')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error(`deleteCampaignSequence: ${error.message}`)
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
