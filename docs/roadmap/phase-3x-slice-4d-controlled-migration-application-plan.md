# Phase 3X Slice 4D — Controlled Campaign Sequence Migration Application Plan

**Status:** Plan only — migration application not authorized in this slice  
**Created:** 2026-06-07  
**Baseline:** `bad265b` — Phase 3X Slice 4C: add campaign sequence migration foundation  
**Migration file:** `supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql`  
**Risk:** High — schema/migration application  
**Production:** Hard stop; not authorized  
**Slice 5:** Blocked

---

## Goal 1: Activate the Campaign Sequence Foundation Safely

### Objective

Safely apply and verify the campaign sequence schema foundation in local and then staging/dev environments, without touching production, enabling sending, adding automation, or proceeding to Slice 5.

### Measurable Outcome

The Goal is only complete when:

- Migration `20240040` is applied locally under explicit approval
- Local verification confirms all four tables exist
- Local verification confirms constraints, FK relationships, indexes, RLS policies, grants, and `updated_at` triggers
- Local tests pass (except known pre-existing unrelated failures)
- Staging/dev application is separately approved
- Staging/dev verification confirms the same checks
- Production remains untouched
- A productivity report is produced before Goal 2 begins

### Completion Criteria

| Criterion | Required Evidence |
|---|---|
| Local migration applied | Command output with migration name and success status |
| All four tables exist | Read-only SQL result confirming 4 rows |
| Constraints verified | Recurrence constraint and schedule target constraint confirmed |
| FK relationships verified | FK query returning expected relationships per Section 6 |
| Indexes verified | Index query returning expected index names |
| RLS enabled | `relrowsecurity = true` for all four tables |
| Policies confirmed | All expected select and service_role policies present |
| Grants confirmed | `authenticated` SELECT and `service_role` ALL for all four tables |
| `updated_at` triggers confirmed | All four named triggers present and enabled |
| Tests pass | Vitest run with pass count and known-failure list |
| TypeScript clean | `tsc --noEmit` with only known pre-existing errors |
| Production untouched | Confirmed at each step |
| Productivity report produced | Filed at `docs/roadmap/` before Goal 2 begins |

### Stop Condition

Goal 1 is **not** complete if:

- Migration is not applied locally
- Any verification SQL check fails or returns unexpected results
- RLS or grants are ambiguous, missing, or misconfigured
- Staging/dev application is not separately approved or not verified
- Production is touched in any way
- Sending, automation, or system controls are modified
- Productivity report is missing

---

## Goal 1 Productivity Report Requirement

After Goal 1 is complete and before Goal 2 begins, a productivity report must be produced and committed to `docs/roadmap/` containing:

- **Goal name:** Goal 1 — Activate the Campaign Sequence Foundation Safely
- **Goal status:** Complete / Not complete (with explanation if not complete)
- **What changed:** Which tables were created; in which environments the migration was applied
- **What is now usable/testable:** Which tables, columns, constraints, FK relationships, and types are now testable against local/staging schema
- **Verification evidence:** Full results from each read-only SQL check in Section 6 (table existence, columns, constraints, FKs, triggers, RLS, grants, indexes)
- **Tests run:** Vitest command, pass count, fail count
- **Known failures:** Pre-existing unrelated failures identified by test ID
- **Safety confirmations:** Production untouched; `EMAIL_SENDING_ENABLED` and `CAMPAIGN_SENDING_ENABLED` disabled; no system controls changed; no campaign execution, send, approval mutation, or automation added
- **Remaining blockers:** Any open items preventing Goal 1 completion sign-off
- **Next recommended goal:** Goal 2 name and scope (to be defined)

The productivity report must be committed and approved before any Goal 2 implementation begins.

---

## 1. Current State Confirmation

Phase 3X Slice 4C is committed and pushed at:

```text
bad265b0f4ee722b3311f61c034dd3fc282ca08e
```

The Slice 4C migration file exists locally in the repository:

```text
supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql
```

Current known state:

- The migration has been created but has not been applied in this planning slice.
- No production schema change is authorized.
- No system control change is authorized.
- No email sending or campaign sending is authorized.
- No background job, schedule generation, send automation, or Slice 5 work is authorized.

---

## 2. Migration File To Apply

The only migration in scope for a future controlled application step is:

```text
supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql
```

Expected tables created by the migration:

- `campaign_types`
- `campaign_sequences`
- `campaign_sequence_steps`
- `campaign_schedule_items`

The migration is additive. It should not alter existing tables, backfill existing data, create schedule rows, create drafts, create approval requests, send email, enable system controls, or start automation.

---

## 3. Local Application Checklist

Local application is allowed only in a future explicitly approved execution step. Before local application, confirm:

- Working tree is clean.
- HEAD and `origin/master` both point to the approved Slice 4C commit.
- No unexpected migrations exist after `20240040`.
- Local Supabase target is confirmed as local development only.
- `EMAIL_SENDING_ENABLED` is disabled.
- `CAMPAIGN_SENDING_ENABLED` is disabled.
- No local send test is planned in the same step.
- Rollback SQL has been reviewed.

Future local execution sequence:

1. Confirm local target and migration list.
2. Apply only migration `20240040`.
3. Run read-only schema verification SQL from Section 6.
4. Run focused migration tests.
5. Run full test suite.
6. Run `npx tsc --noEmit`.
7. Record results in a Slice 4D application evidence note.

No local data backfill or seed should be run as part of the first application unless separately approved.

---

## 4. Remote Dev / Staging Application Checklist

Remote dev or staging application is allowed only after local application passes and receives Codex review.

Before remote dev/staging application, confirm:

- Exact Supabase project ref is documented.
- Environment is non-production.
- Migration `20240040` is not already applied.
- Prior required migrations are present in the target environment.
- The app deployment target that will read the schema is non-production.
- No provider/sender configuration changes are included.
- No system controls are modified.
- `EMAIL_SENDING_ENABLED` remains disabled.
- `CAMPAIGN_SENDING_ENABLED` remains disabled.
- Rollback owner and verification owner are named.

Future remote dev/staging execution sequence:

1. Confirm project ref and environment classification.
2. Apply only migration `20240040`.
3. Run read-only schema verification SQL.
4. Verify RLS/grants.
5. Run non-production app smoke checks only for pages that already exist.
6. Do not create campaign schedule rows unless a later reviewed slice authorizes it.
7. Submit the remote-dev/staging evidence to Codex for review.

---

## 5. Production Hard Stop

Production application is not authorized in Slice 4D.

Do not apply `20240040` to production unless all of the following are true:

- Local application passed.
- Remote dev/staging application passed.
- Codex reviewed the local/staging evidence.
- A production-specific application prompt is written and reviewed.
- Operator explicitly approves production migration application.
- Backup/rollback readiness is documented.
- Production project ref is explicitly confirmed.
- No sending or campaign execution is bundled with the production migration.

Production remains a hard stop until these conditions are satisfied.

---

## 6. Verification SQL / Read-Only Checks

The following SQL is read-only and intended for future post-application verification.

Confirm table existence:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'campaign_types',
    'campaign_sequences',
    'campaign_sequence_steps',
    'campaign_schedule_items'
  )
order by table_name;
```

Confirm required columns:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'campaign_types',
    'campaign_sequences',
    'campaign_sequence_steps',
    'campaign_schedule_items'
  )
order by table_name, ordinal_position;
```

Confirm recurrence constraint:

```sql
select conname, pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'campaign_sequence_steps'
  and conname = 'chk_campaign_sequence_steps_recurrence';
```

Confirm schedule target constraint:

```sql
select conname, pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'campaign_schedule_items'
  and conname = 'chk_campaign_schedule_items_target';
```

Confirm RLS enabled:

```sql
select relname, relrowsecurity
from pg_class
where relname in (
  'campaign_types',
  'campaign_sequences',
  'campaign_sequence_steps',
  'campaign_schedule_items'
)
order by relname;
```

Confirm policies:

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'campaign_types',
    'campaign_sequences',
    'campaign_sequence_steps',
    'campaign_schedule_items'
  )
order by tablename, policyname;
```

Confirm grants:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'campaign_types',
    'campaign_sequences',
    'campaign_sequence_steps',
    'campaign_schedule_items'
  )
  and grantee in ('authenticated', 'service_role')
order by table_name, grantee, privilege_type;
```

Confirm indexes:

```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'campaign_types',
    'campaign_sequences',
    'campaign_sequence_steps',
    'campaign_schedule_items'
  )
order by tablename, indexname;
```

Confirm FK constraint relationships:

```sql
select
  tc.constraint_name,
  tc.table_name                as source_table,
  kcu.column_name              as source_column,
  ccu.table_name               as referenced_table,
  ccu.column_name              as referenced_column,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
  and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
  and tc.table_schema = ccu.table_schema
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name
  and tc.table_schema = rc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in (
    'campaign_types',
    'campaign_sequences',
    'campaign_sequence_steps',
    'campaign_schedule_items'
  )
order by tc.table_name, kcu.column_name;
```

Expected FK relationships (derived from migration `20240040`):

| Source table | Source column | Referenced table | Delete rule |
|---|---|---|---|
| `campaign_types` | `tenant_id` | `tenants` | `CASCADE` |
| `campaign_types` | `workspace_id` | `workspaces` | `CASCADE` |
| `campaign_types` | `created_by_user_id` | `auth.users` | `SET NULL` |
| `campaign_sequences` | `tenant_id` | `tenants` | `CASCADE` |
| `campaign_sequences` | `workspace_id` | `workspaces` | `CASCADE` |
| `campaign_sequences` | `campaign_type_id` | `campaign_types` | `RESTRICT` |
| `campaign_sequences` | `created_by_user_id` | `auth.users` | `SET NULL` |
| `campaign_sequence_steps` | `tenant_id` | `tenants` | `CASCADE` |
| `campaign_sequence_steps` | `workspace_id` | `workspaces` | `CASCADE` |
| `campaign_sequence_steps` | `campaign_sequence_id` | `campaign_sequences` | `RESTRICT` |
| `campaign_sequence_steps` | `campaign_email_asset_id` | `campaign_email_assets` | `SET NULL` |
| `campaign_schedule_items` | `tenant_id` | `tenants` | `CASCADE` |
| `campaign_schedule_items` | `workspace_id` | `workspaces` | `CASCADE` |
| `campaign_schedule_items` | `campaign_assignment_id` | `campaign_assignments` | `RESTRICT` |
| `campaign_schedule_items` | `campaign_sequence_id` | `campaign_sequences` | `RESTRICT` |
| `campaign_schedule_items` | `campaign_sequence_step_id` | `campaign_sequence_steps` | `RESTRICT` |
| `campaign_schedule_items` | `lead_id` | `leads` | `SET NULL` |
| `campaign_schedule_items` | `contact_id` | `contacts` | `SET NULL` |
| `campaign_schedule_items` | `company_id` | `companies` | `SET NULL` |
| `campaign_schedule_items` | `approval_request_id` | `approval_requests` | `SET NULL` |
| `campaign_schedule_items` | `email_draft_id` | `email_drafts` | `SET NULL` |

Any missing FK or mismatched delete rule should block migration promotion beyond the current environment.

Confirm `updated_at` triggers:

```sql
select
  t.tgname      as trigger_name,
  c.relname     as table_name,
  t.tgenabled   as enabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'campaign_types',
    'campaign_sequences',
    'campaign_sequence_steps',
    'campaign_schedule_items'
  )
  and t.tgname like 'set_%_updated_at'
order by c.relname;
```

Expected triggers (from migration `20240040`):

| Trigger name | Table |
|---|---|
| `set_campaign_types_updated_at` | `campaign_types` |
| `set_campaign_sequences_updated_at` | `campaign_sequences` |
| `set_campaign_sequence_steps_updated_at` | `campaign_sequence_steps` |
| `set_campaign_schedule_items_updated_at` | `campaign_schedule_items` |

All four triggers must be present and enabled (`tgenabled = 'O'` for enabled). Any missing trigger should block migration promotion beyond the current environment.

---

## 7. Rollback Strategy

**Scope: local and staging/dev only.**

Rollback is scoped exclusively to local development and non-production staging/dev environments. Production application is not authorized in Slice 4D, so no production rollback path is presented here as an executable next step.

### Local / Staging Rollback (if needed)

Rollback is only viable immediately after application, before any application data has been intentionally created in these tables. Before executing any rollback:

1. Confirm the target is local or staging/dev — **not production**.
2. Confirm no application data exists in the four new tables.
3. If any rows exist, stop, export the affected rows, and submit a rollback plan for review before proceeding.

If all conditions are met, reverse in dependency order:

```sql
-- Local/staging/dev rollback only — not authorized for production
drop table if exists public.campaign_schedule_items;
drop table if exists public.campaign_sequence_steps;
drop table if exists public.campaign_sequences;
drop table if exists public.campaign_types;
```

### Production Rollback

Production rollback is **not authorized** in this plan because production application itself is not authorized. The drop statements above must not be executed against any production Supabase project without:

- A separate explicitly approved production rollback prompt
- Operator confirmation of the production project ref
- Evidence capture before and after any destructive operation
- Codex review of the rollback plan

No production rollback command should be treated as an executable next step from this document.

---

## 8. RLS / Grants Verification

Expected RLS behavior:

- Authenticated users may select rows only when:
  - `tenant_id = public.current_tenant_id()`
  - `public.is_workspace_member(workspace_id)` is true
- Service role may perform all operations.
- No authenticated write policy is introduced by this migration.
- No public or anonymous write policy exists.

Expected grants:

- `authenticated`: `SELECT`
- `service_role`: `ALL`

Any deviation should block migration promotion beyond the current environment.

---

## 9. Type Generation / Update Verification

Slice 4C manually updated `types/database.ts` to include:

- `campaign_types`
- `campaign_sequences`
- `campaign_sequence_steps`
- `campaign_schedule_items`

After any future migration application, verify that generated or manually maintained database types still match the applied schema:

- Row types include every non-null and nullable column correctly.
- Insert types mark defaulted fields optional.
- Update types mark all fields optional.
- Relationships include all FK references.
- No existing table type was removed.

If generated types differ from committed types, capture the diff and submit it for review before committing.

---

## 10. Safety Gates

Stop immediately if any of the following occur:

- Target environment is unclear.
- Target is production without explicit production approval.
- A migration other than `20240040` is included unexpectedly.
- Existing tables would be altered outside approved scope.
- Verification SQL indicates missing RLS, missing grants, or missing constraints.
- Any send, approval mutation, draft creation, or campaign execution appears in the plan.
- Any `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED` change is proposed.
- Any provider/sender, Vercel, env, or Supabase config change is proposed.
- Any background job, cron, Inngest function, or automation is proposed.
- Slice 5 execution is bundled with migration application.

---

## 11. Sending / Campaign Controls

This plan explicitly does not authorize:

- enabling `EMAIL_SENDING_ENABLED`
- enabling `CAMPAIGN_SENDING_ENABLED`
- sending emails
- campaign sending
- send automation
- background jobs
- approval mutation behavior
- draft creation
- schedule generation

Campaign sequence schema application is not campaign execution.

---

## 12. Required Codex Review After Local / Staging Application

After local application, Codex must review:

- Migration command evidence.
- Target environment evidence.
- Read-only SQL verification results.
- Test results.
- TypeScript result.
- Confirmation no send/system-control/config changes occurred.

After remote dev/staging application, Codex must review:

- Project ref and environment classification.
- Applied migration evidence.
- RLS/grants verification.
- Read-only app smoke evidence.
- Confirmation production remains untouched.

Do not proceed to production planning until Codex completes these reviews.

---

## 13. Required Operator Approval Before Production Application

Production application requires a separate explicit operator approval.

The production prompt must include:

- Production Supabase project ref.
- Current production migration state.
- Backup/rollback readiness.
- Exact migration file.
- Read-only verification SQL.
- Stop conditions.
- Confirmation no sending/campaign controls will be enabled.
- Confirmation Slice 5 remains separate.

Without explicit operator approval, production remains blocked.

---

## 14. Slice 5 Status

Slice 5 remains **BLOCKED**.

Slice 4D planning does not authorize migration application, schedule generation, campaign execution, sending, automation, or production activity.
