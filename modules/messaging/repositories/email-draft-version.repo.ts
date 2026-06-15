import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type EmailDraftVersionRow = Database['public']['Tables']['email_draft_versions']['Row']

export type { EmailDraftVersionRow }

export interface CreateEmailDraftVersionInput {
  tenantId:                 string
  workspaceId?:             string | null
  emailDraftId:             string
  leadId?:                  string | null
  companyId?:               string | null
  versionNumber:            number
  versionType:              'original' | 'rewrite'
  subject:                  string
  bodyText:                 string
  bodyHtml?:                string | null
  qualityScore?:            number | null
  qualityStatus?:           string | null
  qualityReviewId?:         string | null
  improvementFromPrevious?: number | null
  improvementFromOriginal?: number | null
  rewriteReason?:           string | null
  strengths?:               string[]
  weaknesses?:              string[]
  riskFlags?:               string[]
  metadata?:                Record<string, unknown>
}

export async function createEmailDraftVersion(
  input: CreateEmailDraftVersionInput
): Promise<EmailDraftVersionRow> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_draft_versions')
    .insert({
      tenant_id:                 input.tenantId,
      workspace_id:              input.workspaceId             ?? null,
      email_draft_id:            input.emailDraftId,
      lead_id:                   input.leadId                  ?? null,
      company_id:                input.companyId               ?? null,
      version_number:            input.versionNumber,
      version_type:              input.versionType,
      subject:                   input.subject,
      body_text:                 input.bodyText,
      body_html:                 input.bodyHtml                ?? null,
      quality_score:             input.qualityScore            ?? null,
      quality_status:            input.qualityStatus           ?? null,
      quality_review_id:         input.qualityReviewId         ?? null,
      improvement_from_previous: input.improvementFromPrevious ?? null,
      improvement_from_original: input.improvementFromOriginal ?? null,
      rewrite_reason:            input.rewriteReason           ?? null,
      strengths:                 input.strengths               ?? [],
      weaknesses:                input.weaknesses              ?? [],
      risk_flags:                input.riskFlags               ?? [],
      metadata:                  input.metadata                ?? {},
    })
    .select()
    .single()

  if (error) throw new Error(`createEmailDraftVersion: ${error.message}`)
  return data
}

export async function listEmailDraftVersions(
  emailDraftId: string,
  tenantId:     string
): Promise<EmailDraftVersionRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_draft_versions')
    .select('*')
    .eq('email_draft_id', emailDraftId)
    .eq('tenant_id', tenantId)
    .order('version_number', { ascending: true })

  if (error) throw new Error(`listEmailDraftVersions: ${error.message}`)
  return data ?? []
}

// Fetch a single version by id (tenant-scoped). Used to resolve the persisted
// best_version_id into its row so every surface reads ONE source of truth.
export async function getEmailDraftVersionById(
  emailDraftId: string,
  versionId:    string,
  tenantId:     string
): Promise<EmailDraftVersionRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_draft_versions')
    .select('*')
    .eq('id', versionId)
    .eq('email_draft_id', emailDraftId)
    .eq('tenant_id', tenantId)
    .single()
  return data ?? null
}

// Hardened: a blocked version is never returned as "best". Ordered by score then
// version_number so a tie prefers the later version. Prefer resolving
// best_version_id via getEmailDraftVersionById; this remains as a safe fallback.
export async function getBestEmailDraftVersion(
  emailDraftId: string,
  tenantId:     string
): Promise<EmailDraftVersionRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_draft_versions')
    .select('*')
    .eq('email_draft_id', emailDraftId)
    .eq('tenant_id', tenantId)
    .not('quality_score', 'is', null)
    .neq('quality_status', 'blocked')
    .order('quality_score', { ascending: false })
    .order('version_number', { ascending: false })
    .limit(1)
    .single()
  return data ?? null
}

export async function getNextVersionNumber(
  emailDraftId: string,
  tenantId:     string
): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_draft_versions')
    .select('version_number')
    .eq('email_draft_id', emailDraftId)
    .eq('tenant_id', tenantId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()
  return (data?.version_number ?? 0) + 1
}
