# Phase 3V Slice 4M — Retry Execution Plan

**Status:** Planning only — retry NOT executed; Slice 5 BLOCKED
**Created:** 2026-06-05
**Predecessor:** Phase 3V Slice 4M — [Narrow Unblock Write Execution Report](phase-3v-slice-4m-narrow-staging-unblock-write-execution-report.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at plan time:** `0dda1c4d866832a671dbea4b75b25435c12cb798`

> **⚠️ This document plans the Slice 4M retry execution only. No retry has been executed. No app actions were taken. No DB writes occurred. No sends occurred. Slice 5 remains BLOCKED.**

---

## A. Purpose

The prior Slice 4M staging approval sync verification was BLOCKED because the Slice 4J test `proposal_event` remained in `'sent'` status, preventing new proposal capture creation for the test lead.

The narrow unblock write (`0dda1c4`) set `proposal_events.proposal_status='accepted'` for the Slice 4J event (`b39fefe3-...`), clearing the `idx_proposal_events_one_open_per_lead` constraint. The `open_count_after = 0` for lead `d4e24f9f-...` was verified.

This retry plan defines the precise execution sequence to:
1. Create exactly one new controlled test object (new commitment + new `pending_approval` draft + new `pending` approval request)
2. Approve it through the normal workspace `approveRequestAction` path
3. Verify the draft transitions from `pending_approval` → `approved` **without any raw DB status sync and without any send**

This is the end-to-end staging verification of the Slice 4L approval sync fix.

This plan does **not** execute the retry.

---

## B. Current Confirmed State

| Item | Value |
|------|-------|
| origin/master | `0dda1c4d866832a671dbea4b75b25435c12cb798` ✓ |
| Staging Supabase ref | `smbausuyetlgxflyhmfg` |
| Production Supabase ref | `kxrplupzbsmujjznzhpy` — excluded |
| Slice 4J proposal event (`b39fefe3-...`) | `proposal_status='accepted'` ✓ — constraint cleared |
| `open_count_after` for test lead | **0** ✓ |
| Old commitment (`827e62ca-...`) | `status='open'` — must NOT be reused |
| Old draft (`97e59aa8-...`) | `status='approved'` — must NOT be reused |
| Old approval_request (`1afaff3b-...`) | `status='approved'` — must NOT be reused |
| `email_sends` | 2 |
| `campaign_email_sends` | 0 |
| `EMAIL_SENDING_ENABLED` | `false` global + tenant |
| `CAMPAIGN_SENDING_ENABLED` | `false` global |
| No sends occurred | ✓ |
| **Slice 5** | **BLOCKED** |

---

## C. Retry Boundary

| Constraint | Requirement |
|------------|-------------|
| Environment | Staging only (`smbausuyetlgxflyhmfg`) |
| Production | Excluded — hard stop if linked |
| Sends | None — `EMAIL_SENDING_ENABLED` must remain `false` |
| Gate enablement | None — no `system_controls` writes |
| Token approve-and-send | **Hard stop** — excluded |
| `sendFollowUpDraftAction` | **Hard stop** — excluded |
| Raw DB draft status sync | **Hard stop** — excluded |
| Raw DB approval status sync | **Hard stop** — excluded |
| Raw DB object creation for draft/approval | **Hard stop** — must use app/action path only |
| Slice 5 | **Hard stop** — not authorized |

---

## D. Deployment/Ref Verification

### Staging deployment confirmation

Before any app actions, confirm the staging Vercel deployment includes the Slice 4L fix commit `0b8f4bc` or later.

**Preferred evidence:** Vercel deployment metadata shows commit `0dda1c4` or later (current origin/master) with status **Ready** at `https://verian-bios-staging.vercel.app`.

**Acceptable evidence:** Vercel staging deployment shows any commit at or after `0b8f4bc`, since `0b8f4bc` contains the Slice 4L code fix.

**Hard stop:** If staging deployment cannot be confirmed to include `0b8f4bc` or later, stop before any app actions.

### Supabase ref verification

```
cat supabase/.temp/project-ref
```

Expected: `smbausuyetlgxflyhmfg`

If current CLI ref is `kxrplupzbsmujjznzhpy` (production): **do not relink automatically**. Stop and obtain explicit operator authorization in the retry execution prompt before relinking. If relink is authorized, record the authorization in the execution report and revert `supabase/.temp` after execution.

---

## E. Pre-Retry SELECT-Only Safety Checks

All SELECT-only. No writes.

```sql
-- 1. Staging ref check (verify via cat supabase/.temp/project-ref before queries)

-- 2. Sender identity
SELECT id::text, email, is_default, is_verified, status
FROM sender_identities
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
ORDER BY is_default DESC;
-- Expected: noreply@321swipe.com is_default=true, is_verified=true, status=active

-- 3. Send gates
SELECT key, value::text, is_enabled, tenant_id::text
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST, key ASC;
-- Expected: all false

-- 4. Send baselines
SELECT COUNT(*)::text AS email_sends_baseline FROM email_sends;
SELECT COUNT(*)::text AS campaign_email_sends_baseline FROM campaign_email_sends;
-- Expected: 2 and 0

-- 5. Target lead/contact
SELECT l.id::text AS lead_id, c.email, c.do_not_contact, c.status
FROM leads l JOIN contacts c ON c.id = l.contact_id
WHERE l.id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND l.tenant_id = '10000000-0000-0000-0000-000000000001';
-- Expected: email=mgervasio@321swipe.com, do_not_contact=false, status=active

-- 6. Open proposal count for test lead (must be 0 before new capture)
SELECT COUNT(*)::text AS open_count_before
FROM proposal_events
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND lead_id = 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1'
  AND proposal_status IN ('sent', 'viewed')
  AND deleted_at IS NULL;
-- Expected: 0 (confirmed by narrow unblock write)

-- 7. Confirm old objects exist but are not new
SELECT id::text, status, source_type
FROM email_drafts
WHERE source_type = 'future_follow_up'
  AND tenant_id = '10000000-0000-0000-0000-000000000001'
  AND deleted_at IS NULL;
-- Expected: only 97e59aa8-... with status=approved — old draft exists, not reused
```

**Hard stops from preflight:**
- Any send gate is `true`
- Recipient email ≠ `mgervasio@321swipe.com`
- `do_not_contact = true`
- Sender not verified/active
- `open_count_before` ≠ `0`

---

## F. New Object Creation Strategy

Create exactly one new controlled staging test object through the approved staging app/action flow.

### Required inputs

| Input | Value |
|-------|-------|
| `leadId` | `d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1` |
| `proposalSentAt` | ISO timestamp within test window (before current time) |
| `proposalReference` | `'[TEST ONLY] Slice 4M retry'` |
| `scheduleRuleKey` | `'single_7'` |

### Step 1 — Create proposal capture + commitment

Via staging app as `staging@verian.internal`:
```
createManualProposalCaptureAction({
  leadId: 'd4e24f9f-0a8e-4772-8ab7-6e49eea7edd1',
  proposalSentAt: '<ISO timestamp>',
  proposalReference: '[TEST ONLY] Slice 4M retry',
  scheduleRuleKey: 'single_7'
})
```
→ Creates exactly 1 new `proposal_follow_up_commitment`

### Step 2 — Generate pending_approval draft

Via staging app as `staging@verian.internal`:
```
generateFollowUpDraftAction({ commitmentId: '<new_commitment_id>' })
```
→ Creates exactly 1 new `email_draft` with `status='pending_approval'`
→ Creates exactly 1 new `approval_request` with `status='pending'` and `request_type='proposal_follow_up_draft_review'`

### If app UI cannot create the new object

If the staging app UI cannot create the new proposal capture or generate the draft (e.g., UI still blocked, action unavailable, session error), execution must **STOP and report BLOCKED** rather than using raw DB writes for draft/approval creation. A separate plan would be required.

---

## G. Pre-Approval Verification

SELECT-only checks before approving. Verify new objects are distinct from old objects.

```sql
-- New commitment
SELECT pfc.id::text AS new_commitment_id,
       pfc.commitment_status,
       pfc.draft_id::text,
       pe.proposal_reference
FROM proposal_follow_up_commitments pfc
JOIN proposal_events pe ON pe.id = pfc.proposal_event_id
WHERE pfc.tenant_id = '10000000-0000-0000-0000-000000000001'
  AND pfc.id != '827e62ca-41c0-43da-9f02-6100a8eb52ce'
ORDER BY pfc.created_at DESC;
-- Expected: exactly 1 new row, commitment_status='open'

-- New draft
SELECT d.id::text AS new_draft_id,
       d.status,
       d.source_type,
       d.subject_type,
       d.to_email,
       d.subject,
       d.sent_at,
       d.approval_request_id::text,
       ar.status AS approval_status,
       ar.request_type
FROM email_drafts d
LEFT JOIN approval_requests ar ON ar.id = d.approval_request_id
WHERE d.source_type = 'future_follow_up'
  AND d.tenant_id = '10000000-0000-0000-0000-000000000001'
  AND d.id != '97e59aa8-5906-44f0-ad6a-bb3f23517500'
  AND d.deleted_at IS NULL
ORDER BY d.created_at DESC;
```

**Required before approval:**

| Check | Required value |
|-------|---------------|
| New commitment ID | ≠ `827e62ca-...` ✓ |
| New draft ID | ≠ `97e59aa8-...` ✓ |
| New approval request ID | ≠ `1afaff3b-...` ✓ |
| `draft.status` | `'pending_approval'` ← hard stop if not |
| `draft.source_type` | `'future_follow_up'` ← hard stop if not |
| `draft.subject_type` | `'proposal_follow_up_commitment'` ← hard stop if not |
| `draft.to_email` | `mgervasio@321swipe.com` ← hard stop if not |
| `draft.subject` | Contains `[TEST ONLY]` ← stop if not |
| `approval_request.status` | `'pending'` ← hard stop if not |
| `approval_request.request_type` | `'proposal_follow_up_draft_review'` ← hard stop if not |
| `draft.sent_at` | `null` ← hard stop if not |
| `email_sends` | Unchanged from baseline ✓ |

---

## H. Approval Action

### Perform via normal workspace approval path only

Via staging app inbox / proposal-follow-ups queue as `staging@verian.internal`, use the workspace approval UI button that calls `approveRequestAction(approvalId)`.

**Excluded paths:**
- `approveAndSendAction` — **hard stop**
- Token approve-and-send (`/approve/[token]`) — **hard stop**
- `sendFollowUpDraftAction` — **hard stop**
- Send button — **hard stop**
- Raw DB `UPDATE approval_requests SET status='approved'` — **hard stop**
- Raw DB `UPDATE email_drafts SET status='approved'` — **hard stop**

**Hard stop:** If the approval UI/action attempts to send, requires enabling sending, or requires the token path, stop immediately.

---

## I. Post-Approval Verification

SELECT-only checks after approval. The key check is `draft.status='approved'` without any raw DB sync.

```sql
SELECT d.id::text AS new_draft_id,
       d.status AS draft_status,
       d.approved_at,
       d.sent_at,
       ar.id::text AS approval_request_id,
       ar.status AS approval_status,
       ar.decided_at
FROM email_drafts d
LEFT JOIN approval_requests ar ON ar.id = d.approval_request_id
WHERE d.id = '<new_draft_id>'
  AND d.tenant_id = '10000000-0000-0000-0000-000000000001';

SELECT COUNT(*)::text AS email_sends_after FROM email_sends;
SELECT COUNT(*)::text AS campaign_email_sends_after FROM campaign_email_sends;

SELECT key, value::text FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST;
```

**Required POST-approval results:**

| Check | Required value | Notes |
|-------|---------------|-------|
| `draft.status` | **`'approved'`** ← **KEY — Slice 4L fix verification** | Hard stop / FAIL if `'pending_approval'` |
| `draft.approved_at` | Non-null | |
| `draft.sent_at` | `null` ← no send | Hard stop if non-null |
| `approval_request.status` | `'approved'` | |
| `approval_request.decided_at` | Non-null | |
| `email_sends` | = baseline (unchanged) | Hard stop if changed |
| `campaign_email_sends` | = 0 (unchanged) | |
| Gates | All `false` | Hard stop if changed |
| Old draft `97e59aa8-...` | `status='approved'` (unchanged) | Confirm not regressed |

---

## J. Evidence Template

The future retry execution report must fill in every field:

| Evidence field | Value (fill at execution) |
|----------------|--------------------------|
| Staging deployment commit/version | TBD |
| Staging ref | `smbausuyetlgxflyhmfg` |
| Production ref excluded | `kxrplupzbsmujjznzhpy` not linked ✓ |
| Relink authorization | TBD (document if relink occurred and confirm it was authorized) |
| Sender verification | `noreply@321swipe.com` — `is_default`, `is_verified`, `status` |
| Gate values before | All `false` |
| `email_sends` baseline | TBD |
| `campaign_email_sends` baseline | TBD (expected 0) |
| `open_count_before` (new capture) | 0 (confirmed cleared by unblock write) |
| New `proposal_event` ID | TBD |
| New `proposal_follow_up_commitment` ID | TBD (≠ `827e62ca-...`) |
| New `email_draft` ID | TBD (≠ `97e59aa8-...`) |
| New `approval_request` ID | TBD (≠ `1afaff3b-...`) |
| Old objects confirmed not reused | ✓ |
| `draft.status` **before** approval | `'pending_approval'` (required) |
| `approval_request.status` **before** | `'pending'` (required) |
| Approval action/path used | `approveRequestAction` via workspace UI (NOT token, NOT raw DB) |
| `draft.status` **after** approval | **`'approved'`** ← Slice 4L fix verification |
| `draft.approved_at` | TBD (non-null required) |
| `approval_request.status` **after** | `'approved'` (required) |
| `approval_request.decided_at` | TBD (non-null required) |
| `draft.sent_at` | `null` (no send) |
| `email_sends` after | TBD (must = baseline — unchanged) |
| `campaign_email_sends` after | 0 (unchanged) |
| Gate values after | All `false` ✓ |
| No manual DB sync used | ✓ |
| No token path used | ✓ |
| No raw DB draft/approval creation | ✓ |
| No send occurred | ✓ |
| **Slice 4L fix confirmed** | **PASS** if `draft.status='approved'` / **FAIL** if `'pending_approval'` |
| Slice 5 blocked | ✓ |

---

## K. Stop Conditions

| Condition | Action |
|-----------|--------|
| Production ref linked during queries | **Hard stop** |
| Staging deployment not confirmed to include `0b8f4bc` or later | **Hard stop** |
| Any send gate is `true` | **Hard stop** |
| `open_count_before` ≠ 0 before new capture | **Hard stop** |
| Recipient ≠ `mgervasio@321swipe.com` | **Hard stop** |
| Contact `do_not_contact = true` | **Hard stop** |
| Sender not verified/active | **Hard stop** |
| Draft subject lacks `[TEST ONLY]` | Stop before approval |
| App UI/action cannot create new proposal capture | **Stop — report BLOCKED** |
| Draft generation fails | Stop |
| More than 1 new commitment/draft/approval created | Stop — investigate |
| Old commitment/draft/approval would be reused | **Hard stop** |
| `draft.status` ≠ `'pending_approval'` before approval | **Hard stop** |
| `approval_request.status` ≠ `'pending'` before approval | **Hard stop** |
| Approval path requires token approve-and-send | **Hard stop** |
| Approval path requires enabling sending | **Hard stop** |
| Approval path requires raw DB status sync | **Hard stop** |
| Any send triggered | **Hard stop** |
| `email_sends` count changes | **Hard stop** |
| After approval: `draft.status` ≠ `'approved'` | **FAIL — Slice 4L fix did not deploy correctly** |
| Slice 5 send proposed | **Hard stop** |

---

## L. Final Decision

| Item | Result |
|------|--------|
| Retry execution plan only — not executed | ✓ |
| No app actions performed | ✓ |
| No DB writes | ✓ |
| No sends | ✓ |
| No gates changed | ✓ |
| No production changes | ✓ |
| `EMAIL_SENDING_ENABLED` effective `false` | ✓ |
| `CAMPAIGN_SENDING_ENABLED` effective `false` | ✓ |
| **Slice 5** | **BLOCKED** — retry execution + Codex PASS + operator approval + send plan required |
