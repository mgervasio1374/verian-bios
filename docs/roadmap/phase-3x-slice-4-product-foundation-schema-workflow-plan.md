# Phase 3X Slice 4 — Product Foundation Schema and Workflow Plan

**Status:** Design only  
**Created:** 2026-06-07  
**Baseline:** `b608f0e` — Phase 3X Slice 3 product gap correction  
**Implementation allowed in this slice:** None  
**Slice 5:** Blocked until this plan is reviewed and an implementation slice is explicitly approved

---

## 1. Executive Diagnosis

Phase 3X Slices 1-3 improved visible product shape: brand tokens, logo references, CRM usability, operations visibility, campaign terminology, and read-only planning surfaces. These changes were useful, but they were intentionally shallow because the guardrails excluded the things required for durable workflow utility:

- No schema changes, so campaign sequence settings could only be previewed, not saved.
- No scheduling tables, so Operations could only summarize existing drafts, approvals, assignments, proposals, and follow-ups.
- No auth/RLS/permission changes, so User Management could only be a planning page.
- No system-control changes, send enablement, background jobs, or orchestration, so agents could not become live campaign operators.
- No provider/sender/config changes, so approved sends stayed gated and Slice 5 stayed blocked.

The next stage needs controlled foundation work, not another UI-only pass. The product blocker is not copy, spacing, or navigation. The blocker is that Verian needs a persisted campaign sequence model, schedule records, operator-safe mutation boundaries, and a staged activation path for agents and users.

This plan designs that foundation while keeping implementation, migrations, sending, automation, and production activity out of scope.

---

## 2. Brand / Logo Correction Plan

### Current problem

The app now references the official `public/brand/verian-logo.png`, but the sidebar still reads visually wrong because the source image appears to include substantial canvas whitespace and is being squeezed into a narrow dark sidebar. Increasing CSS height improves it only partially; the actual sidebar-ready asset crop/export is missing.

### Correct solution

Create a sidebar-ready derivative from the provided official logo asset:

- Use only the official operator-provided logo file as source.
- Do not recreate, trace, generate, redraw, or substitute the logo.
- Preserve official proportions and letterforms.
- Remove excess transparent/white canvas whitespace around the official logo if present.
- Export a sidebar-ready PNG or SVG derivative such as `public/brand/verian-logo-sidebar.png`.
- Keep the original official logo file unchanged for auditability.
- Update sidebar dimensions only after the sidebar-ready derivative exists.

### Acceptance criteria

- Logo is clearly legible in the sidebar at normal desktop size.
- No tiny white rectangle effect.
- No adjacent "Verian BIOS" text.
- Official mark/wordmark remains proportionally correct.
- The source official logo remains committed and unmodified.
- Any derivative is documented as cropped/exported from the official asset, not generated.

### Risk

Low if the operator provides or approves the cropped derivative. Medium if image manipulation is performed in-repo because it must preserve brand geometry exactly.

---

## 3. Campaign Configuration Foundation

### What already exists

Existing tables:

- `campaign_email_assets` — reusable email templates with `campaign_type`, subject/body templates, merge fields, fallback values, and asset status.
- `campaign_assignments` — assigns a `campaign_type` and optional `campaign_asset_id` to a lead/contact.
- `email_drafts` — stores generated drafts and approval linkage.
- `approval_requests` — review workflow for drafts/assets.
- `email_sends` and `campaign_email_sends` — send tracking foundations.
- `system_controls` — runtime gates including email and campaign sending controls.

Existing UI/services:

- Campaign Asset list/detail/editor.
- Asset create/edit/review/approve/activate/retire flows.
- Campaign assignment proposal/accept/retire repository support.
- Draft-from-asset flow and approval linkage.

### What is missing

The current schema cannot persist a real multi-step sequence. `campaign_type` is currently a text label repeated across assets and assignments. There is no durable sequence definition, no step order, no step-level day offset, no recurring cadence rule, no stop condition record, and no schedule item table that materializes planned production.

### Proposed schema model

#### `campaign_types`

Purpose: durable named campaign program.

Suggested fields:

- `id`
- `tenant_id`
- `workspace_id`
- `name`
- `slug`
- `description`
- `status` (`draft`, `active`, `retired`)
- `default_approval_required` boolean
- `default_stop_condition` text, e.g. `response_detected`
- `created_by_user_id`
- `created_at`, `updated_at`, `retired_at`

#### `campaign_sequences`

Purpose: versionable sequence attached to a campaign type.

Suggested fields:

- `id`
- `tenant_id`
- `workspace_id`
- `campaign_type_id`
- `sequence_name`
- `sequence_version`
- `status` (`draft`, `active`, `retired`)
- `touch_count`
- `approval_required`
- `stop_condition`
- `response_trigger`
- `long_tail_enabled`
- `long_tail_interval_days`
- `created_by_user_id`
- `created_at`, `updated_at`, `retired_at`

#### `campaign_sequence_steps`

Purpose: ordered touch definitions.

Suggested fields:

- `id`
- `tenant_id`
- `workspace_id`
- `campaign_sequence_id`
- `step_index`
- `touch_label`
- `day_offset`
- `asset_id` nullable FK to `campaign_email_assets`
- `requires_approval`
- `is_long_tail`
- `long_tail_interval_days`
- `created_at`, `updated_at`

Default cadence:

| Step | Day offset |
| --- | --- |
| 1 | Day 1 |
| 2 | Day 3 |
| 3 | Day 7 |
| 4 | Day 14 |
| 5 | Day 31 |
| 6 | Day 91 |
| 7+ | Every 90 days until response or manual stop |

#### Extend `campaign_email_assets`

Current table can remain the asset/template library. Future migration should consider adding:

- `campaign_type_id` nullable FK to `campaign_types`
- `sequence_step_id` nullable FK to `campaign_sequence_steps`

Keep `campaign_type` text during transition for backward compatibility. Do not remove existing fields in the first migration.

#### Extend `campaign_assignments`

Current table can represent a campaign assigned to a lead/contact, but it needs durable links:

- `campaign_type_id`
- `campaign_sequence_id`
- `started_at`
- `stopped_at`
- `stop_reason`
- `responded_at`
- `manual_stop_by_user_id`

Keep current `campaign_type` and `campaign_asset_id` during transition.

#### `campaign_schedule_items` or `campaign_touch_schedule`

Purpose: materialized planned production records for Operations and later automation.

Suggested fields:

- `id`
- `tenant_id`
- `workspace_id`
- `campaign_assignment_id`
- `campaign_sequence_id`
- `campaign_sequence_step_id`
- `lead_id`
- `contact_id`
- `asset_id`
- `scheduled_for`
- `schedule_status`
- `draft_id`
- `approval_request_id`
- `email_send_id`
- `blocked_reason`
- `stop_reason`
- `created_at`, `updated_at`

Suggested statuses:

- `planned`
- `draft_needed`
- `draft_ready`
- `awaiting_approval`
- `approved`
- `scheduled`
- `sent`
- `blocked`
- `stopped_responded`
- `manually_stopped`

### Stop conditions and response behavior

The model should store both default and effective stop rules:

- Campaign type default: `response_detected`.
- Sequence default: inherited or overridden.
- Assignment effective rule: copied at assignment time.
- Schedule behavior: future pending items move to `stopped_responded` when a response is detected.

Response detection itself should remain future work unless an existing reliable event source is explicitly wired and reviewed. The first schema slice should only define the fields and read model.

### Migration need

A migration is required. Current tables cannot support real sequence persistence or schedule materialization without overloading text/json fields. The migration should be additive and should not send, schedule, or execute anything.

---

## 4. Campaign Asset Creation Requirements

Once persistence exists, Campaign Asset creation should evolve from "create one reusable email template" into a two-part workflow:

1. Create or select the campaign type/sequence.
2. Create or attach assets/templates to sequence steps.

### Required future UX

New Campaign Asset / Sequence setup should allow an operator to:

- Select campaign type.
- Define sequence name.
- Set touch count.
- Configure day offsets.
- Attach assets/templates to sequence steps.
- Set approval requirement.
- Set stop condition.
- Set response trigger.
- Preview generated schedule.
- Save configuration.

### Persistence behavior

- Save campaign type/sequence/steps first.
- Save or attach campaign assets to specific steps.
- Generate schedule preview from `campaign_sequence_steps`.
- Do not create schedule items until an assignment is accepted or created.

### Explicit exclusions

- No sending in Slice 4 design.
- No automation execution.
- No `EMAIL_SENDING_ENABLED` change.
- No `CAMPAIGN_SENDING_ENABLED` change.
- No background job or cron.
- No draft approval mutation unless a later slice explicitly scopes it.

---

## 5. Operations Scheduling Foundation

### Current state

Operations currently derives a production snapshot from:

- Proposal follow-up queue rows.
- Open proposal events.
- Pending approval requests.
- Lead stage counts.
- Email draft status counts.
- Proposed campaign assignments.

This is useful visibility, but it is not a production schedule. The counts are inferred from separate systems rather than backed by planned schedule records.

### Future schedule data source

`campaign_schedule_items` should power the production schedule. Each row represents one planned or completed touch for one assignment.

### State mapping

| Operations state | Data source |
| --- | --- |
| Planned | `campaign_schedule_items.schedule_status = 'planned'` |
| Draft Needed | schedule item has no `draft_id` and due window is approaching |
| Draft Ready | `draft_id` exists with draft status `draft` or `pending_approval` before approval request is created |
| Awaiting Approval | linked `approval_request_id` is pending |
| Approved | linked draft status is `approved` and no send occurred |
| Scheduled | approved schedule item with future `scheduled_for` and send gate still closed |
| Sent | linked `email_send_id` or draft status `sent` |
| Blocked | `blocked_reason` is set or readiness check fails |
| Stopped / Responded | assignment stopped by response/manual stop and pending future items are closed |

### Operator view

Operators should see:

- Today/this week planned touches.
- Which items need drafts.
- Which items are awaiting approval.
- Which approved items are ready but gated.
- Which items are blocked and why.
- Which items were stopped due to response.

### Read-only versus future actions

Initial Operations schedule should remain read-only after the schema/read model lands. Future actions such as create draft, approve, reschedule, stop assignment, or send should be separate reviewed slices.

---

## 6. Agent Activation Foundation

"Agents live" should not mean uncontrolled background automation. In Verian it should mean agents can operate inside an approved, observable workflow with hard gates.

### Implemented foundations

The codebase already includes:

- Message Strategy Agent service/action and lead workspace UI.
- Copywriting Agent modules and action path.
- Quality Review Agent service/action path.
- Learning Agent service/action and monitor visibility.
- Agent run/step tables.
- Agent decisions and AI usage events.
- Guardrail and system control tables.
- Human review and approval infrastructure.
- Email draft and send reliability hardening.

### Missing orchestration

What is missing is not agent code alone. Missing pieces are:

- Campaign sequence rules.
- Campaign assignment-to-schedule expansion.
- Draft generation orchestration per scheduled touch.
- Approval queue integration per touch.
- Budget gates per agent stage.
- Test recipient allowlist.
- Audit log for each automated decision and operator override.
- Kill switch enforcement across each orchestration stage.
- Operator supervision UI for queue, blocked items, and outcomes.
- Event feedback loop from opens/replies/sends to stop rules and learning.

### Staged activation path

#### Stage 1: strategy/draft generation only

- Agents may generate strategy and drafts.
- No sending.
- Operator must review and approve.
- Budget and global pause gates enforced.

#### Stage 2: approved draft queue

- Schedule items create draft work.
- Drafts land in approval queue.
- Approval remains manual.
- No delivery unless `EMAIL_SENDING_ENABLED` is explicitly enabled for a future controlled test.

#### Stage 3: internal allowlisted send test

- One or small batch internal recipients only.
- `EMAIL_SENDING_ENABLED` enabled only for selected scope.
- Provider/sender verified in non-production or explicitly approved environment.
- Immediate disable after test.

#### Stage 4: limited production sending

- Small controlled production scope.
- Strict allowlists, rate limits, rollback plan, audit, and monitoring.
- Human approval still required.

#### Stage 5: automated campaign orchestration

- Background orchestration may create schedule work and drafts.
- Sending remains gated by approval, readiness, controls, and rate limits.
- Campaign sending requires separate `CAMPAIGN_SENDING_ENABLED` review and explicit enablement.

---

## 7. User Management Foundation

### Current schema

The platform already has:

- `tenants`
- `workspaces`
- `roles`
- `permissions`
- `role_permissions`
- `memberships`
- RLS helper functions and policies
- `buildRequestContext`, `resolveMembership`, `resolvePermissions`, and `requirePermission`

This means user management should not start by inventing a new auth model. It should expose and harden the existing model.

### Missing product implementation

Missing pieces:

- Workspace user list.
- Admin role visibility.
- Role assignment UI.
- Invitation creation and acceptance flow.
- Invitation expiry/revoke/resend.
- Membership status transitions.
- Audit events for every membership/role change.
- Clear first-tenant bootstrap rule.
- Tests for RLS and tenant/workspace isolation.

### First three admins

The requested "first three users as admins" must be designed carefully:

- It should be a one-time bootstrap policy, not an ongoing implicit rule.
- It should be scoped by tenant/workspace.
- It should be auditable.
- It must not silently promote users in production without explicit operator approval.
- It likely belongs in a seed/admin setup script or controlled admin action, not normal UI code.

### RLS and permission implications

Writable user management touches the most sensitive tables in the app. It must answer:

- Who can invite users?
- Who can assign admin roles?
- Can admins demote themselves?
- Can tenant admins modify platform admins?
- Can one workspace admin see another workspace?
- How are pending invites represented before `auth.users` exists?
- What is the rollback path for bad role assignments?

This should be its own high-risk implementation slice after design review.

---

## 8. Recommended Implementation Sequence

| Slice | Scope | Risk | Notes |
| --- | --- | --- | --- |
| 4A | Logo asset/treatment correction | Low/Medium | Requires sidebar-ready crop/export from official asset; no generated substitute. |
| 4B | Campaign sequence schema migration design | High | Design migration only; define tables, RLS, indexes, rollback. |
| 4C | Campaign sequence persistence implementation | High | Add additive migration, repos, services, tests; no sending/automation. |
| 4D | Campaign Asset creation/edit UI wired to persistence | Medium/High | Save sequence/steps/assets; no schedule execution. |
| 4E | Operations schedule view wired to campaign schedule records | Medium | Read-only schedule from materialized rows. |
| 4F | Agent activation design | High | Design orchestration, gates, allowlists, audit, rollback before implementation. |
| 4G | User management design/implementation plan | High | Memberships/invites/roles/RLS; likely split into read-only first, then writes. |

Recommended next implementation slice: **Slice 4A logo correction** if the operator can provide or approve a sidebar-ready crop/export. Otherwise proceed to **Slice 4B campaign sequence schema migration design**.

---

## 9. Stop Conditions

Stop implementation immediately if any of the following appear:

- Schema uncertainty or conflicting table ownership.
- RLS ambiguity.
- Permission model ambiguity.
- Send behavior appears in the slice.
- Approval mutation behavior appears outside explicit scope.
- Background jobs, cron, Inngest, or automation are required.
- Production data write risk exists.
- Migration rollback is unclear.
- Tests are missing or source-reading tests do not cover safety boundaries.
- Campaign sequence persistence is attempted without reviewed schema.
- User management write behavior is attempted without reviewed auth/RLS plan.
- Agent activation requires enabling system controls or send gates.
- Provider/sender configuration is required.
- `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED` changes are proposed.

---

## 10. Acceptance Criteria

This plan is acceptable only if it moves Verian toward real product utility:

- Logo correction becomes an asset/treatment fix, not more CSS guessing.
- Campaign configuration becomes a persisted sequence model, not a preview card.
- Campaign Assets can eventually save sequence settings and attach templates to touches.
- Operations can eventually show real planned schedule items, not inferred counts only.
- Agents have a staged activation path with explicit gates and supervision.
- User management is treated as a sensitive platform capability, not a quick UI form.
- No sending, automation, production changes, migrations, or system-control mutations occur in this design slice.

---

## 11. Design Conclusion

The product has reached the limit of safe UI-only acceleration. The next useful work must be foundation work: logo asset correction, campaign sequence schema, schedule materialization, and high-risk design for agent activation and user management.

The safest near-term path is:

1. Fix the logo with an official sidebar-ready derivative.
2. Design the campaign sequence migration in detail.
3. Implement sequence persistence and read-only schedule visibility before any automation.
4. Keep Slice 5 blocked until send enablement evidence and controls are explicitly reviewed.
