# Goal 1 Staging/Dev Migration Promotion Preflight Report

**Goal:** Goal 1 - Activate the Campaign Sequence Foundation Safely  
**Status:** Preflight complete — staging apply not yet performed  
**Created:** 2026-06-07  
**Scope:** Read-only inspection only. No migration applied, no DB write commands, no production touched.

---

## A. Current State Confirmation

| Check | Value |
|---|---|
| HEAD | `62c4e1f8abb0f6442ddb4f32ca70a96ff9c72eed` |
| origin/master | `62c4e1f8abb0f6442ddb4f32ca70a96ff9c72eed` |
| Working tree | Clean |
| `git ls-files supabase/.temp` | Empty — no tracked .temp files |
| `supabase/.temp/` in `.gitignore` | Yes — added in `62c4e1f` |
| Production metadata in repo | None — backup moved to `C:\Users\micha\supabase-backup-verian-bios-goal1\` |
| Local migration 20240040 | Applied to local only, verified |
| Goal 2 | Not started |
| Slice 5 | BLOCKED |

---

## B. Local Verification Summary

Migration `20240040_phase3x_campaign_sequence_foundation.sql` was applied locally to `postgresql://postgres:postgres@127.0.0.1:54322/postgres` using direct SQL execution (docker cp + psql). Verification confirmed:

| Check | Result |
|---|---|
| Tables created | `campaign_types`, `campaign_sequences`, `campaign_sequence_steps`, `campaign_schedule_items` |
| Constraints verified | Including `chk_campaign_sequence_steps_recurrence`, `chk_campaign_schedule_items_target` |
| FK relationships verified | 13 FK targets, correct delete rules (CASCADE/RESTRICT/SET NULL) |
| Indexes verified | 22 indexes including 5 unique indexes |
| RLS verified | Enabled on all 4 tables; SELECT for authenticated; ALL for service_role |
| updated_at triggers verified | All 4 present and enabled |
| Migration test | 20/20 PASS (`tests/phase3x-campaign-sequence-migration.test.ts`) |
| Full test suite | 2993/2994 PASS (1 pre-existing unrelated failure) |
| TypeScript | Pre-existing errors only; no new errors from migration types |
| Grant pattern | Matches project-wide convention (consistent with all existing tables) |

---

## C. Environment Migration State

| Environment | Supabase ref | Current migration level | Next unapplied |
|---|---|---|---|
| Local | `127.0.0.1:54322` | `20240039` (plus `20240040` applied via direct SQL, not in schema_migrations) | N/A |
| Staging | `smbausuyetlgxflyhmfg` | `20240039` (confirmed by Phase 3V Slice 4F report, 2026-06-04) | `20240040` |
| Production | `kxrplupzbsmujjznzhpy` | `20240034` | **Must not receive 20240040 — not authorized** |

Staging is at `20240039`. Migrations `20240037`–`20240039` were applied to staging in Phase 3V Slice 4F. Only `20240040` needs to be applied to staging.

---

## D. Production Hard Stop

**Production must not receive migration `20240040` at this time.**

| Item | Value |
|---|---|
| Production project ref to avoid | `kxrplupzbsmujjznzhpy` |
| Production migration level | `20240034` |
| Missing prerequisite migrations on production | `20240035`, `20240036`, `20240037`, `20240038`, `20240039` must all be applied before `20240040` — none are authorized |
| Production authorization required | Yes — a separate, explicitly approved production migration sequence is required for all five missing migrations before production can receive `20240040` |

Any staging command that targets `kxrplupzbsmujjznzhpy` must be treated as a fatal error and stopped immediately.

---

## E. Staging Target Requirements

| Requirement | Detail |
|---|---|
| Staging project ref | `smbausuyetlgxflyhmfg` |
| Staging URL | `https://verian-bios-staging.vercel.app` |
| Staging auth user | `staging@verian.internal` / `platform_admin` |
| CLI link command | `npx supabase link --project-ref smbausuyetlgxflyhmfg` |
| Verify before migration | `cat supabase\.temp\project-ref` must equal `smbausuyetlgxflyhmfg` |
| Must never equal | `kxrplupzbsmujjznzhpy` |
| Migration to apply | `20240040` only — staging is already at `20240039` |
| Expected CLI migration command | `npx supabase db push --linked` |
| `.temp` side effect | Relinking populates `supabase/.temp/` — now ignored in `.gitignore` and will not dirty the working tree |

---

## F. Safe Command Pattern for Staging Apply (Next Approved Step)

The following is the exact command sequence to use in the next approved staging apply prompt. Do not run these commands until the staging apply prompt is explicitly approved.

```powershell
# Step 1 — Confirm working tree and .temp state
git status --short
git rev-parse HEAD
git rev-parse origin/master
git ls-files supabase/.temp

# Step 2 — Confirm no project-ref exists in .temp before relinking
if (Test-Path supabase\.temp\project-ref) { Get-Content supabase\.temp\project-ref }

# Step 3 — Relink CLI to staging (not production)
npx supabase link --project-ref smbausuyetlgxflyhmfg

# Step 4 — Verify linked ref is staging (HARD STOP if production ref appears)
$ref = (Get-Content supabase\.temp\project-ref -ErrorAction Stop).Trim()
if ($ref -ne 'smbausuyetlgxflyhmfg') { throw "HARD STOP: project-ref is $ref — expected staging" }

# Step 5 — Confirm staging migration level before apply
npx supabase db query --linked "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;"
# Must show 20240039 as highest before apply

# Step 6 — Apply only 20240040 to staging
npx supabase db push --linked
# CLI should apply only 20240040 (staging already at 20240039)

# Step 7 — Confirm migration applied
npx supabase db query --linked "SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20240038' ORDER BY version DESC;"
# Must include 20240040

# Step 8 — Verify tables exist
npx supabase db query --linked "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('campaign_types','campaign_sequences','campaign_sequence_steps','campaign_schedule_items') ORDER BY table_name;"
# Must return all 4

# Step 9 — Verify RLS
npx supabase db query --linked "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('campaign_types','campaign_sequences','campaign_sequence_steps','campaign_schedule_items') ORDER BY tablename;"
# All 4 must show rowsecurity = true

# Step 10 — Verify triggers
npx supabase db query --linked "SELECT trigger_name, event_object_table, tgenabled FROM information_schema.triggers t JOIN pg_trigger pt ON pt.tgname = t.trigger_name WHERE trigger_name LIKE 'set_campaign%_updated_at' ORDER BY trigger_name;"
# Must show all 4 triggers with tgenabled = 'O'

# Step 11 — Confirm send flags unchanged
npx supabase db query --linked "SELECT name, value FROM system_controls WHERE name IN ('email_sending_enabled','campaign_sending_enabled');"
# Both must be false
```

---

## G. Read-Only Verification Checks After Staging Apply

Run all of the following using read-only SELECT queries against staging only:

| Check | Expected result |
|---|---|
| `schema_migrations` contains `20240040` | Yes |
| All 4 tables exist in `information_schema.tables` | Yes |
| RLS enabled on all 4 tables | Yes |
| All 4 `set_campaign*_updated_at` triggers present and enabled | Yes |
| `campaign_types` column count | 13 |
| `campaign_sequences` column count | 16 |
| `campaign_sequence_steps` column count | 15 |
| `campaign_schedule_items` column count | 20 |
| `chk_campaign_sequence_steps_recurrence` constraint exists | Yes |
| `chk_campaign_schedule_items_target` constraint exists | Yes |
| `uq_campaign_types_active_slug` unique index exists | Yes |
| `uq_campaign_sequence_steps_order` unique index exists | Yes |
| `email_sending_enabled` system control | `false` |
| `campaign_sending_enabled` system control | `false` |
| `email_sends` count unchanged | Same as before apply |
| `campaign_email_sends` count unchanged | 0 |

---

## H. Commands That Must Not Be Run

```powershell
# Do not target production
npx supabase link --project-ref kxrplupzbsmujjznzhpy
npx supabase db push --project-ref kxrplupzbsmujjznzhpy

# Do not run without verifying project-ref first
npx supabase db push --linked  # only safe AFTER verifying .temp/project-ref = smbausuyetlgxflyhmfg

# Do not enable send flags
# Do not click any Send button
# Do not enable EMAIL_SENDING_ENABLED
# Do not enable CAMPAIGN_SENDING_ENABLED

# Do not apply to production
# Do not skip prerequisite migrations on production
```

---

## I. Rollback Notes

**Staging rollback only.** If migration `20240040` causes issues on staging:

```sql
-- Run on staging only via npx supabase db query --linked (verify project-ref = smbausuyetlgxflyhmfg first)
DROP TABLE IF EXISTS campaign_schedule_items;
DROP TABLE IF EXISTS campaign_sequence_steps;
DROP TABLE IF EXISTS campaign_sequences;
DROP TABLE IF EXISTS campaign_types;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20240040';
```

Must verify project-ref is `smbausuyetlgxflyhmfg` before running any rollback command. Do not run rollback on production. Production rollback is explicitly unauthorized.

---

## J. .temp Handling for Staging Apply

`supabase/.temp/` is now in `.gitignore`. When the CLI is relinked to staging, it will populate `.temp/` with staging metadata including `project-ref = smbausuyetlgxflyhmfg`. This will not show in `git status`. After staging work is complete:

- `.temp/` can be left as-is (ignored by git)
- Or `.temp/` can be cleared manually if desired
- No git restore is needed
- No git commit is needed for `.temp/` contents

---

## K. Safety Confirmations

- Migration `20240040`: Applied locally only; not yet applied to staging or production.
- Production: Untouched.
- Staging: Not yet targeted for `20240040`.
- No migration commands run in this preflight.
- No database write commands run in this preflight.
- Supabase config unchanged.
- Environment variables unchanged.
- Vercel settings unchanged.
- System controls unchanged.
- `EMAIL_SENDING_ENABLED`: Unchanged (false).
- `CAMPAIGN_SENDING_ENABLED`: Unchanged (false).
- No emails sent.
- No campaign sending added.
- No background jobs added.
- No files staged, committed, or pushed in this preflight (report is untracked).
- Goal 2 has not started.
- Slice 5 remains BLOCKED.
