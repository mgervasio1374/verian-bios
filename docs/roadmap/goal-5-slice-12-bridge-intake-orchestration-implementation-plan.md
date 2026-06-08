# Goal 5 Slice 12 — Bridge Intake Orchestration Service Implementation Plan

**Status:** Implementation plan only. No implementation in this document.
**Design approval:** Michael approved Goal 5 Slice 12 Design & Test Cases.
**Approved design:** `docs/roadmap/goal-5-slice-12-bridge-intake-orchestration-design.md`
**Risk:** LOW — new orchestration file only, no migrations, no state machine changes.
**Implementation blocked:** Slice 12 implementation is BLOCKED until Michael approves this implementation plan.

---

## 1. Goal and Measurable Outcome

**Goal:** Implement `modules/verian-agent-bridge/intake/bridge-intake.service.ts` and `tests/goal5-slice-12-bridge-intake-service.test.ts` as specified in the approved design. No other files are created or modified.

**Measurable outcome (all must be true before Slice 12 may be locked):**

1. `modules/verian-agent-bridge/intake/bridge-intake.service.ts` exists and exports `submitBridgeRequest`, `BridgeIntakeContext`, `BridgeIntakeResult`
2. `tests/goal5-slice-12-bridge-intake-service.test.ts` exists and all 49 automated test cases pass (TC-G5-S12-001 through TC-G5-S12-047, including TC-G5-S12-026a and TC-G5-S12-026b; TC-G5-S12-048 is a process gate, not a Vitest test)
3. Full suite (`npx vitest run`) reports all 200+ tests passing, zero regressions
4. `npm run typecheck` reports only the 7 known pre-existing errors — zero new errors
5. No new migration file exists
6. No existing service, repo, type, or migration file is modified
7. `git status --short` shows only two new untracked files (intake service + test) before commit
8. Codex review returns PASS or PASS WITH NOTES (no BLOCKED findings)

---

## 2. Risk Classification

**Overall risk: LOW**

| Factor | Assessment |
|--------|-----------|
| New DB tables or columns | None |
| New migrations | None |
| State machine changes | None |
| Actor authorization changes | None |
| Model calls | None |
| External I/O | None |
| Modified existing services | None |
| Production risk | None (hard stop unchanged) |
| Sending risk | None (controls unchanged) |

---

## 3. Approved Design Summary

Slice 12 creates a single `submitBridgeRequest()` orchestration function in a new `intake/` subdirectory. The function:

1. Calls `buildVerianBridgeDryRunPacket()` — no DB writes, no model calls
2. Returns `blocked` immediately if the dry-run returns blocked (no DB writes)
3. Checks `actorType === 'michael'` + missing `actorUserId` — returns `blocked` (no DB writes)
4. Checks `taskPacket` is present — returns `blocked` if absent (defensive guard)
5. Calls `submitPacketToQueue()` with `initialState: 'draft_packet'` — first DB write
6. Calls `submitForPolicyReview()` on the returned queue item ID — second DB write
7. Returns `submitted` with the final queue item (status: `pending_policy_review`)

The flow is NOT atomic. If step 5 succeeds and step 6 throws, the queue item remains in `draft_packet` state — a valid, recoverable partial-success that the caller may retry directly.

---

## 4. Files to Create

| File | Action |
|------|--------|
| `modules/verian-agent-bridge/intake/bridge-intake.service.ts` | **Create** — the intake orchestration service |
| `tests/goal5-slice-12-bridge-intake-service.test.ts` | **Create** — source-reading tests for Slice 12 |

The `modules/verian-agent-bridge/intake/` directory does not yet exist and must be created as part of writing the service file.

---

## 5. Files That Must Not Change

The following files must remain byte-for-byte identical after Slice 12 implementation:

**Existing services (do not modify):**
- `modules/verian-agent-bridge/dry-run.service.ts`
- `modules/verian-agent-bridge/review-queue/review-queue.service.ts`
- `modules/verian-agent-bridge/policy-check/policy-check.service.ts`
- `modules/verian-agent-bridge/audit-ledger/audit-ledger.service.ts`

**Existing repos (do not modify):**
- `modules/verian-agent-bridge/review-queue/review-queue.repo.ts`
- `modules/verian-agent-bridge/audit-ledger/audit-ledger.repo.ts`
- `modules/verian-agent-bridge/task-packets/task-packet.repo.ts`
- `modules/verian-agent-bridge/codex-reviews/codex-review.repo.ts`

**Existing type files (do not modify):**
- `modules/verian-agent-bridge/types.ts`
- `modules/verian-agent-bridge/review-queue/types.ts`
- `modules/verian-agent-bridge/audit-ledger/types.ts`
- `modules/verian-agent-bridge/review-queue/reviewer-authorization.ts`
- `modules/verian-agent-bridge/review-queue/review-queue.mapper.ts`
- `modules/verian-agent-bridge/agent-registry.ts`
- `modules/verian-agent-bridge/model-router.ts`

**Existing migrations (do not modify or create):**
- All files under `supabase/migrations/` — no additions, no changes

**Existing tests (do not modify):**
- All test files except the new `tests/goal5-slice-12-bridge-intake-service.test.ts`

**Untracked file (do not touch):**
- `docs/roadmap/operational-twin-north-star.md` — must remain untracked and uncommitted

---

## 6. Exact Implementation Sequence

Execute in this order. Do not skip or reorder steps.

**Step 1 — Write both files together:**

Both files must be created before running any tests, because the test file is a source-reading test that reads the service file at runtime.

1a. Create `modules/verian-agent-bridge/intake/bridge-intake.service.ts` per the type definitions and algorithm in §7 and §8 below.
1b. Create `tests/goal5-slice-12-bridge-intake-service.test.ts` per the test plan in §15 below.

**Step 2 — Run Slice 12 test file:**
```
npx vitest run tests/goal5-slice-12-bridge-intake-service.test.ts
```
All 49 automated test cases must pass. Fix any failures before proceeding.

**Step 3 — Run adjacent Goal 5 test files together:**
```
npx vitest run tests/goal5-slice-10-bridge-review-queue-service.test.ts tests/goal5-slice-10-bridge-audit-ledger-repo.test.ts tests/goal5-slice-11-policy-check-service.test.ts tests/goal5-slice-12-bridge-intake-service.test.ts
```
All must pass. Fix any regressions before proceeding.

**Step 4 — Run full test suite:**
```
npx vitest run
```
All 200+ tests must pass. Zero regressions. Fix any failures before proceeding.

**Step 5 — Run TypeScript check:**
```
npm run typecheck
```
Only the 7 known pre-existing errors are acceptable (see §17). Zero new errors. Fix any new errors before proceeding.

**Step 6 — Verify working tree:**
```
git status --short
git diff --stat
```
Confirm exactly two untracked files:
```
?? modules/verian-agent-bridge/intake/bridge-intake.service.ts
?? tests/goal5-slice-12-bridge-intake-service.test.ts
```
No tracked files modified. `docs/roadmap/operational-twin-north-star.md` remains `??` only.

**Step 7 — Stop. Do not commit.** Await commit authorization.

---

## 7. Type Definitions to Create

All types are defined at the top of `bridge-intake.service.ts`.

### `BridgeIntakeContext`

```typescript
export type BridgeIntakeContext = {
  tenantId: string
  workspaceId: string
  actorUserId?: string
  actorType: 'michael' | 'system'
}
```

- `actorType` is constrained to `'michael' | 'system'` only. `'agent'` and `'codex'` are not permitted at the intake boundary.
- `actorUserId` is optional in the type but required at runtime when `actorType === 'michael'` (enforced by the actorUserId preflight in the function body).

### `BridgeIntakeBlockedResult`

```typescript
type BridgeIntakeBlockedResult = {
  readonly status: 'blocked'
  readonly reason: string
  readonly dryRunResult: VerianBridgeDryRunResult
}
```

- No `queueItem` field — no queue item exists when blocked.
- Carries `dryRunResult` so the caller has the full dry-run output for logging or display.

### `BridgeIntakeSubmittedResult`

```typescript
type BridgeIntakeSubmittedResult = {
  readonly status: 'submitted'
  readonly queueItem: VerianBridgeReviewQueueItem
  readonly dryRunResult: VerianBridgeDryRunResult
  readonly dryRunOnly: true
}
```

- `dryRunOnly: true` is a literal type — must appear exactly as shown.
- `queueItem` is the return value of `submitForPolicyReview()`, which has `status: 'pending_policy_review'`.

### `BridgeIntakeResult`

```typescript
export type BridgeIntakeResult = BridgeIntakeBlockedResult | BridgeIntakeSubmittedResult
```

- Discriminated union on the `status` field (`'blocked'` | `'submitted'`).
- Exported so callers can pattern-match on the result.

---

## 8. `submitBridgeRequest` Algorithm

The function signature:

```typescript
export async function submitBridgeRequest(
  input: VerianBridgeDryRunInput,
  ctx: BridgeIntakeContext,
  summary?: string
): Promise<BridgeIntakeResult>
```

The optional `summary` parameter is passed through to `submitForPolicyReview()` as the audit summary for the `policy_review_submitted` event.

**Algorithm (ordered, not atomic):**

```
1. const dryRunResult = buildVerianBridgeDryRunPacket(input)
   // synchronous, no DB, no model calls

2. if (dryRunResult.status === 'blocked') {
     return { status: 'blocked', reason: dryRunResult.summary, dryRunResult }
   }
   // STOP — no DB writes

3. if (ctx.actorType === 'michael' && !ctx.actorUserId) {
     return {
       status: 'blocked',
       reason: 'actorUserId is required for michael intake submissions',
       dryRunResult,
     }
   }
   // STOP — no DB writes (actorUserId preflight, step [1b] in design)

4. if (!dryRunResult.taskPacket) {
     return {
       status: 'blocked',
       reason: 'buildVerianBridgeDryRunPacket returned packet_created but taskPacket is absent',
       dryRunResult,
     }
   }
   // STOP — no DB writes (defensive guard)

5. const packet = dryRunResult.taskPacket
   const title = `${packet.taskId} — ${packet.taskType}`

6. const downstreamCtx = {
     tenantId: ctx.tenantId,
     workspaceId: ctx.workspaceId,
     actorUserId: ctx.actorUserId,
     actorType: ctx.actorType,
   }
   // BridgeIntakeContext.actorType ('michael' | 'system') is a subset of
   // BridgeRequestContext.actorType — direct assignment is type-safe.

7. const submission: VerianBridgeReviewQueueSubmission = {
     packet,
     title,
     submittedBy: ctx.actorType,
     submittedAt: new Date().toISOString(),
     initialState: 'draft_packet',
     dryRunOnly: true,
   }

8. const initialQueueItem = await submitPacketToQueue(submission, downstreamCtx)
   // FIRST DB WRITE: inserts bridge_task_packets + bridge_review_queue_items,
   // appends packet_created audit event.
   // If this throws, error propagates — no DB cleanup needed.

9. const queueItem = await submitForPolicyReview(
     initialQueueItem.queueItemId,
     downstreamCtx,
     summary
   )
   // SECOND DB WRITE: updates queue item status to pending_policy_review,
   // appends policy_review_submitted audit event.
   // If this throws after step 8 succeeded: error propagates.
   // Queue item remains in draft_packet — recoverable partial-success.

10. return {
      status: 'submitted',
      queueItem,
      dryRunResult,
      dryRunOnly: true,
    }
```

**Critical ordering invariants:**
- Steps 2, 3, 4 (all blocked returns) MUST appear before step 8 (first DB write).
- Step 9 MUST appear after step 8.
- The function MUST NOT catch errors from steps 8 or 9 — let them propagate.
- The function MUST NOT call any repo function directly at any step.
- The function MUST NOT call `appendAuditEvent` directly at any step.

---

## 9. `actorUserId` Preflight Placement

The preflight guard (step 3 in §8) must appear:

- **After** `buildVerianBridgeDryRunPacket(input)` — the dry-run result is needed as part of the blocked return value
- **Before** `submitPacketToQueue()` — no DB write may occur when `actorUserId` is missing

Source-order verification: in the compiled `.ts` source, `ctx.actorType === 'michael' && !ctx.actorUserId` must appear at a lower character offset than `await submitPacketToQueue(`. TC-G5-S12-026b verifies this by comparing character offsets of call-specific strings — import-name references must not satisfy the check.

---

## 10. Blocked Path Behavior

A `BridgeIntakeBlockedResult` is returned (not thrown) in three cases:

| Trigger | `reason` value | DB writes |
|---------|---------------|-----------|
| `dryRunResult.status === 'blocked'` | `dryRunResult.summary` | None |
| `ctx.actorType === 'michael' && !ctx.actorUserId` | `'actorUserId is required for michael intake submissions'` | None |
| `!dryRunResult.taskPacket` after `packet_created` | descriptive message | None |

All blocked returns:
- Carry `dryRunResult` (the caller has the full dry-run output)
- Do NOT include a `queueItem` field
- Do NOT append any audit events
- Do NOT throw — they return a value

---

## 11. Submitted Path Behavior

A `BridgeIntakeSubmittedResult` is returned only when all three downstream calls succeed:

1. `submitPacketToQueue()` called with `initialState: 'draft_packet'` — never `'pending_policy_review'`
2. `submitForPolicyReview()` called with the queue item ID returned by step 1
3. The returned `queueItem` has `status: 'pending_policy_review'`

The result carries:
- `status: 'submitted'`
- `queueItem` — from `submitForPolicyReview()` return value
- `dryRunResult` — the original dry-run result
- `dryRunOnly: true` — literal type, always `true`

---

## 12. Non-Atomic / Recoverable Partial-Success Behavior

**The flow is NOT atomic and NOT transactional.** There is no rollback mechanism.

If `submitPacketToQueue()` succeeds and `submitForPolicyReview()` subsequently throws:

- The error propagates to the caller unchanged
- `bridge_task_packets` row exists with the new packet ID
- `bridge_review_queue_items` row exists with `status: 'draft_packet'`
- The `packet_created` audit event has been appended
- No `policy_review_submitted` audit event exists yet

This is a valid, recoverable partial-success state:
- The caller receives the exception and must handle it
- The intake service does not catch or wrap the error — the exception carries no guaranteed `queueItemId`
- Recovery should proceed through a reviewed lookup/retry path: a future recovery service or caller may query for the recoverable `draft_packet` item using tenant/workspace/task identifiers
- The caller may then retry by calling `submitForPolicyReview()` directly from `policy-check.service.ts`
- The `draft_packet` state is a designed recovery entry point in the state machine

The intake service must NOT:
- Catch the error from `submitForPolicyReview()` and swallow it
- Attempt any rollback of the `submitPacketToQueue()` writes
- Return a `blocked` result after a partial DB write

---

## 13. Audit Behavior

Two audit events are appended per successful intake. Both are written by downstream services — the intake service MUST NOT call `appendAuditEvent` directly.

| Call | Service | Event written | Previous state | Next state |
|------|---------|--------------|----------------|------------|
| `submitPacketToQueue()` | `review-queue.service.ts` | `packet_created` | (none) | `draft_packet` |
| `submitForPolicyReview()` | `policy-check.service.ts` | `policy_review_submitted` | `draft_packet` | `pending_policy_review` |

On any blocked path: zero audit events. No queue item exists, so no audit record can be linked.

---

## 14. No-Go Enforcement

The following must be verified before any commit is created:

| Rule | Verification |
|------|-------------|
| No direct repo imports | `bridge-intake.service.ts` must not import from `*.repo.ts` |
| No direct audit writes | `bridge-intake.service.ts` must not call `appendAuditEvent` or import from `audit-ledger.service` |
| No model calls | No `openai`, `anthropic`, `qwen`, `codex-cli` imports or references |
| No external fetch | No `fetch(`, no HTTP client imports |
| No sending controls | No `EMAIL_SENDING_ENABLED`, no `CAMPAIGN_SENDING_ENABLED` |
| No env reads | No `process.env` |
| No state machine duplication | No local `permitted` map, no `assertValidStateTransition` logic |
| No unauthorized actor patterns | No `ReviewerAuthorizationError` throws (only downstream services throw those) |
| No execution authorization | No `executionAuthorized: true` |
| No new migrations | `supabase/migrations/` directory unchanged |
| No existing file modifications | All files listed in §5 unchanged |

---

## 15. Test Implementation Plan

Test file: `tests/goal5-slice-12-bridge-intake-service.test.ts`

All tests are source-reading tests using `fs.readFileSync` and `fs.readdirSync`. No Supabase connection, no model calls, no DB writes.

### Pattern

```typescript
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = path.resolve(__dirname, '..')
const svcPath = 'modules/verian-agent-bridge/intake/bridge-intake.service.ts'
const src = fs.readFileSync(path.join(root, svcPath), 'utf-8')

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel))
}
```

### Source-order test requirement

All tests that verify the relative ordering of source elements (TC-G5-S12-021, TC-G5-S12-026b, TC-G5-S12-028) must use **call-specific markers**, not bare import-name strings. `import { submitPacketToQueue }` at the top of the file would also match `src.indexOf('submitPacketToQueue')`, producing a false-positive ordering result.

**Required patterns:**
- Use `await submitPacketToQueue(` — not `'submitPacketToQueue'`
- Use `await submitForPolicyReview(` — not `'submitForPolicyReview'`

Where practical, scope comparisons to the `submitBridgeRequest` function body (slice `src` from the `async function submitBridgeRequest` offset) so that import declarations at the top of the file cannot satisfy ordering checks.

### Section A — File Existence (TC-G5-S12-001–004)

**TC-G5-S12-001:** `exists(svcPath)` is `true` and `src.trim().length > 0`

**TC-G5-S12-002:** `exists('tests/goal5-slice-12-bridge-intake-service.test.ts')` is `true`

**TC-G5-S12-003:** `fs.readdirSync(intakeDir).sort()` equals `['bridge-intake.service.ts']`

**TC-G5-S12-004:** Directory inventories for `review-queue/`, `audit-ledger/`, `policy-check/`, `task-packets/` match Slice 11 expected file lists exactly

### Section B — Exports and Type Shape (TC-G5-S12-005–012)

**TC-G5-S12-005:** `src.includes('export async function submitBridgeRequest')`

**TC-G5-S12-006:** `src.includes('export type BridgeIntakeContext')`

**TC-G5-S12-007:** `src.includes('export type BridgeIntakeResult')`

**TC-G5-S12-008:** `src.includes("'blocked'") && src.includes("'submitted'")` (within result type region)

**TC-G5-S12-009:** `(src.match(/dryRunResult/g) ?? []).length >= 2` (appears in both result variants)

**TC-G5-S12-010:** `src.includes('queueItem')` (in submitted result)

**TC-G5-S12-011:** `src.includes("'michael' | 'system'")` and `!src.includes("'agent'")` within `BridgeIntakeContext` type region and `!src.includes("'codex'")` within that region

**TC-G5-S12-012:** `src.includes('readonly dryRunOnly: true')`

### Section C — Dependency References (TC-G5-S12-013–018)

**TC-G5-S12-013:** `src.includes('dry-run.service')`

**TC-G5-S12-014:** `src.includes('review-queue.service')`

**TC-G5-S12-015:** `src.includes('policy-check.service')`

**TC-G5-S12-016:** `src.includes('buildVerianBridgeDryRunPacket')`

**TC-G5-S12-017:** `src.includes('submitPacketToQueue')`

**TC-G5-S12-018:** `src.includes('submitForPolicyReview')`

### Section D — Blocked Path Contract (TC-G5-S12-019–026b)

**TC-G5-S12-019:** `src.includes("dryRunResult.status === 'blocked'")` or equivalent guard pattern

**TC-G5-S12-020:** `src.includes("status: 'blocked'")`

**TC-G5-S12-021:** `src.indexOf("status: 'blocked'") < src.indexOf("await submitPacketToQueue(")`

**TC-G5-S12-022:** `src.includes('dryRunResult.summary')`

**TC-G5-S12-023:** `!src.includes('insertTaskPacket') && !src.includes('insertReviewQueueItem')`

**TC-G5-S12-024:** The blocked return objects contain `dryRunResult` (pattern match near `status: 'blocked'`)

**TC-G5-S12-025:** `!src.includes('appendAuditEvent')`

**TC-G5-S12-026:** The `status: 'blocked'` return path does NOT contain `queueItem:` assignment

**TC-G5-S12-026a:** `src.includes("ctx.actorType === 'michael'")` and `src.includes('actorUserId is required')` and a nearby `status: 'blocked'` return

**TC-G5-S12-026b:** `src.indexOf("actorType === 'michael'") < src.indexOf("await submitPacketToQueue(")`

### Section E — Submitted Path Contract (TC-G5-S12-027–034)

**TC-G5-S12-027:** `src.includes("initialState: 'draft_packet'")` and `!src.includes("initialState: 'pending_policy_review'")`

**TC-G5-S12-028:** `src.indexOf("await submitForPolicyReview(") > src.indexOf("await submitPacketToQueue(")`

**TC-G5-S12-029:** `src.includes("status: 'submitted'")`

**TC-G5-S12-030:** The `status: 'submitted'` return contains both `queueItem` and `dryRunResult`

**TC-G5-S12-031:** `src.includes('dryRunOnly: true')` (in submitted result return)

**TC-G5-S12-032:** `!src.includes("initialState: 'pending_policy_review'")`

**TC-G5-S12-033:** `!src.includes('executionAuthorized: true')`

**TC-G5-S12-034:** `!src.includes("'approved_for_manual_handoff'")`

### Section F — Safety Invariants (TC-G5-S12-035–042)

**TC-G5-S12-035:** `!src.includes('executionAuthorized: true')`

**TC-G5-S12-036:** `(src.match(/dryRunOnly: true/g) ?? []).length >= 1`

**TC-G5-S12-037:** `!/openai/i.test(src) && !/anthropic/i.test(src) && !/qwen/i.test(src) && !src.includes('codex-cli')`

**TC-G5-S12-038:** `!src.includes('EMAIL_SENDING_ENABLED') && !src.includes('CAMPAIGN_SENDING_ENABLED')`

**TC-G5-S12-039:** `!src.includes('fetch(') && !src.includes('process.env') && !/Inngest/i.test(src) && !/\bcron\b/i.test(src) && !/webhook/i.test(src)`

**TC-G5-S12-040:** `!src.match(/const permitted\s*[:=]/) && !src.match(/permitted\s*:\s*\{/)`

**TC-G5-S12-041:** The only `actorType === 'michael'` reference is in the actorUserId preflight. `!src.includes('ReviewerAuthorizationError')`

**TC-G5-S12-042:** `!src.includes('appendAuditEvent') && !src.includes('auditRepo')`

### Section G — No-Go Area Enforcement (TC-G5-S12-043–048)

**TC-G5-S12-043:** `!src.includes('audit-ledger.repo')`

**TC-G5-S12-044:** `!src.includes('review-queue.repo')`

**TC-G5-S12-045:** `!src.includes('task-packet.repo')`

**TC-G5-S12-046:** `!src.includes('codex-review.repo')`

**TC-G5-S12-047:** No file matching `supabase/migrations/20240045*` or higher exists

**TC-G5-S12-048 (PROCESS GATE — not automated):** Before locking, run `git status --short` and confirm `docs/roadmap/operational-twin-north-star.md` appears only as `??` or is absent. Never staged, modified, or committed. This is a manual pre-lock check, not a Vitest test.

---

## 16. Commands to Run in the Future Implementation Step

Run in this exact order. Each step must pass before proceeding to the next.

**Step A — Slice 12 test file alone:**
```
npx vitest run tests/goal5-slice-12-bridge-intake-service.test.ts
```
Expected: 49/49 pass (TC-G5-S12-001 through TC-G5-S12-047, including TC-G5-S12-026a and TC-G5-S12-026b; TC-G5-S12-048 is a process gate). Fix any failures before proceeding.

**Step B — Slice 10 + Slice 11 + Slice 12 together:**
```
npx vitest run tests/goal5-slice-10-bridge-review-queue-service.test.ts tests/goal5-slice-10-bridge-audit-ledger-repo.test.ts tests/goal5-slice-11-policy-check-service.test.ts tests/goal5-slice-12-bridge-intake-service.test.ts
```
Expected: all pass. Fix any regressions before proceeding.

**Step C — Full test suite:**
```
npx vitest run
```
Expected: all 200+ tests pass, zero regressions. Fix any failures before proceeding.

**Step D — TypeScript check:**
```
npm run typecheck
```
Expected: only the 7 known pre-existing errors (see §17). Zero new errors. Fix any new errors before proceeding.

**Step E — Working tree verification:**
```
git status --short
git diff --stat
git diff --name-only
```
Expected:
```
?? modules/verian-agent-bridge/intake/bridge-intake.service.ts
?? tests/goal5-slice-12-bridge-intake-service.test.ts
?? docs/roadmap/goal-5-slice-12-bridge-intake-orchestration-design.md
?? docs/roadmap/goal-5-slice-12-bridge-intake-orchestration-implementation-plan.md
?? docs/roadmap/operational-twin-north-star.md
```
No tracked files modified. `git diff --stat` and `git diff --name-only` produce no output.

---

## 17. Known TypeScript Posture

`npm run typecheck` is expected to report exactly 7 pre-existing errors across 2 files. These are known, pre-Goal-5 errors that must not be fixed in this slice.

| File | Error type | Count |
|------|-----------|-------|
| `tests/phase3h-send-safety-hardening.test.ts` | TS1501 (regex flag) | 3 |
| `tests/quality-review-agent.test.ts` | TS1117 (duplicate property) | 4 |

Any error count above 7, or any error in a file not listed above, is a new error introduced by Slice 12 implementation and must be resolved before committing.

---

## 18. Stop Conditions

The following return a `blocked` result without any DB writes:

- `buildVerianBridgeDryRunPacket()` returns `status: 'blocked'`
- `ctx.actorType === 'michael'` and `ctx.actorUserId` is absent
- `dryRunResult.taskPacket` is absent after `status === 'packet_created'`

The following propagate an exception to the caller:

- `submitPacketToQueue()` throws (DB write failed)
- `submitForPolicyReview()` throws after `submitPacketToQueue()` succeeded (partial success — queue item is in `draft_packet`, recoverable)

The following MUST NEVER occur:

- `executionAuthorized: true` on any return value
- A queue item reaching `approved_for_manual_handoff` as a result of this service
- A direct repo call bypassing the service layer
- A direct `appendAuditEvent` call
- A new migration file created
- An existing service, repo, type, or migration file modified

---

## 19. Codex Review Checklist

Before Slice 12 implementation is locked, Codex review must verify:

- [ ] `bridge-intake.service.ts` exports exactly: `submitBridgeRequest`, `BridgeIntakeContext`, `BridgeIntakeResult`
- [ ] `BridgeIntakeContext.actorType` is `'michael' | 'system'` only — no `'agent'`, no `'codex'`
- [ ] `BridgeIntakeBlockedResult` has no `queueItem` field
- [ ] `BridgeIntakeSubmittedResult` has `readonly dryRunOnly: true` literal
- [ ] Blocked guard for `dryRunResult.status === 'blocked'` appears before `submitPacketToQueue` in source
- [ ] `actorType === 'michael'` + missing `actorUserId` guard appears before `submitPacketToQueue` in source
- [ ] Defensive `!taskPacket` guard appears before `submitPacketToQueue` in source
- [ ] `submitPacketToQueue` called with `initialState: 'draft_packet'` — never `'pending_policy_review'`
- [ ] `submitForPolicyReview` called after `submitPacketToQueue` in source
- [ ] No `catch` block wrapping `submitPacketToQueue` or `submitForPolicyReview` calls
- [ ] No `appendAuditEvent` call in `bridge-intake.service.ts`
- [ ] No direct repo imports in `bridge-intake.service.ts`
- [ ] No `executionAuthorized: true` in `bridge-intake.service.ts`
- [ ] No `ReviewerAuthorizationError` throw in `bridge-intake.service.ts`
- [ ] No model provider imports (`openai`, `anthropic`, `qwen`, `codex-cli`)
- [ ] No `EMAIL_SENDING_ENABLED`, `CAMPAIGN_SENDING_ENABLED`, `fetch(`, `process.env`, `Inngest`, `cron`, `webhook`
- [ ] No new migration file exists
- [ ] No existing service/repo/type/migration file modified
- [ ] 49/49 automated source-reading tests pass (TC-G5-S12-001–047 including 026a/026b; TC-G5-S12-048 is a process gate)
- [ ] Full suite 200+ tests pass, zero regressions
- [ ] `npm run typecheck` shows only the 7 known pre-existing errors
- [ ] `docs/roadmap/operational-twin-north-star.md` remains untracked (process gate TC-G5-S12-048)

---

## 20. Implementation Gate

**Slice 12 implementation is BLOCKED until Michael approves this implementation plan.**

No implementation files (`bridge-intake.service.ts`, `goal5-slice-12-bridge-intake-service.test.ts`) may be created until that approval is received.

After implementation approval, implement per the sequence in §6. After implementation:
1. All commands in §16 must pass
2. Working tree must match the expected state in §16 Step E
3. Await commit authorization before staging or committing any file

---

*End of Goal 5 Slice 12 Implementation Plan*
