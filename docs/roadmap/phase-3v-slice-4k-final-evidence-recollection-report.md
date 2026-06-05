# Phase 3V Slice 4K — Final Evidence Recollection Report

**Status:** Evidence recollection complete — Slice 5 NOT READY (blockers documented)
**Created:** 2026-06-05
**Predecessor:** Phase 3V Slice 4J — [Test Object Execution Report](phase-3v-slice-4j-test-object-execution-report.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at recollection time:** `51328a2354c78853218ec00566ef1a6cdd61e8df`

> **⚠️ Slice 4K is SELECT-only evidence recollection. It does NOT send, does NOT enable gates, and does NOT authorize Slice 5. Slice 5 remains BLOCKED.**

---

## A. Purpose

Slice 4K recollects final readiness evidence after the Slice 4J controlled test object was created in staging.

- SELECT-only — no writes, no creates, no updates
- Does not send email
- Does not enable `EMAIL_SENDING_ENABLED`
- Does not enable `CAMPAIGN_SENDING_ENABLED`
- Does not authorize Slice 5

---

## B. Execution Boundary

| Item | Status |
|------|--------|
| Staging ref | `smbausuyetlgxflyhmfg` ✓ |
| Production ref | `kxrplupzbsmujjznzhpy` — excluded ✓ |
| DB operations | SELECT-only ✓ |
| Writes | None ✓ |
| Sends | None ✓ |
| Flags enabled | None ✓ |
| Production activity | None ✓ |

---

## C. Git and Environment Evidence

| Item | Value |
|------|-------|
| Working tree before execution | Clean ✓ |
| HEAD | `51328a2` Docs: add Phase 3V Slice 4J test object execution report ✓ |
| origin/master | `51328a2354c78853218ec00566ef1a6cdd61e8df` ✓ |
| HEAD files | `docs/roadmap/phase-3v-slice-4j-test-object-execution-report.md` only ✓ |
| Supabase project ref before relink | `kxrplupzbsmujjznzhpy` (production — stale from prior session) |
| Relink performed | Yes — `npx supabase link --project-ref smbausuyetlgxflyhmfg` |
| Supabase project ref after relink | `smbausuyetlgxflyhmfg` (staging) ✓ |
| `supabase/.temp` status | Modified by relink (CLI temp state — not to be committed) |

---

## D. Sender/Provider Evidence

| Field | Value | Pass? |
|-------|-------|-------|
| Sender email | `noreply@321swipe.com` | ✓ |
| Sender ID | `de105997-62bb-434e-9a4d-15c409d8d49b` | ✓ |
| `is_default` | `true` | ✓ |
| `is_verified` | `true` | ✓ |
| `status` | `active` | ✓ |
| `tenant_id` | `10000000-0000-0000-0000-000000000001` | ✓ |
| Provider key | Not re-queried — confirmed in Slice 4I-B (Resend; staging key complete; domain `321swipe.com` verified) | ✓ |
| Provider/env/Vercel changes | None ✓ | ✓ |

---

## E. Permission/Operator Evidence

| Item | Value | Source |
|------|-------|--------|
| Operator / login | `staging@verian.internal` | ✓ |
| Operator user ID | `a76d71ca-fe31-4314-8698-212714919d28` | ✓ |
| Recipient | `mgervasio@321swipe.com` | ✓ |
| No external forwarding | Confirmed — `mgervasio@321swipe.com` does not forward externally | Slice 4I-B ✓ |
| `messaging.send_emails` | ✓ CONFIRMED — SELECT re-verified in this slice | ✓ |
| Permission query result | `slug = 'messaging.send_emails'` returned for `a76d71ca-...` | ✓ |

---

## F. Test Lead/Contact Evidence

### Contact

| Field | Value | Pass? |
|-------|-------|-------|
| `contact_id` | `b57b9831-b25b-44d2-a354-d153d360f815` | ✓ |
| `first_name` | Michael | ✓ |
| `last_name` | Gervasio | ✓ |
| `email` | `mgervasio@321swipe.com` | ✓ |
| `status` | `active` | ✓ |
| `do_not_contact` | `false` | ✓ |
| `tenant_id` | `10000000-0000-0000-0000-000000000001` | ✓ |
| `workspace_id` | `20000000-0000-0000-0000-000000000001` | ✓ |

### Company

| Field | Value | Pass? |
|-------|-------|-------|
| `company_id` | `47db6dea-c226-44c9-a152-87a77cf27a9a` | ✓ |
| `name` | Mikes Test Co | ✓ |

### Lead

| Field | Value | Pass? |
|-------|-------|-------|
| `lead_id` | `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` | ✓ |
| `name` | Mikes Test Co | ✓ |
| `stage` | `new` | ✓ |
| `source` | `manual` | ✓ |
| `workflow_enabled` | `true` | ✓ |
| `tenant_id` | `10000000-0000-0000-0000-000000000001` | ✓ |
| `workspace_id` | `20000000-0000-0000-0000-000000000001` | ✓ |

---

## G. Controlled Test Object Evidence

### Proposal capture

| Field | Value |
|-------|-------|
| `capture_id` | `179e8bd3-0ccc-4a1e-a48f-c139c01dfd56` |
| `capture_source` | `manual` |
| `tenant_id` | `10000000-0000-0000-0000-000000000001` |

### Proposal event

| Field | Value |
|-------|-------|
| `event_id` | `b39fefe3-0639-494e-b84e-9093564a17ec` |
| `proposal_reference` | `[TEST ONLY]` ✓ |
| `proposal_status` | `sent` |
| `lead_id` | `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` |

### Proposal follow-up commitment

| Field | Value | Pass? |
|-------|-------|-------|
| `commitment_id` | `827e62ca-41c0-43da-9f02-6100a8eb52ce` | ✓ |
| `commitment_status` | `open` | ✓ |
| `schedule_rule_key` | `single_7` | ✓ |
| `follow_up_sequence` | `1` | ✓ |
| `follow_up_due_at` | `2026-06-12 02:00:00+00` | ✓ |
| `draft_id` (back-link) | `97e59aa8-5906-44f0-ad6a-bb3f23517500` | ✓ |
| `lead_id` | `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` | ✓ |
| `proposal_reference` | `[TEST ONLY]` | ✓ |
| `tenant_id` | `10000000-0000-0000-0000-000000000001` | ✓ |
| `workspace_id` | `20000000-0000-0000-0000-000000000001` | ✓ |

### Email draft

| Field | Value | Pass? |
|-------|-------|-------|
| `draft_id` | `97e59aa8-5906-44f0-ad6a-bb3f23517500` | ✓ |
| `subject` | `[TEST ONLY] Following up on your payment processing proposal — Mikes Test Co` | ✓ |
| `to_email` | `mgervasio@321swipe.com` | ✓ |
| `source_type` | `future_follow_up` | ✓ |
| `subject_type` | `proposal_follow_up_commitment` | ✓ |
| `subject_id` | `827e62ca-41c0-43da-9f02-6100a8eb52ce` (commitment) | ✓ |
| `status` | `approved` | ✓ |
| `approval_request_id` | `1afaff3b-665c-47ec-84fa-d9395520d88e` | ✓ |
| `sender_email` | `noreply@321swipe.com` | ✓ |
| `sender is_default` | `true` | ✓ |
| `sender is_verified` | `true` | ✓ |
| `sent_at` | `null` ✓ | ✓ |
| `superseded_at` | `null` ✓ | ✓ |
| `deleted_at` | `null` ✓ | ✓ |
| `campaign_assignment_id` | `null` ✓ | ✓ |
| `approved_at` | `2026-06-05 03:59:12 UTC` | ✓ |
| `approved_by` | `a76d71ca-fe31-4314-8698-212714919d28` | ✓ |

### Approval request

| Field | Value | Pass? |
|-------|-------|-------|
| `approval_request_id` | `1afaff3b-665c-47ec-84fa-d9395520d88e` | ✓ |
| `status` | `approved` | ✓ |
| `request_type` | `proposal_follow_up_draft_review` | ✓ |
| `subject_type` | `proposal_follow_up_commitment` | ✓ |
| `subject_id` | `827e62ca-41c0-43da-9f02-6100a8eb52ce` (commitment) | ✓ |
| `decided_at` | `2026-06-05 03:59:12 UTC` (non-null) | ✓ |
| `approved_by` | `a76d71ca-fe31-4314-8698-212714919d28` | ✓ |
| `tenant_id` | `10000000-0000-0000-0000-000000000001` | ✓ |
| `workspace_id` | `20000000-0000-0000-0000-000000000001` | ✓ |

---

## H. Count and Send-Safety Evidence

### Counts

| Metric | Value | Expected | Pass? |
|--------|-------|----------|-------|
| `proposal_follow_up_commitments` | **1** | 1 | ✓ |
| `future_follow_up` drafts | **1** | 1 | ✓ |
| `proposal_follow_up_commitment` drafts | **1** | 1 | ✓ |
| `proposal_follow_up_draft_review` approvals | **1** | 1 | ✓ |
| `email_sends` | **2** | 2 (unchanged) | ✓ |
| `campaign_email_sends` | **0** | 0 (unchanged) | ✓ |

### Send safety

| Check | Result |
|-------|--------|
| `email_sends` rows for draft `97e59aa8-...` | **0** — empty ✓ |
| `draft.sent_at` | `null` ✓ |
| `draft.superseded_at` | `null` ✓ |
| No send occurred | ✓ |

---

## I. Gate Evidence

| Key | `tenant_id` | `value` | `is_enabled` | Effective |
|-----|-------------|---------|-------------|-----------|
| `campaign_sending_enabled` | `null` (global) | `false` | `true` | **false** ✓ |
| `email_sending_enabled` | `null` (global) | `false` | `true` | **false** ✓ |
| `email_sending_enabled` | `10000000-...-0001` (tenant) | `false` | `true` | **false** ✓ |

`getBooleanControl(EMAIL_SENDING_ENABLED, tenantId)` → **`false`** (tenant-specific override takes precedence) ✓

Effective sending remains blocked by both global and tenant-scoped gates.

---

## J. Code Gap Evidence

### Gap location

**File:** [modules/messaging/services/email-draft.service.ts](../../modules/messaging/services/email-draft.service.ts) — lines 269–296

**File:** [modules/workflow/actions/approval.actions.ts](../../modules/workflow/actions/approval.actions.ts) — line 103

### Gap description

`approval.actions.ts` calls `syncApprovalDecisionToDraft(ctx, approval, 'approved')` unconditionally at line 103 for all approval types. However, `syncApprovalDecisionToDraft` (line 274) returns immediately when:

```typescript
if (approval.request_type !== 'email_draft_review') return
```

For `proposal_follow_up_draft_review` requests, this means:
1. `approval_requests.status` is set to `'approved'` ✓ (via `resolveApprovalRequest`)
2. `email_drafts.status` is **NOT** synced — remains `'pending_approval'`

### Why this blocks Slice 5

`checkDraftSendReadiness` (line 26 of `draft-send-readiness.service.ts`) requires:

```typescript
if (draft.status !== 'approved') blockedReasons.push('draft_not_approved')
```

`sendFollowUpDraftAction` calls `checkDraftSendReadiness` at step J. If the draft is in `'pending_approval'` status after approval (because sync was skipped), the send fails with `'draft_not_approved'`.

Similarly, `assertDraftIsApprovable` returns `null` (no guard) for `proposal_follow_up_draft_review`, so the approval itself succeeds — only the status sync is missing.

### Current workaround

Slice 4J Step 9 manually ran `UPDATE email_drafts SET status='approved'` as part of the raw DB write DO block. The test object currently has `draft.status='approved'`. However, if the operator uses the staging app to call `approveRequestAction` on a future follow-up draft through the normal UI path, the draft will be left in `'pending_approval'` and the send button will fail.

### Required fix before Slice 5

Extend `syncApprovalDecisionToDraft` to handle `'proposal_follow_up_draft_review'` in addition to `'email_draft_review'`. The fix should look up the `draft_id` from `payload.draft_id` (same pattern as for `email_draft_review`) and update the draft status.

**Alternatively:** The `sendFollowUpDraftAction` could directly verify and sync draft status before the send, independent of the approval path. Either fix must be code-reviewed and committed before Slice 5.

---

## K. Slice 5 Readiness Decision

**Slice 5 is NOT READY.**

| Requirement | Status |
|-------------|--------|
| Codex PASS on Slice 4K report | ⏳ Pending (this report) |
| Explicit operator approval for Slice 5 | ⏳ Not yet given |
| `syncApprovalDecisionToDraft` gap fixed (or alternative verified) | ❌ **Not fixed** — code change required before Slice 5 |
| Separate Slice 5 controlled send plan document | ❌ Not written |
| Final preflight immediately before send | ❌ Not run |
| Test window | ✓ June 5, 2026, 12:00 AM–1:00 AM ET (assigned) |

**Required before Slice 5 may proceed (in order):**

1. Codex PASS on this Slice 4K report
2. Code fix: extend `syncApprovalDecisionToDraft` to handle `proposal_follow_up_draft_review` — committed, deployed to staging
3. Verify the staged fix works: re-test approval → sync path in staging
4. Explicit operator approval of Slice 5 execution plan
5. Separate Slice 5 controlled send plan document (execution prompt with all safety gates)
6. Final preflight immediately before send (project-ref, gate values, counts, draft readiness)
7. Enable `EMAIL_SENDING_ENABLED` for tenant `10000000-...-0001` — tenant-specific, immediately re-disabled after send

---

## L. Final Decision

| Item | Result |
|------|--------|
| Slice 4K evidence recollection | **Completed** ✓ |
| No writes occurred | ✓ |
| No sends occurred | ✓ |
| No gates enabled | ✓ |
| No production changes | ✓ |
| `EMAIL_SENDING_ENABLED` effective `false` | ✓ |
| `CAMPAIGN_SENDING_ENABLED` effective `false` | ✓ |
| `syncApprovalDecisionToDraft` gap | **Open** — must fix before Slice 5 |
| **Slice 5** | **BLOCKED** — Codex PASS + operator approval + code fix + send plan required |
