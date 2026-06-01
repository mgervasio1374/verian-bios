# Phase 3R — Controlled Proposal Follow-Up Mutations Implementation Plan

**Status:** Documentation only — no implementation started
**Created:** 2026-06-01
**Updated:** 2026-06-01 (Slice 3 QA polish — slice sequence reordered, activity event wording clarified)
**Predecessor:** Phase 3R Slice 1 design (`docs/roadmap/phase-3r-controlled-proposal-follow-up-mutations-design.md`)
**Depends on:** Phase 3Q locked read-only foundation

---

## 1. Baseline

| Item | Value |
|------|-------|
| Phase 3Q lock tag | `phase-3q-proposal-follow-up-work-queue-v1` |
| Phase 3Q lock target | `8806bed879401086db53d1463c6da91048fc5a6d` |
| Current `origin/master` | `286a633` — Docs: add Phase 3R controlled follow-up mutation design |
| Phase 3Q focused tests | 636 / 636 passing at lock |

### Phase 3Q read-only stack (unchanged — current UI remains read-only)

```
proposal_follow_up_commitments (DB — migration 20240038)
    ↓
listProposalFollowUpQueueItemsForWorkspace (batch-enriched read model)
    ↓
getProposalFollowUpQueueForWorkspace (service — summary counts)
    ↓
getProposalFollowUpQueueAction (server action — sanitized filters, context-scoped)
    ↓
/proposal-follow-ups (read-only Server Component)
```

No mutation controls exist anywhere in the current codebase for proposal follow-up commitments. This plan defines the path to adding them safely.

---

## 2. Decisions from Phase 3R Slice 1 Codex Review

The following decisions are recorded and binding for all Phase 3R implementation slices.

### Decision 1 — Draft status: `pending_review` is not used

The Slice 1 design doc proposed `email_drafts.status = 'pending_review'`. This is incorrect.

**Decision:** The existing messaging draft flow uses `pending_approval` for review-gated drafts, defined in `modules/messaging/constants/email-draft-status.ts`:

```typescript
export const EDITABLE_EMAIL_DRAFT_STATUSES = ['draft', 'pending_approval', 'rejected'] as const
```

Any future draft generation for follow-ups (Phase 3S) must use the existing `pending_approval` lifecycle, not invent `pending_review`. Draft generation is deferred to Phase 3S entirely — it is not in Phase 3R scope. This decision is recorded here to prevent drift.

### Decision 2 — `proposal_events` must not be used as a mutation audit log

The Slice 1 design doc listed writing mutation audit into `proposal_events` as an option. This is rejected.

**Decision:** `proposal_events` is the durable proposal lifecycle record. It must not accumulate mutation audit entries for follow-up commitments. It is not an audit log.

**Chosen audit storage: `activity_events` with `recordActivityEvent`.**

Full reasoning is in Section 7.

---

## 3. Phase 3R Implementation Scope

### Phase 3R covers

| Mutation | Notes |
|----------|-------|
| Complete follow-up commitment | Fully covered by existing schema — no migration required |
| Skip follow-up commitment | Requires migration for `skipped_at`, `skipped_reason`, `skipped_by_user_id` fields |
| Reschedule follow-up commitment | Option A (update in place) — no new columns required |
| Reopen follow-up commitment | Deferred — implement only after Complete and Skip are stable and explicitly approved |
| Audit logging for all write mutations | Via existing `activity_events` infrastructure |

### Phase 3R does not cover

| Item | Reason |
|------|--------|
| Email sending | `EMAIL_SENDING_ENABLED` remains disabled |
| Campaign sending | `CAMPAIGN_SENDING_ENABLED` remains disabled |
| LLM draft generation implementation | Deferred to Phase 3S |
| Approved send path | Deferred to Phase 3T |
| Autonomous follow-up automation | No Inngest/background jobs |
| New send controls of any kind | Not in scope |
| New system controls | Not in scope |

---

## 4. Schema Decision

### Complete mutation — no migration required

The existing `proposal_follow_up_commitments` table (migration 20240038) already has all fields needed for the Complete mutation:

| Column | Type | Use |
|--------|------|-----|
| `commitment_status` | `text` CHECK | Updated to `'completed'` |
| `completed_at` | `timestamptz \| null` | Set to `now()` |
| `completed_by_user_id` | `uuid \| null` → FK users | Set to actor user ID |
| `completion_notes` | `text \| null` | Set to optional operator note |
| `updated_at` | `timestamptz` | Updated to `now()` |

**The Complete mutation can be fully implemented without any schema migration.** This is the most important constraint-shaping fact in this plan.

### Skip mutation — migration required

The current schema has no `skipped_at`, `skipped_reason`, or `skipped_by_user_id` columns. These are needed to record the skip action with full operator context.

**Proposed columns to add via migration 20240039:**

```sql
ALTER TABLE proposal_follow_up_commitments
  ADD COLUMN skipped_at         timestamptz NULL,
  ADD COLUMN skipped_reason     text        NULL,
  ADD COLUMN skipped_by_user_id uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL;
```

Without this migration, the Skip mutation must be deferred. The Complete mutation can proceed ahead of Skip.

### Reschedule mutation — Option A, no new columns required

**Decision: Reschedule updates the commitment in place (Option A).**

Rationale:
- Simpler schema — no new `rescheduled` status value, no `rescheduled_from` column required
- Full history is captured in `activity_events` (`properties.previous_due_at` / `properties.new_due_at`)
- `commitment_status` stays `'open'` — the commitment remains active at the new date
- Querying history is done through the audit trail, not through denormalized columns on the commitment row

**Fields written by Reschedule:**
- `follow_up_due_at` → new date/time (already exists)
- `updated_at` → `now()` (already exists)

No migration is required for the Reschedule mutation. The audit trail captures the previous value.

### Reopen mutation — no new columns required, status only

**Decision: Reopen is deferred until Complete and Skip are stable.**

If implemented, Reopen would:
- Set `commitment_status` → `'open'`
- Clear `completed_at`, `completed_by_user_id`, `completion_notes` if reopening a completed commitment
- Clear `skipped_at`, `skipped_reason`, `skipped_by_user_id` if reopening a skipped commitment (requires migration 20240039 to already be applied)
- Update `updated_at`

No new columns beyond what Complete and Skip add.

---

## 5. Status Model for Phase 3R

The `commitment_status` CHECK constraint in migration 20240038 is:

```sql
CHECK (commitment_status IN ('open','completed','skipped','proposal_closed'))
```

**Decision: No new status values are needed in Phase 3R.**

| Status | Set by |
|--------|--------|
| `'open'` | Commitment creation (Phase 3N); Reopen mutation (future) |
| `'completed'` | Complete mutation (Phase 3R) |
| `'skipped'` | Skip mutation (Phase 3R) |
| `'proposal_closed'` | `closeOpenCommitmentsForProposal` (Phase 3N service) |

Reschedule keeps `commitment_status = 'open'` — it is not a status transition, it is a due-date update. No `'rescheduled'` status value is needed.

---

## 6. Audit Storage Decision

### Chosen approach: `activity_events` with `recordActivityEvent`

`activity_events` is the existing audit/signal infrastructure in `modules/intelligence/repositories/activity-event.repo.ts`. It already has:

- `recordActivityEvent(input: RecordActivityEventInput)` — write a new event
- `listEntityActivityEvents(tenantId, entityType, entityId)` — query by entity
- `properties: Json` column — stores arbitrary before/after mutation data
- `metadata: Json` column — stores context metadata

**Why `activity_events` is the right choice:**

1. Already exists — no new migration, no new table, no new infrastructure
2. Already used for proposal lifecycle events (e.g. `PROPOSAL_STATUS_UPDATED`); the follow-up event type constants (`PROPOSAL_FOLLOW_UP_COMPLETED`, `PROPOSAL_FOLLOW_UP_SKIPPED`) are already defined and ready for Phase 3R to use as the first emitters
3. Queryable per entity via `(entity_type, entity_id)` — enabling per-commitment audit history
4. `properties` JSON can store `previous_status`, `next_status`, `previous_due_at`, `new_due_at`, and any mutation-specific metadata
5. `lead_id` field allows querying all mutation events for a lead

**Why `proposal_events` is rejected:**

`proposal_events` is the durable business record of a proposal. It is not an append-only audit log. Writing mutation audit rows there would conflate business state with audit history, break the table's purpose, and create ambiguity in queries. This option is dropped per the Slice 1 Codex review.

**Why a dedicated `proposal_follow_up_mutation_events` table is not chosen for Phase 3R:**

A dedicated table would be appropriate if full queryable before/after snapshots of all mutation fields were a hard requirement, or if `activity_events` were not already in use for this domain. At Phase 3R scale (dozens to hundreds of mutations per workspace), `activity_events` with `properties` JSON provides sufficient query power without a new migration and new infrastructure layer. If high-volume mutation audit querying becomes a requirement in a later phase, a dedicated table can be added then without breaking the mutation service interface.

### Existing `ActivityEventType` constants for Phase 3R mutations

`ActivityEventType` in `modules/intelligence/types.agent.ts` already defines Phase 3N constants for follow-up mutations:

```typescript
PROPOSAL_FOLLOW_UP_CREATED:   'proposal_follow_up_created',
PROPOSAL_FOLLOW_UP_COMPLETED: 'proposal_follow_up_completed',
PROPOSAL_FOLLOW_UP_SKIPPED:   'proposal_follow_up_skipped',
```

**Important — provenance:** These constants are defined and ready to use, but **no proposal mutation service currently exists or emits them**. They were added to `ActivityEventType` in Phase 3N as planned infrastructure for a write layer that has not yet been built. No code in the current codebase calls `recordActivityEvent` with `PROPOSAL_FOLLOW_UP_COMPLETED` or `PROPOSAL_FOLLOW_UP_SKIPPED`. The first actual callers will be the Phase 3R Complete service (Slice 3R-5) and Skip service (Slice 3R-9) respectively. No new constants need to be added for Complete or Skip.

For Reschedule and Reopen, new constants must be added to `ActivityEventType` when those mutations are implemented:

```typescript
// To be added in Phase 3R Slice covering Reschedule
PROPOSAL_FOLLOW_UP_RESCHEDULED: 'proposal_follow_up_rescheduled',

// To be added in Phase 3R Slice covering Reopen (if approved)
PROPOSAL_FOLLOW_UP_REOPENED: 'proposal_follow_up_reopened',
```

Adding constants to `ActivityEventType` is an additive change to `types.agent.ts` — not a schema migration.

### Audit event shape for Phase 3R mutations

Each mutation records a `recordActivityEvent` call with:

| Field | Value |
|-------|-------|
| `tenantId` | From `ctx.tenantId` — never client input |
| `workspaceId` | From `ctx.workspaceId` — never client input |
| `eventType` | `ActivityEventType.PROPOSAL_FOLLOW_UP_COMPLETED` / `_SKIPPED` / `_RESCHEDULED` / `_REOPENED` |
| `eventSource` | `'operator_action'` |
| `entityType` | `'proposal_follow_up_commitment'` |
| `entityId` | commitment `id` |
| `leadId` | commitment `lead_id` (nullable) |
| `eventSummary` | Human-readable string, e.g. `'Follow-up commitment #2 marked complete'` |
| `properties` | `{ previous_status, next_status, actor_user_id, completion_notes?, previous_due_at?, new_due_at?, skipped_reason? }` |

The `actor_user_id` (the operator who performed the mutation) is stored in `properties` since `activity_events` does not have a dedicated actor column. It must come from `ctx.userId` (if `buildRequestContext` exposes it) or from the Supabase auth session — never from client input.

---

## 7. Permission Model

### Confirmed permission assignments

| Operation | Permission | Rationale |
|-----------|-----------|-----------|
| Read queue | `crm.leads.view` | Existing — no change |
| Complete commitment | `crm.leads.edit` | Commitment is a lead-related record; edit is the write tier |
| Skip commitment | `crm.leads.edit` | Same write tier as Complete |
| Reschedule commitment | `crm.leads.edit` | Date update is an edit operation |
| Reopen commitment | `crm.leads.edit` | Reversal is an edit; escalation to a management permission is deferred |
| Draft generation | `messaging.send_emails` or `crm.leads.edit` | TBD — deferred to Phase 3S |
| Approved send | `messaging.send_emails` + `workflow.approve_requests` | Future Phase 3T only |

**No new permission strings are introduced in Phase 3R.** `crm.leads.edit` is the existing write permission for lead-related mutations throughout the CRM module. It is semantically appropriate here.

---

## 8. Mutation-by-Mutation Implementation Plan

### 8.1 — Complete Follow-Up Commitment

**Status:** Ready to implement (no migration required)

**Repository function** (proposed — `modules/proposals/repositories/proposal-follow-up-mutations.repo.ts`):

```typescript
export async function completeFollowUpCommitment(
  supabase: SupabaseClient,
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  actorUserId: string,
  completionNotes?: string
): Promise<CommitmentRow>
```

- Fetch-before-write: load commitment by `id` + `tenant_id` + `workspace_id` — reject if not found
- Conflict check: if `commitment_status !== 'open'` → throw typed conflict error
- Write: `commitment_status = 'completed'`, `completed_at = now()`, `completed_by_user_id = actorUserId`, `completion_notes = completionNotes ?? null`, `updated_at = now()`
- Return: updated row

**Service function** (proposed — `modules/proposals/services/proposal-follow-up-mutations.service.ts`):

```typescript
export async function completeFollowUpCommitmentForWorkspace(
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  actorUserId: string,
  completionNotes?: string
): Promise<CompleteFollowUpResult>
```

- Calls repo write function
- On success: calls `recordActivityEvent` with `eventType: ActivityEventType.PROPOSAL_FOLLOW_UP_COMPLETED`
- Returns typed result: `{ ok: true; commitment: CommitmentRow } | { ok: false; error: 'not_found' | 'conflict' | 'write_failed' }`
- Audit event failure is non-fatal (log, do not rollback the mutation)

**Server action** (proposed — `modules/proposals/actions/proposal-follow-up-mutations.actions.ts`):

```typescript
export async function completeFollowUpCommitmentAction(
  input: CompleteFollowUpActionInput
): Promise<ActionResult<CompleteFollowUpActionData>>
```

- `'use server'` directive
- `buildRequestContext(supabase)` → `ctx.tenantId`, `ctx.workspaceId`, `ctx.userId`
- `requirePermission(ctx, 'crm.leads.edit')`
- Sanitize `commitmentId` (non-empty UUID string), `completionNotes` (optional trimmed string, max length TBD)
- Call service; map result to `ActionResult`

**Required input:**
```typescript
export interface CompleteFollowUpActionInput {
  commitmentId: string
  completionNotes?: string
}
```

**Fields written:** `commitment_status`, `completed_at`, `completed_by_user_id`, `completion_notes`, `updated_at`

**Audit event:** `ActivityEventType.PROPOSAL_FOLLOW_UP_COMPLETED` with `properties: { previous_status: 'open', next_status: 'completed', actor_user_id, completion_notes }`

**Failure modes:**
- Commitment not found → `{ success: false, error: 'Commitment not found' }`
- Already completed/skipped/proposal_closed → `{ success: false, error: 'Commitment is not open' }`
- Permission denied → thrown by `requirePermission`, caught, returns error result

**Tests:**
- Action file has `'use server'`
- Action uses `buildRequestContext` and `requirePermission`
- Repo function scopes by `(tenantId, workspaceId)` — not bare `commitmentId`
- Complete writes `commitment_status = 'completed'`, `completed_at`, `completed_by_user_id`
- Complete does not write `skipped_at`, `skipped_reason`, `skipped_by_user_id`
- Cannot complete a non-open commitment
- Cross-tenant completion rejected
- Completion does not send email, does not enqueue Inngest, does not reference LLM providers

**No send/automation impact.**

---

### 8.2 — Skip Follow-Up Commitment

**Status:** Blocked on migration 20240039 (adds `skipped_at`, `skipped_reason`, `skipped_by_user_id`)

**Repository function** (proposed):

```typescript
export async function skipFollowUpCommitment(
  supabase: SupabaseClient,
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  actorUserId: string,
  skippedReason?: string
): Promise<CommitmentRow>
```

Same fetch-before-write pattern as Complete. Conflict check: `commitment_status !== 'open'` → error.

**Fields written:** `commitment_status = 'skipped'`, `skipped_at = now()`, `skipped_reason`, `skipped_by_user_id = actorUserId`, `updated_at`

**Audit event:** `ActivityEventType.PROPOSAL_FOLLOW_UP_SKIPPED` with `properties: { previous_status: 'open', next_status: 'skipped', actor_user_id, skipped_reason }`

**Required input:**
```typescript
export interface SkipFollowUpActionInput {
  commitmentId: string
  skippedReason?: string  // required vs. optional: open question — see Section 14
}
```

**No send/automation impact.**

---

### 8.3 — Reschedule Follow-Up Commitment

**Status:** Unblocked by schema (Option A — update in place), but deferred until Complete and Skip are stable.

**Repository function** (proposed):

```typescript
export async function rescheduleFollowUpCommitment(
  supabase: SupabaseClient,
  tenantId: string,
  workspaceId: string,
  commitmentId: string,
  newDueAt: string,
  actorUserId: string
): Promise<CommitmentRow>
```

Precondition: `newDueAt` must be a valid ISO 8601 datetime string. Validation in the action layer before reaching the repo.

Conflict check: `commitment_status !== 'open'` → cannot reschedule a completed/skipped commitment.

**Fields written:** `follow_up_due_at = newDueAt`, `updated_at = now()`

**Audit event:** New constant `ActivityEventType.PROPOSAL_FOLLOW_UP_RESCHEDULED` (to be added to `types.agent.ts`). Properties: `{ previous_due_at, new_due_at, actor_user_id }`.

**No send/automation impact.**

---

### 8.4 — Reopen Follow-Up Commitment

**Status:** Deferred — implement only after Complete and Skip are stable and reopen is explicitly approved.

**Decision required before implementing:** Is reopen permitted? (See Section 14, open question 3.)

If approved:
- Allowed from `'completed'` or `'skipped'` only — not from `'proposal_closed'`
- Fields written: `commitment_status = 'open'`, clear `completed_at`, `completed_by_user_id`, clear `skipped_at`, `skipped_reason`, `skipped_by_user_id`, update `updated_at`
- Audit event: new constant `ActivityEventType.PROPOSAL_FOLLOW_UP_REOPENED`
- Permission: `crm.leads.edit`

**No send/automation impact.**

---

## 9. Proposed Future Files

The following files do not exist yet. They are proposed for future implementation slices only. Do not create them in Phase 3R Slice 2.

| File | Purpose | Earliest creating slice |
|------|---------|------------------------|
| `modules/proposals/repositories/proposal-follow-up-mutations.repo.ts` | Write functions: complete, skip, reschedule, reopen | Phase 3R Slice 4 |
| `modules/proposals/services/proposal-follow-up-mutations.service.ts` | Service layer with audit event writes | Phase 3R Slice 5 |
| `modules/proposals/actions/proposal-follow-up-mutations.actions.ts` | Server actions with permission checks | Phase 3R Slice 6 |
| `tests/phase3r-proposal-follow-up-mutations.test.ts` | Source-reading + runtime test suite | Phase 3R Slice 4+ |
| `supabase/migrations/20240039_phase3r_follow_up_skip_fields.sql` | Add `skipped_at`, `skipped_reason`, `skipped_by_user_id` | Phase 3R Slice 8 |

---

## 10. Proposed Migration 20240039

**Scope:** Fields required for the Skip mutation only. Complete and Reschedule do not require a migration.

**Proposed migration number:** `20240039`
**Proposed filename:** `supabase/migrations/20240039_phase3r_follow_up_skip_fields.sql`

**Do not create this migration until Phase 3R Slice 8.** Complete (Slices 4–7) requires no migration and must proceed first. The skip migration is created only when Skip is the immediate next implementation target.

### Proposed DDL

```sql
-- =============================================================================
-- Phase 3R — Proposal Follow-Up Skip Fields
-- Migration: 20240039
-- Purely additive — no existing tables modified except ALTER TABLE ADD COLUMN.
-- Adds skip mutation columns to proposal_follow_up_commitments.
-- =============================================================================

ALTER TABLE proposal_follow_up_commitments
  ADD COLUMN skipped_at         timestamptz NULL,
  ADD COLUMN skipped_reason     text        NULL,
  ADD COLUMN skipped_by_user_id uuid        NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for querying skip audit without a full table scan per workspace
CREATE INDEX idx_proposal_commitments_skipped
  ON proposal_follow_up_commitments (tenant_id, workspace_id, skipped_at)
  WHERE commitment_status = 'skipped';
```

### RLS

The existing `proposal_follow_up_commitments` RLS policies from migration 20240038 apply to all columns, including new ones added via `ALTER TABLE`. No new RLS policies are required:

- `proposal_follow_up_commitments_select` — `FOR SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id')` — already covers new columns
- `proposal_follow_up_commitments_service_role` — `FOR ALL USING (auth.role() = 'service_role')` — already covers new columns

### Grants

The existing `GRANT ALL ON proposal_follow_up_commitments TO service_role` from migration 20240038 covers new columns. No new grants required.

---

## 11. Test Strategy

### Source-reading guardrails (`tests/phase3r-proposal-follow-up-mutations.test.ts`)

- Repo mutations file exists and is readable
- Each mutation function is exported from the repo file
- Each function scopes by `(tenantId, workspaceId)` — `eq('tenant_id', tenantId)` appears in each function body
- No mutation function references `sendEmail`, `Resend`, `Inngest`, `OpenAI`, `Anthropic`
- No mutation function references `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- Service file uses `recordActivityEvent` for audit
- Action file has `'use server'` directive
- Action file uses `buildRequestContext` — not client-supplied tenant/workspace
- Action file uses `requirePermission` before any mutation
- Action file does not import Resend, Inngest, LLM providers
- Action file does not export `sendFollowUpAction` or `approvedSendAction`
- Action inputs do not include `tenantId`, `workspaceId`, or `userId` fields (they must come from context only)

### Scoping and permission assertions

- Cross-tenant Complete: commitment from different tenant returns not-found (not unauthorized) — avoids existence leakage
- Cross-workspace Complete: same pattern
- User without `crm.leads.edit` permission: `requirePermission` throws, action returns `{ success: false }`
- `completeFollowUpCommitmentAction` with a completed commitment: returns conflict error, does not re-write

### Mutation field assertions

| Mutation | Asserted fields written | Asserted fields NOT written |
|----------|------------------------|----------------------------|
| Complete | `commitment_status = 'completed'`, `completed_at`, `completed_by_user_id` | `skipped_at`, `skipped_reason`, `follow_up_due_at` unchanged |
| Skip | `commitment_status = 'skipped'`, `skipped_at`, `skipped_by_user_id` | `completed_at`, `completed_by_user_id`, `follow_up_due_at` unchanged |
| Reschedule | `follow_up_due_at` updated, `updated_at` updated | `commitment_status` unchanged (stays `'open'`) |
| Reopen | `commitment_status = 'open'`, `completed_at = null` if was completed | Cannot reopen `'proposal_closed'` commitment |

### Audit trail assertions

- `recordActivityEvent` is called with `eventType = ActivityEventType.PROPOSAL_FOLLOW_UP_COMPLETED` after Complete
- `recordActivityEvent` is called with `eventType = ActivityEventType.PROPOSAL_FOLLOW_UP_SKIPPED` after Skip
- Audit event `tenantId` and `workspaceId` match the mutation's scoping values — never client input
- Audit event `properties` contains `previous_status` and `next_status`

### No-send / no-automation assertions

- Complete does not send email
- Skip does not send email
- Reschedule does not send email
- No Inngest event is enqueued by any mutation
- `email_drafts` table is not written by Complete, Skip, or Reschedule
- No LLM/AI provider is called by any mutation

### Future UI slice assertions (when UI is added)

- Mutation action buttons are not rendered for users without `crm.leads.edit` permission
- No send button appears on the queue page in Phase 3R
- Confirmation dialog text does not contain "Send" language

---

## 12. Recommended Implementation Slice Sequence

| Slice | Deliverable | Migration? | Notes |
|-------|-------------|-----------|-------|
| **3R-1** | Design document | No | Done — `286a633` |
| **3R-2** | Implementation plan | No | Done — `979a37b` |
| **3R-3** | Implementation plan QA / doc polish | No | Current slice — activity event wording + slice reorder |
| **3R-4** | Repository write model — Complete only | No | `completeFollowUpCommitment` in new mutations repo file; tests TC-3R-001+ |
| **3R-5** | Service layer — Complete with audit event | No | `completeFollowUpCommitmentForWorkspace`; uses `recordActivityEvent`; first caller of `PROPOSAL_FOLLOW_UP_COMPLETED` |
| **3R-6** | Server action — Complete with permission checks | No | `completeFollowUpCommitmentAction`; `crm.leads.edit`; tests |
| **3R-7** | UI confirmation control for Complete only | No | Confirmation dialog; no send button; gated by `crm.leads.edit` |
| **3R-8** | Migration 20240039 — Skip fields only | Yes | `skipped_at`, `skipped_reason`, `skipped_by_user_id`; reviewed before apply |
| **3R-9** | Skip repository + service + action | Requires 3R-8 | Mirrors Complete structure; first caller of `PROPOSAL_FOLLOW_UP_SKIPPED` |
| **3R-10** | Skip UI confirmation | No | Wires skip action; reason input; permission-gated |
| **3R-11** | Reschedule repository + service + action | No | Option A (update in place); add `PROPOSAL_FOLLOW_UP_RESCHEDULED` to `ActivityEventType` |
| **3R-12** | Reschedule UI control on queue page | No | Date picker; wires reschedule action |
| **3R-13** | Reopen (if approved) | Requires decision | Only after Complete + Skip stable; decision from open question 2 |
| **Phase 3S** | Draft generation design and implementation | TBD | Separate phase; LLM; `pending_approval` lifecycle |
| **Phase 3T** | Approved send path | TBD | Separate phase; `EMAIL_SENDING_ENABLED` decision required |

**Guiding principle:** smallest safe write surface first. Complete is first because it requires no migration and has the clearest semantics. The skip migration (20240039) is deferred to Slice 3R-8 — it is not needed until Skip is the immediate next implementation target, avoiding unnecessary schema churn. Reschedule and Reopen are lower urgency.

Each slice must:
1. Commit independently
2. Pass the focused test suite
3. Receive Codex review before the next slice begins

---

## 13. Open Questions to Resolve Before First Code Slice (3R-5)

| # | Question | Status | Decision needed by |
|---|----------|--------|--------------------|
| 1 | Is `skipped_reason` required or optional? | Open | Before Slice 3R-9 (Skip implementation) |
| 2 | Is Complete reversible (Reopen)? | Open | Before Slice 3R-13 |
| 3 | Does completing all commitments for a proposal change proposal status? | Open | Before Slice 3R-5 (Complete service) |
| 4 | Can `buildRequestContext` expose `ctx.userId`? | **Resolved — yes** | Confirmed by Codex Slice 2 review |
| 5 | Is Reopen included in Phase 3R or deferred to Phase 3U? | Open | Before Slice 3R-13 planning |
| 6 | Is there a `completionNotes` character limit? | Open | Before Slice 3R-6 (action input validation) |
| 7 | Should reschedule be permitted on past-due dates (catch-up rescheduling)? | Open | Before Slice 3R-11 (Reschedule implementation) |
| 8 | Should the queue page reload automatically after a mutation, or require manual refresh? | Open | Before Slice 3R-7 (UI) |

Open question 3 (proposal status side effects from Complete) remains the highest-priority unresolved item. It must be answered before the Complete service (Slice 3R-5) is implemented, as the service must either trigger or explicitly not trigger a status-update side effect.

---

## 14. Final Recommendation

**Do not implement any mutation code until:**

1. This polished implementation plan is reviewed (internal team review).
2. Codex reviews this plan — not just the eventual code.
3. Open question 3 (proposal-status side effects from Complete) is answered before the Complete service (Slice 3R-5).
4. All Phase 3Q guardrails remain unchanged: `EMAIL_SENDING_ENABLED` and `CAMPAIGN_SENDING_ENABLED` disabled, no Inngest, no LLM in mutation files.

**The safe first implementation path (updated slice numbers):**

```
Slice 3R-4 → completeFollowUpCommitment (repo)     ← no migration, no UI, smallest surface
Slice 3R-5 → service layer + audit event             ← first caller of PROPOSAL_FOLLOW_UP_COMPLETED
Slice 3R-6 → server action + permission check
Slice 3R-7 → UI confirmation for Complete
Slice 3R-8 → migration 20240039 (skip fields only)   ← deferred to here, not needed until Skip
Slice 3R-9 → Skip (repo + service + action)
Slice 3R-10→ Skip UI confirmation
```

Draft generation and sending remain firmly out of scope for Phase 3R. Phase 3S and Phase 3T must each have their own design documents, Codex reviews, and `EMAIL_SENDING_ENABLED` decision records before any implementation begins.
