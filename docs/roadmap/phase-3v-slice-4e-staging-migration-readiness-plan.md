# Phase 3V Slice 4E — Staging Migration Readiness Plan

**Status:** Planning only — no migrations applied, no sending, no execution
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4D — Staging Evidence Recollection
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`

> **⚠️ Slice 4E plans the migration readiness path only. It does NOT apply migrations, modify staging schema, create records, enable flags, or authorize Slice 5.**

---

## A. Purpose

Phase 3V Slice 4D found that staging (`smbausuyetlgxflyhmfg`) is at migration `20240036` and the `proposal_follow_up_commitments` table does not exist. This table is required for the `sendFollowUpDraftAction` path that Slice 5 will test. Slice 4E plans the safe path to apply migrations `20240037`–`20240039` to staging in a future, separate, explicitly approved execution step.

**Slice 4E is planning only.** It does not apply migrations, modify staging, change system controls, provider config, sender config, records, drafts, or flags. Slice 5 remains blocked.

---

## B. Current Blocked State

| Item | Status |
|------|--------|
| Staging Supabase ref | `smbausuyetlgxflyhmfg` ✓ confirmed |
| Staging app URL | `https://verian-bios-staging.vercel.app` ✓ confirmed |
| Staging migration level | `20240036` (highest applied) |
| Local migration level | `20240039` (migrations `20240037`–`20240039` applied to local only) |
| `proposal_follow_up_commitments` in staging | **Does not exist** — requires `20240038` |
| Sender identity in staging | Exists but `is_verified = false`, `status = 'pending'` |
| Provider key, permission holder, recipient, test draft | TBD |
| `verifiedScope` | Global null — per-tenant override preferred |
| Rollback owner, test window | TBD |
| Slice 5 | **BLOCKED** |

---

## C. Non-Goals

Slice 4E does NOT:

- Apply migrations
- Run `supabase db push` or any migration command
- Run migration repair
- Create new migrations
- Modify existing migrations
- Touch production
- Change Vercel settings
- Modify Supabase config
- Modify system controls
- Create or approve drafts
- Create or modify records
- Enable `EMAIL_SENDING_ENABLED`
- Enable `CAMPAIGN_SENDING_ENABLED`
- Send emails
- Click send buttons
- Proceed to Slice 5

---

## D. Migration Inventory

### `20240037_phase3m_draft_assignment_linkage.sql`

| Property | Detail |
|----------|--------|
| Purpose | Phase 3M — links email drafts to campaign assignments |
| Tables created | None |
| Tables altered | `email_drafts` — adds nullable `campaign_assignment_id uuid` FK → `campaign_assignments(id) ON DELETE SET NULL` |
| Indexes | `idx_email_drafts_campaign_assignment_id` (partial, `WHERE campaign_assignment_id IS NOT NULL`) |
| RLS/grants | None new — existing policies on `email_drafts` cover new column |
| Dependencies | `campaign_assignments` table (from `20240036`) — confirmed exists in staging |
| Additive only | Yes — no existing rows modified, no defaults to backfill |
| Applied locally | Yes |
| Applied to staging | **No** — staging is at `20240036` |
| Safe to plan for staging | Yes — purely additive column + index on existing table |

### `20240038_phase3n_proposal_capture.sql`

| Property | Detail |
|----------|--------|
| Purpose | Phase 3N — creates the proposal capture and follow-up commitment schema |
| Tables created | `proposal_captures`, `proposal_events`, `proposal_follow_up_commitments` |
| Tables altered | `proposal_captures` — `resolved_event_id` FK added after `proposal_events` exists |
| RLS policies | `SELECT USING (tenant_id::text = auth.jwt()->>'tenant_id')` and `ALL USING (auth.role() = 'service_role')` on all 3 tables |
| Grants | `GRANT SELECT TO authenticated`, `GRANT ALL TO service_role` on all 3 tables |
| Indexes | 11 indexes across 3 tables; notable: `idx_proposal_events_one_open_per_lead` (unique partial) |
| Dependencies | `leads`, `contacts`, `companies`, `accounts`, `opportunities`, `auth.users`, `email_drafts` |
| Additive only | Yes — no existing tables modified |
| Applied locally | Yes |
| Applied to staging | **No** |
| Safe to plan for staging | Likely — purely additive; verify `accounts` and `opportunities` tables exist in staging before execution |

**Dependency note:** `proposal_events` references `accounts(id)` and `opportunities(id)`. These tables must exist in staging before `20240038` can be applied. Both should exist if staging is built on the same base schema — verify before execution.

### `20240039_phase3r_follow_up_skip_fields.sql`

| Property | Detail |
|----------|--------|
| Purpose | Phase 3R — adds Skip-state fields to `proposal_follow_up_commitments` |
| Tables created | None |
| Tables altered | `proposal_follow_up_commitments` — adds `skipped_at timestamptz NULL`, `skipped_reason text NULL`, `skipped_by_user_id uuid NULL` (FK → `auth.users(id) ON DELETE SET NULL`) |
| RLS/grants | None new — existing policies/grants on `proposal_follow_up_commitments` cover new columns |
| Dependencies | `proposal_follow_up_commitments` table (from `20240038`) — must be applied after `20240038` |
| `commitment_status` CHECK | Already includes `'skipped'` in `20240038` — no constraint change needed |
| Additive only | Yes |
| Applied locally | Yes |
| Applied to staging | **No** — depends on `20240038` |
| Safe to plan for staging | Yes — purely additive columns on table created by `20240038` |

### Dependency chain

```
20240036 (staging ← currently here)
  ↓
20240037  ← adds campaign_assignment_id to email_drafts
  ↓
20240038  ← creates proposal_captures, proposal_events, proposal_follow_up_commitments
  ↓
20240039  ← adds skip fields to proposal_follow_up_commitments
```

All three must be applied in order. No gaps. `20240039` cannot be applied before `20240038`.

---

## E. Schema Requirement for Slice 5

`sendFollowUpDraftAction` validates `subject_type = 'proposal_follow_up_commitment'` and `source_type = 'future_follow_up'` on the linked `email_drafts` row. The action also fetches the `proposal_follow_up_commitments` row to derive the `draftId` server-side and validate commitment scope.

Without `proposal_follow_up_commitments`, it is impossible to:
1. Create a valid test commitment
2. Link a `future_follow_up` approved draft to a commitment
3. Call `sendFollowUpDraftAction` successfully

Migration `20240038` is the minimum required. Migration `20240039` adds skip fields needed for testing the Skip path (Phase 3R), though it is not strictly required for the basic send test. Migration `20240037` is needed to keep staging in sequence and avoid gaps.

**All three must be applied together in order** before any test-object creation can proceed.

---

## F. Environment Safety Requirements

| Requirement | Detail |
|-------------|--------|
| Production ref | `kxrplupzbsmujjznzhpy` — must never be the migration target |
| Staging ref | `smbausuyetlgxflyhmfg` — only valid remote target |
| Verify before ANY migration command | `cat supabase/.temp/project-ref` must equal `smbausuyetlgxflyhmfg` |
| Hard stop condition | If `supabase/.temp/project-ref` = `kxrplupzbsmujjznzhpy`, stop immediately |
| Local comparison only | Local migration state (`20240039`) may be used for reference — NOT as proof of staging |
| Relink requirement | Must relink CLI to `smbausuyetlgxflyhmfg` and verify before any staging migration command (same procedure as Slice 4D) |

---

## G. Pre-Application Validation Checklist (for future execution)

- [ ] Working tree clean (`git status --short` shows nothing)
- [ ] HEAD and origin/master confirmed current
- [ ] Migration files `20240037`, `20240038`, `20240039` reviewed and match committed versions
- [ ] No uncommitted code changes
- [ ] No new migration files created
- [ ] Supabase CLI linked project ref verified as `smbausuyetlgxflyhmfg` (`cat supabase/.temp/project-ref`)
- [ ] Production project ref `kxrplupzbsmujjznzhpy` NOT linked
- [ ] Staging current migration level confirmed as `20240036` before application
- [ ] Local migration state confirmed through `20240039` (for reference)
- [ ] `accounts` and `opportunities` tables confirmed to exist in staging (for `20240038` dependency)
- [ ] Migration application command identified and reviewed
- [ ] Rollback/recovery plan documented (for each migration if possible)
- [ ] Production explicitly excluded from target
- [ ] `EMAIL_SENDING_ENABLED` confirmed `false` before migration
- [ ] `CAMPAIGN_SENDING_ENABLED` confirmed `false` before migration
- [ ] No send/draft/record creation included in migration step
- [ ] Operator approval obtained for migration execution

---

## H. Future Execution Outline

> **NOT TO BE RUN IN SLICE 4E.** This outline is for documentation and planning purposes only. A separate migration-execution prompt is required after Codex PASS on this plan.

```
1.  Verify git state: git status --short, git log --oneline -5
    — working tree must be clean

2.  Verify HEAD/origin match

3.  Relink CLI to staging (separate approved step):
    npx supabase link --project-ref smbausuyetlgxflyhmfg

4.  Verify linked project ref:
    cat supabase/.temp/project-ref
    — must equal smbausuyetlgxflyhmfg
    — if kxrplupzbsmujjznzhpy: HARD STOP

5.  Confirm current staging migration level:
    SELECT version FROM supabase_migrations.schema_migrations
    ORDER BY version DESC LIMIT 5
    — must show 20240036 as highest; if higher, investigate before proceeding

6.  Verify accounts and opportunities tables exist in staging:
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('accounts','opportunities')
    — both must be present (20240038 dependency)

7.  Apply migrations to staging only:
    npx supabase db push --linked
    (or equivalent approved migration command — choose carefully)

8.  Re-check applied migration list:
    SELECT version FROM supabase_migrations.schema_migrations
    ORDER BY version DESC LIMIT 5
    — must show 20240039 as highest

9.  Verify expected tables exist:
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('proposal_captures','proposal_events','proposal_follow_up_commitments')
    — all three must be present

10. Verify expected columns on proposal_follow_up_commitments:
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'proposal_follow_up_commitments'
    ORDER BY ordinal_position
    — must include skipped_at, skipped_reason, skipped_by_user_id

11. Verify email_drafts.campaign_assignment_id column exists:
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'email_drafts' AND column_name = 'campaign_assignment_id'

12. Confirm EMAIL_SENDING_ENABLED remains false:
    SELECT key, value FROM system_controls
    WHERE key = 'email_sending_enabled'

13. Confirm CAMPAIGN_SENDING_ENABLED remains false:
    SELECT key, value FROM system_controls
    WHERE key = 'campaign_sending_enabled'

14. Confirm no emails were sent:
    SELECT COUNT(*) FROM email_sends
    WHERE created_at > '<migration_start_timestamp>'

15. Record results and stop for Codex review
```

---

## I. Post-Application Validation Requirements

After future migration application, validation must confirm:

| Check | Expected |
|-------|---------|
| Staging migration list includes `20240037`, `20240038`, `20240039` | Yes |
| `proposal_follow_up_commitments` table exists | Yes |
| `proposal_events` table exists | Yes |
| `proposal_captures` table exists | Yes |
| `proposal_follow_up_commitments` has `skipped_at`, `skipped_reason`, `skipped_by_user_id` | Yes |
| `email_drafts` has `campaign_assignment_id` column | Yes |
| RLS policies present on new tables | Yes |
| Grants present on new tables | Yes |
| Existing staging tenant/workspace intact | Yes — no data loss |
| `email_drafts` existing rows preserved | Yes |
| `system_controls` `email_sending_enabled` = `false` | Yes |
| `system_controls` `campaign_sending_enabled` = `false` | Yes |
| Sender identity `e57848e7-...` still exists | Yes — no data loss |
| No `email_sends` rows created by migration | Yes |
| No production changes occurred | Yes |

---

## J. Stop Conditions

**Any of the following must immediately halt migration execution:**

| Condition | Action |
|-----------|--------|
| Working tree dirty before migration | Hard stop |
| HEAD/origin mismatch | Stop — sync first |
| Linked project ref ≠ `smbausuyetlgxflyhmfg` | Hard stop |
| Linked project ref = `kxrplupzbsmujjznzhpy` | **Hard stop** — production |
| Migration files missing or out of order | Stop — investigate |
| Migration content differs from committed files | Stop — do not apply unknown content |
| `accounts` or `opportunities` tables absent in staging | Stop — dependency not satisfied |
| Migration requires production-only secrets/config | Stop — must not proceed |
| Migration contains unexpected destructive operations | **Hard stop** |
| Staging already at or past `20240037` | Stop — investigate before proceeding |
| `EMAIL_SENDING_ENABLED` is `true` | Hard stop |
| `CAMPAIGN_SENDING_ENABLED` is `true` | Hard stop |
| Operator approval missing | Stop |
| Any command would touch production | **Hard stop** |
| Any step proposes sending email | **Hard stop** |
| Any step proposes draft or record creation | Stop — migration should not create data |
| Any step proposes automation or background jobs | **Hard stop** |

---

## K. Relationship to Slice 4D and Slice 5

- **Slice 4D** found the missing `proposal_follow_up_commitments` table blocker
- **Slice 4E** plans the migration readiness response
- **Applying migrations does NOT authorize Slice 5**
- After migrations are applied and validated, Slice 4A/4D evidence recollection must be re-run to update remaining TBD fields (sender verification, provider key, permission holder, test draft/commitment, recipient)
- **Slice 5 remains blocked until all evidence fields are complete and Codex-reviewed**
- Sender identity verification (`is_verified = false`) is a separate blocker that migration application does not resolve

---

## L. Required Codex Review

1. **Codex must review this Slice 4E plan** before any migration-application prompt is written
2. **Codex PASS on Slice 4E does NOT authorize migration execution** — a separate execution prompt is required
3. **Codex PASS on Slice 4E does NOT authorize Slice 5**
4. After migration application and validation, the updated evidence must be re-submitted to Codex before Slice 5 is considered

---

## M. Final Decision

- Slice 4E authorizes **planning only**
- No migrations are applied
- No production activity is authorized
- No sending is authorized
- **Slice 5 remains blocked**
- Next step after Codex PASS: a **separate migration-application prompt** targeting staging (`smbausuyetlgxflyhmfg`) only, applying `20240037`–`20240039` in order, if operator approves
