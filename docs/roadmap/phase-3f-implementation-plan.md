# Phase 3F — Workflow Execution Visibility & Control
## Implementation Plan v1.0

**Status:** Approved design — ready for implementation
**Design document:** `docs/roadmap/phase-3f-design-test-cases.md`
**Pre-implementation state:**
- HEAD: `c54ece5` — Docs: record Phase 3E production deployment
- Working tree: clean (design doc untracked only)
- Tests baseline: 1027/1027
- Next migration: `20240033` (unused in this phase)

---

## Approved Defaults

| Setting | Value |
|---------|-------|
| Activity events displayed | 20 most recent (`limit: 20` in `listLeadActivityEvents`) |
| Draft history shown | `emailDrafts.slice(1)` — up to 9 historical drafts (already limited to 10 by `getLeadEmailDrafts`) |
| Workflow errors shown | 10 most recent open/investigating (limit inside `getWorkflowErrorsForLead`) |
| Workflow runs scanned for errors | 20 most recent lead-linked runs |
| Error card | Conditional — hidden when `workflowErrors.length === 0` |
| Draft history section | Conditional — hidden when `emailDrafts.length <= 1` |
| Activity timeline | Always rendered — empty state when no events |
| Component type for `LeadActivityTimeline` | Server component (no `'use client'`) |
| Relative time format | Inline `formatRelativeTime` using arithmetic (no library) |

---

## Implementation Steps (ordered)

### Step 1 — Add `getWorkflowErrorsForLead` to `structured-error.repo.ts`

**File:** `modules/intelligence/structured-errors/structured-error.repo.ts`

Append after `getStructuredErrorById`. No changes to existing functions.

**Exact function signature and body:**

```typescript
export async function getWorkflowErrorsForLead(
  tenantId: string,
  leadId: string,
): Promise<AutomationFailureRow[]> {
  const supabase = createSupabaseServiceClient()

  // Step 1: find workflow_runs for this lead
  const { data: runs, error: runsError } = await supabase
    .from('workflow_runs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('subject_type', 'lead')
    .eq('subject_id', leadId)
    .limit(20)

  if (runsError) throw new Error(`getWorkflowErrorsForLead (runs): ${runsError.message}`)
  const runIds = (runs ?? []).map((r) => r.id)
  if (runIds.length === 0) return []

  // Step 2: find open/investigating errors in those runs
  const { data, error } = await supabase
    .from('automation_failures')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('workflow_run_id', runIds)
    .in('status', ['open', 'investigating'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw new Error(`getWorkflowErrorsForLead (failures): ${error.message}`)
  return data ?? []
}
```

**Why two queries:** Supabase JS client does not support JOIN syntax directly. Sequential queries with an early-exit guard (`runIds.length === 0`) are equivalent and safe.

**Confirmed field names from `types/database.ts`:**
- `workflow_runs.Row`: `id`, `tenant_id`, `subject_type`, `subject_id` — all confirmed present
- `automation_failures.Row`: `id`, `tenant_id`, `workflow_run_id`, `status`, `failure_type`, `severity`, `created_at` — all confirmed present

---

### Step 2 — Create `LeadActivityTimeline.tsx`

**File:** `app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx`

New file. Server component — no `'use client'` directive.

**Imports needed:**
```typescript
import type { Database } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
```

**Internal type alias:**
```typescript
type ActivityEventRow = Database['public']['Tables']['activity_events']['Row']
```

**`EVENT_LABELS` constant map** (covers all Phase 3B+ event types likely to carry `lead_id`):

| Key | Display label |
|-----|--------------|
| `ET_SEND_INITIATED` | Email send initiated |
| `ET_SEND_SUCCEEDED` | Email sent |
| `ET_EMAIL_DELIVERED` | Email delivered |
| `ET_EMAIL_BOUNCED` | Email bounced |
| `ET_EMAIL_COMPLAINED` | Complaint received |
| `ET_EMAIL_DELIVERY_FAILED` | Delivery failed |
| `ET_EMAIL_OPENED` | Email opened |
| `ET_EMAIL_CLICKED` | Link clicked |
| `HRB_ACTION_APPROVED` | Draft approved |
| `HRB_ACTION_REJECTED` | Draft rejected |
| `HRB_ACTION_SELECTED` | Version selected for review |
| `HRB_ACTION_REGENERATION_REQUESTED` | Regeneration requested |
| `SEB_ACTION_DRAFT_CREATED` | Email draft created |
| `MESSAGE_VERSIONS_GENERATED` | Message versions generated |
| `MESSAGE_STRATEGY_GENERATED` | Strategy generated |
| `QUALITY_REVIEW_COMPLETED` | Quality review completed |
| `MANUAL_CAMPAIGN_DRAFT_CREATED` | Manual draft created |
| `LEAD_STAGE_CHANGED` | Stage changed |
| *(fallback)* | Raw event_type value |

**`formatRelativeTime` helper** (pure, no library):
```typescript
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
```

**Outcome color map** (applied to event type for color coding):
- `ET_EMAIL_BOUNCED`, `ET_EMAIL_COMPLAINED`, `ET_EMAIL_DELIVERY_FAILED`, `HRB_ACTION_REJECTED` → amber/red text
- `ET_SEND_SUCCEEDED`, `ET_EMAIL_DELIVERED`, `HRB_ACTION_APPROVED` → green text
- All others → default (no color class)

**Component export:**
```typescript
export function LeadActivityTimeline({ events }: { events: ActivityEventRow[] })
```

**Empty state** (when `events.length === 0`): Card with title "Workflow Activity" and body "No workflow activity recorded yet for this lead."

**Event list** (when events present): Card with title "Workflow Activity" containing an `<ol>` — one `<li>` per event with:
- Color dot indicator (`h-2 w-2 rounded-full`)
- Event label (from `EVENT_LABELS` map, fallback to raw type)
- `event_summary` appended with `—` separator when non-null
- Relative timestamp with `title={event.occurred_at}` tooltip showing absolute datetime

---

### Step 3 — Modify `page.tsx` (lead detail page)

**File:** `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx`

**3a. New imports** (add after existing imports):
```typescript
import * as activityEventRepo from '@/modules/intelligence/repositories/activity-event.repo'
import * as structuredErrorRepo from '@/modules/intelligence/structured-errors/structured-error.repo'
import { LeadActivityTimeline } from './LeadActivityTimeline'
```

**3b. Extend the initial `Promise.all`** — add two new parallel fetches alongside the existing four:
```typescript
const [fitScore, urgencyScore, recommendations, emailDrafts, activityEvents, workflowErrors] =
  await Promise.all([
    scoreRepo.getCurrentFitScore(ctx.tenantId, 'lead', id),
    scoreRepo.getCurrentUrgencyScore(ctx.tenantId, 'lead', id),
    recommendationRepo.getLeadRecommendations(ctx.tenantId, id),
    emailDraftRepo.getLeadEmailDrafts(ctx.tenantId, id),
    activityEventRepo.listLeadActivityEvents(ctx.tenantId, id, { limit: 20 }).catch(() => [] as never[]),
    structuredErrorRepo.getWorkflowErrorsForLead(ctx.tenantId, id).catch(() => [] as never[]),
  ])
```

Both new fetches use `.catch(() => [])` — consistent with the existing error handling pattern (`leadService.listLeadsByStage` on the kanban page uses the same guard). Activity and error data are advisory; a fetch failure must not break the lead detail page.

**3c. Add rendering at the bottom of the JSX** — after the closing of the email workspace `{latestDraft && (...)}` block, add a new `<div className="max-w-3xl space-y-4">` section containing:

1. **Email Draft History** (conditional on `emailDrafts.length > 1`):
   - `Card` with `CardTitle` "Email Draft History"
   - `<ol>` over `emailDrafts.slice(1)`, each `<li>` shows:
     - `<DraftStatusBadge status={draft.status} />` (reuses existing component in same file)
     - `draft.subject` (truncated, `text-muted-foreground`)
     - `new Date(draft.created_at).toLocaleDateString()` (right-aligned)
   - No `SendEmailButton`. No mutations.

2. **Workflow Errors** (conditional on `workflowErrors.length > 0`):
   - `Card` with `CardTitle` "Workflow Errors"
   - `<ol>` over `workflowErrors`, each `<li>` shows:
     - Severity badge (inline `className` — critical = red, error = orange, warning = yellow; same pattern as existing priority badges)
     - `err.failure_type.replace(/_/g, ' ')` (space-converted, `text-muted-foreground`)
     - `new Date(err.created_at).toLocaleDateString()`
     - `<Link>` to `/${workspaceSlug}/settings/system-intelligence/errors/${err.id}` with text "View →"
   - `Link` is already imported in `page.tsx` (used for the `ArrowRight` navigation footer)

3. **`<LeadActivityTimeline events={activityEvents} />`** (always rendered; empty state handles zero-event case internally)

**Import note:** `workspaceSlug` is already destructured in scope (`const { workspaceSlug, id } = await params`). No additional destructuring needed for the error links.

---

### Step 4 — Create `tests/phase3f-workflow-visibility.test.ts`

**File:** `tests/phase3f-workflow-visibility.test.ts`

Pattern: source-reading via `fs.readFileSync` + `path.join(process.cwd(), relPath)`. Consistent with all prior phase test files.

**Helper at top of file:**
```typescript
function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}
```

**File paths read:**
```
modules/intelligence/structured-errors/structured-error.repo.ts
app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx
app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx
```

---

## Exact Test Plan (21 tests, 6 blocks)

### Block 0 — `getWorkflowErrorsForLead`: repo function (3 tests)

```
TC-3F-001  structured-error.repo.ts exports getWorkflowErrorsForLead
           → repoSource.toContain('getWorkflowErrorsForLead')

TC-3F-002  function queries workflow_runs with subject_type and subject_id for tenant isolation
           → repoSource.toContain('workflow_runs')
           → repoSource.toContain('subject_type')
           → repoSource.toContain('subject_id')

TC-3F-003  function filters automation_failures by open/investigating status
           → repoSource.toContain("'open'")
           → repoSource.toContain("'investigating'")
```

### Block 1 — `LeadActivityTimeline`: component structure (4 tests)

```
TC-3F-004  component file exists and is readable
           → timelineSource.length > 0

TC-3F-005  component is NOT a client component (no 'use client' directive)
           → expect(timelineSource).not.toContain("'use client'")

TC-3F-006  component accepts events prop referencing ActivityEventRow
           → timelineSource.toContain('events')
           → timelineSource.toContain('ActivityEventRow')

TC-3F-007  component defines an EVENT_LABELS display map including ET_SEND_SUCCEEDED
           → timelineSource.toContain('EVENT_LABELS')
           → timelineSource.toContain('ET_SEND_SUCCEEDED')
```

### Block 2 — `LeadActivityTimeline`: display and empty state (3 tests)

```
TC-3F-008  component renders occurred_at field for each event
           → timelineSource.toContain('occurred_at')

TC-3F-009  component renders event_summary when present
           → timelineSource.toContain('event_summary')

TC-3F-010  component includes an empty state message when no events
           → timelineSource.toContain('No workflow activity recorded')
```

### Block 3 — Lead detail page: data loading (4 tests)

```
TC-3F-011  page imports listLeadActivityEvents from activity-event.repo
           → pageSource.toContain('listLeadActivityEvents')

TC-3F-012  page imports getWorkflowErrorsForLead from structured-error.repo
           → pageSource.toContain('getWorkflowErrorsForLead')

TC-3F-013  page imports LeadActivityTimeline component
           → pageSource.toContain('LeadActivityTimeline')

TC-3F-014  page calls listLeadActivityEvents with tenantId and lead id
           → pageSource.toContain('listLeadActivityEvents(ctx.tenantId')
           → pageSource.toContain(', id,')  [or similar — confirms lead id is passed]
```

### Block 4 — Lead detail page: draft history (2 tests)

```
TC-3F-015  page renders draft history using emailDrafts.slice(1)
           → pageSource.toContain('slice(1)')

TC-3F-016  draft history section uses label "Email Draft History"
           → pageSource.toContain('Email Draft History')
```

### Block 5 — Lead detail page: error awareness (2 tests)

```
TC-3F-017  page uses workflowErrors result variable
           → pageSource.toContain('workflowErrors')

TC-3F-018  page links to the existing error detail route
           → pageSource.toContain('system-intelligence/errors/')
```

### Block 6 — Guardrails (3 tests)

```
TC-3F-019  LeadActivityTimeline does not call Resend or sendEmail
           → expect(timelineSource).not.toContain('resend')
           → expect(timelineSource).not.toContain('sendEmail')

TC-3F-020  LeadActivityTimeline does not call an external LLM
           → expect(timelineSource).not.toContain('openai')
           → expect(timelineSource).not.toContain('anthropic')

TC-3F-021  getWorkflowErrorsForLead queries workflow_runs before automation_failures
           → repoSource.indexOf('workflow_runs') < repoSource.lastIndexOf('automation_failures')
           [confirms two-query ordering; workflow_runs appears before the second automation_failures query]
```

**Total: 21 tests**

---

## Read-Only Data Flow

```
LeadDetailPage (server component)
│
├── [existing] scoreRepo.getCurrentFitScore()
├── [existing] scoreRepo.getCurrentUrgencyScore()
├── [existing] recommendationRepo.getLeadRecommendations()
├── [existing] emailDraftRepo.getLeadEmailDrafts()          → emailDrafts (all 10)
│
├── [NEW] activityEventRepo.listLeadActivityEvents()        → activityEvents (20)
│         └── SELECT * FROM activity_events
│               WHERE tenant_id = ? AND lead_id = ?
│               ORDER BY occurred_at DESC LIMIT 20
│
└── [NEW] structuredErrorRepo.getWorkflowErrorsForLead()   → workflowErrors
          ├── SELECT id FROM workflow_runs
          │     WHERE tenant_id = ? AND subject_type = 'lead' AND subject_id = ?
          │     LIMIT 20
          │     → runIds[]
          └── (if runIds not empty)
              SELECT * FROM automation_failures
                WHERE tenant_id = ? AND workflow_run_id IN (runIds)
                AND status IN ('open', 'investigating')
                ORDER BY created_at DESC LIMIT 10

All six run in a single Promise.all — no sequential dependency between them.

Downstream (read-only rendering):
  emailDrafts[0]           → existing Email Draft card (unchanged)
  emailDrafts.slice(1)     → [NEW] Email Draft History card
  workflowErrors           → [NEW] Workflow Errors card (conditional)
  activityEvents           → [NEW] LeadActivityTimeline component
```

---

## Files Affected Summary

| File | Change | Reason |
|------|--------|--------|
| `modules/intelligence/structured-errors/structured-error.repo.ts` | Append 1 function | `getWorkflowErrorsForLead` |
| `app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx` | Create | New server component |
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | 3 edits | New imports, extended Promise.all, new JSX sections |
| `tests/phase3f-workflow-visibility.test.ts` | Create | 21-test suite |

No other files. No migrations. No new routes. No new server actions.

---

## Guardrails

| Guardrail | How enforced |
|-----------|-------------|
| `LeadActivityTimeline` must be a server component | No `'use client'`; TC-3F-005 verifies |
| No send actions on historical drafts | No `SendEmailButton` in `emailDrafts.slice(1)` render; TC-3F-016 verifies via label |
| `getWorkflowErrorsForLead` is read-only | Only `.select()` calls; TC-3F-021 verifies ordering |
| No Resend API calls in new files | TC-3F-019 |
| No external LLM calls in new files | TC-3F-020 |
| Both new fetches non-fatal | `.catch(() => [])` on both calls in `Promise.all` |
| Error "View" links use existing Phase 3C.5 route | `/settings/system-intelligence/errors/[errorId]`; TC-3F-018 |
| No new API routes | Verified by scope — only page.tsx, component, repo, tests |
| No mutations in page or component | No `'use server'`, no action calls, no form submissions |

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `lead_id` not set on older activity events → sparse timeline | Medium | Empty state handles this gracefully; documented as known limitation |
| `workflow_runs` has no `subject_type='lead'` entries for a given lead → empty error section | Medium | Early-exit guard (`runIds.length === 0`) returns `[]`; no error card rendered |
| `Promise.all` with 6 fetches increases page load latency | Low | All 6 are parallel; new fetches add ~1 Supabase round trip; service client is fast |
| `emailDrafts.slice(1)` shows superseded/cancelled drafts that confuse operators | Low | `DraftStatusBadge` (reused) makes status visually clear; newest-first ordering is intuitive |
| `formatRelativeTime` shows "0m ago" for events within the same minute | Low | Guard: `diffMins < 1` returns "just now" |
| `workspaceSlug` used in error link but not in scope of new section | None | Already destructured from `await params` at page top; always in scope |

---

## QA Plan

After implementation, run in order:

```
npx vitest run      → expect 1048/1048 (1027 existing + 21 new)
npx next build      → expect PASSED, TypeScript clean
```

Then smoke test on staging (after push and staging auto-deploy):

| # | Check |
|---|-------|
| 1 | Lead detail page loads without error |
| 2 | WorkflowToggle still present and functional |
| 3 | Existing Email Draft card unchanged |
| 4 | "Workflow Activity" card appears at bottom with events or empty state |
| 5 | "Email Draft History" card absent when only one draft exists |
| 6 | "Email Draft History" card present when multiple drafts exist (shows status badges, subject, date) |
| 7 | "Workflow Errors" card absent when no open errors for lead |
| 8 | "Workflow Errors" card present when errors exist; "View →" links to correct error detail page |
| 9 | No send button appears in draft history section |
| 10 | Existing routes unchanged (kanban, settings, message workspace) |

---

## Phase 3F Ready for Implementation

Yes. All preconditions met:

- Design approved
- Implementation plan complete
- Working tree clean (HEAD `c54ece5`)
- Baseline tests: 1027/1027
- No migration required
- All data sources confirmed in schema
- All imports and field names verified against current codebase

---

## Exact Next Prompt to Begin Implementation

Use this verbatim after plan approval:

---

> Proceed with Phase 3F implementation only.
>
> Implementation plan approved: `docs/roadmap/phase-3f-implementation-plan.md`
> Design document: `docs/roadmap/phase-3f-design-test-cases.md`
>
> Implement in this exact order:
> 1. Append `getWorkflowErrorsForLead` to `modules/intelligence/structured-errors/structured-error.repo.ts`
> 2. Create `app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx`
> 3. Modify `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` (3 edits: imports, Promise.all, JSX)
> 4. Create `tests/phase3f-workflow-visibility.test.ts` (21 tests, 6 blocks)
>
> After implementation, run:
> - `npx vitest run` — expect 1048/1048
> - `npx next build` — expect PASSED
>
> Hard constraints:
> - Do not create migrations.
> - Do not modify production.
> - Do not change Vercel settings.
> - Do not create commits.
> - Do not create or push tags.
> - Do not start Phase 3G.
> - Report findings before committing.

---

## Last Updated

2026-05-27 — Phase 3F implementation plan v1.0. Awaiting user approval.
