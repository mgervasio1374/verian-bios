# Phase 3U — Send Reliability Hardening Lock Report

**Status:** QA complete — pending final Codex review before tag
**Created:** 2026-06-03
**Predecessor:** Phase 3T — Approved Send Path (locked)
**Phase 3T lock tag:** `phase-3t-approved-send-path-v1` → `7da85008593c66b23df9f5e864ac36fe73ce4ea0`
**origin/master at report time:** `06454baade7060b0379091a1766e1f7d7f8b094f`

---

## 1. Executive Summary

Phase 3U hardened `sendApprovedDraft` against provider-success/local-finalization failure — the critical blocker that prevented `EMAIL_SENDING_ENABLED` from being turned on after Phase 3T.

**Phase 3U resolved the blocker by:**
- Persisting `resend_message_id` and `'provider_accepted'` status immediately after provider success, before any local finalization write
- Hardening the catch block to reassert `status: 'provider_accepted'` and top-level `resendMessageId` if local finalization subsequently fails
- Adding `getBlockingSendForDraft` to block retries for `'queued'`, `'sent'`, `'provider_accepted'`, and `'failed'`+`resend_message_id IS NOT NULL`

**Phase 3U did not:**
- Send any emails (`EMAIL_SENDING_ENABLED` remains disabled)
- Enable campaigns (`CAMPAIGN_SENDING_ENABLED` remains disabled)
- Add migrations (no schema change required — `status` is unconstrained `string`)
- Add UI or send controls
- Add automation or background jobs
- Mutate proposal or commitment status

`resend_message_id` is now persisted and reasserted in all handled local-finalization failure paths after a confirmed provider acceptance, covering both the success path and the hardened catch branch.

---

## 2. Scope Completed

| Slice | Description | Type |
|-------|-------------|------|
| Slice 1 | Send reliability hardening design | Documentation |
| Slice 2 | Implementation plan | Documentation |
| Slice 3 | Backend reliability hardening | Code |
| Slice 4 | Comment cleanup / documentation alignment | Comment-only |
| Slice 5 | QA and lock report (this document) | Documentation |

---

## 3. Phase 3U Commits

| Hash | Message |
|------|---------|
| `c8c8ade` | Docs: add Phase 3U send reliability hardening design |
| `fd9abea` | Docs: add Phase 3U Slice 2 implementation plan |
| `ef8eb2f` | Phase 3U: harden approved send reliability |
| `06454ba` | Docs: align Phase 3T send comments with Phase 3U hardening |

---

## 4. Files Added or Modified

### Documentation

| File | Description |
|------|-------------|
| `docs/roadmap/phase-3u-send-reliability-hardening-design.md` | Phase 3U design (Slice 1) |
| `docs/roadmap/phase-3u-slice-2-send-reliability-hardening-implementation-plan.md` | Implementation plan (Slice 2) |
| `docs/roadmap/phase-3u-send-reliability-hardening-lock-report.md` | This file |

### Backend

| File | Change | Description |
|------|--------|-------------|
| `modules/messaging/repositories/email-send.repo.ts` | Modified | Added `getBlockingSendForDraft` |
| `modules/messaging/services/email-send.service.ts` | Modified | Hardened `sendApprovedDraft`: replaced idempotency check, added `'provider_accepted'` write, hardened catch block |

### Tests

| File | Change | Description |
|------|--------|-------------|
| `tests/phase3u-send-reliability-hardening.test.ts` | New | 45 source-reading tests (TC-3U-001–043 + TC-3U-025b, 025c) |
| `tests/phase3t-proposal-follow-up-send.test.ts` | Modified | TC-3T-045 updated to assert Phase 3U hardening comment language |

### Comment / Documentation Alignment

| File | Change | Description |
|------|--------|-------------|
| `modules/proposals/actions/proposal-follow-up-send.actions.ts` | Comment-only | Replaced stale "resend_message_id is NOT persisted" risk block with Phase 3U hardening reference (Slice 4) |

---

## 5. Reliability Problem Resolved

### Original risk (confirmed by Phase 3T code review)

```
1. CREATE email_sends (status = 'queued') before provider call
2. Provider call succeeds → resendMessageId captured in memory only
3. await Promise.all([updateEmailSend('sent'), updateDraftStatus('sent')])
                                    ↑ RISK POINT
4. If Promise.all throws:
   catch block → updateEmailSend({ status: 'failed', errorMessage })
               → resendMessageId NOT included → NOT written to DB column
   email_sends.status = 'failed', resend_message_id = null
   Operator sees failure; may retry → could send email twice
   No way from DB alone to determine whether email was delivered
```

### Phase 3U resolution

```
1. CREATE email_sends (status = 'queued') before provider call      [unchanged]
2. Provider call succeeds → resendMessageId captured
3. PHASE 3U: updateEmailSend({                                       ← NEW
     status: 'provider_accepted',
     resendMessageId,
     metadata: { provider_success: true, provider_accepted_at, resend_message_id }
   })
   → resend_message_id now in DB; status = 'provider_accepted'
4. await Promise.all([updateEmailSend('sent'), updateDraftStatus('sent')])
5. If Promise.all succeeds → status = 'sent', normal flow
   If Promise.all throws:
   catch block (resendMessageId !== null) →
     updateEmailSend({
       status: 'provider_accepted',    ← explicit reassert
       resendMessageId,               ← explicit column write
       failureReason: 'local_finalization_failed_after_provider_success',
       metadata: { provider_success: true, resend_message_id, ... }
     })
   → resend_message_id preserved in DB column
   → status = 'provider_accepted' (not 'failed')
   → getBlockingSendForDraft blocks any retry
```

**Key invariant:** `email_sends.resend_message_id` is always written to the DB column after a confirmed provider acceptance, regardless of which local update subsequently fails.

---

## 6. `getBlockingSendForDraft` Behavior

**File:** `modules/messaging/repositories/email-send.repo.ts`

New exported function using two sequential queries (avoids complex `.or()` syntax):

| Status | `resend_message_id` | Blocked? | Reason |
|--------|---------------------|---------|--------|
| `'queued'` | any | **Yes** | Send in progress |
| `'sent'` | any | **Yes** | Already delivered |
| `'provider_accepted'` | set | **Yes** | Provider received request; finalization pending |
| `'failed'` | IS NOT NULL | **Yes** | Provider may have sent; do not retry provider |
| `'failed'` | IS NULL | **No** | Clean provider failure; generally retryable |

`getActiveSendForDraft` (which only checked `queued`/`sent`) was retained — other code paths may still use it. `sendApprovedDraft` now uses `getBlockingSendForDraft` before `createEmailSend`.

**`alreadySent` semantics updated:** Returns `true` for `'sent'`, `'provider_accepted'`, and `'failed'`+`resend_message_id IS NOT NULL` — all are operationally sent-equivalent (provider may have delivered).

**Application-guarded:** `'provider_accepted'` is NOT covered by the existing `email_sends_draft_active_unique` DB partial index (`WHERE status IN ('queued', 'sent')`). It is protected at the application layer by `getBlockingSendForDraft`. A future migration may extend the index.

---

## 7. `'provider_accepted'` Status Model

| Property | Value |
|----------|-------|
| Status value | `'provider_accepted'` (application-level convention) |
| Schema change required | **No** — `email_sends.status` is unconstrained `string` |
| DB index coverage | **None** — application-guarded by `getBlockingSendForDraft` |
| Written at | Immediately after `resendMessageId = resendData.id`, before `Promise.all` |
| Transition on success | `'provider_accepted'` → `'sent'` (after `Promise.all` finishes) |
| Transition on local failure | Stays `'provider_accepted'` (catch block reasserts) |
| Future DB index options | `status IN ('queued','sent','provider_accepted')` OR `resend_message_id IS NOT NULL` OR `failed + resend_message_id IS NOT NULL` |

No migration was created or needed in Phase 3U.

---

## 8. `sendApprovedDraft` Behavior After Phase 3U

```
0. requirePermission('messaging.send_emails')                       [unchanged]
1. EMAIL_SENDING_ENABLED gate                                       [unchanged]
2. Draft fetch + lifecycle double-gate                              [unchanged]
3. getBlockingSendForDraft — HARDENED (was: getActiveSendForDraft)
   alreadySent = status∈{sent,provider_accepted} OR (failed+resend_message_id)
4. Recipient / suppression / rate / sender checks                   [unchanged]
5. createEmailSend (status = 'queued')                             [unchanged]
6. ET_SEND_INITIATED                                               [unchanged]
7. Call Resend provider once                                       [unchanged]
8. PHASE 3U: provider_accepted write (status + resendMessageId + metadata)
9. Promise.all(updateEmailSend('sent'), updateDraftStatus('sent')) [unchanged structure]
10. ET_SEND_SUCCEEDED (only on success)                            [unchanged]
11. campaign_assignment side-effect if applicable                  [unchanged]
12. return { ok: true, sendId, resendMessageId }                   [unchanged]

catch(err):
  if (resendMessageId !== null):   ← PHASE 3U: provider-success path
    updateEmailSend({
      status: 'provider_accepted',    ← explicit reassert
      resendMessageId,               ← explicit column write
      failureReason: 'local_finalization_failed_after_provider_success',
      metadata: { provider_success: true, resend_message_id, ... }
    })
    ET_SEND_FAILED with explicit provider_success/resend_message_id enrichment
    return { ok: false, reason: 'local_finalization_failed_after_provider_success' }
  else:                              ← clean provider failure
    updateEmailSend({ status: 'failed', ... })
    ET_SEND_FAILED
    return { ok: false, reason: 'send_failed: ...' }
```

---

## 9. Timeout / No-ID Limitation

Phase 3U prioritized the **provider-success/ID-known** local-finalization failure. The provider timeout / no-ID case remains carefully documented:

| Scenario | Phase 3U outcome |
|----------|-----------------|
| Provider confirms (200 OK), local fails | **Solved** — `'provider_accepted'` preserved |
| Provider throws before returning ID | `'failed'`, `resend_message_id = null`. Likely retryable; **not guaranteed zero-risk** for connections that dropped after HTTP 200 |
| Provider timeout (no response, no ID) | `'failed'`, `resend_message_id = null`. **Ambiguous** — deferred to future Phase 3U Slice 7 reconciliation |

Code comments explicitly acknowledge: "timeout/no-ID failures can still be ambiguous" and avoid claiming "no provider ID = definitely not sent."

---

## 10. Proposal Follow-Up Action Comment Cleanup (Slice 4)

The Phase 3T action file (`modules/proposals/actions/proposal-follow-up-send.actions.ts`) previously contained a comment block (lines 53–60) describing the old pre-Phase-3U risk:

> *"If sendApprovedDraft's Resend call succeeds but Promise.all fails, resend_message_id is NOT persisted…"*

Slice 4 replaced this with:

> *"Phase 3U hardening (ef8eb2f): sendApprovedDraft now preserves provider-known send state via getBlockingSendForDraft, provider_accepted intermediate status, and hardened catch block that writes top-level resendMessageId. EMAIL_SENDING_ENABLED still remains the required delivery gate and must be enabled only through a separate explicit production readiness step."*

No runtime behavior changed in Slice 4. TC-3T-045 was updated to assert the new language.

---

## 11. QA Results

All commands run at `origin/master = 06454baade7060b0379091a1766e1f7d7f8b094f`.

### Git state (clean before creating this lock report)

```
06454ba Docs: align Phase 3T send comments with Phase 3U hardening
ef8eb2f Phase 3U: harden approved send reliability
fd9abea Docs: add Phase 3U Slice 2 implementation plan
c8c8ade Docs: add Phase 3U send reliability hardening design
7da8500 Docs: add Phase 3T approved send path lock report
99e2fa0 Phase 3T: add approved send UI control
ab342cc Phase 3T: add proposal follow-up approved send action
13bf464 Docs: add Phase 3T Slice 2 implementation plan
8991885 Docs: add Phase 3T approved send path design
8b56534 Docs: add Phase 3S follow-up draft generation lock report
12d82ac Phase 3S: add proposal follow-up draft UI control
b08d147 Phase 3S: add proposal follow-up draft generation backend
```

### Targeted tests

| Suite | Result |
|-------|--------|
| `tests/phase3u-send-reliability-hardening.test.ts` | **45 / 45 passing** |
| `tests/phase3t-proposal-follow-up-send.test.ts` | Passing |
| `tests/phase3t-approved-send-ui.test.ts` | Passing |

### Focused regression (Phase 3T + 3U)

| Result |
|--------|
| **154 / 154 passing** |

### Broader full suite (`npx vitest run`)

**2708 / 2709 passing.** One pre-existing failure unrelated to Phase 3U:

- `tests/phase3k-unified-draft-send-path.test.ts` — TC-3K-030 (`sets sourceAssetId to input.assetId`) — pre-existing, not introduced by Phase 3U

### Type check (`npx tsc --noEmit`)

No new TypeScript errors introduced by Phase 3U. Known pre-existing failures only:
- `tests/phase3h-send-safety-hardening.test.ts` — regex flag issue (pre-Phase 3R)
- `tests/quality-review-agent.test.ts` — duplicate property issue (pre-Phase 3R)

---

## 12. Source-Reading Test Coverage

### `tests/phase3u-send-reliability-hardening.test.ts` (45 tests)

| Area | Tests |
|------|-------|
| `getBlockingSendForDraft` export and status coverage | TC-3U-001–009 |
| `sendApprovedDraft` idempotency check replacement | TC-3U-010–015 |
| `'provider_accepted'` persistence ordering | TC-3U-016–023 |
| Catch block: provider-success/local-failure distinction | TC-3U-024–034 |
| Catch block: reasserts `status` and `resendMessageId` in provider-known branch | TC-3U-025b, 025c |
| Guardrails: no campaign flag, no mutation, no UI, no migration | TC-3U-035–043 |

### `tests/phase3t-proposal-follow-up-send.test.ts` (updated TC-3T-045)

TC-3T-045 now asserts:
- Action comment contains `'Phase 3U hardening'`
- Action comment contains `'provider_accepted'`
- Action comment contains `'EMAIL_SENDING_ENABLED still remains the required delivery gate'`

---

## 13. Guardrails Confirmed

| Guardrail | Status |
|-----------|--------|
| No migrations created | ✓ — `'provider_accepted'` is application-level; `status` is unconstrained string |
| No migrations applied | ✓ |
| Production untouched | ✓ |
| Vercel settings unchanged | ✓ |
| `EMAIL_SENDING_ENABLED` disabled | ✓ |
| `CAMPAIGN_SENDING_ENABLED` disabled | ✓ |
| No emails sent | ✓ |
| No campaign sending | ✓ |
| No automation or background jobs | ✓ |
| No Inngest | ✓ |
| No direct Resend calls from Phase 3U proposal action/UI | ✓ |
| No LLM / OpenAI / Anthropic | ✓ |
| No UI added in Phase 3U | ✓ |
| No send controls added in Phase 3U | ✓ |
| No proposal status mutation | ✓ |
| No commitment status mutation | ✓ |
| Complete / Skip / Reschedule behavior unchanged | ✓ |
| Phase 3S Generate Draft behavior unchanged | ✓ |
| Phase 3T approved send action behavior unchanged | ✓ |
| Phase 3T UI behavior unchanged | ✓ |
| Phase 3U tag not yet created | ✓ (pending final Codex review) |

---

## 14. Known Limitations and Carry-Forward Notes

1. **`EMAIL_SENDING_ENABLED` remains disabled.** Enabling it requires a separate explicit production readiness decision — outside Phase 3U scope.

2. **Provider timeout/no-ID ambiguity remains future scope.** Phase 3U does not solve the case where a provider connection drops before returning an ID. Future reconciliation (Phase 3U Slice 7) may address this via provider-side lookup.

3. **`'provider_accepted'` is application-guarded only.** The existing `email_sends_draft_active_unique` DB partial index does not cover `'provider_accepted'`. A future migration could extend it to `status IN ('queued','sent','provider_accepted')` or add a partial index on `resend_message_id IS NOT NULL`. Not required for Phase 3U.

4. **Future operator recovery UI.** If a send ends in `'provider_accepted'`/local-finalization-failed state, the operator currently has no in-app recovery path. A future slice can add recovery controls (re-link approval, clear/resolve ambiguous state).

5. **Source-reading tests only.** Phase 3U tests verify code structure and ordering. Future runtime/integration tests against a real Supabase instance would provide stronger guarantees of actual DB behavior.

6. **Pre-existing unrelated failures.** TC-3K-030 (`phase3k-unified-draft-send-path.test.ts`) remains a pre-existing failure unrelated to Phase 3U.

---

## 15. Lock Recommendation

Phase 3U is implementation-complete and QA-verified. The original Phase 3T blocker — provider-success/local-update failure leaving `resend_message_id` unset — is resolved.

**Recommended next steps:**

1. ✅ Submit this lock report for final Codex review
2. ✅ Commit and push the lock report
3. ✅ Create and push the annotated lock tag: `phase-3u-send-reliability-hardening-v1`

**The tag must not be created until final Codex review confirms PASS.**

After Phase 3U is locked, the remaining path to live email delivery:

| Option | Description | Prerequisite |
|--------|-------------|-------------|
| **A** | Create Phase 3U lock tag | Final Codex review PASS |
| **B** | Enable `EMAIL_SENDING_ENABLED` in non-production for testing | Phase 3U locked; separate operator decision |
| **C** | Provider timeout/no-ID reconciliation (Phase 3U Slice 7) | Separate design; lower priority than enabling |
| **D** | Apply production migration 20240039 (skip fields) | Separate explicit operator approval |
| **E** | Defer all of the above | Phase 3U stands complete; sending remains dormant |
