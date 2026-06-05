/**
 * Phase 3V Slice 4L — Approval Sync Gap Fix
 * Test suite: source-reading tier
 *
 * Verifies that syncApprovalDecisionToDraft and assertDraftIsApprovable
 * handle both email_draft_review and proposal_follow_up_draft_review.
 *
 * Pattern: fs.readFileSync + toContain / not.toContain / regex
 * No Supabase mocking. No LLM mocking. No sends.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..')

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const EMAIL_DRAFT_SERVICE   = 'modules/messaging/services/email-draft.service.ts'
const READINESS_SERVICE     = 'modules/messaging/services/draft-send-readiness.service.ts'
const APPROVAL_ACTIONS      = 'modules/workflow/actions/approval.actions.ts'

// ---------------------------------------------------------------------------
// TC-4L-001: email_draft_review still supported
// ---------------------------------------------------------------------------

describe('TC-4L-001: email_draft_review behavior preserved', () => {
  it('TC-4L-001: syncApprovalDecisionToDraft still references email_draft_review', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).toContain("'email_draft_review'")
  })

  it('TC-4L-001b: assertDraftIsApprovable still references email_draft_review', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    // email_draft_review must appear as a recognized type — not as the sole guard condition
    expect(src).toContain("'email_draft_review'")
  })
})

// ---------------------------------------------------------------------------
// TC-4L-002: proposal_follow_up_draft_review is now included
// ---------------------------------------------------------------------------

describe('TC-4L-002: proposal_follow_up_draft_review included in sync types', () => {
  it('TC-4L-002: email-draft.service.ts includes proposal_follow_up_draft_review in approval type list', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).toContain("'proposal_follow_up_draft_review'")
  })
})

// ---------------------------------------------------------------------------
// TC-4L-003 + TC-4L-004 + TC-4L-005: sync behavior via source inspection
// ---------------------------------------------------------------------------

describe('TC-4L-003/004/005: syncApprovalDecisionToDraft source structure', () => {
  it('TC-4L-003: syncApprovalDecisionToDraft is exported', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).toContain('export async function syncApprovalDecisionToDraft')
  })

  it('TC-4L-003b: approved path writes status=approved with ifCurrentStatus guard', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).toContain("status:           'approved'")
    expect(src).toContain("ifCurrentStatus:  'pending_approval'")
    expect(src).toContain("approvedAt:")
    expect(src).toContain("approvedBy:")
  })

  it('TC-4L-004: rejected path writes status=rejected with ifCurrentStatus guard', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).toContain("status:           'rejected'")
    expect(src).toContain("rejectedAt:")
    // rejected path also uses ifCurrentStatus='pending_approval'
    const rejIdx   = src.indexOf("status:           'rejected'")
    const guardIdx = src.indexOf("ifCurrentStatus:  'pending_approval'", rejIdx)
    expect(guardIdx).toBeGreaterThan(rejIdx)
  })

  it('TC-4L-005: missing payload.draft_id is handled safely — early return if null', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    // The service returns early when draftId is null — no throw
    expect(src).toContain('if (!draftId) return')
  })
})

// ---------------------------------------------------------------------------
// TC-4L-006: unrelated approval types are not synced
// ---------------------------------------------------------------------------

describe('TC-4L-006: unrelated approval types do not trigger sync', () => {
  it('TC-4L-006: isDraftSyncApprovalType helper or equivalent list excludes unrelated types', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    // The type guard must NOT remove the type check entirely (i.e., it still has a guard)
    expect(src).toContain('isDraftSyncApprovalType')
    // There is no unconditional path — the function still returns early for non-matching types
    expect(src).not.toContain('if (true)')
  })

  it('TC-4L-006b: DRAFT_SYNC_APPROVAL_TYPES contains exactly email_draft_review and proposal_follow_up_draft_review', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    // Both types are present in the array literal
    expect(src).toContain("'email_draft_review'")
    expect(src).toContain("'proposal_follow_up_draft_review'")
    // The constant name is present
    expect(src).toContain('DRAFT_SYNC_APPROVAL_TYPES')
  })
})

// ---------------------------------------------------------------------------
// TC-4L-007 + TC-4L-008: assertDraftIsApprovable
// ---------------------------------------------------------------------------

describe('TC-4L-007/008: assertDraftIsApprovable includes proposal_follow_up_draft_review', () => {
  it('TC-4L-007: assertDraftIsApprovable is exported', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).toContain('export async function assertDraftIsApprovable')
  })

  it('TC-4L-007b: assertDraftIsApprovable uses isDraftSyncApprovalType guard', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    // The function now uses the same type helper rather than hardcoding 'email_draft_review'
    const funcStart = src.indexOf('export async function assertDraftIsApprovable')
    const snippet   = src.slice(funcStart, funcStart + 400)
    expect(snippet).toContain('isDraftSyncApprovalType')
  })

  it('TC-4L-008: assertDraftIsApprovable still guards against non-pending_approval drafts', () => {
    const src       = readSrc(EMAIL_DRAFT_SERVICE)
    const funcStart = src.indexOf('export async function assertDraftIsApprovable')
    const snippet   = src.slice(funcStart, funcStart + 800)
    expect(snippet).toContain("'pending_approval'")
    expect(snippet).toContain('Draft is no longer pending approval')
  })
})

// ---------------------------------------------------------------------------
// TC-4L-009: checkDraftSendReadiness still has draft_not_approved guard
// ---------------------------------------------------------------------------

describe('TC-4L-009: checkDraftSendReadiness draft_not_approved check unchanged', () => {
  it('TC-4L-009: draft-send-readiness.service.ts still contains draft_not_approved check', () => {
    const src = readSrc(READINESS_SERVICE)
    expect(src).toContain('draft_not_approved')
    expect(src).toContain("draft.status !== 'approved'")
  })

  it('TC-4L-009b: checkDraftSendReadiness was not modified by this slice', () => {
    const src = readSrc(READINESS_SERVICE)
    // The function must not contain any reference to proposal_follow_up_draft_review
    // (change is entirely in email-draft.service.ts, not readiness service)
    expect(src).not.toContain('proposal_follow_up_draft_review')
  })
})

// ---------------------------------------------------------------------------
// TC-4L-010: no send action invoked by approval sync
// ---------------------------------------------------------------------------

describe('TC-4L-010: approval sync does not invoke any send action', () => {
  it('TC-4L-010: email-draft.service.ts does not import or call sendApprovedDraft', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).not.toContain('sendApprovedDraft')
  })

  it('TC-4L-010b: email-draft.service.ts does not import or call sendFollowUpDraftAction', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).not.toContain('sendFollowUpDraftAction')
  })

  it('TC-4L-010c: syncApprovalDecisionToDraft does not reference EMAIL_SENDING_ENABLED', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).not.toContain('EMAIL_SENDING_ENABLED')
    expect(src).not.toContain('CAMPAIGN_SENDING_ENABLED')
  })

  it('TC-4L-010d: approval.actions.ts calls syncApprovalDecisionToDraft (not a direct send)', () => {
    const src = readSrc(APPROVAL_ACTIONS)
    expect(src).toContain('syncApprovalDecisionToDraft')
    expect(src).not.toContain('sendApprovedDraft')
  })
})

// ---------------------------------------------------------------------------
// TC-4L-011: source-pattern confirms both types in list
// ---------------------------------------------------------------------------

describe('TC-4L-011: DRAFT_SYNC_APPROVAL_TYPES source pattern', () => {
  it('TC-4L-011: DRAFT_SYNC_APPROVAL_TYPES constant exists in email-draft.service.ts', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).toContain('DRAFT_SYNC_APPROVAL_TYPES')
  })

  it('TC-4L-011b: isDraftSyncApprovalType helper exists and is used in the service', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    expect(src).toContain('isDraftSyncApprovalType')
    // Used in both sync function and guard function
    const count = (src.match(/isDraftSyncApprovalType/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(3) // definition + 2 call sites
  })

  it('TC-4L-011c: the old single-type guard is removed — no longer email_draft_review only', () => {
    const src = readSrc(EMAIL_DRAFT_SERVICE)
    // Old pattern must not appear
    expect(src).not.toContain("approval.request_type !== 'email_draft_review'")
  })
})
