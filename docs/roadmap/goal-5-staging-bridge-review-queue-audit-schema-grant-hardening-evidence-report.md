# Goal 5 Staging Evidence Report — Bridge Review Queue / Audit Ledger Schema and Grant Hardening

**Date:** 2026-06-08
**Goal:** Goal 5 — Verian Agent Bridge / Orchestration Layer
**Scope:** Staging migration apply and verification — schema, RLS, and grant hardening only
**Status:** PASS

---

## 1. Staging Target Identity

| Field | Value |
|---|---|
| Supabase project ref | `smbausuyetlgxflyhmfg` |
| Supabase project name | `verian-bios-staging` |
| Staging URL | `https://verian-bios-staging.vercel.app` |
| Target proof method | Live API confirmation via `npx supabase link` — returned `{"ref":"smbausuyetlgxflyhmfg","name":"verian-bios-staging"}` |

---

## 2. Production Exclusion

| Field | Value |
|---|---|
| Production project ref | `kxrplupzbsmujjznzhpy` |
| Production status | **Hard stop — untouched throughout** |
| Current link during apply | `smbausuyetlgxflyhmfg` only — confirmed via `supabase/.temp/project-ref` and `supabase/.temp/linked-project.json` |
| Production ref appeared as target | No |

Production was not queried, linked, written to, or accessed at any point.

---

## 3. Commit State

| Field | Value |
|---|---|
| HEAD | `95906b4550167b03294829083e82fafd46b11689` |
| origin/master | `95906b4550167b03294829083e82fafd46b11689` |
| HEAD = origin/master | Yes |
| Working tree at time of apply | Clean |
| Working tree after apply | Clean |

---

## 4. Migrations Applied

| Migration | File | Applied on Staging | Hash |
|---|---|---|---|
| 20240041 | `20240041_bridge_review_queue_audit_ledger.sql` | Yes ✓ | `3c9398046978ec8c8d5c334486ea13ad0beddd8b` |
| 20240042 | `20240042_bridge_review_queue_audit_grant_hardening.sql` | Yes ✓ | `d76d5d9a719732a47cb0c8f333294795d33cef53` |
| 20240043 | `20240043_bridge_review_queue_audit_revoke_maintain.sql` | Yes ✓ | `796aec8643f503ff843015f603da98a43746dc57` |

Apply command: `npx supabase migration up --linked`

Apply output:
```
Applying migration 20240041_bridge_review_queue_audit_ledger.sql...
Applying migration 20240042_bridge_review_queue_audit_grant_hardening.sql...
Applying migration 20240043_bridge_review_queue_audit_revoke_maintain.sql...
Local database is up to date.
```

No errors. All three recorded as applied in `npx supabase migration list` Remote column after apply.

---

## 5. Schema Verification

### 5.1 Table existence

All four bridge tables confirmed present on staging:

| Table | Exists |
|---|---|
| `bridge_task_packets` | Yes ✓ |
| `bridge_review_queue_items` | Yes ✓ |
| `bridge_audit_events` | Yes ✓ |
| `bridge_codex_reviews` | Yes ✓ |

### 5.2 Foreign key posture

All 13 FKs verified. Every FK uses `ON DELETE RESTRICT`. No `ON DELETE CASCADE`.

| Table | FK columns | Delete rule |
|---|---|---|
| `bridge_task_packets` | tenant_id, workspace_id | RESTRICT |
| `bridge_review_queue_items` | packet_id, tenant_id, workspace_id | RESTRICT |
| `bridge_audit_events` | packet_id, queue_item_id, tenant_id, workspace_id | RESTRICT |
| `bridge_codex_reviews` | packet_id, queue_item_id, tenant_id, workspace_id | RESTRICT |

### 5.3 dry_run_only constraint

All four tables verified:

| Column | data_type | is_nullable | column_default | CHECK constraint |
|---|---|---|---|---|
| `dry_run_only` | `boolean` | `NO` | `true` | `(dry_run_only = true)` |

Named constraints confirmed present:
- `bridge_task_packets_dry_run_only_check`
- `bridge_review_queue_items_dry_run_only_check`
- `bridge_audit_events_dry_run_only_check`
- `bridge_codex_reviews_dry_run_only_check`

No `execution_authorized` column found on any table.

---

## 6. RLS / Policy Verification

### 6.1 RLS enabled

| Table | rowsecurity |
|---|---|
| `bridge_task_packets` | `true` ✓ |
| `bridge_review_queue_items` | `true` ✓ |
| `bridge_audit_events` | `true` ✓ |
| `bridge_codex_reviews` | `true` ✓ |

### 6.2 Policy set

8 policies total — exactly 2 per table:

| Table | Policy | cmd |
|---|---|---|
| `bridge_task_packets` | `bridge_task_packets_select` | SELECT |
| `bridge_task_packets` | `bridge_task_packets_service_role` | ALL |
| `bridge_review_queue_items` | `bridge_review_queue_items_select` | SELECT |
| `bridge_review_queue_items` | `bridge_review_queue_items_service_role` | ALL |
| `bridge_audit_events` | `bridge_audit_events_select` | SELECT |
| `bridge_audit_events` | `bridge_audit_events_service_role` | ALL |
| `bridge_codex_reviews` | `bridge_codex_reviews_select` | SELECT |
| `bridge_codex_reviews` | `bridge_codex_reviews_service_role` | ALL |

- No authenticated INSERT, UPDATE, or DELETE policies found ✓
- No anon access policies found ✓

---

## 7. Grant / ACL Verification

### 7.1 information_schema.role_table_grants

| Role | Privileges (all four tables) |
|---|---|
| `anon` | **Absent — no rows** ✓ |
| `authenticated` | **SELECT only** ✓ |
| `service_role` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ✓ |

### 7.2 pg_class.relacl

Final ACL posture confirmed on all four bridge tables:

| Role | ACL entry |
|---|---|
| `anon` | **No ACL entry** (removed entirely — no `m` flag, no `r` flag) ✓ |
| `authenticated` | `r/postgres` — SELECT only, no MAINTAIN (`m`) flag ✓ |
| `service_role` | `arwdDxtm/postgres` — full ALL preserved ✓ |
| `postgres` | `arwdDxtm/postgres` ✓ |

The PostgreSQL 17 MAINTAIN privilege (`m` flag) that was residual after 20240042 is confirmed absent from both `anon` and `authenticated` after 20240043. This matches the local apply evidence.

---

## 8. Safety Confirmations

| Check | Result |
|---|---|
| `execution_authorized` column | Not present on any bridge table ✓ |
| Sending behavior | None introduced ✓ |
| Campaign execution behavior | None introduced ✓ |
| `pg_cron` / scheduled jobs | None introduced ✓ |
| Job queue | None introduced ✓ |
| Webhook / HTTP / external function | None introduced ✓ |
| Executable model routing | Not started ✓ |
| Bridge execution | Not started ✓ |
| `EMAIL_SENDING_ENABLED` | Remains disabled ✓ |
| `CAMPAIGN_SENDING_ENABLED` | Remains disabled ✓ |
| Emails sent | None ✓ |
| Automation / background jobs added | None ✓ |
| External model calls | None ✓ |
| Vercel settings changed | No ✓ |
| Environment variables changed | No ✓ |
| System controls modified | No ✓ |
| Code changes made | No ✓ |
| Migration files modified | No ✓ |
| Commits created | No ✓ |
| Pushes made | No ✓ |
| Tags created | No ✓ |

---

## 9. Remaining Blockers

None for migration apply. The three-migration bridge grant hardening sequence is complete on staging:

| Layer | Status |
|---|---|
| Schema (20240041) | Applied and verified — local + staging |
| Grant hardening (20240042) | Applied and verified — local + staging |
| MAINTAIN revoke (20240043) | Applied and verified — local + staging |

Production migration apply remains blocked pending a separate explicit authorization and production apply plan/review.

---

## 10. Recommended Next Step

The Goal 5 bridge schema persistence layer is fully applied and verified on local and staging. The natural next steps in order:

1. **Docs update** — update `docs/ai-context/00_CURRENT_STATUS.md` and `docs/ai-context/06_GIT_MILESTONES.md` to record that staging now has migrations 20240041–20240043 applied.
2. **Goal 5 Slice 10** — begin repository/service layer implementation: append-only audit ledger repository (service_role path), review queue service (service_role path, reviewer authorization model).
3. **Production apply** — requires a separate explicit authorization, production apply plan, and production evidence review. Prior roadmap context previously reported production through migration 20240034; production was not queried during this staging evidence workflow and remains a hard stop.

---

## 11. Production Hard Stop

**Production (`kxrplupzbsmujjznzhpy`) remains a hard stop.**

Migrations 20240035 through 20240043 are not applied to production. No production migration apply is authorized until a separate explicit production apply plan is reviewed and approved. Production must not be touched without explicit authorization in a separate prompt.
