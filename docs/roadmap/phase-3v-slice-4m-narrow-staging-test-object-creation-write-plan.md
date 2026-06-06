# Phase 3V Slice 4M — Narrow Staging Test Object Creation Write Plan

**Status:** PLAN ONLY — NOT EXECUTED  
**Date:** 2026-06-06 (revised after Codex FAIL)  
**Branch:** master  
**HEAD at plan creation:** 438511ff2c24b8e10e3cd98e3485e69b0b316219

---

## A. Purpose

The staging UI lacks a proposal capture creation path (no visible "New Proposal" or equivalent action on the lead page), and Claude cannot invoke `createManualProposalCaptureAction` or `generateFollowUpDraftAction` from the CLI because these server actions require an authenticated Next.js session context that is unavailable outside the browser.

This plan defines a narrow staging-only DB creation path to produce exactly one new controlled test object set, sufficient to unblock the normal workspace approval verification sequence for Phase 3V Slice 4M.

The write must not approve anything, must not send anything, and must not alter any system controls.

---

## B. Current Blocker Evidence

| Evidence | Detail |
|----------|--------|
| No proposal capture creation option in staging UI | Lead page d4e24f9f shows old approved draft only; no capture/new-proposal action is visible |
| Server actions require authenticated session | `createManualProposalCaptureAction`, `generateFollowUpDraftAction` cannot be invoked from CLI |
| Raw DB object creation not previously authorized | Prior attempts used app actions only; direct insert was deferred pending explicit authorization |
| One-open-proposal constraint already cleared | proposal_event b39fefe3-0639-494e-b84e-9093564a17ec was accepted; open_count_before = 0 |
| Old objects must not be reused | commitment 827e62ca is open; draft 97e59aa8 is approved; approval_request 1afaff3b is approved |
| No pending_approval draft exists | Confirmed via prior execution report |
| No pending proposal_follow_up_draft_review approval_request exists | Confirmed via prior execution report |

---

## C. Write Boundary

- **Environment:** staging only (ref `smbausuyetlgxflyhmfg`)
- **Production excluded:** ref `kxrplupzbsmujjznzhpy` must not be linked or touched at any point
- **Scope:** exactly one new test object set (1 proposal_event, 1 commitment, 1 draft, 1 approval_request)
- **No schema changes**
- **No migrations**
- **No system_controls changes**
- **No sender/provider configuration changes**
- **No sends**
- **No draft approval**
- **No approval action**
- **Slice 5 remains BLOCKED**

---

## D. Pre-Write SELECT-Only Verification

The following SELECT checks must be run and verified before any write is attempted. All queries are read-only.

### D.1 Staging ref confirmation
```sql
-- Confirm staging project ref
SELECT current_setting('app.settings.project_ref', true);
-- Must return: smbausuyetlgxflyhmfg
-- HARD STOP if not confirmed.
```

### D.2 Production isolation
```sql
-- Confirm production ref is not linked
-- Run only against staging Supabase project dashboard (smbausuyetlgxflyhmfg)
-- Do not run any query against kxrplupzbsmujjznzhpy
-- HARD STOP if any connection to production ref is detected
```

### D.3 Staging deployment version
```sql
-- Confirm staging deployment includes commit 0b8f4bc or later
-- (if app will be used after creation)
-- Verify via Vercel staging deployment log or git SHA visible in staging app
```

### D.4 Sender verification
```sql
SELECT id::text, email, is_default, is_verified, status
FROM sender_identities
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
ORDER BY is_default DESC;
-- noreply@321swipe.com must appear with is_verified = true, status = active, is_default = true
-- HARD STOP if sender is missing, inactive, or unverified
```

### D.5 Gates
```sql
SELECT key, value
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled');
-- Must return: both false
-- HARD STOP if either is true
```

### D.6 Email send baselines
```sql
SELECT COUNT(*) FROM email_sends;
-- Record as email_sends_before. Expected: 2 unless unrelated prior activity changed it.

SELECT COUNT(*) FROM campaign_email_sends;
-- Record as campaign_email_sends_before. Expected: 0.
```

### D.7 Lead and contact verification
```sql
SELECT
  l.id::text AS lead_id,
  l.name,
  c.id::text AS contact_id,
  c.email,
  c.do_not_contact,
  c.status
FROM leads l
JOIN contacts c ON c.id = l.contact_id
WHERE l.id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND l.tenant_id = '10000000-0000-0000-0000-000000000001';
-- Must return exactly one row
-- c.email must be mgervasio@321swipe.com
-- c.do_not_contact must be false
-- c.status must be active
-- HARD STOP if lead not found, email does not match, do_not_contact = true, or status != active
```

### D.8 Open proposal count
```sql
SELECT COUNT(*) AS open_count
FROM proposal_events
WHERE lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND proposal_status NOT IN ('accepted', 'rejected', 'closed', 'cancelled');
-- Must return: 0
-- HARD STOP if open_count > 0
```

### D.9 Old object existence (confirm but do not reuse)
```sql
-- Confirm old commitment still exists but is not pending_approval
SELECT id, commitment_status
FROM proposal_follow_up_commitments
WHERE id = '827e62ca-41c0-43da-9f02-6100a8eb52ce';

-- Confirm old draft still exists and is approved, not pending_approval
SELECT id, status, sent_at
FROM email_drafts
WHERE id = '97e59aa8-5906-44f0-ad6a-bb3f23517500';

-- Confirm old approval_request still exists and is approved
SELECT id, status, request_type
FROM approval_requests
WHERE id = '1afaff3b-665c-47ec-84fa-d9395520d88e';
```

### D.10 Object type before-counts
```sql
-- proposal_events for this lead
SELECT COUNT(*) AS pe_before
FROM proposal_events
WHERE lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1';

-- proposal_follow_up_commitments for this lead (via proposal_events)
SELECT COUNT(*) AS pfuc_before
FROM proposal_follow_up_commitments pfuc
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1';

-- future_follow_up drafts for this lead
SELECT COUNT(*) AS draft_before
FROM email_drafts ed
JOIN proposal_follow_up_commitments pfuc ON ed.subject_id = pfuc.id
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND ed.source_type = 'future_follow_up'
  AND ed.subject_type = 'proposal_follow_up_commitment';

-- proposal_follow_up_draft_review approval_requests for this lead
-- Note: approval_requests.email_draft_id does NOT exist; join via email_drafts.approval_request_id
SELECT COUNT(*) AS ar_before
FROM approval_requests ar
JOIN email_drafts ed ON ed.approval_request_id = ar.id
JOIN proposal_follow_up_commitments pfuc ON ed.subject_id = pfuc.id
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND ar.request_type = 'proposal_follow_up_draft_review';
```

---

## E. Proposed New Object Creation Strategy

> **⚠ SCHEMA-INSPECTION-FIRST DESIGN. No runnable INSERT SQL is provided in this plan. Concrete SQL must be generated only in the future execution prompt after schema inspection.**

### Known schema facts (from Codex review)

The following schema facts were identified during Codex review of the prior plan version. Any future execution must verify these against current migrations and repository code before generating SQL:

| Fact | Detail |
|------|--------|
| `proposal_events` requires additional columns | `tenant_id`, `workspace_id`, `proposal_sent_at`, and `capture_source` are required; prior planned SQL omitted them |
| `proposal_follow_up_commitments` requires additional columns | `tenant_id`, `workspace_id`, `lead_id`, `follow_up_due_at`, and `follow_up_sequence` are required; prior planned SQL omitted them |
| `approval_requests.email_draft_id` does not exist | The column does not exist in the current base schema |
| `approval_requests.payload.draft_id` is the correct linkage | The existing workflow stores draft linkage inside the `payload` JSONB column |
| `email_drafts.approval_request_id` is the back-link | `email_drafts` links to its approval_request via `approval_request_id`, not the other way around |
| `proposal_follow_up_commitments.draft_id` must be set | After draft creation, a separate UPDATE must link the draft back to the commitment via `draft_id` |

### Schema inspection required before execution

The future execution must inspect the following before constructing any INSERT or UPDATE SQL:

- `supabase/migrations/20240038_phase3n_proposal_capture.sql` — `proposal_events` schema, required columns, defaults
- `supabase/migrations/20240006_messaging.sql` — `email_drafts` schema, required columns, `approval_request_id` FK
- `supabase/migrations/20240003_workflow.sql` — `approval_requests` schema, `payload` structure, `proposal_follow_up_commitments` schema
- `supabase/migrations/20240035_phase3k_draft_source_provenance.sql` — source/subject provenance columns
- `modules/proposals/repositories/proposal-follow-up-draft.repo.ts` — repository insert patterns
- Any current repository files that create `proposal_events`, `proposal_follow_up_commitments`, `email_drafts`, and `approval_requests`

**HARD STOP if schema inspection cannot fully confirm required columns and relationship directions before any write is attempted.**

### Safe transaction shape (prose — no SQL)

The future execution must implement the following logical steps as a single transaction. Concrete SQL must be derived from schema inspection at execution time.

1. **Insert `proposal_event`** for lead `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` with all required schema-confirmed fields including `tenant_id`, `workspace_id`, `lead_id`, `proposal_sent_at`, `capture_source`, and a `proposal_reference` containing `[TEST ONLY] Slice 4M retry`. `proposal_status` must be the value required by the follow-up commitment model (confirm from schema/repo before setting).
2. **Insert `proposal_follow_up_commitment`** linked to the new `proposal_event`, with all required schema-confirmed fields including `tenant_id`, `workspace_id`, `lead_id`, `follow_up_due_at`, `follow_up_sequence`, `schedule_rule_key = single_7`, and `commitment_status = open`.
3. **Insert `approval_request`** with `request_type = proposal_follow_up_draft_review`, `status = pending`, and a `payload` JSONB value structured according to the existing workflow pattern. At this step `draft_id` in the payload may be a placeholder or null if the draft does not yet exist; the payload update in step 5 will finalize the linkage.
4. **Insert `email_draft`** with `source_type = future_follow_up`, `subject_type = proposal_follow_up_commitment`, `subject_id` linked to the new commitment, `status = pending_approval`, `to_email = mgervasio@321swipe.com`, `from_email = noreply@321swipe.com`, subject containing `[TEST ONLY]`, `sent_at = null`, and `approval_request_id` linked to the new `approval_request`.
5. **Update `approval_request.payload`** if needed after draft creation to include `draft_id = new_draft_id`, consistent with the existing workflow pattern.
6. **Update `proposal_follow_up_commitments.draft_id`** to the new draft ID.
7. **Return all new IDs** via `RETURNING` on each insert/update.
8. **Commit only if** exactly one new row per required object type is confirmed and all relationship checks pass (see Section F).
9. **Roll back** on any mismatch, missing ID, or failed relationship check.

**Concrete SQL must be generated only in the future execution prompt after schema inspection. This plan intentionally does not provide runnable INSERT SQL.**

---

## F. Post-Write SELECT-Only Verification

After the transaction commits, run these SELECT checks. All are read-only.

```sql
-- F.1 Exactly one new proposal_event created
SELECT COUNT(*) AS pe_after
FROM proposal_events
WHERE lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1';
-- Must be pe_before + 1

-- F.2 New proposal_event has correct reference and status
SELECT id, proposal_reference, proposal_status
FROM proposal_events
WHERE id = :new_proposal_event_id;
-- proposal_reference must contain '[TEST ONLY] Slice 4M retry'
-- proposal_status must be the schema-confirmed required status

-- F.3 Exactly one new commitment created
SELECT COUNT(*) AS pfuc_after
FROM proposal_follow_up_commitments pfuc
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1';
-- Must be pfuc_before + 1

-- F.4 New commitment has correct fields and draft linkage
SELECT id, schedule_rule_key, commitment_status, proposal_event_id, draft_id
FROM proposal_follow_up_commitments
WHERE id = :new_commitment_id;
-- schedule_rule_key = 'single_7', commitment_status = 'open'
-- proposal_event_id = new_proposal_event_id
-- draft_id = new_draft_id (after Step 6 update)

-- F.5 Exactly one new pending_approval draft created
SELECT COUNT(*) AS draft_after
FROM email_drafts ed
JOIN proposal_follow_up_commitments pfuc ON ed.subject_id = pfuc.id
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND ed.source_type = 'future_follow_up'
  AND ed.subject_type = 'proposal_follow_up_commitment';
-- Must be draft_before + 1

-- F.6 New draft has correct fields and back-link
SELECT id, status, to_email, from_email, subject, sent_at, approval_request_id
FROM email_drafts
WHERE id = :new_draft_id;
-- status = 'pending_approval'
-- to_email = 'mgervasio@321swipe.com'
-- subject contains '[TEST ONLY]'
-- sent_at IS NULL
-- approval_request_id = new_approval_request_id
-- HARD STOP if status != 'pending_approval' or sent_at IS NOT NULL

-- F.7 Exactly one new pending approval_request created
-- Join via email_drafts.approval_request_id (not approval_requests.email_draft_id)
SELECT COUNT(*) AS ar_after
FROM approval_requests ar
JOIN email_drafts ed ON ed.approval_request_id = ar.id
JOIN proposal_follow_up_commitments pfuc ON ed.subject_id = pfuc.id
JOIN proposal_events pe ON pfuc.proposal_event_id = pe.id
WHERE pe.lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND ar.request_type = 'proposal_follow_up_draft_review';
-- Must be ar_before + 1

-- F.8 New approval_request has correct fields and payload linkage
SELECT id, request_type, status, payload
FROM approval_requests
WHERE id = :new_approval_request_id;
-- request_type = 'proposal_follow_up_draft_review'
-- status = 'pending'
-- payload->>'draft_id' must equal new_draft_id (verify JSONB key per existing workflow pattern)
-- HARD STOP if status != 'pending'
-- Note: approval_requests.email_draft_id does not exist — do not query it

-- F.9 New IDs are different from old IDs
-- new_proposal_event_id    != b39fefe3-0639-494e-b84e-9093564a17ec
-- new_commitment_id        != 827e62ca-41c0-43da-9f02-6100a8eb52ce
-- new_draft_id             != 97e59aa8-5906-44f0-ad6a-bb3f23517500
-- new_approval_request_id  != 1afaff3b-665c-47ec-84fa-d9395520d88e

-- F.10 Old objects unchanged
SELECT id, commitment_status FROM proposal_follow_up_commitments
WHERE id = '827e62ca-41c0-43da-9f02-6100a8eb52ce';
-- commitment_status must still be 'open' (unchanged)

SELECT id, status FROM email_drafts
WHERE id = '97e59aa8-5906-44f0-ad6a-bb3f23517500';
-- status must still be 'approved' (unchanged)

SELECT id, status FROM approval_requests
WHERE id = '1afaff3b-665c-47ec-84fa-d9395520d88e';
-- status must still be 'approved' (unchanged)

-- F.11 Send counts unchanged
SELECT COUNT(*) FROM email_sends;
-- Must equal email_sends_before

SELECT COUNT(*) FROM campaign_email_sends;
-- Must equal campaign_email_sends_before

-- F.12 Gates still false (lowercase keys)
SELECT key, value FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled');
-- Both must still be false
```

---

## G. Risk Controls — Hard Stops

Any of the following conditions must trigger an immediate HARD STOP and transaction ROLLBACK before proceeding:

| # | Condition | Action |
|---|-----------|--------|
| 1 | Production ref `kxrplupzbsmujjznzhpy` is linked or queried | HARD STOP |
| 2 | Staging ref `smbausuyetlgxflyhmfg` not confirmed | HARD STOP |
| 3 | Any FK column name is uncertain (schema ambiguity) | HARD STOP — inspect schema first |
| 4 | Lead d4e24f9f not found or contact email != mgervasio@321swipe.com | HARD STOP |
| 5 | Contact do_not_contact = true or status != active | HARD STOP |
| 6 | Open proposal count for lead != 0 before write | HARD STOP |
| 7 | Sender noreply@321swipe.com missing, inactive, or unverified | HARD STOP |
| 8 | Either gate (`email_sending_enabled` or `campaign_sending_enabled`) is true before write | HARD STOP |
| 9 | Any send count changes after write | HARD STOP — investigate immediately |
| 10 | More than one row created for any object type | HARD STOP — rollback |
| 11 | Old objects modified or reused | HARD STOP |
| 12 | New draft status != pending_approval | HARD STOP |
| 13 | New approval_request status != pending | HARD STOP |
| 14 | New draft sent_at IS NOT NULL | HARD STOP |
| 15 | Any send occurs | HARD STOP |
| 16 | Any RETURNING ID is null after transaction | HARD STOP — rollback |
| 17 | Slice 5 is attempted | HARD STOP |
| 18 | `approval_requests.email_draft_id` is referenced in any proposed execution SQL | HARD STOP — column does not exist; re-inspect schema |
| 19 | Concrete INSERT or UPDATE SQL is attempted before schema inspection is complete | HARD STOP — inspect migrations and repos first |
| 20 | Required NOT NULL columns cannot be fully identified for any inserted table | HARD STOP — do not attempt insert |
| 21 | `tenant_id` or `workspace_id` cannot be confirmed for all records to be inserted | HARD STOP |
| 22 | `approval_request.payload` structure and `draft_id` key name cannot be confirmed from existing workflow | HARD STOP |
| 23 | `email_drafts.approval_request_id` back-link column cannot be confirmed in current schema | HARD STOP |
| 24 | `proposal_follow_up_commitments.draft_id` column existence or update path cannot be confirmed | HARD STOP |
| 25 | Repository insert patterns conflict with proposed SQL shape | HARD STOP — use repository patterns, not manual SQL |

---

## H. Future Verification Path After Object Creation

After this test object is created and reviewed by Codex:

1. **Claude runs SELECT-only pre-approval verification** — confirms new draft is `pending_approval`, new approval_request is `pending`, no send has occurred, gates still false.
2. **Operator approves the new approval_request** through normal staging workspace UI (not via raw DB write, not via CLI).
3. **Claude runs SELECT-only post-approval verification** — confirms new draft transitioned from `pending_approval` → `approved`.
4. **PASS only if:**
   - Draft status changed via normal app flow (not raw DB)
   - No `raw_db_sync` or equivalent bypass flag
   - No send occurred (sent_at remains null, send counts unchanged)
   - Gates remained false throughout
5. **Slice 5 remains BLOCKED** until retry verification passes and Codex reviews the full evidence set.

---

## I. Evidence Template for Future Execution Report

```
Phase 3V Slice 4M — Narrow Staging Test Object Creation Execution Evidence
===========================================================================

staging ref:                      smbausuyetlgxflyhmfg
production excluded:              YES — kxrplupzbsmujjznzhpy not linked
relink authorization:             [N/A or note if applicable]
sender (noreply@321swipe.com):    [active/default/verified — confirmed]

gates before:
  email_sending_enabled:          false
  campaign_sending_enabled:       false

email_sends before:               [count]
campaign_email_sends before:      [count]
open proposal count before:       0

--- BEFORE COUNTS ---
proposal_events (lead):           [pe_before]
commitments (lead):               [pfuc_before]
future_follow_up drafts (lead):   [draft_before]
AR proposal_follow_up (lead):     [ar_before]

--- NEW OBJECT IDs ---
new proposal_event_id:            [uuid]
new commitment_id:                [uuid]
new draft_id:                     [uuid]
new approval_request_id:          [uuid]

--- OLD IDs EXCLUDED (not reused) ---
old proposal_event:               b39fefe3-0639-494e-b84e-9093564a17ec
old commitment:                   827e62ca-41c0-43da-9f02-6100a8eb52ce
old draft:                        97e59aa8-5906-44f0-ad6a-bb3f23517500
old approval_request:             1afaff3b-665c-47ec-84fa-d9395520d88e

--- AFTER COUNTS ---
proposal_events (lead):           [pe_after = pe_before + 1]
commitments (lead):               [pfuc_after = pfuc_before + 1]
future_follow_up drafts (lead):   [draft_after = draft_before + 1]
AR proposal_follow_up (lead):     [ar_after = ar_before + 1]

new draft status:                 pending_approval
new approval_request status:      pending
new draft sent_at:                null
new draft approval_request_id:    [must equal new_approval_request_id]
new approval_request payload:     [draft_id key confirmed per workflow pattern]
new commitment draft_id:          [must equal new_draft_id]

gates after:
  email_sending_enabled:          false
  campaign_sending_enabled:       false

email_sends after:                [must equal before]
campaign_email_sends after:       [must equal before]

no send:                          CONFIRMED
no approval performed:            CONFIRMED
no Slice 5:                       CONFIRMED
```

---

## J. Final Decision

**PLAN ONLY.**

- No write executed.
- No approval performed.
- No send.
- No gates changed.
- No schema changes.
- No migrations.
- No code changes.
- No environment variable changes.
- No system_controls changes.
- No tag created.
- Nothing pushed beyond the prior doc commit.
- **Slice 5 remains BLOCKED.**

This plan requires Codex review before any write is authorized.
