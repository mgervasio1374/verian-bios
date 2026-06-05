# Phase 3V Slice 4I-B — Operator Confirmation Update Report

**Status:** Major progress — 8 of 12 items confirmed; 4 remain; Slice 4J NOT READY yet
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4I-A — [Operator Confirmation Resolution Report](phase-3v-slice-4i-a-operator-confirmation-resolution-report.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`
**origin/master at report time:** `ea505a3fa469397de7ff2effa535d65cbe3e57f1`

> **⚠️ Slice 4I-B records new operator confirmations and read-only staging inspection. No writes, provider/sender config changes, system-control changes, draft creation, approval, flag enablement, or sending occurred. Slice 4J is NOT READY. Slice 5 remains BLOCKED.**

---

## A. Purpose

Slice 4I-B records new operator confirmations supplied during this workflow and the results of SELECT-only staging inspection. It does not perform DB writes, provider/sender changes, system-control changes, draft creation, approval, flag enablement, sending, Slice 4J, or Slice 5.

---

## B. Baseline

| Item | Value |
|------|-------|
| HEAD | `ea505a3` Docs: add Phase 3V Slice 4I-A operator confirmation resolution report |
| Staging ref | `smbausuyetlgxflyhmfg` |
| Production ref | `kxrplupzbsmujjznzhpy` — not used |
| Slice 4J | NOT READY — remaining blockers (see Section E) |
| Slice 5 | **BLOCKED** |

---

## C. Newly Confirmed Operator Items

The following items are now CONFIRMED from operator input in this slice:

| # | Item | Status | Confirmed value |
|---|------|--------|-----------------|
| 1 | Resend domain | ✓ CONFIRMED | `321swipe.com` is verified in Resend |
| 2 | Provider key | ✓ CONFIRMED | Verian BIOS staging Resend API key complete/non-production — full key not exposed |
| 3 | Sender address decision | ✓ CONFIRMED | Use `noreply@321swipe.com` for the controlled test (**note:** see Section E — this identity does not yet exist in staging DB) |
| 4 | Internal recipient | ✓ CONFIRMED | `mgervasio@321swipe.com` |
| 5 | No external forwarding | ✓ CONFIRMED | `mgervasio@321swipe.com` does not forward externally |
| 6 | Test operator | ✓ CONFIRMED | Michael Gervasio — staging login `staging@verian.internal` |
| 7 | Follow-Up Queue access | ✓ CONFIRMED | `staging@verian.internal` can access `https://verian-bios-staging.vercel.app/main/proposal-follow-ups`; queue showed 0 commitments |
| 8 | `verifiedScope` decision | ✓ CONFIRMED | Create tenant-specific `email_sending_enabled = false` override for tenant `10000000-0000-0000-0000-000000000001` before any send test — **separate approved DB write required; not done in this slice** |
| 9 | Reviewer | ✓ CONFIRMED | Michael Gervasio |
| 10 | Rollback owner | ✓ CONFIRMED | Michael Gervasio |
| 11 | Evidence reviewer | ✓ CONFIRMED | Michael Gervasio |
| 12 | Operator (Slice 5 executor) | ✓ CONFIRMED | Michael Gervasio |

---

## D. Read-Only Staging Inspection Results

**CLI project-ref:** `smbausuyetlgxflyhmfg` ✓ (relinked from production; staging confirmed)

### Sender Identities

| ID | Email | Name | `is_default` | `is_verified` | Status | Tenant |
|----|-------|------|-------------|--------------|--------|--------|
| `e57848e7-...` | `noreply@verian.internal` | Verian Internal | `true` | **`false`** | `pending` | `10000000-...-0001` |

**`noreply@321swipe.com` does NOT exist** in staging `sender_identities`. The selected sender address must be created or the existing identity must be updated to use the `321swipe.com` domain — **separate approved DB write required.**

### System Controls / `verifiedScope`

| Key | Value | `is_enabled` | `tenant_id` |
|-----|-------|-------------|-------------|
| `email_sending_enabled` | `false` | `true` | `null` (global) |
| `campaign_sending_enabled` | `false` | `true` | `null` (global) |

**No tenant-specific `email_sending_enabled` override exists.** Operator-confirmed decision is to create one for tenant `10000000-...-0001` before any send test — **separate approved DB write required.**

### Send Counts

| Metric | Value |
|--------|-------|
| `email_sends` | 2 (unchanged) |
| `campaign_email_sends` | 0 |

### Test Object Counts

| Metric | Value |
|--------|-------|
| `proposal_follow_up_commitments` | 0 |
| `future_follow_up` drafts | 0 |
| `proposal_follow_up_commitment` subject_type drafts | 0 |
| Approved drafts (total) | 2 (non-follow-up) |

### Permission Inspection — `messaging.send_emails` for `staging@verian.internal`

Schema found: `permissions.slug` column exists. SELECT-only query confirmed:

| User email | User ID | Role | `messaging.send_emails` |
|-----------|---------|------|------------------------|
| `staging@verian.internal` | `a76d71ca-fe31-4314-8698-212714919d28` | Platform Admin | ✓ **CONFIRMED** |

**`messaging.send_emails` is confirmed for `staging@verian.internal`** via Platform Admin role in staging. ✓

---

## E. Remaining Blockers

| # | Blocker | Required action | Blocks Slice 4J? | Blocks Slice 5? |
|---|---------|----------------|------------------|-----------------|
| 1 | `noreply@321swipe.com` sender identity does not exist in staging | Create `noreply@321swipe.com` sender identity row in staging `sender_identities` with `is_verified = true` — separate approved DB write | Yes | Yes |
| 2 | Tenant-specific `email_sending_enabled` override not created | Insert `system_controls` row with `key = 'email_sending_enabled'`, `value = 'false'`, `tenant_id = '10000000-...-0001'` — separate approved DB write | Yes (preferred before Slice 4J) | Yes |
| 3 | Test window TBD | Operator assigns exact start/end time for the one-email test | No | Yes |
| 4 | No `proposal_follow_up_commitment` test row | Create via Phase 3S `generateFollowUpDraftAction` path in staging (Slice 4J) | — | Yes |
| 5 | No `future_follow_up` approved draft | Create after commitment exists (Slice 4J) | — | Yes |
| 6 | No linked `approval_request` | Route through HRB approval bridge (Slice 4J) | — | Yes |
| 7 | Candidate-specific readiness/blocking-send checks pending | Run after test object exists (Slice 4K) | — | Yes |
| 8 | Final evidence recollection | Re-run after all blockers resolved (Slice 4K) | — | Yes |

---

## F. Updated Confirmation Status Summary

| Confirmation | Previous status | Current status |
|---|---|---|
| Provider key environment | TBD/BLOCKED | ✓ CONFIRMED |
| Sender/domain (321swipe.com verified) | BLOCKED | ✓ CONFIRMED (domain) — sender identity DB row still needed |
| Exact internal recipient (`mgervasio@321swipe.com`) | TBD/BLOCKED | ✓ CONFIRMED |
| No external forwarding | TBD/BLOCKED | ✓ CONFIRMED |
| `messaging.send_emails` holder | TBD/BLOCKED | ✓ CONFIRMED (`staging@verian.internal`, User ID `a76d71ca-...`) |
| `verifiedScope` decision | BLOCKED | ✓ Decision CONFIRMED — per-tenant override needed (DB write still required) |
| Operator | TBD | ✓ CONFIRMED (Michael Gervasio) |
| Reviewer | TBD | ✓ CONFIRMED (Michael Gervasio) |
| Rollback owner | TBD | ✓ CONFIRMED (Michael Gervasio) |
| Evidence reviewer | TBD | ✓ CONFIRMED (Michael Gervasio) |
| Test window | TBD | Still TBD — operator assigns after sender + override are in place |
| Sender identity DB row (`noreply@321swipe.com`) | — | **BLOCKED** — row does not exist in staging; requires separate approved DB write |
| Tenant-specific `verifiedScope` override | BLOCKED | **BLOCKED** — row does not exist in staging; requires separate approved DB write |
| Blast-radius owner | TBD/conditional | Not needed — per-tenant override chosen; global/null not accepted |

---

## G. Slice 4J Readiness Decision

**NOT READY FOR SLICE 4J — 2 operational blockers remain before test-object creation.**

The two blocking DB writes that must happen before Slice 4J:

1. **Create `noreply@321swipe.com` sender identity** in staging with `is_verified = true` — separate approved DB write
2. **Create tenant-specific `email_sending_enabled = false` override** for tenant `10000000-...-0001` — separate approved DB write

Once both DB writes are complete, the remaining items (test window) are non-blocking for Slice 4J itself, and Slice 4J (test commitment/draft/approval creation) can be planned.

---

## H. Required Next Step

Two DB writes are needed before Slice 4J:

1. **Sender identity creation/update workflow:** Create `noreply@321swipe.com` sender identity in staging `sender_identities` with `is_default = true`, `is_verified = true`, `status = active` (or verified equivalent). This requires an explicitly approved DB insert in staging only. NOT production.

2. **Tenant-specific system-control override:** Insert `system_controls` row with `key = 'email_sending_enabled'`, `value = 'false'`, `tenant_id = '10000000-0000-0000-0000-000000000001'` in staging only. NOT production. This establishes per-tenant scope and removes the blast-radius concern.

After both DB writes are complete:
- Assign test window
- Plan Slice 4J (test commitment/draft/approval creation)

---

## I. Final Decision

- No writes occurred ✓
- No flags were enabled ✓
- No emails were sent ✓
- No send buttons were clicked ✓
- **8 of 12 confirmation items now CONFIRMED**
- **Slice 4J is NOT READY** — 2 DB writes still required (sender identity + tenant-specific override)
- **Slice 5 remains BLOCKED**
