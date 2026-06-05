# Phase 3V Slice 4M — Narrow Staging Unblock Write Execution Report

**Status:** PASS — narrow staging unblock write executed and verified; Slice 5 BLOCKED
**Created:** 2026-06-05
**Predecessor:** Phase 3V Slice 4M — [Narrow Staging Unblock Write Plan](phase-3v-slice-4m-narrow-staging-unblock-write-plan.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at execution time:** `95fab4ead42fec7808decf08248cc894eb9d9e17`

> **⚠️ Slice 4M narrow unblock write executed and verified. One `proposal_events` row was updated. No sends occurred. No gates changed. The Slice 4J test proposal event is now `'accepted'`. The one-open-proposal constraint for lead `d4e24f9f-...` is cleared. Slice 5 remains BLOCKED.**

---

## A. Purpose

This execution closed the Slice 4J test `proposal_event` by setting `proposal_status='accepted'`, clearing the `idx_proposal_events_one_open_per_lead` constraint that was blocking a new proposal capture for lead `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1`. This enables a subsequent Slice 4M retry to create a new `pending_approval` follow-up draft and verify the Slice 4L approval sync fix through the normal workspace approval path.

---

## B. Execution Boundary

| Constraint | Status |
|------------|--------|
| Staging only (`smbausuyetlgxflyhmfg`) | ✓ |
| Production excluded (`kxrplupzbsmujjznzhpy`) | ✓ |
| Rows updated | Exactly **1** — `proposal_events.id = b39fefe3-0639-494e-b84e-9093564a17ec` |
| Tables touched | `proposal_events` only |
| Schema changes | None ✓ |
| Migrations | None ✓ |
| `system_controls` | Not touched ✓ |
| Draft status changed | No ✓ |
| Approval request status changed | No ✓ |
| Commitment status changed | No ✓ |
| `email_sends` | Not touched ✓ |
| Sends | None ✓ |
| Code changes | None ✓ |
| Slice 5 | Not authorized ✓ |

---

## C. Staging/Production/Ref Evidence

| Check | Result |
|-------|--------|
| `supabase/.temp/project-ref` at start | `kxrplupzbsmujjznzhpy` (production — stale) |
| Relink performed | Yes — authorized by this execution prompt: `npx supabase link --project-ref smbausuyetlgxflyhmfg` |
| `supabase/.temp/project-ref` after relink | `smbausuyetlgxflyhmfg` ✓ |
| All queries ran against | `smbausuyetlgxflyhmfg` (staging) ✓ |
| Production touched | No ✓ |
| `supabase/.temp` after execution | Reverted — `git checkout -- supabase/.temp/` ✓ |
| Working tree after cleanup | Clean ✓ |

---

## D. Pre-Write SELECT Evidence

### Query A — Target row

| Field | Value | Pass? |
|-------|-------|-------|
| `id` | `b39fefe3-0639-494e-b84e-9093564a17ec` | ✓ |
| `tenant_id` | `10000000-0000-0000-0000-000000000001` | ✓ |
| `lead_id` | `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` | ✓ |
| `proposal_status` | `sent` | ✓ |
| `proposal_reference` | `[TEST ONLY]` | ✓ |
| `deleted_at` | `null` | ✓ |
| Rows returned | 1 | ✓ |

### Query B — Lead/contact safety

| Field | Value | Pass? |
|-------|-------|-------|
| `email` | `mgervasio@321swipe.com` | ✓ |
| `do_not_contact` | `false` | ✓ |
| `status` | `active` | ✓ |

### Query C — Open proposal count before

| Metric | Value | Pass? |
|--------|-------|-------|
| `open_count_before` | **1** | ✓ |

### Query D — Draft/approval/commitment baseline

| Object | Field | Value | Pass? |
|--------|-------|-------|-------|
| Draft `97e59aa8-...` | `draft_status` | `approved` | ✓ |
| Draft `97e59aa8-...` | `sent_at` | `null` | ✓ |
| Approval `1afaff3b-...` | `approval_status` | `approved` | ✓ |
| Approval `1afaff3b-...` | `request_type` | `proposal_follow_up_draft_review` | ✓ |
| Commitment `827e62ca-...` | `commitment_status` | `open` | ✓ |
| Commitment `827e62ca-...` | `draft_id` | `97e59aa8-...` | ✓ |

### Query E — Send counts and gates baseline

| Metric | Value | Pass? |
|--------|-------|-------|
| `email_sends_before` | 2 | ✓ |
| `campaign_email_sends_before` | 0 | ✓ |
| `email_sending_enabled` (global) | `false` | ✓ |
| `email_sending_enabled` (tenant) | `false` | ✓ |
| `campaign_sending_enabled` (global) | `false` | ✓ |

---

## E. Write Executed

```sql
UPDATE proposal_events
SET proposal_status = 'accepted',
    updated_at      = now()
WHERE id                 = 'b39fefe3-0639-494e-b84e-9093564a17ec'
  AND tenant_id          = '10000000-0000-0000-0000-000000000001'
  AND lead_id            = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND proposal_reference = '[TEST ONLY]'
  AND proposal_status    = 'sent'
  AND deleted_at IS NULL
RETURNING id::text, proposal_status, updated_at;
```

**RETURNING result:**

| Field | Value |
|-------|-------|
| `id` | `b39fefe3-0639-494e-b84e-9093564a17ec` |
| `proposal_status` | `accepted` ✓ |
| `updated_at` | `2026-06-05 13:26:43.965203+00` |
| **RETURNING row count** | **1** ✓ |

---

## F. Post-Write Verification

### Query A — Target row changed

| Field | Value | Pass? |
|-------|-------|-------|
| `proposal_status` | **`accepted`** | ✓ |
| `proposal_reference` | `[TEST ONLY]` | ✓ |
| `deleted_at` | `null` | ✓ |

### Query B — Open proposal count after

| Metric | Value | Pass? |
|--------|-------|-------|
| `open_count_after` | **0** | ✓ (constraint cleared) |

### Query C — Draft/approval unchanged

| Object | Field | Before | After | Changed? |
|--------|-------|--------|-------|---------|
| Draft `97e59aa8-...` | `draft_status` | `approved` | `approved` | No ✓ |
| Draft `97e59aa8-...` | `sent_at` | `null` | `null` | No ✓ |
| Approval `1afaff3b-...` | `approval_status` | `approved` | `approved` | No ✓ |

### Query D — Commitment unchanged

| Object | Field | Before | After | Changed? |
|--------|-------|--------|-------|---------|
| Commitment `827e62ca-...` | `commitment_status` | `open` | `open` | No ✓ |
| Commitment `827e62ca-...` | `draft_id` | `97e59aa8-...` | `97e59aa8-...` | No ✓ |

### Query E — Send safety unchanged

| Metric | Before | After | Changed? |
|--------|--------|-------|---------|
| `email_sends` | 2 | 2 | No ✓ |
| `campaign_email_sends` | 0 | 0 | No ✓ |
| `email_sending_enabled` (global) | `false` | `false` | No ✓ |
| `email_sending_enabled` (tenant) | `false` | `false` | No ✓ |
| `campaign_sending_enabled` (global) | `false` | `false` | No ✓ |

---

## G. Intentional Staging-Only Exception

This direct DB `UPDATE` to `proposal_events.proposal_status` bypasses the normal application service behavior (`createManualProposalCapture` and related proposal lifecycle services). In the application, `proposal_status` transitions are typically driven by service-layer actions that may also close linked commitments or trigger audit events.

**Why this is acceptable here:**
1. This is staging only — no production impact.
2. The target proposal event was created via raw DB in Slice 4J for testing purposes only.
3. The commitment (`827e62ca-...`) intentionally remains `open` because the Slice 4M retry will use a NEW commitment linked to a NEW proposal event; the old commitment being open does not interfere with the retry.
4. The old commitment's existing approved draft does not block the new test flow.

This exception is recorded explicitly as required by the Codex PASS WITH NOTES on the unblock write plan.

---

## H. Send/Gate Safety Evidence

| Check | Result |
|-------|--------|
| No send occurred | ✓ |
| `email_sends` unchanged | ✓ — 2 before and after |
| `campaign_email_sends` unchanged | ✓ — 0 before and after |
| `EMAIL_SENDING_ENABLED` | `false` global + tenant ✓ |
| `CAMPAIGN_SENDING_ENABLED` | `false` global ✓ |
| No send button clicked | ✓ |
| `sendFollowUpDraftAction` not called | ✓ |
| `approveRequestAction` not called | ✓ |
| `approveAndSendAction` not called | ✓ |

---

## I. Supabase Temp Cleanup Evidence

| Step | Result |
|------|--------|
| `supabase/.temp/project-ref` at start | `kxrplupzbsmujjznzhpy` (production) |
| Relink to staging | `npx supabase link --project-ref smbausuyetlgxflyhmfg` ✓ |
| `supabase/.temp/project-ref` during execution | `smbausuyetlgxflyhmfg` |
| Cleanup command | `git checkout -- supabase/.temp/` |
| `git status --short` after cleanup | Clean (empty) ✓ |
| `supabase/.temp` files in final working tree | None modified ✓ |

---

## J. Stop Conditions Reviewed

| Condition | Triggered? |
|-----------|------------|
| Production ref linked during queries | No — relinked to staging ✓ |
| Target row missing (Query A) | No — 1 row returned ✓ |
| `proposal_reference` ≠ `[TEST ONLY]` | No ✓ |
| `proposal_status` ≠ `sent` at write time | No ✓ |
| RETURNING row count ≠ 1 | No — returned 1 ✓ |
| Any send gate true | No ✓ |
| `email_sends` count changed | No ✓ |
| `campaign_email_sends` changed | No ✓ |
| Draft/approval status changed | No ✓ |
| `open_count_after` ≠ 0 | No — 0 ✓ |
| Any send occurred | No ✓ |
| Slice 5 attempted | No ✓ |

---

## K. Final Verdict

**PASS — Narrow staging unblock write executed and verified.**

| Evidence | Result |
|----------|--------|
| Target `proposal_event` `proposal_status` | `sent` → **`accepted`** ✓ |
| RETURNING row count | 1 ✓ |
| `open_count_before` | 1 ✓ |
| `open_count_after` | **0** ✓ — constraint cleared |
| Draft/approval unchanged | ✓ |
| Commitment unchanged | ✓ |
| Send counts unchanged | ✓ |
| Gates unchanged | ✓ |
| No send | ✓ |
| `supabase/.temp` reverted | ✓ |

The one-open-proposal constraint for lead `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` is now cleared. A new proposal capture → commitment → `pending_approval` draft → approval can be created for this lead in a subsequent Slice 4M retry.

---

## L. Slice 5 Status

**Slice 5 remains BLOCKED.**

| Requirement | Status |
|-------------|--------|
| Slice 4L fix committed and pushed | ✓ Done |
| Codex PASS on Slice 4L | ✓ Done |
| Narrow unblock write executed and verified | ✓ **Done (this report)** |
| Slice 4M retry: new pending_approval draft created | ❌ Not done |
| Slice 4M retry: approved via normal workspace path | ❌ Not done |
| Codex PASS on Slice 4M retry execution report | ❌ Not done |
| Explicit operator approval of Slice 5 plan | ❌ Not done |
| Separate Slice 5 controlled send plan | ❌ Not written |
| Final preflight before send | ❌ Not run |
