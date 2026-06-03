# Phase 3V Slice 2 — Controlled Enablement Preflight Checklist

**Status:** Readiness checklist only — no enablement, no sending
**Created:** 2026-06-03
**Predecessor:** Phase 3V Slice 1 — [Email Sending Readiness Plan](phase-3v-email-sending-readiness-controlled-enablement-plan.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**Phase 3V plan commit:** `dce3a2d`

> **⚠️ This document does NOT enable EMAIL_SENDING_ENABLED. It defines the exact checklist that must be fully green before a future Phase 3V Slice 3 staging test plan can begin.**

---

## 1. Purpose

Phase 3V Slice 2 converts the Phase 3V readiness plan into a concrete preflight checklist for a future controlled staging one-email test. Every item in this checklist must be verified and marked green before Slice 3 is written.

**This slice does NOT:**
- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Send emails
- Touch production
- Create migrations
- Add UI or automation
- Execute any test

It only defines the exact checks required before any future enablement attempt.

---

## 2. Current Locked Foundation

| Item | Status |
|------|--------|
| Phase 3U lock tag | `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a` |
| Phase 3V plan | Pushed at `dce3a2d` |
| `sendApprovedDraft` hardening | `'provider_accepted'` write, hardened catch block, confirmed in Slice 3 tests |
| `getBlockingSendForDraft` | Required before `createEmailSend` in `sendApprovedDraft` |
| `'provider_accepted'` status | Application-guarded (DB index not extended) |
| `EMAIL_SENDING_ENABLED` | **Disabled** |
| `CAMPAIGN_SENDING_ENABLED` | **Disabled** — out of scope for Phase 3V entirely |

---

## 3. How to Use This Checklist

- Work through each section sequentially.
- Mark each item `[x]` only when independently verified.
- If any item cannot be verified or fails, **stop** — do not proceed to Slice 3.
- Any `[ ]` at the end of this review means Slice 3 cannot proceed.
- Document all findings in the approval gate (Section 16).

---

## A. Git / Repository State

- [ ] `git status --short` returns nothing (working tree clean)
- [ ] `git log --oneline -5` confirms latest `origin/master` is `dce3a2d` or a later approved readiness commit
- [ ] `git tag --list phase-3u-send-reliability-hardening-v1` returns the tag name
- [ ] `git rev-parse phase-3u-send-reliability-hardening-v1^{}` returns `b472b720eea83f1bb904af6b88c71b6842c0f94a`
- [ ] No local uncommitted code changes
- [ ] No pending migration files in `supabase/migrations/`
- [ ] No pending UI changes that affect send path
- [ ] No pending env/config file changes

---

## B. Environment Boundary

- [ ] Target environment name is explicitly stated: `___________________`
- [ ] Environment is confirmed as **staging / non-production** — not production
- [ ] Production is explicitly excluded from this test
- [ ] Target Supabase project ref confirmed: `___________________`
- [ ] Confirmed this is NOT the production Supabase project (`kxrplupzbsmujjznzhpy` or equivalent production ref)
- [ ] Vercel project/environment is non-production if applicable
- [ ] No production env vars will be changed
- [ ] No production database will be touched
- [ ] No real customer/prospect data will be used in any part of this test

> **STOP if production is selected or unclear.** Any ambiguity about the environment must be resolved before proceeding.

---

## C. Feature Flag / System Control State

- [ ] `system_controls` table accessible in target environment
- [ ] Row for `EMAIL_SENDING_ENABLED` (key: `'email_sending_enabled'`) located
- [ ] Current value confirmed **false** via:
  ```typescript
  // getBooleanControl returns false for target tenant before test
  getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, verifiedTenantId)
  ```
- [ ] Confirmed update mechanism is `setControlValue` with **boolean** `true`/`false` (not string `'true'`/`'false'`)
  ```typescript
  // Enablement:
  setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, true, verifiedScope)
  // Rollback:
  setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, false, verifiedScope)
  ```
- [ ] `setIsEnabled` is not used as the runtime delivery gate
- [ ] Target scope confirmed — choose one and document it:
  - [ ] `null` — platform/global default (affects all tenants with no per-tenant override)
  - [ ] Specific `tenantId` — per-tenant override (intentional and verified only)
  - Documented scope: `___________________`
- [ ] `CAMPAIGN_SENDING_ENABLED` (key: `'campaign_sending_enabled'`) confirmed **false**
- [ ] Rollback command ready and documented:
  ```
  setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, false, [verifiedScope])
  ```
- [ ] Rollback verification command ready:
  ```
  getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, [verifiedTenantId]) === false
  ```

> **STOP if `EMAIL_SENDING_ENABLED` is already true unexpectedly, if `CAMPAIGN_SENDING_ENABLED` is true, or if scope is ambiguous.**

---

## D. Sender / Provider Readiness

- [ ] Staging Resend API key exists and is configured for target environment
- [ ] Staging Resend API key is confirmed **non-production** (not shared with live customer emails)
- [ ] Sender domain is verified in Resend for staging
- [ ] Sender identity row exists in staging DB (`sender_identities` table)
- [ ] Sender identity `is_verified = true` and `is_default = true` or the expected identity is confirmed
- [ ] `reply_to` address is internal/valid
- [ ] Provider dashboard access available to verify delivery
- [ ] Provider rate limits noted and not exceeded for test
- [ ] Test recipient email checked against provider suppression/bounce list — not suppressed
- [ ] No production Resend API key used in staging environment
- [ ] No direct Resend calls from proposal action or UI — only through `sendApprovedDraft`

---

## E. Test Tenant / Workspace

- [ ] Tenant ID: `___________________`
- [ ] Workspace ID: `___________________`
- [ ] Workspace is confirmed staging/non-production
- [ ] Workspace is safe for test data (no live customer/prospect emails linked)
- [ ] Audit/activity event records are accessible for this tenant/workspace
- [ ] Confirmed no live emails will be affected by flag enablement in this workspace

---

## F. Test User Permissions

- [ ] Test user ID: `___________________`
- [ ] User can access the target workspace
- [ ] User has `messaging.send_emails` permission
- [ ] **`crm.leads.edit` alone is NOT sufficient** — `messaging.send_emails` is the required send authority
- [ ] Permissions verified before test — not assumed
- [ ] Least privilege: only this specific user needs `messaging.send_emails` for the test window
- [ ] No broad permission grants needed

---

## G. Test Lead / Contact / Draft Data

- [ ] Internal test lead identified in staging — not a real customer or prospect
- [ ] Lead ID: `___________________`
- [ ] Contact email is internal/allowlisted: `___________________`
- [ ] Contact is NOT a customer or prospect
- [ ] Test email clearly marked — draft subject contains `[TEST ONLY]`
- [ ] Draft body contains no sensitive data
- [ ] Draft is linked to a proposal follow-up commitment if using the proposal follow-up send path
- [ ] Commitment ID (if applicable): `___________________`
- [ ] `email_drafts.campaign_assignment_id` is `null`
- [ ] `email_drafts.superseded_at` is `null`
- [ ] `email_drafts.deleted_at` is `null`
- [ ] `email_drafts.source_type = 'future_follow_up'` (for proposal follow-up path)
- [ ] `email_drafts.to_email` matches internal test recipient

---

## H. Draft Readiness and Approval State

- [ ] Draft ID: `___________________`
- [ ] `email_drafts.status = 'approved'`
- [ ] `email_drafts.approval_request_id` is non-null
- [ ] `approval_requests.status = 'approved'` for the linked request
- [ ] `approval_requests.decided_at` is non-null
- [ ] `email_drafts.subject` is non-empty
- [ ] `email_drafts.body_html` or `email_drafts.body_text` is non-empty (at least one)
- [ ] `email_drafts.to_email` is non-empty and matches the internal recipient
- [ ] `checkDraftSendReadiness` passes — no blocked reasons:
  - `missing_recipient` — no
  - `missing_subject` — no
  - `missing_body` — no
  - `draft_not_approved` — no
  - `missing_approval_request` — no
- [ ] No suppression for recipient email: `checkEmailSuppression(tenantId, toEmail).blocked === false`
- [ ] No invalid sender identity
- [ ] Draft is not superseded (`superseded_at IS NULL`)
- [ ] Draft is not deleted (`deleted_at IS NULL`)

---

## I. Blocking Send Check

This is a critical safety check. Run immediately before any test attempt.

- [ ] `getBlockingSendForDraft(draftId, tenantId)` returns `null` — no blocking send exists
- [ ] No `email_sends` row with `status = 'queued'` for this draft
- [ ] No `email_sends` row with `status = 'sent'` for this draft
- [ ] No `email_sends` row with `status = 'provider_accepted'` for this draft
- [ ] No `email_sends` row with `status = 'failed'` AND `resend_message_id IS NOT NULL` for this draft

> **STOP if any blocking row exists.** A `'failed'` row with `resend_message_id` set means the provider may have accepted the request — do not retry without reconciliation.

---

## J. UI / Action Path Check

- [ ] `SendFollowUpDraftButton` shows "Email sending disabled" while `EMAIL_SENDING_ENABLED = false`
- [ ] UI requires a confirmation step before calling the action
- [ ] UI has `useRef` in-flight guard to prevent double-submit
- [ ] UI calls `sendFollowUpDraftAction({ commitmentId })` — not `{ draftId }` as the primary input
- [ ] `sendFollowUpDraftAction` derives `draftId` server-side from `commitment.draft_id`
- [ ] Action validates `tenant_id` and `workspace_id` scope before delegating
- [ ] Action validates `email_drafts.subject_type = 'proposal_follow_up_commitment'`
- [ ] Action validates `email_drafts.subject_id = commitmentId`
- [ ] Action validates `email_drafts.source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP`
- [ ] Action requires `email_drafts.campaign_assignment_id IS NULL`
- [ ] Action validates `email_drafts.superseded_at IS NULL`
- [ ] Action calls `checkDraftSendReadiness` before `sendApprovedDraft`
- [ ] Action delegates to `sendApprovedDraft` (does not call Resend directly)
- [ ] No direct Resend call in proposal action or `SendFollowUpDraftButton`
- [ ] `sendApprovedDraft` still calls `getBlockingSendForDraft` before `createEmailSend`
- [ ] `'provider_accepted'` intermediate write still present in `sendApprovedDraft`

---

## K. Observability / Audit Check

Confirm access to these records before test:

- [ ] Can query `email_sends` for test draft in staging DB
- [ ] Can query `email_drafts` for test draft in staging DB
- [ ] Can query `approval_requests` for test draft in staging DB
- [ ] Can query `activity_events` for test tenant/workspace in staging DB
- [ ] Know how to find `ET_SEND_INITIATED` event after send
- [ ] Know how to find `ET_SEND_SUCCEEDED` or `ET_SEND_FAILED` event after send
- [ ] Can verify `email_sends.resend_message_id` is set after send
- [ ] Can access Resend provider dashboard to verify delivery
- [ ] Can confirm internal recipient received email (internal team member)
- [ ] Can verify no `campaign_email_sends` row was created
- [ ] Can verify no background jobs were scheduled
- [ ] Can verify `proposal_follow_up_commitments.commitment_status` is unchanged (`'open'`)
- [ ] Can verify no proposal status mutation occurred

---

## L. Rollback Readiness

- [ ] Rollback command documented:
  ```typescript
  await setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, false, verifiedScope)
  // Boolean false — NOT string 'false'
  ```
- [ ] Verified scope for rollback matches enablement scope: `___________________`
- [ ] Rollback verification command documented:
  ```typescript
  const disabled = await getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, verifiedTenantId)
  // disabled must be false
  ```
- [ ] Person responsible for rollback identified: `___________________`
- [ ] Rollback can be executed immediately (access confirmed before test begins)
- [ ] No `email_sends` rows will be deleted — they are audit records
- [ ] No manual `email_drafts.status` mutation without a separate recovery plan
- [ ] If `provider_accepted` state occurs: no blind retry; inspect `resend_message_id` and provider dashboard first
- [ ] If `failed + resend_message_id IS NOT NULL` occurs: no retry without reconciliation
- [ ] If timeout/no-ID occurs: stop testing; investigate before any retry

---

## M. Test Execution Approval Gate

**All items above must be `[x]` before this section can be completed.**

Complete this section only when all checklist items are verified:

```
Approver name:        ___________________
Approval timestamp:   ___________________
Target environment:   ___________________
Verified scope:       ___________________
Internal recipient:   ___________________
Test draft ID:        ___________________
Test commitment ID:   ___________________ (if proposal follow-up path)
Rollback owner:       ___________________
Test window start:    ___________________
Test window end:      ___________________
```

> **No email may be sent until this gate is signed and all items are green.**

---

## 14. Failure / Stop Conditions

Any of the following must immediately halt the review — Slice 3 cannot proceed:

| Condition | Action |
|-----------|--------|
| Production environment selected | Stop — environment boundary violation |
| Recipient is a customer or prospect | Stop — not internal/allowlisted |
| `CAMPAIGN_SENDING_ENABLED = true` | Stop — flag must be false |
| `EMAIL_SENDING_ENABLED` already unexpectedly true | Stop — investigate before touching |
| Target scope (null vs tenantId) is ambiguous | Stop — resolve scope first |
| Resend API key is production or unverified | Stop — wrong key |
| Sender domain not verified | Stop — Resend will reject |
| Draft is not `'approved'` | Stop — lifecycle gate will block send |
| `checkDraftSendReadiness` returns blocked reasons | Stop — fix draft data |
| `getBlockingSendForDraft` returns a non-null row | Stop — resolve existing row first |
| Test user lacks `messaging.send_emails` | Stop — permission fix required |
| No rollback owner identified | Stop — rollback must be assigned before test |
| No provider dashboard access | Stop — cannot verify delivery outcome |
| Targeted tests failing with relevant failures | Stop — resolve test failures first |
| Working tree dirty | Stop — commit/clean first |
| Unresolved migration or config changes | Stop — resolve before test |
| Any item in this checklist still `[ ]` | Stop — complete checklist first |

---

## 15. Required Commands for Future Readiness Review

Run these before completing any checklist section:

```bash
# Git state
git status --short
git log --oneline -8
git tag --list phase-3u-send-reliability-hardening-v1
git rev-parse phase-3u-send-reliability-hardening-v1^{}

# Test suite
npx vitest run tests/phase3u-send-reliability-hardening.test.ts
npx vitest run tests/phase3t-proposal-follow-up-send.test.ts
npx vitest run tests/phase3t-approved-send-ui.test.ts
npx vitest run tests/phase3u-send-reliability-hardening.test.ts tests/phase3t-proposal-follow-up-send.test.ts tests/phase3t-approved-send-ui.test.ts

# Type check
npx tsc --noEmit
```

In staging DB / application:
```typescript
// System control state
getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, verifiedTenantId)   // must be false
getBooleanControl(SystemControlKey.CAMPAIGN_SENDING_ENABLED, verifiedTenantId) // must be false

// Blocking send check
getBlockingSendForDraft(testDraftId, testTenantId)  // must return null

// Draft readiness
checkDraftSendReadiness(draft, readinessContext)     // must be ready: true
checkEmailSuppression(testTenantId, testToEmail)     // must not be blocked
```

---

## 16. Acceptance Criteria for Slice 2

This checklist is accepted if:

- [x] Documentation only — no sending, no code changes, no migrations, no production changes
- [x] `EMAIL_SENDING_ENABLED` not enabled
- [x] `CAMPAIGN_SENDING_ENABLED` not enabled
- [x] No emails sent
- [x] No production changes
- [x] Checklist is specific enough to block unsafe enablement
- [x] System control instructions use `setControlValue` with boolean `true`/`false` and `getBooleanControl` for verification
- [x] All stop conditions are explicit
- [x] Approval gate requires all items green before Slice 3 can begin

---

## 17. Recommended Next Slice

**Phase 3V Slice 3 — Staging One-Email Test Plan**

Slice 3 is still planning only. It should:
- Identify the exact staging environment by name and project ref
- Identify the internal recipient and test draft (or document how the test draft will be created in staging)
- Provide the exact verification queries to run post-send
- Provide the rollback command with the confirmed scope
- Provide a test report template
- Remain documentation only — no enablement in Slice 3

**Phase 3V Slice 4** would be the first possible enablement/test execution slice, and only after:
- Slice 3 is complete and approved
- This Slice 2 checklist is fully green
- Explicit operator approval is given
