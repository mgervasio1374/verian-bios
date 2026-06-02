# Phase 3S — Proposal Follow-Up Draft Generation Lock Report

**Status:** QA complete — pending final Codex review before tag
**Created:** 2026-06-02
**Predecessor:** Phase 3R — Controlled Proposal Follow-Up Mutations (locked)
**Phase 3R lock tag:** `phase-3r-controlled-follow-up-mutations-v1` → `cf868ca42c181574d9962e0b24559393609b86f6`
**origin/master at report time:** `12d82acda4a65d937194c3fc4dc8e89c06c4f42d`

---

## 1. Executive Summary

Phase 3S added a controlled, human-review-gated proposal follow-up draft generation path to the existing Phase 3R queue foundation. Operators can now initiate draft email generation for open proposal follow-up commitments from the queue UI. Generated drafts are stored as `email_drafts` rows in `pending_approval` status, linked to the originating commitment via a dual-link model, and routed to the approval queue.

**Phase 3S did not:**
- Send emails
- Enable campaign sending
- Add automation or background jobs
- Mutate commitment status
- Mutate proposal status
- Add LLM generation (template path only)
- Add a send control of any kind

Sending remains future-only and requires a separate Phase 3T design, `EMAIL_SENDING_ENABLED`, and a separate send path review.

---

## 2. Scope Completed

| Slice | Description | Type |
|-------|-------------|------|
| Slice 1 | Follow-up draft generation design | Documentation |
| Slice 2 | Implementation plan | Documentation |
| Slice 3 | Template-path backend (repository, service, action) | Code |
| Slice 4 | Generate Draft UI control + queue wiring + DTO | Code |
| Slice 5 | QA and lock report (this document) | Documentation |

---

## 3. Phase 3S Commits

| Hash | Message |
|------|---------|
| `3e73e3a` | Docs: add Phase 3S follow-up draft generation design |
| `332a58e` | Docs: add Phase 3S Slice 2 implementation plan |
| `b08d147` | Phase 3S: add proposal follow-up draft generation backend |
| `12d82ac` | Phase 3S: add proposal follow-up draft UI control |

---

## 4. Files Added or Modified

### Documentation

| File | Description |
|------|-------------|
| `docs/roadmap/phase-3s-follow-up-draft-generation-design.md` | Phase 3S design doc (Slice 1) |
| `docs/roadmap/phase-3s-slice-2-follow-up-draft-generation-implementation-plan.md` | Implementation plan with dual-link decision (Slice 2) |
| `docs/roadmap/phase-3s-follow-up-draft-generation-lock-report.md` | This file |

### Backend

| File | Change | Description |
|------|--------|-------------|
| `modules/proposals/repositories/proposal-follow-up-draft.repo.ts` | New | `createFollowUpEmailDraft`, `linkDraftToCommitment`, `getActiveDraftForCommitment`, `fetchCommitmentForDraftGeneration` |
| `modules/proposals/services/proposal-follow-up-draft.service.ts` | New | `generateProposalFollowUpDraftForWorkspace` — validation, duplicate detection, template path, approval request, audit |
| `modules/proposals/actions/proposal-follow-up-draft.actions.ts` | New | `generateFollowUpDraftAction` — `'use server'`, permission gate, ActionResult |
| `modules/intelligence/types.agent.ts` | Modified | Added `PROPOSAL_FOLLOW_UP_DRAFT_CREATED`, `PROPOSAL_FOLLOW_UP_DRAFT_GENERATION_FAILED` |
| `modules/messaging/drafts/draft-source.constants.ts` | Modified | Added `FUTURE_FOLLOW_UP` badge entry `{ label: 'Follow-Up', colorClass: 'bg-purple-100 text-purple-700' }` |

### Queue / Read Model

| File | Change | Description |
|------|--------|-------------|
| `modules/proposals/repositories/proposal-follow-up-commitments.repo.ts` | Modified | Added `draft_id: string | null` to `ProposalFollowUpQueueItem` interface and mapper |

### UI

| File | Change | Description |
|------|--------|-------------|
| `app/(workspace)/[workspaceSlug]/proposal-follow-ups/GenerateFollowUpDraftButton.tsx` | New | Client component — 6-state machine with in-flight guard, warning display, manual refresh |
| `app/(workspace)/[workspaceSlug]/proposal-follow-ups/page.tsx` | Modified | Added `GenerateFollowUpDraftButton` import and row usage inside `canMutate` block |

### Tests

| File | Change | Tests |
|------|--------|-------|
| `tests/phase3s-proposal-follow-up-draft.test.ts` | New | 89 tests (TC-3S-001–089) — backend repo/service/action/constants/safety/Codex fixes |
| `tests/phase3s-follow-up-draft-ui.test.ts` | New | 49 tests (TC-3S-UI-001–044 + 016b–016e + 020b) — UI component, queue wiring, DTO, safety guardrails |

---

## 5. Data Model and Link Model

### Dual-link model (no migration required)

Phase 3S implements a dual-link approach for connecting `email_drafts` to `proposal_follow_up_commitments`:

| Direction | Field | Value |
|-----------|-------|-------|
| Forward (draft → commitment) | `email_drafts.subject_type` | `'proposal_follow_up_commitment'` |
| Forward (draft → commitment) | `email_drafts.subject_id` | `commitmentId` |
| Back-link (commitment → draft) | `proposal_follow_up_commitments.draft_id` | `draftId` |

**No migration was needed.** `proposal_follow_up_commitments.draft_id` was introduced as a pre-planned nullable FK to `email_drafts(id)` in migration `20240038_phase3n_proposal_capture.sql` (ON DELETE SET NULL). `email_drafts.subject_type` and `subject_id` have been nullable columns since migration `20240006_messaging.sql`.

### Back-link write safety

`linkDraftToCommitment` enforces:
- Scoped by `(id, tenant_id, workspace_id)`
- Uses `.is('draft_id', null)` — will not overwrite an existing `draft_id`
- Returns `false` if no row was updated (already linked — safe no-op for retry scenarios)

### Duplicate detection order

Before any draft write, the service checks:
1. `commitment.draft_id` — direct back-link from the commitment row
2. `getActiveDraftForCommitment` — forward subject-link query (`subject_type = 'proposal_follow_up_commitment'`, `subject_id = commitmentId`) in active statuses (`draft`, `pending_approval`, `approved`)

Both checks run before draft creation. If either finds an active draft, the service returns `{ ok: false, error: 'draft_already_exists', existingDraftId }`.

---

## 6. Backend Behavior

### Repository (`proposal-follow-up-draft.repo.ts`)

- `createFollowUpEmailDraft` inserts `email_drafts` with:
  - `status = 'pending_approval'`
  - `generated_by_ai = false`
  - `source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP` (`'future_follow_up'`)
  - `subject_type = 'proposal_follow_up_commitment'`, `subject_id = commitmentId`
  - `created_by = actorUserId`
- Does NOT create `email_sends` rows
- Does NOT call Resend, Inngest, or any LLM provider
- Does NOT call `recordActivityEvent` (audit belongs to service layer)
- Does NOT call `requirePermission` (permission belongs to action layer)
- `getActiveDraftForCommitment` and `fetchCommitmentForDraftGeneration` **throw** on Supabase read errors — fail closed, not silently null

### Service (`proposal-follow-up-draft.service.ts`)

Template path only. LLM generation is deferred to a future slice.

**Schedule rule key → template:** All four real `schedule_rule_key` values (`standard_3_5_10`, `aggressive_2_4_7`, `light_5_14`, `single_7`) are timing variants of proposal follow-up and all map to the `email_proposal_follow_up` template slug.

**Processing order (validation before writes):**
1. Fetch commitment (fail closed on read error → `read_failed`)
2. Check `commitment_status = 'open'`
3. Dual duplicate check (fail closed on read error → `read_failed`)
4. Load lead + verify `lead.workspace_id === workspaceId`
5. Load contact + verify `contact.workspace_id === workspaceId`
6. Check `contact.email`, `do_not_contact`, suppression
7. Load template (`email_proposal_follow_up`)
8. Load sender identity
9. Render template variables
10. **Point of no return:** `createFollowUpEmailDraft`
11. `linkDraftToCommitment` (non-fatal — partial state recoverable via subject link)
12. `createApprovalRequest` + `linkApprovalToEmailDraft` (partial-success if fails)
13. `recordActivityEvent` (partial-success if fails)

### Action (`proposal-follow-up-draft.actions.ts`)

- `'use server'`
- `requirePermission(ctx, 'crm.leads.edit')` — matches Phase 3R permission gate
- Validates `commitmentId` presence
- Does NOT reference `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- Does NOT call `recordActivityEvent` directly
- Does NOT import Resend, Inngest, OpenAI, or Anthropic

---

## 7. Eligibility and Safety Checks

| Check | Failure result |
|-------|---------------|
| Commitment belongs to `(tenant_id, workspace_id, id)` | `not_found` |
| Read error on commitment fetch | `read_failed` (fail closed) |
| `commitment_status = 'open'` | `commitment_not_open` |
| `commitment.draft_id` is null | `draft_already_exists` (with `existingDraftId`) |
| Subject-link active draft absent | `draft_already_exists` (with `existingDraftId`) |
| Read error on subject-link check | `read_failed` (fail closed) |
| Lead exists | `lead_not_found` |
| `lead.workspace_id === workspaceId` | `lead_not_found` |
| Contact exists | `no_contact_linked` |
| `contact.workspace_id === workspaceId` | `no_contact_linked` |
| Contact has email | `no_contact_email` |
| `contact.do_not_contact = false` | `contact_do_not_contact` |
| Email not suppressed | `suppressed` |
| Template `email_proposal_follow_up` exists | `no_template_found` |
| Draft insert succeeds | `write_failed` |

All validation runs before any write. Workspace scope is explicitly validated for both lead and contact, not inferred from tenant-only repository helpers.

---

## 8. Approval / Audit Partial-Success Behavior

After the draft insert succeeds (step 10, point of no return), subsequent failures return `ok: true` with a `warning` field so the caller always receives the `draftId`. Returning `ok: false` after a successful insert would hide the draft behind future duplicate detection, making user recovery impossible.

| Failure | Service result |
|---------|---------------|
| `createApprovalRequest` throws | `{ ok: true, draftId, approvalRequestId: null, approvalLinked: false, warning: 'approval_request_failed' }` |
| `linkApprovalToEmailDraft` throws | `{ ok: true, draftId, approvalRequestId: <id>, approvalLinked: false, warning: 'approval_link_failed' }` |
| `recordActivityEvent` throws | `{ ok: true, draftId, approvalRequestId, approvalLinked, warning: 'audit_failed' }` |

Human review is preserved in all three cases because draft `status = 'pending_approval'` and no send path exists regardless of approval wiring state.

The action surfaces `warning` in its `ActionResult.data.warning` field. The UI `GenerateFollowUpDraftButton` displays these warnings distinctly from clean success, preserving them until the operator manually refreshes the queue.

---

## 9. UI Behavior

### `GenerateFollowUpDraftButton`

Located at: `app/(workspace)/[workspaceSlug]/proposal-follow-ups/GenerateFollowUpDraftButton.tsx`

**State machine:** idle → confirming → loading → success / warning / error

| State | Display |
|-------|---------|
| idle | "Generate Draft" button |
| confirming | Confirmation + "This creates a draft for review. It does not send an email." |
| loading | "Generating…" + spinner |
| success | "Draft Created" (green) + `router.refresh()` |
| warning | "Draft Created — Needs Review Setup" + amber warning message + "Refresh queue" button |
| error | Red error message + "Dismiss" |

**Warning messages:**

| Warning code | Message |
|---|---|
| `approval_request_failed` | "Draft created, but approval request setup failed. Review queue may need attention." |
| `approval_link_failed` | "Draft created, but approval request was not linked to the draft. Review queue may need attention." |
| `audit_failed` | "Draft created, but audit logging failed. The draft is recoverable." |

**Warning refresh behavior:** `router.refresh()` is NOT called automatically in the warning branch — the warning state persists for the operator to read. A "Refresh queue" button is provided that calls only `router.refresh()` and no other action.

**In-flight guard:** `useRef(false)` (`inFlightRef`) prevents synchronous double-submit before React re-renders. Combined with `useTransition` for async protection. `inFlightRef.current` is reset to `false` in a `finally` block.

**Existing draft indicator:** If `existingDraftId` prop is non-null, renders a read-only "Draft Exists" indicator instead of the active button.

### Queue page wiring

- `GenerateFollowUpDraftButton` is rendered inside the existing `canMutate` block, alongside Complete / Skip / Reschedule.
- Receives `commitmentId={item.id}` and `existingDraftId={item.draft_id}`.
- `ProposalFollowUpQueueItem.draft_id` added to the DTO and mapper (was absent; query already used `select('*')` so no SQL change was needed).
- Complete / Skip / Reschedule controls are unchanged.
- No Send control was added. No send language was added.

---

## 10. QA Results

All commands run at `origin/master = 12d82acda4a65d937194c3fc4dc8e89c06c4f42d`.

### Git state

```
(clean before creating this lock report)

12d82ac Phase 3S: add proposal follow-up draft UI control
b08d147 Phase 3S: add proposal follow-up draft generation backend
332a58e Docs: add Phase 3S Slice 2 implementation plan
3e73e3a Docs: add Phase 3S follow-up draft generation design
cf868ca Docs: add Phase 3R controlled follow-up mutations lock report
c471bf2 Phase 3R: polish follow-up queue mutation controls
8bfb58a Phase 3R: add reschedule follow-up UI control
0988c68 Phase 3R: add reschedule follow-up action
9a73647 Phase 3R: add reschedule follow-up service audit
e1dfdd8 Phase 3R: add reschedule follow-up repository mutation
```

### Targeted tests

| Suite | Result |
|-------|--------|
| `tests/phase3s-proposal-follow-up-draft.test.ts` | **89 / 89 passing** |
| `tests/phase3s-follow-up-draft-ui.test.ts` | **49 / 49 passing** |

### Focused regression (Phase 3Q + 3R + 3S)

| Suite | Result |
|-------|--------|
| `tests/phase3q-proposal-follow-up-queue-ui.test.ts` | Passing |
| `tests/phase3r-proposal-follow-up-mutations.test.ts` | Passing |
| `tests/phase3s-proposal-follow-up-draft.test.ts` | Passing |
| `tests/phase3s-follow-up-draft-ui.test.ts` | Passing |
| **Total** | **527 / 527 passing** |

### Broader full suite (`npx vitest run`)

**2554 / 2555 passing.** One pre-existing failure unrelated to Phase 3S:

- `tests/phase3k-unified-draft-send-path.test.ts` — TC-3K-030 (`sets sourceAssetId to input.assetId`) — pre-existing, not introduced by Phase 3S.

### Type check (`npx tsc --noEmit`)

No new TypeScript errors introduced by Phase 3S. Known pre-existing failures only:
- `tests/phase3h-send-safety-hardening.test.ts` — regex flag issue (pre-Phase 3R)
- `tests/quality-review-agent.test.ts` — duplicate property issue (pre-Phase 3R)

---

## 11. Source-Reading Test Coverage

### `tests/phase3s-proposal-follow-up-draft.test.ts` (89 tests, TC-3S-001–089)

Covers:

| Area | Tests |
|------|-------|
| Repository existence, exports, subject_type/subject_id assignment | TC-3S-001–018 |
| Service existence, commitment/duplicate checks, workspace validation | TC-3S-019–041 |
| Action existence, use server, permission, input validation, error mapping | TC-3S-042–055 |
| ActivityEventType constants, DRAFT_SOURCE_BADGE | TC-3S-056–059 |
| Safety: no email_sends, no Resend, no Inngest, no LLM, no status mutation | TC-3S-060–070 |
| Codex fix: workspace validation ordering | TC-3S-071–076 |
| Codex fix: approval partial-success (ok:true with warning) | TC-3S-077–083 |
| Codex fix: fail-closed read errors | TC-3S-084–089 |

### `tests/phase3s-follow-up-draft-ui.test.ts` (49 tests, TC-3S-UI-001–044 + extras)

Covers:

| Area | Tests |
|------|-------|
| Component existence, use client, import patterns, exports | TC-3S-UI-001–006 |
| State machine text: Generate Draft, Generating, Draft Created, Draft Exists | TC-3S-UI-007–010 |
| Warning states: all three warning codes and messages | TC-3S-UI-011–013 |
| Error state with dismiss | TC-3S-UI-014 |
| Confirmation text: no send language | TC-3S-UI-015 |
| router.refresh() placement (clean success only; not in warning) | TC-3S-UI-016, 016b, 016c |
| Refresh queue button presence and exclusivity | TC-3S-UI-016d, 016e |
| No Send controls | TC-3S-UI-017 |
| No direct repo/service import | TC-3S-UI-018 |
| No forbidden library imports | TC-3S-UI-019 |
| useTransition + useRef in-flight guard | TC-3S-UI-020, 020b |
| Warning state stores draftId | TC-3S-UI-021 |
| Warning amber styling (distinct from error red) | TC-3S-UI-022 |
| Warning heading and confirmation copy | TC-3S-UI-023–025 |
| Queue page: GenerateFollowUpDraftButton import and usage | TC-3S-UI-026–029 |
| Phase 3R controls still present | TC-3S-UI-030 |
| No send references in page | TC-3S-UI-031–032 |
| canMutate still gates all mutation controls | TC-3S-UI-033 |
| Queue DTO: draft_id in interface, mapper, no mutation | TC-3S-UI-034–038 |
| Safety guardrails across files | TC-3S-UI-039–044 |

---

## 12. Guardrails Confirmed

| Guardrail | Status |
|-----------|--------|
| No migrations created | ✓ — `draft_id` pre-existed in migration 20240038 |
| No migrations applied to any environment | ✓ |
| Production untouched | ✓ |
| Vercel settings unchanged | ✓ |
| `EMAIL_SENDING_ENABLED` disabled | ✓ |
| `CAMPAIGN_SENDING_ENABLED` disabled | ✓ |
| No emails sent | ✓ |
| No campaign sending | ✓ |
| No automation or background jobs | ✓ |
| No Inngest | ✓ |
| No Resend | ✓ |
| No LLM / OpenAI / Anthropic | ✓ |
| No proposal status mutation | ✓ |
| No commitment `commitment_status` mutation from draft path | ✓ |
| Complete / Skip / Reschedule behavior unchanged | ✓ |
| Phase 3R lock tag untouched | ✓ |
| No Phase 3S tag created yet | ✓ (pending final Codex review) |

---

## 13. Known Limitations and Carry-Forward Notes

1. **Component interaction tests:** Source-reading tests verify the `useRef` in-flight guard (`TC-3S-UI-020b`), but runtime interaction coverage (e.g., Testing Library fast double-click simulation) would more robustly lock down actual click-sequence behavior. This is deferred to a future component-test layer.

2. **Sending remains future-only:** Phase 3S creates `pending_approval` drafts only. Any send path requires Phase 3T design, `EMAIL_SENDING_ENABLED` = true, a separate approval → send bridge, and an explicit decision record. These must not be added without a separate design document.

3. **Warning state operational follow-up:** If `approval_request_failed` or `approval_link_failed` warnings are encountered in production, the draft exists in `pending_approval` but has no linked approval request. Operator may need to manually create or re-link an approval request, or a future repair path should be built.

4. **LLM generation path not implemented:** Phase 3S is template path only. A future LLM generation path must be explicitly gated behind `EMAIL_GENERATION_ENGINE = true`, an active `ai_budget_policy`, and per-request budget enforcement via `ai-budget-enforcer.service.ts`. It must not be added without a separate design document and Codex review.

5. **Phase 3S does not complete commitments:** Generating a draft does not change `commitment_status`. Operators must still use Complete, Skip, or Reschedule explicitly from the Phase 3R controls.

6. **Single template slug:** All four schedule rule keys (`standard_3_5_10`, `aggressive_2_4_7`, `light_5_14`, `single_7`) map to `email_proposal_follow_up`. If per-cadence templates are needed in the future, the `FOLLOW_UP_TEMPLATE_SLUG` constant and mapping logic in the service must be updated.

---

## 14. Lock Recommendation

Phase 3S is implementation-complete and QA-verified. Test results, guardrails, and behavioral documentation are all confirmed.

**Recommended next step:** Submit this lock report for final Codex review.

If final Codex review passes, create and push an annotated lock tag:

```
phase-3s-follow-up-draft-generation-v1
```

pointing to `12d82acda4a65d937194c3fc4dc8e89c06c4f42d`.

**The tag must not be created until final Codex review confirms PASS.**

After the Phase 3S tag is confirmed, the options are:

| Option | Description | Prerequisite |
|--------|-------------|-------------|
| **A** | Create and push Phase 3S lock tag | Final Codex review PASS |
| **B** | Start Phase 3T approved send path design | Phase 3S locked; separate design doc required; `EMAIL_SENDING_ENABLED` decision record required |
| **C** | Start LLM generation path (Phase 3S extension) | `EMAIL_GENERATION_ENGINE` decision; budget policy configuration; separate Codex review |
| **D** | Implement Reopen commitment action | Requires decision from Phase 3R implementation plan open question 2 |
| **E** | Apply production migration 20240039 | Requires separate operator decision and explicit approval |
| **F** | Defer all of the above | Phase 3S stands complete on local/remote-dev |
