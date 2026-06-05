# Phase 3V Slice 4J — Test Object Readiness Plan

**Status:** Planning only — no test objects created; Slice 5 BLOCKED
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4I-D — [Staging DB Write Execution Report](phase-3v-slice-4i-d-staging-db-write-execution-report.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at plan time:** `4a2cae605fabb29a30da9c8b497c5ffde4dd2bd6`

> **⚠️ Slice 4J plans creation of exactly one controlled internal test object in staging. It does NOT create or approve drafts, does NOT send email, does NOT enable EMAIL_SENDING_ENABLED, does NOT enable CAMPAIGN_SENDING_ENABLED, and does NOT authorize Slice 5.**

---

## A. Purpose

Slice 4J plans creation of exactly one controlled internal test object in staging. The planned test object consists of:

1. One `proposal_follow_up_commitment` (internal test, marked `[TEST ONLY]`)
2. One linked `email_draft` with `source_type = 'future_follow_up'`
3. One linked `approval_request` with `status = 'approved'`

**This slice does NOT:**
- Send email
- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Authorize Slice 5

**Slice 5 remains blocked** until Slice 4K evidence recollection, Codex PASS, and explicit operator approval.

---

## B. Current Ready State

| Item | Status |
|------|--------|
| Staging ref | `smbausuyetlgxflyhmfg` ✓ |
| Production ref | `kxrplupzbsmujjznzhpy` — excluded |
| Sender | `noreply@321swipe.com` — active, `is_default = true`, `is_verified = true` ✓ |
| Tenant-specific `email_sending_enabled = false` override | ✓ exists for `10000000-...-0001` |
| `campaign_sending_enabled` | `false` ✓ |
| `messaging.send_emails` for `staging@verian.internal` | ✓ confirmed (Platform Admin) |
| Internal recipient | `mgervasio@321swipe.com` — no external forwarding ✓ |
| Test window | **June 5, 2026, 12:00 AM–1:00 AM ET** |
| `proposal_follow_up_commitments` | 0 (no test object yet) |
| `future_follow_up` drafts | 0 |
| Slice 5 | **BLOCKED** |

---

## C. Planned Test Object Requirements

The test object must satisfy all of the following:

| Field | Required value |
|-------|---------------|
| Tenant | `10000000-0000-0000-0000-000000000001` |
| Workspace | `20000000-0000-0000-0000-000000000001` (slug: `main`) |
| Commitment count | Exactly 1 |
| Draft count | Exactly 1 |
| Approval count | Exactly 1 |
| `email_drafts.subject_type` | `'proposal_follow_up_commitment'` |
| `email_drafts.source_type` | `'future_follow_up'` |
| `email_drafts.status` | `'approved'` (after approval) |
| `email_drafts.to_email` | `mgervasio@321swipe.com` only |
| `email_drafts.subject` | Contains `[TEST ONLY]` |
| `email_drafts.sender` identity | `noreply@321swipe.com` (verified, active) |
| `email_drafts.campaign_assignment_id` | `NULL` |
| `email_drafts.superseded_at` | `NULL` |
| `email_drafts.deleted_at` | `NULL` |
| `approval_requests.status` | `'approved'` |
| `approval_requests.decided_at` | Non-null |
| Prior `email_sends` rows for draft | None — `getBlockingSendForDraft` returns null |
| `checkDraftSendReadiness` | Passes (no blocked reasons) |

---

## D. Preferred Creation Path

The preferred approach is to use the existing application/service/action path rather than raw DB inserts. This ensures table relationships, field validation, and audit events are handled correctly.

**Recommended sequence:**

1. Navigate to staging app as `staging@verian.internal`
2. Create a test `proposal_event` for a test lead in the staging tenant/workspace (if no suitable open proposal event exists)
3. Create a `proposal_follow_up_commitment` linked to that proposal event — using the existing Phase 3R/3S commitment creation path or via the staging app UI
4. Use `generateFollowUpDraftAction({ commitmentId })` (Phase 3S path) to generate the `future_follow_up` draft linked to the commitment
5. Verify the draft has `subject_type = 'proposal_follow_up_commitment'`, `source_type = 'future_follow_up'`, `to_email = mgervasio@321swipe.com`, subject contains `[TEST ONLY]`
6. Route through the existing HRB (Human Review Bridge) approval path in staging to approve the draft
7. Confirm `approval_requests.status = 'approved'` and `decided_at` is non-null
8. Do NOT call `sendFollowUpDraftAction` — the send step is Slice 5 only

**If the application path is unavailable or impractical** (e.g., staging app cannot create a proposal event easily), raw DB inserts may be required. In that case, a separate sub-plan with exact INSERT statements must be separately approved before execution. Do not improvise raw inserts without a plan.

**Do not bypass the approval path** (HRB or equivalent) without a separate plan explaining why direct DB approval is necessary.

---

## E. Preflight Evidence Required Before Future Slice 4J Execution

The following SELECT-only checks must pass before any test object creation:

```sql
-- 1. Staging project ref (must equal smbausuyetlgxflyhmfg)
cat supabase/.temp/project-ref

-- 2. Sender identity
SELECT email, is_default, is_verified, status
FROM sender_identities
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
ORDER BY is_default DESC;

-- 3. System controls
SELECT key, value::text, is_enabled, tenant_id::text
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST;

-- 4. Test object counts (must be 0)
SELECT
  (SELECT COUNT(*) FROM proposal_follow_up_commitments)::text AS pfc_count,
  (SELECT COUNT(*) FROM email_drafts WHERE source_type = 'future_follow_up')::text AS ff_drafts,
  (SELECT COUNT(*) FROM email_drafts WHERE subject_type = 'proposal_follow_up_commitment')::text AS pfc_drafts;

-- 5. Send counts (must be unchanged at 2)
SELECT COUNT(*)::text AS email_sends_count FROM email_sends;
SELECT COUNT(*)::text AS campaign_email_sends_count FROM campaign_email_sends;

-- 6. Permission check
SELECT p.slug FROM memberships m
JOIN roles r ON r.id = m.role_id
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
WHERE m.tenant_id = '10000000-0000-0000-0000-000000000001'
  AND p.slug = 'messaging.send_emails'
LIMIT 5;
```

**All must pass before proceeding.** Test window must be documented. No prior draft/commitment may exist for this test unless it is the exact intended test object from a prior verified run.

---

## F. Future Execution Order

**NOT to be run in Slice 4J planning. This sequence is for the future Slice 4J execution prompt.**

```
1.  Verify git state: git status --short (clean)
2.  Verify HEAD and origin/master are current
3.  Verify Supabase project ref = smbausuyetlgxflyhmfg
    → hard stop if kxrplupzbsmujjznzhpy
4.  Run SELECT-only preflight checks from Section E
    → hard stop if any check fails
5.  Identify suitable test lead/proposal context in staging
    — or create one if none exists through the application path
6.  Create exactly one proposal_follow_up_commitment
    — use existing app/action path; mark with [TEST ONLY] context
7.  Generate/attach exactly one future_follow_up email draft
    — use generateFollowUpDraftAction({ commitmentId })
    — verify subject includes [TEST ONLY]
    — verify to_email = mgervasio@321swipe.com only
    — verify source_type = 'future_follow_up'
    — verify subject_type = 'proposal_follow_up_commitment'
    — verify campaign_assignment_id IS NULL
8.  Route through existing approval path (HRB) in staging
9.  Approve exactly one linked approval_request
    — verify approval_requests.status = 'approved'
    — verify decided_at is non-null
10. Do NOT call sendFollowUpDraftAction — stop after approval
11. Run SELECT-only post-creation verification:
    — pfc_count = 1
    — future_follow_up draft count = 1
    — draft status = 'approved'
    — email_sends count unchanged
    — campaign_email_sends = 0
    — EMAIL_SENDING_ENABLED effective false
12. Create Slice 4J execution report
13. Submit execution report to Codex
14. Only after Codex PASS may Slice 4K evidence recollection be planned
```

---

## G. Stop Conditions

**Any of the following must immediately halt Slice 4J execution:**

| Condition | Action |
|-----------|--------|
| Production ref `kxrplupzbsmujjznzhpy` linked | **Hard stop** |
| Staging ref ≠ `smbausuyetlgxflyhmfg` | **Hard stop** |
| Dirty git tree | Stop |
| `noreply@321swipe.com` missing, inactive, not default, or not verified | **Hard stop** |
| Tenant-specific `email_sending_enabled = false` override missing | **Hard stop** |
| `EMAIL_SENDING_ENABLED` is `true` | **Hard stop** |
| `CAMPAIGN_SENDING_ENABLED` is `true` | **Hard stop** |
| Recipient ≠ `mgervasio@321swipe.com` | **Hard stop** |
| Recipient forwards externally | **Hard stop** |
| More than one recipient proposed | Stop |
| Subject lacks `[TEST ONLY]` | Stop |
| More than one commitment/draft/approval proposed | Stop |
| `draft.source_type ≠ 'future_follow_up'` | Stop |
| `draft.subject_type ≠ 'proposal_follow_up_commitment'` | Stop |
| Approval path is unclear | Stop — investigate before proceeding |
| Any send proposed | **Hard stop** |
| Any send button clicked | **Hard stop** |
| Campaign sending proposed | **Hard stop** |
| External/customer/prospect/vendor recipient | **Hard stop** |
| Provider config or env var changes proposed | Stop |
| Migrations proposed | Stop |
| Unplanned DB writes proposed | Stop |
| Slice 5 proposed | **Hard stop** |

---

## H. Evidence Required After Future Slice 4J Execution

| Evidence | Required |
|----------|---------|
| Exactly 1 `proposal_follow_up_commitment` exists | ✓ |
| Exactly 1 `future_follow_up` email draft exists | ✓ |
| `email_drafts.subject_type = 'proposal_follow_up_commitment'` | ✓ |
| `email_drafts.source_type = 'future_follow_up'` | ✓ |
| `email_drafts.status = 'approved'` | ✓ |
| Linked `approval_request` exists with `status = 'approved'` | ✓ |
| `email_drafts.to_email = 'mgervasio@321swipe.com'` | ✓ |
| Draft sender is `noreply@321swipe.com` | ✓ |
| Draft subject includes `[TEST ONLY]` | ✓ |
| `email_sends` count unchanged (was 2) | ✓ |
| `campaign_email_sends` count unchanged (was 0) | ✓ |
| `EMAIL_SENDING_ENABLED` effective value `false` | ✓ |
| `CAMPAIGN_SENDING_ENABLED` effective value `false` | ✓ |
| No send occurred | ✓ |
| Slice 5 remains blocked | ✓ |

---

## I. Relationship to Slice 4K and Slice 5

```
Slice 4J (this plan + execution)
  → Creates test commitment/draft/approval in staging
  → Must NOT send
  → Must complete before Slice 4K

Slice 4K
  → Recollects all 28 evidence fields from staging after test object exists
  → Updates evidence document
  → Submits to Codex for PASS

Slice 5
  → One internal controlled send to mgervasio@321swipe.com
  → Only after Slice 4K Codex PASS AND explicit operator approval
  → Separate execution prompt required
  → EMAIL_SENDING_ENABLED tenant-specific enable → send → immediate re-disable
```

---

## J. Codex Review Requirement

1. **Codex must review this Slice 4J readiness plan** before the execution prompt is written
2. **Codex PASS on this plan does NOT authorize sending**
3. **Codex PASS on this plan does NOT authorize Slice 5**
4. A separate **Slice 4J execution prompt** is required after Codex PASS
5. **Codex must review the Slice 4J execution report** before Slice 4K evidence recollection begins

---

## K. Final Decision

- Slice 4J is **planning only** ✓
- No test object was created ✓
- No draft was created or approved ✓
- No flags were enabled ✓
- No emails were sent ✓
- **Slice 5 remains BLOCKED**
