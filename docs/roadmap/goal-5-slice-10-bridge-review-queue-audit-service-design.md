# Goal 5 Slice 10 — Bridge Review Queue + Audit Ledger Repository/Service Design

**Date:** 2026-06-08
**Goal:** Goal 5 — Verian Agent Bridge / Orchestration Layer
**Slice:** Slice 10 — Service/repository layer design and test case plan
**Risk:** MEDIUM/HIGH — backend service/repository design only; no implementation in this slice
**Status:** Design only — no implementation, no migration, no DB commands, no staging, no production

---

## 1. Executive Summary

Goal 5 Slices 2–9 established the persistence layer: type definitions, the four bridge DB tables (applied and verified on local and staging), and a three-migration grant hardening sequence. The bridge tables exist and are grant-hardened, but no application code reads from or writes to them yet.

Slice 10 designs the service/repository layer that will connect application code to those tables safely:

- A typed repository for each bridge table using `createSupabaseServiceClient()` exclusively
- A service layer that enforces reviewer authorization, append-only audit invariants, and `dryRunOnly: true` at every call site
- A reviewer authorization helper that checks workspace membership before any status transition
- Source-reading test cases covering all safety guarantees before any code is written

**No implementation in this slice.** No files are created, no DB commands are run, no migrations are written, no production or staging is touched. The implementation plan in Section 11 requires separate explicit authorization before any code is written.

---

## 2. Critical Pre-Condition: types/database.ts Must Be Regenerated

The existing `types/database.ts` does **not** contain type definitions for the four bridge tables. The grep confirms zero matches for `bridge_task_packets`, `bridge_review_queue_items`, `bridge_audit_events`, `bridge_codex_reviews` in that file.

Repositories that follow the project's established pattern (`Database['public']['Tables'][table]['Row']`) cannot be written until `types/database.ts` includes the bridge table types.

**Required pre-implementation step (authorized separately):**

```powershell
npx supabase gen types typescript --local > types/database.ts
```

This regenerates types from the local Docker DB (127.0.0.1:54322), which has all migrations through 20240043 applied. It is a local-only operation — no staging, no production. The result is an additive diff to `types/database.ts` (new table types added; existing types unchanged).

**Stop condition:** If `types/database.ts` still does not contain bridge table types after regeneration, stop immediately and investigate why the local migration state does not match.

---

## 3. Existing Module State

The following files already exist and must not be modified in Slice 10 implementation:

| File | Status |
|---|---|
| `modules/verian-agent-bridge/types.ts` | Exists — task packet types |
| `modules/verian-agent-bridge/agent-registry.ts` | Exists |
| `modules/verian-agent-bridge/model-router.ts` | Exists |
| `modules/verian-agent-bridge/dry-run.service.ts` | Exists |
| `modules/verian-agent-bridge/review-queue/types.ts` | Exists — queue item types, state types, action types |
| `modules/verian-agent-bridge/audit-ledger/types.ts` | Exists — audit record types, append request types |

The review queue and audit ledger types are fully defined and match the DB schema. Implementation files must derive from these types — they must not redefine them.

---

## 4. Repository Scope

All four bridge tables require a repository. All repositories use `createSupabaseServiceClient()` exclusively — no `createSupabaseServerClient`, no authenticated client. This matches the existing project convention for all write paths and mirrors the `service_role`-only grant model enforced by the DB schema.

Types are derived from `Database['public']['Tables'][table]['Row/Insert/Update']` in `types/database.ts` — not hand-rolled inline.

### 4.1 Proposed file: `modules/verian-agent-bridge/task-packets/task-packet.repo.ts`

```
insertTaskPacket(data: TaskPacketInsert): Promise<TaskPacketRow>
getTaskPacketById(id: string, tenantId: string, workspaceId: string): Promise<TaskPacketRow | null>
listTaskPackets(opts: ListTaskPacketsOptions): Promise<TaskPacketRow[]>
```

`ListTaskPacketsOptions`: `tenantId`, `workspaceId`, optional `policyId` filter, optional `riskLevel` filter, optional `limit`.

No update function — packets are immutable after creation. No delete function — ON DELETE RESTRICT FKs prevent deletion while any queue item, audit event, or Codex review references the packet.

### 4.2 Proposed file: `modules/verian-agent-bridge/review-queue/review-queue.repo.ts`

```
insertReviewQueueItem(data: ReviewQueueItemInsert): Promise<ReviewQueueItemRow>
getReviewQueueItemById(id: string, tenantId: string, workspaceId: string): Promise<ReviewQueueItemRow | null>
listReviewQueueItems(opts: ListReviewQueueItemsOptions): Promise<ReviewQueueItemRow[]>
updateReviewQueueItemStatus(id: string, tenantId: string, workspaceId: string, update: ReviewQueueStatusUpdate): Promise<ReviewQueueItemRow>
```

`ListReviewQueueItemsOptions`: `tenantId`, `workspaceId`, optional `status` filter, optional `packetId` filter, optional `assignedReviewerId` filter, optional `limit`.

`ReviewQueueStatusUpdate`: `status`, `assignedReviewerId?`, `lastDecisionSummary?`.

No delete function — queue items must be archived (`status = 'archived'`), never deleted.

### 4.3 Proposed file: `modules/verian-agent-bridge/audit-ledger/audit-ledger.repo.ts`

```
appendAuditEvent(data: AuditEventInsert): Promise<AuditEventRow>
getAuditEventsForPacket(packetId: string, tenantId: string, workspaceId: string): Promise<AuditEventRow[]>
getAuditEventsForQueueItem(queueItemId: string, tenantId: string, workspaceId: string): Promise<AuditEventRow[]>
```

No update function. No delete function. These omissions are the append-only guarantee at the repository level. The DB schema enforces this via RLS (no authenticated UPDATE/DELETE policy), but the repo must not provide those call sites at all.

`getAuditEventsForPacket` and `getAuditEventsForQueueItem` order results by `created_at` ascending (chronological ledger order).

### 4.4 Proposed file: `modules/verian-agent-bridge/codex-reviews/codex-review.repo.ts`

```
appendCodexReview(data: CodexReviewInsert): Promise<CodexReviewRow>
getCodexReviewsForPacket(packetId: string, tenantId: string, workspaceId: string): Promise<CodexReviewRow[]>
getCodexReviewsForQueueItem(queueItemId: string, tenantId: string, workspaceId: string): Promise<CodexReviewRow[]>
getLatestCodexReviewForQueueItem(queueItemId: string, tenantId: string, workspaceId: string): Promise<CodexReviewRow | null>
```

No update function. No delete function. Superseded reviews produce a new row; the old row is preserved. `getLatestCodexReviewForQueueItem` orders by `created_at DESC` and returns the first result.

### 4.5 Repository conventions

These match the existing project pattern observed in `modules/crm/repositories/lead.repo.ts` and `modules/workflow/repositories/event.repo.ts`:

| Convention | Rule |
|---|---|
| Import | `import { createSupabaseServiceClient } from '@/lib/supabase/service'` |
| Types | `Database['public']['Tables'][table]['Row/Insert/Update']` from `types/database.ts` |
| Error pattern | `if (error) throw new Error('\`fnName\`: ' + error.message)` |
| Null on not-found | `.single()` + `if (error) return null` |
| No event dispatch | Events are service-layer concerns; repos do not emit |
| No send imports | No imports from send-bridge, email-send.actions, or similar |
| No system-control reads | No `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED` |

---

## 5. Service Layer Scope

Services enforce business rules that DB schema and RLS alone cannot enforce: reviewer authorization, state machine validity, append-only invariants at the call site, `dryRunOnly: true` propagation, and audit event co-creation on every status transition.

### 5.1 Bridge Request Context

All service functions accept a `BridgeRequestContext`:

```typescript
type BridgeRequestContext = {
  tenantId: string
  workspaceId: string
  actorUserId?: string
  actorType: VerianBridgeAuditActor  // 'michael' | 'system' | 'agent' | 'codex'
}
```

`tenantId` and `workspaceId` are injected by the call site — they cannot be overridden by user input. `actorType` must be explicitly supplied — no anonymous transitions.

### 5.2 Proposed file: `modules/verian-agent-bridge/audit-ledger/audit-ledger.service.ts`

```
appendAuditEvent(request: VerianBridgeAuditAppendRequest, ctx: BridgeRequestContext): Promise<VerianBridgeAuditRecord>
getAuditHistory(packetId: string, ctx: BridgeRequestContext): Promise<VerianBridgeAuditRecord[]>
getQueueItemAuditHistory(queueItemId: string, ctx: BridgeRequestContext): Promise<VerianBridgeAuditRecord[]>
```

**Invariants enforced in `appendAuditEvent`:**
- `request.dryRunOnly` must be `true` — throw if absent or false
- `request.tenantId` must match `ctx.tenantId` — throw if mismatched
- `request.workspaceId` must match `ctx.workspaceId` — throw if mismatched
- Delegates to `audit-ledger.repo.ts` — no direct Supabase client usage in service

### 5.3 Proposed file: `modules/verian-agent-bridge/review-queue/review-queue.service.ts`

```
submitPacketToQueue(submission: VerianBridgeReviewQueueSubmission, ctx: BridgeRequestContext): Promise<VerianBridgeReviewQueueItem>
getQueueItem(queueItemId: string, ctx: BridgeRequestContext): Promise<VerianBridgeReviewQueueItem | null>
listQueueItems(opts: ListQueueItemsOptions, ctx: BridgeRequestContext): Promise<VerianBridgeReviewQueueItem[]>
approveForManualHandoff(queueItemId: string, ctx: BridgeRequestContext, approvalSummary: string): Promise<VerianBridgeManualHandoffApproval>
denyQueueItem(queueItemId: string, ctx: BridgeRequestContext, reason: string): Promise<VerianBridgeReviewQueueItem>
requestRevision(queueItemId: string, ctx: BridgeRequestContext, reason: string): Promise<VerianBridgeReviewQueueItem>
markCodexReviewReceived(queueItemId: string, codexReviewId: string, ctx: BridgeRequestContext): Promise<VerianBridgeReviewQueueItem>
archiveQueueItem(queueItemId: string, ctx: BridgeRequestContext): Promise<VerianBridgeReviewQueueItem>
```

**Invariants enforced in `submitPacketToQueue`:**
- `submission.dryRunOnly` must be `true`
- `submission.packet.dryRunOnly` must be `true`
- Inserts both a task packet row and a queue item row
- Appends a `packet_created` audit event immediately after insert

**Invariants enforced in `approveForManualHandoff`:**
- Reviewer authorization check via `reviewer-authorization.ts` before any write
- Queue item must be in `waiting_human_approval` state — throw `ValidationError` otherwise
- Returns `VerianBridgeManualHandoffApproval` with `executionAuthorized: false`
- `executionAuthorized: false` must be a literal `false` — not a variable
- Appends `human_approved` + `manual_handoff_prepared` audit events
- Does NOT trigger any model call, execution, send, or background job

**Invariants enforced in all status transition functions:**
- Fetch current state before writing — throw `NotFoundError` if absent
- Validate that the current state permits the requested transition (state machine rules below)
- Call reviewer authorization check before any write
- Append corresponding audit event after every successful status update
- All written rows preserve `dry_run_only: true`

**State machine transition rules:**

| From state | Permitted transitions |
|---|---|
| `draft_packet` | → `pending_policy_review` |
| `pending_policy_review` | → `blocked_by_policy`, `waiting_human_approval`, `waiting_codex_review` |
| `blocked_by_policy` | → `archived` only |
| `waiting_codex_review` | → `waiting_human_approval` (via `markCodexReviewReceived`) |
| `waiting_human_approval` | → `approved_for_manual_handoff`, `denied`, `revision_requested` |
| `revision_requested` | → `pending_policy_review`, `waiting_human_approval` |
| `approved_for_manual_handoff` | → `archived` |
| `denied` | → `waiting_human_approval` (via `reopen`), `archived` |
| `archived` | → no transitions |

### 5.4 Proposed file: `modules/verian-agent-bridge/review-queue/reviewer-authorization.ts`

```
assertReviewerIsWorkspaceMember(reviewerId: string, workspaceId: string, tenantId: string): Promise<void>
assertActorCanTransitionState(actorType: VerianBridgeAuditActor, fromState: VerianBridgeReviewQueueState, action: VerianBridgeReviewQueueAction): void
```

**`assertReviewerIsWorkspaceMember`:**
- Queries `workspace_members` (or equivalent) using service client to verify the actor is a member of the specified workspace within the tenant
- Throws a typed error if not a member — the status transition is aborted
- Used as a guard in every state transition function before the repo write

**`assertActorCanTransitionState`:**
- Synchronous — no DB call
- Enforces actor-to-action rules:
  - Only `actorType: 'michael'` can `approve_for_manual_handoff` or `deny`
  - Only `actorType: 'system'` or `actorType: 'michael'` can `archive`
  - `actorType: 'codex'` can only `mark_codex_review_received`
- Throws a typed error if the actor is not permitted for the action

---

## 6. Authorization Model Summary

| Operation | Who may call | Path |
|---|---|---|
| Insert task packet | `service_role` only | `task-packet.repo.ts` via service client |
| Insert queue item | `service_role` only | `review-queue.repo.ts` via service client |
| Update queue item status | `service_role` only | `review-queue.repo.ts` via service client, after auth check |
| Append audit event | `service_role` only | `audit-ledger.repo.ts` via service client |
| Append Codex review | `service_role` only | `codex-review.repo.ts` via service client |
| Read any bridge table (user-facing) | `authenticated` via RLS SELECT policy | Never called through service client from UI context |
| `anon` access | None | No ACL entry; no RLS policy |

The service layer adds business-logic gates (reviewer authorization, state machine validation, `dryRunOnly` assertion) on top of the DB-level access controls. Both layers are required — DB access control alone cannot enforce state machine rules or `dryRunOnly` contract verification at the application level.

---

## 7. Safety Model

| Invariant | Where enforced |
|---|---|
| `dry_run_only = true` on all rows | DB CHECK constraint (migration 20240041); service assertion on all append/insert requests |
| No `execution_authorized` field | Not present in any bridge table or any service return type |
| No UPDATE on audit events | No repo function provided; no RLS UPDATE policy for authenticated |
| No DELETE on audit events | No repo function provided; no RLS DELETE policy for authenticated |
| No UPDATE on Codex review artifacts | No repo function provided; no RLS UPDATE policy for authenticated |
| No DELETE on task packets | No repo function provided; ON DELETE RESTRICT FKs prevent deletion while referenced |
| `approved_for_manual_handoff` ≠ execution | `VerianBridgeManualHandoffApproval.executionAuthorized: false` literal; no execution path follows |
| No model API calls | No Qwen, Claude, GPT, or Codex API call in any repository or service file |
| No send path | No imports from `email-send.actions`, `send-bridge`, or any send-related module |
| No background jobs | No Inngest, no cron, no queue imports |
| No new migration required | All four tables are already applied to local and staging |
| No production/staging access | All repos use service client against local or app runtime context only |

---

## 8. What Is Explicitly Out of Scope for This Slice

The following are not designed in this document and must not appear in any Slice 10 implementation file:

| Excluded item | Reason |
|---|---|
| Review queue UI | Separate slice — UI design requires its own authorization |
| Server actions wrapping these services | Separate slice — server actions expose user-facing auth boundaries |
| API route handlers | Separate slice |
| Any execution path following approval | Explicitly prohibited; requires its own goal |
| Model API integration (Qwen, Claude, GPT) | Explicitly prohibited; requires its own goal |
| `campaign_schedule_items` writes | Not part of bridge scope |
| Webhook or HTTP outbound | Not part of bridge scope |
| New migration (20240044+) | Not required; all tables exist |

---

## 9. Proposed File List

All files are new additions. No existing files are modified except `types/database.ts` (regeneration only, not manual edit).

| File | Purpose |
|---|---|
| `modules/verian-agent-bridge/task-packets/task-packet.repo.ts` | Immutable insert + read repository for `bridge_task_packets` |
| `modules/verian-agent-bridge/review-queue/review-queue.repo.ts` | Insert + read + status update repository for `bridge_review_queue_items` |
| `modules/verian-agent-bridge/review-queue/reviewer-authorization.ts` | Workspace membership check + actor-to-action rules |
| `modules/verian-agent-bridge/review-queue/review-queue.service.ts` | Queue lifecycle service — submit, transitions, approval, audit co-write |
| `modules/verian-agent-bridge/audit-ledger/audit-ledger.repo.ts` | Append-only insert + read repository for `bridge_audit_events` |
| `modules/verian-agent-bridge/audit-ledger/audit-ledger.service.ts` | Audit event creation orchestration with `dryRunOnly` guard |
| `modules/verian-agent-bridge/codex-reviews/codex-review.repo.ts` | Append-only insert + read repository for `bridge_codex_reviews` |
| `tests/goal5-slice-10-bridge-audit-ledger-repo.test.ts` | Source-reading tests for audit ledger and Codex review repos/service (TC-G5-S10-001–018) |
| `tests/goal5-slice-10-bridge-review-queue-service.test.ts` | Source-reading tests for review queue repo, service, and reviewer auth (TC-G5-S10-019–036) |

---

## 10. Test Case Plan

All 36 test cases use **source-reading only** — `fs.readFileSync` + string matching. No Supabase connection. No model calls. No live DB. Pattern matches existing Goal 5 test files.

### 10.1 Test file: `tests/goal5-slice-10-bridge-audit-ledger-repo.test.ts`

**TC-G5-S10-001** — `audit-ledger.repo.ts` exists at expected path and is non-empty

**TC-G5-S10-002** — `codex-review.repo.ts` exists at expected path and is non-empty

**TC-G5-S10-003** — `audit-ledger.service.ts` exists at expected path and is non-empty

**TC-G5-S10-004** — `audit-ledger.repo.ts` exports `appendAuditEvent` function

**TC-G5-S10-005** — `audit-ledger.repo.ts` exports `getAuditEventsForPacket` function

**TC-G5-S10-006** — `audit-ledger.repo.ts` does NOT contain `.update(` (append-only invariant)

**TC-G5-S10-007** — `audit-ledger.repo.ts` does NOT export any `update*` or `delete*` function

**TC-G5-S10-008** — `audit-ledger.repo.ts` contains `createSupabaseServiceClient`

**TC-G5-S10-009** — `audit-ledger.repo.ts` does NOT contain `createSupabaseServerClient`

**TC-G5-S10-010** — `audit-ledger.repo.ts` contains `.eq('tenant_id',` (tenant scoping)

**TC-G5-S10-011** — `audit-ledger.repo.ts` contains `.eq('workspace_id',` (workspace scoping)

**TC-G5-S10-012** — `audit-ledger.service.ts` contains `dryRunOnly` guard (assert or throw if absent/false)

**TC-G5-S10-013** — `audit-ledger.service.ts` does NOT contain `execution_authorized`

**TC-G5-S10-014** — `codex-review.repo.ts` exports `appendCodexReview` function

**TC-G5-S10-015** — `codex-review.repo.ts` does NOT contain `.update(` (immutable after insert)

**TC-G5-S10-016** — `codex-review.repo.ts` contains `createSupabaseServiceClient`

**TC-G5-S10-017** — All three files (repo, codex-review, service) do NOT contain `EMAIL_SENDING_ENABLED`

**TC-G5-S10-018** — All three files do NOT contain any send-related imports (`send-bridge`, `email-send.actions`, `CAMPAIGN_SENDING_ENABLED`)

---

### 10.2 Test file: `tests/goal5-slice-10-bridge-review-queue-service.test.ts`

**TC-G5-S10-019** — `review-queue.repo.ts` exists at expected path and is non-empty

**TC-G5-S10-020** — `review-queue.service.ts` exists at expected path and is non-empty

**TC-G5-S10-021** — `reviewer-authorization.ts` exists at expected path and is non-empty

**TC-G5-S10-022** — `review-queue.repo.ts` contains `createSupabaseServiceClient`

**TC-G5-S10-023** — `review-queue.repo.ts` does NOT contain `createSupabaseServerClient`

**TC-G5-S10-024** — `review-queue.repo.ts` does NOT export any `delete*` function

**TC-G5-S10-025** — `review-queue.repo.ts` or `review-queue.service.ts` uses `'archived'` as the terminal state (not a delete call)

**TC-G5-S10-026** — `review-queue.service.ts` imports and calls audit ledger service (every transition produces an audit event)

**TC-G5-S10-027** — `review-queue.service.ts` contains `executionAuthorized: false` (literal false in approval return)

**TC-G5-S10-028** — `review-queue.service.ts` does NOT contain `executionAuthorized: true`

**TC-G5-S10-029** — `review-queue.service.ts` contains `dryRunOnly: true` in the approval return shape

**TC-G5-S10-030** — `reviewer-authorization.ts` exports `assertReviewerIsWorkspaceMember`

**TC-G5-S10-031** — `review-queue.service.ts` calls `assertReviewerIsWorkspaceMember` before any status write

**TC-G5-S10-032** — `review-queue.repo.ts` contains `.eq('tenant_id',` (tenant scoping)

**TC-G5-S10-033** — `review-queue.repo.ts` contains `.eq('workspace_id',` (workspace scoping)

**TC-G5-S10-034** — `review-queue.service.ts` does NOT contain `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`

**TC-G5-S10-035** — `review-queue.service.ts` does NOT contain any model routing or model API call (no `qwen`, no `openai`, no `anthropic`, no model provider import)

**TC-G5-S10-036** — All four service/repo files do NOT contain `execution_authorized: true` anywhere

---

## 11. Implementation Plan (Authorized Separately)

The following implementation steps require separate explicit authorization before any code is written.

| Step | Action | Risk |
|---|---|---|
| 0 | Regenerate `types/database.ts` from local DB to add bridge table types | LOW — local-only, no remote |
| 1 | Verify bridge table types are present in `types/database.ts` before writing any repo | LOW — read-only check |
| 2 | Write `modules/verian-agent-bridge/task-packets/task-packet.repo.ts` | MEDIUM |
| 3 | Write `modules/verian-agent-bridge/audit-ledger/audit-ledger.repo.ts` | MEDIUM |
| 4 | Write `modules/verian-agent-bridge/codex-reviews/codex-review.repo.ts` | MEDIUM |
| 5 | Write `modules/verian-agent-bridge/review-queue/review-queue.repo.ts` | MEDIUM |
| 6 | Write `modules/verian-agent-bridge/review-queue/reviewer-authorization.ts` | MEDIUM |
| 7 | Write `modules/verian-agent-bridge/audit-ledger/audit-ledger.service.ts` | MEDIUM |
| 8 | Write `modules/verian-agent-bridge/review-queue/review-queue.service.ts` | MEDIUM/HIGH |
| 9 | Write both test files | LOW |
| 10 | Run `npx vitest run tests/goal5-slice-10-*.test.ts` | LOW |
| 11 | Run full `npx vitest run` for regression check | LOW |
| 12 | Run `npx tsc --noEmit` for TypeScript clean | LOW |

Each step is preceded by `git status --short` and `git diff --name-only` to confirm scope. No step touches staging or production. No step requires a new migration.

**Source-reading test files are written before any implementation file.** Tests must exist and pass (skipping implementation assertions as `not exist`) before implementation begins.

---

## 12. Stop Conditions

Stop immediately if any of the following occur:

| Condition | Action |
|---|---|
| `types/database.ts` does not contain bridge table types after regeneration | Stop; investigate migration application state on local DB |
| Bridge tables absent from local DB (`\d bridge_task_packets` returns nothing) | Stop; local migration state is inconsistent |
| Any service function requires a new DB migration | Stop; create a dedicated migration design slice |
| Any service function requires a model API call | Stop; model routing requires a separate authorized goal |
| Any service function requires a send path | Stop; send path is globally prohibited until explicitly authorized |
| RLS unexpectedly blocks service-role writes in local testing | Stop; investigate migration 20240041–20240043 grant state |
| Any repository uses `createSupabaseServerClient` | Stop; repos must use service client only |
| A new table or column is required that does not exist in the migration | Stop; schema change requires a dedicated migration design and approval slice |
| Any file begins producing execution-path logic | Stop immediately; execution authorization has not been granted |

---

## 13. Safety Confirmations

| Check | Status |
|---|---|
| Code changes made in this slice | No — design document only |
| Implementation files created | No |
| Migrations created | No |
| Migrations applied | No |
| DB commands run | No |
| Staging touched | No |
| Production touched | No |
| Model API calls made | No |
| Send path introduced | No |
| Email sending enabled | No |
| Campaign sending enabled | No |
| Background jobs introduced | No |
| Bridge execution started | No |
| Commits created | No (requires authorization) |
| Tags created | No |
| Pushes made | No (requires authorization) |

---

## 14. Dependency Map

```
types/database.ts (regenerated from local DB)
  └── task-packet.repo.ts
  └── review-queue.repo.ts
  └── audit-ledger.repo.ts
  └── codex-review.repo.ts

modules/verian-agent-bridge/types.ts (existing)
modules/verian-agent-bridge/review-queue/types.ts (existing)
modules/verian-agent-bridge/audit-ledger/types.ts (existing)
  └── reviewer-authorization.ts
  └── audit-ledger.service.ts → audit-ledger.repo.ts
  └── review-queue.service.ts → review-queue.repo.ts
                             → audit-ledger.service.ts
                             → reviewer-authorization.ts

tests/goal5-slice-10-bridge-audit-ledger-repo.test.ts (source-reading only)
tests/goal5-slice-10-bridge-review-queue-service.test.ts (source-reading only)
```

No circular dependencies. No dependency on `email-send.actions`, `send-bridge`, `campaign-queue.service`, or any system-control module.

---

## 15. Recommended Next Prompt

After this design document is committed, pushed, and Codex-reviewed:

> **[CLAUDE PROMPT — GOAL 5 SLICE 10 IMPLEMENTATION ONLY]**
>
> Implement the bridge repository and service layer per the approved design at
> `docs/roadmap/goal-5-slice-10-bridge-review-queue-audit-service-design.md`.
>
> Step 0 first: regenerate `types/database.ts` from local DB only.
> Then implement in the order specified in Section 11.
> Source-reading test files must be written before implementation files.
>
> Hard constraints: no DB writes, no migration commands, no remote DB commands; local-only Supabase type generation is allowed as Step 0. No staging, no production, no execution path, no model calls, no send path.

No implementation begins until this design is Codex-reviewed and Michael has approved the implementation prompt.
