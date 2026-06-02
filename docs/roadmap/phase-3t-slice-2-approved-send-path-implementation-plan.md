# Phase 3T Slice 2 — Approved Send Path Implementation Plan

**Status:** Planning only — no implementation started
**Created:** 2026-06-02
**Predecessor:** Phase 3T Slice 1 — [Approved Send Path Design](phase-3t-approved-send-path-design.md)
**Phase 3S lock tag:** `phase-3s-follow-up-draft-generation-v1` → `8b565347545bbb6c4ea032c5966841a56627cd28`
**origin/master at plan time:** `899188594f876884f5a1f4ce8963f5c572f174bb`

---

## 1. Purpose

This document translates the Phase 3T Slice 1 design into a concrete, reviewable implementation plan for sending one already-approved proposal follow-up email draft through an explicit operator action.

When implemented, this plan will allow an operator to send a proposal follow-up draft that has been approved through the existing approval bridge. **No email is sent by this planning slice.**

**This document is planning only. It creates no code, no migrations, and no tags.**

**This plan does NOT:**
- Send emails
- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Add campaign sending
- Add automation or background jobs
- Mutate commitment status
- Mutate proposal status

---

## 2. Current Locked Foundation

| Item | Status |
|------|--------|
| Phase 3S lock tag | `phase-3s-follow-up-draft-generation-v1` confirmed |
| Phase 3T design doc | Pushed to origin — `8991885` |
| `sendApprovedDraft` | Exists in `modules/messaging/services/email-send.service.ts` |
| `email_sends` table + active-send duplicate index | Exists (migration `20240013`) |
| `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` | Exist in `ActivityEventType` |
| `EMAIL_SENDING_ENABLED` | **Disabled** — must remain disabled |
| `CAMPAIGN_SENDING_ENABLED` | **Disabled** — not relevant to Phase 3T |
| Production | Untouched |

---

## 3. Scope of Future Implementation

### Phase 3T Slice 3 — backend only (no UI)

- Add `modules/proposals/actions/proposal-follow-up-send.actions.ts`
- Reuse existing `sendApprovedDraft` — no new send engine
- Add proposal-follow-up context validation before calling `sendApprovedDraft`
- Add `PROPOSAL_FOLLOW_UP_DRAFT_SENT` activity event constant (additive)
- Add source-reading tests in `tests/phase3t-proposal-follow-up-send.test.ts`
- **No UI in Slice 3**
- **No migration** unless schema proves one absolutely required (not expected)

### Phase 3T Slice 4 — UI control (separate slice)

- Add `SendFollowUpDraftButton` component
- Wire into queue page
- UI source-reading tests

---

## 4. Pre-Implementation Verification: `sendApprovedDraft` Confirmed Behavior

Before any code is written, the following was verified by reading the actual service source:

### Confirmed in `sendApprovedDraft` (email-send.service.ts)

| Check | Confirmed |
|-------|-----------|
| `requirePermission(ctx, 'messaging.send_emails')` (line 50) | ✓ |
| `EMAIL_SENDING_ENABLED` system control gate (line 56–62) | ✓ |
| Draft fetch scoped by `(tenant_id, workspace_id)` via `getEmailDraftForSending` | ✓ |
| `deleted_at IS NULL` filter in `getEmailDraftForSending` | ✓ |
| Lifecycle double-gate: `email_drafts.status = 'approved'` AND `approval_request.status = 'approved'` (lines 75–94) | ✓ |
| `approval_request_id` required on draft (line 82–84) | ✓ |
| Idempotency: `getActiveSendForDraft` blocks existing queued/sent (lines 96–104) | ✓ |
| Contact/recipient validation (do_not_contact, email) (lines 106–119) | ✓ |
| Suppression check on `draft.to_email` (lines 123–130) | ✓ |
| Rate limit (lines 132–138) | ✓ |
| Sender identity (lines 140–151) | ✓ |
| `email_sends` INSERT status `'queued'` before provider call (lines 173–195) | ✓ |
| `ET_SEND_INITIATED` emitted (line 200) | ✓ |
| `campaign_assignment_id` side-effect via `campaignAssignmentService.completeCampaignAssignment` when non-null (line 299) | ✓ — **must guard against** |

### Confirmed NOT in `sendApprovedDraft` — Phase 3T wrapper must add

| Check | Confirmed absent |
|-------|-----------------|
| `checkDraftSendReadiness` call | ✓ absent — wrapper must call it |
| Subject presence check | ✓ absent — subject passed directly to Resend; null subject would fail at provider, not safely before |
| Body presence check (`body_html` or `body_text`) | ✓ absent — fallback `<p></p>` sent on null body |
| `superseded_at IS NULL` filter in `getEmailDraftForSending` | ✓ absent — superseded drafts **can currently be sent** |

These are confirmed gaps. The Phase 3T wrapper must address all four before calling `sendApprovedDraft`.

---

## 5. Mandatory Context Validation Plan

The Phase 3T proposal-follow-up send action must NOT be a generic "send any approved draft by draftId" wrapper. It must validate proposal-follow-up context before delegating to `sendApprovedDraft`.

### Preferred action input shape

```typescript
// Input: { commitmentId } — NOT { draftId }
// draftId is resolved server-side from proposal_follow_up_commitments.draft_id
```

Using `commitmentId` as input means the caller can never bypass context validation by supplying an arbitrary `draftId`. The `draftId` is always server-derived from the commitment's back-link.

### Required context validation steps (in order, before calling `sendApprovedDraft`)

```
1. Load proposal_follow_up_commitments row:
   - eq('id', commitmentId)
   - eq('tenant_id', ctx.tenantId)
   - eq('workspace_id', ctx.workspaceId)
   → fail: commitment_not_found

2. Verify commitment.draft_id IS NOT NULL
   → fail: no_draft_linked

3. Load email_drafts row:
   - eq('id', commitment.draft_id)
   - eq('tenant_id', ctx.tenantId)
   - eq('workspace_id', ctx.workspaceId)
   → fail: draft_not_found

4. Verify email_drafts.subject_type = 'proposal_follow_up_commitment'
   → fail: draft_not_proposal_follow_up

5. Verify email_drafts.subject_id = commitmentId
   → fail: draft_commitment_mismatch

6. Verify email_drafts.source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP ('future_follow_up')
   → fail: draft_wrong_source_type

7. Verify email_drafts.campaign_assignment_id IS NULL
   → fail: draft_is_campaign_assigned (prevents campaign side-effect)

8. Verify email_drafts.superseded_at IS NULL
   → fail: draft_is_superseded
   (fills confirmed gap in sendApprovedDraft / getEmailDraftForSending)

9. Call checkDraftSendReadiness (subject, body, approval_request_id, status)
   → fail: readiness_blocked with blockedReasons

10. Call sendApprovedDraft(ctx, commitment.draft_id)
```

Step 8 addresses the confirmed gap: `getEmailDraftForSending` does not filter `superseded_at`. The wrapper must check this explicitly.

Steps 9 calls `checkDraftSendReadiness` explicitly — confirmed not called by `sendApprovedDraft`.

Steps 4–7 enforce that this action can only send proposal follow-up drafts, not arbitrary approved drafts.

---

## 6. Permission Model Decision

**Resolved: `messaging.send_emails` is required. `crm.leads.edit` alone is not sufficient.**

This is confirmed by reading `email-send.service.ts` line 50:
```typescript
requirePermission(ctx, 'messaging.send_emails')
```

### Recommendation: `messaging.send_emails` only for send action

The proposal-follow-up send action requires `messaging.send_emails`. This is enforced at two layers:
1. The Phase 3T action: `requirePermission(ctx, 'messaging.send_emails')` before any DB calls
2. `sendApprovedDraft` itself: independent enforcement even if the action check were bypassed

**`crm.leads.edit` alone is explicitly excluded** as the sole gate. Operators who can edit leads but not send email must not be able to send via this action.

**Dual permission option (conservative):** Require both `messaging.send_emails` AND `crm.leads.edit`. This ensures the operator has both send authority and proposal follow-up mutation access. This adds no safety benefit beyond `messaging.send_emails` alone (since `sendApprovedDraft` enforces the send gate independently), but may be appropriate if the team wants to restrict proposal follow-up sends to users who also have mutation rights.

**Final decision to make in Slice 3 code review:** Either single `messaging.send_emails` or dual. Recommendation: **single `messaging.send_emails`** for simplicity, with a comment in the action explaining the rationale.

---

## 7. Readiness and Hardening Plan

`sendApprovedDraft` does not call `checkDraftSendReadiness`. The Phase 3T wrapper must call it explicitly before calling `sendApprovedDraft`.

### Wrapper pre-flight checks (required in Slice 3)

The Phase 3T action must call `checkDraftSendReadiness` with a `DraftReadinessContext` appropriate for a `FUTURE_FOLLOW_UP` source type. If `checkDraftSendReadiness` returns `ready: false`, the action must return a failure with `blockedReasons` before calling `sendApprovedDraft`.

Specifically blocked by `checkDraftSendReadiness`:
- `missing_recipient` (`to_email` null)
- `missing_subject` (`subject` null)
- `missing_body` (both `body_html` and `body_text` null)
- `draft_not_approved` (`status ≠ 'approved'`)
- `missing_approval_request` (`approval_request_id` null)

### `superseded_at` gap (confirmed)

`getEmailDraftForSending` does NOT filter `superseded_at IS NULL`. Phase 3T wrapper must explicitly check `email_drafts.superseded_at IS NULL` (step 8 in Section 5) before calling `sendApprovedDraft`. This ensures a superseded draft cannot be sent even though `sendApprovedDraft` would not block it internally.

### Subject/body safety net (resolved by wrapper)

`sendApprovedDraft` passes `draft.body_html ?? <p>draft.body_text</p>` directly to Resend when body is null. This would send a blank email body. `checkDraftSendReadiness` blocks `missing_body` before the provider call — this is why the readiness check is required, not optional.

---

## 8. Feature Flag Plan

| Flag | Role | Phase 3T behavior |
|------|------|------------------|
| `EMAIL_SENDING_ENABLED` | Server-side gate for actual sending | Must be `false` during implementation; `sendApprovedDraft` enforces it; this plan can be merged while flag remains off |
| `CAMPAIGN_SENDING_ENABLED` | Campaign automation gate | Not relevant to Phase 3T; must not appear in any Phase 3T file |

The Phase 3T implementation can be merged to `master` with `EMAIL_SENDING_ENABLED = false`. This allows:
- Testing the action logic (returns `sending_disabled_by_system_control` cleanly)
- UI development and review
- Operator confirmation before actual sends go live

Enablement of `EMAIL_SENDING_ENABLED` requires a separate explicit operator decision and is not part of any Phase 3T code slice.

---

## 9. Campaign Assignment Side-Effect Control

`sendApprovedDraft` calls `campaignAssignmentService.completeCampaignAssignment(draft.campaign_assignment_id)` when `campaign_assignment_id` is non-null (confirmed: `email-send.service.ts` line 299).

Phase 3S sets `campaign_assignment_id = null` in `createFollowUpEmailDraft`. However, the Phase 3T action must **not rely on Phase 3S behavior** as a safety guarantee — it must explicitly validate:

```typescript
if (draft.campaign_assignment_id !== null) {
  return { success: false, error: 'draft_is_campaign_assigned' }
}
```

This is step 7 in Section 5. Failing here prevents:
- Accidental campaign assignment completion from a follow-up send
- Scope creep: Phase 3T remains isolated from campaign workflows
- `CAMPAIGN_SENDING_ENABLED` from being a relevant consideration for this path

---

## 10. Partial Failure and Reconciliation Plan

### Confirmed failure behavior from service code

| Scenario | Current behavior |
|----------|-----------------|
| `email_sends` INSERT fails | Returns `{ ok: false, reason }` before Resend call — clean, no provider interaction |
| Provider call fails | `email_sends → 'failed'`; draft stays `'approved'`; retry safe (idempotency guard active) |
| Provider call succeeds, `email_sends` status update fails | **Risk.** `email_sends` may remain `'queued'` with `resend_message_id` set but `status` not updated. `send-bridge/` exists but coverage is unconfirmed for follow-up sends. |
| Provider timeout/unknown | `email_sends` stays `'queued'`. Retry hits idempotency guard (safe from double-send). Operator sees "already in progress." |
| `email_drafts` status update fails after successful send | `email_drafts` stays `'approved'` despite sent email. `email_sends` record is authoritative. |
| Activity event fails | Non-fatal — partial success, same pattern as Phase 3R/3S |

### Phase 3T Slice 3 hardening obligation

Before `EMAIL_SENDING_ENABLED` is enabled, Phase 3T Slice 3 must:
1. Verify whether `send-bridge/` reconciliation covers the provider-success/local-update-failure case for follow-up sends.
2. If not covered: add explicit hardening (update `email_sends.status` and `email_drafts.status` in a try/catch with independent error handling).
3. Add source-reading tests that verify the failure state behavior.
4. Document the decision in the implementation commit message.

Do not enable `EMAIL_SENDING_ENABLED` until this is confirmed.

### Retry safety

The `email_sends_draft_active_unique` partial index prevents duplicate `email_sends` rows for the same `draftId` in `'queued'` or `'sent'` status. A retry after a clean failure (provider not called) is safe. A retry after a `'queued'` or `'sent'` record exists returns `duplicate_send_blocked` — operator must inspect the existing record.

---

## 11. Repository / Service / Action Structure

### New file: `modules/proposals/actions/proposal-follow-up-send.actions.ts`

```typescript
'use server'

// Input: { commitmentId?: string }  ← NOT draftId
// Permission: requirePermission(ctx, 'messaging.send_emails')
// Context: buildRequestContext(supabase) — tenantId, workspaceId, userId from server session
//
// Steps (in order):
//   1. Validate commitmentId present
//   2. requirePermission(ctx, 'messaging.send_emails')
//   3. Load commitment (tenant/workspace scoped)
//   4. Verify commitment.draft_id non-null
//   5. Load draft (tenant/workspace scoped)
//   6. Proposal-follow-up context checks (subject_type, subject_id, source_type, campaign_assignment_id)
//   7. superseded_at check
//   8. checkDraftSendReadiness
//   9. sendApprovedDraft(ctx, draftId)
//  10. Optionally emit PROPOSAL_FOLLOW_UP_DRAFT_SENT event
//  11. Return ActionResult<{ sendId, draftId, commitmentId }>
//
// Does NOT:
//   - Call Resend directly
//   - Insert into email_sends directly
//   - Mutate commitment_status
//   - Mutate proposal status
//   - Reference CAMPAIGN_SENDING_ENABLED
//   - Import Resend/Inngest/OpenAI/Anthropic
```

### Optional: activity event constant

If `PROPOSAL_FOLLOW_UP_DRAFT_SENT` is added to `ActivityEventType`:

```typescript
// Phase 3T — Proposal Follow-Up Send (additive)
PROPOSAL_FOLLOW_UP_DRAFT_SENT: 'proposal_follow_up_draft_sent',
```

Emitted in the action (or a thin follow-up wrapper service) after `sendApprovedDraft` returns `ok: true`. Properties: `draft_id`, `send_id`, `commitment_id`, `actor_user_id`, `subject_type`, `subject_id`, `schedule_rule_key`, `follow_up_sequence`, `proposal_event_id`.

### Reuse (do not recreate)

| Existing component | Used by |
|-------------------|---------|
| `sendApprovedDraft` | Called from new action after all proposal-follow-up context checks |
| `checkDraftSendReadiness` | Called from new action before `sendApprovedDraft` |
| `getEmailDraftForSending` | Used inside `sendApprovedDraft` — no direct call needed from action |
| `getActiveSendForDraft` | Used inside `sendApprovedDraft` — no direct call needed from action |
| `email_sends_draft_active_unique` DB index | Enforced automatically on `createEmailSend` inside `sendApprovedDraft` |

---

## 12. UI Implementation Plan (Phase 3T Slice 4)

Planning only — no UI in Slice 3.

### `SendFollowUpDraftButton` component

**Primary prop: `commitmentId` — NOT `draftId`**

The component must not accept `draftId` as the trigger input. Sending by `draftId` alone from the UI would bypass context validation at the component layer.

```typescript
interface SendFollowUpDraftButtonProps {
  commitmentId: string
  draftStatus: string | null     // from queue DTO draft status, if available
  emailSendingEnabled: boolean   // server-derived, passed from page
  disabled?: boolean
}
```

Display logic:
- Show only when `draftStatus = 'approved'` AND `emailSendingEnabled = true`
- If `draftStatus = 'approved'` but `emailSendingEnabled = false`: show "Email sending is disabled" indicator (not an active button)
- `useRef` in-flight guard (same pattern as `GenerateFollowUpDraftButton`)
- Confirmation step: "Send this follow-up email? This cannot be undone."
- No campaign send language ("Send Email" not "Send Campaign" or "Launch")
- After success: "Sent" state + `router.refresh()`
- Optional non-blocking prompt: "Email sent — mark follow-up complete?" (hint only, no auto-mutation)

### Queue DTO additions needed for Slice 4

The queue DTO (`ProposalFollowUpQueueItem`) already exposes `draft_id`. Slice 4 may need to also expose `draft_status` (the current `email_drafts.status` for the linked draft). This requires either:
- A join/enrichment in `listProposalFollowUpQueueItemsForWorkspace`, or
- A separate query per row (avoid — N+1 risk)

Preferred: batch-load email_draft statuses for all non-null `draft_id` values in the same pattern as the existing `proposal_events` batch-load. Decision to be made in Slice 4.

---

## 13. Commitment / Proposal Mutation Rule

**Send never auto-completes or auto-mutates the commitment or proposal.**

| State | Who controls it | How |
|-------|----------------|-----|
| Commitment `commitment_status` | Phase 3R operator action | `completeFollowUpCommitmentAction` |
| Proposal `proposal_status` | Separate proposal status path | Not Phase 3T |
| Email sent | Phase 3T operator action | `sendFollowUpDraftAction` |

After a successful send, the operator sees "Sent" on the draft. A non-blocking "Mark follow-up complete?" prompt may be shown, but it must call the existing explicit `completeFollowUpCommitmentAction` — never auto-mutate.

---

## 14. Data Model / Migration Plan

**No migration expected for Phase 3T Slice 3.**

| Item | Status | Notes |
|------|--------|-------|
| `email_sends` table | Exists (migration 20240013) | No change needed |
| `email_sends_draft_active_unique` index | Exists | No change needed |
| `proposal_follow_up_commitment_id` FK on `email_sends` | Not present | Optional future optimization; not required for Phase 3T |
| `superseded_at` filter on `getEmailDraftForSending` | Missing — confirmed gap | Phase 3T wrapper checks this explicitly in step 8; no migration needed |
| Draft status column on queue DTO | Not yet exposed | Needed for Slice 4 UI; requires enrichment, not migration |

If a `proposal_follow_up_commitment_id` FK were added to `email_sends`, it would require a migration. This is a future optimization only — the transitive link via `email_drafts.subject_id` is sufficient for Phase 3T.

---

## 15. Testing Plan

Test file: `tests/phase3t-proposal-follow-up-send.test.ts`

Pattern: `fs.readFileSync + toContain / not.toContain / regex` (source-reading tier).

### Action / context validation tests

- `TC-3T-001`: action file exists with `'use server'`
- `TC-3T-002`: `sendFollowUpDraftAction` exported
- `TC-3T-003`: action accepts `commitmentId` input (NOT `draftId`)
- `TC-3T-004`: action requires `messaging.send_emails`
- `TC-3T-005`: action validates `commitmentId` presence
- `TC-3T-006`: action loads commitment scoped by `(tenant_id, workspace_id)`
- `TC-3T-007`: action derives `draftId` from `commitment.draft_id`
- `TC-3T-008`: action loads draft scoped by `(tenant_id, workspace_id)`
- `TC-3T-009`: action validates `email_drafts.subject_type = 'proposal_follow_up_commitment'`
- `TC-3T-010`: action validates `email_drafts.subject_id = commitmentId`
- `TC-3T-011`: action validates `email_drafts.source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP`
- `TC-3T-012`: action validates `email_drafts.campaign_assignment_id IS NULL`
- `TC-3T-013`: action validates `email_drafts.superseded_at IS NULL`
- `TC-3T-014`: action calls `checkDraftSendReadiness` before `sendApprovedDraft`
- `TC-3T-015`: action calls `sendApprovedDraft` after all context checks
- `TC-3T-016`: action rejects non-follow-up drafts (`subject_type ≠ 'proposal_follow_up_commitment'`)
- `TC-3T-017`: action rejects campaign-assigned drafts (`campaign_assignment_id` non-null)
- `TC-3T-018`: action rejects superseded drafts

### Safety tests

- `TC-3T-019`: action does not call Resend directly
- `TC-3T-020`: action does not insert into `email_sends` directly
- `TC-3T-021`: action does not reference `CAMPAIGN_SENDING_ENABLED`
- `TC-3T-022`: action does not import Resend/Inngest/OpenAI/Anthropic
- `TC-3T-023`: action does not mutate `commitment_status`
- `TC-3T-024`: action does not mutate proposal status
- `TC-3T-025`: `EMAIL_SENDING_ENABLED` gate is enforced via `sendApprovedDraft` (not bypassed)

### Readiness tests

- `TC-3T-026`: `missing_recipient` blocked before provider call
- `TC-3T-027`: `missing_subject` blocked before provider call
- `TC-3T-028`: `missing_body` blocked before provider call
- `TC-3T-029`: `missing_approval_request` blocked before provider call
- `TC-3T-030`: `draft_not_approved` blocked before provider call
- `TC-3T-031`: superseded draft blocked before provider call

### Activity event tests (if constant is added)

- `TC-3T-032`: `ActivityEventType` includes `PROPOSAL_FOLLOW_UP_DRAFT_SENT` constant
- `TC-3T-033`: `PROPOSAL_FOLLOW_UP_DRAFT_SENT` is emitted after successful send

### UI tests (future Slice 4 — not in Slice 3)

- `SendFollowUpDraftButton` uses `commitmentId` prop
- Not shown for `pending_approval` drafts
- Not shown when `emailSendingEnabled = false`
- Shows disabled message when sending is disabled
- Confirmation required before send
- `useRef` in-flight guard present
- No campaign send language
- No auto-complete of commitment on success

---

## 16. Risk Controls

| Risk | Mitigation |
|------|-----------|
| Generic "send any approved draft" escape hatch | `commitmentId`-only input; steps 4–7 validate proposal-follow-up context |
| Sending non-follow-up draft | `subject_type` check (step 4) rejects non-follow-up drafts |
| Campaign assignment side effect | `campaign_assignment_id IS NULL` check (step 7) blocks before `sendApprovedDraft` |
| Sending superseded draft | `superseded_at IS NULL` check (step 8) fills confirmed gap in `getEmailDraftForSending` |
| Missing subject/body reaching provider | `checkDraftSendReadiness` (step 9) blocks before `sendApprovedDraft` |
| Sending when `EMAIL_SENDING_ENABLED = false` | `sendApprovedDraft` enforces independently; action does not bypass |
| Duplicate sends | DB `email_sends_draft_active_unique` index + `getActiveSendForDraft` application check |
| Provider success / local update failure | High risk — must be hardened or confirmed before enabling `EMAIL_SENDING_ENABLED`; see Section 10 |
| Fast double-click | `useRef` in-flight guard (Slice 4 UI) + DB idempotency index |
| Commitment auto-completion | Explicitly excluded; send does not mutate `commitment_status` |

---

## 17. Out of Scope for This Slice

- No code changes
- No migrations
- No production changes
- No Vercel changes
- No `EMAIL_SENDING_ENABLED` enablement
- No `CAMPAIGN_SENDING_ENABLED` reference
- No emails sent
- No campaign sending
- No automation or background jobs
- No UI implementation
- No tag created
- No commit or push in this planning slice

---

## 18. Acceptance Criteria

This implementation plan is accepted if:

- [x] Documentation only — no code, no migration, no tag
- [x] Permission model resolved: `messaging.send_emails` required; `crm.leads.edit` alone not sufficient
- [x] Proposal-follow-up context validation steps defined (10 steps in Section 5)
- [x] `commitmentId`-only input shape — no `draftId`-only public wrapper
- [x] `checkDraftSendReadiness` required (not optional)
- [x] `superseded_at` gap addressed in wrapper (step 8)
- [x] `campaign_assignment_id IS NULL` guard required (step 7)
- [x] `EMAIL_SENDING_ENABLED` remains the send gate; CAMPAIGN_SENDING_ENABLED excluded
- [x] Commitment/proposal status mutation excluded
- [x] Provider-success/local-update-failure risk identified and hardening required before flag enablement
- [x] No migrations created or expected

---

## 19. Recommended Next Slice

**Phase 3T Slice 3 — Backend Approved Send Action Foundation**

Scope:
- Create `modules/proposals/actions/proposal-follow-up-send.actions.ts`
- Add `PROPOSAL_FOLLOW_UP_DRAFT_SENT` constant to `ActivityEventType`
- Add `tests/phase3t-proposal-follow-up-send.test.ts` (source-reading tests TC-3T-001 through TC-3T-033)
- Verify and document provider-success/local-update-failure behavior of `sendApprovedDraft`
- **No UI**
- **No `EMAIL_SENDING_ENABLED` enablement**
- **No email sent**

Pre-condition: This plan must pass Codex review before Slice 3 code is written.
