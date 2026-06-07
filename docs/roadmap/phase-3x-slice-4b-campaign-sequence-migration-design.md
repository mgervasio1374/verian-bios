# Phase 3X Slice 4B — Campaign Sequence Migration Design

**Status:** Design only  
**Created:** 2026-06-07  
**Baseline:** `3d16c41` — Phase 3X Slice 4 product foundation workflow plan  
**Migration created:** No  
**Implementation allowed in this slice:** None  
**Slice 5:** Blocked

---

## 1. Executive Summary

This migration design is needed because current campaign infrastructure can store reusable email assets and lead/contact assignments, but it cannot store a real ordered campaign sequence. The product can explain cadence in the UI, but it cannot persist:

- a named reusable campaign type,
- versioned sequence rules,
- step-by-step day offsets,
- recurring long-tail cadence,
- step-to-asset mapping,
- stop-on-response behavior,
- approval requirements per sequence/step,
- or planned production schedule records.

This design is not sending, not automation, and not agent activation. It creates the schema plan that future slices can implement so:

- Campaign Assets can evolve from one-off templates into sequence-backed templates.
- Operations can show planned production from real schedule rows.
- Agents can read stored campaign rules instead of relying on prompt text or hardcoded cadence.

No migration is created in this slice. No system control is changed. No email, approval, campaign send, or background job behavior is added.

---

## 2. Existing Schema Inventory

### `campaign_email_assets`

Created in migration `20240034_phase3i_decision_usage_budget_campaign.sql`.

Relevant fields:

- `tenant_id`
- `workspace_id`
- `campaign_type` text
- `asset_name`
- `subject_template`
- `body_template_html`
- `body_template_text`
- `personalization_fields`
- `required_fields`
- `fallback_values`
- `status`
- `approved_by`
- `approved_at`

Supports sequence configuration: **No.** It stores template content and a text campaign type label, not sequence structure.

Supports schedule generation: **No.** It has no step number, day offset, assignment, or planned date.

Supports stop conditions: **No.**

Supports approval gating: **Partially.** Asset status supports review/approval/activation for the template itself. It does not define per-touch draft approval requirements.

Gaps:

- No `campaign_type_id`.
- No `campaign_sequence_id`.
- No step relationship.
- No day offset.
- No recurring tail setting.

### `campaign_assignments`

Created in migration `20240036_phase3l_campaign_assignments.sql`.

Relevant fields:

- `tenant_id`
- `workspace_id`
- `lead_id`
- `contact_id`
- `campaign_asset_id`
- `campaign_type`
- `assignment_status`
- `assignment_source`
- `assigned_by_user_id`
- `assigned_by_agent_name`
- `assignment_reason`
- `confidence`
- `eligibility_snapshot`
- `retired_at`

Supports sequence configuration: **No.** It stores a campaign type label and optional single asset, not a sequence definition.

Supports schedule generation: **No.** It can identify who is assigned, but there are no planned touches.

Supports stop conditions: **Partially.** `assignment_status` and `retired_at` can remove an assignment, but there is no response stop field, manual stop reason, or stopped timestamp.

Supports approval gating: **No.** Approval is handled by drafts/approval requests after draft creation.

Gaps:

- No `campaign_type_id`.
- No `campaign_sequence_id`.
- No `started_at`.
- No `stopped_at`, `stopped_reason`, or `response_detected_at`.
- No generated schedule rows.
- Existing uniqueness is based on `(lead/contact, campaign_type)` text and will need compatibility handling.

### `email_drafts`

Created earlier and extended by `20240037_phase3m_draft_assignment_linkage.sql`.

Relevant fields:

- `tenant_id`
- `workspace_id`
- `lead_id`
- `contact_id`
- `company_id`
- `status`
- `approval_request_id`
- `source_type`
- `source_asset_id`
- `campaign_assignment_id`
- `sent_at`
- `deleted_at`

Supports sequence configuration: **No.**

Supports schedule generation: **No.** It can link to a campaign assignment, but not to a sequence step or schedule item.

Supports stop conditions: **No.**

Supports approval gating: **Yes for drafts.** Drafts can be pending approval, approved, sent, superseded, rejected, etc.

Gaps:

- No `campaign_schedule_item_id`.
- No `campaign_sequence_step_id`.
- Draft status does not itself define planned production.

### `approval_requests`

Created by workflow migrations and extended by Phase 3A.

Relevant fields:

- `tenant_id`
- `workspace_id`
- `request_type`
- `status`
- `assignee_id`
- `subject_type`
- `subject_id`
- `payload`
- `approved_by`
- `decided_at`

Supports sequence configuration: **No.**

Supports schedule generation: **No.**

Supports stop conditions: **No.**

Supports approval gating: **Yes.** It is the existing approval object to use when a schedule item produces a draft needing operator review.

Gaps:

- No direct schedule item FK.
- Schedule linkage should likely live on `campaign_schedule_items.approval_request_id`, not inside approval payload only.

### `proposal_follow_up_commitments`

Created in migration `20240038_phase3n_proposal_capture.sql`.

Relevant fields:

- `tenant_id`
- `workspace_id`
- `proposal_event_id`
- `lead_id`
- `follow_up_due_at`
- `follow_up_sequence`
- `schedule_rule_key`
- `commitment_status`
- `draft_id`

Supports campaign sequence configuration: **No.** It is proposal-follow-up-specific.

Supports schedule generation: **As precedent only.** It shows a working pattern for scheduled obligations and draft linkage.

Supports stop conditions: **Proposal-specific.** Terminal proposal status can close commitments.

Supports approval gating: **Via linked draft only.**

Gaps:

- Should not be reused for campaign sequences.
- Useful as a conceptual precedent for `campaign_schedule_items`.

### `campaign_email_sends`

Created in migration `20240034`.

Relevant fields:

- `tenant_id`
- `asset_id`
- `lead_id`
- `contact_id`
- `rendered_subject`
- `send_status`
- `email_send_id`

Supports sequence configuration: **No.**

Supports schedule generation: **No.**

Supports stop conditions: **No.**

Supports approval gating: **No.**

Gaps:

- Older per-asset send record concept; future schedule items should link to `email_sends` or this table only after the send path is explicitly reviewed.

### Campaign Queue / scheduling-related table

There is no dedicated campaign schedule table. `Campaign Queue` currently derives work from `campaign_assignments`, `campaign_email_assets`, and `email_drafts`.

---

## 3. Proposed Schema Design

### A. `campaign_types`

Purpose: named reusable outreach program type.

Recommended fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `tenant_id` | uuid NOT NULL FK `tenants(id)` | Tenant scoped |
| `workspace_id` | uuid NOT NULL FK `workspaces(id)` | Workspace scoped for v1 |
| `name` | text NOT NULL | Display name, e.g. `Initial Contact` |
| `slug` | text NOT NULL | Stable per workspace |
| `description` | text NULL | Operator-facing description |
| `status` | text NOT NULL | `draft`, `active`, `retired` |
| `default_stop_condition` | text NOT NULL | e.g. `response_detected` |
| `default_requires_approval` | boolean NOT NULL DEFAULT true | Future draft gate default |
| `created_by_user_id` | uuid NULL FK `auth.users(id)` | Server-derived |
| `created_at` | timestamptz NOT NULL DEFAULT now() |  |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | trigger |
| `retired_at` | timestamptz NULL | soft retirement |

Recommended constraints:

- `UNIQUE (tenant_id, workspace_id, slug)` where `retired_at IS NULL` if using partial unique index.
- `status CHECK IN ('draft','active','retired')`.
- `default_stop_condition CHECK IN ('response_detected','manual_stop_only')` for v1.

### B. `campaign_sequences`

Purpose: versioned sequence definition attached to a campaign type.

Recommended fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK |  |
| `tenant_id` | uuid NOT NULL FK `tenants(id)` | Duplicate for scoping and query safety |
| `workspace_id` | uuid NOT NULL FK `workspaces(id)` | Duplicate for scoping and query safety |
| `campaign_type_id` | uuid NOT NULL FK `campaign_types(id)` | `ON DELETE CASCADE` or `RESTRICT`; prefer `RESTRICT` once active |
| `name` | text NOT NULL | Sequence name |
| `description` | text NULL |  |
| `status` | text NOT NULL | `draft`, `active`, `retired` |
| `version` | integer NOT NULL DEFAULT 1 | Version number per campaign type |
| `is_default` | boolean NOT NULL DEFAULT false | One default active/draft sequence per type |
| `requires_approval` | boolean NOT NULL DEFAULT true | Sequence-level default |
| `stop_on_response` | boolean NOT NULL DEFAULT true | v1 default |
| `response_trigger_behavior` | text NOT NULL | `stop_future_touches`, later `create_task`, `notify_operator` |
| `created_by_user_id` | uuid NULL FK `auth.users(id)` | Server-derived |
| `created_at` | timestamptz NOT NULL DEFAULT now() |  |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | trigger |
| `retired_at` | timestamptz NULL |  |

Recommended constraints:

- `UNIQUE (tenant_id, workspace_id, campaign_type_id, version)`.
- Partial unique default: one `is_default = true` row per `(tenant_id, workspace_id, campaign_type_id)` where `status != 'retired'`.
- `status CHECK IN ('draft','active','retired')`.
- `response_trigger_behavior CHECK IN ('stop_future_touches','notify_operator','create_task')`; v1 should only use `stop_future_touches`.

### C. `campaign_sequence_steps`

Purpose: individual touch definitions.

Recommended fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK |  |
| `tenant_id` | uuid NOT NULL FK `tenants(id)` | Duplicate scope |
| `workspace_id` | uuid NOT NULL FK `workspaces(id)` | Duplicate scope |
| `campaign_sequence_id` | uuid NOT NULL FK `campaign_sequences(id)` | `ON DELETE CASCADE` while sequence is draft |
| `step_number` | integer NOT NULL | 1-based |
| `touch_label` | text NULL | e.g. `Touch 1`, `Long-tail follow-up` |
| `day_offset` | integer NULL | Required for non-recurring steps |
| `recurring_interval_days` | integer NULL | Required for recurring steps |
| `is_recurring` | boolean NOT NULL DEFAULT false | Long-tail marker |
| `campaign_email_asset_id` | uuid NULL FK `campaign_email_assets(id)` | Step template, nullable while draft |
| `channel` | text NOT NULL DEFAULT 'email' | v1 only email |
| `requires_approval` | boolean NOT NULL DEFAULT true | Step override |
| `status` | text NOT NULL DEFAULT 'draft' | `draft`, `active`, `retired` |
| `created_at` | timestamptz NOT NULL DEFAULT now() |  |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | trigger |

Recommended constraints:

- `UNIQUE (tenant_id, workspace_id, campaign_sequence_id, step_number)`.
- `CHECK (step_number > 0)`.
- `CHECK (day_offset IS NOT NULL OR is_recurring = true)`.
- `CHECK (is_recurring = false OR recurring_interval_days IS NOT NULL)`.
- `CHECK (day_offset IS NULL OR day_offset >= 0)`.
- `CHECK (recurring_interval_days IS NULL OR recurring_interval_days > 0)`.
- `channel CHECK IN ('email')` for v1.
- `status CHECK IN ('draft','active','retired')`.

### D. `campaign_schedule_items`

Purpose: generated/planned production schedule records for assignments.

Recommended fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK |  |
| `tenant_id` | uuid NOT NULL FK `tenants(id)` | Scope |
| `workspace_id` | uuid NOT NULL FK `workspaces(id)` | Scope |
| `campaign_assignment_id` | uuid NOT NULL FK `campaign_assignments(id)` | Assignment source |
| `campaign_sequence_id` | uuid NOT NULL FK `campaign_sequences(id)` | Version used at generation time |
| `campaign_sequence_step_id` | uuid NOT NULL FK `campaign_sequence_steps(id)` | Step source |
| `lead_id` | uuid NULL FK `leads(id)` | copied from assignment |
| `contact_id` | uuid NULL FK `contacts(id)` | copied from assignment |
| `company_id` | uuid NULL FK `companies(id)` | derived where available |
| `scheduled_for` | timestamptz NOT NULL | Planned production date/time |
| `status` | text NOT NULL DEFAULT 'planned' | See Section 4 |
| `status_reason` | text NULL | Human-readable reason |
| `approval_request_id` | uuid NULL FK `approval_requests(id)` | nullable until approval request exists |
| `email_draft_id` | uuid NULL FK `email_drafts(id)` | nullable until draft exists |
| `sent_event_id` | uuid NULL | Future link to `email_sends` or `campaign_email_sends`; do not FK until send path decision |
| `stopped_at` | timestamptz NULL | response/manual stop |
| `stopped_reason` | text NULL | `response_detected`, `manual_stop`, etc. |
| `response_detected_at` | timestamptz NULL | if response is known |
| `created_at` | timestamptz NOT NULL DEFAULT now() |  |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | trigger |

Recommended constraints:

- `CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL)`.
- `status CHECK` using text values from Section 4.
- `UNIQUE (tenant_id, workspace_id, campaign_assignment_id, campaign_sequence_step_id, scheduled_for)` to reduce duplicate generation.
- Nullable draft/approval/send fields until future stages create them.

---

## 4. Status Model

Schedule item statuses:

| Status | Meaning | v1 behavior |
| --- | --- | --- |
| `planned` | Row exists for a future touch | Display/read model |
| `draft_needed` | Due soon or due now and no draft exists | Display/read model or service-derived update |
| `draft_ready` | Draft exists but no approval is pending yet | Future execution state |
| `awaiting_approval` | Approval request pending | Future execution state |
| `approved` | Draft approved; not sent | Future execution state |
| `scheduled` | Approved and scheduled for future send window | Future execution state |
| `sent` | Delivery completed/accepted by provider | Future send state |
| `blocked` | Readiness, missing asset, missing contact, gate, or validation failure | Future execution/read model |
| `stopped_responded` | Future item closed because recipient responded | Future response state |
| `stopped_manual` | Operator manually stopped assignment/item | Future mutation state |
| `skipped` | Operator skipped the touch without stopping whole assignment | Future mutation state |
| `failed` | Generation/send/local update failed | Future execution state |

For the first migration implementation, statuses can be stored but should not be mutated by automation. Initial repository/UI slices should treat them as display/read-model states only unless a later slice explicitly approves a mutation.

---

## 5. Default Cadence Model

Default sequence steps:

| Step | `step_number` | `day_offset` | `is_recurring` | `recurring_interval_days` |
| --- | ---: | ---: | --- | ---: |
| Day 1 | 1 | 1 | false | null |
| Day 3 | 2 | 3 | false | null |
| Day 7 | 3 | 7 | false | null |
| Day 14 | 4 | 14 | false | null |
| Day 31 | 5 | 31 | false | null |
| Day 91 | 6 | 91 | false | null |
| Every 90 days until response/manual stop | 7 | null | true | 90 |

### Recurring tail logic

Represent the long-tail cadence as one recurring step:

- `is_recurring = true`
- `day_offset = null`
- `recurring_interval_days = 90`

Future schedule generation should generate concrete `campaign_schedule_items` from the recurring step only up to a rolling horizon. Recommended initial horizon: 180 days ahead, with a maximum of two recurring tail items per assignment at generation time. This keeps schedule rows bounded.

Future generation process:

1. Generate non-recurring rows from `day_offset`.
2. Generate recurring rows from the recurring step until horizon.
3. Stop generating future rows when assignment is stopped.
4. Mark existing pending future rows `stopped_responded` or `stopped_manual` when the assignment stops.

No generation service or background job is implemented in this design slice.

---

## 6. Relationships and Constraints

### Foreign keys

- `campaign_types.tenant_id -> tenants.id`
- `campaign_types.workspace_id -> workspaces.id`
- `campaign_sequences.campaign_type_id -> campaign_types.id`
- `campaign_sequence_steps.campaign_sequence_id -> campaign_sequences.id`
- `campaign_sequence_steps.campaign_email_asset_id -> campaign_email_assets.id`
- `campaign_schedule_items.campaign_assignment_id -> campaign_assignments.id`
- `campaign_schedule_items.campaign_sequence_id -> campaign_sequences.id`
- `campaign_schedule_items.campaign_sequence_step_id -> campaign_sequence_steps.id`
- `campaign_schedule_items.lead_id -> leads.id`
- `campaign_schedule_items.contact_id -> contacts.id`
- `campaign_schedule_items.company_id -> companies.id`
- `campaign_schedule_items.approval_request_id -> approval_requests.id`
- `campaign_schedule_items.email_draft_id -> email_drafts.id`

### Tenant/workspace scoping

All four new tables should carry `tenant_id` and `workspace_id`, even when reachable through parent rows. This matches current repository patterns and makes read queries simple and safer.

### Uniqueness

- Campaign type slug: unique per tenant/workspace.
- Sequence version: unique per campaign type.
- Default sequence: at most one default active/draft sequence per campaign type.
- Step order: unique per sequence.
- Schedule item duplicate guard: assignment + step + scheduled date.

### Asset references

Assets should remain separate reusable templates. Steps reference assets via nullable `campaign_email_asset_id`.

Do not make assets step-owned in v1. Step-owned templates would reduce reuse and complicate existing asset approval flows.

### Approval/draft references

`approval_request_id` and `email_draft_id` stay nullable because planned items exist before drafts and approvals are generated.

### Response stop fields

Response stop fields live on schedule rows and should later be mirrored on `campaign_assignments` if assignment-level stop is implemented:

- schedule row: `stopped_at`, `stopped_reason`, `response_detected_at`
- assignment future extension: `stopped_at`, `stop_reason`, `response_detected_at`

---

## 7. RLS and Permissions Considerations

Design only; do not implement in Slice 4B.

Recommended RLS convention:

- `SELECT` for authenticated users where `tenant_id::text = auth.jwt()->>'tenant_id'`.
- Service role `ALL`.
- If following newer stricter CRM conventions, include workspace membership checks before applying in production.

Permissions:

- Read: `crm.leads.view` or a future `campaigns.view`.
- Write campaign definitions: future `campaigns.manage` is cleaner, but do not invent permissions in the migration slice unless a permission design slice approves it.
- For initial implementation, server actions can use existing admin/operator permission only after review.

RLS review is required before migration application because campaign sequence rows become a tenant/workspace operational control surface. Incorrect RLS could expose campaign strategy across workspaces or allow unauthorized modification of future production schedules.

---

## 8. Migration Plan

Proposed migration number/name:

`supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql`

Do not create it in this design slice.

### Table creation order

1. `campaign_types`
2. `campaign_sequences`
3. `campaign_sequence_steps`
4. `campaign_schedule_items`
5. Optional additive columns to existing tables:
   - `campaign_assignments.campaign_type_id`
   - `campaign_assignments.campaign_sequence_id`
   - `campaign_assignments.started_at`
   - `campaign_assignments.stopped_at`
   - `campaign_assignments.stop_reason`
   - `campaign_assignments.response_detected_at`
   - `campaign_email_assets.campaign_type_id`
   - `campaign_email_assets.campaign_sequence_step_id`
   - `email_drafts.campaign_schedule_item_id`

Recommendation: create the four new tables first. Add existing-table columns only if Slice 4C commits to wiring compatibility in the same implementation. Otherwise defer existing-table columns until repository/service code needs them.

### Indexes

Recommended:

- `campaign_types (tenant_id, workspace_id, status)`
- unique partial `campaign_types (tenant_id, workspace_id, slug) WHERE retired_at IS NULL`
- `campaign_sequences (tenant_id, workspace_id, campaign_type_id, status)`
- unique `campaign_sequences (tenant_id, workspace_id, campaign_type_id, version)`
- unique partial default sequence index
- `campaign_sequence_steps (tenant_id, workspace_id, campaign_sequence_id, step_number)`
- `campaign_schedule_items (tenant_id, workspace_id, scheduled_for)`
- `campaign_schedule_items (tenant_id, workspace_id, status, scheduled_for)`
- `campaign_schedule_items (campaign_assignment_id)`
- `campaign_schedule_items (email_draft_id) WHERE email_draft_id IS NOT NULL`
- `campaign_schedule_items (approval_request_id) WHERE approval_request_id IS NOT NULL`

### Text status decision

Use `text` + `CHECK` constraints, not PostgreSQL enums, to match existing project migration style (`proposal_status`, `commitment_status`, assignment statuses). This keeps future additive status changes easier.

### Backfill strategy

Initial migration should not backfill production-like schedule rows.

Optional local/staging seed after migration review:

- Create one `Initial Contact` campaign type.
- Create one default sequence with the standard cadence.
- Do not create assignments or schedule items from existing data automatically.

Production backfill should be separate and explicit, if ever needed.

### Rollback strategy

Because tables are additive and should be empty at first:

1. Drop optional FK columns from existing tables if they were added.
2. Drop `campaign_schedule_items`.
3. Drop `campaign_sequence_steps`.
4. Drop `campaign_sequences`.
5. Drop `campaign_types`.

If data exists, rollback requires export/approval first.

### Application sequence

1. Local migration and schema tests.
2. Local repository tests.
3. Staging migration.
4. Staging read-only validation.
5. Production migration only after explicit approval and backup/rollback readiness.

---

## 9. Repository / Service / Action Impact

Future files likely needed:

Repositories:

- `modules/messaging/repositories/campaign-type.repo.ts`
- `modules/messaging/repositories/campaign-sequence.repo.ts`
- `modules/messaging/repositories/campaign-sequence-step.repo.ts`
- `modules/messaging/repositories/campaign-schedule-item.repo.ts`

Services:

- `modules/messaging/services/campaign-sequence.service.ts`
- `modules/messaging/services/campaign-schedule-preview.service.ts`
- `modules/messaging/services/campaign-schedule-generation.service.ts` (future, not in first persistence slice)

Actions:

- `modules/messaging/actions/campaign-sequence.actions.ts`
- read-only preview action if needed

UI:

- Campaign sequence list/detail/edit controls under Campaign Assets or Campaign Settings.
- Campaign Asset editor step attachment.
- Campaign Queue backed by schedule items.
- Operations schedule backed by schedule items.

Tests:

- `tests/phase3x-campaign-sequence-migration.test.ts`
- `tests/phase3x-campaign-sequence-repositories.test.ts`
- `tests/phase3x-campaign-sequence-ui.test.ts`

Do not implement any of these in Slice 4B.

---

## 10. UI Impact

### Campaign Assets list

Future list should show:

- campaign type,
- sequence,
- step number,
- day offset,
- asset status,
- approval state,
- whether asset is attached to an active sequence.

### New Campaign Asset / Sequence setup

Future setup should allow:

- create/select campaign type,
- create/select sequence,
- set sequence name,
- configure touches/day offsets,
- attach asset/template to each step,
- set approval requirement and stop condition,
- preview generated schedule.

### Campaign Queue

Should move from assignment-derived readiness to schedule-item rows:

- `draft_needed`
- `awaiting_approval`
- `approved`
- `blocked`
- `stopped_responded`

### Operations page

Should use `campaign_schedule_items` for production schedule counts and lists. It should remain read-only in the first schedule visibility slice.

### Message Workspace

Agents should read stored campaign rules and schedule context before generating strategy/drafts. No agent activation happens in the migration slice.

### Agent orchestration

Future orchestration reads:

- active default campaign sequence,
- due schedule item,
- step asset,
- approval requirement,
- stop condition,
- budget/system-control gates.

It must not send or schedule jobs until separately approved.

---

## 11. Safety Boundaries

This design explicitly confirms:

- No sending.
- No automation execution.
- No background jobs.
- No `EMAIL_SENDING_ENABLED` changes.
- No `CAMPAIGN_SENDING_ENABLED` changes.
- No approval mutation behavior.
- No production data mutation in this design step.
- No migration created in this step.
- No provider/sender changes.
- No system-control mutation.
- Slice 5 remains blocked.

---

## 12. Testing Plan

Future implementation tests should include:

Migration/schema tests:

- New migration file exists with only additive schema.
- Creates `campaign_types`, `campaign_sequences`, `campaign_sequence_steps`, `campaign_schedule_items`.
- No send/provider/system-control references.
- RLS and grants present.
- Check constraints for status and cadence fields present.

Repository tests:

- Tenant/workspace scoping on all reads/writes.
- Step order uniqueness assumed/enforced.
- Default sequence lookup scoped correctly.
- Schedule item read methods sort by `scheduled_for`.

Sequence creation tests:

- Creates type/sequence/steps together.
- Default cadence can be represented.
- Recurring step requires interval days.
- Non-recurring step requires day offset.

Schedule preview tests:

- Produces Day 1, 3, 7, 14, 31, 91.
- Produces bounded recurring tail preview.
- Does not insert schedule rows during preview.

Stop condition tests:

- `stop_on_response` persisted.
- Response trigger behavior stored.
- Future rows can be marked stopped in a later service.

No-send safety tests:

- No `sendFollowUpDraftAction`.
- No `approveAndSendAction`.
- No `EMAIL_SENDING_ENABLED` mutation.
- No `CAMPAIGN_SENDING_ENABLED` mutation.
- No Inngest/background job.

Operations read-only schedule tests:

- Operations imports schedule read model only.
- No mutation controls.
- No send controls.

Campaign Assets persistence tests:

- Editor/action passes sequence configuration only to reviewed sequence actions.
- Does not create drafts, approvals, sends, or schedule execution.

---

## 13. Open Questions

### Scope

Should campaign types be purely tenant/workspace scoped, or should the platform support global defaults with tenant overrides?

Recommendation for v1: tenant/workspace scoped only. Add global defaults later.

### Versioning

Should sequence versions become immutable after activation?

Recommendation: yes. Active sequences should be cloned into a new version for edits to avoid changing rules under existing assignments.

### Schedule generation

How far ahead should schedule items be generated?

Recommendation: non-recurring steps immediately; recurring tail up to 180 days ahead, renewed manually or by a later reviewed job.

Should recurring tail rows be generated lazily or ahead of time?

Recommendation: bounded ahead-of-time generation for visibility; future lazy generation only after automation review.

### Recipients

Should contacts, leads, and companies all be valid recipients?

Recommendation: assignments may target lead or contact, but schedule items should require at least contact or lead and derive company where available. Company-only should not be valid for email scheduling.

### Response detection

What exact event marks "customer responded"?

Open. Possible sources include inbound email events, manual operator marking, or CRM activity. Do not automate until the source is reliable and reviewed.

### Approval linkage

What approval object links to a schedule item?

Recommendation: `campaign_schedule_items.approval_request_id` links to the existing `approval_requests` row; `email_drafts.approval_request_id` remains the draft-side link.

### Asset ownership

Should campaign asset templates remain separate from sequence steps or become step-owned?

Recommendation: keep assets separate and reusable; steps reference assets.

---

## 14. Recommended Next Slice

Recommended next slice: **Slice 4C migration implementation only**, if this design passes Codex review.

Slice 4C should:

- create the additive migration only,
- update generated database types if project convention requires it,
- add source-reading tests for schema safety,
- not implement UI,
- not implement schedule generation,
- not add actions,
- not add sending,
- not add automation,
- not mutate production.

If review finds unresolved scope/RLS/versioning issues, revise this design first.
