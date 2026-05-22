import { inngest } from '@/lib/inngest/client'
import { runSebReconciliation } from '@/modules/messaging/send-bridge/send-bridge-reconciliation.service'
import type { SebReconciliationResult } from '@/modules/messaging/send-bridge/send-bridge-reconciliation.types'

/**
 * Phase 3B.1 — Scheduled SEB stuck-draft reconciliation — runs every 15 minutes.
 *
 * Detects three stuck states left by a partial Send Bridge write sequence:
 *
 *   State A — Phase 3B pending_approval draft with no approval_request_id (report-only).
 *             Cause: draft created; approval_request creation failed.
 *             Fix: none — requires operator investigation; SEB_011 prevents re-creation.
 *
 *   State B — Phase 3B pending_approval draft linked to a pending approval_request (report-only).
 *             Cause: draft linked; approval_request resolution failed.
 *             Fix: none — never auto-resolves approval_requests.
 *
 *   State C — Phase 3B approved draft with unsuperseded pending siblings for same lead (auto-fix).
 *             Cause: draft approved; supersede step failed.
 *             Fix: calls the idempotent supersedePendingDraftsForLead.
 *
 * GUARDRAILS:
 *   Does NOT send email.
 *   Does NOT create email_drafts.
 *   Does NOT create email_sends.
 *   Does NOT auto-resolve approval_requests.
 *   Does NOT modify message_version content.
 *   Does NOT call Resend.
 */
export const reconcileSendBridgeStuckDrafts = inngest.createFunction(
  {
    id: 'reconcile-send-bridge-stuck-drafts',
    name: 'Reconcile Send Bridge Stuck Drafts',
    retries: 1,
    triggers: [{ cron: '*/15 * * * *' }],
  },
  async ({ step, logger }) => {
    const result = await step.run('detect-and-fix-stuck-drafts', async (): Promise<SebReconciliationResult> => {
      return runSebReconciliation()
    })

    // State A and B: log as warnings (report-only)
    if (result.stateA.found > 0) {
      logger.warn('SEB Reconciler: State A stuck drafts detected (no approval_request_id) — report-only', {
        found: result.stateA.found,
        note:  'These drafts cannot be sent until resolved. Requires operator investigation.',
      })
    }
    if (result.stateB.found > 0) {
      logger.warn('SEB Reconciler: State B stuck drafts detected (pending approval_request) — report-only', {
        found: result.stateB.found,
        note:  'Approval_request must be resolved by operator. Not auto-fixed in v1.',
      })
    }

    // State C: log fixes and errors
    if (result.stateC.fixed > 0) {
      logger.info('SEB Reconciler: State C auto-fixed (unsuperseded pending drafts superseded)', {
        found: result.stateC.found,
        fixed: result.stateC.fixed,
      })
    }
    if (result.stateC.errors > 0) {
      logger.error('SEB Reconciler: State C fix encountered errors', {
        found:  result.stateC.found,
        fixed:  result.stateC.fixed,
        errors: result.stateC.errors,
      })
    }

    if (result.stateA.found === 0 && result.stateB.found === 0 && result.stateC.found === 0) {
      logger.info('SEB Reconciler: no stuck drafts found')
    }

    return result
  }
)
