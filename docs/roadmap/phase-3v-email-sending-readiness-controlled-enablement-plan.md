# Phase 3V — Email Sending Readiness / Controlled Enablement Plan

**Status:** Planning only — no enablement, no sending
**Created:** 2026-06-03
**Predecessor:** Phase 3U — Send Reliability Hardening (locked)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`

> **⚠️ CRITICAL: This document does NOT enable EMAIL_SENDING_ENABLED. It does NOT send emails. It does NOT touch production. It defines the checklist and sequence required before a future controlled non-production test.**

---

## 1. Purpose

Phase 3V is a readiness and controlled enablement plan for `EMAIL_SENDING_ENABLED`. It defines the checklist, controls, test scope, rollback plan, and operator decision points required before a future non-production email delivery test can be safely attempted.

**Phase 3V does NOT:**
- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Send emails
- Add campaign sending
- Add automation or background jobs
- Touch production
- Change Vercel settings
- Add UI or send controls

---

## 2. Current Locked Foundation

| Item | Status |
|------|--------|
| Phase 3T lock tag | `phase-3t-approved-send-path-v1` → `7da85008593c66b23df9f5e864ac36fe73ce4ea0` |
| Phase 3U lock tag | `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a` |
| `sendApprovedDraft` | Hardened: `getBlockingSendForDraft`, `'provider_accepted'` intermediate write, hardened catch block |
| `getBlockingSendForDraft` | Blocks: `'queued'`, `'sent'`, `'provider_accepted'`, `'failed'`+`resend_message_id IS NOT NULL` |
| `'provider_accepted'` status | Application-guarded (DB unique index still covers only `'queued'`/`'sent'`) |
| `EMAIL_SENDING_ENABLED` | **Disabled** — must remain disabled until explicit staged enablement |
| `CAMPAIGN_SENDING_ENABLED` | **Disabled** — out of scope for Phase 3V entirely |
| Send UI (`SendFollowUpDraftButton`) | Exists but shows "Email sending disabled" while flag is false |
| `sendFollowUpDraftAction` | Exists; validates proposal-follow-up context before delegating to `sendApprovedDraft` |
| Production | Untouched |
| Migrations (Phase 3T/3U) | None created; `email_sends.status` remains unconstrained string |

---

## 3. Enablement Boundaries

Phase 3V defines boundaries that must be respected in any future enablement slice:

| In scope | Out of scope |
|----------|-------------|
| `EMAIL_SENDING_ENABLED` in staging/non-production only | `CAMPAIGN_SENDING_ENABLED` — excluded entirely |
| One controlled test email to an internal recipient | Campaign sends — excluded |
| Proposal follow-up approved-send path | Background/automation sends |
| Explicit operator approval before each step | Production enablement |
| Immediate flag re-disable after test | Bulk or batch sending |
| Internal/allowlisted recipient only | Customer/prospect emails |
| | External live emails |
| | Automatic retries |
| | Live campaign workflows |

**No email should ever be sent to a customer or prospect in Phase 3V testing.**

---

## 4. Required Pre-Enable Checklist

All items in this checklist must be verified before any future enablement attempt.

### Repository / Code

- [ ] Working tree clean (`git status --short` shows nothing)
- [ ] `origin/master` is current through Phase 3U lock commit
- [ ] Phase 3U tag `phase-3u-send-reliability-hardening-v1` exists and points to correct commit
- [ ] `sendApprovedDraft` still calls `getBlockingSendForDraft` before `createEmailSend`
- [ ] `provider_accepted` intermediate write still present in `sendApprovedDraft`
- [ ] Hardened catch block still distinguishes provider-success/local-failure from clean failure
- [ ] `sendFollowUpDraftAction` still validates `subject_type`, `subject_id`, `source_type`, `campaign_assignment_id`, `superseded_at` before calling `sendApprovedDraft`
- [ ] `SendFollowUpDraftButton` still gated by `canSendEmail` (`messaging.send_emails`) AND `emailSendingEnabled`
- [ ] No new code changes that bypass these checks

### Target Environment

- [ ] Target environment confirmed as **staging / non-production only**
- [ ] Production is explicitly excluded and must not be touched
- [ ] Target environment Resend API key confirmed (not production key)
- [ ] Sender/domain verified and configured for target environment
- [ ] `EMAIL_SENDING_ENABLED` confirmed `false` in target environment before test
- [ ] `CAMPAIGN_SENDING_ENABLED` confirmed `false` (and stays `false`)

### Database / System Control

- [ ] `system_controls` row for `EMAIL_SENDING_ENABLED` (`'email_sending_enabled'`) located in target environment DB
- [ ] Current value confirmed `false`
- [ ] Update mechanism identified: `setControlValue(key, true, tenantIdOrNull)` in `modules/intelligence/repositories/system-control.repo.ts` — runtime gate uses `getBooleanControl` which reads the boolean value; use boolean `true`/`false`, not string `'true'`/`'false'`
- [ ] Tenant scope confirmed before updating: platform/global control uses `tenantId = null`; a tenant override is only used if intentionally verified and supported; wrong scope risks enabling sending for unintended tenants
- [ ] Rollback mechanism confirmed: can set value back to `false` immediately
- [ ] Audit/event capture confirmed (`SYSTEM_CONTROL_UPDATED` event type exists in `ActivityEventType`)

### Test Data

- [ ] Internal test tenant/workspace identified
- [ ] Internal test lead/contact identified (non-customer, non-prospect)
- [ ] Recipient email is internal/allowlisted (e.g., a team member's verified inbox)
- [ ] Approved draft exists in target environment with:
  - `status = 'approved'`
  - `approval_request_id` linked and approved
  - Valid `subject`, `body_html` or `body_text`
  - Valid `to_email` (internal recipient)
  - `campaign_assignment_id IS NULL`
  - `superseded_at IS NULL`
  - `deleted_at IS NULL`
  - `source_type = 'future_follow_up'` if proposal follow-up draft
- [ ] `getBlockingSendForDraft(draftId, tenantId)` returns `null` — no blocking send exists

### Permissions

- [ ] Test user has `messaging.send_emails` permission in target environment
- [ ] **`crm.leads.edit` alone is not sufficient** — `messaging.send_emails` is the required send authority
- [ ] Permission verified before enablement, not assumed

### Test Suite

- [ ] `npx vitest run tests/phase3u-send-reliability-hardening.test.ts` — passes
- [ ] `npx vitest run tests/phase3t-proposal-follow-up-send.test.ts` — passes
- [ ] Focused regression `154/154` — passes
- [ ] `npx tsc --noEmit` — no new relevant errors
- [ ] Known unrelated failures documented (e.g., TC-3K-030)

---

## 5. Controlled Enablement Sequence (Future Slice Only)

This section describes the planned future sequence. **Do not execute any step without explicit user approval.**

### Step 1 — Preflight verification

Before touching any flag:

1. Verify git state: `git status --short`, `git log --oneline`, confirm Phase 3U tag
2. Confirm target environment (staging/non-production) — **confirm production is excluded**
3. Run targeted tests — confirm all pass
4. Verify no blocking send row: `getBlockingSendForDraft(testDraftId, testTenantId)` returns `null`
5. Verify `EMAIL_SENDING_ENABLED` is currently `false`
6. Verify `CAMPAIGN_SENDING_ENABLED` is currently `false`
7. Verify internal test draft is `approved` with valid content
8. Verify internal recipient — **confirm not a customer/prospect**
9. Verify test user has `messaging.send_emails`
10. Get explicit operator approval to proceed

### Step 2 — Enable `EMAIL_SENDING_ENABLED` in staging only

**Only after Step 1 is complete and operator approves.**

```typescript
// modules/intelligence/repositories/system-control.repo.ts
// Runtime gate: getBooleanControl reads the boolean value field.
// Use setControlValue with boolean true — NOT string 'true'.
// Confirm verifiedScope before calling:
//   - null means platform/global default (affects all tenants with no override)
//   - a specific tenantId means a per-tenant override (intentional and verified only)
await setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, true, verifiedScope)

// Verify the change took effect before sending:
const enabled = await getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, verifiedTenantId)
// enabled must be true before proceeding to Step 3
```

- **Only for staging/non-production tenant**
- **Confirm `verifiedScope` (null for global, tenantId for override) before calling**
- **Never touch production env vars**
- **Never enable `CAMPAIGN_SENDING_ENABLED`**
- Record exact timestamp of enablement

### Step 3 — Send one controlled test email

Using the existing proposal follow-up approved send path:

```
sendFollowUpDraftAction({ commitmentId: testCommitmentId })
```

- One draft only
- Internal recipient only
- No campaign, no automation, no retries unless explicitly approved
- Record `sendId` and `resendMessageId` immediately

### Step 4 — Verify result

| Check | Expected outcome |
|-------|-----------------|
| `email_sends.status` | `'sent'` |
| `email_sends.resend_message_id` | Non-null provider ID |
| `email_drafts.status` | `'sent'` |
| `getBlockingSendForDraft(draftId, tenantId)` | Returns a row with `status = 'sent'` |
| `ET_SEND_INITIATED` emitted | Yes |
| `ET_SEND_SUCCEEDED` emitted | Yes |
| Recipient received email | Confirmed by internal team member |
| No duplicate `email_sends` rows | Yes |
| No unexpected `provider_accepted` state | Yes |
| No campaign/proposal/commitment mutation | Confirmed |

### Step 5 — Disable `EMAIL_SENDING_ENABLED`

**Immediately after test — no exceptions.**

```typescript
// Use same scope as the enablement call (null for global, tenantId for override).
await setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, false, verifiedScope)

// Verify disabled before considering complete:
const stillEnabled = await getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, verifiedTenantId)
// stillEnabled must be false
```

- Confirm `false` value is written and verified via `getBooleanControl`
- Verify `sendApprovedDraft` returns `sending_disabled_by_system_control` on a test call
- Record exact timestamp of re-disable

### Step 6 — Write test report

Document:
- Send ID, Draft ID, Provider Message ID
- Timestamps: enabled, sent, disabled
- Status transitions observed
- Audit events captured
- Recipient confirmation
- Any unexpected states
- Rollback confirmation (flag is `false` again)
- Issues or deviations

---

## 6. Rollback Plan

If anything goes wrong at any step:

1. **Immediately set `EMAIL_SENDING_ENABLED = false`** using `setControlValue(SystemControlKey.EMAIL_SENDING_ENABLED, false, verifiedScope)` — use the same scope (null or tenantId) as the original enablement call; use boolean `false`, not string `'false'`
2. Verify `getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, verifiedTenantId)` returns `false`
3. Do not delete `email_sends` rows — they are audit records
4. Do not manually mutate `email_drafts.status` unless a separate recovery plan exists
5. If `email_sends.status = 'provider_accepted'`: do NOT retry — inspect `resend_message_id` and Resend provider dashboard first
6. If `email_sends.status = 'failed'` with `resend_message_id` set: do NOT retry — treat as provider-confirmed and investigate
7. Document the exact state and create a follow-up recovery/reconciliation task if needed

---

## 7. Failure Scenario Handling

| Scenario | Retry allowed? | Action |
|----------|---------------|--------|
| `status = 'sent'`, email delivered | No | Success — re-disable flag |
| `status = 'sent'`, recipient did not receive | No | Investigate provider dashboard; do not retry |
| `status = 'provider_accepted'` (local finalization failed) | No | Do not retry; inspect `resend_message_id`; may have been delivered |
| `status = 'failed'` + `resend_message_id` set | No | Do not retry; provider may have sent; investigate |
| `status = 'failed'` + `resend_message_id = null` | Possibly, after review | Likely clean failure; confirm with provider before retry |
| Provider timeout / no ID returned | No blind retry | Ambiguous; stop testing; investigate before any retry |
| Blocking send row exists before test | No | Do not proceed; resolve existing row first |
| Recipient suppressed | No | Fix suppression or choose different recipient |
| Invalid sender identity | No | Fix sender identity configuration first |
| Readiness check blocked | No | Resolve all blocked reasons before proceeding |
| Permission failure | No | Fix `messaging.send_emails` grant first |
| System control read/update failure | No | Do not proceed; DB issue must be resolved |
| Unexpected `campaign_assignment_id` | No | Abort; investigate draft data integrity |
| Duplicate click / race condition | No second attempt | `getBlockingSendForDraft` should block; verify idempotency |
| UI shows "Email sending disabled" | Expected while flag off | Normal behavior |
| Provider returns error | No retry | Disable flag; investigate error |
| `email_sends` stays `'queued'` | No | `provider_accepted` write may have failed; inspect resend_message_id; do not retry |

---

## 8. Provider Timeout / No-ID Carry-Forward

Phase 3U hardened the provider-success/ID-known local-finalization failure. The provider timeout / no-ID case remains:

- If a provider connection drops before returning an ID, `email_sends.status = 'failed'` and `resend_message_id = null`
- This may be a clean provider failure (retryable) or a timeout where the provider received the request (ambiguous)
- **Do not claim "no provider ID = definitely not sent"**
- If this occurs during Phase 3V testing, **stop testing and investigate** before any retry
- Future reconciliation (Phase 3U Slice 7) is the correct path for addressing timeout ambiguity
- Phase 3V controlled testing should use a reliable, low-latency provider connection to minimize timeout risk

---

## 9. `'provider_accepted'` Carry-Forward

`'provider_accepted'` is an application-level status, not covered by the DB partial unique index:

- Current index: `email_sends_draft_active_unique WHERE status IN ('queued', 'sent')`
- `'provider_accepted'` is guarded at the application layer by `getBlockingSendForDraft`

**Phase 3V controlled testing is acceptable** without a DB migration because:
1. `EMAIL_SENDING_ENABLED` is normally `false` — accidental concurrent sends are not possible
2. Test volume is one email in a controlled environment
3. `getBlockingSendForDraft` provides sufficient application-layer protection for controlled testing

**Before broader enablement or higher-volume testing**, consider a DB-level index migration:

```sql
-- Future option A: extend existing index
CREATE UNIQUE INDEX email_sends_draft_active_v2_unique
  ON email_sends (draft_id)
  WHERE status IN ('queued', 'sent', 'provider_accepted');

-- Future option B: provider-known sends (covers ALL rows with a provider ID,
--   including status = 'sent', 'provider_accepted', AND 'failed' + resend_message_id IS NOT NULL)
CREATE UNIQUE INDEX email_sends_draft_provider_known_unique
  ON email_sends (draft_id)
  WHERE resend_message_id IS NOT NULL;
```

This migration must be separately designed, reviewed, and approved before any higher-volume send path.

---

## 10. Non-Production Test Data Requirements

The ideal Phase 3V test object:

| Field | Required value |
|-------|---------------|
| Tenant/workspace | Staging/non-production only |
| Lead | Internal test lead — not a real customer or prospect |
| Contact | Internal team member's email |
| Draft status | `'approved'` |
| `approval_request_id` | Linked and approved |
| `subject` | Clearly marked test (e.g., `[TEST ONLY] ...`) |
| `body_html` or `body_text` | Non-empty; clearly marked test |
| `to_email` | Internal/allowlisted only |
| `campaign_assignment_id` | `NULL` |
| `superseded_at` | `NULL` |
| `deleted_at` | `NULL` |
| `source_type` | `'future_follow_up'` if proposal follow-up draft |
| Existing `email_sends` for draft | None — `getBlockingSendForDraft` returns `null` |
| Commitment status (if applicable) | `'open'` — no auto-mutation expected |
| Commitment `draft_id` | Points to the approved test draft |

---

## 11. Observability and Audit

During and after the test, verify:

| Observable | Expected |
|------------|---------|
| `email_sends` row | Created with `status = 'sent'` and `resend_message_id` set |
| `email_drafts.status` | Transitions to `'sent'` |
| `email_drafts.sent_at` | Set |
| `approval_requests.status` | Stays `'approved'` (not mutated by send) |
| `ET_SEND_INITIATED` event | Emitted before provider call |
| `ET_SEND_SUCCEEDED` event | Emitted after successful finalization |
| `resend_message_id` | Non-null, matches Resend provider dashboard |
| Resend provider dashboard | Shows one delivered email with matching ID |
| `campaign_email_sends` | No row created |
| Background jobs / Inngest | No jobs scheduled |
| Commitment status | Unchanged — `'open'`; **no auto-complete** |
| Proposal status | Unchanged |
| System control audit | `SYSTEM_CONTROL_UPDATED` event if available |

---

## 12. Security and Compliance

- Internal recipients only — no customers/prospects
- No sensitive data in test draft content
- Test subject/body clearly identified as test
- `EMAIL_SENDING_ENABLED` stays off by default; enable only in narrow test window
- Least privilege: only the tester needs `messaging.send_emails` for the test
- Document: who approved the test, exact time window, what was sent, recipient
- No campaign blasts, no bulk operations, no external automations
- Immediate flag re-disable after test — no exceptions

---

## 13. Acceptance Criteria for Phase 3V Plan

This planning document is accepted if:

- [x] Documentation only — no code, no migration, no tag, no sending
- [x] Does not enable `EMAIL_SENDING_ENABLED`
- [x] Does not enable `CAMPAIGN_SENDING_ENABLED`
- [x] Does not send emails
- [x] Does not touch production
- [x] Preserves Phase 3T and Phase 3U lock guarantees
- [x] Defines controlled staging-only enablement path
- [x] Defines explicit rollback plan
- [x] Defines failure handling for all key scenarios
- [x] Defines observability requirements
- [x] No-campaign boundary explicitly stated
- [x] `CAMPAIGN_SENDING_ENABLED` remains disabled throughout

---

## 14. Recommended Slice Breakdown

| Slice | Description | Prerequisite |
|-------|-------------|-------------|
| **3V Slice 1** | This planning document | Documentation only |
| **3V Slice 2** | Controlled enablement preflight checklist / readiness review | Codex review of this plan |
| **3V Slice 3** | Staging one-email test plan (prepare test data, verify controls) | Slice 2 complete |
| **3V Slice 4** | Staging `EMAIL_SENDING_ENABLED` enablement and one-email test | **Explicit user approval required**; Slice 3 complete; all checklist items green |
| **3V Slice 5** | Staging send test report / lock | After Slice 4 test and flag re-disable |
| **Future** | Provider timeout/no-ID reconciliation | Separate phase; lower priority |
| **Future** | DB index hardening for `'provider_accepted'` / provider-known sends | Separate migration design; needed before higher-volume sends |
| **Future** | Production readiness plan | Separate phase; after staging validated |

---

## 15. Explicit Warnings

> **Do not enable `EMAIL_SENDING_ENABLED` from this plan.**
>
> **Do not enable `CAMPAIGN_SENDING_ENABLED`.**
>
> **Do not send emails.**
>
> **Do not test in production.**
>
> **Do not send to customers or prospects.**
>
> **Do not retry ambiguous provider outcomes without reconciliation.**
>
> Any future enablement requires a separate explicit step with operator approval, an identified staging environment, an internal allowlisted recipient, and this checklist fully verified. There is no shortcut.
