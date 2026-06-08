# Goal 5 Slice 11 — Policy-Check Service Design and Test Cases

**Status:** Design only. No implementation in this document.  
**Risk:** MEDIUM/HIGH — backend service touching state machine, authorization model, audit ledger.  
**Dependencies:** Goal 5 Slice 10 (bridge review queue + audit ledger services, committed `73f7c7b`).  
**Migration prerequisite:** Migration 20240044 must be applied before implementation (see §4).  
**Locked predecessor:** Slice 10 is committed and locked at `73f7c7b`. Slice 10 must not be reopened. Slice 11 builds on Slice 10's interfaces as-is. Any modifications to shared Slice 10 files during Slice 11 implementation (e.g. adding state-machine entries to `reviewer-authorization.ts`) are normal Slice 11 implementation changes — they are not a reopening of Slice 10.  
**Implementation blocked:** Slice 11 implementation is BLOCKED until migration 20240044 is separately designed, reviewed, approved, locally applied, and verified under its own controlled workflow. This design document does not authorize migration creation, migration application, or any implementation code.

---

## 1. Purpose and Scope

This slice designs a dry-run-only **outcome-recording** policy-check service. It records policy-review outcomes that are supplied to it by an approved caller. It does not implement a policy evaluation engine.

**What this slice IS:**
- A service that records policy outcomes (pass, warning, blocked, requires-codex, requires-human)
- A state machine extension that adds policy-check transitions to the shared guard
- A repository extension that adds `current_policy_check_status` writes to the queue repo
- An audit ledger integration that appends a policy audit event on every transition

**What this slice is NOT:**
- A policy evaluator — no `runPolicyCheck()` function
- A model caller — no OpenAI/Claude/Qwen/Codex API calls
- An external policy engine integration
- A background job, cron, webhook, or Inngest handler
- A bridge execution service
- An executable model routing service

---

## 2. Service Location

This design document creates no implementation files. The following files will be created or created-and-moved during Slice 11 implementation:

| File | Action |
|------|--------|
| `modules/verian-agent-bridge/policy-check/policy-check.service.ts` | New — the policy-check service |
| `modules/verian-agent-bridge/review-queue/review-queue.mapper.ts` | New — shared mapper module extracted from `review-queue.service.ts` |
| `tests/goal5-slice-11-policy-check-service.test.ts` | New — source-reading tests for Slice 11 |

The following existing files will be extended (not replaced) during Slice 11 implementation:

| File | Change |
|------|--------|
| `modules/verian-agent-bridge/review-queue/reviewer-authorization.ts` | Add policy-check actions to state machine and actor authorization |
| `modules/verian-agent-bridge/review-queue/review-queue.repo.ts` | Add `policyCheckStatus` field to `ReviewQueueStatusUpdate` |
| `modules/verian-agent-bridge/review-queue/types.ts` | Add 6 new action values to `VerianBridgeReviewQueueAction` |
| `modules/verian-agent-bridge/audit-ledger/types.ts` | Add `policy_review_submitted` to `VerianBridgeAuditEventType` |

All state machine and actor authorization logic lives in the existing shared module:
```
modules/verian-agent-bridge/review-queue/reviewer-authorization.ts
```

No parallel state machine is defined inside `policy-check.service.ts`. All transition validation and actor authorization use the extended shared functions from `reviewer-authorization.ts`.

---

## 3. Stop Conditions

The design was checked against all listed stop conditions before proceeding.

| Condition | Status |
|-----------|--------|
| Required schema change | **YES — migration 20240044 required (see §4). Scope is minimal: one new audit event type value.** |
| Need for migration 20240044 | Yes — but scoped. See §4. This is a documented prerequisite, not a silent workaround. |
| DB commands or remote DB access | No — design uses existing service_role repo path only |
| Staging or production access | No |
| Execution authorization | No — `executionAuthorized: false` is preserved throughout |
| Sending or campaign sending | No |
| Model calls | No |
| Background jobs / automation | No |
| Second/parallel state machine | No — shared `reviewer-authorization.ts` extended |
| Policy status write path gap | Documented and resolved in §9 (code-only extension to `ReviewQueueStatusUpdate`) |
| Task packet unavailable for `policy_id` | No — packet is fetched via existing `getTaskPacketById` before any audit write |

The schema change (migration 20240044) is required and explicitly called out. This design document is complete despite that prerequisite being unresolved — the design itself has no other blockers. **Slice 11 implementation remains BLOCKED until the migration gate is cleared.** See §4 for the required process.

---

## 4. Migration 20240044 Prerequisite

> **BLOCKED: Slice 11 implementation is BLOCKED until a separate reviewed migration design for 20240044 adds `policy_review_submitted` to the `bridge_audit_events.event_type` CHECK constraint and that migration is locally applied and verified. This design document does not authorize migration creation or apply.**

**Required before implementation begins.**

The `bridge_audit_events.event_type` column has a CHECK constraint with exactly 12 values (from migration 20240041). The Slice 11 `submitForPolicyReview` function must write the audit event type `policy_review_submitted`, which is not in the current CHECK constraint.

**Schema change required in migration 20240044:**

Add `policy_review_submitted` to the `bridge_audit_events.event_type` CHECK constraint.

Current CHECK (12 values):
```sql
CHECK (event_type IN (
  'packet_created', 'policy_check_passed', 'policy_check_warning',
  'policy_check_blocked', 'human_approval_requested', 'human_approved',
  'human_denied', 'revision_requested', 'codex_review_required',
  'codex_review_received', 'manual_handoff_prepared', 'packet_archived'
))
```

Required change (13 values, adding `policy_review_submitted`):
```sql
CHECK (event_type IN (
  'packet_created', 'policy_check_passed', 'policy_check_warning',
  'policy_check_blocked', 'human_approval_requested', 'human_approved',
  'human_denied', 'revision_requested', 'codex_review_required',
  'codex_review_received', 'manual_handoff_prepared', 'packet_archived',
  'policy_review_submitted'
))
```

**Required process for migration 20240044 (must happen in this order):**

1. Separate migration design + authorization prompt — migration 20240044 scope only
2. Codex review of migration design before the migration file is created
3. Local-first application and verification
4. Staging apply only after local evidence review
5. Production remains a hard stop

**Event-type strategy — what is new vs. what is reused:**

Only one new DB audit event value is required for Slice 11:

| Value | Status | Notes |
|-------|--------|-------|
| `policy_review_submitted` | **NEW — requires migration 20240044** | Used by `submitForPolicyReview` |
| `policy_check_passed` | Already in DB CHECK constraint | Reused by `markPolicyCheckPassed` |
| `policy_check_warning` | Already in DB CHECK constraint | Reused by `markPolicyCheckWarning` |
| `policy_check_blocked` | Already in DB CHECK constraint | Reused by `markPolicyCheckBlocked` |
| `codex_review_required` | Already in DB CHECK constraint | Reused by `markPolicyCheckRequiresCodex` — the queue *action* is `policy_check_requires_codex` but the *audit event type* maps to this existing value |
| `human_approval_requested` | Already in DB CHECK constraint | Reused by `markPolicyCheckRequiresHuman` — the queue *action* is `policy_check_requires_human` but the *audit event type* maps to this existing value |

`policy_check_requires_codex` and `policy_check_requires_human` are **queue action names**, not DB audit event type values. They do not require adding new values to the `bridge_audit_events.event_type` CHECK constraint unless a later reviewed design explicitly changes that decision.

**Migration 20240044 scope:** Alter the CHECK constraint on `bridge_audit_events.event_type` to add `policy_review_submitted`. No new tables, no new columns, no other changes. This migration requires a separate design + authorization prompt before it is created.

---

## 5. Type Union Additions

These additions are **not implemented in this slice** — they are enumerated here so the implementation slice has a precise list with no ambiguity.

### 5a. `modules/verian-agent-bridge/review-queue/types.ts`

Add to `VerianBridgeReviewQueueAction` (currently 6 values):

```typescript
export type VerianBridgeReviewQueueAction =
  | 'approve_for_manual_handoff'
  | 'deny'
  | 'request_revision'
  | 'mark_codex_review_received'
  | 'archive'
  | 'reopen_for_review'
  // Slice 11 additions:
  | 'submit_for_policy_review'
  | 'policy_check_passed'
  | 'policy_check_warning'
  | 'policy_check_blocked'
  | 'policy_check_requires_codex'
  | 'policy_check_requires_human'
```

Total after addition: 12 action values.

### 5b. `modules/verian-agent-bridge/audit-ledger/types.ts`

Add to `VerianBridgeAuditEventType` **exactly one new value**:

```typescript
export type VerianBridgeAuditEventType =
  // existing 12...
  // Slice 11 addition — requires migration 20240044 before DB writes can use this value:
  | 'policy_review_submitted'
```

The following values are **already present** in both the TypeScript union and the DB CHECK constraint — no type additions needed for these:

| Value | Already in TypeScript type | Already in DB CHECK |
|-------|---------------------------|---------------------|
| `policy_check_passed` | ✓ | ✓ |
| `policy_check_warning` | ✓ | ✓ |
| `policy_check_blocked` | ✓ | ✓ |
| `codex_review_required` | ✓ | ✓ |
| `human_approval_requested` | ✓ | ✓ |

`codex_review_required` and `human_approval_requested` are the audit event types written when the queue actions `policy_check_requires_codex` and `policy_check_requires_human` execute respectively. No new audit event type values are required for those two actions.

---

## 6. State Machine Extensions

### 6a. File to extend

```
modules/verian-agent-bridge/review-queue/reviewer-authorization.ts
```

The `assertValidStateTransition` function currently only implements core human-approval transitions. Slice 10's comment explicitly reserved policy-check transitions for this slice:
> *"Policy-check-driven transitions (submit_for_policy_review, policy_check_*) are reserved for a future slice when the policy check service is implemented."*

### 6b. Required additions to the `permitted` map

```typescript
draft_packet: ['submit_for_policy_review', 'archive'],   // was: ['archive']

pending_policy_review: [                                  // was: ['archive']
  'policy_check_passed',
  'policy_check_warning',
  'policy_check_blocked',
  'policy_check_requires_codex',
  'policy_check_requires_human',
  'archive',
],
```

No other state entries change.

### 6c. Transition result mapping

| Action | From state | To state |
|--------|-----------|---------|
| `submit_for_policy_review` | `draft_packet` | `pending_policy_review` |
| `policy_check_passed` | `pending_policy_review` | `waiting_human_approval` |
| `policy_check_warning` | `pending_policy_review` | `waiting_human_approval` |
| `policy_check_blocked` | `pending_policy_review` | `blocked_by_policy` |
| `policy_check_requires_codex` | `pending_policy_review` | `waiting_codex_review` |
| `policy_check_requires_human` | `pending_policy_review` | `waiting_human_approval` |

### 6d. Terminal and restricted states

- `blocked_by_policy` can only `archive`. No transitions to `approved_for_manual_handoff`, execution, send, scheduled, or completed.
- `archived` remains terminal (empty permitted list).
- No policy-check action transitions to `approved_for_manual_handoff` directly.
- No policy-check action triggers execution, sending, routing, or bridge execution.

---

## 7. Actor/Action Authorization Extensions

### 7a. File to extend

```
modules/verian-agent-bridge/review-queue/reviewer-authorization.ts
```

The `assertActorCanTransitionState` function must add a `policyActions` group. No parallel permission map is created in `policy-check.service.ts`.

### 7b. Policy action group definition

```typescript
const policyActions: VerianBridgeReviewQueueAction[] = [
  'submit_for_policy_review',
  'policy_check_passed',
  'policy_check_warning',
  'policy_check_blocked',
  'policy_check_requires_codex',
  'policy_check_requires_human',
]

if (policyActions.includes(action) && actorType !== 'system' && actorType !== 'michael') {
  throw new ReviewerAuthorizationError(
    `assertActorCanTransitionState: only 'system' or 'michael' may perform policy-check action '${action}'; got '${actorType}'`
  )
}
```

### 7c. Actor rules summary

| Actor | Policy actions | actorUserId required | Membership check |
|-------|----------------|---------------------|-----------------|
| `michael` | ✓ allowed | **Required** — throws if absent | `assertReviewerIsWorkspaceMember` before any write |
| `system` | ✓ allowed | Optional | Not required |
| `agent` | ✗ blocked | — | — |
| `codex` | ✗ blocked | — | — |

`agent` and `codex` may not submit, pass, warn, block, or route policy outcomes in Slice 11.

No actor may use policy-check functions to bypass human approval. `policy_check_passed` and `policy_check_warning` route to `waiting_human_approval`, preserving the human gate.

---

## 8. Repository Extension

### 8a. File to extend

```
modules/verian-agent-bridge/review-queue/review-queue.repo.ts
```

Current `ReviewQueueStatusUpdate` does not support writing `current_policy_check_status`. The column exists in the schema with a `CHECK (current_policy_check_status IN ('pass', 'warning', 'blocked'))` constraint.

This is a **code-only gap** (no migration required). The column exists; the repository type simply doesn't expose it.

### 8b. Required change to `ReviewQueueStatusUpdate`

```typescript
export type ReviewQueueStatusUpdate = {
  status: string
  assignedReviewerId?: string | null
  lastDecisionSummary?: string | null
  policyCheckStatus?: string | null   // Add this field
}
```

### 8c. Required change to `updateReviewQueueItemStatus`

In the update payload construction block, add:

```typescript
if (update.policyCheckStatus !== undefined) {
  updatePayload.current_policy_check_status = update.policyCheckStatus
}
```

The `expectedCurrentStatus` conflict guard and `.eq('status', expectedCurrentStatus)` remain unchanged.

---

## 9. Policy Status Mapping

Every policy-check outcome function writes both `status` (the queue lifecycle state) and `current_policy_check_status` (the policy result column).

| Action | `status` written | `current_policy_check_status` written | Justification |
|--------|-----------------|--------------------------------------|--------------|
| `submit_for_policy_review` | `pending_policy_review` | *(unchanged)* | Review not started; preserve the value set at packet creation |
| `policy_check_passed` | `waiting_human_approval` | `'pass'` | Clean pass result |
| `policy_check_warning` | `waiting_human_approval` | `'warning'` | Warning-level concern; human approval still required |
| `policy_check_blocked` | `blocked_by_policy` | `'blocked'` | Policy hard block |
| `policy_check_requires_codex` | `waiting_codex_review` | `'warning'` | Codex review is required for a warning-level concern; the packet is not fully blocked. Choosing `warning` over `blocked` because the item can still progress after Codex review. |
| `policy_check_requires_human` | `waiting_human_approval` | `'warning'` | The policy check surfaced a concern but deferred resolution to a human reviewer |

`current_policy_check_status` in `submitForPolicyReview` is left unchanged because the policy review has not yet completed — preserving whatever value was written when the packet was created.

---

## 10. Service Functions Design

All functions: dry-run only, no model calls, no sending, no execution, no DB writes except through the service_role repo path, no background jobs.

```typescript
// modules/verian-agent-bridge/policy-check/policy-check.service.ts

export type PolicyCheckContext = BridgeRequestContext  // from audit-ledger.service.ts

// Transitions draft_packet → pending_policy_review.
// actorType system or michael only.
// Does NOT change current_policy_check_status — policy review has not yet completed.
// Appends policy_review_submitted audit event.
export async function submitForPolicyReview(
  queueItemId: string,
  ctx: PolicyCheckContext,
  summary?: string
): Promise<VerianBridgeReviewQueueItem>

// Records a clean policy pass. Transitions pending_policy_review → waiting_human_approval.
// Sets current_policy_check_status = 'pass'.
// Appends policy_check_passed audit event.
export async function markPolicyCheckPassed(
  queueItemId: string,
  ctx: PolicyCheckContext,
  summary: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem>

// Records a policy warning. Transitions pending_policy_review → waiting_human_approval.
// Sets current_policy_check_status = 'warning'.
// Appends policy_check_warning audit event.
export async function markPolicyCheckWarning(
  queueItemId: string,
  ctx: PolicyCheckContext,
  summary: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem>

// Records a policy hard block. Transitions pending_policy_review → blocked_by_policy.
// Sets current_policy_check_status = 'blocked'.
// Appends policy_check_blocked audit event.
export async function markPolicyCheckBlocked(
  queueItemId: string,
  ctx: PolicyCheckContext,
  reason: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem>

// Records that the policy check requires Codex review.
// Transitions pending_policy_review → waiting_codex_review.
// Sets current_policy_check_status = 'warning'.
// Appends codex_review_required audit event (existing event type, no new migration value needed).
export async function markPolicyCheckRequiresCodex(
  queueItemId: string,
  ctx: PolicyCheckContext,
  reason: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem>

// Records that the policy check requires human review.
// Transitions pending_policy_review → waiting_human_approval.
// Sets current_policy_check_status = 'warning'.
// Appends human_approval_requested audit event (existing event type, no new migration value needed).
export async function markPolicyCheckRequiresHuman(
  queueItemId: string,
  ctx: PolicyCheckContext,
  reason: string,
  evidence?: string[]
): Promise<VerianBridgeReviewQueueItem>
```

### 10a. Standard transition body pattern

Every function follows this pattern (same as Slice 10 human-approval transitions):

1. If `actorType === 'michael'`: call `requireActorUserId(ctx)` then `assertReviewerIsWorkspaceMember(actorUserId, workspaceId, tenantId)` — throws `ReviewerAuthorizationError` if missing or inactive
2. Call `assertActorCanTransitionState(ctx.actorType, <fromState>, <action>)` — throws for blocked actors
3. Fetch current queue item via `queueRepo.getReviewQueueItemById` — throws `QueueItemNotFoundError` if missing
4. Call `assertValidStateTransition(current.status, <action>)` — throws on invalid transition
5. Fetch associated task packet via `packetRepo.getTaskPacketById` — throws if not found (needed for audit `policy_id`)
6. Call `queueRepo.updateReviewQueueItemStatus(id, tenantId, workspaceId, current.status, { status: <nextState>, policyCheckStatus: <value> })` — throws `StaleStateError` on race
7. Call `auditService.appendAuditEvent(...)` using `packet.policy_id` (never `current.current_policy_check_status`) — throws if `dryRunOnly !== true`
8. Return `mapRowAndPacketToQueueItem(updated, packet)` (imported from `review-queue.mapper.ts` — see §10c)

`submitForPolicyReview` does not update `current_policy_check_status` (step 6 omits `policyCheckStatus` from the update).

### 10b. Imports

`policy-check.service.ts` must import from:
- `@/modules/verian-agent-bridge/review-queue/review-queue.repo` (queue read/update)
- `@/modules/verian-agent-bridge/task-packets/task-packet.repo` (packet read)
- `@/modules/verian-agent-bridge/audit-ledger/audit-ledger.service` (audit append)
- `@/modules/verian-agent-bridge/review-queue/reviewer-authorization` (all four functions + `ReviewerAuthorizationError`)
- `@/modules/verian-agent-bridge/review-queue/review-queue.mapper` — `QueueItemNotFoundError` and `mapRowAndPacketToQueueItem` (see §10c)
- Type imports from `@/modules/verian-agent-bridge/review-queue/types` and `@/types/database`

### 10c. `mapRowAndPacketToQueueItem` re-use

The `mapRowAndPacketToQueueItem` helper is currently unexported (module-private) in `review-queue.service.ts`. Slice 11 implementation must extract it to a new shared mapper module:

```
modules/verian-agent-bridge/review-queue/review-queue.mapper.ts
```

This module exports `mapRowAndPacketToQueueItem` and `QueueItemNotFoundError` so both `review-queue.service.ts` and `policy-check.service.ts` import from a single canonical location. `review-queue.service.ts` is updated to import from the new mapper rather than define the function locally.

This is a code-only refactor — no migration, no schema change. The existing Slice 10 source-reading tests continue to pass because the mapper's behaviour is unchanged.

### 10d. Prohibited contents

`policy-check.service.ts` must NOT contain:
- `executionAuthorized: true` or `execution_authorized` field
- `fetch(`, `axios`, `http`, webhook, Inngest, cron, job
- Any model provider import (openai, anthropic, qwen, langchain)
- `EMAIL_SENDING_ENABLED`, `CAMPAIGN_SENDING_ENABLED`, `sendEmail`, `sendCampaign`
- `supabase db push`, `db:migrate`, `applyMigration`
- A local `permitted` state transition map (must use `assertValidStateTransition` from reviewer-authorization)
- A local actor permission map (must use `assertActorCanTransitionState` from reviewer-authorization)

---

## 11. Entry-Point Reconciliation

### 11a. Current state

`submitPacketToQueue` (Slice 10) accepts `initialState: VerianBridgeReviewQueueInitialState`, which is `'draft_packet' | 'pending_policy_review'`. This means queue items can currently be created directly in `pending_policy_review`.

### 11b. Preferred path

The preferred path for Slice 11:

```
submitPacketToQueue(initialState: 'draft_packet')
  ↓
submitForPolicyReview(queueItemId)   [Slice 11]
  ↓
pending_policy_review
  ↓
markPolicyCheckPassed | markPolicyCheckWarning | etc.
```

### 11c. Legacy/direct path

Direct creation in `pending_policy_review` via `submitPacketToQueue(initialState: 'pending_policy_review')` remains allowed for backward compatibility. It is NOT deprecated in this slice but is classified as the internal/legacy path.

**Why it remains safe:** The queue item is still dry-run only, still tenant/workspace scoped, still guarded by the review queue state machine. Entering `pending_policy_review` directly means `submitForPolicyReview`'s audit event is skipped — a policy-review-submitted event is not emitted. This is acceptable for the internal path (e.g., direct policy-check-outcome recording without a prior draft state).

**To avoid two ambiguous first-class paths:** The implementation must NOT document `initialState: 'pending_policy_review'` as a recommended caller pattern. It exists only as a type fallback. Future slices may narrow `VerianBridgeReviewQueueInitialState` to `'draft_packet'` only.

---

## 12. Authorization Model Summary

| Property | Requirement |
|----------|-------------|
| Write path | `createSupabaseServiceClient()` (service_role) only — no `createSupabaseServerClient` |
| Tenant/workspace scoping | Every read and update includes `.eq('tenant_id', tenantId)` and `.eq('workspace_id', workspaceId)` |
| `michael` actor | Requires `actorUserId` — throws `ReviewerAuthorizationError` if absent |
| `michael` membership | `assertReviewerIsWorkspaceMember` called before any write |
| `system` actor | `actorUserId` optional; still tenant/workspace scoped |
| `agent` actor | Blocked from all policy-check actions |
| `codex` actor | Blocked from all policy-check actions |
| Anon access | No — no anon INSERT or UPDATE path |
| Authenticated write path | No — read-only per migration 20240041/20240042 authenticated role grants |
| RLS bypass for reads | Not permitted — user-facing reads go through authenticated path |

---

## 13. Audit Model Summary

| Property | Requirement |
|----------|-------------|
| Every transition | Must produce exactly one audit event (except `submitForPolicyReview` which produces `policy_review_submitted`) |
| `policyId` field | Always from `packet.policy_id` (fetched via `getTaskPacketById`) — never from `current.current_policy_check_status` |
| `dryRunOnly` | `true` on every audit append request |
| Audit event types used | `policy_review_submitted` (new — requires migration 20240044), `policy_check_passed`, `policy_check_warning`, `policy_check_blocked`, `codex_review_required`, `human_approval_requested` |
| Append-only | `audit-ledger.repo.ts` has no `.update(` or `.delete(` — this invariant is not changed in Slice 11 |
| Tenant/workspace | Propagated from `ctx` to every audit append |

---

## 14. Concurrency Model

Same pattern as Slice 10:
- Fetch current queue item
- Validate state (shared `assertValidStateTransition`)
- Validate actor (shared `assertActorCanTransitionState`)
- If `michael`, require `actorUserId` and check membership
- Load task packet for real `policy_id`
- Call `updateReviewQueueItemStatus(id, tenantId, workspaceId, current.status, update)` — `current.status` is the expected current status
- `StaleStateError` thrown if status changed between fetch and write — callers must handle this

---

## 15. Test Case Plan

**Proposed test file:** `tests/goal5-slice-11-policy-check-service.test.ts`

All tests are source-reading only (no DB connection, no model calls, no Supabase connection).

### Section A — Type/Action Coverage (TC-G5-S11-001–012)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-S11-001 | `review-queue/types.ts` | `VerianBridgeReviewQueueAction` contains `submit_for_policy_review` |
| TC-G5-S11-002 | `review-queue/types.ts` | `VerianBridgeReviewQueueAction` contains `policy_check_passed` |
| TC-G5-S11-003 | `review-queue/types.ts` | `VerianBridgeReviewQueueAction` contains `policy_check_warning` |
| TC-G5-S11-004 | `review-queue/types.ts` | `VerianBridgeReviewQueueAction` contains `policy_check_blocked` |
| TC-G5-S11-005 | `review-queue/types.ts` | `VerianBridgeReviewQueueAction` contains `policy_check_requires_codex` |
| TC-G5-S11-006 | `review-queue/types.ts` | `VerianBridgeReviewQueueAction` contains `policy_check_requires_human` |
| TC-G5-S11-007 | `audit-ledger/types.ts` | `VerianBridgeAuditEventType` contains `policy_review_submitted` |
| TC-G5-S11-008 | `audit-ledger/types.ts` | `VerianBridgeAuditEventType` still contains `policy_check_passed` |
| TC-G5-S11-009 | `audit-ledger/types.ts` | `VerianBridgeAuditEventType` still contains `policy_check_warning` |
| TC-G5-S11-010 | `audit-ledger/types.ts` | `VerianBridgeAuditEventType` still contains `policy_check_blocked` |
| TC-G5-S11-011 | `audit-ledger/types.ts` | `VerianBridgeAuditEventType` still contains `codex_review_required` |
| TC-G5-S11-012 | `audit-ledger/types.ts` | `VerianBridgeAuditEventType` still contains `human_approval_requested` |

### Section B — Shared State Machine (TC-G5-S11-013–020)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-S11-013 | `reviewer-authorization.ts` | `submit_for_policy_review` is in the permitted map for `draft_packet` |
| TC-G5-S11-014 | `reviewer-authorization.ts` | `policy_check_passed` is in the permitted map for `pending_policy_review` |
| TC-G5-S11-015 | `reviewer-authorization.ts` | `policy_check_blocked` is in the permitted map for `pending_policy_review` |
| TC-G5-S11-016 | `reviewer-authorization.ts` | `policy_check_requires_codex` is in the permitted map for `pending_policy_review` |
| TC-G5-S11-017 | `policy-check.service.ts` | Does NOT define a local `permitted` state-transition map |
| TC-G5-S11-018 | `policy-check.service.ts` | Does NOT transition to `approved_for_manual_handoff` |
| TC-G5-S11-019 | `reviewer-authorization.ts` | `blocked_by_policy` only permits `archive` |
| TC-G5-S11-020 | `reviewer-authorization.ts` | `archived` permits no actions (empty or absent from map) |

### Section C — Shared Actor Authorization (TC-G5-S11-021–026)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-S11-021 | `reviewer-authorization.ts` | Policy action group includes `submit_for_policy_review` and all five `policy_check_*` actions |
| TC-G5-S11-022 | `reviewer-authorization.ts` | Policy actions allow only `system` and `michael` |
| TC-G5-S11-023 | `reviewer-authorization.ts` | Policy actions block `agent` (throws `ReviewerAuthorizationError`) |
| TC-G5-S11-024 | `reviewer-authorization.ts` | Policy actions block `codex` |
| TC-G5-S11-025 | `policy-check.service.ts` | Throws when `actorType === 'michael'` and `actorUserId` is absent (`actorUserId is required`) |
| TC-G5-S11-026 | `policy-check.service.ts` | Calls `assertReviewerIsWorkspaceMember` before any queue write |

### Section D — Repository Extension (TC-G5-S11-027–031)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-S11-027 | `review-queue.repo.ts` | `ReviewQueueStatusUpdate` contains `policyCheckStatus` field |
| TC-G5-S11-028 | `review-queue.repo.ts` | `updateReviewQueueItemStatus` writes `current_policy_check_status` when provided |
| TC-G5-S11-029 | `review-queue.repo.ts` | Still contains `expectedCurrentStatus` parameter and `.eq('status', expectedCurrentStatus)` |
| TC-G5-S11-030 | `review-queue.repo.ts` | Still throws `StaleStateError` on no-row-updated |
| TC-G5-S11-031 | `review-queue.repo.ts` | Does not contain `.delete(` |

### Section E — Service Safety (TC-G5-S11-032–042)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-S11-032 | `policy-check.service.ts` | File exists and is non-empty |
| TC-G5-S11-033 | `policy-check.service.ts` | Exports `submitForPolicyReview` |
| TC-G5-S11-034 | `policy-check.service.ts` | Exports `markPolicyCheckPassed`, `markPolicyCheckWarning`, `markPolicyCheckBlocked` |
| TC-G5-S11-035 | `policy-check.service.ts` | Exports `markPolicyCheckRequiresCodex`, `markPolicyCheckRequiresHuman` |
| TC-G5-S11-036 | `policy-check.service.ts` | Imports `audit-ledger` service (for audit co-write) |
| TC-G5-S11-037 | `policy-check.service.ts` | Calls `getTaskPacketById` and uses `packet.policy_id` in audit events |
| TC-G5-S11-038 | `policy-check.service.ts` | Does NOT use `current.current_policy_check_status` as audit `policyId` |
| TC-G5-S11-039 | `policy-check.service.ts` | Contains `dryRunOnly: true` in service return values |
| TC-G5-S11-040 | `policy-check.service.ts` | Does NOT contain `executionAuthorized: true` or `execution_authorized` |
| TC-G5-S11-041 | `policy-check.service.ts` | Does NOT contain model provider imports (openai, anthropic, qwen, codex-cli) |
| TC-G5-S11-042 | `policy-check.service.ts` | Does NOT contain `EMAIL_SENDING_ENABLED`, `CAMPAIGN_SENDING_ENABLED`, `fetch(`, Inngest, cron, webhook |

### Section F — Directory Inventory (TC-G5-S11-043–044)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-S11-043 | `modules/verian-agent-bridge/policy-check/` | Directory exists and contains `policy-check.service.ts` |
| TC-G5-S11-044 | `tests/` | `goal5-slice-11-policy-check-service.test.ts` exists |

### 15a. Behavioral tests recommended for future hardening

The following are recommended for a future hardening slice but are not required in Slice 11:

- Runtime test: `assertActorCanTransitionState` throws for `actorType === 'agent'` on policy actions
- Runtime test: `updateReviewQueueItemStatus` with mismatched `expectedCurrentStatus` throws `StaleStateError`
- Runtime test: `submitForPolicyReview` with missing `actorUserId` on michael actor throws
- Integration test: full `submitPacketToQueue → submitForPolicyReview → markPolicyCheckPassed` flow against a seeded local DB

---

## 16. Dependency Map

```
policy-check.service.ts
  ├── review-queue/reviewer-authorization.ts (shared state machine + actor auth)
  ├── review-queue/review-queue.repo.ts      (queue read + update, extended with policyCheckStatus)
  ├── task-packets/task-packet.repo.ts       (packet read for policy_id)
  ├── audit-ledger/audit-ledger.service.ts   (append-only audit write)
  └── review-queue/review-queue.mapper.ts    (proposed new shared mapper, refactored from service)
```

---

## 17. Implementation Order

When Slice 11 is authorized:

0. **STOP before implementation until migration 20240044 has been separately designed, reviewed, approved, locally applied, and verified under its own controlled workflow.** See §4 for the required process gates. Do not write any implementation file until this gate is cleared.
1. Write source-reading tests (TC-G5-S11-001 through TC-G5-S11-044) — all should fail initially
2. Extend `VerianBridgeReviewQueueAction` in `review-queue/types.ts`
3. Extend `VerianBridgeAuditEventType` in `audit-ledger/types.ts`
4. Extend `assertValidStateTransition` in `reviewer-authorization.ts`
5. Extend `assertActorCanTransitionState` in `reviewer-authorization.ts`
6. Extend `ReviewQueueStatusUpdate` and `updateReviewQueueItemStatus` in `review-queue.repo.ts`
7. Extract `mapRowAndPacketToQueueItem` to `review-queue/review-queue.mapper.ts` (refactor)
8. Implement `policy-check.service.ts`
9. Run tests, TypeScript; verify 0 new errors
10. Do not commit until explicit commit authorization prompt

---

## 18. Pre-Implementation Checklist

Before writing any implementation code for Slice 11:

- [ ] Migration 20240044 design document created and approved
- [ ] Migration 20240044 applied to local DB
- [ ] `npx vitest run` baseline confirmed (zero new failures)
- [ ] `npx tsc --noEmit` baseline confirmed (7 pre-existing errors only)
- [ ] Explicit implementation authorization prompt received

---

## 19. Codex Review Focus

Codex should verify the following when reviewing this design:

1. **Implementation blocked** — The design correctly identifies that Slice 11 implementation is BLOCKED pending a separate migration 20240044 workflow. The design document itself does not authorize migration creation, migration application, or implementation code.

2. **Only one new DB audit event value** — Only `policy_review_submitted` is a new required value in the `bridge_audit_events.event_type` DB CHECK constraint. No other new DB audit event values are required for Slice 11.

3. **requires-codex mapping** — `policy_check_requires_codex` is a queue action name. Its audit event type is the existing `codex_review_required` — no new DB value needed.

4. **requires-human mapping** — `policy_check_requires_human` is a queue action name. Its audit event type is the existing `human_approval_requested` — no new DB value needed.

5. **Slice 10 not reopened** — No Slice 10 implementation files are modified by this design. Modifications to shared files (e.g. `reviewer-authorization.ts`) during Slice 11 implementation are Slice 11 changes; Slice 10 remains locked at `73f7c7b`.

6. **No implementation or migration authorization** — This design document does not authorize implementation, migration creation, migration apply, DB commands, staging commands, or production commands of any kind.

7. **No second state machine** — `policy-check.service.ts` is designed to use the shared `reviewer-authorization.ts` functions exclusively. No local `permitted` map or actor permission map is defined inside the service file.

8. **No execution path** — No policy-check action in this design results in `executionAuthorized: true`, bridge execution, model routing, sending, or any external API call.

---

*Design complete. No implementation in this document. No code changes. No migrations. No DB commands.*
