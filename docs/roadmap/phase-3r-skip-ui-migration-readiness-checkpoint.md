# Phase 3R — Skip UI Migration Readiness Checkpoint

**Type:** Documentation-only checkpoint — no code changes
**Created:** 2026-06-01
**Relates to:** Migration 20240039, Phase 3R Slice 12B / 13

---

## 1. Purpose

The Phase 3R Skip backend stack (repository, service, and server action) is fully implemented and pushed. The Skip server action (`skipFollowUpCommitmentAction`) exists and is correct, but it has **no UI caller** — this is intentional.

This checkpoint exists because **migration 20240039 must be applied to a target environment before the Skip UI is wired into that environment**. Wiring a Skip button before the target database has the three Skip columns (`skipped_at`, `skipped_reason`, `skipped_by_user_id`) would cause runtime write failures for any user who clicks Skip.

This document records:
- The current state of the Complete and Skip paths
- Exactly what migration 20240039 adds
- The required application order per environment
- A pre-UI readiness checklist
- A safe verification query operators can run to confirm migration status

---

## 2. Current State

### Complete path — fully shipped end-to-end

```
CompleteFollowUpButton (UI — client component)
    ↓
completeFollowUpCommitmentAction (server action — crm.leads.edit)
    ↓
completeFollowUpCommitmentForWorkspace (service — audit via recordActivityEvent)
    ↓
completeFollowUpCommitment (repository — fetch-before-write, race guard)
    ↓
proposal_follow_up_commitments (DB — existing columns, no migration required)
```

The Complete path requires no migration. It is fully operational in any environment where Phase 3R code is deployed.

### Skip path — backend-only (no UI caller yet)

```
[NO UI EXISTS YET]
    ↓
skipFollowUpCommitmentAction (server action — crm.leads.edit — exists but unwired)
    ↓
skipFollowUpCommitmentForWorkspace (service — audit via recordActivityEvent)
    ↓
skipFollowUpCommitment (repository — fetch-before-write, race guard)
    ↓
proposal_follow_up_commitments (DB — requires migration 20240039)
```

The Skip action is safe to deploy — it will never be called until a UI component invokes it. The UI does not exist yet. Do not wire the Skip UI in any environment until that environment has migration 20240039 applied and verified.

---

## 3. Migration 20240039 Summary

**File:** `supabase/migrations/20240039_phase3r_follow_up_skip_fields.sql`
**Status:** Committed and pushed — not applied to any environment

### What it adds

Three new nullable columns to `public.proposal_follow_up_commitments`:

| Column | Type | Purpose |
|--------|------|---------|
| `skipped_at` | `timestamptz NULL` | Timestamp when the commitment was skipped |
| `skipped_reason` | `text NULL` | Optional operator-provided reason for skipping |
| `skipped_by_user_id` | `uuid NULL` | Actor who performed the skip (FK → `auth.users.id ON DELETE SET NULL`) |

### Full migration SQL

```sql
ALTER TABLE public.proposal_follow_up_commitments
  ADD COLUMN IF NOT EXISTS skipped_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS skipped_reason     text        NULL,
  ADD COLUMN IF NOT EXISTS skipped_by_user_id uuid        NULL;

ALTER TABLE public.proposal_follow_up_commitments
  ADD CONSTRAINT proposal_follow_up_commitments_skipped_by_user_id_fkey
    FOREIGN KEY (skipped_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
```

### What it does NOT change

- `commitment_status` CHECK constraint — `'skipped'` was already permitted by migration 20240038; no constraint change is needed here
- RLS policies — existing `service_role` and select policies on `proposal_follow_up_commitments` automatically cover new columns; no new policies are needed
- Grants — existing `GRANT ALL ON proposal_follow_up_commitments TO service_role` from migration 20240038 covers new columns
- No backfill, no trigger, no function, no index, no view, no email behavior, no automation, no UI behavior

### Known note (carried from Codex Slice 8 review)

The `ADD CONSTRAINT` statement is not wrapped in an idempotency guard (`DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`). Because Supabase migrations run exactly once in sequence, this is not blocking for the standard workflow. If re-run scenarios arise, wrap the constraint add in a `DO` block before applying.

---

## 4. Required Migration Application Order

Migration 20240039 must be applied **before** the Skip UI is wired in the corresponding environment.

| Environment | Apply migration? | Wire Skip UI? |
|-------------|-----------------|---------------|
| Local development | Apply if testing Skip UI locally | Only after local apply |
| Staging | Apply before staging Skip UI deploy | Only after staging apply |
| Production | **Separate explicit approval required** | Only after production apply is approved and executed |

**Sequence for each environment:**

1. Apply migration 20240039 via `supabase db push` (local) or `supabase migration up` / Supabase dashboard (remote)
2. Verify columns exist (see Section 6 below)
3. Implement the Skip UI (Slice 13)
4. Wire `skipFollowUpCommitmentAction` into the Skip UI component
5. Test the full Skip path

Do not skip step 2. The verification query is fast and confirms the database is ready before any UI code is merged.

---

## 5. Pre-UI Readiness Checklist

Before beginning Slice 13 (Skip UI) in any environment:

- [ ] Migration 20240039 exists in the repository (`supabase/migrations/20240039_phase3r_follow_up_skip_fields.sql`)
- [ ] Migration 20240039 has been reviewed (Codex confirmed PASS — Slice 8)
- [ ] Migration 20240039 has been applied to the **target environment**
- [ ] Verification SQL (Section 6) has been run and confirms all three columns are present
- [ ] `types/database.ts` reflects the three Skip fields (`skipped_at`, `skipped_reason`, `skipped_by_user_id`) — already updated in Slice 8
- [ ] Skip repository function (`skipFollowUpCommitment`) is deployed — Slice 9
- [ ] Skip service function (`skipFollowUpCommitmentForWorkspace`) is deployed — Slice 10
- [ ] Skip server action (`skipFollowUpCommitmentAction`) is deployed — Slice 11
- [ ] No `SkipFollowUpButton` UI component exists yet (guard — remains true until Slice 13)
- [ ] Production migration application has been **separately approved** before production Skip UI exposure

---

## 6. Verification SQL

Run this read-only query against the target environment to confirm the three Skip columns exist before wiring the UI:

```sql
-- Verify that migration 20240039 columns are present.
-- Expected: 3 rows returned, one per column.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE
  table_schema = 'public'
  AND table_name  = 'proposal_follow_up_commitments'
  AND column_name IN ('skipped_at', 'skipped_reason', 'skipped_by_user_id')
ORDER BY column_name;
```

**Expected result:**

| column_name | data_type | is_nullable |
|-------------|-----------|-------------|
| skipped_at | timestamp with time zone | YES |
| skipped_by_user_id | uuid | YES |
| skipped_reason | text | YES |

If fewer than 3 rows are returned, migration 20240039 has not been applied to this environment. Do not wire the Skip UI.

Verify the FK constraint:

```sql
-- Confirm the skipped_by_user_id FK exists.
-- Expected: 1 row returned.
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE
  table_schema    = 'public'
  AND table_name  = 'proposal_follow_up_commitments'
  AND constraint_name = 'proposal_follow_up_commitments_skipped_by_user_id_fkey';
```

These queries are read-only and safe to run in any environment. They do not modify any data.

---

## 7. Guardrails

These guardrails remain in effect for all Phase 3R slices from this point forward:

- No emails — `EMAIL_SENDING_ENABLED` remains disabled
- No campaign sending — `CAMPAIGN_SENDING_ENABLED` remains disabled
- No automation or background jobs — no Inngest
- No LLM/AI provider imports in any Phase 3R file
- No proposal status mutation behavior from any Skip/Complete/Reschedule action
- No email draft generation — deferred to Phase 3S
- Skip UI must not be wired until migration 20240039 is applied to the target environment
- Production migration application requires separate explicit approval — do not apply in a code slice
- No reschedule or reopen controls until Complete and Skip are stable and Reschedule/Reopen is explicitly approved

---

## 8. Next Recommended Slices

### If migration has not been applied yet

**Phase 3R Slice 12B** — Apply migration 20240039 to local/staging:
- Run `supabase db push` (local) or apply via Supabase dashboard (staging)
- Run the verification SQL from Section 6
- Confirm 3 columns present; confirm FK constraint present
- No code changes in Slice 12B — migration application only

### If migration is already applied and verified

**Phase 3R Slice 13** — Skip UI confirmation control:
- Create `SkipFollowUpButton` client component mirroring the `CompleteFollowUpButton` pattern
- State machine: `idle → confirming → loading → success | error`
- Imports and calls `skipFollowUpCommitmentAction`
- Accepts only `commitmentId` prop — never tenantId/workspaceId/actorUserId from client
- `router.refresh()` on success
- Wire into the queue page (`page.tsx`) per-row alongside `CompleteFollowUpButton`

### Production

Production Skip UI exposure requires both:
1. Production migration 20240039 application — separately approved
2. Explicit instruction to wire Skip UI in production

These are two separate decisions. Neither is implied by completing Slice 13 in local/staging.
