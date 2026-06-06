# Phase 3W — Product, CRM, Logo, and Small UI Uplift Design Plan

**Status:** Design Plan — Documentation Only  
**Date:** 2026-06-06  
**Branch:** master  
**HEAD at creation:** 63745a4f7b2f151fbd27ac1079d73b068ac7f838

---

## A. Purpose

This document defines the Phase 3W design plan for improving Verian's core product usability, CRM controls, navigation structure, logo/branding integration, and small UI polish.

Phase 3W is a deliberate product maturity phase — its goal is to make the operator experience substantively usable for real CRM and workflow management before any deeper send or campaign functionality is introduced.

This document is planning-only. No code changes, migrations, DB writes, or app actions are performed here.

---

## B. Why Phase 3W Comes Before Slice 5

Verian has working workflow intelligence foundations:

- Proposal event capture is operational.
- Proposal follow-up commitment tracking is operational.
- Follow-up draft generation and template rendering are operational.
- Approval request creation and sync are verified (Slice 4M PASS).
- Activity event logging is wired.

However, the operator experience around core CRM objects — companies, contacts, leads — has significant gaps that will compound as the system matures:

1. **Company records are display-only.** Operators cannot edit core company data through the UI.
2. **Contact-company relationships are weak.** Contacts can exist without company association; the UI does not enforce or expose this clearly.
3. **The lead board has UX friction.** Horizontal scrolling on the Kanban creates awkward usage on normal desktop widths.
4. **Navigation is flat and ungrouped.** 20+ menu items with no logical hierarchy creates cognitive load.
5. **The app has no Verian branding.** Plain "Verian BIOS" text instead of a logo makes the product feel unfinished.
6. **Message Workspace is not actionable.** The page is unclear in purpose and provides no operator value in its current state.

Slice 5 involves introducing send-path work, which will require operators to navigate and understand all of the above. Fixing product fundamentals before adding complexity is lower risk.

---

## C. Current Product Observations

### C.1 Confirmed working foundations
- Proposal capture pipeline (event → commitment → draft → approval)
- Approval sync (pending_approval → approved without send)
- Template-based draft generation
- Activity event logging
- System controls / gate system
- Sender identity management
- Lead, contact, company, opportunity records exist

### C.2 Confirmed gaps
| Area | Gap |
|------|-----|
| Company edit | No edit controls for phone, website, address, industry, status |
| Company notes | No notes area at company level |
| Company relationships | No linked leads/proposals/history shown on company page |
| Contact-company link | Not enforced, not clearly shown in contacts list |
| Contacts list | Missing company, title/role, status, last activity columns |
| Lead board | Horizontal scroll; cards too wide for normal desktop |
| Msg Workspace | Unclear purpose; no actionable operator function |
| Navigation | 20+ flat menu items; no grouping or hierarchy |
| Logo | Plain text — no branding |
| UI consistency | Inconsistent button styles, status pills, spacing across pages |

---

## D. Company Page Gaps

### D.1 Display-only problem
Company information fields are currently read-only. Operators cannot correct or update:
- Phone
- Website
- Address
- Industry
- Status
- Custom metadata fields

This forces reliance on database access for normal CRM maintenance, which is not sustainable.

### D.2 Notes gap
There is no company-level notes area. Operators have no place to record qualitative context about a company (e.g., decision-maker notes, relationship history, meeting outcomes).

### D.3 Contact management from company
Adding a contact from the company page should:
- Pre-populate the company association automatically.
- Not require the operator to separately navigate to Contacts and manually re-enter the company.

### D.4 Related records visibility
The company page should surface:
- Linked contacts (with primary flag)
- Linked leads and their current stage
- Linked opportunities
- Linked proposal events (sent proposals, status)
- Follow-up commitments in progress
- Documents/assets attached to the company
- Activity timeline (most recent events first)

None of these are currently available in context from the company page.

### D.5 Design goal
The company page should become a self-contained CRM record that allows an operator to understand the full relationship with a company without switching between pages.

---

## E. Contact Page Gaps

### E.1 Company association missing from list view
The contacts list does not display the associated company. For a B2B application, this is a critical omission — contacts without visible company context are difficult to manage at scale.

### E.2 Orphan contact handling
Contacts without a company association should be handled explicitly:
- **Option A:** Block creation of contacts without a company (strict B2B enforcement).
- **Option B:** Allow creation but flag as incomplete (import-staging or pre-enrichment records).
- **Option C:** Allow freely, but show "No company" prominently so operators know to clean up.

Recommended: Option B — allow creation but flag visually as incomplete. This handles import scenarios without breaking data entry.

### E.3 Contacts list column plan
The contacts list should display:
| Column | Notes |
|--------|-------|
| Name | First + last, link to detail |
| Company | Linked company name |
| Title / Role | Job title |
| Primary | Badge if this is the primary contact for their company |
| Email | Primary email |
| Phone | Primary phone |
| Status | active / inactive / do_not_contact |
| Last Activity | Most recent activity event date |
| Lead / Opportunity | Quick link to associated lead or opportunity if present |

### E.4 Contact detail page
The contact detail page should show:
- Company relationship (name + link)
- Title, role, email, phone
- do_not_contact flag (prominently if true)
- Suppression status
- Linked leads / opportunities
- Proposal and follow-up history for this contact
- Activity timeline

---

## F. Lead Page Gaps

### F.1 Horizontal scroll problem
The current Kanban board layout creates a horizontal scrollbar when there are multiple stages. On a standard 1440px desktop, this is awkward. Operators should not have to scroll horizontally to see all stages.

### F.2 Redesign options

**Option A — Compact Kanban**
- Reduce column minimum width.
- Show only essential card fields (company, contact, stage, next action).
- Use abbreviated labels and icons.
- Target: all stages visible at 1440px without horizontal scroll.

**Option B — List/Table view**
- Table layout with sortable columns.
- Columns: company, contact, stage, score, next action, proposal status, assigned owner.
- Better for high-volume lead management.

**Option C — Toggle Board/List**
- Provide both views; operator can switch.
- Board for pipeline visualization; list for bulk management.
- Recommended for flexibility without committing to one paradigm.

### F.3 Lead card content plan (Kanban mode)
Each lead card should show:
| Field | Display |
|-------|---------|
| Company | Name (linked) |
| Contact | Primary contact name |
| Stage | Current stage badge |
| Score / Priority | Priority indicator |
| Next Action | Date + type of next follow-up |
| Proposal status | None / Sent / Viewed / Accepted |
| Follow-up state | None / Open / Overdue |
| Owner | Assigned user avatar/initials |

Cards should be readable at ~240–280px width to allow 5+ stages on standard desktop.

### F.4 List view column plan (table mode)
| Column | Sortable |
|--------|----------|
| Company | Yes |
| Contact | Yes |
| Stage | Yes |
| Score | Yes |
| Next Action | Yes |
| Proposal | No |
| Follow-Up | No |
| Owner | Yes |
| Last Activity | Yes |

---

## G. Message Workspace Assessment

### G.1 Current state
The Msg Workspace page is a Phase 3B foundation page. It shows agent infrastructure status but provides no actionable operator function in its current form. Operators have no clear reason to visit it.

### G.2 Options

**Option A — Rename to Message Strategy Lab**
Keep in navigation but rename and define its purpose as:
- Select a lead or company.
- Generate a message strategy for that target.
- Review agent-generated draft strategy.
- View copywriting agent output status.
- Connect generated strategy to campaign assets.
Not yet functional for this use case, but the destination is meaningful.

**Option B — Move under Intelligence/Admin**
Treat as internal infrastructure monitoring only, visible to admins.
Removes it from the primary operator navigation.

**Option C — Hide until functional**
Remove from nav entirely until the page provides real operator value.
Cleanest short-term UX.

**Recommended:** Option C for now (hide until functional), with Option A as the future target state. Document the intended future use case so the page can be built toward a clear goal.

### G.3 Future functional definition
When functional, Message Workspace should:
- Allow selection of a lead/company target.
- Trigger message strategy generation (connects to Phase 3B agent infrastructure).
- Display strategy draft for operator review.
- Show agent status (copywriting, quality, learning agents).
- Allow approval or revision before connecting to campaign assets.

---

## H. Sidebar / Navigation Assessment

### H.1 Current state
Current navigation items (approximate):
- Dashboard
- Companies
- Contacts
- Leads
- Opportunities
- Activities
- Submissions
- Inbox
- Proposal Inbox
- Proposal Events
- Follow-Up Queue
- Msg Workspace
- Artifacts
- Agent Monitor
- System Controls
- Sys Intelligence
- Imports
- Analytics
- AI Usage
- Campaign Assets
- Campaign Queue
- Settings

20+ flat items with no grouping. Cognitive load is high. Unrelated items sit adjacent (e.g., Contacts next to Agent Monitor).

### H.2 Proposed information architecture

**Workspace**
- Dashboard
- Companies
- Contacts
- Leads
- Opportunities
- Activities

**Proposal Workflow**
- Proposal Inbox (Approval Inbox)
- Proposal Events
- Follow-Up Queue

**Messaging**
- Message Strategy *(hidden until functional)*
- Campaign Assets
- Campaign Queue

**Intelligence**
- Artifacts
- Agent Monitor
- System Intelligence
- AI Usage
- Analytics

**Administration**
- Imports
- Submissions
- System Controls
- Settings

### H.3 Implementation approach options

**Option A — Flat nav with visual section dividers**
Add labelled dividers between groups. No expand/collapse. Simplest implementation.

**Option B — Collapsible sidebar groups**
Each group is collapsible. Reduces visual length. Requires state management for open/closed groups.

**Option C — Role-based visibility**
Administration and Intelligence sections visible to admin roles only. Workspace-focused roles see only Workspace and Proposal Workflow sections.

**Recommended short-term:** Option A (dividers). Low implementation risk, immediate clarity gain. Option C can be layered on top in a later slice.

---

## I. Logo and Branding Uplift Plan

### I.1 Assets available
- Verian business intelligence logo design
- Verian Intelligence digital logo design

### I.2 In-app logo placement
- Replace plain "Verian BIOS" text in the sidebar header with the Verian logo lockup.
- Use a compact variant appropriate for sidebar scale (approx 32–40px height).
- The logo should be readable at sidebar width without overflow.
- Dark sidebar: use light/white variant of logo or reverse lockup.
- Light sidebar: use standard full-colour variant.

### I.3 Brand palette application
Apply the Verian brand palette subtly throughout the UI:

| Element | Application |
|---------|-------------|
| Sidebar active nav item | Teal accent left border + teal text |
| Primary buttons | Deep navy background, white text |
| Status pills (active) | Sage green fill |
| Status pills (pending) | Teal tint |
| Status pills (error/blocked) | Muted red — already present |
| Card headings | Deep navy text |
| Accent borders / dividers | Teal or sage at 20% opacity |
| Background | Light neutral (existing; keep) |

### I.4 Constraints
- Do not overhaul the entire design in this phase.
- This is a small uplift, not a full redesign.
- Avoid marketing-scale logo usage inside the product — no hero banners, no large centred logos.
- Preserve readability and information density.
- The goal is executive, clean, modern, and calm — not visually loud.

---

## J. CRM Notes and Activity Logging Plan

### J.1 Notes requirements
Notes must be available at three levels:
- **Company notes** — free-text operator notes attached to a company record.
- **Contact notes** — free-text operator notes attached to a contact record.
- **Lead notes** — free-text operator notes attached to a lead record.

Notes should:
- Record who wrote them and when.
- Be editable by the author and admins.
- Be soft-deletable (never hard-deleted).
- Appear in the relevant activity timeline.

### J.2 Activity timeline requirements
Each company, contact, and lead detail page should show an activity timeline covering:

| Event type | Source |
|-----------|--------|
| Manual note added | Operator action |
| Record created | System |
| Record updated (field changes) | System (change log) |
| Contact added to company | System |
| Lead created | System |
| Proposal sent | System |
| Proposal viewed / accepted | System |
| Follow-up commitment created | System |
| Draft generated | System |
| Draft approved | System |
| Draft rejected | System |
| Email sent | System (future) |
| AI-generated recommendation | Agent (future) |

### J.3 Change tracking
Important field changes should produce activity log entries:
- Company: status changes, ownership changes.
- Contact: do_not_contact flag changes, email changes, status changes.
- Lead: stage changes, owner changes, score changes.

Format: `[actor] changed [field] from [old_value] to [new_value] at [timestamp]`.

### J.4 Manual vs system activity
Manual notes and system-generated events should be visually distinguished in the timeline — e.g., different icon or label type.

---

## K. Permissions / Audit Trail Considerations

### K.1 Edit permissions
| Action | Who can perform |
|--------|----------------|
| Edit company fields | Workspace members (non-read-only roles) |
| Add company note | Workspace members |
| Add contact to company | Workspace members |
| Edit contact fields | Workspace members |
| Delete / archive contact | Admins only (soft delete) |
| Delete / archive company | Admins only (soft delete) |
| Edit lead | Workspace members |
| Change lead stage | Workspace members |
| Delete / archive lead | Admins only (soft delete) |

### K.2 Soft-delete policy
All destructive operations in Phase 3W should be soft-delete only. Records should gain a `deleted_at` timestamp and be filtered from default views. Hard deletion is not available through the UI.

### K.3 Audit trail
All edits, notes, and status changes should produce activity log entries. This provides:
- Operational visibility.
- Recovery path if records are accidentally edited.
- Audit compliance foundation.

### K.4 Safety constraint
Phase 3W introduces no send path, no email delivery, and no campaign operations. All work is CRM data management and UI only. The `email_sending_enabled` and `campaign_sending_enabled` gates remain false and are not touched in any Phase 3W slice.

---

## L. Proposed Phase 3W Slice Breakdown

Each slice should be small, independently reviewable, and independently completable. No slice should depend on a later slice being complete.

| Slice | Title | Scope |
|-------|-------|-------|
| Phase 3W Slice 1 | CRM/Product audit doc and UI architecture plan | Read-only audit of current CRM pages; document specific gaps with file paths and component names; finalize slice order |
| Phase 3W Slice 2 | Company edit controls | Add edit form for company fields (phone, website, address, industry, status); server action; audit log entry |
| Phase 3W Slice 3 | Company notes | Add notes tab/section to company page; create/edit/soft-delete notes; activity log integration |
| Phase 3W Slice 4 | Contact-company relationship controls | Enforce/display company association in contacts list and detail; add contact from company page with auto-association |
| Phase 3W Slice 5 | Contacts list/detail improvements | Add company, title/role, status, last activity columns; improve contact detail page |
| Phase 3W Slice 6 | Lead board/list redesign | Compact Kanban + list view toggle; fix horizontal scroll; improve card density |
| Phase 3W Slice 7 | Sidebar grouping and navigation IA | Add section dividers; reorder items per proposed IA; hide Msg Workspace |
| Phase 3W Slice 8 | Logo integration and small UI uplift | Add Verian logo to sidebar; apply brand palette accents; improve buttons, pills, spacing |
| Phase 3W Slice 9 | Codex review and phase lock | Review all slices; confirm no regressions; lock Phase 3W |

### Implementation notes
- Slices 1–5 are CRM/data-layer focused.
- Slices 6–8 are UI-layer focused.
- Slices can be executed in the listed order or partially reordered based on operator priority.
- Slice 9 is always last.
- No slice in Phase 3W introduces send functionality.

---

## M. Out of Scope

The following are explicitly out of scope for Phase 3W:

| Item | Reason |
|------|--------|
| Email sending | Gated; belongs to Slice 5 and beyond |
| Campaign sending | Gated; belongs to future phase |
| Approval-and-send path | Gated |
| LLM draft generation | Phase 3S future slice |
| New migrations for send tables | Not needed in Phase 3W |
| Supabase schema structural changes | Out of scope for this design-plan commit — no schema work is performed here |
| CRM notes schema (future) | Will require a separately planned, reviewed, CRM-only migration in a future implementation slice — not in this document |
| Send-path / campaign schema changes | Out of scope for all Phase 3W slices |
| Production DB changes (direct) | Never — all schema changes must go through reviewed migrations |
| Vercel / env / provider changes | None needed |
| Phase 3V Slice 5 | Blocked pending separate authorization |
| Full app redesign | This is an uplift, not a rebuild |

---

## N. Safety Boundary

Phase 3W maintains the following invariants throughout all slices:

| Constraint | Required state |
|-----------|---------------|
| email_sending_enabled | false — never touched in Phase 3W |
| campaign_sending_enabled | false — never touched in Phase 3W |
| Production DB writes | None from Claude — only via reviewed migrations or server actions |
| Send actions called | None |
| approve-and-send path | Not introduced |
| Tags | None created |
| Slice 5 | Blocked until separately authorized |

---

## O. Final Recommendation

**Proceed with Phase 3W.**

The operator experience has sufficient gaps in core CRM usability that addressing them before adding send complexity will reduce risk and make the product meaningfully more usable.

Recommended execution order:

1. **Start with Slice 1** (audit) to produce a precise, code-referenced gap list. This will confirm or refine the slice breakdown above.
2. **Slices 2–3** (company edit + notes) deliver the highest operator value with moderate implementation complexity.
3. **Slices 4–5** (contact improvements) improve day-to-day CRM usability.
4. **Slice 6** (lead board) resolves the most visible UX friction.
5. **Slices 7–8** (nav + logo) are lower-risk UI work that can be done in parallel with or after CRM slices.
6. **Slice 9** (Codex review and lock) closes the phase.

Phase 3V Slice 5 remains BLOCKED. It may be revisited after Phase 3W Slice 9 is locked, subject to separate operator authorization.
