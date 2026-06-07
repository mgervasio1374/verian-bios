# Goal 1 Local Supabase Target Isolation Preflight Report

**Goal:** Goal 1 - Activate the Campaign Sequence Foundation Safely  
**Status:** Blocked pending target isolation  
**Created:** 2026-06-07  
**Scope:** Preflight only - no migration application, no database writes

---

## Current Linked Project Finding

The repository currently contains Supabase CLI link metadata under `supabase/.temp` that points to the production Supabase project:

- `supabase/.temp/project-ref` contains `kxrplupzbsmujjznzhpy`
- `supabase/.temp/linked-project.json` contains `"ref":"kxrplupzbsmujjznzhpy"` and `"name":"verian-bios"`

Project context identifies `kxrplupzbsmujjznzhpy` as production. This means any Supabase CLI command that relies on the linked project, especially commands using `--linked`, is unsafe for Goal 1 local migration application.

## Why Migration Application Was Blocked

Goal 1 requires local development database application only. The previous migration attempt stopped before any database write because production-linked Supabase CLI metadata was present.

The blocker is not the migration file itself. The blocker is environment targeting ambiguity.

## Files Indicating Production Link

| File | Finding |
|---|---|
| `supabase/.temp/project-ref` | Production ref `kxrplupzbsmujjznzhpy` |
| `supabase/.temp/linked-project.json` | Production ref/name metadata |
| `supabase/config.toml` | Local development ports are configured (`api.port = 54321`, `db.port = 54322`) |
| `package.json` | No Supabase migration scripts are defined |

## Recommended Local-Only Isolation Path

Use a local-only workflow that cannot consult the linked production project.

Recommended approach for the next approved execution prompt:

1. Verify clean git state.
2. Verify `supabase/.temp/project-ref` is either absent or not used by the migration command.
3. Verify local Supabase is running and exposes the local database at `127.0.0.1:54322`.
4. Apply the migration only with an explicit local target, preferably one of:
   - `npx supabase migration up --local`
   - or `npx supabase migration up --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres`
5. If the installed CLI does not support those flags, stop before applying and inspect CLI help.

Do not use any command that depends on the linked project.

## Optional Reversible Metadata Isolation

If operator approval is given before the next migration attempt, the safest local metadata isolation is to move the linked metadata folder aside without deleting it:

```powershell
Move-Item -LiteralPath supabase\.temp -Destination supabase\.temp.production-link-blocked
```

This is a local filesystem metadata change only. It does not modify Supabase config, does not touch a database, and is reversible:

```powershell
Move-Item -LiteralPath supabase\.temp.production-link-blocked -Destination supabase\.temp
```

Do not run this cleanup unless explicitly approved.

## Exact Commands To Run Next If Approved

Preflight commands:

```powershell
git status --short
git log -1 --format=%H
git log -1 --format=%H origin/master
Get-Content supabase\.temp\project-ref
Get-Content supabase\.temp\linked-project.json
npx supabase status
npx supabase migration up --help
```

Local-only migration command, only after the local target is verified:

```powershell
npx supabase migration up --local
```

Fallback local-only command, only if supported by the installed CLI:

```powershell
npx supabase migration up --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## Commands That Must Not Be Run

The following commands must not be used for Goal 1 local application while `.temp` points to production:

```powershell
npx supabase db push --linked
npx supabase migration up --linked
npx supabase db query --linked
npx supabase link --project-ref kxrplupzbsmujjznzhpy
npx supabase db push
```

Avoid unqualified migration commands unless CLI help confirms they target local only in this project state.

## How To Verify Local Target Before Migration

Before any migration application command:

- `supabase status` must show local API and DB URLs, including the local database port `54322`.
- The migration command must explicitly include `--local` or an explicit `127.0.0.1:54322` database URL.
- No command may include `--linked`.
- No command may include production project ref `kxrplupzbsmujjznzhpy`.
- No command may include staging project ref `smbausuyetlgxflyhmfg`.

## Stop Conditions

Stop immediately if:

- Supabase CLI still reports the production project as the active target.
- The command requires or implies `--linked`.
- The command does not clearly target `127.0.0.1:54322`.
- Local Supabase is not running.
- CLI help cannot confirm local-only behavior.
- Any command would touch production, staging, remote dev, Vercel, env vars, Supabase config, system controls, sending, campaign execution, or automation.

## Safety Confirmation

- Production remains untouched.
- Staging/dev remote remains untouched.
- Migration `20240040` remains unapplied by this preflight.
- No migration command was authorized by this report.
- No database write command was authorized by this report.
- `EMAIL_SENDING_ENABLED` remains unchanged.
- `CAMPAIGN_SENDING_ENABLED` remains unchanged.
- Goal 2 has not started.
- Slice 5 remains blocked.
