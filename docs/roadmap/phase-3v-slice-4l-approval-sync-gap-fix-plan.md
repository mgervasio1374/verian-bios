# Phase 3V Slice 4L — Approval Sync Gap Fix Plan

**Status:** Planning only — no code changed; Slice 5 BLOCKED
**Created:** 2026-06-05
**Predecessor:** Phase 3V Slice 4K — [Final Evidence Recollection Report](phase-3v-slice-4k-final-evidence-recollection-report.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at plan time:** `b8c1479c3c3157c4af60892b1c6d7736868660de`

> **⚠️ Slice 4L plans a minimal code fix only. No code was changed. No send occurred. Slice 5 remains BLOCKED.**

---

## A. Purpose

Slice 4L plans the fix for the proposal follow-up approval-to-draft status sync gap identified in Slice 4J and confirmed in Slice 4K.

- Plans the fix — does not implement it
- Does not send email
- Does not enable `EMAIL_SENDING_ENABLED`
- Does not enable `CAMPAIGN_SENDING_ENABLED`
- Does not authorize Slice 5

---

## B. Current Blocker

### Gap location

**File:** `modules/messaging/services/email-draft.service.ts` — lines 269–296 (`syncApprovalDecisionToDraft`), lines 303–319 (`assertDraftIsApprovable`)

**File:** `modules/workflow/actions/approval.actions.ts` — line 103 (`approveRequestAction` calls `syncApprovalDecisionToDraft`)

### What happens today

When `approveRequestAction(approvalId)` is called on a `proposal_follow_up_draft_review` approval request:

1. `assertDraftIsApprovable` is called → returns `null` immediately (line 307: `if (approval.request_type !== 'email_draft_review') return null`) → no guard runs
2. `approvalService.approveRequest` → `resolveApprovalRequest` → sets `approval_requests.status = 'approved'` ✓
3. `syncApprovalDecisionToDraft` is called → returns `void` immediately (line 274: `if (approval.request_type !== 'email_draft_review') return`) → **email_drafts.status is NOT updated**
4. `email_drafts.status` remains `'pending_approval'`

### Why this blocks `sendFollowUpDraftAction`

`sendFollowUpDraftAction` calls `checkDraftSendReadiness` (step J), which checks:

```typescript
// draft-send-readiness.service.ts line 26
if (draft.status !== 'approved') blockedReasons.push('draft_not_approved')
```

A draft left in `'pending_approval'` after approval fails this check with `blockedReasons = ['draft_not_approved']`, preventing the send.

`sendApprovedDraft` independently guards at line 78 of `email-send.service.ts`:
```typescript
reason: `draft_not_approved (current status: ${draft.status})`
```

Both gates must pass for a send to proceed. Neither passes with `status = 'pending_approval'`.

### Why the Slice 4J raw-DB workaround is not acceptable

The Slice 4J DO block manually ran `UPDATE email_drafts SET status='approved'` in Step 9. This directly bypassed the application approval path and is not repeatable through normal operator UI actions. The test object is in a correct state for Slice 5, but the normal app path remains broken for any new follow-up draft approvals.

### Token-based approval path (not affected)

`app/approve/[token]/actions.ts` (`approveAndSendAction`) does **not** call `syncApprovalDecisionToDraft`. It directly calls `emailDraftRepo.updateDraftStatus(draftId, { status: 'approved', ... })` at line 68. This path correctly syncs the draft for any type with `payload.draft_id`. The gap only affects the workspace inbox approval path (`approveRequestAction`).

---

## C. Proposed Minimal Fix

### Change location

**File:** `modules/messaging/services/email-draft.service.ts`
**Functions:** `syncApprovalDecisionToDraft` and (recommended) `assertDraftIsApprovable`

### Change 1 — `syncApprovalDecisionToDraft` (required)

**Current (line 274):**
```typescript
if (approval.request_type !== 'email_draft_review') return
```

**Proposed:**
```typescript
const DRAFT_SYNC_APPROVAL_TYPES = ['email_draft_review', 'proposal_follow_up_draft_review']
if (!DRAFT_SYNC_APPROVAL_TYPES.includes(approval.request_type)) return
```

The rest of the function body is identical for both types:
- Extract `payload.draft_id` (already type-checked with `typeof payload.draft_id === 'string'`)
- For `'approved'`: call `updateDraftStatus` with `status: 'approved'`, `approvedAt: now`, `approvedBy: ctx.userId`, `ifCurrentStatus: 'pending_approval'`
- For `'rejected'`: call `updateDraftStatus` with `status: 'rejected'`, `rejectedAt: now`, `ifCurrentStatus: 'pending_approval'`

No behavioral difference between the two types — the draft sync logic is identical.

### Change 2 — `assertDraftIsApprovable` (recommended, not required for send)

**Current (line 307):**
```typescript
if (approval.request_type !== 'email_draft_review') return null
```

**Proposed:**
```typescript
if (!DRAFT_SYNC_APPROVAL_TYPES.includes(approval.request_type)) return null
```

This adds a pre-approval guard for `proposal_follow_up_draft_review` requests: checks that the linked draft is still in `'pending_approval'` before allowing the approval to proceed. Without this, double-approval of a follow-up draft would silently succeed (the `ifCurrentStatus` guard in `updateDraftStatus` prevents the second update, but the caller gets no error). Extending the guard makes the behavior consistent with `email_draft_review`.

### Constants placement

The `DRAFT_SYNC_APPROVAL_TYPES` array can be defined as a module-level constant or inline. If defined at module level, it should appear near the top of the `email-draft.service.ts` file.

### What does NOT change

| Item | Status |
|------|--------|
| `checkDraftSendReadiness` logic | **No change** — `draft_not_approved` check is correct and remains |
| `sendApprovedDraft` gates | **No change** |
| `sendFollowUpDraftAction` | **No change** |
| Database schema | **No change** — no migration required |
| `EMAIL_SENDING_ENABLED` flag | **No change** — remains disabled |
| Any other approval type | **No change** — all other types still return early from both functions |
| `send-bridge-reconciliation.service.ts` | **No change** — its `email_draft_review` filter is for Phase 3B campaign drafts only |
| `operational-health.repo.ts` | **No change** — same reason |

---

## D. Validation Requirements

The following test cases must pass before implementation is complete.

### New tests required

| # | Test ID | Description |
|---|---------|-------------|
| 1 | TC-4L-001 | `syncApprovalDecisionToDraft` handles `email_draft_review` — existing behavior unchanged |
| 2 | TC-4L-002 | `syncApprovalDecisionToDraft` handles `proposal_follow_up_draft_review` — updates linked draft status |
| 3 | TC-4L-003 | `syncApprovalDecisionToDraft` does NOT update drafts for unrelated types (e.g., `statement_proposal_review`) |
| 4 | TC-4L-004 | `syncApprovalDecisionToDraft` handles missing `payload.draft_id` safely without throwing |
| 5 | TC-4L-005 | `syncApprovalDecisionToDraft` with `proposal_follow_up_draft_review` + decision `'approved'` → draft status becomes `'approved'` |
| 6 | TC-4L-006 | `syncApprovalDecisionToDraft` with `proposal_follow_up_draft_review` + decision `'rejected'` → draft status becomes `'rejected'` |
| 7 | TC-4L-007 | `assertDraftIsApprovable` returns `null` for `proposal_follow_up_draft_review` when draft is `'pending_approval'` (proceed) |
| 8 | TC-4L-008 | `assertDraftIsApprovable` returns error string for `proposal_follow_up_draft_review` when draft is NOT `'pending_approval'` |
| 9 | TC-4L-009 | After `syncApprovalDecisionToDraft` with `proposal_follow_up_draft_review`, `checkDraftSendReadiness` does NOT return `draft_not_approved` |
| 10 | TC-4L-010 | No send action is invoked by `syncApprovalDecisionToDraft` for any type |
| 11 | TC-4L-011 | Source pattern: `DRAFT_SYNC_APPROVAL_TYPES` (or equivalent) includes both `email_draft_review` and `proposal_follow_up_draft_review` |

### Existing tests that must continue to pass

All existing Phase 3S, 3T, 3K, 3U, 3Q test suites — particularly:
- TC-3S-033 (`'proposal_follow_up_draft_review'` present in draft service) — still passes ✓
- TC-3K-034 (`draft_not_approved` present in readiness service) — still passes ✓ (no change to that service)
- TC-3T-023, TC-3T-024 (`checkDraftSendReadiness` called before `sendApprovedDraft`) — unchanged ✓
- Full `phase3t-proposal-follow-up-send.test.ts` suite — unchanged ✓

---

## E. Files Likely to Change in Future Implementation

| File | Change type |
|------|-------------|
| `modules/messaging/services/email-draft.service.ts` | Extend type check in `syncApprovalDecisionToDraft` and `assertDraftIsApprovable` |
| `tests/phase3l-approval-sync-gap-fix.test.ts` (new) | New test file for TC-4L-001 through TC-4L-011 |

**No migrations required.** The fix is entirely in TypeScript service logic. No schema changes.

---

## F. Stop Conditions for Future Implementation

The implementation must stop immediately if any of the following are encountered:

| Condition | Action |
|-----------|--------|
| Proposed change requires a schema migration | **Hard stop** — rethink approach |
| Proposed change enables sending directly | **Hard stop** |
| Proposed change touches provider/env/Vercel config | **Hard stop** |
| Proposed change bypasses `EMAIL_SENDING_ENABLED` gate | **Hard stop** |
| Proposed change weakens `checkDraftSendReadiness` | **Hard stop** |
| Proposed change updates email_drafts without matching `payload.draft_id` | **Stop** — must only update the draft explicitly linked in the approval payload |
| Tests reveal unrelated approval types are affected | **Stop** — narrow the type list |
| Test suite regression in Phase 3S/3T/3K/3U/3Q | **Stop** — investigate before proceeding |
| Production environment involved | **Hard stop** |
| Any reference to `sendApprovedDraft` or `sendFollowUpDraftAction` in the fix | **Hard stop** |

---

## G. Deployment and Verification Plan

The following sequence must be followed in the future implementation prompt:

```
1.  Verify git state: git status --short (clean)
2.  Verify HEAD and origin/master

3.  Implement minimal code fix in email-draft.service.ts:
    - Extend syncApprovalDecisionToDraft type check
    - Extend assertDraftIsApprovable type check (recommended)

4.  Add new test file tests/phase3l-approval-sync-gap-fix.test.ts
    - TC-4L-001 through TC-4L-011 (source-reading pattern)

5.  Run targeted tests:
    npx vitest run tests/phase3l-approval-sync-gap-fix.test.ts

6.  Run full test suite:
    npx vitest run

7.  Commit: code + tests + docs only
    Message: "Phase 3L: fix approval sync for proposal_follow_up_draft_review"

8.  Codex review of commit

9.  Push only after Codex PASS

10. Staging deployment: Vercel auto-deploys from origin/master push

11. Staging verification (SELECT-only + UI path test):
    - Verify a new proposal follow-up draft approval via staging app UI
      transitions draft.status from 'pending_approval' to 'approved'
    - Confirm the Slice 4J test object (draft 97e59aa8-...) is unaffected
      (already approved; no regression)

12. Only after all above may Slice 5 send plan be drafted
```

---

## H. Slice 5 Status

**Slice 5 is NOT READY and remains BLOCKED.**

This plan does not authorize Slice 5. The following must all be completed in order before Slice 5 may proceed:

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Slice 4L implementation + passing tests | ❌ Not done |
| 2 | Codex PASS on Slice 4L commit | ❌ Not done |
| 3 | Staging deployment of Slice 4L fix | ❌ Not done |
| 4 | Staging verification of approval sync path | ❌ Not done |
| 5 | Explicit operator approval of Slice 5 execution plan | ❌ Not done |
| 6 | Separate Slice 5 controlled send plan document | ❌ Not written |
| 7 | Immediate final preflight before send | ❌ Not run |

Note: The Slice 4J test draft (`97e59aa8-5906-44f0-ad6a-bb3f23517500`) already has `status='approved'` via the raw DB Step 9 workaround. It is currently ready for Slice 5 from a data perspective. However, the code gap must still be fixed to ensure the normal app path works correctly. Without the fix, any future follow-up draft approvals via the app UI would leave the draft in `pending_approval`, and the send path would be broken for real production use.

---

## I. Final Decision

| Item | Result |
|------|--------|
| Plan only — no code changed | ✓ |
| No sends occurred | ✓ |
| No gates enabled | ✓ |
| No production changes | ✓ |
| `EMAIL_SENDING_ENABLED` effective `false` | ✓ |
| **Slice 5** | **BLOCKED** — requires Slice 4L implementation + Codex PASS + staging verification + operator approval + send plan |
