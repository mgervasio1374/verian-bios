# Phase 3P — Proposal Event Visibility / Follow-Up Commitment Review UI Design

**Status:** Design only — awaiting implementation authorization  
**Created:** 2026-05-31  
**Revised:** 2026-05-31 (Codex review rev 1 — inbox enrichment model, commitment closure best-effort note, accepted/rejected normalization, closed_reason schema clarification)  
**Predecessor:** Phase 3O — Capture-to-Event Conversion v1 (locked `phase-3o-capture-to-event-v1`, commit `500f12f`)  
**Migration required:** None — all tables and indexes exist from migration `20240038`

---

## 1. Executive Summary

Phase 3O delivered the full capture-to-event conversion pipeline: a matched capture can now be converted into a `proposal_event` record with follow-up commitments. However, once created, those records have no dedicated visibility surface. The only way to see a proposal event is via the capture detail page's read-only "Proposal Event Created" card, which shows only the `resolved_event_id` UUID.

Phase 3P closes this gap by adding a read-oriented visibility layer:

- A **Proposal Event Inbox** listing all proposal events for the workspace
- A **Proposal Event Detail** page showing full metadata, linked entities, and follow-up commitments
- An inline **safe status transition control** using the already-implemented `updateProposalStatusAction`
- A **Follow-Up Commitment review section** showing all commitments as records (read-only, no send/trigger)

No email is sent. No automation is triggered. No new database tables or migrations are required.

---

## 2. Current Phase 3O Foundation

### What exists after Phase 3O

| Asset | Status |
|---|---|
| `proposal_events` table | Exists — migration 20240038 |
| `proposal_follow_up_commitments` table | Exists — migration 20240038 |
| `proposal_captures` table | Exists — migration 20240038 |
| `createProposalEvent` repo | Exists |
| `getProposalEventById` repo | Exists — tenant + workspace scoped |
| `getOpenProposalEventForLead` repo | Exists |
| `updateProposalStatus` repo | Exists |
| `createFollowUpCommitments` repo | Exists |
| `getOpenCommitmentsForLead` repo | Exists — by lead_id |
| `closeOpenCommitmentsForProposal` repo | Exists |
| `updateProposalStatus` service | Exists — closes commitments on terminal status |
| `updateProposalStatusAction` action | Exists — `'use server'`, context-scoped, permission-gated |
| Proposal Capture Inbox list page | Exists — `/proposal-inbox` |
| Proposal Capture Detail page | Exists — `/proposal-inbox/[captureId]` |
| Proposal Capture Detail shows resolved_event_id | Exists — read-only card |

### What is missing

| Missing Asset | Phase 3P Scope |
|---|---|
| `listProposalEventInboxItemsForWorkspace` repo method | Yes |
| `listCommitmentsForProposalEvent` repo method | Yes |
| Proposal Event Inbox page | Yes |
| Proposal Event Detail page | Yes |
| Navigation link to Proposal Events | Yes |
| Commitment review section (read-only) | Yes |
| Status transition UI on detail page | Yes — use existing action |
| Back-link from capture to event | Yes |

---

## 3. Problem Statement

After Phase 3O, an operator can:
1. Review a capture in the inbox
2. Match it to a lead
3. Convert it to a proposal event

But after step 3, there is no way to:
- See which proposals are open across the workspace
- See the full metadata for a specific proposal
- See which follow-up commitments are due and when
- Change a proposal's status (accepted/rejected/expired/etc.) — the action exists but no UI surface is wired

This makes the proposal lifecycle invisible after creation, which blocks operator workflow.

---

## 4. Proposed Concept: Proposal Event Visibility Layer

Phase 3P adds a read-oriented layer on top of the data that Phase 3N and 3O wrote. It does not extend the write path. The only write path introduced is a status transition control (already backed by a fully-implemented, safety-reviewed service and action from Phase 3N Slice 4).

### Core principles

- **Read-first** — the primary value is visibility, not new mutations
- **No automation** — no email trigger, no campaign, no Inngest, no background job
- **Existing backend only** — no new service logic; the `updateProposalStatusAction` from Phase 3N is reused as-is
- **Safe status transitions** — terminal status → commitments closed automatically by existing service; no other side-effects
- **Commitment display only** — commitments are shown as records, not actioned individually in Phase 3P
- **No new migration** — all required columns and indexes exist in migration 20240038

---

## 5. Schema Reference (migration 20240038)

### proposal_events columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `tenant_id` | uuid | Required — all queries scoped by this |
| `workspace_id` | uuid | Required — all queries scoped by this |
| `lead_id` | uuid FK | NULL → no lead linked |
| `contact_id` | uuid FK | NULL |
| `company_id` | uuid FK | NULL |
| `account_id` | uuid FK | NULL — always null in Phase 3O |
| `sender_user_id` | uuid FK | NULL |
| `proposal_sent_at` | timestamptz | Required |
| `proposal_reference` | text | NULL |
| `proposal_amount` | numeric(14,2) | NULL |
| `proposal_currency` | text | Default USD |
| `estimated_savings` | numeric(14,2) | NULL |
| `proposal_status` | text | `sent`, `viewed`, `accepted`, `rejected`, `expired`, `withdrawn` |
| `capture_source` | text | `manual`, `bcc_ingest`, `forward_ingest`, `outlook_sync`, `api` |
| `capture_id` | uuid FK → proposal_captures | NULL for manual-only events |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | Standard |

### proposal_follow_up_commitments columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `tenant_id`, `workspace_id` | uuid | Required |
| `proposal_event_id` | uuid FK | NOT NULL, CASCADE delete |
| `lead_id` | uuid FK | NULL |
| `assigned_to_user_id` | uuid FK | NULL |
| `follow_up_due_at` | timestamptz | Required |
| `follow_up_sequence` | integer | 1-based |
| `schedule_rule_key` | text | e.g. `standard_3_5_10` |
| `commitment_status` | text | `open`, `completed`, `skipped`, `proposal_closed` |
| `completed_at` | timestamptz | NULL |
| `completed_by_user_id` | uuid FK | NULL |
| `completion_notes` | text | NULL |
| `draft_id` | uuid FK → email_drafts | NULL — Phase 4 bridge |
| `created_at`, `updated_at` | timestamptz | Standard (no deleted_at) |

### Existing indexes (all available, no new ones required)

| Index | Used for |
|-------|----------|
| `idx_proposal_events_tenant_workspace` | Workspace list query |
| `idx_proposal_events_proposal_status` | Status filter |
| `idx_proposal_events_sent_at` | Default sort |
| `idx_proposal_events_lead_id` | Lead join/filter |
| `idx_proposal_commitments_event` | Commitments by event |
| `idx_proposal_commitments_due_at` | Open/overdue filter |
| `idx_proposal_commitments_tenant_workspace` | Workspace scoped queries |

---

## 6. Proposal Event Inbox Design

### Route

```
app/(workspace)/[workspaceSlug]/proposal-events/page.tsx
```

### Page type: Server Component

Loads via `listProposalEventInboxItemsForWorkspace` (new enriched repo method — see Section 9).

### Default display

Sorted by `proposal_sent_at DESC`. Shows all non-deleted events for the workspace.

### Inbox row enrichment

The list query returns a `ProposalEventInboxItem` read model — not a bare `ProposalEventRow` — because the "Next follow-up" column requires per-event commitment data that cannot come from the events table alone.

```typescript
export interface ProposalEventInboxItem {
  // All ProposalEventRow fields
  id: string
  tenant_id: string
  workspace_id: string
  lead_id: string | null
  company_id: string | null
  contact_id: string | null
  capture_id: string | null
  proposal_sent_at: string
  proposal_reference: string | null
  proposal_amount: number | null
  proposal_currency: string
  estimated_savings: number | null
  proposal_status: string
  capture_source: string
  created_at: string
  updated_at: string
  // Enriched fields
  next_open_follow_up_due_at: string | null  // earliest open commitment due_at, or null
  open_commitment_count: number               // count of open commitments
  total_commitment_count: number              // total commitments
}
```

The enrichment is computed within the repository method (via a subquery or separate batch query against `proposal_follow_up_commitments`) — never as N+1 per-row fetches.

### Columns

| Column | Source | Notes |
|--------|--------|-------|
| Lead | `lead_id` → lead name (join or separate load) | Show "—" if null |
| Status | `proposal_status` | Badged by open/closed |
| Sent date | `proposal_sent_at` | Formatted local display |
| Source | `capture_source` | Badged mono |
| Reference | `proposal_reference` | Truncated, show "—" if null |
| Amount | `proposal_amount` + `proposal_currency` | Show "—" if null |
| Next follow-up | `next_open_follow_up_due_at` from enriched model | Show "—" if none; highlight if overdue |
| Actions | Link → detail page | "View →" |

### Filters (Phase 3P initial scope)

- **Status group**: All / Open (sent + viewed) / Closed (accepted + rejected + expired + withdrawn)
- **Capture source**: All / manual / bcc_ingest / forward_ingest / outlook_sync / api
- No date range filter in Phase 3P (defer to later phase)

### Empty state

Display an empty-state message when no events exist. Do not show a "Create" button on this page — creation is via the capture inbox flow.

### Navigation

Add a "Proposal Events" link to the workspace sidebar or Settings page, consistent with the Phase 3N pattern.

---

## 7. Proposal Event Detail Design

### Route

```
app/(workspace)/[workspaceSlug]/proposal-events/[eventId]/page.tsx
```

### Page type: Server Component

Loads via `getProposalEventById` (already exists) + `listCommitmentsForProposalEvent` (new repo method).

### Sections

#### 7.1 Header
- Event ID (mono, small)
- Status badge
- Back link → Proposal Events list

#### 7.2 Proposal Details card
- Sent date
- Reference
- Amount + currency
- Estimated savings
- Capture source (badged)
- Created date

#### 7.3 Linked Entities card
- Lead ID (with link to lead detail if route exists)
- Company ID
- Contact ID
- Source Capture ID — if `capture_id` is non-null, link to `/proposal-inbox/[capture_id]`

#### 7.4 Follow-Up Commitments section
See Section 8 below.

#### 7.5 Status Transition panel (when proposal is open)
See Section 10 below.

---

## 8. Follow-Up Commitment Review Design

Commitments are displayed inline on the proposal event detail page as a read-only table/list. No individual commitment actions (complete/skip) in Phase 3P — defer to a later phase.

### Display fields per commitment

| Field | Column |
|-------|--------|
| # | `follow_up_sequence` |
| Due date | `follow_up_due_at` |
| Status | `commitment_status` (badged) |
| Schedule rule | `schedule_rule_key` |
| Assigned to | `assigned_to_user_id` (show "—" if null) |
| Completed at | `completed_at` |
| Notes | `completion_notes` |

### Status badges

| Status | Variant |
|--------|---------|
| `open` | default (active) |
| `open` + past due | destructive |
| `completed` | secondary |
| `skipped` | outline |
| `proposal_closed` | secondary |

### Forbidden UI elements

- No "Send Follow-Up" button
- No "Start Campaign" button
- No "Launch" button
- No "Complete" / "Skip" individual commitment buttons in Phase 3P (defer)

### Schema note: `closed_reason` is not in the current schema

The `proposal_follow_up_commitments` table (migration 20240038) does **not** have a `closed_reason` column. Phase 3P displays only the columns that exist: `commitment_status`, `completed_at`, `completed_by_user_id`, `completion_notes`. No migration to add `closed_reason` is in scope for Phase 3P.

### Sort order

`follow_up_sequence ASC` (1, 2, 3…).

---

## 9. Repository / Service / Action Plan

### New repository methods required

#### 9.1 `listProposalEventInboxItemsForWorkspace` (proposal-events.repo.ts)

Returns the enriched `ProposalEventInboxItem` read model (defined in Section 6), not a bare `ProposalEventRow`, because the inbox requires commitment summary data per event.

```typescript
export interface ListProposalEventsOptions {
  status?: ProposalStatus | ProposalStatus[] | 'open' | 'closed'
  captureSource?: string
  limit?: number
  offset?: number
}

export async function listProposalEventInboxItemsForWorkspace(
  tenantId: string,
  workspaceId: string,
  opts?: ListProposalEventsOptions
): Promise<ProposalEventInboxItem[]>
```

Implementation notes:
- Filter `deleted_at IS NULL`
- `status: 'open'` → `proposal_status IN ('sent', 'viewed')`
- `status: 'closed'` → `proposal_status IN ('accepted', 'rejected', 'expired', 'withdrawn')`
- Default sort: `proposal_sent_at DESC`
- Default limit: 100
- Enrich each row with `next_open_follow_up_due_at`, `open_commitment_count`, `total_commitment_count` via a batch query (fetch all commitment rows for the returned event IDs, aggregate in-process) — never N+1

#### 9.2 `listCommitmentsForProposalEvent` (proposal-follow-up-commitments.repo.ts)

```typescript
export async function listCommitmentsForProposalEvent(
  tenantId: string,
  workspaceId: string,
  proposalEventId: string
): Promise<CommitmentRow[]>
```

Implementation notes:
- Filter by `proposal_event_id`, `tenant_id`, `workspace_id`
- Sort by `follow_up_sequence ASC`
- No deleted_at filter (commitments table has no deleted_at column)

### Existing assets — no changes needed

| Asset | Status |
|---|---|
| `getProposalEventById` | Exists — use as-is for detail page load |
| `updateProposalStatus` service | Exists — use as-is for status transitions |
| `updateProposalStatusAction` action | Exists — use as-is for status UI |
| `closeOpenCommitmentsForProposal` repo | Exists — called by service on terminal status |

### New service layer

None. The status service already handles the full transition including commitment closure. No additional service logic required.

### New actions

None. `updateProposalStatusAction` is already implemented and will be called directly from the status UI client component.

---

## 10. Status Transition UI Design

### Scope

A status transition panel appears on the proposal event detail page **only when the proposal is open** (`proposal_status IN ('sent', 'viewed')`).

### UI: `ProposalStatusControl.tsx` (client component)

```
'use client'
```

Displays a dropdown of allowed terminal transitions plus a confirm button. On confirm, calls `updateProposalStatusAction`.

### Allowed transitions from open states

| From | To (selectable) |
|------|----------------|
| `sent` | `viewed`, `accepted`, `rejected`, `expired`, `withdrawn` |
| `viewed` | `accepted`, `rejected`, `expired`, `withdrawn` |

### Behavior on success

- Show success state with new status and count of closed commitments
- Call `router.refresh()` — page re-renders with closed status, terminal card, no status panel

### Behavior on failure

- Show inline error, preserve selection

### Behavior on success (detail)

The existing `updateProposalStatus` service performs commitment closure after status update, but this is **best-effort**: the status update is committed first; commitment closure runs next and may partially succeed. The UI should display `closedCommitmentIds.length` (the count returned by the action) as confirmation, but the operator should not rely on this count being equal to the total commitment count in all edge cases.

### Guardrails

- No email sent on status change
- No campaign triggered
- No Inngest invoked
- Commitment closure is a best-effort side-effect of the existing `updateProposalStatus` service — not a separate action and not transactional with the status update

---

## 11. Database / Migration Assessment

**No new migration required.** All tables, columns, and indexes needed for Phase 3P were created in migration `20240038`.

Key confirmation:
- `proposal_events` has all display columns including `proposal_status`, `proposal_sent_at`, `capture_id`, `lead_id`, `company_id`, `contact_id`, `proposal_amount`, `proposal_currency`, `estimated_savings`, `proposal_reference`, `capture_source`
- `proposal_follow_up_commitments` has all display columns including `follow_up_due_at`, `follow_up_sequence`, `commitment_status`, `schedule_rule_key`, `assigned_to_user_id`, `completed_at`, `completion_notes`
- Index `idx_proposal_events_tenant_workspace` supports the list query
- Index `idx_proposal_events_proposal_status` supports status filter
- Index `idx_proposal_events_sent_at` supports default sort
- Index `idx_proposal_commitments_event` supports per-event commitment load

No index gaps identified for Phase 3P workload at current scale. If list queries degrade under high volume, a future composite index on `(tenant_id, workspace_id, proposal_status, proposal_sent_at DESC)` could be considered — but this is out of scope for Phase 3P.

---

## 12. UI Route Plan

| Route | File | Type | Purpose |
|-------|------|------|---------|
| `/proposal-events` | `app/(workspace)/[workspaceSlug]/proposal-events/page.tsx` | Server | Proposal event list/inbox |
| `/proposal-events/[eventId]` | `app/(workspace)/[workspaceSlug]/proposal-events/[eventId]/page.tsx` | Server | Proposal event detail |
| — | `ProposalStatusControl.tsx` | Client | Status transition panel |

No new API routes. All data loading via server components + existing repo methods + new list methods.

### Navigation

Add a "Proposal Events" link to the Settings page (following Phase 3N pattern — the Settings page in this project links to operational tools). Alternatively, add to the workspace sidebar if one exists. This is a minor addition to an existing navigation file — not a new route.

---

## 13. Safety Guardrails

The following are prohibited in all Phase 3P files:

| Forbidden | Rationale |
|-----------|-----------|
| `EMAIL_SENDING_ENABLED` | No email sending |
| `CAMPAIGN_SENDING_ENABLED` | No campaign sending |
| `sendEmail` / `emails.send` | No email sending |
| Resend import | No email sending |
| Inngest import | No background jobs |
| `dispatchPendingEvents` | No automation |
| OpenAI / Anthropic / Claude / LLM import | No AI calls |
| `calendar_event_id` | Not a Phase 3P concern |
| `scheduled_activities` | Not a Phase 3P concern |
| "Send Follow-Up" button | UI prohibited |
| "Launch Campaign" button | UI prohibited |
| "Start Follow-Up" button | UI prohibited |
| Individual commitment complete/skip mutation | Deferred — read-only in Phase 3P |

---

## 14. Testing Plan

Tests follow the existing Phase 3N/3O source-reading pattern: `fs.readFileSync` + `toContain` / regex. No Supabase mocking. No LLM mocking.

### Slice 2 — Repository method tests

- `listProposalEventInboxItemsForWorkspace` exists in events repo
- Method filters by `tenant_id`, `workspace_id`, `deleted_at IS NULL`
- Method supports `status: 'open'` filtering (maps to `IN ('sent', 'viewed')`)
- Method supports `status: 'closed'` filtering (maps to `IN ('accepted', 'rejected', 'expired', 'withdrawn')`)
- Method returns enriched type with `next_open_follow_up_due_at`, `open_commitment_count`, `total_commitment_count`
- Method does not use N+1 per-row fetches (no per-row `listCommitmentsForProposalEvent` call inside the method)
- `listCommitmentsForProposalEvent` exists in commitments repo
- Method filters by `proposal_event_id`, `tenant_id`, `workspace_id`
- Method sorts by `follow_up_sequence ASC`
- Neither method references `closed_reason` (column does not exist in schema)

### Slice 3 — Proposal Event Inbox tests

- Inbox page file exists
- Page imports `listProposalEventInboxItemsForWorkspace`
- Page calls `buildRequestContext` (server-side only)
- Page does not expose a "Create" or "Send" button
- Page links to `/proposal-events/[eventId]`
- No forbidden imports (Resend, Inngest, LLM)

### Slice 4 — Proposal Event Detail tests

- Detail page file exists
- Page imports `getProposalEventById`
- Page imports `listCommitmentsForProposalEvent`
- Page calls `notFound()` for missing/cross-workspace event
- Page links back to source capture when `capture_id` is non-null
- Page renders `ProposalStatusControl` only when status is open
- Commitments rendered as read-only records
- No "Send Follow-Up" / "Launch Campaign" text in source

### Slice 5 — Status control tests

- `ProposalStatusControl.tsx` exists and is `'use client'`
- Component imports `updateProposalStatusAction`
- Component uses `useRouter`
- Component does not import Resend, Inngest, LLM
- Component does not contain "Send Email" / "Launch Campaign" / "Start Follow-Up"
- Component passes only `proposalEventId` + `status` to action
- Component does not pass `tenantId`, `workspaceId`, `userId`
- Component calls `router.refresh()` on success
- Component shows `closedCommitmentIds.length` on success (best-effort count — may be less than total)
- Component uses status labels `accepted` and `rejected` (not `won` / `lost`)
- Component does not reference `closed_reason`

### Slice 6 — Integration/safety review tests

- No Phase 3P file references `EMAIL_SENDING_ENABLED`
- No Phase 3P file references `CAMPAIGN_SENDING_ENABLED`
- No Phase 3P file imports Resend, Inngest, OpenAI, Anthropic
- No Phase 3P file references `calendar_event_id` or `scheduled_activities`
- All new repo methods scope by `tenant_id` and `workspace_id`

---

## 15. Out-of-Scope Items (Phase 3P)

The following are explicitly deferred:

| Item | Reason |
|------|--------|
| Individual commitment complete / skip action | Separate mutation surface — design separately |
| Proposal event search / full-text | Infrastructure concern — defer |
| Date range filter on inbox | Low priority for MVP — defer |
| Lead name join on inbox (denormalized) | May require N+1 resolution strategy — assess in implementation |
| Proposal event creation from detail page | Already handled via capture flow |
| Bulk status update | Not needed at current scale |
| CSV / export | Not in scope |
| Calendar integration via `follow_up_due_at` | Phase 4 scope |
| Email draft linkage (`draft_id`) | Phase 4 scope |
| `opportunity_id` linkage | Not yet in use |
| Proposal event delete / archive UI | Deferred — soft delete exists at DB level |

---

## 16. Recommended Implementation Slices

| Slice | Deliverable | New Files |
|-------|-------------|-----------|
| **3P-1** | Design document (this file) | `docs/roadmap/phase-3p-proposal-event-visibility-design.md` |
| **3P-2** | Read-only repo methods + tests | `proposal-events.repo.ts` (update: add `listProposalEventInboxItemsForWorkspace`), `proposal-follow-up-commitments.repo.ts` (update: add `listCommitmentsForProposalEvent`), `tests/phase3p-proposal-event-visibility.test.ts` (new) |
| **3P-3** | Proposal Event Inbox UI + tests | `app/(workspace)/[workspaceSlug]/proposal-events/page.tsx` (new), nav link update |
| **3P-4** | Proposal Event Detail UI + tests | `app/(workspace)/[workspaceSlug]/proposal-events/[eventId]/page.tsx` (new) |
| **3P-5** | Status Transition UI + tests | `ProposalStatusControl.tsx` (new), detail page updated |
| **3P-6** | Integration/safety review | No new files; test hardening only |
| **3P-7** | Codex full review | Review only |
| **3P-8** | Lock tag | `phase-3p-proposal-event-visibility-v1` |

Each slice commits, passes tests, and receives a Codex review before the next begins. Slices 4 and 5 may be merged into a single commit if the implementation is straightforward and the combined file count remains manageable.

---

## 17. Codex Review Checkpoint

Before lock, Codex review must confirm:

- All new repo methods are tenant/workspace scoped
- No forbidden patterns in any Phase 3P file
- Status transition UI uses only `updateProposalStatusAction` (no new write paths)
- Commitment section is read-only (no send/trigger/complete actions)
- Server components derive context from `buildRequestContext` only
- Client components do not pass security-sensitive IDs
- `getProposalEventById` calls `notFound()` for missing or cross-workspace events
- No new migration was created or applied

---

## 18. Lock Criteria

Phase 3P may be locked when:

- [ ] All Phase 3P slices are committed and pushed
- [ ] All tests pass
- [ ] Codex full review: PASS or PASS WITH NOTES (no Critical/High issues)
- [ ] No email sending, campaign sending, or automation introduced
- [ ] No new migration created
- [ ] Proposal Event Inbox renders open/closed events
- [ ] Proposal Event Detail renders commitments read-only
- [ ] Status transition UI uses only the existing `updateProposalStatusAction`
- [ ] Status transition closes commitments via existing service (no new logic)
- [ ] All new repo methods are scoped by tenant/workspace
- [ ] No security-sensitive IDs accepted from client input
- [ ] Navigation link wired to Proposal Events inbox
- [ ] Source capture linked from detail page (when `capture_id` is non-null)
