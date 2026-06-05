# Phase 3V Slice 4M — Narrow Staging Unblock Write Plan

**Status:** Planning only — no write executed; Slice 5 BLOCKED
**Created:** 2026-06-05
**Predecessor:** Phase 3V Slice 4M — [Execution Report (BLOCKED)](phase-3v-slice-4m-staging-approval-sync-execution-report.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at plan time:** `c07e4db23626d62fc59ab1256e0f72037882eb83`

> **⚠️ This document plans a single narrow staging DB write only. The write has NOT been executed. No sends occurred. No code changed. Slice 5 remains BLOCKED.**

---

## A. Purpose

Slice 4M execution was BLOCKED because the existing Slice 4J `proposal_event` remains in `proposal_status='sent'` (open), which prevents creating a new proposal capture for the same test lead via the `idx_proposal_events_one_open_per_lead` constraint.

The operator's UI dismissal in the Proposal Inbox affected only `proposal_captures.match_status` (set to `'dismissed'`) and did **not** change `proposal_events.proposal_status`. This is the confirmed root cause of the blocker.

This plan describes a single narrow staging-only `UPDATE` to close the Slice 4J proposal event (set `proposal_status='accepted'`) so that a new proposal capture can be created for the test lead in a subsequent Slice 4M retry, enabling the controlled approval-sync verification.

This plan does **not** execute the write.

---

## B. Current Blocker Evidence

| Item | State |
|------|-------|
| `proposal_event` (`b39fefe3-...`) | `proposal_status='sent'` — open ✗ |
| `proposal_captures` (`179e8bd3-...`) | `match_status='dismissed'` — operator dismissed in UI |
| Existing draft (`97e59aa8-...`) | `status='approved'` — already approved, cannot be reused |
| Existing approval (`1afaff3b-...`) | `status='approved'` — already decided |
| `pending_approval` draft exists | No — none |
| `pending` approval request exists | No — none |
| One-open-proposal constraint | **Active** — `proposal_event` is still open (`'sent'`) |
| UI dismissal effect on `proposal_events` | None — dismissal only changed `proposal_captures`, not `proposal_events` |
| Operator reports no visible create-proposal path from lead page | Consistent with constraint blocking new proposal creation |

---

## C. Write Boundary

| Constraint | Requirement |
|------------|-------------|
| Environment | **Staging only** (`smbausuyetlgxflyhmfg`) |
| Production | **Excluded** — hard stop if linked |
| Rows affected | **Exactly one** `proposal_events` row |
| Tables touched | `proposal_events` only |
| Schema changes | None |
| Migrations | None |
| `system_controls` | Not touched |
| Draft status | Not changed |
| Approval request status | Not changed |
| Commitment status | Not changed |
| `email_sends` | Not touched |
| Sends | None |
| Code changes | None |
| Slice 5 | Not authorized |

---

## D. Pre-Write SELECT-Only Verification

The following checks must all pass before the write is executed. All are SELECT-only.

```sql
-- 1. Confirm staging ref (must = smbausuyetlgxflyhmfg, hard stop if production)
-- (verify via: cat supabase/.temp/project-ref)

-- 2. Confirm target proposal_event exists with correct identity
SELECT
  id::text,
  lead_id::text,
  proposal_status,
  proposal_reference,
  proposal_sent_at,
  tenant_id::text,
  updated_at
FROM proposal_events
WHERE id = 'b39fefe3-0639-494e-b84e-9093564a17ec'
  AND tenant_id = '10000000-0000-0000-0000-000000000001'
  AND lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND proposal_reference = '[TEST ONLY]'
  AND proposal_status = 'sent'
  AND deleted_at IS NULL;
-- Expected: exactly 1 row; hard stop if 0 rows

-- 3. Confirm lead/contact
SELECT l.id::text, c.email, c.do_not_contact
FROM leads l
JOIN contacts c ON c.id = l.contact_id
WHERE l.id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND l.tenant_id = '10000000-0000-0000-0000-000000000001';
-- Expected: email = mgervasio@321swipe.com, do_not_contact = false

-- 4. Confirm no open proposal events would remain for this lead
SELECT COUNT(*)::text AS open_count
FROM proposal_events
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND proposal_status IN ('sent', 'viewed')
  AND deleted_at IS NULL;
-- Expected: 1 (only the target row); write will reduce this to 0

-- 5. Confirm email_sends baseline
SELECT COUNT(*)::text AS email_sends_count FROM email_sends;
-- Expected: 2 (unchanged)

SELECT COUNT(*)::text AS campaign_email_sends_count FROM campaign_email_sends;
-- Expected: 0

-- 6. Confirm send gates
SELECT key, value::text, is_enabled, tenant_id::text
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST, key ASC;
-- Expected: all false
```

**Hard stops from preflight:**
- Project ref ≠ `smbausuyetlgxflyhmfg`
- Target row missing (0 rows returned)
- `proposal_reference` ≠ `[TEST ONLY]`
- `proposal_status` ≠ `'sent'`
- `lead_id` ≠ `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1`
- Any send gate is `true`

---

## E. Proposed Single-Row Write

> **⚠️ DO NOT RUN IN THIS PLAN. For future execution only, after Codex PASS on this plan.**

```sql
-- Staging only (smbausuyetlgxflyhmfg) — production excluded
-- Updates exactly one row; RETURNING must return exactly 1 row or hard stop
UPDATE proposal_events
SET proposal_status = 'accepted',
    updated_at      = now()
WHERE id                 = 'b39fefe3-0639-494e-b84e-9093564a17ec'
  AND tenant_id          = '10000000-0000-0000-0000-000000000001'
  AND lead_id            = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND proposal_reference = '[TEST ONLY]'
  AND proposal_status    = 'sent'
RETURNING id::text, proposal_status, updated_at;
```

**Expected RETURNING result:** exactly one row with `proposal_status = 'accepted'`.
**Hard stop if:** RETURNING returns 0 rows or more than 1 row.

### Why `'accepted'`

The Slice 4J test proposal was intentionally completed as part of the Phase 3V controlled test sequence. Setting `proposal_status='accepted'` accurately reflects the intent (the test was accepted/used successfully) and satisfies the one-open-proposal constraint. `'expired'` is also acceptable but `'accepted'` is semantically cleaner for a deliberate test completion.

### What this does NOT touch

- `email_drafts` — not changed
- `approval_requests` — not changed
- `proposal_follow_up_commitments` — not changed (commitment remains open; that is handled separately in the retry flow)
- `email_sends` — not changed
- `system_controls` — not changed
- `contacts` / `leads` — not changed

---

## F. Post-Write SELECT-Only Verification

```sql
-- 1. Confirm target row changed
SELECT id::text, proposal_status, updated_at
FROM proposal_events
WHERE id = 'b39fefe3-0639-494e-b84e-9093564a17ec'
  AND tenant_id = '10000000-0000-0000-0000-000000000001';
-- Expected: proposal_status = 'accepted'

-- 2. Confirm no open proposals remain for this lead
SELECT COUNT(*)::text AS open_count
FROM proposal_events
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND proposal_status IN ('sent', 'viewed')
  AND deleted_at IS NULL;
-- Expected: 0 (constraint now clear)

-- 3. Confirm draft statuses unchanged
SELECT id::text, status FROM email_drafts
WHERE source_type = 'future_follow_up'
  AND tenant_id = '10000000-0000-0000-0000-000000000001';
-- Expected: 97e59aa8-... still 'approved' — unchanged

-- 4. Confirm approval_request statuses unchanged
SELECT id::text, status FROM approval_requests
WHERE request_type = 'proposal_follow_up_draft_review'
  AND tenant_id = '10000000-0000-0000-0000-000000000001';
-- Expected: 1afaff3b-... still 'approved' — unchanged

-- 5. Confirm commitment unchanged
SELECT id::text, commitment_status, draft_id::text
FROM proposal_follow_up_commitments
WHERE tenant_id = '10000000-0000-0000-0000-000000000001';
-- Expected: 827e62ca-... commitment_status='open', draft_id='97e59aa8-...'

-- 6. Send safety
SELECT COUNT(*)::text AS email_sends_count FROM email_sends;
SELECT COUNT(*)::text AS campaign_email_sends_count FROM campaign_email_sends;
-- Expected: 2 and 0 (unchanged)

SELECT key, value::text FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST;
-- Expected: all false
```

---

## G. Risk Controls

| Risk | Control |
|------|---------|
| Production linked | **Hard stop** — verify ref = `smbausuyetlgxflyhmfg` before any query |
| Target row missing | **Hard stop** — pre-write SELECT must return exactly 1 row |
| RETURNING row count ≠ 1 | **Hard stop** — write rolled back implicitly (single-statement) |
| Any send gate true | **Hard stop** |
| Send counts change | **Hard stop** |
| Draft/approval status changes | **Hard stop** |
| More than one row affected | Prevented by 5-column WHERE clause including `id`, `tenant_id`, `lead_id`, `proposal_reference`, and `proposal_status='sent'` guard |
| `supabase/.temp` changes | Revert immediately after execution — `git checkout -- supabase/.temp/` |
| Execution without Codex PASS | **Stop** — this plan must pass Codex review before write is authorized |

---

## H. Future Retry Path After Unblock

After the narrow write is executed and verified:

```
Post-unblock Slice 4M retry sequence:

1. SELECT-only confirm: proposal_event proposal_status = 'accepted' (constraint clear)
2. Via staging app as staging@verian.internal:
   createManualProposalCaptureAction({
     leadId: 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1',
     proposalSentAt: '<ISO timestamp>',
     proposalReference: '[TEST ONLY] Slice 4M retry',
     scheduleRuleKey: 'single_7'
   })
   → creates 1 new proposal_follow_up_commitment (new ID)

3. Via staging app as staging@verian.internal:
   generateFollowUpDraftAction({ commitmentId: '<new_commitment_id>' })
   → creates 1 email_draft with status='pending_approval'
   → creates 1 approval_request with status='pending'
   → recipient must be mgervasio@321swipe.com
   → subject must contain [TEST ONLY]

4. SELECT-only verify:
   - draft.status = 'pending_approval'
   - approval_request.status = 'pending'
   - request_type = 'proposal_follow_up_draft_review'

5. Approve via normal workspace approval path (approveRequestAction)
   — NOT token path, NOT raw DB

6. SELECT-only verify (KEY CHECK):
   - draft.status = 'approved' ← Slice 4L fix confirmed
   - draft.approved_at non-null
   - email_sends unchanged
   - no send occurred

7. Create Slice 4M retry execution report
8. Codex PASS required before any Slice 5 consideration
```

**Slice 5 remains BLOCKED** until the retry verification passes and Codex reviews it.

---

## I. Stop Conditions

| Condition | Action |
|-----------|--------|
| Production ref `kxrplupzbsmujjznzhpy` linked | **Hard stop** |
| Staging ref ≠ `smbausuyetlgxflyhmfg` | **Hard stop** |
| Target row not found (0 results from pre-write SELECT) | **Hard stop** |
| `proposal_reference` ≠ `'[TEST ONLY]'` | **Hard stop** |
| `proposal_status` ≠ `'sent'` at write time | **Hard stop** (row already closed; do not double-update) |
| More than 1 row would be affected | **Hard stop** |
| RETURNING returns ≠ 1 row | **Hard stop** |
| Any send gate is `true` | **Hard stop** |
| `email_sends` count changes post-write | **Hard stop** |
| Any draft/approval status changes post-write | **Hard stop** |
| Schema uncertainty about `proposal_events` columns | Stop — investigate |
| Any send triggered | **Hard stop** |
| Slice 5 send proposed | **Hard stop** |

---

## J. Final Decision

| Item | Result |
|------|--------|
| Plan only — no write executed | ✓ |
| No code changed | ✓ |
| No sends occurred | ✓ |
| No gates changed | ✓ |
| No production changes | ✓ |
| `EMAIL_SENDING_ENABLED` effective `false` | ✓ |
| `CAMPAIGN_SENDING_ENABLED` effective `false` | ✓ |
| **Slice 5** | **BLOCKED** — narrow write + Codex PASS + retry execution + Codex PASS + operator approval + send plan all still required |
