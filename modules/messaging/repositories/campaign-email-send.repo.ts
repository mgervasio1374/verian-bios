import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type CampaignEmailSendRow = Database['public']['Tables']['campaign_email_sends']['Row']

export interface CreateCampaignSendInput {
  tenantId:                   string
  assetId:                    string
  leadId:                     string
  contactId?:                 string | null
  renderedSubject:             string
  renderedBodyHtml?:           string | null
  renderedBodyText?:           string | null
  personalizationSnapshot:     Record<string, string>
  missingRequiredFields?:      string[]
  sendStatus?:                 string
}

export async function createCampaignSend(input: CreateCampaignSendInput): Promise<CampaignEmailSendRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_email_sends')
    .insert({
      tenant_id:                  input.tenantId,
      asset_id:                   input.assetId,
      lead_id:                    input.leadId,
      contact_id:                 input.contactId ?? null,
      rendered_subject:            input.renderedSubject,
      rendered_body_html:          input.renderedBodyHtml ?? null,
      rendered_body_text:          input.renderedBodyText ?? null,
      personalization_snapshot:    input.personalizationSnapshot,
      missing_required_fields:     input.missingRequiredFields ?? null,
      send_status:                 input.sendStatus ?? 'pending',
    })
    .select()
    .single()

  if (error) throw new Error('createCampaignSend: ' + error.message)
  return data
}

export async function updateSendStatus(
  tenantId:     string,
  sendId:       string,
  status:       string,
  emailSendId?: string | null
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const fields: Record<string, unknown> = { send_status: status, updated_at: new Date().toISOString() }
  if (emailSendId !== undefined) fields.email_send_id = emailSendId

  const { error } = await supabase
    .from('campaign_email_sends')
    .update(fields)
    .eq('tenant_id', tenantId)
    .eq('id', sendId)

  if (error) throw new Error('updateSendStatus: ' + error.message)
}

export async function getLeadCampaignSends(
  tenantId: string,
  leadId:   string
): Promise<CampaignEmailSendRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('campaign_email_sends')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) throw new Error('getLeadCampaignSends: ' + error.message)
  return data ?? []
}
