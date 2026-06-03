# Phase 3U Slice 2 — Send Reliability Hardening Implementation Plan

**Status:** Planning only — no implementation started
**Created:** 2026-06-03
**Predecessor:** Phase 3U Slice 1 — [Send Reliability Hardening Design](phase-3u-send-reliability-hardening-design.md)
**Phase 3T lock tag:** `phase-3t-approved-send-path-v1` → `7da85008593c66b23df9f5e864ac36fe73ce4ea0`
**origin/master at plan time:** `c8c8ade72db3ab9d61768d59853556334ba39ead`

---

## 1. Purpose

This document translates the Phase 3U Slice 1 design into a concrete implementation plan for hardening `sendApprovedDraft` against provider-success/local-update failure.

When implemented, this plan ensures `resend_message_id` is never lost after a successful provider call, that ambiguous provider-success/local-failure states are distinguishable, and that duplicate provider calls are blocked when a `resend_message_id` is already known.

**This document is planning only:**
- Does not enable `EMAIL_SENDING_ENABLED`
- Does not send emails
- Does not add campaign sending
- Does not add UI
- Does not add background jobs
- Does not mutate proposal or commitment status
- Is a required reliability pre-condition before any live `EMAIL_SENDING_ENABLED` deployment

---

## 2. Current Locked Foundation

| Item | Status |
|------|--------|
| Phase 3T lock tag | `phase-3t-approved-send-path-v1` confirmed |
| `sendApprovedDraft` | Exists — creates `email_sends`, calls provider, updates statuses in `Promise.all` |
| `getActiveSendForDraft` | Exists — blocks `status IN ('queued', 'sent')` only; does not block `'provider_accepted'` or `'failed'`+`resend_message_id` |
| `email_sends.status` | Unconstrained `string` — confirmed in `types/database.ts` |
| `email_sends.resend_message_id` | Already exists; can be written independently via `updateEmailSend` |
| `email_sends.failure_reason` | Already exists (Phase 3H); supports arbitrary string values |
| `EMAIL_SENDING_ENABLED` | **Disabled** — must remain disabled |
| `updateEmailSend` | Already supports standalone `resendMessageId` write |

---

## 3. Caller Impact Review

### Confirmed callers of `sendApprovedDraft`

By grepping the codebase (`grep -rn "sendApprovedDraft" modules/ app/ tests/`):

| Caller | File | Notes |
|--------|------|-------|
| `sendApprovedDraftAction` | `modules/messaging/actions/email-send.actions.ts` | Generic Phase 3A lead-draft sender — passes `draftId` directly from UI; no proposal-follow-up context validation |
| `sendFollowUpDraftAction` | `modules/proposals/actions/proposal-follow-up-send.actions.ts` | Phase 3T proposal-follow-up wrapper — validates commitment/draft context before calling `sendApprovedDraft` |

### Non-callers (confirmed)

| Component | Confirmed not calling `sendApprovedDraft` |
|-----------|------------------------------------------|
| `modules/messaging/actions/send-bridge.actions.ts` | Comments explicitly: "No sendApprovedDraftAction call" |
| `modules/messaging/send-bridge/send-bridge.service.ts` | Comments explicitly: "No sendApprovedDraftAction call" |
| Campaign send path | Uses `campaign_email_sends` table directly — separate from `email_sends` / `sendApprovedDraft` |

### Impact analysis

Hardening `sendApprovedDraft` globally affects both confirmed callers. This is acceptable because:

1. **`sendApprovedDraftAction` (generic):** Adds `'provider_accepted'` intermediate status before `Promise.all`. If the existing UI or tests observe `status = 'sent'` after a successful send, the path to `'sent'` is unchanged — `'provider_accepted'` is a transient intermediate state. The public return shape `{ ok: true, sendId, resendMessageId }` is unchanged on success.

2. **`sendFollowUpDraftAction` (Phase 3T):** Already validates context before calling `sendApprovedDraft`. The hardening adds no new pre-conditions for this caller. Its `ActionResult` return shape does not change.

**No caller should expect `status = 'failed'`-with-`resend_message_id` to be retryable.** If any future caller adds retry logic, it must check `getBlockingSendForDraft` (not `getActiveSendForDraft`) before retrying.

**send-bridge is not affected** — it does not call `sendApprovedDraft` and has its own send path.

---

## 4. `'provider_accepted'` Status Decision

### Decision: Option A — keep `'provider_accepted'` on local-finalization failure

**Recommendation: use `'provider_accepted'` as the intermediate status.**

Write it immediately after `resendMessageId = resendData.id`. If local finalization (`Promise.all`) succeeds, transition to `'sent'`. If local finalization fails, **leave status as `'provider_accepted'`** rather than transitioning to `'failed'`.

| State machine | Status |
|---------------|--------|
| Before provider call | `'queued'` |
| Provider returns ID | `'provider_accepted'` ← **new intermediate** |
| Local finalization succeeds | `'sent'` |
| Local finalization fails after provider success | `'provider_accepted'` (stays) |
| Provider call fails (no ID) | `'failed'` |

**Why Option A over Option B (failed + resend_message_id):**
- `'provider_accepted'` is operationally unambiguous — no `failure_reason` parsing needed to distinguish it from a clean provider failure
- The `'failed'` status retains its meaning: "provider did not accept the request"
- Operators and monitoring can use `status = 'provider_accepted'` as a dedicated alert condition
- No migration needed — `status` is an unconstrained string

**What to write on local-finalization failure (catch block when `resendMessageId` is known):**

```typescript
// Provider accepted; local finalization failed.
// Status stays 'provider_accepted' — not marking as 'failed'.
await updateEmailSend(emailSend.id, {
  // status stays 'provider_accepted' — do not overwrite
  failureReason: 'local_finalization_failed_after_provider_success',
  errorMessage:  err.message,
  metadata: {
    ...sendMetadata,
    provider_success:             true,
    local_finalization_failed_at: new Date().toISOString(),
    error:                        err.message,
  },
})
return {
  ok: false,
  reason: 'local_finalization_failed_after_provider_success',
}
```

---

## 5. No-Migration Decision

**Confirmed: no migration for Phase 3U Slice 3.**

| Item | Conclusion |
|------|-----------|
| `'provider_accepted'` status | Application-level convention; `status` is unconstrained `string` — no schema change needed |
| `resend_message_id` | Already exists |
| `failure_reason` | Already exists (Phase 3H) |
| `metadata` (JSONB) | Supports arbitrary keys — no schema change needed |
| DB-level partial unique index for `'provider_accepted'` | **Deferred** — application-level `getBlockingSendForDraft` is sufficient for Slice 3; a DB index can be added later if needed |

**Future DB index (not Slice 3):**

```sql
-- Future only — not Slice 3:
CREATE UNIQUE INDEX email_sends_draft_active_v2_unique
  ON email_sends (draft_id)
  WHERE status IN ('queued', 'sent', 'provider_accepted');
```

This would extend the existing `email_sends_draft_active_unique` index to also cover `'provider_accepted'`. It requires a separate migration and explicit approval. Phase 3U Slice 3 intentionally defers it to keep the slice small.

---

## 6. `getBlockingSendForDraft` Design

### New repository function

**File:** `modules/messaging/repositories/email-send.repo.ts`

**Function name:** `getBlockingSendForDraft`

```typescript
// Returns any email_send record that should block a new send attempt for this draft.
// Blocks:
//   - status = 'queued'         — send in progress, provider not yet called
//   - status = 'sent'           — already successfully delivered
//   - status = 'provider_accepted' — provider received request; local finalization may be pending
//   - status = 'failed' AND resend_message_id IS NOT NULL — provider may have sent
//
// Does NOT block:
//   - status = 'failed' AND resend_message_id IS NULL — clean provider failure, retry safe
//
// Note: timeout/no-ID failures (status='failed', resend_message_id=null) may still be
// ambiguous in rare cases; Phase 3U defers provider-side reconciliation to a future slice.
export async function getBlockingSendForDraft(
  draftId: string,
  tenantId: string,
): Promise<Pick<EmailSendRow, 'id' | 'status' | 'resend_message_id'> | null>
```

### Implementation approach

Two sub-queries combined with `maybeSingle`:

1. Query for `status IN ('queued', 'sent', 'provider_accepted')` — standard blocking states
2. Query for `status = 'failed' AND resend_message_id IS NOT NULL` — provider-known failure

Or a single query using `.or()`:

```typescript
.or(
  `status.in.(queued,sent,provider_accepted),` +
  `and(status.eq.failed,resend_message_id.not.is.null)`
)
```

Return the most recent matching record. If null, no blocking record exists.

### Usage in `sendApprovedDraft`

Replace the existing `getActiveSendForDraft` call at the idempotency check step with `getBlockingSendForDraft`:

```typescript
// Current:
const existingSend = await emailSendRepo.getActiveSendForDraft(draftId, ctx.tenantId)

// Hardened:
const existingSend = await emailSendRepo.getBlockingSendForDraft(draftId, ctx.tenantId)
```

**`getActiveSendForDraft` retention:** Keep the existing function — it may be used by `getSendStatusForDraft` or UI status checks. Do not remove it in Slice 3.

### `alreadySent` flag behavior

The current `getActiveSendForDraft` result is checked as:

```typescript
alreadySent: existingSend.status === 'sent'
```

After replacing with `getBlockingSendForDraft`, add:

```typescript
alreadySent: existingSend.status === 'sent' || existingSend.status === 'provider_accepted',
```

Since `'provider_accepted'` means the provider received the request, it is operationally equivalent to "may already have been sent" from the caller's perspective.

---

## 7. Hardened `sendApprovedDraft` Flow

```
0. requirePermission(ctx, 'messaging.send_emails')                       [unchanged]

1. EMAIL_SENDING_ENABLED gate                                             [unchanged]

2. Draft fetch + lifecycle double-gate                                    [unchanged]

3. Idempotency guard — HARDENED
   const existingSend = await getBlockingSendForDraft(draftId, ctx.tenantId)
   // (was: getActiveSendForDraft)
   if (existingSend) {
     return {
       ok: false,
       reason: 'duplicate_send_blocked',
       alreadySent: existingSend.status === 'sent'
                 || existingSend.status === 'provider_accepted',
     }
   }

4. Recipient / suppression / rate / sender checks                         [unchanged]

5. Create email_sends (status = 'queued')                                [unchanged]

6. ET_SEND_INITIATED emitted (non-fatal)                                 [unchanged]

7. Call Resend provider                                                   [unchanged call site]
   resendMessageId = resendData.id

8. PHASE 3U: persist provider ID immediately
   await updateEmailSend(emailSend.id, {
     status:          'provider_accepted',
     resendMessageId,
     metadata: { ...sendMetadata, provider_accepted_at: now, provider_success: true },
   })
   // resend_message_id and 'provider_accepted' status are now in the DB.
   // If Promise.all below fails, the ID is preserved.

9. Local finalization
   await Promise.all([
     updateEmailSend(emailSend.id, {
       status:         'sent',
       sentAt:         now,
       metadata:       { ...sendMetadata, resend_response_id: resendMessageId },
     }),
     updateDraftStatus(draftId, {
       status:          'sent',
       sentAt:          now,
       ifCurrentStatus: 'approved',
     }),
   ])

10. ET_SEND_SUCCEEDED emitted (non-fatal)                                [unchanged]

11. campaign_assignment_id side-effect if applicable                     [unchanged]

12. return { ok: true, sendId: emailSend.id, resendMessageId }           [unchanged]

catch (err):
  if (resendMessageId !== null) {
    // Provider accepted; local finalization failed.
    // Preserve provider_accepted status — do NOT overwrite with 'failed'.
    await updateEmailSend(emailSend.id, {
      failureReason: 'local_finalization_failed_after_provider_success',
      errorMessage:  errorMessage,
      metadata: {
        ...sendMetadata,
        provider_success:             true,
        local_finalization_failed_at: now,
        error:                        errorMessage,
      },
    })
    // ET_SEND_FAILED emitted with provider_success: true metadata
    return {
      ok: false,
      reason: 'local_finalization_failed_after_provider_success',
    }
  } else {
    // Provider did not confirm. Clean failure.
    // Caution: timeout/no-ID failures may still be ambiguous in rare cases.
    await updateEmailSend(emailSend.id, {
      status:        'failed',
      errorMessage,
      failureReason: errorMessage,
      metadata:      { ...sendMetadata, error: errorMessage, provider_success: false },
    })
    // ET_SEND_FAILED emitted
    return { ok: false, reason: errorMessage }
  }
```

### Promise.all vs sequential decision

**Keep `Promise.all` for Slice 3.** The intermediate `'provider_accepted'` write (step 8) is the primary safety invariant. Once `resend_message_id` is in the DB, a `Promise.all` failure on steps 9 is safe — the catch block preserves the `'provider_accepted'` status without overwriting.

Sequential writes would provide more granular failure attribution (e.g., knowing whether `updateEmailSend` or `updateDraftStatus` failed) but add code complexity. Defer to a future slice if granularity is needed.

---

## 8. SendResult Return Shape

The current `SendResult` type:

```typescript
export type SendResult =
  | { ok: true;  sendId: string; resendMessageId: string | null }
  | { ok: false; reason: string; alreadySent?: boolean }
```

**No type change needed for Slice 3.** The `reason` string field on the failure branch can hold `'local_finalization_failed_after_provider_success'` without any type change. The `alreadySent` field already supports the `'provider_accepted'` case.

If callers need to distinguish the specific failure reason, they can inspect `result.reason === 'local_finalization_failed_after_provider_success'`. No API-breaking change required.

---

## 9. Provider Timeout / No-ID Handling

**Phase 3U Slice 3 does not solve provider timeout/no-ID ambiguity.**

| Scenario | Phase 3U Slice 3 behavior |
|----------|--------------------------|
| Provider returns ID, local fails | **Solved** — `'provider_accepted'` status preserved |
| Provider call throws exception before returning ID | `'failed'` status, `resend_message_id = null`. **Likely retryable** (provider did not confirm), but not guaranteed zero-risk for timeouts that dropped after HTTP 200. |
| Provider call times out (no response) | `'failed'` status, `resend_message_id = null`. **Ambiguous** — provider may have received the request; deferred to Phase 3U Slice 7 reconciliation. |

**Critical wording requirement:** Implementation comments must not claim "no provider ID means the email was definitely not sent." Timeout ambiguity is real. Phase 3U Slice 3 treats `resend_message_id = null` + `status = 'failed'` as "safe to retry in most cases" with a documented caveat. The timeout reconciliation path is out of scope until Phase 3U Slice 7.

---

## 10. Activity / Audit Behavior

| Event | Behavior |
|-------|---------|
| `ET_SEND_INITIATED` | Unchanged — emitted before provider call |
| `ET_SEND_SUCCEEDED` | Unchanged — emitted only after finalization succeeds |
| `ET_SEND_FAILED` | Emitted in catch block with `metadata.provider_success = true` for provider-accepted/local-failure cases, `false` for clean failures |

**No new event constant in Slice 3.** The `ET_SEND_FAILED` event carries sufficient information in `metadata`. A dedicated `ET_SEND_LOCAL_FINALIZATION_FAILED` event could be added in a future slice, but it is not required for the core hardening.

---

## 11. Testing Plan

**Test file:** `tests/phase3u-send-reliability-hardening.test.ts`

Pattern: `fs.readFileSync + toContain / not.toContain / regex` (source-reading tier).

### Provider-ID persistence ordering tests

- `TC-3U-001`: `updateEmailSend` with `'provider_accepted'` appears in `email-send.service.ts`
- `TC-3U-002`: `'provider_accepted'` update (step 8) appears before `Promise.all` in service source
- `TC-3U-003`: `'provider_accepted'` update appears before `updateDraftStatus` call
- `TC-3U-004`: catch block checks `resendMessageId !== null` to distinguish provider-success/local-failure
- `TC-3U-005`: catch block does NOT overwrite `status` when `resendMessageId` is not null
- `TC-3U-006`: catch block writes `failureReason = 'local_finalization_failed_after_provider_success'` when provider succeeded
- `TC-3U-007`: catch block writes `metadata.provider_success = true` when provider succeeded
- `TC-3U-008`: return reason `'local_finalization_failed_after_provider_success'` used when provider succeeded

### Blocking helper tests

- `TC-3U-009`: `email-send.repo.ts` exports `getBlockingSendForDraft`
- `TC-3U-010`: `getBlockingSendForDraft` checks `status IN ('queued', 'sent', 'provider_accepted')`
- `TC-3U-011`: `getBlockingSendForDraft` also blocks `status = 'failed'` with `resend_message_id IS NOT NULL`
- `TC-3U-012`: `getBlockingSendForDraft` does NOT block `status = 'failed'` + `resend_message_id = null`
- `TC-3U-013`: `sendApprovedDraft` calls `getBlockingSendForDraft` (not only `getActiveSendForDraft`) for idempotency check
- `TC-3U-014`: `getBlockingSendForDraft` call appears before `createEmailSend` in service source
- `TC-3U-015`: `alreadySent` flag considers `'provider_accepted'` status as a blocking/sent-equivalent state
- `TC-3U-016`: `getActiveSendForDraft` still exists in repo file (not removed)

### Timeout wording tests

- `TC-3U-017`: service source does not claim no-ID failures are always safe to retry (check for absent claim like "always safe" near no-ID path)
- `TC-3U-018`: service comments acknowledge timeout/no-ID ambiguity

### Guardrail tests

- `TC-3U-019`: `EMAIL_SENDING_ENABLED` gate unchanged in service
- `TC-3U-020`: `CAMPAIGN_SENDING_ENABLED` not referenced in service
- `TC-3U-021`: no campaign sending added to service
- `TC-3U-022`: no proposal/commitment `commitment_status` mutation in service
- `TC-3U-023`: no direct Resend import beyond existing `resend` client
- `TC-3U-024`: no Inngest import in service
- `TC-3U-025`: Phase 3T `sendFollowUpDraftAction` still delegates to `sendApprovedDraft`

### Regression tests

- `TC-3U-026`: Phase 3T targeted tests still pass (TC-3T-001 through TC-3T-047)
- `TC-3U-027`: Phase 3T UI tests still pass (TC-3T-UI-001 through TC-3T-UI-061)
- `TC-3U-028`: No migration files created during Phase 3U Slice 3

---

## 12. Migration Considerations

**No migration for Phase 3U Slice 3. Confirmed.**

| Item | Needs migration | Notes |
|------|----------------|-------|
| `'provider_accepted'` status | No | `status` is `string` — unconstrained |
| `resend_message_id` | No | Already exists |
| `failure_reason` | No | Already exists (Phase 3H) |
| `metadata` JSONB | No | Arbitrary keys supported |
| `getBlockingSendForDraft` | No | Application-level query function |
| Future DB partial unique index | Future only | `WHERE status IN ('queued','sent','provider_accepted')` — deferred until Slice 3 behavior is validated |

---

## 13. Acceptance Criteria

This implementation plan is accepted if:

- [x] Documentation only — no code, no migration, no tag
- [x] `'provider_accepted'` status decision: Option A — keep on local-finalization failure
- [x] No migration confirmed — `status` is unconstrained string
- [x] `getBlockingSendForDraft` designed — blocks queued/sent/provider_accepted/failed+id
- [x] `sendApprovedDraft` flow preserves provider ID before `Promise.all`
- [x] Duplicate retry blocked when `resend_message_id` is known
- [x] Timeout/no-ID ambiguity documented without overstating safety
- [x] All confirmed callers reviewed (two: `sendApprovedDraftAction`, `sendFollowUpDraftAction`)
- [x] `send-bridge` confirmed as non-caller
- [x] Tests defined (28 tests TC-3U-001 through TC-3U-028)
- [x] `EMAIL_SENDING_ENABLED` remains disabled
- [x] No emails sent

---

## 14. Recommended Next Slice

**Phase 3U Slice 3 — Harden `sendApprovedDraft` Provider-Success/Local-Update Failure**

Scope:
- Add `getBlockingSendForDraft` to `modules/messaging/repositories/email-send.repo.ts`
- Harden `sendApprovedDraft` in `modules/messaging/services/email-send.service.ts`:
  - Step 3: replace `getActiveSendForDraft` with `getBlockingSendForDraft`
  - Step 8: add `'provider_accepted'` write before `Promise.all`
  - Catch: distinguish provider-success/local-failure from clean failure
- Add `tests/phase3u-send-reliability-hardening.test.ts` (TC-3U-001–028)
- **No UI** — no `SendFollowUpDraftButton` changes
- **No migration** — `'provider_accepted'` is application-level
- **No `EMAIL_SENDING_ENABLED` change** — still disabled after Slice 3
- **No emails sent** — hardening is deployed while flag remains off

Pre-condition: This plan must pass Codex review before Slice 3 code is written.
