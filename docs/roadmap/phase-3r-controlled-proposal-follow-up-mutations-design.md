# Phase 3R — Controlled Proposal Follow-Up Mutations Design

**Status:** Design only — no implementation started
**Created:** 2026-06-01
**Predecessor:** Phase 3Q — Proposal Follow-Up Work Queue Read-Only Foundation (locked)
**Migration required:** Likely — schema gaps identified in Section 8

---

## 1. Phase 3Q Baseline

| Item | Value |
|------|-------|
| Lock tag | `phase-3q-proposal-follow-up-work-queue-v1` |
| Lock tag target | `8806bed879401086db53d1463c6da91048fc5a6d` |
| Focused test suite | 636 / 636 passing at lock |
| Foundation | Read-only queue, enriched read model, validated server action, URL filter tabs, sidebar nav |

### Phase 3Q read-only stack

```
proposal_follow_up_commitments (DB — migration 20240038)
    ↓
listProposalFollowUpQueueItemsForWorkspace (batch-enriched read model)
    ↓
getProposalFollowUpQueueForWorkspace (service — summary counts)
    ↓
getProposalFollowUpQueueAction (server action — sanitized filters, context-scoped)
    ↓
/proposal-follow-ups (read-only Server Component — URL filter tabs, table, empty/error states)
    ↓
Sidebar → "Follow-Up Queue" (ListChecks icon)
```

### Active safety constraints carried forward

- `EMAIL_SENDING_ENABLED` remains disabled until a future explicitly designed sending phase
- `CAMPAIGN_SENDING_ENABLED` remains disabled
- No Inngest/background automation
- No LLM calls (OpenAI, Anthropic) in any follow-up module file
- No sending controls of any kind
- All mutations must be explicit operator actions — nothing automatic

---

## 2. Problem Statement

Phase 3Q gives operators a cross-proposal view of open follow-up commitments. They can see what is overdue, what is due today, and which proposals each commitment belongs to. However, they cannot act — no mutation controls exist.

Phase 3R designs the controlled write/mutation layer that allows operators to take safe, auditable actions on individual commitments:

- **Mark a commitment complete** — the follow-up action was taken
- **Skip a commitment** — the commitment is intentionally bypassed with a reason
- **Reschedule a commitment** — move the due date to a new explicit date/time
- **Reopen a commitment** — reverse a completed or skipped status if needed
- **Generate a follow-up draft** — LLM-assisted draft written to a review queue, not sent
- **Approve and send** — design only in this document; not implemented in Phase 3R

All mutations must be:
- Operator-initiated (no automation)
- Tenant and workspace scoped
- Permission-checked before execution
- Audit-trailed with actor identity and state transition
- Non-sending unless a future explicitly guarded send phase is designed and approved

---

## 3. Non-Goals for Phase 3R

Phase 3R design explicitly does **not** implement any of the following:

| Non-goal | Reason |
|----------|--------|
| Email sending | Requires separate send phase; `EMAIL_SENDING_ENABLED` remains disabled |
| Campaign sending | Out of scope; `CAMPAIGN_SENDING_ENABLED` remains disabled |
| Autonomous follow-up automation | No background jobs or Inngest in this phase |
| LLM draft generation implementation | Draft generation is designed here; implementation is a future slice |
| Any UI implementation | UI controls are future slices after design approval |
| Database migrations | Schema gaps documented; migrations deferred pending design review |
| Production changes | No production changes |
| Vercel changes | No Vercel setting changes |

---

## 4. Proposed Mutation Types

### 4.1 — Complete Follow-Up Commitment

**Purpose:** Record that the operator performed the follow-up action described by this commitment.

**Preconditions:**
- Commitment exists in current tenant/workspace
- `commitment_status = 'open'`

**Required permission:** `crm.leads.edit` (existing write permission for lead-related records; see Section 10)

**Tenant/workspace scoping:** Commitment must be fetched and confirmed as belonging to `(tenantId, workspaceId)` before update.

**Data written:**
- `commitment_status` → `'completed'`
- `completed_at` → `now()` (already in schema)
- `completed_by_user_id` → actor user ID (already in schema)
- `completion_notes` → optional free text (already in schema)
- `updated_at` → `now()`

**Audit event required:** Yes — record `mutation_type: 'complete'`, previous status, actor, timestamp, commitment ID, proposal event ID.

**UI confirmation behavior:** Single-click with inline confirmation ("Mark this commitment complete?") or dedicated row action. `completion_notes` should be an optional textarea shown in the confirmation dialog.

**Failure modes:**
- Commitment not found → return error, do not mutate
- Commitment already completed/skipped/proposal_closed → return conflict error, do not re-mutate
- Permission denied → return unauthorized error

**Tests that should eventually exist:**
- Complete mutation writes `commitment_status = 'completed'`, `completed_at`, `completed_by_user_id`
- Complete mutation is scoped by `(tenantId, workspaceId)` — cannot complete a commitment from a different tenant
- Cannot complete an already-completed commitment (idempotency/conflict guard)
- Completion does not trigger email send
- Completion does not enqueue Inngest job

**Sending/automation impact:** None.

---

### 4.2 — Skip Follow-Up Commitment

**Purpose:** Record that the operator intentionally bypassed this follow-up without taking the action.

**Preconditions:**
- Commitment exists in current tenant/workspace
- `commitment_status = 'open'`

**Required permission:** `crm.leads.edit`

**Tenant/workspace scoping:** Same as Complete.

**Data written:**
- `commitment_status` → `'skipped'`
- `skipped_at` → `now()` (NOT in current schema — see Section 8)
- `skipped_reason` → operator-provided text, nullable or required TBD (NOT in current schema — see Section 8)
- `decided_by_user_id` → actor user ID (NOT in current schema — see Section 8)
- `updated_at` → `now()`

**Audit event required:** Yes — `mutation_type: 'skip'`, previous status, actor, reason, timestamp.

**UI confirmation behavior:** Skip action must require a reason input (at minimum optional, policy TBD — see Section 15, open question 2). A confirmation dialog prevents accidental skips.

**Failure modes:**
- Commitment not found → error
- Commitment already in terminal status → conflict error
- Permission denied → error

**Tests that should eventually exist:**
- Skip writes `commitment_status = 'skipped'` and `skipped_reason`
- Skip is scoped by tenant/workspace
- Cannot skip an already-skipped or completed commitment
- Skip does not send email

**Sending/automation impact:** None.

---

### 4.3 — Reschedule Follow-Up Commitment

**Purpose:** Move the commitment due date to a new explicit date/time.

**Preconditions:**
- Commitment exists in current tenant/workspace
- `commitment_status = 'open'`
- New due date is in the future (or at minimum a non-null datetime — policy TBD)

**Required permission:** `crm.leads.edit`

**Tenant/workspace scoping:** Same as Complete.

**Data written (option A — update in place):**
- `follow_up_due_at` → new date/time
- `rescheduled_from` → previous `follow_up_due_at` value (NOT in current schema — see Section 8)
- `reschedule_count` → incremented (NOT in current schema — optional, see Section 15)
- `updated_at` → `now()`

**Data written (option B — close and create new):**
- Existing commitment: `commitment_status` → `'rescheduled'` (new status value, NOT in schema)
- New commitment: copy fields, set new `follow_up_due_at`, increment `follow_up_sequence` or preserve it (policy TBD — see Section 15, open question 3)

**Audit event required:** Yes — `mutation_type: 'reschedule'`, previous due date, new due date, actor, timestamp.

**UI confirmation behavior:** Reschedule action requires an explicit date/time picker. Must show previous due date for reference. No auto-populated date.

**Failure modes:**
- New date is null or invalid → reject before write
- Commitment not in `open` status → conflict error
- Permission denied → error

**Tests that should eventually exist:**
- Reschedule writes new `follow_up_due_at`
- Reschedule records previous value in audit trail
- Cannot reschedule to null date
- Reschedule is tenant/workspace scoped
- Reschedule does not send email

**Sending/automation impact:** None.

---

### 4.4 — Reopen Follow-Up Commitment

**Purpose:** Reverse a `completed` or `skipped` status back to `open` if the operator made an error or the situation changed.

**Preconditions:**
- Commitment exists in current tenant/workspace
- `commitment_status = 'completed'` or `'skipped'`

**Required permission:** `crm.leads.edit` (or stronger if reversal is considered a management action — see Section 15, open question 4)

**Tenant/workspace scoping:** Same as Complete.

**Data written:**
- `commitment_status` → `'open'`
- `completed_at` → cleared (set to `null`) if reopening a completed commitment
- `completed_by_user_id` → cleared if reopening
- `completion_notes` → preserve or clear (policy TBD)
- `skipped_at` → cleared if reopening a skipped commitment (if column exists after migration)
- `updated_at` → `now()`

**Audit event required:** Yes — `mutation_type: 'reopen'`, previous status, actor, timestamp, optional reason.

**UI confirmation behavior:** Confirmation dialog ("Reopen this commitment?"). Reversibility should be clearly signaled.

**Failure modes:**
- Cannot reopen a `proposal_closed` commitment (would require understanding proposal status implications — see Section 15, open question 5)
- Permission denied → error

**Tests that should eventually exist:**
- Reopen restores `commitment_status = 'open'`
- Reopen is tenant/workspace scoped
- Cannot reopen a `proposal_closed` commitment
- Reopen does not trigger email

**Sending/automation impact:** None.

---

### 4.5 — Generate Follow-Up Draft (Design Only)

**Purpose:** Use LLM to generate a draft follow-up message for the operator to review before any action is taken.

**Preconditions:**
- Commitment exists in current tenant/workspace
- `commitment_status = 'open'` (draft for an already-completed follow-up would be unusual)
- LLM provider is available and operator has appropriate permission

**Required permission:** Likely a separate `messaging.send_emails` or a new `proposals.draft` permission — to be determined. Must NOT be the same as basic view.

**Tenant/workspace scoping:** Draft must be created within the correct tenant/workspace.

**Data written:**
- New row in `email_drafts` table (existing table, linked via `draft_id` FK on commitments)
- Commitment `draft_id` → updated to reference new draft
- Draft status → `'pending_review'` (not ready to send)
- `updated_at` → `now()`

**Audit event required:** Yes — `mutation_type: 'draft_generated'`, draft ID, actor, timestamp.

**UI behavior:** Draft generation triggers a review artifact. The operator sees the draft text and can edit it before any approval. No send button is shown in Phase 3R.

**Failure modes:**
- LLM unavailable → error, no partial write
- Draft creation fails → commitment `draft_id` not updated
- Permission denied → error

**Tests that should eventually exist:**
- Draft generation writes to `email_drafts` only — does not send
- `commitment_status` is NOT changed by draft generation
- Draft is linked to commitment via `draft_id`
- Draft generation does not enqueue Inngest job

**Sending/automation impact:** None in Phase 3R. Draft generation creates a review artifact only. The path from draft to send must be designed in a future phase with explicit `EMAIL_SENDING_ENABLED` gate.

---

### 4.6 — Approve and Send (Future Phase Only)

**Purpose:** Allow an operator to approve a reviewed draft and send it via email.

**Status:** This mutation type is out of scope for Phase 3R implementation. It is documented here for design completeness only.

**Requirements before implementation:**
- `EMAIL_SENDING_ENABLED` must be explicitly enabled
- A separate design doc for the send path must be written, reviewed, and committed
- A separate Codex review is required for the send path
- `workflow.approve_requests` permission is likely the appropriate gate (already in codebase)
- The `email_drafts` → approved → sent state machine must be fully designed

**Sending/automation impact:** This mutation WOULD send email. It may not be implemented until this design path is separately reviewed and `EMAIL_SENDING_ENABLED` is enabled with full team sign-off.

---

## 5. Proposed Write Architecture

The following files and layers are proposed for future implementation. They do not exist yet and must not be created in Phase 3R Slice 1.

### Repository write layer (proposed future file)

```
modules/proposals/repositories/proposal-follow-up-mutations.repo.ts
```

Proposed exports:
- `completeFollowUpCommitment(supabase, tenantId, workspaceId, commitmentId, actorUserId, notes?)` → `CommitmentRow`
- `skipFollowUpCommitment(supabase, tenantId, workspaceId, commitmentId, actorUserId, reason?)` → `CommitmentRow`
- `rescheduleFollowUpCommitment(supabase, tenantId, workspaceId, commitmentId, newDueAt, actorUserId)` → `CommitmentRow`
- `reopenFollowUpCommitment(supabase, tenantId, workspaceId, commitmentId, actorUserId)` → `CommitmentRow`

Each function must:
- Accept a `SupabaseClient` parameter (passed from service, not self-created — for testability)
- Scope the fetch-before-write by `(tenantId, workspaceId)` — never trust a bare ID
- Return the updated row on success
- Throw a typed error on conflict (wrong status) or not-found

### Service mutation layer (proposed future file)

```
modules/proposals/services/proposal-follow-up-mutations.service.ts
```

Proposed exports:
- `completeFollowUpCommitmentForWorkspace(tenantId, workspaceId, commitmentId, actorUserId, notes?)` → result type
- `skipFollowUpCommitmentForWorkspace(...)` → result type
- `rescheduleFollowUpCommitmentForWorkspace(...)` → result type
- `reopenFollowUpCommitmentForWorkspace(...)` → result type

Service layer responsibilities:
- Call repo write function
- Write audit event (to audit table or proposal events table — design TBD)
- Return typed result union (`{ ok: true; data: ... } | { ok: false; error: string }`)

### Server action layer (proposed future file)

```
modules/proposals/actions/proposal-follow-up-mutations.actions.ts
```

Proposed exports:
- `completeFollowUpCommitmentAction(input: CompleteFollowUpInput)` → `ActionResult<...>`
- `skipFollowUpCommitmentAction(input: SkipFollowUpInput)` → `ActionResult<...>`
- `rescheduleFollowUpCommitmentAction(input: RescheduleFollowUpInput)` → `ActionResult<...>`
- `reopenFollowUpCommitmentAction(input: ReopenFollowUpInput)` → `ActionResult<...>`

Action layer responsibilities:
- `'use server'` directive
- `buildRequestContext(supabase)` to derive `tenantId`, `workspaceId`, `actorUserId` — never from client input
- `requirePermission(ctx, 'crm.leads.edit')` before any mutation
- Input sanitization (commitment ID format check, date validation for reschedule)
- Call service layer

### Test file (proposed future file)

```
tests/phase3r-proposal-follow-up-mutations.test.ts
```

### UI controls (proposed future slices)

Row-level action controls on the `/proposal-follow-ups` queue page — not implemented in Phase 3R. See Section 11 for UX design rules.

### Audit trail (proposed future table or service)

See Section 9. The audit store must be designed before mutation services are built.

---

## 6. Existing vs. Proposed: All as Proposed Future Only

The layers above are proposals only. **No repository, service, action, test file, or UI file is created in Phase 3R Slice 1.**

---

## 7. Data Model Considerations

### Fields already in schema (migration 20240038)

| Column | Type | Mutation relevance |
|--------|------|--------------------|
| `commitment_status` | `text` | Written by all mutations |
| `completed_at` | `timestamptz \| null` | Written by Complete mutation |
| `completed_by_user_id` | `uuid \| null` → FK users | Written by Complete mutation |
| `completion_notes` | `text \| null` | Written by Complete mutation |
| `follow_up_due_at` | `timestamptz` | Written by Reschedule mutation |
| `updated_at` | `timestamptz` | Written by all mutations |
| `draft_id` | `uuid \| null` → FK email_drafts | Written by Draft Generation mutation |

The existing schema is sufficient for the **Complete** mutation without any migration.

### Fields NOT in schema — migration likely required before implementation

| Proposed field | Table | Type | Required for |
|----------------|-------|------|-------------|
| `skipped_at` | `proposal_follow_up_commitments` | `timestamptz \| null` | Skip mutation |
| `skipped_reason` | `proposal_follow_up_commitments` | `text \| null` | Skip mutation |
| `decided_by_user_id` | `proposal_follow_up_commitments` | `uuid \| null` → FK users | Skip and Reopen mutations |
| `rescheduled_from` | `proposal_follow_up_commitments` | `timestamptz \| null` | Reschedule mutation (audit) |
| `reschedule_count` | `proposal_follow_up_commitments` | `integer` default 0 | Reschedule (optional, for stats) |

**Alternatively**, these fields could be avoided by writing all mutation metadata to a dedicated audit table rather than adding columns to `proposal_follow_up_commitments`. This keeps the commitment row lean and the audit trail queryable. This decision must be made before any schema migration is created.

### Known status values in use

From the existing codebase (`closeOpenCommitmentsForProposal` and `updateProposalStatus` service):

| Status | Set by |
|--------|--------|
| `open` | Commitment creation (Phase 3N) |
| `completed` | Future: Complete mutation |
| `skipped` | Future: Skip mutation |
| `proposal_closed` | `closeOpenCommitmentsForProposal` (Phase 3N service) |

A `'rescheduled'` status would only be needed if Reschedule creates a new commitment (Option B from Section 4.3). If Reschedule updates in place (Option A), the status stays `open` and no new status value is needed.

### What must be verified before implementation begins

1. Confirm `skipped_at`, `skipped_reason`, `decided_by_user_id`, `rescheduled_from` are not already present in a future migration that post-dates migration 20240038.
2. Decide whether mutation metadata lives in additional columns or a dedicated audit table.
3. Confirm whether Reschedule uses Option A (update in place) or Option B (close + new commitment).
4. Confirm `email_drafts` table is ready to receive draft generation output.

---

## 8. Audit Trail Design

Each mutation must record a complete before/after snapshot. The following fields should be captured per audit event:

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | Audit event PK |
| `tenant_id` | uuid | Tenant scoping |
| `workspace_id` | uuid | Workspace scoping |
| `proposal_event_id` | uuid | Parent proposal event |
| `follow_up_commitment_id` | uuid | Target commitment |
| `actor_user_id` | uuid | Who performed the mutation — from `ctx.userId`, never client input |
| `mutation_type` | text | `'complete'`, `'skip'`, `'reschedule'`, `'reopen'`, `'draft_generated'` |
| `previous_status` | text | `commitment_status` before mutation |
| `next_status` | text | `commitment_status` after mutation |
| `previous_due_at` | timestamptz \| null | Populated for Reschedule |
| `next_due_at` | timestamptz \| null | Populated for Reschedule |
| `reason_or_note` | text \| null | Operator-provided text (skip reason, completion note) |
| `occurred_at` | timestamptz | Server-set, not client-provided |
| `source` | text | `'operator_action'` for all Phase 3R mutations |

### Audit storage options (to be decided)

**Option A — Dedicated audit table:** `proposal_follow_up_mutation_events` (new table, new migration). Clean separation, fully queryable.

**Option B — Append to `proposal_events`-style table:** If a general audit/event table already exists, reuse it. Reduces migration surface.

**Option C — Write to `proposal_events` as a domain event.** Consistent with how proposal status changes are tracked, but may conflate different event semantics.

The audit storage decision must be made before implementation begins. Whichever option is chosen must be designed with tenant isolation and indexed for per-commitment and per-workspace queries.

---

## 9. Permission Model

### Current permissions in the codebase

| Permission | Current use |
|-----------|-------------|
| `crm.leads.view` | All Phase 3Q reads; all proposal event reads |
| `crm.leads.create` | Lead creation |
| `crm.leads.edit` | Lead editing |
| `crm.leads.delete` | Lead deletion |
| `crm.companies.view/create/edit` | Company records |
| `crm.contacts.view/create/edit` | Contact records |
| `messaging.send_emails` | Email send path |
| `workflow.approve_requests` | Approval workflows |
| `artifacts.upload/view` | Artifact access |

### Recommended permission strategy for Phase 3R mutations

| Mutation | Recommended permission | Rationale |
|----------|----------------------|-----------|
| Complete | `crm.leads.edit` | Commitment is a lead-related record; editing is the write tier |
| Skip | `crm.leads.edit` | Same as Complete — same write tier |
| Reschedule | `crm.leads.edit` | Same tier; reschedule is a date change not a status change |
| Reopen | `crm.leads.edit` | Reversal is an edit operation; escalation to a manager permission is optional |
| Draft generation | `crm.leads.edit` or `messaging.send_emails` | Draft creation is a write; the closer semantic is messaging — to be decided |
| Approved send | `messaging.send_emails` + `workflow.approve_requests` | Future phase; both permissions likely required |

**Recommendation:** Use `crm.leads.edit` for Complete, Skip, Reschedule, and Reopen. This avoids inventing a new permission when an existing write-tier permission is semantically appropriate. Codex review should validate this choice before implementation.

No new permission strings should be introduced without a clear gap in the existing permission set.

---

## 10. UI/UX Design Rules

### Controls to add in future implementation slices (not Phase 3R Slice 1)

| Control | Location | Behavior |
|---------|----------|----------|
| Complete | Queue row action | Opens confirmation dialog; optional completion note; submits `completeFollowUpCommitmentAction` |
| Skip | Queue row action | Opens dialog with reason input; submits `skipFollowUpCommitmentAction` |
| Reschedule | Queue row action | Opens date/time picker; shows current due date; submits `rescheduleFollowUpCommitmentAction` |
| Reopen | Commitment detail or completed row | Opens confirmation; submits `reopenFollowUpCommitmentAction` |
| View details | Queue row | Links to Phase 3P `/proposal-events/[proposalEventId]` — already exists |

### UX guardrails

- Destructive or hard-to-reverse actions (skip, complete) require an inline confirmation step — never a single unconfirmed click.
- Skip must present a reason input field. Whether the reason is required or optional is an open question (see Section 15, item 2).
- Reschedule must require an explicit date/time. No auto-populated "tomorrow" defaults — the operator must consciously select a date.
- No send buttons in Phase 3R. If a draft generation control is added, it must produce only a review artifact with no visible send affordance until a future send phase is approved.
- Draft generation should label the output clearly: "Review draft — not sent."
- The queue page must remain fully functional as read-only for users who do not have `crm.leads.edit` permission. Mutation controls are hidden, not disabled, for users without write permission.

---

## 11. Sending and Automation Guardrails

These constraints are non-negotiable in Phase 3R and all future phases until explicitly designed and approved:

| Constraint | Status |
|-----------|--------|
| Completing/skipping/rescheduling a commitment must NOT send email | Enforced — no email call in mutation service |
| Draft generation must NOT send email | Enforced — draft is written to review queue only |
| Approved send must be designed separately | Not in Phase 3R scope |
| `EMAIL_SENDING_ENABLED` must remain disabled | Until a future sending phase is designed, reviewed, and enabled |
| `CAMPAIGN_SENDING_ENABLED` must remain disabled | Out of scope indefinitely until explicit campaign design |
| No Inngest/background automation jobs | No Inngest imports in any Phase 3R file |
| No OpenAI/Anthropic LLM calls except in a controlled future draft-generation slice | LLM imports forbidden in action and service files |
| Mutation actions must use `buildRequestContext` — no client-provided tenantId/workspaceId | Security invariant from Phase 3Q |
| All mutations scoped by `(tenantId, workspaceId)` fetch-before-write | No trust of commitment ID alone |

---

## 12. Test Strategy for Future Implementation

Tests must follow the established source-reading + runtime pattern from Phase 3N/3O/3P/3Q.

### Source-reading assertions (future `tests/phase3r-proposal-follow-up-mutations.test.ts`)

- Repo write file exists and is readable
- `completeFollowUpCommitment`, `skipFollowUpCommitment`, `rescheduleFollowUpCommitment`, `reopenFollowUpCommitment` are exported
- Each function scopes by `(tenantId, workspaceId)` — no bare commitment ID trust
- Mutation functions do not reference `sendEmail`, `Resend`, `Inngest`, `OpenAI`, `Anthropic`
- Mutation functions do not reference `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- Action file uses `'use server'` directive
- Action file uses `buildRequestContext` — not client-supplied tenant/workspace
- Action file uses `requirePermission` before any mutation call
- Action file does not import Resend, Inngest, LLM providers
- No mutation action exports `sendFollowUpAction` or `approvedSendAction` (send blocked in Phase 3R)

### Runtime / integration assertions (future)

- Complete mutation: `commitment_status = 'completed'`, `completed_at` is set, `completed_by_user_id` matches actor
- Skip mutation: `commitment_status = 'skipped'`, `skipped_reason` is written if field exists
- Reschedule mutation: `follow_up_due_at` updated, previous value recorded in audit trail
- Reopen mutation: `commitment_status = 'open'`, previous completed/skipped fields cleared
- Cross-tenant mutation rejected: commitment from different tenant returns not-found error, not unauthorized (to avoid leaking existence)
- Cross-workspace mutation rejected: same pattern
- Mutating a `proposal_closed` commitment returns conflict error
- No email is sent after any mutation
- No Inngest event is enqueued after any mutation

---

## 13. Recommended Slice Plan

This plan is a proposal only. Each slice must receive independent design and Codex review before implementation.

| Slice | Deliverable | Notes |
|-------|-------------|-------|
| **3R-1** | This design document | Documentation only — current slice |
| **3R-2** | Implementation plan approval + schema decision | Decide: audit table vs. column additions, reschedule option A vs. B, skip reason required? |
| **3R-3** | Repository write model — Complete and Skip only | Smallest safe write surface; defers Reschedule complexity |
| **3R-4** | Service layer with audit event writing | Depends on audit table/column decision from 3R-2 |
| **3R-5** | Server actions with permission checks | `completeFollowUpCommitmentAction`, `skipFollowUpCommitmentAction` |
| **3R-6** | Reschedule repository + service + action | Separate slice; Option A or B must be decided first |
| **3R-7** | Reopen repository + service + action | Simplest reversal; deferred until complete/skip are stable |
| **3R-8** | Read-only confirmation UI (drawer or modal) | UI foundation before adding buttons to queue page |
| **3R-9** | Complete + Skip UI controls on queue page | Wires actions to the queue; guarded by permission |
| **3R-10** | Reschedule UI control on queue page | Date picker UX; wires reschedule action |
| **Phase 3S** | Draft generation design and implementation | Separate phase; requires LLM design review |
| **Phase 3T** | Approved send path design and implementation | Separate phase; requires `EMAIL_SENDING_ENABLED` decision |

Each slice commits independently, passes the focused test suite, and receives Codex review before the next begins. Slices 3–10 must not begin until Slice 2's schema and implementation plan is reviewed and approved.

---

## 14. Open Questions

The following must be resolved in Phase 3R Slice 2 (implementation plan) before any code is written:

1. **Which existing permission should govern follow-up mutations?** Recommendation is `crm.leads.edit`, but this should be validated against how permission sets are assigned to workspace roles.

2. **Should `skipped_reason` be required?** A required reason improves auditability but adds friction. A team policy decision is needed.

3. **Should Reschedule update the existing commitment (Option A) or close it and create a new one (Option B)?** Option A is simpler; Option B preserves a full history trail as separate rows. The choice affects schema, service design, and UI behavior.

4. **Should Complete and Skip be reversible (reopen)?** The Reopen mutation assumes yes. If reopen is not permitted, the mutation service should reject it and Reopen never needs to be built.

5. **How should proposal status interact with follow-up completion?** If an operator completes all commitments for a proposal, should the proposal status change? The current `updateProposalStatus` service closes commitments on terminal proposal status — the reverse direction (all commitments complete → proposal status update) is an open policy question.

6. **Should draft generation belong in Phase 3R or a separate Phase 3S?** Draft generation introduces LLM calls, which require their own design and review. Separating it into Phase 3S keeps Phase 3R mutation-only and easier to reason about.

7. **What is the authoritative audit event table?** Options: a new dedicated `proposal_follow_up_mutation_events` table, reuse of an existing events pattern, or appending to a general audit log. This must be decided before the service layer is implemented.

8. **Should Reschedule be permitted on overdue commitments, or only future-dated commitments?** Allowing past-date reschedule is a footgun; disallowing it may frustrate legitimate backfill scenarios.

9. **Who can see the audit trail?** Is it operator-only, admin-only, or visible in the UI? This affects whether a UI surface for the audit trail is needed in Phase 3R.

---

## 15. Final Recommendation

**Do not implement any mutation logic until:**

1. This design document is reviewed and approved by the team.
2. A Codex review is conducted on this design (not the implementation — the design).
3. The open questions in Section 14 are answered and the answers are committed to a Phase 3R Slice 2 implementation plan document.
4. Any required schema changes are designed and reviewed before migrations are applied.
5. All Phase 3Q guardrails remain unchanged — `EMAIL_SENDING_ENABLED` and `CAMPAIGN_SENDING_ENABLED` disabled, no Inngest, no LLM in mutation files.

The Phase 3Q read-only foundation is stable and locked. Phase 3R mutations build on top of it with a more complex write surface. The incremental slice approach (Complete/Skip first, Reschedule second, Reopen third, UI last) reduces risk and keeps each review surface small.

Draft generation and approved sending must remain in separate future phases (Phase 3S and Phase 3T) with independent design documents and Codex reviews.
