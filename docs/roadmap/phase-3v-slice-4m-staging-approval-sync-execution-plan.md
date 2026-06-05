# Phase 3V Slice 4M — Staging Approval Sync Execution Plan

**Status:** Execution plan only — verification NOT executed; Slice 5 BLOCKED
**Created:** 2026-06-05
**Predecessor:** Phase 3V Slice 4M — [Staging Verification Plan](phase-3v-slice-4m-staging-approval-sync-verification-plan.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at plan time:** `96e42c6347cd03fcc6fbcc42fd9767b13586d397`

> **⚠️ This document plans the future Slice 4M execution. No verification has been executed. No app actions were taken. No DB writes occurred. No sends occurred. Slice 5 remains BLOCKED.**

---

## A. Purpose

This document plans the future execution of Phase 3V Slice 4M staging verification. It does not execute the verification.

**Verification objective:** Prove that after the Slice 4L code fix (`0b8f4bc`), the normal workspace `approveRequestAction` path correctly transitions `email_draft.status` from `'pending_approval'` to `'approved'` for a `proposal_follow_up_draft_review` approval request — **without** any raw DB fallback and **without** any send.

This is the final code verification prerequisite before Slice 5 may be considered.

---

## B. Current Confirmed State

| Item | Value |
|------|-------|
| Slice 4L implementation | `0b8f4bc` Phase 3V Slice 4L: fix proposal follow-up approval sync ✓ |
| Slice 4M verification plan | `96e42c6` Docs: add Phase 3V Slice 4M staging verification plan ✓ |
| origin/master | `96e42c6347cd03fcc6fbcc42fd9767b13586d397` ✓ |
| Staging Supabase ref | `smbausuyetlgxflyhmfg` |
| Production Supabase ref | `kxrplupzbsmujjznzhpy` — excluded |
| `EMAIL_SENDING_ENABLED` | `false` globally + tenant-scoped ✓ |
| `CAMPAIGN_SENDING_ENABLED` | `false` globally ✓ |
| No sends | ✓ |
| Slice 5 | **BLOCKED** |

---

## C. Execution Boundary

| Constraint | Requirement |
|------------|-------------|
| Environment | Staging only (`smbausuyetlgxflyhmfg`) |
| Production | Excluded — hard stop if linked |
| Sends | None — `EMAIL_SENDING_ENABLED` must remain `false` |
| Gate enablement | None — no `system_controls` writes |
| Environment/provider/schema changes | None |
| Migration commands | None |
| Raw DB draft status sync | **Hard stop** — must use app approval path only |
| Token approve-and-send path | **Hard stop** — `approveAndSendAction` excluded |
| `sendFollowUpDraftAction` | **Hard stop** |
| Slice 5 | **Hard stop** |

---

## D. Deployment Verification Step

**The first action in the execution must be confirming the staging deployment includes Slice 4L.**

### Preferred evidence

Navigate to the Vercel dashboard for the staging project and find the deployment for commit `0b8f4bc` (or later, since `96e42c6` follows it). Confirm status is **Ready** and is the active deployment at `https://verian-bios-staging.vercel.app`.

### Acceptable evidence

The staging app responds at `https://verian-bios-staging.vercel.app`, and the Vercel deployment metadata shows the git SHA is `96e42c6` or later. Since `96e42c6` was pushed after `0b8f4bc` and contains only documentation, any deployment at or after `96e42c6` includes the Slice 4L fix.

### Hard stop conditions

- Staging deployment does not include `0b8f4bc` or any later commit — **hard stop**
- Build failed or deployment is in error state — **hard stop**
- Production deployment is active instead of staging — **hard stop**

---

## E. SELECT-Only Staging Preflight

All checks are SELECT-only. No writes. Verified via `npx supabase db query --linked` against staging (`smbausuyetlgxflyhmfg`).

```sql
-- 1. Supabase project ref (must be smbausuyetlgxflyhmfg — hard stop if production)
-- (verify via: cat supabase/.temp/project-ref)

-- 2. Sender identity
SELECT id::text, email, name, is_default, is_verified, status
FROM sender_identities
WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
ORDER BY is_default DESC;
-- Expected: noreply@321swipe.com is_default=true, is_verified=true, status=active

-- 3. Send gates
SELECT key, value::text, is_enabled, tenant_id::text
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST, key ASC;
-- Expected: all false (global + tenant)

-- 4. Baseline counts (record before any object creation)
SELECT
  (SELECT COUNT(*) FROM email_sends)::text AS email_sends_baseline,
  (SELECT COUNT(*) FROM campaign_email_sends)::text AS campaign_email_sends_baseline,
  (SELECT COUNT(*) FROM proposal_follow_up_commitments)::text AS pfc_count,
  (SELECT COUNT(*) FROM email_drafts WHERE source_type = 'future_follow_up')::text AS ff_drafts,
  (SELECT COUNT(*) FROM approval_requests WHERE request_type = 'proposal_follow_up_draft_review')::text AS pfc_approvals;

-- 5. Operator/permission check
SELECT p.slug FROM memberships m
JOIN roles r ON r.id = m.role_id
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
WHERE m.tenant_id = '10000000-0000-0000-0000-000000000001'
  AND m.user_id = 'a76d71ca-fe31-4314-8698-212714919d28'
  AND p.slug IN ('messaging.send_emails', 'crm.leads.edit', 'workflow.approve_requests')
ORDER BY p.slug;

-- 6. Recipient / test contact safety
SELECT c.id::text, c.email, c.do_not_contact, c.status
FROM contacts c
WHERE c.tenant_id = '10000000-0000-0000-0000-000000000001'
  AND lower(c.email) = lower('mgervasio@321swipe.com');
-- Expected: email=mgervasio@321swipe.com, do_not_contact=false, status=active
```

**Hard stops from preflight:**
- Project ref ≠ `smbausuyetlgxflyhmfg`
- `noreply@321swipe.com` missing, not default, not verified, not active
- Any send gate is `true`
- Recipient contact has `do_not_contact=true`
- `messaging.send_emails` not confirmed for operator

---

## F. Object Strategy Decision

### Option A — Reuse existing Slice 4J object (NOT recommended)

The Slice 4J draft (`97e59aa8-5906-44f0-ad6a-bb3f23517500`) and approval request (`1afaff3b-665c-47ec-84fa-d9395520d88e`) are both already `status='approved'`. Resetting either to `'pending'`/`'pending_approval'` requires raw DB writes, which require a separate approved write plan. **Option A is rejected unless a separate write plan is approved.**

### Option B — New controlled verification object (recommended default)

Create exactly one new controlled staging verification object through the approved application action flow.

| Requirement | Value |
|-------------|-------|
| New commitment count | Exactly 1 |
| New draft count | Exactly 1 |
| New approval request count | Exactly 1 |
| Draft `status` at creation | `'pending_approval'` |
| `proposalReference` | `'[TEST ONLY]'` |
| Draft subject | Contains `'[TEST ONLY]'` |
| Recipient | `mgervasio@321swipe.com` |
| Sender | `noreply@321swipe.com` |
| `source_type` | `'future_follow_up'` |
| `subject_type` | `'proposal_follow_up_commitment'` |
| No send | ✓ |

### One-open-proposal constraint

The existing Slice 4J proposal event (`b39fefe3-0639-494e-b84e-9093564a17ec`) has `proposal_status='sent'`. The `idx_proposal_events_one_open_per_lead` partial unique index blocks creating a second open proposal event for the same lead (`d4e24f9f-0a8e-4772-8ab7-6e49eea7edd1`).

**Resolution options (operator decides at execution time):**

| Option | Action | Risk |
|--------|--------|------|
| **1** | Use a different staging test lead whose contact resolves to `mgervasio@321swipe.com` (if one exists) | Low — no new DB writes beyond the intended object |
| **2** | Create a new test lead/contact via staging app UI as `staging@verian.internal` | Low if done through app |
| **3** | Close the existing Slice 4J proposal event via staging app UI (`proposal_status` → `'accepted'`) | Low — uses app path |

**Hard stop:** Do not bypass the constraint with raw DB `UPDATE proposal_events SET proposal_status=...`. Any raw write to resolve the constraint requires a separate approved write plan.

---

## G. Planned App-Path Execution Sequence

**NOT executed in this plan document. For use in the future Slice 4M execution prompt.**

```
Step 1: Git preflight
  git status --short (must be clean)
  git rev-parse HEAD (must include 0b8f4bc or later)
  git rev-parse origin/master (must match HEAD)

Step 2: Staging CLI relink (if needed)
  npx supabase link --project-ref smbausuyetlgxflyhmfg
  cat supabase/.temp/project-ref → must equal smbausuyetlgxflyhmfg
  Hard stop if: kxrplupzbsmujjznzhpy

Step 3: Deployment confirmation
  Confirm staging Vercel deployment includes 0b8f4bc or later.
  Hard stop if not confirmed.

Step 4: SELECT-only preflight (all checks from Section E)
  Hard stop if any gate is true or sender invalid.
  Record email_sends baseline and pfc/ff_draft/approval counts.

Step 5: Resolve one-open-proposal constraint (see Section F)
  Choose Resolution Option 1, 2, or 3.
  Do not use raw DB writes without separate approved plan.

Step 6: Create exactly one proposal follow-up commitment
  Via staging app as staging@verian.internal:
  createManualProposalCaptureAction({
    leadId: '<resolved lead ID>',
    proposalSentAt: '<ISO timestamp>',
    proposalReference: '[TEST ONLY]',
    scheduleRuleKey: 'single_7'
  })
  SELECT-only verify: 1 new commitment, linked to correct lead.

Step 7: Generate exactly one future_follow_up draft
  Via staging app as staging@verian.internal:
  generateFollowUpDraftAction({ commitmentId: '<new_commitment_id>' })
  SELECT-only verify (hard stops):
    draft.status = 'pending_approval'                             ← must be true
    draft.source_type = 'future_follow_up'
    draft.subject_type = 'proposal_follow_up_commitment'
    draft.to_email = 'mgervasio@321swipe.com'
    draft.subject ILIKE '%[TEST ONLY]%'
    approval_request.status = 'pending'
    approval_request.request_type = 'proposal_follow_up_draft_review'
    approval_request.subject_id = commitment_id

Step 8: Approve via normal workspace approval path
  Via staging app inbox / proposal-follow-ups queue as staging@verian.internal:
    Use approveRequestAction or equivalent workspace UI approval button.
    NOT token approve-and-send path.
    NOT raw DB update.
    NOT sendFollowUpDraftAction.
    Hard stop if any send is triggered.

Step 9: SELECT-only post-approval verification (THE KEY CHECK)
  SELECT
    d.id::text AS draft_id,
    d.status,
    d.approved_at,
    d.sent_at,
    ar.id::text AS approval_request_id,
    ar.status AS approval_status,
    ar.decided_at
  FROM email_drafts d
  LEFT JOIN approval_requests ar ON ar.id = d.approval_request_id
  WHERE d.id = '<new_draft_id>';

  Required results:
    draft.status = 'approved'         ← KEY: Slice 4L fix verified here
    draft.approved_at IS NOT NULL
    draft.sent_at IS NULL             ← no send occurred
    approval_request.status = 'approved'
    approval_request.decided_at IS NOT NULL

Step 10: SELECT-only final safety checks
  email_sends count = baseline (unchanged)
  campaign_email_sends = 0 (unchanged)
  email_sending_enabled remains false (global + tenant)
  campaign_sending_enabled remains false

Step 11: Create Slice 4M execution report
  Capture all evidence from Section H template.
  Note whether Slice 4L fix is confirmed working.

Step 12: Revert Supabase CLI temp files
  git checkout -- supabase/.temp/*

Step 13: Report findings — do not commit, push, or proceed to Slice 5.
```

---

## H. Evidence Template for Future Execution Report

The future Slice 4M execution report must fill in every row:

| Evidence field | Value (fill at execution) |
|----------------|--------------------------|
| Staging deployment commit/version | TBD |
| Staging ref | `smbausuyetlgxflyhmfg` |
| Production ref excluded | `kxrplupzbsmujjznzhpy` not linked ✓ |
| Sender verification | `noreply@321swipe.com` — `is_default`, `is_verified`, `status` |
| `email_sending_enabled` (global) | `false` ✓ |
| `email_sending_enabled` (tenant) | `false` ✓ |
| `campaign_sending_enabled` (global) | `false` ✓ |
| `email_sends` baseline | TBD |
| `campaign_email_sends` baseline | TBD (expected 0) |
| One-open-proposal resolution | TBD (Option 1/2/3) |
| Lead ID used | TBD |
| Contact ID | TBD |
| `proposal_follow_up_commitment` ID | TBD |
| `email_draft` ID | TBD |
| `approval_request` ID | TBD |
| Draft `status` **before** approval | `'pending_approval'` (required) |
| Approval request `status` **before** approval | `'pending'` (required) |
| Approval action/path used | `approveRequestAction` via workspace UI (NOT token, NOT raw DB) |
| Draft `status` **after** approval | **`'approved'`** ← Slice 4L fix verification |
| Draft `approved_at` | TBD (non-null required) |
| Approval request `status` **after** approval | `'approved'` (required) |
| Approval request `decided_at` | TBD (non-null required) |
| Draft `sent_at` | `null` (no send) |
| `email_sends` after | TBD (must equal baseline — unchanged) |
| `campaign_email_sends` after | 0 (unchanged) |
| Gate values after | All `false` ✓ |
| No manual DB sync used | ✓ |
| No raw DB fallback used | ✓ |
| No send occurred | ✓ |
| **Slice 4L fix confirmed** | **PASS** if `draft.status='approved'` without raw DB / **FAIL** if still `pending_approval` |
| Slice 5 blocked | ✓ |

---

## I. Stop Conditions

The future Slice 4M execution must immediately halt if:

| Condition | Action |
|-----------|--------|
| Staging deployment does not include `0b8f4bc` or later | **Hard stop** |
| Production ref `kxrplupzbsmujjznzhpy` linked | **Hard stop** |
| Working tree dirty at start | Stop |
| Any send gate is `true` | **Hard stop** |
| `noreply@321swipe.com` missing, not verified, not default | **Hard stop** |
| Recipient is not `mgervasio@321swipe.com` | **Hard stop** |
| Draft subject lacks `[TEST ONLY]` | Stop before approval |
| Token approve-and-send path used | **Hard stop** |
| Raw DB draft status sync used | **Hard stop** |
| One-open-proposal constraint bypassed via raw DB write | **Hard stop** |
| `sendFollowUpDraftAction` called | **Hard stop** |
| Any send triggered | **Hard stop** |
| More than 1 new commitment/draft/approval created | Stop — investigate |
| After approval: `draft.status ≠ 'approved'` | **Stop — Slice 4L fix did not deploy; do not proceed to Slice 5** |
| Slice 5 send proposed | **Hard stop** |

---

## J. Final Decision

| Item | Result |
|------|--------|
| Execution plan only — no verification executed | ✓ |
| No app actions performed | ✓ |
| No DB writes | ✓ |
| No sends | ✓ |
| No gates changed | ✓ |
| No production changes | ✓ |
| `EMAIL_SENDING_ENABLED` effective `false` | ✓ |
| `CAMPAIGN_SENDING_ENABLED` effective `false` | ✓ |
| **Slice 5** | **BLOCKED** — Slice 4M execution + Codex PASS + operator approval + send plan required |
