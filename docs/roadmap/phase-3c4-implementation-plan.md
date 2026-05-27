# Phase 3C.4 — Workflow & Outbox Error Emission
## Implementation Plan v1.0

**Date:** 2026-05-26
**Status:** APPROVED — ready for implementation
**Design doc:** `docs/roadmap/phase-3c4-workflow-error-emission-design-test-cases.md`
**Approved decisions:**
- Modify Phase 3A workflow service files: yes (additive non-fatal emission only)
- Idempotency for `failWorkflowRun` duplicates: Option A — accept duplicates in v1
- Outbox idempotency gap on server restart: accept gap in v1
- Severity for both failure types: `'error'`
- Outbox emission: final attempt only, guarded by `event.attempts + 1 >= 5`
- Test count: 25 tests
- Target test baseline: 955/955

---

## Scope

**3 files to modify. 1 test file to append. No new files. No migrations.**

| File | Action |
|------|--------|
| `modules/intelligence/structured-errors/structured-error.types.ts` | Add `WORKFLOW_FAILURE_TYPE` constant + `WorkflowFailureType` type (additive) |
| `modules/workflow/services/workflow-run.service.ts` | Add imports; rename `_ctx` → `ctx`; add non-fatal emission in `failWorkflowRun` |
| `modules/workflow/services/event-dispatch.service.ts` | Add imports; add guarded non-fatal emission in `dispatchPendingEvents` catch block |
| `tests/phase3c-system-intelligence.test.ts` | Append 25 tests across 9 describe blocks (Phase 3C.4 section) |

---

## Step 1 — `structured-error.types.ts`: add `WORKFLOW_FAILURE_TYPE`

**File:** `modules/intelligence/structured-errors/structured-error.types.ts`

Insert after line 18 (`export type SeStatus = typeof SE_STATUS[keyof typeof SE_STATUS]`),
before the `export interface CreateStructuredErrorInput` line:

```typescript

export const WORKFLOW_FAILURE_TYPE = {
  WORKFLOW_RUN_FAILED:          'WORKFLOW_RUN_FAILED',
  OUTBOX_EVENT_DISPATCH_FAILED: 'OUTBOX_EVENT_DISPATCH_FAILED',
} as const
export type WorkflowFailureType = typeof WORKFLOW_FAILURE_TYPE[keyof typeof WORKFLOW_FAILURE_TYPE]
```

**Verify:** `SE_SEVERITY`, `SE_STATUS`, `CreateStructuredErrorInput`, and `StructuredErrorStats` must remain exactly as-is. This is an additive insert only.

---

## Step 2 — `workflow-run.service.ts`: add imports and emission

**File:** `modules/workflow/services/workflow-run.service.ts`

### 2a — Add imports

After the existing two import lines:
```typescript
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import type { RequestContext } from '@/types/context'
```

Insert:
```typescript
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import { WORKFLOW_FAILURE_TYPE } from '@/modules/intelligence/structured-errors/structured-error.types'
```

### 2b — Modify `failWorkflowRun`

Replace:
```typescript
export async function failWorkflowRun(
  _ctx: RequestContext,
  runId: string,
  errorMessage: string
): Promise<void> {
  await approvalRepo.updateWorkflowRunStatus(runId, 'failed', { errorMessage })
}
```

With:
```typescript
export async function failWorkflowRun(
  ctx: RequestContext,
  runId: string,
  errorMessage: string
): Promise<void> {
  await approvalRepo.updateWorkflowRunStatus(runId, 'failed', { errorMessage })
  createStructuredError({
    tenantId:      ctx.tenantId,
    workspaceId:   ctx.workspaceId ?? null,
    failureType:   WORKFLOW_FAILURE_TYPE.WORKFLOW_RUN_FAILED,
    severity:      'error',
    module:        'workflow_runs',
    errorMessage,
    workflowRunId: runId,
  }).catch(() => {})
}
```

**Notes:**
- `_ctx` renamed to `ctx` — now used for `tenantId` and `workspaceId`.
- Emission is fire-and-forget (`.catch(() => {})`): a DB error never blocks `failWorkflowRun`.
- `createWorkflowRun` and `completeWorkflowRun` are unchanged.

---

## Step 3 — `event-dispatch.service.ts`: add imports and guarded emission

**File:** `modules/workflow/services/event-dispatch.service.ts`

### 3a — Add imports

After the existing three import lines:
```typescript
import { inngest } from '@/lib/inngest/client'
import * as eventRepo from '@/modules/workflow/repositories/event.repo'
import type { RequestContext } from '@/types/context'
```

Insert:
```typescript
import { createStructuredError } from '@/modules/intelligence/structured-errors/structured-error.repo'
import { WORKFLOW_FAILURE_TYPE } from '@/modules/intelligence/structured-errors/structured-error.types'
```

### 3b — Modify the catch block in `dispatchPendingEvents`

Replace:
```typescript
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await eventRepo.markEventDispatchFailed(event.id, msg)
      failed++
    }
```

With:
```typescript
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await eventRepo.markEventDispatchFailed(event.id, msg)
      if (event.attempts + 1 >= 5) {
        createStructuredError({
          tenantId:     event.tenant_id,
          workspaceId:  event.workspace_id ?? null,
          failureType:  WORKFLOW_FAILURE_TYPE.OUTBOX_EVENT_DISPATCH_FAILED,
          severity:     'error',
          module:       'event_dispatch_queue',
          errorMessage: msg,
          context: {
            event_id:   event.id,
            event_type: event.event_type,
            attempts:   event.attempts + 1,
          },
        }).catch(() => {})
      }
      failed++
    }
```

**Notes:**
- `event.attempts` is the pre-failure value from `getPendingDispatchEvents` (which filters `attempts < 5`), so `event.attempts` is 0–4. The guard fires only when `event.attempts = 4` (fifth and final attempt).
- `event.tenant_id`, `event.workspace_id`, `event.event_type`, `event.id` are all top-level columns on `EventQueueRow` (confirmed: `getPendingDispatchEvents` uses `select('*')`).
- `enqueueEvent` function and `enqueueEvent` call site are unchanged.
- `return { dispatched, failed }` is unchanged.

---

## Step 4 — Append 25 tests to `tests/phase3c-system-intelligence.test.ts`

Append to the end of the file. The file already imports `fs`, `path`, and `readProjectFile`.

```typescript
// -------------------------------------------------------
// Phase 3C.4 — Workflow & Outbox Error Emission
// -------------------------------------------------------

// Block 1 — WORKFLOW_FAILURE_TYPE constants (2 tests)
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

// Block 2 — workflow-run.service.ts: emission (5 tests)
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

// Block 3 — event-dispatch.service.ts: emission (5 tests)
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

// Block 4 — structured-error.types.ts: additive only (3 tests)
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

// Block 5 — Guardrail: no new migrations (2 tests)
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

// Block 6 — Guardrail: tenant isolation (2 tests)
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

// Block 7 — Guardrail: outbox final-attempt-only emission (2 tests)
describe('Phase 3C.4 — Guardrail: outbox emits only on final attempt', () => {
  const serviceSource = readProjectFile(
    'modules/workflow/services/event-dispatch.service.ts'
  )

  it('dispatchPendingEvents guards emission with attempt count check', () => {
    expect(serviceSource).toContain('attempts')
  })
  it('dispatchPendingEvents calls markEventDispatchFailed (existing behavior preserved)', () => {
    expect(serviceSource).toContain('markEventDispatchFailed')
  })
})

// Block 8 — Guardrail: Phase 3C.2 and 3C.3 unchanged (3 tests)
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

// Block 9 — Guardrail: no external LLMs or Resend in modified files (1 test)
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

---

## Post-Implementation Checklist

After all 4 steps are complete, run in order:

```
npx vitest run
```
Expected: **955/955 passed** (930 existing + 25 new)

```
npx next build
```
Expected: clean compile, no TypeScript errors

```
git status
```
Expected: 4 modified files only:
- `modules/intelligence/structured-errors/structured-error.types.ts`
- `modules/workflow/services/workflow-run.service.ts`
- `modules/workflow/services/event-dispatch.service.ts`
- `tests/phase3c-system-intelligence.test.ts`

No migrations, no new routes, no Vercel changes, no Resend imports.

---

## Commit Sequence (after QA approval)

```
git add modules/intelligence/structured-errors/structured-error.types.ts
git add modules/workflow/services/workflow-run.service.ts
git add modules/workflow/services/event-dispatch.service.ts
git add tests/phase3c-system-intelligence.test.ts
git commit -m "Phase 3C.4: implement workflow and outbox error emission"
```

Then: annotated tag → AI context update → push.

---

## Guardrails in Force

| Guardrail | Status |
|-----------|--------|
| No production modifications | In force |
| No Vercel settings changes | In force |
| No migrations | In force (next available: `20240032`) |
| No new routes | In force |
| No Resend / email | In force |
| No external LLM calls | In force |
| Staging remains deployable | In force |
| Tests stay green (955/955 target) | In force |
| Phase 3A behavior preserved | In force — only additive non-fatal code added |
