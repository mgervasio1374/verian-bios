# Goal 1 Supabase Temp Metadata Cleanup Preflight Report

**Goal:** Goal 1 - Activate the Campaign Sequence Foundation Safely  
**Status:** Preflight complete — cleanup not yet performed  
**Created:** 2026-06-07  
**Scope:** Read-only inspection only. No files moved, restored, deleted, or committed.

---

## Current Git Dirty State

`git status --short` shows the following `.temp`-related changes:

```
 M supabase/.temp/cli-latest
 D supabase/.temp/gotrue-version
 D supabase/.temp/linked-project.json
 D supabase/.temp/pooler-url
 D supabase/.temp/postgres-version
 D supabase/.temp/project-ref
 D supabase/.temp/rest-version
 D supabase/.temp/storage-migration
 D supabase/.temp/storage-version
?? supabase/.temp.production-link-backup-goal1/
```

These changes exist because the production-linked `.temp` contents were moved to the backup directory as part of Goal 1 target isolation, and `npx supabase status` subsequently recreated only `cli-latest`.

---

## Tracked supabase/.temp Files

`git ls-files supabase/.temp` returns all 9 files — they are fully tracked:

```
supabase/.temp/cli-latest
supabase/.temp/gotrue-version
supabase/.temp/linked-project.json
supabase/.temp/pooler-url
supabase/.temp/postgres-version
supabase/.temp/project-ref
supabase/.temp/rest-version
supabase/.temp/storage-migration
supabase/.temp/storage-version
```

`.gitignore` does **not** contain `supabase/.temp` or any pattern that would exclude it.

---

## What HEAD Contains for .temp

`git show HEAD:supabase/.temp/project-ref` returns:

```
kxrplupzbsmujjznzhpy
```

This is the production Supabase project ref. It was committed when the project was originally set up with `supabase link`. All 8 non-`cli-latest` files at HEAD point to or describe the production-linked project.

**Critical implication**: Running `git checkout -- supabase/.temp` would restore all 8 deleted files to their HEAD versions, reintroducing the production link (`project-ref = kxrplupzbsmujjznzhpy`) into the working directory. Any subsequent Supabase CLI command would then target production. Do not restore `.temp` to HEAD.

---

## Backup Path and Contents

Backup directory: `supabase/.temp.production-link-backup-goal1/`

Contents verified:
- `cli-latest` (original version `v2.98.2`)
- `gotrue-version`
- `linked-project.json` — contains `"ref":"kxrplupzbsmujjznzhpy"` and `"name":"verian-bios"`
- `pooler-url`
- `postgres-version`
- `project-ref` — confirmed `kxrplupzbsmujjznzhpy`
- `rest-version`
- `storage-migration`
- `storage-version`

The backup is inside the repository directory but untracked. It must not be committed or pushed — it contains the production project ref.

---

## Current .temp State

`supabase/.temp/` currently contains only:

```
cli-latest   (8 bytes, v2.105.0, written by supabase status on 2026-06-07)
```

No `project-ref`. No `linked-project.json`. The active `.temp` directory is **not linked to any remote project**. This is the safe state for local development work and for staging/dev promotion using explicit flags.

---

## Recommended Cleanup Path

### Evaluation of Options

| Option | Description | Safety | Recommended |
|---|---|---|---|
| A | Leave `.temp` dirty and document | Safe now; dirty state persists; staging/dev unaffected if explicit flags used | Acceptable short-term |
| B | Restore tracked `.temp` files to HEAD | **DANGEROUS** — restores production ref `kxrplupzbsmujjznzhpy`; do not use | No |
| C | Move backup outside repo then restore tracked files | Restoring still reintroduces production link from HEAD; requires immediate re-isolation | No |
| D | Untrack `supabase/.temp` in a hygiene commit | Correct permanent fix; eliminates problem for all future CLI operations | Yes — follow-up commit |
| E | Move backup outside repo only (no restore) | Safe; removes production metadata from repo directory; current `.temp` stays as-is | Yes — immediate step |

### Two-Step Recommended Path

**Step 1 — Immediate (next approved cleanup step):**

Move the backup directory outside the repository to a permanent safe location:

```powershell
Move-Item -LiteralPath "c:\Projects\verian-bios\supabase\.temp.production-link-backup-goal1" `
  -Destination "c:\Users\micha\supabase-backup-verian-bios-goal1"
```

This:
- Removes the production metadata files from the repo directory entirely
- Eliminates any risk of accidentally staging or committing the backup
- Preserves the backup for reference outside the repo
- Does not touch git, Supabase config, or the database
- Does not restore or modify `supabase/.temp`

After this step, `git status` will no longer show `?? supabase/.temp.production-link-backup-goal1/`.

The 9 tracked `.temp` dirty state (`M cli-latest`, `D` the other 8) will remain until Step 2.

**Step 2 — Follow-up hygiene commit (separate approved step):**

Untrack `supabase/.temp` from git and add it to `.gitignore`:

```powershell
# Add to .gitignore
Add-Content .gitignore "`nsupabase/.temp/"

# Remove all 9 tracked files from git index without deleting them from disk
git rm --cached supabase/.temp/cli-latest
git rm --cached supabase/.temp/gotrue-version
git rm --cached supabase/.temp/linked-project.json
git rm --cached supabase/.temp/pooler-url
git rm --cached supabase/.temp/postgres-version
git rm --cached supabase/.temp/project-ref
git rm --cached supabase/.temp/rest-version
git rm --cached supabase/.temp/storage-migration
git rm --cached supabase/.temp/storage-version

# Commit
git add .gitignore
git commit -m "Chore: untrack Supabase CLI temp metadata from git"
```

This:
- Removes the production project ref from git history's working-tree tracking (not from history itself — for that, a `git filter-repo` would be needed, but that is a separate and optional concern)
- After commit, all future Supabase CLI operations leave no git dirty state
- `.temp` remains on disk for CLI use; it is just no longer versioned
- Does not affect the database, migration, Vercel, or environment

---

## Commands That Must Not Be Run

```powershell
# Do not restore .temp to HEAD — reintroduces production link
git checkout -- supabase/.temp

# Do not run any Supabase CLI command that relies on .temp state
npx supabase db push
npx supabase db push --linked
npx supabase migration up --linked
npx supabase link --project-ref kxrplupzbsmujjznzhpy

# Do not commit .temp changes or the backup directory
git add supabase/.temp
git add supabase/.temp.production-link-backup-goal1
```

---

## Safety Notes for Staging/Dev Promotion

The current `.temp` state (only `cli-latest`, no `project-ref`) is **safe for staging/dev migration promotion**. Supabase CLI will not auto-target any remote project because no `project-ref` is present. Staging/dev promotion must use an explicit project ref flag or explicit `--db-url`. Do not rely on implicit CLI targeting for any remote migration command.

If Step 1 is completed before staging/dev promotion, the backup directory is out of the repo entirely. Step 2 (untrack) is not required before staging/dev promotion but should be completed before any broader team use.

---

## Safety Confirmation

- Migration `20240040`: Applied locally only, not re-applied in this step.
- Production: Untouched.
- Staging/dev remote: Untouched.
- No migration commands run.
- No database write commands run.
- Supabase config unchanged.
- Environment variables unchanged.
- Vercel settings unchanged.
- System controls unchanged.
- `EMAIL_SENDING_ENABLED`: Unchanged.
- `CAMPAIGN_SENDING_ENABLED`: Unchanged.
- No emails sent.
- No campaign sending added.
- No background jobs added.
- No files staged, committed, or pushed in this preflight.
- Goal 2 has not started.
- Slice 5 remains BLOCKED.
