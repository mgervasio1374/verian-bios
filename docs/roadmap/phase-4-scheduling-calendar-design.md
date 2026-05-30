# Phase 4 — Campaign & Proposal Scheduling Calendar Design

**Status:** Design only — awaiting authorization  
**Created:** 2026-05-30  
**Predecessors:**
- Phase 3M locked at `e33b130`, tag `phase-3m-campaign-work-queue-v1`
- Phase 3N design at `d1d282c` (not yet implemented)
- Phase 3N plan at `f798051`

**Migration status:** No migration reserved or created for Phase 4 at design time. If a migration is required, `20240039` is the next available number (after Phase 3N's `20240038`).

---

## 1. Executive Summary

Phase 4 introduces a **scheduling and calendar visualization layer** for Verian. The goal is to give operators a single, unified view of all outstanding and upcoming work: campaign assignment aging items, proposal follow-up commitments (true due dates), draft review aging, and future scheduled activity.

Phase 4 is deliberately separated into three sub-phases:

- **Phase 4A — Read-Only Calendar View:** Visualize all existing obligations derived from current tables (campaign assignments, proposal follow-up commitments, email drafts, approval requests). No new tables required. No writable actions. Lowest possible risk.
- **Phase 4B — Writable Scheduling Actions:** Introduce a `scheduled_activities` table and writable actions: reschedule, pause, skip, reassign. Enable drag-and-drop rescheduling.
- **Phase 4C — External Calendar Integration:** Microsoft Graph / Outlook and Google Calendar sync. Two-way calendar event management.

This design covers all three sub-phases but recommends **Option C (Hybrid)** as the MVP path: start with derived-only visualization (Phase 4A), add a persistent scheduling table only when writable actions are authorized (Phase 4B).

**Critical constraints maintained throughout Phase 4:**
- `EMAIL_SENDING_ENABLED` remains disabled
- `CAMPAIGN_SENDING_ENABLED` remains disabled
- No LLM required for calendar MVP
- No live sending
- No production changes without explicit authorization
- Calendar initially visualizes obligations — it does not execute them

---

## 2. Problem Statement

Verian now has multiple sources of time-sensitive work obligations:

| Source | Due-Date Field | Phase Introduced |
|--------|---------------|-----------------|
| Campaign assignments | `campaign_assignments.created_at` (age-based proxy — no true due date) | Phase 3L |
| Campaign drafts pending review | `email_drafts.created_at` (age-based proxy) + status | Phase 3K |
| Approval requests | `approval_requests.created_at` (age-based proxy) | Phase 3H |
| Proposal follow-up commitments | `proposal_follow_up_commitments.follow_up_due_at` | Phase 3N (planned) |
| Future scheduled sends | (not yet modeled) | Phase 4B+ |

Without a unified view, operators must navigate between:
- The Campaign Work Queue (`/settings/campaign-queue`)
- Lead detail pages for individual draft status
- The Proposal Inbox (`/settings/proposal-inbox`) once Phase 3N is live
- No view exists for workload density, overdue items, or upcoming milestones

This fragmentation means:
- Operators miss proposal follow-up commitments and campaign review obligations because they're scattered across pages
- There is no way to see "what do I need to do today/this week"
- Overdue proposals and campaign assignments are invisible until someone looks
- Operator workload is unmeasurable

Phase 4 solves this by creating a **Calendar/Schedule view** that aggregates all obligations into a time-based interface.

---

## 3. Phase 4 Objectives

| # | Objective | Sub-Phase |
|---|-----------|-----------|
| 1 | Show all proposal follow-up due dates on a calendar | 4A |
| 2 | Show all campaign assignment milestones on a calendar | 4A |
| 3 | Show draft review aging items on a calendar | 4A |
| 4 | Show activity density per day/week | 4A |
| 5 | Show overdue work prominently | 4A |
| 6 | Show completed, skipped, and delayed activity | 4A |
| 7 | Operator workload view (per-user obligations) | 4A |
| 8 | Campaign milestone timeline visualization | 4A |
| 9 | Proposal follow-up timeline per lead | 4A |
| 10 | Writable reschedule / pause / skip actions | 4B |
| 11 | Dedicated `scheduled_activities` table | 4B |
| 12 | Drag-and-drop rescheduling UI | 4B |
| 13 | Reassign activity to another operator | 4B |
| 14 | Mid-sequence campaign adjustment | 4B |
| 15 | Microsoft Graph / Outlook calendar sync | 4C |
| 16 | Google Calendar sync | 4C |
| 17 | Notification / reminder delivery | 4C |

---

## 4. Non-Goals

| Item | Reason |
|------|--------|
| Live email sending | `EMAIL_SENDING_ENABLED` remains disabled |
| Automated follow-up triggering | Calendar shows obligations; it does not execute them |
| LLM-optimized scheduling | Deterministic calendar first; AI optimization is Phase 5+ |
| Proposal document generation | Out of scope |
| Payment scheduling | Out of scope |
| Attendance tracking | Out of scope |
| External calendar write-back in Phase 4A | Read-only first; Phase 4C |
| Auto-sending from calendar events | Never in Phase 4A or 4B; requires separate explicit authorization |
| Production migrations in Phase 4A | Phase 4A derives from existing tables; no migration needed |

---

## 5. Relationship to Phase 3M Campaign Work Queue

Phase 3M introduced:
- `campaign_assignments` — FK-linked to `email_drafts` via `campaign_assignment_id`
- `getCampaignWorkQueue` — read-only service returning assigned campaign assignments with draft readiness
- `createDraftFromAssignmentAction` — creates a draft from a campaign assignment

**Phase 4A consumes Phase 3M outputs:** The calendar reads `campaign_assignments` to produce `campaign_assignment_aging` events (age-based; no true due date until Phase 4B). Draft readiness state (`no_draft`, `has_pending_draft`, `has_approved_draft`, `has_draft_from_assignment`) maps directly to calendar event status.

**Phase 4B extends Phase 3M:** When writable scheduling is introduced, campaign assignments may gain an explicit `due_at` timestamp and the ability to be rescheduled without changing the underlying assignment status.

**Phase 4 must not modify Phase 3M tables or logic.** Any new column on `campaign_assignments` for scheduling belongs in a Phase 4B migration, not retroactively in Phase 3M.

---

## 6. Relationship to Phase 3N Proposal Follow-Up Commitments

Phase 3N (planned) introduces:
- `proposal_events` — one open proposal per lead; `proposal_sent_at` as the anchor
- `proposal_follow_up_commitments` — `follow_up_due_at` per interval; `commitment_status` lifecycle
- Follow-up schedule rules (e.g., `standard_3_5_10`): commitments at day 3, 5, 10 after sent

**Phase 4A may be built before Phase 3N is deployed, but proposal calendar sources must be explicitly gated.**

### Source Availability / Gating Model

| Source | Tables Required | Phase 4A Availability |
|--------|----------------|----------------------|
| Campaign assignments | `campaign_assignments` (Phase 3M) | Always available |
| Email drafts / approvals | `email_drafts`, `approval_requests` (Phase 3K/3H) | Always available |
| Proposal follow-up | `proposal_follow_up_commitments`, `proposal_events` (Phase 3N) | **Gated — requires `PROPOSAL_CALENDAR_SOURCE_ENABLED`** |

**`PROPOSAL_CALENDAR_SOURCE_ENABLED`** — feature flag (default: `false`). Set to `true` only after Phase 3N migration `20240038` has been applied and verified on staging. The calendar service must not query `proposal_follow_up_commitments` or `proposal_events` when this flag is `false`.

When `PROPOSAL_CALENDAR_SOURCE_ENABLED = false`, the calendar:
- Omits all proposal-related source queries entirely
- Shows a static notice in the Proposal Follow-Up section: *"Proposal follow-ups unavailable until Proposal Capture is enabled."*
- Does not show an error; renders the rest of the calendar normally with campaign-only sources

**Phase 4 must not modify Phase 3N tables or logic.** Phase 3N's `follow_up_due_at` field is the authoritative schedule source; Phase 4 reads it.

**No `calendar_event_id` on Phase 3N tables.** External calendar sync IDs are stored in the Phase 4C `calendar_sync_links` table (see §39). No column is added to `proposal_follow_up_commitments` at any phase.

---

## 7. Calendar / Scheduling Concepts

### Terminology

| Term | Definition |
|------|-----------|
| **Scheduled Activity** | Any obligation with a due date that should appear on the calendar |
| **Source Object** | The originating DB row that drives the calendar entry (assignment, commitment, draft) |
| **Calendar Event** | The calendar representation of a source object; may be derived or persisted |
| **Event Type** | Categorizes what kind of work is due |
| **Due At** | The date/time when the obligation is expected to be acted upon (hard deadline from a real field, e.g., `follow_up_due_at`) |
| **Aging** | An item without a hard due date; urgency is based on elapsed time since creation (e.g., a campaign assignment or unreviewed draft). Visually distinguished from hard due-date items. |
| **Density** | Number of calendar events on a given day or week |
| **Overdue** | `due_at` is in the past and `status` is still open/pending |
| **Milestone** | A campaign-level anchor event (e.g., first draft created, send window) |
| **Sequence** | The ordered set of follow-up or campaign touches for a lead |

### Calendar Event Lifecycle (Phase 4A — Derived)

```
Source Object created (Phase 3M/3N/3K)
    └── Calendar derives event from due_at field
          ├── status: pending   → future due date, not yet overdue
          ├── status: due_today → due_at is today
          ├── status: overdue   → due_at is past, still open
          ├── status: completed → source status is terminal positive (draft sent, commitment completed)
          └── status: skipped   → source status is skipped/cancelled
```

### Calendar Event Lifecycle (Phase 4B — Persisted)

In Phase 4B, a `scheduled_activities` table holds a mutable record per event, enabling reschedule, pause, and reassignment without modifying the source object.

---

## 8. Unified Scheduled Activity Model

The calendar aggregates activity from multiple source tables into a uniform presentation shape:

```typescript
type CalendarActivity = {
  id: string                        // source row ID (or synthetic composite key in Phase 4A)
  eventType: CalendarEventType
  dueAt: Date                       // the date this obligation is expected
  tenantId: string
  workspaceId: string
  leadId: string | null
  leadName: string | null           // leads.name
  companyId: string | null
  companyName: string | null        // companies.name
  assignedToUserId: string | null
  status: CalendarActivityStatus
  sourceTable: SourceTable
  sourceId: string
  title: string                     // human-readable label for calendar display
  description: string | null        // optional detail
  isOverdue: boolean                // dueAt < now && status is open
  daysOverdue: number | null
  sequencePosition: number | null   // e.g. follow_up_sequence for proposal commitments
  sequenceTotal: number | null
  calendarEventId: string | null    // Phase 4C only: joined from calendar_sync_links; always null in 4A and 4B
}
```

---

## 9. Source Objects and Event Types

| Source Table | Field Used for `dueAt` | Event Type | Phase 4A? |
|-------------|----------------------|-----------|----------|
| `campaign_assignments` | `created_at` (aging proxy — no true due date until Phase 4B) | `campaign_assignment_aging` | Yes |
| `email_drafts` (draft) | `created_at` (aging proxy) | `draft_review_aging` | Yes |
| `email_drafts` (pending_approval) | `created_at` (aging proxy) | `approval_request_aging` | Yes |
| `approval_requests` (pending) | `created_at` (aging proxy) | `approval_request_aging` | Yes |
| `email_drafts` (approved) | (completed state) | `campaign_draft_approved` | Yes — shown as completed |
| `proposal_follow_up_commitments` | `follow_up_due_at` (true due date) | `proposal_follow_up_due` | Yes — **requires `PROPOSAL_CALENDAR_SOURCE_ENABLED`** |
| `proposal_events` (open, past sent_at) | `proposal_sent_at` | `proposal_overdue` | Yes — **fallback only** (see §19); requires `PROPOSAL_CALENDAR_SOURCE_ENABLED` |
| `proposal_events` (terminal) | `updated_at` | `proposal_closed` | Yes — requires `PROPOSAL_CALENDAR_SOURCE_ENABLED` |
| Future: `scheduled_activities` | `scheduled_for` | `manual_task_due`, `future_calendar_event` | No — Phase 4B |

### Event Type Enum

```typescript
export const CalendarEventType = {
  // Aging items — created_at-based; no hard due date (campaign/draft sources)
  CAMPAIGN_ASSIGNMENT_AGING:   'campaign_assignment_aging',
  DRAFT_REVIEW_AGING:          'draft_review_aging',
  APPROVAL_REQUEST_AGING:      'approval_request_aging',
  // Completed campaign state — shown as terminal milestone
  CAMPAIGN_DRAFT_APPROVED:     'campaign_draft_approved',
  // Hard due dates — follow_up_due_at field; requires PROPOSAL_CALENDAR_SOURCE_ENABLED
  PROPOSAL_FOLLOW_UP_DUE:      'proposal_follow_up_due',
  // Proposal fallback / terminal — requires PROPOSAL_CALENDAR_SOURCE_ENABLED
  PROPOSAL_OVERDUE:            'proposal_overdue',     // fallback only — see §19
  PROPOSAL_CLOSED:             'proposal_closed',
  // Phase 4B+
  MANUAL_TASK_DUE:             'manual_task_due',       // Phase 4B
  FUTURE_CALENDAR_EVENT:       'future_calendar_event', // Phase 4C
} as const
```

---

## 10. Calendar Views

Phase 4A provides three standard calendar view modes plus two specialty views:

| View | Description | Phase |
|------|-------------|-------|
| Day View | All activities due on a single day, grouped by type | 4A |
| Week View | 7-column layout showing activity density per day | 4A |
| Month View | Grid showing density dots or counts per day | 4A |
| Activity Density Summary | Bar/heatmap of daily obligation count | 4A |
| Operator Workload View | Per-assignee breakdown of open obligations | 4A |

All views are **read-only in Phase 4A**. Writable actions (reschedule, reassign) are Phase 4B.

---

## 11. Day View

**Route:** `/[workspaceSlug]/schedule/day?date=YYYY-MM-DD`

### Behavior

- Defaults to today's date
- Shows all `CalendarActivity` items where `dueAt` falls on the selected date
- Groups by event type:
  - **Campaign Work** — campaign assignment aging, draft review aging, approval review aging, draft approved
  - **Proposal Follow-Ups** — proposal commitments due
  - **Overdue (Pinned)** — activities from prior days where status is still open
- Each activity card shows:
  - Lead name, company name
  - Event type badge (color-coded)
  - Due time (if time-specific) or "Any time today"
  - Assignee avatar / initials
  - Status chip: pending / due today / overdue
  - Link to source page (lead detail, campaign asset detail, proposal)
- Overdue activities from prior dates are **pinned at the top** of the day view, visually distinguished

### Data Source (Phase 4A — derived)

```typescript
async function getDayActivities(
  tenantId: string,
  workspaceId: string,
  date: Date,
  options?: { proposalSourceEnabled?: boolean }
): Promise<CalendarActivity[]>
// Queries always run (campaign/draft sources — always available):
//   1. campaign_assignments WHERE assignment_status = 'assigned'
//      (aging from created_at::date; event type: campaign_assignment_aging)
//   2. email_drafts WHERE status IN ('draft','pending_approval')
//      (aging from created_at::date; event types: draft_review_aging / approval_request_aging)
//   3. UNION aging overdue from campaign/draft WHERE created_at < date AND still open
// Queries run ONLY when PROPOSAL_CALENDAR_SOURCE_ENABLED = true:
//   4. proposal_follow_up_commitments WHERE follow_up_due_at::date = date
//      AND commitment_status = 'open'  (event type: proposal_follow_up_due)
//   5. proposal_events WHERE proposal_status IN ('sent','viewed')
//      AND no open commitment exists for same lead (proposal_overdue fallback only)
// No LLM. No write. No send.
```

---

## 12. Week View

**Route:** `/[workspaceSlug]/schedule/week?date=YYYY-MM-DD` (Monday of the week)

### Behavior

- 7-column grid (Mon–Sun, or Mon–Fri + weekend collapsed based on workspace setting)
- Each day column shows:
  - Activity count bubble
  - Up to 3 activity previews (overflow: "+ N more")
  - Density bar (height proportional to count)
  - Overdue indicator if any past-due items remain
- Clicking a day column navigates to Day View for that date
- Color coding per event type consistent with Day View
- A "This week" summary bar at the top: total open / overdue / completed for the 7-day window

### Weekend Display

**Default:** Show all 7 days. Operators can toggle "Hide weekends" — preference stored in session or workspace settings (Phase 4B).

---

## 13. Month View

**Route:** `/[workspaceSlug]/schedule/month?date=YYYY-MM` (or default to current month)

### Behavior

- Standard calendar grid (5–6 rows × 7 columns)
- Each day cell shows:
  - Dot count or number badge per event type (color-coded)
  - Overdue indicator if past-due items exist for that day
- Clicking a day navigates to Day View
- "Today" highlighted
- Navigation: previous/next month arrows
- Month summary: total activities, total overdue, total completed this month

---

## 14. Activity Density Summary

Available as a widget on the main calendar page and on the Settings/Operations dashboard.

### What It Shows

- A 30-day heatmap bar chart: one bar per day, height = total open activities
- Color gradient: green (low load) → amber (moderate) → red (high load or overdue-heavy)
- Clickable bars navigate to Day View
- Summary metrics: busiest day, quietest day, average daily load, total overdue count

### Data Source

```typescript
async function getActivityDensitySummary(
  tenantId: string,
  workspaceId: string,
  fromDate: Date,
  toDate: Date
): Promise<DensityBucket[]>
// DensityBucket: { date: Date; totalOpen: number; totalOverdue: number; totalCompleted: number }
// Aggregates across all source tables — no writes, no LLM
```

---

## 15. Operator Workload View

**Route:** `/[workspaceSlug]/schedule/workload`

### Behavior

- Shows all workspace operators as rows
- Per operator, shows:
  - Total open activities assigned to them
  - Breakdown by event type (campaign vs. proposal)
  - Count overdue
  - Next due date
- Sortable by: most overdue, most assigned, next due
- Clicking an operator row filters the Week View to that operator's obligations
- **Phase 4A:**
  - Proposal obligations: assignee read from `proposal_follow_up_commitments.assigned_to_user_id` (requires `PROPOSAL_CALENDAR_SOURCE_ENABLED`).
  - Campaign obligations: `campaign_assignments` does **not** have an `assigned_to` field in Phase 3L/3M. Workload for campaign items is attributed via `assigned_by_user_id` as a fallback owner, or displayed under **"Unassigned"** if no assignee can be determined. This is a known Phase 4A limitation; a true per-assignment assignee field requires a Phase 4B migration on `campaign_assignments`.
- **Phase 4B:** Assignment is read from `scheduled_activities.assigned_to_user_id`; reassignment action becomes available

---

## 16. Campaign Milestone Visualization

A timeline view for a single campaign type, showing the lifecycle of all campaign assignments in that campaign.

**Route:** `/[workspaceSlug]/schedule/campaign?type=<campaign_type>`

### Milestone Sequence (derived from Phase 3L/3M data)

```
Assigned
  └─ No Draft (campaign_assignment_aging — age-based; no hard due date)
       └─ Draft Created (draft_review_aging — age-based)
            └─ Draft Pending Approval (approval_request_aging — age-based)
                 └─ Draft Approved (campaign_draft_approved — completed milestone)
                      └─ Sent (terminal — proposal or send event)
```

### Visualization

- Horizontal timeline per assignment row
- Milestone markers at each state transition
- Today line overlaid
- Color: green = on track, amber = aging, red = overdue
- Hovering a marker shows lead name, date, status detail
- Clicking navigates to the lead detail page

---

## 17. Proposal Follow-Up Visualization

A sequence timeline per open proposal, showing all follow-up commitments for each lead with an open proposal.

**Requires `PROPOSAL_CALENDAR_SOURCE_ENABLED = true`.** When the flag is `false`, the `/schedule/proposals` route renders the static notice: *"Proposal follow-ups unavailable until Proposal Capture is enabled."*

**Route:** Available as a panel on the lead detail page and as a standalone view `/[workspaceSlug]/schedule/proposals`

### Per-Lead Follow-Up Timeline

```
Proposal Sent (anchor — proposal_sent_at)
  ├─ Day +3: Follow-Up #1 (pending / completed / overdue)
  ├─ Day +5: Follow-Up #2 (pending / completed / overdue)
  └─ Day +10: Follow-Up #3 (pending / completed / overdue)
```

### Visualization

- Mini-timeline per lead showing all commitments in the sequence
- Each commitment shown as a node: color = status
  - Blue = future (not yet due)
  - Green = completed
  - Amber = due today
  - Red = overdue
  - Grey = skipped / proposal_closed
- Lead name, proposal reference, amount (if set), last activity date

---

## 18. Draft Review / Approval Visualization

Shows all email drafts currently awaiting operator review or approval.

**Shown in:** Day View, Week View, and a dedicated "Pending Review" panel.

### Draft States Mapped to Calendar

| Draft Status | Calendar Representation | Urgency |
|-------------|------------------------|---------|
| `draft` | "Draft ready for review" | Low — age-based only; no hard deadline |
| `pending_approval` | "Awaiting approval" | Medium — age-based urgency; no hard deadline |
| `approved` | "Approved — ready to send" | Shown as completed milestone |
| `rejected` | Not shown (hidden or collapsed) | |
| `sent` | Shown as completed on send date | |

**Age-based urgency:** Drafts older than N days in `pending_approval` status display an amber/red urgency indicator. N is configurable per workspace (default: 3 days). This is deterministic — no LLM required.

---

## 19. Overdue Activity Handling

**Overdue** = `dueAt < now() AND status is still open/pending`

### Display Rules

1. **Day View:** Overdue items pinned at the top of the selected day's view, with a red "Overdue" banner and days-overdue count.
2. **Week View:** Each day column shows a red overdue count badge if any past-due items remain.
3. **Month View:** Each day cell with overdue items gets a red dot overlay in addition to normal type dots.
4. **Workload View:** Overdue count is prominently shown per operator in a red chip.
5. **Main Calendar Header:** A global overdue counter shown at the top of every calendar page: "3 activities overdue."

### Proposal Overdue — Fallback Rule

`proposal_overdue` events (derived from `proposal_events`) are emitted **only as a fallback**, never alongside `proposal_follow_up_due` events for the same lead:

| Condition | Action |
|-----------|--------|
| `PROPOSAL_CALENDAR_SOURCE_ENABLED = false` | No proposal overdue events (proposal source gated entirely) |
| Phase 3N operational, open commitments exist for this proposal | Use `proposal_follow_up_due` events — **suppress `proposal_overdue`** |
| Phase 3N operational, no open commitments exist for an open proposal | Emit one `proposal_overdue` per open proposal (operator attention signal) |
| Commitment creation failed or data is incomplete | Emit `proposal_overdue` as a fallback operator attention signal |

**Deduplication guardrail:** The calendar service must never return both `proposal_follow_up_due` **and** `proposal_overdue` for the same `(lead_id, proposal_event_id)`. If open commitments exist for a lead's proposal, `proposal_overdue` is suppressed. This must be covered by a test assertion.

### Overdue Resolution

In Phase 4A: Overdue items are resolved when the source object is updated to a terminal state (commitment marked `completed` or `proposal_closed`, draft moved to `approved` or `sent`, etc.). The calendar derives the new state automatically.

In Phase 4B: Overdue items can also be explicitly rescheduled (new due date) or skipped via the `scheduled_activities` table — without modifying the source object.

---

## 20. Completed / Skipped / Delayed States

| State | Source Signal | Calendar Display |
|-------|--------------|-----------------|
| **Completed** | `commitment_status = 'completed'`; draft `status = 'sent'` | Green checkmark; shown in completed section of Day View |
| **Skipped** | `commitment_status = 'skipped'`; Phase 4B: `scheduled_activities.status = 'skipped'` | Grey strikethrough; collapsed by default |
| **Proposal Closed** | `commitment_status = 'proposal_closed'` | Grey; proposal status shown (accepted/rejected/expired) |
| **Delayed** | Phase 4B only: `scheduled_activities.rescheduled_to` is set | Yellow; original due date shown with strikethrough, new date shown |
| **Paused** | Phase 4B only: `scheduled_activities.status = 'paused'` | Purple; paused label; no overdue calculation while paused |

Completed and skipped items are **collapsed by default** in all calendar views; an "Show completed" toggle reveals them.

---

## 21. Reschedule / Pause / Skip / Reassign Rules

> **Phase 4A:** None of these actions exist. Calendar is read-only.  
> **Phase 4B:** All of these actions are introduced via the `scheduled_activities` table.

### Reschedule

- Operator sets a new `scheduled_for` date on a `scheduled_activities` row.
- Original due date preserved in `original_due_at` for audit.
- Source object (e.g., `proposal_follow_up_commitments.follow_up_due_at`) is **not modified** — `scheduled_activities` is the override layer.
- Reschedule is limited to +/- 30 days from original due date by default (configurable).

### Pause

- `scheduled_activities.status = 'paused'`; `paused_at = now()`; `paused_by_user_id` recorded.
- While paused, the activity does not appear as overdue and does not contribute to density calculations.
- Automatic unpause: not implemented in Phase 4B; operator must manually resume.
- Max pause duration: configurable, default 14 days (system alert if exceeded).

### Skip

- `scheduled_activities.status = 'skipped'`; reason captured in `skip_reason`.
- Cannot skip a completed activity.
- Skipping a proposal follow-up commitment also updates `proposal_follow_up_commitments.commitment_status = 'skipped'`.

### Reassign

- `scheduled_activities.assigned_to_user_id` updated to new user.
- Original assignee captured in `originally_assigned_to_user_id` for audit.
- Reassign limited to workspace members (no cross-workspace assignment).

---

## 22. Mid-Sequence Campaign Adjustment Rules

When a campaign assignment sequence is in progress and an operator needs to adjust timing:

### Allowed Adjustments (Phase 4B)

| Adjustment | Effect |
|-----------|--------|
| Reschedule next touch | Shifts the next `scheduled_activities` entry only; subsequent entries not affected |
| Reschedule all remaining touches | Shifts all open `scheduled_activities` entries in the sequence; gap preserving |
| Skip next touch | Marks next entry as skipped; sequence continues from the one after |
| Pause entire sequence | All open entries in the sequence set to `paused` |
| Resume paused sequence | All `paused` entries in the sequence set to `pending` with new due dates |
| Cancel sequence | All open entries set to `skipped`; source assignment status unchanged |

### Immutability Rules

- Completed activities in a sequence are immutable (cannot be rescheduled).
- The original sequence definition (schedule rule, intervals) is preserved for audit; only the override layer changes.
- Campaign assignment status (`assigned`, `completed`) is not modified by calendar actions — calendar adjustments are scheduling overrides, not assignment state changes.

---

## 23. Data Model Options

Three architecture options were evaluated for storing calendar/schedule data.

---

## 24. Option A — Read-Only Derived Calendar View

### Description

No new tables. The calendar is a computed view derived from:
- `proposal_follow_up_commitments.follow_up_due_at`
- `campaign_assignments.created_at` (age-based attention signal — no true due date)
- `email_drafts.created_at` + status
- `approval_requests.created_at` + status

All queries are read-only. No write path. Calendar state changes only when source objects change.

### Pros

| Pro | Detail |
|-----|--------|
| Zero migration risk | No new tables; Phase 4A can ship without a migration |
| Immediate value | Works with existing Phase 3M/3N data immediately |
| Simple rollback | Remove the calendar route; no data to clean |
| No new schema debt | Calendar is a view, not a model |
| Compatible with Phase 3N not yet deployed | Gracefully shows empty state for proposal tables |

### Cons

| Con | Detail |
|-----|--------|
| No rescheduling | Cannot override source object due dates without modifying source tables |
| No pause/skip/reassign | No persistent overrides; all scheduling changes require modifying source rows |
| Limited drag-and-drop | Rescheduling requires a write — not possible without Phase 4B |
| `campaign_assignments` has no true due date | Uses `created_at` as an aging proxy; imprecise; misleading if shown as a hard deadline |
| No calendar-level audit trail | Changes are tracked in source tables only |

### Verdict

**Best for Phase 4A MVP.** Sufficient for visualization only. Becomes limiting when operators need to reschedule or adjust sequences.

---

## 25. Option B — Dedicated `scheduled_activities` Table

### Description

A new canonical table `scheduled_activities` holds one row per calendar obligation. Source objects write to `scheduled_activities` at creation time. The calendar reads exclusively from this table.

```sql
-- Conceptual (not a migration yet)
CREATE TABLE scheduled_activities (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id                uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_table                text NOT NULL,  -- 'proposal_follow_up_commitments', 'campaign_assignments', etc.
  source_id                   uuid NOT NULL,
  event_type                  text NOT NULL,
  scheduled_for               timestamptz NOT NULL,
  original_due_at             timestamptz NOT NULL,
  status                      text NOT NULL DEFAULT 'pending',  -- pending, completed, skipped, paused, rescheduled
  assigned_to_user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  originally_assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  paused_at                   timestamptz,
  paused_by_user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  skip_reason                 text,
  rescheduled_from            timestamptz,
  rescheduled_by_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  -- No calendar_event_id column — Phase 4C uses a dedicated calendar_sync_links table (see §39)
  lead_id                     uuid REFERENCES leads(id) ON DELETE SET NULL,
  company_id                  uuid REFERENCES companies(id) ON DELETE SET NULL,
  sequence_position           integer,
  sequence_total              integer,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
```

### Pros

| Pro | Detail |
|-----|--------|
| Full reschedule / pause / skip support | All writable actions possible without touching source objects |
| Single query for calendar | One table to read; no UNION across source tables |
| External calendar sync ready | Phase 4C bridges via `calendar_sync_links` table (FK to `scheduled_activities.id`) |
| Rich audit trail | Every status change is on the `scheduled_activities` row |
| Operator reassignment native | `assigned_to_user_id` is a first-class column |
| Future AI scheduling possible | Row-level model supports optimization without schema change |

### Cons

| Con | Detail |
|-----|--------|
| Migration required immediately | Must be created before any Phase 4 code ships |
| Source objects must write to it | Phase 3N's `createManualProposalCaptureBundle` must also insert `scheduled_activities`; Phase 3M's action must be retrofitted |
| Sync risk | If source object status changes outside the calendar, `scheduled_activities` may become stale |
| Higher implementation cost | Phase 4 becomes a larger lift |
| Backfill required | All existing Phase 3M assignments and Phase 3N commitments need retroactive rows |

### Verdict

**Correct long-term target, but too expensive for Phase 4A.** Should be introduced in Phase 4B when writable actions are authorized. Source objects should continue as the authoritative state; `scheduled_activities` is the override/scheduling layer.

---

## 26. Option C — Hybrid Derived + Materialized Schedule

### Description

**Phase 4A:** Read-only derived calendar (Option A). No new tables. Works immediately.

**Phase 4B:** Introduce `scheduled_activities` table for writable overrides. Source objects remain authoritative for status; `scheduled_activities` holds scheduling overrides (new due dates, assignments, pause state). The calendar query joins both: use `scheduled_activities` override if present, fall back to source object due date if not.

**Phase 4C:** External calendar integration stores sync state in a dedicated `calendar_sync_links` table (FK → `scheduled_activities.id`); bidirectional sync becomes possible without modifying the `scheduled_activities` schema.

### Calendar Query Logic (Phase 4B hybrid)

```typescript
// Priority: scheduled_activities override > source object due date
// If scheduled_activities row exists for this source_id → use scheduled_for
// Else → use source object due date field
// Status: use scheduled_activities.status if row exists; else derive from source object status
```

### Pros

| Pro | Detail |
|-----|--------|
| Low risk Phase 4A | No migration; ships immediately as read-only |
| Correct long-term | Phase 4B adds scheduling power without schema redesign |
| Incremental | Each sub-phase independently committable |
| No source object modification | Phase 3M/3N source objects unchanged; `scheduled_activities` is additive |
| Phase 4C ready | `calendar_sync_links` table bridges external sync without changing `scheduled_activities` schema |

### Cons

| Con | Detail |
|-----|--------|
| Hybrid query complexity | Phase 4B calendar query must handle both derived and override paths |
| Eventual consistency window | Between source object creation and `scheduled_activities` row creation (if async) |
| Two truth sources | Operators and devs must understand the priority model |

### Verdict

**Recommended MVP path.** Phase 4A ships quickly with zero migration risk. Phase 4B adds the scheduling table only when writable actions are authorized. Phase 4C adds external sync.

---

## 27. Recommended MVP Architecture

**Recommendation: Option C (Hybrid)**

### Phase 4A — Read-Only Derived Calendar

- **Migration:** None required.
- **New tables:** None.
- **New routes:** `/schedule/day`, `/schedule/week`, `/schedule/month`, `/schedule/workload`, `/schedule/proposals`, `/schedule/campaign`
- **Data sources (always available):** `campaign_assignments`, `email_drafts`, `approval_requests`
- **Data sources (gated):** `proposal_follow_up_commitments`, `proposal_events` — only when `PROPOSAL_CALENDAR_SOURCE_ENABLED = true`
- **New service files:** `modules/schedule/services/calendar-query.service.ts` (read-only, no LLM, no Resend)
- **Sidebar nav:** "Schedule" main nav item with `CalendarDays` icon; sub-items Day / Week / Month / Workload
- **Test pattern:** Source-reading + pure-function (date math, density calc, overdue detection)
- **Can ship:** Before Phase 3N is implemented; proposal section shows static "unavailable" notice when gated

### Phase 4B — Writable Scheduling Layer

- **Migration:** `scheduled_activities` table — would use migration `20240039` (the next available number after Phase 3N's `20240038`). **`20240039` is reserved in this design for Phase 4B only. Phase 3N reserves only `20240038`; it does not use `20240039`. No `20240039` migration file exists.**
- **New routes:** Add write actions to existing calendar views (reschedule modal, reassign modal)
- **New services:** `createScheduledActivity`, `rescheduleActivity`, `pauseActivity`, `skipActivity`, `reassignActivity`
- **Requires explicit authorization before implementation**

### Phase 4C — External Calendar Integration

- **Microsoft Graph:** OAuth flow → calendar event create/update/delete via Graph API
- **Google Calendar:** OAuth flow → Google Calendar API
- **Requires:** `calendar_sync_links` table (FK to `scheduled_activities.id`); bidirectional sync strategy — **no `calendar_event_id` column on `scheduled_activities` or any source table**
- **Requires explicit authorization before implementation**

---

## 28. Calendar Event Status Model

```
pending   → due_today → overdue
                   ↓
              completed
              skipped
              paused (Phase 4B)
              rescheduled (Phase 4B)
```

| Status | Description | Display |
|--------|-------------|---------|
| `pending` | Not yet acted on (future obligation or aging item) | Blue / neutral |
| `due_today` | `dueAt` is today | Amber |
| `overdue` | `dueAt` is past, still open | Red |
| `completed` | Source object terminal positive | Green |
| `skipped` | Source object skipped | Grey |
| `paused` | Phase 4B: scheduling override | Purple |
| `rescheduled` | Phase 4B: moved to new date | Yellow |
| `proposal_closed` | Proposal terminal (accepted/rejected/expired/withdrawn) | Grey with proposal status sub-label |

**Status derivation (Phase 4A — deterministic, no LLM):**

```typescript
function deriveActivityStatus(
  dueAt: Date,
  sourceStatus: string,
  now: Date = new Date()
): CalendarActivityStatus {
  if (isTerminalPositive(sourceStatus)) return 'completed'
  if (isSkipped(sourceStatus)) return 'skipped'
  if (isProposalClosed(sourceStatus)) return 'proposal_closed'
  if (dueAt < now) return 'overdue'
  if (isSameDay(dueAt, now)) return 'due_today'
  return 'pending'
}
```

---

## 29. Permissions and Tenant/Workspace Safety

### Access Control

- All calendar queries are scoped to `ctx.tenantId` and `ctx.workspaceId` (via `buildRequestContext`).
- Calendar pages are protected by the existing workspace middleware — unauthenticated users receive a 307 redirect to `/login`.
- No cross-workspace data leaks: all source table queries include `tenant_id =` and `workspace_id =` predicates.

### Operator Visibility

- **Phase 4A:** All workspace operators see all calendar activities for their workspace. No per-operator filtering by default.
- **Workload View:** Shows all operators' obligations; no data is hidden from other operators in the same workspace.
- **Phase 4B:** Reassign action is limited to workspace members. Cannot reassign to users in other workspaces.

### RLS

- Calendar query service uses `createSupabaseServiceClient()` (service role) — bypasses RLS.
- All queries explicitly include `tenant_id` and `workspace_id` predicates as the safety boundary.
- No client-side Supabase queries for calendar data.

---

## 30. Token/LLM Usage Policy

Phase 4 (all sub-phases) uses **zero LLM tokens** for calendar visualization, density calculation, overdue detection, or status derivation.

| Operation | LLM? | Reason |
|-----------|------|--------|
| Calendar query (all sources) | No | Pure SQL reads |
| Overdue detection | No | `dueAt < now()` arithmetic |
| Density calculation | No | `COUNT(*)` aggregation |
| Status derivation | No | Deterministic state machine |
| Reschedule / reassign (Phase 4B) | No | CRUD writes |
| External calendar sync (Phase 4C) | No | OAuth + API calls |

**Future AI scheduling optimization (Phase 5+):** If AI-optimized scheduling is introduced (e.g., "suggest optimal follow-up timing based on lead engagement patterns"), it must:
1. Be gated behind `SCHEDULE_AI_OPTIMIZATION_ENABLED` feature flag
2. Use existing AI usage tracking infrastructure
3. Be budget-enforced via the existing token guardrail pattern
4. Be covered by token-conservation tests

---

## 31. Email Sending Safety Policy

Phase 4 does **not** send any email, automated or otherwise.

| Guardrail | State |
|-----------|-------|
| `EMAIL_SENDING_ENABLED` | Disabled — no change |
| `CAMPAIGN_SENDING_ENABLED` | Disabled — no change |
| Calendar actions (Phase 4B) | Reschedule / pause / skip / reassign only — no send trigger |
| External calendar sync (Phase 4C) | Calendar event create/update only — no email send |
| Overdue alerts | UI display only — no automated email notification |

Any future phase that adds automated notification or follow-up sending triggered by the calendar must:
1. Receive explicit separate authorization
2. Implement a gated kill switch analogous to `EMAIL_SENDING_ENABLED`
3. Be smoke-tested on staging before any production rollout

---

## 32. Microsoft Graph / Outlook Calendar Future Integration

> **Phase 4C — reserved, not implemented in Phase 4A or 4B.**

### Concept

Verian operators who use Outlook / Microsoft 365 could have their proposal follow-up commitments and campaign touches automatically appear in their Outlook calendar. Bidirectional sync: completing an event in Outlook marks the Verian commitment as completed.

### Required Infrastructure (Phase 4C)

1. **Microsoft Entra ID app registration** — OAuth 2.0 PKCE or confidential client
2. **Microsoft Graph API scopes:** `Calendars.ReadWrite`, `offline_access`
3. **Webhook subscription** — Graph change notifications for calendar event updates
4. **`calendar_sync_links` table** — stores the Graph event ID per `scheduled_activities` row; columns: `tenant_id`, `workspace_id`, `scheduled_activity_id`, `provider` (`'microsoft_graph'`), `external_calendar_id`, `external_event_id`, `sync_status`, `last_synced_at`. No `calendar_event_id` column is added to `scheduled_activities` or any source table.
5. **Token storage** — per-operator refresh token stored securely (encrypted at rest)
6. **Sync service** — bidirectional: Verian creates Graph events, Graph webhooks update Verian

### Phase 4C Design Constraints

- Sync is per-operator opt-in, not workspace-wide mandatory
- Only creates/updates/deletes events in the operator's personal calendar — no shared calendar writes without explicit configuration
- External calendar event description: Verian link + lead name + obligation summary
- If sync fails: Verian obligation remains; no silent loss; error surfaced in workspace admin view

### Known Risks

- Microsoft Graph webhook subscriptions expire (max 3 days for calendar events) — renewal required
- Token refresh failures silently break sync — must surface to operator
- Event update conflicts if both Verian and Outlook modify the event simultaneously

---

## 33. Google Calendar Future Integration

> **Phase 4C — reserved, not implemented in Phase 4A or 4B.**

### Concept

Same as Microsoft Graph but via Google Calendar API. OAuth 2.0 with `https://www.googleapis.com/auth/calendar.events` scope.

### Key Differences from Microsoft Graph

| Dimension | Microsoft Graph | Google Calendar |
|-----------|----------------|----------------|
| Event webhook | Graph change notifications (24h max subscription) | Push notifications via `events.watch` (7-day max) |
| Token storage | `refresh_token` per user | Same |
| Event ID format | GUID string | Base64-like string |
| Recurring events | Complex — avoid for Phase 4C | Simpler RRULE but avoid for Phase 4C |

### Phase 4C both providers:

- Implement Microsoft Graph first (more likely operator environment for B2B sales teams)
- Google Calendar as follow-on
- Both share the same `calendar_sync_links` table — the `provider` column distinguishes: `'microsoft_graph'` vs `'google_calendar'`

---

## 34. Notification / Reminder Future Integration

> **Reserved for Phase 4C+ or a dedicated Phase 5 slice.**

### Concept

When a proposal follow-up or campaign touch is due tomorrow (or overdue today), send the assigned operator a reminder notification.

### Delivery Channels (future)

| Channel | Notes |
|---------|-------|
| In-app notification | Phase 4C — toast or notification bell |
| Email digest | "Your 3 follow-ups due today" — requires `EMAIL_SENDING_ENABLED` gate |
| Slack / Teams | Webhook POST — Phase 5+ |
| SMS | Phase 5+ |

**Critical:** Email notifications are subject to `EMAIL_SENDING_ENABLED`. This gate must never be bypassed by a notification system. Any email notification feature requires its own explicit authorization and kill switch.

---

## 35. UI/UX Design Requirements

### Calendar Page Layout

```
┌─────────────────────────────────────────────────────────┐
│ [←] May 2026           [Day] [Week] [Month] [Workload]  │
│ 3 activities overdue   Today: 7 items   This week: 23   │
├─────────────────────────────────────────────────────────┤
│ OVERDUE (pinned)                                        │
│  [🔴] Follow-up #2 — Acme Solar — 3 days overdue       │
│  [🔴] Draft pending — Riverside Energy — 5 days        │
├─────────────────────────────────────────────────────────┤
│ TODAY — Thursday, May 30                                │
│  [🟡] Proposal Follow-Up #1 — Summit Renewables        │
│  [🔵] Campaign Draft Review — BlueSky Properties       │
│  [🔵] Proposal Follow-Up #3 — Coral Ridge              │
│  + 4 more...                                            │
├─────────────────────────────────────────────────────────┤
│ TOMORROW — Friday, May 31                               │
│  [🔵] Follow-Up #2 — Horizon Partners                  │
└─────────────────────────────────────────────────────────┘
```

### Color Coding

| Color | Meaning |
|-------|---------|
| 🔴 Red | Overdue |
| 🟡 Amber | Due today |
| 🔵 Blue | Future (upcoming) |
| 🟢 Green | Completed |
| ⚫ Grey | Skipped / closed |
| 🟣 Purple | Paused (Phase 4B) |

### Interaction Principles

- **Read-only (Phase 4A):** No drag, no inline edit. All actions happen on the source page (lead detail, campaign asset).
- **Click-through:** Every calendar item links to the source page where the operator takes action.
- **Progressive disclosure:** Collapsed completed/skipped by default; toggle reveals.
- **Mobile-aware:** Week and day views must be usable on a tablet (minimum 768px); month view degrades gracefully.
- **Accessible:** Color coding must have icon/label complement for color-blind accessibility.

### Empty and Error States

The calendar must handle partial or complete absence of data gracefully. Every state below must have a UI rendering (no blank screens, no unhandled errors):

| State | Display |
|-------|---------|
| No calendar activities for the selected day/week | Empty illustration + message: "No activity scheduled. Check the Campaign Queue or return tomorrow." |
| Proposal source disabled (`PROPOSAL_CALENDAR_SOURCE_ENABLED = false`) | Static notice in the Proposal section: *"Proposal follow-ups unavailable until Proposal Capture is enabled."* Campaign and draft sources render normally. |
| Unassigned campaign workload | Workload view shows campaign items under a dedicated **"Unassigned"** row — no error; no hidden items. |
| Aging-only day (only `created_at`-based items, no hard due dates) | Items shown with aging labels ("Assignment created 4 days ago") — no due-date language used. |
| One calendar source query fails (e.g., draft query errors) | Available sources rendered; non-blocking warning banner: "Some activity could not be loaded." Page does not fail entirely. |
| Partial source availability (one source gated or errored) | Render available sources; banner notes limited data; no silent omission. |
| Overdue-only day (past date, all items still open) | "No upcoming items" message + overdue pinned section with count badge. |
| No operator workload data | Workload view shows: "No operator assignments found." with a link to the Campaign Queue. |

---

## 36. Sidebar / Navigation Placement

### Recommended Placement

Phase 4A introduces **"Schedule"** as a **top-level main nav item** in the sidebar — not buried under Settings.

**Rationale:** Calendar/schedule is operator-facing and high-frequency. Settings is admin-facing and low-frequency. Burying a daily-use calendar under Settings reduces adoption. This mirrors how Salesforce, HubSpot, and similar CRMs treat their activity/calendar views.

```
Sidebar:
├─ Dashboard
├─ Leads
├─ Message Workspace
├─ Schedule                     ← NEW in Phase 4A
│   ├─ Day View
│   ├─ Week View
│   ├─ Month View
│   └─ Workload
└─ Settings
    ├─ System Intelligence
    ├─ Campaign Queue            ← Phase 3M
    ├─ Proposal Inbox            ← Phase 3N
    ├─ Campaign Assets
    ├─ Analytics
    ├─ AI Usage
    ├─ Imports
    └─ Agent Monitor
```

### Icon

Use `CalendarDays` from `lucide-react` for the Schedule nav item.

### Default Landing

Navigating to `/schedule` redirects to `/schedule/week?date=<current-week-monday>` — the week view is the most useful default for day-to-day operator use.

---

## 37. Test Plan

### Test File

`tests/phase4-scheduling-calendar.test.ts`

### Test Tiers

| Tier | Pattern | Purpose |
|------|---------|---------|
| Source-reading | `fs.readFileSync` + `toContain` | Verify file structure, exports, guardrails |
| Pure function | Direct import + Vitest `expect` | Status derivation, overdue detection, density calc, date math |
| Server-action boundary | Source-reading | Verify boundary checks, no LLM, no send |

### Approximate Test Categories and Counts

| Category | Approx. Count | Notes |
|----------|--------------|-------|
| No Phase 4A migration file | 2 | `supabase/migrations/` contains no `20240039` or Phase 4 migration file |
| Calendar query service exports | 8 | Route exists, service exported, no LLM import |
| Status derivation pure functions | 20 | All status transitions, edge cases |
| Overdue detection | 10 | `dueAt < now`, same-day, future; UTC-correct |
| Timezone / day boundary calculations | 6 | Midnight UTC, cross-day edge cases, `isSameDay` correctness |
| Density calculation | 8 | Aggregation, empty day, maximum count |
| Source object → CalendarActivity mapping | 12 | Proposal commitment, campaign assignment, draft |
| Aging label correctness | 5 | `campaign_assignment_aging` / `draft_review_aging` labels do not use "due date" language |
| Proposal source gating | 8 | When `PROPOSAL_CALENDAR_SOURCE_ENABLED = false`: no proposal tables queried; static notice rendered; no error thrown |
| `PROPOSAL_CALENDAR_SOURCE_ENABLED` — no client-side Supabase | 3 | Calendar data queries use service client, not browser client |
| Campaign assignee fallback | 5 | Unassigned state renders; `assigned_by_user_id` used as fallback; no crash when both null |
| `proposal_overdue` deduplication | 4 | `proposal_overdue` suppressed when open commitments exist for same `(lead_id, proposal_event_id)` |
| No-LLM guardrails | 8 | No LLM imports in any Phase 4 file |
| No-send guardrails | 6 | No `resend.emails.send`, no `EMAIL_SENDING_ENABLED = true`, no `CAMPAIGN_SENDING_ENABLED = true` |
| Tenant/workspace safety | 8 | All queries include `tenantId` + `workspaceId` predicates |
| Phase 3M no-regression | 3 | Phase 3M files unmodified; `getCampaignWorkQueue` still present; no Phase 3M action changed |
| Sidebar nav | 3 | `Schedule` entry present, `CalendarDays` icon, top-level placement |
| Route existence | 6 | Day / Week / Month / Workload / Proposals / Campaign routes exist |
| Calendar event status model | 8 | Status enum completeness; aging types present; proposal types gated |
| Empty/error UI states | 6 | No-activity state, disabled proposal source, unassigned workload, source error state |

**Target:** ~139 tests for Phase 4A.

---

## 38. QA Checklist

### Design Phase (Current)

- [x] No migration file created — Phase 4A requires none
- [x] No `20240039` migration file created — reserved in design only
- [x] No code written
- [x] Production untouched
- [x] `EMAIL_SENDING_ENABLED` remains disabled
- [x] `CAMPAIGN_SENDING_ENABLED` remains disabled
- [x] `PROPOSAL_CALENDAR_SOURCE_ENABLED` defaults to `false` — proposal tables not queried until Phase 3N is deployed

### Pre-Commit (After Phase 4A Implementation Is Authorized)

- [ ] All Phase 4A tests pass (`npx vitest run tests/phase4-scheduling-calendar.test.ts`)
- [ ] TypeScript compiles with zero new errors
- [ ] No Phase 3M/3N/3L/3K or earlier files modified
- [ ] `git status --short` shows only Phase 4A files
- [ ] No migration file created (Phase 4A needs none)
- [ ] No `20240039` migration file created
- [ ] No LLM import in any Phase 4 file
- [ ] No `resend.emails.send()` in any Phase 4 file
- [ ] No client-side Supabase calendar queries (all via service client)
- [ ] Aging event types use aging labels — not due-date language

### Staging Smoke Test (Phase 4A)

- [ ] `/schedule/week` renders without error
- [ ] `/schedule/day?date=today` renders correctly
- [ ] Campaign assignment aging items appear (Phase 3M is deployed on staging)
- [ ] When `PROPOSAL_CALENDAR_SOURCE_ENABLED = false`: proposal section shows "unavailable" notice, no query error
- [ ] When `PROPOSAL_CALENDAR_SOURCE_ENABLED = true` and Phase 3N deployed: proposal follow-up items appear
- [ ] Empty state renders gracefully if no campaign activities exist
- [ ] Overdue items appear in pinned section
- [ ] Unassigned campaign workload row renders correctly
- [ ] No email sent during any calendar interaction

### Phase 4B (When Authorized Separately)

- [ ] Migration for `scheduled_activities` applied to local → staging → production in order
- [ ] Reschedule / pause / skip / reassign actions work correctly
- [ ] DB constraint on double-reschedule handled gracefully
- [ ] No auto-send triggered by any calendar action

---

## 39. Migration Plan (Reserved Only)

### Phase 4A

**No migration required.** Phase 4A derives all calendar data from existing tables. No new tables.

### Phase 4B — `scheduled_activities` Table

**Reserved in design only — no migration file created.** Phase 3N reserves `20240038`. The next available number after that is `20240039`, which this design reserves for Phase 4B. Phase 3N does **not** use `20240039`.

| Migration | Tables | Status |
|-----------|--------|--------|
| `20240039_phase4b_scheduled_activities.sql` | `scheduled_activities` | Reserved in design — file does not exist |

Phase 4B migration will be created only when Phase 4B implementation is explicitly authorized.

**Application order for Phase 4B migration:**
1. Local: apply `20240039` → verify with `supabase db diff`
2. Staging: apply after Phase 3N's `20240037` + `20240038` are already on staging
3. Production: apply in strict order with all predecessors first

### Phase 4C — `calendar_sync_links` Table

Phase 4C adds a dedicated `calendar_sync_links` table via its own migration (number TBD at Phase 4C time; will be the next available after Phase 4B's `20240039`). No `calendar_event_id` column is added to `scheduled_activities` or to any Phase 3N source table.

```sql
-- Conceptual only — not a migration file; no file created
CREATE TABLE calendar_sync_links (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  workspace_id          uuid NOT NULL,
  scheduled_activity_id uuid NOT NULL REFERENCES scheduled_activities(id) ON DELETE CASCADE,
  provider              text NOT NULL,  -- 'microsoft_graph' | 'google_calendar'
  external_calendar_id  text NOT NULL,
  external_event_id     text NOT NULL,
  sync_status           text NOT NULL DEFAULT 'active',
  last_synced_at        timestamptz NOT NULL DEFAULT now()
);
```

---

## 40. Rollout Plan

| Step | Action | Authorization |
|------|--------|--------------|
| 1 | Phase 4A design approval | Yes — this document |
| 2 | Phase 4A implementation plan | Yes — after design approval |
| 3 | Phase 4A code + routes | Implicit per plan |
| 4 | Phase 4A commit + push | Explicit |
| 5 | Phase 4A staging smoke test | Implicit |
| 6 | Phase 4A production deploy | Explicit (no migration needed) |
| 7 | Phase 4B design + plan | Explicit authorization to begin |
| 8 | Phase 4B migration `20240039` created | Implicit per plan |
| 9 | Phase 4B applied to local → staging → production | Each step explicit |
| 10 | Phase 4C design | Explicit authorization to begin |

**Phase 4A can be built and deployed before Phase 3N.** Proposal calendar sources are gated behind `PROPOSAL_CALENDAR_SOURCE_ENABLED` (default `false`). Campaign and draft sources are always available. Set `PROPOSAL_CALENDAR_SOURCE_ENABLED = true` on staging only after Phase 3N migration `20240038` is applied and smoke-tested. The full calendar experience (proposal follow-ups) requires Phase 3N to be fully deployed.

---

## 41. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Phase 4A UNION query is slow on large datasets | Medium | Medium | Add indexes on `follow_up_due_at`, `created_at` (already exist); paginate calendar queries; cap to 90-day window |
| Calendar shows incorrect overdue status (timezone bug) | Medium | Medium | All `dueAt` comparisons use UTC; client renders in local timezone using JS `Date` — keep server-side overdue calc in UTC |
| `campaign_assignments` has no true `due_at` field | High | Low | Phase 4A uses `created_at` as an aging proxy; Phase 4B adds explicit `due_at` to assignments; UI must use aging language — never "assignment due" — until Phase 4B |
| Phase 4B `scheduled_activities` becomes out of sync with source objects | Low | High | Source objects remain authoritative for status; `scheduled_activities` is override-only; stale rows are surfaced as warnings in admin view |
| External calendar sync (Phase 4C) token expiry causes silent failures | Medium | Medium | Expose sync health status in workspace admin; alert on refresh token failure; never fail silently |
| Phase 4 scope creep enables sending | Low | High | TC-4-no-send guardrail tests enforce this; no send-path code allowed in Phase 4 files |
| Drag-and-drop in Phase 4A causes premature writable scope | Medium | Medium | Phase 4A explicitly has no write actions; drag-and-drop deferred to Phase 4B; design document explicitly states this |
| Proposal calendar source queried before Phase 3N tables exist | High | High | `PROPOSAL_CALENDAR_SOURCE_ENABLED` (default `false`) prevents all proposal-table queries; test asserts no proposal query when flag is false |
| `campaign_assignments` workload row shows no assignee | High | Low | Phase 4A workload view shows "Unassigned" row for campaign items; `assigned_by_user_id` used as fallback label; no crash when both null; documented limitation |
| `proposal_overdue` fires alongside `proposal_follow_up_due` for same lead | Medium | Medium | Deduplication guardrail in calendar service: `proposal_overdue` suppressed when open commitments exist for the lead/proposal; covered by test TC-4-proposal-overdue-dedup |

---

## 42. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| 1 | Should the calendar be a top-level nav item or under Settings? | Product | **Decided: top-level "Schedule" nav item** (see §36) |
| 2 | Should Phase 4A show weekends by default? | Product | Default: show all 7 days |
| 3 | How many days back should the overdue lookback window be? | Product | Default: 30 days |
| 4 | Should campaign assignment `due_at` be added in Phase 4A or Phase 4B? | Engineering | **Decided: Phase 4B** — Phase 4A uses `created_at` aging proxy only |
| 5 | Should the Workload View show all workspace operators or only the current operator by default? | Product | Default: show all |
| 6 | Should Phase 4A ship before Phase 3N is deployed? | Engineering | **Decided: yes** — proposal sources gated behind `PROPOSAL_CALENDAR_SOURCE_ENABLED`; campaign sources always available |
| 7 | Should `/schedule` be the default landing page for operators on login? | Product | Current default remains `/main/dashboard` |
| 8 | What is the age threshold for "draft aging" urgency in the calendar? | Product | Default: 3 days (configurable per workspace) |
| 9 | Should Phase 4B's `scheduled_activities` use the same migration as Phase 3N's `20240038`? | Engineering | **Decided: separate** — Phase 3N uses `20240038`; Phase 4B uses `20240039`; they are independent |
| 10 | Should overdue campaign assignments trigger a workspace alert, or only appear in the calendar? | Product | Open — default: calendar only |

---

## 43. Recommended Implementation Slices

### Phase 4A Slices

#### Phase 4A — Slice 1: Calendar Query Service
- Write `modules/schedule/services/calendar-query.service.ts`
- Functions: `getDayActivities`, `getWeekActivities`, `getActivityDensitySummary`, `getOverdueActivities`
- Pure TypeScript + Supabase queries; no LLM; no Resend
- Write `modules/schedule/lib/calendar-status.ts` (status derivation pure functions)
- Write `modules/schedule/lib/activity-mapper.ts` (source object → CalendarActivity)
- Write source-reading + pure-function tests (target ~40 tests)

#### Phase 4A — Slice 2: Day View and Week View
- New routes: `app/(workspace)/[workspaceSlug]/schedule/day/page.tsx`, `week/page.tsx`
- Server components; call calendar query service
- Client components: `CalendarDayView.tsx`, `CalendarWeekView.tsx`
- Overdue pinned section on Day View
- Write source-reading tests (~20 tests)

#### Phase 4A — Slice 3: Month View and Density Summary
- New route: `app/(workspace)/[workspaceSlug]/schedule/month/page.tsx`
- Density summary widget (reusable component)
- Write source-reading tests (~10 tests)

#### Phase 4A — Slice 4: Workload View and Proposal Timeline
- New routes: `schedule/workload/page.tsx`, `schedule/proposals/page.tsx`
- Write source-reading tests (~10 tests)

#### Phase 4A — Slice 5: Sidebar Nav and Polish
- Add `Schedule` top-level nav entry with `CalendarDays` icon to `components/layout/Sidebar.tsx`
- Update `00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `07_NEXT_STEPS.md`
- Full test run; TypeScript check; commit

### Phase 4B Slices (Authorized Separately)

#### Phase 4B — Slice 1: `scheduled_activities` Migration and Repository
- Migration `20240039_phase4b_scheduled_activities.sql`
- Repository functions: `createScheduledActivity`, `rescheduleActivity`, `pauseActivity`, `skipActivity`, `reassignActivity`

#### Phase 4B — Slice 2: Writable Calendar Actions
- Server actions: `rescheduleActivityAction`, `pauseActivityAction`, `skipActivityAction`, `reassignActivityAction`
- Modals: Reschedule modal, Reassign modal, Skip confirmation
- Calendar views become partially writable

#### Phase 4B — Slice 3: Source Object Integration
- Phase 3N's `createManualProposalCaptureBundle` extended to also insert `scheduled_activities`
- Phase 3M's `createDraftFromAssignmentAction` extended similarly (requires Phase 3M re-authorization)
- Backfill existing Phase 3N commitments and Phase 3M assignments

#### Phase 4B — Slice 4: Drag-and-Drop Rescheduling
- Week View becomes droppable; drag activity card to new day = reschedule action

### Phase 4C Slices (Authorized Separately)

#### Phase 4C — Slice 1: OAuth Infrastructure
- Microsoft Entra ID app registration; token storage; refresh token handling

#### Phase 4C — Slice 2: Microsoft Graph Sync
- Create/update/delete Graph calendar events from `scheduled_activities`
- Webhook subscription for bidirectional sync

#### Phase 4C — Slice 3: Google Calendar Sync
- Same pattern as Microsoft Graph

#### Phase 4C — Slice 4: In-App Notification
- Notification bell; overdue alerts; due-today reminders

---

*Phase 4 design complete. Awaiting design review and authorization to proceed to Phase 4A implementation plan.*
