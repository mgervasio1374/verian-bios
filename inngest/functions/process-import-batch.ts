// Phase 3B.2 — Data Import Foundation: background processing for large imports
// Triggered by 'import/batch.approved' when row count > IMPORT_BACKGROUND_THRESHOLD

import { inngest } from '@/lib/inngest/client'
import { commitBatch } from '@/modules/imports/import.service'
import { IMPORT_BATCH_STATUS } from '@/modules/imports/import.types'
import { getBatch } from '@/modules/imports/repositories/import-batch.repo'
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'

// Measured, not guessed. A 3,416-row commit against a local Postgres took
// 616s across 18 chunks of 200 — about 34s per chunk, already most of the 60s
// function ceiling before any network latency is added. 100 halves that to give
// real headroom; ~34 chunks for a file this size, each its own Inngest step.
//
// The underlying cost is commitRow's up-to-six round trips per row. Batching the
// company/contact/lead inserts would cut this by an order of magnitude and is
// the right follow-up; chunking makes it correct first.
const COMMIT_CHUNK_ROWS = 100

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

    // Commit in chunks, one Inngest step each, because a row costs up to six
    // round trips and a few thousand rows cannot fit in a single serverless
    // invocation. Each step gets a fresh function budget, and commitBatch only
    // finalizes the batch on the chunk that clears the queue.
    const runStep = (step as { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }).run

    let committedRows = 0
    let skippedRows = 0
    let failedCommitRows = 0
    let chunks = 0

    // Backstop: 3,618 rows at 200 per chunk is ~19 steps. 100 bounds a runaway
    // loop if `remaining` ever failed to decrease.
    while (chunks < 100) {
      chunks++
      let result: Awaited<ReturnType<typeof commitBatch>>
      try {
        result = await runStep(`commit-chunk-${chunks}`, () =>
          commitBatch(batchId, tenantId, workspaceId, { maxRows: COMMIT_CHUNK_ROWS }))
      } catch (err) {
        createStructuredError({
          tenantId,
          workspaceId,
          failureType:     'INNGEST_IMPORT_BATCH_FAILURE',
          severity:        'critical',
          module:          'imports',
          errorMessage:    err instanceof Error ? err.message : String(err),
          payloadSnapshot: { batchId, chunk: chunks, committedSoFar: committedRows },
        }).catch(() => {})
        throw err
      }

      committedRows    += result.committedRows
      failedCommitRows += result.failedCommitRows
      skippedRows       = result.skippedRows   // only the final chunk reports this

      if (result.remaining === 0) break

      // No progress and rows still outstanding would spin forever: every
      // remaining row is failing in a way that leaves it committable.
      if (result.committedRows === 0 && result.failedCommitRows === 0) {
        createStructuredError({
          tenantId,
          workspaceId,
          failureType:     'INNGEST_IMPORT_BATCH_FAILURE',
          severity:        'error',
          module:          'imports',
          errorMessage:    `Import commit stalled: ${result.remaining} rows remain but a chunk committed none`,
          payloadSnapshot: { batchId, chunk: chunks, remaining: result.remaining },
        }).catch(() => {})
        break
      }
    }

    return { ok: true, committedRows, skippedRows, failedCommitRows, chunks }
  },
)
