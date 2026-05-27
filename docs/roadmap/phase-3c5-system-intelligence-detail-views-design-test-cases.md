# Phase 3C.5 — System Intelligence Detail Views
## Design & Test Cases v1.0

**Date:** 2026-05-26
**Status:** DRAFT — awaiting user approval before any implementation plan or code is written
**Author:** Claude (AI context recovery from Phase 3C.4 lock)
**Design doc version:** v1.0

---

## 1. Objective

Add an operator-friendly detail page for each structured error surfaced on the System Intelligence page. The detail page exposes all available metadata for a single `automation_failures` row — including fields that are currently truncated or hidden entirely (stack trace, correlation ID, workflow run ID, job execution ID, payload snapshot, context jsonb) — in a readable, structured layout.

Preserve the existing Resolve / Investigate / Ignore lifecycle actions on the detail page. No new actions, no new tables, no new migrations.

---

## 2. Problem Being Solved

### Current gap

The Critical & Open Errors table on `/settings/system-intelligence` shows 5 visible columns:

| Column | Note |
|--------|------|
| Type (`failure_type`) | Full |
| Severity | Badge |
| Module | Full |
| Message (`error_message`) | Truncated — `max-w-xs truncate` |
| Created | Full |

The following fields on `automation_failures` are **never shown** in the current UI:

| Field | Relevance |
|-------|-----------|
| `error_code` | Machine-readable error category |
| `stack_trace` | Essential for diagnosing import and workflow failures |
| `route` | Which API route triggered the failure |
| `correlation_id` | Links to a request trace |
| `workflow_run_id` | FK to the workflow run that failed (populated by Phase 3C.4) |
| `job_execution_id` | FK to a job execution (reserved for future phases) |
| `context` | Structured jsonb — outbox failures store `event_id`, `event_type`, `attempts` here |
| `payload_snapshot` | The request payload at time of failure |
| `resolved_at` | When the error was resolved |
| `resolved_by` | Who resolved it (user ID, if set) |
| `status` (current) | Only actions (not the current status label) appear on the list |

### Impact of the gap

An operator investigating a Phase 3C.4 outbox failure sees `OUTBOX_EVENT_DISPATCH_FAILED` in the table but cannot see the `event_id`, `event_type`, or `attempts` stored in the `context` field without querying the database directly.

An operator investigating a workflow failure sees the error message but not the `workflow_run_id` needed to correlate with the agent monitor or database.

Import failures store a `stack_trace` and `payload_snapshot` at commit time — not accessible from the UI.

### What Phase 3C.5 adds

A new detail page at `/[workspaceSlug]/settings/system-intelligence/errors/[errorId]` that shows all available fields for a single error row. The list table gets a "View" link per row. All existing lifecycle actions remain functional on the detail page.

---

## 3. System Boundary

**One new route. One new repo function. Two modified files.**

| Change | Description |
|--------|-------------|
| New route | `app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx` |
| New repo function | `getStructuredErrorById(id, tenantId)` in `structured-error.repo.ts` |
| Modified: list page | Add "View" link per row in Critical & Open Errors table |
| Modified: actions | Add revalidation of detail page path when lifecycle action is taken from detail page |
| Append tests | `tests/phase3c-system-intelligence.test.ts` |

The detail page is a **server component** and is **read-only except for the existing lifecycle actions** (Resolve / Investigate / Ignore).

---

## 4. What Is Explicitly Out of Scope

| Item | Reason |
|------|--------|
| Pagination / filtering / search on the error list | Not requested; not justified by current volume |
| Editing error fields (error_message, severity, module, etc.) | Errors are immutable records; lifecycle status is the only mutable field |
| Auto-resolve when a workflow run completes | Future phase (Phase 3C.4 open question 2) |
| Reconciler back-fill for pre-3C.4 workflow failures | Future phase (Phase 3C.4 open question 1) |
| Recommendation detail view | Not included in this phase; existing recommendations table is sufficient for now |
| Email sending, Resend | Never in scope |
| External LLM calls | Never in scope |
| New migrations | Not required — all data is in existing `automation_failures` columns |
| New lifecycle actions beyond Resolve / Investigate / Ignore | Not in scope |
| `resolved_by` population | The column exists in the schema but no user identity is passed to `resolveStructuredError` today; out of scope to fix |

---

## 5. Relationship to Prior Phases

### Phase 3C.1 — Structured Errors + System Intelligence Foundation

Phase 3C.1 created `automation_failures` with all the columns Phase 3C.5 will display. `getStructuredErrorById` reads from the same table using the same service client pattern as the existing `listOpenErrors` and `getErrorStats` functions.

### Phase 3C.2 — Structured Error Lifecycle Actions

Phase 3C.2 created `resolveErrorAction`, `investigateErrorAction`, and `ignoreErrorAction`. Phase 3C.5 reuses these actions on the detail page without modification (except adding a second `revalidatePath` call for the detail route — see Section 10).

### Phase 3C.3 — System Intelligence Recommendation Generator

No interaction. Recommendations are not shown on the error detail page.

### Phase 3C.4 — Workflow & Outbox Error Emission

Phase 3C.4 emits errors with `workflow_run_id` (for workflow failures) and `context: { event_id, event_type, attempts }` (for outbox failures). The detail page is the first place these fields are surfaced in the UI.

---

## 6. Proposed Architecture

```
/settings/system-intelligence           ← existing list page (modified: + "View" link)
         │
         └─ /errors/[errorId]           ← new detail page (Phase 3C.5)
               │
               ├─ getStructuredErrorById(id, tenantId)    ← new repo function
               │     supabase.from('automation_failures').select('*').eq('id').eq('tenant_id')
               │
               ├─ notFound() if row is null               ← tenant-safe 404
               │
               ├─ All fields rendered in structured layout
               │
               └─ Lifecycle actions (resolve / investigate / ignore)
                     └─ revalidatePath(listPath)          ← existing
                     └─ revalidatePath(detailPath)        ← added in Phase 3C.5
```

**Revalidation strategy:** The lifecycle server actions currently revalidate only the list page path. When called from the detail page, they must also revalidate the detail page path so the updated status is reflected immediately. The `workspaceSlug` and `errorId` are already available as form fields. Adding `errorId` as an optional hidden input to the lifecycle action forms on the detail page allows the action to compute and revalidate both paths.

---

## 7. Structured Error Detail View Model

The detail page fetches the full `AutomationFailureRow` and renders all populated fields.

### Layout

```
← Back to System Intelligence

[ failure_type ]    [ severity badge ]    [ status badge ]
Created: {created_at}

─── Error Details ─────────────────────────────────────────

  Module       {module ?? '—'}
  Route        {route ?? '—'}
  Error Code   {error_code ?? '—'}
  Message      {error_message ?? '—'}   (full, not truncated)

─── Correlation & Tracing ─────────────────────────────────

  Correlation ID      {correlation_id ?? '—'}
  Workflow Run ID     {workflow_run_id ?? '—'}
  Job Execution ID    {job_execution_id ?? '—'}

─── Context ───────────────────────────────────────────────
  (only rendered if context is non-empty `{}`)
  { JSON pretty-printed }

─── Payload Snapshot ──────────────────────────────────────
  (only rendered if payload_snapshot is non-empty `{}`)
  { JSON pretty-printed }

─── Stack Trace ───────────────────────────────────────────
  (only rendered if stack_trace is not null)
  { monospaced pre block }

─── Resolution ────────────────────────────────────────────
  (only rendered if resolved = true)
  Resolved at  {resolved_at}
  Resolved by  {resolved_by ?? '—'}

─── Actions ───────────────────────────────────────────────
  (only rendered if status is 'open' or 'investigating')
  [ Resolve ]  [ Investigate ]  [ Ignore ]
```

### Field rendering rules

| Field | Render when |
|-------|-------------|
| `error_message` | Always (shows '—' if null) |
| `module` | Always (shows '—' if null) |
| `route` | Always (shows '—' if null) |
| `error_code` | Always (shows '—' if null) |
| `correlation_id` | Always (shows '—' if null) |
| `workflow_run_id` | Always (shows '—' if null) |
| `job_execution_id` | Always (shows '—' if null) |
| `context` | Only if not `{}` (empty jsonb) |
| `payload_snapshot` | Only if not `{}` (empty jsonb) |
| `stack_trace` | Only if not null |
| `resolved_at` / `resolved_by` | Only if `resolved = true` |
| Lifecycle actions | Only if `status IN ('open', 'investigating')` |

---

## 8. Recommendation Detail View

Not included in Phase 3C.5. The Pending System Recommendations table already shows title, type, severity, source, and created date. A recommendation detail view can be addressed in a future phase if needed.

---

## 9. Data Model Impact

**No new migrations required.**

All fields Phase 3C.5 will display are existing columns on `automation_failures` (created in Phase 3C.1, migration `20240028`). No new columns, no schema changes. Next available migration number remains `20240032`.

---

## 10. Repository / Service / Module Impact

### Files modified or created

| File | Change |
|------|--------|
| `modules/intelligence/structured-errors/structured-error.repo.ts` | Add `getStructuredErrorById(id, tenantId): Promise<AutomationFailureRow \| null>` |
| `modules/intelligence/structured-errors/structured-error.actions.ts` | Add optional `errorId` form-field handling; add `revalidatePath` for detail page when `errorId` is present |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` | Add "View" link per row in Critical & Open Errors table |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx` | **New file** — server component detail page |
| `tests/phase3c-system-intelligence.test.ts` | Append Phase 3C.5 tests |

### Files unchanged

| File | Reason |
|------|--------|
| `structured-error.service.ts` | No new service functions needed; repo function is sufficient for a simple by-ID fetch |
| `structured-error.types.ts` | No new types needed |
| `system-recommendation.service.ts` | Not involved |
| `GenerateRecsButton.tsx` | Not involved |

### `getStructuredErrorById` — repo function shape

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

Returns `null` on any error (including row-not-found or wrong-tenant). The detail page calls `notFound()` if `null` is returned.

### Lifecycle action revalidation change

Current `resolveErrorAction` (representative example):
```typescript
revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
```

Phase 3C.5 addition (optional second revalidation when called from detail page):
```typescript
const errorId = formData.get('errorId') as string | null
revalidatePath(`/${workspaceSlug}/settings/system-intelligence`)
if (errorId) {
  revalidatePath(`/${workspaceSlug}/settings/system-intelligence/errors/${errorId}`)
}
```

This is a minimal additive change: existing callers (list page forms) that don't include `errorId` are unaffected.

---

## 11. UI Impact

### List page change (additive)

Add a "View" link in the final column of each error row in the Critical & Open Errors table:

```tsx
<td className="p-3">
  <Link
    href={`${base}/settings/system-intelligence/errors/${err.id}`}
    className="text-xs text-primary hover:underline"
  >
    View
  </Link>
</td>
```

The existing action column (Resolve / Investigate / Ignore) is unchanged. The "View" link is added as a separate cell or grouped in the actions cell.

### Detail page (new server component)

No `'use client'` in the detail page. The page:
- Fetches the row via `getStructuredErrorById` using the service client (tenant-scoped)
- Calls `notFound()` if the row is null
- Renders all fields in a structured card-based layout (consistent with existing pages)
- Renders lifecycle action forms if `status IN ('open', 'investigating')`
- Renders a back-link to `/${workspaceSlug}/settings/system-intelligence`

---

## 12. Navigation Impact

### New route

`/[workspaceSlug]/settings/system-intelligence/errors/[errorId]`

This is a new dynamic segment under the existing System Intelligence route. No sidebar entry required — the route is accessed via the "View" link from the list.

### Back navigation

The detail page includes a back-link rendered as a standard `<Link>` (not `router.back()`), pointing explicitly to `/${workspaceSlug}/settings/system-intelligence`. This is reliable in a server component context.

### Route count impact

The new route adds 1 to the compiled route count (`npx next build` currently shows 32 routes). After Phase 3C.5 the expected count is 33.

---

## 13. Event / Logging / Observability Impact

No new `ActivityEventType` constants. The existing lifecycle activity events (`SE_ERROR_RESOLVED`, `SE_ERROR_INVESTIGATING`, `SE_ERROR_IGNORED`) already record the `errorId` when emitted from the detail page — no additional observability is needed.

The detail page navigation itself is not logged.

---

## 14. Security / RLS Implications

`getStructuredErrorById` uses the Supabase service client (`createSupabaseServiceClient()`), consistent with all other structured error reads. Tenant isolation is enforced by the `.eq('tenant_id', tenantId)` clause — a row belonging to a different tenant returns `null` and triggers `notFound()`. No cross-tenant data exposure is possible.

The detail page requires `requirePermission(ctx, 'crm.companies.view')`, same permission as the list page.

No new RLS policies are needed.

---

## 15. Staging / Production Safety

| Concern | Mitigation |
|---------|-----------|
| No new migrations | Nothing to apply to staging or production Supabase |
| Server component only | No client-side data fetching; no API routes exposing error data |
| Tenant isolation enforced at repo layer | `notFound()` on null result prevents any leakage |
| Staging auto-deploys from master | Every push will deploy to staging; production remains manual-only |
| New route is additive | No existing routes modified |

---

## 16. Test Strategy

All tests use `fs.readFileSync` source-code assertions via the existing `readProjectFile` helper in `tests/phase3c-system-intelligence.test.ts`. No Supabase mocking required.

Tests are appended to the existing Phase 3C test file, consistent with Phase 3C.1 / 3C.2 / 3C.3 / 3C.4 precedent.

**Expected test baseline after Phase 3C.5:** 975/975 (955 existing + 20 new)

---

## 17. Specific Test Cases

### Block 1 — `getStructuredErrorById` repo function (3 tests)

```typescript
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
```

### Block 2 — detail page: file and server component boundary (3 tests)

```typescript
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
```

### Block 3 — detail page: field coverage (4 tests)

```typescript
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
```

### Block 4 — detail page: lifecycle actions preserved (3 tests)

```typescript
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
```

### Block 5 — list page: View link added (2 tests)

```typescript
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
```

### Block 6 — actions: dual revalidation (2 tests)

```typescript
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
```

### Block 7 — guardrail: no new migrations (2 tests)

```typescript
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
```

### Block 8 — guardrail: no external services (1 test)

```typescript
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

**Total: 20 test cases across 8 describe blocks.**

---

## 18. Risks and Open Questions

### Risk 1 — `resolved_by` is always null

The `automation_failures.resolved_by` column exists in the schema but `resolveStructuredError` in the repo does not populate it (it sets `resolved = true` and `resolved_at` but not `resolved_by`). The detail page will show `resolved_by: —` for all resolved errors. This is consistent with current behavior and is not a regression, but it may surprise operators.

**Mitigation:** Document as a known limitation on the detail page. Fixing `resolved_by` population is deferred to a future phase (would require passing `ctx.userId` through to the repo call).

### Risk 2 — `context` jsonb formatting for large payloads

If `context` or `payload_snapshot` is very large, `JSON.stringify(value, null, 2)` in a `<pre>` block could produce a very long page. For import failures, `payload_snapshot` could be large.

**Mitigation:** For v1, render jsonb as-is with `overflow-auto max-h-64` to cap the visible height. No truncation of the actual data.

### Risk 3 — `notFound()` vs. access-denied for cross-tenant IDs

If an operator constructs a URL with a valid error ID from a different tenant, `getStructuredErrorById` returns `null` (because `.eq('tenant_id', tenantId)` filters it out) and the page renders a 404. This is the correct behavior and does not leak the existence of the row in another tenant.

### Open Question 1 — Should lifecycle actions on the detail page redirect to the list or stay on the detail page?

**Option A:** Stay on detail page, re-render with updated status. Requires dual `revalidatePath` (proposed in Section 10).
**Option B:** Redirect to list page after action. Simpler (no actions file change needed), but loses context.

**Recommendation:** Option A — stay on detail page with updated status. Operators investigating errors will want to confirm the status change without losing the detail context.

### Open Question 2 — Add `status` column to list table?

Currently the list shows Resolve / Investigate / Ignore buttons without displaying the current status. Errors that are `investigating` still appear in the list (because the filter includes `status IN ('open', 'investigating')`). An operator might benefit from seeing the status badge in the list.

**Recommendation:** Defer to Phase 3C.5 implementation plan — add `status` badge column to the list as part of the same scope if it fits cleanly.

### Open Question 3 — Show errors beyond status `open`/`investigating` on the detail page?

The current list only shows `open` and `investigating` errors. A direct URL to a `resolved` or `ignored` error's detail page would still work (the repo fetches by ID + tenant_id without status filter). The detail page would render correctly but would show no lifecycle actions.

**Recommendation:** Allow this — the detail page is useful for reviewing resolved errors too. If accessed directly, it shows all fields but no action buttons.

---

## 19. Approval Checkpoint

This document must be approved before an implementation plan or any code is written.

**Decisions requiring explicit user approval:**

| Decision | Default / Proposal |
|----------|-------------------|
| Route path for detail view | Proposed: `/settings/system-intelligence/errors/[errorId]` |
| Lifecycle action revalidation strategy | Proposed: Option A — stay on detail page with dual `revalidatePath` |
| `status` column in list table | Proposed: defer to implementation plan — add if it fits cleanly |
| Access to resolved/ignored errors via direct URL | Proposed: allowed — no status filter on `getStructuredErrorById` |
| Test count | 20 tests (Blocks 1–8 above) |
| Test baseline target | 975/975 (955 + 20) |

**After approval, follow this sequence:**
```
Implementation Plan → approval → Code → vitest run → next build → Commit → Tag → AI context update → Push
```
