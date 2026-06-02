# Phase 3S — Proposal Follow-Up Draft Generation Design

**Status:** Design only — no implementation started
**Created:** 2026-06-02
**Predecessor:** Phase 3R — Controlled Proposal Follow-Up Mutations (locked)
**Phase 3R lock tag:** `phase-3r-controlled-follow-up-mutations-v1` → `cf868ca42c181574d9962e0b24559393609b86f6`

---

## 1. Purpose

Phase 3S designs a safe, human-review-gated path for generating proposal follow-up message drafts. It builds directly on the Phase 3R mutation foundation and does not replace it.

**This document is design only. It does not:**
- Implement draft generation code
- Create or apply any database migrations
- Make any code changes
- Create or push any tags
- Send emails or create automation
- Touch production

**This phase, when implemented, will not:**
- Send email
- Create or trigger campaign sending
- Add background automation or Inngest jobs
- Auto-generate drafts without operator action
- Bypass human review
- Modify proposal status

---

## 2. Phase 3R Foundation

| Item | Value |
|------|-------|
| Lock tag | `phase-3r-controlled-follow-up-mutations-v1` |
| Lock tag target | `cf868ca42c181574d9962e0b24559393609b86f6` |
| Focused test suite | 995 / 995 passing at lock |
| Foundation | Follow-up queue, Complete/Skip/Reschedule mutations, permission-aware UI, service-layer audit |

### Phase 3R locked mutation stack

```
proposal_follow_up_commitments (DB — migrations 20240038, 20240039)
    ↓
proposal-follow-up-mutations.repo.ts
  completeFollowUpCommitment / skipFollowUpCommitment / rescheduleFollowUpCommitment
    ↓
proposal-follow-up-mutations.service.ts
  …ForWorkspace (recordActivityEvent at service layer)
    ↓
proposal-follow-up-mutations.actions.ts (requirePermission crm.leads.edit)
    ↓
CompleteFollowUpButton / SkipFollowUpButton / RescheduleFollowUpButton
  (canMutate — permission-aware, hidden for users without crm.leads.edit)
```

Phase 3S adds a **Generate Draft** path alongside this stack. It does not replace Complete, Skip, or Reschedule.

### Active safety constraints carried forward from Phase 3R

- `EMAIL_SENDING_ENABLED` remains disabled
- `CAMPAIGN_SENDING_ENABLED` remains disabled
- No Inngest/background automation
- No LLM calls in any follow-up module file unless explicitly authorized per slice
- No production migration unless separately approved
- Migration 20240039 applied locally and remote-dev only; production still requires separate explicit approval

---

## 3. Non-Goals for Phase 3S Slice 1 (This Document)

Phase 3S Slice 1 does not implement:

- Draft generation code of any kind
- LLM or AI provider calls
- Email sending via Resend or any other provider
- Campaign sending
- Inngest event enqueueing or background jobs
- New database migrations
- New server actions, services, or repositories
- Send controls in the UI
- Approval bypass
- Proposal status mutation behavior
- New UI components
- Token budget enforcement
- Production migration

---

## 4. Draft Lifecycle Principles

Draft generation must produce a human-reviewable artifact, not a sent message.

### Lifecycle stages (using existing project terminology)

```
[ draft ] → [ pending_approval ] → [ approved ] → (send path — future Phase 3T)
                                 ↘ [ rejected ]   → operator can regenerate or discard
```

The project already uses `pending_approval` in `EDITABLE_EMAIL_DRAFT_STATUSES`:

```typescript
// modules/messaging/constants/email-draft-status.ts
export const EDITABLE_EMAIL_DRAFT_STATUSES = ['draft', 'pending_approval', 'rejected'] as const
```

**Do not introduce `pending_review`** unless a deliberate schema/lifecycle decision is made in a future slice. The existing `pending_approval` terminology is the authoritative project lifecycle stage. All Phase 3S design and implementation must use `pending_approval` as the post-generation holding state.

### Key principles

1. Draft generation creates a reviewable draft artifact only.
2. Approval is a distinct step from generation.
3. Sending is future work (Phase 3T) and requires `EMAIL_SENDING_ENABLED` plus a separate design document.
4. No draft can be sent without a separate, explicitly designed send path.
5. The generation operation itself must be idempotent-safe: calling it twice should either update the existing draft or create a new version, not silently duplicate.

---

## 5. Recommended Data Model Direction

### Existing infrastructure

The project already has a fully capable `email_drafts` table (migration `20240006_messaging.sql`) with:

| Column | Purpose |
|--------|---------|
| `id`, `tenant_id`, `workspace_id` | Scoping |
| `subject_type`, `subject_id` | Polymorphic entity linking |
| `status` | Lifecycle stage (`draft`, `pending_approval`, `rejected`, etc.) |
| `approval_request_id` | Links to `approval_requests` table |
| `generated_by_ai`, `ai_generation_metadata` | AI generation provenance |
| `lead_id`, `company_id`, `contact_id` | CRM cross-links |
| `body_html`, `body_text`, `subject` | Draft content |
| `template_id` | Optional template origin |

The `approval_requests` table (`20240012`) has `request_type`, `status`, `subject_type`, `subject_id`, and `payload` — sufficient for a `'proposal_follow_up_draft_review'` request type.

### Recommended linking approach

**Option A (preferred): polymorphic `subject_type`/`subject_id`**

Store `email_drafts` rows with:
```
subject_type = 'proposal_follow_up_commitment'
subject_id   = <commitment UUID>
```

This requires no migration. The `email_drafts` table already supports this pattern via its `subject_type`/`subject_id` columns. The draft also carries `lead_id`, `workspace_id`, and `tenant_id` for direct cross-links.

**Option B: dedicated FK column**

Add `proposal_follow_up_commitment_id uuid NULL REFERENCES proposal_follow_up_commitments(id)` to `email_drafts`. This is safer for query performance and referential integrity, but requires a migration.

**Recommendation:** Start with Option A (no migration) in Phase 3S. If query patterns or foreign-key integrity requirements emerge during implementation, a targeted migration (Phase 3S Slice 3) can add the FK column without changing the draft creation logic.

### Draft linked fields for a follow-up draft

| Field | Source |
|-------|--------|
| `tenant_id` | `ctx.tenantId` |
| `workspace_id` | `ctx.workspaceId` |
| `subject_type` | `'proposal_follow_up_commitment'` |
| `subject_id` | `commitmentId` |
| `lead_id` | Fetched from commitment row |
| `company_id` | Fetched from lead record |
| `contact_id` | Fetched from lead record |
| `status` | `'pending_approval'` immediately post-generation |
| `generated_by_ai` | `true` if LLM path; `false` if template path |
| `ai_generation_metadata` | Model, prompt config, token usage if LLM |
| `created_by` | `ctx.userId` |

---

## 6. Recommended Permission Model

| Operation | Permission | Notes |
|-----------|-----------|-------|
| View follow-up queue | `crm.leads.view` | Existing queue page |
| Complete / Skip / Reschedule | `crm.leads.edit` | Phase 3R server actions |
| Generate draft | `crm.leads.edit` (initial) | Same scope as mutation controls; upgrade to a messaging-specific permission if distinct roles emerge |
| View existing draft | `crm.leads.view` or `crm.leads.edit` | TBD based on product requirements |
| Approve draft | `workflow.approve_requests` (if using approval bridge) or `crm.leads.edit` | Matches existing HRB approval pattern |
| Reject draft | Same as approve | |
| Send (future Phase 3T) | `messaging.send_emails` | Must remain separate from generation; do not conflate |

**Guardrail:** Draft generation permission must not imply send permission. The action that generates a draft must enforce only the generation permission. The (future) send action must enforce `messaging.send_emails` independently.

---

## 7. Generation Strategy: Cost-Controlled Model

Verian should avoid writing every individual follow-up from scratch with an LLM. The recommended generation path uses a cost-controlled decision tree:

```
1. Check for approved reusable follow-up template for this commitment's schedule rule key
   ├─ Found → merge lead/proposal variables into template → create draft (status: pending_approval)
   │          generated_by_ai = false / template_id = <matched template>
   └─ Not found
       ├─ EMAIL_GENERATION_ENGINE = false → return { ok: false, error: 'no_template_and_generation_disabled' }
       └─ EMAIL_GENERATION_ENGINE = true AND operator explicitly requested LLM generation
           → check ai-budget-policy and ai-budget-enforcer
           ├─ Budget exceeded → return { ok: false, error: 'budget_exhausted' } — notify operator
           └─ Budget available → generate with LLM → create draft (status: pending_approval)
                                 generated_by_ai = true / ai_generation_metadata = { model, tokens, ... }
```

### Key controls

| Control | Mechanism |
|---------|-----------|
| `EMAIL_GENERATION_ENGINE` | `SystemControlKey` — gates LLM generation path |
| `REQUIRE_MESSAGE_APPROVAL` | `SystemControlKey` — should always be `true` for follow-up drafts |
| AI budget | `ai-budget-enforcer.service.ts` / `ai-budget-policy.repo.ts` (existing infrastructure) |
| AI usage logging | `ai-usage-event.repo.ts` / `ai-budget-event.repo.ts` (existing infrastructure) |

### Template path (preferred, low cost)

1. Look up a follow-up template for the commitment's `schedule_rule_key` (or a workspace default).
2. Merge variables: contact name, proposal name, sent date, follow-up sequence number.
3. Create `email_drafts` row with `template_id`, `generated_by_ai = false`, `status = 'pending_approval'`.
4. No LLM call, no token cost.

### LLM path (explicit, budget-aware)

1. Operator explicitly requests LLM generation (button / flag on the generate action).
2. System checks `EMAIL_GENERATION_ENGINE` system control.
3. System checks `ai-budget-enforcer` — stop if exhausted, log to `ai-budget-event`.
4. Load lead context: lead record, proposal event record, prior follow-up history, company/contact data.
5. Invoke LLM. Log to `ai-usage-event`.
6. Create `email_drafts` row with `generated_by_ai = true`, `ai_generation_metadata = { model, promptTokens, completionTokens, promptConfigId }`, `status = 'pending_approval'`.
7. Optionally create a draft version in `email-draft-version.repo` for quality scoring (future).

---

## 8. Token and Budget Considerations

### Token-consuming operations (future)

| Operation | Token cost | Existing infrastructure |
|-----------|-----------|------------------------|
| LLM draft generation | High | `ai-usage-event.repo.ts`, `ai-budget-enforcer.service.ts` |
| Rewrite request | Medium | `email-draft-version.repo.ts`, rewrite loop |
| Quality scoring/review | Low–Medium | `email-draft-metrics.service.ts` |
| Personalization enrichment | Low | Merge variables only (template path = zero) |

### Recommendations for future phases

1. **Budget stop before generation:** Check `ai-budget-enforcer` before every LLM call. If budget is exhausted, return a typed error and surface it to the operator. Do not silently degrade to an empty draft.
2. **Usage logging:** Every LLM generation call must log to `ai-usage-event` with `entity_type = 'proposal_follow_up_commitment'`, `entity_id = commitmentId`.
3. **Token board (future):** Do not implement a usage dashboard in Phase 3S. Note it as a future Phase 3U or operations tooling requirement.
4. **No mass generation:** Do not add a "generate all drafts" control without a separate design document and explicit budget controls.
5. **Template-first:** The template path has zero token cost. Default to it. LLM path should require an explicit operator action or be behind a separate UI control.

---

## 9. Draft Generation Workflow (Future Implementation)

This describes the intended future operator flow. Nothing below is implemented in Phase 3S Slice 1.

```
Operator views the follow-up queue (/proposal-follow-ups)
    ↓
Operator selects an open commitment row
    ↓
Operator clicks "Generate Draft" (gated: crm.leads.edit + open commitment + no existing active draft)
    ↓
generateFollowUpDraftAction (server action — 'use server', requirePermission crm.leads.edit)
    ├─ Validate commitmentId
    ├─ Fetch commitment (tenant/workspace scope, status = 'open' check)
    ├─ Determine generation path (template vs LLM)
    └─ Call generateFollowUpDraftForWorkspace (service)
          ├─ Template path → build draft from template + merge vars
          ├─ LLM path → budget check → generate → log usage
          ├─ Create email_drafts row (subject_type='proposal_follow_up_commitment', subject_id=commitmentId, status='pending_approval')
          ├─ Optionally create approval_requests row (request_type='proposal_follow_up_draft_review')
          ├─ recordActivityEvent PROPOSAL_FOLLOW_UP_DRAFT_CREATED
          └─ Return { ok: true, draftId }
    ↓
Queue row shows "Draft pending approval" indicator
    ↓
Approver reviews draft in draft review UI (existing or future)
    ↓
Draft approved (status → 'approved') — NO EMAIL SENT IN PHASE 3S
    ↓
Future Phase 3T adds send path with EMAIL_SENDING_ENABLED check
```

### Idempotency

If an `email_draft` with `subject_type = 'proposal_follow_up_commitment'` and `subject_id = commitmentId` already exists in an editable status (`draft`, `pending_approval`, `rejected`), the generate action should:
- Return the existing draft ID with a `{ ok: true, draftId, alreadyExists: true }` response, or
- Allow regeneration (creating a new draft version) if the operator explicitly requests it.

Do not silently create duplicate open drafts for the same commitment.

---

## 10. Activity / Audit Model

Draft generation events should be recorded in `activity_events` at the **service layer only** — not in the repository, not in the action.

### Proposed future event types (to be added to `ActivityEventType` when implemented)

```typescript
// Phase 3S — Proposal Follow-Up Draft Generation (future, additive)
PROPOSAL_FOLLOW_UP_DRAFT_CREATED:            'proposal_follow_up_draft_generation_created',
PROPOSAL_FOLLOW_UP_DRAFT_GENERATION_FAILED:  'proposal_follow_up_draft_generation_failed',
PROPOSAL_FOLLOW_UP_DRAFT_APPROVAL_REQUESTED: 'proposal_follow_up_draft_approval_requested',
```

These follow the existing Phase 3N/3R naming convention (`PROPOSAL_FOLLOW_UP_*`).

### Event properties (proposed)

`PROPOSAL_FOLLOW_UP_DRAFT_CREATED`:
```typescript
{
  commitment_id: string
  draft_id: string
  generation_path: 'template' | 'llm'
  template_id?: string
  model?: string
  prompt_tokens?: number
  completion_tokens?: number
  actor_user_id: string
  proposal_event_id: string
  follow_up_sequence: number
}
```

`PROPOSAL_FOLLOW_UP_DRAFT_GENERATION_FAILED`:
```typescript
{
  commitment_id: string
  failure_reason: 'no_template_and_generation_disabled' | 'budget_exhausted' | 'llm_error' | 'write_failed'
  actor_user_id: string
}
```

Existing `SEB_ACTION_DRAFT_CREATED` and `SEB_ACTION_DRAFT_CREATION_BLOCKED` patterns (Phase 3B) are a style reference for generation audit events.

---

## 11. Safety Controls

The following controls must be in place before any Phase 3S code is written and must remain in place through the entire phase:

| Control | Status | Notes |
|---------|--------|-------|
| `EMAIL_SENDING_ENABLED` | Disabled | Must stay disabled throughout Phase 3S |
| `CAMPAIGN_SENDING_ENABLED` | Disabled | Must stay disabled |
| `EMAIL_GENERATION_ENGINE` | Disabled by default | Must be explicitly enabled before any LLM generation is allowed to run |
| `REQUIRE_MESSAGE_APPROVAL` | Must be `true` | All generated drafts require approval before any future send path can use them |
| No auto-send | Enforced | Draft status `pending_approval` is not a send trigger |
| No background generation | Enforced | No Inngest/cron-triggered generation |
| No proposal status mutation | Enforced | Draft creation does not change proposal status |
| No approval bypass | Enforced | Action layer must not approve its own draft |
| No mass generation | Enforced | Single-commitment generation only; no batch path without separate design |
| Production migration 20240039 | Not applied | Requires separate explicit approval |
| No new production changes | Enforced | Phase 3S development on local/remote-dev only |

---

## 12. UI Design Direction

Future UI additions should preserve all Phase 3R controls and add draft generation as an additive row-level action.

### Proposed queue row action column (future)

```
[ View → ]         always visible
[ Mark Complete ]  crm.leads.edit — Phase 3R
[ Skip ]           crm.leads.edit — Phase 3R
[ Reschedule ]     crm.leads.edit — Phase 3R
[ Generate Draft ] crm.leads.edit + open commitment + no active draft — Phase 3S
[ Draft pending ]  read-only indicator when draft exists in pending_approval — Phase 3S
```

### UI guardrails

- "Generate Draft" must only appear for open commitments (`commitment_status = 'open'`).
- If a draft already exists in `pending_approval`, replace the button with a "Draft pending approval" indicator (not a second generate button).
- Never show a "Send" button in the follow-up queue. Send belongs in a dedicated send-path UI (future Phase 3T).
- Never imply automation. Label copy: "Generate Draft" not "Auto-draft" or "Send Follow-Up."
- Draft indicator should link to the draft review page, not to a send form.
- A compact action menu (popover) may be appropriate once 5+ row controls exist — noted in Phase 3R lock report as a future polish item.

---

## 13. Recommended Slice Breakdown

Each slice below is narrow and independently reviewable. No slice starts until the previous is confirmed complete and any required Codex reviews are done.

| Slice | Description | Notes |
|-------|-------------|-------|
| **3S Slice 1** | Design document (this file) | Documentation only |
| **3S Slice 2** | Implementation plan | Codex review required before any code |
| **3S Slice 3** | Data model / migration decision | Only if Option B (FK column) is chosen; may be skipped if Option A suffices |
| **3S Slice 4** | Draft generation repository function | `createFollowUpDraft`, fetch-before-write, subject_type/subject_id linking |
| **3S Slice 5** | Draft generation service + AI budget check + activity audit | `generateFollowUpDraftForWorkspace`, template vs LLM path decision |
| **3S Slice 6** | Draft generation server action | `generateFollowUpDraftAction`, requirePermission, duplicate-draft guard |
| **3S Slice 7** | Generate Draft UI control | `GenerateDraftButton`, draft-exists indicator, no Send control |
| **3S Slice 8** | Approval bridge integration | Only if not already covered by existing `approval_requests` + HRB infrastructure |
| **3S lock report** | Lock report + tag | After all slices confirmed |

Phase 3T (approved send path) is a separate phase and requires:
- Separate design document
- `EMAIL_SENDING_ENABLED` decision record
- Explicit operator approval
- Resend integration review

---

## 14. Open Questions

1. **Existing email_drafts fit:** Does the `subject_type`/`subject_id` polymorphic approach in `email_drafts` satisfy all Phase 3S query needs, or does foreign-key integrity warrant the Option B FK column (Slice 3)?

2. **Template storage:** Should follow-up message templates be stored as campaign assets (existing `campaign_assets` table), as dedicated `proposal_follow_up_templates` records (new table), or as messaging artifacts? Which lookup path fits the schedule_rule_key matching approach?

3. **Generation permission:** Should generation require only `crm.leads.edit` (same as mutation controls) or a distinct permission (e.g., `messaging.draft`)? If roles diverge (e.g., sales rep can mark complete but cannot generate), a separate permission is needed.

4. **LLM gating:** Should LLM generation be disabled by default until `ai-budget-policy` configuration exists, even if `EMAIL_GENERATION_ENGINE = true`? Recommend yes — require both `EMAIL_GENERATION_ENGINE = true` AND an active budget policy before any LLM generation runs.

5. **Quality scoring:** Should quality scoring via `email-draft-version.repo.ts` / `email-draft-metrics.service.ts` happen in Phase 3S, or deferred to Phase 3T or 3U?

6. **Reopen:** Should the Reopen commitment action (Phase 3R open question 2) be implemented before Phase 3S (to allow reverting a mistaken Complete/Skip) or deferred until after Phase 3S? If deferred, the Generate Draft button should be disabled for non-open commitments regardless.

7. **Draft review UI:** Does a suitable draft review/approval UI already exist from Phase 3B HRB work, or does Phase 3S need to build or link into one?

8. **Duplicate draft handling:** Should the generate action silently return the existing draft if one is already in `pending_approval`, or prompt the operator to explicitly replace it? The latter is safer but adds UI complexity.

9. **Version history:** Should `email-draft-version.repo.ts` version tracking be used from the first generation, or only when a rewrite is explicitly requested?

10. **Batch generation:** Is there a foreseeable need for a "generate drafts for all overdue commitments" operation? If so, it requires separate design with budget controls and must not appear in Phase 3S.

---

## 15. Required Codex Review Points (for future implementation slices)

Before any Phase 3S code slice proceeds, a Codex review must confirm:

- [ ] No sending path added — draft status `pending_approval` is not a trigger
- [ ] No automation or background jobs added
- [ ] `EMAIL_SENDING_ENABLED` check not bypassed
- [ ] `CAMPAIGN_SENDING_ENABLED` check not bypassed
- [ ] `EMAIL_GENERATION_ENGINE` checked before any LLM call
- [ ] `REQUIRE_MESSAGE_APPROVAL` respected — all generated drafts start as `pending_approval`
- [ ] Approval lifecycle uses `pending_approval` terminology (not `pending_review`)
- [ ] Token cost bounded — `ai-budget-enforcer` checked before LLM generation
- [ ] AI usage logged to `ai-usage-event` for every LLM call
- [ ] Service-layer audit only — `recordActivityEvent` called in service, not in repo or action
- [ ] All draft rows scoped to `(tenant_id, workspace_id)` — no cross-tenant access
- [ ] Repository fetch-before-write — commitment status verified as `'open'` before creating draft
- [ ] No proposal status mutation — generating a draft does not change `commitment_status`
- [ ] No approval bypass — action must not approve the draft it creates
- [ ] No LLM imports (OpenAI, Anthropic) in action or repository files — service layer only
- [ ] No Resend imports in any Phase 3S file
- [ ] No Inngest imports in any Phase 3S file
- [ ] No production migration applied without separate explicit approval
