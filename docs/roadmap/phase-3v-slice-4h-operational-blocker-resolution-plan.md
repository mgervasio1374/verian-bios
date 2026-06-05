# Phase 3V Slice 4H — Operational Blocker Resolution Plan

**Status:** Planning only — no operational changes, no sending, no execution
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4G — Post-Migration Staging Evidence Recollection
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at plan time:** `a29141c75fe6756364e050d0bfa70a171e5cc7b9`

> **⚠️ Slice 4H plans the operational blocker resolution path only. It does NOT verify sender identity, change provider config, modify system controls, create records or drafts, enable flags, send email, or authorize Slice 5.**

---

## A. Purpose

Phase 3V Slice 4H plans the safe resolution path for the remaining operational blockers after staging schema readiness was restored by Slice 4F. The database schema now has `proposal_follow_up_commitments`, but no test data has been created and several operational prerequisites remain unresolved.

**Slice 4H is planning only.** It does not:
- Verify sender identity or change Resend/provider configuration
- Modify system controls
- Create a tenant-scoped `verifiedScope` override
- Create proposal follow-up commitments or drafts
- Approve drafts
- Enable `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- Send emails
- Authorize Slice 5

**Slice 5 remains blocked.**

---

## B. Current Ready State

| Item | Status |
|------|--------|
| Staging target | `smbausuyetlgxflyhmfg` ✓ confirmed |
| Staging app URL | `https://verian-bios-staging.vercel.app` ✓ confirmed |
| Staging migration level | `20240039` ✓ current |
| `proposal_captures` | ✓ exists |
| `proposal_events` | ✓ exists |
| `proposal_follow_up_commitments` | ✓ exists — **0 rows** |
| `future_follow_up` draft count | **0** — no test data |
| `EMAIL_SENDING_ENABLED` | `false` ✓ |
| `CAMPAIGN_SENDING_ENABLED` | `false` ✓ |
| Sends during migration/evidence work | None ✓ |
| Schema blocker | **Resolved** by Slice 4F |

---

## C. Remaining Blocker Inventory

| # | Blocker | Risk | Required evidence | Safe resolution method | Requires DB write | Must complete before Slice 5 |
|---|---------|------|-------------------|----------------------|-------------------|------------------------------|
| 1 | Sender identity unverified (`noreply@verian.internal`, `is_verified = false`) | `sendApprovedDraft` will fail at sender identity check | `is_verified = true` for staging sender | Verify domain in Resend staging dashboard — separate operator-approved step | No | Yes |
| 2 | Provider key not confirmed as staging/non-production | May use production Resend key | Key prefix confirmed as non-production (without exposing value) | Operator checks env var against Resend staging project | No | Yes |
| 3 | `messaging.send_emails` permission holder not confirmed | Send action will fail for user without this permission | User ID with permission confirmed in staging app | App permission check or read-only staging DB inspection | No | Yes |
| 4 | Internal recipient not confirmed | May send to external/customer address | `@321swipe.com` controlled inbox confirmed | Operator assigns personally-controlled inbox | No | Yes |
| 5 | External forwarding risk not confirmed | Recipient may forward externally | Operator confirms no external forwarding | Manual operator confirmation | No | Yes |
| 6 | `verifiedScope` is global/null | Affects all tenants if enabled; blast-radius risk | Per-tenant override established OR global explicitly accepted with blast-radius documentation | Create per-tenant `system_controls` override for tenant `10000000-...-0001` — separate approved step | Yes | Yes |
| 7 | No `proposal_follow_up_commitment` test row | Cannot test `sendFollowUpDraftAction` path without a commitment | One commitment row with valid fields | Create via Phase 3S `generateFollowUpDraftAction` workflow or manual seeding — separate approved step | Yes | Yes |
| 8 | No `future_follow_up` approved draft | No eligible send target exists | One draft with `source_type = 'future_follow_up'`, `status = 'approved'` | Generate via Phase 3S path after commitment exists — separate approved step | Yes | Yes |
| 9 | No linked `approval_request` with `status = 'approved'` | `sendApprovedDraft` lifecycle double-gate will fail | `approval_request_id` on draft + `approval_requests.status = 'approved'` | Route through existing HRB approval bridge in staging — separate approved step | Yes | Yes |
| 10 | Blocking-send/readiness checks cannot run | Cannot confirm no prior send exists until draft exists | `getBlockingSendForDraft` returns null + `checkDraftSendReadiness` passes | Run SELECT-only checks after test object is created | No | Yes |
| 11 | Operator/reviewer/rollback owner/test window/evidence reviewer TBD | No accountable parties | All fields assigned | Manual operator assignment | No | Yes |
| 12 | Slice 4 evidence must be recollected after blockers resolved | Evidence will be stale after test object is created | All 28 evidence fields filled from staging | Re-run Slice 4D-style recollection with staging CLI | No | Yes |

---

## D. Non-Goals

Slice 4H does NOT:

- Verify sender/domain in Resend
- Change Resend or provider configuration
- Modify system controls (`system_controls` table)
- Create tenant-specific `verifiedScope` override
- Create `proposal_follow_up_commitments` rows
- Create or approve drafts
- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Send emails
- Click send buttons
- Run migration commands
- Touch production
- Proceed to Slice 5

---

## E. Required Resolution Order

The following sequence must be followed. No step may be skipped. Each step requires a separate explicitly approved workflow.

```
1.  Confirm staging provider key environment without exposing secrets
    — operator checks env var confirms staging/non-production key prefix

2.  Verify or replace the staging sender identity
    — if noreply@verian.internal can be domain-verified in Resend staging: proceed
    — if not: choose a verified staging sender through separate approved workflow

3.  Confirm internal 321 Swipe-controlled recipient
    — operator identifies a personally-controlled @321swipe.com inbox

4.  Confirm no external forwarding on the recipient
    — operator explicitly confirms the inbox does not forward externally

5.  Identify test operator user and confirm messaging.send_emails permission
    — app permission check or read-only staging DB inspection

6.  Establish tenant-scoped verifiedScope if available
    — create per-tenant override for tenant 10000000-...-0001 in staging system_controls
    — document blast radius (1 tenant affected)

7.  Assign operator, reviewer, rollback owner, test window, and evidence reviewer

8.  Create one internal [TEST ONLY] proposal_follow_up_commitment in staging
    — separate explicitly approved step
    — tenant: 10000000-...-0001
    — workspace: 20000000-...-0001
    — commitment_status = 'open'

9.  Generate one future_follow_up email draft linked to that commitment
    — use Phase 3S generateFollowUpDraftAction path in staging
    — subject must include [TEST ONLY]
    — to_email must match the internal recipient from step 3

10. Approve the draft through the existing review/approval bridge in staging
    — approval_request must reach status = 'approved'

11. Confirm linked approval_request status is 'approved' and decided_at is non-null

12. Confirm no prior email_sends rows for the candidate draft
    — SELECT-only check: getBlockingSendForDraft must return null

13. Run readiness evidence
    — SELECT-only: checkDraftSendReadiness passes (no blocked reasons)

14. Re-run Slice 4 evidence recollection
    — update all 28 fields in the evidence document

15. Submit updated evidence to Codex
    — all 28 fields filled, readiness checklist complete

16. Only after Codex PASS on updated evidence and explicit operator approval
    may a Slice 5 execution prompt be considered
```

---

## F. Sender / Provider Resolution Plan

| Item | Current state | Required state | How to resolve |
|------|--------------|----------------|----------------|
| Sender identity | `noreply@verian.internal`, `is_verified = false`, `status = pending` | `is_verified = true` | Verify `verian.internal` domain in Resend staging dashboard — separate operator-approved step |
| Alternative | — | If `verian.internal` cannot be verified: configure a verified staging sender | Choose alternative sender — separate approved workflow |
| Provider key | Not confirmed | Confirmed as non-production (without exposing value) | Operator checks env var prefix (e.g., `re_test_...` pattern) |
| Production key | Must not be used | Excluded from staging | Operator confirms production key is not the staging key |

**Slice 4H does not change provider or sender configuration.** Any Resend domain verification or sender configuration change must happen in a separate explicitly approved operational workflow before the next evidence recollection.

---

## G. Internal Recipient Plan

| Requirement | Detail |
|-------------|--------|
| Type | Exactly one internal 321 Swipe-controlled inbox |
| Preferred | `@321swipe.com` address |
| Alternative | Another address explicitly confirmed as operator-controlled and not forwarding externally |
| Excluded | Customers, prospects, vendors, distribution lists, shared groups, external aliases |
| Count | Exactly one — not a list |
| Forwarding | Must not forward externally — operator confirmation required |
| Consistency | Same address used in test draft `to_email`, evidence document, and Slice 5 execution prompt |

Slice 4H does not assign a recipient. The operator must identify and confirm the recipient in a separate step before evidence recollection.

---

## H. Permission Plan

| Requirement | Detail |
|-------------|--------|
| Required permission | `messaging.send_emails` |
| `crm.leads.edit` | Not sufficient for sending — confirmed in action code |
| How to verify | Navigate to staging app as intended operator user and confirm permission, OR use read-only permission inspection in staging DB |
| If permission is missing | Grant `messaging.send_emails` to the test user through a separate approved workflow |

Slice 4H does not modify permissions. Any permission grant must be a separate explicitly approved step.

---

## I. `verifiedScope` Plan

| Item | Detail |
|------|--------|
| Current effective scope | `null` (global — affects all tenants) |
| Preferred scope | Per-tenant override for `10000000-0000-0000-0000-000000000001` |
| How to establish | Insert or update `system_controls` row with `tenant_id = '10000000-...-0001'` — separate approved DB write step |
| Hard stop | Global/null must remain a hard stop unless operator explicitly accepts blast-radius (1 tenant in staging) and documents it |
| Enable/rollback consistency | Both `setControlValue(EMAIL_SENDING_ENABLED, true, scope)` and rollback must use the same scope |
| Verification | `getBooleanControl(EMAIL_SENDING_ENABLED, tenantId)` must confirm expected value after each write |

Slice 4H does not modify system controls. Scope establishment must be a separate approved step.

---

## J. Test Object Creation Plan

The future Slice 5 test requires exactly this test object in staging:

| Field | Required value |
|-------|---------------|
| `proposal_follow_up_commitments.commitment_status` | `'open'` |
| `proposal_follow_up_commitments.draft_id` | Non-null — points to test draft |
| `proposal_follow_up_commitments.tenant_id` | `10000000-0000-0000-0000-000000000001` |
| `proposal_follow_up_commitments.workspace_id` | `20000000-0000-0000-0000-000000000001` |
| `email_drafts.subject_type` | `'proposal_follow_up_commitment'` |
| `email_drafts.source_type` | `'future_follow_up'` |
| `email_drafts.status` | `'approved'` |
| `email_drafts.subject` | Contains `[TEST ONLY]` |
| `email_drafts.to_email` | Internal `@321swipe.com` recipient |
| `email_drafts.campaign_assignment_id` | `NULL` |
| `email_drafts.superseded_at` | `NULL` |
| `email_drafts.deleted_at` | `NULL` |
| `approval_requests.status` | `'approved'` for linked request |
| `approval_requests.decided_at` | Non-null |
| `email_sends` rows for draft | None — `getBlockingSendForDraft` returns null |
| `checkDraftSendReadiness` | passes — no blocked reasons |

**Test object creation workflow:**
1. Create a test `proposal_event` → `proposal_follow_up_commitment` in staging (requires a matching `proposal_event` first)
2. Use Phase 3S `generateFollowUpDraftAction({ commitmentId })` to generate the `future_follow_up` draft
3. Route through the existing HRB approval bridge in staging to get `approval_requests.status = 'approved'`

This workflow must be a **separate explicitly approved step**. Slice 4H does not create it.

---

## K. Future Workflow Sequence

| Slice/Workflow | Description | Type |
|----------------|-------------|------|
| **Slice 4I** | Sender/provider confirmation + domain verification (or replacement) + recipient confirmation + permission confirmation + `verifiedScope` establishment | Operator-approved execution steps |
| **Slice 4J** | Test commitment/draft/approval creation workflow in staging | Separate approved DB write workflow |
| **Slice 4K** | Final evidence recollection after test object exists — update all 28 fields | SELECT-only evidence recollection |
| **Slice 5** | One internal controlled send, only after Codex PASS on Slice 4K evidence and explicit operator approval | Execution — requires separate prompt |

These slice names are suggestions and may be adjusted, but the sequence must remain conservative and each step must be separately approved before execution.

---

## L. Stop Conditions

**Any of the following must immediately halt the resolution process:**

| Condition | Action |
|-----------|--------|
| Production project/app is involved | **Hard stop** |
| Staging project ref ≠ `smbausuyetlgxflyhmfg` | **Hard stop** |
| Sender remains unverified | Stop — must verify first |
| Provider key is production or unknown | Stop |
| Recipient is external, forwards externally, is a list, or has multiple addresses | **Hard stop** |
| `messaging.send_emails` is missing from test user | Stop |
| `verifiedScope` is global/null without explicit blast-radius acceptance | Stop |
| No `proposal_follow_up_commitment` test row exists | Stop |
| No `future_follow_up` approved draft exists | Stop |
| No approved linked `approval_request` exists | Stop |
| Draft lacks `[TEST ONLY]` marker | Stop |
| Draft has already been sent (prior `email_sends` row) | **Hard stop** |
| `getBlockingSendForDraft` returns non-null | Stop |
| `checkDraftSendReadiness` fails | Stop — fix first |
| `EMAIL_SENDING_ENABLED` is already `true` | **Hard stop** — investigate |
| `CAMPAIGN_SENDING_ENABLED` is `true` | **Hard stop** |
| Any evidence field remains `TBD` | Stop — fill first |
| Any workflow proposes production changes | **Hard stop** |
| Any workflow proposes sending before Slice 5 | **Hard stop** |
| Any unreviewed DB write is proposed | Stop — must be separately approved |
| Dirty git tree | Stop |
| Code/migration/config/provider/system-control changes appear unexpectedly | Stop — investigate |

---

## M. Required Codex Review

1. **Codex must review this Slice 4H plan** before any operational blocker-resolution work proceeds
2. **Codex PASS on Slice 4H does NOT authorize** sender/provider changes
3. **Codex PASS on Slice 4H does NOT authorize** DB writes of any kind
4. **Codex PASS on Slice 4H does NOT authorize** sending
5. **Codex PASS on Slice 4H does NOT authorize** Slice 5

A separate Slice 4I execution prompt is required after Codex PASS on this plan.

---

## N. Final Decision

- Slice 4H authorizes **planning only**
- No operational blockers are resolved in this slice
- No sender/provider/system-control/record/draft changes are authorized
- No sending is authorized
- **Slice 5 remains blocked**
- Next step after Codex PASS: a **separate explicitly approved Slice 4I workflow** beginning with provider key/sender/recipient/permission confirmation
