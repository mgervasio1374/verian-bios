// ============================================================
// Phase 3B.1 — Send Bridge Reconciliation Service
//
// Detects three stuck states left by a partial Send Bridge write sequence.
// State A and B: report-only (no writes).
// State C: auto-fix via idempotent supersedePendingDraftsForLead.
//
// GUARDRAILS ENFORCED HERE:
//   - Never sends email
//   - Never creates email_drafts
//   - Never creates email_sends
//   - Never auto-resolves approval_requests
//   - Never modifies message_version content
//   - Never calls Resend
// ============================================================

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { supersedePendingDraftsForLead } from '@/modules/messaging/repositories/email-draft.repo'
import type {
  StuckDraftStateA,
  StuckDraftStateB,
  StuckStateC,
  SebReconciliationResult,
} from './send-bridge-reconciliation.types'

// Grace period: ignore drafts younger than this to avoid flagging in-progress SEB runs.
const GRACE_PERIOD_MINUTES = 10

function graceThreshold(): string {
  return new Date(Date.now() - GRACE_PERIOD_MINUTES * 60 * 1000).toISOString()
}

// ---- State A detection ----
// Phase 3B pending_approval draft with no approval_request_id, older than grace period.

async function detectStateA(): Promise<StuckDraftStateA[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_drafts')
    .select('id, tenant_id, lead_id, created_at')
    .eq('status', 'pending_approval')
    .is('approval_request_id', null)
    .is('deleted_at', null)
    .filter('ai_generation_metadata->>source', 'eq', 'phase_3b_send_bridge')
    .lt('created_at', graceThreshold())
    .limit(50)

  if (error) throw new Error(`detectStateA: ${error.message}`)
  return (data ?? []).map(row => ({
    draftId:   row.id,
    tenantId:  row.tenant_id,
    leadId:    row.lead_id ?? null,
    createdAt: row.created_at,
  }))
}

// ---- State B detection ----
// Phase 3B pending_approval draft linked to a PENDING approval_request, older than grace period.
// Two-step: first find Phase 3B pending drafts with an approval_request_id,
// then check which linked approval_requests are still pending.

async function detectStateB(): Promise<StuckDraftStateB[]> {
  const supabase = createSupabaseServiceClient()

  // Step 1: Find Phase 3B pending_approval drafts with a non-null approval_request_id
  const { data: drafts, error: draftErr } = await supabase
    .from('email_drafts')
    .select('id, tenant_id, lead_id, approval_request_id, created_at')
    .eq('status', 'pending_approval')
    .not('approval_request_id', 'is', null)
    .is('deleted_at', null)
    .filter('ai_generation_metadata->>source', 'eq', 'phase_3b_send_bridge')
    .lt('created_at', graceThreshold())
    .limit(50)

  if (draftErr) throw new Error(`detectStateB (drafts): ${draftErr.message}`)
  if (!drafts || drafts.length === 0) return []

  const approvalRequestIds = drafts
    .map(d => d.approval_request_id)
    .filter((id): id is string => id !== null)

  if (approvalRequestIds.length === 0) return []

  // Step 2: Find which of those approval_requests are still pending
  const { data: pendingApprovals, error: arErr } = await supabase
    .from('approval_requests')
    .select('id')
    .in('id', approvalRequestIds)
    .eq('status', 'pending')
    .eq('request_type', 'email_draft_review')

  if (arErr) throw new Error(`detectStateB (approval_requests): ${arErr.message}`)

  const pendingIds = new Set((pendingApprovals ?? []).map(r => r.id))

  return drafts
    .filter(d => d.approval_request_id && pendingIds.has(d.approval_request_id))
    .map(d => ({
      draftId:           d.id,
      tenantId:          d.tenant_id,
      leadId:            d.lead_id ?? null,
      approvalRequestId: d.approval_request_id as string,
      createdAt:         d.created_at,
    }))
}

// ---- State C detection ----
// Phase 3B approved draft exists AND the same lead has older pending/pending_approval
// siblings that were never superseded.
// Two-step: find approved Phase 3B drafts, then check for pending siblings per lead.

async function detectStateC(): Promise<StuckStateC[]> {
  const supabase = createSupabaseServiceClient()

  // Step 1: Find all Phase 3B approved drafts
  const { data: approvedDrafts, error: approvedErr } = await supabase
    .from('email_drafts')
    .select('id, tenant_id, lead_id')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .filter('ai_generation_metadata->>source', 'eq', 'phase_3b_send_bridge')
    .limit(100)

  if (approvedErr) throw new Error(`detectStateC (approved): ${approvedErr.message}`)
  if (!approvedDrafts || approvedDrafts.length === 0) return []

  const stateCItems: StuckStateC[] = []

  for (const approved of approvedDrafts) {
    if (!approved.lead_id) continue

    // Step 2: Check for pending siblings for the same lead
    const { data: siblings } = await supabase
      .from('email_drafts')
      .select('id')
      .eq('tenant_id', approved.tenant_id)
      .eq('lead_id', approved.lead_id)
      .in('status', ['pending', 'pending_approval'])
      .is('deleted_at', null)
      .neq('id', approved.id)
      .limit(1)

    if (siblings && siblings.length > 0) {
      stateCItems.push({
        tenantId:        approved.tenant_id,
        leadId:          approved.lead_id,
        approvedDraftId: approved.id,
      })
    }
  }

  return stateCItems
}

// ---- Main export ----

export async function runSebReconciliation(): Promise<SebReconciliationResult> {
  const ranAt = new Date().toISOString()

  // State A — detect and report only
  const stateAItems = await detectStateA()

  // State B — detect and report only
  const stateBItems = await detectStateB()

  // State C — detect and auto-fix
  const stateCItems = await detectStateC()
  let stateCFixed  = 0
  let stateCErrors = 0

  for (const item of stateCItems) {
    try {
      await supersedePendingDraftsForLead(item.tenantId, item.leadId)
      stateCFixed++
    } catch {
      stateCErrors++
    }
  }

  return {
    stateA: {
      found:    stateAItems.length,
      reported: stateAItems.length,
    },
    stateB: {
      found:    stateBItems.length,
      reported: stateBItems.length,
    },
    stateC: {
      found:  stateCItems.length,
      fixed:  stateCFixed,
      errors: stateCErrors,
    },
    ranAt,
  }
}
