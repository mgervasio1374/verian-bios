import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type CompanyRow = Database['public']['Tables']['companies']['Row']
type ContactRow = Database['public']['Tables']['contacts']['Row']

export async function upsertCompany(opts: {
  tenantId: string
  workspaceId: string
  name?: string
  domain?: string
  source: string
}): Promise<CompanyRow | null> {
  if (!opts.name && !opts.domain) return null

  const supabase = createSupabaseServiceClient()

  // Match by domain first (more stable identifier)
  if (opts.domain) {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('tenant_id', opts.tenantId)
      .eq('workspace_id', opts.workspaceId)
      .eq('domain', opts.domain)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (data) return data
  }

  // Match by exact name (case-insensitive)
  if (opts.name) {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('tenant_id', opts.tenantId)
      .eq('workspace_id', opts.workspaceId)
      .ilike('name', opts.name)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (data) return data
  }

  const { data, error } = await supabase
    .from('companies')
    .insert({
      tenant_id: opts.tenantId,
      workspace_id: opts.workspaceId,
      name: opts.name ?? opts.domain!,
      domain: opts.domain ?? null,
      source: opts.source,
      status: 'active',
    })
    .select()
    .single()

  if (error) throw new Error(`upsertCompany: ${error.message}`)
  return data
}

export async function upsertContact(opts: {
  tenantId: string
  workspaceId: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  companyId?: string
  source: string
}): Promise<ContactRow> {
  const supabase = createSupabaseServiceClient()

  const { data: existing } = await supabase
    .from('contacts')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .eq('email', opts.email)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Attach to company if newly resolved and not yet linked
    if (opts.companyId && !existing.company_id) {
      const { data: updated } = await supabase
        .from('contacts')
        .update({ company_id: opts.companyId })
        .eq('id', existing.id)
        .select()
        .single()
      if (updated) return updated
    }
    return existing
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      tenant_id: opts.tenantId,
      workspace_id: opts.workspaceId,
      email: opts.email,
      first_name: opts.firstName,
      last_name: opts.lastName,
      phone: opts.phone ?? null,
      company_id: opts.companyId ?? null,
      source: opts.source,
      status: 'active',
      is_primary_contact: false,
      do_not_contact: false,
    })
    .select()
    .single()

  if (error) throw new Error(`upsertContact: ${error.message}`)
  return data
}
