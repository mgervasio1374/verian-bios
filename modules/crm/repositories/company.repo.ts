import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type CompanyRow = Database['public']['Tables']['companies']['Row']
type CompanyInsert = Database['public']['Tables']['companies']['Insert']
type CompanyUpdate = Database['public']['Tables']['companies']['Update']

export interface ListCompaniesOptions {
  tenantId: string
  workspaceId: string
  search?: string
  status?: string
  limit?: number
  offset?: number
}

export async function listCompanies(opts: ListCompaniesOptions): Promise<CompanyRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('companies')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1)

  if (opts.status) query = query.eq('status', opts.status)
  if (opts.search) query = query.ilike('name', `%${opts.search}%`)

  const { data, error } = await query
  if (error) throw new Error(`listCompanies: ${error.message}`)
  return data ?? []
}

export async function getCompany(id: string, tenantId: string, workspaceId: string): Promise<CompanyRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single()

  if (error) return null
  return data
}

// System-level read: no workspace filter. Use only in background/AI service contexts
// where a workspace-scoped RequestContext is not available.
export async function getCompanyByTenant(id: string, tenantId: string): Promise<CompanyRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single()

  if (error) return null
  return data
}

export async function createCompany(data: CompanyInsert): Promise<CompanyRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('companies')
    .insert(data)
    .select()
    .single()

  if (error) throw new Error(`createCompany: ${error.message}`)
  return row
}

export async function updateCompany(
  id: string,
  tenantId: string,
  workspaceId: string,
  data: CompanyUpdate
): Promise<CompanyRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('companies')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) throw new Error(`updateCompany: ${error.message}`)
  return row
}

export async function countCompanies(tenantId: string, workspaceId: string): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { count, error } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)

  if (error) throw new Error(`countCompanies: ${error.message}`)
  return count ?? 0
}
