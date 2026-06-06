import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type ContactRow = Database['public']['Tables']['contacts']['Row']
type ContactInsert = Database['public']['Tables']['contacts']['Insert']
type ContactUpdate = Database['public']['Tables']['contacts']['Update']

export type ContactWithCompany = ContactRow & {
  company: { id: string; name: string } | null
}

export interface ListContactsOptions {
  tenantId: string
  workspaceId: string
  companyId?: string
  search?: string
  limit?: number
  offset?: number
}

export async function listContacts(opts: ListContactsOptions): Promise<ContactRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('contacts')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.companyId) query = query.eq('company_id', opts.companyId)
  if (opts.search) {
    query = query.or(`first_name.ilike.%${opts.search}%,last_name.ilike.%${opts.search}%,email.ilike.%${opts.search}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`listContacts: ${error.message}`)
  return data ?? []
}

export async function listContactsWithCompany(opts: ListContactsOptions): Promise<ContactWithCompany[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('contacts')
    .select('*, company:companies(id, name)')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.companyId) query = query.eq('company_id', opts.companyId)
  if (opts.search) {
    query = query.or(`first_name.ilike.%${opts.search}%,last_name.ilike.%${opts.search}%,email.ilike.%${opts.search}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`listContactsWithCompany: ${error.message}`)
  return (data ?? []) as unknown as ContactWithCompany[]
}

export async function getContact(id: string, tenantId: string): Promise<ContactRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single()

  if (error) return null
  return data
}

export async function createContact(data: ContactInsert): Promise<ContactRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('contacts')
    .insert(data)
    .select()
    .single()

  if (error) throw new Error(`createContact: ${error.message}`)
  return row
}

export async function updateContact(
  id: string,
  tenantId: string,
  data: ContactUpdate
): Promise<ContactRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('contacts')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) throw new Error(`updateContact: ${error.message}`)
  return row
}
