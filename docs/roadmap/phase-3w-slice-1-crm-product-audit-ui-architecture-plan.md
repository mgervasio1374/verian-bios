# Phase 3W Slice 1 — CRM/Product Audit and UI Architecture Plan

**Status:** Audit Complete — Documentation Only  
**Date:** 2026-06-06  
**Branch:** master  
**HEAD at creation:** ff73b846d13394b85596771a75a815aababa458a

---

## A. Purpose

This is the read-only product and code audit for Phase 3W. It documents exact file paths, component names, routes, repositories, services, server actions, and schema references for the CRM/product areas that require improvements in Phase 3W.

No code changes are made in Slice 1. This document is the architecture foundation for all future Phase 3W implementation slices.

---

## B. Current Git State

| Item | Value |
|------|-------|
| HEAD | ff73b84 Docs: add Phase 3W product CRM logo UI uplift design plan |
| origin/master | ff73b846d13394b85596771a75a815aababa458a |
| Working tree at creation | clean |
| Tag at HEAD | none |

---

## C. Pages / Routes Inventory

All routes live under `app/(workspace)/[workspaceSlug]/`.

### C.1 CRM Core Routes

| Route | File | Purpose |
|-------|------|---------|
| `/companies` | `companies/page.tsx` | Companies list view |
| `/companies/[id]` | `companies/[id]/page.tsx` | Company detail — contacts, score, recommendations, documents |
| `/contacts` | `contacts/page.tsx` | Contacts list — name, title, email, phone, status |
| `/leads` | `leads/page.tsx` | Leads Kanban board by pipeline stage |
| `/leads/[id]` | `leads/[id]/page.tsx` | Lead detail — strategy, activity, drafts, agent decisions |
| `/opportunities` | `opportunities/page.tsx` | Opportunities table |
| `/activities` | `activities/page.tsx` | Activities timeline (from `activities` table) |

### C.2 Proposal / Follow-Up Routes

| Route | File | Purpose |
|-------|------|---------|
| `/proposal-inbox` | `proposal-inbox/page.tsx` | Pending proposal captures awaiting review |
| `/proposal-inbox/[captureId]` | `proposal-inbox/[captureId]/page.tsx` | Individual capture review |
| `/proposal-events` | `proposal-events/page.tsx` | All proposal events list |
| `/proposal-events/[eventId]` | `proposal-events/[eventId]/page.tsx` | Event detail with status control |
| `/proposal-follow-ups` | `proposal-follow-ups/page.tsx` | Follow-up queue — complete/skip/reschedule |

### C.3 Message Workspace

| Route | File | Purpose |
|-------|------|---------|
| `/message-workspace` | `message-workspace/page.tsx` | Phase 3B status overview + recent leads list |
| `/message-workspace/[leadId]` | `message-workspace/[leadId]/page.tsx` | Per-lead strategy review, draft versions, quality controls |

### C.4 Settings / Administration Routes

| Route | File | Purpose |
|-------|------|---------|
| `/settings/agent-monitor` | `settings/agent-monitor/page.tsx` | Agent run monitoring |
| `/settings/system-controls` | `settings/system-controls/page.tsx` | Feature toggles / kill switches |
| `/settings/system-intelligence` | `settings/system-intelligence/page.tsx` | Recommendations + structured errors |
| `/settings/analytics` | `settings/analytics/page.tsx` | Analytics dashboard |
| `/settings/ai-usage` | `settings/ai-usage/page.tsx` | AI cost tracking |
| `/settings/campaign-assets` | `settings/campaign-assets/page.tsx` | Campaign template assets |
| `/settings/campaign-queue` | `settings/campaign-queue/page.tsx` | Campaign scheduling queue |
| `/settings/imports` | `settings/imports/page.tsx` | Data imports |
| `/settings/health` | `settings/health/page.tsx` | System health |
| `/settings` | `settings/page.tsx` | Settings home |
| `/inbox` | `inbox/page.tsx` | Main inbox |
| `/submissions` | `submissions/page.tsx` | Submissions view |
| `/artifacts` | `artifacts/page.tsx` | Document vault |
| `/dashboard` | `dashboard/page.tsx` | Workspace dashboard |

### C.5 Shell / Layout

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout |
| `app/(workspace)/layout.tsx` | Workspace group layout |
| `app/(workspace)/[workspaceSlug]/layout.tsx` | Workspace detail layout — includes `<Sidebar>` + `<TopNav>` + `<Toaster>` |
| `components/layout/Sidebar.tsx` | Primary navigation sidebar (see Section H) |

---

## D. Companies Audit

### D.1 Files involved

| File | Role |
|------|------|
| `app/(workspace)/[workspaceSlug]/companies/page.tsx` | Companies list page |
| `app/(workspace)/[workspaceSlug]/companies/[id]/page.tsx` | Company detail page |
| `modules/crm/repositories/company.repo.ts` | DB layer: listCompanies, getCompany, createCompany, updateCompany |
| `modules/crm/services/company.service.ts` | Permissions + event enqueue layer |
| `modules/crm/actions/company.actions.ts` | Server actions: create, update, delete |
| `modules/intelligence/repositories/activity-event.repo.ts` | `listCompanyActivityEvents(tenantId, companyId, opts)` |

### D.2 Company detail page — current display

The company detail page (`companies/[id]/page.tsx`) currently renders:
- Name, industry badge, status
- Details card: domain link, phone, address, employee count, annual revenue
- Contacts card: list of linked contacts (first 20) with `is_primary_contact` badge
- Company Score card: `<ScoreCompanyButton>` for on-demand intelligence scoring
- Next Best Action card: `<GenerateRecommendationButton>`
- Documents card: artifact vault entries with file size, status, open link

### D.3 Edit controls

**Server actions already exist:**
- `createCompanyFromDialogAction(input)` — create
- `updateCompanyAction(id, formData)` — update
- `deleteCompanyAction(id)` — soft-delete

The service (`company.service.ts`) enforces `crm.companies.edit` permission and enqueues `company.updated` event on update.

**Gap:** There is no dedicated company edit form page or edit section on the company detail page. Mutations are dialog-only. Operators have no in-page edit controls for phone, website, address, industry, status, or metadata.

**Fix needed in Slice 2:** Add an inline edit form or edit panel on the company detail page. The server action and service already support this — only a UI change is needed. No new migration required.

### D.4 Notes area

**Gap:** The company detail page has no notes section. The `notes` table (migration `20240002_crm.sql`) already exists with:
- `body` (text), `pinned` (boolean), `company_id` (FK), `created_by`, `deleted_at` (soft-delete)

**Fix needed in Slice 3:** Add a notes UI to the company detail page. A notes repository and server actions need to be created. No new migration is required — the table already exists.

### D.5 Add/edit contact from company

**Gap:** The contacts card on the company detail page displays existing contacts but has no "Add Contact" button that pre-populates the company association.

**Fix needed in Slice 4:** Add a dialog or action that calls `createContactAction()` with `company_id` pre-set to the current company.

### D.6 Related records — leads, proposals, activity timeline

**Gap:** The company detail page does not show:
- Linked leads (the `listLeads(ctx, { companyId })` filter exists in the repo)
- Linked opportunities
- Linked proposal events
- Activity timeline (though `listCompanyActivityEvents` exists in `activity-event.repo.ts`)

**Fix needed in Slice 3 or a dedicated company enhancement slice:** Wire activity timeline and related leads to the company detail page.

### D.7 Schema — no changes needed for Slice 2

The `companies` table already contains all necessary fields:
`name`, `domain`, `phone`, `website`, `industry`, `employee_count`, `annual_revenue`, `address_line1/2`, `city`, `state`, `zip`, `country`, `status`, `source`, `owner_id`, `tags`, `metadata`

No migration needed for company edit controls.

---

## E. Contacts Audit

### E.1 Files involved

| File | Role |
|------|------|
| `app/(workspace)/[workspaceSlug]/contacts/page.tsx` | Contacts list page |
| `modules/crm/repositories/contact.repo.ts` | DB layer: listContacts (supports companyId filter), getContact, createContact, updateContact |
| `modules/crm/services/contact.service.ts` | Permissions + event layer |
| `modules/crm/actions/contact.actions.ts` | Server actions: create, update, delete |

**No contact detail page found.** Contacts are currently accessed only via the contacts list or the company detail contacts card.

### E.2 Contacts list — current columns

| Column | Shown |
|--------|-------|
| Name (first + last, linked) | YES |
| Title | YES |
| Email | YES |
| Phone | YES |
| Status | YES (do_not_contact shows as 'DNC' badge) |
| is_primary_contact | YES (text badge below name) |
| **Company name** | **NO — gap** |
| Department | NO |
| Last activity | NO |
| Linked lead/opportunity | NO |

### E.3 Company association in schema

The `contacts` table has `company_id uuid REFERENCES companies(id)` — association exists in the data model.

The list query in `contact.repo.ts` supports `companyId` filtering: `listContacts(opts: { companyId? })`. However, the contacts list page does not JOIN or display the company name.

### E.4 Orphan contacts

The `contacts.company_id` column is nullable — orphan contacts (no company) are currently possible. The contacts list does not flag or distinguish them.

**Recommendation:** Allow orphan contacts but visually flag them as "No company" in the list. This handles import scenarios without breaking data entry.

### E.5 Gaps — contacts list

- No company name column (most critical gap for B2B usability)
- No contact detail page
- No last activity date
- No linked lead/opportunity context

### E.6 Gaps — contact detail

No dedicated contact detail page exists. Need to create:
- `app/(workspace)/[workspaceSlug]/contacts/[id]/page.tsx`
- Should show: company relationship, title, role, email, phone, do_not_contact, suppression status, linked leads, proposal/follow-up history, activity timeline

### E.7 Schema — no changes needed for contacts list improvement

Company name display requires a JOIN: `contacts JOIN companies ON contacts.company_id = companies.id`. The `listContacts` repo function can be extended to include `companies(name)` in its select.

---

## F. Leads Audit

### F.1 Files involved

| File | Role |
|------|------|
| `app/(workspace)/[workspaceSlug]/leads/page.tsx` | Leads Kanban board |
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | Lead detail page |
| `app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx` | Activity timeline component |
| `app/(workspace)/[workspaceSlug]/leads/[id]/ScoreLeadButton.tsx` | Lead scoring trigger |
| `app/(workspace)/[workspaceSlug]/leads/[id]/WorkflowToggle.tsx` | Workflow enable/disable |
| `app/(workspace)/[workspaceSlug]/leads/[id]/AgentDecisionPanel.tsx` | Agent run decisions |
| `modules/crm/repositories/lead.repo.ts` | DB layer: listLeads, getLead, createLead, updateLead, listLeadsByStage |
| `modules/crm/services/lead.service.ts` | Permissions, stage change events |
| `modules/crm/actions/lead.actions.ts` | createLead, updateLead, updateLeadStage, deleteLead, setWorkflowEnabled, createLeadWithContact |

### F.2 Root cause of horizontal scroll

**Source:** `leads/page.tsx` container CSS:
- Container: `flex gap-4 overflow-x-auto pb-4`
- Each column: `flex-none w-64` (fixed 256px width, does not shrink)

With 5+ stages each at 256px, total width exceeds standard desktop. The `overflow-x-auto` makes it scroll rather than wrap.

**Fix needed in Slice 6:**
- Option A: Reduce column width to ~200–220px for compact Kanban
- Option B: Add a list/table view toggle (`flex-none w-64` → full-width table)
- Option C: Responsive column sizing with `min-w-[200px] flex-1` instead of `flex-none w-64`

Recommended: Option C (responsive) + Option B (list toggle).

### F.3 Lead Kanban cards — current fields

| Field | Currently shown |
|-------|----------------|
| Lead name | YES |
| Estimated value | YES (if present) |
| Priority badge | YES |
| Workflow enabled badge | YES |
| **Company name** | **NO — gap** |
| **Contact name** | **NO — gap** |
| **Next action / due date** | **NO — gap** |
| **Proposal status** | **NO — gap** |
| **Follow-up status** | **NO — gap** |
| **Assigned owner** | **NO — gap** |

### F.4 Lead list table — does not exist

There is no table/list view. Only the Kanban board exists.

**Fix needed in Slice 6:** Add a list view component — `LeadListView` — rendering a table with: company, contact, stage, score, next action, proposal status, follow-up status, owner, last activity. Toggle between board and list via a UI control.

### F.5 Lead detail — activity timeline

The lead detail page already has `<LeadActivityTimeline events={activityEvents} />` component. Activity events from `activity_events` table are displayed. This is the working pattern to replicate for company and contact detail pages.

---

## G. Msg Workspace Audit

### G.1 Files

| File | Role |
|------|------|
| `app/(workspace)/[workspaceSlug]/message-workspace/page.tsx` | Index — Phase 3B status + recent leads |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx` | Per-lead strategy workspace |

### G.2 Current index page content

The index page renders:
- Header: "Message Workspace" with subtitle "Phase 3B — Message Strategy Agent."
- Status card listing agent implementation status:
  - ✓ Message Strategy Agent — Foundation complete
  - ○ Copywriting Agent — Not yet implemented
  - ○ Quality Review Agent — Not yet implemented
  - ○ Learning Agent — Not yet implemented
- Recent Active Leads section: table of last 10 non-closed leads with company name, stage, source, created date, and link to per-lead workspace page

### G.3 Assessment

**Infrastructure-facing with a thin operator layer.** The index page is primarily an agent status dashboard, not an operator task tool. The per-lead page (`/message-workspace/[leadId]`) is more functional but requires knowing the lead ID.

**Recommendation for Slice 7:** Remove "Msg Workspace" from the primary sidebar navigation. The per-lead workspace is accessible from the lead detail page (`leads/[id]`) which already links to it. The index status page can remain but should not occupy a primary nav slot.

The Phase 3W design plan recommendation (Option C — hide until functional) is confirmed by this audit. The page content is agent-infrastructure status, not an operator workflow. The intended future operator experience (select lead → generate strategy → review → connect to campaign) is not yet implemented.

---

## H. Sidebar / Navigation Audit

### H.1 Component

**File:** `components/layout/Sidebar.tsx`

**Type:** Client component (`'use client'`)

**Active state detection:** `usePathname()` → `pathname.startsWith(item.href)`

**Active styling:** `bg-accent text-accent-foreground font-medium` on matching item

**Icon library:** `lucide-react`

**Nav item interface:** `{ label: string, href: string, icon: LucideIcon }`

### H.2 Current nav items (in order, 22 items)

| # | Label | Path suffix | Current group |
|---|-------|------------|---------------|
| 1 | Dashboard | /dashboard | — |
| 2 | Companies | /companies | — |
| 3 | Contacts | /contacts | — |
| 4 | Leads | /leads | — |
| 5 | Opportunities | /opportunities | — |
| 6 | Activities | /activities | — |
| 7 | Submissions | /submissions | — |
| 8 | Inbox | /inbox | — |
| 9 | Proposal Inbox | /proposal-inbox | — |
| 10 | Proposal Events | /proposal-events | — |
| 11 | Follow-Up Queue | /proposal-follow-ups | — |
| 12 | Msg Workspace | /message-workspace | — |
| 13 | Artifacts | /artifacts | — |
| 14 | Agent Monitor | /settings/agent-monitor | — |
| 15 | System Controls | /settings/system-controls | — |
| 16 | Sys Intelligence | /settings/system-intelligence | — |
| 17 | Imports | /settings/imports | — |
| 18 | Analytics | /settings/analytics | — |
| 19 | AI Usage | /settings/ai-usage | — |
| 20 | Campaign Assets | /settings/campaign-assets | — |
| 21 | Campaign Queue | /settings/campaign-queue | — |
| 22 | Settings | /settings | — |

**No groups, no dividers, no role-based visibility logic.**

### H.3 Proposed grouped architecture

**Workspace** (items 1–6 above)
**Proposal Workflow** (items 9–11, renaming Proposal Inbox as "Approval Inbox")
**Messaging** (items 20–21)
**Intelligence** (items 14–16, 18–19, 13)
**Administration** (items 7–8, 17, 22)
**Remove from primary nav:** Msg Workspace (item 12)

**Implementation approach for Slice 7:** Add section label dividers between groups in `Sidebar.tsx`. Low-risk change — no routing or permission logic changes needed. The `NavItem[]` array can be split into grouped sections with section headers.

### H.4 Files to modify in Slice 7

- `components/layout/Sidebar.tsx` — add section dividers, reorder items, remove Msg Workspace

---

## I. Notes / Activity Infrastructure Audit

### I.1 Notes table — already exists

Migration `supabase/migrations/20240002_crm.sql` defines the `notes` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | — |
| tenant_id | uuid FK | required |
| workspace_id | uuid FK | required |
| body | text | required |
| pinned | boolean | default false |
| company_id | uuid FK | nullable |
| contact_id | uuid FK | nullable |
| lead_id | uuid FK | nullable |
| opportunity_id | uuid FK | nullable |
| created_by | uuid | — |
| updated_by | uuid | — |
| deleted_by | uuid | — |
| created_at | timestamptz | — |
| updated_at | timestamptz | — |
| deleted_at | timestamptz | soft-delete |

Indexes: `idx_notes_lead`, `idx_notes_company`

**The notes table already exists. No new migration is needed for basic notes functionality.**

However, there is no notes repository, notes service, or notes server action. All of this must be created in Slice 3.

### I.2 Activity events table — already exists and is used

Migration `supabase/migrations/20240016_phase3a_intelligence_tables.sql` defines `activity_events`.

Key repository functions in `modules/intelligence/repositories/activity-event.repo.ts`:
- `recordActivityEvent(input)` — write
- `listEntityActivityEvents(tenantId, entityType, entityId, opts)` — generic
- `listLeadActivityEvents(tenantId, leadId, opts)` — lead-specific
- `listCompanyActivityEvents(tenantId, companyId, opts)` — company-specific

**Activity timeline component already exists for leads:**
- `app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx`

**This component is the reference implementation for adding activity timelines to company and contact detail pages.**

### I.3 Activities table (distinct from activity_events)

Migration `20240002_crm.sql` also defines an `activities` table for CRM-type activities (calls, emails, meetings):
- `activity_type`, `subject`, `body`, `outcome`, `occurred_at`, `duration_minutes`
- FKs to company/contact/lead/opportunity
- No soft-delete

This is different from `activity_events` (the intelligence event stream). The `/activities` page renders from this table.

### I.4 Notes schema clarification

**No migration is needed for Slice 3** (company notes UI) — the `notes` table already exists.

Any future schema changes for CRM notes (e.g., adding a `note_type` column, adding indexes, or adding contact-level indexes) must be handled in a separately planned, reviewed, CRM-only migration slice — not in this design-plan document or in Slice 3 implementation unless a new column is confirmed necessary.

---

## J. Permission / Server Action Patterns

### J.1 Auth context pattern

All server actions follow this pattern:

```typescript
const supabase = await createSupabaseServerClient()
const ctx      = await buildRequestContext(supabase)
// ctx contains: tenantId, workspaceId, userId, permissions
```

`buildRequestContext` is the established auth boundary — it validates the session, resolves the workspace, and loads permissions. This must be used in all new server actions for Phase 3W.

### J.2 Permission enforcement pattern

**Service layer (preferred):**
```typescript
requirePermission(ctx, 'crm.companies.edit')
```

**Relevant permissions for Phase 3W CRM operations:**
| Permission | Operation |
|-----------|-----------|
| `crm.companies.view` | List/get companies |
| `crm.companies.create` | Create company |
| `crm.companies.edit` | Update/delete company |
| `crm.contacts.view` | List/get contacts |
| `crm.contacts.create` | Create contact |
| `crm.contacts.edit` | Update/delete contact |
| `crm.leads.view` | List/get leads |
| `crm.leads.create` | Create lead |
| `crm.leads.edit` | Update lead |
| `crm.leads.delete` | Delete lead |

**Phase 3W notes permission (to be designed):**
- Likely: `crm.notes.create`, `crm.notes.edit` — or reuse `crm.companies.edit` / `crm.contacts.edit` depending on permission model
- Decision to be made during Slice 3 implementation planning

**IMPORTANT — send permission is separate:**
`messaging.send_emails` is required for `sendFollowUpDraftAction`. This is distinct from all CRM edit permissions. Phase 3W never needs this permission.

### J.3 Server action return type

Standard pattern:
```typescript
ActionResult<T> = { success: true; data: T } | { success: false; error: string }
```

All new Phase 3W server actions must use this return type.

### J.4 Cache invalidation pattern

After mutations:
```typescript
revalidatePath(`/${workspaceSlug}/companies`, 'page')
revalidatePath(`/${workspaceSlug}/companies/${id}`, 'page')
```

Workspace slug must be obtained from `ctx` or from the URL segment passed to the action.

### J.5 Tenant/workspace isolation pattern

Every DB query must include:
```typescript
.eq('tenant_id', ctx.tenantId)
.eq('workspace_id', ctx.workspaceId)
```

And soft-delete filter:
```typescript
.is('deleted_at', null)
```

### J.6 Activity event logging pattern

After successful mutations:
```typescript
await recordActivityEvent({
  tenantId:     ctx.tenantId,
  workspaceId:  ctx.workspaceId,
  eventType:    ActivityEventType.COMPANY_UPDATED, // or equivalent
  entityType:   'company',
  entityId:     companyId,
  eventSummary: 'Company updated',
  properties:   { fieldChanged: ..., oldValue: ..., newValue: ... },
})
```

The company and lead services already enqueue workflow events (`enqueueEvent`). For Phase 3W mutations, `recordActivityEvent` should be called in the service layer after successful mutations to populate the activity timeline.

---

## K. Proposed Phase 3W Implementation Architecture

### K.1 UI layer

New components needed per slice:

| Component | Slice | Location |
|-----------|-------|----------|
| CompanyEditForm (inline panel or dialog) | Slice 2 | `app/.../companies/[id]/CompanyEditPanel.tsx` |
| CompanyNotesSection | Slice 3 | `app/.../companies/[id]/CompanyNotesSection.tsx` |
| CompanyActivityTimeline | Slice 3 | `app/.../companies/[id]/CompanyActivityTimeline.tsx` |
| AddContactFromCompanyDialog | Slice 4 | `app/.../companies/[id]/AddContactDialog.tsx` |
| ContactDetailPage | Slice 5 | `app/.../contacts/[id]/page.tsx` |
| ContactCompanyBadge | Slice 4/5 | `components/crm/ContactCompanyBadge.tsx` |
| LeadListView | Slice 6 | `app/.../leads/LeadListView.tsx` |
| LeadBoardListToggle | Slice 6 | `app/.../leads/page.tsx` (toggle state) |
| Sidebar section dividers | Slice 7 | `components/layout/Sidebar.tsx` |

### K.2 Server actions

New server actions needed:

| Action file | Slice | Key actions |
|-------------|-------|-------------|
| `modules/crm/actions/notes.actions.ts` | Slice 3 | createNoteAction, updateNoteAction, deleteNoteAction |

Existing actions that need minor extension:
- `contact.actions.ts` — may need `createContactWithCompanyAction(input: { companyId })` for Slice 4
- No new lead actions needed for Slice 6 (UI-only change)

### K.3 Services

New service needed:

| Service file | Slice | Key functions |
|-------------|-------|---------------|
| `modules/crm/services/note.service.ts` | Slice 3 | createNote, updateNote, deleteNote, listNotesForEntity |

### K.4 Repositories

New repository needed:

| Repository file | Slice | Key functions |
|----------------|-------|---------------|
| `modules/crm/repositories/note.repo.ts` | Slice 3 | insertNote, updateNote, softDeleteNote, listNotesByEntity |

Existing repositories needing extension:
- `contact.repo.ts` — extend `listContacts` to JOIN `companies(name)` for Slice 4/5

### K.5 Migrations

| Migration | Slice | Needed |
|-----------|-------|--------|
| Company edit controls | Slice 2 | **No — all columns exist** |
| Company notes UI | Slice 3 | **No — notes table exists** |
| Contact list company column | Slice 4 | **No — company_id FK exists** |
| Contact detail page | Slice 5 | **No — all columns exist** |
| Lead board/list redesign | Slice 6 | **No — UI only** |
| Sidebar grouping | Slice 7 | **No — UI only** |
| Logo + UI uplift | Slice 8 | **No — UI only** |

**No new migrations are expected for Phase 3W.** All required tables and columns already exist. If a migration becomes necessary during implementation (e.g., adding a notes index, adding a `note_type` column), it must be separately planned and reviewed.

### K.6 Tests

Existing test patterns (in `tests/`) should be extended for:
- Notes repository: create, update, soft-delete, list-by-entity
- Notes server actions: permission check, tenant scope, input validation
- Contact list with company name: verify JOIN results

---

## L. Refined Slice Plan

Based on audit findings, the Phase 3W slice breakdown from the design plan is confirmed with the following refinements:

| Slice | Title | Type | Key files |
|-------|-------|------|-----------|
| Slice 1 (this) | CRM/Product audit and UI architecture plan | Docs only | This document |
| Slice 2 | Company edit controls | Code — UI + server action (no migration) | `companies/[id]/page.tsx`, `CompanyEditPanel.tsx`, `company.actions.ts` extension |
| Slice 3 | Company notes + activity timeline | Code — UI + new repo/service/action (no migration) | `companies/[id]/CompanyNotesSection.tsx`, `CompanyActivityTimeline.tsx`, `note.repo.ts`, `note.service.ts`, `notes.actions.ts` |
| Slice 4 | Contact-company relationship controls | Code — UI + repo extension (no migration) | `companies/[id]/AddContactDialog.tsx`, `contact.repo.ts` JOIN extension, `contacts/page.tsx` company column |
| Slice 5 | Contact detail page | Code — new page (no migration) | `contacts/[id]/page.tsx` |
| Slice 6 | Lead board/list redesign | Code — UI only (no migration) | `leads/page.tsx`, `LeadListView.tsx`, `LeadBoardListToggle.tsx` |
| Slice 7 | Sidebar grouping and navigation IA | Code — UI only (no migration) | `components/layout/Sidebar.tsx` |
| Slice 8 | Logo asset integration and UI uplift | Code — UI only (no migration) | `components/layout/Sidebar.tsx`, global CSS/tokens, `public/brand/` |
| Slice 9 | Codex review and phase lock | Docs only | Review all slices; confirm no regressions |

**All Phase 3W slices are code-only or docs-only. No new migrations are expected.**

---

## M. Risks / Constraints

| Risk / Constraint | Mitigation |
|-------------------|-----------|
| CRM edits bypass activity logging | `recordActivityEvent` must be called in service layer after every mutation — not optional |
| Notes repo created without tenant/workspace scope | All note queries must include `.eq('tenant_id', ctx.tenantId).eq('workspace_id', ctx.workspaceId)` |
| Contact list JOIN degrades performance | Add index on `contacts.company_id` if needed (already exists per audit) |
| Lead board refactor breaks Kanban | Keep Kanban as default; list view is additive |
| Sidebar reorder breaks active state | `pathname.startsWith(item.href)` logic is robust to reordering; no logic change needed |
| Logo assets added outside reviewed slice | Logo files must not be added until Slice 8 is planned and reviewed. Assets are preserved at `C:\Projects\verian-brand-assets-staging\` |
| Send functionality introduced | Phase 3W introduces no send path. `messaging.send_emails` is never required or used. |
| Production DB writes | No direct DB mutations. All CRM mutations go through server actions → service → repository |
| Unreviewed migrations | No migration created without a separate Codex-reviewed plan |
| Phase 3V Slice 5 bypass | Slice 5 remains BLOCKED. No Phase 3W slice touches send/approval path. |

---

## N. Out of Scope

The following are explicitly out of scope for all Phase 3W slices:

| Item | Status |
|------|--------|
| Email sending | Gated — not in Phase 3W |
| Campaign sending | Gated — not in Phase 3W |
| Approve-and-send path | Gated — not in Phase 3W |
| Runtime gate changes | Not in Phase 3W |
| Production DB writes from Claude | Never |
| Direct DB mutation for CRM edits outside reviewed server actions | Not permitted |
| Logo asset integration | Slice 8 only — not in Slice 1 |
| Full app redesign | Uplift only — not a rebuild |
| Phase 3V Slice 5 | BLOCKED — separate authorization required |
| LLM draft generation | Phase 3S future slice |
| Copywriting agent implementation | Phase 3B future slice |
| Quality review agent implementation | Phase 3B future slice |
| Learning agent implementation | Phase 3B future slice |

---

## O. Final Recommendation

**Audit is complete. Phase 3W Slice 1 is PASS.**

Key findings that simplify implementation:
1. **No new migrations needed for any Phase 3W slice.** All required tables/columns exist.
2. **Company edit server actions already exist.** Slice 2 is UI-only (`CompanyEditPanel.tsx`).
3. **Notes table already exists.** Slice 3 requires only repo/service/action/UI — no schema work.
4. **Activity timeline component pattern is established** (`LeadActivityTimeline.tsx`). Slices 3 and 5 replicate this pattern.
5. **Contact company_id FK exists.** Slice 4 requires only a JOIN in `contact.repo.ts` and a UI column change.
6. **Lead horizontal scroll root cause identified.** `flex-none w-64` fixed-width columns in `leads/page.tsx`.
7. **Sidebar is a single component.** `components/layout/Sidebar.tsx` — Slice 7 adds dividers only.

Recommended next step:
1. Codex reviews this Slice 1 plan.
2. If PASS: commit and push this document.
3. Proceed to Phase 3W Slice 2 — Company edit controls implementation plan and execution.
