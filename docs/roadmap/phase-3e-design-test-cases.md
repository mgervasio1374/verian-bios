# Phase 3E — Lead Workflow Control
## Design & Test Cases v1.0

**Date:** 2026-05-27
**Status:** DRAFT — awaiting approval
**Preceded by:** Phase 3D Revenue Analytics (`phase-3d-revenue-analytics-v1`, `08c3cdd`)
**Next step after approval:** Implementation Plan

---

## 1. Phase 3E Objective

Give operators the ability to enable or disable the AI outbound workflow for individual leads directly from the lead detail page, and display workflow status visually on the lead kanban board.

The result: operators who import leads (Phase 3B.2) or see "Workflow Off: N" in analytics (Phase 3D) can immediately act on the problem without leaving the CRM.

---

## 2. Problem Being Solved

Leads imported via Phase 3B.2 always arrive with `workflow_enabled = false`. This is correct by design — imported leads are unreviewed and should not automatically enter the AI pipeline. But there is currently no UI to flip this flag.

The operator flow today:
1. Import leads → all arrive with `workflow_enabled = false`
2. Phase 3D analytics shows "Workflow Off: N" — operator sees the gap
3. **Dead end.** No UI exists to enable workflow for any lead.

The only escape path today is a direct Supabase dashboard UPDATE — which is inaccessible to most operators and violates the intent of the CRM surface.

The lead detail page (`/leads/[id]`) shows:
- Stage, priority, status
- Fit score, urgency score
- Recommended action
- Email draft and quality review

It does **not** show `workflow_enabled` or provide any way to change it.

The leads kanban board shows lead name, estimated value, and priority. It does **not** indicate which leads have workflow enabled.

---

## 3. Why Phase 3D Is Complete Enough to Proceed

Phase 3D delivered the analytics surface that exposes the problem (the "Workflow Off" count card). Phase 3E delivers the control surface that solves it. Together they form a closed loop: see → act.

Phase 3D has no open issues blocking Phase 3E. All tests pass (1009/1009), build is clean, and the analytics module is self-contained.

---

## 4. Proposed Phase 3E Scope

**4a — `setWorkflowEnabledAction` server action**
Thin `'use server'` action that calls `leadService.updateLead(ctx, leadId, { workflow_enabled: enabled })`. Validates auth via `buildRequestContext`. Revalidates the lead detail path.

Added to: `modules/crm/actions/lead.actions.ts` (extend existing file — no new file).

**4b — `WorkflowToggle` client component**
Client component on the lead detail page showing:
- Current `workflow_enabled` state as a badge ("Workflow: On" / "Workflow: Off")
- Toggle button: "Enable Workflow" (when disabled) / "Disable Workflow" (when enabled)
- Loading state during action call
- No full page reload — uses router refresh or `revalidatePath`

New file: `app/(workspace)/[workspaceSlug]/leads/[id]/WorkflowToggle.tsx`

**4c — Lead detail page update**
Wire `WorkflowToggle` into the lead detail page header area (below stage/priority line). Pass `lead.id` and `lead.workflow_enabled` as props.

Modified: `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx`

**4d — Workflow status indicator on kanban cards**
Read-only visual indicator on each lead card in the kanban board (`/leads`). A small badge or icon (⚡ or "WF") visible when `workflow_enabled = true`. Helps operators quickly scan which leads are active without navigating to each detail page.

Modified: `app/(workspace)/[workspaceSlug]/leads/page.tsx` (the `LeadCard` function)

**4e — Tests**
~15 new tests using the established source-reading pattern.

---

## 5. What Is Explicitly Out of Scope

| Out of Scope | Reason |
|--------------|--------|
| Bulk workflow enable/disable (select multiple leads) | More complex UI interaction; deferred to v2 |
| Leads list filter by `workflow_enabled` | Requires client-side state or URL param; deferred to v2 |
| Workflow run history per lead | Would require new repo functions and UI panel; separate phase |
| Lead stage transition UI (drag or dropdown) | Stage changes are already handled via `updateLeadStageAction`; a UI for this is a separate concern |
| Lead activity trail (emails sent/opened per lead) | Separate BI concern; separate phase |
| Email scheduling or throttle controls | Separate operational concern |
| Automated workflow trigger on enable | Enabling workflow does not auto-trigger a run — the existing event queue and cron handle dispatch |
| Any changes to Phase 3A, 3B, 3C, or 3D modules | All existing modules remain untouched |
| New DB migrations | `workflow_enabled` column already exists on `leads` |
| Resend calls | Not applicable — toggle is a state-only write |
| External LLM calls | Not applicable |

---

## 6. Relationship to Phases 3A, 3B, 3C, and 3D

| Phase | Relationship |
|-------|-------------|
| **3A** | Phase 3A's `enqueueEvent` and workflow system are what `workflow_enabled` gates. Phase 3E does not modify Phase 3A. |
| **3B** | Phase 3B's outbound pipeline (strategy → copywriting → QRA → HRB → SEB → ET → LA) only runs for leads where `workflow_enabled = true`. Phase 3E adds the missing on-ramp control. Phase 3B.2 imports leads with `workflow_enabled = false` by design; Phase 3E lets operators review and activate those leads. |
| **3C** | Phase 3C's structured error and System Intelligence surface is not involved. |
| **3D** | Phase 3D surfaces the "Workflow Off: N" count in analytics. Phase 3E closes the loop by providing the control surface that lets operators fix it. Analytics page is not modified. |

---

## 7. Proposed Architecture

### Action (server)

```
modules/crm/actions/lead.actions.ts  ← extend existing file
  + setWorkflowEnabledAction(leadId: string, enabled: boolean): Promise<ActionResult>
```

Flow:
1. `buildRequestContext(supabase)` — auth, tenant isolation
2. `leadService.updateLead(ctx, leadId, { workflow_enabled: enabled })` — delegates to existing service; service calls repo; repo enforces `.eq('tenant_id', tenantId)`
3. `revalidatePath(\`/[workspaceSlug]/leads/${leadId}\`, 'page')` — refreshes lead detail
4. `revalidatePath('/[workspaceSlug]/leads', 'page')` — refreshes kanban
5. Return `{ success: true, data: undefined }` or `{ success: false, error: string }`

The action does **not** enqueue a `lead.workflow_enabled_changed` event. Workflow dispatch is handled by the existing cron and event queue — enabling the flag will naturally cause the next cron run to pick up the lead.

### Component (client)

```
app/(workspace)/[workspaceSlug]/leads/[id]/WorkflowToggle.tsx  ← new file
  'use client'
  Props: { leadId: string, initialEnabled: boolean, workspaceSlug: string }
  State: enabled (useState from initialEnabled), loading (useState)
  Behavior: calls setWorkflowEnabledAction; updates local state on success; shows error if failure
```

### Lead detail page (server)

```
app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx  ← modify
  - Pass lead.workflow_enabled and lead.id to WorkflowToggle
  - Render WorkflowToggle below the stage/priority header line
```

### Kanban card (server — read-only indicator)

```
app/(workspace)/[workspaceSlug]/leads/page.tsx  ← modify LeadCard function
  - Show small "WF On" badge when lead.workflow_enabled === true
  - No interaction on kanban card — toggle is on detail page only
```

---

## 8. Data Model Impact

**No new migrations.** `workflow_enabled` (boolean, default `false`) already exists on the `leads` table, is already in `types/database.ts`, and is already used in Phase 3B.2's `insertLead`.

Next available migration number remains `20240032`.

---

## 9. Repository / Service / Module Impact

| File | Change |
|------|--------|
| `modules/crm/actions/lead.actions.ts` | Add `setWorkflowEnabledAction` — ~15 lines, extending existing file |
| `app/(workspace)/[workspaceSlug]/leads/[id]/WorkflowToggle.tsx` | New client component — ~50 lines |
| `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` | Add `WorkflowToggle` import + render — ~5 lines |
| `app/(workspace)/[workspaceSlug]/leads/page.tsx` | Add workflow indicator to `LeadCard` — ~5 lines |
| `tests/phase3e-lead-workflow-control.test.ts` | New test file — ~15 tests |

`modules/crm/services/lead.service.ts` — **not modified.** `updateLead` already accepts `workflow_enabled` as part of `LeadUpdate`.
`modules/crm/repositories/lead.repo.ts` — **not modified.** `updateLead` already handles the field.
All Phase 3A / 3B / 3C / 3D files — **not modified.**

---

## 10. UI Impact

### Lead detail page (`/leads/[id]`)

Current header area:
```
Lead Name
[stage badge] · [priority badge] · [status badge]
```

After Phase 3E:
```
Lead Name
[stage badge] · [priority badge] · [status badge] · [Workflow: On/Off badge]
<WorkflowToggle button>
```

`WorkflowToggle` displays:
- When `workflow_enabled = false`: grey "Workflow: Off" badge + "Enable Workflow" button (primary style)
- When `workflow_enabled = true`: green "Workflow: On" badge + "Disable Workflow" button (outline style)
- Loading: button shows spinner text, disabled
- Error: inline error message below button

### Leads kanban (`/leads`)

Each `LeadCard` card gains a small read-only indicator when `workflow_enabled = true`:
- A small ⚡ or "WF" badge in the card footer area
- No indicator when `workflow_enabled = false` (absence is the signal)

No new routes are added.

---

## 11. Workflow / Runtime Impact

Enabling `workflow_enabled` on a lead does **not** immediately trigger a workflow run. The existing event dispatch cron (`*/30 * * * *`) picks up queued events. The next time `lead.updated` is processed, the workflow engine evaluates `workflow_enabled` and starts the pipeline if conditions are met.

This is intentional: operators enable workflow, then the system processes it on the next scheduled pass (or manual dispatch). No instant-fire behavior is introduced.

---

## 12. Security / RLS Implications

`setWorkflowEnabledAction` uses `buildRequestContext(supabase)` (auth check) and delegates to `leadService.updateLead` which calls `leadRepo.updateLead`. The repo enforces:
- `.eq('id', leadId)` — correct row
- `.eq('tenant_id', tenantId)` — tenant isolation
- `.is('deleted_at', null)` — no soft-deleted leads

`requirePermission(ctx, 'crm.leads.edit')` is checked inside `leadService.updateLead`. An authenticated user without `crm.leads.edit` cannot call the action successfully.

No cross-tenant data access is possible through this path.

---

## 13. Staging / Prod Safety Considerations

| Item | Status |
|------|--------|
| No new migrations | Safe — `workflow_enabled` column already applied to all environments (local, staging, remote dev) |
| Production Vercel | Manual-deploy only — will not auto-deploy Phase 3E |
| Staging Vercel | Auto-deploys from master — will deploy and allow smoke test |
| No Resend calls | Safe |
| No external LLM calls | Safe |
| The toggle only changes `leads.workflow_enabled` | Existing RLS policies on `leads` apply; no new security surface |

---

## 14. Test Strategy

All tests follow the established source-reading pattern from `tests/phase3c-system-intelligence.test.ts` and `tests/phase3d-revenue-analytics.test.ts`. Tests read source files with `fs.readFileSync` and assert expected strings.

**5 describe blocks:**

1. `Phase 3E — setWorkflowEnabledAction: server action correctness` (~5 tests)
2. `Phase 3E — setWorkflowEnabledAction: guardrails` (~3 tests)
3. `Phase 3E — WorkflowToggle: component structure` (~3 tests)
4. `Phase 3E — lead detail page: workflow integration` (~2 tests)
5. `Phase 3E — kanban card: workflow indicator` (~2 tests)

**Estimated test count:** ~15 new tests
**Expected new baseline:** 1009 + 15 = **~1024/1024**

---

## 15. Specific Test Cases

### Block 1 — `setWorkflowEnabledAction: server action correctness` (5 tests)

**Source:** `modules/crm/actions/lead.actions.ts`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Action is a server action | Source contains `'use server'` |
| 2 | Action calls buildRequestContext for auth | Source contains `buildRequestContext` |
| 3 | Action delegates to leadService.updateLead | Source contains `leadService.updateLead` |
| 4 | Action passes workflow_enabled in the update payload | Source contains `workflow_enabled` |
| 5 | Action revalidates the lead detail path | Source contains `revalidatePath` |

### Block 2 — `setWorkflowEnabledAction: guardrails` (3 tests)

**Source:** `modules/crm/actions/lead.actions.ts`

| # | Test | Assertion |
|---|------|-----------|
| 6 | Action does not call Resend or send email | Source does not contain `resend` or `sendEmail` |
| 7 | Action does not call an external LLM | Source does not contain `openai` or `anthropic` |
| 8 | Action does not bypass tenant isolation (delegates to service layer) | Source contains `leadService` rather than a raw supabase call on leads |

### Block 3 — `WorkflowToggle: component structure` (3 tests)

**Source:** `app/(workspace)/[workspaceSlug]/leads/[id]/WorkflowToggle.tsx`

| # | Test | Assertion |
|---|------|-----------|
| 9 | Component is a client component | Source contains `'use client'` |
| 10 | Component calls setWorkflowEnabledAction | Source contains `setWorkflowEnabledAction` |
| 11 | Component accepts workflow_enabled prop (initialEnabled or workflow_enabled) | Source contains `workflow_enabled` or `initialEnabled` |

### Block 4 — `lead detail page: workflow integration` (2 tests)

**Source:** `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx`

| # | Test | Assertion |
|---|------|-----------|
| 12 | Lead detail page imports WorkflowToggle | Source contains `WorkflowToggle` |
| 13 | Lead detail page passes workflow_enabled to toggle | Source contains `workflow_enabled` |

### Block 5 — `kanban card: workflow indicator` (2 tests)

**Source:** `app/(workspace)/[workspaceSlug]/leads/page.tsx`

| # | Test | Assertion |
|---|------|-----------|
| 14 | Lead kanban page references workflow_enabled for display | Source contains `workflow_enabled` |
| 15 | Lead kanban page does not call setWorkflowEnabledAction (read-only) | Source does not contain `setWorkflowEnabledAction` |

---

## 16. Risks and Open Questions

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Operator enables workflow for a lead that has no valid contact email | Medium | Workflow engine already handles missing email gracefully (existing Phase 3B behavior); the toggle does not change this guard |
| Race condition: lead updated by two operators simultaneously | Low | Postgres `UPDATE ... WHERE id = ? AND tenant_id = ?` is atomic; last write wins, which is acceptable |
| Kanban performance: `workflow_enabled` is an additional field fetched | Negligible | `listLeads` already selects `*`; no additional query needed |

### Open Questions

| Question | Proposed Default | Impact if Wrong |
|----------|-----------------|-----------------|
| Should enabling workflow immediately dispatch `dispatchPendingEvents()`? | No — rely on existing cron; consistent with how other lead actions work | If no cron is running, operator may wait up to 30 minutes for the first workflow step. Acceptable in v1. |
| Should `setWorkflowEnabledAction` emit an activity event (`WORKFLOW_ENABLED`, `WORKFLOW_DISABLED`)? | No in v1 — action delegates to `updateLead` which emits `lead.updated`. A dedicated event type adds overhead without immediate value. | No event trail for workflow enable/disable. Acceptable in v1. |
| Should the kanban card indicator be interactive (click to toggle)? | No — toggle only on detail page. Avoids unexpected state changes from the list view. | Operator must navigate to detail page to toggle. Acceptable. |
| Should disabling workflow cancel any in-progress drafts? | No — existing draft/approval state is preserved. The flag gates future pipeline entries only. | Drafts already created remain in place after disable. Acceptable in v1. |

---

## 17. Approval Checkpoint

**Do not start implementation until this design is explicitly approved.**

After approval, proceed to: **Phase 3E Implementation Plan**.

### Decisions requiring user input before implementation:

| Decision | Proposed Default |
|----------|-----------------|
| Confirm scope: toggle only on detail page (no bulk) | Yes |
| Confirm indicator on kanban cards | Yes — read-only badge |
| Confirm no immediate `dispatchPendingEvents()` on enable | Yes — rely on cron |
| Confirm no dedicated activity event type for toggle | Yes — `lead.updated` is sufficient |
| Confirm no new migration | Yes — `workflow_enabled` column already exists |
| Confirm expected test count: ~15 new tests | Yes |
| Confirm expected new baseline: ~1024/1024 | Yes |
