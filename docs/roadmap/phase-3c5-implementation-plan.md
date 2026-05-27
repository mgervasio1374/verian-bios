# Phase 3C.5 — System Intelligence Detail Views
## Implementation Plan v1.0

**Date:** 2026-05-26
**Status:** APPROVED — ready for implementation
**Design doc:** `docs/roadmap/phase-3c5-system-intelligence-detail-views-design-test-cases.md`
**Approved decisions:**
- Detail route: `/[workspaceSlug]/settings/system-intelligence/errors/[errorId]`
- Lifecycle actions: stay on detail page; dual `revalidatePath` (list + detail)
- Status column on list table: skip — adding View link is sufficient; 8 columns is too wide
- Direct access to resolved/ignored errors via direct URL: allowed
- Test count: 20 tests
- Target test baseline: 975/975

---

## Scope

**4 files to modify. 1 file to create. 1 test file to append. No new migrations.**

| File | Action |
|------|--------|
| `modules/intelligence/structured-errors/structured-error.repo.ts` | Add `getStructuredErrorById(id, tenantId)` at end of file |
| `modules/intelligence/structured-errors/structured-error.actions.ts` | Add optional `errorId` read + conditional second `revalidatePath` in 3 lifecycle actions |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` | Add View link column header + View link cell to error table |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx` | **New file** — server component detail page |
| `tests/phase3c-system-intelligence.test.ts` | Append 20 tests across 8 describe blocks |

---

## Step 1 — `structured-error.repo.ts`: add `getStructuredErrorById`

**File:** `modules/intelligence/structured-errors/structured-error.repo.ts`

Append after the closing `}` of `getErrorStats` (end of file):

```typescript

export async function getStructuredErrorById(
  id:       string,
  tenantId: string,
): Promise<AutomationFailureRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('automation_failures')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()
  if (error) return null
  return data
}
```

**Notes:**
- Returns `null` on any error (row not found, wrong tenant, DB error). The detail page calls `notFound()` on null.
- No status filter — allows direct URL access to resolved/ignored errors.
- Uses service client, consistent with all other repo functions in this file.

---

## Step 2 — `structured-error.actions.ts`: add dual revalidation

**File:** `modules/intelligence/structured-errors/structured-error.actions.ts`

Apply the same pattern to `resolveErrorAction`, `investigateErrorAction`, and `ignoreErrorAction`. `dismissRecommendationAction` is NOT changed (it operates on recommendations, not errors).

### 2a — `resolveErrorAction`

Replace:
```typescript
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
```

With:
```typescript
export async function resolveErrorAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string
  const errorId       = formData.get('errorId') as string | null

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await service.resolveError(ctx, id)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_ERROR_RESOLVED, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
  if (errorId) {
    revalidatePath(`/${workspaceSlug}/settings/system-intelligence/errors/${errorId}`)
  }
}
```

### 2b — `investigateErrorAction`

Replace:
```typescript
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
```

With:
```typescript
export async function investigateErrorAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string
  const errorId       = formData.get('errorId') as string | null

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await service.investigateError(ctx, id)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_ERROR_INVESTIGATING, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
  if (errorId) {
    revalidatePath(`/${workspaceSlug}/settings/system-intelligence/errors/${errorId}`)
  }
}
```

### 2c — `ignoreErrorAction`

Replace:
```typescript
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
```

With:
```typescript
export async function ignoreErrorAction(formData: FormData): Promise<void> {
  const id            = formData.get('id') as string
  const workspaceSlug = formData.get('workspaceSlug') as string
  const errorId       = formData.get('errorId') as string | null

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  await service.ignoreError(ctx, id)
  emitLifecycleEvent(ctx.tenantId, ctx.workspaceId, ActivityEventType.SE_ERROR_IGNORED, id)
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
  if (errorId) {
    revalidatePath(`/${workspaceSlug}/settings/system-intelligence/errors/${errorId}`)
  }
}
```

**Note:** `dismissRecommendationAction` is unchanged. List page forms do not include an `errorId` field so the `if (errorId)` branch never fires from the list — no behavioral change to existing callers.

---

## Step 3 — `page.tsx` (list page): add View link column

**File:** `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx`

### 3a — Add column header

Replace:
```tsx
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="p-3"></th>
```

With:
```tsx
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="p-3"></th>
                  <th className="p-3"></th>
```

### 3b — Add View link cell in each error row

Replace:
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
                  </tr>
```

With:
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
                    <td className="p-3 text-right">
                      <Link
                        href={`${base}/settings/system-intelligence/errors/${err.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
```

**Note:** `Link` is already imported at the top of `page.tsx` (`import Link from 'next/link'`). No new imports needed.

---

## Step 4 — Create detail page

**File:** `app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx`

Create the directory and file. Full content:

```typescript
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getStructuredErrorById } from '@/modules/intelligence/structured-errors/structured-error.repo'
import {
  resolveErrorAction,
  investigateErrorAction,
  ignoreErrorAction,
} from '@/modules/intelligence/structured-errors/structured-error.actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ workspaceSlug: string; errorId: string }>
}

const SEVERITY_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  error:    'destructive',
  warning:  'outline',
  info:     'secondary',
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  open:          'destructive',
  investigating: 'outline',
  resolved:      'default',
  ignored:       'secondary',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function isNonEmptyJson(val: unknown): boolean {
  return typeof val === 'object' && val !== null && Object.keys(val as object).length > 0
}

export default async function ErrorDetailPage({ params }: PageProps) {
  const { workspaceSlug, errorId } = await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const err = await getStructuredErrorById(errorId, ctx.tenantId)
  if (!err) notFound()

  const listPath   = `/${workspaceSlug}/settings/system-intelligence`
  const isActionable = err.status === 'open' || err.status === 'investigating'

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back link */}
      <Link href={listPath} className="text-sm text-muted-foreground hover:underline">
        ← Back to System Intelligence
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-lg font-semibold">{err.failure_type}</p>
          <p className="text-sm text-muted-foreground mt-1">Created {fmtDate(err.created_at)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Badge variant={SEVERITY_VARIANT[err.severity] ?? 'secondary'}>{err.severity}</Badge>
          <Badge variant={STATUS_VARIANT[err.status] ?? 'secondary'}>{err.status}</Badge>
        </div>
      </div>

      {/* Error Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Error Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <span className="text-muted-foreground">Module</span>
            <span>{err.module ?? '—'}</span>
            <span className="text-muted-foreground">Route</span>
            <span>{err.route ?? '—'}</span>
            <span className="text-muted-foreground">Error Code</span>
            <span>{err.error_code ?? '—'}</span>
            <span className="text-muted-foreground">Message</span>
            <span className="break-all">{err.error_message ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Correlation & Tracing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Correlation &amp; Tracing</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <span className="text-muted-foreground">Correlation ID</span>
            <span className="font-mono text-xs break-all">{err.correlation_id ?? '—'}</span>
            <span className="text-muted-foreground">Workflow Run ID</span>
            <span className="font-mono text-xs break-all">{err.workflow_run_id ?? '—'}</span>
            <span className="text-muted-foreground">Job Execution ID</span>
            <span className="font-mono text-xs break-all">{err.job_execution_id ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Context (only if non-empty) */}
      {isNonEmptyJson(err.context) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Context</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono overflow-auto max-h-64 bg-muted rounded p-3">
              {JSON.stringify(err.context, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Payload Snapshot (only if non-empty) */}
      {isNonEmptyJson(err.payload_snapshot) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payload Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono overflow-auto max-h-64 bg-muted rounded p-3">
              {JSON.stringify(err.payload_snapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Stack Trace (only if present) */}
      {err.stack_trace && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Stack Trace</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono overflow-auto max-h-64 bg-muted rounded p-3 whitespace-pre-wrap">
              {err.stack_trace}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Resolution (only if resolved) */}
      {err.resolved && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Resolution</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <span className="text-muted-foreground">Resolved at</span>
              <span>{err.resolved_at ? fmtDate(err.resolved_at) : '—'}</span>
              <span className="text-muted-foreground">Resolved by</span>
              <span className="font-mono text-xs">{err.resolved_by ?? '—'}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lifecycle Actions (only if open or investigating) */}
      {isActionable && (
        <div className="flex gap-2">
          <form action={resolveErrorAction}>
            <input type="hidden" name="id" value={err.id} />
            <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
            <input type="hidden" name="errorId" value={err.id} />
            <button type="submit" className="text-sm text-primary hover:underline">
              Resolve
            </button>
          </form>
          <form action={investigateErrorAction}>
            <input type="hidden" name="id" value={err.id} />
            <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
            <input type="hidden" name="errorId" value={err.id} />
            <button type="submit" className="text-sm text-muted-foreground hover:underline">
              Investigate
            </button>
          </form>
          <form action={ignoreErrorAction}>
            <input type="hidden" name="id" value={err.id} />
            <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
            <input type="hidden" name="errorId" value={err.id} />
            <button type="submit" className="text-sm text-muted-foreground hover:underline">
              Ignore
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
```

**Notes:**
- No `'use client'` — full server component.
- `notFound()` imported from `next/navigation` — returns Next.js 404 response.
- `getStructuredErrorById` uses `select('*')` — no status filter — so resolved/ignored errors are accessible via direct URL.
- Lifecycle action forms include `name="errorId"` so the actions file can revalidate the detail path.
- Conditional sections (context, payload_snapshot, stack_trace, resolution) only render when data is present.

---

## Step 5 — Append 20 tests to `tests/phase3c-system-intelligence.test.ts`

Append to the end of the file:

```typescript
// -------------------------------------------------------
// Phase 3C.5 — System Intelligence Detail Views
// -------------------------------------------------------

// Block 1 — getStructuredErrorById repo function (3 tests)
describe('Phase 3C.5 — getStructuredErrorById repo function', () => {
  const repoSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.repo.ts'
  )

  it('getStructuredErrorById is exported from structured-error.repo.ts', () => {
    expect(repoSource).toContain('getStructuredErrorById')
  })
  it('getStructuredErrorById enforces tenant isolation', () => {
    expect(repoSource).toContain('tenant_id')
  })
  it('getStructuredErrorById uses service client', () => {
    expect(repoSource).toContain('createSupabaseServiceClient')
  })
})

// Block 2 — error detail page: file and server component boundary (3 tests)
describe('Phase 3C.5 — error detail page: file and server component', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
  )

  it('error detail page file exists', () => {
    expect(pageSource).toBeTruthy()
  })
  it('error detail page is a server component (no use client)', () => {
    expect(pageSource).not.toContain("'use client'")
  })
  it('error detail page imports getStructuredErrorById', () => {
    expect(pageSource).toContain('getStructuredErrorById')
  })
})

// Block 3 — error detail page: field coverage (4 tests)
describe('Phase 3C.5 — error detail page: field coverage', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
  )

  it('detail page renders stack_trace field', () => {
    expect(pageSource).toContain('stack_trace')
  })
  it('detail page renders workflow_run_id field', () => {
    expect(pageSource).toContain('workflow_run_id')
  })
  it('detail page renders context field', () => {
    expect(pageSource).toContain('context')
  })
  it('detail page renders correlation_id field', () => {
    expect(pageSource).toContain('correlation_id')
  })
})

// Block 4 — error detail page: lifecycle actions (3 tests)
describe('Phase 3C.5 — error detail page: lifecycle actions', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
  )

  it('detail page includes resolveErrorAction', () => {
    expect(pageSource).toContain('resolveErrorAction')
  })
  it('detail page includes investigateErrorAction', () => {
    expect(pageSource).toContain('investigateErrorAction')
  })
  it('detail page includes ignoreErrorAction', () => {
    expect(pageSource).toContain('ignoreErrorAction')
  })
})

// Block 5 — list page: View link added (2 tests)
describe('Phase 3C.5 — system-intelligence list page: View link', () => {
  const pageSource = readProjectFile(
    'app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx'
  )

  it('list page links to error detail route', () => {
    expect(pageSource).toContain('system-intelligence/errors/')
  })
  it('list page uses error id in detail link', () => {
    expect(pageSource).toContain('err.id')
  })
})

// Block 6 — actions: dual revalidation (2 tests)
describe('Phase 3C.5 — structured-error actions: detail page revalidation', () => {
  const actionsSource = readProjectFile(
    'modules/intelligence/structured-errors/structured-error.actions.ts'
  )

  it('actions accept optional errorId for detail page revalidation', () => {
    expect(actionsSource).toContain('errorId')
  })
  it('actions revalidate detail page path when errorId is present', () => {
    expect(actionsSource).toContain('system-intelligence/errors')
  })
})

// Block 7 — guardrail: no new migrations (2 tests)
describe('Phase 3C.5 — Guardrail: no new migrations', () => {
  it('no Phase 3C.5 migration file exists', () => {
    const migrationsDir = path.join(process.cwd(), 'supabase/migrations')
    const files = fs.readdirSync(migrationsDir)
    const phase3c5Migrations = files.filter(f => f.includes('phase3c5'))
    expect(phase3c5Migrations).toHaveLength(0)
  })
  it('error detail page does not create new DB tables', () => {
    const pageSource = readProjectFile(
      'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
    )
    expect(pageSource).not.toContain('CREATE TABLE')
  })
})

// Block 8 — guardrail: no external services (1 test)
describe('Phase 3C.5 — Guardrail: no external services', () => {
  it('error detail page does not call external LLMs or Resend', () => {
    const pageSource = readProjectFile(
      'app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx'
    )
    expect(pageSource).not.toContain("'openai'")
    expect(pageSource).not.toContain("'@anthropic-ai")
    expect(pageSource).not.toContain('resend')
  })
})
```

---

## Post-Implementation Checklist

After all 5 steps are complete, run in order:

```
npx vitest run
```
Expected: **975/975 passed** (955 existing + 20 new)

```
npx next build
```
Expected: clean compile, no TypeScript errors, 33 routes (one new route added)

```
git status
```
Expected: 4 modified files + 1 created file:
- `modules/intelligence/structured-errors/structured-error.repo.ts`
- `modules/intelligence/structured-errors/structured-error.actions.ts`
- `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx`
- `app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx` ← new
- `tests/phase3c-system-intelligence.test.ts`

No migrations, no Vercel changes, no Resend imports.

---

## Commit Sequence (after QA approval)

```
git add modules/intelligence/structured-errors/structured-error.repo.ts
git add modules/intelligence/structured-errors/structured-error.actions.ts
git add "app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx"
git add "app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx"
git add tests/phase3c-system-intelligence.test.ts
git commit -m "Phase 3C.5: implement system intelligence error detail views"
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
| Detail page is server component only | In force — no `'use client'` |
| Tenant isolation enforced at repo layer | In force — `.eq('tenant_id', tenantId)` + `notFound()` on null |
| Staging remains deployable | In force |
| Tests stay green (975/975 target) | In force |
| Phase 3C.2 lifecycle actions preserved | In force — additive `errorId` field; existing callers unaffected |
