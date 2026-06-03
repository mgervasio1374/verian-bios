# Phase 3U — Send Reliability Hardening Design

**Status:** Design only — no implementation started
**Created:** 2026-06-02
**Predecessor:** Phase 3T — Approved Send Path (locked)
**Phase 3T lock tag:** `phase-3t-approved-send-path-v1` → `7da85008593c66b23df9f5e864ac36fe73ce4ea0`

---

## 1. Purpose

Phase 3U designs reliability hardening for `sendApprovedDraft` before `EMAIL_SENDING_ENABLED` can be turned on in any environment. Without this hardening, a race between a successful provider call and a failing local database update creates an irrecoverable ambiguous state.

**Phase 3U is:**
- Hardening the existing send path against provider-success/local-update failure
- Ensuring `resend_message_id` is never lost after provider confirmation
- Blocking duplicate provider calls for sends with a known provider ID
- A prerequisite for enabling `EMAIL_SENDING_ENABLED`

**Phase 3U is NOT:**
- Enabling email sending (that remains a separate operator decision)
- Adding campaign sending
- Changing `CAMPAIGN_SENDING_ENABLED`
- Adding background automation (documented as a future option only)
- Adding new UI
- Changing proposal/commitment workflow behavior
- Changing approval rules
- Adding LLM generation

**This document is design only. It creates no code, no migrations, and no tags.**

---

## 2. Current Locked Foundation

| Item | Status |
|------|--------|
| Phase 3T lock tag | `phase-3t-approved-send-path-v1` confirmed |
| `sendApprovedDraft` | Exists — creates `email_sends`, calls provider, updates statuses |
| `EMAIL_SENDING_ENABLED` | **Disabled** — must remain disabled until Phase 3U hardening is implemented and verified |
| `sendFollowUpDraftAction` | Exists — proposal-follow-up wrapper with context validation |
| `email_sends` table | Exists — has `resend_message_id`, `status`, `metadata`, `failure_reason` columns |
| `updateEmailSend` | Exists — supports independent field updates including `resendMessageId` |

---

## 3. Problem Statement

### Exact failure mode (confirmed by code review)

The current `sendApprovedDraft` flow:

```
1. CREATE email_sends (status = 'queued')           ← before provider call
2. Call Resend provider
3. resendMessageId = resendData.id                  ← provider success, id captured
4. await Promise.all([
     updateEmailSend({status:'sent', resendMessageId, sentAt, metadata}),
     updateDraftStatus({status:'sent', sentAt}),
   ])                                               ← RISK POINT
5. return { ok: true, sendId, resendMessageId }
```

If `Promise.all` at step 4 throws:

```
catch (err):
  updateEmailSend({status:'failed', errorMessage, failureReason, metadata})
  ← resendMessageId NOT included → NOT persisted
  ← email_sends.status = 'failed', resend_message_id = null
  ← email_drafts stays 'approved'
  return { ok: false, reason: <DB error> }
```

### Consequences

| Consequence | Impact |
|-------------|--------|
| `resend_message_id` is `null` in DB | Cannot determine from DB alone whether email was delivered |
| `email_sends.status = 'failed'` | Operator/UI sees failure, may assume email was not sent |
| `email_drafts.status = 'approved'` | Duplicate-send idempotency guard `email_sends_draft_active_unique` may not block a retry (status `'failed'` is not in the index's `WHERE` clause) |
| No provider-confirmed status | Cannot safely retry; cannot safely not retry |

### Current `email_sends_draft_active_unique` index

The idempotency index guards on `status IN ('queued', 'sent')`. A `'failed'` record — even with a `resend_message_id` — does **not** block a new send attempt. This is correct for clean failures (provider not reached), but **unsafe** for provider-success/local-failure cases.

---

## 4. Design Goals

1. **Preserve `resend_message_id` as soon as it is known** — before any risky local update
2. **Create a distinguishable state for provider-success/local-update failure** — so it cannot be treated as an ordinary clean failure
3. **Block duplicate provider calls when `resend_message_id` is already set** — regardless of `status`
4. **Keep the fix small** — no broad changes to campaign sending or other send paths unless unavoidable
5. **No migration required** — `email_sends.status` is an unconstrained `string` column; `resend_message_id` already exists
6. **Preserve all existing gates** — `EMAIL_SENDING_ENABLED`, approval/readiness gates, duplicate-send index all remain

---

## 5. Non-Goals

- Do not enable `EMAIL_SENDING_ENABLED`
- Do not send real emails
- Do not add campaign sending
- Do not change `CAMPAIGN_SENDING_ENABLED`
- Do not add new UI
- Do not add background reconciliation jobs (documented as future option only)
- Do not mutate proposal or commitment status
- Do not change approval rules
- Do not add LLM generation

---

## 6. Current Code Analysis

### `email_sends` table columns (from `types/database.ts`)

| Column | Type | Role |
|--------|------|------|
| `id` | `uuid` | Row identifier |
| `tenant_id`, `workspace_id` | `uuid` | Scope |
| `draft_id` | `uuid` | FK → `email_drafts` |
| `status` | `string` | **Unconstrained text** — no DB enum constraint (confirmed) |
| `resend_message_id` | `string | null` | Provider message ID |
| `sent_at` | `string | null` | Timestamp of confirmed send |
| `error_message` | `string | null` | Failure message |
| `failure_reason` | `string | null` | Structured failure code (Phase 3H) |
| `metadata` | `jsonb` | Rich audit/provenance data |
| `triggered_by` | `string | null` | Actor user ID |

**Key finding:** `status` is `string` in both TypeScript types and the database schema. No enum constraint exists. New status values can be introduced **without a migration**.

### `updateEmailSend` in `email-send.repo.ts`

Accepts an `UpdateEmailSendInput` object where all fields are optional. Only fields explicitly set are written:

```typescript
interface UpdateEmailSendInput {
  status?: string
  resendMessageId?: string | null   // ← can be written independently
  sentAt?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
  failureReason?: string | null
}
```

**Key finding:** `resendMessageId` can be persisted in a standalone call without touching `status` or other fields. This is the core mechanism for the hardening fix.

### Current `sendApprovedDraft` success path (lines 252–264)

```typescript
resendMessageId = resendData.id  // ← captured here
await Promise.all([
  emailSendRepo.updateEmailSend(emailSend.id, {
    status: 'sent', sentAt: now, resendMessageId, metadata: {...},
  }),
  emailDraftRepo.updateDraftStatus(draftId, {
    status: 'sent', sentAt: now, ifCurrentStatus: 'approved',
  }),
])
```

### Current catch block (lines 306–317)

```typescript
await emailSendRepo.updateEmailSend(emailSend.id, {
  status: 'failed',
  errorMessage,
  failureReason: errorMessage,
  metadata: { ...sendMetadata, error: errorMessage },
})
// ← resendMessageId is NOT included here → NOT written to DB
```

---

## 7. Recommended Hardening Approach

### Chosen option: Option 1 — Persist provider ID before `Promise.all`, no migration

This is the minimal-risk, minimal-scope fix. It does not require a schema change, a new status, or a background job.

### Core change to `sendApprovedDraft` success path

**Step added between provider call and `Promise.all`:**

```typescript
resendMessageId = resendData.id   // ← provider success, id captured

// NEW: persist provider ID immediately, before any risky composite update.
// If Promise.all subsequently fails, resend_message_id is already in the DB.
await emailSendRepo.updateEmailSend(emailSend.id, {
  resendMessageId,  // ← standalone write; status stays 'queued'
})

await Promise.all([
  emailSendRepo.updateEmailSend(emailSend.id, {
    status: 'sent', sentAt: now, metadata: {...},
    // resendMessageId already set — can be included again safely
  }),
  emailDraftRepo.updateDraftStatus(draftId, {
    status: 'sent', sentAt: now, ifCurrentStatus: 'approved',
  }),
])
```

**Why this works:**
- `updateEmailSend` only writes fields that are explicitly provided
- The standalone write sets `resend_message_id` in the DB before `Promise.all` runs
- If `Promise.all` fails, the catch block writes `status: 'failed'` but `resend_message_id` remains in the DB from the earlier write
- No schema change, no new status, no migration

### Enhanced catch block

```typescript
catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err)
  // resend_message_id may already be set (provider succeeded before this failure).
  // Write a distinguishable failure reason so operators/monitoring can identify
  // provider-success/local-finalization-failure records.
  await emailSendRepo.updateEmailSend(emailSend.id, {
    status: 'failed',
    errorMessage,
    failureReason: emailSend_resendMessageId_known
      ? 'local_finalization_failed_after_provider_success'
      : errorMessage,
    metadata: {
      ...sendMetadata,
      error: errorMessage,
      provider_success: resendMessageId !== null,  // ← explicit flag in metadata
      resend_message_id_at_failure: resendMessageId,  // ← preserve in metadata too
    },
  })
}
```

The `failure_reason` column (Phase 3H, `string | null`) supports arbitrary values — no constraint. Using `'local_finalization_failed_after_provider_success'` as a structured failure reason is immediately distinguishable from `'recipient_email_missing'`, `'draft_not_approved'`, etc.

### Retry guard enhancement

`getActiveSendForDraft` currently checks:

```typescript
.in('status', ['queued', 'sent'])
```

This must be extended to also block retries when `resend_message_id` is set on a `'failed'` record:

```typescript
// Proposed: block retry if resend_message_id is non-null (provider already received the request)
// The existing idempotency index (queued/sent) is not enough for this case.
// Add an application-level check in getActiveSendForDraft or a new helper.
```

**Implementation options (decide in Phase 3U Slice 2):**

A. Add a new `getBlockingSendForDraft` repo function that queries for any record with `status IN ('queued', 'sent')` OR (`status = 'failed'` AND `resend_message_id IS NOT NULL`)

B. Extend `getActiveSendForDraft` to include the above condition

C. In `sendApprovedDraft`, after the existing `getActiveSendForDraft` check, add a separate check for `'failed'`-but-provider-id-known records

Option A is cleanest. The `sendApprovedDraft` caller chooses which check to run based on the send path.

---

## 8. Status Model

### No migration needed (confirmed)

`email_sends.status` is an unconstrained `text` column. New status values can be written without any schema change.

**Current known status values:** `'queued'`, `'sent'`, `'failed'`

**New status option (optional, for maximum clarity):**

`'provider_accepted'` — intermediate state written immediately after `resend_message_id` is received but before final status updates complete. If `Promise.all` fails, status stays `'provider_accepted'` rather than `'failed'`, making it unambiguously distinguishable without reading `failure_reason`.

| Status | Meaning | Retryable |
|--------|---------|-----------|
| `queued` | Send in progress | Yes (if no provider call made yet) |
| `sent` | Provider confirmed, local state finalized | No |
| `failed` | Provider call failed before ID known | Yes (safely) |
| `failed` + `resend_message_id` set | Provider accepted, local finalization failed | **No** — must not retry provider |
| `provider_accepted` (optional new) | Provider confirmed, awaiting local finalization | No |

**Recommendation for Phase 3U Slice 2:** Use `'provider_accepted'` as an intermediate status. Write it immediately after `resend_message_id` is received. If local finalization (`Promise.all`) succeeds, transition to `'sent'`. If it fails, status stays `'provider_accepted'` — which is unambiguous, requires no `failure_reason` parsing, and blocks retries cleanly.

**No migration required** — `status` is an unconstrained string. Adding `'provider_accepted'` requires no schema change, only an application-level convention.

---

## 9. Retry and Duplicate Prevention

### Rule: Never call provider again when `resend_message_id` is known

| State | Action |
|-------|--------|
| `status = 'queued'`, no `resend_message_id` | Block (existing index) |
| `status = 'sent'` | Block (existing index) |
| `status = 'provider_accepted'` | Block — provider already received request |
| `status = 'failed'`, `resend_message_id = null` | Retry safe for most cases — provider did not return ID; may still be ambiguous if provider timeout occurred (see Section 10) |
| `status = 'failed'`, `resend_message_id` set | **Block** — provider may have sent; manual recovery required |

### Operator recovery path (future, not Phase 3U)

When `resend_message_id` is present on a failed record, the operator should be directed to:
1. Check provider dashboard for delivery status using the `resend_message_id`
2. If confirmed delivered: manually mark `email_sends → 'sent'`, `email_drafts → 'sent'`
3. If not delivered: mark as safe-to-retry after clearing the `resend_message_id` (or via a new retry action)

This recovery UI/action is out of scope for Phase 3U Slice 3.

---

## 10. Provider Timeout / Unknown Result

### Distinction from Phase 3U primary target

| Scenario | Provider ID known | Phase 3U coverage |
|----------|------------------|------------------|
| Provider call throws before returning ID | No | Likely safe to retry — provider did not confirm. **Caveat:** the exception may be thrown after the provider accepted the request internally (e.g., connection drop after HTTP 200). Treat as lower-risk but not zero-risk; future scope. |
| Provider timeout (no response) | No | Ambiguous — provider may or may not have accepted the request; **no ID to check**; may have delivered; future reconciliation scope |
| Provider confirms (200 OK), local update fails | **Yes** | **Phase 3U primary target** |

Provider timeout without a confirmed ID is a separate and harder problem. The provider may have received the request internally but not returned a response before the connection dropped. No `resend_message_id` is available for lookup. This requires provider-side reconciliation (e.g., querying Resend's message list). Phase 3U prioritizes the ID-known case. The no-ID timeout case is deferred to Phase 3U Slice 7 (future reconciliation).

---

## 11. Repository Changes to Consider

### `email-send.repo.ts`

| Change | Description | Migration needed |
|--------|-------------|-----------------|
| `updateEmailSend` — already supports `resendMessageId` | No change needed for standalone ID write | No |
| New `getBlockingSendForDraft` | Queries for active/sent + failed-with-provider-id | No |
| `updateEmailSend` — write `'provider_accepted'` status | Unconstrained string, no schema change | No |

All changes are application-level only. No new columns. No new indexes (the existing `email_sends_draft_active_unique` partial index applies only to `status IN ('queued', 'sent')` — it does not need to be changed, because the new `getBlockingSendForDraft` check is an application-level guard).

---

## 12. Proposed Hardened `sendApprovedDraft` Flow

```
── Permission check ──────────────────────────────────────────────────
requirePermission(ctx, 'messaging.send_emails')

── EMAIL_SENDING_ENABLED gate ────────────────────────────────────────
if (!sendingEnabled) return { ok: false, reason: 'sending_disabled_...' }

── Draft fetch + lifecycle double-gate ──────────────────────────────
[draft loaded, approval confirmed, status = 'approved']

── Idempotency guard (enhanced) ─────────────────────────────────────
blockingSend = await getBlockingSendForDraft(draftId, tenantId)
if (blockingSend) return { ok: false, reason: 'duplicate_send_blocked', alreadySent: ... }
// getBlockingSendForDraft checks: queued, sent, provider_accepted, OR failed+resendMessageId

── Recipient / suppression / rate / sender checks ───────────────────

── Create email_sends (status = 'queued') ───────────────────────────
emailSend = await createEmailSend(...)

── ET_SEND_INITIATED ─────────────────────────────────────────────────

── Call Resend provider ──────────────────────────────────────────────
try {
  resendData = await resend.emails.send(...)
  resendMessageId = resendData.id

  ── PHASE 3U: persist provider ID immediately ─────────────────────
  await updateEmailSend(emailSend.id, {
    status: 'provider_accepted',  // or just resendMessageId if no new status
    resendMessageId,
  })

  ── Finalize local state ──────────────────────────────────────────
  await Promise.all([
    updateEmailSend(emailSend.id, { status: 'sent', sentAt, metadata }),
    updateDraftStatus(draftId, { status: 'sent', sentAt }),
  ])

  ── ET_SEND_SUCCEEDED ────────────────────────────────────────────
  ── campaign side-effect (if applicable) ─────────────────────────
  return { ok: true, sendId, resendMessageId }

} catch (err) {
  ── Distinguish provider-success/local-failure from clean failure ─
  if (resendMessageId !== null) {
    await updateEmailSend(emailSend.id, {
      status: 'failed',  // or stays 'provider_accepted'
      errorMessage: err.message,
      failureReason: 'local_finalization_failed_after_provider_success',
      metadata: { ..., provider_success: true, resend_message_id_at_failure: resendMessageId },
    })
    return { ok: false, reason: 'local_finalization_failed', providerAccepted: true }
  } else {
    await updateEmailSend(emailSend.id, {
      status: 'failed',
      errorMessage: err.message,
      failureReason: err.message,
      metadata: { ..., provider_success: false },
    })
    return { ok: false, reason: err.message }
  }
  ── ET_SEND_FAILED ────────────────────────────────────────────────
}
```

**Key invariant:** `resendMessageId` is written to `email_sends.resend_message_id` before `Promise.all` is attempted. Once written, it cannot be lost by a subsequent failure.

---

## 13. Testing Plan

Source-reading tests (same pattern as Phase 3R/3S/3T):

### Service hardening tests

- `provider ID is persisted immediately after provider success, before Promise.all`
- `provider ID write (status: provider_accepted or resendMessageId only) appears before Promise.all in source`
- `catch block checks resendMessageId for provider-success distinction`
- `catch block writes failure_reason = local_finalization_failed_after_provider_success when provider ID known`
- `catch block writes metadata including provider_success flag`
- `catch block writes resend_message_id_at_failure to metadata when provider ID known`
- `local draft update failure returns { ok: false, reason: local_finalization_failed, providerAccepted: true } or equivalent`

### Repository / idempotency tests

- `getBlockingSendForDraft queries queued, sent, provider_accepted, AND failed-with-provider-id`
- `sendApprovedDraft uses getBlockingSendForDraft (not just getActiveSendForDraft) for blocking check`
- `a failed send with resend_message_id blocks new sendApprovedDraft call for same draft`
- `a failed send without resend_message_id does not block new sendApprovedDraft call`

### Regression tests

- `existing EMAIL_SENDING_ENABLED gate still present`
- `existing approval/readiness gates unchanged`
- `Phase 3T proposal send action still delegates to sendApprovedDraft`
- `no CAMPAIGN_SENDING_ENABLED reference in hardened service`
- `no proposal/commitment status mutation`
- `no direct Resend call from action layer`

---

## 14. Migration Considerations

**No migration is required for Phase 3U Slice 3.**

| Item | Analysis | Migration needed |
|------|----------|-----------------|
| `email_sends.status` | Unconstrained `string` column — confirmed in `types/database.ts` | **No** |
| `email_sends.resend_message_id` | Already exists | **No** |
| `email_sends.failure_reason` | Already exists (Phase 3H) | **No** |
| `email_sends.metadata` | JSONB — arbitrary keys allowed | **No** |
| New `'provider_accepted'` status | Unconstrained string, application-level convention only | **No** |
| `getBlockingSendForDraft` function | Application-level query change | **No** |

The only future migration that could be desirable (but is not required for Phase 3U) would be a `CHECK` constraint documenting the allowed status values, or a partial index on `(draft_id) WHERE resend_message_id IS NOT NULL AND status = 'failed'` for fast lookup of the ambiguous state. Neither is necessary for the hardening.

---

## 15. Acceptance Criteria

The design is accepted if:

- [x] Documentation only — no code, no migration, no tag
- [x] Accurately describes the confirmed failure mode (provider-success/`Promise.all`-failure)
- [x] Recommends a safe hardening path (persist `resend_message_id` before `Promise.all`)
- [x] Provider message ID is never lost after provider confirmation
- [x] Unsafe duplicate retry is blocked when provider ID is known
- [x] `EMAIL_SENDING_ENABLED` remains disabled
- [x] No campaign sending
- [x] No proposal/commitment status mutation
- [x] No migration required for the recommended approach
- [x] Tests defined for hardening verification
- [x] Retry guard enhancement documented

---

## 16. Recommended Slice Breakdown

| Slice | Description | Notes |
|-------|-------------|-------|
| **3U Slice 1** | Design (this document) | Documentation only |
| **3U Slice 2** | Implementation plan | Decide on `'provider_accepted'` status; `getBlockingSendForDraft` vs extending existing; Codex review before code |
| **3U Slice 3** | Harden `sendApprovedDraft` + `getBlockingSendForDraft` + source-reading tests | Core fix — small; no migration; EMAIL_SENDING_ENABLED still disabled |
| **3U Slice 4** | QA / lock report + tag | After slice 3 confirmed |
| **3U Slice 5 (future)** | `EMAIL_SENDING_ENABLED` enablement + non-production send test | Separate explicit decision; after Slice 4 locked |
| **3U Slice 6 (future)** | Operator recovery UI for ambiguous sends | After send is live; out of scope for core hardening |
| **3U Slice 7 (future)** | Provider timeout reconciliation | Lower priority; requires provider-side lookup capability |

---

## 17. Open Questions

1. **`'provider_accepted'` status:** Should the intermediate status be `'provider_accepted'` (recommended — unambiguous) or should the service keep `'queued'` and distinguish via `resend_message_id` column alone? The former is cleaner operationally; the latter requires no semantic change.

2. **`getBlockingSendForDraft` scope:** Should the enhanced blocking check apply only to proposal follow-up sends, or to all send paths (campaign, lead draft, etc.)? Applying it universally is safer but may have unintended side effects on existing retry logic. Decide in Slice 2.

3. **`Promise.all` vs sequential writes:** The current `Promise.all` was likely chosen for performance. After the standalone `resend_message_id` write is added, should `Promise.all` be replaced with sequential writes to make failure attribution clearer? The tradeoff is performance vs debuggability.

4. **Provider timeout handling:** Should Phase 3U Slice 3 also address the timeout case, or strictly scope to the ID-known failure? Timeout handling is more complex (requires provider-side lookup or a reconciliation job). Recommendation: defer to Phase 3U Slice 7.

5. **Campaign send path impact:** The same `sendApprovedDraft` function serves both proposal follow-up sends and (potentially) campaign sends. Hardening `sendApprovedDraft` will apply to both paths. Confirm this is intended before Slice 3 implementation.
