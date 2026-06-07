# Goal 5 Slice 4 Design — Audit Ledger Migration Plan

---

## 1. Executive Summary

This document designs future database persistence for Verian Agent Bridge dry-run task packets, review queue items, Codex review artifacts, and append-only audit events. It does not create or apply any migration. It does not modify the Supabase schema. It does not run any database commands.

The purpose is to define the proposed tables, columns, constraints, indexes, FK delete behavior, RLS considerations, append-only audit expectations, and migration risks so that a future migration slice can be implemented safely and with full context — and only after explicit approval.

All proposed structures preserve the dry-run boundary. Every table includes `dry_run_only boolean not null default true`. Approval of a queue item does not authorize execution. No execution path is introduced by this design or by any future migration derived from it.

---

## 2. Why This Follows Slice 3

The progression that leads to this migration design:

- **Slice 1** defined the review queue and audit ledger design: 9 queue states, 6 approval actions, 12 audit event types, conceptual record shapes, and the 8-slice roadmap.
- **Slice 2** created type-only definitions in `modules/verian-agent-bridge/review-queue/types.ts` and `modules/verian-agent-bridge/audit-ledger/types.ts`. 15 types total. No runtime code.
- **Slice 3** locked type boundaries with 12 source-reading tests and tightened `VerianBridgeReviewQueueSubmission.initialState` to `VerianBridgeReviewQueueInitialState` — restricting entry states to `'draft_packet' | 'pending_policy_review'` only.
- **Slice 4** (this document) now designs persistence before any migration file is created, so the schema can be reviewed, questioned, and refined without risk.
- **Slice 5** revised this document to incorporate Codex's two non-blocking notes: make FK delete behavior explicit, and require app-role no-update/no-delete protections for `bridge_audit_events` from the first SQL slice.

No migration is created in this document. No migration is applied. The design remains a document until Michael explicitly approves proceeding to a migration-file slice.

---

## 3. Measurable Goal

This slice is complete when:

- [x] A migration design document exists at `docs/roadmap/goal-5-slice-4-audit-ledger-migration-design.md`
- [x] Proposed tables are defined (4 tables)
- [x] Proposed columns are defined per table
- [x] Proposed indexes are defined
- [x] FK delete behavior is defined for all relationships
- [x] Proposed RLS considerations are defined
- [x] Append-only audit expectations are defined (required, not optional)
- [x] Migration risks and stop conditions are defined
- [x] No migration file is created
- [x] No migration is applied

---

## 4. Explicit Non-Goals

This slice does not:

- Create SQL migration files
- Modify Supabase schema
- Apply migrations
- Run database commands
- Create repository files
- Create service files
- Create UI components
- Write data to any database
- Touch production, staging, or remote dev environments
- Enable bridge execution
- Enable model API calls
- Enable automation or background jobs

---

## 5. Proposed Future Tables

The following four tables are proposed for a future migration. They are **design-only** — none exist yet.

| Table | Purpose |
|---|---|
| `bridge_task_packets` | Stores dry-run task packets produced by `buildVerianBridgeDryRunPacket` |
| `bridge_review_queue_items` | Tracks current review status for each dry-run packet |
| `bridge_audit_events` | Append-only audit ledger for every packet and queue state transition |
| `bridge_codex_reviews` | Stores Codex review artifacts linked to packets and queue items |

All four tables include `dry_run_only boolean not null default true` with a check constraint requiring `dry_run_only = true`. No table contains an `execution_authorized` column set to true. Approval of a queue item does not authorize execution in any row of any table.

---

## 6. `bridge_task_packets` Design

**Purpose:** Stores dry-run task packets produced by `buildVerianBridgeDryRunPacket`. Preserves the full policy result, prompt summary and hash, agent, model route, risk level, evidence requirements, stop conditions, blocked actions, and the `dryRunOnly` boundary on each persisted packet.

**Proposed conceptual columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `tenant_id` | `uuid not null` | Multi-tenant isolation |
| `workspace_id` | `uuid not null` | Workspace isolation |
| `task_id` | `text not null` | Matches `VerianBridgeTaskId` |
| `goal_id` | `text null` | Optional goal reference |
| `slice_id` | `text null` | Optional slice reference |
| `policy_id` | `text not null` | Matches `VerianPolicyProfileId` |
| `agent_id` | `text not null` | Matches `VerianBridgeAgentId` |
| `agent_category` | `text not null` | Matches `VerianBridgeAgentCategory` |
| `recommended_model` | `text not null` | Matches `VerianBridgeModelFamily` |
| `risk_level` | `text not null` | `low`, `medium`, or `high` |
| `policy_check_status` | `text not null` | `pass`, `warning`, or `blocked` |
| `prompt_summary` | `text not null` | Non-sensitive summary of the prompt |
| `prompt_hash` | `text null` | Hash for future verification |
| `required_evidence` | `jsonb not null default '[]'` | Evidence list from packet |
| `stop_conditions` | `jsonb not null default '[]'` | Stop conditions from packet |
| `blocked_actions` | `jsonb not null default '[]'` | Blocked actions from packet |
| `packet_payload` | `jsonb not null` | Full serialized `VerianBridgeTaskPacket` |
| `dry_run_only` | `boolean not null default true` | Must always be true |
| `created_by` | `uuid null` | User who triggered the build (nullable for system) |
| `created_at` | `timestamptz not null default now()` | Creation timestamp |

**Proposed constraints:**

- `check (dry_run_only = true)` — the dry-run boundary cannot be disabled via row update
- `check (risk_level in ('low', 'medium', 'high'))`
- `check (policy_check_status in ('pass', 'warning', 'blocked'))`
- No `updated_at` — packets are immutable after creation; corrections require a new packet

**FK delete behavior:**

- Rows in `bridge_task_packets` must not be deletable through the app role once any `bridge_review_queue_items`, `bridge_audit_events`, or `bridge_codex_reviews` rows reference them.
- Child relationships must use `ON DELETE RESTRICT` or equivalent no-cascade behavior to prevent silent removal.
- If a packet contains an error, create a new corrected packet and preserve the original. Do not delete or update the original packet row.

---

## 7. `bridge_review_queue_items` Design

**Purpose:** Tracks the current review status for each dry-run packet as it moves through the 9-state lifecycle. Does not execute approved packets. `approved_for_manual_handoff` status does not authorize execution.

**Proposed conceptual columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `tenant_id` | `uuid not null` | Multi-tenant isolation |
| `workspace_id` | `uuid not null` | Workspace isolation |
| `packet_id` | `uuid not null references bridge_task_packets(id)` | FK to originating packet |
| `task_id` | `text not null` | Denormalized for query convenience |
| `title` | `text not null` | Human-readable queue item title |
| `status` | `text not null` | One of the 9 queue states (see below) |
| `requires_human_approval` | `boolean not null default false` | Surfaced from policy result |
| `requires_codex_review` | `boolean not null default false` | Surfaced from policy result |
| `current_policy_check_status` | `text not null` | Latest policy check status |
| `assigned_reviewer_id` | `uuid null` | Optional reviewer assignment |
| `last_decision_summary` | `text null` | Summary of most recent decision |
| `dry_run_only` | `boolean not null default true` | Must always be true |
| `created_at` | `timestamptz not null default now()` | Creation timestamp |
| `updated_at` | `timestamptz not null default now()` | Last status update timestamp |

**Proposed constraints:**

- `check (dry_run_only = true)`
- `check (status in ('draft_packet', 'pending_policy_review', 'blocked_by_policy', 'waiting_human_approval', 'waiting_codex_review', 'revision_requested', 'approved_for_manual_handoff', 'denied', 'archived'))`
- Status `approved_for_manual_handoff` does not mean execution authorization — this must be enforced at the application layer, not via DB constraint alone

**Important:** `bridge_review_queue_items` may be updated (status transitions are tracked here). Every status transition must produce a corresponding row in `bridge_audit_events`. The audit ledger is the immutable record; the queue item is the mutable current-state surface.

**FK delete behavior:**

- `packet_id` must reference `bridge_task_packets(id)` with `ON DELETE RESTRICT` — a packet may not be deleted while a queue item references it.
- Queue items must not be deleted through the app role. When a review is complete, the queue item must be transitioned to `status = 'archived'` — not deleted.
- Deleting a queue item must not cascade-delete audit events. `bridge_audit_events.queue_item_id` must use `ON DELETE RESTRICT`, preventing queue item deletion while audit events exist.

---

## 8. `bridge_audit_events` Design

**Purpose:** Append-only audit ledger for every packet and queue state transition. Every create, review action, approval, denial, revision request, Codex review, and archive must produce a row. Rows are never updated or deleted.

**Proposed conceptual columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `tenant_id` | `uuid not null` | Multi-tenant isolation |
| `workspace_id` | `uuid not null` | Workspace isolation |
| `packet_id` | `uuid not null references bridge_task_packets(id)` | FK to originating packet |
| `queue_item_id` | `uuid null references bridge_review_queue_items(id)` | FK to queue item (null for pre-queue events) |
| `task_id` | `text not null` | Denormalized for query convenience |
| `policy_id` | `text not null` | Policy profile at time of event |
| `event_type` | `text not null` | One of the 12 audit event types (see below) |
| `actor_type` | `text not null` | `michael`, `system`, `agent`, or `codex` |
| `actor_user_id` | `uuid null` | DB user reference when actor is human |
| `previous_state` | `text null` | Queue state before transition |
| `next_state` | `text null` | Queue state after transition |
| `summary` | `text not null` | Human-readable event summary |
| `evidence` | `jsonb not null default '[]'` | Supporting evidence at time of event |
| `prompt_summary` | `text null` | Prompt summary if relevant to event |
| `prompt_hash` | `text null` | Prompt hash for verification |
| `dry_run_only` | `boolean not null default true` | Must always be true |
| `created_at` | `timestamptz not null default now()` | Event timestamp — immutable |

**Proposed constraints:**

- `check (dry_run_only = true)`
- `check (event_type in ('packet_created', 'policy_check_passed', 'policy_check_warning', 'policy_check_blocked', 'human_approval_requested', 'human_approved', 'human_denied', 'revision_requested', 'codex_review_required', 'codex_review_received', 'manual_handoff_prepared', 'packet_archived'))`
- `check (actor_type in ('michael', 'system', 'agent', 'codex'))`
- No `updated_at` — the event timestamp is `created_at` only; events are never modified

**Append-only rule:**

The repository layer must never expose an `update` or `delete` method for `bridge_audit_events`. Corrections must be inserted as new events with `event_type = 'revision_requested'` or a suitable corrective event.

**App-role no-update/no-delete protection is required in the first SQL migration — not deferred.** A Supabase RLS policy or equivalent mechanism must deny `UPDATE` and `DELETE` on `bridge_audit_events` for the app role from the moment the table is created. This is not optional and must not be added "later." If DB-level protection is not yet possible in the first migration, the migration must not be applied until it is included.

If a DB-level trigger or policy is used to enforce append-only behavior, it must not call any external system, webhook, or background job.

**FK delete behavior:**

- `packet_id` must use `ON DELETE RESTRICT` — audit events may not be deleted by cascading from a packet deletion.
- `queue_item_id` must use `ON DELETE RESTRICT` — audit events may not be deleted by cascading from a queue item deletion.
- No FK behavior should allow audit events to be removed as a side effect of deleting a parent row.
- Audit events must be permanently preserved. They are the accountability record of every action taken on every packet.

---

## 9. `bridge_codex_reviews` Design

**Purpose:** Stores Codex review artifacts linked to packets and queue items. Codex review produces a structured artifact with blocking and non-blocking issues; it does not auto-apply suggestions.

**Proposed conceptual columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `tenant_id` | `uuid not null` | Multi-tenant isolation |
| `workspace_id` | `uuid not null` | Workspace isolation |
| `packet_id` | `uuid not null references bridge_task_packets(id)` | FK to originating packet |
| `queue_item_id` | `uuid not null references bridge_review_queue_items(id)` | FK to associated queue item |
| `task_id` | `text not null` | Denormalized for query convenience |
| `reviewed_by` | `text not null default 'codex'` | Always `'codex'` |
| `review_status` | `text not null` | `pass`, `pass_with_notes`, or `blocked` |
| `blocking_issues` | `jsonb not null default '[]'` | Issues that block approval |
| `non_blocking_issues` | `jsonb not null default '[]'` | Notes that do not block |
| `summary` | `text not null` | Human-readable review summary |
| `artifact_payload` | `jsonb not null` | Full serialized `VerianBridgeCodexReviewArtifact` |
| `dry_run_only` | `boolean not null default true` | Must always be true |
| `created_at` | `timestamptz not null default now()` | Review timestamp |

**Proposed constraints:**

- `check (reviewed_by = 'codex')`
- `check (review_status in ('pass', 'pass_with_notes', 'blocked'))`
- `check (dry_run_only = true)`
- No `updated_at` — Codex review artifacts are immutable; a new review produces a new row

**FK delete behavior:**

- Codex review artifacts are immutable once created.
- `packet_id` must use `ON DELETE RESTRICT` — a Codex review artifact must not be deleted by cascading from a packet deletion.
- `queue_item_id` must use `ON DELETE RESTRICT` — a Codex review artifact must not be deleted by cascading from a queue item deletion.
- The app role must not be permitted to delete Codex review artifacts.
- If a Codex review is superseded by a new review (e.g., after a revision cycle), insert a new `bridge_codex_reviews` row — do not update or delete the original artifact.

---

## 10. FK Delete Behavior

All FK relationships between the four proposed tables must use restrictive, no-cascade delete behavior. This section defines the explicit policy for every relationship.

**Design position:**

- Default behavior is restrictive: child records prevent parent deletion.
- No `ON DELETE CASCADE` may be used on any relationship involving audit-bearing tables.
- Audit history must never be silently removed as a side effect of deleting a packet, queue item, or Codex review artifact.
- If future cleanup of test or invalid data is needed, it must be a separate admin-only archival operation — designed explicitly, not normal app behavior.

**Required FK delete behavior per relationship:**

| FK | From Table | References | Required Behavior |
|---|---|---|---|
| `bridge_review_queue_items.packet_id` | `bridge_review_queue_items` | `bridge_task_packets(id)` | `ON DELETE RESTRICT` |
| `bridge_audit_events.packet_id` | `bridge_audit_events` | `bridge_task_packets(id)` | `ON DELETE RESTRICT` |
| `bridge_audit_events.queue_item_id` | `bridge_audit_events` | `bridge_review_queue_items(id)` | `ON DELETE RESTRICT` |
| `bridge_codex_reviews.packet_id` | `bridge_codex_reviews` | `bridge_task_packets(id)` | `ON DELETE RESTRICT` |
| `bridge_codex_reviews.queue_item_id` | `bridge_codex_reviews` | `bridge_review_queue_items(id)` | `ON DELETE RESTRICT` |

**Why `ON DELETE RESTRICT` and not `ON DELETE CASCADE`:**

`ON DELETE CASCADE` would allow a packet deletion to silently remove all associated queue items, audit events, and Codex review artifacts. This would destroy the accountability record — the entire purpose of the audit ledger. A packet or queue item that has been reviewed, approved, denied, or audited must not be deletable through normal app behavior.

**Correction protocol:**

- If a packet contains an error, create a new corrected packet. Preserve the original.
- If a queue item needs to be closed, transition it to `status = 'archived'`. Do not delete it.
- If a Codex review is outdated, insert a new review artifact. Do not update or delete the original.
- Corrections to audit events must be inserted as new audit events. The erroneous event is preserved.

**Admin archival (future design, not this slice):**

If legitimate data cleanup is ever required (e.g., removing test data from a staging environment), that operation must be designed as a separate admin-only process with explicit multi-step authorization. It must not be a normal app capability and must not be enabled by the application-role permissions established in the first migration.

---

## 11. Proposed Indexes

All indexes are design-only. None are created in this slice.

**`bridge_task_packets`:**

| Index | Columns | Purpose |
|---|---|---|
| `idx_btp_tenant_workspace_created` | `(tenant_id, workspace_id, created_at)` | Multi-tenant packet listing |
| `idx_btp_task_id` | `(task_id)` | Look up packets by task |
| `idx_btp_policy_id` | `(policy_id)` | Look up packets by policy profile |

**`bridge_review_queue_items`:**

| Index | Columns | Purpose |
|---|---|---|
| `idx_brqi_tenant_workspace_status_created` | `(tenant_id, workspace_id, status, created_at)` | Active queue listing by status |
| `idx_brqi_packet_id` | `(packet_id)` | Look up queue item from packet |
| `idx_brqi_reviewer_status` | `(assigned_reviewer_id, status)` | Reviewer's active items |

**`bridge_audit_events`:**

| Index | Columns | Purpose |
|---|---|---|
| `idx_bae_tenant_workspace_created` | `(tenant_id, workspace_id, created_at)` | Full audit log listing |
| `idx_bae_packet_id_created` | `(packet_id, created_at)` | Audit trail for a packet |
| `idx_bae_queue_item_id_created` | `(queue_item_id, created_at)` | Audit trail for a queue item |
| `idx_bae_event_type_created` | `(event_type, created_at)` | Filter by event type |

**`bridge_codex_reviews`:**

| Index | Columns | Purpose |
|---|---|---|
| `idx_bcr_packet_id_created` | `(packet_id, created_at)` | Codex reviews for a packet |
| `idx_bcr_queue_item_id_created` | `(queue_item_id, created_at)` | Codex reviews for a queue item |

---

## 12. Proposed RLS Considerations

All RLS design is design-only. No RLS SQL is created in this slice.

| Consideration | Detail |
|---|---|
| Tenant isolation | `tenant_id` and `workspace_id` are required on all tables. RLS policies must filter by both. |
| Read access | Workspace members should be able to read records for workspaces they belong to. |
| Insert access | Insert policies should be limited to authenticated workspace members or service role, depending on future implementation. |
| Update access | Only `bridge_review_queue_items` should allow updates (status transitions). All other tables must be insert-only from the app role. |
| Delete access | No table should allow deletes from the app role. The audit ledger must be delete-proof. |
| Audit events — required from first SQL slice | `bridge_audit_events` must deny `UPDATE` and `DELETE` for the app role from the moment the table is created. This is not optional and must not be deferred. |
| Codex reviews | `bridge_codex_reviews` must deny `UPDATE` and `DELETE` for the app role. Reviews are immutable artifacts once inserted. |
| Task packets | `bridge_task_packets` must deny `DELETE` for the app role once referenced by queue, audit, or Codex review records. `ON DELETE RESTRICT` FKs enforce this at the DB level. |
| Queue items | `bridge_review_queue_items` must prefer status transitions and archival over deletes. The app role must not delete queue items. Archiving uses `status = 'archived'`, not row deletion. |
| Approval writes | Reviewer approvals and denials must update only `bridge_review_queue_items.status` and `last_decision_summary`. They must never update `bridge_audit_events` rows. |
| Approval writes | Approval and denial actions should require an explicit authorized reviewer role in future design. |

---

## 13. Append-Only Audit Enforcement Design

The append-only property of `bridge_audit_events` must be enforced at multiple levels. DB-level enforcement is required — it is not optional or deferrable.

**Application layer:**

- The future audit ledger repository must expose only an `append(request: VerianBridgeAuditAppendRequest)` method.
- No `update`, `delete`, `upsert`, or `truncate` method may exist on the audit repository.
- Source-reading tests (in a future test slice) must assert that the repository file contains no `update` or `delete` audit event call patterns.

**Database layer — required from the first SQL migration:**

- A Supabase RLS policy or equivalent mechanism must deny `UPDATE` and `DELETE` on `bridge_audit_events` for the app role.
- This protection must be included in the first SQL migration that creates the `bridge_audit_events` table. It must not be deferred to a later slice.
- If the DB-level protection cannot be included in the first migration, the migration must not be applied until it is ready.
- A check constraint on `created_at` (e.g., disallowing past timestamps beyond a small clock-skew window) may also be considered.
- If a DB-level trigger or policy is used to enforce append-only behavior, it must not call any external system, webhook, or background job.

**Correction protocol:**

- If an audit event contains an error, the correction must be a new event.
- The erroneous event is preserved — it is part of the accountability record.
- The corrective event should reference the original event ID in its `summary`.

**Immutability preserves accountability:**

- The audit ledger is the only append-only source of truth for what happened to each packet, who approved or denied it, and when.
- Any mutation of that ledger — even for corrections — would compromise the accountability guarantee.

---

## 14. Prompt Privacy and Storage Design

| Consideration | Detail |
|---|---|
| Default storage | `prompt_summary` (non-sensitive summary) and `prompt_hash` are stored by default. |
| Full prompt | The full prompt may be stored in `packet_payload` only if explicitly approved in a future design review. |
| Secrets | Secrets and credentials must never appear in any stored column. |
| Redaction | Future prompt redaction logic should be designed before any real prompt reaches a live model. |
| Hash verification | `prompt_hash` allows verifying that an approved prompt matches a later executed prompt, without exposing the full prompt text in the audit record. |

---

## 15. Dry-Run Boundary Design

All four tables preserve the dry-run boundary:

| Boundary | Design |
|---|---|
| `dry_run_only` column | All four tables include `dry_run_only boolean not null default true` |
| Check constraint | A future migration must include `check (dry_run_only = true)` on all four tables |
| Approval ≠ execution | `approved_for_manual_handoff` status does not create or modify any execution authorization |
| No `execution_authorized = true` | No row in any table should carry `execution_authorized = true`; the only occurrence of `execution_authorized` is as `false` on `VerianBridgeManualHandoffApproval` |
| Execution design | Future execution requires a separate goal with explicit multi-slice authorization, not a continuation of Goal 5 |

---

## 16. Migration Risk Assessment

| Risk | Mitigation |
|---|---|
| Migration applied too early | Do not create migration file until Michael approves. Do not apply migration until separate explicit approval. |
| Schema drift from type definitions | Source-reading tests in a future slice should assert that migration column names match type field names. |
| Audit ledger allowing updates/deletes | Application repository must expose append-only interface. First SQL migration must include app-role no-update/no-delete RLS or equivalent protection. |
| Approval state mistaken for execution authorization | Application layer must enforce that `approved_for_manual_handoff` does not trigger any execution path. Source-reading tests should verify this. |
| Sensitive prompt data stored | Default to summary + hash only. Full prompt requires explicit approval. No secrets in any column. |
| Insufficient RLS | RLS design should be reviewed before migration is applied. Tenant and workspace isolation is required. |
| Missing tenant/workspace isolation | Both columns required on all tables, enforced by not-null constraints and RLS policies. |
| Slow review queue queries | Indexes on `(tenant_id, workspace_id, status, created_at)` for queue items must be included in the migration. |
| `dry_run_only` disabled by row update | Check constraint `check (dry_run_only = true)` must prevent this. |
| Reference integrity violations | FK constraints between tables (packets → queue items → audit events → Codex reviews) must be defined in the migration. |
| Cascade deletes remove audit history | All FK relationships on audit-bearing tables must use `ON DELETE RESTRICT`. No `ON DELETE CASCADE` may be used. |
| App role can mutate audit records | First SQL migration must include app-role no-update/no-delete RLS or equivalent for `bridge_audit_events`. This cannot be deferred. |
| Cleanup operation destroys evidence | All cleanup must use archival (status transitions, new correction events), never row deletion. Admin archival for test data requires a separate explicit design. |

---

## 17. Proposed Future Migration Slice

A future slice (pending Michael approval) may:

- Create a single SQL migration file only
- Define all four tables with the columns, constraints, and indexes described in this document
- Include explicit `ON DELETE RESTRICT` FK behavior on all audit-bearing relationships
- Include app-role no-update/no-delete RLS or equivalent protection for `bridge_audit_events` from the first line of the migration
- Include source-reading tests for SQL safety (see Section 18)
- Not apply the migration
- Not create an application repository or service
- Be submitted for Codex review before any `supabase db push` or `supabase migration apply` command is run

The FK delete protections and `bridge_audit_events` app-role restrictions must be present from the start of the migration — they are not post-hoc additions.

No migration should be created or applied until Michael explicitly approves this design and authorizes the migration slice.

---

## 18. Future Source-Reading Migration Tests

When the SQL migration file is created, source-reading tests should verify:

| Test | What to assert |
|---|---|
| Tenant/workspace isolation | All four tables include `tenant_id` and `workspace_id` columns |
| `dry_run_only` default | All four tables include `dry_run_only boolean not null default true` |
| Check constraints | `check (dry_run_only = true)` present on all four tables |
| Audit append-only | Migration does not define any `update` or `delete` trigger or function on `bridge_audit_events` |
| Audit app-role protection | Migration includes RLS or equivalent that denies `UPDATE` and `DELETE` on `bridge_audit_events` for the app role |
| Codex review app-role protection | Migration includes RLS or equivalent that denies `UPDATE` and `DELETE` on `bridge_codex_reviews` for the app role |
| No sending columns | No column named `email_sending_enabled`, `campaign_sending_enabled`, or similar |
| No execution column | No `execution_authorized boolean ... default true` in any table |
| No external trigger | No trigger body calls a webhook, external function, or background job |
| No background job table | Migration does not create a `cron`, `job_queue`, or similar automation table |
| FK integrity | `bridge_review_queue_items.packet_id` references `bridge_task_packets(id)` |
| FK integrity | `bridge_audit_events.packet_id` references `bridge_task_packets(id)` |
| FK integrity | `bridge_codex_reviews.packet_id` and `queue_item_id` reference correct tables |
| FK no-cascade | No `ON DELETE CASCADE` appears on any FK referencing `bridge_task_packets` or `bridge_review_queue_items` |
| FK restrictive behavior | FK relationships on audit-bearing tables use `ON DELETE RESTRICT` or equivalent no-cascade behavior |
| Audit event cascade prevention | `bridge_audit_events` FK constraints prevent deletion of audit events through parent row cascade |
| Queue item archival | No migration trigger or function deletes `bridge_review_queue_items` rows; archival uses status transitions only |

---

## 19. Stop Conditions

Stop immediately and do not proceed if:

- A migration file is created in this slice
- A migration is applied
- A database command is run (`supabase db push`, `supabase migration apply`, `psql`, etc.)
- Production, staging, or remote dev is touched
- A repository, service, UI component, or API route is created
- Bridge execution is added
- An external model API call is added
- Prompt sending is added
- Email or campaign sending is added
- Automation or background jobs are added
- The `dryRunOnly` boundary is weakened on any type or table

---

## 20. Recommended Next Step

Two options, in order of preference:

**Option A — Codex review of this revised migration design:**
Submit this revised document to Codex for independent review. This revision strengthens FK delete behavior and makes app-role audit protections required from the first SQL slice. Codex review confirms the design is sound before any SQL is written.

**Option B — Proceed to a SQL migration-file-only slice after Michael approval:**
If Michael approves this revised design, a future Goal 5 slice may create a SQL migration file (no apply). The file must include, from the first migration:
- All four tables with columns, constraints, and indexes as described here
- `ON DELETE RESTRICT` FK behavior on all audit-bearing relationships
- App-role no-update/no-delete RLS or equivalent for `bridge_audit_events`
- App-role no-update/no-delete RLS or equivalent for `bridge_codex_reviews`

The migration file must then be submitted for Codex review before any `supabase db push` or `supabase migration apply` command is run.

**In either case:**
No migration should be created or applied until Michael explicitly approves this revised design document and authorizes the next step. The FK protections and audit event app-role restrictions are not optional — they must be present from the first migration, not added incrementally.

---

*Goal 5 Slice 4 revised in Slice 5. FK delete behavior and append-only audit enforcement strengthened per Codex notes. No migration created. No migration applied. No code changed. No DB touched.*
