import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type AuditEventRow = Database['public']['Tables']['bridge_audit_events']['Row']
type AuditEventInsert = Database['public']['Tables']['bridge_audit_events']['Insert']

// Append-only repository. No update or delete functions are provided.
// Corrections to audit records must be new inserted rows.

export async function appendAuditEvent(data: AuditEventInsert): Promise<AuditEventRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('bridge_audit_events')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(`appendAuditEvent: ${error.message}`)
  return row
}

export async function getAuditEventsForPacket(
  packetId: string,
  tenantId: string,
  workspaceId: string
): Promise<AuditEventRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bridge_audit_events')
    .select('*')
    .eq('packet_id', packetId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`getAuditEventsForPacket: ${error.message}`)
  return data ?? []
}

export async function getAuditEventsForQueueItem(
  queueItemId: string,
  tenantId: string,
  workspaceId: string
): Promise<AuditEventRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bridge_audit_events')
    .select('*')
    .eq('queue_item_id', queueItemId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`getAuditEventsForQueueItem: ${error.message}`)
  return data ?? []
}
