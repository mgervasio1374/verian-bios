# Phase 3V Slice 4I — Operational Blocker Confirmation Plan

**Status:** Planning only — no operational changes, no writes, no sending
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4H — [Operational Blocker Resolution Plan](phase-3v-slice-4h-operational-blocker-resolution-plan.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at plan time:** `2de012f4e283d97fe6bb456ec7378dcc7f99f832`

> **⚠️ Slice 4I is a narrow confirmation workflow plan. It does NOT enable flags, send emails, create drafts, create commitments, approve drafts, change provider/sender config, modify system controls, or authorize Slice 5.**

---

## A. Purpose

Phase 3V Slice 4I converts the Slice 4H blocker inventory into a focused confirmation workflow. It separates what can be confirmed with read-only checks from what requires manual operator confirmation or a later approved DB write or dashboard action.

Slice 4I is still not a send step. Its purpose is to confirm or plan the confirmation of:
- Provider key (staging/non-production status)
- Sender identity (verified or replacement needed)
- Internal recipient
- `messaging.send_emails` permission
- `verifiedScope`
- People assignments (operator, reviewer, rollback owner, etc.)

Only after these confirmations are complete can Slice 4J (test object creation) be safely planned.

---

## B. Current Blocker State

| # | Blocker |
|---|---------|
| 1 | Sender identity unverified (`noreply@verian.internal`, `is_verified = false`, `status = pending`) |
| 2 | Provider key environment not confirmed as staging/non-production |
| 3 | `messaging.send_emails` permission holder not confirmed |
| 4 | Internal recipient not confirmed |
| 5 | External forwarding/no-forwarding risk not confirmed |
| 6 | Tenant-scoped `verifiedScope` not established; current effective scope is global/null |
| 7 | Operator, reviewer, rollback owner, test window, and evidence reviewer TBD |
| 8 | No `proposal_follow_up_commitment` test row exists |
| 9 | No `future_follow_up` approved draft exists |
| 10 | No linked `approval_request` exists |
| 11 | Candidate-specific blocking-send/readiness checks cannot run until test object exists |
| 12 | Slice 4 evidence must be recollected again after blockers are resolved |

---

## C. Non-Goals

Slice 4I does NOT:

- Verify sender/domain in Resend unless operator does so manually outside the repo and reports the result
- Change provider configuration
- Expose provider keys or secrets
- Modify `system_controls`
- Create tenant-scoped `verifiedScope`
- Create `proposal_follow_up_commitments`
- Generate or approve drafts
- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Send emails
- Click send buttons
- Proceed to Slice 5

---

## D. Safe Confirmation Matrix

| Blocker | Confirmation type | Safe method in Slice 4I | Operator input required? | DB write required? | Status |
|---------|-------------------|--------------------------|--------------------------|--------------------|--------|
| Provider key environment | Operator/env dashboard — without exposing secret | Operator confirms staging uses non-production Resend key; never paste full key | Yes | No | TBD |
| Sender identity verification | Read-only DB check + provider dashboard/operator confirmation | SELECT sender identity; operator checks Resend domain status | Yes | No (unless replacing sender later) | Currently `is_verified = false`, `status = pending` |
| Internal recipient | Operator confirmation | Operator names exactly one internal 321 Swipe-controlled inbox | Yes | No | TBD |
| No external forwarding | Operator confirmation | Operator explicitly confirms no external forwarding | Yes | No | TBD |
| `messaging.send_emails` permission | Read-only app/DB confirmation | Inspect user permission; if unknown, leave TBD | Maybe | No (unless granting later) | TBD |
| `verifiedScope` | Read-only `system_controls` inspection | Check whether tenant-specific `email_sending_enabled` row exists | Maybe | Yes if creating override later | Global/null currently |
| People assignments | Operator assignment | Operator supplies all required names | Yes | No | TBD |

---

## E. Read-Only Evidence Checks Allowed in a Future Confirmation Execution

The following SELECT-only checks are defined for use in a later Slice 4I execution prompt. They are NOT run in this planning document.

```sql
-- 1. Sender identity
SELECT id::text, tenant_id::text, email, name, is_default, is_verified, status
FROM sender_identities
ORDER BY tenant_id, is_default DESC, created_at ASC;

-- 2. System controls / verifiedScope
SELECT key, value::text, is_enabled, tenant_id::text
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST, key ASC;

-- 3. Send counts (to confirm no sends occurred during this workflow)
SELECT COUNT(*)::text AS email_sends_count FROM email_sends;
SELECT COUNT(*)::text AS campaign_email_sends_count FROM campaign_email_sends;
```

**Permission evidence:**
- First inspect the schema for known permission tables if already documented.
- Do not guess table names if unknown.
- If unclear, leave permission confirmation as operator/app-level evidence (navigate to staging app as the operator user and confirm `messaging.send_emails` is granted).

**Staging project ref verification (before any linked query):**
```bash
cat supabase/.temp/project-ref   # must equal smbausuyetlgxflyhmfg
# Relink only if separately approved and current ref is not smbausuyetlgxflyhmfg
```

---

## F. Provider Key Confirmation Rules

- **Never paste or commit full provider keys** in any document, commit, or prompt
- Operator may report only safe metadata:
  - `"staging Resend key confirmed non-production"` ← acceptable
  - A non-sensitive key prefix if internal policy allows (e.g., `re_test_...` pattern) ← acceptable
  - Full key value ← **never acceptable**
- Production Resend key must not be used for the staging send test
- If provider key environment cannot be confirmed, Slice 5 remains blocked
- Slice 4I does not change environment variables

---

## G. Sender Verification Rules

| Item | Current value | Required value | How to resolve |
|------|--------------|----------------|----------------|
| Sender email | `noreply@verian.internal` | `noreply@verian.internal` (if verifiable) or alternative | Verify domain in Resend staging dashboard |
| `is_verified` | `false` | `true` | Domain verification in Resend — separate operator-approved dashboard action |
| `status` | `pending` | verified/active | Follows domain verification |

- **Slice 5 cannot proceed until sender is verified or replaced with a verified staging-safe sender**
- Any Resend dashboard/domain verification is a separate operator-approved action outside the repo
- Any DB/app sender replacement must be a separate operator-approved workflow
- After verification or replacement, evidence must be recollected in a new Slice 4K-style pass

---

## H. Internal Recipient Rules

- Exactly **one** recipient — not a list
- Prefer `@321swipe.com` address
- Must be a personally-controlled inbox — the operator who runs the test must have access to this inbox
- Recipient **must not forward externally** under any circumstances
- Excluded: customers, prospects, vendors, shared groups, distribution lists, external aliases
- Recipient must match the future draft `to_email` field exactly

---

## I. Permission Rules

- **`messaging.send_emails`** is the required permission for the send action
- `crm.leads.edit` is explicitly **not sufficient** for sending (confirmed in action code)
- If the permission is missing from the intended test user, granting it requires a separate approved workflow
- Slice 4I does not modify permissions of any kind

---

## J. `verifiedScope` Rules

| Item | Detail |
|------|--------|
| Preferred scope | Per-tenant override for tenant `10000000-0000-0000-0000-000000000001` |
| Current scope | Global/null — confirmed via staging `system_controls` |
| Hard stop | Global/null must remain a hard stop unless operator explicitly accepts blast-radius (currently 1 tenant in staging) and documents it |
| Enable/rollback consistency | Both `setControlValue` calls must use the same scope |
| Verification | `getBooleanControl(EMAIL_SENDING_ENABLED, verifiedTenantId)` must confirm expected value |
| Slice 4I action | Read-only check only — does not create the per-tenant override |

A per-tenant override would require a separate approved DB write: inserting a `system_controls` row with `key = 'email_sending_enabled'`, `value = 'false'`, `tenant_id = '10000000-...-0001'`. This is a separate Slice 4I execution step, not this planning document.

---

## K. People / Test-Window Assignment Rules

The following must all be assigned before Slice 5:

| Role | Who |
|------|-----|
| **Operator** (who executes Slice 5) | TBD |
| **Reviewer** (who approves Slice 5 execution) | TBD |
| **Rollback owner** (who disables `EMAIL_SENDING_ENABLED` immediately after test) | TBD |
| **Evidence reviewer** (who reviews the completed evidence document) | TBD |
| **Test window** (exact start/end time for the one-email test) | TBD |
| **Internal recipient** (exact `@321swipe.com` inbox) | TBD |
| **Blast-radius owner** (if global/null scope is accepted) | TBD — only if per-tenant override is not established |

All assignments must be confirmed before evidence is submitted to Codex for the final pre-Slice-5 review.

---

## L. Output Expected from the Slice 4I Execution Workflow

The next execution workflow (a separate prompt after Codex PASS on this plan) must produce:

| Evidence item | Required output |
|---------------|----------------|
| Provider key environment | "Staging Resend key confirmed non-production" OR still TBD with explicit blocker note |
| Sender identity | `is_verified = true` confirmed, OR "sender replacement required — separate workflow needed" |
| Internal recipient | Exact `@321swipe.com` address confirmed, no forwarding confirmed |
| `messaging.send_emails` | User ID + "permission confirmed" OR "permission grant required" |
| `verifiedScope` | Per-tenant override confirmed, OR global/null accepted with explicit blast-radius acceptance |
| People assignments | All 5–6 roles assigned with names |
| Remaining blockers | Clear list of what still needs Slice 4J/4K resolution |
| Slice 5 status | **BLOCKED** unless all non-test-object blockers resolved and evidence submitted to Codex |

---

## M. Relationship to Slice 4J / 4K / Slice 5

```
Slice 4I (this plan + execution)
  → Confirm provider key, sender, recipient, permissions, verifiedScope, people
  → Must complete before Slice 4J

Slice 4J
  → Create test proposal_follow_up_commitment + future_follow_up draft + approval
  → Separate approved workflow using Phase 3S generate-draft path in staging
  → Must complete before Slice 4K

Slice 4K
  → Recollect all 28 evidence fields from staging after test object exists
  → Update evidence document
  → Submit to Codex for PASS

Slice 5
  → One internal controlled send
  → Only after Slice 4K Codex PASS and explicit operator approval
  → Separate execution prompt required
```

---

## N. Stop Conditions

**Any of the following must immediately halt the Slice 4I execution workflow:**

| Condition | Action |
|-----------|--------|
| Production project/app involved | **Hard stop** |
| Staging ref ≠ `smbausuyetlgxflyhmfg` | **Hard stop** |
| Provider key is unknown or production | Stop |
| Sender remains unverified and no verified replacement is available | Stop |
| Recipient is not internal/controlled | **Hard stop** |
| Recipient may forward externally | **Hard stop** |
| More than one recipient proposed | Stop |
| `messaging.send_emails` missing | Stop |
| `verifiedScope` global/null without explicit acceptance | Stop |
| Any DB write proposed without separate approval | Stop |
| Any secret exposed | **Hard stop** |
| Any send proposed | **Hard stop** |
| `EMAIL_SENDING_ENABLED` is `true` | **Hard stop** — investigate |
| `CAMPAIGN_SENDING_ENABLED` is `true` | **Hard stop** |
| Dirty git tree | Stop |
| Code/migration/config/provider/system-control changes appear unexpectedly | Stop |
| Slice 5 suggested before test-object evidence exists | **Hard stop** |

---

## O. Required Codex Review

1. **Codex must review this Slice 4I plan** before any Slice 4I execution prompt is written
2. **Codex PASS on this plan does NOT authorize** DB writes of any kind
3. **Codex PASS on this plan does NOT authorize** sender/provider changes
4. **Codex PASS on this plan does NOT authorize** sending
5. **Codex PASS on this plan does NOT authorize** Slice 5

A separate Slice 4I execution prompt is required after Codex PASS on this document.

---

## P. Final Decision

- Slice 4I authorizes **planning only**
- No operational blockers are resolved in this document
- No writes, sends, provider changes, or control changes are authorized
- **Slice 5 remains blocked**
- Next step after Codex PASS: a **separate Slice 4I execution/confirmation prompt** that runs read-only checks and collects operator confirmations for provider key, sender, recipient, permission, `verifiedScope`, and people assignments
