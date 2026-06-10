# MCM Pilot — START HERE (current status & next action)

_Single source of truth for "where are we / what's next" on the Manual Campaign Mode staging pilot.
Update the **NEXT ACTION** and **STATUS** lines as you go._

## NEXT ACTION (do this first)
🔴 **Apply ISSUE-001 hotfix** — the campaign crons crash on `enumerate-active-tenants: column workspaces.deleted_at does not exist`, so the smoke-test approval inbox is empty.
- Fix: **delete the `.is('deleted_at', null)` line** in the `enumerate-active-tenants` step of these 4 files (workspaces has no `deleted_at`; it has `status`):
  `inngest/functions/process-campaign-schedule.ts`, `process-campaign-approvals.ts`, `process-campaign-sends.ts`, and (pre-existing) `scheduled-learning-agent-run.ts`.
- Then: `tsc` + `vitest run` (only `TC-3K-030` may fail) → commit → **push** (master→staging redeploy) → in Inngest Staging hit **Rerun** on the failed `Process Campaign Schedule` run → check `/inbox` for the first-touch approval.

## STATUS (2026-06-09)
- **Build:** all **10 MCM slices** done, committed, tagged on `master`. `origin/master` = pushed (Slice 10 + docs). Suite green (4173/4174, only pre-existing `TC-3K-030`).
- **Staging deployed** (master→staging Vercel). **Inngest "Staging" branch env** synced, all 13 functions registered.
- **Migrations 20240045 + 20240046 APPLIED to staging** (ref `smbausuyetlgxflyhmfg`), verified.
- **Phase C (dry-run, sending OFF) in progress, BLOCKED by ISSUE-001.**

## KEY FACTS
- **Staging Supabase ref:** `smbausuyetlgxflyhmfg`. **Prod / hard-stop ref:** `kxrplupzbsmujjznzhpy` (also `.env.remote-dev`) — never apply there for the pilot. Prod is at `20240034` (12 migrations behind = separate release).
- **Test tenant:** Verian Internal `10000000-0000-0000-0000-000000000001`, workspace `main` `20000000-0000-0000-0000-000000000001`.
- **Controls (per-tenant, staging):** `campaign_scheduler_enabled` + `campaign_approval_routing_enabled` = ON; `campaign_send_dispatch_enabled` + `email_sending_enabled` = OFF (Phase C). `getBooleanControl` needs **is_enabled AND value = true**; the 4 MCM controls aren't seeded → enable via SQL `INSERT…ON CONFLICT`.
- **Campaign types seeded** on staging: `initial_contact`, `statement_follow_up` (no admin UI for these — seed per workspace).
- `supabase db query --linked` works **non-interactively** for read + write SQL against staging.
- **Two-agent model:** architect-Claude (cross-session memory) writes prompts; CLI-Claude (repo, no memory) executes + commits.

## PHASES LEFT (runbook = `mcm-go-live-runbook.md`)
- **C** (now): dry-run, sending OFF → approved draft, **zero sends**. (Blocked by ISSUE-001.)
- **D:** flip `campaign_send_dispatch_enabled` + `email_sending_enabled` for the test tenant → first real send to your own email; test manual-stop + bounce-stop; kill-switch drill.
- **E:** onboard Bruce on the same/own tenant.
- **Prod release:** separate `20240035→20240046` (12-migration) plan, after pilot proves out.

## DOC MAP (docs/roadmap/)
- `mcm-go-live-runbook.md` — full A–E runbook + §7 pitfalls.
- `mcm-staging-pilot-issues.md` — **bug ledger** (record-now/triage-later).
- `mcm-staging-migration-20240045-20240046-apply-plan.md` + `…-evidence-report.md` — Phase B.
- (operator how-to for Bruce: drafted in chat; not yet a file.)

## UNTRACKED / TO COMMIT
`docs/roadmap/`: `mcm-go-live-runbook.md` (edited — §7), `mcm-staging-migration-*` (apply-plan + evidence), `mcm-staging-pilot-issues.md`, `mcm-pilot-status.md` (this file), and the orphan `operational-twin-north-star.md` (decide separately).

## HOW TO RESUME (architect-Claude)
New conversation → say **"resume the MCM staging pilot."** I'll read memory (`mcm-slice-plan`) + this file and continue from NEXT ACTION.
