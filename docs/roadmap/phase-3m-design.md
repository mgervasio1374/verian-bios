# Phase 3M — Campaign Work Queue & Assignment-to-Draft Linkage

## Design & Scope v1.0

**Status:** Draft — awaiting approval before implementation begins
**Author:** Claude Code (AI assistant)
**Date:** 2026-05-30
**Depends on:** Phase 3K (Unified Draft / Send Path), Phase 3L (Campaign Assignment Model)

---

## 1. Executive Summary

Phase 3M closes the workflow gap between Phase 3L (campaign assignment as intent) and Phase 3K (draft creation as controlled path). It does three things:

1. **FK linkage** — adds `email_drafts.campaign_assignment_id` (migration `20240037`) so that a draft knows which assignment produced it, and an assignment knows which draft it produced.
2. **Assignment-to-draft UI** — on the lead detail page, when the lead has an active `assigned` campaign assignment, surfaces a pre-populated "Create Draft from Assignment" affordance that routes through the existing Phase 3K `createDraftFromCampaignAsset` path.
3. **Campaign Work Queue** — a new `/settings/campaign-queue` page that lists all `assigned` campaign assignments grouped by status, showing each lead's draft readiness at a glance.

Phase 3M does **not** enable live sending, auto-send, automatic draft creation, or any Resend expansion. Human approval remains mandatory at every step. Every draft still goes through `pending_approval → approved → manual send` unchanged.

---

## 2. Recommended Scope: Option B — Assignment-to-Draft Workflow

### Why this is the right next phase

After Phase 3L, an operator can see that a lead is assigned to a campaign (e.g. `proposal_follow_up`). After Phase 3K, an operator can create a draft from an active campaign asset. But these two actions are **completely disconnected**:

- The assignment tells you _what_ to send — but does not pre-populate the draft creation UI.
- The draft creation UI has no awareness of the assignment — the operator has to match them up manually.
- When a draft is eventually sent, the assignment is never updated — it stays `assigned` indefinitely.

Phase 3M connects these two by adding the missing FK and a pre-populated UI affordance. This is surgical, safe, and immediately useful.

### Why the other options are deferred

| Option | Decision | Reason |
|--------|----------|--------|
| A — Campaign execution queue | Deferred | Points toward automation; risk of auto-draft scope creep |
| C — Campaign reporting | Partially included | Work queue page includes draft-readiness status; full analytics deferred to Phase 3N |
| D — Agent-assisted recommendations | Deferred | Requires AI budget; higher complexity; not the immediate gap |
| E — Live pilot / live sending | **Excluded by hard constraint** | `EMAIL_SENDING_ENABLED` must remain disabled |

---

## 3. Non-Goals (Explicit Exclusions)

| Excluded | Reason |
|----------|--------|
| Auto-draft creation when assignment is created | Assignments are intent, not triggers — Phase 3L invariant preserved |
| Auto-send of any kind | `EMAIL_SENDING_ENABLED` remains disabled |
| Resend API expansion | No new email sends, no new Resend calls |
| Campaign execution queue (scheduled sends) | Deferred — requires separate authorization |
| Bypassing `pending_approval` → human approval gate | Not touched — unchanged from Phase 3K |
| Bulk draft creation | Out of scope — operator must create drafts one lead at a time |
| Agent-suggested draft content | Deferred — no LLM calls in Phase 3M |
| `campaign_email_sends` row creation | Assignment-to-draft does not write send records |
| Auto-complete assignment on draft creation | Only on send — see Section 8 |
| Modifying Phase 3K draft creation services | Phase 3K services are unchanged; Phase 3M adds a new action that calls them |

---

## 4. Data Model Impact

### Migration `20240037` (reserved — not created in this design step)

**One additive column on `email_drafts`:**

```sql
ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS campaign_assignment_id uuid
    REFERENCES campaign_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_campaign_assignment_id
  ON email_drafts (campaign_assignment_id)
  WHERE campaign_assignment_id IS NOT NULL;
```

**Why `ON DELETE SET NULL`:** If an assignment is deleted (edge case — the UI only allows retire, not delete), linked drafts retain their content. The FK becomes NULL. No cascade delete.

**Backward compatibility:** All existing `email_drafts` rows have `campaign_assignment_id = NULL`. Existing Phase 3K and Phase 3B draft creation paths continue to produce `NULL` in this column — unchanged.

**No changes to `campaign_assignments` table:** Phase 3L's `campaign_assignments` schema is correct as-is. The link is one-directional: `email_drafts → campaign_assignments` (a draft knows its assignment; the assignment does not carry a draft ID). Multiple drafts can be linked to one assignment (e.g. if a draft is rejected and a new one is created).

### `source_type` values

Phase 3M does **not** introduce a new `source_type`. The draft creation path for an assignment-linked draft reuses `source_type = 'campaign_asset_render'` from Phase 3K. The `campaign_assignment_id` FK is the additional provenance field. This keeps the `source_type` vocabulary clean and the Phase 3K render path unchanged.

Phase 3K reserved `source_type = 'future_campaign_step'` in its design — that reservation is released. Phase 3M uses the existing `campaign_asset_render` type with the FK field instead.

---

## 5. Service and Repository Boundaries

### New: `campaign-queue.service.ts`

```
modules/messaging/services/campaign-queue.service.ts
```

**Responsibility:** Build the campaign work queue — a read-only data structure used by the `/settings/campaign-queue` page.

**`getCampaignWorkQueue(tenantId, workspaceId)`** — returns:
- All active (`assigned`) campaign assignments for the workspace
- For each assignment: the linked lead's name/status/stage, the assigned campaign type, the associated asset (if `campaign_asset_id` is set), and whether a current pending/approved draft exists for that lead
- Draft readiness: `'no_draft'` | `'has_pending_draft'` | `'has_approved_draft'` | `'has_active_draft_from_assignment'`
- Sorted: leads with `no_draft` first (need attention), then `has_pending_draft`, then `has_approved_draft`

**Implementation:** Two queries via `createSupabaseServiceClient()`:
1. `campaign_assignments WHERE assignment_status = 'assigned' AND tenant_id = ?`
2. `email_drafts WHERE lead_id IN (...) AND status NOT IN ('sent', 'superseded') AND tenant_id = ?` — checks for any blocking draft

No LLM calls. No writes. No Resend. Read-only.

### New: `email-draft.repo.ts` extension

**`getDraftsLinkedToAssignment(assignmentId, tenantId)`** — returns up to 5 most recent drafts with `campaign_assignment_id = assignmentId`. Used by the lead detail page to show which draft(s) originated from a given assignment.

**`createEmailDraftWithAssignment(input)`** — wraps the existing `createEmailDraft` call with an added `campaign_assignment_id` field. Delegates to existing insert logic; the FK is additive.

### New: `campaign-assignment-draft.actions.ts`

```
modules/messaging/actions/campaign-assignment-draft.actions.ts
```

**`createDraftFromAssignmentAction(assignmentId, workspaceSlug)`** — `'use server'` action:
1. Resolves assignment record via `getAssignmentById`
2. Validates: assignment must be `assigned` status, lead must exist
3. Resolves the campaign asset: if `assignment.campaign_asset_id` is set, uses that asset; otherwise queries `listAssetsByType(tenantId, workspaceId, assignment.campaign_type, 'active')` and uses the first active asset
4. If no active asset found: returns `{ ok: false, reason: 'no_active_asset_for_campaign_type' }`
5. Calls `createDraftFromCampaignAsset` (Phase 3K service) with the optional `campaignAssignmentId` parameter populated — the Phase 3K service threads this through to the repo insert so the FK is written atomically with the draft row. The service's validation, rendering, and approval creation logic are unchanged.
6. Calls `revalidatePath` for both the lead detail page and the campaign queue page
7. Returns `{ ok: true, draftId, approvalRequestId }`

**Does not call `sendApprovedDraft`.** Does not call `resend.emails.send`. Does not write to `campaign_email_sends`.

### Modified: `campaign-assignment.service.ts`

**`completeCampaignAssignment`** — already implemented in Phase 3L. Phase 3M wires it to be called (non-fatally) in `email-send.service.ts` after an operator manually sends a linked draft and the Resend call has already returned success. This transitions the assignment to `completed` status, recording the natural end of the assignment lifecycle.

**This does not enable sending.** It does not call Resend, does not call `sendApprovedDraft`, and does not trigger any automation. It only observes an already-completed manual send that was initiated through the existing `EMAIL_SENDING_ENABLED`-gated path. The send gate is Phase 3H and remains unchanged.

The call is non-fatal (`.catch(() => null)`) and only fires if:
- `draft.campaign_assignment_id !== null`
- The Resend API call has already returned successfully (send already happened)

This is the only write to `campaign_assignments` in Phase 3M. It does not unblock or trigger any additional automation.

---

## 6. UI/UX Impact

### New page: `/[workspaceSlug]/settings/campaign-queue`

**Route:** `app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx`

Server component. Read-only. No `'use client'`.

**Layout:**
- Header: "Campaign Work Queue" with subtitle and total count
- Filter row (server-side URL params): campaign type filter, status filter (`no_draft` / `has_draft`)
- Table per campaign type group:
  - Lead name + status/stage
  - Assignment date
  - Assignment source (manual / agent_suggested / etc.)
  - Draft readiness badge: `No Draft` (amber) / `Draft Pending` (blue) / `Draft Approved` (green)
  - Action: "Create Draft" link → lead detail page (not a direct action — operator goes to lead page to create)
- Empty state when no assigned campaigns
- Sidebar navigation: "Campaign Queue" entry added between Campaign Assets and Settings

**Why link to lead page rather than inline action:** The lead detail page has the full context (lead status, prior drafts, workflow errors). Draft creation from the work queue is a navigation shortcut, not a direct server action from the queue page. This avoids a complex form on the queue page.

### New component on lead detail: `CreateDraftFromAssignmentCard.tsx`

**Location:** `app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssignmentCard.tsx`

**`'use client'`** component. Renders only when:
- Lead has an `assigned` campaign assignment (`activeAssignment` is defined)
- No currently blocking draft (`hasActiveDraft === false` — same guard as `CreateDraftFromAssetCard`)
- An active campaign asset exists for the assigned campaign type

**Appearance:**
- Compact card with the campaign type label and asset name pre-populated
- One "Create Draft" button
- Calls `createDraftFromAssignmentAction(assignment.id, workspaceSlug)` via `useTransition`
- On success: `router.refresh()`
- Loading/error states

**Relationship to `CreateDraftFromAssetCard` (Phase 3K):**
- `CreateDraftFromAssignmentCard` renders **above** `CreateDraftFromAssetCard` when an active assignment exists — it is the preferred, pre-populated path
- `CreateDraftFromAssetCard` still renders below (asset picker, any active asset) as the general path
- If no active assignment, only `CreateDraftFromAssetCard` renders — Phase 3K behavior unchanged
- Both components share the `hasActiveDraft` guard — if any blocking draft exists, neither renders

**Linked draft display on assignment card (`CampaignAssignmentCard.tsx`):**

The existing `CampaignAssignmentCard` (Phase 3L) is **lightly extended** — for each active `assigned` assignment, if a linked draft exists (`getDraftsLinkedToAssignment`), show a "Draft in progress" indicator with the draft status (pending / approved). This is a read-only addition; the card's action buttons are unchanged.

### Modified: lead detail `page.tsx`

Two additions to `Promise.all`:
1. `assignmentDraftRepo.getDraftsLinkedToAssignment` for each active assignment
2. Pass linked draft data to `CampaignAssignmentCard` and guard logic for `CreateDraftFromAssignmentCard`

### Sidebar navigation

One new entry: "Campaign Queue" (icon: `ListTodo` from lucide-react) between Campaign Assets and Settings.

---

## 7. Relationship to Phase 3K

Phase 3M does not modify the logic or behavior of any Phase 3K service. One additive change is made: `campaign-asset-draft.service.ts` receives a new optional parameter `campaignAssignmentId?: string | null` (defaults to `null`). The function's validation, asset lookup, template rendering, draft creation, and approval creation logic are identical to Phase 3K — this parameter is only threaded through to the repo INSERT so the FK is written atomically. All existing Phase 3K callers that omit the parameter continue to work without change.

`email-draft.repo.ts` is extended additively with `getDraftsLinkedToAssignment` (new read function) and the draft insert extended to write `campaign_assignment_id` when provided. Existing insert callers are unaffected.

The Phase 3K `CreateDraftFromAssetCard` is unchanged. The Phase 3K `CreateDraftFromAssetCard` continues to render as the general-purpose path.

Phase 3M adds:
- A new action (`createDraftFromAssignmentAction`) that calls the Phase 3K service with the assignment FK parameter
- A new UI card (`CreateDraftFromAssignmentCard`) that invokes the new action
- An optional FK on `email_drafts` that records which assignment originated a draft

The Phase 3K source types are preserved. `source_type = 'campaign_asset_render'` and `source_asset_id` are still written by the Phase 3K service layer — unchanged. The Phase 3K duplicate guard (`getPendingDraftForLead`) applies equally to assignment-linked drafts — if a blocking draft exists, the assignment card shows the blocked state and `createDraftFromAssignmentAction` returns `{ ok: false, reason: 'pending_draft_exists' }`.

---

## 8. Relationship to Phase 3L

Phase 3M is the operator-driven draft workflow layer that Phase 3L deliberately deferred. Phase 3L's invariants are preserved:

| Phase 3L invariant | Phase 3M behavior |
|---|---|
| Assignment does not create a draft automatically | Phase 3M requires a human button click — no auto-draft |
| Assignment does not send an email | Phase 3M does not call `sendApprovedDraft` |
| `campaign_email_sends` table is not written | Phase 3M never writes to `campaign_email_sends` |
| Assignment status is managed by service functions | Phase 3M calls `completeCampaignAssignment` non-fatally after a manual send succeeds |
| Duplicate assignment prevention (unique partial index) | Unchanged — not touched in Phase 3M |

The one new behavior: an assignment transitions to `completed` when its linked draft is successfully sent. This is the natural lifecycle completion and uses the `completeCampaignAssignment` function already implemented in Phase 3L.

---

## 9. Migration Assessment

**Migration `20240037` is required.**

**Scope:** One `ALTER TABLE email_drafts ADD COLUMN` + one partial index. Additive only. No defaults to backfill (column is nullable). No existing rows touched. Safe to apply at any time.

**Production consideration:** Migration `20240035` and `20240036` must be applied to production before `20240037`. Production is currently through `20240034`. The production migration sequence is:

```
20240035 → 20240036 → 20240037
```

All three are pending on production. Phase 3M implementation must not proceed to production until the above sequence is applied in order.

---

## 10. Safety Guardrails

The following guardrails must be enforced in implementation and verified by source-reading tests:

| Guardrail | Test |
|-----------|------|
| `createDraftFromAssignmentAction` does not call `sendApprovedDraft` | Source-reading: `not.toContain('sendApprovedDraft')` |
| `createDraftFromAssignmentAction` does not call `resend.emails.send` | Source-reading: `not.toContain('resend.emails.send')` |
| `createDraftFromAssignmentAction` does not write to `campaign_email_sends` | Source-reading: `not.toContain('campaign_email_sends')` |
| `campaign-queue.service.ts` does not call `sendApprovedDraft` | Source-reading |
| `campaign-queue.service.ts` does not import `@anthropic-ai/sdk` | Source-reading |
| `CreateDraftFromAssignmentCard` does not call `sendApprovedDraft` | Source-reading |
| `CreateDraftFromAssignmentCard` does not import resend | Source-reading |
| Migration `20240037` is additive only (`ADD COLUMN IF NOT EXISTS`) | DDL text check |
| `completeCampaignAssignment` call is non-fatal (`.catch()`) | Source-reading |
| Duplicate draft guard still active: `pending_draft_exists` returned when blocked | Source-reading + logic |
| `EMAIL_SENDING_ENABLED` gate in `sendApprovedDraft` is not modified | Phase 3H invariant — not touched |

---

## 11. Testing Strategy

Source-reading tests only (same pattern as Phase 3L). No Supabase mocking. No LLM calls. No test doubles.

**Estimated: 65–80 tests across 14 describe blocks**

| Block | Tests | Focus |
|-------|-------|-------|
| Migration DDL | 5 | `20240037` creates FK column, index, `IF NOT EXISTS`, additive-only |
| `campaign-queue.service.ts` | 8 | exports, service reads, no writes, no LLM, no Resend, safety guards |
| `email-draft.repo.ts` extensions | 5 | `getDraftsLinkedToAssignment` exists, insert accepts `campaign_assignment_id` |
| `campaign-assignment-draft.actions.ts` | 8 | `'use server'`, exports, `revalidatePath`, no sendApprovedDraft, no resend, no campaign_email_sends |
| Assignment-linked draft creation | 6 | asset resolution, FK population, blocked state return, no auto-send |
| `CreateDraftFromAssignmentCard` | 7 | `'use client'`, action call, guarding, no sendApprovedDraft, no resend import |
| Campaign queue page | 6 | server component, no `'use client'`, route existence, read-only |
| Sidebar navigation | 3 | ListTodo icon, Campaign Queue entry |
| Lead detail page integration | 5 | new Promise.all members, CreateDraftFromAssignmentCard import |
| `CampaignAssignmentCard` linked draft | 4 | linked draft indicator read-only, no new action buttons |
| Assignment auto-complete wiring | 4 | non-fatal `.catch()`, `campaign_assignment_id` guard, no send triggered |
| Phase 3K compatibility | 4 | `campaign-asset-draft.service.ts` still exports `createDraftFromCampaignAsset`; `CreateDraftFromAssetCard` still imports from Phase 3K; `source_type = 'campaign_asset_render'` still written; Phase 3K duplicate guard still active |
| Phase 3L compatibility | 4 | `campaign-assignment.service.ts` unchanged except `completeCampaignAssignment` call site; assignment model invariants preserved; no auto-draft on assignment creation; `campaign_email_sends` not written |
| No Phase 3N scope-creep | 4 | no scheduleCampaign, no executeCampaign, no bulkSend, no autoSend in any Phase 3M file |

---

## 12. Staging Rollout Plan

1. Apply migration `20240037` to local only (after implementation)
2. Run `npx vitest run` — all tests pass
3. Run `npx next build` — build passes
4. Push to `origin/master` → staging auto-deploys
5. Apply migration `20240037` to staging (`smbausuyetlgxflyhmfg`)
6. Manual staging smoke test:
   - Campaign Queue page loads at `/main/settings/campaign-queue`
   - Assigned lead appears in queue with `No Draft` badge
   - `CreateDraftFromAssignmentCard` renders on lead detail
   - Clicking "Create Draft" creates draft with `campaign_assignment_id` populated
   - `CreateDraftFromAssetCard` still renders below (Phase 3K preserved)
   - Draft shows in queue as `Draft Pending`
   - `CampaignAssignmentCard` shows "Draft in progress" indicator
   - No send occurs
   - `campaign_email_sends` remains empty
7. DB verification: query `email_drafts.campaign_assignment_id` to confirm FK populated
8. Report staging results before production

---

## 13. Production Boundary

| Item | State |
|------|-------|
| Production migration `20240037` | Not applied until explicitly authorized, after `20240035` and `20240036` are applied first |
| Production Vercel deploy | Not until explicitly authorized |
| `EMAIL_SENDING_ENABLED` on production | Remains disabled |
| `campaign_email_sends` on production | Unchanged — no new rows |

---

## 14. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-1 | Migration `20240037` applies cleanly to local and staging without error |
| AC-2 | All existing `email_drafts` rows have `campaign_assignment_id = NULL` after migration |
| AC-3 | Campaign Queue page renders at `/[workspaceSlug]/settings/campaign-queue` |
| AC-4 | Queue shows assigned leads grouped by campaign type with draft readiness badges |
| AC-5 | `CreateDraftFromAssignmentCard` renders on lead detail when active assignment exists and no blocking draft |
| AC-6 | Clicking "Create Draft" calls `createDraftFromAssignmentAction`; draft is created with `campaign_assignment_id` populated |
| AC-7 | Created draft has `source_type = 'campaign_asset_render'` and `source_asset_id` populated (Phase 3K provenance preserved) |
| AC-8 | `hasActiveDraft` guard blocks `CreateDraftFromAssignmentCard` when a blocking draft exists |
| AC-9 | `CreateDraftFromAssetCard` (Phase 3K) still renders below `CreateDraftFromAssignmentCard` when unblocked |
| AC-10 | When no active assignment exists on lead, only `CreateDraftFromAssetCard` renders (Phase 3K behavior unchanged) |
| AC-11 | `CampaignAssignmentCard` shows "Draft in progress" indicator for assignments with linked drafts |
| AC-12 | `completeCampaignAssignment` is called non-fatally when a linked draft is sent |
| AC-13 | `campaign_email_sends` table is empty after assignment-to-draft flow |
| AC-14 | No `sendApprovedDraft` call in any Phase 3M file |
| AC-15 | No `resend.emails.send` call in any Phase 3M file |
| AC-16 | All 55–70 source-reading tests pass |
| AC-17 | `npx next build` passes with no new TypeScript errors |
| AC-18 | `EMAIL_SENDING_ENABLED` remains disabled throughout |

---

## 15. Open Questions

| ID | Question | Owner | Impact |
|----|----------|-------|--------|
| OQ-1 | Should `createDraftFromAssignmentAction` auto-select the first active asset if `campaign_asset_id` is null on the assignment, or should it block and require the operator to manually select? | Product | Auto-select is more ergonomic; explicit select is safer. Recommend auto-select first active asset with fallback to blocked state if none found. |
| OQ-2 | Should the Campaign Queue page support pagination? Initial implementation could cap at 100 assignments per page. | Engineering | Low risk — cap at 100 for v1 |
| OQ-3 | Should assignments with `proposed` status appear on the Campaign Queue with an "Approve" action? | Product | Yes, appears useful — but makes the queue page interactive (requires server action). Recommend read-only v1 with link to lead page for approve/reject. |
| OQ-4 | When a draft linked to an assignment is rejected (HRB reject path), should the assignment return to `assigned` status? Or does it stay and a new draft can be created? | Product | Recommend: assignment stays `assigned`; a new draft can be created (no state change on rejection). The assignment lifecycle is independent of individual draft outcomes. |
| OQ-5 | Should `campaign_assignment_id` be exposed in the `email_drafts` TypeScript types (`types/database.ts`)? | Engineering | Yes — must be added to `Row`, `Insert`, and `Update` interfaces for type-safe access. |
| OQ-6 | Should the Campaign Queue page be accessible to `platform_admin` only, or all workspace members? | Product | Recommend: same permission as campaign assets (`crm.companies.view` or a new `campaigns.view` permission). |
| OQ-7 | Should the Sidebar nav entry be `ListTodo` (lucide) or `Workflow` or `CalendarCheck`? | Design | Minor cosmetic decision — recommend `ListTodo` for clarity. |

---

## 16. Files to Create / Modify

### New files

| File | Type |
|------|------|
| `supabase/migrations/20240037_phase3m_draft_assignment_linkage.sql` | Migration (create at implementation time) |
| `modules/messaging/services/campaign-queue.service.ts` | New service |
| `modules/messaging/actions/campaign-assignment-draft.actions.ts` | New server actions |
| `app/(workspace)/[workspaceSlug]/settings/campaign-queue/page.tsx` | New page |
| `app/(workspace)/[workspaceSlug]/leads/[id]/CreateDraftFromAssignmentCard.tsx` | New UI component |
| `tests/phase3m-campaign-work-queue.test.ts` | New test file |

### Modified files

| File | Change |
|------|--------|
| `modules/messaging/repositories/email-draft.repo.ts` | Add `getDraftsLinkedToAssignment`, extend insert with `campaign_assignment_id` |
| `modules/messaging/services/campaign-asset-draft.service.ts` | Add optional `campaignAssignmentId?: string \| null` parameter; thread to repo insert; all other validation, rendering, and approval creation logic unchanged |
| `modules/messaging/services/email-send.service.ts` | Add non-fatal `completeCampaignAssignment` call when `draft.campaign_assignment_id` is set and send succeeds |
| `modules/intelligence/types.agent.ts` | Add `CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT` and `CAMPAIGN_ASSIGNMENT_COMPLETED_BY_SEND` activity event types (additive) |
| `app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx` | Add linked draft indicator (read-only) |
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | Add `getDraftsLinkedToAssignment` to Promise.all; wire `CreateDraftFromAssignmentCard` |
| `components/layout/Sidebar.tsx` | Add `ListTodo` import; add Campaign Queue nav entry |
| `types/database.ts` | Add `campaign_assignment_id` to `email_drafts` Row / Insert / Update |

---

## 17. Summary

Phase 3M is the natural successor to Phase 3L. It connects the assignment model (intent) to the draft creation path (action) without introducing any automation, live sending, or Resend expansion. The migration is minimal (one nullable FK column). The UI additions are scoped and guarded. The safety model is identical to Phase 3K and Phase 3L: every draft requires human approval, every send requires the `EMAIL_SENDING_ENABLED` gate, and no email is triggered automatically.

**Recommended approval gate:** Design document approved → Implementation Plan produced and approved → Code.

**Next migration after Phase 3M:** `20240038`.

**Production prerequisite:** Migrations `20240035`, `20240036`, and `20240037` must all be applied in sequence before any Phase 3M code reaches production.
