# Goal 5 Migration 20240044 — Staging Apply Plan

**Status:** Plan only. No staging apply authorized by this document.  
**Migration:** 20240044 — Add `policy_review_submitted` to `bridge_audit_events.event_type` CHECK constraint  
**Staging project:** `smbausuyetlgxflyhmfg` (verian-bios-staging)  
**Production project:** `kxrplupzbsmujjznzhpy` — **HARD STOP. Not part of this plan.**  
**Purpose:** Define the exact pre-checks, apply command, and post-apply verification required before a future staging apply prompt is authorized.

---

## 1. Target Isolation Pre-Checks

The future staging apply prompt must prove the target is staging before any SQL is executed.

### 1a. Confirm linked project is staging

Run:
```
npx supabase projects list
```

Confirm the output includes `smbausuyetlgxflyhmfg` and the project name matches `verian-bios-staging`.

Run:
```
npx supabase status
```

Confirm the linked project ref in `.temp/` or CLI output resolves to `smbausuyetlgxflyhmfg`. Confirm the DB URL is not `127.0.0.1` (local) and not a production endpoint.

### 1b. Production ref must not appear

Confirm that `kxrplupzbsmujjznzhpy` does not appear in:
- the linked project ref
- the apply command target
- any CLI output for the apply target
- the `supabase/.temp/project-ref` or equivalent config

**Stop if `kxrplupzbsmujjznzhpy` appears anywhere in the target resolution.**

### 1c. Stop conditions for target isolation

| Condition | Action |
|-----------|--------|
| Linked project ref is `kxrplupzbsmujjznzhpy` | STOP — production is a hard stop |
| Linked project ref is unrecognized (neither staging nor local) | STOP — target is ambiguous |
| CLI output references production URL or production DB | STOP |
| `.supabase/` config resolves to production | STOP |
| `supabase status` shows local `127.0.0.1` instead of staging | STOP — wrong target |

---

## 2. Source State Pre-Checks

Before any staging apply, confirm the local source is in the correct committed state.

### 2a. Git state

Run:
```
git status --short
git rev-parse HEAD
git rev-parse origin/master
```

Expected:
- Working tree: clean (no output from `git status --short`)
- HEAD: `c0a2062c95130f53e28b608bb5eaf3c78a7c3525`
- origin/master: `c0a2062c95130f53e28b608bb5eaf3c78a7c3525`

**Stop if HEAD or origin/master differ from `c0a2062`.**

### 2b. Migration file must be committed and present

Run:
```
Test-Path supabase/migrations/20240044_bridge_audit_event_policy_review_submitted.sql
```

Expected: `True`

Confirm the file is committed (not untracked or modified):
```
git status -- supabase/migrations/20240044_bridge_audit_event_policy_review_submitted.sql
```

Expected: no output (file is clean/committed).

### 2c. Source-reading tests must pass

Run:
```
npx vitest run tests/goal5-bridge-audit-event-policy-review-submitted-migration.test.ts
```

Expected: 35/35 PASS

Run:
```
npx vitest run tests/goal5-bridge-maintain-revoke-migration.test.ts tests/goal5-bridge-grant-hardening-migration.test.ts tests/goal5-agent-bridge-review-queue-audit-types.test.ts
```

Expected: 48/48 PASS

**Stop if any test fails.**

---

## 3. Staging Migration-History Pre-Check

Before applying, confirm the staging migration history is in the expected state.

### 3a. List staging migration state

Run:
```
npx supabase migration list --linked
```

Confirm:
- Migrations 20240001 through 20240043 appear as applied on staging
- Migration 20240044 appears in the local file list but NOT as applied on staging (pending column empty)
- No unexpected pending migrations beyond 20240044

### 3b. Confirm only 20240044 is pending

If the migration list shows additional pending migrations beyond 20240044, stop. Do not apply a batch that includes unreviewed migrations.

### 3c. Stop conditions for migration history

| Condition | Action |
|-----------|--------|
| 20240044 already applied on staging | STOP — do not re-apply |
| Staging is not through 20240043 | STOP — staging is not in expected state; investigate |
| Unreviewed migrations beyond 20240044 are pending | STOP — do not batch-apply; review each separately |
| Migration history query errors | STOP — investigate before proceeding |

---

## 4. Staging Constraint-Name Discovery

Before applying, run a read-only query on staging to confirm the constraint state.

### 4a. Discovery query

Run against staging (read-only, no writes):
```sql
SELECT tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'bridge_audit_events'
  AND tc.constraint_type = 'CHECK'
  AND tc.constraint_name = 'bridge_audit_events_event_type_check';
```

Using the Supabase CLI:
```
npx supabase db query --linked "SELECT tc.constraint_name, cc.check_clause FROM information_schema.table_constraints tc JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name WHERE tc.table_name = 'bridge_audit_events' AND tc.constraint_type = 'CHECK' AND tc.constraint_name = 'bridge_audit_events_event_type_check';"
```

### 4b. Expected discovery result

- Constraint name: `bridge_audit_events_event_type_check` — confirmed by local discovery
- `check_clause` contains exactly 12 values (the original set from migration 20240041)
- `policy_review_submitted` is NOT present in the clause
- Exactly one matching row returned

### 4c. Stop conditions for constraint discovery

| Condition | Action |
|-----------|--------|
| Constraint `bridge_audit_events_event_type_check` not found | STOP — constraint name unexpected; investigate before applying |
| `policy_review_submitted` already present | STOP — migration already applied; do not re-apply |
| More than one event_type CHECK constraint found | STOP — schema state unclear; investigate |
| Discovery query errors | STOP — investigate before applying |
| Staging constraint clause differs from local pre-apply state in unexpected ways | STOP — staging/local divergence; investigate |

---

## 5. Staging Apply Command

After all pre-checks in §1–4 pass, apply using the linked target only.

### 5a. Apply command

```
npx supabase migration up --linked
```

This applies pending migrations to the linked project (staging: `smbausuyetlgxflyhmfg`). After the §3 pre-check confirms only 20240044 is pending, this command will apply exactly one migration.

### 5b. Commands that must NOT be used

| Prohibited command | Reason |
|--------------------|--------|
| `npx supabase db push` | Pushes all local schema changes; bypasses controlled migration-by-migration apply |
| `npx supabase db reset` | Destructive; resets the entire database |
| `npx supabase migration repair` | Modifies migration history table; not needed here |
| Any command targeting `kxrplupzbsmujjznzhpy` | Production is a hard stop |
| Any `--db-url` pointing to production | Production is a hard stop |

### 5c. Stop conditions during apply

| Condition | Action |
|-----------|--------|
| Apply output includes migrations other than 20240044 | STOP — unexpected batch; investigate |
| Apply fails with constraint error | STOP — capture full error; do not retry blind; raise in a new fix prompt |
| Apply fails with relation/schema error | STOP — investigate; do not retry |
| Apply output references production ref or URL | STOP — wrong target |
| Apply partially succeeds and leaves DB in unknown state | STOP — capture pg_constraint state; raise in fix prompt |

---

## 6. Post-Apply Staging Verification

After a successful apply, run the following read-only queries against staging to confirm the expected state.

All queries use `npx supabase db query --linked` or equivalent read-only Supabase CLI path.

### 6a. Migration history

```
npx supabase migration list --linked
```

Confirm: 20240044 appears as applied on staging (all three columns populated).

### 6b. Constraint values

```sql
SELECT tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'bridge_audit_events'
  AND tc.constraint_type = 'CHECK'
  AND tc.constraint_name = 'bridge_audit_events_event_type_check';
```

Confirm:
- All 12 original values present
- `policy_review_submitted` present (13th value)
- `policy_check_requires_codex` NOT present as a DB event_type value
- `policy_check_requires_human` NOT present as a DB event_type value
- No values beyond the expected 13

### 6c. Other constraints unchanged

```sql
SELECT tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'bridge_audit_events'
  AND tc.constraint_type = 'CHECK'
  AND tc.constraint_name IN (
    'bridge_audit_events_dry_run_only_check',
    'bridge_audit_events_actor_type_check'
  );
```

Confirm:
- `bridge_audit_events_dry_run_only_check` present: `(dry_run_only = true)`
- `bridge_audit_events_actor_type_check` present: michael/system/agent/codex

### 6d. RLS enabled

```sql
SELECT relrowsecurity FROM pg_class WHERE relname = 'bridge_audit_events';
```

Confirm: `relrowsecurity = true`

### 6e. Policies unchanged

```sql
SELECT policyname FROM pg_policies WHERE tablename = 'bridge_audit_events' ORDER BY policyname;
```

Confirm exactly two policies:
- `bridge_audit_events_select`
- `bridge_audit_events_service_role`

### 6f. Grants unchanged

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'bridge_audit_events'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;
```

Confirm:
- `anon`: no rows (no privileges)
- `authenticated`: SELECT only
- `service_role`: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### 6g. No ON DELETE CASCADE

```sql
SELECT tc.constraint_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'bridge_audit_events'
  AND rc.delete_rule = 'CASCADE';
```

Confirm: 0 rows

### 6h. No execution_authorized column

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'bridge_audit_events'
  AND column_name = 'execution_authorized';
```

Confirm: 0 rows

### 6i. No additional tables created

```sql
SELECT tablename FROM pg_tables WHERE tablename LIKE 'bridge_%' ORDER BY tablename;
```

Confirm: exactly the same four bridge tables as before (bridge_audit_events, bridge_codex_reviews, bridge_review_queue_items, bridge_task_packets). No new tables.

---

## 7. Stop Conditions (consolidated)

Stop the future staging apply prompt immediately if any of the following are true at any step:

| # | Condition | Step |
|---|-----------|------|
| 1 | Target is not proven to be `smbausuyetlgxflyhmfg` | §1 |
| 2 | `kxrplupzbsmujjznzhpy` appears anywhere in apply target | §1 |
| 3 | HEAD or origin/master differ from `c0a2062` | §2 |
| 4 | Source-reading tests fail | §2 |
| 5 | Staging not through 20240043 | §3 |
| 6 | 20240044 already applied on staging | §3 |
| 7 | Unreviewed migrations beyond 20240044 are pending | §3 |
| 8 | `bridge_audit_events_event_type_check` not found on staging | §4 |
| 9 | `policy_review_submitted` already in staging constraint | §4 |
| 10 | Apply output includes unexpected migrations | §5 |
| 11 | Apply fails at any point | §5 |
| 12 | Post-apply constraint does not have all 13 expected values | §6 |
| 13 | Post-apply RLS, policies, or grants differ from expected | §6 |
| 14 | `ON DELETE CASCADE` or `execution_authorized` detected post-apply | §6 |

---

## 8. Production Posture

**Production (`kxrplupzbsmujjznzhpy`) is not part of this plan and must not be touched.**

- Production is currently through migration 20240034.
- Migrations 20240035–20240044 are not applied to production.
- Production requires a completely separate production apply plan, prepared after staging evidence is collected and reviewed.
- The staging apply described in this plan does not authorize any production action.
- No production apply prompt is authorized until:
  1. Staging apply completes and all §6 verification checks pass
  2. Staging evidence is reviewed and accepted
  3. A separate production apply plan is designed, reviewed, and explicitly authorized

---

## 9. Evidence Collection

After staging apply and post-apply verification, collect the following evidence for the staging apply report:

1. `npx supabase migration list --linked` output (confirm 20240044 applied)
2. `event_type` CHECK clause (confirm 13 values)
3. RLS and policy query results
4. Grant query results
5. No-CASCADE and no-execution_authorized query results

This evidence is required before the production apply plan can be designed.

---

*Plan complete. No staging apply authorized by this document. No DB commands run. No code changes. No migrations applied.*
