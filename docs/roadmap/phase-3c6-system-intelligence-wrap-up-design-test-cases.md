# Phase 3C.6 — System Intelligence Wrap-Up
## Design & Test Cases v1.0

**Date:** 2026-05-26
**Status:** DRAFT — awaiting approval
**Predecessor:** Phase 3C.5 — System Intelligence Detail Views (`bce57a2`, tag `phase-3c5-system-intelligence-detail-views-v1`)

---

## 1. Motivation

Two specific gaps remain visible in the current Phase 3C surface after Phase 3C.5:

### Gap A — `resolved_by` is never populated

The error detail page (Phase 3C.5) renders a Resolution card that shows:

```
Resolved at    May 26, 02:30
Resolved by    —
```

`resolved_by` is always `—` because `resolveStructuredError` in the repo never writes it. `ctx.userId` is already available in `RequestContext` (populated by `buildRequestContext`) and flows through `resolveErrorAction` → `service.resolveError` → `repo.resolveStructuredError`. The only missing step is threading `ctx.userId` into the UPDATE statement. No migration is needed — the `resolved_by` column already exists in `automation_failures`.

### Gap B — `SYSTEM_PERFORMANCE_WARNING` is a dead recommendation type

The System Intelligence list page filters `agent_recommendations` by `recommendation_type IN (SYSTEM_REC_TYPES)`, which includes `'SYSTEM_PERFORMANCE_WARNING'`. The recommendation generator (Phase 3C.3) does not produce this type — it produces only `SYSTEM_ERROR_DIAGNOSIS`, `SYSTEM_IMPORT_HEALTH`, and `SYSTEM_WORKFLOW_RECOMMENDATION`. As a result, a performance warning rec could only appear if created by an external process or future generator, but no current code creates one. The filter is harmless but the gap is worth closing.

`getWorkflowHealth` already returns `outbox.pendingCount`, and the generator already calls `getWorkflowHealth` in its parallel fetch. Adding a `checkPerformanceWarning` check is therefore a one-function addition to `system-recommendation.service.ts` with no new data fetching.

---

## 2. Scope

**4 files modified. No files created. No new migrations.**

| File | Change |
|------|--------|
| `modules/intelligence/structured-errors/structured-error.repo.ts` | Add `resolvedBy` param to `resolveStructuredError` |
| `modules/intelligence/structured-errors/structured-error.service.ts` | Pass `ctx.userId` as `resolvedBy` to repo |
| `modules/intelligence/system-recommendation/system-recommendation.types.ts` | Add `OUTBOX_QUEUE_DEPTH_MIN: 10` to `REC_THRESHOLD` |
| `modules/intelligence/system-recommendation/system-recommendation.service.ts` | Add `checkPerformanceWarning`; wire into checks array |
| `tests/phase3c-system-intelligence.test.ts` | Append 12 tests |

---

## 3. Part A — `resolved_by` Attribution

### 3.1 Problem statement

`resolveStructuredError` performs this UPDATE:

```typescript
.update({
  status:      SE_STATUS.RESOLVED,
  resolved:    true,
  resolved_at: new Date().toISOString(),
  // resolved_by: ← never written
})
```

The `resolved_by` column exists in `automation_failures` (added in Phase 3C.1 migration `20240028`). The resolver's user ID is already available as `ctx.userId` at the action layer. It is not currently threaded to the repo layer.

### 3.2 Solution

**Step A1 — `structured-error.repo.ts`:** Add an optional `resolvedBy` parameter to `resolveStructuredError` and include it in the UPDATE.

Current signature:
```typescript
export async function resolveStructuredError(
  id:       string,
  tenantId: string,
): Promise<void>
```

New signature:
```typescript
export async function resolveStructuredError(
  id:         string,
  tenantId:   string,
  resolvedBy?: string | null,
): Promise<void>
```

New update body:
```typescript
.update({
  status:      SE_STATUS.RESOLVED,
  resolved:    true,
  resolved_at: new Date().toISOString(),
  resolved_by: resolvedBy ?? null,
})
```

**Step A2 — `structured-error.service.ts`:** Pass `ctx.userId` to `resolveStructuredError`.

Current:
```typescript
export async function resolveError(
  ctx: RequestContext,
  id:  string,
): Promise<void> {
  return repo.resolveStructuredError(id, ctx.tenantId)
}
```

New:
```typescript
export async function resolveError(
  ctx: RequestContext,
  id:  string,
): Promise<void> {
  return repo.resolveStructuredError(id, ctx.tenantId, ctx.userId)
}
```

No changes to `structured-error.actions.ts` — the action already passes `ctx` to the service; `ctx.userId` flows automatically.

### 3.3 Scope limits

- Only `resolveError` is updated. `ignoreError` and `investigateError` are NOT changed — the `resolved_by` column is semantically scoped to resolution.
- No new columns, no migration. The `resolved_by` column already exists.
- The `ignoreErrorAction` / `investigateErrorAction` path is unaffected.

### 3.4 Accepted behavior

- If `ctx.userId` is the literal string `'system'` (from `buildSystemContext`), `resolved_by` will be written as `'system'`. This is correct and auditable.
- No back-fill of existing resolved rows. Pre-Phase-3C.6 resolved errors will continue to show `—` in the detail page. This is acceptable — the fix is forward-looking.

---

## 4. Part B — SYSTEM_PERFORMANCE_WARNING Recommendation

### 4.1 Problem statement

`SYSTEM_PERFORMANCE_WARNING` is listed in `SYSTEM_REC_TYPES` on the System Intelligence list page but no code in `system-recommendation.service.ts` generates a rec of this type. The `getWorkflowHealth` call already returns `outbox.pendingCount` and is in scope inside the generator orchestrator. The threshold and rec body just need to be added.

### 4.2 Threshold decision

`OUTBOX_QUEUE_DEPTH_MIN: 10` — a pending outbox count ≥ 10 is unusual enough to warrant an advisory recommendation. In a healthy system the outbox queue is near zero between dispatch cycles. 10 is a conservative default that avoids false positives from brief transient spikes while catching genuine backlog growth.

### 4.3 Solution

**Step B1 — `system-recommendation.types.ts`:** Add `OUTBOX_QUEUE_DEPTH_MIN` to `REC_THRESHOLD`.

Current:
```typescript
export const REC_THRESHOLD = {
  ERROR_COUNT_MIN: 3,
} as const
```

New:
```typescript
export const REC_THRESHOLD = {
  ERROR_COUNT_MIN:      3,
  OUTBOX_QUEUE_DEPTH_MIN: 10,
} as const
```

**Step B2 — `system-recommendation.service.ts`:** Add `checkPerformanceWarning` pure function and wire it into the checks array.

New pure function (insert after `checkWorkflowRecommendation`):
```typescript
function checkPerformanceWarning(pendingOutboxCount: number): RecCheckResult | null {
  if (pendingOutboxCount < REC_THRESHOLD.OUTBOX_QUEUE_DEPTH_MIN) return null
  return {
    recommendationType: 'SYSTEM_PERFORMANCE_WARNING',
    title:   `${pendingOutboxCount} outbox events pending dispatch`,
    body:    `${pendingOutboxCount} outbox events are currently pending. If this count is growing, ` +
             `check the Workflow Health page for stuck workflows or repeated dispatch failures.`,
    severity: 'warning',
    priority: 'medium',
  }
}
```

Wire into the checks array in `runSystemRecommendationGenerator` (healthReport is already in scope):

Current:
```typescript
const checks: (RecCheckResult | null)[] = [
  checkErrorDiagnosis(errorsSummary),
  checkImportHealth(failedBatchCount),
  checkWorkflowRecommendation(healthReport),
]
```

New:
```typescript
const checks: (RecCheckResult | null)[] = [
  checkErrorDiagnosis(errorsSummary),
  checkImportHealth(failedBatchCount),
  checkWorkflowRecommendation(healthReport),
  checkPerformanceWarning(healthReport.outbox.pendingCount),
]
```

No changes to `system-recommendation.actions.ts` or any UI file. The list page already filters for `SYSTEM_PERFORMANCE_WARNING` in `SYSTEM_REC_TYPES`.

### 4.4 Deduplication

The existing deduplication logic in `runSystemRecommendationGenerator` already prevents creating a duplicate if a `SYSTEM_PERFORMANCE_WARNING` rec is already pending. No additional dedup logic needed.

### 4.5 Advisory-only confirmation

The recommendation is advisory. It writes to `agent_recommendations` (existing table). No auto-action, no Resend, no external LLM call.

---

## 5. No-Migration Confirmation

| Column / Table | Status |
|----------------|--------|
| `automation_failures.resolved_by` | Already exists (Phase 3C.1 migration `20240028`) |
| `agent_recommendations` | Already exists (Phase 3C.1) |
| `event_dispatch_queue` | Not directly read — `outbox.pendingCount` comes from `getWorkflowHealth`, which is already called |

Next available migration number: `20240032`. Not used in Phase 3C.6.

---

## 6. Guardrails Preserved

| Guardrail | Status |
|-----------|--------|
| No production modifications | Preserved |
| No migrations | Preserved |
| No Resend / email | Preserved |
| No external LLM calls | Preserved |
| Advisory-only recommendations | Preserved — `SYSTEM_PERFORMANCE_WARNING` writes to `agent_recommendations` only |
| Tenant isolation | Preserved — `resolveStructuredError` already enforces `.eq('tenant_id', tenantId)` |
| Existing lifecycle actions preserved | Preserved — only `resolveStructuredError` gains a new parameter; ignore/investigate unchanged |
| `dismissRecommendationAction` unchanged | Preserved |
| Production Vercel manual-only | Preserved — no Vercel changes |
| Staging deployable | Preserved |

---

## 7. Test Cases

**12 tests across 4 describe blocks. Target baseline after implementation: 987/987.**

---

### Block 1 — `resolved_by` repo function (3 tests)

```
Phase 3C.6 — resolveStructuredError: resolved_by attribution
```

| # | Test | Assertion |
|---|------|-----------|
| 1 | `resolveStructuredError` accepts a `resolvedBy` parameter | `repoSource` contains `resolvedBy` |
| 2 | `resolveStructuredError` writes `resolved_by` in the update | `repoSource` contains `resolved_by` |
| 3 | `resolveStructuredError` still enforces tenant isolation | `repoSource` contains `.eq('tenant_id', tenantId)` near the resolve function |

---

### Block 2 — `resolveError` service threads `userId` (2 tests)

```
Phase 3C.6 — resolveError service: userId threading
```

| # | Test | Assertion |
|---|------|-----------|
| 4 | `structured-error.service.ts` passes `ctx.userId` to the repo | `serviceSource` contains `ctx.userId` |
| 5 | `structured-error.service.ts` `resolveError` function still calls `resolveStructuredError` | `serviceSource` contains `resolveStructuredError` |

---

### Block 3 — Performance warning threshold (3 tests)

```
Phase 3C.6 — SYSTEM_PERFORMANCE_WARNING: threshold constant
```

| # | Test | Assertion |
|---|------|-----------|
| 6 | `OUTBOX_QUEUE_DEPTH_MIN` is exported from `system-recommendation.types.ts` | `typesSource` contains `OUTBOX_QUEUE_DEPTH_MIN` |
| 7 | `OUTBOX_QUEUE_DEPTH_MIN` value is 10 | `typesSource` contains `10` adjacent to `OUTBOX_QUEUE_DEPTH_MIN` |
| 8 | `REC_THRESHOLD` still contains `ERROR_COUNT_MIN` (no regression) | `typesSource` contains `ERROR_COUNT_MIN` |

---

### Block 4 — Performance warning recommendation generator (4 tests)

```
Phase 3C.6 — SYSTEM_PERFORMANCE_WARNING: recommendation generator
```

| # | Test | Assertion |
|---|------|-----------|
| 9  | `system-recommendation.service.ts` contains `checkPerformanceWarning` | `serviceSource` contains `checkPerformanceWarning` |
| 10 | `checkPerformanceWarning` uses `OUTBOX_QUEUE_DEPTH_MIN` threshold | `serviceSource` contains `OUTBOX_QUEUE_DEPTH_MIN` |
| 11 | Generator wires in `checkPerformanceWarning` | `serviceSource` contains `checkPerformanceWarning(healthReport.outbox.pendingCount)` |
| 12 | `checkPerformanceWarning` outputs `SYSTEM_PERFORMANCE_WARNING` rec type | `serviceSource` contains `'SYSTEM_PERFORMANCE_WARNING'` in the performance check function |

---

## 8. Proposed Defaults

| Decision | Default |
|----------|---------|
| `resolvedBy` parameter type | `string \| null` — optional, defaults to `null` if omitted |
| `OUTBOX_QUEUE_DEPTH_MIN` | `10` |
| `SYSTEM_PERFORMANCE_WARNING` severity | `'warning'` |
| `SYSTEM_PERFORMANCE_WARNING` priority | `'medium'` |
| Test count | 12 tests |
| Target test baseline | 987/987 |
| `ignoreError` / `investigateError` `resolved_by` | Not set — `resolved_by` is semantically scoped to resolution only |

---

## 9. What Is Explicitly Out of Scope

| Item | Reason excluded |
|------|----------------|
| Back-fill of existing `resolved_by = null` rows | Forward-looking fix only; back-fill requires a migration |
| `ignored_by` / `investigated_by` fields | Not in current schema; future work if needed |
| `SYSTEM_DOCUMENTATION_NEEDED` recommendation type | No clear automated signal to trigger it; deferred |
| Pagination on the Critical & Open Errors list | Cap is 50 rows (`listOpenErrors` limit); acceptable for v1 |
| Workflow failure reconciler | Larger scope; separate future phase |
| Auto-resolve on workflow retry | Larger scope; requires cross-module event coupling |

---

## 10. Post-Implementation Checklist

```
npx vitest run
```
Expected: **987/987 passed** (975 existing + 12 new)

```
npx next build
```
Expected: clean compile, TypeScript clean, 34 routes (no new routes added)

```
git status
```
Expected: 4 modified files only:
- `modules/intelligence/structured-errors/structured-error.repo.ts`
- `modules/intelligence/structured-errors/structured-error.service.ts`
- `modules/intelligence/system-recommendation/system-recommendation.types.ts`
- `modules/intelligence/system-recommendation/system-recommendation.service.ts`
- `tests/phase3c-system-intelligence.test.ts`

No migrations. No new routes. No Vercel changes.
