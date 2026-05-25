# Phase 3C.2 — Structured Error Lifecycle + Error Emission
## Design & Test Cases v1.0

---

## 1. Objective

Phase 3C.1 delivered a read-only System Intelligence triage board with a structured error service and data model. The board displays open errors, workflow health, failed import batches, and pending system recommendations, but has no actions — errors cannot be resolved, marked for investigation, or dismissed from the UI, and the `createError()` service is never called by any module.

Phase 3C.2 closes both gaps:

1. **Lifecycle actions** — add server actions and UI buttons to transition error and recommendation states (resolve, investigate, ignore, dismiss).
2. **Error emission** — wire `createError()` into key failure callsites so the errors board is populated automatically by real system events rather than requiring manual insertion.

---

## 2. System Boundary

**In scope:**
- Error status transitions: `open → investigating`, `open/investigating → resolved`, `open/investigating → ignored`
- Recommendation dismissal: `pending/new → dismissed`
- Structured error emission from: import commit failures, Inngest `process-import-batch` failures
- Activity events for all lifecycle transitions
- UI action buttons on the System Intelligence page
- New repo function `updateErrorStatus()` (investigating, ignored)
- New server actions for all four operations

**Out of scope (explicit):**
- Error detail modal or full-text error body view (future)
- Error filtering, pagination, or search beyond existing top-20 list (future)
- Auto-resolution or auto-diagnosis of errors (future)
- Email/push alerting for critical errors (future)
- Emission from Inngest functions other than `process-import-batch` (future)
- Emission from workflow/outbox failures (future — Phase 3C.3 candidate)
- Recommendation creation from system scans (Phase 3C.3 candidate)

---

## 3. Problem Phase 3C.2 Solves

| Problem | Root cause | Phase 3C.2 fix |
|---------|-----------|----------------|
| Errors board never populates | `createError()` is never called from any module | Wire emission into import commit failures and Inngest batch failures |
| Errors cannot be triaged | No server actions or UI for status transitions | Add `updateErrorStatus`, server actions, and action buttons |
| Recommendations accumulate silently | No dismiss action exists | Add `dismissRecommendation` server action and UI button |
| Audit trail is absent | No activity events for error lifecycle | Emit `SE_ERROR_RESOLVED`, `SE_ERROR_INVESTIGATING`, `SE_ERROR_IGNORED`, `SE_REC_DISMISSED` |

---

## 4. What Phase 3C.2 Does Not Solve

- It does not make the system auto-diagnose root causes of errors.
- It does not paginate or filter the errors list — the 20-item limit from Phase 3C.1 remains.
- It does not emit errors for workflow engine failures (health.service.ts, outbox) — that is out of scope.
- It does not send alerts or notifications.
- It does not give errors a detail view — errors are still one-row table entries.
- It does not change the recommendation creation path — recommendations are still created by external agents, not this module.

---

## 5. Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  System Intelligence Page                                           │
│  /[workspaceSlug]/settings/system-intelligence                      │
│                                                                     │
│  Errors table: [Resolve] [Investigate] [Ignore] per row (new)       │
│  Recommendations table: [Dismiss] per row (new)                     │
└───────────────────────────────────────────────────────────────────┬─┘
                                                                    │ server actions
┌──────────────────────────────────────────────────────────────────▼─┐
│  modules/intelligence/structured-errors/                            │
│                                                                     │
│  structured-error.actions.ts (new)                                  │
│    resolveErrorAction(id)          → service.resolveError()         │
│    investigateErrorAction(id)      → service.investigateError()     │
│    ignoreErrorAction(id)           → service.ignoreError()          │
│    dismissRecommendationAction(id) → new repo fn                    │
│                                                                     │
│  structured-error.service.ts (extend)                               │
│    investigateError(ctx, id)       → repo.updateErrorStatus()       │
│    ignoreError(ctx, id)            → repo.updateErrorStatus()       │
│                                                                     │
│  structured-error.repo.ts (extend)                                  │
│    updateErrorStatus(id, tenantId, status)                          │
│    dismissRecommendation(id, tenantId)                              │
└───────────────────────────────────────────────────────────────────┬─┘
                                                                    │ emits activity events
┌──────────────────────────────────────────────────────────────────▼─┐
│  modules/intelligence/types.agent.ts (extend, additive only)        │
│    SE_ERROR_RESOLVED                                                │
│    SE_ERROR_INVESTIGATING                                           │
│    SE_ERROR_IGNORED                                                 │
│    SE_REC_DISMISSED                                                 │
└─────────────────────────────────────────────────────────────────────┘

Emission callsites (wire createError into existing code):

┌─────────────────────────────────────────────────────────────────────┐
│  modules/imports/import.service.ts                                  │
│    commitBatch() catch block → createError({                        │
│      failureType: 'IMPORT_COMMIT_FAILURE',                          │
│      severity: 'error', module: 'imports',                          │
│      payloadSnapshot: { batchId, rowCount, errorMessage }           │
│    })                                                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  inngest/functions/process-import-batch.ts                          │
│    Top-level catch → createError({                                  │
│      failureType: 'INNGEST_IMPORT_BATCH_FAILURE',                   │
│      severity: 'critical', module: 'imports',                       │
│      payloadSnapshot: { batchId, jobExecutionId, errorMessage }     │
│    })                                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Model Impact

**No new tables or migrations required.**

All changes use the existing `automation_failures` and `agent_recommendations` tables. The `status` column on `automation_failures` already supports `open`, `investigating`, `resolved`, `ignored`. The `status` column on `agent_recommendations` is `text NOT NULL DEFAULT 'pending'` with **no CHECK constraint** — any string value is valid at the DB level, including `'dismissed'`. This was confirmed by inspecting `supabase/migrations/20240004_intelligence.sql:253`.

**Validated facts:**
- `agent_recommendations.status` — `text NOT NULL DEFAULT 'pending'`. No CHECK constraint exists. `status = 'dismissed'` is valid today with no schema change.
- `automation_failures.resolved_at` — already exists, used by `resolveStructuredError()`.
- No new columns are required.
- No migration is needed for Phase 3C.2.

---

## 7. Repository / Service / Module Impact

### New file
- `modules/intelligence/structured-errors/structured-error.actions.ts` — four server actions

### Extended files
- `modules/intelligence/structured-errors/structured-error.repo.ts` — `updateErrorStatus()`, `dismissRecommendation()`
- `modules/intelligence/structured-errors/structured-error.service.ts` — `investigateError()`, `ignoreError()`
- `modules/intelligence/types.agent.ts` — four new `ActivityEventType` constants (additive only)
- `modules/imports/import.service.ts` — emit `createError()` in `commitBatch()` catch block (non-fatal)
- `inngest/functions/process-import-batch.ts` — emit `createError()` in top-level catch (non-fatal)

### Unchanged files (locked)
- `structured-error.types.ts` — `SE_STATUS` and `SE_SEVERITY` already cover all needed values
- All Phase 3B modules — no changes
- All Phase 3A modules — no changes
- Migration 028 and 029 — no changes

---

## 8. UI Impact

**Modified page:** `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx`

The page is currently a pure server component that renders read-only tables. Phase 3C.2 adds action buttons that call server actions. The pattern used throughout this codebase (HRB, imports approve/cancel) is: server action in a `<form>` with a submit button, or a client component button that calls the action.

**Recommended approach:** Use `<form action={serverAction}>` with a hidden `id` field for inline row-level buttons. This avoids adding a new client component file and keeps the page mostly server-rendered.

**Changes to the errors table:**
- Each error row gains three action buttons in a new rightmost column: `Resolve`, `Investigate`, `Ignore`
- Buttons are disabled for errors already in `resolved` or `ignored` status (they would not appear in the list, so this is a guard)
- After action, the page revalidates via `revalidatePath`

**Changes to the recommendations table:**
- Each recommendation row gains a `Dismiss` button in a new rightmost column
- After action, the page revalidates

**No new pages or routes are needed.**

---

## 9. Agent / Runtime Impact

**Inngest:** `process-import-batch.ts` gains a top-level `try/catch` that calls `createError()` on failure. The error emission is non-fatal — it wraps in `.catch(() => {})` so a failure to write the structured error never suppresses the original error or affects Inngest retry behavior.

**No new Inngest functions or schedules are introduced.**

---

## 10. Event / Logging / Observability Impact

Four new `ActivityEventType` constants added to `modules/intelligence/types.agent.ts`:

| Constant | Trigger |
|----------|---------|
| `SE_ERROR_RESOLVED` | User resolves an error from the UI |
| `SE_ERROR_INVESTIGATING` | User marks an error as investigating |
| `SE_ERROR_IGNORED` | User ignores an error |
| `SE_REC_DISMISSED` | User dismisses a system recommendation |

All four are emitted via `emitEvent()` wrapped in `.catch(() => {})` — they are non-fatal and must never block the primary action.

Emission context should include: `tenantId`, `workspaceId`, `userId` (from `ctx`), `errorId` or `recommendationId`, `previousStatus`, `newStatus`.

---

## 11. Security / RLS Implications

**No new RLS policies are needed.**

The action server functions use `createSupabaseServiceClient()` (same as the existing `resolveStructuredError()`), which bypasses RLS. The `tenantId` scoping is enforced at the application layer by passing `ctx.tenantId` to every repo call — the same pattern used throughout Phase 3C.1 and Phase 3B.

`requirePermission(ctx, 'crm.companies.view')` is the current gate on the System Intelligence page. For the action server functions:
- Error lifecycle actions are admin-level operations. Verify whether `crm.companies.view` is the right permission or whether a stricter gate (e.g. `platform_admin` role check) should be used.
- This is an open question — see Section 15.

---

## 12. Staging / Prod Safety Considerations

- No migrations → no migration apply sequence required.
- Staging remains deployable after the change — the System Intelligence page already exists on staging.
- Emission callsites (`import.service.ts`, `process-import-batch.ts`) wrap `createError()` in `.catch(() => {})` — if the error write fails, the import operation continues normally.
- No production impact — production infrastructure is untouched by this phase.
- The new action buttons will appear on staging after deployment; they call service-client writes only.

---

## 13. Test Strategy

All tests are in `tests/phase3c-system-intelligence.test.ts` (the Phase 3C.1 test file). Phase 3C.2 extends this file — no new test file is created.

Test categories:

1. **Type and constant shape tests** — new `ActivityEventType` constants exist and have correct string values
2. **Server action export tests** — `structured-error.actions.ts` exports the four expected functions
3. **Repo function tests** — `updateErrorStatus` and `dismissRecommendation` exist and have expected signatures
4. **Service function tests** — `investigateError` and `ignoreError` exist and delegate to repo
5. **Emission callsite tests** — file content assertions that `import.service.ts` and `process-import-batch.ts` contain `createError` calls
6. **Non-fatal emission assertion** — `createError` calls in both emission files are followed by `.catch`
7. **Guardrail tests** — emission callsites do not call Resend, do not call `sendApprovedDraftAction`, do not write to `message_strategies`

All tests are pure (file-read or interface-shape) — no real DB or network calls.

---

## 14. Specific Test Cases

### TC-3C2-001: SE_ERROR_RESOLVED constant exists
`types.agent.ts` exports `SE_ERROR_RESOLVED` as an `ActivityEventType`.

### TC-3C2-002: SE_ERROR_INVESTIGATING constant exists
`types.agent.ts` exports `SE_ERROR_INVESTIGATING` as an `ActivityEventType`.

### TC-3C2-003: SE_ERROR_IGNORED constant exists
`types.agent.ts` exports `SE_ERROR_IGNORED` as an `ActivityEventType`.

### TC-3C2-004: SE_REC_DISMISSED constant exists
`types.agent.ts` exports `SE_REC_DISMISSED` as an `ActivityEventType`.

### TC-3C2-005: structured-error.actions.ts exports resolveErrorAction
File `modules/intelligence/structured-errors/structured-error.actions.ts` contains `resolveErrorAction`.

### TC-3C2-006: structured-error.actions.ts exports investigateErrorAction
File contains `investigateErrorAction`.

### TC-3C2-007: structured-error.actions.ts exports ignoreErrorAction
File contains `ignoreErrorAction`.

### TC-3C2-008: structured-error.actions.ts exports dismissRecommendationAction
File contains `dismissRecommendationAction`.

### TC-3C2-009: structured-error.actions.ts uses 'use server' directive
File starts with or contains `'use server'`.

### TC-3C2-010: structured-error.repo.ts exports updateErrorStatus
File `modules/intelligence/structured-errors/structured-error.repo.ts` contains `updateErrorStatus`.

### TC-3C2-011: structured-error.repo.ts exports dismissRecommendation
File contains `dismissRecommendation`.

### TC-3C2-012: structured-error.service.ts exports investigateError
File `modules/intelligence/structured-errors/structured-error.service.ts` contains `investigateError`.

### TC-3C2-013: structured-error.service.ts exports ignoreError
File contains `ignoreError`.

### TC-3C2-014: import.service.ts emits createError on commit failure
File `modules/imports/import.service.ts` contains a `createError` call in the context of commit failure handling.

### TC-3C2-015: import.service.ts createError call is non-fatal
The `createError` call in `import.service.ts` is wrapped in `.catch`.

### TC-3C2-016: process-import-batch.ts emits createError on Inngest failure
File `inngest/functions/process-import-batch.ts` contains a `createError` call.

### TC-3C2-017: process-import-batch.ts createError call is non-fatal
The `createError` call in `process-import-batch.ts` is wrapped in `.catch`.

### TC-3C2-018: Emission does not call Resend in import.service.ts
The error emission block in `import.service.ts` does not contain a Resend import or call.

### TC-3C2-019: Emission does not call sendApprovedDraftAction in import.service.ts
`import.service.ts` does not import or call `sendApprovedDraftAction`.

### TC-3C2-020: process-import-batch.ts does not call Resend
`process-import-batch.ts` does not contain a Resend import.

### TC-3C2-021: updateErrorStatus rejects unknown status values (type safety)
`updateErrorStatus` signature accepts only `SeStatus` type (enforced at TypeScript level — verified by checking the function signature, not by a runtime test).

### TC-3C2-022: Activity event constants are all unique strings
The four new `SE_*` and `SE_REC_*` constants have distinct string values and do not duplicate existing constants.

### TC-3C2-023: System Intelligence page contains Resolve button text
`app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` contains a form or button referencing `resolveErrorAction` or "Resolve".

### TC-3C2-024: System Intelligence page contains Dismiss button text
Page contains a form or button referencing `dismissRecommendationAction` or "Dismiss".

---

## 15. Risks and Open Questions

| # | Item | Risk level | Status |
|---|------|-----------|--------|
| 1 | `agent_recommendations.status` allowed values — does the DB allow `dismissed`? | ~~Medium~~ | **Resolved — no migration required.** `status` is `text NOT NULL DEFAULT 'pending'` with no CHECK constraint (`supabase/migrations/20240004_intelligence.sql:253`). `'dismissed'` is valid at the DB level today. |
| 2 | Permission gate for lifecycle actions — is `crm.companies.view` the right level? | Low | Open — decide whether error resolution requires a stricter permission (e.g. platform_admin only) or whether the existing gate is acceptable. |
| 3 | `import.service.ts` — confirm `ctx` with `tenantId`/`workspaceId` is in scope inside `commitBatch()` | Low | Open — read `commitBatch()` signature before implementing emission. |
| 4 | `process-import-batch.ts` — confirm event data shape provides `tenantId` and `batchId` | Low | Open — read the function before implementing emission. |
| 5 | Revalidation strategy for action buttons — confirm `revalidatePath` works for this route | Low | Open — reference the import batch pages, which use the same pattern. |
| 6 | Test count delta — 24 new test cases proposed; final total should be 879+24 = 903 | Info | Open — verify by running `npx vitest run` immediately after implementation. |

---

## 16. Approval Checkpoint

This document defines Phase 3C.2 scope. Before any code is written:

**The following must be approved:**

- [ ] Scope is correct: error lifecycle actions (resolve, investigate, ignore) + recommendation dismissal + emission in import.service.ts + emission in process-import-batch.ts
- [ ] No migration is needed (or if `dismissed` is missing from recommendations status CHECK, a minimal migration is added and approved)
- [ ] Permission gate decision: `crm.companies.view` is acceptable for lifecycle actions (or stricter gate chosen)
- [ ] 24 test cases listed above are the correct coverage target
- [ ] An Implementation Plan will be produced and approved before any code is written

**DO NOT BEGIN IMPLEMENTATION UNTIL THIS DOCUMENT IS APPROVED.**
