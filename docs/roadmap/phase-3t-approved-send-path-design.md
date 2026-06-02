# Phase 3T — Approved Send Path Design

**Status:** Design only — no implementation started
**Created:** 2026-06-02
**Predecessor:** Phase 3S — Proposal Follow-Up Draft Generation (locked)
**Phase 3S lock tag:** `phase-3s-follow-up-draft-generation-v1` → `8b565347545bbb6c4ea032c5966841a56627cd28`

---

## 1. Purpose

Phase 3T designs and implements the controlled path for sending an already-approved proposal follow-up email draft. The scope is intentionally narrow: one draft, one operator action, one provider call.

**Phase 3T is:**
- Sending one explicitly approved `email_draft` through a controlled operator-initiated path
- Wiring the existing `sendApprovedDraft` service function to proposal follow-up draft context

**Phase 3T is NOT:**
- Campaign sending
- Background or automated sending
- LLM generation
- Draft generation (Phase 3S)
- Batch sending
- Auto-send on approval
- Any modification to commitment or proposal status

**This document is design only. It creates no code, no migrations, and no tags.**

---

## 2. Critical Discovery: Infrastructure Already Exists

Before designing new code, Phase 3T must acknowledge that the sending infrastructure required for this path **already exists** in the codebase. The Phase 3T implementation is primarily a thin wiring layer — not a new send engine.

### Pre-existing send infrastructure

| Component | File | Status |
|-----------|------|--------|
| `sendApprovedDraft` service | `modules/messaging/services/email-send.service.ts` | **Exists** |
| `email-send.repo.ts` | `modules/messaging/repositories/email-send.repo.ts` | **Exists** |
| `draft-send-readiness.service.ts` | `modules/messaging/services/draft-send-readiness.service.ts` | **Exists** — not called by `sendApprovedDraft`; use in Phase 3T wrapper or UI |
| `email_sends` table | Migration `20240013_phase4_email_send.sql` | **Exists** |
| Idempotency index | `email_sends_draft_active_unique` (draft_id WHERE status IN ('queued','sent')) | **Exists** |
| `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` | `modules/intelligence/types.agent.ts` | **Exists** |
| `send-bridge/` | `modules/messaging/send-bridge/` | **Exists** |

### Confirmed in `sendApprovedDraft`:
1. Permission check
2. `EMAIL_SENDING_ENABLED` kill-switch gate
3. Draft ownership/tenant/workspace scope verification
4. Lifecycle double-gate: both `email_drafts.status` AND `approval_requests.status` must be `'approved'`
5. Idempotency guard via `getActiveSendForDraft` (checks for existing queued/sent record)
6. Recipient validation, suppression check, rate limiting, sender identity resolution (internal to service — not delegated to `checkDraftSendReadiness`)
7. `email_sends` row creation with `status = 'queued'`
8. Resend provider call
9. Status update on success (`email_sends → 'sent'`, `email_drafts → 'sent'`)
10. Status update on failure (`email_sends → 'failed'`, `email_drafts` stays `'approved'`)
11. `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` audit events

### Not confirmed in `sendApprovedDraft` — require Phase 3T wrapper or pre-implementation review:
- **`checkDraftSendReadiness` is NOT called inside `sendApprovedDraft`.** `draft-send-readiness.service.ts` exists and should be used by the Phase 3T proposal-follow-up wrapper or UI readiness layer. Do not assume it runs automatically as part of `sendApprovedDraft`.
- **`superseded_at` check** — whether `getEmailDraftForSending` filters on `superseded_at IS NULL` is unconfirmed. Phase 3T Slice 2 must verify and harden if necessary before implementation.
- **Subject/body validation before provider call** — may not be explicitly checked by `sendApprovedDraft`. Treat as a proposed Phase 3T wrapper responsibility unless confirmed in code during Slice 2.
- **Provider-success/local-update-failure reconciliation** — `send-bridge/` infrastructure exists, but whether it covers this exact path reliably must be verified in Slice 2 before `EMAIL_SENDING_ENABLED` is enabled.

**Implication for Phase 3T:** The implementation requires a proposal-follow-up-specific server action that validates follow-up context and calls `sendApprovedDraft`. The action must NOT be a generic "send any approved draft" wrapper. Pre-flight readiness checks and hardening items above must be confirmed or resolved in Slice 2 before any code is written.

---

## 3. Current Locked Foundation

| Item | Status |
|------|--------|
| Phase 3S lock tag | `phase-3s-follow-up-draft-generation-v1` confirmed |
| `email_drafts` with `subject_type = 'proposal_follow_up_commitment'` | Created by Phase 3S |
| `proposal_follow_up_commitments.draft_id` back-link | Populated by Phase 3S |
| Draft status after generation | `pending_approval` |
| Approval request (`proposal_follow_up_draft_review`) | Created by Phase 3S service |
| `EMAIL_SENDING_ENABLED` | **Disabled** — must remain disabled until Phase 3T implementation is complete and separately enabled by operator |
| `CAMPAIGN_SENDING_ENABLED` | **Disabled** — not relevant to Phase 3T |
| Production | Untouched |
| Migration 20240039 | Applied locally/remote-dev only — not production |

Phase 3T builds on Phase 3S without modifying Phase 3S behavior. Draft generation remains the Phase 3S responsibility; Phase 3T handles the approved-send step only.

---

## 4. Scope

### In scope

- Wire a `sendFollowUpDraftAction` that calls the existing `sendApprovedDraft` service
- Add a `SendFollowUpDraftButton` UI control on the queue page (approved drafts only)
- Gate on `EMAIL_SENDING_ENABLED = true`
- Gate on `draft.status = 'approved'`
- Consider adding `PROPOSAL_FOLLOW_UP_DRAFT_SENT` activity event (additive constant)
- Ensure `subject_type = 'proposal_follow_up_commitment'` is surfaced in send audit properties

### Out of scope

- Campaign sending
- Batch/multi-draft sending
- Background jobs or Inngest triggers
- Automatic sending on approval
- Sending `pending_approval` drafts
- Sending `rejected` drafts
- LLM generation (Phase 3S extension, separate design)
- AI budget usage
- Proposal status mutation
- Commitment `commitment_status` mutation (send does not complete/skip the commitment)
- Production `EMAIL_SENDING_ENABLED` enablement (requires separate explicit operator decision)
- Production migration 20240039

---

## 5. Feature Flag and Safety Gate Model

### Required gates (enforced by existing `sendApprovedDraft`)

| Gate | Mechanism | Notes |
|------|-----------|-------|
| `EMAIL_SENDING_ENABLED` | System control checked in service | **Must be `true`** before any provider call is made |
| Draft status | `email_drafts.status = 'approved'` | Checked before creating `email_sends` record |
| Approval status | `approval_requests.status = 'approved'` | Lifecycle double-gate — both draft AND approval must be approved |
| Idempotency | `email_sends_draft_active_unique` index | DB-level prevention of concurrent queued/sent records for the same draft |

### `CAMPAIGN_SENDING_ENABLED`

Must NOT be used as the gate for this one-off approved draft send path. One-off approved sends are distinct from campaign automation. Using the wrong flag would couple unrelated infrastructure.

### UI gate

The Send button must be hidden or disabled unless:
1. `EMAIL_SENDING_ENABLED = true` (server-derived)
2. `draft.status = 'approved'`
3. Draft readiness check passes (recipient, subject, body)

Even with UI hidden, the server action must independently enforce all gates. UI visibility is a convenience layer only.

---

## 6. Draft Eligibility Rules

### Confirmed in `sendApprovedDraft` (verified in service code)

- Draft belongs to `(tenant_id, workspace_id)`
- `email_drafts.status = 'approved'` AND `approval_requests.status = 'approved'` (lifecycle double-gate)
- `email_sends` active record absent (`getActiveSendForDraft` idempotency guard)
- Not deleted (`deleted_at` null — confirmed in `getEmailDraftForSending`)
- Contact `do_not_contact` check — internal to service
- Email suppression check — internal to service
- `EMAIL_SENDING_ENABLED = true`

### Proposed Phase 3T wrapper / pre-flight layer (verify in Slice 2 before implementing)

These checks are available via `checkDraftSendReadiness` but are **not confirmed to run inside `sendApprovedDraft`**. The Phase 3T action or a proposal-follow-up wrapper service should invoke them explicitly before calling `sendApprovedDraft`:

- `to_email` present
- `subject` present
- `body_html` or `body_text` present
- `approval_request_id` present on draft
- Not superseded (`superseded_at` null) — verify whether `getEmailDraftForSending` enforces this; harden if not
- `campaign_assignment_id IS NULL` — proposal follow-up drafts must not have a campaign assignment; see Section 9

### Warning-state drafts from Phase 3S

If Phase 3S returned `approval_request_failed` or `approval_link_failed`, the draft exists but may have no `approval_request_id` or no linked approval request. These drafts should **not** be sendable until the approval wiring is repaired. The existing lifecycle double-gate in `sendApprovedDraft` (both draft AND approval_request must be `'approved'`) will block these drafts as long as `approval_request_id` is null or the approval request is not approved.

### Warning-state drafts from Phase 3S

If Phase 3S returned `approval_request_failed` or `approval_link_failed`, the draft exists but may have no `approval_request_id` or no linked approval request. These drafts should **not** be sendable until the approval wiring is repaired. The existing lifecycle double-gate in `sendApprovedDraft` (both draft AND approval_request must be `'approved'`) will block these drafts as long as `approval_request_id` is null or the approval request is not approved.

---

## 7. Human Review Preservation

Phase 3T does not reduce human-review requirements:

```
Draft created (pending_approval)  →  Phase 3S
    ↓
Approver reviews and approves    →  Existing approval bridge (Phase 3B HRB)
    ↓
Draft status → 'approved'
    ↓
Operator explicitly clicks Send  →  Phase 3T
    ↓
EMAIL_SENDING_ENABLED + all gates must pass
    ↓
Email sent
```

- `pending_approval` drafts **cannot** be sent — blocked by `sendApprovedDraft` lifecycle gate
- `rejected` drafts **cannot** be sent — blocked by `sendApprovedDraft` lifecycle gate
- Approval creates eligibility; it does not trigger automatic sending
- Sending is a separate, explicit operator action

---

## 8. Send Lifecycle

The `sendApprovedDraft` service already defines this lifecycle. Phase 3T wires proposal follow-up context to it:

```
1. Draft exists with status = 'approved' and approval_request_id linked
    ↓
2. Operator clicks Send in queue UI
    ↓
3. sendFollowUpDraftAction ('use server')
   - buildRequestContext → requirePermission(ctx, 'messaging.send_emails')
     (see Section 9 and Open Questions — crm.leads.edit alone is NOT sufficient)
   - validate commitmentId (not draftId — see Section 9 for input shape)
   - load proposal_follow_up_commitments row: verify tenant/workspace scope
   - verify commitment.draft_id IS NOT NULL → resolve draftId server-side
   - load email_draft: verify subject_type = 'proposal_follow_up_commitment'
   - verify email_draft.subject_id = commitmentId
   - verify email_draft.campaign_assignment_id IS NULL
   - optional: call checkDraftSendReadiness (subject, body, approval_request_id)
    ↓
4. sendApprovedDraft(ctx, draftId) — existing service
   - EMAIL_SENDING_ENABLED gate
   - draft/approval lifecycle double-gate
   - idempotency guard (getActiveSendForDraft)
   - internal readiness checks (recipient, suppression, rate limit, sender identity)
   - ET_SEND_INITIATED audit event
   - email_sends INSERT (status = 'queued')
   - Resend provider call
   - email_sends → 'sent' + resend_message_id
   - email_drafts → 'sent'
   - ET_SEND_SUCCEEDED audit event
    ↓
5. Return { success: true, sendId }
    ↓
6. UI shows "Sent" state, optionally prompts "Mark follow-up complete?" (not automatic)
```

On failure: `email_sends → 'failed'`, `email_drafts` stays `'approved'`, `ET_SEND_FAILED` emitted. Operator may retry explicitly.

### Proposal follow-up specific audit

If `subject_type = 'proposal_follow_up_commitment'`, the service or action should add a `PROPOSAL_FOLLOW_UP_DRAFT_SENT` activity event (new constant, additive). This traces the full follow-up lifecycle: `CREATED → COMPLETED/SKIPPED/RESCHEDULED` and now `DRAFT_CREATED → DRAFT_SENT`.

---

## 9. Repository / Service / Action Design

### What already exists (do not recreate)

| Component | File | Phase 3T usage |
|-----------|------|----------------|
| `sendApprovedDraft` | `email-send.service.ts` | Called after proposal-follow-up context validation passes |
| `getEmailDraftForSending` | `email-send.repo.ts` | Used inside `sendApprovedDraft` |
| `getActiveSendForDraft` | `email-send.repo.ts` | Used inside `sendApprovedDraft` (idempotency) |
| `createEmailSend` | `email-send.repo.ts` | Used inside `sendApprovedDraft` |
| `checkDraftSendReadiness` | `draft-send-readiness.service.ts` | NOT called by `sendApprovedDraft` — should be called by Phase 3T action/wrapper before calling sendApprovedDraft |

### What Phase 3T adds

**New action:** `modules/proposals/actions/proposal-follow-up-send.actions.ts`

```typescript
'use server'
// Permission: messaging.send_emails (required by sendApprovedDraft; see Open Questions
//   for whether crm.leads.edit should also be required for follow-up context)
// Input: { commitmentId?: string }   ← NOT draftId — draftId is resolved server-side
// Derives draftId from: proposal_follow_up_commitments.draft_id (server-side lookup)
// Validates before calling sendApprovedDraft:
//   - commitment belongs to (tenant_id, workspace_id)
//   - commitment.draft_id IS NOT NULL
//   - email_drafts.subject_type = 'proposal_follow_up_commitment'
//   - email_drafts.subject_id = commitmentId
//   - email_drafts.campaign_assignment_id IS NULL
//   - optional: checkDraftSendReadiness (subject, body, approval_request_id)
// Calls: sendApprovedDraft(ctx, draftId)
// Returns: ActionResult<{ sendId: string; draftId: string; commitmentId: string }>
```

**Optional new activity event constant** (additive to `types.agent.ts`):
```typescript
PROPOSAL_FOLLOW_UP_DRAFT_SENT: 'proposal_follow_up_draft_sent'
```

**New UI component:** `app/(workspace)/[workspaceSlug]/proposal-follow-ups/SendFollowUpDraftButton.tsx`

```
'use client'
// Props: draftId, draftStatus, emailSendingEnabled
// Shows only if draftStatus = 'approved' and emailSendingEnabled = true
// Has confirmation step: "Send this follow-up email?"
// Loading, success, error states
// No campaign send language
```

### Responsibilities

| Layer | Responsibility |
|-------|---------------|
| Repository | Already handled by `email-send.repo.ts` |
| Service | Already handled by `sendApprovedDraft` |
| Action | Input validation, context, permission gate, call `sendApprovedDraft` |
| UI | Display approved-draft Send control, hide when ineligible |

### Permission boundary

`sendApprovedDraft` requires `messaging.send_emails` internally. The proposal follow-up send action **must also require `messaging.send_emails`** — a wrapper using only `crm.leads.edit` will fail at the service layer unless the user also has `messaging.send_emails`.

**Design decision (must be resolved in Slice 2 before coding):**
- Option A: Require `messaging.send_emails` only — matches service expectation; simpler.
- Option B: Require both `crm.leads.edit` (for proposal/commitment context access) AND `messaging.send_emails` (for the send itself) — stricter; ensures the caller has full read+send rights on follow-up data.

Until this is resolved, Phase 3T implementation of the send action is **blocked from coding**. Do not claim `crm.leads.edit` alone is sufficient.

### Campaign assignment side-effect guard

`sendApprovedDraft` has a `campaignAssignmentService.completeCampaignAssignment` side effect when `email_drafts.campaign_assignment_id` is not null. For Phase 3S follow-up drafts this field must be null (Phase 3S `createFollowUpEmailDraft` does not set it), but the proposal-follow-up action must **explicitly validate `campaign_assignment_id IS NULL` before calling `sendApprovedDraft`** rather than relying on Phase 3S's absence of the field. This prevents a malformed or re-linked draft from accidentally triggering campaign assignment completion through the follow-up send path.

### Transaction / partial failure

Handled by existing `sendApprovedDraft` pattern:
- `email_sends` record created before provider call — record of attempt
- On failure: `email_sends → 'failed'`, `email_drafts` stays `'approved'` (retry possible)
- On success: both updated to terminal success state
- Activity event failure is non-fatal (same pattern as Phase 3R/3S)

---

## 10. Idempotency and Duplicate Send Prevention

The existing infrastructure already provides multiple layers:

| Layer | Mechanism |
|-------|-----------|
| DB constraint | `email_sends_draft_active_unique` partial unique index on `(draft_id)` WHERE `status IN ('queued','sent')` — prevents concurrent double-sends at DB level (constraint violation = error code 23505) |
| Application check | `getActiveSendForDraft` returns existing queued/sent record — service returns early without a second provider call |
| UI disable | `useRef` in-flight guard (same pattern as `GenerateFollowUpDraftButton`) must be applied to `SendFollowUpDraftButton` |
| Provider | Resend message ID stored in `resend_message_id` for deduplication if provider supports idempotency keys |

The DB constraint is the authoritative guard. UI and application checks are defense-in-depth.

---

## 11. Partial Failure Behavior

`sendApprovedDraft` defines the base behavior. Phase 3T must verify and harden before enabling `EMAIL_SENDING_ENABLED`.

| Scenario | Current behavior | Risk level |
|----------|-----------------|------------|
| Send record created, provider call fails | `email_sends → 'failed'`, draft stays `'approved'`, operator can retry | Low — clean, retryable |
| Activity event fails | Non-fatal, partial success (same pattern as Phase 3S) | Low |
| Provider call succeeds, `email_sends` status update fails | **High-risk.** `email_sends` may remain `'queued'` with `resend_message_id` set but status not updated. Current `send-bridge/` reconciliation infrastructure exists, but whether it reliably covers this exact follow-up path must be **verified in Slice 2 before enabling `EMAIL_SENDING_ENABLED`**. Do not assume reconciliation fully solves this. | **High** |
| Provider call succeeds, `email_drafts` status update fails | `email_drafts` stays `'approved'` despite email being sent. `email_sends` record with `resend_message_id` is the authoritative send record. Operational recovery possible via `email_sends`, but draft state will be inconsistent. | **Medium** |
| Provider call unknown/timeout | `email_sends` stays `'queued'`. Retry by operator may hit idempotency index (safe). But if `email_sends` row is absent and provider call fired, retry could cause a duplicate send. Any retry after uncertain provider result **must not call the provider again without first confirming provider did not succeed** (check `resend_message_id` or provider status API). | **High** |

**Phase 3T Slice 2 must explicitly inspect `sendApprovedDraft` behavior** for the provider-success/local-update scenarios and decide whether to harden before enabling `EMAIL_SENDING_ENABLED`. This is a pre-implementation gate, not an optional polish item.

---

## 12. UI Design

The `SendFollowUpDraftButton` should appear in the queue row action column only when:
1. `email_sending_enabled = true` (server-derived prop)
2. `draft_status = 'approved'`
3. Draft readiness passes (recipient, subject, body)

### Proposed states

| State | Display |
|-------|---------|
| Not shown | Draft not in `approved` status, or `email_sending_enabled = false`, or readiness fails |
| idle | "Send Email" button (blue, distinct from Generate Draft) |
| confirming | "Send this follow-up email? This cannot be undone." + Confirm / Cancel |
| loading | "Sending…" + spinner |
| success | "Sent" (green) + `router.refresh()` |
| error | Red error + Dismiss |
| already sent | "Already Sent" (read-only indicator) |

### No send language on Generate Draft button

The existing `GenerateFollowUpDraftButton` must never be modified to add send language. Send and Generate are separate actions on separate buttons.

### Sending disabled message

If `email_sending_enabled = false` but draft is approved, show a non-blocking indicator: "Email sending is currently disabled." Do not show an active Send button.

**No campaign send language anywhere.** Button copy: "Send Email" not "Send Campaign" or "Launch."

Do not implement UI in this design slice.

---

## 13. Activity and Audit Model

### Existing events (already in `ActivityEventType`)

| Constant | Event value | Usage |
|----------|-------------|-------|
| `ET_SEND_INITIATED` | `'ET_SEND_INITIATED'` | Emitted by `sendApprovedDraft` before provider call |
| `ET_SEND_SUCCEEDED` | `'ET_SEND_SUCCEEDED'` | Emitted on provider success |
| `ET_SEND_FAILED` | `'ET_SEND_FAILED'` | Emitted on provider failure |

### Proposed new constant (additive, Phase 3T Slice 3)

```typescript
// Phase 3T — Proposal Follow-Up Send (additive)
PROPOSAL_FOLLOW_UP_DRAFT_SENT: 'proposal_follow_up_draft_sent',
```

This provides a follow-up-specific audit event that includes the `commitment_id` in `properties`, separate from the generic `ET_SEND_*` events which don't carry commitment context.

### Required event properties for `PROPOSAL_FOLLOW_UP_DRAFT_SENT`

```typescript
{
  draft_id: string
  send_id: string
  tenant_id: string
  workspace_id: string
  actor_user_id: string
  recipient_email: string
  provider_message_id: string         // resend_message_id
  subject_type: 'proposal_follow_up_commitment'
  subject_id: string                  // commitmentId
  commitment_id: string
  source_type: 'future_follow_up'
  approval_request_id: string | null
  schedule_rule_key: string
  follow_up_sequence: number
  proposal_event_id: string
}
```

This event is emitted at the service/action layer. The existing `ET_SEND_SUCCEEDED` from `sendApprovedDraft` can co-exist — they record different perspectives (generic send vs. follow-up-specific lifecycle).

---

## 14. Proposal Follow-Up Commitment Relationship

**Send does not automatically complete the commitment.**

After a follow-up email is sent, the operator must still explicitly mark the commitment as complete using the Phase 3R `CompleteFollowUpButton`. This preserves the Phase 3R/3S separation: sending is about the email, completing is about the follow-up obligation.

### UI hint (future, non-automatic)

After a successful send, the `SendFollowUpDraftButton` may show a non-blocking prompt: "Email sent — mark follow-up complete?" with a link to the `CompleteFollowUpButton`. This is a UI hint, not an automatic mutation.

| Action | Who does it | Mechanism |
|--------|-------------|-----------|
| Generate draft | Phase 3S operator action | `generateFollowUpDraftAction` |
| Approve draft | Human approver | Existing HRB approval bridge |
| Send email | Phase 3T operator action | `sendFollowUpDraftAction` → `sendApprovedDraft` |
| Mark commitment complete | Phase 3R operator action | `completeFollowUpCommitmentAction` |

These are four distinct operator steps. None is automatic.

---

## 15. Testing Plan

Tests for the eventual implementation (source-reading tier, same pattern as Phase 3R/3S):

### Action tests
- Action file exists with `'use server'`
- `sendFollowUpDraftAction` exported
- Action accepts `commitmentId` input (NOT `draftId`) — draftId resolved server-side
- Action requires `messaging.send_emails` permission (or both messaging.send_emails + crm.leads.edit per Slice 2 decision)
- Action validates `commitmentId` presence
- Action verifies `email_drafts.subject_type = 'proposal_follow_up_commitment'`
- Action verifies `email_drafts.subject_id` matches `commitmentId`
- Action verifies `proposal_follow_up_commitments.draft_id` equals the resolved `draftId`
- Action verifies `email_drafts.campaign_assignment_id IS NULL`
- Action rejects drafts with non-follow-up subject_type
- Action calls `sendApprovedDraft` (does not call provider directly)
- Action does not import Resend/Inngest/OpenAI/Anthropic
- Action does not reference `CAMPAIGN_SENDING_ENABLED`
- Action does not mutate `commitment_status`
- Action does not call `completeFollowUpCommitmentAction`

### Readiness pre-check tests (wrapper layer)
- Wrapper calls `checkDraftSendReadiness` or equivalent before `sendApprovedDraft`
- Rejects draft missing `to_email`
- Rejects draft missing `subject`
- Rejects draft missing both `body_html` and `body_text`
- Rejects draft with `superseded_at` set (if confirmed not filtered by `getEmailDraftForSending`)

### Service tests (existing `sendApprovedDraft` — regression only)
- Fails when `EMAIL_SENDING_ENABLED = false`
- Fails on `pending_approval` draft
- Fails on `rejected` draft
- Proceeds on `approved` draft with `EMAIL_SENDING_ENABLED = true`
- Idempotency: duplicate send rejected by `getActiveSendForDraft`

### Partial failure tests
- Provider-success/local-update-failure scenario: `email_sends` state after partial failure is recoverable
- Retry after failure does not double-send if idempotency guard is in place

### UI tests
- `SendFollowUpDraftButton` exists with `'use client'`
- Shows only when `draftStatus = 'approved'` and `emailSendingEnabled = true`
- Has `useRef` in-flight guard (same pattern as `GenerateFollowUpDraftButton`)
- Shows confirmation step: "Send this follow-up email? This cannot be undone."
- Does not show Send button for `pending_approval` drafts
- Does not show Send button when `emailSendingEnabled = false`
- No campaign send language
- No Resend/Inngest/LLM imports
- `router.refresh()` called on success

### Safety tests
- No `CAMPAIGN_SENDING_ENABLED` reference in any Phase 3T file
- No Inngest import in any Phase 3T file
- No LLM import in any Phase 3T file
- `commitment_status` not written by send path
- `proposal_status` not written by send path
- `campaign_assignment_id` validation present in action

---

## 16. Risk Controls

| Risk | Mitigation |
|------|-----------|
| Accidental send before approval | `sendApprovedDraft` lifecycle double-gate blocks non-approved drafts |
| Duplicate sends | DB `email_sends_draft_active_unique` constraint + `getActiveSendForDraft` application check |
| Provider success / local status update failure | **High-risk — must be hardened or verified in Slice 2 before enabling `EMAIL_SENDING_ENABLED`**; `send-bridge/` infrastructure exists but coverage for this exact path is unconfirmed |
| Provider timeout / unknown result | Retry without idempotency check could cause duplicate send; any retry must confirm provider outcome first |
| Campaign assignment side effect | Phase 3S sets `campaign_assignment_id = null`; action must explicitly validate null before calling `sendApprovedDraft` to prevent accidental campaign completion |
| Send button for wrong draft state | Server-side validation + UI gate on `draft.status = 'approved'` |
| Sending when feature flag disabled | `sendApprovedDraft` enforces `EMAIL_SENDING_ENABLED`; action does not bypass |
| Confusing one-off send with campaign send | Distinct `sendFollowUpDraftAction` action file; no `CAMPAIGN_SENDING_ENABLED` reference |
| Operator thinking send auto-completes commitment | UI hint is non-blocking; auto-complete explicitly excluded; Phase 3R `CompleteFollowUpButton` remains required |
| Phase 3S warning-state drafts being sent before wiring repair | Lifecycle double-gate blocks drafts without `approval_request_id` or without approved approval record |
| Fast double-click double-send | `useRef` in-flight guard + DB idempotency index |

---

## 17. Migration Considerations

### No migration expected for Phase 3T core

The `email_sends` table, `email_sends_draft_active_unique` constraint, and all necessary FKs already exist from earlier migrations. `sendApprovedDraft` already writes to this table.

### Potential future migration (not needed in Phase 3T Slice 3)

If a `proposal_follow_up_commitment_id` FK column were added to `email_sends` for direct cross-referencing (analogous to `draft_id` on commitments), a migration would be needed. This is **not required** for the initial Phase 3T implementation — `subject_type`/`subject_id` on `email_drafts` provides the link transitively:

```
email_sends.draft_id → email_drafts.id → email_drafts.subject_id = commitmentId
```

A direct FK on `email_sends` would be a future optimization if query patterns require it. Do not create this migration in Phase 3T unless it proves necessary.

---

## 18. Acceptance Criteria

This design is accepted if:

- [x] Documentation only — no code, no migration, no tag
- [x] One-off approved send path clearly separated from campaign sending
- [x] `EMAIL_SENDING_ENABLED` gate required — enforced by existing `sendApprovedDraft`
- [x] `pending_approval` drafts cannot be sent — enforced by existing lifecycle double-gate
- [x] Duplicate send prevention explicitly designed — DB constraint + application check + UI guard
- [x] No commitment/proposal mutation is automatic
- [x] No new send engine designed — existing `sendApprovedDraft` is the implementation
- [x] Phase 3S draft generation behavior unchanged
- [x] Phase 3R Complete/Skip/Reschedule controls unchanged

---

## 19. Recommended Slice Breakdown

| Slice | Description | Notes |
|-------|-------------|-------|
| **3T Slice 1** | Design document (this file) | Documentation only |
| **3T Slice 2** | Implementation plan | Resolve permission (crm.leads.edit vs messaging.send_emails); confirm action/UI file locations; Codex review before code |
| **3T Slice 3** | `sendFollowUpDraftAction` + `PROPOSAL_FOLLOW_UP_DRAFT_SENT` constant + source-reading tests | Thin action calling existing `sendApprovedDraft` |
| **3T Slice 4** | `SendFollowUpDraftButton` UI control + queue page wiring + UI tests | Mirrors `GenerateFollowUpDraftButton` pattern; in-flight guard required |
| **3T Slice 5** | QA / lock report + tag | After all slices confirmed |

Phase 3T implementation is small because the infrastructure already exists. Slice 3 (backend) should be achievable in a single narrow commit.

---

## 20. Open Questions

1. **Permission model — BLOCKING for Slice 2:** `sendApprovedDraft` requires `messaging.send_emails`. Should the proposal-follow-up send action require (a) `messaging.send_emails` only, or (b) both `messaging.send_emails` + `crm.leads.edit`? Option A is simpler; Option B is stricter and consistent with all other Phase 3R/3S gates. Must be resolved before Phase 3T Slice 3 code is written. `crm.leads.edit` alone is not sufficient.

2. **`sendApprovedDraft` hardening — BLOCKING for `EMAIL_SENDING_ENABLED` enablement:** Does `checkDraftSendReadiness` run inside `sendApprovedDraft`? Does `getEmailDraftForSending` filter on `superseded_at IS NULL`? Does the provider-success/local-update-failure path have reliable reconciliation for follow-up sends? Phase 3T Slice 2 must inspect and answer these before any code is merged.

3. **`EMAIL_SENDING_ENABLED` enablement timing:** Phase 3T implementation can be merged to `master` while the flag remains `false`. Enabling it is a separate operator decision that should happen only after hardening questions (Q2 above) are resolved.

4. **Follow-up send action input shape:** Is `{ commitmentId }` (deriving `draftId` server-side) strictly required, or is `{ commitmentId, draftId }` (with server-side cross-check) acceptable? Either works — the key requirement is that proposal-follow-up context validation runs on the server before `sendApprovedDraft` is called.

5. **`PROPOSAL_FOLLOW_UP_DRAFT_SENT` event:** Should this be emitted in addition to `ET_SEND_SUCCEEDED`, or should `ET_SEND_SUCCEEDED` properties be extended with `commitment_id`? Adding a new event is cleaner but increases event surface area.

6. **Production migration 20240039:** Sending follow-up drafts for Skip-committed commitments requires the `skipped_at`/`skipped_reason`/`skipped_by_user_id` columns from migration 20240039, which has NOT been applied to production. If Phase 3T is deployed to production before 20240039, sending Skip-related drafts would fail if those columns are referenced. Complete and Reschedule drafts are unaffected. Resolve before Phase 3T production deployment.

7. **"Mark complete?" UI hint timing:** Should the "Email sent — mark follow-up complete?" hint appear on the queue row or on a detail page? Inline is simpler but adds row density.
