import type { RequestContext } from '@/types/context'
import { getDraftStatusCounts } from '@/modules/messaging/repositories/email-draft.repo'

export interface EmailDraftMetrics {
  total_drafts_created: number
  drafts_pending_approval: number
  drafts_approved: number
  drafts_rejected: number
  drafts_superseded: number
  /**
   * Null until a dedicated logging mechanism is in place.
   * Blocked drafts (safety failures) are not persisted as rows,
   * so they cannot be counted from email_drafts alone.
   */
  drafts_blocked_by_safety: null
}

/**
 * Compute email draft metrics for a tenant from a single status-aggregation query.
 * Each metric is derived by pivoting the status-count result — no N+1 queries.
 */
export async function getEmailDraftMetrics(
  ctx: RequestContext
): Promise<EmailDraftMetrics> {
  const rows = await getDraftStatusCounts(ctx.tenantId)

  const byStatus: Record<string, number> = {}
  for (const { status, count } of rows) {
    byStatus[status] = count
  }

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)

  return {
    total_drafts_created:    total,
    drafts_pending_approval: byStatus['pending_approval'] ?? 0,
    drafts_approved:         byStatus['approved']         ?? 0,
    drafts_rejected:         byStatus['rejected']         ?? 0,
    drafts_superseded:       byStatus['superseded']       ?? 0,
    drafts_blocked_by_safety: null,
  }
}
