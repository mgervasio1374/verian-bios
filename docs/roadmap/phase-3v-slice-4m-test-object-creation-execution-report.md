# Phase 3V Slice 4M — Test Object Creation Execution Report

**Status:** PASS  
**Date:** 2026-06-06  
**Branch:** master  
**HEAD at execution:** 5cc90f564369e304dd7b1904c457b3942f55b7fe

---

## A. Purpose

This report documents the execution of the Phase 3V Slice 4M staging test object creation — the approved schema-inspection-first direct-DB write to create exactly one controlled staging test object set needed to unblock the Slice 4M approval verification sequence.

The write was required because:
- The staging UI has no proposal capture creation path.
- CLI server-action invocation is blocked without authenticated Next.js session context.

---

## B. Git / Ref / Deployment Boundary

| Item | Value |
|------|-------|
| HEAD at execution | 5cc90f564369e304dd7b1904c457b3942f55b7fe |
| origin/master | 5cc90f564369e304dd7b1904c457b3942f55b7fe (in sync) |
| Prior HEAD commit | docs/roadmap/phase-3v-slice-4m-schema-inspection-test-object-creation-execution-plan.md |
| Working tree before execution | clean |
| Staging only | YES |
| Production excluded | YES — kxrplupzbsmujjznzhpy not queried or written |

---

## C. Staging Relink Evidence

| Item | Value |
|------|-------|
| Starting supabase/.temp/project-ref | kxrplupzbsmujjznzhpy (PRODUCTION) |
| Relink command executed | `npx supabase link --project-ref smbausuyetlgxflyhmfg` |
| Staging ref after relink | smbausuyetlgxflyhmfg (CONFIRMED) |
| Relink authorization | Explicitly authorized by this execution prompt |
| All queries run against | smbausuyetlgxflyhmfg (staging) only |
| Post-execution cleanup | supabase/.temp reverted via `git checkout -- supabase/.temp/` |
| project-ref after cleanup | kxrplupzbsmujjznzhpy (production restored) |
| Temp SQL file | supabase/.temp/slice4m_write.sql — created for execution, deleted after |
| supabase/.temp git status after cleanup | clean — no tracked changes |

---

## D. Pre-Write Safety Evidence

### D.1 Sender
| Field | Value |
|-------|-------|
| email | noreply@321swipe.com |
| is_default | true |
| is_verified | true |
| status | active |
| staging_sender_identity_id | de105997-62bb-434e-9a4d-15c409d8d49b |

### D.2 Gates (before)
| Key | Value |
|-----|-------|
| email_sending_enabled | false |
| campaign_sending_enabled | false |

### D.3 Send baselines
| Metric | Value |
|--------|-------|
| email_sends_before | 2 |
| campaign_email_sends_before | 0 |

### D.4 Lead / contact
| Field | Value |
|-------|-------|
| lead_id | d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1 |
| lead.name | Mikes Test Co |
| lead.workspace_id | 20000000-0000-0000-0000-000000000001 ✓ |
| contact_id | b57b9831-b25b-44d2-a354-d153d360f815 |
| contact.email | mgervasio@321swipe.com ✓ |
| contact.do_not_contact | false ✓ |
| contact.status | active ✓ |

### D.5 Open proposal count (before)
| Metric | Value |
|--------|-------|
| open_count_before | 0 ✓ (using proposal_status IN ('sent','viewed') AND deleted_at IS NULL) |

### D.6 Old objects confirmed (not reused)
| Object | ID | Status |
|--------|----|--------|
| old proposal_event | b39fefe3-0639-494e-b84e-9093564a17ec | accepted (cleared) |
| old commitment | 827e62ca-41c0-43da-9f02-6100a8eb52ce | open, draft_id = 97e59aa8... |
| old draft | 97e59aa8-5906-44f0-ad6a-bb3f23517500 | approved, sent_at=null |
| old approval_request | 1afaff3b-665c-47ec-84fa-d9395520d88e | approved, decided_at=2026-06-05 |

### D.7 Before counts
| Object type | Count |
|-------------|-------|
| proposal_events (lead) | 1 |
| proposal_follow_up_commitments (lead) | 1 |
| future_follow_up drafts (lead) | 1 |
| proposal_follow_up_draft_review ARs (lead) | 1 |

---

## E. Transaction Execution Evidence

- **Method:** `supabase db query --linked --file supabase/.temp/slice4m_write.sql`
- **SQL shape:** PL/pgSQL DO $$ $$ block with 6 sequential steps
- **RAISE EXCEPTION guard:** YES — each step checked for null ID or wrong row count; RAISE EXCEPTION triggered auto-rollback on failure
- **Result:** DO block returned empty rows (expected — DO has void return type); NO exception thrown
- **All 6 steps passed atomically and auto-committed**

### Step outcomes
| Step | Action | Result |
|------|--------|--------|
| 1 | INSERT proposal_event | Returned non-null ID ✓ |
| 2 | INSERT proposal_follow_up_commitment | Returned non-null ID ✓ |
| 3 | INSERT email_draft | Returned non-null ID ✓ |
| 4 | UPDATE commitment.draft_id (WHERE draft_id IS NULL) | 1 row updated ✓ |
| 5 | INSERT approval_request | Returned non-null ID ✓ |
| 6 | UPDATE draft.approval_request_id | 1 row updated ✓ |

- **update_commitment_count:** 1 ✓
- **update_draft_count:** 1 ✓

---

## F. New Object IDs

| Object | New ID |
|--------|--------|
| proposal_event | fc6c5820-46b0-4404-864b-80d07a48bf7d |
| proposal_follow_up_commitment | 45d3b340-a6e9-41af-ad99-a0fc212cebf2 |
| email_draft | 11237662-a955-448b-b8a8-4407988e762e |
| approval_request | adc74313-8391-4ae3-8f08-42eda7005e51 |

All new IDs differ from all old IDs. ✓

---

## G. Post-Write Verification

### G.1 New proposal_event
| Field | Value | Check |
|-------|-------|-------|
| id | fc6c5820-46b0-4404-864b-80d07a48bf7d | — |
| proposal_reference | [TEST ONLY] Slice 4M retry | ✓ |
| proposal_status | sent | ✓ |
| proposal_sent_at | 2026-06-06 12:15:14.617903+00 | not null ✓ |
| capture_source | manual | ✓ |
| deleted_at | null | ✓ |

### G.2 New proposal_follow_up_commitment
| Field | Value | Check |
|-------|-------|-------|
| id | 45d3b340-a6e9-41af-ad99-a0fc212cebf2 | — |
| schedule_rule_key | single_7 | ✓ |
| commitment_status | open | ✓ |
| proposal_event_id | fc6c5820-46b0-4404-864b-80d07a48bf7d | = new event ✓ |
| draft_id | 11237662-a955-448b-b8a8-4407988e762e | = new draft ✓ |

### G.3 New email_draft
| Field | Value | Check |
|-------|-------|-------|
| id | 11237662-a955-448b-b8a8-4407988e762e | — |
| status | pending_approval | ✓ |
| to_email | mgervasio@321swipe.com | ✓ |
| subject | [TEST ONLY] Slice 4M follow-up draft | contains [TEST ONLY] ✓ |
| sent_at | null | ✓ |
| approval_request_id | adc74313-8391-4ae3-8f08-42eda7005e51 | = new AR ✓ |
| source_type | future_follow_up | ✓ |
| subject_type | proposal_follow_up_commitment | ✓ |
| subject_id | 45d3b340-a6e9-41af-ad99-a0fc212cebf2 | = new commitment ✓ |
| sender_identity_id | de105997-62bb-434e-9a4d-15c409d8d49b | = noreply@321swipe.com ✓ |

### G.4 New approval_request
| Field | Value | Check |
|-------|-------|-------|
| id | adc74313-8391-4ae3-8f08-42eda7005e51 | — |
| request_type | proposal_follow_up_draft_review | ✓ |
| status | pending | ✓ |
| subject_type | proposal_follow_up_commitment | ✓ |
| subject_id | 45d3b340-a6e9-41af-ad99-a0fc212cebf2 | = new commitment ✓ |
| payload.draft_id | 11237662-a955-448b-b8a8-4407988e762e | = new draft ✓ |
| payload.commitment_id | 45d3b340-a6e9-41af-ad99-a0fc212cebf2 | = new commitment ✓ |
| payload.proposal_event_id | fc6c5820-46b0-4404-864b-80d07a48bf7d | = new event ✓ |
| payload.schedule_rule_key | single_7 | ✓ |
| payload.lead_id | d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1 | ✓ |

### G.5 Count deltas
| Object type | Before | After | Delta |
|-------------|--------|-------|-------|
| proposal_events (lead) | 1 | 2 | +1 ✓ |
| proposal_follow_up_commitments (lead) | 1 | 2 | +1 ✓ |
| future_follow_up drafts (lead) | 1 | 2 | +1 ✓ |
| proposal_follow_up_draft_review ARs (lead) | 1 | 2 | +1 ✓ |

### G.6 Open proposal count (after)
| Metric | Value | Note |
|--------|-------|------|
| open_count_after | 1 | Expected — new test proposal_event (status='sent') is intentionally open for retry verification |

---

## H. Send / Gate Safety Evidence

| Metric | Before | After | Check |
|--------|--------|-------|-------|
| email_sends | 2 | 2 | unchanged ✓ |
| campaign_email_sends | 0 | 0 | unchanged ✓ |
| email_sending_enabled | false | false | unchanged ✓ |
| campaign_sending_enabled | false | false | unchanged ✓ |

No send occurred. ✓

---

## I. Old Object Exclusion Evidence

| Object | Old ID | Status after | Changed? |
|--------|--------|--------------|---------|
| old commitment | 827e62ca-41c0-43da-9f02-6100a8eb52ce | open, draft_id=97e59aa8... | unchanged ✓ |
| old draft | 97e59aa8-5906-44f0-ad6a-bb3f23517500 | approved, sent_at=null | unchanged ✓ |
| old approval_request | 1afaff3b-665c-47ec-84fa-d9395520d88e | approved, decided_at=2026-06-05 | unchanged ✓ |

Old IDs excluded from new object set. ✓

---

## J. Supabase Temp Cleanup Evidence

| Item | Evidence |
|------|---------|
| Temp SQL file created | supabase/.temp/slice4m_write.sql |
| Temp SQL file deleted | YES — removed after execution |
| project-ref revert command | `git checkout -- supabase/.temp/` |
| project-ref after revert | kxrplupzbsmujjznzhpy (production restored) |
| git status supabase/.temp after cleanup | clean — no tracked changes |

---

## K. Stop Conditions Reviewed

| Condition | Status |
|-----------|--------|
| Production ref linked during execution | NO ✓ |
| Staging ref confirmed | YES — smbausuyetlgxflyhmfg ✓ |
| Schema uncertainty | NONE — all columns confirmed from migrations/repos ✓ |
| approval_requests.email_draft_id referenced | NO ✓ |
| email_drafts.from_email referenced | NO ✓ |
| Required NOT NULL columns unconfirmed | NONE ✓ |
| tenant_id / workspace_id unconfirmed | CONFIRMED before write ✓ |
| Open proposal count not 0 before write | 0 confirmed ✓ |
| Sender missing/unverified | Verified ✓ |
| Gate true before write | Both false ✓ |
| update_commitment count != 1 | Count = 1 ✓ |
| update_draft count != 1 | Count = 1 ✓ |
| Any RETURNING ID null | All non-null ✓ |
| Send count changed | Unchanged ✓ |
| More than one row per object type | Exactly 1 new per type ✓ |
| Old objects modified | Unchanged ✓ |
| New draft status != pending_approval | pending_approval ✓ |
| New approval_request status != pending | pending ✓ |
| New draft sent_at not null | null ✓ |
| Any send occurred | None ✓ |
| Approval performed during creation | None ✓ |
| Slice 5 attempted | NO ✓ |

---

## L. Final Verdict

**PASS** — Test object set created safely in staging.

All 4 new objects created in a single atomic DO block transaction:
- 1 proposal_event (fc6c5820)
- 1 proposal_follow_up_commitment (45d3b340)
- 1 email_draft — status pending_approval (11237662)
- 1 approval_request — status pending (adc74313)

All relationships correctly linked:
- commitment.draft_id → new draft ✓
- draft.approval_request_id → new approval_request ✓
- approval_request.payload.draft_id → new draft ✓
- approval_request.payload.commitment_id → new commitment ✓

No send occurred. No approval performed. Old objects unchanged. Gates remain false.

The new approval_request `adc74313-8391-4ae3-8f08-42eda7005e51` is now visible in the staging workspace and ready for normal operator approval through the staging UI.

---

## M. Slice 5 Status

**Slice 5 remains BLOCKED.**

The next step is:
1. Operator approves approval_request `adc74313-8391-4ae3-8f08-42eda7005e51` through normal staging workspace UI.
2. Claude runs SELECT-only post-approval verification: new draft transitions `pending_approval` → `approved`, sent_at remains null, send counts unchanged, gates remain false.
3. PASS only if the approval flow completes normally without a send.
4. Slice 5 is unblocked only after this verification passes and Codex reviews the evidence.
