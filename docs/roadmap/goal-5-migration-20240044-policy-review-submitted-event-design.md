# Goal 5 Migration 20240044 — Policy Review Submitted Audit Event Type

**Status:** Design only. No migration file created. No migration applied.  
**Risk:** MEDIUM — single CHECK constraint extension on one table. Additive only.  
**Purpose:** Add `policy_review_submitted` to the `bridge_audit_events.event_type` CHECK constraint, unblocking Goal 5 Slice 11 (Policy-Check Service) implementation.  
**Implementation blocked:** This design document does not authorize migration file creation or apply. A separate authorization prompt is required after Codex review.  

---

## 1. Background and Need

The `bridge_audit_events` table (created in migration 20240041) has a CHECK constraint on the `event_type` column with exactly 12 allowed values. The Goal 5 Slice 11 `submitForPolicyReview` service function must write audit event type `policy_review_submitted`, which is not among those 12 values.

Inserting a row with `event_type = 'policy_review_submitted'` against the current schema will fail with a CHECK constraint violation at runtime. Slice 11 implementation cannot begin until this constraint is extended.

**Migrations 20240042 and 20240043 confirmed not to alter this constraint:**
- 20240042: grants/revokes only (`REVOKE`/`GRANT` on all four bridge tables) — no `ALTER TABLE`
- 20240043: `REVOKE MAINTAIN`/`GRANT` only — no `ALTER TABLE`

The CHECK constraint on `bridge_audit_events.event_type` is unchanged since its creation in 20240041.

---

## 2. Current CHECK Constraint (confirmed from source)

Source file: `supabase/migrations/20240041_bridge_review_queue_audit_ledger.sql`, lines 165–179.

The `bridge_audit_events.event_type` column was defined as:

```sql
event_type  text  NOT NULL
            CHECK (event_type IN (
              'packet_created',
              'policy_check_passed',
              'policy_check_warning',
              'policy_check_blocked',
              'human_approval_requested',
              'human_approved',
              'human_denied',
              'revision_requested',
              'codex_review_required',
              'codex_review_received',
              'manual_handoff_prepared',
              'packet_archived'
            )),
```

**Total current allowed values: 12.**

The TypeScript type `VerianBridgeAuditEventType` in `modules/verian-agent-bridge/audit-ledger/types.ts` exactly mirrors these 12 values — the two are in sync.

---

## 3. Required Addition — Exactly One New Value

Add exactly **one** new allowed value to the `bridge_audit_events.event_type` CHECK constraint:

```
policy_review_submitted
```

**Do NOT add:**
- `policy_check_requires_codex` — this is a queue *action* name; its audit event type maps to the existing `codex_review_required` (already in schema). No DB change needed.
- `policy_check_requires_human` — this is a queue *action* name; its audit event type maps to the existing `human_approval_requested` (already in schema). No DB change needed.

**After migration the allowed list is 13 values** — the existing 12 plus `policy_review_submitted`.

---

## 4. Constraint Name — Known Uncertainty

The CHECK constraint on `event_type` was defined **inline** (no explicit `CONSTRAINT name` clause) in the `CREATE TABLE` statement in 20240041. PostgreSQL auto-generates a name for inline CHECK constraints, typically following the pattern:

```
{table_name}_{column_name}_check
```

For this column the expected auto-generated name is:

```
bridge_audit_events_event_type_check
```

**This name cannot be confirmed from source files alone.** It requires a database query (`\d bridge_audit_events` in psql, or `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'bridge_audit_events' AND constraint_type = 'CHECK';`) against the local database.

**Resolution:** The actual constraint name must be confirmed during the pre-apply discovery step (see §7) before the migration file is finalized and applied. The design uses `bridge_audit_events_event_type_check` as the working assumption — the future migration file will confirm or replace this name.

---

## 5. Future Migration File

**Future path:** `supabase/migrations/20240044_bridge_audit_event_policy_review_submitted.sql`

**This file does not exist yet. It must not be created until a separate apply-authorization prompt is received after Codex review of this design.**

### 5a. Designed SQL

```sql
-- =============================================================================
-- Goal 5 — Add policy_review_submitted to bridge_audit_events.event_type CHECK
-- Migration: 20240044
-- Applies to: bridge_audit_events only
-- =============================================================================
-- Purpose:
--   The bridge_audit_events.event_type CHECK constraint (from migration 20240041)
--   allows exactly 12 event type values. Slice 11 (Policy-Check Service) requires
--   a 13th value: 'policy_review_submitted', written when a queue item is
--   submitted for policy review via submitForPolicyReview().
--
--   This migration drops the existing inline-named CHECK constraint and replaces
--   it with an equivalent constraint that includes 'policy_review_submitted'.
--
--   All 12 existing values are preserved unchanged.
--   No tables, columns, indexes, RLS policies, grants, or triggers are changed.
--
-- STOP CONDITIONS (do not apply if any are true):
--   - The constraint name is not bridge_audit_events_event_type_check
--     (run pre-apply discovery: SELECT constraint_name FROM
--     information_schema.table_constraints WHERE table_name = 'bridge_audit_events'
--     AND constraint_type = 'CHECK')
--   - Any value other than policy_review_submitted needs to be added
--   - bridge_audit_events already allows policy_review_submitted (already applied)
--   - Any migration other than this one is needed for Slice 11
--
-- NOT APPLIED: do not run supabase migration up, db push, or any migration
-- apply command until explicitly authorized.
-- =============================================================================
-- Safety boundary:
--   ALTER TABLE ... DROP CONSTRAINT and ADD CONSTRAINT only.
--   No CREATE TABLE, DROP TABLE, CREATE POLICY, DROP POLICY, ALTER POLICY,
--   ENABLE/DISABLE ROW LEVEL SECURITY, DML (INSERT/UPDATE/DELETE/TRUNCATE),
--   functions, triggers, indexes, grants, revokes, cron, HTTP, webhooks,
--   job queues, sending behavior, execution authorization, or executable
--   model routing.
-- =============================================================================

-- Pre-apply: confirm actual constraint name before running.
-- Expected: bridge_audit_events_event_type_check
-- Discover with:
--   SELECT constraint_name FROM information_schema.table_constraints
--   WHERE table_name = 'bridge_audit_events' AND constraint_type = 'CHECK';

-- Step 1 — Drop existing event_type CHECK constraint.
-- NOTE: Replace bridge_audit_events_event_type_check with the actual name
--       if pre-apply discovery returns a different value.
ALTER TABLE bridge_audit_events
  DROP CONSTRAINT bridge_audit_events_event_type_check;

-- Step 2 — Add replacement CHECK constraint with 13 values.
-- Preserves all 12 existing values unchanged.
-- Adds policy_review_submitted only.
ALTER TABLE bridge_audit_events
  ADD CONSTRAINT bridge_audit_events_event_type_check
  CHECK (event_type IN (
    'packet_created',
    'policy_check_passed',
    'policy_check_warning',
    'policy_check_blocked',
    'human_approval_requested',
    'human_approved',
    'human_denied',
    'revision_requested',
    'codex_review_required',
    'codex_review_received',
    'manual_handoff_prepared',
    'packet_archived',
    'policy_review_submitted'
  ));
```

### 5b. What this migration does NOT contain

- No `CREATE TABLE`, `DROP TABLE`
- No column additions, renames, or drops
- No `CREATE INDEX` or `DROP INDEX`
- No `CREATE POLICY`, `DROP POLICY`, `ALTER POLICY`
- No `ENABLE ROW LEVEL SECURITY` or `DISABLE ROW LEVEL SECURITY`
- No `GRANT` or `REVOKE`
- No `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`
- No functions, triggers, or sequences
- No `ON DELETE CASCADE`
- No `execution_authorized` column or reference
- No HTTP, webhook, cron, Inngest, job queue, sending, or model behavior
- No changes to `bridge_task_packets`, `bridge_review_queue_items`, `bridge_codex_reviews`
- No changes to the `dry_run_only` constraint or any other constraint on `bridge_audit_events`
- `policy_check_requires_codex` — absent (this is an action name, not a DB event type value)
- `policy_check_requires_human` — absent (this is an action name, not a DB event type value)

---

## 6. Scope Boundaries

| Property | Value |
|----------|-------|
| Tables touched | `bridge_audit_events` only |
| Columns changed | None — constraint only |
| Constraint changed | `event_type` CHECK — drop and replace |
| Other constraints unchanged | `dry_run_only = true` (unchanged); `actor_type` CHECK (unchanged) |
| RLS | Unchanged — `ENABLE ROW LEVEL SECURITY`, `bridge_audit_events_select`, `bridge_audit_events_service_role` all unchanged |
| Grants | Unchanged — anon: none; authenticated: SELECT; service_role: ALL |
| Indexes | Unchanged — all four `bridge_audit_events` indexes unchanged |
| Other bridge tables | Unchanged |
| DML | None |

---

## 7. Pre-Apply Discovery Step (required before migration file is finalized)

Before the migration file is written and before `supabase migration up` is run, the actual constraint name must be confirmed:

```sql
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'bridge_audit_events'
  AND constraint_type = 'CHECK';
```

Expected output includes `bridge_audit_events_event_type_check` among the results.

Also check the full list of CHECK constraints to confirm no unexpected constraints need to be preserved:

```sql
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name IN (
  SELECT constraint_name
  FROM information_schema.table_constraints
  WHERE table_name = 'bridge_audit_events' AND constraint_type = 'CHECK'
);
```

**If the constraint name differs** from `bridge_audit_events_event_type_check`, update the `DROP CONSTRAINT` and `ADD CONSTRAINT` clauses in §5a accordingly before applying.

**If `policy_review_submitted` is already in the constraint** (i.e. the migration was previously applied), stop — do not re-apply.

---

## 8. Rollback Posture

This migration is **forward-only**. There is no destructive rollback path.

If the migration fails locally:
1. Stop. Do not re-attempt until the error is diagnosed.
2. Capture the full Postgres error message and migration log.
3. Do not drop data, delete audit events, or truncate tables.
4. If the constraint name was wrong, update the SQL and create a reviewed fix via a new follow-up prompt.
5. If the migration partially applied (unlikely for a single-statement ALTER), investigate `pg_constraint` before proceeding.

If reversion is truly needed (rare): add the 13th value back via a new additive migration — do not drop the value if any `policy_review_submitted` rows exist in `bridge_audit_events`.

---

## 9. Verification Plan (after future local apply)

After the migration is applied locally, verify the following:

### 9a. Migration history
- `supabase/migrations/20240044_bridge_audit_event_policy_review_submitted.sql` appears in local migration list
- No migration errors in the Supabase CLI output

### 9b. Constraint values
Run in psql or Supabase Studio (SQL editor):
```sql
SELECT check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'bridge_audit_events_event_type_check';
```
Confirm:
- All 12 original values present
- `policy_review_submitted` is present (13th value)
- `policy_check_requires_codex` is NOT present as a DB event_type value
- `policy_check_requires_human` is NOT present as a DB event_type value
- No extra values beyond the expected 13

### 9c. Table structure unchanged
- `bridge_audit_events` table still exists
- No columns added or removed
- `dry_run_only` CHECK constraint still present and enforces `= true`
- `actor_type` CHECK constraint still present and unchanged
- All four indexes on `bridge_audit_events` still present

### 9d. RLS unchanged
```sql
SELECT relrowsecurity FROM pg_class WHERE relname = 'bridge_audit_events';
-- should return: t
SELECT policyname FROM pg_policies WHERE tablename = 'bridge_audit_events';
-- should return: bridge_audit_events_select, bridge_audit_events_service_role
```

### 9e. Grants unchanged
```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'bridge_audit_events';
-- anon: no rows (or no privilege rows)
-- authenticated: SELECT only
-- service_role: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
```
Also confirm pg_class.relacl has no residual MAINTAIN flag for anon or authenticated.

### 9f. Other bridge tables unchanged
```sql
SELECT tablename FROM pg_tables WHERE tablename LIKE 'bridge_%';
-- same four tables as before: bridge_task_packets, bridge_review_queue_items,
-- bridge_audit_events, bridge_codex_reviews
```

### 9g. No ON DELETE CASCADE introduced
```sql
SELECT tc.constraint_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'bridge_audit_events'
  AND rc.delete_rule = 'CASCADE';
-- should return: 0 rows
```

### 9h. No execution_authorized column
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'bridge_audit_events' AND column_name = 'execution_authorized';
-- should return: 0 rows
```

---

## 10. Source-Reading Test Plan

**Future test file:** `tests/goal5-bridge-audit-event-policy-review-submitted-migration.test.ts`

All tests are source-reading only (no DB connection, no Supabase client, no model calls).

### Section A — File existence and scope (TC-G5-M44-001–004)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-M44-001 | `supabase/migrations/20240044_bridge_audit_event_policy_review_submitted.sql` | File exists and is non-empty |
| TC-G5-M44-002 | Migration file | Contains `bridge_audit_events` |
| TC-G5-M44-003 | Migration file | Does NOT contain `bridge_task_packets` (no changes to other tables) |
| TC-G5-M44-004 | Migration file | Does NOT contain `bridge_review_queue_items` |

### Section B — Event type completeness (TC-G5-M44-005–018)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-M44-005 | Migration file | Contains `event_type` |
| TC-G5-M44-006 | Migration file | Contains `policy_review_submitted` |
| TC-G5-M44-007 | Migration file | Contains `packet_created` |
| TC-G5-M44-008 | Migration file | Contains `policy_check_passed` |
| TC-G5-M44-009 | Migration file | Contains `policy_check_warning` |
| TC-G5-M44-010 | Migration file | Contains `policy_check_blocked` |
| TC-G5-M44-011 | Migration file | Contains `human_approval_requested` |
| TC-G5-M44-012 | Migration file | Contains `human_approved` |
| TC-G5-M44-013 | Migration file | Contains `human_denied` |
| TC-G5-M44-014 | Migration file | Contains `revision_requested` |
| TC-G5-M44-015 | Migration file | Contains `codex_review_required` |
| TC-G5-M44-016 | Migration file | Contains `codex_review_received` |
| TC-G5-M44-017 | Migration file | Contains `manual_handoff_prepared` |
| TC-G5-M44-018 | Migration file | Contains `packet_archived` |

### Section C — Excluded action names (TC-G5-M44-019–020)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-M44-019 | Migration file | Does NOT contain `policy_check_requires_codex` (action name, not a DB event type value) |
| TC-G5-M44-020 | Migration file | Does NOT contain `policy_check_requires_human` (action name, not a DB event type value) |

### Section D — Schema safety (TC-G5-M44-021–030)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-M44-021 | Migration file | Does NOT contain `CREATE TABLE` |
| TC-G5-M44-022 | Migration file | Does NOT contain `DROP TABLE` |
| TC-G5-M44-023 | Migration file | Does NOT contain `ALTER TABLE` ... `ADD COLUMN` |
| TC-G5-M44-024 | Migration file | Does NOT contain `CREATE INDEX` |
| TC-G5-M44-025 | Migration file | Does NOT contain `DROP INDEX` |
| TC-G5-M44-026 | Migration file | Does NOT contain `ENABLE ROW LEVEL SECURITY` or `DISABLE ROW LEVEL SECURITY` |
| TC-G5-M44-027 | Migration file | Does NOT contain `CREATE POLICY` or `DROP POLICY` |
| TC-G5-M44-028 | Migration file | Does NOT contain `GRANT` or `REVOKE` |
| TC-G5-M44-029 | Migration file | Does NOT contain `ON DELETE CASCADE` |
| TC-G5-M44-030 | Migration file | Does NOT contain `execution_authorized` |

### Section E — DML and automation safety (TC-G5-M44-031–035)

| TC | File | Assertion |
|----|------|-----------|
| TC-G5-M44-031 | Migration file | Does NOT contain `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` as DML statements |
| TC-G5-M44-032 | Migration file | Does NOT contain `http`, `webhook`, `cron`, `inngest`, `job` (case-insensitive) |
| TC-G5-M44-033 | Migration file | Does NOT contain `openai`, `anthropic`, `qwen`, `model` as provider/model references |
| TC-G5-M44-034 | Migration file | Does NOT contain `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED` |
| TC-G5-M44-035 | Migration file | Does NOT contain `CREATE FUNCTION` or `CREATE TRIGGER` |

---

## 11. Stop Conditions

Stop migration implementation and apply if any of the following are true:

| Condition | Action |
|-----------|--------|
| Constraint name differs from `bridge_audit_events_event_type_check` | Update SQL with actual name before creating migration file; do not apply with wrong name |
| `bridge_audit_events` already allows `policy_review_submitted` (migration already applied) | Stop — do not re-apply |
| Any value other than `policy_review_submitted` needs to be added | Stop — this design is out of scope; requires a new design |
| `policy_check_requires_codex` or `policy_check_requires_human` would be added as DB event values | Stop — these are action names, not audit event types; design error |
| Migration would touch tables other than `bridge_audit_events` | Stop — out of scope |
| Migration would alter grants, RLS, or policies | Stop — out of scope |
| Migration would include DML (`INSERT`/`UPDATE`/`DELETE`) | Stop — out of scope |
| Any production target is detected | Stop — production is a hard stop |
| Migration would add `ON DELETE CASCADE` | Stop — design invariant: all bridge FKs use `RESTRICT` |
| Migration would add `execution_authorized` or any execution path | Stop — no execution path authorized in Goal 5 |
| Any sending, automation, webhook, HTTP, model, or job behavior appears | Stop — out of scope |

---

## 12. Relationship to Slice 11 Implementation Gate

This migration unblocks **one specific prerequisite** for Goal 5 Slice 11 implementation. The full gate before Slice 11 implementation can begin:

1. ✅ Slice 11 design doc committed and pushed: `94fe104`
2. ✅ This migration design document created (current step)
3. ⬜ Codex review of this migration design — PASS required
4. ⬜ Separate apply-authorization prompt: `[CLAUDE PROMPT — CREATE AND APPLY GOAL 5 MIGRATION 20240044 LOCALLY ONLY]`
5. ⬜ Migration file created and applied locally
6. ⬜ Post-apply verification confirms all §9 checks pass
7. ⬜ Explicit Slice 11 implementation authorization prompt

Slice 11 code implementation must not begin until steps 3–6 are complete.

---

## 13. Corresponding TypeScript Change (code-only, no migration)

When Slice 11 implementation is authorized, `modules/verian-agent-bridge/audit-ledger/types.ts` must be updated to add `policy_review_submitted` to `VerianBridgeAuditEventType`:

```typescript
export type VerianBridgeAuditEventType =
  | 'packet_created'
  | 'policy_check_passed'
  | 'policy_check_warning'
  | 'policy_check_blocked'
  | 'human_approval_requested'
  | 'human_approved'
  | 'human_denied'
  | 'revision_requested'
  | 'codex_review_required'
  | 'codex_review_received'
  | 'manual_handoff_prepared'
  | 'packet_archived'
  | 'policy_review_submitted'   // Slice 11 — requires migration 20240044
```

This TypeScript change is part of Slice 11 implementation, not part of this migration. The migration creates the DB-level allowance; the TypeScript change creates the type-level allowance. Both are needed before `submitForPolicyReview` can write a `policy_review_submitted` audit event without a type error or a CHECK constraint violation.

---

*Design complete. No migration file created. No migration applied. No code changed. No database commands run. No staging or production touch.*
