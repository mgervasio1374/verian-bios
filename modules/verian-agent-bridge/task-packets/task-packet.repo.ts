import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type TaskPacketRow = Database['public']['Tables']['bridge_task_packets']['Row']
type TaskPacketInsert = Database['public']['Tables']['bridge_task_packets']['Insert']

export type ListTaskPacketsOptions = {
  tenantId: string
  workspaceId: string
  policyId?: string
  riskLevel?: string
  limit?: number
}

export async function insertTaskPacket(data: TaskPacketInsert): Promise<TaskPacketRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('bridge_task_packets')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(`insertTaskPacket: ${error.message}`)
  return row
}

export async function getTaskPacketById(
  id: string,
  tenantId: string,
  workspaceId: string
): Promise<TaskPacketRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bridge_task_packets')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .single()
  if (error) return null
  return data
}

export async function listTaskPacketsByIds(
  ids: string[],
  tenantId: string,
  workspaceId: string
): Promise<TaskPacketRow[]> {
  if (ids.length === 0) return []
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bridge_task_packets')
    .select('*')
    .in('id', ids)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(`listTaskPacketsByIds: ${error.message}`)
  return data ?? []
}

export async function listTaskPackets(opts: ListTaskPacketsOptions): Promise<TaskPacketRow[]> {
  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('bridge_task_packets')
    .select('*')
    .eq('tenant_id', opts.tenantId)
    .eq('workspace_id', opts.workspaceId)
    .order('created_at', { ascending: false })

  if (opts.policyId) query = query.eq('policy_id', opts.policyId)
  if (opts.riskLevel) query = query.eq('risk_level', opts.riskLevel)
  if (opts.limit) query = query.limit(opts.limit)

  const { data, error } = await query
  if (error) throw new Error(`listTaskPackets: ${error.message}`)
  return data ?? []
}
