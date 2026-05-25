// Phase 3B.2 — Data Import Foundation: orchestration layer

import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import {
  createBatch,
  getBatch,
  updateBatchStatus,
  updateBatchCounts,
  listBatchesForWorkspace,
} from './repositories/import-batch.repo'
import {
  createRows,
  listRowsByBatch,
  listCommittableRows,
  updateRowValidation,
  updateRowDedupe,
  updateRowCommit,
  updateRowNormalizedData,
} from './repositories/import-row.repo'
import { parseFile } from './import.parser'
import { detectColumnMapping, applyMapping } from './import.mapping'
import { normalizeRow } from './import.normalization'
import { validateRow } from './import.validation'
import { checkRowForDuplicates } from './import.dedupe'
import { commitRow } from './import.commit'
import {
  buildImportBatchCreatedPayload,
  buildImportFileParsedPayload,
  buildImportValidationCompletedPayload,
  buildImportDuplicatesDetectedPayload,
  buildImportApprovedPayload,
  buildImportCommitStartedPayload,
  buildImportCommitCompletedPayload,
  buildImportCommitFailedPayload,
  buildImportCanceledPayload,
} from './import.audit'
import {
  IMPORT_BATCH_STATUS,
  IMPORT_BACKGROUND_THRESHOLD,
  type ImportBatchRow,
  type ImportSourceType,
  type ColumnMapping,
} from './import.types'

function emitEvent(
  tenantId:    string,
  workspaceId: string,
  eventType:   string,
  properties:  unknown,
  entityId?:   string,
): void {
  recordActivityEvent({
    tenantId,
    workspaceId,
    eventType,
    eventSource: 'import_service',
    entityType:  'import_batch',
    entityId,
    properties:  properties as Record<string, unknown>,
  }).catch(() => {})
}

// -------------------------------------------------------
// createImportBatch
// -------------------------------------------------------
export async function createImportBatch(input: {
  tenantId:    string
  workspaceId: string
  sourceType:  ImportSourceType
  filename:    string | null
  uploadedBy:  string
}): Promise<{ batchId: string }> {
  const batch = await createBatch({
    tenant_id:    input.tenantId,
    workspace_id: input.workspaceId,
    source_type:  input.sourceType,
    original_filename: input.filename,
    uploaded_by:  input.uploadedBy,
    status:       IMPORT_BATCH_STATUS.UPLOADED,
  })

  const payload = buildImportBatchCreatedPayload({
    batchId:    batch.id,
    tenantId:   input.tenantId,
    sourceType: input.sourceType,
    filename:   input.filename,
    uploadedBy: input.uploadedBy,
  })
  emitEvent(input.tenantId, input.workspaceId, ActivityEventType.IMPORT_BATCH_CREATED, payload, batch.id)

  return { batchId: batch.id }
}

// -------------------------------------------------------
// parseAndStage
// -------------------------------------------------------
export async function parseAndStage(
  batchId:     string,
  tenantId:    string,
  workspaceId: string,
  fileBuffer:  Buffer | ArrayBuffer | string,
  sourceType:  'csv' | 'xlsx',
  columnMapping?: ColumnMapping,
): Promise<{ parsedRows: number; headers: string[]; detectedMapping: ColumnMapping }> {
  const { headers, rows, errors } = parseFile(fileBuffer, sourceType)

  const detectedMapping = columnMapping ?? detectColumnMapping(headers)

  const rowInserts = rows.map((raw, i) => ({
    import_batch_id:  batchId,
    tenant_id:        tenantId,
    workspace_id:     workspaceId,
    row_number:       i + 1,
    raw_data:         raw as unknown as import('@/types/database').Database['public']['Tables']['import_rows']['Insert']['raw_data'],
    normalized_data:  {} as unknown as import('@/types/database').Database['public']['Tables']['import_rows']['Insert']['normalized_data'],
  }))

  await createRows(rowInserts)

  await updateBatchStatus(batchId, tenantId, IMPORT_BATCH_STATUS.PARSED, {
    total_rows:   rows.length,
    parsed_rows:  rows.length,
    column_mapping: detectedMapping as unknown as import('@/types/database').Database['public']['Tables']['import_batches']['Update']['column_mapping'],
  })

  const payload = buildImportFileParsedPayload({
    batchId,
    tenantId,
    totalRows:  rows.length,
    parsedRows: rows.length,
  })
  emitEvent(tenantId, workspaceId, ActivityEventType.IMPORT_FILE_PARSED, payload, batchId)

  if (errors.length > 0) {
    console.warn(`parseAndStage: parse warnings for batch ${batchId}:`, errors)
  }

  return { parsedRows: rows.length, headers, detectedMapping }
}

// -------------------------------------------------------
// validateBatch
// -------------------------------------------------------
export async function validateBatch(
  batchId:     string,
  tenantId:    string,
  workspaceId: string,
  columnMapping: ColumnMapping,
): Promise<{ validRows: number; invalidRows: number }> {
  let offset = 0
  const pageSize = 200
  let validRows = 0
  let invalidRows = 0

  while (true) {
    const rows = await listRowsByBatch(batchId, tenantId, pageSize, offset)
    if (rows.length === 0) break

    for (const row of rows) {
      const rawData = (row.raw_data as unknown as Record<string, unknown>) ?? {}
      const normalized = normalizeRow(rawData, columnMapping)
      const { status, errors } = validateRow(normalized)

      await updateRowNormalizedData(row.id, normalized as unknown as Record<string, unknown>)
      await updateRowValidation(row.id, status, errors)

      if (status === 'valid') validRows++
      else invalidRows++
    }

    if (rows.length < pageSize) break
    offset += pageSize
  }

  const newStatus = invalidRows > 0 && validRows === 0
    ? IMPORT_BATCH_STATUS.VALIDATION_FAILED
    : IMPORT_BATCH_STATUS.VALIDATED

  await updateBatchStatus(batchId, tenantId, newStatus)
  await updateBatchCounts(batchId, tenantId, { valid_rows: validRows, invalid_rows: invalidRows })

  const payload = buildImportValidationCompletedPayload({ batchId, tenantId, validRows, invalidRows })
  emitEvent(tenantId, workspaceId, ActivityEventType.IMPORT_VALIDATION_COMPLETED, payload, batchId)

  return { validRows, invalidRows }
}

// -------------------------------------------------------
// dedupeBatch
// -------------------------------------------------------
export async function dedupeBatch(
  batchId:     string,
  tenantId:    string,
  workspaceId: string,
): Promise<{ duplicateRows: number; uniqueRows: number }> {
  let offset = 0
  const pageSize = 200
  let duplicateRows = 0
  let uniqueRows = 0

  while (true) {
    const rows = await listRowsByBatch(batchId, tenantId, pageSize, offset)
    if (rows.length === 0) break

    for (const row of rows) {
      if (row.validation_status !== 'valid') continue
      const normalized = row.normalized_data as unknown as import('./import.types').NormalizedImportRow
      const { status, matches } = await checkRowForDuplicates(normalized, tenantId, batchId)
      await updateRowDedupe(row.id, status, matches)
      if (status === 'duplicate') duplicateRows++
      else uniqueRows++
    }

    if (rows.length < pageSize) break
    offset += pageSize
  }

  await updateBatchStatus(batchId, tenantId, IMPORT_BATCH_STATUS.NEEDS_REVIEW)
  await updateBatchCounts(batchId, tenantId, { duplicate_rows: duplicateRows })

  const payload = buildImportDuplicatesDetectedPayload({ batchId, tenantId, duplicateRows, uniqueRows })
  emitEvent(tenantId, workspaceId, ActivityEventType.IMPORT_DUPLICATES_DETECTED, payload, batchId)

  return { duplicateRows, uniqueRows }
}

// -------------------------------------------------------
// approveBatch
// -------------------------------------------------------
export async function approveBatch(
  batchId:     string,
  tenantId:    string,
  workspaceId: string,
  userId:      string,
): Promise<{ async: boolean; validUniqueRows: number }> {
  const batch = await getBatch(batchId, tenantId)
  if (!batch) throw new Error(`approveBatch: batch ${batchId} not found`)

  const committableRows = await listCommittableRows(batchId, tenantId)
  const validUniqueRows = committableRows.length

  const isAsync = validUniqueRows > IMPORT_BACKGROUND_THRESHOLD

  await updateBatchStatus(batchId, tenantId, IMPORT_BATCH_STATUS.APPROVED, {
    approved_by: userId,
    approved_at: new Date().toISOString(),
  })

  const payload = buildImportApprovedPayload({
    batchId,
    tenantId,
    approvedBy: userId,
    rowCount:   validUniqueRows,
    async:      isAsync,
  })
  emitEvent(tenantId, workspaceId, ActivityEventType.IMPORT_APPROVED, payload, batchId)

  return { async: isAsync, validUniqueRows }
}

// -------------------------------------------------------
// commitBatch
// -------------------------------------------------------
export async function commitBatch(
  batchId:     string,
  tenantId:    string,
  workspaceId: string,
): Promise<{ committedRows: number; skippedRows: number; failedCommitRows: number }> {
  try {
    const batch = await getBatch(batchId, tenantId)
    if (!batch) throw new Error(`commitBatch: batch ${batchId} not found`)
    if (batch.status !== IMPORT_BATCH_STATUS.APPROVED && batch.status !== IMPORT_BATCH_STATUS.COMMITTING) {
      throw new Error(`commitBatch: batch ${batchId} is not in approved state (status: ${batch.status})`)
    }

    await updateBatchStatus(batchId, tenantId, IMPORT_BATCH_STATUS.COMMITTING)

    const startPayload = buildImportCommitStartedPayload({ batchId, tenantId })
    emitEvent(tenantId, workspaceId, ActivityEventType.IMPORT_COMMIT_STARTED, startPayload, batchId)

    const committableRows = await listCommittableRows(batchId, tenantId)
    let committedRows = 0
    let skippedRows = 0
    let failedCommitRows = 0

    for (const row of committableRows) {
      const normalized = row.normalized_data as unknown as import('./import.types').NormalizedImportRow
      const result = await commitRow(normalized, {
        tenantId,
        workspaceId,
        batchId,
        rowId: row.id,
      })

      if ('error' in result) {
        await updateRowCommit(row.id, 'failed', { commitError: result.error })
        failedCommitRows++
      } else {
        await updateRowCommit(row.id, 'committed', {
          targetCompanyId: result.companyId,
          targetContactId: result.contactId,
          targetLeadId:    result.leadId,
        })
        committedRows++
      }
    }

    // Rows that were duplicate or invalid → skipped
    const allRows = await listRowsByBatch(batchId, tenantId)
    skippedRows = allRows.filter(r =>
      r.commit_status === 'pending' &&
      (r.duplicate_status === 'duplicate' || r.validation_status === 'invalid')
    ).length
    for (const row of allRows) {
      if (row.commit_status === 'pending') {
        await updateRowCommit(row.id, 'skipped')
      }
    }

    const finalStatus = failedCommitRows > 0 && committedRows === 0
      ? IMPORT_BATCH_STATUS.FAILED
      : failedCommitRows > 0
        ? IMPORT_BATCH_STATUS.PARTIALLY_COMMITTED
        : IMPORT_BATCH_STATUS.COMMITTED

    await updateBatchStatus(batchId, tenantId, finalStatus, {
      committed_at: new Date().toISOString(),
    })
    await updateBatchCounts(batchId, tenantId, {
      committed_rows:     committedRows,
      failed_commit_rows: failedCommitRows,
    })

    if (finalStatus === IMPORT_BATCH_STATUS.FAILED) {
      const failPayload = buildImportCommitFailedPayload({ batchId, tenantId, error: 'All rows failed to commit' })
      emitEvent(tenantId, workspaceId, ActivityEventType.IMPORT_COMMIT_FAILED, failPayload, batchId)
    } else {
      const donePayload = buildImportCommitCompletedPayload({ batchId, tenantId, committedRows, skippedRows, failedCommitRows })
      emitEvent(tenantId, workspaceId, ActivityEventType.IMPORT_COMMIT_COMPLETED, donePayload, batchId)
    }

    return { committedRows, skippedRows, failedCommitRows }
  } catch (err) {
    createStructuredError({
      tenantId,
      workspaceId,
      failureType:     'IMPORT_COMMIT_FAILURE',
      severity:        'error',
      module:          'imports',
      errorMessage:    err instanceof Error ? err.message : String(err),
      payloadSnapshot: { batchId },
    }).catch(() => {})
    throw err
  }
}

// -------------------------------------------------------
// cancelBatch
// -------------------------------------------------------
export async function cancelBatch(
  batchId:     string,
  tenantId:    string,
  workspaceId: string,
  userId:      string,
): Promise<void> {
  await updateBatchStatus(batchId, tenantId, IMPORT_BATCH_STATUS.CANCELED, {
    canceled_at: new Date().toISOString(),
  })

  const payload = buildImportCanceledPayload({ batchId, tenantId, canceledBy: userId })
  emitEvent(tenantId, workspaceId, ActivityEventType.IMPORT_CANCELED, payload, batchId)
}

// -------------------------------------------------------
// getBatchPreview (read-only summary)
// -------------------------------------------------------
export async function getBatchPreview(
  batchId:  string,
  tenantId: string,
): Promise<ImportBatchRow | null> {
  return getBatch(batchId, tenantId)
}

export { listBatchesForWorkspace }
