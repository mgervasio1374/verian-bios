import { createSupabaseServiceClient } from '@/lib/supabase/service'

export interface DraftMismatch {
  /** The approval_request that has already been decided */
  approvalId: string
  /** The decision that was made on the approval */
  approvalStatus: 'approved' | 'rejected'
  /** When the approval was decided */
  decidedAt: string | null
  /** Who approved it (null for system or if not recorded) */
  approvedBy: string | null
  /** The linked email_draft that is still stuck in pending_approval */
  draftId: string
  /** Tenant that owns both records */
  tenantId: string
}

/**
 * Find email_draft rows that are out of sync with their approval_request.
 *
 * A mismatch exists when:
 *   approval_requests.status IN ('approved', 'rejected')
 *   AND email_drafts.status = 'pending_approval'
 *   for the same draft_id (stored in approval_requests.payload->draft_id).
 *
 * Two queries, no N+1:
 *   1. Fetch recently-decided email_draft_review approvals (limit rows, ordered newest first).
 *   2. Of the linked draft IDs, fetch those still pending_approval.
 *   3. Join in application code.
 */
export async function findMismatchedEmailDrafts(limit = 100): Promise<DraftMismatch[]> {
  const supabase = createSupabaseServiceClient()

  // Query 1 — resolved email_draft_review approvals
  const { data: approvals, error: err1 } = await supabase
    .from('approval_requests')
    .select('id, status, decided_at, approved_by, payload, tenant_id')
    .eq('request_type', 'email_draft_review')
    .in('status', ['approved', 'rejected'])
    .not('decided_at', 'is', null)
    .order('decided_at', { ascending: false })
    .limit(limit)

  if (err1) throw new Error(`reconciliation query1: ${err1.message}`)
  if (!approvals?.length) return []

  // Build draft_id → approval map (skip entries with no draft_id in payload)
  const approvalByDraftId = new Map<string, typeof approvals[0]>()
  for (const a of approvals) {
    const raw = a.payload as Record<string, unknown> | null
    const draftId = typeof raw?.draft_id === 'string' ? raw.draft_id : null
    if (draftId) approvalByDraftId.set(draftId, a)
  }
  if (approvalByDraftId.size === 0) return []

  // Query 2 — which of those drafts are still stuck in pending_approval?
  const { data: pendingDrafts, error: err2 } = await supabase
    .from('email_drafts')
    .select('id')
    .in('id', [...approvalByDraftId.keys()])
    .eq('status', 'pending_approval')
    .is('deleted_at', null)

  if (err2) throw new Error(`reconciliation query2: ${err2.message}`)
  if (!pendingDrafts?.length) return []

  // Join in application code
  return pendingDrafts.map(d => {
    const approval = approvalByDraftId.get(d.id)!
    return {
      approvalId:     approval.id,
      approvalStatus: approval.status as 'approved' | 'rejected',
      decidedAt:      approval.decided_at,
      approvedBy:     approval.approved_by ?? null,
      draftId:        d.id,
      tenantId:       approval.tenant_id,
    }
  })
}
