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
