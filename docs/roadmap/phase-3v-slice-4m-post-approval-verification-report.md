# Phase 3V Slice 4M — Post-Approval Verification Report

**Status:** PASS  
**Date:** 2026-06-06  
**Branch:** master  
**HEAD at verification:** 07432193812d870aecdfedc23a06f433c34f7d51

---

## A. Purpose

This report documents the Phase 3V Slice 4M post-approval SELECT-only verification — confirming that the normal workspace approval path synced the linked proposal follow-up email draft from `pending_approval` to `approved` without sending.

The operator approved approval_request `adc74313-8391-4ae3-8f08-42eda7005e51` through the normal staging Approval Inbox UI. This verification confirms the approval propagated correctly and that no send occurred.

---

## B. Git / Ref / Deployment Boundary

| Item | Value |
|------|-------|
| HEAD at verification | 07432193812d870aecdfedc23a06f433c34f7d51 |
| origin/master | 07432193812d870aecdfedc23a06f433c34f7d51 (in sync) |
| Working tree before verification | clean |
| Staging only | YES |
| Production excluded | YES — kxrplupzbsmujjznzhpy not queried or written |

---

## C. Staging Relink Evidence

| Item | Value |
|------|-------|
| Starting supabase/.temp/project-ref | kxrplupzbsmujjznzhpy (PRODUCTION) |
| Relink command executed | `npx supabase link --project-ref smbausuyetlgxflyhmfg` |
| Staging ref after relink | smbausuyetlgxflyhmfg (CONFIRMED) |
| Relink authorization | Explicitly authorized by this verification prompt |
| All queries run against | smbausuyetlgxflyhmfg (staging) only |
| Query type | SELECT-only — no writes |
| Post-verification cleanup | supabase/.temp reverted via `git checkout -- supabase/.temp/` |
| project-ref after cleanup | kxrplupzbsmujjznzhpy (production restored) |
| git status supabase/.temp after cleanup | clean — no tracked changes |

---

## D. Operator Approval Evidence

| Item | Value |
|------|-------|
| Approval method | Normal staging Approval Inbox UI |
| Target approval_request | adc74313-8391-4ae3-8f08-42eda7005e51 |
| UI response shown | "Request approved" |
| Pending count shown by UI after | "0 pending requests" |
| Send button clicked by operator | NO |
| approveAndSendAction called | NO |
| sendFollowUpDraftAction called | NO |
| token approve-and-send used | NO |
| approve-and-send path used | NO |
| Any email sent by operator | NO |

---

## E. Approval Request Verification

Query:
```sql
SELECT id::text, request_type, status, subject_type, subject_id::text, decided_at, payload
FROM approval_requests
WHERE id = 'adc74313-8391-4ae3-8f08-42eda7005e51';
```

| Field | Value | Check |
|-------|-------|-------|
| id | adc74313-8391-4ae3-8f08-42eda7005e51 | — |
| request_type | proposal_follow_up_draft_review | ✓ |
| status | approved | ✓ (was pending) |
| subject_type | proposal_follow_up_commitment | ✓ |
| subject_id | 45d3b340-a6e9-41af-ad99-a0fc212cebf2 | ✓ |
| decided_at | 2026-06-06 12:33:11.688+00 | not null ✓ |
| payload.draft_id | 11237662-a955-448b-b8a8-4407988e762e | ✓ |
| payload.commitment_id | 45d3b340-a6e9-41af-ad99-a0fc212cebf2 | ✓ |
| payload.proposal_event_id | fc6c5820-46b0-4404-864b-80d07a48bf7d | ✓ |
| payload.lead_id | d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1 | ✓ |
| payload.schedule_rule_key | single_7 | ✓ |

All approval_request fields pass. ✓

---

## F. Draft Sync Verification

Query:
```sql
SELECT id::text, status, to_email, subject, sent_at, approval_request_id::text,
       source_type, subject_type, subject_id::text, sender_identity_id::text
FROM email_drafts
WHERE id = '11237662-a955-448b-b8a8-4407988e762e';
```

| Field | Value | Check |
|-------|-------|-------|
| id | 11237662-a955-448b-b8a8-4407988e762e | — |
| status | approved | ✓ (was pending_approval — transition confirmed) |
| to_email | mgervasio@321swipe.com | ✓ |
| subject | [TEST ONLY] Slice 4M follow-up draft | contains [TEST ONLY] ✓ |
| sent_at | null | ✓ — no send occurred |
| approval_request_id | adc74313-8391-4ae3-8f08-42eda7005e51 | ✓ |
| source_type | future_follow_up | ✓ |
| subject_type | proposal_follow_up_commitment | ✓ |
| subject_id | 45d3b340-a6e9-41af-ad99-a0fc212cebf2 | ✓ |
| sender_identity_id | de105997-62bb-434e-9a4d-15c409d8d49b | ✓ |

Draft transitioned `pending_approval` → `approved`. sent_at remains null. ✓

---

## G. Relationship Verification

### G.1 Commitment linkage

Query:
```sql
SELECT id::text, commitment_status, schedule_rule_key, proposal_event_id::text, draft_id::text
FROM proposal_follow_up_commitments
WHERE id = '45d3b340-a6e9-41af-ad99-a0fc212cebf2';
```

| Field | Value | Check |
|-------|-------|-------|
| id | 45d3b340-a6e9-41af-ad99-a0fc212cebf2 | — |
| commitment_status | open | ✓ |
| schedule_rule_key | single_7 | ✓ |
| proposal_event_id | fc6c5820-46b0-4404-864b-80d07a48bf7d | ✓ |
| draft_id | 11237662-a955-448b-b8a8-4407988e762e | ✓ |

### G.2 Proposal event

Query:
```sql
SELECT id::text, proposal_reference, proposal_status, deleted_at
FROM proposal_events
WHERE id = 'fc6c5820-46b0-4404-864b-80d07a48bf7d';
```

| Field | Value | Check |
|-------|-------|-------|
| id | fc6c5820-46b0-4404-864b-80d07a48bf7d | — |
| proposal_reference | [TEST ONLY] Slice 4M retry | ✓ |
| proposal_status | sent | ✓ |
| deleted_at | null | ✓ |

All relationship fields intact. ✓

---

## H. Send / Gate Safety Evidence

### H.1 Send counts

Query:
```sql
SELECT
  (SELECT COUNT(*) FROM email_sends)::text AS email_sends_after,
  (SELECT COUNT(*) FROM campaign_email_sends)::text AS campaign_email_sends_after;
```

| Metric | Baseline | After | Check |
|--------|----------|-------|-------|
| email_sends | 2 | 2 | unchanged ✓ |
| campaign_email_sends | 0 | 0 | unchanged ✓ |

No send occurred. ✓

### H.2 Gates

Query:
```sql
SELECT key, value::text, is_enabled, tenant_id::text
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST, key ASC;
```

| key | value | is_enabled | tenant_id | Check |
|-----|-------|-----------|-----------|-------|
| campaign_sending_enabled | false | true (row active) | null (global) | gate off ✓ |
| email_sending_enabled | false | true (row active) | null (global) | gate off ✓ |
| email_sending_enabled | false | true (row active) | 10000000-0000-0000-0000-000000000001 | gate off ✓ |

Note: `is_enabled` reflects whether the system_controls row itself is active. The `value` field is the gate value — all gates remain `false`. ✓

No gate enabled. ✓

---

## I. Old Object Exclusion Evidence

### I.1 Old commitment

| Field | Value | Check |
|-------|-------|-------|
| id | 827e62ca-41c0-43da-9f02-6100a8eb52ce | — |
| commitment_status | open | unchanged ✓ |
| draft_id | 97e59aa8-5906-44f0-ad6a-bb3f23517500 | unchanged ✓ |

### I.2 Old draft

| Field | Value | Check |
|-------|-------|-------|
| id | 97e59aa8-5906-44f0-ad6a-bb3f23517500 | — |
| status | approved | unchanged ✓ |
| sent_at | null | unchanged ✓ |
| approval_request_id | 1afaff3b-665c-47ec-84fa-d9395520d88e | unchanged ✓ |

### I.3 Old approval_request

| Field | Value | Check |
|-------|-------|-------|
| id | 1afaff3b-665c-47ec-84fa-d9395520d88e | — |
| status | approved | unchanged ✓ |
| request_type | proposal_follow_up_draft_review | unchanged ✓ |
| decided_at | 2026-06-05 03:59:12.146089+00 | old date, unchanged ✓ |

Old objects not modified by this approval. ✓

### I.4 Pending AR count

| Metric | Value | Check |
|--------|-------|-------|
| pending_proposal_follow_up_review_count | 0 | target AR is not pending ✓ |

---

## J. Supabase Temp Cleanup Evidence

| Item | Evidence |
|------|---------|
| Revert command | `git checkout -- supabase/.temp/` |
| project-ref after revert | kxrplupzbsmujjznzhpy (production restored) |
| git status supabase/.temp after cleanup | clean — no tracked changes |
| No temp SQL file created | SELECT-only verification — no SQL file needed |

---

## K. Stop Conditions Reviewed

| Condition | Status |
|-----------|--------|
| Production ref linked during verification | NO ✓ |
| Staging ref confirmed | YES — smbausuyetlgxflyhmfg ✓ |
| Any write command run | NONE ✓ |
| approval_request status != approved | approved ✓ |
| email_draft status != approved | approved ✓ |
| email_draft.sent_at not null | null ✓ |
| Send count changed | Unchanged ✓ |
| Any gate enabled | All false ✓ |
| approveAndSendAction called | NO ✓ |
| sendFollowUpDraftAction called | NO ✓ |
| token approve-and-send used | NO ✓ |
| Old objects modified | Unchanged ✓ |
| Relationships broken | All intact ✓ |
| Any email sent | None ✓ |
| Tag created | NO ✓ |
| Anything pushed | Nothing pushed by this verification ✓ |
| Slice 5 attempted | NO ✓ |

---

## L. Final Verdict

**PASS** — Normal workspace approval path synced draft `pending_approval` → `approved` with no send.

Key evidence:
- approval_request `adc74313` transitioned to `approved`, decided_at `2026-06-06 12:33:11.688+00` ✓
- email_draft `11237662` transitioned to `approved`, `sent_at` remains null ✓
- email_sends unchanged at 2 ✓
- campaign_email_sends unchanged at 0 ✓
- All gates remain false ✓
- Old objects unchanged ✓
- Relationships intact ✓

The approval flow ran correctly: the operator approved through the normal Approval Inbox UI without using any send path, and the draft transitioned to `approved` without triggering a send.

---

## M. Slice 5 Status

**Slice 5 remains BLOCKED.**

This PASS result demonstrates that the normal workspace approval path works correctly for `proposal_follow_up_draft_review` requests — approving a pending draft to `approved` without sending. Slice 5 readiness requires Codex review of this evidence before proceeding.
