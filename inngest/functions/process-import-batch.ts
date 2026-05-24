// Phase 3B.2 — Data Import Foundation: background processing for large imports
// Triggered by 'import/batch.approved' when row count > IMPORT_BACKGROUND_THRESHOLD

import { inngest } from '@/lib/inngest/client'
import { commitBatch } from '@/modules/imports/import.service'
import { IMPORT_BATCH_STATUS } from '@/modules/imports/import.types'
import { getBatch } from '@/modules/imports/repositories/import-batch.repo'

interface ImportBatchApprovedPayload {
  batchId:     string
  tenantId:    string
  workspaceId: string
  approvedBy:  string
  rowCount:    number
}

export const processImportBatch = inngest.createFunction(
  {
    id:      'process-import-batch',
    name:    'Process Import Batch (Background)',
    retries: 1,
    triggers: [{ event: 'import/batch.approved' }],
  },
  async ({ event, step }: { event: { data: ImportBatchApprovedPayload }; step: unknown }) => {
    const { batchId, tenantId, workspaceId } = event.data

    // Verify the batch is still in approved state before committing
    const batch = await getBatch(batchId, tenantId)
    if (!batch) {
      return { ok: false, reason: `Batch ${batchId} not found` }
    }
    if (batch.status !== IMPORT_BATCH_STATUS.APPROVED && batch.status !== IMPORT_BATCH_STATUS.COMMITTING) {
      return { ok: false, reason: `Batch ${batchId} is not in approved state (status: ${batch.status})` }
    }

    const result = await commitBatch(batchId, tenantId, workspaceId)

    return {
      ok:               true,
      committedRows:    result.committedRows,
      skippedRows:      result.skippedRows,
      failedCommitRows: result.failedCommitRows,
    }
  },
)
