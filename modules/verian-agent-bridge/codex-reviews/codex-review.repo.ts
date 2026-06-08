import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

type CodexReviewRow = Database['public']['Tables']['bridge_codex_reviews']['Row']
type CodexReviewInsert = Database['public']['Tables']['bridge_codex_reviews']['Insert']

// Append-only repository. No update or delete functions are provided.
// Superseded reviews must produce a new row; the prior row is preserved.

export async function appendCodexReview(data: CodexReviewInsert): Promise<CodexReviewRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('bridge_codex_reviews')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(`appendCodexReview: ${error.message}`)
  return row
}

export async function getCodexReviewsForPacket(
  packetId: string,
  tenantId: string,
  workspaceId: string
): Promise<CodexReviewRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bridge_codex_reviews')
    .select('*')
    .eq('packet_id', packetId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`getCodexReviewsForPacket: ${error.message}`)
  return data ?? []
}

export async function getCodexReviewsForQueueItem(
  queueItemId: string,
  tenantId: string,
  workspaceId: string
): Promise<CodexReviewRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bridge_codex_reviews')
    .select('*')
    .eq('queue_item_id', queueItemId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`getCodexReviewsForQueueItem: ${error.message}`)
  return data ?? []
}

export async function getLatestCodexReviewForQueueItem(
  queueItemId: string,
  tenantId: string,
  workspaceId: string
): Promise<CodexReviewRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bridge_codex_reviews')
    .select('*')
    .eq('queue_item_id', queueItemId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error) return null
  return data
}
