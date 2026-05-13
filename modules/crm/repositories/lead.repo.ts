import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type LeadRow = Database['public']['Tables']['leads']['Row']
type LeadInsert = Database['public']['Tables']['leads']['Insert']
type LeadUpdate = Database['public']['Tables']['leads']['Update']

export interface ListLeadsOptions {
  tenantId: string
  workspaceId: string
  stage?: string
  status?: string
  assignedTo?: string
  search?: string
  limit?: number
  offset?: number
}

export async function listLeads(opts: ListLeadsOptions): Promise<LeadRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)

  if (opts.stage) query = query.eq('stage', opts.stage)
  if (opts.status) query = query.eq('status', opts.status)
  if (opts.assignedTo) query = query.eq('assigned_to', opts.assignedTo)
  if (opts.search) query = query.ilike('name', `%${opts.search}%`)

  const { data, error } = await query
  if (error) throw new Error(`listLeads: ${error.message}`)
  return data ?? []
}

export async function getLead(id: string, tenantId: string): Promise<LeadRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single()

  if (error) return null
  return data
}

export async function createLead(data: LeadInsert): Promise<LeadRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('leads')
    .insert(data)
    .select()
    .single()

  if (error) throw new Error(`createLead: ${error.message}`)
  return row
}

export async function updateLead(
  id: string,
  tenantId: string,
  data: LeadUpdate
): Promise<LeadRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('leads')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) throw new Error(`updateLead: ${error.message}`)
  return row
}

export async function listLeadsByStage(
  tenantId: string,
  workspaceId: string
): Promise<Record<string, LeadRow[]>> {
  const leads = await listLeads({ tenantId, workspaceId, status: 'open', limit: 500 })
  return leads.reduce<Record<string, LeadRow[]>>((acc, lead) => {
    if (!acc[lead.stage]) acc[lead.stage] = []
    acc[lead.stage].push(lead)
    return acc
  }, {})
}
