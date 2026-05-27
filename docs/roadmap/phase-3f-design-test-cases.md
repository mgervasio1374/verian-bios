# Phase 3F — Workflow Execution Visibility & Control
## Design & Test Cases v1.0

**Status:** Proposed — awaiting user approval before implementation planning begins
**Depends on:** Phase 3E complete and production-deployed (`48bfbbb`, tag `phase-3e-lead-workflow-control-v1`)
**Next migration available:** `20240033`

---

## Problem Statement

Phase 3E gave operators a toggle to enable/disable the AI outbound workflow per lead. But after toggling a lead on, there is no visibility into what happened next. The lead detail page shows:
- the current draft (if one exists)
- scores and a recommendation
- the workflow toggle

It does not show: what the workflow has done, when it ran, whether emails were sent or bounced, whether drafts were approved or rejected, or whether any errors occurred. Operators are flying blind after enabling workflow.

---

## Design Goals

| Goal | Scope |
|------|-------|
| 1 | Make workflow activity visible at the lead level |
| 2 | Show what happened after workflow was enabled (chronological trail) |
| 3 | Surface recent activity events, draft history, and lead-linked errors |
| 4 | Add safe operator controls where appropriate (links, not new actions) |
| 5 | Do not rebuild the email engine or add new send paths |
| 6 | Do not add automatic sending or external automation changes |

---

## Data Inventory (from code inspection)

### Already available, unused on lead detail page

| Data | Source | Gap |
|------|--------|-----|
| Lead activity events | `activity-event.repo.ts` — `listLeadActivityEvents(tenantId, leadId)` | Function exists; never called from lead detail page |
| Full draft history | `email-draft.repo.ts` — `getLeadEmailDrafts` returns up to 10 | Only `drafts[0]` is used; `drafts[1..]` are silently dropped |
| Lead recommendations (all statuses) | `recommendation.repo.ts` — `getLeadRecommendations` | Only pending/accepted shown; superseded and dismissed history not surfaced |

### Reachable via new read-only query (no migration)

| Data | Path | Query strategy |
|------|------|----------------|
| Structured errors for a lead | `workflow_runs (subject_type='lead', subject_id=leadId)` → `automation_failures (workflow_run_id IN run_ids)` | Two sequential queries; no join syntax needed; no migration |

### Not reachable without migration

| Data | Why |
|------|-----|
| Email send outcomes linked directly to a lead | `email_sends` has no `lead_id` column; reachable only through `draft_id → email_drafts.lead_id` (acceptable indirect path) |
| `automation_failures.lead_id` direct filter | Column does not exist; workflow_run join is the alternative |

### Confirmed schema facts

- `activity_events.lead_id` — exists; `listLeadActivityEvents` queries on it
- `automation_failures.workflow_run_id` — exists; `workflow_runs.subject_type/subject_id` exist
- `agent_recommendations.subject_type/subject_id` — exists; `getLeadRecommendations` queries on it
- `email_drafts.lead_id` — exists; `getLeadEmailDrafts` queries on it

---

## Phase 3F Scope

### Part A — Lead Workflow Activity Timeline

**What:** A new server component `LeadActivityTimeline.tsx` rendered at the bottom of the lead detail page, showing recent activity events tied to the lead in reverse chronological order.

**Data source:** `listLeadActivityEvents(tenantId, leadId, { limit: 20 })` — already implemented in `activity-event.repo.ts`. No new repo function needed.

**Display fields per event:**
- Event type label (human-readable; mapped from constant — see label map below)
- `occurred_at` formatted as relative time ("2 hours ago") with tooltip showing absolute
- `event_summary` when present
- Status color indicator (send success = green, bounce/complaint/fail = amber/red, neutral = gray)

**Event type label map** (defined inside `LeadActivityTimeline.tsx`):

| Constant | Display label |
|----------|--------------|
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
| All others | Raw event type (fallback) |

**Component signature:**

```typescript
// server component — no 'use client'
interface LeadActivityTimelineProps {
  events: ActivityEventRow[]
}
export function LeadActivityTimeline({ events }: LeadActivityTimelineProps)
```

Data is loaded in `page.tsx` and passed as props. The component itself is stateless and pure.

**Empty state:** "No workflow activity recorded yet for this lead."

**No new actions, buttons, or mutations.** Read-only.

**Known risk:** `lead_id` is populated on activity events only when the upstream service call passes it. Some earlier Phase 3B events (pre-Phase 3B.1) may not have `lead_id` set, making them invisible in the timeline. This is acceptable — the timeline shows what is recorded; it does not claim to be exhaustive.

---

### Part B — Draft History

**What:** Surface the draft history that is already fetched (up to 10 drafts via `getLeadEmailDrafts`) but currently dropped after `drafts[0]`.

**Where:** A new "Draft History" section below the current Email Draft card, visible only when `emailDrafts.length > 1`.

**Display per row:**
- Status badge (sent, approved, superseded, cancelled, rejected)
- Subject line (truncated)
- Created at date
- No send button — historical drafts are read-only

**Implementation:** Inline in `page.tsx` as a JSX block using `emailDrafts.slice(1)`. No new component file needed if the rendering is simple.

**No new repo functions.** `getLeadEmailDrafts` already returns up to 10 drafts.

**No mutations, no actions.** Read-only display only.

---

### Part C — Lead-Linked Error Awareness

**What:** A warning card on the lead detail page listing open structured errors connected to workflow runs for this lead.

**Data path:** `workflow_runs (subject_type='lead', subject_id=leadId)` → `automation_failures (workflow_run_id IN run_ids, status IN ['open', 'investigating'])`

**New repo function:** `getWorkflowErrorsForLead(tenantId: string, leadId: string): Promise<AutomationFailureRow[]>` added to `structured-error.repo.ts`.

Implementation strategy — two sequential queries, no JOIN syntax required:
1. Query `workflow_runs WHERE subject_type='lead' AND subject_id=leadId AND tenant_id=tenantId`, select `id` only, limit 20
2. If run IDs found: query `automation_failures WHERE workflow_run_id IN (runIds) AND tenant_id=tenantId AND status IN ['open', 'investigating']`, limit 10
3. If no run IDs: return `[]` immediately (avoid unnecessary second query)

**Display:** A "Workflow Errors" card rendered below the Draft History section. Each row shows:
- `failure_type` (pretty-printed)
- `severity` badge
- `created_at`
- A "View" link to `/[workspaceSlug]/settings/system-intelligence/errors/[errorId]` (existing Phase 3C.5 detail page)

**Visible only when `workflowErrors.length > 0`.** No empty state card rendered.

**No new actions.** The "View" link navigates to the existing error detail page where Resolve/Investigate/Ignore actions already exist (Phase 3C.2/3C.5).

**No migration needed.** All columns exist in current schema.

---

## What Is NOT in Phase 3F

| Item | Why excluded |
|------|-------------|
| New send action or send shortcut | Violates design goal 5 — email engine unchanged |
| Cancel draft button on lead page | Adds mutation not in scope; message workspace already has this flow |
| Workflow run list (raw) | Too low-level for operator UI; activity timeline is more readable |
| Analytics for a single lead | Out of scope; Phase 3D analytics is workspace-level |
| Bulk controls (enable/disable multiple leads) | Deferred from Phase 3E v1; separate phase when needed |
| Filter by `workflow_enabled` on kanban | Deferred from Phase 3E v1; separate phase when needed |
| `automation_failures.lead_id` migration | Not needed; workflow_run join is sufficient for v1 |

---

## Migration Assessment

**No migration required.**

All data needed for Parts A, B, and C exists in the current schema (migrations 001–032). The next available migration number (`20240033`) is reserved but not used in this phase.

---

## Files Affected

| File | Change type |
|------|------------|
| `app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx` | **New** — server component |
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | **Modified** — add timeline load, draft history render, error load and render |
| `modules/intelligence/structured-errors/structured-error.repo.ts` | **Modified** — add `getWorkflowErrorsForLead` |
| `tests/phase3f-workflow-visibility.test.ts` | **New** — test suite |

No other files touched. No new routes. No new server actions.

---

## Test Case Outline

Test pattern: source-reading (`fs.readFileSync` + string assertions). Consistent with all prior phases.

### Block 0 — `getWorkflowErrorsForLead`: repo function (3 tests)

| # | Test |
|---|------|
| TC-3F-001 | `structured-error.repo.ts` exports `getWorkflowErrorsForLead` |
| TC-3F-002 | Function queries `workflow_runs` by `subject_type` and `subject_id` (tenant isolation) |
| TC-3F-003 | Function filters `automation_failures` by `workflow_run_id` and open/investigating status |

### Block 1 — `LeadActivityTimeline`: component structure (4 tests)

| # | Test |
|---|------|
| TC-3F-004 | Component file exists and is readable |
| TC-3F-005 | Component is NOT a client component (no `'use client'` directive) |
| TC-3F-006 | Component accepts `events` prop (references `ActivityEventRow`) |
| TC-3F-007 | Component defines a display label map (references `ET_SEND_SUCCEEDED` or similar constant) |

### Block 2 — `LeadActivityTimeline`: display and empty state (3 tests)

| # | Test |
|---|------|
| TC-3F-008 | Component renders `occurred_at` field |
| TC-3F-009 | Component renders `event_summary` field |
| TC-3F-010 | Component includes an empty state message when no events |

### Block 3 — Lead detail page: data loading (4 tests)

| # | Test |
|---|------|
| TC-3F-011 | Page imports `listLeadActivityEvents` |
| TC-3F-012 | Page imports `getWorkflowErrorsForLead` |
| TC-3F-013 | Page imports `LeadActivityTimeline` |
| TC-3F-014 | Page calls `listLeadActivityEvents` with `tenantId` and lead `id` |

### Block 4 — Lead detail page: draft history (2 tests)

| # | Test |
|---|------|
| TC-3F-015 | Page renders a draft history section (references `slice` or index access beyond `[0]`) |
| TC-3F-016 | Page does not render a send button on historical drafts (no `SendEmailButton` in history section) |

### Block 5 — Lead detail page: error awareness (2 tests)

| # | Test |
|---|------|
| TC-3F-017 | Page renders error rows when errors are present (references `workflowErrors` or `getWorkflowErrorsForLead` result) |
| TC-3F-018 | Page links to `/settings/system-intelligence/errors/` (existing error detail page) |

### Block 6 — Guardrails (3 tests)

| # | Test |
|---|------|
| TC-3F-019 | `LeadActivityTimeline.tsx` does not call Resend or `sendEmail` |
| TC-3F-020 | `LeadActivityTimeline.tsx` does not call an external LLM (`openai`, `anthropic`) |
| TC-3F-021 | `structured-error.repo.ts` `getWorkflowErrorsForLead` is read-only (no insert/update/delete) |

**Total: 21 tests**

---

## UI Layout (proposed)

```
Lead Name
  Stage · Priority · Status
  [Workflow Toggle — Phase 3E]

[Lead Details card]    [Scores card]

[Recommended Action card]

[Generate Outreach Draft — if no active draft]

--- Email Draft + Email Quality + Rewrite Versions (existing) ---

--- NEW BELOW ---

[Draft History]           (visible only if drafts.length > 1)
  ● Sent     · Subject A  · May 20
  ● Superseded · Subject B · May 15

[Workflow Errors]         (visible only if errors exist)
  ⚠ WORKFLOW_RUN_FAILED · error · May 26  [View →]

[Workflow Activity]       (always rendered; empty state if no events)
  ● Email sent            2h ago
  ● Draft approved        3h ago
  ● Message versions generated  4h ago
  ● Strategy generated    4h ago
  (No workflow activity recorded yet — empty state)
```

---

## Risks and Guardrails

| Risk | Mitigation |
|------|-----------|
| `lead_id` not set on some activity events | Timeline shows only what is recorded; no claim of completeness; empty state is clear |
| `workflow_runs` has no entries with `subject_type='lead'` for older leads | `getWorkflowErrorsForLead` returns `[]` immediately — no error, no visible card |
| Draft history shows superseded/rejected drafts that confuse operators | Status badges are distinct and color-coded; ordering is newest first |
| Error "View" link navigates away from lead detail page | Acceptable — this is the existing error detail page (Phase 3C.5); no new page needed |
| Page load time increases with additional queries | `listLeadActivityEvents` and `getWorkflowErrorsForLead` run in parallel via `Promise.all` with existing queries; negligible added latency |

### Required guardrails for implementation

- `LeadActivityTimeline` must be a server component — no `'use client'`
- `getWorkflowErrorsForLead` must be read-only — no insert, update, or delete
- No new server actions in this phase
- No new routes in this phase
- No send buttons on historical drafts
- No direct link to `dispatchPendingEvents`
- No Resend API calls in any Phase 3F file
- No external LLM calls in any Phase 3F file

---

## Recommended Defaults

| Decision | Default |
|----------|---------|
| Activity events shown | 20 most recent (limit already in `listLeadActivityEvents`) |
| Draft history shown | All fetched drafts beyond `drafts[0]` (already limited to 10 by `getLeadEmailDrafts`) |
| Workflow errors shown | 10 most recent open/investigating (limit inside `getWorkflowErrorsForLead`) |
| Error card visibility | Conditional — hidden when `workflowErrors.length === 0` |
| Draft history visibility | Conditional — hidden when `emailDrafts.length <= 1` |
| Timeline visibility | Always rendered (empty state shown when no events) |

---

## Exact Next Prompt for Implementation Planning

Once this design is approved, use the following prompt verbatim:

---

> Begin Phase 3F implementation plan only.
>
> Phase 3F design approved: Workflow Execution Visibility & Control.
> Design document: `docs/roadmap/phase-3f-design-test-cases.md`
>
> Approved scope:
> - Part A: `LeadActivityTimeline.tsx` — new server component; data loaded in page.tsx via `listLeadActivityEvents`
> - Part B: Draft history — render `emailDrafts.slice(1)` in `page.tsx`; read-only; no new component required
> - Part C: Lead-linked errors — new `getWorkflowErrorsForLead` in `structured-error.repo.ts`; two-query approach through `workflow_runs`; rendered in `page.tsx` as a conditional card
> - Tests: `tests/phase3f-workflow-visibility.test.ts` — 21 tests across 6 describe blocks; source-reading pattern
>
> No migration. Next migration available: `20240033` (unused in this phase).
>
> Files to create or modify:
> - `app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx` — new
> - `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` — modified
> - `modules/intelligence/structured-errors/structured-error.repo.ts` — modified
> - `tests/phase3f-workflow-visibility.test.ts` — new
>
> Hard constraints:
> - Do not modify source code.
> - Do not create migrations.
> - Do not create commits.
> - Do not create or push tags.
> - Implementation plan only.

---

## Last Updated

2026-05-27 — Phase 3F design v1.0 proposed. Awaiting user approval.
