# Goal 5 Migration 20240044 — Staging Evidence Report

**Status:** Staging apply complete. Codex verdict: PASS. Evidence accepted.  
**Migration:** 20240044 — Add `policy_review_submitted` to `bridge_audit_events.event_type` CHECK constraint  
**Staging project:** `smbausuyetlgxflyhmfg` (verian-bios-staging)  
**Production project:** `kxrplupzbsmujjznzhpy` — **HARD STOP. Not touched.**  
**Date applied:** 2026-06-08

---

## 1. Summary

Migration 20240044 was applied to staging (`smbausuyetlgxflyhmfg` / verian-bios-staging) and all post-apply verification checks passed. Codex reviewed the staging evidence and returned verdict: **PASS**. Staging evidence is accepted.

- Staging is now through migration 20240044
- Local is through migration 20240044
- Production remains through migration 20240034 (hard stop)
- Next available migration number is **20240045**
- Goal 5 Slice 11 implementation may proceed from the migration/staging gate perspective after this report is committed and pushed

---

## 2. Source State Evidence

At the time of staging apply:

- HEAD and origin/master: `07d8d76a20806efcfb99dfc86585880cdd61b18b`  
  ("Docs: add Goal 5 migration 20240044 staging apply plan")
- Working tree: no tracked changes (clean)
- Only untracked: `docs/roadmap/operational-twin-north-star.md` (unrelated, not staged)
- Migration file confirmed committed and clean:  
  `supabase/migrations/20240044_bridge_audit_event_policy_review_submitted.sql`

---

## 3. Test Evidence

All source-reading tests passed before staging apply was executed.

| Suite | Result |
|-------|--------|
| `goal5-bridge-audit-event-policy-review-submitted-migration.test.ts` | 35/35 PASS |
| `goal5-bridge-maintain-revoke-migration.test.ts` | ✓ |
| `goal5-bridge-grant-hardening-migration.test.ts` | ✓ |
| `goal5-agent-bridge-review-queue-audit-types.test.ts` | ✓ |
| **Related Goal 5 tests combined** | **48/48 PASS** |

---

## 4. Target Isolation Evidence

- `npx supabase projects list` output: linked project (●) was `smbausuyetlgxflyhmfg` / `verian-bios-staging`
- Production ref `kxrplupzbsmujjznzhpy` appeared in the project list only (not linked, not targeted)
- Local `127.0.0.1` was local dev only — not used as staging target
- No ambiguity in target resolution

---

## 5. Migration-History Evidence

**Pre-apply** (`npx supabase migration list --linked`):

- Staging applied through 20240043 (all remote columns populated)
- 20240044: local column populated, remote column empty (pending)
- Exactly one pending migration — no unrelated pending entries

**Apply command:**

```
npx supabase migration up --linked
```

**Apply output:**

```
Applying migration 20240044_bridge_audit_event_policy_review_submitted.sql...
Local database is up to date.
```

Only 20240044 applied. No production ref in output.

**Post-apply** (`npx supabase migration list --linked`):

- 20240044 now appears in all three columns (Local / Remote / Time)
- Staging through 20240044

---

## 6. Constraint Evidence

### Pre-apply staging constraint

Constraint name: `bridge_audit_events_event_type_check`  
Exactly 12 values (original set from migration 20240041):

```
packet_created, policy_check_passed, policy_check_warning, policy_check_blocked,
human_approval_requested, human_approved, human_denied, revision_requested,
codex_review_required, codex_review_received, manual_handoff_prepared, packet_archived
```

`policy_review_submitted` — **absent** (pre-apply) ✓

### Post-apply staging constraint

Constraint name: `bridge_audit_events_event_type_check`  
Exactly 13 values:

```
packet_created, policy_check_passed, policy_check_warning, policy_check_blocked,
human_approval_requested, human_approved, human_denied, revision_requested,
codex_review_required, codex_review_received, manual_handoff_prepared, packet_archived,
policy_review_submitted
```

- `policy_review_submitted` — **present** ✓
- `policy_check_requires_codex` — absent as DB event_type ✓ (queue action name only; maps to existing `codex_review_required`)
- `policy_check_requires_human` — absent as DB event_type ✓ (queue action name only; maps to existing `human_approval_requested`)
- No values beyond the expected 13 ✓

---

## 7. RLS / Policy / Grant Evidence

### RLS

```sql
SELECT relrowsecurity FROM pg_class WHERE relname = 'bridge_audit_events';
-- Result: relrowsecurity = true ✓
```

### Policies

Exactly two policies, unchanged:

- `bridge_audit_events_select`
- `bridge_audit_events_service_role`

### Grants

| Grantee | Privileges |
|---------|-----------|
| `anon` | No rows (no privileges) ✓ |
| `authenticated` | SELECT only ✓ |
| `service_role` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ✓ |

### Other constraints unchanged

| Constraint | Value |
|------------|-------|
| `bridge_audit_events_dry_run_only_check` | `(dry_run_only = true)` ✓ |
| `bridge_audit_events_actor_type_check` | `michael`, `system`, `agent`, `codex` ✓ |

---

## 8. Safety Evidence

| Check | Result |
|-------|--------|
| ON DELETE CASCADE | 0 rows ✓ |
| `execution_authorized` column | 0 rows ✓ |
| Extra bridge tables | None — exactly 4: `bridge_audit_events`, `bridge_codex_reviews`, `bridge_review_queue_items`, `bridge_task_packets` ✓ |
| `dry_run_only` CHECK | Preserved ✓ |
| `actor_type` CHECK | Preserved ✓ |
| Sending triggered | No ✓ |
| Automation triggered | No ✓ |
| Bridge execution started | No ✓ |
| Executable model routing started | No ✓ |
| External model calls made | No ✓ |

---

## 9. Process Evidence

| Prohibited action | Performed? |
|-------------------|-----------|
| `npx supabase db push` | No ✓ |
| `npx supabase db reset` | No ✓ |
| `npx supabase migration repair` | No ✓ |
| Production query or touch | No ✓ |
| Code/docs/migration files changed during apply | No ✓ |
| Commit created during apply | No ✓ |
| Push created during apply | No ✓ |
| Tag created during apply | No ✓ |

---

## 10. Corrected Implementation Assumptions Going Forward

The following facts must be carried into all future prompts for this project:

1. **Migration 20240044 is complete.** Local, staging, and design all applied. The Slice 11 dependency on 20240044 is satisfied.
2. **Local and staging are both through migration 20240044.** Any prompt that says "next migration is 20240044" is incorrect — it is already applied.
3. **Next available migration number is 20240045.**
4. **Production remains through migration 20240034.** Migrations 20240035–20240044 are not applied to production. Production is a hard stop.
5. **Slice 11 still requires TypeScript-side changes:** `policy_review_submitted` must be added to the `VerianBridgeAuditEventType` union in `modules/verian-agent-bridge/audit-ledger/types.ts`, and the `policy-check.service.ts` file must be created as designed.
6. **No execution, sending, or model-routing behavior is authorized.** All Slice 11 work remains dry-run-only scope.

---

## 11. Next Steps

1. Push this evidence report commit (`git push origin master`) under a separate push-only prompt
2. Proceed to **Goal 5 Slice 11 Implementation Only** under approved dry-run-only scope
3. Production remains a hard stop — production apply plan requires separate design, evidence review, and explicit authorization

---

*Evidence report complete. No staging or production commands run during document creation. No code changes. No migrations applied. No push/tag created.*
