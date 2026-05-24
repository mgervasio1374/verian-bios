'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { inngest } from '@/lib/inngest/client'
import {
  createImportBatch,
  parseAndStage,
  validateBatch,
  dedupeBatch,
  approveBatch,
  commitBatch,
  cancelBatch,
  getBatchPreview,
  listBatchesForWorkspace,
} from '../import.service'
import { IMPORT_SOURCE_TYPE, type ImportSourceType, type ImportBatchRow } from '../import.types'
import type { ColumnMapping } from '../import.types'

export type ImportActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// -------------------------------------------------------
// createImportBatchAction
// Handles file upload, creates batch, triggers parse+validate
// -------------------------------------------------------
export async function createImportBatchAction(
  formData: FormData,
): Promise<ImportActionResult<{ batchId: string; headers: string[]; detectedMapping: ColumnMapping }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const file = formData.get('file') as File | null
    if (!file) return { success: false, error: 'No file provided' }

    const filename = file.name
    const ext = filename.split('.').pop()?.toLowerCase()
    const sourceType: ImportSourceType = ext === 'xlsx' ? IMPORT_SOURCE_TYPE.XLSX : IMPORT_SOURCE_TYPE.CSV

    const { batchId } = await createImportBatch({
      tenantId:    ctx.tenantId,
      workspaceId: ctx.workspaceId,
      sourceType,
      filename,
      uploadedBy:  ctx.userId,
    })

    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const { headers, detectedMapping } = await parseAndStage(
      batchId,
      ctx.tenantId,
      ctx.workspaceId,
      fileBuffer,
      sourceType === IMPORT_SOURCE_TYPE.XLSX ? 'xlsx' : 'csv',
    )

    await validateBatch(batchId, ctx.tenantId, ctx.workspaceId, detectedMapping)
    await dedupeBatch(batchId, ctx.tenantId, ctx.workspaceId)

    return { success: true, data: { batchId, headers, detectedMapping } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -------------------------------------------------------
// approveAndCommitAction
// Approves batch; dispatches to Inngest if > threshold; else commits inline
// -------------------------------------------------------
export async function approveAndCommitAction(
  batchId: string,
): Promise<ImportActionResult<{ async: boolean; committedRows?: number }>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const { async: isAsync, validUniqueRows } = await approveBatch(
      batchId,
      ctx.tenantId,
      ctx.workspaceId,
      ctx.userId,
    )

    if (isAsync) {
      await inngest.send({
        name: 'import/batch.approved',
        data: {
          batchId,
          tenantId:    ctx.tenantId,
          workspaceId: ctx.workspaceId,
          approvedBy:  ctx.userId,
          rowCount:    validUniqueRows,
        },
      })
      return { success: true, data: { async: true } }
    }

    const { committedRows } = await commitBatch(batchId, ctx.tenantId, ctx.workspaceId)
    return { success: true, data: { async: false, committedRows } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -------------------------------------------------------
// cancelImportBatchAction
// -------------------------------------------------------
export async function cancelImportBatchAction(
  batchId: string,
): Promise<ImportActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    await cancelBatch(batchId, ctx.tenantId, ctx.workspaceId, ctx.userId)
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -------------------------------------------------------
// getImportBatchDetailAction
// Read-only: returns batch for UI
// -------------------------------------------------------
export async function getImportBatchDetailAction(
  batchId: string,
): Promise<ImportActionResult<ImportBatchRow | null>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const batch = await getBatchPreview(batchId, ctx.tenantId)
    return { success: true, data: batch }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// -------------------------------------------------------
// listImportBatchesAction
// -------------------------------------------------------
export async function listImportBatchesAction(): Promise<ImportActionResult<ImportBatchRow[]>> {
  try {
    const supabase = await createSupabaseServerClient()
    const ctx = await buildRequestContext(supabase)
    requirePermission(ctx, 'crm.companies.view')

    const batches = await listBatchesForWorkspace(ctx.tenantId, ctx.workspaceId)
    return { success: true, data: batches }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
