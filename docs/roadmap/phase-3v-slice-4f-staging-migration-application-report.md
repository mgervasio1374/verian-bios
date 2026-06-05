# Phase 3V Slice 4F — Staging Migration Application Report

**Status:** Migration applied successfully — documentation report only
**Created:** 2026-06-04
**Predecessor:** Phase 3V Slice 4E — [Staging Migration Readiness Plan](phase-3v-slice-4e-staging-migration-readiness-plan.md)
**Phase 3U lock tag:** `phase-3u-send-reliability-hardening-v1` → `b472b720eea83f1bb904af6b88c71b6842c0f94a`

> **⚠️ This report records the Slice 4F staging migration application. It does NOT authorize Slice 5, sending, flag enablement, draft creation, provider changes, or system-control changes.**

---

## A. Purpose

Slice 4F applied migrations `20240037`–`20240039` to staging (`smbausuyetlgxflyhmfg`) only. This report records the migration application, preflight checks, and post-application validation evidence.

**This report does NOT authorize:**
- Slice 5 execution
- Sending emails
- Enabling `EMAIL_SENDING_ENABLED`
- Enabling `CAMPAIGN_SENDING_ENABLED`
- Draft creation or approval
- Provider or sender configuration changes
- System-control modifications
- Business record creation

---

## B. Execution Boundary

| Item | Status |
|------|--------|
| Target | Staging only — `smbausuyetlgxflyhmfg` ✓ |
| Production excluded | `kxrplupzbsmujjznzhpy` — not targeted ✓ |
| Production changes | None ✓ |
| Code files changed | None ✓ |
| Migration files changed | None — applied as-is from committed files ✓ |
| New migrations created | None ✓ |
| Flags enabled | None ✓ |
| Emails sent | None ✓ |
| Send buttons clicked | None ✓ |
| Business records created | None ✓ |
| Drafts created or approved | None ✓ |
| Slice 5 | **BLOCKED** |

---

## C. Preflight Results

| Check | Result |
|-------|--------|
| Working tree | Clean before relink ✓ |
| HEAD | `38d6e7a` Docs: add Phase 3V Slice 4E staging migration readiness plan ✓ |
| origin/master | `38d6e7a9807e4b08e4c3aab80da005b6f2a390c6` ✓ |
| `20240037_phase3m_draft_assignment_linkage.sql` | Present, no diffs ✓ |
| `20240038_phase3n_proposal_capture.sql` | Present, no diffs ✓ |
| `20240039_phase3r_follow_up_skip_fields.sql` | Present, no diffs ✓ |
| Linked project ref after relink | `smbausuyetlgxflyhmfg` ✓ |
| Staging migration level before | `20240036` ✓ |
| Dependency tables confirmed | `accounts`, `opportunities`, `leads`, `contacts`, `companies`, `email_drafts`, `campaign_assignments` — all 7 present ✓ |
| `email_sending_enabled` before | `false` (global) ✓ |
| `campaign_sending_enabled` before | `false` (global) ✓ |
| Pre-migration `email_sends` count | 2 |
| Pre-migration `campaign_email_sends` count | 0 |

---

## D. Migration Application Result

| Item | Detail |
|------|--------|
| Command | `npx supabase db push --linked` |
| Target | `smbausuyetlgxflyhmfg` (verified before command) |
| Result | **Success** — "Finished supabase db push." |
| `20240037_phase3m_draft_assignment_linkage.sql` | Applied ✓ |
| `20240038_phase3n_proposal_capture.sql` | Applied ✓ |
| `20240039_phase3r_follow_up_skip_fields.sql` | Applied ✓ |

---

## E. Post-Application Validation

### Migration list

```
20240039  ← highest; confirms all three applied
20240038
20240037
20240036
20240035
...
```

### Tables confirmed present

| Table | Status |
|-------|--------|
| `proposal_captures` | ✓ Exists |
| `proposal_events` | ✓ Exists |
| `proposal_follow_up_commitments` | ✓ Exists |

### Columns confirmed

| Table | Column | Status |
|-------|--------|--------|
| `email_drafts` | `campaign_assignment_id` | ✓ Exists |
| `proposal_follow_up_commitments` | `skipped_at` | ✓ Exists |
| `proposal_follow_up_commitments` | `skipped_reason` | ✓ Exists |
| `proposal_follow_up_commitments` | `skipped_by_user_id` | ✓ Exists |

### RLS and policies

| Table | RLS enabled | Policies |
|-------|-------------|---------|
| `proposal_captures` | ✓ `rowsecurity = true` | `proposal_captures_select` (SELECT), `proposal_captures_service_role` (ALL) |
| `proposal_events` | ✓ `rowsecurity = true` | `proposal_events_select` (SELECT), `proposal_events_service_role` (ALL) |
| `proposal_follow_up_commitments` | ✓ `rowsecurity = true` | `proposal_follow_up_commitments_select` (SELECT), `proposal_follow_up_commitments_service_role` (ALL) |

### Existing staging data preserved

| Check | Result |
|-------|--------|
| Tenant `10000000-0000-0000-0000-000000000001` | ✓ "Verian Internal" still exists |
| Workspace `20000000-0000-0000-0000-000000000001` | ✓ slug `main` still exists |
| `email_drafts` count | 6 — unchanged ✓ |

### Send/flag state after migration

| Check | Before | After | Change |
|-------|--------|-------|--------|
| `email_sending_enabled` | `false` | `false` | None ✓ |
| `campaign_sending_enabled` | `false` | `false` | None ✓ |
| `email_sends` count | 2 | 2 | None ✓ |
| `campaign_email_sends` count | 0 | 0 | None ✓ |

---

## F. Resolved Blocker

**The staging schema blocker identified in Slice 4D is now resolved.**

- `proposal_follow_up_commitments` **now exists** in staging
- Staging is now current through migration `20240039`
- The `sendFollowUpDraftAction` → `proposal_follow_up_commitments` path can now be tested in staging

---

## G. Remaining Blockers

Slice 5 remains BLOCKED. The following items still require resolution before Slice 5 can be authorized:

| # | Blocker | Status |
|---|---------|--------|
| 1 | Sender identity unverified | `noreply@verian.internal`, `is_verified = false`, `status = pending` — Resend domain verification required |
| 2 | Provider key environment | TBD — operator confirms staging Resend key is non-production |
| 3 | `messaging.send_emails` permission holder | TBD — operator confirms test user has this permission |
| 4 | Internal recipient | TBD — `@321swipe.com` controlled inbox required |
| 5 | Test commitment / draft / approval | Not yet created — requires separate approved workflow using Phase 3S generate-draft path in staging |
| 6 | `verifiedScope` | `null` (global) — per-tenant override preferred before enablement |
| 7 | Rollback owner, test window, evidence reviewer | TBD — people assignments |
| 8 | Evidence recollection | Must be re-run after this migration application to update Slice 4 evidence document |

---

## H. Files Changed / Cleanup

- `supabase/.temp/*` — modified by CLI relink; **reverted and not committed**
- No migration files changed
- No code files changed
- This report file is the only intended working tree change

---

## I. Required Next Step

After Codex reviews this report and it is committed/pushed:

**Phase 3V Slice 4G — Re-run Staging Evidence Recollection**

That future workflow should:
1. Relink CLI to `smbausuyetlgxflyhmfg` and verify project-ref
2. Run SELECT-only staging evidence checks
3. Update the Slice 4 evidence document (`phase-3v-slice-4-internal-send-target-evidence.md`) with re-collected staging values
4. Keep Slice 5 blocked unless every evidence field is complete and Codex-reviewed

Remaining non-schema blockers (sender verification, provider key, permission holder, internal recipient, test draft, `verifiedScope`) must be resolved before Slice 5 can be written.

---

## J. Final Decision

- **Slice 4F migration application to staging succeeded** ✓
- **Production was not touched** ✓
- **No sending occurred** ✓
- **Send flags remain `false`** ✓
- **Slice 5 remains BLOCKED**
