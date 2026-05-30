# Phase 3M — Campaign Work Queue & Assignment-to-Draft Linkage

## Implementation Plan v1.0

**Status:** Plan — awaiting approval before any code is written
**Author:** Claude Code (AI assistant)
**Date:** 2026-05-30
**Design reference:** `docs/roadmap/phase-3m-design.md`
**Depends on:** Phase 3K locked (`phase-3k-unified-draft-send-path-v1`), Phase 3L locked (`phase-3l-campaign-assignment-model-v1`)

---

## 1. Phase Title and Objective

**Phase 3M — Campaign Work Queue & Assignment-to-Draft Linkage**

Close the workflow gap between Phase 3L (campaign assignment as intent) and Phase 3K (draft creation as controlled path) by:

1. Adding `email_drafts.campaign_assignment_id` nullable FK (migration `20240037`) so a draft knows which assignment produced it.
2. Surfacing a pre-populated "Create Draft from Assignment" card on the lead detail page when the lead has an active `assigned` assignment.
3. Adding a Campaign Work Queue page (`/settings/campaign-queue`) that shows all active assignments with draft readiness status.
4. Wiring `completeCampaignAssignment` (already implemented in Phase 3L) non-fatally in `email-send.service.ts` so that when an operator manually sends a linked draft, the assignment transitions to `completed`.

**This phase does not enable live sending, auto-send, campaign execution, or any Resend API expansion.**

---

## 2. Source Design Reference

`docs/roadmap/phase-3m-design.md`

All design decisions, non-goals, data model, service boundaries, UI/UX spec, safety guardrails, testing strategy, staging rollout, and production boundary are defined there. This plan is the step-by-step implementation sequence derived from that design.

---

## 3. Current Baseline

| Item | State |
|------|-------|
| HEAD | `f21f101 Docs: add Phase 3M campaign work queue design` |
| Tests | 1332/1332 passing |
| Local migrations | 001–036 applied |
| Staging migrations | 001–036 applied |
| Production migrations | 001–034 applied |
| Next migration | `20240037` |
| `EMAIL_SENDING_ENABLED` | Disabled |
| `CAMPAIGN_SENDING_ENABLED` | Disabled |
| Working tree | Clean |

---

## 4. Implementation Scope

| Deliverable | Description |
|-------------|-------------|
| Migration `20240037` | Nullable FK `email_drafts.campaign_assignment_id`, partial index |
| `types/database.ts` | Add `campaign_assignment_id` to `email_drafts` Row/Insert/Update |
| `email-draft.repo.ts` | `getDraftsLinkedToAssignment` + extend `createEmailDraft` insert |
| `campaign-asset-draft.service.ts` | Optional `campaignAssignmentId` parameter threaded to insert |
| `campaign-queue.service.ts` | New read-only work queue service |
| `campaign-assignment-draft.actions.ts` | New `'use server'` action `createDraftFromAssignmentAction` |
| `CreateDraftFromAssignmentCard.tsx` | New `'use client'` UI card on lead detail |
| `campaign-queue/page.tsx` | New server component page |
| `email-send.service.ts` | Non-fatal `completeCampaignAssignment` call after successful send |
| `types.agent.ts` | One new activity event type constant: `CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT` |
| `CampaignAssignmentCard.tsx` | Read-only linked draft indicator |
| `leads/[id]/page.tsx` | Wire new data and new card |
| `Sidebar.tsx` | Campaign Queue nav entry |
| `tests/phase3m-campaign-work-queue.test.ts` | 65–80 source-reading tests |

---

## 5. Explicit Non-Goals

| Excluded | Notes |
|----------|-------|
| Auto-draft creation | Assignment is intent — draft requires human button click |
| Auto-send | `EMAIL_SENDING_ENABLED` remains disabled; Phase 3H Gate 0 unchanged |
| Resend API expansion | No new `resend.emails.send` calls in any Phase 3M file |
| `campaign_email_sends` row creation | Not written anywhere in Phase 3M |
| Campaign execution queue | Deferred |
| Bulk draft creation | Out of scope |
| Agent-suggested content | No LLM calls |
| Bypassing `pending_approval` gate | Phase 3K approval flow unchanged |
| Production Supabase | Untouched until separately authorized |
| Production Vercel deploy | Not until separately authorized |
| Phase 3N scope | No `scheduleCampaign`, `executeCampaign`, `bulkSend`, `autoSend` |

---

## 6. Safety Guardrails

These guardrails must be satisfied in every new and modified file. Source-reading tests verify them.

| Guardrail | Verification |
|-----------|-------------|
| `createDraftFromAssignmentAction` does not import or call `sendApprovedDraft` | `not.toContain('sendApprovedDraft')` |
| `createDraftFromAssignmentAction` does not call `resend.emails.send` | `not.toContain('resend.emails.send')` |
| `createDraftFromAssignmentAction` does not write `campaign_email_sends` | `not.toContain('campaign_email_sends')` |
| `campaign-queue.service.ts` does not import `@anthropic-ai/sdk` | Source-reading |
| `campaign-queue.service.ts` is read-only (no insert/update/delete) | Source-reading |
| `CreateDraftFromAssignmentCard` does not import resend or call send | Source-reading |
| `CreateDraftFromAssignmentCard` respects `hasActiveDraft` guard | Logic + source-reading |
| Migration `20240037` is additive only | DDL text: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` |
| `completeCampaignAssignment` call is non-fatal | `.catch(() => null)` pattern |
| `completeCampaignAssignment` call is only after Resend success | Placement: after success `Promise.all` in `sendApprovedDraft` |
| `EMAIL_SENDING_ENABLED` gate in `sendApprovedDraft` is not modified | File diff: Gate 0 block unchanged |
| `campaign-asset-draft.service.ts` core logic unchanged | Only additive optional parameter threaded to insert |

---

## 7. Migration Plan

### Reserved migration: `20240037_phase3m_draft_assignment_linkage.sql`

**Do not create this file now.** Create it at implementation time.

**SQL content (for reference):**

```sql
-- Phase 3M: add campaign_assignment_id FK to email_drafts
-- Additive only — no existing rows modified, no defaults to backfill

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS campaign_assignment_id uuid
    REFERENCES campaign_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_campaign_assignment_id
  ON email_drafts (campaign_assignment_id)
  WHERE campaign_assignment_id IS NOT NULL;
```

**Why `ON DELETE SET NULL`:** If an assignment is ever hard-deleted (edge case), linked drafts retain their content; the FK becomes NULL. No cascade delete of drafts.

**Backward compatibility:** All existing `email_drafts` rows will have `campaign_assignment_id = NULL`. All existing Phase 3K and Phase 3B draft creation paths continue to produce NULL for this column — no existing code is broken.

**Production migration order (do not apply to production until separately authorized):**

```
20240035 → 20240036 → 20240037
```

Production is currently through `20240034`. All three must be applied in sequence. Phase 3M production deployment is out of scope until separately authorized.

---

## 8. Files to Create

| File | Description |
|------|-------------|
| `supabase/migrations/20240037_phase3m_draft_assignment_linkage.sql` | Migration — create at implementation time |
| `modules/messaging/services/campaign-queue.service.ts` | Read-only work queue service |
| `modules/messaging/actions/campaign-assignment-draft.actions.ts` | `'use server'` action to create draft from assignment |
| `app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx` | Campaign Queue server component page |
| `app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssignmentCard.tsx` | `'use client'` assignment-to-draft UI card |
| `tests/phase3m-campaign-work-queue.test.ts` | 65–80 source-reading tests |

---

## 9. Files to Modify

| File | Change |
|------|--------|
| `types/database.ts` | Add `campaign_assignment_id: string \| null` to `email_drafts` Row, Insert, Update |
| `modules/messaging/repositories/email-draft.repo.ts` | Extend `CreateEmailDraftInput` + `createEmailDraft` insert; add `getDraftsLinkedToAssignment` |
| `modules/messaging/services/campaign-asset-draft.service.ts` | Add optional `campaignAssignmentId?: string \| null` to `CreateDraftFromAssetInput`; thread to `createEmailDraft` call |
| `modules/messaging/services/email-send.service.ts` | Import `completeCampaignAssignment`; add non-fatal call after Resend success when `draft.campaign_assignment_id` is set |
| `modules/intelligence/types.agent.ts` | Add `CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT` to `ActivityEventType` const |
| `app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx` | Add read-only linked draft indicator |
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | Add `getDraftsLinkedToAssignment` to data loading; wire `CreateDraftFromAssignmentCard` |
| `components/layout/Sidebar.tsx` | Add `ListTodo` to lucide import; add Campaign Queue nav entry between Campaign Assets and Settings |

---

## 10. Repository Layer Plan

### `modules/messaging/repositories/email-draft.repo.ts`

**Change 1 — Extend `CreateEmailDraftInput` interface:**

Add to the interface (line ~212, after `sourceAssetId?: string | null`):
```typescript
campaignAssignmentId?: string | null
```

**Change 2 — Pass `campaignAssignmentId` in `createEmailDraft` insert:**

Add to the insert payload (after the `source_asset_id` line):
```typescript
campaign_assignment_id: input.campaignAssignmentId ?? null,
```

**Change 3 — New `getDraftsLinkedToAssignment` function:**

Add after `getDraftsBySourceAsset`:
```typescript
export async function getDraftsLinkedToAssignment(
  assignmentId: string,
  tenantId: string
): Promise<Pick<EmailDraftRow, 'id' | 'status' | 'lead_id' | 'created_at' | 'source_type'>[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('email_drafts')
    .select('id, status, lead_id, created_at, source_type')
    .eq('tenant_id', tenantId)
    .eq('campaign_assignment_id', assignmentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) throw new Error(`getDraftsLinkedToAssignment: ${error.message}`)
  return data ?? []
}
```

---

## 11. Service Layer Plan

### `modules/messaging/services/campaign-asset-draft.service.ts` (additive only)

**Change — Extend `CreateDraftFromAssetInput` interface:**

Add after `requestedBy: string`:
```typescript
campaignAssignmentId?: string | null
```

**Change — Thread `campaignAssignmentId` to `createEmailDraft` call (step 10 in file):**

In the `emailDraftRepo.createEmailDraft({...})` call, add after `sourceAssetId: input.assetId`:
```typescript
campaignAssignmentId: input.campaignAssignmentId ?? null,
```

All other logic (asset validation, lead loading, contact validation, company load, sender identity, duplicate guard, personalization build, render, approval request creation, approval linkage, agent decision, activity event) is **unchanged**.

---

### `modules/messaging/services/campaign-queue.service.ts` (new)

**Purpose:** Build the work queue data structure for the `/settings/campaign-queue` page. Read-only.

**Exports:**

```typescript
export type DraftReadiness =
  | 'no_draft'
  | 'has_pending_draft'
  | 'has_approved_draft'
  | 'has_draft_from_assignment'

export interface CampaignQueueEntry {
  assignment:     CampaignAssignment
  leadName:       string | null
  leadStatus:     string | null
  leadStage:      string | null
  assetName:      string | null
  draftReadiness: DraftReadiness
}

export async function getCampaignWorkQueue(
  tenantId:    string,
  workspaceId: string
): Promise<CampaignQueueEntry[]>
```

**Implementation:**
1. `createSupabaseServiceClient()` — service role, no auth context needed
2. Query `campaign_assignments WHERE assignment_status = 'assigned' AND tenant_id = ? AND workspace_id = ?`
3. Extract `lead_id` values; query `leads` for name/status/stage in one fetch
4. Extract `campaign_asset_id` values (non-null only); query `campaign_email_assets` for asset names
5. Extract all `lead_id` values; query `email_drafts WHERE lead_id IN (...) AND status NOT IN ('sent', 'superseded') AND tenant_id = ?` to determine blocking draft existence
6. For assignments with `campaign_assignment_id` in `email_drafts`, resolve `has_draft_from_assignment` readiness
7. Sort: `no_draft` first, then `has_pending_draft`, then `has_approved_draft`/`has_draft_from_assignment`
8. Return typed array

**Hard constraints:**
- No LLM calls — no `@anthropic-ai/sdk` import
- No writes — no `insert`, `update`, `delete`
- No Resend — no `resend` import
- No `sendApprovedDraft` import or call
- No `campaign_email_sends` reference

---

### `modules/messaging/services/email-send.service.ts` (modification)

**Purpose:** After a successful manual send of a draft that has `campaign_assignment_id` set, non-fatally call `completeCampaignAssignment` to transition the assignment to `completed`.

**New import (add after existing imports at top of file):**
```typescript
import * as campaignAssignmentService from '@/modules/messaging/services/campaign-assignment.service'
```

**Insertion point:** After the success `Promise.all` block and after `ET_SEND_SUCCEEDED` activity event is emitted (approximately line 293), before `return { ok: true, ... }`:

```typescript
// Phase 3M: non-fatally complete the linked assignment after a successful send.
// Only fires when the draft carries a campaign_assignment_id.
// Does not call Resend, does not call sendApprovedDraft, does not write campaign_email_sends.
if (draft.campaign_assignment_id) {
  campaignAssignmentService
    .completeCampaignAssignment(draft.campaign_assignment_id)
    .catch(() => null)
}
```

**Why after `ET_SEND_SUCCEEDED`:** The Resend call has already returned success; `email_sends.status = 'sent'` and `email_drafts.status = 'sent'` are already written. The assignment completion is an observer — it does not gate the send result.

**Why non-fatal:** If `completeCampaignAssignment` fails (e.g. assignment was already retired), the send is still successful. The `.catch(() => null)` matches the existing non-fatal pattern in this codebase.

**`draft.campaign_assignment_id` typing:** After `types/database.ts` is updated to include `campaign_assignment_id: string | null` in `email_drafts.Row`, and `getEmailDraftForSending` already uses `.select('*')`, `draft.campaign_assignment_id` will be correctly typed as `string | null`. No cast needed.

---

## 12. Action Layer Plan

### `modules/messaging/actions/campaign-assignment-draft.actions.ts` (new)

```typescript
'use server'
```

**Export: `createDraftFromAssignmentAction`**

Signature:
```typescript
export async function createDraftFromAssignmentAction(
  assignmentId:   string,
  workspaceSlug:  string
): Promise<{ ok: true; draftId: string; approvalRequestId: string; missingFields: string[] }
         | { ok: false; reason: string }>
```

**Implementation steps:**

1. Build server-side request context via `createSupabaseServerClient()` + `buildRequestContext(supabase)`
2. Resolve assignment: `assignmentRepo.getAssignmentById(assignmentId)` — return `{ ok: false, reason: 'assignment_not_found' }` if null
3. Validate assignment: `assignment.assignment_status !== 'assigned'` → `{ ok: false, reason: 'assignment_not_active' }`
4. Validate assignment belongs to ctx: `assignment.tenant_id !== ctx.tenantId` → `{ ok: false, reason: 'assignment_not_found' }`
5. Validate lead: `assignment.lead_id` must be non-null → `{ ok: false, reason: 'assignment_has_no_lead' }`
6. Resolve asset:
   - If `assignment.campaign_asset_id` is set: use that asset ID directly
   - Else: call `assetRepo.listAssetsForWorkspace(ctx.tenantId, ctx.workspaceId)` and find first asset with `status === 'active'` and `campaign_type === assignment.campaign_type`
   - If no active asset found: return `{ ok: false, reason: 'no_active_asset_for_campaign_type' }`
7. Call `createDraftFromAsset` (Phase 3K service from `campaign-asset-draft.service.ts`) with:
   ```typescript
   {
     tenantId:            ctx.tenantId,
     workspaceId:         ctx.workspaceId,
     assetId:             resolvedAssetId,
     leadId:              assignment.lead_id,
     requestedBy:         ctx.userId,
     campaignAssignmentId: assignmentId,  // the new optional parameter
   }
   ```
8. If result is `{ ok: false }`: return it directly (propagates `pending_draft_exists`, `asset_not_found`, etc.)
9. If result is `{ ok: true }`:
   - `revalidatePath(`/${workspaceSlug}/leads/${assignment.lead_id}`)` 
   - `revalidatePath(`/${workspaceSlug}/settings/campaign-queue`)`
   - Emit `CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT` activity event (non-fatal — `.catch(() => null)`) with `entityType: 'email_draft'`, `entityId: result.draftId`, `leadId: assignment.lead_id`, `metadata: { assignment_id: assignmentId, draft_id: result.draftId, approval_request_id: result.approvalRequestId }` — this is the assignment-side traceability event; the Phase 3K `CAMPAIGN_ASSET_DRAFT_CREATED` event still fires from the service layer independently
   - Return `{ ok: true, draftId: result.draftId, approvalRequestId: result.approvalRequestId, missingFields: result.missingFields }`

**Hard constraints (enforced in source-reading tests):**
- Does not call `sendApprovedDraft`
- Does not call `resend.emails.send`
- Does not write to `campaign_email_sends`
- Does not write to `campaign_email_sends` table
- `'use server'` at top of file

---

## 13. UI Layer Plan

### `CreateDraftFromAssignmentCard.tsx` (new)

**Location:** `app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssignmentCard.tsx`

**`'use client'`** component.

**Props:**
```typescript
interface Props {
  assignment:    CampaignAssignment  // the active 'assigned' assignment
  workspaceSlug: string
  hasActiveDraft: boolean
  hasActiveAsset: boolean  // whether an active asset exists for the campaign type
  assetName:     string | null
}
```

**Render logic:**
- If `hasActiveDraft` is true: renders `null` (same guard as `CreateDraftFromAssetCard`)
- If `hasActiveAsset` is false: renders a disabled card with explanation ("No active asset for this campaign type")
- Otherwise: renders a card showing campaign type label + asset name + "Create Draft" button

**Button behavior:**
- Uses `useTransition` for loading state
- On click: calls `createDraftFromAssignmentAction(assignment.id, workspaceSlug)` via `startTransition`
- On success `{ ok: true }`: calls `router.refresh()`
- On failure: shows inline error message with the `reason` string

**Position in lead detail page:** Rendered above `CreateDraftFromAssetCard` when `activeAssignment` is defined (design decision: pre-populated path takes visual priority).

**Hard constraints:**
- No `sendApprovedDraft` call
- No `resend` import
- No `campaign_email_sends` reference

---

### `CampaignAssignmentCard.tsx` (modification)

**Current location:** `app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx`

**Addition:** Accept an optional `linkedDrafts` prop of type `Array<{ id: string; status: string }>`. For each `assigned` assignment, if `linkedDrafts` is non-empty, render a read-only "Draft in progress" badge below the assignment actions row showing the draft status (`pending_approval` → "Pending Approval", `approved` → "Approved"). The existing approve/reject/retire/pause action buttons are **unchanged**.

---

### `leads/[id]/page.tsx` (modification)

**Current location:** `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx`

**Addition 1 — Load linked draft data after campaignAssignments are fetched:**

After the existing `campaignAssignments` query (line ~59), add:
```typescript
// Load drafts linked to active assignments (non-fatal)
const activeAssignments = campaignAssignments.filter(a => a.assignment_status === 'assigned')
const linkedDraftsByAssignment = await Promise.all(
  activeAssignments.map(a =>
    emailDraftRepo.getDraftsLinkedToAssignment(a.id, ctx.tenantId).catch(() => [])
  )
)
```

**Addition 2 — Resolve active assignment for CreateDraftFromAssignmentCard:**

```typescript
const activeAssignment = activeAssignments[0] ?? null

// Determine if active asset exists for the active assignment's campaign type
const activeAssignmentAsset = activeAssignment
  ? activeAssets.find(a =>
      a.campaign_type === activeAssignment.campaign_type &&
      (activeAssignment.campaign_asset_id === null || a.id === activeAssignment.campaign_asset_id)
    ) ?? null
  : null
```

**Addition 3 — Render `CreateDraftFromAssignmentCard` above `CreateDraftFromAssetCard`:**

In the JSX, import and render `CreateDraftFromAssignmentCard` immediately above the existing `CreateDraftFromAssetCard`:
```typescript
{activeAssignment && (
  <CreateDraftFromAssignmentCard
    assignment={activeAssignment}
    workspaceSlug={workspaceSlug}
    hasActiveDraft={hasActiveDraft}
    hasActiveAsset={activeAssignmentAsset !== null}
    assetName={activeAssignmentAsset?.asset_name ?? null}
  />
)}
```

**Addition 4 — Pass `linkedDrafts` to `CampaignAssignmentCard`:**

Pass `linkedDraftsByAssignment` mapped by assignment index so the card can show linked draft status.

---

### `settings/campaign-queue/page.tsx` (new)

**Location:** `app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx`

**Server component** — no `'use client'`.

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { getCampaignWorkQueue } from '@/modules/messaging/services/campaign-queue.service'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function CampaignQueuePage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const queue = await getCampaignWorkQueue(ctx.tenantId, ctx.workspaceId)
  // ... render read-only table grouped by campaign type
}
```

**Page layout:**
- Title: "Campaign Work Queue"
- Subtitle: total count of active assigned campaigns
- Table columns: Lead name, Campaign type, Assignment date, Assignment source, Draft readiness badge (No Draft / Draft Pending / Draft Approved)
- "Create Draft" column: link to `/[workspaceSlug]/leads/[leadId]` (not an inline action)
- Empty state when `queue.length === 0`

**No server actions on this page** — it is purely read-only. The "Create Draft" link navigates to the lead page where `CreateDraftFromAssignmentCard` handles the action.

---

### `Sidebar.tsx` (modification)

**Addition 1 — Import `ListTodo` from lucide-react:**

In the existing lucide import block (line ~6–25), add `ListTodo` to the destructured import.

**Addition 2 — New nav entry between Campaign Assets and Settings:**

Current order (lines 60–61):
```typescript
{ label: 'Campaign Assets', href: `${base}/settings/campaign-assets`, icon: <BookOpen className="h-4 w-4" /> },
{ label: 'Settings',        href: `${base}/settings`,                  icon: <Settings className="h-4 w-4" /> },
```

New order:
```typescript
{ label: 'Campaign Assets', href: `${base}/settings/campaign-assets`, icon: <BookOpen className="h-4 w-4" /> },
{ label: 'Campaign Queue',  href: `${base}/settings/campaign-queue`,  icon: <ListTodo className="h-4 w-4" /> },
{ label: 'Settings',        href: `${base}/settings`,                  icon: <Settings className="h-4 w-4" /> },
```

---

## 14. Activity / Audit Logging Plan

### `modules/intelligence/types.agent.ts`

Add one new constant to the `ActivityEventType` const object, after the Phase 3L block (line ~244, before the closing `} as const`):

```typescript
// Phase 3M — Campaign Work Queue & Assignment-to-Draft Linkage (additive)
CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT: 'campaign_draft_created_from_assignment',
```

### Activity events emitted in Phase 3M

| Event | Where emitted | Condition |
|-------|--------------|-----------|
| `CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT` | `campaign-assignment-draft.actions.ts` — emitted after `{ ok: true }` from `createDraftFromAsset`, non-fatal | On successful draft creation via assignment action |

The existing `CAMPAIGN_ASSET_DRAFT_CREATED` event from Phase 3K also fires via `campaign-asset-draft.service.ts` — unchanged. Phase 3M adds `CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT` in the action layer to provide traceability from the assignment side without modifying the service.

The `completeCampaignAssignment` call in `email-send.service.ts` emits `CAMPAIGN_ASSIGNMENT_COMPLETED` (the Phase 3L event type, already defined). No additional event type is needed for the send path — `ET_SEND_SUCCEEDED` provides send-side traceability and `CAMPAIGN_ASSIGNMENT_COMPLETED` provides assignment-side traceability.

---

## 15. Testing Plan

**File:** `tests/phase3m-campaign-work-queue.test.ts`

**Pattern:** Source-reading tests only. `fs.readFileSync` + `expect(...).toContain` / `expect(...).not.toContain`. No Supabase mocking. No LLM calls. No test doubles.

**Estimated:** 65–80 tests across 14 describe blocks.

### Describe block list

| Block | Count | Focus |
|-------|-------|-------|
| `Migration DDL` | 5 | File contains `ADD COLUMN IF NOT EXISTS campaign_assignment_id`, `REFERENCES campaign_assignments`, `ON DELETE SET NULL`, `CREATE INDEX IF NOT EXISTS idx_email_drafts_campaign_assignment_id`, `WHERE campaign_assignment_id IS NOT NULL` |
| `campaign-queue.service.ts` | 8 | Exports `getCampaignWorkQueue`, imports `createSupabaseServiceClient`, does NOT import `@anthropic-ai/sdk`, does NOT contain `resend`, does NOT contain `sendApprovedDraft`, does NOT contain `insert(`, does NOT contain `campaign_email_sends`, returns typed `CampaignQueueEntry[]` |
| `email-draft.repo.ts extensions` | 5 | `getDraftsLinkedToAssignment` is exported, `CreateEmailDraftInput` contains `campaignAssignmentId`, `createEmailDraft` insert contains `campaign_assignment_id`, `getDraftsLinkedToAssignment` queries `campaign_assignment_id`, selects `id, status, lead_id, created_at, source_type` |
| `campaign-assignment-draft.actions.ts` | 8 | `'use server'` at top, exports `createDraftFromAssignmentAction`, imports `revalidatePath`, does NOT contain `sendApprovedDraft`, does NOT contain `resend.emails.send`, does NOT contain `campaign_email_sends`, calls `createDraftFromAsset`, calls `revalidatePath` |
| `Assignment-linked draft creation` | 6 | `createDraftFromAssignmentAction` validates `assignment_status === 'assigned'`, resolves asset fallback, passes `campaignAssignmentId` to service, returns `pending_draft_exists` when blocked, returns `no_active_asset_for_campaign_type` when no asset, propagates `{ ok: true }` on success |
| `CreateDraftFromAssignmentCard` | 7 | `'use client'` at top, imports `createDraftFromAssignmentAction`, does NOT contain `sendApprovedDraft`, does NOT contain `resend`, renders null or disabled when `hasActiveDraft`, uses `useTransition`, calls `router.refresh()` on success |
| `Campaign queue page` | 6 | No `'use client'` in page file, imports `getCampaignWorkQueue`, imports `buildRequestContext`, renders read-only table, does NOT contain `sendApprovedDraft`, does NOT contain any form action that creates a draft directly |
| `Sidebar navigation` | 3 | `ListTodo` in lucide import, `Campaign Queue` label in navItems, href contains `campaign-queue` |
| `Lead detail page integration` | 5 | Imports `CreateDraftFromAssignmentCard`, imports `getDraftsLinkedToAssignment`, calls `getDraftsLinkedToAssignment`, renders `CreateDraftFromAssignmentCard`, `CreateDraftFromAssignmentCard` is above `CreateDraftFromAssetCard` in JSX |
| `CampaignAssignmentCard linked draft` | 4 | Accepts `linkedDrafts` prop, renders draft status badge when `linkedDrafts` is non-empty, no new action buttons introduced, existing action buttons still present |
| `Assignment auto-complete wiring` | 4 | `email-send.service.ts` imports `campaign-assignment.service`, contains `completeCampaignAssignment`, call is guarded by `draft.campaign_assignment_id`, `.catch(() => null)` present |
| `Phase 3K compatibility` | 4 | `campaign-asset-draft.service.ts` still exports `createDraftFromAsset`, `CreateDraftFromAssetCard` still imports from Phase 3K action or service, `source_type = 'campaign_asset_render'` still written in service, `getPendingDraftForLead` duplicate guard still present in service |
| `Phase 3L compatibility` | 4 | `campaign-assignment.service.ts` still exports `completeCampaignAssignment`, does NOT contain `sendApprovedDraft`, does NOT contain `resend`, `campaign_email_sends` not referenced in Phase 3M files |
| `No Phase 3N scope-creep` | 4 | No file in Phase 3M contains `scheduleCampaign`, `executeCampaign`, `bulkSend`, `autoSend` |

---

## 16. Implementation Sequence

Follow this exact order. Do not proceed to a later step before the earlier step is complete. Do not commit unless explicitly instructed.

| Step | Action | File(s) |
|------|--------|---------|
| 1 | Create migration file with exact SQL from Section 7 | `supabase/migrations/20240037_phase3m_draft_assignment_linkage.sql` |
| 2 | Apply migration to local Docker only: `npx supabase db push` or `npx supabase migration up` | Local Supabase |
| 3 | Update `types/database.ts`: add `campaign_assignment_id: string \| null` to `email_drafts` Row, Insert, Update interfaces | `types/database.ts` |
| 4 | Extend `email-draft.repo.ts`: add `campaignAssignmentId` to `CreateEmailDraftInput`, pass in insert, add `getDraftsLinkedToAssignment` | `email-draft.repo.ts` |
| 5 | Extend `campaign-asset-draft.service.ts`: add optional `campaignAssignmentId` to `CreateDraftFromAssetInput`, thread to `createEmailDraft` call | `campaign-asset-draft.service.ts` |
| 6 | Create `campaign-queue.service.ts` (read-only) | `campaign-queue.service.ts` |
| 7 | Create `campaign-assignment-draft.actions.ts` (`'use server'`) | `campaign-assignment-draft.actions.ts` |
| 8 | Create `CreateDraftFromAssignmentCard.tsx` (`'use client'`) | `CreateDraftFromAssignmentCard.tsx` |
| 9 | Create `campaign-queue/page.tsx` (server component) | `page.tsx` |
| 10 | Update `email-send.service.ts`: import `campaign-assignment.service`, add non-fatal `completeCampaignAssignment` call after Resend success | `email-send.service.ts` |
| 11 | Add two new event type constants to `types.agent.ts` | `types.agent.ts` |
| 12 | Update `CampaignAssignmentCard.tsx`: accept `linkedDrafts` prop, render read-only indicator | `CampaignAssignmentCard.tsx` |
| 13 | Update `leads/[id]/page.tsx`: add `getDraftsLinkedToAssignment` loading, wire `CreateDraftFromAssignmentCard` | `page.tsx` |
| 14 | Update `Sidebar.tsx`: add `ListTodo` import, add Campaign Queue nav entry | `Sidebar.tsx` |
| 15 | Write tests | `tests/phase3m-campaign-work-queue.test.ts` |
| 16 | Run `npx vitest run` — all tests must pass (baseline + 65–80 new) | Verification |
| 17 | Run `npx next build` — must pass | Verification |
| 18 | Run `npx tsc --noEmit` — no new errors beyond pre-existing test-file errors | Verification |
| 19 | **Commit only when instructed** | — |
| 20 | **Push only when instructed** | — |
| 21 | **Apply staging migration only after explicit authorization** | — |
| 22 | **Update AI context docs only after staging smoke test passes** | — |

---

## 17. Verification Commands

After all implementation steps are complete and before committing:

```bash
# Check working tree — should show only Phase 3M files changed/created
git status --short

# Run all tests — must pass 1332 baseline + new Phase 3M tests
npx vitest run

# Build check
npx next build

# TypeScript check — pre-existing errors in these test files are known and acceptable:
# - tests/phase3h-send-safety-hardening.test.ts
# - tests/quality-review-agent.test.ts
# No new TypeScript errors must be introduced
npx tsc --noEmit
```

---

## 18. Staging Rollout Plan

This plan executes only after the implementation commit is pushed and tests/build have passed locally.

| Step | Action | Gate |
|------|--------|------|
| 1 | Apply migration `20240037` to local | Tests + build pass locally first |
| 2 | Run `npx vitest run` locally | All tests pass |
| 3 | Run `npx next build` locally | Build passes |
| 4 | Push implementation commit to `origin/master` | User authorization |
| 5 | Wait for staging auto-deploy | Staging Vercel auto-deploys from master |
| 6 | Apply migration `20240037` to staging (`smbausuyetlgxflyhmfg`) | **Explicit user authorization required** — do not apply without instruction |
| 7 | Manual staging smoke test | Must verify all items below |

### Staging smoke test checklist

| Check | Expected |
|-------|----------|
| `/main/settings/campaign-queue` loads | Page renders with Campaign Work Queue header |
| Assigned lead appears in queue | Row with campaign type and `No Draft` badge |
| `CreateDraftFromAssignmentCard` on lead detail | Card renders above `CreateDraftFromAssetCard` |
| `CreateDraftFromAssetCard` still renders below | Phase 3K path preserved |
| Click "Create Draft" in assignment card | Draft created; page refreshes |
| Draft has `campaign_assignment_id` populated | DB query: `SELECT campaign_assignment_id FROM email_drafts WHERE id = '<new_draft_id>'` — must be non-null |
| Draft has `source_type = 'campaign_asset_render'` | DB query — Phase 3K provenance preserved |
| Approval request created | Draft status is `pending_approval` |
| No live send occurred | `email_sends` table has no new `sent` row |
| `campaign_email_sends` empty | Table unchanged |
| `CampaignAssignmentCard` shows "Draft in progress" | After draft creation, indicator appears on assignment card |
| Campaign Queue shows `Draft Pending` badge | Queue row updates after draft creation |
| No auto-send triggered | `EMAIL_SENDING_ENABLED` remains disabled |

**Do not apply migration `20240037` to production.**
**Do not deploy to production.**

---

## 19. Production Boundary

| Item | State |
|------|-------|
| Production Supabase (`kxrplupzbsmujjznzhpy`) | Untouched — currently through migration `20240034` |
| Production migration `20240035` | Not applied — pending |
| Production migration `20240036` | Not applied — pending |
| Production migration `20240037` | Not applied — out of scope for Phase 3M implementation |
| Production migration order | `20240035 → 20240036 → 20240037` — all three must be applied in sequence |
| Production Vercel deploy | Not until separately authorized — Git is disconnected (Track A) |
| `EMAIL_SENDING_ENABLED` on production | Remains disabled |

Production deployment of Phase 3M requires explicit separate authorization after:
1. Staging smoke test passes
2. Explicit instruction to apply `20240035` to production
3. Explicit instruction to apply `20240036` to production
4. Explicit instruction to apply `20240037` to production
5. Explicit instruction to deploy to production Vercel

---

## 20. Final Claude Implementation Prompt

Copy this prompt verbatim when beginning Phase 3M implementation. Do not begin implementation until this plan is approved.

---

**PHASE 3M IMPLEMENTATION PROMPT — COPY VERBATIM**

```
Implement Phase 3M — Campaign Work Queue & Assignment-to-Draft Linkage.

Design reference: docs/roadmap/phase-3m-design.md
Implementation plan reference: docs/roadmap/phase-3m-implementation-plan.md

Current confirmed state:
- HEAD: f21f101 Docs: add Phase 3M campaign work queue design
- Working tree: clean
- Tests: 1332/1332 passing
- Local migrations applied: 001-036
- Next migration: 20240037
- EMAIL_SENDING_ENABLED: disabled
- CAMPAIGN_SENDING_ENABLED: disabled

Follow the Implementation Sequence in Section 16 of the plan exactly, in order.

Hard constraints — enforce in every file you create or modify:
- Do not call sendApprovedDraft in any new file
- Do not call resend.emails.send in any new file
- Do not write to campaign_email_sends in any Phase 3M file
- Do not create auto-draft logic — every draft requires human button click
- Do not enable EMAIL_SENDING_ENABLED — it must remain false
- Do not enable CAMPAIGN_SENDING_ENABLED — it must remain false
- Do not implement campaign execution
- Do not implement auto-send
- Do not implement bulk draft creation
- Do not implement bulk send
- Do not implement Phase 3N features (scheduleCampaign, executeCampaign, bulkSend, autoSend)
- Do not apply migration 20240037 to production
- Do not apply migration 20240035 to production
- Do not apply migration 20240036 to production
- Do not deploy production Vercel
- Do not create or push git tags
- Do not update AI context docs during implementation — docs update is a separate post-staging step
- Do not commit unless explicitly instructed
- Do not push unless explicitly instructed
- Do not apply any migration to staging unless explicitly instructed

After completing all implementation steps:
1. Run: npx vitest run
2. Run: npx next build
3. Run: npx tsc --noEmit
4. Run: git status --short && git diff --stat
5. Report:
   - test results (pass/fail, count)
   - build result
   - TypeScript errors (list any new ones — pre-existing errors in phase3h and quality-review-agent test files are acceptable)
   - git status (untracked/modified files)
   - confirmation that no code enables sending, auto-send, or Resend expansion
   - confirmation that campaign_email_sends was not written
   - confirmation that EMAIL_SENDING_ENABLED was not modified
   - confirmation of migration 20240037 NOT applied to production
   - confirmation of no live sending enabled
   - await commit instruction before committing
```

---

*End of implementation prompt.*
