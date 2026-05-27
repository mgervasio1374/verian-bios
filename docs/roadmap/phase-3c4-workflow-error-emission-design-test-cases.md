# Phase 3C.4 — Workflow & Outbox Error Emission
## Design & Test Cases v1.0

**Date:** 2026-05-26
**Status:** DRAFT — awaiting user approval before any implementation plan or code is written
**Author:** Claude (AI context recovery from Phase 3C.3 lock)
**Design doc version:** v1.0

---

## 1. Objective

Emit structured errors (rows in `automation_failures`) when workflow runs permanently fail and when outbox events exhaust all dispatch attempts, so these failures become visible in the System Intelligence Critical & Open Errors table and can be triaged with the existing Resolve / Investigate / Ignore actions.

---

## 2. Problem Being Solved

### Current gap

The System Intelligence page shows two parallel failure surfaces:

| Surface | Table | Triageable? |
|---------|-------|-------------|
| Critical & Open Errors | `automation_failures` | Yes — Resolve / Investigate / Ignore |
| Workflow Health card | `workflow_runs` + `event_dispatch_queue` | No — read-only aggregate counts |

**Failed workflow runs** (`workflow_runs.status = 'failed'`) are visible only in the Workflow Health card's "Failed Workflows" count and the `/settings/health` page. They do not appear in `automation_failures` and cannot be triaged.

**Permanently failed outbox events** (`event_dispatch_queue.status = 'failed'`, after 5 dispatch attempts) are visible only as the "Pending Outbox" failed count on the health page. They do not appear in `automation_failures` and cannot be triaged.

### Impact of the gap

- An operator sees `failedCount: 3` in the Workflow Health card but cannot Resolve or Investigate those failures from the System Intelligence page.
- The recommendation generator's `SYSTEM_ERROR_DIAGNOSIS` check reads `automation_failures` (via `getOpenErrorsSummary`) — it does not fire for workflow failures because they're not in that table.
- The `SYSTEM_WORKFLOW_RECOMMENDATION` rec fires, but it's advisory about the aggregate count, not about the specific failures.

### What Phase 3C.4 adds

When a workflow run is permanently failed or an outbox event permanently fails (after exhausting all retries), emit a structured error row into `automation_failures`. From that point on:
- The failure appears in the Critical & Open Errors table.
- The existing lifecycle actions (Resolve / Investigate / Ignore) apply.
- The recommendation generator's `SYSTEM_ERROR_DIAGNOSIS` threshold may trigger.
- No new UI, no new routes, no new migrations required.

---

## 3. System Boundary

**Two emission points only:**

| Emission point | File | Trigger |
|----------------|------|---------|
| Workflow run failure | `modules/workflow/services/workflow-run.service.ts` — `failWorkflowRun()` | Called when a workflow run transitions to `failed` status |
| Outbox event final failure | `modules/workflow/services/event-dispatch.service.ts` — `dispatchPendingEvents()` | Called after an outbox event exhausts 5 dispatch attempts (`attempts >= 5`) |

Both emissions are **non-fatal**: the calling flow must never be blocked by a failure to emit a structured error.

---

## 4. What Is Explicitly Out of Scope

| Item | Reason |
|------|--------|
| Job execution failures (`job_executions.status = 'failed'`) | Different domain; deferred to future phase |
| Email send failures | Already tracked in `email_sends.status`; not in scope |
| Auto-resolve structured errors when a workflow run is retried/completed | Future work — lifecycle coupling is complex |
| Scheduled back-fill of existing `workflow_runs.status = 'failed'` rows | Only new failures get errors; historical back-fill is deferred |
| Structured errors for intermediate outbox retry attempts (attempts 1–4) | Only final failure (attempt 5) emits; earlier retries are normal operation |
| Modifying Phase 3B messaging agents | Not in scope |
| New routes, new DB tables, new migrations | Not required |
| Email sending, Resend calls | Never in scope |
| External LLM calls | Never in scope |

---

## 5. Relationship to Prior Phases

### Phase 3C.1 — Structured Errors + System Intelligence Foundation

Phase 3C.1 created the `automation_failures` table and added lifecycle columns (`severity`, `status`, `workspace_id`, `correlation_id`, `module`, `payload_snapshot`). It also created the `createStructuredError()` repo function and `createError()` service function — the exact entry point Phase 3C.4 will call.

Critically, Phase 3C.1 added `workflow_run_id` and `job_execution_id` FK columns to `automation_failures`. Workflow run failures will populate `workflow_run_id`, completing the join that was designed for but never triggered.

### Phase 3C.2 — Structured Error Lifecycle Actions

Phase 3C.2 added Resolve / Investigate / Ignore / Dismiss actions. These actions work on all `automation_failures` rows regardless of source — no changes needed for Phase 3C.4 workflow errors.

### Phase 3C.3 — System Intelligence Recommendation Generator

Phase 3C.3 added the `SYSTEM_ERROR_DIAGNOSIS` rec type, triggered when `criticalErrors >= 1 OR errorCountBySeverity['error'] >= 3`. After Phase 3C.4, workflow failures in `automation_failures` will contribute to this count. This is the intended cross-phase behavior — no code changes needed in Phase 3C.3.

---

## 6. Proposed Architecture

```
failWorkflowRun(ctx, runId, errorMessage)
  │
  ├─ approvalRepo.updateWorkflowRunStatus(runId, 'failed', { errorMessage })   ← existing
  │
  └─ createStructuredError({ ... failureType: 'WORKFLOW_RUN_FAILED', ... })    ← Phase 3C.4 (non-fatal)


dispatchPendingEvents()
  │
  └─ for each event in getPendingDispatchEvents():
       ├─ inngest.send(...)                      ← existing
       ├─ on success: markEventDispatched(id)    ← existing
       └─ on failure:
            ├─ markEventDispatchFailed(id, msg)  ← existing (increments attempts; sets status='failed' at attempts=5)
            └─ if event.attempts + 1 >= 5:       ← Phase 3C.4 guard
                 createStructuredError({ ... failureType: 'OUTBOX_EVENT_DISPATCH_FAILED', ... })
                   .catch(() => {})              ← non-fatal
```

**Key design constraint — outbox idempotency:**

`markEventDispatchFailed` increments `attempts` on each call and only sets `status = 'failed'` when `newAttempts >= 5`. Events with `attempts < 5` remain `pending` and are retried by the next `dispatchPendingEvents` run. Emitting on every failure attempt would create up to 5 duplicate structured errors per event.

**Solution:** check `event.attempts + 1 >= 5` in the service before emitting. The `event.attempts` value is known from the `EventQueueRow` returned by `getPendingDispatchEvents()`. If `event.attempts + 1 >= 5`, this is the final attempt; emit the structured error after `markEventDispatchFailed` returns.

---

## 7. Failure Types and Severity Model

Two new string constants added to `modules/intelligence/structured-errors/structured-error.types.ts`:

```typescript
export const WORKFLOW_FAILURE_TYPE = {
  WORKFLOW_RUN_FAILED:          'WORKFLOW_RUN_FAILED',
  OUTBOX_EVENT_DISPATCH_FAILED: 'OUTBOX_EVENT_DISPATCH_FAILED',
} as const
export type WorkflowFailureType = typeof WORKFLOW_FAILURE_TYPE[keyof typeof WORKFLOW_FAILURE_TYPE]
```

### Structured error shape per type

**`WORKFLOW_RUN_FAILED`**

| Field | Value |
|-------|-------|
| `failure_type` | `'WORKFLOW_RUN_FAILED'` |
| `severity` | `'error'` |
| `module` | `'workflow_runs'` |
| `workflow_run_id` | the failed run's UUID |
| `error_message` | `errorMessage` passed to `failWorkflowRun` |
| `status` | `'open'` |
| `tenant_id` | `ctx.tenantId` |
| `workspace_id` | `ctx.workspaceId ?? null` |

**`OUTBOX_EVENT_DISPATCH_FAILED`**

| Field | Value |
|-------|-------|
| `failure_type` | `'OUTBOX_EVENT_DISPATCH_FAILED'` |
| `severity` | `'error'` |
| `module` | `'event_dispatch_queue'` |
| `error_message` | the dispatch error message (`msg`) |
| `context` | `{ event_id: event.id, event_type: event.event_type, attempts: event.attempts + 1 }` |
| `status` | `'open'` |
| `tenant_id` | `event.tenant_id` |
| `workspace_id` | `event.workspace_id ?? null` |

Note: `automation_failures` has no `event_dispatch_queue_id` FK column. The event queue ID is stored in `context` jsonb. No migration is needed.

---

## 8. Data Model Impact

**No new migrations required.** All columns on `automation_failures` that Phase 3C.4 will populate were created in Phase 3C.1 (migration `20240028`):

| Column used | Source |
|-------------|--------|
| `tenant_id` | `ctx.tenantId` / `event.tenant_id` |
| `workspace_id` | `ctx.workspaceId` / `event.workspace_id` |
| `failure_type` | new constant string |
| `severity` | `'error'` |
| `module` | `'workflow_runs'` or `'event_dispatch_queue'` |
| `workflow_run_id` | run UUID (workflow failures only) |
| `error_message` | error string |
| `context` | jsonb (outbox failures: event_id, event_type, attempts) |
| `status` | defaults to `'open'` |
| `resolved` | defaults to `false` |

**Next available migration number:** `20240032` — reserved for a future phase.

---

## 9. Repository / Service / Module Impact

### Files modified (3)

| File | Change |
|------|--------|
| `modules/intelligence/structured-errors/structured-error.types.ts` | Add `WORKFLOW_FAILURE_TYPE` constant object and `WorkflowFailureType` type — additive only |
| `modules/workflow/services/workflow-run.service.ts` | Import `createStructuredError` + `WORKFLOW_FAILURE_TYPE`; add non-fatal emission after `updateWorkflowRunStatus` in `failWorkflowRun` |
| `modules/workflow/services/event-dispatch.service.ts` | Import `createStructuredError` + `WORKFLOW_FAILURE_TYPE`; add non-fatal emission in `dispatchPendingEvents` when `event.attempts + 1 >= 5` |

### Files unchanged

| File | Reason |
|------|--------|
| `structured-error.repo.ts` | `createStructuredError` already exists and is sufficient |
| `structured-error.service.ts` | `createError()` requires `RequestContext`; `dispatchPendingEvents` has no ctx — direct repo call is correct |
| `structured-error.actions.ts` | No changes needed; lifecycle actions work for all `automation_failures` rows |
| `automation-failure.repo.ts` | Existing function `createAutomationFailure` is not used by Phase 3C; `createStructuredError` from structured-error.repo is the correct path |
| `health.service.ts` / `health.repo.ts` | Workflow health reads are unaffected |
| `system-intelligence/page.tsx` | No UI changes; new structured errors appear in the Critical & Open Errors table automatically |
| `system-recommendation.service.ts` | No changes; `SYSTEM_ERROR_DIAGNOSIS` will fire more accurately once workflow errors appear in `automation_failures` |

### Note on Phase 3A boundary

`workflow-run.service.ts` and `event-dispatch.service.ts` were created as part of Phase 3A infrastructure. Phase 3C.4 modifies these files. This is within the approved scope of Phase 3C.4 — the changes are additive (new non-fatal emissions only) and do not alter the existing logic or return values of either function.

---

## 10. UI Impact

**No new UI required.** The Critical & Open Errors table on the System Intelligence page (`/settings/system-intelligence`) already renders all `automation_failures` rows where `severity IN ('critical', 'error')` and `status IN ('open', 'investigating')`. After Phase 3C.4, workflow failures appear in this table automatically.

The existing Resolve / Investigate / Ignore buttons already work for any `automation_failures` row — no changes needed.

The Workflow Health card (`/settings/health`) continues to show aggregate workflow run and outbox counts unchanged.

---

## 11. Agent / Runtime Impact

**No agent changes.** The recommendation generator (`runSystemRecommendationGenerator`) reads `getOpenErrorsSummary` which queries `automation_failures`. After Phase 3C.4, workflow failures appear in this summary. The `SYSTEM_ERROR_DIAGNOSIS` check may fire more readily — this is the correct cross-phase behavior.

`SYSTEM_WORKFLOW_RECOMMENDATION` will continue to fire independently via `getWorkflowHealth` — it is not replaced by this change.

---

## 12. Event / Logging / Observability Impact

**No new ActivityEventType constants.** The structured error row in `automation_failures` is itself the audit record. Adding an additional `activity_events` row for workflow failures would duplicate the signal.

**Non-fatal guarantee:** both emission call sites wrap in `.catch(() => {})`. A failure to write to `automation_failures` never blocks the workflow or outbox dispatch path.

---

## 13. Security / RLS Implications

`createStructuredError` uses the Supabase service client (`createSupabaseServiceClient()`), which bypasses RLS. This is consistent with all other structured error emissions in the codebase (import failures use the same path).

Tenant isolation is enforced by passing `ctx.tenantId` (workflow failures) or `event.tenant_id` (outbox failures) explicitly to every `createStructuredError` call.

No new RLS policies are needed; the existing `automation_failures` RLS from Phase 3C.1 applies.

---

## 14. Staging / Production Safety

| Concern | Mitigation |
|---------|-----------|
| No new migrations | Nothing to apply to staging or production Supabase |
| Non-fatal emission | Existing workflow and outbox paths are unchanged if emission fails |
| Phase 3A behavior preserved | `failWorkflowRun` and `dispatchPendingEvents` return values and side effects are unchanged |
| Staging auto-deploys from master | Every push will deploy to staging; production remains manual-only |
| `automation_failures` write is additive | No existing rows are modified |

---

## 15. Test Strategy

All 25 test cases use `fs.readFileSync` source-code assertions via the existing `readProjectFile` helper in `tests/phase3c-system-intelligence.test.ts`. No Supabase mocking is required.

Tests are appended to the existing Phase 3C test file, consistent with Phase 3C.1 / 3C.2 / 3C.3 precedent.

**Expected test baseline after Phase 3C.4:** 955/955 (930 existing + 25 new)

---

## 16. Specific Test Cases

### Block 1 — WORKFLOW_FAILURE_TYPE constants (2 tests)

```typescript
describe('Phase 3C.4 — WORKFLOW_FAILURE_TYPE constants', () => {
  const typesSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.types.ts'
  )

  it('WORKFLOW_FAILURE_TYPE is exported from structured-error.types.ts', () => {
    expect(typesSource).toContain('WORKFLOW_FAILURE_TYPE')
  })
  it('OUTBOX_EVENT_DISPATCH_FAILED constant is defined', () => {
    expect(typesSource).toContain('OUTBOX_EVENT_DISPATCH_FAILED')
  })
})
```

### Block 2 — workflow-run.service.ts: emission (5 tests)

```typescript
describe('Phase 3C.4 — workflow-run.service.ts: structured error emission', () => {
  const serviceSource = readProjectFile(
    'modules/workflow/services/workflow-run.service.ts'
  )

  it('service imports createStructuredError', () => {
    expect(serviceSource).toContain('createStructuredError')
  })
  it('service imports WORKFLOW_FAILURE_TYPE', () => {
    expect(serviceSource).toContain('WORKFLOW_FAILURE_TYPE')
  })
  it('failWorkflowRun references WORKFLOW_RUN_FAILED', () => {
    expect(serviceSource).toContain('WORKFLOW_RUN_FAILED')
  })
  it('workflow-run emission is non-fatal (.catch(() => {}))', () => {
    expect(serviceSource).toContain('.catch(() => {})')
  })
  it('service does not import Resend or email frameworks', () => {
    expect(serviceSource).not.toContain('resend')
    expect(serviceSource).not.toContain('nodemailer')
  })
})
```

### Block 3 — event-dispatch.service.ts: emission (5 tests)

```typescript
describe('Phase 3C.4 — event-dispatch.service.ts: structured error emission', () => {
  const serviceSource = readProjectFile(
    'modules/workflow/services/event-dispatch.service.ts'
  )

  it('service imports createStructuredError', () => {
    expect(serviceSource).toContain('createStructuredError')
  })
  it('service imports WORKFLOW_FAILURE_TYPE', () => {
    expect(serviceSource).toContain('WORKFLOW_FAILURE_TYPE')
  })
  it('dispatchPendingEvents references OUTBOX_EVENT_DISPATCH_FAILED', () => {
    expect(serviceSource).toContain('OUTBOX_EVENT_DISPATCH_FAILED')
  })
  it('outbox emission is non-fatal (.catch(() => {}))', () => {
    expect(serviceSource).toContain('.catch(() => {})')
  })
  it('service does not write to email_drafts or email_sends', () => {
    expect(serviceSource).not.toContain("from('email_drafts')")
    expect(serviceSource).not.toContain("from('email_sends')")
  })
})
```

### Block 4 — structured-error.types.ts: additive only (3 tests)

```typescript
describe('Phase 3C.4 — structured-error.types.ts: additive only', () => {
  const typesSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.types.ts'
  )

  it('WORKFLOW_FAILURE_TYPE contains WORKFLOW_RUN_FAILED', () => {
    expect(typesSource).toContain('WORKFLOW_RUN_FAILED')
  })
  it('existing SE_SEVERITY constants are preserved', () => {
    expect(typesSource).toContain('SE_SEVERITY')
    expect(typesSource).toContain("CRITICAL: 'critical'")
  })
  it('existing SE_STATUS constants are preserved', () => {
    expect(typesSource).toContain('SE_STATUS')
    expect(typesSource).toContain("OPEN: 'open'")
  })
})
```

### Block 5 — Guardrail: no new migrations (2 tests)

```typescript
describe('Phase 3C.4 — Guardrail: no new migrations', () => {
  it('no Phase 3C.4 migration file exists', () => {
    const migrationsDir = path.join(process.cwd(), 'supabase/migrations')
    const files = fs.readdirSync(migrationsDir)
    const phase3c4Migrations = files.filter(f => f.includes('phase3c4'))
    expect(phase3c4Migrations).toHaveLength(0)
  })
  it('workflow-run.service.ts does not create new DB tables', () => {
    const serviceSource = readProjectFile(
      'modules/workflow/services/workflow-run.service.ts'
    )
    expect(serviceSource).not.toContain('CREATE TABLE')
  })
})
```

### Block 6 — Guardrail: tenant isolation (2 tests)

```typescript
describe('Phase 3C.4 — Guardrail: tenant isolation', () => {
  it('workflow-run.service.ts emission uses ctx.tenantId', () => {
    const serviceSource = readProjectFile(
      'modules/workflow/services/workflow-run.service.ts'
    )
    expect(serviceSource).toContain('ctx.tenantId')
  })
  it('event-dispatch.service.ts emission references tenant_id from event row', () => {
    const serviceSource = readProjectFile(
      'modules/workflow/services/event-dispatch.service.ts'
    )
    expect(serviceSource).toContain('tenant_id')
  })
})
```

### Block 7 — Guardrail: outbox final-attempt-only emission (2 tests)

```typescript
describe('Phase 3C.4 — Guardrail: outbox emits only on final attempt', () => {
  const serviceSource = readProjectFile(
    'modules/workflow/services/event-dispatch.service.ts'
  )

  it('dispatchPendingEvents guards emission with attempt count check', () => {
    // Must check attempts before emitting — prevents duplicate errors on retries
    expect(serviceSource).toContain('attempts')
  })
  it('dispatchPendingEvents calls markEventDispatchFailed (existing behavior preserved)', () => {
    expect(serviceSource).toContain('markEventDispatchFailed')
  })
})
```

### Block 8 — Guardrail: Phase 3C.2 and 3C.3 unchanged (3 tests)

```typescript
describe('Phase 3C.4 — Guardrail: Phase 3C.2/3C.3 unchanged', () => {
  it('structured-error.actions.ts still exports resolveErrorAction', () => {
    const actionsSource = readProjectFile(
      'modules/intelligence/structured-errors/structured-error.actions.ts'
    )
    expect(actionsSource).toContain('resolveErrorAction')
  })
  it('system-recommendation.service.ts still calls listPendingSystemRecs', () => {
    const recSource = readProjectFile(
      'modules/intelligence/system-recommendation/system-recommendation.service.ts'
    )
    expect(recSource).toContain('listPendingSystemRecs')
  })
  it('system-intelligence/page.tsx remains a server component (no use client)', () => {
    const pageSource = readProjectFile(
      'app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx'
    )
    expect(pageSource).not.toContain("'use client'")
  })
})
```

### Block 9 — Guardrail: no external LLMs or Resend in modified files (1 test)

```typescript
describe('Phase 3C.4 — Guardrail: no external services in modified files', () => {
  it('neither modified workflow service calls external LLMs or Resend', () => {
    const workflowRunSource   = readProjectFile('modules/workflow/services/workflow-run.service.ts')
    const eventDispatchSource = readProjectFile('modules/workflow/services/event-dispatch.service.ts')
    expect(workflowRunSource).not.toContain("'openai'")
    expect(workflowRunSource).not.toContain("'@anthropic-ai")
    expect(eventDispatchSource).not.toContain("'openai'")
    expect(eventDispatchSource).not.toContain("'@anthropic-ai")
  })
})
```

**Total: 25 test cases across 9 describe blocks.**

---

## 17. Risks and Open Questions

### Risk 1 — Phase 3A boundary modification

`workflow-run.service.ts` and `event-dispatch.service.ts` are Phase 3A infrastructure files. Phase 3C.4 modifies them. The changes are additive (non-fatal emissions only, no logic changes), but this crosses the Phase 3A boundary. The implementation plan must explicitly note this and the user must confirm it is in scope.

### Risk 2 — `failWorkflowRun` idempotency

If `failWorkflowRun` is called more than once for the same `runId` (e.g., due to a bug in the caller), multiple `automation_failures` rows will be created for the same `workflow_run_id`. There is no unique constraint on `(workflow_run_id, failure_type)` in `automation_failures`.

**Options:**
- A. Accept duplicates — the operator sees multiple entries and resolves them; low risk
- B. Add a pre-check: query `automation_failures` for an existing open error with this `workflow_run_id` before inserting; adds complexity and a DB round-trip
- C. Add a unique constraint via migration — requires a migration

**Recommendation:** Accept Option A for v1. `failWorkflowRun` is an internal service function with controlled callers; duplicate calls are unlikely. Document as a known limitation.

### Risk 3 — Outbox event idempotency across restarts

If the server restarts between `markEventDispatchFailed` and the `.catch(() => {})` emission, the structured error may not be written. On the next `dispatchPendingEvents` run, the event is already `failed` (status = 'failed') and will not be returned by `getPendingDispatchEvents` (which filters `status = 'pending'`). The structured error is permanently missed.

**Mitigation:** This is an acceptable gap for v1. The Workflow Health card still shows `outbox.failedCount`. An operator can reconcile manually.

### Open Question 1 — Should we add a `listMissingWorkflowErrors` reconciler?

A reconciler could scan `workflow_runs.status = 'failed'` and create `automation_failures` rows for any that don't already have one. This would back-fill existing failures and close the restart-gap risk above. Deferred to a future phase.

### Open Question 2 — Should auto-resolve fire when a workflow completes successfully after a prior failure?

If a failed workflow run is retried and completes, the old `automation_failures` row remains `open`. Auto-resolving it would be useful but requires coupling `completeWorkflowRun` to the structured error lifecycle. Deferred to a future phase.

### Open Question 3 — Severity escalation

Should repeated workflow failures within a time window escalate severity from `error` to `critical`? Deferred — the recommendation generator can handle this advisory in a future iteration.

---

## 18. Approval Checkpoint

This document must be approved before an implementation plan or any code is written.

**Decisions requiring explicit user approval:**

| Decision | Default / Proposal |
|----------|-------------------|
| Modify Phase 3A workflow service files (`workflow-run.service.ts`, `event-dispatch.service.ts`) | Proposed: yes — additive non-fatal emission only |
| Idempotency strategy for `failWorkflowRun` duplicates | Proposed: Option A — accept duplicates in v1 |
| Outbox idempotency gap on server restart | Proposed: accept gap in v1; reconciler is future work |
| Severity for both failure types | Proposed: `'error'` (not `'critical'`) — consistent with import failures |
| Structured error for outbox final attempt only (attempts >= 5) | Proposed: yes — do not emit on intermediate retries |
| Test count | 25 tests (Block 1–9 above) |
| Test baseline target | 955/955 (930 + 25) |

**After approval, follow this sequence:**
```
Implementation Plan → approval → Code → vitest run → next build → Commit → Tag → AI context update → Push
```
