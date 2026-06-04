# Phase 3V Slice 4 — Internal Send Target Evidence

**Status:** Evidence collection only — no authorization to enable or send
**Created:** 2026-06-03
**Predecessor:** Phase 3V Slice 3 — [Internal Enablement Target Plan](phase-3v-slice-3-controlled-internal-enablement-target-plan.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`

> **⚠️ This document authorizes evidence collection only. It does NOT authorize enabling `EMAIL_SENDING_ENABLED`. It does NOT authorize sending emails. Slice 5 is a separate execution prompt that may be written only after all evidence fields below are filled, the readiness checklist is complete, and this document has received a Codex review PASS.**

---

## A. Purpose

Phase 3V Slice 4 captures the exact operational evidence required before a future one-email internal approved-draft send test. This is a fill-in-the-blanks evidence document.

**Slice 4 is documentation and evidence collection only.** It does not authorize:
- Enabling `EMAIL_SENDING_ENABLED`
- Sending emails
- Proceeding to Slice 5 execution

**Slice 5 must be a separate, explicit execution prompt** written only after:
1. All evidence fields in this document are filled
2. The readiness checklist (Section G) is fully checked
3. This document has received a Codex review PASS
4. Explicit operator approval is given for Slice 5 specifically

---

## B. Non-Goals

Slice 4 does NOT:

- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Send emails
- Touch production
- Change Vercel settings
- Modify system controls
- Modify code
- Create migrations
- Modify provider or sender configuration
- Create automation or background jobs
- Click send buttons
- Proceed to Slice 5

---

## C. Current Baseline

These values are confirmed before evidence collection begins:

| Item | Expected value |
|------|----------------|
| Current HEAD | `083e816 Docs: add Phase 3V Slice 3 internal enablement target plan` |
| Phase 3U lock tag | `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a` |
| `EMAIL_SENDING_ENABLED` current value | `false` (must be verified before Slice 5) |
| `CAMPAIGN_SENDING_ENABLED` current value | `false` |
| Provider | Resend |
| Send path | `SendFollowUpDraftButton` → `sendFollowUpDraftAction({ commitmentId })` → `sendApprovedDraft` |
| Blocking-send guard | `getBlockingSendForDraft` (blocks `queued`, `sent`, `provider_accepted`, `failed+resend_message_id`) |
| Readiness guard | `checkDraftSendReadiness` (checks subject, body, approval_request_id, status) |
| Provider-accepted state | `'provider_accepted'` — application-guarded; persisted before `Promise.all` |

---

## D. Required Evidence Fields

Fill in all fields before writing a Slice 5 prompt. Fields marked `TBD` must be replaced with real values. No field may remain `TBD` in a Slice 5 prompt.

| # | Evidence field | Value |
|---|----------------|-------|
| 1 | **Environment name** | **⛔ AMBIGUOUS / BLOCKED** — `kxrplupzbsmujjznzhpy` is identified as **PRODUCTION** throughout repo docs (`docs/ai-context/00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `deployment-flow-cleanup-design.md`). Prior evidence collection queried this project in error. |
| 2 | **Environment type** (must be staging/local/dev — NOT production) | **⛔ CLASSIFICATION CONFLICT** — queries ran against `kxrplupzbsmujjznzhpy` which repo docs consistently identify as production. Staging project ref is `smbausuyetlgxflyhmfg`. Use staging or local Docker only for Slice 5. |
| 3 | **Supabase project ref** | `kxrplupzbsmujjznzhpy` — **⛔ THIS IS PRODUCTION** per repo docs. Do NOT use for Slice 5. Correct non-production ref: `smbausuyetlgxflyhmfg` (staging) or `http://127.0.0.1:54321` (local Docker). |
| 4 | **App URL** (staging/local URL only) | TBD — operator confirms staging/local app URL (NOT `https://verian-bios.vercel.app` which is production) |
| 5 | **Tenant ID** | TBD — re-collect from correct non-production environment (staging/local) |
| 6 | **Workspace ID** | TBD — re-collect from correct non-production environment |
| 7 | **Workspace slug** | TBD — re-collect from correct non-production environment |
| 8 | **`verifiedScope`** (null = platform/global; tenantId = per-tenant override — prefer tenantId) | TBD — must be determined for the correct non-production environment after classification is resolved |
| 9 | **`verifiedScope` blast radius** (how many tenants are affected) | TBD — must be determined for the correct non-production environment |
| 10 | **Internal recipient email** (must be `@321swipe.com` or equivalent internal) | **TBD — BLOCKER:** No proposal follow-up draft exists yet; existing approved draft uses `mgervasio1374@gmail.com` (non-`@321swipe.com`; operator must confirm control and no external forwarding) |
| 11 | **Proposal follow-up commitment ID** | **TBD — BLOCKER:** No open commitment with a linked draft exists in DB (`COUNT = 0`) |
| 12 | **Email draft ID** | **TBD — BLOCKER:** No proposal follow-up draft exists (`source_type = 'future_follow_up'`) |
| 13 | **Draft status** (must be `approved`) | TBD (blocked by field 12) |
| 14 | **Draft subject** (must contain `[TEST ONLY]` or equivalent marker) | **TBD — BLOCKER:** Existing approved draft subject has no test marker |
| 15 | **`approval_request_id`** (from draft row) | TBD (blocked by field 12) |
| 16 | **Approval status** (must be `approved`) | TBD (blocked by field 12) |
| 17 | **Sender identity ID** | **⛔ INVALID** — collected from production DB (`kxrplupzbsmujjznzhpy`); must re-collect from staging/local |
| 18 | **Sender email/domain** | **⛔ INVALID** — `noreply@321swipe.com` found in production DB; must verify in correct non-production environment |
| 19 | **Sender identity verification status** (must be `is_verified = true`) | TBD — re-collect from correct non-production environment; previous finding (`is_verified = false`) was from production DB |
| 20 | **Provider** | Resend |
| 21 | **Provider key environment** (must be staging/non-production — NOT production key) | TBD — operator must confirm env var is non-production key |
| 22 | **User ID with `messaging.send_emails`** (operator's user ID) | TBD — operator confirms in staging app |
| 23 | **Operator** (who executes Slice 5) | TBD |
| 24 | **Reviewer** (who approves Slice 5) | TBD |
| 25 | **Rollback owner** (who disables flag immediately after test) | TBD |
| 26 | **Planned test window** | TBD |
| 27 | **Rollback command** | `setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, false, null)` (current global scope) |
| 28 | **Evidence reviewer** (who reviews this document for Codex gate) | TBD |

---

## E. Evidence Collection Instructions

### Environment / app URL
Operator confirmation. Check Supabase project URL and ref. Confirm not production. Confirm Vercel deployment target is staging/local.

### Tenant / workspace IDs
Obtain from staging Supabase dashboard → `tenants` and `workspaces` tables. Or navigate to the staging app, log in, and read the workspace ID from the URL or settings page.

### `verifiedScope`
Operator decision. **Prefer a specific `tenantId` scope** to limit blast radius to one tenant. Only use `null` (global/platform) if the global impact is explicitly understood and accepted by the operator and reviewer. Document the exact blast radius (number of tenants affected).

### Internal recipient
Manually confirm a `@321swipe.com` inbox the operator personally controls. Confirm it does not forward externally. No customer/prospect emails.

### Commitment / draft / approval (read-only staging SQL)
Use the queries in Section F. Run only against the staging database.

### Sender identity
Use the read-only SQL in Section F. Confirm `is_verified = true` and the domain is configured in the staging Resend account.

### Provider key environment
Check the staging environment variable (`RESEND_API_KEY` or equivalent) via Vercel staging environment settings or the staging server's env context. Do not expose the actual key value in this document — only confirm it is staging/non-production (e.g., "staging key prefix confirmed: `re_test_...`").

### Permission holder
Navigate to the staging app as the intended operator user and confirm `messaging.send_emails` is granted. Or use read-only permission inspection in the staging DB.

### Rollback owner
Manual assignment. Must be a person with access to the staging system controls who can execute the rollback command immediately after the test.

---

## F. Read-Only SQL Suggestions

> **Run these queries against the staging database only. Never against production.**
> **SELECT only. No UPDATE, INSERT, or DELETE.**

```sql
-- 1. Find candidate open proposal follow-up commitments with approved drafts
--    (staging only — replace <tenant_id> and <workspace_id>)
SELECT
  pfc.id              AS commitment_id,
  pfc.tenant_id,
  pfc.workspace_id,
  pfc.commitment_status,
  pfc.draft_id,
  pfc.follow_up_due_at,
  pfc.follow_up_sequence,
  ed.id               AS draft_id,
  ed.status           AS draft_status,
  ed.to_email,
  ed.subject,
  ed.approval_request_id,
  ed.campaign_assignment_id,
  ed.superseded_at,
  ed.deleted_at
FROM proposal_follow_up_commitments pfc
JOIN email_drafts ed ON ed.id = pfc.draft_id
WHERE pfc.commitment_status = 'open'
  AND pfc.draft_id IS NOT NULL
  AND ed.status = 'approved'
  AND ed.campaign_assignment_id IS NULL
  AND ed.superseded_at IS NULL
  AND ed.deleted_at IS NULL
  AND pfc.tenant_id = '<tenant_id>'
  AND pfc.workspace_id = '<workspace_id>'
ORDER BY pfc.follow_up_due_at ASC
LIMIT 10;

-- 2. Check approval request status for a specific draft
SELECT
  ar.id,
  ar.status,
  ar.request_type,
  ar.decided_at,
  ar.subject_type,
  ar.subject_id
FROM approval_requests ar
WHERE ar.id = '<approval_request_id>'
  AND ar.tenant_id = '<tenant_id>';

-- 3. Check existing email_sends rows for a draft (blocking check)
--    All results must be empty, OR getBlockingSendForDraft must return null
SELECT
  id,
  status,
  resend_message_id,
  created_at,
  failure_reason
FROM email_sends
WHERE draft_id = '<draft_id>'
  AND tenant_id = '<tenant_id>'
ORDER BY created_at DESC;

-- 4. Find sender identity for tenant
SELECT
  id,
  email,
  name,
  is_default,
  is_verified,
  status
FROM sender_identities
WHERE tenant_id = '<tenant_id>'
ORDER BY is_default DESC;

-- 5. Check system control values for the tenant
--    (includes both global/platform row and any tenant override)
SELECT
  key,
  value,
  is_enabled,
  tenant_id
FROM system_controls
WHERE key IN ('email_sending_enabled', 'campaign_sending_enabled')
ORDER BY tenant_id NULLS FIRST;

-- 6. Resolve tenant and workspace from slug (optional)
SELECT t.id AS tenant_id, w.id AS workspace_id, w.slug
FROM workspaces w
JOIN tenants t ON t.id = w.tenant_id
WHERE w.slug = '<workspace_slug>';
```

---

## G. Readiness Checklist

All items must be `[x]` before a Slice 5 execution prompt is written.

### Environment
- [ ] Environment confirmed non-production — **⛔ UNCHECKED: `kxrplupzbsmujjznzhpy` is PRODUCTION per repo docs; evidence must be re-collected from staging (`smbausuyetlgxflyhmfg`) or local Docker**
- [ ] App URL confirmed staging/local/dev (TBD — NOT `https://verian-bios.vercel.app`)
- [ ] Supabase project ref confirmed non-production — **⛔ UNCHECKED: `kxrplupzbsmujjznzhpy` is production; use `smbausuyetlgxflyhmfg` or local Docker**

### Tenant / Workspace
- [ ] Tenant ID confirmed — TBD (re-collect from correct non-production environment)
- [ ] Workspace ID confirmed — TBD (re-collect from correct non-production environment)
- [ ] `verifiedScope` documented — TBD (re-collect from correct non-production environment)
- [ ] `verifiedScope` blast radius documented and accepted — TBD

### Recipient
- [ ] Recipient is internal and controlled by 321 Swipe (TBD — existing draft uses `mgervasio1374@gmail.com`; must confirm this is operator-controlled and does not forward externally, OR create a new test draft with `@321swipe.com` recipient)
- [ ] Recipient does not forward externally (TBD — requires operator confirmation)
- [ ] Exactly one recipient (TBD — follows from commitment/draft creation)
- [ ] Recipient email confirmed: **TBD — blocked pending proposal follow-up draft creation**

### Draft
- [ ] Approved draft exists (`status = 'approved'`)
- [ ] Draft linked to expected proposal follow-up commitment (`subject_type = 'proposal_follow_up_commitment'`)
- [ ] Draft belongs to correct tenant and workspace
- [ ] Draft `to_email` matches internal recipient
- [ ] Draft subject contains `[TEST ONLY]` or equivalent internal marker
- [ ] `campaign_assignment_id IS NULL`
- [ ] `superseded_at IS NULL`
- [ ] `deleted_at IS NULL`
- [ ] Draft has not been sent (no `email_sends` rows, or `getBlockingSendForDraft` returns null)
- [ ] `checkDraftSendReadiness` passes with no blocked reasons

### Approval
- [ ] Linked `approval_request` exists (`approval_request_id` on draft)
- [ ] `approval_requests.status = 'approved'`
- [ ] `decided_at` is non-null

### Sender / Provider
- [ ] Sender identity exists in staging DB — **⛔ UNCHECKED: prior finding was from production DB (`kxrplupzbsmujjznzhpy`); must re-confirm in staging/local**
- [ ] `is_verified = true` for sender identity — TBD (re-collect from non-production environment)
- [ ] Provider key is staging/non-production (NOT production key) — TBD, operator confirms
- [ ] Provider key prefix or type confirmed (without exposing value) — TBD

### Permissions
- [ ] Test user has `messaging.send_emails` permission — TBD, operator confirms in staging app
- [x] `crm.leads.edit` alone is NOT sufficient — `messaging.send_emails` is required (confirmed in action code)

### System Controls
- [ ] `EMAIL_SENDING_ENABLED` currently `false` — **⛔ UNCHECKED: prior check queried production DB; must verify in correct non-production environment**
- [ ] `CAMPAIGN_SENDING_ENABLED` currently `false` — **⛔ UNCHECKED: same reason; must verify in non-production**

### Rollback
- [ ] Rollback command documented — TBD (depends on correct non-production `verifiedScope`)
- [ ] `verifiedScope` for rollback matches enablement scope — TBD
- [ ] Rollback owner assigned — TBD

---

## H. Stop Conditions

**Any of the following must halt the process immediately. A Slice 5 prompt must not be written if any applies:**

| Condition | Action |
|-----------|--------|
| Environment is production | **Hard stop** |
| Environment is ambiguous | Stop — confirm first |
| `verifiedScope = null` without explicit blast-radius acceptance | Stop — choose tenantId scope |
| Recipient is external | **Hard stop** |
| Recipient may forward externally | **Hard stop** |
| More than one recipient | Stop |
| Draft is not `approved` | Stop |
| Draft is not linked to expected commitment | Stop |
| Tenant/workspace mismatch | Stop |
| Prior `email_sends` row exists for draft | Stop — do not retry without reconciliation |
| `resend_message_id` set on any row for draft | **Hard stop** — provider may have sent |
| `getBlockingSendForDraft` returns non-null | Stop |
| `checkDraftSendReadiness` returns blocked reasons | Stop — fix draft first |
| Sender identity missing or `is_verified = false` | Stop |
| Provider key is production or unknown | Stop |
| Test user lacks `messaging.send_emails` | Stop |
| `EMAIL_SENDING_ENABLED` is already `true` before planned test | **Hard stop** — investigate |
| `CAMPAIGN_SENDING_ENABLED` is `true` | **Hard stop** |
| Dirty git tree | Stop — clean first |
| Code/migration/config changes appear in diff | Stop |
| Automation or background job proposed | **Hard stop** |
| Any evidence field in Section D remains `TBD` | Stop — fill all fields first |

---

## I. Slice 5 Gate

**Slice 5 execution prompt cannot be written until all of the following are true:**

1. All 28 evidence fields in Section D are filled (no `TBD` remaining)
2. All readiness checklist items in Section G are `[x]`
3. This document (Slice 4) has received a **Codex review PASS**
4. Explicit operator approval is given for Slice 5 specifically

**Slice 5 must:**
- Be a separate, explicit execution prompt (not an automatic continuation of this document)
- Include rollback-first thinking at every step
- Immediately re-disable `EMAIL_SENDING_ENABLED` after the one internal test — no exceptions
- Include all 28 evidence values from this document in the prompt body
- Reference the Codex PASS on this Slice 4 document

---

## J. Final Decision

This document authorizes:
- **Evidence collection** (read-only queries, operator confirmations)
- **Checklist verification** (non-destructive checks)

This document does **not** authorize:
- Enabling `EMAIL_SENDING_ENABLED`
- Sending any emails
- Enabling campaigns
- Any production activity
- Any automation or background jobs
- Proceeding to Slice 5 without completing this evidence checklist and receiving Codex PASS

> **Completing this evidence document is not authorization to send email. Slice 5 is a separate decision that requires explicit operator approval, Codex review of this document, and all evidence fields confirmed.**

---

## K. Read-Only Evidence Collected (Slice 4A — 2026-06-04)

> **⛔ ENVIRONMENT CLASSIFICATION CORRECTION:** Slice 4A queries were run against `kxrplupzbsmujjznzhpy.supabase.co` using `npx supabase db query --linked`, which was incorrectly labeled as "remote-dev." Repo docs (`docs/ai-context/00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `deployment-flow-cleanup-design.md`) consistently identify `kxrplupzbsmujjznzhpy` as **PRODUCTION**. The staging project is `smbausuyetlgxflyhmfg`. All results below are from the **production database** and must NOT be used to authorize Slice 5. Evidence must be re-collected from staging (`smbausuyetlgxflyhmfg`) or local Docker.

**Results from production DB (informational only — cannot authorize Slice 5):**

| Check | Result (PRODUCTION — do not use for Slice 5) |
|-------|--------|
| Tenant exists | `10000000-0000-0000-0000-000000000001` "Verian Internal" |
| Workspace exists | `20000000-0000-0000-0000-000000000001` slug: `main` |
| `email_sending_enabled` system control | `value = 'false'`, global (`tenant_id = null`) |
| `campaign_sending_enabled` system control | `value = 'false'`, global (`tenant_id = null`) |
| `proposal_follow_up_commitments` count | 0 |
| `email_drafts` approved with `source_type = 'future_follow_up'` | **0** — no proposal follow-up drafts |
| Approved drafts (any type) | 1 — lead draft, `subject_type = 'lead'`, not usable for `sendFollowUpDraftAction` |
| Sender identity | `noreply@321swipe.com`, `is_verified = false`, `status = 'pending'` |

**Local Docker environment (also checked):**
- Local DB (`http://127.0.0.1:54321`) also has 0 commitments and no approved proposal follow-up drafts. Sender identity `noreply@verian.internal`, `is_verified = false`.

**Conclusion from evidence:** Both checked environments lack a valid proposal follow-up draft. Additionally, the primary evidence collection environment was production — all findings from it are invalid for Slice 5 authorization.

---

## L. Remaining TBD Items Before Slice 5

The following items must be resolved before Slice 5 can be written:

| # | Item | Required action |
|---|------|----------------|
| **0** | **⛔ Environment classification conflict** | Confirm correct non-production Supabase project: staging = `smbausuyetlgxflyhmfg`, local Docker = `http://127.0.0.1:54321`. Do NOT use `kxrplupzbsmujjznzhpy` (production). |
| A | **No proposal follow-up commitment with linked approved draft** | Create test proposal event → follow-up commitment → generate draft → approve draft in confirmed non-production environment |
| B | **No `source_type = 'future_follow_up'` approved draft** | Must exist before `sendFollowUpDraftAction` can be used |
| C | **Sender identity verification in non-production** | Verify sender domain in Resend staging account for the correct non-production environment |
| D | **`verifiedScope` decision for non-production** | Determine after environment classification is resolved; prefer per-tenant override |
| E | **Draft subject must have `[TEST ONLY]` marker** | New test draft must have `[TEST ONLY]` in subject before approval |
| F | **Draft recipient must be confirmed internal** | Must be `@321swipe.com` or confirmed operator-controlled inbox with no external forwarding |
| G | **App URL** | Operator confirms staging/local app URL (NOT `https://verian-bios.vercel.app`) |
| H | **Tenant/workspace IDs** | Re-collect from confirmed non-production environment |
| I | **Provider key environment** | Operator confirms Resend key in staging/local is non-production |
| J | **`messaging.send_emails` permission** | Operator verifies test user has this permission in staging/local |
| K | **Operator / Reviewer / Rollback owner** | People assignments required |
| L | **Planned test window** | Schedule required |
| M | **Evidence reviewer** (field 28) | Assign |

---

## M. Slice 5 Status

**STATUS: BLOCKED — evidence incomplete and environment classification unresolved**

**Critical blockers (must be resolved before Slice 5):**

1. **⛔ Environment classification conflict:** `kxrplupzbsmujjznzhpy` is PRODUCTION per repo docs (`docs/ai-context/00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `deployment-flow-cleanup-design.md`). Slice 4A queries ran against production in error. All findings from that environment are invalid for Slice 5 authorization. The correct non-production Supabase project is `smbausuyetlgxflyhmfg` (staging) or local Docker (`http://127.0.0.1:54321`). Evidence must be re-collected from a confirmed non-production environment.

2. **No proposal follow-up commitment with a linked `source_type = 'future_follow_up'` approved draft** exists in any confirmed non-production environment. `sendFollowUpDraftAction` validates `subject_type = 'proposal_follow_up_commitment'` and `source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP`. Neither staging nor local currently has a valid test object.

3. **Sender identity verification unknown** in the correct non-production environment. Prior finding was from the production DB and cannot be used.

4. **`verifiedScope` must be determined** for the correct non-production environment after blocker 1 is resolved.

**Slice 5 cannot be written until all items in Section L are resolved and a new Codex review of this updated evidence document passes.**

---

## N. Recommended Blocker Resolution Order

1. **Resolve authoritative environment classification** — confirm that `smbausuyetlgxflyhmfg` is the staging project (or confirm local Docker is the appropriate test environment)
2. **Identify the correct non-production app URL** — operator confirms staging or local dev URL (NOT `https://verian-bios.vercel.app`)
3. **Establish tenant-specific `verifiedScope`** in the correct non-production environment
4. **Verify or configure a non-production sender identity** — confirm `is_verified = true` for the sender domain in Resend staging
5. **Create and approve one internal `[TEST ONLY]` proposal follow-up commitment / `future_follow_up` draft** in the correct non-production environment with a `@321swipe.com` internal recipient
6. **Confirm `messaging.send_emails` permission holder** in staging/local
7. **Re-run Slice 4A evidence collection** against the confirmed non-production environment
8. **Submit updated evidence doc to Codex again** for a new PASS review before Slice 5
