// Phase 3B.2 — Data Import Foundation: import_batches repository

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type { ImportBatchRow, ImportBatchInsert, ImportBatchUpdate, ImportBatchStatus } from '../import.types'

export async function createBatch(data: ImportBatchInsert): Promise<ImportBatchRow> {
  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('import_batches')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(`createBatch: ${error.message}`)
  return row
}

export async function getBatch(
  batchId:  string,
  tenantId: string,
): Promise<ImportBatchRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('import_batches')
    .select('*')
    .eq('id', batchId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`getBatch: ${error.message}`)
  }
  return data
}

export async function updateBatchStatus(
  batchId:   string,
  tenantId:  string,
  status:    ImportBatchStatus,
  extra?:    Partial<ImportBatchUpdate>,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('import_batches')
    .update({ status, ...extra })
    .eq('id', batchId)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`updateBatchStatus: ${error.message}`)
}

export async function updateBatchCounts(
  batchId:  string,
  tenantId: string,
  counts:   Partial<Pick<ImportBatchRow,
    'total_rows' | 'parsed_rows' | 'valid_rows' | 'invalid_rows' |
    'duplicate_rows' | 'committed_rows' | 'failed_commit_rows'
  >>,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('import_batches')
    .update(counts)
    .eq('id', batchId)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`updateBatchCounts: ${error.message}`)
}

export async function listBatchesForWorkspace(
  tenantId:    string,
  workspaceId: string,
  limit        = 50,
  offset       = 0,
): Promise<ImportBatchRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('import_batches')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`listBatchesForWorkspace: ${error.message}`)
  return data ?? []
}
