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

// Columns PostgREST needs to construct the INSERT half of an upsert. The
// conflict on `id` always fires for an existing row, but Postgres still builds
// the candidate row first, so NOT NULL columns must be present.
export interface ImportRowPatch {
  id:               string
  import_batch_id:  string
  tenant_id:        string
  workspace_id:     string
  row_number:       number
  normalized_data?:   unknown
  validation_status?: ImportRowValidationStatus
  validation_errors?: unknown
  validated_at?:      string
  duplicate_status?:  ImportRowDuplicateStatus
  duplicate_matches?: unknown
}

/**
 * Patch many rows in a handful of round trips.
 *
 * Validation and dedupe used to issue one UPDATE per row, which for a
 * 3,618-row file meant ~7,200 and ~25,000 round trips respectively — minutes of
 * pure latency, far past any serverless function limit. Upserting on the primary
 * key collapses that to one request per chunk.
 */
export async function bulkPatchRows(patches: ImportRowPatch[], chunkSize = 500): Promise<void> {
  if (patches.length === 0) return
  const supabase = createSupabaseServiceClient()
  for (let i = 0; i < patches.length; i += chunkSize) {
    const { error } = await supabase
      .from('import_rows')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(patches.slice(i, i + chunkSize) as any, { onConflict: 'id' })
    if (error) throw new Error(`bulkPatchRows: ${error.message}`)
  }
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

// PostgREST caps an unbounded select at 1,000 rows. These three lists had no
// .range(), so on a 3,618-row batch they silently returned exactly 1,000 —
// which made the review screen understate duplicates AND, worse, made
// approveBatch compute validUniqueRows = 1000. Since the async threshold is
// `> 1000`, that landed exactly on the boundary and committed inline, so a
// 2,351-row import would have written at most 1,000 rows and timed out partway.
// Paging is not an optimization here; without it the import loses data.
const PAGE = 1000

async function pageRows(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: ImportRowRow[] | null; error: { message: string } | null }>,
): Promise<ImportRowRow[]> {
  const out: ImportRowRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export async function listInvalidRowsByBatch(batchId: string, tenantId: string): Promise<ImportRowRow[]> {
  const supabase = createSupabaseServiceClient()
  return pageRows('listInvalidRowsByBatch', (from, to) => supabase
    .from('import_rows')
    .select('*')
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('validation_status', 'invalid')
    .order('row_number', { ascending: true })
    .range(from, to))
}

export async function listDuplicateRowsByBatch(batchId: string, tenantId: string): Promise<ImportRowRow[]> {
  const supabase = createSupabaseServiceClient()
  return pageRows('listDuplicateRowsByBatch', (from, to) => supabase
    .from('import_rows')
    .select('*')
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('duplicate_status', 'duplicate')
    .order('row_number', { ascending: true })
    .range(from, to))
}

/** Every uncommitted valid+unique row. `maxRows` caps the fetch for chunked commits. */
export async function listCommittableRows(
  batchId: string, tenantId: string, maxRows?: number,
): Promise<ImportRowRow[]> {
  const supabase = createSupabaseServiceClient()
  const query = (from: number, to: number) => supabase
    .from('import_rows')
    .select('*')
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('validation_status', 'valid')
    .eq('duplicate_status', 'unique')
    .neq('commit_status', 'committed')
    .order('row_number', { ascending: true })
    .range(from, to)

  if (maxRows !== undefined) {
    const { data, error } = await query(0, maxRows - 1)
    if (error) throw new Error(`listCommittableRows: ${error.message}`)
    return data ?? []
  }
  return pageRows('listCommittableRows', query)
}

/** Rows left pending at the end of a commit: duplicates and invalids. */
export async function countPendingSkippableRows(batchId: string, tenantId: string): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { count, error } = await supabase
    .from('import_rows')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('commit_status', 'pending')
  if (error) throw new Error(`countPendingSkippableRows: ${error.message}`)
  return count ?? 0
}

/**
 * Mark every still-pending row skipped in ONE statement.
 *
 * This replaced a loop that listed rows (capped at 200 by its default limit, so
 * it silently missed most of a large batch) and issued an UPDATE per row.
 */
export async function markRemainingPendingSkipped(batchId: string, tenantId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('import_rows')
    .update({ commit_status: 'skipped' })
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('commit_status', 'pending')
  if (error) throw new Error(`markRemainingPendingSkipped: ${error.message}`)
}

/**
 * Authoritative count by commit_status, read from the database.
 *
 * A chunked commit cannot report totals from a local accumulator: each chunk is
 * a separate call, so the finalizing chunk only knows its own tally. The first
 * chunked run persisted committed_rows = 16 (the last chunk's 16 rows) for an
 * import that actually wrote 3,416 — the audit record contradicted reality.
 */
export async function countRowsByCommitStatus(
  batchId: string, tenantId: string, status: ImportRowCommitStatus,
): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { count, error } = await supabase
    .from('import_rows')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('commit_status', status)
  if (error) throw new Error(`countRowsByCommitStatus: ${error.message}`)
  return count ?? 0
}

/** Count only — used where the row bodies are not needed. */
export async function countCommittableRows(batchId: string, tenantId: string): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { count, error } = await supabase
    .from('import_rows')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batchId)
    .eq('tenant_id', tenantId)
    .eq('validation_status', 'valid')
    .eq('duplicate_status', 'unique')
    .neq('commit_status', 'committed')
  if (error) throw new Error(`countCommittableRows: ${error.message}`)
  return count ?? 0
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
