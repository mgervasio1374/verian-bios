# Phase 3L — Campaign Assignment Model: Implementation Plan

**Status:** Plan — NOT IMPLEMENTED  
**Document created:** 2026-05-30  
**Phase:** 3L (follows Phase 3K — Unified Draft / Send Path)  
**Design reference:** `docs/roadmap/phase-3l-campaign-assignment-model-design.md`

---

## 1. Phase Title and Objective

**Phase 3L — Campaign Assignment Model**

Implement the `campaign_assignments` table and associated service, repository, server actions, and UI components as specified in the Phase 3L design document. The implementation introduces an assignment layer that records which campaign (or campaign asset) has been designated for a given lead — representing readiness and intent, not execution.

Phase 3L does not send email, does not auto-create drafts, and does not change any Phase 3K send path.

---

## 2. Source Design Reference

All design decisions, data model, eligibility rules, status lifecycle, and UI specifications are drawn from:

```
docs/roadmap/phase-3l-campaign-assignment-model-design.md
```

Read that document before implementing any step. If any detail in this plan conflicts with the design document, the design document takes precedence.

Key design sections:
- §7 — Data Model Proposal (`campaign_assignments` DDL + indexes)
- §8 — Assignment Types (statuses + sources)
- §9 — Manual Assignment Flow
- §10 — Agent-Assisted Assignment Flow
- §12 — Eligibility Rules + eligibility_snapshot schema
- §13 — Duplicate Prevention (two unique partial indexes)
- §16 — Human Approval Boundary
- §22 — Testing Strategy (~61 source-reading tests)
- §24 — Acceptance Criteria (AC-1 through AC-17)

---

## 3. Current Baseline

| Item | State |
|------|-------|
| Tests passing | 1267/1267 (Phase 3K baseline) |
| `npx next build` | PASS |
| TypeScript | PASS |
| HEAD | `9517a31 Docs: add Phase 3L campaign assignment model design` |
| Working tree | Clean |
| Production Supabase (`kxrplupzbsmujjznzhpy`) | Current through migration `20240034` |
| Staging Supabase (`smbausuyetlgxflyhmfg`) | Current through migration `20240035` |
| Local | Current through migration `20240035` |
| Next available migration number | `20240036` |
| `EMAIL_SENDING_ENABLED` | Disabled |
| Campaign Sending | Disabled |

---

## 4. Implementation Scope

Phase 3L delivers:

1. Migration `20240036_phase3l_campaign_assignments.sql` — `campaign_assignments` table, indexes, constraints, RLS, grants
2. TypeScript types: `CampaignAssignment`, `AssignmentStatus`, `AssignmentSource`
3. Constants: `ASSIGNMENT_STATUS`, `ASSIGNMENT_SOURCE`, `VALID_CAMPAIGN_TYPES_FOR_ASSIGNMENT`
4. Repository: `getCampaignAssignmentsForLead`, `getCampaignAssignmentsForAsset`, `getProposedAssignments`, `getActiveDuplicateAssignment`
5. Service: `createCampaignAssignment`, `approveProposedAssignment`, `rejectProposedAssignment`, `retireCampaignAssignment`, `pauseCampaignAssignment`, `completeCampaignAssignment`
6. Server actions: `createManualAssignmentAction`, `approveProposedAssignmentAction`, `rejectProposedAssignmentAction`, `retireCampaignAssignmentAction`
7. UI: `CampaignAssignmentCard` component on lead detail page
8. UI: `AssignedLeadsPanel` component on campaign asset detail page
9. Activity logging: `CAMPAIGN_ASSIGNED`, `CAMPAIGN_ASSIGNMENT_PROPOSED`, `CAMPAIGN_ASSIGNMENT_APPROVED`, `CAMPAIGN_ASSIGNMENT_REJECTED`, `CAMPAIGN_ASSIGNMENT_PAUSED`, `CAMPAIGN_ASSIGNMENT_RETIRED`, `CAMPAIGN_ASSIGNMENT_COMPLETED`
10. Source-reading tests: `tests/phase3l-campaign-assignment-model.test.ts` (~65 tests)

---

## 5. Explicit Non-Goals

| Non-Goal | Why Excluded |
|----------|-------------|
| Auto-creating drafts from assignment | Deferred; human trigger required |
| Campaign execution / send orchestration | Not in Phase 3L |
| `campaign_email_sends` row creation | Absolutely not in Phase 3L |
| `sendApprovedDraft()` calls | Not in Phase 3L |
| `resend.emails.send` calls | Not in Phase 3L |
| Bypassing approval gates | Not permitted |
| Agent auto-approving its own proposed assignments | Human approval required |
| Bulk import path for `campaign_assignments` | Deferred; Phase 3B.2 not extended here |
| `system_rule` assignment source execution | Design-reserved; not implemented |
| Production migration or deploy | Separately authorized only |
| Phase 3M or later scope | Out of scope |
| Modifying Phase 3K send path | Phase 3K paths are read-only in Phase 3L |
| Updating AI context docs during implementation | Docs updated only after staging smoke passes |

---

## 6. Safety Guardrails

All of the following are unconditional throughout implementation:

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
- **Migration `20240036` is not applied to production in Phase 3L.**

---

## 7. Migration Plan

### File to create

```
supabase/migrations/20240036_phase3l_campaign_assignments.sql
```

### Scope — additive only

The migration creates one new table. It does not alter any existing table. No data migration required.

### Full migration content (to implement)

```sql
-- Phase 3L: Campaign Assignment Model
-- Migration: 20240036
-- Additive only — creates campaign_assignments table

CREATE TABLE campaign_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Target: at least one of lead_id / contact_id must be non-null (CHECK below)
  lead_id                uuid REFERENCES leads(id) ON DELETE SET NULL,
  contact_id             uuid REFERENCES contacts(id) ON DELETE SET NULL,

  -- Campaign assignment target
  campaign_asset_id      uuid REFERENCES campaign_email_assets(id) ON DELETE SET NULL,
  campaign_type          text NOT NULL,

  -- Lifecycle
  assignment_status      text NOT NULL DEFAULT 'assigned',
  assignment_source      text NOT NULL,

  -- Attribution
  assigned_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by_agent_name text,
  assignment_reason      text,
  confidence             numeric(4,3),

  -- Eligibility at assignment time
  eligibility_snapshot   jsonb NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  retired_at             timestamptz,

  -- Constraints
  CONSTRAINT chk_target_non_null
    CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL),
  CONSTRAINT chk_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

-- updated_at trigger (reuse existing function)
CREATE TRIGGER set_campaign_assignments_updated_at
  BEFORE UPDATE ON campaign_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX idx_campaign_assignments_lead
  ON campaign_assignments (workspace_id, lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX idx_campaign_assignments_contact
  ON campaign_assignments (workspace_id, contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX idx_campaign_assignments_asset
  ON campaign_assignments (campaign_asset_id)
  WHERE campaign_asset_id IS NOT NULL;

CREATE INDEX idx_campaign_assignments_tenant
  ON campaign_assignments (tenant_id, created_at DESC);

-- Duplicate prevention: lead-scoped (proposed or assigned)
CREATE UNIQUE INDEX uq_active_assignment_lead_type
  ON campaign_assignments (lead_id, campaign_type)
  WHERE lead_id IS NOT NULL
    AND assignment_status IN ('proposed', 'assigned');

-- Duplicate prevention: contact-only (no linked lead)
CREATE UNIQUE INDEX uq_active_assignment_contact_type
  ON campaign_assignments (contact_id, campaign_type)
  WHERE contact_id IS NOT NULL
    AND lead_id IS NULL
    AND assignment_status IN ('proposed', 'assigned');

-- RLS
ALTER TABLE campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can access campaign_assignments"
  ON campaign_assignments
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Grants
GRANT ALL ON campaign_assignments TO service_role;
GRANT ALL ON campaign_assignments TO authenticated;
```

### Trigger function dependency

Before running this migration, verify `set_updated_at()` function exists (confirmed in place from prior migrations). If not present, include the function creation before the trigger.

### Production boundary

Migration `20240036` is **not** applied to production in Phase 3L. Production is separately authorized. Current production state: `20240034` applied; `20240035` not yet applied. Migration `20240036` may only be applied to production after `20240035` is applied first.

---

## 8. Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/20240036_phase3l_campaign_assignments.sql` | Campaign assignments table DDL |
| 2 | `modules/messaging/types/campaign-assignment.types.ts` | TypeScript types, interfaces, and constants (`ASSIGNMENT_STATUS`, `ASSIGNMENT_SOURCE`, `VALID_CAMPAIGN_TYPES_FOR_ASSIGNMENT`) |
| 3 | `modules/messaging/repositories/campaign-assignment.repo.ts` | DB read/write functions |
| 4 | `modules/messaging/services/campaign-assignment.service.ts` | Business logic and validation |
| 5 | `modules/messaging/actions/campaign-assignment.actions.ts` | `'use server'` actions |
| 6 | `app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx` | Lead detail UI card |
| 7 | `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/AssignedLeadsPanel.tsx` | Asset detail assigned leads panel |
| 8 | `tests/phase3l-campaign-assignment-model.test.ts` | Source-reading test suite |

---

## 9. Files to Modify

| File | Change |
|------|--------|
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | Import and render `CampaignAssignmentCard` below the Draft section; fetch assignments for the lead via repository |
| `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx` | Import and render `AssignedLeadsPanel` as a new tab or section |
| `modules/intelligence/types.agent.ts` | Add new activity event type constants if `CAMPAIGN_ASSIGNED`, `CAMPAIGN_ASSIGNMENT_PROPOSED`, etc. are not already present — add only, do not modify existing events |

**Do not modify:**

| File | Reason |
|------|--------|
| `modules/messaging/services/manual-campaign-draft.service.ts` | Phase 3K path — read-only in Phase 3L |
| `modules/messaging/actions/manual-campaign-draft.actions.ts` | Phase 3K path — read-only in Phase 3L |
| `app/(workspace)/[workspaceSlug]/leads/[id]/ManualCampaignDraftButton.tsx` | Phase 3K path — read-only in Phase 3L |
| `app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssetCard.tsx` | Phase 3K path — read-only in Phase 3L |
| Any `email_sends`-related service or action | No send path changes in Phase 3L |
| Any `approval_requests`-related service | Phase 3H/3K path — read-only in Phase 3L |

---

## 10. Repository Layer Plan

**File:** `modules/messaging/repositories/campaign-assignment.repo.ts`

### Functions to implement

```typescript
// Read: all assignments for a lead (all statuses, ordered by created_at DESC)
getCampaignAssignmentsForLead(
  supabase: SupabaseClient,
  workspaceId: string,
  leadId: string
): Promise<CampaignAssignment[]>

// Read: active assignments for a campaign asset (proposed + assigned only)
getCampaignAssignmentsForAsset(
  supabase: SupabaseClient,
  workspaceId: string,
  assetId: string
): Promise<CampaignAssignment[]>

// Read: all proposed assignments for a workspace (for system intelligence surface)
getProposedAssignments(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<CampaignAssignment[]>

// Read: active duplicate check — returns existing assignment if one exists
getActiveDuplicateAssignment(
  supabase: SupabaseClient,
  leadId: string,
  campaignType: string
): Promise<CampaignAssignment | null>

// Write: insert new assignment row
insertCampaignAssignment(
  supabase: SupabaseClient,
  payload: InsertCampaignAssignment
): Promise<CampaignAssignment>

// Write: update assignment status + optional retired_at / assigned_by_user_id
updateAssignmentStatus(
  supabase: SupabaseClient,
  assignmentId: string,
  patch: UpdateAssignmentStatusPatch
): Promise<CampaignAssignment>
```

### Supabase client usage

All repository functions receive `supabase` as the first argument (injected from service). They do not call `createSupabaseServerClient()` internally. Use `service_role` client in server actions where RLS bypass is required for cross-tenant operations; use `authenticated` client for user-scoped reads.

---

## 11. Service Layer Plan

**File:** `modules/messaging/services/campaign-assignment.service.ts`

### Functions to implement

#### `createCampaignAssignment`

```typescript
type CreateAssignmentInput = {
  tenantId:           string
  workspaceId:        string
  leadId?:            string
  contactId?:         string
  campaignAssetId?:   string
  campaignType:       string
  assignmentSource:   AssignmentSource
  assignedByUserId?:  string
  assignedByAgentName?: string
  assignmentReason?:  string
  confidence?:        number
}

type CreateAssignmentResult =
  | { ok: true;  assignmentId: string }
  | { ok: false; reason: string; existingAssignmentId?: string }
```

**Steps:**
1. Validate `campaignType` is a canonical `CAMPAIGN_TYPE` value
2. Validate at least one of `leadId` / `contactId` is provided
3. If `campaignAssetId` provided: verify asset is `active` and matches `campaignType`
4. If `leadId` provided: call `getActiveDuplicateAssignment` — if found, return `{ ok: false, reason: 'duplicate', existingAssignmentId }`
5. Build `eligibility_snapshot` from lead record (fetch key fields: `lead_status`, `last_email_sent_at`, `last_response_at`, `industry`, `employee_count_range`)
6. Determine initial `assignment_status`: `'assigned'` for manual/import/agent_assisted; `'proposed'` for agent_suggested
7. Call `insertCampaignAssignment`
8. Emit activity log event (`CAMPAIGN_ASSIGNED` or `CAMPAIGN_ASSIGNMENT_PROPOSED`)
9. Return `{ ok: true, assignmentId }`

#### `approveProposedAssignment`

```typescript
approveProposedAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  approvedByUserId: string
): Promise<{ ok: boolean; reason?: string }>
```

**Steps:**
1. Fetch assignment; verify `assignment_status === 'proposed'`
2. Call `updateAssignmentStatus` with `{ assignment_status: 'assigned', assigned_by_user_id: approvedByUserId }`
3. Emit `CAMPAIGN_ASSIGNMENT_APPROVED`
4. Return `{ ok: true }`

#### `rejectProposedAssignment`

**Steps:**
1. Fetch assignment; verify `assignment_status === 'proposed'`
2. Call `updateAssignmentStatus` with `{ assignment_status: 'rejected' }`
3. Emit `CAMPAIGN_ASSIGNMENT_REJECTED`
4. Return `{ ok: true }`

#### `retireCampaignAssignment`

**Steps:**
1. Fetch assignment; verify status is `'assigned'` or `'paused'`
2. Call `updateAssignmentStatus` with `{ assignment_status: 'retired', retired_at: new Date().toISOString() }`
3. Emit `CAMPAIGN_ASSIGNMENT_RETIRED`
4. Return `{ ok: true }`

#### `pauseCampaignAssignment` / `completeCampaignAssignment`

Same pattern — fetch, validate allowed transition, update, emit event.

---

## 12. UI Layer Plan

### 12a. CampaignAssignmentCard

**File:** `app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx`

**Type:** `'use client'` component (needs `useTransition` for action calls)

**Props:**
```typescript
type CampaignAssignmentCardProps = {
  leadId:        string
  workspaceSlug: string
  assignments:   CampaignAssignment[]  // pre-fetched on server, passed as prop
  activeAssets:  { id: string; name: string; campaign_type: string }[]
}
```

**Renders:**
- Active assignments (status `proposed` or `assigned`) as rows with campaign type badge, status badge, assigned-by attribution, assigned-at timestamp
- Proposed assignments show Approve / Reject buttons (calls `approveProposedAssignmentAction` / `rejectProposedAssignmentAction` via `useTransition` + `router.refresh()`)
- "Assign Campaign" button opens inline form:
  - Campaign type dropdown (canonical values from `CAMPAIGN_TYPE`)
  - Optional asset selector (filtered to `activeAssets` matching selected type)
  - Optional reason textarea
  - Eligibility advisory: if snapshot would flag `eligible: false`, show inline warning (non-blocking)
  - Submit calls `createManualAssignmentAction`
- Collapsed accordion for past assignments (paused, completed, retired, rejected)
- Empty state: "No active campaign assignment"

**No send controls. No draft-creation controls.**

### 12b. AssignedLeadsPanel

**File:** `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/AssignedLeadsPanel.tsx`

**Type:** Server component (read-only)

**Props:**
```typescript
type AssignedLeadsPanelProps = {
  assetId:      string
  workspaceSlug: string
  assignments:  CampaignAssignment[]  // pre-fetched on server
}
```

**Renders:**
- Table of leads with active assignment to this asset
- Columns: Lead name (linked to lead detail), assignment status badge, assigned by, assigned at
- Pagination if > 20 rows
- Empty state: "No leads assigned to this campaign asset"

**No send controls.**

### 12c. Lead detail page modifications

**File:** `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx`

Add after existing draft section:

```typescript
// Fetch assignments for lead
const assignments = await getCampaignAssignmentsForLead(supabase, workspaceId, leadId)

// Render
<CampaignAssignmentCard
  leadId={leadId}
  workspaceSlug={workspaceSlug}
  assignments={assignments}
  activeAssets={activeAssets}
/>
```

`activeAssets` is already fetched on this page (Phase 3K). Reuse the existing query result; do not add a second DB call.

### 12d. Campaign asset detail page modifications

**File:** `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx`

Add after existing review panel:

```typescript
const assignedLeads = await getCampaignAssignmentsForAsset(supabase, workspaceId, assetId)

<AssignedLeadsPanel
  assetId={assetId}
  workspaceSlug={workspaceSlug}
  assignments={assignedLeads}
/>
```

---

## 13. Activity / Audit Logging Plan

**File to check first:** `modules/intelligence/types.agent.ts`

Before adding new event type constants, grep for `CAMPAIGN_ASSIGNED` — if already present, reuse; if not, add to the event types union/object.

**Events to log:**

| Constant | When |
|----------|------|
| `CAMPAIGN_ASSIGNED` | `createCampaignAssignment` with `assignment_status = 'assigned'` |
| `CAMPAIGN_ASSIGNMENT_PROPOSED` | `createCampaignAssignment` with `assignment_status = 'proposed'` |
| `CAMPAIGN_ASSIGNMENT_APPROVED` | `approveProposedAssignment` |
| `CAMPAIGN_ASSIGNMENT_REJECTED` | `rejectProposedAssignment` |
| `CAMPAIGN_ASSIGNMENT_PAUSED` | `pauseCampaignAssignment` |
| `CAMPAIGN_ASSIGNMENT_RETIRED` | `retireCampaignAssignment` |
| `CAMPAIGN_ASSIGNMENT_COMPLETED` | `completeCampaignAssignment` |

Each event payload includes: `assignment_id`, `lead_id`, `campaign_type`, `previous_status`, `new_status`, `actor_user_id` or `actor_agent_name`, `reason`, `timestamp`.

Use the existing activity log / workflow event emission pattern from Phase 3F (do not invent a new logging mechanism).

---

## 14. Testing Plan

**Test file:** `tests/phase3l-campaign-assignment-model.test.ts`

All tests use `fs.readFileSync` + `toContain` / `not.toContain`. No Supabase mocking. No LLM mocking.

### Test groups and IDs

| Group | IDs | Count |
|-------|-----|-------|
| Migration DDL | TC-3L-001 – TC-3L-005 | 5 |
| Type definitions | TC-3L-006 – TC-3L-011 | 6 |
| Constants | TC-3L-012 – TC-3L-015 | 4 |
| Repository functions | TC-3L-016 – TC-3L-020 | 5 |
| Service — createCampaignAssignment | TC-3L-021 – TC-3L-028 | 8 |
| Service — approve/reject/retire transitions | TC-3L-029 – TC-3L-034 | 6 |
| Server actions | TC-3L-035 – TC-3L-040 | 6 |
| UI — CampaignAssignmentCard | TC-3L-041 – TC-3L-046 | 6 |
| UI — Approve/Reject buttons for proposed | TC-3L-047 – TC-3L-050 | 4 |
| Safety — no sendApprovedDraft | TC-3L-051 – TC-3L-053 | 3 |
| Safety — no resend import | TC-3L-054 – TC-3L-056 | 3 |
| Safety — no campaign_email_sends write | TC-3L-057 – TC-3L-058 | 2 |
| Safety — no auto-draft creation | TC-3L-059 – TC-3L-060 | 2 |
| Phase 3K compatibility | TC-3L-061 – TC-3L-063 | 3 |
| No Phase 3M / scope-creep guardrails | TC-3L-064 – TC-3L-065 | 2 |

**Total: 65 tests**

### Key test assertions (selected)

**TC-3L-001:** `20240036_phase3l_campaign_assignments.sql` contains `CREATE TABLE campaign_assignments`

**TC-3L-002:** Migration contains `uq_active_assignment_lead_type`

**TC-3L-003:** Migration contains `uq_active_assignment_contact_type`

**TC-3L-004:** Migration contains `chk_target_non_null`

**TC-3L-005:** Migration contains `chk_confidence_range`

**TC-3L-021:** `campaign-assignment.service.ts` contains `getActiveDuplicateAssignment`

**TC-3L-022:** Service contains `'proposed'` (status set for agent_suggested source)

**TC-3L-023:** Service contains `eligibility_snapshot`

**TC-3L-051:** `campaign-assignment.service.ts` does NOT contain `sendApprovedDraft`

**TC-3L-052:** `campaign-assignment.actions.ts` does NOT contain `sendApprovedDraft`

**TC-3L-053:** `CampaignAssignmentCard.tsx` does NOT contain `sendApprovedDraft`

**TC-3L-054:** `campaign-assignment.service.ts` does NOT contain `resend`

**TC-3L-055:** `campaign-assignment.actions.ts` does NOT contain `resend`

**TC-3L-056:** `CampaignAssignmentCard.tsx` does NOT contain `resend`

**TC-3L-057:** `campaign-assignment.service.ts` does NOT contain `campaign_email_sends`

**TC-3L-058:** `campaign-assignment.actions.ts` does NOT contain `campaign_email_sends`

**TC-3L-059:** `campaign-assignment.service.ts` does NOT contain `createEmailDraft` or `generateManualCampaignDraft`

**TC-3L-060:** `campaign-assignment.actions.ts` does NOT contain `generateManualCampaignDraftAction`

**TC-3L-061:** `manual-campaign-draft.service.ts` is NOT modified by Phase 3L (file does not import from `campaign-assignment`)

**TC-3L-062:** `manual-campaign-draft.actions.ts` is NOT modified by Phase 3L

**TC-3L-063:** `CampaignAssignmentCard.tsx` does NOT contain `CreateDraftFromAssetCard` or any draft creation call

**TC-3L-064:** `campaign-assignment.service.ts` does NOT contain `scheduleCampaign` or `executeCampaign`

**TC-3L-065:** `campaign-assignment.actions.ts` does NOT contain `scheduleCampaign` or `executeCampaign`

---

## 15. Implementation Sequence

Steps must be executed in order. Do not skip ahead. Each step should be verified before proceeding.

| Step | Action | File(s) |
|------|--------|---------|
| 1 | Create migration file | `supabase/migrations/20240036_phase3l_campaign_assignments.sql` |
| 2 | Apply migration to local Docker Supabase | `npx supabase db reset` or `npx supabase migration up` locally |
| 3 | Create types file | `modules/messaging/types/campaign-assignment.types.ts` |
| 4 | Create repository file | `modules/messaging/repositories/campaign-assignment.repo.ts` |
| 5 | Create service file | `modules/messaging/services/campaign-assignment.service.ts` |
| 6 | Create server actions file | `modules/messaging/actions/campaign-assignment.actions.ts` |
| 7 | Check and update event types | `modules/intelligence/types.agent.ts` (add-only if needed) |
| 8 | Create `CampaignAssignmentCard` component | `app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx` |
| 9 | Create `AssignedLeadsPanel` component | `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/AssignedLeadsPanel.tsx` |
| 10 | Modify lead detail page | `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` |
| 11 | Modify campaign asset detail page | `app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx` |
| 12 | Write test file | `tests/phase3l-campaign-assignment-model.test.ts` |
| 13 | Run tests | `npx vitest run` — must pass 1267 + 65 = 1332 tests |
| 14 | Run build | `npx next build` — must pass |
| 15 | TypeScript check | `npx tsc --noEmit` — must pass |
| 16 | Commit | `git commit -m "Phase 3L: implement campaign assignment model"` |
| 17 | Push to origin | Triggers staging auto-deploy |
| 18 | Apply migration to staging | With explicit authorization only |
| 19 | Staging smoke test | Manual UI steps (see §17) |
| 20 | Staging DB verification | Confirm `campaign_assignments` row, indexes, eligibility_snapshot |
| 21 | Update AI context docs | After staging smoke passes |
| 22 | Commit docs update | `git commit -m "Docs: update AI context for Phase 3L completion"` |
| 23 | Create lock tag | `phase-3l-campaign-assignment-model-v1 → implementation commit` |

**Do not combine steps.** Do not commit until step 13–15 all pass. Do not apply staging migration until step 16 push is confirmed deployed.

---

## 16. Verification Commands

Run these commands in sequence after all implementation files are written (step 12 complete):

```
git status --short
npx vitest run
npx next build
npx tsc --noEmit
```

Expected results:
- `git status --short` — shows all Phase 3L files staged or modified; no unexpected files
- `npx vitest run` — 1332/1332 tests pass (1267 baseline + 65 new)
- `npx next build` — exit 0, no errors
- `npx tsc --noEmit` — exit 0, no type errors

If any verification step fails, fix the failure before committing. Do not commit with failing tests or a failing build.

---

## 17. Staging Rollout Plan

| Step | Action | Constraint |
|------|--------|-----------|
| 1 | Apply migration `20240036` to **local** Docker Supabase | Do this at implementation step 2 |
| 2 | Run all tests and build locally | Must pass before any commit |
| 3 | Push implementation commit to `origin/master` | Staging Vercel auto-deploys |
| 4 | Confirm staging Vercel deployment succeeded | Check `verian-bios-staging.vercel.app` |
| 5 | Apply migration `20240036` to **staging** Supabase (`smbausuyetlgxflyhmfg`) | **Requires explicit authorization — do not apply without user approval** |
| 6 | Staging smoke test | Manual UI: create assignment, approve proposed, reject proposed, verify no draft created, verify no send |
| 7 | Staging DB verification | Confirm row created, indexes present, eligibility_snapshot populated, `campaign_email_sends` empty |
| 8 | Update AI context docs | After staging smoke and DB verification pass |

**Do not apply migration `20240036` to staging without explicit authorization from the user.**

**Do not apply migration `20240036` to production in Phase 3L.**

---

## 18. Production Boundary

| Item | State |
|------|-------|
| Production Supabase (`kxrplupzbsmujjznzhpy`) | Untouched — current through migration `20240034` |
| Migration `20240035` on production | Not applied — required before `20240036` can be applied |
| Migration `20240036` on production | Not applied — not in scope for Phase 3L |
| Production Vercel (`verian-bios.vercel.app`) | Git-disconnected (Track A); no auto-deploy; explicit `vercel --prod` required |
| Production deploy authorization | Required separately — Phase 3L does not authorize a production deploy |

Production migration order when eventually authorized:
1. Apply `20240035` to production first
2. Confirm migration applied successfully
3. Apply `20240036` to production
4. Run production smoke test
5. Production deploy via explicit `vercel --prod`

No steps in Phase 3L implementation touch production.

---

## 19. Final Claude Implementation Prompt

Copy and paste this prompt verbatim to begin Phase 3L implementation:

---

```
Implement Phase 3L only. Follow the implementation plan exactly:
docs/roadmap/phase-3l-implementation-plan.md

Design reference:
docs/roadmap/phase-3l-campaign-assignment-model-design.md

Current baseline:
- 1267/1267 tests passing
- HEAD: 9517a31 Docs: add Phase 3L campaign assignment model design
- Working tree: clean
- Local Supabase: through migration 20240035
- Staging Supabase (smbausuyetlgxflyhmfg): through migration 20240035
- Production Supabase (kxrplupzbsmujjznzhpy): through migration 20240034 — DO NOT TOUCH

Implement in order:
1. Create supabase/migrations/20240036_phase3l_campaign_assignments.sql
2. Apply migration to local Supabase only
3. Create modules/messaging/types/campaign-assignment.types.ts
4. Create modules/messaging/repositories/campaign-assignment.repo.ts
5. Create modules/messaging/services/campaign-assignment.service.ts
6. Create modules/messaging/actions/campaign-assignment.actions.ts
7. Check modules/intelligence/types.agent.ts — add event type constants only if missing
8. Create app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx
9. Create app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/AssignedLeadsPanel.tsx
10. Modify app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx
11. Modify app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx
12. Write tests/phase3l-campaign-assignment-model.test.ts
13. Run: npx vitest run (must be 1332/1332)
14. Run: npx next build (must pass)
15. Run: npx tsc --noEmit (must pass)

Hard constraints — enforce throughout:
- Do not send email
- Do not enable live sending
- Do not create campaign_email_sends rows
- Do not call sendApprovedDraft()
- Do not call resend.emails.send
- Do not bypass approval
- Do not create campaign execution
- Do not schedule follow-ups
- Do not auto-create drafts
- Do not modify any Phase 3K file (manual-campaign-draft.service.ts,
  manual-campaign-draft.actions.ts, ManualCampaignDraftButton.tsx,
  CreateDraftFromAssetCard.tsx)
- Do not touch production Supabase (kxrplupzbsmujjznzhpy)
- Do not apply migration 20240035 to production
- Do not apply migration 20240036 to production
- Do not deploy production
- Do not change Vercel settings
- Do not create or push tags
- Do not commit unless explicitly instructed
- Do not update AI context docs during implementation — docs updated only after staging smoke passes
- Do not implement Phase 3M or later scope
- EMAIL_SENDING_ENABLED remains disabled
- Campaign Sending remains disabled

After tests and build pass, report:
- all files created/modified
- test count (baseline + new)
- build result
- TypeScript result
- git status --short
- confirmation of all hard constraints
- do not commit
```

---
