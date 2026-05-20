import { createSupabaseServiceClient } from '@/lib/supabase/service'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'

// ---- Types ----

export interface ReconciliationDetail {
  recommendationId: string
  leadId:           string
  title:            string
  evidence:         'email_sent' | 'approval_approved'
  evidenceId:       string   // draft_id or approval_request_id
}

export interface ReconciliationResult {
  scanned:   number
  completed: number
  skipped:   number
  details:   ReconciliationDetail[]
}

// ---- Main function ----

// Scans pending lead-level recommendations and completes any where the
// underlying action is already done (email sent or approval approved).
// Safe to call multiple times — already-resolved rows are excluded by the
// status filter and will be counted as skipped.
export async function reconcileCompletedLeadRecommendations(
  tenantId: string
): Promise<ReconciliationResult> {
  const supabase = createSupabaseServiceClient()

  // 1. Load all pending lead recommendations for this tenant (cap at 200)
  const { data: pendingRecs, error: recErr } = await supabase
    .from('agent_recommendations')
    .select('id, subject_id, title, workflow_run_id')
    .eq('tenant_id', tenantId)
    .eq('subject_type', 'lead')
    .in('status', ['pending', 'new', 'reviewed'])
    .order('created_at', { ascending: false })
    .limit(200)

  if (recErr) throw new Error(`reconciliation: failed to load recs: ${recErr.message}`)
  if (!pendingRecs?.length) return { scanned: 0, completed: 0, skipped: 0, details: [] }

  const leadIds = [...new Set(pendingRecs.map(r => r.subject_id).filter(Boolean))] as string[]

  // 2. Batch-load completion evidence in parallel
  const [{ data: sentDrafts }, { data: approvedRequests }] = await Promise.all([
    supabase
      .from('email_drafts')
      .select('id, lead_id, sent_at')
      .eq('tenant_id', tenantId)
      .in('lead_id', leadIds)
      .eq('status', 'sent'),

    supabase
      .from('approval_requests')
      .select('id, subject_id, request_type, decided_at')
      .eq('tenant_id', tenantId)
      .eq('subject_type', 'lead')
      .in('subject_id', leadIds)
      .in('status', ['approved', 'completed'])
      .in('request_type', ['email_draft_review', 'statement_proposal_review']),
  ])

  // Build evidence maps: leadId → first matching evidence record
  const sentDraftByLead   = new Map<string, string>()   // leadId → draftId
  const approvedReqByLead = new Map<string, string>()   // leadId → approvalId

  sentDrafts?.forEach(d => {
    if (d.lead_id && !sentDraftByLead.has(d.lead_id)) sentDraftByLead.set(d.lead_id, d.id)
  })
  approvedRequests?.forEach(r => {
    if (!approvedReqByLead.has(r.subject_id)) approvedReqByLead.set(r.subject_id, r.id)
  })

  // 3. Classify each recommendation
  const toComplete: Array<{ rec: typeof pendingRecs[0]; detail: ReconciliationDetail }> = []

  for (const rec of pendingRecs) {
    const leadId = rec.subject_id
    const sentDraftId   = sentDraftByLead.get(leadId)
    const approvedReqId = approvedReqByLead.get(leadId)

    if (sentDraftId) {
      toComplete.push({
        rec,
        detail: {
          recommendationId: rec.id,
          leadId,
          title:            rec.title,
          evidence:         'email_sent',
          evidenceId:       sentDraftId,
        },
      })
    } else if (approvedReqId) {
      toComplete.push({
        rec,
        detail: {
          recommendationId: rec.id,
          leadId,
          title:            rec.title,
          evidence:         'approval_approved',
          evidenceId:       approvedReqId,
        },
      })
    }
  }

  if (!toComplete.length) {
    return { scanned: pendingRecs.length, completed: 0, skipped: pendingRecs.length, details: [] }
  }

  // 4. Mark completable recommendations as accepted/acted_on in a single update
  const now = new Date().toISOString()
  const idsToComplete = toComplete.map(x => x.rec.id)

  const { error: updateErr } = await supabase
    .from('agent_recommendations')
    .update({
      status:         'accepted',
      outcome_status: 'acted_on',
      outcome_notes:  'Completed via reconciliation: email/approval action already completed.',
      outcome_at:     now,
      accepted_at:    now,
      resolved_at:    now,
    })
    .in('id', idsToComplete)
    .in('status', ['pending', 'new', 'reviewed'])

  if (updateErr) throw new Error(`reconciliation: update failed: ${updateErr.message}`)

  // 5. Record activity events (non-fatal — reconciliation already committed)
  await Promise.all(
    toComplete.map(({ detail }) =>
      activityEventService.recordActivity({
        tenantId,
        eventType:    ActivityEventType.RECOMMENDATION_COMPLETED,
        eventSource:  'reconciliation',
        entityType:   'lead',
        entityId:     detail.leadId,
        leadId:       detail.leadId,
        eventSummary: `Recommendation completed by reconciliation after detecting ${detail.evidence === 'email_sent' ? 'sent email' : 'approved request'}`,
        metadata: {
          recommendation_id:  detail.recommendationId,
          lead_id:            detail.leadId,
          evidence_type:      detail.evidence,
          evidence_id:        detail.evidenceId,
          email_draft_id:     detail.evidence === 'email_sent'        ? detail.evidenceId : null,
          approval_request_id: detail.evidence === 'approval_approved' ? detail.evidenceId : null,
          reconciliation_reason: 'recommendation_was_pending_after_action_completed',
        },
      }).catch(() => null)
    )
  )

  return {
    scanned:   pendingRecs.length,
    completed: toComplete.length,
    skipped:   pendingRecs.length - toComplete.length,
    details:   toComplete.map(x => x.detail),
  }
}
