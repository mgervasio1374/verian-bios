import { inngest } from '@/lib/inngest/client'
import { findMismatchedEmailDrafts } from '@/modules/workflow/repositories/reconciliation.repo'
import { updateDraftStatus } from '@/modules/messaging/repositories/email-draft.repo'

export interface ReconciliationResult {
  /** Total mismatches found in this run */
  checked: number
  /** Rows successfully corrected */
  corrected: number
  /** Rows that were already correct by the time we attempted the update (concurrent fix) */
  alreadyCorrect: number
  /** Rows that failed to update (DB error) */
  errors: number
}

/**
 * Scheduled reconciliation job — runs every 5 minutes.
 *
 * Finds email_draft rows where the linked approval_request has been decided
 * ('approved' or 'rejected') but the draft is still in 'pending_approval'.
 * This catches the rare case where the post-approval sync in approval.actions.ts
 * failed after the approval_request was already committed.
 *
 * Idempotency:
 *   updateDraftStatus uses `ifCurrentStatus: 'pending_approval'` as a WHERE guard.
 *   If two reconciliation runs overlap, only one update will match — the second
 *   returns false (no rows updated) and is counted as 'alreadyCorrect'.
 *
 * Scope:
 *   Queries across all tenants using the service client (bypasses RLS).
 *   Does NOT modify approval_requests — only corrects email_drafts.
 *   Does NOT send emails or create approval_requests.
 */
export const reconcileEmailDraftStatus = inngest.createFunction(
  {
    id: 'reconcile-email-draft-status',
    name: 'Reconcile Email Draft Status',
    retries: 1,
    triggers: [{ cron: '*/5 * * * *' }],
  },
  async ({ step, logger }) => {
    const result = await step.run('find-and-fix-mismatches', async (): Promise<ReconciliationResult> => {
      // ---- Discover mismatches ----
      const mismatches = await findMismatchedEmailDrafts(100)

      if (mismatches.length === 0) {
        logger.info('Reconciliation: no mismatches found')
        return { checked: 0, corrected: 0, alreadyCorrect: 0, errors: 0 }
      }

      logger.warn('Reconciliation: mismatches found', {
        count: mismatches.length,
        draftIds: mismatches.map(m => m.draftId),
      })

      // ---- Fix each mismatch ----
      let corrected    = 0
      let alreadyCorrect = 0
      let errors       = 0

      for (const mismatch of mismatches) {
        try {
          const now = new Date().toISOString()

          const patch =
            mismatch.approvalStatus === 'approved'
              ? {
                  status:          'approved',
                  approvedAt:      now,
                  // Preserve original approvedBy if recorded on the approval_request
                  approvedBy:      mismatch.approvedBy ?? null,
                  ifCurrentStatus: 'pending_approval',
                }
              : {
                  status:          'rejected',
                  rejectedAt:      now,
                  ifCurrentStatus: 'pending_approval',
                }

          const updated = await updateDraftStatus(mismatch.draftId, patch)

          if (updated) {
            logger.info('Reconciliation: corrected draft', {
              draftId:        mismatch.draftId,
              approvalId:     mismatch.approvalId,
              toStatus:       mismatch.approvalStatus,
              tenantId:       mismatch.tenantId,
              approvalDecidedAt: mismatch.decidedAt,
            })
            corrected++
          } else {
            // The WHERE status='pending_approval' guard matched 0 rows —
            // another process corrected it between our query and update.
            logger.info('Reconciliation: draft already corrected (concurrent fix)', {
              draftId:    mismatch.draftId,
              approvalId: mismatch.approvalId,
            })
            alreadyCorrect++
          }
        } catch (err) {
          logger.error('Reconciliation: failed to correct draft', {
            draftId:    mismatch.draftId,
            approvalId: mismatch.approvalId,
            error:      err instanceof Error ? err.message : String(err),
          })
          errors++
        }
      }

      return {
        checked:       mismatches.length,
        corrected,
        alreadyCorrect,
        errors,
      }
    })

    // Summary log at function level (visible in Inngest dashboard)
    if (result.corrected > 0 || result.errors > 0) {
      logger.warn('Reconciliation complete — corrections applied', result)
    } else {
      logger.info('Reconciliation complete — no corrections needed', result)
    }

    return result
  }
)
