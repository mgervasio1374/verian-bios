# Goal 1 Local Campaign Sequence Migration Application Report

**Goal:** Goal 1 - Activate the Campaign Sequence Foundation Safely  
**Status:** Local schema application complete with notes  
**Created:** 2026-06-07  
**Target:** Local Supabase Postgres only

---

## Local Target Used

The migration was applied only to the local Supabase Postgres container:

```text
supabase_db_verian-bios
```

Container port mapping confirmed before application:

```text
127.0.0.1:54322 -> 5432/tcp
```

Read-only connection check used the explicit local database URL:

```text
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

The Supabase CLI reported:

```text
Connecting to local database...
```

No `--linked` command was used.

## Migration Applied

Migration file applied locally:

```text
supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql
```

Application method:

```text
docker cp supabase/migrations/20240040_phase3x_campaign_sequence_foundation.sql supabase_db_verian-bios:/tmp/20240040_phase3x_campaign_sequence_foundation.sql
docker exec supabase_db_verian-bios psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/20240040_phase3x_campaign_sequence_foundation.sql
```

Result:

```text
CREATE TABLE x4
CREATE TRIGGER x4
ALTER TABLE x4
CREATE POLICY x8
GRANT x8
CREATE INDEX x18
```

## Verification Results

### Tables

Read-only verification confirmed all four expected tables exist:

- `campaign_types`
- `campaign_sequences`
- `campaign_sequence_steps`
- `campaign_schedule_items`

### Columns

Column counts verified:

| Table | Column count |
|---|---:|
| `campaign_types` | 13 |
| `campaign_sequences` | 16 |
| `campaign_sequence_steps` | 15 |
| `campaign_schedule_items` | 20 |

Detailed column verification returned 64 total columns across the four tables.

### Constraints

Read-only constraint verification returned 36 constraints across the four tables.

Confirmed:

- Primary keys on all four tables
- Status/check constraints for table lifecycle fields
- `chk_campaign_sequence_steps_recurrence`
- `chk_campaign_schedule_items_target`
- `campaign_sequence_steps_step_number_check`
- `campaign_sequences_version_check`

### FK Relationships

Foreign key verification confirmed tenant/workspace scoping FKs and active-structure delete behavior:

- Tenant/workspace FKs use `ON DELETE CASCADE`
- Active sequence structure FKs use `ON DELETE RESTRICT`
- Optional leaf references use `ON DELETE SET NULL`

Confirmed FK targets include:

- `tenants`
- `workspaces`
- `campaign_types`
- `campaign_sequences`
- `campaign_sequence_steps`
- `campaign_assignments`
- `campaign_email_assets`
- `approval_requests`
- `email_drafts`
- `leads`
- `contacts`
- `companies`
- `auth.users` for created-by references

### Indexes

Read-only index verification returned 22 indexes, including:

- `idx_campaign_types_tenant_workspace_status`
- `uq_campaign_types_active_slug`
- `idx_campaign_sequences_type_status`
- `uq_campaign_sequences_type_version`
- `uq_campaign_sequences_default`
- `idx_campaign_sequence_steps_sequence_order`
- `uq_campaign_sequence_steps_order`
- `idx_campaign_sequence_steps_asset`
- `idx_campaign_schedule_items_scheduled_for`
- `idx_campaign_schedule_items_status_due`
- `idx_campaign_schedule_items_assignment`
- `idx_campaign_schedule_items_sequence`
- `idx_campaign_schedule_items_step`
- `idx_campaign_schedule_items_lead`
- `idx_campaign_schedule_items_contact`
- `idx_campaign_schedule_items_email_draft`
- `idx_campaign_schedule_items_approval_request`
- `uq_campaign_schedule_items_assignment_step_time`

### RLS / Policies / Grants

RLS verification:

| Table | RLS enabled |
|---|---|
| `campaign_types` | true |
| `campaign_sequences` | true |
| `campaign_sequence_steps` | true |
| `campaign_schedule_items` | true |

Policy verification confirmed eight policies:

- Select policies require `tenant_id = current_tenant_id()` and `is_workspace_member(workspace_id)`
- Service role policies use `auth.role() = 'service_role'` with `WITH CHECK`

Grant note:

The migration grants `SELECT` to `authenticated` and `ALL` to `service_role`. Local verification shows broader authenticated object privileges on the new tables. This appears consistent with earlier project-wide local grant/default-privilege behavior, while RLS still has no authenticated write policy. This should be reviewed before staging/dev promotion because the Slice 4D plan expected `authenticated` SELECT only.

### updated_at Triggers

All four `updated_at` triggers are present and enabled (`tgenabled = 'O'`):

- `set_campaign_types_updated_at`
- `set_campaign_sequences_updated_at`
- `set_campaign_sequence_steps_updated_at`
- `set_campaign_schedule_items_updated_at`

### Migration Tracking Note

Because the migration was applied by direct local SQL script execution, `supabase_migrations.schema_migrations` does not contain version `20240040`.

This is a local bookkeeping caveat. Do not run a future unqualified Supabase migration command against this local database without first deciding whether and how to record or reconcile migration history.

## Test Results

Focused migration test:

```text
npx vitest run tests/phase3x-campaign-sequence-migration.test.ts
1 file passed
20/20 tests passed
```

Full Vitest:

```text
npx vitest run
38 files passed, 1 failed
2993/2994 tests passed
```

Known pre-existing full-suite failure:

- `tests/phase3k-unified-draft-send-path.test.ts`
- `TC-3K-030: sets sourceAssetId to input.assetId`
- Failure is the known spacing assertion expecting `sourceAssetId:    input.assetId`

TypeScript:

```text
npx tsc --noEmit
```

Known pre-existing TypeScript failures:

- `tests/phase3h-send-safety-hardening.test.ts` regex target errors at lines 76, 81, 86
- `tests/quality-review-agent.test.ts` duplicate object literal property errors at lines 592-593

## Safety Confirmations

- Production untouched.
- Staging/dev remote untouched.
- No remote Supabase command used.
- No `--linked` command used.
- No `supabase db push` command used.
- No `supabase migration up` command used.
- No `supabase db reset` command used.
- No Vercel settings changed.
- No environment variables changed.
- No Supabase config changed.
- No system controls changed.
- `EMAIL_SENDING_ENABLED` unchanged.
- `CAMPAIGN_SENDING_ENABLED` unchanged.
- No emails sent.
- No campaign sending added.
- No background jobs added.
- Goal 2 not started.
- Slice 5 remains blocked.

## Remaining Blockers Before Staging / Dev Application

Before any staging/dev migration application:

1. Review the local grant deviation from the Slice 4D expected grant wording.
2. Decide whether direct-SQL local migration history needs reconciliation before further local Supabase migration commands.
3. Write and approve a separate staging/dev application prompt.
4. Confirm staging/dev project ref and environment classification.
5. Continue to prohibit production, sending, automation, and Slice 5 execution.
