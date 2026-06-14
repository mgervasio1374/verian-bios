# MCM v2 Proposal Slices — Staging Apply Evidence Report

**Status:** Applied to staging. Verification passed.
**Migrations applied:** `20240057_proposal_events_first_viewed_at`, `20240058_proposal_follow_up_open_state_copy`
**Staging project:** `smbausuyetlgxflyhmfg` (verian-bios-staging)
**Production project:** `kxrplupzbsmujjznzhpy` — **HARD STOP. Not touched.**
**Source commit:** `2d396f8` (HEAD == origin/master)
**Applied:** 2026-06-14

Related slices: #37 hosted proposal page (migration 20240056, already on staging),
#38 Proposal Approve & Send + open-tracking (20240057), #39 follow-up open-state
copy (20240058).

---

## 1. Target Isolation (pre-apply)

- Linked project ref: `smbausuyetlgxflyhmfg` (`verian-bios-staging`) — confirmed via
  `supabase/.temp/linked-project.json`.
- Production ref `kxrplupzbsmujjznzhpy` did **not** appear in the linked ref or any
  apply target. No local `127.0.0.1` target.

## 2. Source State (pre-apply)

- `git rev-parse HEAD` == `git rev-parse origin/master` == `2d396f8`.
- Migration files `20240056/57/58` committed and present (working tree dirt limited
  to unrelated roadmap docs).
- Slice tests green: `mcm-v2-hosted-proposal-page`, `mcm-v2-proposal-approve-send`,
  `mcm-v2-followup-open-state-copy`, `goal5-slice-12-bridge-intake-service` →
  71/71. Full suite previously green besides pre-existing `TC-3K-030`; tsc clean
  besides the 7 pre-existing test-file errors.

## 3. Migration History (pre-apply)

`npx supabase migration list --linked` showed staging current through **20240056**
(the #37 share_token migration already applied). Exactly **20240057** and
**20240058** pending (empty Remote column). No unreviewed backlog — the apply set
was exactly the two reviewed migrations.

## 4. Pre-Apply Discovery (read-only)

- `proposal_events.first_viewed_at`: **absent** (`rows: []`).
- `email_proposal_follow_up` template: `has_var=false`, `has_placeholder=false`
  (old hardcoded sentence still present). Confirmed not-yet-applied pre-state.

## 5. Apply

```
npx supabase migration up --linked
  Applying migration 20240057_proposal_events_first_viewed_at.sql...
  Applying migration 20240058_proposal_follow_up_open_state_copy.sql...
  Local database is up to date.
```

Exactly the two reviewed migrations applied. No unexpected migrations, no errors,
no production reference.

## 6. Post-Apply Verification (read-only)

| Check | Query | Result |
|-------|-------|--------|
| `first_viewed_at` column | information_schema.columns | `timestamp with time zone`, nullable `YES` ✅ |
| Template var added | `variables ? 'proposal_state_line'` | `true` ✅ |
| Placeholder in text body | `body_text_template LIKE '%{{proposal_state_line}}%'` | `true` ✅ |
| Placeholder in html body | `body_html_template LIKE '%{{proposal_state_line}}%'` | `true` ✅ |
| Old sentence removed | `... LIKE '%I wanted to follow up on the proposal%'` | `false` ✅ |
| Migration history | `migration list --linked` | 20240057, 20240058 applied (all columns) ✅ |
| `proposal_status` CHECK unchanged | check_constraints | `draft, sent, viewed, accepted, rejected, expired, withdrawn` ✅ |

## 7. Production Posture

Production (`kxrplupzbsmujjznzhpy`) was not touched. A separate, explicitly
authorized production apply plan is required before any production action. This
staging apply does not authorize any production change.

---

*Staging apply complete. All §6 verification checks passed.*
