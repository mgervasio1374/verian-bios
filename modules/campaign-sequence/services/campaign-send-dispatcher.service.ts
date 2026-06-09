import { buildSystemContext } from '@/lib/auth/context'
import { sendApprovedDraft } from '@/modules/messaging/services/email-send.service'
import { updateScheduleItemStatus } from '@/modules/campaign-sequence/services/campaign-schedule-item.service'
import type { CampaignScheduleItemRow } from '@/modules/campaign-sequence/types'
import {
  classifySendOutcome,
  shouldCompleteAssignment,
} from '@/modules/campaign-sequence/services/campaign-send-dispatcher.helpers'

// Re-export so callers and tests can import from a single place
export {
  classifySendOutcome,
  shouldCompleteAssignment,
  DEFERRED_SEND_REASONS,
} from '@/modules/campaign-sequence/services/campaign-send-dispatcher.helpers'
export type { SendOutcomeClassification } from '@/modules/campaign-sequence/services/campaign-send-dispatcher.helpers'

export interface SendDispatchCtx {
  tenantId: string
  workspaceId: string
}

export type DispatchSendResult =
  | { outcome: 'sent' }
  | { outcome: 'deferred'; reason: string }
  | { outcome: 'failed';   reason: string }
  | { outcome: 'skipped';  reason: string }

/**
 * Dispatch a single approved schedule item via sendApprovedDraft.
 *
 * Idempotency relies on sendApprovedDraft's own getBlockingSendForDraft:
 *   - crash between Resend call and item status update → next tick gets alreadySent → 'sent'
 *   - item already 'sent'                              → idempotency guard returns early
 *
 * Does NOT call Resend directly. Does NOT bypass or weaken any sendApprovedDraft guard.
 * Outcome transitions:
 *   'sent'     → approved -> sent
 *   'failed'   → approved -> failed  (with status_reason)
 *   'deferred' → no transition (leave 'approved', retry next tick)
 */
export async function dispatchScheduleItemSend(
  item: CampaignScheduleItemRow,
  ctx: SendDispatchCtx,
): Promise<DispatchSendResult> {
  if (item.status !== 'approved') {
    return { outcome: 'skipped', reason: 'not_approved' }
  }
  if (!item.email_draft_id) {
    return { outcome: 'skipped', reason: 'no_email_draft_id' }
  }

  try {
    const sendCtx = buildSystemContext(ctx.tenantId, ctx.workspaceId)
    const result  = await sendApprovedDraft(sendCtx, item.email_draft_id)
    const classification = classifySendOutcome(result)

    if (classification === 'sent') {
      await updateScheduleItemStatus(item.id, ctx.tenantId, ctx.workspaceId, 'sent')
      return { outcome: 'sent' }
    }

    if (classification === 'failed') {
      const reason = !result.ok ? result.reason : 'send_failed'
      await updateScheduleItemStatus(item.id, ctx.tenantId, ctx.workspaceId, 'failed', {
        status_reason: reason,
      })
      return { outcome: 'failed', reason }
    }

    // deferred: leave item in 'approved', do not call updateScheduleItemStatus
    const reason = !result.ok ? result.reason : 'deferred'
    return { outcome: 'deferred', reason }

  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown_error'
    return { outcome: 'failed', reason }
  }
}
