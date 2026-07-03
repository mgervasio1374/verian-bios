import { createSupabaseServiceClient } from '@/lib/supabase/service'

// Company notes ride the CRM `activities` table (20240002) with
// activity_type='note' — so they surface on the /activities page (which
// already renders notes) without a new table. Service client bypasses RLS;
// every query filters tenant/workspace explicitly.

export interface CompanyNoteRow {
  id: string
  body: string | null
  subject: string | null
  occurred_at: string | null
  created_at: string
  performed_by: string | null
}

export async function insertCompanyNote(input: {
  tenant_id: string
  workspace_id: string
  company_id: string
  body: string
  performed_by: string | null
}): Promise<{ id: string }> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('activities')
    .insert({
      tenant_id: input.tenant_id,
      workspace_id: input.workspace_id,
      company_id: input.company_id,
      activity_type: 'note',
      body: input.body,
      performed_by: input.performed_by,
      occurred_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insertCompanyNote: ${error?.message ?? 'no row returned'}`)
  return { id: data.id as string }
}

export async function listCompanyNotes(
  tenantId: string,
  workspaceId: string,
  companyId: string,
  limit = 20,
): Promise<CompanyNoteRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('activities')
    .select('id, body, subject, occurred_at, created_at, performed_by')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .eq('company_id', companyId)
    .eq('activity_type', 'note')
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listCompanyNotes: ${error.message}`)
  return (data ?? []) as CompanyNoteRow[]
}
