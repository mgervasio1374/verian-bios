# Phase 3V Slice 4M — Staging Approval Sync Verification Plan

**Status:** Planning only — no execution; Slice 5 BLOCKED
**Created:** 2026-06-05
**Predecessor:** Phase 3V Slice 4L — [Approval Sync Gap Fix Implementation](../../../modules/messaging/services/email-draft.service.ts) / [Fix Plan](phase-3v-slice-4l-approval-sync-gap-fix-plan.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at plan time:** `0b8f4bcab4ba0b0a3354c8b84080de43eeba4da7`

> **⚠️ Slice 4M plans staging verification only. No execution occurred. No sends occurred. Slice 5 remains BLOCKED.**

---

## A. Purpose

Slice 4M plans staging verification of the normal workspace approval path after the Slice 4L code fix.

**Verification goal:** Prove that calling `approveRequestAction` on a `proposal_follow_up_draft_review` approval request through the normal workspace path (not token-based, not raw DB) now correctly transitions the linked `email_draft.status` from `'pending_approval'` to `'approved'`.

This is the last prerequisite code verification before Slice 5 may be considered.

- Plans the verification — does not execute it
- Does not send email
- Does not enable `EMAIL_SENDING_ENABLED`
- Does not enable `CAMPAIGN_SENDING_ENABLED`
- Does not authorize Slice 5

---

## B. Current State

| Item | Value |
|------|-------|
| Slice 4L fix commit | `0b8f4bc` Phase 3V Slice 4L: fix proposal follow-up approval sync |
| origin/master | `0b8f4bcab4ba0b0a3354c8b84080de43eeba4da7` ✓ |
| Staging ref | `smbausuyetlgxflyhmfg` |
| Production ref | `kxrplupzbsmujjznzhpy` — excluded |
| `EMAIL_SENDING_ENABLED` | `false` globally + tenant-scoped ✓ |
| `CAMPAIGN_SENDING_ENABLED` | `false` globally ✓ |
| No sends occurred | ✓ |
| Existing Slice 4J test objects | 1 commitment / 1 draft (approved) / 1 approval_request (approved) |
| Slice 5 | **BLOCKED** |

### What Slice 4L fixed

Before Slice 4L: `syncApprovalDecisionToDraft` returned immediately for `proposal_follow_up_draft_review` — the approval request was approved but `email_drafts.status` stayed at `'pending_approval'`.

After Slice 4L: Both `syncApprovalDecisionToDraft` and `assertDraftIsApprovable` now handle `proposal_follow_up_draft_review` via the `DRAFT_SYNC_APPROVAL_TYPES` constant alongside `email_draft_review`.

### Pre-existing test gap (not introduced by Slice 4L)

TC-3K-030 in `tests/phase3k-unified-draft-send-path.test.ts` fails due to a whitespace mismatch in `campaign-asset-draft.service.ts` (unrelated to follow-up drafts). Confirmed pre-existing.

---

## C. Verification Boundary

| Constraint | Requirement |
|------------|-------------|
| Staging only | `smbausuyetlgxflyhmfg` |
| Production excluded | `kxrplupzbsmujjznzhpy` — hard stop if linked |
| No sends | `EMAIL_SENDING_ENABLED` must remain `false` |
| No send gate enablement | No `system_controls` writes |
| No provider/env changes | No Vercel, no Resend key, no env vars |
| No schema changes | No migrations |
| No raw DB draft status sync | Must use app approval path only |
| No token-based approval path | `approveAndSendAction` is excluded |
| No `sendFollowUpDraftAction` call | Hard stop |
| Recipient | `mgervasio@321swipe.com` only |
| Sender | `noreply@321swipe.com` (verified, active, default) |
| Subject | Must contain `[TEST ONLY]` |

---

## D. Deployment Verification Requirement

Before any app-path approval verification can begin, the staging Vercel deployment must be confirmed to include commit `0b8f4bc`.

### How to confirm staging deployment

Vercel automatically deploys from `origin/master` pushes. After `0b8f4bc` was pushed, Vercel should have triggered a build for staging (`verian-bios-staging.vercel.app`).

**Confirmation steps (operator):**
1. Navigate to the Vercel dashboard for the staging project (`smbausuyetlgxflyhmfg` / `verian-bios-staging`).
2. Find the most recent deployment associated with commit `0b8f4bc`.
3. Confirm the deployment status is **Ready** (not building or error).
4. Confirm the deployment is served at `https://verian-bios-staging.vercel.app`.

**Alternative confirmation:** Load `https://verian-bios-staging.vercel.app` and confirm the staging app is responsive. If the deployment is still building, wait before proceeding with app-path verification.

**Hard stop:** If the staging deployment does not include `0b8f4bc` (e.g., build failed, rollback active), do not proceed to app-path verification.

---

## E. Data/Object Strategy

The verification requires a `proposal_follow_up_draft_review` approval request with a linked `email_draft` in `'pending_approval'` status. The existing Slice 4J test object **cannot** be used because:

- The Slice 4J draft (`97e59aa8-5906-44f0-ad6a-bb3f23517500`) already has `status = 'approved'` (set via raw DB Step 9 in Slice 4J).
- The Slice 4J approval request (`1afaff3b-665c-47ec-84fa-d9395520d88e`) already has `status = 'approved'`.
- There is no safe app-path way to reset both back to `pending_approval` without raw DB writes.
- Resetting these objects would require a separate approved DB write plan.

### Recommended strategy: Option B — Create a new controlled verification object

Create exactly one new controlled staging verification object through the existing application action flow:

| Step | Action | Method |
|------|--------|--------|
| 1 | Create exactly one new `proposal_follow_up_commitment` | Via staging app UI: `createManualProposalCaptureAction` with `scheduleRuleKey='single_7'` for the test lead `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` |
| 2 | Generate exactly one `future_follow_up` draft | Via staging app UI: `generateFollowUpDraftAction({ commitmentId })` |
| 3 | Verify draft status = `pending_approval` | SELECT-only |
| 4 | Approve via workspace approval path | Via staging app inbox / approval UI: `approveRequestAction(approvalId)` — NOT token path, NOT raw DB |
| 5 | Verify draft status = `approved` | SELECT-only — the key verification |
| 6 | Verify no send occurred | SELECT-only — `email_sends` count unchanged |

### Why Option A is not recommended

The Slice 4J test object is already approved. Rolling it back requires raw DB writes (`UPDATE email_drafts SET status='pending_approval'` + `UPDATE approval_requests SET status='pending'`), which would require a separate approved write plan and add risk. Option B avoids this complexity.

### Safety requirements for Option B

| Requirement | Value |
|-------------|-------|
| New commitment count | Exactly 1 |
| New draft count | Exactly 1 |
| New approval request count | Exactly 1 |
| `proposalReference` | `'[TEST ONLY]'` |
| Draft subject | Contains `'[TEST ONLY]'` |
| Recipient | `mgervasio@321swipe.com` |
| Sender | `noreply@321swipe.com` |
| Draft start status | `'pending_approval'` |
| Second proposal event for same lead | Allowed only after the first `proposal_event.proposal_status` moves to `'accepted'`, `'rejected'`, or `'expired'` — or a different lead is used |

**Important constraint:** The existing Slice 4J proposal event (`b39fefe3-0639-494e-b84e-9093564a17ec`) has `proposal_status = 'sent'`. The `createManualProposalCaptureAction` service enforces the one-open-proposal constraint (`idx_proposal_events_one_open_per_lead`). A second proposal event cannot be created for the same lead while the first is in `'sent'` or `'viewed'` status.

**Resolution options:**
1. **Use a different test lead** — create a second test lead/contact via staging app UI if the operator has access, or use an existing staging lead whose contact resolves to `mgervasio@321swipe.com`.
2. **Close the existing Slice 4J proposal event** — via staging app or a narrow approved DB write (`UPDATE proposal_events SET proposal_status='accepted'`), then create the new capture for the same test lead. Requires operator decision.
3. **Operator discretion** — Operator evaluates at execution time which option is safest.

The execution plan prompt must resolve this constraint before attempting to create the new verification object.

---

## F. Approval-Path Verification Steps

The following is the planned sequence for the future Slice 4M execution prompt. **NOT to be run in Slice 4M planning.**

```
Pre-execution checks:
1. git status --short (clean)
2. Verify HEAD = 0b8f4bc
3. Verify staging project ref = smbausuyetlgxflyhmfg (hard stop if production)
4. Confirm staging Vercel deployment includes 0b8f4bc (hard stop if not)
5. SELECT-only preflight:
   - sender: noreply@321swipe.com active/default/verified
   - email_sending_enabled=false global+tenant
   - campaign_sending_enabled=false global
   - email_sends count (record baseline)
   - campaign_email_sends = 0
   - pfc_count, ff_drafts, approval_requests counts (record baselines)

Verification object creation (Option B):
6. Resolve the one-open-proposal constraint (operator decision):
   - Option: close Slice 4J proposal event via app, OR
   - Option: use a different test lead
7. Via staging app UI as staging@verian.internal:
   createManualProposalCaptureAction({
     leadId: '<resolved lead ID>',
     proposalSentAt: '<ISO timestamp>',
     proposalReference: '[TEST ONLY]',
     scheduleRuleKey: 'single_7'
   })
   → creates 1 proposal_follow_up_commitment
8. Via staging app UI:
   generateFollowUpDraftAction({ commitmentId: '<new_commitment_id>' })
   → creates 1 email_draft with status='pending_approval'
   → creates 1 approval_request with status='pending'

Pre-approval verification (SELECT-only):
9. Confirm draft status = 'pending_approval'
10. Confirm approval_request status = 'pending'
11. Confirm subject contains [TEST ONLY]
12. Confirm to_email = mgervasio@321swipe.com
13. Confirm source_type = 'future_follow_up'
14. Confirm subject_type = 'proposal_follow_up_commitment'

Approval via normal workspace path:
15. Via staging app inbox (proposal-follow-ups queue or inbox page):
    - Use the workspace approval UI action that calls approveRequestAction(approvalId)
    - NOT the token-based path
    - NOT a raw DB update
    - Hard stop if any send is triggered

Post-approval verification (SELECT-only):
16. Confirm email_draft.status = 'approved'  ← KEY CHECK
17. Confirm email_draft.approved_at non-null
18. Confirm approval_request.status = 'approved'
19. Confirm approval_request.decided_at non-null
20. Confirm email_sends count unchanged (no send)
21. Confirm campaign_email_sends = 0
22. Confirm email_sending_enabled remains false
23. Confirm campaign_sending_enabled remains false
24. Confirm draft sent_at = null (no send)
```

---

## G. Evidence Requirements

The future Slice 4M execution report must capture all of the following:

| Evidence | Required value |
|----------|---------------|
| Staging deployment commit | `0b8f4bc` ✓ |
| Staging ref | `smbausuyetlgxflyhmfg` ✓ |
| Production excluded | `kxrplupzbsmujjznzhpy` not linked ✓ |
| New commitment ID | TBD at execution |
| New draft ID | TBD at execution |
| New approval request ID | TBD at execution |
| Draft status before approval | `'pending_approval'` ✓ |
| Approval request status before approval | `'pending'` ✓ |
| Approval path used | `approveRequestAction` via workspace UI (NOT token, NOT raw DB) |
| Draft status after approval | **`'approved'`** ✓ — the key verification |
| Approval request status after approval | `'approved'` ✓ |
| Draft `approved_at` | Non-null ✓ |
| Draft `sent_at` | `null` ✓ |
| No manual DB status sync | ✓ |
| No raw DB fallback | ✓ |
| No send | ✓ |
| `email_sends` count | Unchanged from baseline ✓ |
| `campaign_email_sends` | 0 (unchanged) ✓ |
| `email_sending_enabled` | `false` global + tenant ✓ |
| `campaign_sending_enabled` | `false` global ✓ |

---

## H. Stop Conditions

The future Slice 4M execution must stop immediately if:

| Condition | Action |
|-----------|--------|
| Staging deployment does not include `0b8f4bc` | **Hard stop** |
| Production ref `kxrplupzbsmujjznzhpy` linked | **Hard stop** |
| Staging ref ≠ `smbausuyetlgxflyhmfg` | **Hard stop** |
| Working tree dirty | Stop |
| Any send gate is `true` | **Hard stop** |
| Sender is not `noreply@321swipe.com` or not verified | **Hard stop** |
| Recipient is not `mgervasio@321swipe.com` | **Hard stop** |
| Subject lacks `[TEST ONLY]` | Stop before approval |
| Token-based approval path (`approveAndSendAction`) used | **Hard stop** |
| Raw DB draft status sync used | **Hard stop** |
| `sendFollowUpDraftAction` called | **Hard stop** |
| Any send triggered | **Hard stop** |
| More than 1 new commitment/draft/approval created | Stop — investigate |
| After approval: `email_draft.status ≠ 'approved'` | **Stop — Slice 4L fix did not deploy correctly** |
| Slice 5 send proposed | **Hard stop** |

---

## I. Slice 5 Status

**Slice 5 is NOT READY and remains BLOCKED.**

This plan does not authorize Slice 5. The complete required sequence before Slice 5 may proceed:

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Slice 4L fix committed and pushed | ✓ Done (`0b8f4bc`) |
| 2 | Codex PASS on Slice 4L | ✓ Done |
| 3 | Staging deployment of Slice 4L | ⏳ Pending — Vercel deploy after push |
| 4 | Staging verification: `approveRequestAction` → `draft.status='approved'` | ❌ Not done (this plan) |
| 5 | Codex PASS on Slice 4M execution report | ❌ Not done |
| 6 | Explicit operator approval of Slice 5 execution plan | ❌ Not done |
| 7 | Separate Slice 5 controlled send plan document | ❌ Not written |
| 8 | Final preflight immediately before send | ❌ Not run |

---

## J. Final Decision

| Item | Result |
|------|--------|
| Plan only — no execution | ✓ |
| No code changed | ✓ |
| No DB writes | ✓ |
| No sends occurred | ✓ |
| No gates enabled | ✓ |
| No production changes | ✓ |
| `EMAIL_SENDING_ENABLED` effective `false` | ✓ |
| `CAMPAIGN_SENDING_ENABLED` effective `false` | ✓ |
| **Slice 5** | **BLOCKED** — staging verification + Codex PASS + operator approval + send plan required |
