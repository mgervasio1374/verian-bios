import { createSupabaseServiceClient } from '@/lib/supabase/service'

// copy_exemplars is not in the generated Database types yet (migration 20240059);
// domain types are declared here, matching the untyped-service-client convention
// used by segment.repo.ts.

export interface CopyExemplarRow {
  id:                   string
  tenant_id:            string
  workspace_id:         string | null
  skill_slug:           string
  relationship_context: string | null
  subject:              string
  body_text:            string
  source:               'authored' | 'promoted'
  source_version_id:    string | null
  created_by:           string | null
  is_active:            boolean
  created_at:           string
  updated_at:           string
  deleted_at:           string | null
}

export interface CopyExemplarInsert {
  tenant_id:             string
  workspace_id?:         string | null
  skill_slug:            string
  relationship_context?: string | null
  subject:               string
  body_text:             string
  source:                'authored' | 'promoted'
  source_version_id?:    string | null
  created_by?:           string | null
}

export async function insertExemplar(data: CopyExemplarInsert): Promise<CopyExemplarRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('copy_exemplars')
    .insert(data)
    .select('*')
    .single()

  if (error) throw new Error(`insertExemplar: ${error.message}`)
  return row as CopyExemplarRow
}

// Few-shot injection query: active, not-deleted exemplars for this tenant + skill,
// newest first, capped (default 3).
export async function listActiveExemplarsForSkill(
  tenantId:  string,
  skillSlug: string,
  limit = 3,
): Promise<CopyExemplarRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('copy_exemplars')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('skill_slug', skillSlug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`listActiveExemplarsForSkill: ${error.message}`)
  return (data ?? []) as CopyExemplarRow[]
}

// All not-deleted exemplars for a tenant — for the management page.
export async function listExemplars(tenantId: string): Promise<CopyExemplarRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('copy_exemplars')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listExemplars: ${error.message}`)
  return (data ?? []) as CopyExemplarRow[]
}

export async function deactivateExemplar(id: string, tenantId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('copy_exemplars')
    .update({ is_active: false })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(`deactivateExemplar: ${error.message}`)
}

// Loads the minimal fields needed to promote an email_draft_version into an
// exemplar (tenant-scoped). Returns null if not found.
export async function loadVersionForExemplar(
  versionId: string,
  tenantId:  string,
): Promise<{ subject: string; body_text: string; metadata: Record<string, unknown> } | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_draft_versions')
    .select('subject, body_text, metadata')
    .eq('id', versionId)
    .eq('tenant_id', tenantId)
    .single()
  if (!data) return null
  return {
    subject:   (data.subject as string) ?? '',
    body_text: (data.body_text as string) ?? '',
    metadata:  (data.metadata as Record<string, unknown>) ?? {},
  }
}
