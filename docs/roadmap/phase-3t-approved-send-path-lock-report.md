# Phase 3T — Approved Send Path Lock Report

**Status:** QA complete — pending final Codex review before tag
**Created:** 2026-06-02
**Predecessor:** Phase 3S — Proposal Follow-Up Draft Generation (locked)
**Phase 3S lock tag:** `phase-3s-follow-up-draft-generation-v1` → `8b565347545bbb6c4ea032c5966841a56627cd28`
**origin/master at report time:** `99e2fa0e5f160d23840e753bd663f4e44d72f676`

> **⚠️ CRITICAL BLOCKER — must read Section 10 before enabling EMAIL_SENDING_ENABLED**

---

## 1. Executive Summary

Phase 3T designed and implemented a controlled approved-send path for proposal follow-up email drafts. Operators can now initiate sending of an already-approved follow-up draft from the queue UI. The send path reuses existing `sendApprovedDraft` infrastructure with a proposal-follow-up-specific context validation wrapper.

**Phase 3T did not:**
- Send any emails (EMAIL_SENDING_ENABLED remains disabled)
- Enable campaigns (CAMPAIGN_SENDING_ENABLED remains disabled)
- Add automation or background jobs
- Auto-complete commitments
- Mutate proposal status
- Add LLM generation
- Add direct Resend calls from proposal action/UI
- Add Inngest functions

**The active send path remains dormant while `EMAIL_SENDING_ENABLED` is false.** Approved drafts show "Email sending disabled" in the UI rather than an active send button.

---

## 2. Scope Completed

| Slice | Description | Type |
|-------|-------------|------|
| Slice 1 | Approved send path design | Documentation |
| Slice 2 | Implementation plan | Documentation |
| Slice 3 | Backend approved send action foundation | Code |
| Slice 4 | Approved send UI control + read-model | Code |
| Slice 5 | QA and lock report (this document) | Documentation |

---

## 3. Phase 3T Commits

| Hash | Message |
|------|---------|
| `8991885` | Docs: add Phase 3T approved send path design |
| `13bf464` | Docs: add Phase 3T Slice 2 implementation plan |
| `ab342cc` | Phase 3T: add proposal follow-up approved send action |
| `99e2fa0` | Phase 3T: add approved send UI control |

**Note on TC-3Q-116:** The Phase 3Q test `TC-3Q-116` (queue page does not reference EMAIL_SENDING_ENABLED) was updated as part of Slice 5 QA to account for Phase 3T's legitimate server-side flag read. This test update is bundled with the lock report commit and is not a code behavior change.

---

## 4. Files Added or Modified

### Documentation

| File | Description |
|------|-------------|
| `docs/roadmap/phase-3t-approved-send-path-design.md` | Phase 3T design (Slice 1) |
| `docs/roadmap/phase-3t-slice-2-approved-send-path-implementation-plan.md` | Implementation plan (Slice 2) |
| `docs/roadmap/phase-3t-approved-send-path-lock-report.md` | This file |

### Backend / Action

| File | Change | Description |
|------|--------|-------------|
| `modules/proposals/actions/proposal-follow-up-send.actions.ts` | New | `sendFollowUpDraftAction` — 10-step context validation + readiness + `sendApprovedDraft` |
| `modules/intelligence/types.agent.ts` | Modified | Added `PROPOSAL_FOLLOW_UP_DRAFT_SENT` constant |

### Queue / Read Model

| File | Change | Description |
|------|--------|-------------|
| `modules/proposals/repositories/proposal-follow-up-commitments.repo.ts` | Modified | Added `draft_status`/`draft_sent_at` to `ProposalFollowUpQueueItem` + tenant/workspace-scoped batch enrichment from `email_drafts` |

### UI

| File | Change | Description |
|------|--------|-------------|
| `app/(workspace)/[workspaceSlug]/proposal-follow-ups/SendFollowUpDraftButton.tsx` | New | Client component — 5-state machine, `useRef` in-flight guard, feature-flag and permission gating |
| `app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx` | Modified | Added `canSendEmail`, `emailSendingEnabled`, `SendFollowUpDraftButton` wiring |

### Tests

| File | Change | Description |
|------|--------|-------------|
| `tests/phase3t-proposal-follow-up-send.test.ts` | New | 48 tests — backend action context validation, ordering, guardrails |
| `tests/phase3t-approved-send-ui.test.ts` | New | 61 tests — Send UI component, permission/flag gating, queue wiring, read-model |
| `tests/phase3s-follow-up-draft-ui.test.ts` | Modified | TC-3S-UI-031 updated for Phase 3T legitimate EMAIL_SENDING_ENABLED page usage |
| `tests/phase3q-proposal-follow-up-queue-ui.test.ts` | Modified | TC-3Q-116 updated for Phase 3T legitimate EMAIL_SENDING_ENABLED page usage |

---

## 5. Backend Action Behavior

### `sendFollowUpDraftAction` (`modules/proposals/actions/proposal-follow-up-send.actions.ts`)

**Input:** `{ commitmentId }` — NOT `{ draftId }`

`draftId` is always derived server-side from `proposal_follow_up_commitments.draft_id`. This prevents this action from becoming a generic "send any approved draft by ID" wrapper.

**Validation order (10 steps before `sendApprovedDraft`):**

| Step | Check | Failure result |
|------|-------|---------------|
| A | `commitmentId` present | validation error |
| B | Load commitment scoped by `(tenant_id, workspace_id)` | `Commitment not found` |
| C | `commitment.draft_id` non-null | `No draft is linked` |
| D | Load draft scoped by `(tenant_id, workspace_id)`, `deleted_at = null` | `Draft not found` |
| D1 | `draft.workspace_id === ctx.workspaceId` (strict — closes nullable-workspace gap) | `Draft not found` |
| E | `draft.subject_type = 'proposal_follow_up_commitment'` | `Draft is not a proposal follow-up draft` |
| F | `draft.subject_id = commitmentId` | `Draft subject does not match commitment` |
| G | `draft.source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP` | `Draft has unexpected source type` |
| H | `draft.campaign_assignment_id = null` (blocks Phase 3M side-effect) | `Draft is campaign-assigned` |
| I | `draft.superseded_at = null` (fills `getEmailDraftForSending` gap) | `Draft has been superseded` |
| J | `checkDraftSendReadiness` (subject, body, approval_request_id, status) | `Draft is not ready to send` |
| K | `sendApprovedDraft(ctx, draftId)` | varies |

**Does NOT:**
- Call Resend directly
- Insert into `email_sends` directly
- Reference `CAMPAIGN_SENDING_ENABLED`
- Mutate `EMAIL_SENDING_ENABLED`
- Mutate `commitment_status`
- Mutate proposal status
- Call Complete / Skip / Reschedule actions

---

## 6. Permission Model

| Operation | Permission | Notes |
|-----------|-----------|-------|
| Generate Draft / Complete / Skip / Reschedule | `crm.leads.edit` | Phase 3R/3S mutations — unchanged |
| Send UI visibility | `messaging.send_emails` | Phase 3T — distinct from mutation authority |
| Send action enforcement | `messaging.send_emails` | Enforced by both action layer and `sendApprovedDraft` independently |

`crm.leads.edit` alone is not sufficient for send authority. This preserves a clear separation: proposal mutation rights and email send rights are distinct permissions, allowing operators to have one without the other.

The page derives both independently:
```typescript
canMutate    = hasPermission(ctx, 'crm.leads.edit')       // mutation controls
canSendEmail = hasPermission(ctx, 'messaging.send_emails') // send UI
```

Both fall back to `false` on auth error.

---

## 7. Feature Flag Model

| Flag | Value | Enforced by |
|------|-------|-------------|
| `EMAIL_SENDING_ENABLED` | **false (disabled)** | `sendApprovedDraft` independently; page `getBooleanControl` for UI gate |
| `CAMPAIGN_SENDING_ENABLED` | **false (disabled)** | Not used by Phase 3T — correctly excluded |

The page reads `EMAIL_SENDING_ENABLED` server-side:
```typescript
emailSendingEnabled = await getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, ctx.tenantId)
```

Falls back to `false` on error. Since the flag is disabled, approved drafts show "Email sending disabled" rather than an active Send button.

**Three conditions must all be true for an active Send button to appear:**
1. `canSendEmail = true` (operator has `messaging.send_emails`)
2. `emailSendingEnabled = true` (flag is enabled)
3. `draftStatus = 'approved'`

With `EMAIL_SENDING_ENABLED = false`, condition 2 is never met.

---

## 8. UI Behavior

### `SendFollowUpDraftButton`

| State | Display |
|-------|---------|
| `draftStatus = null` | Returns `null` — nothing rendered |
| `draftStatus = 'pending_approval'` | "Draft pending approval" (read-only) |
| `draftStatus = 'approved'` + `emailSendingEnabled = false` | "Email sending disabled" (read-only) |
| `draftStatus = 'approved'` + `emailSendingEnabled = true` | "Send Email" button (active) |
| confirming | "Send this follow-up email?" + Confirm / Cancel |
| loading | "Sending…" + spinner |
| success | "Sent" (green) + `router.refresh()` |
| error | Red error message + Dismiss |

**Key design properties:**
- `commitmentId` is the primary prop — not `draftId`
- Calls `sendFollowUpDraftAction({ commitmentId })`
- `useRef` in-flight guard prevents fast double-submit before React re-render
- No auto-complete of commitment after send
- No campaign/launch/blast language
- No Complete / Skip / Reschedule calls
- Gated by `canSendEmail` block (separate from `canMutate` block)

---

## 9. Read-Model Behavior

`ProposalFollowUpQueueItem` now includes:
- `draft_status: string | null` — current `email_drafts.status` for the linked draft
- `draft_sent_at: string | null` — `email_drafts.sent_at` for the linked draft

These are populated by a **single batch query** after commitment rows are loaded:

```typescript
const draftIds = [...new Set(commitments.map(c => c.draft_id).filter(Boolean))]
// One query, not N+1:
.from('email_drafts').select('id, status, sent_at')
.in('id', draftIds).eq('tenant_id', tenantId).eq('workspace_id', workspaceId)
```

Both `tenant_id` and `workspace_id` are applied — prevents a cross-workspace draft status from appearing if a `draft_id` were malformed.

`draft_status` and `draft_sent_at` are strictly read-only. No mutation path was added. No migration was needed (`email_drafts.status` and `sent_at` have always existed).

---

## 10. Provider-Success/Local-Update Failure — CRITICAL BLOCKER

> **This section must be resolved before `EMAIL_SENDING_ENABLED` is enabled in any environment.**

### Confirmed behavior in `sendApprovedDraft`

`sendApprovedDraft` creates an `email_sends` record (`status = 'queued'`) before calling Resend. After a successful Resend call:

```typescript
await Promise.all([
  emailSendRepo.updateEmailSend(emailSend.id, { status: 'sent', resendMessageId, ... }),
  emailDraftRepo.updateDraftStatus(draftId, { status: 'sent', ... }),
])
```

### The risk

If the Resend call **succeeds** but `Promise.all` **fails** (either update throws):

1. The email was actually sent to the recipient
2. The catch block runs: `emailSendRepo.updateEmailSend(emailSend.id, { status: 'failed', ... })`
3. `resend_message_id` was captured before the failed update — but it is NOT passed to the catch-block update
4. `email_sends` ends up showing `status = 'failed'` with **no `resend_message_id`**
5. `email_drafts` stays `'approved'`
6. The function returns `{ ok: false }` to the caller

**Result:** From the database alone, it is impossible to determine whether the email was delivered. A retry would create a new `email_sends` record and attempt another provider call — potentially sending the email twice.

### Phase 3T decision

Phase 3T intentionally did not harden this in Slice 3 or Slice 4. The implementation was merged while `EMAIL_SENDING_ENABLED` remains disabled, providing a safe staging environment.

### Required before enabling

Before `EMAIL_SENDING_ENABLED` is set to `true` in any environment:

1. Harden `sendApprovedDraft` to persist `resend_message_id` in the catch block update
2. OR add a reconciliation pass that detects `email_sends` rows in `'queued'`/`'failed'` state with no `resend_message_id` and cross-references the provider
3. Confirm whether `send-bridge/` reconciliation covers this scenario for follow-up sends

Until one of these is implemented and tested, enabling `EMAIL_SENDING_ENABLED` carries a silent duplicate-send risk.

---

## 11. Commitment / Proposal Mutation Rule

| Action | Who does it | Mechanism |
|--------|-------------|-----------|
| Generate draft | Phase 3S operator | `generateFollowUpDraftAction` |
| Approve draft | Human approver | Existing HRB approval bridge |
| Send email | Phase 3T operator | `sendFollowUpDraftAction` → `sendApprovedDraft` |
| Mark commitment complete | Phase 3R operator | `completeFollowUpCommitmentAction` |

**Sending does not auto-complete the commitment.** After a successful send, the operator sees "Sent" on the draft. Any future "Email sent — mark follow-up complete?" UX must be a non-blocking explicit prompt that calls the existing `completeFollowUpCommitmentAction` only after operator confirmation. This was not added in Phase 3T.

---

## 12. QA Results

All commands run at `origin/master = 99e2fa0e5f160d23840e753bd663f4e44d72f676`.

### Git state

```
(Working tree before creating the lock report was clean; current Slice 5 review
state contains this untracked lock report and the TC-3Q-116 test-maintenance update.)

99e2fa0 Phase 3T: add approved send UI control
ab342cc Phase 3T: add proposal follow-up approved send action
13bf464 Docs: add Phase 3T Slice 2 implementation plan
8991885 Docs: add Phase 3T approved send path design
8b56534 Docs: add Phase 3S follow-up draft generation lock report
12d82ac Phase 3S: add proposal follow-up draft UI control
b08d147 Phase 3S: add proposal follow-up draft generation backend
332a58e Docs: add Phase 3S Slice 2 implementation plan
3e73e3a Docs: add Phase 3S follow-up draft generation design
cf868ca Docs: add Phase 3R controlled follow-up mutations lock report
c471bf2 Phase 3R: polish follow-up queue mutation controls
8bfb58a Phase 3R: add reschedule follow-up UI control
```

### Targeted tests

| Suite | Result |
|-------|--------|
| `tests/phase3t-proposal-follow-up-send.test.ts` | **48 / 48 passing** |
| `tests/phase3t-approved-send-ui.test.ts` | **61 / 61 passing** |

### Focused regression (Phase 3S + 3T)

| Suite | Result |
|-------|--------|
| All four test files | **247 / 247 passing** |

### Broader full suite (`npx vitest run`)

**2663 / 2664 passing.** One pre-existing failure unrelated to Phase 3T:

- `tests/phase3k-unified-draft-send-path.test.ts` — TC-3K-030 (`sets sourceAssetId to input.assetId`) — pre-existing, not introduced by Phase 3T

One new regression from Phase 3T Slice 4 (resolved in Slice 5):

- `tests/phase3q-proposal-follow-up-queue-ui.test.ts` — TC-3Q-116 was checking that the queue page does not reference `EMAIL_SENDING_ENABLED`. Phase 3T Slice 4 legitimately added a server-side flag read to the page. TC-3Q-116 updated in this Slice 5 QA pass to remove the now-invalid assertion while preserving the CAMPAIGN_SENDING_ENABLED guard.

### Type check (`npx tsc --noEmit`)

No new TypeScript errors introduced by Phase 3T. Known pre-existing failures only:
- `tests/phase3h-send-safety-hardening.test.ts` — regex flag issue (pre-Phase 3R)
- `tests/quality-review-agent.test.ts` — duplicate property issue (pre-Phase 3R)

---

## 13. Source-Reading Test Coverage

### `tests/phase3t-proposal-follow-up-send.test.ts` (48 tests)

| Area | Tests |
|------|-------|
| Action shape: use server, export, commitmentId input, no public draftId | TC-3T-001–010 |
| Context validation: commitment/draft scope, subject_type/id, source_type, campaign_assignment_id, superseded_at | TC-3T-011–022 |
| Readiness ordering: checkDraftSendReadiness before sendApprovedDraft | TC-3T-023–029 |
| Send delegation: sendApprovedDraft called, no direct Resend/email_sends | TC-3T-030–042 |
| Activity event: PROPOSAL_FOLLOW_UP_DRAFT_SENT constant and emission | TC-3T-043–044 |
| Provider-success/local-update failure documentation | TC-3T-045 |
| Phase 3R/3S regression guard | TC-3T-046–047 |
| Workspace scope fix: strict workspace validation | TC-3T-016b |

### `tests/phase3t-approved-send-ui.test.ts` (61 tests)

| Area | Tests |
|------|-------|
| SendFollowUpDraftButton: use client, import shape, props, no direct imports | TC-3T-UI-001–012 |
| Feature-flag and permission gating logic | TC-3T-UI-013–014 |
| State machine: pending/disabled/Send Email/confirming/loading/success/error | TC-3T-UI-015–027 |
| In-flight guard (useRef), useTransition | TC-3T-UI-019–020, 025 |
| No auto-complete, no campaign language | TC-3T-UI-026–030 |
| Queue page: canSendEmail separate from canMutate | TC-3T-UI-031b–031e |
| Queue page wiring and flag derivation | TC-3T-UI-031–042 |
| Read-model: draft_status/draft_sent_at DTO, batch load, workspace scope | TC-3T-UI-043–049 |
| Safety guardrails | TC-3T-UI-050–056 |

---

## 14. Guardrails Confirmed

| Guardrail | Status |
|-----------|--------|
| No migrations created | ✓ — no new schema changes needed |
| No migrations applied to any environment | ✓ |
| Production untouched | ✓ |
| Vercel settings unchanged | ✓ |
| `EMAIL_SENDING_ENABLED` disabled | ✓ — reads for flag gating only; never set `true` |
| `CAMPAIGN_SENDING_ENABLED` disabled | ✓ — not referenced in any Phase 3T file |
| No emails sent | ✓ |
| No campaign sending | ✓ |
| No automation or background jobs | ✓ |
| No Inngest | ✓ |
| No direct Resend calls from Phase 3T proposal action/UI | ✓ |
| No LLM / OpenAI / Anthropic | ✓ |
| No proposal status mutation | ✓ |
| No commitment status mutation from send path | ✓ |
| Complete / Skip / Reschedule behavior unchanged | ✓ |
| Phase 3S Generate Draft behavior unchanged | ✓ |
| Phase 3T tag not yet created | ✓ (pending final Codex review) |

---

## 15. Known Limitations and Carry-Forward Notes

1. **Provider-success/local-update failure (CRITICAL):** Must be resolved or explicitly hardened before `EMAIL_SENDING_ENABLED` is enabled in any environment. See Section 10 for details.

2. **Active send path is dormant:** All Phase 3T send infrastructure is deployed and source-reading tested, but no email can be sent while `EMAIL_SENDING_ENABLED = false`. Enabling requires a separate explicit operator decision.

3. **Runtime component tests:** Source-reading tests verify the `useRef` in-flight guard. Future runtime interaction tests (e.g., Testing Library fast double-click simulation) would provide stronger guarantees for the actual browser behavior.

4. **Full-suite pre-existing failure:** TC-3K-030 in `phase3k-unified-draft-send-path.test.ts` remains a pre-existing failure unrelated to Phase 3T. It should be tracked and fixed separately.

5. **Future "mark complete?" UX:** After a send, the UI shows "Sent" only. A future "Email sent — mark follow-up complete?" prompt must be designed as a non-blocking, explicit operator action calling `completeFollowUpCommitmentAction`. This was not added in Phase 3T.

6. **Production migration 20240039:** The skip fields migration (`skipped_at`, `skipped_reason`, `skipped_by_user_id`) has not been applied to production. Phase 3T does not depend on it for the send path, but it should be resolved before any skip-related functionality is used in production.

---

## 16. Lock Recommendation

Phase 3T is implementation-complete and QA-verified. Test results, guardrails, and behavioral documentation are all confirmed.

**Items before tag creation:**
1. ✅ Codex review of this lock report — **pending**
2. ✅ Commit the lock report + TC-3Q-116 test fix together
3. ✅ Push the commit

If final Codex review passes, create and push an annotated lock tag:

```
phase-3t-approved-send-path-v1
```

pointing to the lock report commit.

**The tag must not be created until final Codex review confirms PASS.**

After the Phase 3T tag is confirmed, the options are:

| Option | Description | Prerequisite |
|--------|-------------|-------------|
| **A** | Create and push Phase 3T lock tag | Final Codex review PASS |
| **B** | Harden provider-success/local-update failure in `sendApprovedDraft` | Required before enabling EMAIL_SENDING_ENABLED |
| **C** | Enable `EMAIL_SENDING_ENABLED` in a non-production environment for testing | Requires Option B + separate operator decision |
| **D** | Apply production migration 20240039 | Requires separate explicit operator approval |
| **E** | Defer all of the above | Phase 3T stands complete with send UI dormant |
