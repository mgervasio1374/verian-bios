# Phase 3R — Reschedule Implementation Checkpoint

**Type:** Documentation-only checkpoint — no code changes
**Created:** 2026-06-01
**Relates to:** Phase 3R Slices 14B–14E

---

## 1. Purpose

Complete and Skip are now end-to-end. This checkpoint confirms the data model, ActivityEventType constant gap, and slice order before Reschedule implementation begins.

Reschedule is the next controlled mutation in Phase 3R. It differs from Complete and Skip in one important way: it does not close the commitment. It updates `follow_up_due_at` while keeping `commitment_status = 'open'`. The commitment remains visible in the queue at the new date.

This document records the Option A decision, the exact repository/service/action/UI behavior required, and the open questions that must be resolved before or during implementation.

---

## 2. Current State

| Path | Status |
|------|--------|
| Complete | End-to-end: `CompleteFollowUpButton → completeFollowUpCommitmentAction → completeFollowUpCommitmentForWorkspace → completeFollowUpCommitment` |
| Skip | End-to-end for local / remote-dev: `SkipFollowUpButton → skipFollowUpCommitmentAction → skipFollowUpCommitmentForWorkspace → skipFollowUpCommitment` |
| Skip (production) | Blocked — migration 20240039 not yet applied to production; requires separate approval |
| Reschedule | Not implemented — repository, service, action, and UI all absent |
| Reopen | Deferred — not in scope until Reschedule is complete and reviewed |

---

## 3. Option A Confirmed — Update In Place, No Migration

**Decision: Option A.**

Reschedule will update the existing `follow_up_due_at` field in place on an open commitment. No new columns are added. No migration is required for this slice sequence.

| Decision point | Option A (chosen) | Option B (rejected) |
|----------------|-------------------|---------------------|
| Schema change | None | Add `rescheduled_from`, `rescheduled_to`, `reschedule_count`, `rescheduled_by_user_id` |
| Migration | Not required | Requires new migration |
| History | Captured in `activity_events.properties` | Captured in dedicated columns |
| `commitment_status` | Stays `'open'` | Stays `'open'` |
| Reporting | Via `activity_events` query | Via column query or both |

Option B is rejected for Phase 3R. If high-volume reschedule reporting becomes a concrete requirement in a later phase, dedicated columns can be added then without altering the service interface.

---

## 4. Why Option A

- Matches the Phase 3R implementation plan (Section 8.3 — Reschedule uses Option A explicitly).
- `follow_up_due_at` already exists on `proposal_follow_up_commitments` (migration 20240038). No schema churn.
- `activity_events.properties` already stores `previous_*` / `next_*` fields for Complete and Skip. Same pattern applies here.
- The queue read model stays simple: it queries `commitment_status = 'open'` — a rescheduled commitment is just a still-open commitment with an updated due date.
- Avoids adding columns before there is demonstrated reporting need.

---

## 5. ActivityEventType Gap — Must Add PROPOSAL_FOLLOW_UP_RESCHEDULED

**Current state of `modules/intelligence/types.agent.ts`:**

```typescript
PROPOSAL_FOLLOW_UP_CREATED:   'proposal_follow_up_created',
PROPOSAL_FOLLOW_UP_COMPLETED: 'proposal_follow_up_completed',
PROPOSAL_FOLLOW_UP_SKIPPED:   'proposal_follow_up_skipped',
```

`PROPOSAL_FOLLOW_UP_RESCHEDULED` does **not** yet exist. It must be added to `ActivityEventType` as part of the service slice (Slice 14C). Adding a constant to `types.agent.ts` is an additive change — no migration, no schema change.

The constant to add:
```typescript
PROPOSAL_FOLLOW_UP_RESCHEDULED: 'proposal_follow_up_rescheduled',
```

Adding this in the service slice (not the repository slice) keeps the constant co-located with its first and only caller.

---

## 6. Repository Behavior (Slice 14B)

**File:** `modules/proposals/repositories/proposal-follow-up-mutations.repo.ts`

**Function:** `rescheduleFollowUpCommitment`

**Signature:**
```typescript
export async function rescheduleFollowUpCommitment(
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  actorUserId: string,
  nextFollowUpDueAt: string,
): Promise<ProposalFollowUpMutationCommitmentRow>
```

**Behavior:**

1. Fetch-before-write scoped by `(id, tenant_id, workspace_id)` — same as Complete and Skip.
2. If not found → throw `ProposalFollowUpMutationError('not_found', …)`.
3. If `commitment_status !== 'open'` → throw `ProposalFollowUpMutationError('not_open', …)`.
4. Validate `nextFollowUpDueAt` is a non-empty string (ISO format validation belongs in the action; repository trusts it is valid).
5. Update predicate includes `commitment_status = 'open'` race guard — same as Complete and Skip.
6. Write only:

| Field | Value |
|-------|-------|
| `follow_up_due_at` | `nextFollowUpDueAt` |
| `updated_at` | `now()` |

7. Do NOT write any of:
   - `commitment_status` (must stay `'open'`)
   - `completed_at`, `completed_by_user_id`, `completion_notes`
   - `skipped_at`, `skipped_by_user_id`, `skipped_reason`
   - Any proposal-level field

8. No-row after guarded update → throw `ProposalFollowUpMutationError('not_open', …)` (race condition — same pattern as Complete and Skip).
9. Does NOT call `recordActivityEvent` (audit belongs to service).
10. Does NOT call `requirePermission` (permission belongs to action).
11. Uses `createSupabaseServiceClient`, not browser client.

---

## 7. Service Behavior (Slice 14C)

**File:** `modules/proposals/services/proposal-follow-up-mutations.service.ts`

**New constant (add to `modules/intelligence/types.agent.ts` in this slice):**
```typescript
PROPOSAL_FOLLOW_UP_RESCHEDULED: 'proposal_follow_up_rescheduled',
```

**Result type:**
```typescript
export type RescheduleFollowUpCommitmentResult =
  | { ok: true;  commitment: ProposalFollowUpMutationCommitmentRow }
  | { ok: false; error: 'not_found' | 'not_open' | 'write_failed' | 'audit_failed' | 'unknown_error' }
```

**Function:** `rescheduleFollowUpCommitmentForWorkspace`

**Behavior:**
1. Calls `rescheduleFollowUpCommitment` — maps `ProposalFollowUpMutationError` codes to result.
2. On success, calls `recordActivityEvent` with:

| Field | Value |
|-------|-------|
| `tenantId` | From service arg — never client input |
| `workspaceId` | From service arg — never client input |
| `eventType` | `ActivityEventType.PROPOSAL_FOLLOW_UP_RESCHEDULED` |
| `eventSource` | `'operator_action'` |
| `entityType` | `'proposal_follow_up_commitment'` |
| `entityId` | `commitment.id` |
| `leadId` | `commitment.lead_id ?? undefined` |
| `eventSummary` | `'Follow-up commitment rescheduled'` |
| `properties.previous_status` | `'open'` |
| `properties.next_status` | `'open'` |
| `properties.actor_user_id` | `actorUserId` |
| `properties.proposal_event_id` | `commitment.proposal_event_id` |
| `properties.follow_up_commitment_id` | `commitment.id` |
| `properties.follow_up_sequence` | `commitment.follow_up_sequence` |
| `properties.previous_follow_up_due_at` | The old due date (must be captured from the fetched row before update — see note below) |
| `properties.next_follow_up_due_at` | `nextFollowUpDueAt` (the new date) |

**Note on `previous_follow_up_due_at`:** The repository's `maybeSingle()` update returns the updated row. The old due date is not available from the updated row. The service must receive it as a return field or the repository must return both old and new. **Simplest approach:** have the repository return the updated row and include `nextFollowUpDueAt` as a service-layer arg — the `previous_follow_up_due_at` can be included in a two-step approach or by modifying the repository to also return the previous value. Alternatively, the fetch step in the repository selects `follow_up_due_at` — this value can be threaded through.

**Recommended implementation:** Include `previous_follow_up_due_at` as an additional return field on `ProposalFollowUpMutationCommitmentRow` is not feasible (it's the row type). Instead, have the repository function accept `nextFollowUpDueAt` and return the updated row; the service captures the `previous_follow_up_due_at` by having the repository fetch the old row first (which it already does) and return it alongside the updated row, or by having the service call the repository for the fetch and record `previousDueAt` before calling update. The cleanest approach: add `previousFollowUpDueAt` as a second return value or a tuple — or simply accept this limitation and log only `next_follow_up_due_at` in phase 14C, with `previous_follow_up_due_at` deferred. **Decision to make before Slice 14B:** how to thread the previous due date through.

3. Audit failure → return `{ ok: false, error: 'audit_failed' }` with no rollback (same pattern as Complete and Skip).
4. Does NOT call `requirePermission`.

---

## 8. Action Behavior (Slice 14D)

**File:** `modules/proposals/actions/proposal-follow-up-mutations.actions.ts`

**Input type:**
```typescript
export interface RescheduleFollowUpCommitmentActionInput {
  commitmentId?: string
  nextFollowUpDueAt?: string
}
```

**Data type:**
```typescript
export interface RescheduleFollowUpCommitmentActionData {
  commitmentId: string
  status: 'open'
  nextFollowUpDueAt: string
}
```

**Behavior:**
1. `'use server'` directive.
2. `createSupabaseServerClient()` → `buildRequestContext(supabase)`.
3. `requirePermission(ctx, 'crm.leads.edit')`.
4. Validate `commitmentId` — non-empty string after trim.
5. Validate `nextFollowUpDueAt` — non-empty string after trim; must represent a valid future or near-future date. Consider whether past rescheduling (catch-up) should be allowed — see Open Questions.
6. Pass `ctx.tenantId`, `ctx.workspaceId`, `ctx.userId` to service. Do NOT accept these from client input.
7. Call `rescheduleFollowUpCommitmentForWorkspace` only — not the repository directly.
8. Map result codes: `not_found`, `not_open`, `write_failed`, `audit_failed`, `unknown_error`.
9. On success: return `ActionResult` with `commitmentId`, `status: 'open'`, `nextFollowUpDueAt`.
10. Does NOT call `recordActivityEvent`.

---

## 9. UI Behavior (Slice 14E)

**File:** `app/(workspace)/[workspaceSlug]/proposal-follow-ups/RescheduleFollowUpButton.tsx`

**Key constraints:**
- `'use client'` directive.
- Accepts `commitmentId: string` only — no tenantId/workspaceId/actorUserId.
- Requires a date/time input for `nextFollowUpDueAt` (use `<input type="datetime-local" />` or equivalent).
- Operator must confirm before action call.
- Confirmation text must make clear:
  - This sets a new due date for the follow-up.
  - It does NOT send an email.
  - It does NOT close the commitment.
  - It does NOT change proposal status.
- State machine: `idle → confirming → loading → success | error` (same as Complete and Skip).
- `router.refresh()` on success.
- No background job, no automation.

**Queue page integration:**
- Render `RescheduleFollowUpButton` alongside `CompleteFollowUpButton` and `SkipFollowUpButton` for each open row.
- Pass only `item.id` as `commitmentId`.

---

## 10. Recommended Slice Order

| Slice | Deliverable | Notes |
|-------|-------------|-------|
| **14B** | Reschedule repository mutation | `rescheduleFollowUpCommitment`; Option A fields only; no audit/permission; same fetch-before-write pattern |
| **14C** | Reschedule service + `activity_events` audit | `rescheduleFollowUpCommitmentForWorkspace`; add `PROPOSAL_FOLLOW_UP_RESCHEDULED` to `ActivityEventType`; `previous_follow_up_due_at` threading decision must be resolved first |
| **14D** | Reschedule server action | `rescheduleFollowUpCommitmentAction`; `crm.leads.edit`; date validation; no direct repo call |
| **14E** | Reschedule UI confirmation control | `RescheduleFollowUpButton`; date/time input; wired into queue page |
| **14F** | Permission-visibility polish (optional) | Hide Complete/Skip/Reschedule buttons for users without `crm.leads.edit`; pass `canMutate` prop from server page |

Each slice commits and tests independently before the next begins. Reschedule Codex review is required before Slice 15 (Reopen, if approved).

---

## 11. Guardrails

- No emails — `EMAIL_SENDING_ENABLED` remains disabled.
- No campaign sending — `CAMPAIGN_SENDING_ENABLED` remains disabled.
- No automation or background jobs — no Inngest.
- No LLM/AI provider imports in any Phase 3R file.
- No proposal status mutation from any Reschedule action.
- No email draft generation.
- Reschedule does NOT change `commitment_status`.
- No new migration required for Option A.
- No Reopen until Reschedule is complete and reviewed.
- Production migration 20240039 (Skip fields) requires separate explicit approval — do not apply in a Reschedule slice.

---

## 12. Open Questions to Resolve Before Slice 14B

| # | Question | Impact |
|---|----------|--------|
| 1 | Should `nextFollowUpDueAt` be validated as a future date only, or is past rescheduling (catch-up) allowed? | Action input validation in Slice 14D |
| 2 | How to thread `previous_follow_up_due_at` into the audit event? Options: (a) include previous value in repo return; (b) capture from fetch step in service; (c) omit from initial audit and add later | Slice 14B/14C design |
| 3 | Should a `rescheduleReason` optional field be included alongside the date? | If yes, add to all layers in same slice; if no, omit entirely |
| 4 | Should `RescheduleFollowUpButton` render for all operators (matching Complete/Skip current behavior) or be hidden behind permission check (Slice 14F)? | Slice 14E scope decision |

**Recommended answers before beginning Slice 14B:**
- Q1: Allow past dates (catch-up rescheduling is a valid use case — an overdue commitment can be marked as "actually followed up on X date").
- Q2: Capture `previous_follow_up_due_at` from the fetch step (repository already selects the row before update; pass it back as part of an augmented return or capture it in the service before calling the repo). Preferred: repository returns updated row as before; service layer calls the repo for fetch independently if needed. Simplest: add `previousFollowUpDueAt` as an additional arg to the service that the action supplies from a pre-fetch — but this breaks the service layer encapsulation. **Best resolution:** have the repository expose the pre-update value by returning a struct `{ previous: Row; updated: Row }` — but this changes the return type used by Complete and Skip. Instead, the cleanest option is for the service to capture `previousDueAt` from a separate fetch before calling the repo mutation, or accept that the first implementation logs only `next_follow_up_due_at` and defers `previous_follow_up_due_at` to a later polish.
- Q3: Defer `rescheduleReason` — not required for initial implementation.
- Q4: Render for all operators in initial implementation (consistent with Complete and Skip); add permission-gating in Slice 14F if desired.
