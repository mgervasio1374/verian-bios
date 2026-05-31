# Phase 3Q — Proposal Follow-Up Work Queue / Operator Review Queue Design

**Status:** Design only — awaiting implementation authorization  
**Created:** 2026-05-31  
**Predecessor:** Phase 3P — Proposal Event Visibility v1 (locked `phase-3p-proposal-event-visibility-v1`, commit `ed7e886`)  
**Migration required:** None — all tables and indexes exist from migration `20240038`

---

## 1. Executive Summary

Phase 3P delivered a full visibility layer for proposal events and follow-up commitment records. Operators can now see which proposals exist, their statuses, and which follow-up commitments are attached. However, the Phase 3P inbox is organized around **proposals** — not around **what needs to be done today**.

Phase 3Q closes this gap by introducing a **Proposal Follow-Up Work Queue**: a dedicated operator review page organized around open follow-up commitments, sorted by due date. Operators can answer at a glance:

- Which follow-ups are overdue right now?
- Which are due today?
- Which proposal is each follow-up tied to?
- What is the current proposal status for each commitment?
- Who is the follow-up assigned to?

This is a **read-only MVP**. No email is sent. No automation is triggered. No individual commitment mutation controls are added in this phase. Individual complete/skip controls are deferred to a later phase where a carefully scoped service, audit trail, and policy can be designed.

No new database tables or migrations are required.

---

## 2. Current Phase 3P Foundation

### What exists after Phase 3P

| Asset | Status |
|---|---|
| `proposal_events` table | Exists — migration 20240038 |
| `proposal_follow_up_commitments` table | Exists — migration 20240038 |
| `listProposalEventInboxItemsForWorkspace` repo | Exists — Phase 3P |
| `listCommitmentsForProposalEvent` repo | Exists — Phase 3P |
| `getProposalEventById` repo | Exists — tenant + workspace scoped |
| `updateProposalStatus` service | Exists — closes commitments on terminal status |
| `updateProposalStatusAction` action | Exists — safe, context-scoped |
| Proposal Event Inbox UI | Exists — `/proposal-events` |
| Proposal Event Detail UI | Exists — `/proposal-events/[eventId]` |
| `ProposalStatusControl` client component | Exists — Phase 3P |
| Follow-up commitments read-only display | Exists — on detail page only |
| "Proposal Events" sidebar nav item | Exists — Phase 3P |

### What is missing after Phase 3P

| Missing Asset | Phase 3Q Scope |
|---|---|
| Dedicated follow-up work queue page | Yes |
| Queue sorted by `follow_up_due_at ASC` | Yes |
| Queue filtered by `commitment_status = open` by default | Yes |
| Overdue / today / upcoming filter tabs | Yes |
| Proposal data enrichment on queue rows | Yes |
| `listProposalFollowUpQueueItemsForWorkspace` repo method | Yes |
| "Follow-Up Queue" sidebar nav item | Yes |
| Individual commitment complete/skip controls | Explicitly deferred |

---

## 3. Problem Statement

After Phase 3P, an operator can:
1. View the Proposal Event Inbox (organized by proposal, sorted by sent date)
2. Click into a proposal event to see its commitments
3. See which commitments are open on that specific proposal

But there is no way to answer the daily operations question:

> **"What follow-up actions are due today across all proposals in this workspace?"**

An operator managing dozens of proposals must visit each proposal detail page individually to check its commitments. There is no cross-proposal view of:
- Which commitments are overdue?
- Which are due in the next 24 hours?
- Which are coming up this week?
- Which proposals backing those commitments have already been accepted or rejected (and may need commitment cleanup)?

The work queue fills this operational gap without adding any write paths.

---

## 4. Proposed Concept: Proposal Follow-Up Work Queue

Phase 3Q adds a **commitment-first** view alongside the existing **proposal-first** view from Phase 3P. The work queue is the primary operational surface for an operator doing daily follow-up review. It does not replace the Proposal Event Inbox — it complements it.

### Core principles

- **Commitment-first** — queue rows are commitments, enriched with proposal data
- **Due-date sorted** — default sort is `follow_up_due_at ASC` (most urgent first)
- **Open by default** — default filter is `commitment_status = open`
- **Read-only MVP** — no mutation controls in Phase 3Q
- **No automation** — no email, no campaign, no Inngest, no background job
- **Existing backend only** — no new service or action logic
- **No new migration** — all schema exists in migration 20240038
- **Links to Phase 3P detail** — each queue row links to the existing Proposal Event Detail page

---

## 5. Queue Route and UI Plan

### Route

```
app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx
```

### Page type: Server Component

Loads via new `listProposalFollowUpQueueItemsForWorkspace` repository method (see Section 7). Derives `tenantId` and `workspaceId` from server-side context only — never from URL params.

### Default behavior

- Shows open commitments (`commitment_status = open`) across all proposals for the workspace
- Sorted by `follow_up_due_at ASC` — most overdue at the top
- Overdue rows (due date in the past) highlighted with `text-destructive`

### Empty state

- When no open commitments exist: "No open follow-up commitments." with a sub-note linking to the Proposal Events inbox
- When a filter yields no results: "No commitments matching this filter."

### Sidebar navigation

Add a "Follow-Up Queue" link to `components/layout/Sidebar.tsx`, positioned after the "Proposal Events" item:

```typescript
{ label: 'Follow-Up Queue', href: `${base}/proposal-follow-ups`, icon: <ListChecks className="h-4 w-4" /> }
```

---

## 6. Queue Fields and Filters

### Column layout

| Column | Source | Notes |
|--------|--------|-------|
| Due date | `follow_up_due_at` | Highlighted red if overdue |
| Overdue indicator | Computed from `follow_up_due_at < now()` | Badge or icon |
| Sequence | `follow_up_sequence` | Integer, 1-based |
| Proposal status | `proposal_status` (from enrichment) | Badge |
| Proposal sent date | `proposal_sent_at` (from enrichment) | Formatted |
| Lead ID | `lead_id` | Mono, truncated; "—" if null |
| Company ID | `company_id` (from proposal enrichment) | Mono, truncated; "—" if null |
| Contact ID | `contact_id` (from proposal enrichment) | Mono, truncated; "—" if null |
| Proposal event | `proposal_event_id` | Link to `/[workspaceSlug]/proposal-events/[proposalEventId]` |
| Schedule rule | `schedule_rule_key` | Mono |
| Assigned to | `assigned_to_user_id` | Mono, truncated; "—" if null |
| Created | `created_at` | Formatted |

### Filter tabs (URL-based, read-only)

| Tab | Filter applied |
|-----|---------------|
| Overdue | `follow_up_due_at < now()` AND `commitment_status = open` |
| Today | `follow_up_due_at` within current calendar day AND `commitment_status = open` |
| Upcoming | `follow_up_due_at >= now()` AND `commitment_status = open` |
| All Open | `commitment_status = open` (no date restriction) |

Implementation note: the "today" boundary is computed server-side as the start and end of the current UTC day. No client-side date logic.

### Optional secondary filters (low-priority, Phase 3Q Slice 4)

| Filter | Mechanism |
|--------|-----------|
| `sequence` | `?sequence=1` → filter by `follow_up_sequence` |
| `proposalStatus` | `?proposalStatus=sent` → filter enriched proposal status |

The following are **not** filters in Phase 3Q:
- `assignedTo=me` — requires user identity resolution; defer until user context is reliably available in this surface
- Date range pickers — complexity not justified for MVP
- Completion status tabs — commitments table includes completed/skipped rows but queue defaults to open; a "completed" tab can be added in a later phase

---

## 7. Repository / Read Model Plan

### New repository method

#### `listProposalFollowUpQueueItemsForWorkspace` (proposal-follow-up-commitments.repo.ts)

Returns an enriched `ProposalFollowUpQueueItem` read model — not a bare `CommitmentRow` — because the queue must display proposal-level data (status, sent date, reference, amount, company, contact) alongside each commitment row.

```typescript
export interface ProposalFollowUpQueueItem {
  // Commitment fields
  id: string
  tenant_id: string
  workspace_id: string
  proposal_event_id: string
  lead_id: string | null
  follow_up_sequence: number
  follow_up_due_at: string
  commitment_status: string
  schedule_rule_key: string
  assigned_to_user_id: string | null
  completed_at: string | null
  created_at: string
  // Enriched from proposal_events (batch-loaded — not N+1)
  proposal_status: string
  proposal_sent_at: string
  proposal_reference: string | null
  proposal_amount: number | null
  proposal_currency: string
  estimated_savings: number | null
  capture_source: string
  company_id: string | null
  contact_id: string | null
}

export interface ListProposalFollowUpQueueOptions {
  due?: 'overdue' | 'today' | 'upcoming' | 'all'
  followUpSequence?: number
  proposalStatus?: string | string[]
  limit?: number
  offset?: number
}

export async function listProposalFollowUpQueueItemsForWorkspace(
  tenantId: string,
  workspaceId: string,
  opts?: ListProposalFollowUpQueueOptions
): Promise<ProposalFollowUpQueueItem[]>
```

### Implementation requirements

**Step 1 — Query commitments**

```sql
SELECT * FROM proposal_follow_up_commitments
WHERE tenant_id = :tenantId
  AND workspace_id = :workspaceId
  AND commitment_status = 'open'   -- default; may vary by future opts
[AND follow_up_due_at < now()]     -- if due='overdue'
[AND follow_up_due_at >= :dayStart AND follow_up_due_at < :dayEnd]  -- if due='today'
[AND follow_up_due_at >= now()]    -- if due='upcoming'
[AND follow_up_sequence = :seq]    -- if opts.followUpSequence
ORDER BY follow_up_due_at ASC
LIMIT :limit OFFSET :offset
```

**Step 2 — Batch-load proposal events**

After fetching commitments, extract unique `proposal_event_id` values. If the list is non-empty, execute one batch query:

```sql
SELECT id, tenant_id, workspace_id, proposal_status, proposal_sent_at,
       proposal_reference, proposal_amount, proposal_currency, estimated_savings,
       capture_source, company_id, contact_id
FROM proposal_events
WHERE id IN (:eventIds)
  AND tenant_id = :tenantId
  AND workspace_id = :workspaceId
```

Then join in-process by matching `commitment.proposal_event_id === event.id`.

**Step 3 — Assemble read model**

Return the merged `ProposalFollowUpQueueItem[]`. If a proposal event is not found for a commitment (deleted, or belonging to a different tenant/workspace — should not happen under normal conditions given the `ON DELETE CASCADE` FK), **omit that commitment row from the result**. Do not return partially-enriched rows with null `proposal_status`, `proposal_sent_at`, `proposal_currency`, or `capture_source` fields.

Rationale:
- Missing enrichment should be rare — the `proposal_event_id` FK has `ON DELETE CASCADE`, so a missing event implies data inconsistency outside normal operation
- Omitting prevents UI ambiguity: the queue page can unconditionally render all enrichment fields without null-guarding them
- It preserves the non-null read-model contract for `ProposalFollowUpQueueItem.proposal_status`, `.proposal_sent_at`, `.proposal_currency`, and `.capture_source`
- Any orphaned commitment cleanup or reconciliation should be handled by a later, separately reviewed write path — not silently absorbed by the read-only queue

**Step 4 — Optional proposal status filter**

If `opts.proposalStatus` is provided, apply it as a post-process filter on the enriched items (or as an additional IN clause in the events batch query). Post-process filtering is safe for MVP volume — it avoids a compound query plan.

### No new methods required in proposal-events.repo.ts

The existing `getProposalEventById` is unchanged. The queue's proposal enrichment is handled entirely within the new commitments repo method via batch load — no cross-repo dependency at call time.

### No new service layer

No service is needed for a read-only method.

### No new actions

No `'use server'` action is created in Phase 3Q. The queue is a pure read surface.

---

## 8. Relationship to Proposal Event Detail Page

The work queue is **not** a replacement for the Proposal Event Detail page (Phase 3P). It is an entry point:

- Each queue row links to: `/[workspaceSlug]/proposal-events/[proposalEventId]`
- The detail page already shows all commitments for that proposal, the status transition panel, and linked records
- Operators use the queue to triage and prioritize, then navigate to the detail page for full context and status transitions

No new commitment detail route is needed. The Phase 3P detail page is sufficient.

---

## 9. Manual Commitment Close / Skip — Deferral Decision

Phase 3Q MVP defers individual commitment `complete` and `skip` controls.

### Reasoning

Individual commitment mutation is a meaningful write path that requires:

1. **A scoped service** — `completeFollowUpCommitment(tenantId, workspaceId, commitmentId, completedByUserId, notes)` with validation that the commitment is open and belongs to the tenant
2. **An audit trail decision** — `completed_by_user_id`, `completed_at`, and `completion_notes` already exist in the schema, but the policy for when each is required must be decided
3. **A skip vs. complete distinction** — `skipped` and `completed` have different semantics (`completed` implies the follow-up action was taken; `skipped` implies it was intentionally bypassed). Each needs its own UI affordance and server action
4. **Status reconciliation** — if all commitments are manually completed, should the proposal status change? This policy must be defined before the mutation is added
5. **A new server action** — `completeFollowUpCommitmentAction` and `skipFollowUpCommitmentAction` are each non-trivial, safety-reviewed `'use server'` additions

**Recommended approach:** build Phase 3Q as the read-only queue, validate that operators use it and understand the workflow, then add commitment mutation in **Phase 3R** (or a named later slice) with the full service + action + policy design.

### What Phase 3Q does NOT add

- No "Mark Complete" button per commitment row
- No "Skip" button per commitment row
- No bulk close/skip
- No inline completion notes input
- No auto-transition of proposal status on commitment completion

---

## 10. Relationship to Existing Proposal Status Closure Behavior

When an operator changes a proposal status to a terminal value (`accepted`, `rejected`, `expired`, `withdrawn`) via the Phase 3P `ProposalStatusControl`, the existing `updateProposalStatus` service performs best-effort closure of open commitments (sets `commitment_status = 'proposal_closed'`).

### Impact on the queue

- `proposal_closed` commitments are **excluded** from the Phase 3Q queue by default (it filters `commitment_status = 'open'` only)
- If the best-effort closure failed for any commitments, they will remain `open` in the DB and will appear in the queue with the proposal's new terminal status (e.g., `proposal_status = 'accepted'` but `commitment_status = 'open'`)
- This surface-level inconsistency is **useful signal** for operators: it flags commitments that were not closed during the status transition
- The queue should display the full `proposal_status` enrichment on every row so operators can identify these cases
- Phase 3Q does NOT auto-close these residual commitments — that would require a write path and policy decision that belongs in a later phase

---

## 11. Database / Migration Assessment

**No new migration required.** All tables, columns, and indexes needed for Phase 3Q were created in migration `20240038`.

### Existing indexes relevant to the queue query

| Index | Query path supported |
|-------|---------------------|
| `idx_proposal_commitments_tenant_workspace` | Base workspace scope |
| `idx_proposal_commitments_due_at` WHERE commitment_status = 'open' | Open + due filter |
| `idx_proposal_commitments_event` | Batch event load |
| `idx_proposal_events_tenant_workspace` | Batch event scope |

### Potential future index (document only — do NOT create in Phase 3Q)

A compound index on the commitments table would improve the queue query under high volume:

```sql
-- Future candidate (not created in Phase 3Q)
CREATE INDEX idx_proposal_commitments_workspace_open_due
  ON proposal_follow_up_commitments (tenant_id, workspace_id, follow_up_due_at ASC)
  WHERE commitment_status = 'open';
```

This would allow the queue's primary query to use an index scan with all three filters pre-applied. At current projected volume (dozens to low hundreds of open commitments per workspace), the existing `idx_proposal_commitments_due_at` partial index is sufficient.

**Do not create this migration in Phase 3Q.**

---

## 12. Schema Reference (relevant columns)

### proposal_follow_up_commitments (commitment fields in queue)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Commitment PK |
| `tenant_id`, `workspace_id` | uuid | All queries scoped here |
| `proposal_event_id` | uuid FK | Links to proposal_events.id |
| `lead_id` | uuid FK | Nullable — show "—" if null |
| `assigned_to_user_id` | uuid FK | Nullable |
| `follow_up_due_at` | timestamptz | Primary sort key |
| `follow_up_sequence` | integer | 1-based |
| `schedule_rule_key` | text | Display in queue row |
| `commitment_status` | text | `open`, `completed`, `skipped`, `proposal_closed` |
| `completed_at` | timestamptz | Nullable |
| `created_at` | timestamptz | Display in queue row |

### proposal_events (enriched fields in queue)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Matched via proposal_event_id |
| `proposal_status` | text | Display in queue row |
| `proposal_sent_at` | timestamptz | Display in queue row |
| `proposal_reference` | text | Nullable |
| `proposal_amount` | numeric | Nullable |
| `proposal_currency` | text | Default USD |
| `estimated_savings` | numeric | Nullable |
| `capture_source` | text | Display in queue row |
| `company_id` | uuid FK | Nullable — from proposal, not commitment |
| `contact_id` | uuid FK | Nullable — from proposal, not commitment |

Note: `company_id` and `contact_id` are **not** on the `proposal_follow_up_commitments` table — they must come from the enrichment batch-load of `proposal_events`.

---

## 13. UI Route Summary

| Route | File | Type | Purpose |
|-------|------|------|---------|
| `/proposal-follow-ups` | `app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx` | Server | Follow-up work queue |

No new API routes. No new server actions. All data loading via server component + new read-only repo method.

### Navigation

`components/layout/Sidebar.tsx` — add one nav item after the existing "Proposal Events" item:

```typescript
{ label: 'Follow-Up Queue', href: `${base}/proposal-follow-ups`, icon: <ListChecks className="h-4 w-4" /> }
```

`ListChecks` is available in lucide-react.

---

## 14. Safety Guardrails

The following are prohibited in all Phase 3Q files:

| Forbidden | Rationale |
|-----------|-----------|
| `EMAIL_SENDING_ENABLED` | No email sending |
| `CAMPAIGN_SENDING_ENABLED` | No campaign sending |
| `sendEmail` / `emails.send` | No email sending |
| Resend import | No email sending |
| Inngest import | No background jobs |
| `dispatchPendingEvents` | No automation |
| OpenAI / Anthropic / Claude / LLM import | No AI calls |
| `calendar_event_id` | Not a Phase 3Q concern |
| `scheduled_activities` | Not a Phase 3Q concern |
| `closed_reason` | Column does not exist in schema |
| "Send Follow-Up" / "Mark Complete" / "Skip" buttons | Mutation deferred |
| "Launch Campaign" / "Start Automation" buttons | Not in scope |
| Individual commitment mutation action | Deferred to later phase |
| New `'use server'` action file | Not in scope for read-only queue |
| New service-layer write method | Not in scope |

---

## 15. Testing Plan

Tests follow the established Phase 3N/3O/3P source-reading pattern: `fs.readFileSync` + `toContain` / regex. No Supabase mocking. No LLM mocking. Test file: `tests/phase3q-proposal-follow-up-work-queue.test.ts`.

### Slice 2 — Repository method tests

- `ProposalFollowUpQueueItem` interface is exported from commitments repo
- `ListProposalFollowUpQueueOptions` interface is exported from commitments repo
- `listProposalFollowUpQueueItemsForWorkspace` function is exported
- Function scopes by `tenant_id` and `workspace_id`
- Function filters `commitment_status = 'open'` by default
- Function supports `due='overdue'` filter (uses current timestamp comparison)
- Function supports `due='today'` filter (uses day-boundary comparison)
- Function supports `due='upcoming'` filter
- Function sorts by `follow_up_due_at ASC`
- Function applies `limit` and `offset` via `.range()`
- Function does **not** call `listCommitmentsForProposalEvent` per row (no N+1)
- Enrichment uses a single batch query against `proposal_events` using `.in('id', eventIds)`
- Enrichment scopes the batch query by `tenant_id` and `workspace_id`
- Read model includes `proposal_status`, `proposal_sent_at`, `company_id`, `contact_id`
- Function is read-only (no `.insert`, `.update`, `.delete`, `.upsert`)
- Function does not reference `closed_reason`
- Function does not reference `sendEmail`, `Inngest`, `Resend`, `OpenAI`, `Anthropic`
- Function does not reference `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- Function omits commitments whose proposal event cannot be loaded with matching `tenant_id` and `workspace_id` — no partial-enrichment rows returned
- `ProposalFollowUpQueueItem` interface declares `proposal_status`, `proposal_sent_at`, `proposal_currency`, and `capture_source` as non-nullable (`string`, not `string | null`)

### Slice 3 — Queue UI page tests

- Queue page file exists at correct path
- Page imports `listProposalFollowUpQueueItemsForWorkspace`
- Page imports `createSupabaseServerClient`
- Page imports `buildRequestContext`
- Page calls `requirePermission`
- Page passes `ctx.tenantId` and `ctx.workspaceId` to repo method
- Page does not accept `tenantId`, `workspaceId`, or `userId` from URL `searchParams`
- Page renders `follow_up_due_at`
- Page renders `follow_up_sequence`
- Page renders `commitment_status`
- Page renders `proposal_status`
- Page renders `schedule_rule_key`
- Page renders `assigned_to_user_id`
- Page renders `proposal_event_id` with a link to the Proposal Event Detail route
- Page has overdue date highlighting logic
- Page has "No open follow-up commitments" empty state
- Page links to `/proposal-events/[proposalEventId]` (not a new commitment detail route)
- Page does not null-guard `proposal_status`, `proposal_sent_at`, `proposal_currency`, or `capture_source` fields — read model contract guarantees they are non-null
- Page does not contain "Mark Complete" text
- Page does not contain "Skip" (mutation) button text
- Page does not contain "Send Follow-Up" text
- Page does not contain "Launch Campaign" text
- Page does not contain "Start Automation" text
- Page does not import Resend, Inngest, LLM providers
- Page does not reference `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- Page does not call `sendEmail`
- No new `'use server'` action file created (guard test)

### Slice 3 — Sidebar tests

- Sidebar includes "Follow-Up Queue" nav item
- Sidebar "Follow-Up Queue" link points to `/proposal-follow-ups`
- Sidebar nav item for Follow-Up Queue does not add sending or campaign language

### Slice 4 — Optional filter polish tests (if Slice 4 is implemented)

- Filter tabs render for overdue, today, upcoming, all
- Active filter is highlighted correctly
- Filter params are URL-based (not form mutation)

### Slice 5 — Integration/safety review tests

- No Phase 3Q file references `EMAIL_SENDING_ENABLED`
- No Phase 3Q file references `CAMPAIGN_SENDING_ENABLED`
- No Phase 3Q file imports Resend, Inngest, OpenAI, Anthropic
- No Phase 3Q file references `calendar_event_id` or `scheduled_activities`
- No Phase 3Q file references `closed_reason`
- All new repo methods scope by `tenant_id` and `workspace_id`
- No new `'use server'` action file exists
- No new service-layer write method exists

---

## 16. Out-of-Scope Items (Phase 3Q)

| Item | Reason |
|------|--------|
| Individual commitment complete / skip mutation | Requires scoped service, action, audit policy — Phase 3R |
| `assignedTo=me` filter | Requires user identity resolution — assess in Phase 3R |
| Date range picker filters | Complexity not justified for MVP |
| Completed / skipped commitment tabs | Not needed for operator work queue — Phase 3R |
| CSV / export | Not in scope |
| Calendar integration via `follow_up_due_at` | Phase 4 scope |
| Email draft linkage (`draft_id`) | Phase 4 scope |
| Auto-reconcile residual open commitments on terminal proposals | Write path — Phase 3R |
| Proposal event search / text filter | Infrastructure concern — defer |
| Lead name / company name denormalization | N+1 resolution strategy needed — assess in Phase 3R |
| Bulk commitment operations | Not in scope |
| Commitment detail page (own route) | Not needed — Phase 3P detail page is sufficient |
| New migration | Schema complete in migration 20240038 |

---

## 17. Recommended Implementation Slices

| Slice | Deliverable | Files Changed |
|-------|-------------|---------------|
| **3Q-1** | Design document (this file) | `docs/roadmap/phase-3q-proposal-follow-up-work-queue-design.md` |
| **3Q-2** | Read-only follow-up queue repository method + tests | `modules/proposals/repositories/proposal-follow-up-commitments.repo.ts` (update), `tests/phase3q-proposal-follow-up-work-queue.test.ts` (new) |
| **3Q-3** | Proposal Follow-Up Work Queue UI + Sidebar nav + tests | `app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx` (new), `components/layout/Sidebar.tsx` (update), test file (update) |
| **3Q-4** | Filter polish and overdue grouping (optional) | Queue page (update), test file (update) — skip if Slice 3 is sufficient |
| **3Q-5** | Integration / safety review | No new files — test hardening only |
| **3Q-6** | Codex full review and lock tag | Review only — tag: `phase-3q-proposal-follow-up-work-queue-v1` |

Each slice commits, passes the focused test suite, and receives a Codex review before the next begins. Slice 4 is optional — if Slice 3's filter tabs satisfy operator needs, proceed directly to Slice 5.

---

## 18. Codex Review Checkpoint

Before lock, Codex review must confirm:

- `listProposalFollowUpQueueItemsForWorkspace` is tenant/workspace scoped
- Enrichment uses batch load, not N+1
- Commitments whose proposal event cannot be tenant/workspace-loaded are omitted — no partial-enrichment rows returned
- `ProposalFollowUpQueueItem` enrichment fields `proposal_status`, `proposal_sent_at`, `proposal_currency`, `capture_source` are declared non-null
- No forbidden patterns (Resend, Inngest, LLM, email, campaign) in any Phase 3Q file
- Queue page derives context from `buildRequestContext` only — no client-supplied tenant/workspace/userId
- Queue page is a server component
- No new `'use server'` action file created
- No new service write method created
- Queue links to Phase 3P detail page — no new commitment route
- No commitment mutation controls exist in any Phase 3Q file
- No new migration was created or applied

---

## 19. Lock Criteria

Phase 3Q may be locked when:

- [ ] All Phase 3Q slices are committed and pushed
- [ ] All focused Phase 3Q tests pass
- [ ] Codex full review: PASS or PASS WITH NOTES (no Critical/High issues)
- [ ] No email sending, campaign sending, or automation introduced
- [ ] No new migration created
- [ ] Work queue renders open commitments enriched with proposal data
- [ ] Default sort is `follow_up_due_at ASC`
- [ ] Overdue commitments are visually distinguished
- [ ] Queue links to existing Proposal Event Detail page
- [ ] No mutation controls on queue rows
- [ ] All new repo methods are scoped by tenant/workspace
- [ ] No security-sensitive IDs accepted from client input
- [ ] "Follow-Up Queue" sidebar nav item wired
- [ ] `closed_reason` not referenced anywhere in Phase 3Q files
