# Phase 3C.2 — Structured Error Lifecycle + Error Emission
## Implementation Plan v1.0

---

## 1. Implementation Objective

Close two gaps left open by Phase 3C.1:

1. **Lifecycle actions** — add `updateErrorStatus()` and `dismissRecommendation()` to the repo; add `investigateError()` and `ignoreError()` to the service; create four server actions; add UI action buttons to the System Intelligence page.
2. **Error emission** — wire `repo.createStructuredError()` into the `commitBatch()` catch path in `import.service.ts` and into the `commitBatch()` catch path in `process-import-batch.ts`.

No migrations. No new pages. No new UI files. No Resend calls.

---

## 2. Files to Create

| File | Purpose |
|------|---------|
| `modules/intelligence/structured-errors/structured-error.actions.ts` | Four `'use server'` actions: resolveErrorAction, investigateErrorAction, ignoreErrorAction, dismissRecommendationAction |

---

## 3. Files to Modify

| File | Changes |
|------|---------|
| `modules/intelligence/types.agent.ts` | Add 4 new `ActivityEventType` constants under Phase 3C.2 comment block (additive only) |
| `modules/intelligence/structured-errors/structured-error.repo.ts` | Add `updateErrorStatus()` and `dismissRecommendation()` |
| `modules/intelligence/structured-errors/structured-error.service.ts` | Add `investigateError()` and `ignoreError()` |
| `modules/imports/import.service.ts` | Add try/catch in `commitBatch()` body; emit `createStructuredError()` on catastrophic failure (non-fatal, re-throw) |
| `inngest/functions/process-import-batch.ts` | Add try/catch around `commitBatch()` call; emit `createStructuredError()` on failure (non-fatal, re-throw) |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` | Import server actions; add `<form>` + button per error row and per recommendation row |
| `tests/phase3c-system-intelligence.test.ts` | Append 24 new Phase 3C.2 test cases |

---

## 4. Files Explicitly Not to Touch

| File | Reason |
|------|--------|
| `modules/intelligence/structured-errors/structured-error.types.ts` | `SE_STATUS` and `SE_SEVERITY` already cover all needed values |
| `modules/intelligence/repositories/recommendation.repo.ts` | Phase 3B.2 locked; `dismissRecommendation` goes in `structured-error.repo.ts` per design |
| All Phase 3A modules | Locked |
| All Phase 3B modules | Locked |
| `supabase/migrations/*` | No migration required |
| `types/database.ts` | No new columns added |
| `components/layout/Sidebar.tsx` | No new nav entries |
| Any production infrastructure file | No production changes |

---

## 5. Step-by-Step Implementation Sequence

Implement in this exact order. Each step is independently testable. Run `npx vitest run` after all steps are complete.

### Step 1 — Add ActivityEventType constants

File: `modules/intelligence/types.agent.ts`

Append after the existing `// Phase 3C.1 — System Intelligence` block:

```typescript
// Phase 3C.2 — Structured Error Lifecycle (additive)
SE_ERROR_RESOLVED:      'SE_ERROR_RESOLVED',
SE_ERROR_INVESTIGATING: 'SE_ERROR_INVESTIGATING',
SE_ERROR_IGNORED:       'SE_ERROR_IGNORED',
SE_REC_DISMISSED:       'SE_REC_DISMISSED',
```

All four follow the ALL_CAPS convention of recent additions (HRB_, SEB_, ET_, LA_). No existing constants are modified.

---

### Step 2 — Extend the structured error repo

File: `modules/intelligence/structured-errors/structured-error.repo.ts`

**Add `updateErrorStatus()`** — transitions an error to `investigating` or `ignored`. Does not set `resolved = true` or `resolved_at` (those are reserved for `resolveStructuredError()`).

```typescript
export async function updateErrorStatus(
  id:       string,
  tenantId: string,
  status:   SeStatus,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('automation_failures')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`updateErrorStatus: ${error.message}`)
}
```

**Add `dismissRecommendation()`** — sets `agent_recommendations.status = 'dismissed'`. The `agent_recommendations.status` column is `text NOT NULL DEFAULT 'pending'` with no CHECK constraint (`20240004_intelligence.sql:253`), so `'dismissed'` is valid without a migration.

```typescript
export async function dismissRecommendation(
  id:       string,
  tenantId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('agent_recommendations')
    .update({ status: 'dismissed' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`dismissRecommendation: ${error.message}`)
}
```

Import `SeStatus` from `./structured-error.types` at the top of the file.

---

### Step 3 — Extend the structured error service

File: `modules/intelligence/structured-errors/structured-error.service.ts`

**Add `investigateError()`** and **`ignoreError()`**. Both delegate directly to the repo. Activity events are emitted in the server action layer (Step 4), not here, keeping these functions as pure state-changers consistent with the existing `resolveError()` pattern.

```typescript
export async function investigateError(
  ctx: RequestContext,
  id:  string,
): Promise<void> {
  return repo.updateErrorStatus(id, ctx.tenantId, SE_STATUS.INVESTIGATING)
}

export async function ignoreError(
  ctx: RequestContext,
  id:  string,
): Promise<void> {
  return repo.updateErrorStatus(id, ctx.tenantId, SE_STATUS.IGNORED)
}
```

Import `SE_STATUS` from `./structured-error.types` (already imported in the file).
Import `updateErrorStatus` from the repo (via `* as repo`).

---

### Step 4 — Create the server actions file

File: `modules/intelligence/structured-errors/structured-error.actions.ts` **(new)**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { recordActivityEvent } from '@/modules/intelligence/repositories/activity-event.repo'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import * as service from './structured-error.service'
import * as repo from './structured-error.repo'

function emitLifecycleEvent(
  tenantId:    string,
  workspaceId: string,
  eventType:   string,
  errorId?:    string,
  recId?:      string,
): void {
  recordActivityEvent({
    tenantId,
    workspaceId,
    eventType,
    eventSource: 'system_intelligence_ui',
    entityType:  errorId ? 'automation_failure' : 'agent_recommendation',
    entityId:    errorId ?? recId,
    properties:  {},
  }).catch(() => {})
}

export async function resolveErrorAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await service.resolveError(ctx, id)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_ERROR_RESOLVED, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
}

export async function investigateErrorAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await service.investigateError(ctx, id)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_ERROR_INVESTIGATING, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
}

export async function ignoreErrorAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await service.ignoreError(ctx, id)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_ERROR_IGNORED, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
}

export async function dismissRecommendationAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await repo.dismissRecommendation(id, ctx.tenantId)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_REC_DISMISSED, undefined, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
}
```

**Permission gate:** `crm.companies.view` — consistent with the page's own `requirePermission` call. This matches the design's stated preference for the existing gate. Can be tightened to a role check in a future phase.

**`workspaceSlug`** is passed as a hidden form field by the UI (Step 6) so `revalidatePath` can target the exact path.

**Activity event failures are non-fatal** via `.catch(() => {})` — the same pattern used in every other module in this codebase.

---

### Step 5 — Add error emission to import.service.ts

File: `modules/imports/import.service.ts`

**Add import** at the top of the file:
```typescript
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
```

**Wrap `commitBatch()` body** in a try/catch. The existing function body becomes the try block. On catastrophic failure (not individual row failures — those are already handled per-row), emit a structured error non-fatally and re-throw so callers (including Inngest) still see the exception and can retry/record it.

```typescript
export async function commitBatch(
  batchId:     string,
  tenantId:    string,
  workspaceId: string,
): Promise<{ committedRows: number; skippedRows: number; failedCommitRows: number }> {
  try {
    // ... existing body unchanged ...
  } catch (err) {
    createStructuredError({
      tenantId,
      workspaceId,
      failureType:     'IMPORT_COMMIT_FAILURE',
      severity:        'error',
      module:          'imports',
      errorMessage:    err instanceof Error ? err.message : String(err),
      payloadSnapshot: { batchId },
    }).catch(() => {})
    throw err
  }
}
```

**Key constraints:**
- The `.catch(() => {})` on `createStructuredError()` ensures the error write never suppresses the original exception.
- `createStructuredError()` is the repo function — called directly because `commitBatch()` has no `ctx` (only bare `tenantId`/`workspaceId` strings). `service.createError()` requires a `RequestContext` and cannot be used here.
- Re-throw is mandatory — the caller (Inngest or the sync server action) must still see the failure.
- Individual row failures that produce `failedCommitRows > 0` are NOT caught here — they flow through normally. This catch is only for catastrophic exceptions (DB down, unexpected throw, etc.).

---

### Step 6 — Add error emission to process-import-batch.ts

File: `inngest/functions/process-import-batch.ts`

**Add import** at the top of the file:
```typescript
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
```

**Wrap the `commitBatch()` call** in a try/catch inside the Inngest handler:

```typescript
let result: Awaited<ReturnType<typeof commitBatch>>
try {
  result = await commitBatch(batchId, tenantId, workspaceId)
} catch (err) {
  createStructuredError({
    tenantId,
    workspaceId,
    failureType:     'INNGEST_IMPORT_BATCH_FAILURE',
    severity:        'critical',
    module:          'imports',
    errorMessage:    err instanceof Error ? err.message : String(err),
    payloadSnapshot: { batchId },
  }).catch(() => {})
  throw err  // Inngest sees the throw and records the failure; retries: 1 applies
}

return {
  ok:               true,
  committedRows:    result.committedRows,
  skippedRows:      result.skippedRows,
  failedCommitRows: result.failedCommitRows,
}
```

**Key constraints:**
- `.catch(() => {})` on `createStructuredError()` — non-fatal.
- Re-throw — Inngest must see the exception to record failure and apply `retries: 1`.
- `severity: 'critical'` — Inngest-level failures are more severe than service-level failures; they indicate the background job itself failed.
- `failureType: 'INNGEST_IMPORT_BATCH_FAILURE'` — distinct from `'IMPORT_COMMIT_FAILURE'`; these are different categories in the errors board.
- Both Step 5 and Step 6 may fire for the same underlying failure on the async path (large batch via Inngest). This is intentional — the two structured errors have different `failureType` values and represent different system layers.

---

### Step 7 — Update the System Intelligence page

File: `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx`

**Add imports** at the top:
```typescript
import {
  resolveErrorAction,
  investigateErrorAction,
  ignoreErrorAction,
  dismissRecommendationAction,
} from '@/modules/intelligence/structured-errors/structured-error.actions'
```

**In the errors table** (`criticalErrors.map(err => ...)`), add a new rightmost `<td>` with three inline forms:

```tsx
<td className="p-3">
  <div className="flex gap-1">
    <form action={resolveErrorAction}>
      <input type="hidden" name="id" value={err.id} />
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <button type="submit" className="text-xs text-primary hover:underline">
        Resolve
      </button>
    </form>
    <form action={investigateErrorAction}>
      <input type="hidden" name="id" value={err.id} />
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <button type="submit" className="text-xs text-muted-foreground hover:underline">
        Investigate
      </button>
    </form>
    <form action={ignoreErrorAction}>
      <input type="hidden" name="id" value={err.id} />
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <button type="submit" className="text-xs text-muted-foreground hover:underline">
        Ignore
      </button>
    </form>
  </div>
</td>
```

Add a matching `<th>` header cell (`<th className="p-3"></th>`) to the errors table header row.

**In the recommendations table** (`systemRecs.map(rec => ...)`), add a new rightmost `<td>`:

```tsx
<td className="p-3 text-right">
  <form action={dismissRecommendationAction}>
    <input type="hidden" name="id" value={rec.id} />
    <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
    <button type="submit" className="text-xs text-muted-foreground hover:underline">
      Dismiss
    </button>
  </form>
</td>
```

Add a matching `<th>` header cell to the recommendations table header row.

**`workspaceSlug`** is already available in the page scope from `const { workspaceSlug } = await params`.

**The page remains a pure server component** — no `'use client'` is added. Server actions work with plain HTML forms without a client component.

---

### Step 8 — Add Phase 3C.2 tests

File: `tests/phase3c-system-intelligence.test.ts`

Append a new section after the last existing `describe` block. All 24 TCs from the design document, implemented as file-content assertions using the existing `readProjectFile` helper:

```typescript
// -------------------------------------------------------
// Phase 3C.2 — ActivityEventType: lifecycle constants
// -------------------------------------------------------
describe('Phase 3C.2 — ActivityEventType: lifecycle constants', () => {
  it('SE_ERROR_RESOLVED is defined', () => {
    expect(ActivityEventType.SE_ERROR_RESOLVED).toBe('SE_ERROR_RESOLVED')
  })
  it('SE_ERROR_INVESTIGATING is defined', () => {
    expect(ActivityEventType.SE_ERROR_INVESTIGATING).toBe('SE_ERROR_INVESTIGATING')
  })
  it('SE_ERROR_IGNORED is defined', () => {
    expect(ActivityEventType.SE_ERROR_IGNORED).toBe('SE_ERROR_IGNORED')
  })
  it('SE_REC_DISMISSED is defined', () => {
    expect(ActivityEventType.SE_REC_DISMISSED).toBe('SE_REC_DISMISSED')
  })
  it('all four new constants are unique strings', () => {
    const vals = [
      ActivityEventType.SE_ERROR_RESOLVED,
      ActivityEventType.SE_ERROR_INVESTIGATING,
      ActivityEventType.SE_ERROR_IGNORED,
      ActivityEventType.SE_REC_DISMISSED,
    ]
    expect(new Set(vals).size).toBe(4)
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Server actions: exports and 'use server'
// -------------------------------------------------------
describe('Phase 3C.2 — Structured Error Actions: source assertions', () => {
  const actionsSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.actions.ts'
  )

  it("actions file has 'use server' directive", () => {
    expect(actionsSource).toContain("'use server'")
  })
  it('exports resolveErrorAction', () => {
    expect(actionsSource).toContain('resolveErrorAction')
  })
  it('exports investigateErrorAction', () => {
    expect(actionsSource).toContain('investigateErrorAction')
  })
  it('exports ignoreErrorAction', () => {
    expect(actionsSource).toContain('ignoreErrorAction')
  })
  it('exports dismissRecommendationAction', () => {
    expect(actionsSource).toContain('dismissRecommendationAction')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Repo: updateErrorStatus and dismissRecommendation
// -------------------------------------------------------
describe('Phase 3C.2 — Structured Error Repo: new functions', () => {
  const repoSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.repo.ts'
  )

  it('exports updateErrorStatus', () => {
    expect(repoSource).toContain('updateErrorStatus')
  })
  it('exports dismissRecommendation', () => {
    expect(repoSource).toContain('dismissRecommendation')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Service: investigateError and ignoreError
// -------------------------------------------------------
describe('Phase 3C.2 — Structured Error Service: new functions', () => {
  const serviceSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.service.ts'
  )

  it('exports investigateError', () => {
    expect(serviceSource).toContain('investigateError')
  })
  it('exports ignoreError', () => {
    expect(serviceSource).toContain('ignoreError')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Emission: import.service.ts
// -------------------------------------------------------
describe('Phase 3C.2 — Error emission: import.service.ts', () => {
  const serviceSource = readProjectFile('modules/imports/import.service.ts')

  it('import.service.ts calls createStructuredError', () => {
    expect(serviceSource).toContain('createStructuredError')
  })
  it('createStructuredError call in import.service.ts is non-fatal (.catch)', () => {
    expect(serviceSource).toContain('createStructuredError(')
    expect(serviceSource).toContain('.catch(() => {})')
  })
  it('import.service.ts does not call Resend', () => {
    expect(serviceSource).not.toContain('resend')
    expect(serviceSource).not.toContain('Resend')
  })
  it('import.service.ts does not call sendApprovedDraftAction', () => {
    expect(serviceSource).not.toContain('sendApprovedDraftAction')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — Emission: process-import-batch.ts
// -------------------------------------------------------
describe('Phase 3C.2 — Error emission: process-import-batch.ts', () => {
  const fnSource = readProjectFile('inngest/functions/process-import-batch.ts')

  it('process-import-batch.ts calls createStructuredError', () => {
    expect(fnSource).toContain('createStructuredError')
  })
  it('createStructuredError call in process-import-batch.ts is non-fatal (.catch)', () => {
    expect(fnSource).toContain('createStructuredError(')
    expect(fnSource).toContain('.catch(() => {})')
  })
  it('process-import-batch.ts does not call Resend', () => {
    expect(fnSource).not.toContain('resend')
    expect(fnSource).not.toContain('Resend')
  })
})

// -------------------------------------------------------
// Phase 3C.2 — UI: action buttons in System Intelligence page
// -------------------------------------------------------
describe('Phase 3C.2 — System Intelligence page: action buttons', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx'
  )

  it('page imports resolveErrorAction', () => {
    expect(pageSource).toContain('resolveErrorAction')
  })
  it('page imports dismissRecommendationAction', () => {
    expect(pageSource).toContain('dismissRecommendationAction')
  })
  it('page remains a server component (no "use client")', () => {
    expect(pageSource).not.toContain("'use client'")
  })
})
```

---

## 6. Repository Changes Summary

| Function | File | Type | Description |
|----------|------|------|-------------|
| `updateErrorStatus(id, tenantId, status)` | `structured-error.repo.ts` | New | Updates `automation_failures.status` to `investigating` or `ignored` |
| `dismissRecommendation(id, tenantId)` | `structured-error.repo.ts` | New | Updates `agent_recommendations.status` to `'dismissed'` |

---

## 7. Service Changes Summary

| Function | File | Type | Description |
|----------|------|------|-------------|
| `investigateError(ctx, id)` | `structured-error.service.ts` | New | Delegates to `repo.updateErrorStatus(id, ctx.tenantId, SE_STATUS.INVESTIGATING)` |
| `ignoreError(ctx, id)` | `structured-error.service.ts` | New | Delegates to `repo.updateErrorStatus(id, ctx.tenantId, SE_STATUS.IGNORED)` |

`resolveError()` is unchanged. Activity events are emitted in the server action layer, not in the service layer.

---

## 8. Server Action Changes Summary

| Action | File | Permission gate | Calls |
|--------|------|----------------|-------|
| `resolveErrorAction` | `structured-error.actions.ts` | `crm.companies.view` | `service.resolveError()` → emits `SE_ERROR_RESOLVED` → `revalidatePath` |
| `investigateErrorAction` | `structured-error.actions.ts` | `crm.companies.view` | `service.investigateError()` → emits `SE_ERROR_INVESTIGATING` → `revalidatePath` |
| `ignoreErrorAction` | `structured-error.actions.ts` | `crm.companies.view` | `service.ignoreError()` → emits `SE_ERROR_IGNORED` → `revalidatePath` |
| `dismissRecommendationAction` | `structured-error.actions.ts` | `crm.companies.view` | `repo.dismissRecommendation()` → emits `SE_REC_DISMISSED` → `revalidatePath` |

---

## 9. UI Changes Summary

Page: `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx`

- **Errors table**: new rightmost `<th>` (empty header) + per-row `<td>` with three inline `<form>` elements (Resolve, Investigate, Ignore). Each form has two hidden inputs: `id` (error UUID) and `workspaceSlug`.
- **Recommendations table**: new rightmost `<th>` (empty header) + per-row `<td>` with one inline `<form>` element (Dismiss). Same hidden inputs.
- Page remains a server component. No `'use client'` added.
- Empty-state paragraphs (no errors / no recs) are unchanged.

---

## 10. Error Emission Callsite Changes Summary

| Callsite | failureType | severity | module | Wraps | Re-throws |
|----------|-------------|---------|--------|-------|-----------|
| `commitBatch()` catch in `import.service.ts` | `IMPORT_COMMIT_FAILURE` | `error` | `imports` | Entire `commitBatch()` body | Yes |
| `commitBatch()` catch in `process-import-batch.ts` | `INNGEST_IMPORT_BATCH_FAILURE` | `critical` | `imports` | `await commitBatch(...)` call | Yes (Inngest sees the throw) |

Both calls use `repo.createStructuredError()` directly (not `service.createError()`) because neither callsite has a `RequestContext`. Both are wrapped in `.catch(() => {})`.

---

## 11. Activity Event Additions

| Constant | String value | Emitted by | Trigger |
|----------|-------------|-----------|---------|
| `SE_ERROR_RESOLVED` | `'SE_ERROR_RESOLVED'` | `resolveErrorAction` | User resolves an error from the UI |
| `SE_ERROR_INVESTIGATING` | `'SE_ERROR_INVESTIGATING'` | `investigateErrorAction` | User marks error as investigating |
| `SE_ERROR_IGNORED` | `'SE_ERROR_IGNORED'` | `ignoreErrorAction` | User ignores an error |
| `SE_REC_DISMISSED` | `'SE_REC_DISMISSED'` | `dismissRecommendationAction` | User dismisses a system recommendation |

All four are emitted via `recordActivityEvent()` wrapped in `.catch(() => {})`.

---

## 12. Test Implementation Plan

All 24 new test cases are appended to `tests/phase3c-system-intelligence.test.ts`. No new test file is created.

Test pattern: file-content assertions using the existing `readProjectFile()` helper. No DB or network calls.

Import additions needed at the top of the test file (if not already present): `ActivityEventType` is already imported at line 229 of the existing file.

No new fixture files. No new mock files.

---

## 13. Expected Test Count

| Before Phase 3C.2 | New TCs | After Phase 3C.2 |
|-------------------|---------|-----------------|
| 879 | 24 | **903** |

The 24 new TCs map directly to TC-3C2-001 through TC-3C2-024 from the design document, consolidated into describe blocks as shown in Step 8.

---

## 14. Validation Commands

Run in this order after all steps are complete:

```bash
npx vitest run
```
Expected: 903/903 passed.

```bash
npx next build
```
Expected: clean build, TypeScript clean, no new routes added.

Spot-check on staging after deployment:
- Navigate to `/main/settings/system-intelligence`
- Confirm Resolve / Investigate / Ignore buttons appear in the errors table
- Confirm Dismiss button appears in the recommendations table
- Click one action; confirm page refreshes with the row removed
- Confirm `/api/debug/staging-auth` still returns 404 (no debug routes reintroduced)

---

## 15. Rollback Strategy

All changes are isolated to:
- One new file (server actions)
- Six modified files (types, repo, service, two emission callsites, one page, one test file)

If a revert is needed after commit: `git revert <commit>` is sufficient. No migration was applied, so no DB rollback is needed.

If a revert is needed mid-implementation (before commit): `git restore` the modified files and delete the new actions file. No DB state to restore.

---

## 16. Safety Guardrails

| Guardrail | Enforcement |
|-----------|------------|
| No Resend calls | TCs 3C2-018, 3C2-019, 3C2-020 assert file content does not contain Resend |
| No `sendApprovedDraftAction` calls | TC 3C2-019 asserts file content |
| No new DB tables or migrations | No migration file created; `dismissRecommendation` writes to existing unconstrained `status` column |
| All error emission calls are non-fatal | `createStructuredError(...).catch(() => {})` pattern; emission failure must never block import operations |
| Original throw is preserved | Re-throw after emission in both callsites; Inngest retry and server action error propagation are unaffected |
| Page remains a server component | TC 3C2-023 asserts no `'use client'` in page |
| No new pages or routes | Build route list verified in validation step |
| No Phase 3A/3B module changes | Files not listed in Section 3 are not touched |
| Production untouched | No production infrastructure, Vercel project, or Supabase prod project is modified |

---

## 17. Approval Checkpoint

This implementation plan is ready for review. Before any code is written:

- [ ] Implementation sequence (Steps 1–8) is approved
- [ ] Server action permission gate (`crm.companies.view`) is acceptable
- [ ] Double-emission on async import path (both `IMPORT_COMMIT_FAILURE` and `INNGEST_IMPORT_BATCH_FAILURE`) is acceptable
- [ ] `dismissRecommendation` in `structured-error.repo.ts` (not `recommendation.repo.ts`) is acceptable
- [ ] Activity events emitted in server actions (not service layer) is acceptable
- [ ] Target test count of 903 is confirmed
- [ ] Inline `<form>` pattern for action buttons (not a separate client component) is acceptable

**DO NOT BEGIN IMPLEMENTATION UNTIL THIS PLAN IS APPROVED.**
