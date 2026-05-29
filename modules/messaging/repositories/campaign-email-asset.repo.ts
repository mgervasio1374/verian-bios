import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

export interface CreateCampaignAssetInput {
  tenantId:               string
  workspaceId?:           string | null
  campaignType:           string
  assetName:              string
  subjectTemplate:        string
  bodyTemplateHtml:       string
  bodyTemplateText:       string
  personalizationFields:  string[]
  requiredFields:         string[]
  fallbackValues?:        Record<string, string>
  llmGenerated?:          boolean
  aiUsageEventId?:        string | null
  decisionId?:            string | null
}

export async function createAsset(input: CreateCampaignAssetInput): Promise<CampaignEmailAssetRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_email_assets')
    .insert({
      tenant_id:               input.tenantId,
      workspace_id:            input.workspaceId ?? null,
      campaign_type:           input.campaignType,
      asset_name:              input.assetName,
      subject_template:        input.subjectTemplate,
      body_template_html:      input.bodyTemplateHtml,
      body_template_text:      input.bodyTemplateText,
      personalization_fields:  input.personalizationFields,
      required_fields:         input.requiredFields,
      fallback_values:         input.fallbackValues ?? {},
      llm_generated:           input.llmGenerated ?? true,
      ai_usage_event_id:       input.aiUsageEventId ?? null,
      decision_id:             input.decisionId ?? null,
      status:                  'draft',
    })
    .select()
    .single()

  if (error) throw new Error('createAsset: ' + error.message)
  return data
}

export async function getAssetById(
  tenantId: string,
  assetId:  string
): Promise<CampaignEmailAssetRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_email_assets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', assetId)
    .maybeSingle()

  if (error) throw new Error('getAssetById: ' + error.message)
  return data
}

export async function listAssetsForWorkspace(
  tenantId:    string,
  workspaceId: string,
  status?:     string
): Promise<CampaignEmailAssetRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('campaign_email_assets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error('listAssetsForWorkspace: ' + error.message)
  return data ?? []
}

export async function updateAssetStatus(
  tenantId:   string,
  assetId:    string,
  status:     'under_review' | 'approved' | 'active' | 'retired',
  approvedBy?: string | null
): Promise<void> {
  if ((status === 'approved' || status === 'active') && !approvedBy) {
    throw new Error('updateAssetStatus: approvedBy is required when approving or activating an asset')
  }

  const supabase = createSupabaseServiceClient()
  const updateFields: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (approvedBy) {
    updateFields.approved_by = approvedBy
    updateFields.approved_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('campaign_email_assets')
    .update(updateFields)
    .eq('tenant_id', tenantId)
    .eq('id', assetId)

  if (error) throw new Error('updateAssetStatus: ' + error.message)
}

export interface UpdateAssetContentInput {
  subjectTemplate:       string
  bodyTemplateHtml:      string
  bodyTemplateText:      string
  personalizationFields: string[]
  requiredFields:        string[]
  fallbackValues:        Record<string, string>
  assetName?:            string
  campaignType?:         string
  llmGenerated?:         boolean
  aiUsageEventId?:       string | null
  decisionId?:           string | null
}

export async function updateAssetContent(
  tenantId:    string,
  assetId:     string,
  content:     UpdateAssetContentInput,
  resetStatus: boolean = false
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const fields: Record<string, unknown> = {
    subject_template:        content.subjectTemplate,
    body_template_html:      content.bodyTemplateHtml,
    body_template_text:      content.bodyTemplateText,
    personalization_fields:  content.personalizationFields,
    required_fields:         content.requiredFields,
    fallback_values:         content.fallbackValues,
    updated_at:              new Date().toISOString(),
  }
  if (content.assetName    !== undefined) fields.asset_name      = content.assetName
  if (content.campaignType !== undefined) fields.campaign_type   = content.campaignType
  if (content.llmGenerated !== undefined) fields.llm_generated   = content.llmGenerated
  if (content.aiUsageEventId !== undefined) fields.ai_usage_event_id = content.aiUsageEventId
  if (content.decisionId   !== undefined) fields.decision_id     = content.decisionId
  if (resetStatus)                        fields.status          = 'draft'

  const { error } = await supabase
    .from('campaign_email_assets')
    .update(fields)
    .eq('tenant_id', tenantId)
    .eq('id', assetId)

  if (error) throw new Error('updateAssetContent: ' + error.message)
}

export async function listAssetsByType(
  tenantId:     string,
  workspaceId:  string,
  campaignType: string,
  status?:      string
): Promise<CampaignEmailAssetRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('campaign_email_assets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('campaign_type', campaignType)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error('listAssetsByType: ' + error.message)
  return data ?? []
}

export async function listAssetsByStatus(
  tenantId:    string,
  workspaceId: string,
  status:      string
): Promise<CampaignEmailAssetRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_email_assets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) throw new Error('listAssetsByStatus: ' + error.message)
  return data ?? []
}

export async function updatePerformanceSummary(
  tenantId: string,
  assetId:  string,
  summary:  Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('campaign_email_assets')
    .update({ performance_summary: summary, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', assetId)

  if (error) throw new Error('updatePerformanceSummary: ' + error.message)
}
