# Phase 3S Slice 2 — Follow-Up Draft Generation Implementation Plan

**Status:** Planning only — no implementation started
**Created:** 2026-06-02
**Predecessor:** Phase 3S Slice 1 — [Follow-Up Draft Generation Design](phase-3s-follow-up-draft-generation-design.md)
**Phase 3R lock tag:** `phase-3r-controlled-follow-up-mutations-v1` → `cf868ca42c181574d9962e0b24559393609b86f6`
**origin/master at plan time:** `3e73e3aa94af38c9b469c9decc947b0db7eb54a5`

---

## 1. Purpose

This document translates the Phase 3S Slice 1 design into a concrete, reviewable implementation plan for generating approved follow-up email drafts from proposal follow-up commitments.

When implemented, this plan will allow an operator to trigger draft generation for an open proposal follow-up commitment. The generated draft is stored as an `email_drafts` row in `pending_approval` status. **No email is sent. No campaign is triggered. No commitment is completed or skipped. No proposal status changes.**

This document is planning only. It creates no code, no migrations, and no tags.

---

## 2. Current Locked Foundation

| Item | Status |
|------|--------|
| Phase 3R lock tag | `phase-3r-controlled-follow-up-mutations-v1` confirmed |
| Phase 3S Slice 1 design | Pushed to origin — `3e73e3a` |
| Proposal follow-up commitments | Exist in DB (`proposal_follow_up_commitments`) |
| Complete / Skip / Reschedule mutations | Locked and deployed |
| Email drafts infrastructure | Fully operational (`email_drafts`, `email_templates`, `approval_requests`) |
| `EMAIL_SENDING_ENABLED` | Disabled — must remain disabled |
| `CAMPAIGN_SENDING_ENABLED` | Disabled — must remain disabled |
| `EMAIL_GENERATION_ENGINE` | Disabled by default — must be explicitly enabled before any LLM call |
| Production migration 20240039 | Not applied — requires separate explicit approval |

Phase 3S adds draft generation alongside Complete / Skip / Reschedule. It does not alter those paths.

---

## 3. Scope

### In scope (future code slices only — not this document)

- Generate a follow-up email draft for an open `proposal_follow_up_commitment`
- Persist the draft as an `email_drafts` row with `status = 'pending_approval'`
- Link the draft to the commitment via both the polymorphic forward-link and the back-link FK (see Section 4)
- Preserve human review — draft requires approval before any future send path can use it
- Record audit event at service layer

### Out of scope for every Phase 3S slice

- Email sending of any kind
- Campaign sending
- Resend API calls
- Inngest/background jobs
- Completing or skipping commitments during draft generation
- Proposal status mutation
- Approval bypass
- Mass/batch generation

---

## 4. Draft Link Model Decision (Mandatory)

### Background

The Slice 1 design proposed using the polymorphic `email_drafts.subject_type`/`subject_id` pattern to link drafts to commitments. The Codex review noted that `proposal_follow_up_commitments.draft_id` already exists as a nullable FK to `email_drafts`. This section resolves the link model.

### Schema facts (no migration needed)

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `email_drafts` | `subject_type` | `string \| null` | Nullable; currently set to `'lead'` by existing code when `leadId` is present |
| `email_drafts` | `subject_id` | `string \| null` | Nullable; currently set to `leadId` by existing code |
| `proposal_follow_up_commitments` | `draft_id` | `uuid \| null` | FK → `email_drafts(id)` ON DELETE SET NULL — added in migration `20240038` |

Both columns exist in the current schema. **No migration is needed for either linking approach.**

### Important implementation constraint

The existing `createEmailDraft` function in `modules/messaging/repositories/email-draft.repo.ts` hardcodes:

```typescript
subject_type: input.leadId ? 'lead' : null,
subject_id:   input.leadId ?? null,
```

It does not accept `subjectType`/`subjectId` as separate parameters. Phase 3S must **not modify this function** — it is shared infrastructure used by campaigns, recommendations, and the lead draft pipeline.

A dedicated repository function is required for follow-up draft creation (see Section 9).

### Option A — polymorphic link only

Set `email_drafts.subject_type = 'proposal_follow_up_commitment'` and `subject_id = commitmentId`.
Do not write `proposal_follow_up_commitments.draft_id`.

**Pros:**
- Follows the design doc intent
- Single write point

**Cons:**
- `proposal_follow_up_commitments.draft_id` goes unused despite being schema-designed for this purpose
- Queue page cannot determine "does this commitment have an active draft?" without a JOIN or a separate query on `email_drafts` filtered by `subject_type`/`subject_id`
- Wastes the FK that was pre-planned in migration 20240038

### Option B — dual link (recommended)

Set both:
1. `email_drafts.subject_type = 'proposal_follow_up_commitment'`, `subject_id = commitmentId` (forward lookup)
2. `proposal_follow_up_commitments.draft_id = <new draft UUID>` (back-link)

**Pros:**
- Uses the pre-planned `draft_id` FK that migration 20240038 introduced specifically for this purpose
- Queue page can check `draft_id IS NOT NULL` in a single column read — no join required for "has draft?" indicator
- Dual links provide both directions: given a commitment → find its draft; given a draft → identify its commitment
- Consistent with how `email_drafts.campaign_assignment_id` back-links campaign assignments (same pattern)
- Referential integrity enforced: `ON DELETE SET NULL` means a deleted draft clears `draft_id` automatically

**Cons:**
- Two writes per draft creation (draft insert + commitment update) — not atomic
- Requires a compensating mechanism if the draft insert succeeds but the commitment back-link update fails

**Mitigation for dual-write risk:** Write the draft first. If the `draft_id` back-link update fails, the draft exists but the commitment doesn't point to it. This is a recoverable partial state (not a data loss event) — the draft can be located via `subject_type`/`subject_id`. The service should attempt the back-link update and log if it fails, but not roll back the draft creation. A reconciliation path (re-linking by querying `subject_type = 'proposal_follow_up_commitment'` and `subject_id = commitmentId`) can be added in a future polish slice.

### **Recommendation: Option B (dual link)**

`proposal_follow_up_commitments.draft_id` was added in migration 20240038 specifically for this purpose. The queue page's "has draft?" indicator requires only a column check. Ignoring the pre-planned FK would leave the schema partially unused and make queue-level draft visibility more expensive.

**No migration is required for Option B.** Both columns already exist.

---

## 5. Data Model Plan

### Tables used

#### `proposal_follow_up_commitments` (existing — Phase 3N, migration 20240038)

| Column | Role in Phase 3S |
|--------|-----------------|
| `id` | Commitment identifier — key input |
| `tenant_id`, `workspace_id` | Scope validation |
| `commitment_status` | Must be `'open'` for generation to proceed |
| `lead_id` | Cross-link for draft `lead_id` field |
| `proposal_event_id` | Context for generation |
| `schedule_rule_key` | Used to select template (see Section 5 template map) |
| `follow_up_sequence` | Context for subject line / body personalization |
| `follow_up_due_at` | Context for body copy |
| `draft_id` | Written after draft creation (back-link, Option B) |

#### `email_drafts` (existing — migration 20240006)

| Column | Written value |
|--------|--------------|
| `tenant_id`, `workspace_id` | From `ctx` |
| `subject_type` | `'proposal_follow_up_commitment'` |
| `subject_id` | `commitmentId` |
| `lead_id` | From commitment row |
| `contact_id` | From lead row |
| `company_id` | From lead row |
| `status` | `'pending_approval'` |
| `subject` | Rendered from template |
| `body_html`, `body_text` | Rendered from template |
| `template_id` | Matched template UUID (template path) |
| `generated_by_ai` | `false` (template path) / `true` (LLM path) |
| `ai_generation_metadata` | Template slug, sequence, rule key, safety checks, actor user ID |
| `source_type` | `DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP` (`'future_follow_up'`) |
| `sender_identity_id` | From default sender identity |
| `to_email`, `to_name` | From contact row |
| `approval_request_id` | Linked after approval request creation |
| `created_by` | `ctx.userId` |

**Note:** `DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP = 'future_follow_up'` is already defined in `modules/messaging/drafts/draft-source.constants.ts`. Use it.

#### `approval_requests` (existing — migration 20240012)

| Column | Written value |
|--------|--------------|
| `tenant_id`, `workspace_id` | From `ctx` |
| `request_type` | `'proposal_follow_up_draft_review'` |
| `subject_type` | `'proposal_follow_up_commitment'` |
| `subject_id` | `commitmentId` |
| `status` | `'pending'` (default) |
| `payload` | `{ draft_id, commitment_id, lead_id, subject, body_preview, template_slug, follow_up_sequence }` |

#### `activity_events` (existing)

One `PROPOSAL_FOLLOW_UP_DRAFT_CREATED` event per successful draft generation. See Section 10.

### Template slug map (follow-up specific)

The existing `email-draft.service.ts` already maps `proposal_follow_up → 'email_proposal_follow_up'`. The Phase 3S implementation must map `schedule_rule_key` values from `proposal_follow_up_commitments` to template slugs. Proposed mapping (to be confirmed against actual `schedule_rule_key` values in use):

```typescript
const FOLLOW_UP_RULE_TO_TEMPLATE_SLUG: Record<string, string> = {
  proposal_follow_up:       'email_proposal_follow_up',
  standard_follow_up:       'email_standard_follow_up',
  // additional rule keys as discovered
}
```

If no template matches the commitment's `schedule_rule_key` and `EMAIL_GENERATION_ENGINE` is disabled, return `{ ok: false, error: 'no_template_and_generation_disabled' }`.

### Fields that must NOT be added in this slice

- No new columns on `proposal_follow_up_commitments` (beyond writing the existing `draft_id`)
- No new columns on `email_drafts`
- No new tables

---

## 6. Draft Lifecycle

```
proposal_follow_up_commitment exists (commitment_status = 'open', draft_id IS NULL)
    ↓
Operator initiates generation — clicks "Generate Draft" (future UI slice)
    ↓
generateFollowUpDraftAction (server action — future Slice 6)
  │  requirePermission(ctx, 'crm.leads.edit')
  │  validate commitmentId
    ↓
generateFollowUpDraftForWorkspace (service — future Slice 5)
  │  fetch commitment, verify open status, verify no active draft
  │  fetch lead, contact — safety checks
  │  template path → render draft content
  │  (LLM path → budget check → generate → log usage)
  │  createFollowUpEmailDraft (repo — future Slice 4) → email_drafts row (status: 'pending_approval')
  │  update commitment.draft_id (repo — future Slice 4)
  │  create approval_request
  │  link approval to draft
  │  recordActivityEvent(PROPOSAL_FOLLOW_UP_DRAFT_CREATED)
  │  return { ok: true, draftId }
    ↓
Queue row shows "Draft pending approval" indicator
    ↓
Approver reviews draft in draft review UI
    ↓
Draft approved (status → 'approved')    OR    Draft rejected (status → 'rejected')
    ↓                                               ↓
(Future Phase 3T send path)              Operator can regenerate or discard
```

### Invariants

- Commitment status remains `'open'` throughout this flow. Draft generation does not complete or skip the commitment.
- No email is sent at any point.
- If `draft_id` back-link write fails after draft creation, the draft exists and is recoverable via `subject_type`/`subject_id`. This is not a data loss event.
- `commitment_status` is never written by the draft generation path.

---

## 7. Eligibility Rules

These validation checks must be enforced at the service layer before any DB writes:

| Check | Failure behavior |
|-------|-----------------|
| Commitment belongs to `ctx.tenantId` + `ctx.workspaceId` | `not_found` |
| Commitment `commitment_status = 'open'` | `commitment_not_open` |
| Commitment `draft_id IS NULL` (no active draft) | `draft_already_exists` (unless regeneration path is explicitly authorized) |
| Lead record exists (`lead_id` not null, lead found) | `lead_not_found` |
| Contact exists on lead | `no_contact_linked` |
| Contact has email | `no_contact_email` |
| Contact `do_not_contact = false` | `contact_do_not_contact` |
| Contact email not suppressed | `suppressed` (use existing `suppressionRepo`) |
| Template exists for `schedule_rule_key` | `no_template_for_rule` (template path) |
| `EMAIL_GENERATION_ENGINE` system control | Check before any LLM call; `generation_disabled` if false |
| AI budget available | `budget_exhausted` (check `ai-budget-enforcer.service.ts` before LLM) |
| Sender identity exists | Non-fatal degradation — `sender_name` falls back to workspace default |

**Ordering guarantee (matches existing `createLeadEmailDraft` pattern):**
All validation runs BEFORE any DB writes. Supersede or existing-draft invalidation runs only when committed to creating a replacement.

---

## 8. AI Budget and Safety

### Template path (default)

- Zero token cost.
- No `EMAIL_GENERATION_ENGINE` check required.
- `ai_generation_metadata.generated_by_ai = false`.
- Should be the default path.

### LLM path (explicit, future)

- Requires `EMAIL_GENERATION_ENGINE = true` in system controls.
- Requires an active `ai_budget_policy` for the workspace before generation is allowed.
- Must call `ai-budget-enforcer.service.ts` before the LLM call.
- On budget exhaustion: return `{ ok: false, error: 'budget_exhausted' }`. Notify operator. Do not degrade silently.
- Every LLM call must log to `ai_usage_events` via `ai-usage-event.repo.ts`.
- No background/batch LLM generation — generation must be operator-initiated, single-commitment only.
- `ai_generation_metadata` must record: `model`, `prompt_tokens`, `completion_tokens`, `prompt_config_id` if used.

### Safety controls that must remain true for all Phase 3S code

- No Resend call in any Phase 3S file.
- No `email_sends` row created.
- `EMAIL_SENDING_ENABLED` check must not appear in Phase 3S files (not relevant — no sending).
- `CAMPAIGN_SENDING_ENABLED` check must not appear in Phase 3S files.
- `REQUIRE_MESSAGE_APPROVAL` semantically enforced by setting draft `status = 'pending_approval'` — the constant does not need to be read at generation time.
- Draft approval and sending are separate future paths.

---

## 9. Server / Service / Repository Plan

### Repository: `modules/proposals/repositories/proposal-follow-up-draft.repo.ts` (new file)

Responsibilities:
- `createFollowUpEmailDraft(input: CreateFollowUpEmailDraftInput): Promise<EmailDraftRow>` — inserts an `email_drafts` row with `subject_type = 'proposal_follow_up_commitment'`, `source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP`. Must use `createSupabaseServiceClient()` directly (does NOT reuse `email-draft.repo.createEmailDraft` — that function hardcodes `subject_type = 'lead'` and must not be modified).
- `linkDraftToCommitment(commitmentId: string, draftId: string, tenantId: string, workspaceId: string): Promise<boolean>` — updates `proposal_follow_up_commitments.draft_id` for the given commitment. Scoped by `(id, tenant_id, workspace_id)`. Returns `true` if a row was updated.
- `getActiveDraftForCommitment(commitmentId: string, tenantId: string): Promise<{ id: string; status: string } | null>` — reads `email_drafts` by `subject_type = 'proposal_follow_up_commitment'` + `subject_id = commitmentId` in an editable status (`draft`, `pending_approval`). Used for duplicate-draft check.

Do not add follow-up-draft repository functions to `email-draft.repo.ts` — that file is shared messaging infrastructure.

### Service: `modules/proposals/services/proposal-follow-up-draft.service.ts` (new file)

Responsibilities:
- `generateFollowUpDraftForWorkspace(tenantId, workspaceId, commitmentId, actorUserId, options?: { allowRegeneration?: boolean }): Promise<GenerateFollowUpDraftResult>`
- Fetch commitment (verify scope + `commitment_status = 'open'`).
- Check for active draft — if `draft_id IS NOT NULL` and `allowRegeneration` is not set, return `{ ok: false, error: 'draft_already_exists', draftId: existing }`.
- Load lead + contact; run safety checks (reuse pattern from `email-draft.service.ts`).
- Map `schedule_rule_key` → template slug; load template via `email-draft.repo.getTemplateBySlug`.
- Render template variables. Load sender identity.
- Call `createFollowUpEmailDraft` (repo).
- Call `linkDraftToCommitment` (repo). Log failure, do not throw.
- Create `approval_request` via `approvalRepo.createApprovalRequest` with `request_type = 'proposal_follow_up_draft_review'`.
- Call `emailDraftRepo.linkApprovalToEmailDraft`.
- Call `recordActivityEvent(PROPOSAL_FOLLOW_UP_DRAFT_CREATED)`.
- Return `{ ok: true, draftId, approvalRequestId }`.

**Audit failure behavior:** Matches Phase 3R pattern — if `recordActivityEvent` throws after successful draft creation, return `{ ok: false, error: 'audit_failed' }` without rolling back the draft.

No LLM imports in this service file in the first implementation slice. LLM path is deferred to a subsequent slice once the template path is confirmed working.

### Action: `modules/proposals/actions/proposal-follow-up-draft.actions.ts` (new file)

```typescript
'use server'
// requirePermission(ctx, 'crm.leads.edit')
// validate commitmentId input
// call generateFollowUpDraftForWorkspace
// return ActionResult<{ draftId: string; approvalRequestId: string }>
```

Follows the same `ActionResult<T>` discriminated union pattern as Phase 3R actions. No LLM imports. No Resend imports.

### Validation boundaries

| Layer | Responsibility |
|-------|---------------|
| Action | Input presence check, requirePermission, error-to-ActionResult mapping |
| Service | Business rules (eligibility, safety, template match, budget check) |
| Repository | Tenant/workspace scope enforcement on all reads and writes |

### Transaction boundaries

Phase 3S follows the existing project pattern of no explicit Supabase transactions. Operations are ordered to minimize partial-state risk:
1. All validation (no writes)
2. `createFollowUpEmailDraft` (write 1 — point of no return)
3. `linkDraftToCommitment` (write 2 — non-fatal if fails)
4. `createApprovalRequest` (write 3 — non-fatal if fails; audit event notes failure)
5. `linkApprovalToEmailDraft` (write 4 — non-fatal if fails)
6. `recordActivityEvent` (audit — non-fatal)

Fatal write: only the draft insert (step 2). All subsequent writes are best-effort with logged failures.

### Idempotency / duplicate-prevention strategy

- Default: if `commitment.draft_id IS NOT NULL` and a matching `email_drafts` row exists in an editable status, return `{ ok: false, error: 'draft_already_exists', draftId: existing }`.
- With `allowRegeneration = true`: supersede the existing draft (`status = 'superseded'`, `superseded_at = now()`), then create a new draft. Mirror the `supersedePendingDraftsForLead` pattern but scoped to the commitment.
- Supersede happens only after all validation passes and before the new draft insert.

---

## 10. Activity / Audit Model

New constants to be added to `ActivityEventType` in `modules/intelligence/types.agent.ts` when implementing Slice 4+:

```typescript
// Phase 3S — Proposal Follow-Up Draft Generation (additive)
PROPOSAL_FOLLOW_UP_DRAFT_CREATED:            'proposal_follow_up_draft_created',
PROPOSAL_FOLLOW_UP_DRAFT_GENERATION_FAILED:  'proposal_follow_up_draft_generation_failed',
PROPOSAL_FOLLOW_UP_DRAFT_APPROVAL_REQUESTED: 'proposal_follow_up_draft_approval_requested',
```

Event properties for `PROPOSAL_FOLLOW_UP_DRAFT_CREATED`:

```typescript
{
  commitment_id:         commitmentId,
  draft_id:              draft.id,
  approval_request_id:   approval.id,
  generation_path:       'template',            // or 'llm' in future
  template_id:           template?.id,
  template_slug:         templateSlug,
  schedule_rule_key:     commitment.schedule_rule_key,
  follow_up_sequence:    commitment.follow_up_sequence,
  actor_user_id:         actorUserId,
  proposal_event_id:     commitment.proposal_event_id,
}
```

Audit belongs to service layer only. Repository does not call `recordActivityEvent`. Action does not call `recordActivityEvent`.

---

## 11. Testing Plan

Test file: `tests/phase3s-proposal-follow-up-draft.test.ts`

Pattern: `fs.readFileSync + toContain / not.toContain / regex` (source-reading tier — no Supabase mocking, no LLM mocking).

### Repository tests

- `TC-3S-001`: Draft repo file exists and is readable
- `TC-3S-002`: `createFollowUpEmailDraft` exported
- `TC-3S-003`: `createFollowUpEmailDraft` sets `subject_type = 'proposal_follow_up_commitment'`
- `TC-3S-004`: `createFollowUpEmailDraft` sets `source_type = DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP`
- `TC-3S-005`: `createFollowUpEmailDraft` uses `createSupabaseServiceClient` (not server client)
- `TC-3S-006`: `linkDraftToCommitment` exported
- `TC-3S-007`: `linkDraftToCommitment` scopes update by `(id, tenant_id, workspace_id)`
- `TC-3S-008`: `getActiveDraftForCommitment` exported
- `TC-3S-009`: Repo does not import Resend, Inngest, OpenAI, Anthropic
- `TC-3S-010`: Repo does not call `recordActivityEvent`

### Service tests

- `TC-3S-011`: Service file exists and is readable
- `TC-3S-012`: `generateFollowUpDraftForWorkspace` exported
- `TC-3S-013`: Service checks `commitment_status = 'open'` before write
- `TC-3S-014`: Service checks for existing active draft before write
- `TC-3S-015`: Service calls `recordActivityEvent` with `PROPOSAL_FOLLOW_UP_DRAFT_CREATED`
- `TC-3S-016`: `audit_failed` returned if `recordActivityEvent` throws (draft is not rolled back)
- `TC-3S-017`: Service does not call email_sends or Resend
- `TC-3S-018`: Service does not mutate `commitment_status`
- `TC-3S-019`: Service does not import OpenAI, Anthropic, or Resend
- `TC-3S-020`: Service does not import Inngest
- `TC-3S-021`: Service calls `linkDraftToCommitment` after draft creation

### Action tests

- `TC-3S-022`: Action file exists with `'use server'`
- `TC-3S-023`: `generateFollowUpDraftAction` exported
- `TC-3S-024`: Action calls `requirePermission(ctx, 'crm.leads.edit')`
- `TC-3S-025`: Action validates `commitmentId` presence
- `TC-3S-026`: Action returns `ActionResult<{ draftId, approvalRequestId }>`
- `TC-3S-027`: Action does not call `recordActivityEvent`
- `TC-3S-028`: Action does not import Resend, Inngest, OpenAI, Anthropic
- `TC-3S-029`: Action does not reference `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`

### UI tests (future Slice 7)

- Existence of `GenerateDraftButton` client component
- Button only visible for `open` commitments
- Draft-exists indicator shows when `draft_id` is non-null
- No Send button present
- Button state machine covers: idle, confirming, loading, success, error

### Cross-cutting tests

- `TC-3S-030`: `PROPOSAL_FOLLOW_UP_DRAFT_CREATED` constant added to `ActivityEventType`
- `TC-3S-031`: Test that draft creation does not appear to mutate commitment status fields
- `TC-3S-032`: `DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP` used (not a new constant)

---

## 12. Risk Controls

| Risk | Mitigation |
|------|-----------|
| Duplicate draft creation | Active-draft check before any write; `draft_already_exists` return code; Option B back-link allows single-column check |
| Broken back-link (`draft_id` not written) | Non-fatal; draft locatable via `subject_type`/`subject_id`; logged; future reconciliation query |
| Accidentally sending email | No `email_sends` insert, no Resend call, status stays `pending_approval`; source-reading tests verify |
| Accidentally completing commitment | `commitment_status` is never written in draft generation path; source-reading tests verify |
| Proposal status mutation | Not in scope; source-reading tests verify |
| Uncontrolled AI spend | Template path has zero cost; LLM path gated behind `EMAIL_GENERATION_ENGINE` + budget enforcer |
| UI confusion: draft created ≠ follow-up completed | Queue row must show both the commitment status AND draft status separately; "Draft pending approval" does not imply "Mark Complete" was clicked |
| Orphaned approval request if draft write fails | Approval is created after draft; if draft write fails, no approval is created |

---

## 13. Out of Scope for This Slice (Slice 2 — Planning Only)

- No code changes of any kind
- No migrations created or applied
- No production changes
- No Vercel changes
- No email sending
- No campaign sending
- No automation or background jobs
- No UI implementation
- No server action implementation
- No service implementation
- No repository implementation
- No new `ActivityEventType` constants (added in implementation slice)
- No tag created or pushed

---

## 14. Acceptance Criteria

This document is accepted when all of the following are true:

- [x] Documentation only — no code, no migration, no tag
- [x] Draft link model decision is explicit: **Option B (dual link)** — `email_drafts.subject_type/subject_id` + `proposal_follow_up_commitments.draft_id` back-link
- [x] Codex note resolved: `draft_id` already exists in migration 20240038; back-link is pre-planned schema; no migration required
- [x] Implementation does not modify `email-draft.repo.ts`; a dedicated follow-up draft repo is used
- [x] `DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP` identified as the correct source type constant
- [x] Draft lifecycle is human-review gated (`pending_approval` status; no auto-send)
- [x] `pending_approval` used consistently; `pending_review` not introduced
- [x] Sending is deferred to Phase 3T with `EMAIL_SENDING_ENABLED` separately required
- [x] Implementation plan creates a safe, narrow path for the next code slice (Slice 3 — template path repository + service + action)

---

## 15. Recommended Next Steps

| Slice | Description |
|-------|-------------|
| **3S Slice 3** | Template-path implementation: `proposal-follow-up-draft.repo.ts` + service (template path only) + action + `ActivityEventType` additions + source-reading tests |
| **3S Slice 4** | Generate Draft UI control (`GenerateDraftButton`) + draft indicator in queue page |
| **3S Slice 5** | LLM generation path (if `EMAIL_GENERATION_ENGINE` is enabled and budget policy exists) |
| **3S Slice 6** | Quality review integration (optional — `reviewAndPersistEmailDraftQuality`) |
| **3S lock report** | Lock report + tag after all confirmed slices |

> **Note:** Slice 3 (implementation) should begin with a Codex review of this plan before any code is written.
