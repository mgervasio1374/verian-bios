import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  CampaignTypeRow,
  CampaignTypeInsert,
  CampaignTypeUpdate,
  ListCampaignTypesOptions,
} from '@/modules/campaign-sequence/types'

export async function insertCampaignType(data: CampaignTypeInsert): Promise<CampaignTypeRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('campaign_types')
    .insert(data)
    .select('*')
    .single()

  if (error) throw new Error(`insertCampaignType: ${error.message}`)
  return row
}

export async function getCampaignTypeById(
  id: string,
  tenantId: string,
  workspaceId: string,
): Promise<CampaignTypeRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_types')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error) return null
  return data
}

export async function listCampaignTypes(opts: ListCampaignTypesOptions): Promise<CampaignTypeRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('campaign_types')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .order('name', { ascending: true })
    .limit(opts.limit ?? 100)

  if (opts.status) query = query.eq('status', opts.status)

  const { data, error } = await query
  if (error) throw new Error(`listCampaignTypes: ${error.message}`)
  return data ?? []
}

export async function updateCampaignType(
  id: string,
  tenantId: string,
  workspaceId: string,
  data: CampaignTypeUpdate,
): Promise<CampaignTypeRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('campaign_types')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single()

  if (error) throw new Error(`updateCampaignType: ${error.message}`)
  return row
}
