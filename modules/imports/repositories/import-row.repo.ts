// Phase 3B.2 — Data Import Foundation: import_rows repository

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  ImportRowRow,
  ImportRowInsert,
  ImportRowValidationStatus,
  ImportRowDuplicateStatus,
  ImportRowCommitStatus,
  ValidationError,
  DuplicateMatch,
} from '../import.types'

export async function createRows(rows: ImportRowInsert[]): Promise<void> {
  if (rows.length === 0) return
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.from('import_rows').insert(rows)
  if (error) throw new Error(`createRows: ${error.message}`)
}

export async function listRowsByBatch(
  batchId:  string,
  tenantId: string,
  limit     = 200,
  offset    = 0,
): Promise<ImportRowRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('import_rows')
    .select('*')
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .order('row_number', { ascending: true })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`listRowsByBatch: ${error.message}`)
  return data ?? []
}

export async function listInvalidRowsByBatch(batchId: string, tenantId: string): Promise<ImportRowRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('import_rows')
    .select('*')
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('validation_status', 'invalid')
    .order('row_number', { ascending: true })
  if (error) throw new Error(`listInvalidRowsByBatch: ${error.message}`)
  return data ?? []
}

export async function listDuplicateRowsByBatch(batchId: string, tenantId: string): Promise<ImportRowRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('import_rows')
    .select('*')
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('duplicate_status', 'duplicate')
    .order('row_number', { ascending: true })
  if (error) throw new Error(`listDuplicateRowsByBatch: ${error.message}`)
  return data ?? []
}

export async function listCommittableRows(batchId: string, tenantId: string): Promise<ImportRowRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('import_rows')
    .select('*')
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('validation_status', 'valid')
    .eq('duplicate_status', 'unique')
    .neq('commit_status', 'committed')
    .order('row_number', { ascending: true })
  if (error) throw new Error(`listCommittableRows: ${error.message}`)
  return data ?? []
}

export async function updateRowValidation(
  rowId:            string,
  validationStatus: ImportRowValidationStatus,
  validationErrors: ValidationError[],
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('import_rows')
    .update({
      validation_status: validationStatus,
      validation_errors: validationErrors as unknown as import('@/types/database').Database['public']['Tables']['import_rows']['Update']['validation_errors'],
      validated_at:      new Date().toISOString(),
    })
    .eq('id', rowId)
  if (error) throw new Error(`updateRowValidation: ${error.message}`)
}

export async function updateRowDedupe(
  rowId:           string,
  duplicateStatus: ImportRowDuplicateStatus,
  duplicateMatches: DuplicateMatch[],
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('import_rows')
    .update({
      duplicate_status:  duplicateStatus,
      duplicate_matches: duplicateMatches as unknown as import('@/types/database').Database['public']['Tables']['import_rows']['Update']['duplicate_matches'],
    })
    .eq('id', rowId)
  if (error) throw new Error(`updateRowDedupe: ${error.message}`)
}

export async function updateRowCommit(
  rowId:         string,
  commitStatus:  ImportRowCommitStatus,
  opts?: {
    commitError?:      string | null
    targetCompanyId?:  string | null
    targetContactId?:  string | null
    targetLeadId?:     string | null
  },
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('import_rows')
    .update({
      commit_status:      commitStatus,
      commit_error:       opts?.commitError ?? null,
      target_company_id:  opts?.targetCompanyId ?? null,
      target_contact_id:  opts?.targetContactId ?? null,
      target_lead_id:     opts?.targetLeadId ?? null,
      committed_at:       commitStatus === 'committed' ? new Date().toISOString() : null,
    })
    .eq('id', rowId)
  if (error) throw new Error(`updateRowCommit: ${error.message}`)
}

export async function updateRowNormalizedData(
  rowId:          string,
  normalizedData: Record<string, unknown>,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('import_rows')
    .update({ normalized_data: normalizedData as unknown as import('@/types/database').Database['public']['Tables']['import_rows']['Update']['normalized_data'] })
    .eq('id', rowId)
  if (error) throw new Error(`updateRowNormalizedData: ${error.message}`)
}
