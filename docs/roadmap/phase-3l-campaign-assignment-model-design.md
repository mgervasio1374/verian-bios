# Phase 3L — Campaign Assignment Model Design

**Status:** Design — NOT IMPLEMENTED  
**Document created:** 2026-05-29  
**Author:** Verian BIOS AI Context  
**Phase:** 3L (follows Phase 3K — Unified Draft / Send Path)

---

## 1. Phase Title and Objective

**Phase 3L — Campaign Assignment Model**

Introduce a `campaign_assignments` table that records which campaign type (or specific campaign asset) has been designated as the active strategy for a given lead or contact. The assignment is a readiness and intent layer — it signals "this lead should receive this campaign" — but does not execute the campaign, does not send email, and does not create drafts automatically.

The assignment model separates the question of *what campaign a lead should receive* from the question of *when and how that draft is generated and sent*. This separation enables UI-driven workflow, agent-assisted suggestions, bulk-import assignment, and future automation — while keeping the human approval boundary in place for all draft creation and all outbound communication.

---

## 2. Current System State

| Layer | Current State |
|-------|---------------|
| Campaign assets | `campaign_email_assets` table: `draft`, `pending_review`, `active`, `retired` statuses. Phase 3J. |
| Draft creation — manual template | `email_drafts` with `source_type = 'manual_campaign_template'`. AI-generated via LLM. Phase 3K. |
| Draft creation — asset render | `email_drafts` with `source_type = 'campaign_asset_render'`, `source_asset_id` populated. Deterministic render. Phase 3K. |
| Approval / send | `approval_requests` + `email_sends`. Human-in-the-loop required. Phase 3H, 3K. |
| Lead-to-campaign linkage | **None.** No table records which campaign is assigned to which lead. Draft creation is ad hoc — manually triggered from the lead detail page with no persistent assignment record. |
| Bulk assignment | Not supported. |
| Agent campaign suggestions | Not implemented. Agent may suggest a campaign type via system recommendations but no structured storage exists. |

**Key gap:** There is no persistent record of campaign intent per lead. Every draft creation today is a one-off action with no assignment context, no eligibility record, no history of what was tried, and no ability to query "which leads are assigned to campaign X."

---

## 3. Problem Statement

As the campaign asset library grows and leads accumulate, the system needs a structured way to answer:

- Which campaign is this lead currently assigned to?
- Who assigned them, and why?
- Is the lead eligible for this campaign?
- What was the eligibility state at time of assignment?
- Has a draft been generated from this assignment? Was it sent?
- Can an agent suggest and queue assignments for human review?

Without a `campaign_assignments` table, none of these questions can be answered durably. The current ad hoc approach breaks down when:

1. More than a handful of campaigns and leads exist
2. Bulk import assigns campaigns to hundreds of leads
3. Agents begin suggesting campaign assignments as part of their recommendation flow
4. The UI needs to show "assigned" vs "unassigned" leads per campaign
5. Audit and explainability requirements demand a record of who assigned what and when

---

## 4. Scope

Phase 3L delivers:

1. A finalized `campaign_assignments` table definition (migration reserved as `20240036`, not created in this phase)
2. Design of all assignment types: manual, import, agent-suggested, agent-assisted, system-rule
3. Design of the assignment status lifecycle: `proposed → assigned → paused / completed / retired / rejected`
4. Design of eligibility snapshot capture at assignment time
5. Design of duplicate prevention logic
6. UI surface design for manual assignment from the lead detail page
7. UI surface design for assignment list view per campaign asset
8. Service boundary and repository design (no implementation)
9. Event and activity log design
10. Testing strategy

Phase 3L does **not** deliver any implementation. All items above are design artifacts.

---

## 5. Explicit Non-Goals

Phase 3L explicitly excludes the following — these belong in later phases (3M, 3N, or beyond):

| Non-Goal | Rationale |
|----------|-----------|
| Implementation of `campaign_assignments` table | Design only in this phase |
| Creating migration `20240036` | Reserved; not created |
| Draft auto-creation from assignment | Deferred — requires separate phase approval |
| Campaign execution scheduling | Out of scope — no scheduling in Phase 3L |
| Campaign send orchestration | Out of scope — no sending in Phase 3L |
| Resend API calls | Absolutely not in Phase 3L |
| `campaign_email_sends` row creation | Not in Phase 3L |
| Agent-initiated draft creation | Agent may suggest assignment; draft creation remains human-triggered |
| Automated follow-up sequences | Deferred to a later phase |
| Multi-touch campaign sequences | Out of scope for Phase 3L |
| A/B testing across campaign assets | Out of scope |
| Reporting / analytics on assignments | Deferred |
| Production deployment | No production deploy in Phase 3L |

---

## 6. Safety Guardrails

The following safety statements are unconditional and apply to every aspect of Phase 3L design and any future implementation derived from this design:

- **Phase 3L does not send email.**
- **Phase 3L does not enable live sending.**
- **Phase 3L does not create `campaign_email_sends` rows.**
- **Phase 3L does not call `sendApprovedDraft()`.**
- **Phase 3L does not call `resend.emails.send`.**
- **Phase 3L does not bypass approval.**
- **Phase 3L does not create campaign execution logic.**
- **Phase 3L does not schedule follow-ups.**
- **Phase 3L does not auto-create drafts unless explicitly deferred and approved in a later phase.**
- **`EMAIL_SENDING_ENABLED` remains disabled through Phase 3L.**
- **Campaign Sending remains disabled through Phase 3L.**
- **Production Supabase (`kxrplupzbsmujjznzhpy`) is not touched in Phase 3L.**
- **Migration `20240035` remains unapplied to production through Phase 3L.**

---

## 7. Data Model Proposal

### Table: `campaign_assignments`

```sql
CREATE TABLE campaign_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Target: lead or contact (at least one required; both allowed)
  lead_id               uuid REFERENCES leads(id) ON DELETE SET NULL,
  contact_id            uuid REFERENCES contacts(id) ON DELETE SET NULL,

  -- What is being assigned: asset (specific) or type (general)
  campaign_asset_id     uuid REFERENCES campaign_email_assets(id) ON DELETE SET NULL,
  campaign_type         text NOT NULL,  -- canonical CAMPAIGN_TYPE value

  -- Lifecycle
  assignment_status     text NOT NULL DEFAULT 'assigned',
  assignment_source     text NOT NULL,

  -- Attribution
  assigned_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by_agent_name text,
  assignment_reason     text,
  confidence            numeric(4,3),  -- 0.000–1.000, nullable; agent-assigned only

  -- Eligibility snapshot at time of assignment
  eligibility_snapshot  jsonb NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  retired_at            timestamptz
);
```

### Column Notes

| Column | Notes |
|--------|-------|
| `lead_id` | NULL if assignment is to a contact without a linked lead |
| `contact_id` | NULL if assignment is to a lead without a linked contact |
| `campaign_asset_id` | NULL if assigned by campaign type only (not a specific asset) |
| `campaign_type` | Always required — canonical value from `CAMPAIGN_TYPE` enum |
| `assignment_status` | Lifecycle state (see §8) |
| `assignment_source` | How the assignment was created (see §8) |
| `assigned_by_user_id` | User who created/approved the assignment; NULL for system-initiated |
| `assigned_by_agent_name` | Agent name for agent-suggested assignments (e.g., `MessageStrategyAgent`) |
| `assignment_reason` | Human or agent-authored explanation |
| `confidence` | 0.000–1.000; only set for agent-suggested or agent-assisted assignments |
| `eligibility_snapshot` | JSONB snapshot of key lead/contact fields at time of assignment — used for auditability and future diff |
| `retired_at` | Set when `assignment_status = 'retired'` |

### Indexes (proposed)

```sql
-- Primary access pattern: all assignments for a workspace lead
CREATE INDEX idx_campaign_assignments_lead ON campaign_assignments (workspace_id, lead_id)
  WHERE lead_id IS NOT NULL;

-- All assignments for a workspace contact
CREATE INDEX idx_campaign_assignments_contact ON campaign_assignments (workspace_id, contact_id)
  WHERE contact_id IS NOT NULL;

-- All leads assigned to a specific campaign asset
CREATE INDEX idx_campaign_assignments_asset ON campaign_assignments (campaign_asset_id)
  WHERE campaign_asset_id IS NOT NULL;

-- Active assignment lookup — lead-scoped duplicate prevention
CREATE UNIQUE INDEX uq_active_assignment_lead_type ON campaign_assignments (lead_id, campaign_type)
  WHERE lead_id IS NOT NULL
    AND assignment_status IN ('proposed', 'assigned');

-- Active assignment lookup — contact-only duplicate prevention (lead_id IS NULL)
CREATE UNIQUE INDEX uq_active_assignment_contact_type ON campaign_assignments (contact_id, campaign_type)
  WHERE contact_id IS NOT NULL
    AND lead_id IS NULL
    AND assignment_status IN ('proposed', 'assigned');

-- Tenant-scoped listing
CREATE INDEX idx_campaign_assignments_tenant ON campaign_assignments (tenant_id, created_at DESC);
```

---

## 8. Assignment Types

### `assignment_status` lifecycle

| Status | Meaning |
|--------|---------|
| `proposed` | Created by agent suggestion — awaiting human confirmation |
| `assigned` | Active: the lead is designated for this campaign |
| `paused` | Temporarily suspended (e.g., lead is unresponsive; retry later) |
| `completed` | Campaign cycle complete — lead received and responded |
| `retired` | Removed from campaign (opt-out, no longer eligible, superseded) |
| `rejected` | Human rejected an agent-proposed assignment |

### Allowed transitions

```
proposed  → assigned (human approves agent suggestion)
proposed  → rejected (human rejects agent suggestion)
assigned  → paused
assigned  → completed
assigned  → retired
paused    → assigned (resumed)
paused    → retired
completed → (terminal)
retired   → (terminal)
rejected  → (terminal)
```

### `assignment_source` values

| Value | Meaning |
|-------|---------|
| `manual` | User created assignment directly from lead detail or campaign UI |
| `import` | Bulk CSV/import batch created assignment via data import flow |
| `agent_suggested` | Agent proposed; status starts at `proposed`; requires human approval |
| `agent_assisted` | Agent pre-filled fields; human submitted and confirmed |
| `system_rule` | System-initiated based on configured rule (future; design-reserved) |

---

## 9. Manual Assignment Flow

A user assigns a campaign to a lead directly from the lead detail page or from a campaign asset's assignment list.

**Inputs:**
- `lead_id` (from current page context)
- `campaign_type` (dropdown, canonical values)
- `campaign_asset_id` (optional — select a specific active asset, or leave unset to allow any active asset of the type)
- `assignment_reason` (optional free text)

**Validation:**
1. Lead must exist in the workspace
2. `campaign_type` must be a valid canonical value
3. If `campaign_asset_id` provided: asset must be `active` and match the `campaign_type`
4. No active assignment for this `(lead_id, campaign_type)` pair already exists (duplicate prevention)
5. Permission: `crm.leads.edit` or `campaigns.manage` (TBD)

**Outcome:**
- Row inserted into `campaign_assignments` with `assignment_source = 'manual'`, `assignment_status = 'assigned'`, `assigned_by_user_id = ctx.userId`
- `eligibility_snapshot` captured at insert time (key lead fields: `industry`, `employee_count`, `revenue_range`, `lead_status`, etc.)
- Activity log event emitted: `CAMPAIGN_ASSIGNED`
- Lead detail page revalidated

**No draft is created automatically.** The user may subsequently click "Create Draft" on the lead detail page, which follows the Phase 3K draft creation flow independently of the assignment record.

---

## 10. Agent-Assisted Assignment Flow

The `MessageStrategyAgent` or a future `CampaignAssignmentAgent` may analyze a lead and produce a campaign suggestion.

**Proposed:**
1. Agent runs analysis on lead (existing or new run)
2. Agent emits a structured suggestion: `{ lead_id, campaign_type, campaign_asset_id?, assignment_reason, confidence }`
3. Row inserted into `campaign_assignments` with `assignment_status = 'proposed'`, `assignment_source = 'agent_suggested'`, `assigned_by_agent_name` set, `confidence` set
4. System Intelligence or Lead detail UI surfaces the proposed assignment for human review
5. Human clicks "Approve" → status transitions `proposed → assigned`, `assigned_by_user_id` stamped
6. Human clicks "Reject" → status transitions `proposed → rejected`

**No draft is created automatically** when an agent-proposed assignment transitions to `assigned`. Draft creation remains a separate, explicit user action.

**Agent confidence thresholds (proposed):**
- `>= 0.85`: surfaced as top recommendation
- `0.60–0.84`: surfaced as suggestion with reasoning
- `< 0.60`: not surfaced; stored for auditability only

---

## 11. Bulk Assignment / Import Considerations

The existing data import flow (Phase 3B.2) supports CSV upload and field mapping. Phase 3L design anticipates a future import path for campaign assignments.

**Proposed import columns:**
- `lead_external_id` or `lead_email` — lookup key
- `campaign_type` — canonical value
- `campaign_asset_id` — optional; validated against active assets if provided
- `assignment_reason` — optional free text

**Import behavior (design, not implementation):**
- Each row resolved to a `lead_id` via lookup
- Eligibility check run per row; ineligible rows flagged in validation summary
- Duplicate rows (active assignment already exists) flagged; not inserted
- Approved batch inserts all valid rows with `assignment_source = 'import'`
- Import batch ID recorded in `eligibility_snapshot` for traceability

**Migration `20240036` would be required before import can write `campaign_assignments`.** Import path is not implemented in Phase 3L.

---

## 12. Eligibility Rules

The `eligibility_snapshot` captures lead state at assignment time. Eligibility evaluation (whether a lead *qualifies* for a campaign type) is performed at assignment creation.

**Proposed eligibility dimensions per campaign type:**

| Campaign Type | Key Eligibility Signal |
|---------------|----------------------|
| `initial_contact` | Lead status is `new` or `uncontacted`; no prior sends |
| `statement_follow_up` | Lead has had at least one statement-related interaction |
| `check_in` | Lead is active but has not responded within a configured window |
| `reactivation` | Lead is `dormant` or has not engaged in 60+ days |

**Eligibility snapshot fields (proposed):**
```json
{
  "lead_status": "new",
  "last_email_sent_at": null,
  "last_response_at": null,
  "industry": "retail",
  "employee_count_range": "10-50",
  "evaluated_at": "2026-05-29T00:00:00Z",
  "eligible": true,
  "ineligible_reason": null
}
```

Eligibility is advisory — a user may override and assign anyway. Override intent should be captured in `assignment_reason`.

---

## 13. Duplicate Prevention

The unique partial index `uq_active_assignment_lead_type` enforces that a lead can have at most one active (`proposed` or `assigned`) assignment per campaign type at any time.

**Enforcement layers:**

1. **Database:** two unique partial indexes — `uq_active_assignment_lead_type` (lead-scoped) and `uq_active_assignment_contact_type` (contact-only, where `lead_id IS NULL`) — provide database-level guarantee; concurrent inserts cannot create duplicates for either target type
2. **Service layer:** pre-insert check returns a structured error with existing assignment ID if duplicate detected
3. **UI:** "Assign" button disabled with tooltip "Already assigned to this campaign type" if an active assignment exists

**Allowed:** a lead may have assignments to multiple *different* campaign types simultaneously (e.g., `initial_contact` and `check_in`). Whether this is semantically desirable is an open question — see §25.

---

## 14. Relationship to Campaign Assets

`campaign_assignments.campaign_asset_id` links an assignment to a specific active asset.

| Scenario | `campaign_asset_id` |
|----------|---------------------|
| Assigned to a campaign type in general | NULL |
| Assigned to a specific active asset | Non-null, references active asset |

When a campaign asset is `retired`, assignments pointing to it remain intact (FK `ON DELETE SET NULL` → `campaign_asset_id` becomes NULL). The assignment's `campaign_type` remains valid; the next draft creation will select from currently active assets of that type.

An assignment does not activate, approve, or modify the asset's status. Asset lifecycle (draft → pending_review → active → retired) is managed independently in Phase 3J.

---

## 15. Relationship to Phase 3K Draft Creation

Phase 3K introduced two draft creation paths:
- `manual_campaign_template` — LLM-generated; user selects campaign type
- `campaign_asset_render` — deterministic render from a specific active asset

Phase 3L is upstream of Phase 3K's draft creation: an assignment records intent, but draft creation remains a separate, explicit user action.

**Proposed linkage (implementation deferred):**

When a draft is created from the lead detail page and an active assignment exists for the same `campaign_type`, the draft creation service *may* record `assignment_id` on the `email_drafts` row. This requires adding `assignment_id` to `email_drafts` (a future migration, not `20240036`).

For Phase 3L design purposes: assignment and draft creation are separate concerns. The assignment is not required for draft creation; draft creation does not require an assignment.

---

## 16. Human Approval Boundary

Phase 3L preserves the human approval boundary established in Phase 3H and 3K:

| Action | Requires Human? |
|--------|----------------|
| Creating an assignment (manual) | Yes — user explicitly submits |
| Approving an agent-proposed assignment | Yes — user clicks Approve |
| Creating a draft from an assignment | Yes — user explicitly clicks "Create Draft" |
| Approving a draft for send | Yes — approval request flow; Phase 3H |
| Sending an approved draft | Yes — `sendApprovedDraft()` gated by `EMAIL_SENDING_ENABLED` kill switch |

No path in Phase 3L bypasses these gates. The assignment model adds a layer of intent recording; it does not automate any downstream action.

---

## 17. UI / UX Design

### 17a. Lead Detail Page additions

**"Campaign Assignment" card** (new, below Draft section):
- Shows current active assignment(s) per lead (if any): campaign type, asset name if specific, status badge, assigned by, assigned at
- "Assign Campaign" button → opens inline form: campaign type dropdown, optional asset selector (filtered to active assets of that type), optional reason text
- Eligibility advisory indicator shown in form: "This lead may not meet standard eligibility for this campaign type" if `eligible = false` in the snapshot — user may still submit with a reason (eligibility is advisory, not a hard block)
- If proposed assignment exists: shows "Pending Agent Suggestion" with Approve / Reject buttons
- If lead has no active assignment: shows "No active campaign assignment"

**Assignment history accordion:**
- All past assignments (paused, completed, retired, rejected) with timeline
- Collapsed by default

### 17b. Campaign Asset detail page additions

**"Assigned Leads" tab** (new panel on `/settings/campaign-assets/[assetId]`):
- List of leads with active assignment pointing to this asset
- Status badge per lead assignment (assigned, proposed, paused)
- "View Lead" link per row
- Pagination if count > 20

### 17c. System Intelligence surface

Agent-proposed assignments that are in `proposed` status surface as actionable items in the system intelligence panel (similar to pending system recommendations), with Approve / Reject actions.

---

## 18. Repository / Service Boundaries

### Files to create (implementation phase, not Phase 3L)

| File | Purpose |
|------|---------|
| `modules/messaging/campaign-assignments/campaign-assignment.types.ts` | TypeScript types: `CampaignAssignment`, `AssignmentStatus`, `AssignmentSource` |
| `modules/messaging/campaign-assignments/campaign-assignment.constants.ts` | `ASSIGNMENT_STATUS`, `ASSIGNMENT_SOURCE` constant objects |
| `modules/messaging/campaign-assignments/campaign-assignment.repository.ts` | DB reads: `getAssignmentsForLead`, `getAssignmentsForAsset`, `getProposedAssignments` |
| `modules/messaging/campaign-assignments/campaign-assignment.service.ts` | Business logic: `createAssignment`, `approveAssignment`, `rejectAssignment`, `retireAssignment`, eligibility check |
| `modules/messaging/actions/campaign-assignment.actions.ts` | Server actions: `createManualAssignmentAction`, `approveProposedAssignmentAction`, `rejectProposedAssignmentAction` |
| `tests/phase3l-campaign-assignment-model.test.ts` | Source-reading tests |

### Files to modify (implementation phase)

| File | Change |
|------|--------|
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | Add `CampaignAssignmentCard` |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx` | Add "Assigned Leads" tab |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` | Add proposed assignment items |

---

## 19. Event / Activity Logging

All assignment lifecycle transitions emit activity log events. The existing `activity_logs` or `workflow_events` table (whichever is canonical) receives these events.

| Event Type | Trigger |
|------------|---------|
| `CAMPAIGN_ASSIGNED` | Assignment created with `assigned` status |
| `CAMPAIGN_ASSIGNMENT_PROPOSED` | Agent creates `proposed` assignment |
| `CAMPAIGN_ASSIGNMENT_APPROVED` | Human approves `proposed → assigned` |
| `CAMPAIGN_ASSIGNMENT_REJECTED` | Human rejects `proposed → rejected` |
| `CAMPAIGN_ASSIGNMENT_PAUSED` | Assignment moved to `paused` |
| `CAMPAIGN_ASSIGNMENT_RETIRED` | Assignment moved to `retired` |
| `CAMPAIGN_ASSIGNMENT_COMPLETED` | Assignment moved to `completed` |

Each event records: `assignment_id`, `lead_id`, `campaign_type`, `previous_status`, `new_status`, `actor_user_id` or `actor_agent_name`, `reason`, `timestamp`.

---

## 20. Auditability and Explainability

`campaign_assignments` is designed to be fully auditable:

- `eligibility_snapshot` preserves the lead's state at the moment of assignment — future auditors can reconstruct why the assignment was valid at creation time even if lead data changes
- `assignment_reason` provides a human or agent-authored explanation
- `confidence` signals agent certainty for ML accountability
- `assigned_by_user_id` and `assigned_by_agent_name` are mutually exclusive attribution fields — exactly one should be populated (enforced at service layer via `CHECK` constraint or service validation)
- Activity log events provide a complete transition history
- All timestamps are `timestamptz` — timezone-unambiguous

For agent-assigned rows, the `agent_decision_logs` table (Phase 3I) should cross-reference the assignment: the agent decision that produced the suggestion should record `subject_type = 'campaign_assignment'`, `subject_id = assignment.id`.

---

## 21. Migration Assessment

| Migration | Number | Status |
|-----------|--------|--------|
| `campaign_assignments` table creation | `20240036` | **Reserved. Not created in Phase 3L.** |
| `email_drafts.assignment_id` FK column | Future (post-3L) | Not designed yet |

**Migration `20240036` scope (if/when created):**
- `CREATE TABLE campaign_assignments (...)` with all columns above
- All partial indexes
- `CHECK` constraint: at least one of `lead_id`, `contact_id` is non-null
- `CHECK` constraint: `confidence IS NULL OR (confidence >= 0 AND confidence <= 1)`
- `updated_at` trigger (reuse existing `set_updated_at()` function)
- RLS policy (reuse workspace-scoped pattern from existing tables)
- Grants: `authenticated` and `service_role` via existing grant migration pattern

**Migration must be additive.** It creates a new table; it does not alter existing tables. No data migration required. Safe to apply to production without downtime.

**Production:** Migration `20240035` is still unapplied to production. Migration `20240036` may not be applied to production until `20240035` is applied first. This constraint carries forward from Phase 3K.

---

## 22. Testing Strategy

Phase 3L implementation tests will follow the established source-reading pattern: `fs.readFileSync` on source files, `toContain` / `not.toContain` assertions, no Supabase mocking, no LLM mocking.

**Test file:** `tests/phase3l-campaign-assignment-model.test.ts`

**Test coverage areas:**

| Area | Test Count (est.) |
|------|-------------------|
| Type definitions — `AssignmentStatus`, `AssignmentSource` values present | 6 |
| Constants — `ASSIGNMENT_STATUS`, `ASSIGNMENT_SOURCE` exported | 4 |
| Repository — function signatures present | 5 |
| Service — `createAssignment` logic: duplicate check, eligibility capture | 8 |
| Service — `approveAssignment`, `rejectAssignment`, `retireAssignment` | 6 |
| Server actions — present, call service, return `ActionResult` | 6 |
| UI — `CampaignAssignmentCard` renders assignment list or empty state | 6 |
| UI — Approve / Reject buttons present for `proposed` status | 4 |
| Safety — no `sendApprovedDraft` import in assignment files | 3 |
| Safety — no `resend` import in assignment files | 3 |
| Safety — no `campaign_email_sends` insert in assignment service | 2 |
| Migration — `campaign_assignments` table DDL present in `20240036` | 5 |
| Phase 3K compatibility — no auto-draft creation from assignment; Phase 3K source files unmodified by Phase 3L | 3 |

**Estimated total:** ~61 source-reading tests

---

## 23. Rollout Plan

Phase 3L follows the standard phase sequence:

1. **Design approval** (this document) → no code written
2. **Implementation plan** → file-level breakdown, exact function signatures, exact test IDs
3. **Implementation plan approval** → code begins
4. **Implementation** → service, repository, actions, UI components, migration file, tests
5. **QA** → `npx vitest run` (all 1267 + new tests pass), `npx next build`, TypeScript check
6. **Staging smoke** — manual UI steps: create assignment, approve agent suggestion (if testable), verify no draft auto-created, verify no send triggered
7. **Staging DB verification** — confirm `campaign_assignments` row created, `eligibility_snapshot` populated, status correct
8. **Commit and tag** → `phase-3l-campaign-assignment-model-v1`
9. **Production migration** → `20240035` first, then `20240036`; explicit, manual, pre-approved
10. **Production deploy** → explicit `vercel --prod`; staging continues to auto-deploy

---

## 24. Acceptance Criteria

Phase 3L implementation is complete when all of the following are verified:

| # | Criterion |
|---|-----------|
| AC-1 | `campaign_assignments` table exists on staging with all columns and indexes from §7 |
| AC-2 | A manual assignment can be created from the lead detail page; row persists with correct `assignment_source = 'manual'`, `assignment_status = 'assigned'`, `eligibility_snapshot` populated |
| AC-3 | Duplicate assignment for same `(lead_id, campaign_type)` pair is rejected at service layer with structured error |
| AC-4 | An agent-proposed assignment (`assignment_status = 'proposed'`) surfaces in the UI with Approve / Reject buttons |
| AC-5 | Approving a proposed assignment transitions status to `assigned` and stamps `assigned_by_user_id` |
| AC-6 | Rejecting a proposed assignment transitions status to `rejected` |
| AC-7 | Retiring an assignment transitions status to `retired` and stamps `retired_at` |
| AC-8 | No `email_drafts` row is created automatically when an assignment is created |
| AC-9 | No `campaign_email_sends` row is created in any assignment flow |
| AC-10 | No call to `sendApprovedDraft()` in any assignment code path |
| AC-11 | No call to `resend.emails.send` in any assignment code path |
| AC-12 | All existing tests (1267/1267 baseline) continue to pass |
| AC-13 | New phase tests (~58) all pass |
| AC-14 | `npx next build` passes |
| AC-15 | TypeScript passes with no new errors |
| AC-16 | Activity log event `CAMPAIGN_ASSIGNED` recorded on manual assignment creation |
| AC-17 | `eligibility_snapshot` is non-empty JSONB on all created assignments |

---

## 25. Open Questions

| # | Question | Owner | Notes |
|---|----------|-------|-------|
| OQ-1 | Should a lead be allowed multiple simultaneous assignments to different campaign types? Or should there be a single "active campaign" per lead at any time? | Product | Current design allows multiple; a single-active model would require a different uniqueness constraint |
| OQ-2 | Should `campaign_assignments` track contact-level assignments separately from lead-level? Or is lead the canonical target? | Product | Current design supports both; contact-only assignments (no linked lead) may be edge cases |
| OQ-3 | Which agent should generate campaign suggestions — `MessageStrategyAgent`, a new `CampaignAssignmentAgent`, or the system recommendation engine? | Engineering | Influences where the `proposed` row creation logic lives |
| OQ-4 | What is the exact set of fields in `eligibility_snapshot`? Should it include a schema version? | Engineering | Schema versioning aids future migration of snapshot format |
| OQ-5 | Should `assignment_reason` be free text only, or should it support structured tags (e.g., `["no_prior_contact", "high_revenue_potential"]`)? | Product | Structured tags enable filtering; free text is simpler |
| OQ-6 | Should assignment retirement happen automatically when a lead's status changes (e.g., lead converted, lead closed)? | Product | Automation requires an event hook on `leads.status`; out of scope for Phase 3L implementation but should be designed now |
| OQ-7 | Should `campaign_asset_id` be required for `assignment_source = 'import'`? Or can bulk import assign by type only? | Product | Type-only assignment is more flexible but less deterministic for execution |
| OQ-8 | Is `CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL)` the right constraint, or should we enforce `lead_id IS NOT NULL` for all assignments given that contacts are a later-phase concept? | Engineering | Current design: contacts optional; simplifying to lead-only would narrow the schema |
| OQ-9 | Should `confidence` be stored as `numeric(4,3)` or `real`? Exact decimal vs floating point tradeoffs. | Engineering | `numeric(4,3)` is exact; `real` is simpler but inexact |
| OQ-10 | What is the UI entry point for bulk assignment from the campaign asset list — a dedicated "Assign Leads" button on the asset detail page, or an import-flow extension? | Product | Either path requires the import infrastructure (Phase 3B.2) to support the `campaign_assignments` target table |
