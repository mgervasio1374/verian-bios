# Phase 3C.6 — System Intelligence Wrap-Up
## Implementation Plan v1.0

**Date:** 2026-05-26
**Status:** APPROVED — ready for implementation
**Design doc:** `docs/roadmap/phase-3c6-system-intelligence-wrap-up-design-test-cases.md`
**Approved decisions:**
- Part A: add `resolvedBy` to `resolveStructuredError`; pass `ctx.userId` from service; only resolve writes it
- Part B: add `OUTBOX_QUEUE_DEPTH_MIN: 10`; add `checkPerformanceWarning`; wire into generator checks array
- Test count: 12 tests
- Target test baseline: 987/987

---

## Scope

**4 files to modify. No files to create. No new migrations.**

| File | Action |
|------|--------|
| `modules/intelligence/structured-errors/structured-error.repo.ts` | Add optional `resolvedBy` param to `resolveStructuredError`; include `resolved_by` in UPDATE |
| `modules/intelligence/structured-errors/structured-error.service.ts` | Pass `ctx.userId` as third arg to `repo.resolveStructuredError` |
| `modules/intelligence/system-recommendation/system-recommendation.types.ts` | Add `OUTBOX_QUEUE_DEPTH_MIN: 10` to `REC_THRESHOLD` |
| `modules/intelligence/system-recommendation/system-recommendation.service.ts` | Add `checkPerformanceWarning`; add to checks array |
| `tests/phase3c-system-intelligence.test.ts` | Append 12 tests across 4 describe blocks |

---

## Step 1 — `structured-error.repo.ts`: add `resolvedBy` to `resolveStructuredError`

**File:** `modules/intelligence/structured-errors/structured-error.repo.ts`

Replace:
```typescript
export async function resolveStructuredError(
  id:       string,
  tenantId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('automation_failures')
    .update({
      status:      SE_STATUS.RESOLVED,
      resolved:    true,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`resolveStructuredError: ${error.message}`)
}
```

With:
```typescript
export async function resolveStructuredError(
  id:          string,
  tenantId:    string,
  resolvedBy?: string | null,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('automation_failures')
    .update({
      status:      SE_STATUS.RESOLVED,
      resolved:    true,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy ?? null,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`resolveStructuredError: ${error.message}`)
}
```

**Notes:**
- Parameter is optional (`resolvedBy?`). Existing callers that omit it continue to work — `resolved_by` will be `null`.
- No migration needed. `resolved_by` column already exists in `automation_failures` (Phase 3C.1, migration `20240028`).

---

## Step 2 — `structured-error.service.ts`: pass `ctx.userId`

**File:** `modules/intelligence/structured-errors/structured-error.service.ts`

Replace:
```typescript
export async function resolveError(
  ctx: RequestContext,
  id:  string,
): Promise<void> {
  return repo.resolveStructuredError(id, ctx.tenantId)
}
```

With:
```typescript
export async function resolveError(
  ctx: RequestContext,
  id:  string,
): Promise<void> {
  return repo.resolveStructuredError(id, ctx.tenantId, ctx.userId)
}
```

**Notes:**
- `ctx.userId` is always present in `RequestContext` (populated by `buildRequestContext` via `supabase.auth.getUser()`).
- When resolved via `resolveErrorAction` (a user-triggered action), `ctx.userId` is the authenticated user's UUID.
- When resolved via `buildSystemContext`, `ctx.userId` is `'system'` — also auditable and correct.
- No change to `structured-error.actions.ts` — the action already passes `ctx` to the service.
- `ignoreError` and `investigateError` are NOT changed — `resolved_by` is semantically scoped to resolution only.

---

## Step 3 — `system-recommendation.types.ts`: add `OUTBOX_QUEUE_DEPTH_MIN`

**File:** `modules/intelligence/system-recommendation/system-recommendation.types.ts`

Replace:
```typescript
export const REC_THRESHOLD = {
  ERROR_COUNT_MIN: 3,
} as const
```

With:
```typescript
export const REC_THRESHOLD = {
  ERROR_COUNT_MIN:        3,
  OUTBOX_QUEUE_DEPTH_MIN: 10,
} as const
```

---

## Step 4 — `system-recommendation.service.ts`: add `checkPerformanceWarning` and wire in

**File:** `modules/intelligence/system-recommendation/system-recommendation.service.ts`

### 4a — Add `checkPerformanceWarning` pure function

Replace:
```typescript
// ---- Orchestration ----
```

With:
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

// ---- Orchestration ----
```

### 4b — Wire into the checks array

Replace:
```typescript
    const checks: (RecCheckResult | null)[] = [
      checkErrorDiagnosis(errorsSummary),
      checkImportHealth(failedBatchCount),
      checkWorkflowRecommendation(healthReport),
    ]
```

With:
```typescript
    const checks: (RecCheckResult | null)[] = [
      checkErrorDiagnosis(errorsSummary),
      checkImportHealth(failedBatchCount),
      checkWorkflowRecommendation(healthReport),
      checkPerformanceWarning(healthReport.outbox.pendingCount),
    ]
```

**Notes:**
- `healthReport` is already in scope from the `Promise.all` at the top of the orchestrator.
- The existing deduplication loop already handles `SYSTEM_PERFORMANCE_WARNING` — no change needed there.
- Advisory only: writes to `agent_recommendations` only; no auto-action, no Resend, no external LLM.

---

## Step 5 — Append 12 tests to `tests/phase3c-system-intelligence.test.ts`

Append to the end of the file:

```typescript
// -------------------------------------------------------
// Phase 3C.6 — System Intelligence Wrap-Up
// -------------------------------------------------------

// Block 1 — resolveStructuredError: resolved_by attribution (3 tests)
describe('Phase 3C.6 — resolveStructuredError: resolved_by attribution', () => {
  const repoSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.repo.ts'
  )

  it('resolveStructuredError accepts a resolvedBy parameter', () => {
    expect(repoSource).toContain('resolvedBy')
  })
  it('resolveStructuredError writes resolved_by in the update', () => {
    expect(repoSource).toContain('resolved_by')
  })
  it('resolveStructuredError still enforces tenant isolation', () => {
    expect(repoSource).toContain(".eq('tenant_id', tenantId)")
  })
})

// Block 2 — resolveError service: userId threading (2 tests)
describe('Phase 3C.6 — resolveError service: userId threading', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.service.ts'
  )

  it('resolveError service passes ctx.userId to the repo', () => {
    expect(serviceSource).toContain('ctx.userId')
  })
  it('resolveError service still calls resolveStructuredError', () => {
    expect(serviceSource).toContain('resolveStructuredError')
  })
})

// Block 3 — SYSTEM_PERFORMANCE_WARNING: threshold constant (3 tests)
describe('Phase 3C.6 — SYSTEM_PERFORMANCE_WARNING: threshold constant', () => {
  const typesSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.types.ts'
  )

  it('OUTBOX_QUEUE_DEPTH_MIN is exported in REC_THRESHOLD', () => {
    expect(typesSource).toContain('OUTBOX_QUEUE_DEPTH_MIN')
  })
  it('OUTBOX_QUEUE_DEPTH_MIN value is 10', () => {
    expect(typesSource).toContain('OUTBOX_QUEUE_DEPTH_MIN: 10')
  })
  it('ERROR_COUNT_MIN is still present (no regression)', () => {
    expect(typesSource).toContain('ERROR_COUNT_MIN')
  })
})

// Block 4 — SYSTEM_PERFORMANCE_WARNING: recommendation generator (4 tests)
describe('Phase 3C.6 — SYSTEM_PERFORMANCE_WARNING: recommendation generator', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/system-recommendation/system-recommendation.service.ts'
  )

  it('service contains checkPerformanceWarning function', () => {
    expect(serviceSource).toContain('checkPerformanceWarning')
  })
  it('checkPerformanceWarning uses OUTBOX_QUEUE_DEPTH_MIN threshold', () => {
    expect(serviceSource).toContain('OUTBOX_QUEUE_DEPTH_MIN')
  })
  it('generator wires in checkPerformanceWarning with outbox pending count', () => {
    expect(serviceSource).toContain('checkPerformanceWarning(healthReport.outbox.pendingCount)')
  })
  it('checkPerformanceWarning produces SYSTEM_PERFORMANCE_WARNING rec type', () => {
    expect(serviceSource).toContain("'SYSTEM_PERFORMANCE_WARNING'")
  })
})
```

---

## Post-Implementation Checklist

```
npx vitest run
```
Expected: **987/987 passed** (975 existing + 12 new)

```
npx next build
```
Expected: clean compile, no TypeScript errors, 34 routes (no new routes)

```
git status
```
Expected: 4 modified files + 1 appended test file:
- `modules/intelligence/structured-errors/structured-error.repo.ts`
- `modules/intelligence/structured-errors/structured-error.service.ts`
- `modules/intelligence/system-recommendation/system-recommendation.types.ts`
- `modules/intelligence/system-recommendation/system-recommendation.service.ts`
- `tests/phase3c-system-intelligence.test.ts`

No new files. No migrations. No Vercel changes.

---

## Commit Sequence (after QA approval)

```
git add modules/intelligence/structured-errors/structured-error.repo.ts
git add modules/intelligence/structured-errors/structured-error.service.ts
git add modules/intelligence/system-recommendation/system-recommendation.types.ts
git add modules/intelligence/system-recommendation/system-recommendation.service.ts
git add tests/phase3c-system-intelligence.test.ts
git commit -m "Phase 3C.6: implement resolved_by attribution and performance warning recommendation"
```

Then: annotated tag → AI context update → push.

---

## Guardrails in Force

| Guardrail | Status |
|-----------|--------|
| No production modifications | In force |
| No Vercel settings changes | In force |
| No migrations | In force (next available: `20240032`) |
| No email / Resend | In force |
| No external LLM calls | In force |
| Tenant isolation preserved | In force — `.eq('tenant_id', tenantId)` unchanged in repo |
| Existing lifecycle actions preserved | In force — ignore/investigate unaffected; actions unaffected |
| `dismissRecommendationAction` unchanged | In force |
| Advisory-only recommendations | In force — writes to `agent_recommendations` only |
| Staging remains deployable | In force |
| Tests stay green (987/987 target) | In force |
