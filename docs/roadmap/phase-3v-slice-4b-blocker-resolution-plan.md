# Phase 3V Slice 4B — Blocker Resolution Plan

**Status:** Planning only — no execution, no sending, no flag changes
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4A — [Blocked Evidence Update](phase-3v-slice-4-internal-send-target-evidence.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`

> **⚠️ Slice 4B defines the blocker-resolution path only. It does NOT resolve blockers, execute changes, enable flags, send emails, or authorize Slice 5. All execution requires a separate explicitly approved step after this plan receives Codex PASS.**

---

## A. Purpose

Phase 3V Slice 4B documents the safe path to resolve the blockers identified during Slice 4A evidence collection. Slice 4A found that Slice 5 is blocked due to an environment classification error and multiple missing evidence items.

**Slice 4B is planning only.** It does not authorize:
- Environment changes
- Sender/provider configuration changes
- System control modifications
- Draft creation or approval
- Email sending or flag enablement
- Slice 5 execution

After Slice 4B receives Codex PASS, the operator may begin resolving blockers in the order defined in Section E — starting with environment classification — before running another evidence collection pass.

---

## B. Current Blocked State

| Item | Status |
|------|--------|
| Slice 5 | **BLOCKED — evidence incomplete and environment classification unresolved** |
| `kxrplupzbsmujjznzhpy` | Production-referenced / invalid for Slice 5 non-production evidence |
| `smbausuyetlgxflyhmfg` | Staging candidate — not yet confirmed as correct non-production target |
| Proposal follow-up commitment / `future_follow_up` draft | None confirmed in any non-production environment |
| Sender identity verification | Unknown in correct non-production environment |
| `verifiedScope` | TBD — tenant-specific scope preferred but not established |
| Provider key environment | TBD |
| `messaging.send_emails` permission holder | TBD |
| Internal recipient | TBD |
| Operator / reviewer / rollback owner / test window / evidence reviewer | TBD |
| `EMAIL_SENDING_ENABLED` | Disabled ✓ |
| `CAMPAIGN_SENDING_ENABLED` | Disabled ✓ |

---

## C. Non-Goals

Slice 4B does NOT:

- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Send emails
- Click send buttons
- Touch production
- Change Vercel settings
- Modify Supabase config
- Modify provider or sender configuration
- Modify system controls
- Create or approve drafts
- Create migrations
- Modify code
- Add automation or background jobs
- Proceed to Slice 5

---

## D. Blocker Inventory

| # | Blocker | Risk | Required resolution evidence | Safe resolution method | Code changes? | Must complete before Slice 5? |
|---|---------|------|------------------------------|------------------------|---------------|-------------------------------|
| 1 | Environment classification unresolved | May target production | Operator confirmation of which project is non-production | Inspect repo docs; operator confirmation | No | Yes |
| 2 | Correct non-production app URL and Supabase project ref not confirmed | May use production app | Operator confirms staging/local URL and project ref | Inspect repo docs; confirm Supabase project URL | No | Yes |
| 3 | Prior evidence from `kxrplupzbsmujjznzhpy` invalid | Evidence from wrong (production) environment | All evidence must be re-collected from confirmed non-production | Re-run Slice 4A against `smbausuyetlgxflyhmfg` or local Docker | No | Yes |
| 4 | Tenant/workspace IDs from wrong environment | IDs may differ in correct environment | Re-query from confirmed non-production environment | Read-only SQL against correct environment | No | Yes |
| 5 | `verifiedScope` TBD and possibly global | Global scope affects all tenants; blast-radius risk | Confirm if per-tenant override exists or can be created | Operator decision; prefer per-tenant override | No | Yes |
| 6 | No usable `future_follow_up` approved draft with commitment | `sendFollowUpDraftAction` will fail without one | Confirmed commitment/draft/approval in non-production | Create/approve test object in staging (separate approved step) | No | Yes |
| 7 | Existing approved lead draft is not usable | `subject_type = 'lead'`; fails context validation | N/A — not eligible; need new proposal follow-up draft | Create new test follow-up draft (separate approved step) | No | Yes |
| 8 | Internal recipient email TBD | May use external/customer email | Operator identifies `@321swipe.com` controlled inbox | Operator confirmation; no external forwarding | No | Yes |
| 9 | Sender identity verification unknown in correct environment | `sendApprovedDraft` fails if `is_verified = false` | Confirm `is_verified = true` in non-production environment | Read-only SQL check; provider dashboard verification if needed | No | Yes |
| 10 | Provider key environment TBD | May use production key | Confirm key prefix/type is non-production | Operator checks env var without exposing value | No | Yes |
| 11 | `messaging.send_emails` permission holder TBD | Operator may lack required permission | Confirm in staging/local app | App permission check or read-only DB inspection | No | Yes |
| 12 | Operator/reviewer/rollback owner/test window/evidence reviewer TBD | No accountable parties | Assign named individuals | Manual assignment | No | Yes |

---

## E. Required Resolution Order

The following sequence must be followed. No step may be skipped. Each step must be completed before the next begins.

```
1.  Resolve authoritative environment classification
    — confirm kxrplupzbsmujjznzhpy = production
    — confirm smbausuyetlgxflyhmfg = staging, OR confirm local Docker is correct target

2.  Identify the correct non-production app URL and Supabase project ref
    — NOT https://verian-bios.vercel.app (production)
    — staging app URL or local Docker URL only

3.  Re-collect tenant/workspace IDs from the confirmed non-production environment
    — read-only SQL or app UI only
    — do NOT use values from production DB

4.  Establish tenant-specific verifiedScope if available
    — check if system_controls table in non-production supports per-tenant override
    — prefer tenantId over null/global

5.  Verify non-production sender identity
    — is_verified = true in the correct environment
    — if not, document required verification work as a separate operator-approved step

6.  Confirm provider key environment without exposing secrets
    — operator checks env var prefix or Resend dashboard project
    — records "staging/non-production key confirmed" without value

7.  Identify internal 321 Swipe-controlled recipient
    — must be @321swipe.com or equivalent
    — operator confirms no external forwarding
    — one recipient only

8.  Create or identify one internal [TEST ONLY] proposal follow-up commitment
    and linked future_follow_up approved draft in the correct non-production environment
    — requires a separate explicitly approved step, not inside Slice 4B
    — subject must contain [TEST ONLY]
    — draft subject_type = 'proposal_follow_up_commitment'
    — draft source_type = 'future_follow_up'
    — draft status = 'approved'
    — approval_request status = 'approved'
    — campaign_assignment_id = null
    — superseded_at = null / deleted_at = null

9.  Confirm no prior send rows or blocking send state
    — getBlockingSendForDraft must return null for the test draft

10. Confirm messaging.send_emails permission holder
    — test user has this permission in staging/local

11. Assign operator, reviewer, rollback owner, evidence reviewer, and test window

12. Re-run Slice 4A evidence collection
    — all queries against confirmed non-production environment only

13. Submit updated evidence document to Codex
    — Codex must review updated evidence doc and return PASS

14. Only after Codex PASS on updated evidence and explicit operator approval
    may a Slice 5 execution prompt be considered
```

---

## F. Environment Classification Plan

### How to resolve safely

1. **Inspect repo docs** for known project refs. Confirmed from prior review:
   - `kxrplupzbsmujjznzhpy` = production (`https://verian-bios.vercel.app`) per `docs/ai-context/00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, and `deployment-flow-cleanup-design.md`
   - `smbausuyetlgxflyhmfg` = staging candidate (appears in migration records as "staging" alongside production; not independently verified as a safe non-production target for Slice 5)

2. **Operator confirms** which Supabase project is the correct staging/non-production target and is safe for internal test data

3. **Operator confirms** the staging app URL (not `https://verian-bios.vercel.app`)

4. **Verify** the `supabase link` CLI configuration points to the intended non-production project before running any `--linked` queries. Do not rely on linked project without checking its project ref explicitly:
   ```bash
   # Read project ref from .supabase/config.toml or similar
   # Confirm it matches the intended staging project
   cat .supabase/config.toml | grep "project_id"
   ```

5. **Treat any ambiguity as hard stop** — if the project ref cannot be confirmed as non-production, do not proceed with evidence collection

6. **Local Docker** (`http://127.0.0.1:54321`) is always non-production but currently has no usable test data. If used, all test data (proposal event, commitment, draft, approval) must be created in local DB.

---

## G. Sender / Provider Resolution Plan

| Requirement | How to verify safely |
|-------------|---------------------|
| Sender identity exists in non-production | Read-only SQL: `SELECT id, email, is_verified, status FROM sender_identities WHERE tenant_id = '<non_prod_tenant_id>'` |
| `is_verified = true` | From above query result |
| If `is_verified = false` | Verify the sender domain in Resend staging account — this is a provider dashboard action requiring a **separate explicit operator-approved step**, not inside Slice 4B |
| Provider key is staging/non-production | Operator checks env var prefix (e.g., confirms `re_test_...` or staging project key) **without revealing the value** — records "staging/non-production key confirmed" |
| Production provider key not used | Explicit operator confirmation |
| No bulk/campaign provider path | Not applicable to this single-send path |

**If sender is not verified, Slice 5 remains blocked.** Sender domain verification requires a provider dashboard action that must be handled as a separate explicitly approved operator step before the next evidence collection pass.

---

## H. Internal Draft / Commitment Resolution Plan

The future Slice 5 test requires exactly this test object in the correct non-production environment:

| Field | Required value |
|-------|---------------|
| `proposal_follow_up_commitments.commitment_status` | `'open'` |
| `proposal_follow_up_commitments.draft_id` | Non-null, points to test draft |
| `email_drafts.subject_type` | `'proposal_follow_up_commitment'` |
| `email_drafts.source_type` | `'future_follow_up'` |
| `email_drafts.status` | `'approved'` |
| `email_drafts.subject` | Contains `[TEST ONLY]` |
| `email_drafts.to_email` | Internal `@321swipe.com` recipient |
| `email_drafts.campaign_assignment_id` | `NULL` |
| `email_drafts.superseded_at` | `NULL` |
| `email_drafts.deleted_at` | `NULL` |
| `approval_requests.status` | `'approved'` |
| `approval_requests.decided_at` | Non-null |
| `email_sends` rows for draft | None (`getBlockingSendForDraft` returns `null`) |

**Slice 4B does not create or approve this draft.** If no such draft exists in the correct non-production environment, it must be created and approved through a **separate explicitly approved operator workflow** — using the existing Phase 3S `generateFollowUpDraftAction` path and Phase 3B HRB approval bridge in the staging/local environment. That workflow is a distinct step, not part of this planning document.

---

## I. Tenant-Specific `verifiedScope` Plan

| Requirement | Detail |
|-------------|--------|
| Prefer tenant-specific scope | Creates a per-tenant `system_controls` override row rather than modifying the global/null row |
| Global/null scope | Hard stop unless the operator explicitly accepts the blast-radius impact (affects all tenants) |
| Enable and rollback must use the same scope | If per-tenant override is used, both `setControlValue(EMAIL_SENDING_ENABLED, true, tenantId)` and `setControlValue(EMAIL_SENDING_ENABLED, false, tenantId)` use the same `tenantId` |
| Verify effective value | `getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, tenantId)` must confirm the expected value after each write |
| Slice 4B does not modify system controls | Creating a per-tenant override is a separate operator-approved step in a future slice |

---

## J. Evidence Recollection Requirements

After all blockers in Section D are resolved, Slice 4A evidence must be recollected from the confirmed non-production environment. The updated evidence collection must cover all 28 fields in the Slice 4 evidence document (Section D), including:

- Environment name, type, project ref, app URL
- Tenant ID, workspace ID, workspace slug
- `verifiedScope` and blast radius
- Internal recipient (confirmed `@321swipe.com`)
- Commitment ID
- Draft ID, status, subject (with `[TEST ONLY]`)
- `approval_request_id` and approval status
- Sender identity ID, email, domain, `is_verified` status
- Provider key environment (safe confirmation only)
- `messaging.send_emails` permission holder
- Operator, reviewer, rollback owner, test window, evidence reviewer
- System controls current `false` values (from non-production)
- Blocking-send check result (`null`)
- Readiness check result (`ready: true`)

---

## K. Stop Conditions

**Any of the following must immediately halt the blocker-resolution process:**

| Condition | Action |
|-----------|--------|
| Environment is production | **Hard stop** |
| Environment classification is ambiguous | Stop — confirm first |
| `supabase link` points to production project | **Hard stop** — relink to correct non-production project |
| Production app URL involved | **Hard stop** |
| Recipient is external or forwards externally | **Hard stop** |
| More than one recipient | Stop |
| No valid `proposal_follow_up_commitment` / `future_follow_up` approved draft | Stop — must be created first (separate approved step) |
| Sender identity missing or `is_verified = false` | Stop — sender verification required first |
| Provider key is production or unknown | Stop |
| `verifiedScope = null` without explicit blast-radius acceptance | Stop — establish per-tenant override |
| `EMAIL_SENDING_ENABLED` is already `true` | **Hard stop** — investigate before proceeding |
| `CAMPAIGN_SENDING_ENABLED` is `true` | **Hard stop** |
| Prior `email_sends` row exists for test draft | Stop — reconcile before proceeding |
| `resend_message_id` set on any row for test draft | **Hard stop** |
| `getBlockingSendForDraft` returns non-null | Stop |
| `checkDraftSendReadiness` fails | Stop — fix draft first |
| Permission holder lacks `messaging.send_emails` | Stop |
| Dirty git tree | Stop |
| Code/migration/config/provider/system-control changes appear unexpectedly | Stop — investigate |
| Automation or background jobs proposed | **Hard stop** |
| Any evidence field remains `TBD` in Slice 4 evidence doc | Stop — fill all fields first |

---

## L. Required Codex Review

1. **Codex must review this Slice 4B blocker resolution plan** before any blocker-resolution work proceeds. Codex PASS on Slice 4B is required before the operator begins the resolution sequence in Section E.

2. **Codex must also review the updated Slice 4 evidence document** after all blockers are resolved and evidence is re-collected from the correct non-production environment.

3. **Codex PASS on Slice 4B does NOT authorize Slice 5** — it only authorizes beginning the blocker-resolution sequence.

4. **Codex PASS on Slice 4B does NOT authorize sending** — no email may be sent as part of blocker resolution.

---

## M. Final Decision

- Slice 4B authorizes **planning only**
- Slice 4B does NOT authorize execution of any blocker resolution
- Slice 5 **remains blocked**
- After Codex PASS on this plan, the next step is a **separate operator-approved blocker-resolution workflow** beginning with environment classification (Section E, step 1)
- Slice 5 cannot be written until:
  1. All blockers in Section D are resolved
  2. Slice 4 evidence document is updated with re-collected non-production values
  3. Updated evidence document receives Codex PASS
  4. Explicit operator approval is given for Slice 5 specifically

> **Resolving blockers is not authorization to send email. Slice 5 requires its own explicit prompt with all evidence confirmed.**
