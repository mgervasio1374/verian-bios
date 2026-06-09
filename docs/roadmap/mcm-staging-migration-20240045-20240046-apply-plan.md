# MCM Staging Migration Apply Plan — 20240045 + 20240046

**Goal:** apply the two Manual Campaign Mode schema migrations to **staging** (`smbausuyetlgxflyhmfg`), closing the assignment-creation gap so the deployed MCM code works end-to-end.
**Migrations:** `20240045_mcm1_campaign_sequence_sender_and_mode.sql`, `20240046_mcm6_campaign_assignment_sequence_link.sql`
**Author:** architect (Claude) · **Audience:** operator · **Pattern:** mirrors `goal-5-migration-20240044-staging-apply-plan.md`

---

## What these migrations do (both additive, both fast)

- **20240045** — on `campaign_sequences`: `ADD COLUMN sender_identity_id uuid NULL REFERENCES sender_identities(id) ON DELETE SET NULL`; `ADD COLUMN authoring_mode text NOT NULL DEFAULT 'template' CHECK (authoring_mode IN ('manual','ai_assisted','template'))`; partial index `idx_campaign_sequences_sender_identity`.
- **20240046** — on `campaign_assignments`: `ADD COLUMN campaign_sequence_id uuid NULL REFERENCES campaign_sequences(id) ON DELETE SET NULL`; partial index `idx_campaign_assignments_sequence`.

**Lock/safety note:** the only `NOT NULL` column (`authoring_mode`) has a **constant default**, so on Postgres 11+ this is a metadata-only add (no table rewrite, brief lock) — existing rows get `'template'`, preserving current semantics. The two nullable FK columns are trivial. No data migration, no backfill, no policy/RLS/grant changes. Applying `20240046` **closes the gap** where the already-deployed `createCampaignAssignment` references `campaign_sequence_id`.

---

## §1 — Target isolation (HARD STOP gate)

```bash
cat supabase/.temp/project-ref
# MUST print: smbausuyetlgxflyhmfg   (staging)
# ABORT IMMEDIATELY if it prints kxrplupzbsmujjznzhpy (prod / .env.remote-dev) or anything else.

npx supabase projects list
# Confirm the LINKED row (●) is the staging project (verian-bios-staging / smbausuyetlgxflyhmfg).
```
**Do not proceed unless the linked ref is `smbausuyetlgxflyhmfg`.**

## §2 — Source state

```bash
git status --short        # clean (only docs/roadmap/operational-twin-north-star.md untracked is OK)
git rev-parse --short HEAD # expect 8c51547 (origin/master); migration files are committed + pushed
ls supabase/migrations/20240045_mcm1_campaign_sequence_sender_and_mode.sql \
   supabase/migrations/20240046_mcm6_campaign_assignment_sequence_link.sql   # both present
```

## §3 — Migration history pre-check

```bash
npx supabase migration list --linked
```
- Confirm staging **Remote** is applied through **`20240044`**.
- Confirm **exactly two** pending/un-applied on remote: **`20240045` and `20240046`** — and nothing between.
- **HARD STOP** if: remote already shows 45 or 46 applied; or more than these two are pending (means staging is behind on something else — reconcile first); or the command errors.

## §4 — Schema pre-checks (read-only; confirm columns are NOT already present)

Run against staging (Supabase SQL editor for `smbausuyetlgxflyhmfg`, or psql). Each should return **0 rows**:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'campaign_sequences' AND column_name IN ('sender_identity_id','authoring_mode');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'campaign_assignments' AND column_name = 'campaign_sequence_id';
```
Also confirm the FK targets exist (each should return 1 row):
```sql
SELECT to_regclass('public.sender_identities');   -- not null
SELECT to_regclass('public.campaign_sequences');  -- not null (created in 20240040)
SELECT to_regclass('public.campaign_assignments'); -- not null
```
**HARD STOP** if any column already exists, or any FK-target table is missing.

## §5 — Apply

```bash
npx supabase migration up --linked
```
- Applies `20240045` then `20240046` (filename order).
- Watch the output: it must apply **only** those two. **HARD STOP** on any error, an unexpected migration, or any mention of the prod ref.
- Never use `db push`, `db reset`, or `migration repair`.

## §6 — Post-apply verification

```bash
npx supabase migration list --linked   # remote now shows 20240046 as latest applied
```
Read-only schema checks (expected results in comments):
```sql
-- campaign_sequences: both columns present, authoring_mode NOT NULL default 'template'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'campaign_sequences' AND column_name IN ('sender_identity_id','authoring_mode');
-- expect: sender_identity_id | uuid | YES | NULL
--         authoring_mode     | text | NO  | 'template'::text

-- authoring_mode CHECK constraint present
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'campaign_sequences'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%authoring_mode%';
-- expect: CHECK (authoring_mode IN ('manual','ai_assisted','template'))

-- campaign_assignments: campaign_sequence_id present, nullable
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'campaign_assignments' AND column_name = 'campaign_sequence_id';
-- expect: campaign_sequence_id | uuid | YES

-- both partial indexes present
SELECT indexname FROM pg_indexes
WHERE indexname IN ('idx_campaign_sequences_sender_identity','idx_campaign_assignments_sequence');
-- expect: both rows
```
**Confirm no sends / no automation fired:** every campaign control is still off for every tenant — these stay OFF until the deliberate per-tenant flip (runbook Phase D). Quick check:
```sql
SELECT tenant_id, key, value, is_enabled FROM system_controls
WHERE key IN ('campaign_scheduler_enabled','campaign_approval_routing_enabled',
              'campaign_send_dispatch_enabled','email_sending_enabled');
-- expect: no rows, or all value=false / is_enabled=false
```

## §7 — Evidence report

File `docs/roadmap/mcm-staging-migration-20240045-20240046-evidence-report.md` capturing: linked ref confirmed; pre-apply `migration list` (44, 45/46 pending); §4 pre-checks (0 rows); apply output; §6 post-checks (columns/constraint/indexes present, list shows 46); controls still off. Same shape as the goal-5 evidence report.

---

## After apply (out of this plan's scope)

- **Gap closed:** `createCampaignAssignment` and the sequence-authoring/picker UI now work on staging.
- **Optional — typed columns:** regenerate `types/database.ts` locally (`npx supabase migration up` on local Docker → `npx supabase gen types typescript --local > types/database.ts`) and commit, so the new columns are typed in source. The deployed code uses the untyped service client, so this is cosmetic/DX only.
- **Next:** runbook Phase C (dry-run smoke test with sending still off) → Phase D (per-tenant flag flip) → Phase E (onboard Bruce).

## ⛔ Reminder

This plan is **staging only**. Production (`kxrplupzbsmujjznzhpy`, also `.env.remote-dev`) is at `20240034` and needs `20240035`→`20240046` as a separate, larger release with its own plan. Never apply against that ref here.
