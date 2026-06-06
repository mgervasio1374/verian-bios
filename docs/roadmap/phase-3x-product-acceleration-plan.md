# Phase 3X — Product Acceleration Plan

**Status:** PLANNING  
**Depends on:** Phase 3W Slice 3 closeout (complete), Brand System Lock (this session)  
**Brand reference:** `docs/roadmap/verian-brand-system-lock.md`  
**Blocked:** Phase 3V Slice 5 (separate authorization required — do not proceed)

---

## A. Executive Summary

Phase 3W established the foundational CRM, branding baseline, and navigation structure. Phase 3X shifts the product into **usable operating workflows** — features an operator can use in daily work, not just a demonstration scaffold.

### Acceleration principles

1. **Stop micro-slicing low-risk UI and product work.** Bundle cohesive usability improvements into single slices where the risk profile is low or medium.
2. **Keep high-risk work isolated.** Sending, schema changes, permissions, automation, and production data changes remain tightly controlled — single-purpose slices, Codex review required, explicit operator approval before implementation.
3. **Prioritize operator utility.** If an operator cannot use the product for real work today, that is a blocker of higher priority than incremental technical hardening.
4. **Maintain all existing safety gates.** No sending gates are loosened without explicit operator authorization. Campaign sending remains gated separately from direct send.

---

## B. Risk Classification Table

| Feature Area | Risk | Notes |
|---|---|---|
| Official logo correction (replace Slice 3 temp asset) | LOW | Static asset swap, no logic change |
| Brand color token alignment to official palette | LOW | CSS-only, presentation layer |
| Leads page redesign (remove horizontal scroll) | MEDIUM | UI restructure, no schema change |
| Contacts page company context column | MEDIUM | UI change, may touch query — no schema change |
| Read-only weekly operations calendar/snapshot | MEDIUM | New read-only page, no writes |
| Campaign Assets explanation/readability | MEDIUM | UI copy and layout only |
| User/admin management | HIGH | Permissions model, potentially schema change |
| Campaign type configuration (write/define rules) | HIGH | Schema change, business logic |
| Campaign asset editing | MEDIUM/HIGH | Write path; requires approval model review |
| Controlled 25-email test campaign | HIGH | Sending gate, allowlist, hard cap, operator approval |

---

## C. Recommended Next Implementation Bundle

### Phase 3X Slice 1 — Brand Correction & Product Usability Acceleration Bundle

**Risk:** MEDIUM  
**Codex review required:** Yes  
**Operator approval required before implementation:** Yes (standard plan review)  
**Migrations required:** Not expected; stop and request operator approval if one is discovered to be necessary

#### Scope

**Brand correction (LOW risk)**

- Replace `public/brand/logo-mark.svg` with the official Verian logo asset (operator must deliver asset file before this slice can be implemented)
- Apply official brand color tokens: Deep Navy `#1D2B4B`, Teal `#3098A7`, Sage Green `#9FC898`, Background `#F4F7F6`
- Update sidebar CSS tokens to exactly match the approved palette (replace current oklch approximations with precisely converted official values)
- Update navbar/header logo treatment to use official asset with correct clear space and sizing
- Apply logo to login page header if one exists

**Leads page redesign (MEDIUM risk)**

- Remove horizontal scroll on the Leads page
- Replace horizontal table layout with a vertically scrollable, scannable card or row layout
- Preserve all existing data fields; no columns may be removed without operator approval
- Do not add new data fetch queries beyond those already in use
- Do not add mutation controls unless they already exist on the page

**Contacts page company context (MEDIUM risk)**

- Add company name column/field to Contacts list page
- Link company name to the company detail page
- Read-only; no new write paths
- Join must use existing data already fetched or extend existing query safely — do not add a new Supabase client call if the join can be done within an existing query

**Weekly operations snapshot (MEDIUM risk)**

- New read-only page: `/[workspaceSlug]/operations` or similar
- Display a weekly at-a-glance view:
  - Follow-ups due this week
  - Proposal events this week
  - Campaigns scheduled/launching this week
  - Drafts awaiting approval
  - Leads requiring action
- Color-coded by type: Teal for proposals, Sage Green for follow-ups, Navy accent for campaigns
- No scheduling, editing, or mutations in v1
- Read-only data only; no write paths

**Campaign Assets readability (MEDIUM risk)**

- Add contextual labels and short explanations to the Campaign Assets page
- Clarify the difference between Campaign Type, Campaign Asset, Campaign Sequence, and Campaign Assignment (see Section F)
- No backend changes; UI/copy layer only

#### Explicitly excluded from Slice 1

- No implementation of actual sending
- No permissions/user management implementation
- No campaign type write/config rules
- No schema migrations (stop and request operator approval if one is needed)
- No production data changes
- No sending gate changes

---

## D. Recommended High-Risk Design Slice (Design Only — No Implementation)

### Phase 3X Slice 2 — Controlled Campaign Testing & Admin Design

**Risk:** HIGH (design document only — no implementation until explicit operator approval)  
**Purpose:** Produce a complete design document so implementation can proceed in a single, well-reviewed slice when authorized

#### Design scope

**User and admin management model**
- Role model: first 3 users are admins; additional roles (viewer, operator, etc.) defined for later implementation
- Permission model design: what actions require which roles
- Admin capabilities: invite user, assign role, revoke access
- Schema changes required, if any (additive only; no destructive changes)

**Test recipient allowlist**
- Design for a table or configuration that stores approved test email addresses
- Only allowlisted addresses may receive sends during controlled test windows
- Operator must explicitly add addresses; no auto-population from leads/contacts
- Schema requirements

**Controlled 25-email test campaign protocol** (see Section G for full concept)
- Gate design: how the test window is opened and closed
- Hard cap enforcement: where the 25-send limit is checked and enforced
- Audit log design: every send event recorded with recipient, timestamp, campaign, operator
- Rollback/disable plan: how sends are stopped mid-campaign if needed
- Approval flow: what operator approval looks like before the test begins
- Required schema and system control changes
- Separation from production campaign sending gate

**Campaign type configuration model**
- Design for making "Initial Contact" and other campaign types configurable
- A campaign type defines: name, description, sequence length (number of emails), send interval rules, and asset assignments
- Configurable by operator; not hardcoded
- Schema design

**Campaign asset edit/access model**
- Design for making campaign assets (email templates, subject lines, sequences) accessible and editable by operators
- Approval requirements before edited assets can be used in live campaigns
- Audit trail for edits
- Required schema changes, if any

**Approval and stop conditions**
- What triggers automatic campaign stop (bounce rate, error count, operator abort)
- Approval gates before each high-risk operation
- Required system controls

**Audit requirements**
- All sends, approvals, rejections, and campaign state changes must be auditable
- Log retention requirements
- Where audit records live in the schema

---

## E. Calendar / Weekly Operations Snapshot Concept

The operations calendar begins as a **read-only weekly snapshot** — a single-page overview of operational activity for the current week.

### V1 scope (read-only)

| Tile / Section | Data source |
|---|---|
| Follow-ups due this week | `proposal_follow_up_commitments` where `follow_up_due_at` in current week |
| Proposal events this week | `proposal_events` where event date in current week |
| Campaigns scheduled/launching | Campaign queue entries for current week |
| Drafts awaiting approval | `approval_requests` in pending state |
| Leads requiring action | Leads with overdue follow-up or uncontacted status |

### Visual design

- Color-coded by type: Teal for proposals/events, Sage Green for follow-ups, Navy accent for campaigns, amber for drafts awaiting approval
- Day-column layout or grouped-by-day list view
- No scheduling, editing, or mutations in v1
- Each item links to its detail page (read-only navigation)

### V2 scope (future, not in Phase 3X)

- Operator can create/reschedule items directly from the calendar
- Integration with external calendar (Google Calendar, Outlook) — requires separate design slice

---

## F. Campaign Assets Concept and Terminology

The following terminology is used consistently throughout the Verian system. All UI labels and documentation must align to these definitions.

| Term | Definition |
|---|---|
| **Campaign Type** | A named, configurable template for a campaign cycle. Defines the intent (e.g., "Initial Contact"), the number of touchpoints, the send interval, and the asset assignments. Operator-configurable. |
| **Campaign Asset** | A specific email template (subject line + body) associated with one step in a campaign sequence. Can be reviewed and edited by operators. |
| **Campaign Sequence** | The ordered list of steps (touchpoints) within a Campaign Type. Step 1 = Day 0, Step 2 = Day 3, etc. The sequence is defined by the Campaign Type configuration. |
| **Campaign Assignment** | The act of assigning a Campaign Type to a specific lead or contact. Creates the send schedule for that recipient. |
| **Email Draft** | A generated email for a specific recipient at a specific step, created from the Campaign Asset template. Subject to approval before send. |
| **Approval Request** | A record requesting operator review of one or more Email Drafts before they can be sent. |
| **Send Event** | A logged record of an email being sent: recipient, timestamp, campaign assignment, step, and outcome (delivered/bounced/failed). |

### Example: "Initial Contact" as a configurable sequence

Under the proposed model, "Initial Contact" is not a label — it is a Campaign Type with a defined sequence:

- Step 1: Introduction email (Day 0)
- Step 2: Value proposition follow-up (Day 3)
- Step 3: Case study / social proof (Day 7)
- Step 4: Final outreach (Day 14)

Each step references a Campaign Asset. Operators can edit the assets, adjust the interval, and add or remove steps. This configuration is stored in the database and referenced at send time.

---

## G. Controlled 25-Email Test Campaign Concept

This protocol enables a real end-to-end send test against exclusively internal, personal, or partner addresses — with hard limits, explicit authorization, and full audit.

### Prerequisites

- Operator has explicitly authorized the test window
- `EMAIL_SENDING_ENABLED` is turned on only for the test window and turned off immediately after
- `CAMPAIGN_SENDING_ENABLED` remains a separate gate and is not involved in this test
- A test recipient allowlist is populated with approved addresses only
- A campaign asset is reviewed and approved for the test

### Protocol

| Control | Requirement |
|---|---|
| Recipient allowlist | Only explicitly approved internal/personal/partner addresses. No customer or live prospect addresses. |
| Hard cap | Maximum 25 sends across the entire test. System must enforce this cap — not just a policy. |
| Operator approval | Operator must explicitly approve the send list, the asset, and the campaign assignment before any send is triggered. |
| Sending gate | `EMAIL_SENDING_ENABLED` enabled only for the test window; disabled immediately after completion or abort. |
| Stop on error | Any bounce, delivery failure, or system error halts the campaign and requires operator review before resumption. |
| Audit log | Every send event (including failures) is recorded with: recipient address, timestamp, campaign step, asset used, outcome. |
| Rollback plan | Operator can abort the test at any point; remaining queued sends are cancelled; gate is disabled. |
| No customer recipients | Enforced by allowlist check at send time — any address not on the allowlist is rejected. |
| Post-test gate disable | `EMAIL_SENDING_ENABLED` is disabled immediately upon test completion regardless of whether all 25 sends were used. |

### Implementation requirements (for Phase 3X Slice 2 design)

- Allowlist table or configuration in DB
- Send cap counter stored and checked server-side
- Test window open/close operator action
- Audit log table (if not already sufficient)
- Separation of test campaign from any live campaign assignments

---

## H. Proposed Slice Order

The following sequence balances speed with safety.

| Step | Action | Risk | Notes |
|---|---|---|---|
| 1 | Phase 3W Slice 3 manual verification report and closeout | LOW | Report doc only |
| 2 | Verian Brand System Lock commit | LOW | Doc only (already created this session) |
| 3 | Phase 3X Slice 1 plan creation and Codex review | LOW | Plan doc only |
| 4 | Phase 3X Slice 1 implementation | MEDIUM | Official logo asset must be delivered by operator before this step |
| 5 | Phase 3X Slice 1 manual UI verification | LOW | Browser only |
| 6 | Phase 3X Slice 2 high-risk design document | HIGH (design only) | No code |
| 7 | Codex review of Slice 2 design | — | Review only |
| 8 | Phase 3X Slice 2 implementation | HIGH | Only after explicit operator approval of reviewed design |

**Note on Slice 1 logo prerequisite:** The official Verian logo asset file must be delivered by the operator and committed to the repository before the brand correction portion of Slice 1 can be fully implemented. The rest of Slice 1 (Leads redesign, Contacts company context, operations calendar, Campaign Assets readability) can proceed in parallel with asset delivery if the operator chooses.

---

## I. Why This Increases Speed Safely

| Old approach | New approach |
|---|---|
| One slice per micro-feature | Bundle cohesive low/medium-risk UI and product work |
| Test file per slice even for trivial changes | Source-reading tests where appropriate; integration tests where behavior is complex |
| Separate plan + commit + push + deploy cycle for small CSS changes | Single cycle for a coherent usability bundle |
| Permissions, sending, schema each in isolation | Still isolated — HIGH risk never bundles with LOW risk |
| Waiting for Codex on trivial layout changes | Codex review for medium/high risk; self-reviewed for LOW |

The result: more visible product progress per session, without loosening the controls that protect the production system.

---

## J. Open Questions for Operator

The following decisions require operator input before Phase 3X Slice 1 can be finalized:

1. **Official logo asset:** When will the official Verian logo file be delivered? What format (SVG preferred)?
2. **Operations calendar route:** Preferred URL path — `/operations`, `/calendar`, `/weekly`, or other?
3. **Leads redesign:** Is the priority to go to a card layout, a vertical table, or a simplified list? Any fields to promote or demote?
4. **Contacts company context:** Should company name appear as a column in the contacts list, or as a label in each contact's row/card?
5. **Slice 1 go/no-go:** Confirm the above scope is approved before Codex review is requested.
