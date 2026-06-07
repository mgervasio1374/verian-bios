# Goal 1 Local Supabase Target Isolation Result Report

**Goal:** Goal 1 - Activate the Campaign Sequence Foundation Safely  
**Status:** Target isolation completed; migration still unapplied  
**Created:** 2026-06-07  
**Scope:** Local filesystem metadata isolation only

---

## Production Link Detected

Before isolation, Supabase CLI metadata under `supabase/.temp` pointed at the production Supabase project:

- `supabase/.temp/project-ref` contained `kxrplupzbsmujjznzhpy`
- `supabase/.temp/linked-project.json` contained `"ref":"kxrplupzbsmujjznzhpy"` and `"name":"verian-bios"`

That production link was the blocker that prevented Goal 1 local migration application.

## Files Isolated

The production-linked metadata directory was moved locally and reversibly:

```text
supabase/.temp
```

to:

```text
supabase/.temp.production-link-backup-goal1
```

No files were deleted.

## Backup Verification

The backup directory exists and contains the original production-linked metadata files, including:

- `project-ref`
- `linked-project.json`
- `pooler-url`
- `postgres-version`
- `gotrue-version`
- `rest-version`
- `storage-version`
- `storage-migration`
- `cli-latest`

The backed-up `project-ref` remains `kxrplupzbsmujjznzhpy`, preserving evidence of the original production link.

## Active `.temp` State After Status Check

After running `npx supabase status`, Supabase CLI recreated:

```text
supabase/.temp/cli-latest
```

The active `.temp` directory no longer contains:

- `project-ref`
- `linked-project.json`
- remote pooler metadata

Important note: in this repository, `supabase/.temp` files appear in git status rather than being fully ignored. This means the isolation step leaves visible local filesystem metadata changes that should be reviewed and either committed intentionally or restored before any unrelated commit.

## Local Supabase Status

`npx supabase status` reported local development services running.

Local URLs reported:

| Item | Value |
|---|---|
| Project URL | `http://127.0.0.1:54321` |
| REST | `http://127.0.0.1:54321/rest/v1` |
| GraphQL | `http://127.0.0.1:54321/graphql/v1` |
| Studio | `http://127.0.0.1:54323` |
| Mailpit | `http://127.0.0.1:54324` |
| Database URL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Stopped local services were reported for imgproxy, edge runtime, analytics, vector, and pooler. The local development setup itself was reported as running.

## Local DB Target Availability

The local database target is available at:

```text
127.0.0.1:54322
```

This is the target that must be used for any future Goal 1 local migration application.

## Safe To Proceed To Local Migration Application

Yes, with conditions.

The next migration attempt may proceed only if:

- The operator explicitly approves Goal 1 local migration application.
- The command targets local only.
- The command does not use `--linked`.
- The command does not use project ref `kxrplupzbsmujjznzhpy`.
- The command does not use project ref `smbausuyetlgxflyhmfg`.
- The command uses either an explicit local flag or explicit local DB URL.

Preferred next migration command:

```powershell
npx supabase migration up --local
```

Fallback only if the installed CLI supports it:

```powershell
npx supabase migration up --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## Exact Next Prompt Recommended

Recommended next prompt:

```text
Proceed with Goal 1 local migration application only.
Use only the local Supabase database at 127.0.0.1:54322.
Do not use --linked.
Do not touch production, staging, or remote dev.
Apply only migration 20240040 locally, then run the read-only verification SQL and tests.
```

## Commands That Must Still Not Be Run

Do not run:

```powershell
npx supabase db push --linked
npx supabase migration up --linked
npx supabase db query --linked
npx supabase link --project-ref kxrplupzbsmujjznzhpy
npx supabase link --project-ref smbausuyetlgxflyhmfg
npx supabase db reset
```

Do not run unqualified migration commands unless the CLI help confirms local-only targeting.

## Safety Confirmation

- Migration `20240040` remains unapplied by this isolation step.
- No migration command was run.
- No database write command was run.
- Production remains untouched.
- Staging/dev remote remains untouched.
- Supabase config remains unchanged.
- Environment variables remain unchanged.
- Vercel settings remain unchanged.
- System controls remain unchanged.
- `EMAIL_SENDING_ENABLED` remains unchanged.
- `CAMPAIGN_SENDING_ENABLED` remains unchanged.
- No email was sent.
- No campaign sending was added.
- No background jobs were added.
- Goal 2 has not started.
- Slice 5 remains blocked.
