# Goal 5 Slice 12 — Bridge Intake Orchestration Service Design and Test Cases

**Status:** Design only. No implementation in this document.
**Risk:** LOW — orchestration layer only, no new tables, no new migrations, no new state machine entries.
**Dependencies:** Goal 5 Slice 11 (policy-check service, committed `fb3b2b2`).
**Migration prerequisite:** None. All required tables and audit event types are already present as of migration 20240044.
**Locked predecessor:** Slice 11 is committed and locked at `fb3b2b2`. Slice 11 must not be reopened.
**Implementation blocked:** Slice 12 implementation is BLOCKED until this design document is reviewed and approved by Michael. No code, test, or migration files may be created until that approval is received.

---

## 1. Purpose and Scope

This slice designs a dry-run-only **Bridge Intake Orchestration Service** — a single entry point that connects the packet builder (`dry-run.service.ts`) to the review queue (`review-queue.service.ts`) to the policy-check submission (`policy-check.service.ts`) in one ordered, recoverable, auditable intake flow.

**Important:** The intake flow is NOT atomic and NOT transactional. It is an ordered composition of three sequential service calls. A partial-success state is possible if an early call succeeds and a later call fails (see §11 Failure Behavior).

Currently, a caller who wants to submit a bridge request must:
1. Call `buildVerianBridgeDryRunPacket()` manually
2. Inspect the result and branch on `status`
3. If `packet_created`, call `submitPacketToQueue()` with the correct `initialState`
4. Then call `submitForPolicyReview()` to advance the item to `pending_policy_review`

Slice 12 wraps this four-step sequence into a single `submitBridgeRequest()` function. It does not add new capabilities; it provides a safe, correct, and auditable composition of existing capabilities.

**What this slice IS:**
- A new orchestration service at `modules/verian-agent-bridge/intake/bridge-intake.service.ts`
- A single exported function `submitBridgeRequest(input, ctx)` that connects the existing pipeline stages
- A typed result union (`BridgeIntakeResult`) with discriminated `blocked` and `submitted` states
- A zero-migration, zero-state-machine-change increment

**What this slice is NOT:**
- A policy evaluator, model caller, or execution engine
- A new DB table, migration, or audit event type
- A background job, cron, webhook, or Inngest handler
- A bridge execution service or executable model router
- A modification of the state machine or actor authorization rules

---

## 2. Service Location

This design document creates no implementation files. The following files will be created or modified during Slice 12 implementation:

| File | Action | Notes |
|------|--------|-------|
| `modules/verian-agent-bridge/intake/bridge-intake.service.ts` | New | The intake orchestration service |
| `tests/goal5-slice-12-bridge-intake-service.test.ts` | New | Source-reading tests for Slice 12 |

No existing service, repo, type, or migration files are modified in this slice.

---

## 3. No-Go Areas

The following are explicitly out of scope and must not be created in Slice 12:

- No new DB tables
- No new migrations
- No new audit event types (`VerianBridgeAuditEventType` is not extended)
- No new state machine entries (`assertValidStateTransition` is not modified)
- No new actor authorization rules (`assertActorCanTransitionState` is not modified)
- No new review-queue service functions (e.g. `reopenQueueItem` is deferred to a future slice)
- No model calls (no OpenAI, Anthropic, Qwen, Codex API calls)
- No external HTTP fetch
- No `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- No sending of any kind
- No automation, background jobs, or cron handlers
- No production touch
- No staging touch outside normal testing
- No `executionAuthorized: true` anywhere in the codebase

---

## 4. Goal and Measurable Outcome

**Goal:** A single `submitBridgeRequest()` entry point that takes a `VerianBridgeDryRunInput` and either returns a `blocked` result (no DB writes) or a `submitted` result with the queue item in `pending_policy_review` (downstream service writes: task packet insert, queue item insert, queue item status update, and two audit events).

**Measurable outcome (all must be true before Slice 12 may be locked):**
1. `modules/verian-agent-bridge/intake/bridge-intake.service.ts` exists and exports `submitBridgeRequest`, `BridgeIntakeContext`, `BridgeIntakeResult`
2. `tests/goal5-slice-12-bridge-intake-service.test.ts` exists and all test cases pass (TC-G5-S12-001 through TC-G5-S12-048)
3. All 200+ pre-existing tests continue to pass, zero new TypeScript errors introduced
4. No new migration file is created
5. No existing service, repo, type, or migration file is modified
6. Codex review returns PASS or PASS WITH NOTES (no BLOCKED findings)

---

## 5. Risk Classification

**Overall risk: LOW**

| Factor | Assessment |
|--------|-----------|
| New DB tables or columns | None |
| New migrations | None |
| State machine changes | None |
| Actor authorization changes | None |
| Model calls | None |
| External I/O | None |
| New audit event types | None |
| Modified existing services | None |
| Production risk | None (hard stop unchanged) |
| Sending risk | None (controls unchanged) |

The only risk vectors are:
- Incorrect wiring of the four pipeline stages (mitigated by source-reading tests)
- Incorrect `dryRunOnly` or `executionAuthorized` propagation (mitigated by Section F tests)
- Calling DB repos directly instead of through the service layer (mitigated by Section G tests)

---

## 6. Data Flow

**This flow is NOT atomic and NOT transactional.** It is an ordered composition of sequential service calls. A partial-success state is possible (see §11).

```
VerianBridgeDryRunInput + BridgeIntakeContext
    │
    ▼
[1] buildVerianBridgeDryRunPacket(input)          [dry-run.service.ts — no DB, no model calls]
    │
    ├─── status === 'blocked'
    │         │
    │         └──→ return BridgeIntakeBlockedResult {
    │                  status: 'blocked',
    │                  reason: dryRunResult.summary,
    │                  dryRunResult
    │              }
    │              [STOP — no DB writes, no audit events]
    │
    └─── status === 'packet_created'
              │
              ▼
[1b] actorUserId preflight (intake-level guard — fires before any DB write)
    │
    ├─── ctx.actorType === 'michael' && !ctx.actorUserId
    │         │
    │         └──→ return BridgeIntakeBlockedResult {
    │                  status: 'blocked',
    │                  reason: 'actorUserId is required for michael intake submissions',
    │                  dryRunResult
    │              }
    │              [STOP — no DB writes, no audit events]
    │
    └─── ctx.actorType !== 'michael' || ctx.actorUserId is present
              │
              ▼
[2] submitPacketToQueue({                         [review-queue.service.ts — FIRST DB write]
        packet: dryRunResult.taskPacket,
        title: derived from taskId + taskType,
        submittedBy: ctx.actorType,
        submittedAt: new Date().toISOString(),
        initialState: 'draft_packet',
        dryRunOnly: true,
    }, ctx)
    → Writes bridge_task_packets row
    → Writes bridge_review_queue_items row (status: 'draft_packet')
    → Appends audit event: packet_created (nextState: 'draft_packet')
              │
              ▼
[3] submitForPolicyReview(queueItem.queueItemId, ctx, summary?)   [policy-check.service.ts]
    → Updates bridge_review_queue_items (status: 'pending_policy_review')
    → Appends audit event: policy_review_submitted (previousState: 'draft_packet', nextState: 'pending_policy_review')
              │
              ▼
    return BridgeIntakeSubmittedResult {
        status: 'submitted',
        queueItem,      ← returned by submitForPolicyReview (status: 'pending_policy_review')
        dryRunResult,
        dryRunOnly: true,
    }
```

**Partial-success path — [2] succeeds, [3] throws:**
The flow is NOT atomic. If `submitPacketToQueue()` succeeds and `submitForPolicyReview()` then throws, the error propagates to the caller. The packet and queue item already exist in the DB with `status: 'draft_packet'`. This is a valid, recoverable partial-success state — the caller may retry the policy submission later by calling `submitForPolicyReview()` directly on the `queueItemId`. The intake service does not catch, mask, or re-wrap this error.

---

## 7. State Model

Slice 12 adds no new queue states. The intake service produces items in the following final state:

```
[input]  →  draft_packet  →  pending_policy_review  [output]
```

Both transitions use the existing state machine entries in `reviewer-authorization.ts`:
- `draft_packet: ['submit_for_policy_review', 'archive']` — already present since Slice 10
- The `pending_policy_review` state already exists and is the target of the `submit_for_policy_review` action

No modifications to `assertValidStateTransition` or `assertActorCanTransitionState` are required.

---

## 8. Relationship to Existing Services

```
bridge-intake.service.ts   (NEW — Slice 12)
    calls ──→ dry-run.service.ts             (Slice 3 — unchanged)
    calls ──→ review-queue.service.ts        (Slices 10 — unchanged)
    calls ──→ policy-check.service.ts        (Slice 11 — unchanged)

bridge-intake.service.ts does NOT call:
    × review-queue.repo.ts     (bypasses service layer — forbidden)
    × task-packet.repo.ts      (bypasses service layer — forbidden)
    × audit-ledger.repo.ts     (bypasses service layer — forbidden)
    × audit-ledger.service.ts  (audit is handled by review-queue.service and policy-check.service)
    × codex-review.repo.ts     (out of scope for Slice 12)
```

The intake service is a pure orchestration layer. It never calls a repo directly and never appends audit events directly. All writes and audit events are handled by the existing services it delegates to.

---

## 9. Authorization Boundaries

`BridgeIntakeContext` is defined as:

```typescript
export type BridgeIntakeContext = {
  tenantId: string
  workspaceId: string
  actorUserId?: string
  actorType: 'michael' | 'system'
}
```

- `actorType: 'agent'` and `actorType: 'codex'` are NOT permitted in the intake context. Only `michael` and `system` may submit bridge requests, consistent with the policy-check actor authorization rule in `reviewer-authorization.ts`.
- When `actorType === 'michael'`, `actorUserId` is required.
- `BridgeIntakeContext` is a strict subset of `PolicyCheckContext` and `BridgeRequestContext` from the downstream services.

**Intake-level `actorUserId` preflight (step [1b] in §6):**
The intake service performs one authorization guard of its own, before any DB write:

```typescript
if (ctx.actorType === 'michael' && !ctx.actorUserId) {
  return {
    status: 'blocked',
    reason: 'actorUserId is required for michael intake submissions',
    dryRunResult,
  }
}
```

This guard fires after dry-run packet building but before `submitPacketToQueue()`. It prevents DB writes when the downstream workspace-membership check (`assertReviewerIsWorkspaceMember`) would fail anyway. The downstream services remain authoritative for workspace-membership verification; the intake guard only prevents unnecessary DB writes when `actorUserId` is already known to be missing.

For `actorType === 'system'`, no `actorUserId` is required and no preflight guard fires.

---

## 10. Audit Behavior

Two audit events are appended per successful intake (both written by downstream services, not by the intake service directly):

| Step | Service | Event Type | Previous State | Next State |
|------|---------|-----------|----------------|------------|
| 2 — submitPacketToQueue | review-queue.service | `packet_created` | (none) | `draft_packet` |
| 3 — submitForPolicyReview | policy-check.service | `policy_review_submitted` | `draft_packet` | `pending_policy_review` |

On blocked path: zero audit events (no queue item exists, no packet row exists).

The `policy_review_submitted` event type requires the `bridge_audit_events.event_type` CHECK constraint to include `'policy_review_submitted'`, which was added in migration 20240044 (applied local + staging as of 2026-06-08). No additional migration is required.

---

## 11. Failure Behavior

**The flow is NOT atomic and NOT transactional.** A partial-success state is explicitly possible and recoverable.

| Failure point | DB state | Behavior |
|---------------|----------|----------|
| `buildVerianBridgeDryRunPacket()` returns `'blocked'` | No writes | Return `BridgeIntakeBlockedResult`; no exception |
| `buildVerianBridgeDryRunPacket()` throws | No writes | Propagate exception to caller |
| `ctx.actorType === 'michael'` and `ctx.actorUserId` absent | No writes | Return `BridgeIntakeBlockedResult` with reason `'actorUserId is required for michael intake submissions'`; no exception |
| `submitPacketToQueue()` throws | No writes | Propagate exception to caller |
| `submitForPolicyReview()` throws after `submitPacketToQueue()` succeeds | `bridge_task_packets` row exists; `bridge_review_queue_items` row exists in `draft_packet` state (partial success — recoverable) | Propagate exception to caller; caller may retry `submitForPolicyReview()` directly using the `queueItemId` |

The intake service does not attempt retry logic. Retry is the caller's responsibility. The `draft_packet` state is a designed recovery state — items can be advanced from it by a direct call to `policy-check.service.ts`.

---

## 12. Migration Requirement

**None.** All tables and audit event values required by this slice exist as of migration 20240044:

| Requirement | Provided by migration |
|-------------|----------------------|
| `bridge_task_packets` table | 20240041 |
| `bridge_review_queue_items` table | 20240041 |
| `bridge_audit_events` table | 20240041 |
| `bridge_audit_events.event_type = 'packet_created'` and all original `event_type` values | 20240041 |
| `bridge_audit_events.event_type = 'policy_review_submitted'` | 20240044 |

Next available migration number remains **20240045** after Slice 12.

---

## 13. Test Plan

All tests are source-reading tests. No Supabase connection, no model calls, no DB writes. Test file: `tests/goal5-slice-12-bridge-intake-service.test.ts`.

### Section A — File Existence and Directory Structure (TC-G5-S12-001–004)

**TC-G5-S12-001** — `modules/verian-agent-bridge/intake/bridge-intake.service.ts` exists and is non-empty.

**TC-G5-S12-002** — `tests/goal5-slice-12-bridge-intake-service.test.ts` exists.

**TC-G5-S12-003** — `modules/verian-agent-bridge/intake/` directory contains exactly one file: `bridge-intake.service.ts`. No types-only file, no repo file, no mapper file.

**TC-G5-S12-004** — The `review-queue/`, `audit-ledger/`, `policy-check/`, and `task-packets/` directories are unchanged from Slice 11 (file lists match expected inventories).

### Section B — Exports and Type Shape (TC-G5-S12-005–012)

**TC-G5-S12-005** — Intake service source contains `export async function submitBridgeRequest`.

**TC-G5-S12-006** — Intake service source contains `export type BridgeIntakeContext`.

**TC-G5-S12-007** — Intake service source contains `export type BridgeIntakeResult`.

**TC-G5-S12-008** — `BridgeIntakeResult` contains both `'blocked'` and `'submitted'` string literals (discriminated union status values).

**TC-G5-S12-009** — Intake service source contains `dryRunResult` field in both result variants.

**TC-G5-S12-010** — Intake service source contains `queueItem` field in the submitted result variant.

**TC-G5-S12-011** — `BridgeIntakeContext` contains `actorType` and limits it to `'michael' | 'system'` (does not include `'agent'` or `'codex'`).

**TC-G5-S12-012** — Intake service source contains `readonly dryRunOnly: true` in the submitted result type.

### Section C — Dependency References (TC-G5-S12-013–018)

**TC-G5-S12-013** — Intake service imports from `dry-run.service` (contains the string `'dry-run.service'`).

**TC-G5-S12-014** — Intake service imports from `review-queue.service` (contains the string `'review-queue.service'`).

**TC-G5-S12-015** — Intake service imports from `policy-check.service` (contains the string `'policy-check.service'`).

**TC-G5-S12-016** — Intake service source contains `buildVerianBridgeDryRunPacket`.

**TC-G5-S12-017** — Intake service source contains `submitPacketToQueue`.

**TC-G5-S12-018** — Intake service source contains `submitForPolicyReview`.

### Section D — Blocked Path Contract (TC-G5-S12-019–026)

**TC-G5-S12-019** — Intake service source contains a branch on `dryRunResult.status === 'blocked'` or equivalent guard.

**TC-G5-S12-020** — The blocked result branch contains `status: 'blocked'` literal.

**TC-G5-S12-021** — The blocked result branch appears BEFORE any `submitPacketToQueue` call in the source (guard-before-write ordering).

**TC-G5-S12-022** — Intake service source contains `dryRunResult.summary` (blocked reason sourced from dry-run result).

**TC-G5-S12-023** — Intake service does NOT call `insertTaskPacket` or `insertReviewQueueItem` directly.

**TC-G5-S12-024** — The blocked return statement contains `dryRunResult` (blocked result carries the dry-run result).

**TC-G5-S12-025** — Intake service does NOT call `appendAuditEvent` directly (audit is delegated to downstream services).

**TC-G5-S12-026** — Blocked result does NOT include a `queueItem` field (no queue item exists on the blocked path).

**TC-G5-S12-026a** — Intake service source contains a guard that checks `ctx.actorType === 'michael'` and the absence of `ctx.actorUserId` and returns `status: 'blocked'` (the intake-level actorUserId preflight fires before any DB write).

**TC-G5-S12-026b** — The `actorType === 'michael'` actorUserId guard appears in the source BEFORE the `submitPacketToQueue` call (confirm by checking character offset: guard index < `submitPacketToQueue` index).

### Section E — Submitted Path Contract (TC-G5-S12-027–034)

**TC-G5-S12-027** — Intake service source contains `initialState: 'draft_packet'` (not `'pending_policy_review'` as the initial state).

**TC-G5-S12-028** — `submitForPolicyReview` call appears AFTER `submitPacketToQueue` call in the source.

**TC-G5-S12-029** — The submitted return statement contains `status: 'submitted'` literal.

**TC-G5-S12-030** — The submitted return statement contains `queueItem` and `dryRunResult`.

**TC-G5-S12-031** — Intake service source contains `dryRunOnly: true` in the submitted result return statement.

**TC-G5-S12-032** — Intake service does NOT pass `initialState: 'pending_policy_review'` to `submitPacketToQueue` (the initial state is always `'draft_packet'`).

**TC-G5-S12-033** — Intake service does NOT set `executionAuthorized: true` anywhere.

**TC-G5-S12-034** — Intake service does NOT transition any queue item to `'approved_for_manual_handoff'` (that state is reserved for human-approval service).

### Section F — Safety Invariants (TC-G5-S12-035–042)

**TC-G5-S12-035** — Intake service does NOT contain `executionAuthorized: true`.

**TC-G5-S12-036** — Intake service contains at least one `dryRunOnly: true` literal.

**TC-G5-S12-037** — Intake service does NOT import model provider SDKs (`openai`, `anthropic`, `qwen`, `codex-cli`).

**TC-G5-S12-038** — Intake service does NOT contain `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`.

**TC-G5-S12-039** — Intake service does NOT contain `fetch(`, `process.env`, `Inngest`, `cron`, or `webhook`.

**TC-G5-S12-040** — Intake service does NOT define a local `permitted` state-transition map (does not duplicate `assertValidStateTransition`).

**TC-G5-S12-041** — Intake service does NOT duplicate downstream actor authorization rules. The only `actorType === 'michael'` check permitted is the intake-level `actorUserId` preflight (verifying `actorUserId` is present). The service does NOT contain patterns that throw `ReviewerAuthorizationError` or equivalent — those remain exclusively in `reviewer-authorization.ts`.

**TC-G5-S12-042** — Intake service does NOT call `auditService.appendAuditEvent` or `auditRepo.appendAuditEvent` directly.

### Section G — No-Go Area Enforcement (TC-G5-S12-043–048)

**TC-G5-S12-043** — Intake service does NOT import from `audit-ledger.repo` (bypassing service layer is forbidden).

**TC-G5-S12-044** — Intake service does NOT import from `review-queue.repo` (bypassing service layer is forbidden).

**TC-G5-S12-045** — Intake service does NOT import from `task-packet.repo` (bypassing service layer is forbidden).

**TC-G5-S12-046** — Intake service does NOT import from `codex-review.repo` (out of scope for Slice 12).

**TC-G5-S12-047** — No new migration file with prefix `20240045` or higher exists in `supabase/migrations/`.

**TC-G5-S12-048 (PROCESS GATE — not an automated source-reading test)** — Before locking Slice 12, run `git status --short` and confirm that `docs/roadmap/operational-twin-north-star.md` appears only as `??` (untracked) or is absent from the working tree. It must never appear as a staged, modified, or committed file. This is a manual pre-lock verification step executed by the developer, not a Vitest test case. Implementation tooling must not attempt to read git status inside an automated test.

---

## 14. Stop Conditions

The following conditions must cause `submitBridgeRequest()` to return a `blocked` result without any DB writes:

- `buildVerianBridgeDryRunPacket()` returns `status: 'blocked'` (policy blocked, unknown agent, unknown policy, no route found)
- `ctx.actorType === 'michael'` and `ctx.actorUserId` is absent (intake-level actorUserId preflight — fires before first DB write)
- `dryRunResult.taskPacket` is absent or undefined when `dryRunResult.status === 'packet_created'` (defensive guard)

The following conditions must cause `submitBridgeRequest()` to throw:

- `submitPacketToQueue()` throws (DB write failed — let error propagate)
- `submitForPolicyReview()` throws after `submitPacketToQueue()` succeeded (let error propagate; packet is in recoverable `draft_packet` state)

The following MUST NOT occur in any code path:

- `executionAuthorized: true` appearing on any return value
- A queue item reaching `approved_for_manual_handoff` as a result of this service
- A direct call to any repo function bypassing the service layer
- Any audit event appended directly (must go through `policy-check.service` or `review-queue.service`)

---

## 15. Codex Review Checklist

Before Slice 12 implementation is locked, Codex review must verify:

- [ ] `bridge-intake.service.ts` exports exactly: `submitBridgeRequest`, `BridgeIntakeContext`, `BridgeIntakeResult`
- [ ] `BridgeIntakeContext.actorType` is constrained to `'michael' | 'system'` only
- [ ] The intake service contains an intake-level actorUserId preflight: when `actorType === 'michael'` and `actorUserId` is absent, returns `status: 'blocked'` before any DB write
- [ ] The actorUserId preflight appears in source BEFORE the `submitPacketToQueue` call
- [ ] The blocked path returns before any `submitPacketToQueue` call (guard-before-write)
- [ ] The flow is documented and implemented as NOT atomic (no transactional wrapper)
- [ ] The submitted path calls `submitPacketToQueue` with `initialState: 'draft_packet'`
- [ ] The submitted path calls `submitForPolicyReview` after `submitPacketToQueue`
- [ ] No direct repo imports (`*.repo.ts`) in the intake service
- [ ] No direct `appendAuditEvent` call in the intake service
- [ ] No `executionAuthorized: true` in the intake service
- [ ] `dryRunOnly: true` is present in the submitted result return value
- [ ] All 48 source-reading tests pass
- [ ] All pre-existing tests still pass (200+ tests, zero regressions)
- [ ] No new TypeScript errors
- [ ] No new migration files created
- [ ] No existing service/repo/type files modified
- [ ] `docs/roadmap/operational-twin-north-star.md` remains untracked

---

## 16. Implementation Gate

**Implementation of Slice 12 is BLOCKED until:**

1. Michael reviews and approves this design document and test cases
2. After design approval, an Implementation Plan is submitted and approved by Michael
3. All hard constraints in §3 (No-Go Areas) remain in force throughout implementation

No code files, test files, or migration files may be created or modified until both approvals (design + implementation plan) are received.

---

*End of Goal 5 Slice 12 Design and Test Cases*
