// ============================================================
// Phase 3B.1 — Send Bridge Reconciliation Types
// Pure type definitions for stuck-state detection results.
// No business logic. No I/O.
// ============================================================

// ---- State A: Phase 3B pending_approval draft with no approval_request_id ----
// Cause: Step 11 (CREATE draft) succeeded; Step 12+ (CREATE approval_request) failed.
// Resolution: report-only in v1. Draft cannot be sent; SEB_011 blocks re-creation.

export interface StuckDraftStateA {
  draftId:   string
  tenantId:  string
  leadId:    string | null
  createdAt: string
}

// ---- State B: Phase 3B pending_approval draft linked to a PENDING approval_request ----
// Cause: Step 13 (link) succeeded; Step 14 (resolve approval_request) failed.
// Resolution: report-only in v1. Never auto-resolve approval_requests.

export interface StuckDraftStateB {
  draftId:           string
  tenantId:          string
  leadId:            string | null
  approvalRequestId: string
  createdAt:         string
}

// ---- State C: Phase 3B approved draft with unsuperseded pending siblings for the same lead ----
// Cause: Steps 11–15 succeeded (draft approved); Step 16 (supersede) failed.
// Resolution: auto-fix by calling the idempotent supersedePendingDraftsForLead.

export interface StuckStateC {
  tenantId:        string
  leadId:          string
  approvedDraftId: string
}

// ---- Structured result returned by runSebReconciliation ----

export interface SebReconciliationResult {
  stateA: {
    found:    number
    reported: number
  }
  stateB: {
    found:    number
    reported: number
  }
  stateC: {
    found:  number
    fixed:  number
    errors: number
  }
  ranAt: string
}
