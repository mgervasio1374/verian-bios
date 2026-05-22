// ============================================================
// Phase 3B.1 — Operational Health Repository
// Read-only tenant-scoped queries for the agent monitor health card.
// No writes. No action side effects. Service client (bypasses RLS).
// All functions are non-fatal — callers wrap in try/catch.
// ============================================================

import { createSupabaseServiceClient } from '@/lib/supabase/service'

const GRACE_PERIOD_MINUTES = 10
const FAILED_SEND_WINDOW_HOURS = 24

function graceThreshold(): string {
  return new Date(Date.now() - GRACE_PERIOD_MINUTES * 60 * 1000).toISOString()
}

function failedSendWindowStart(): string {
  return new Date(Date.now() - FAILED_SEND_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
}

// ---- Stuck draft counts ----

export interface SebStuckDraftCounts {
  stateA: number
  stateB: number
}

export async function getSebStuckDraftCounts(tenantId: string): Promise<SebStuckDraftCounts> {
  const supabase = createSupabaseServiceClient()
  const grace = graceThreshold()

  // State A: pending_approval, no approval_request_id, Phase 3B, > grace period
  const { data: stateARows } = await supabase
    .from('email_drafts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending_approval')
    .is('approval_request_id', null)
    .is('deleted_at', null)
    .filter('ai_generation_metadata->>source', 'eq', 'phase_3b_send_bridge')
    .lt('created_at', grace)
    .limit(50)

  // State B step 1: pending_approval with non-null approval_request_id, Phase 3B, > grace period
  const { data: stateBDrafts } = await supabase
    .from('email_drafts')
    .select('id, approval_request_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending_approval')
    .not('approval_request_id', 'is', null)
    .is('deleted_at', null)
    .filter('ai_generation_metadata->>source', 'eq', 'phase_3b_send_bridge')
    .lt('created_at', grace)
    .limit(50)

  let stateBCount = 0
  if (stateBDrafts && stateBDrafts.length > 0) {
    const approvalIds = stateBDrafts
      .map(d => d.approval_request_id)
      .filter((id): id is string => id !== null)

    if (approvalIds.length > 0) {
      // State B step 2: check which linked approval_requests are still pending
      const { data: pendingApprovals } = await supabase
        .from('approval_requests')
        .select('id')
        .in('id', approvalIds)
        .eq('status', 'pending')
        .eq('request_type', 'email_draft_review')

      stateBCount = pendingApprovals?.length ?? 0
    }
  }

  return {
    stateA: stateARows?.length ?? 0,
    stateB: stateBCount,
  }
}

// ---- Failed send count ----

export interface FailedSendMetrics {
  count:       number
  windowHours: number
}

export async function getFailedSendCount(tenantId: string): Promise<FailedSendMetrics> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('email_sends')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'failed')
    .gte('created_at', failedSendWindowStart())
    .limit(200)   // cap to avoid slow count on large tables

  return {
    count:       data?.length ?? 0,
    windowHours: FAILED_SEND_WINDOW_HOURS,
  }
}

// ---- Latest Learning Agent run status ----

export interface LatestLaRunStatus {
  computedAt:    string
  snapshotCount: number | null
  totalSends:    number | null
  ok:            boolean
}

export async function getLatestLaRunStatus(tenantId: string): Promise<LatestLaRunStatus | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('activity_events')
    .select('event_type, occurred_at, metadata')
    .eq('tenant_id', tenantId)
    .in('event_type', ['LA_SIGNALS_COMPUTED', 'LA_SIGNALS_COMPUTATION_FAILED'])
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  const meta = (data.metadata ?? {}) as Record<string, unknown>
  const ok   = data.event_type === 'LA_SIGNALS_COMPUTED'

  return {
    computedAt:    data.occurred_at,
    snapshotCount: typeof meta['signals_computed'] === 'number' ? meta['signals_computed'] : null,
    totalSends:    typeof meta['total_sends']       === 'number' ? meta['total_sends']       : null,
    ok,
  }
}
