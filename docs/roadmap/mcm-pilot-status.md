# MCM Pilot — START HERE (current status & next action)

_Single source of truth for "where are we / what's next" on the Manual Campaign Mode staging pilot.
Update the **NEXT ACTION** and **STATUS** lines as you go._

## NEXT ACTION (do this first)
✅ **Phase D FIRST SEND DONE** (2026-06-10 02:12 UTC). Both steps of assignment `5aeac081-…` sent for real to `mgervasio@321swipe.com` (from `321 Swipe <noreply@321swipe.com>`), Resend accepted (`email_sends.status='sent'`, real `resend_message_id`s `5d9076f1…` / `79234054…`), assignment auto-`completed`. Full self-serve loop proven live on staging.
**Remaining Phase D drills:**
1. ✅ **manual-stop drill DONE (2026-06-10):** fresh assignment `e34449aa` (lead d4e24f9f "Mikes Test Co", Smoke Test seq) materialized 2 `planned` items → manual stop → both `stopped_manual` (`stopped_reason='manual_stop'`, `stopped_at` set), assignment `retired`. No drafts ever created → zero send risk. Executed via DB (no stop-UI — see ISSUE-006). Transitions confirmed valid (SCHEDULE_ITEM_TRANSITIONS: planned→stopped_manual OK).
2. ✅ **Resend webhook WIRED** (2026-06-10) → `…/api/webhooks/resend`, all email.* events; `RESEND_WEBHOOK_SECRET` unset on staging so signatures not enforced (accepts as-is). Real bounce produced `email_events` + flipped `email_send.status`→`bounced`. Webhook delivery confirmed working.
3. 🛑 **bounce-stop drill RAN → caught ISSUE-007 (real bug).** Sent step 1 to `bounced@resend.dev` (assignment `d98d272e`); `email_send`→`bounced` BUT step 2 did NOT auto-block. Root cause: handler checks `data.bounce_type==='hard'` but Resend sends nested `data.bounce.type='Permanent'` → auto-stop never fires. Downstream proven good via manual block (step 2→`blocked`/`recipient_bounced`). **Needs code hotfix + redeploy, then re-run bounce drill on a fresh assignment.** See ISSUE-007.
4. ✅ **kill-switch drill DONE (2026-06-10):** assignment `bc2ed7aa`, step 1 armed (`approved`+due). Gates `is_enabled=false` → Sends rerun **deferred** (item stayed `approved`, zero `email_sends`). Gates back ON → Sends rerun **sent + delivered** to `mgervasio@321swipe.com`. Both directions proven. (Leftover step 2 stopped_manual, assignment retired — cleaned up.)
Then **Phase E** (onboard Bruce).
**Go-live blockers found:** ISSUE-006 (no operator "Stop sequence" UI — only "Retire", which doesn't stop items) · **ISSUE-007** (bounce auto-stop broken — wrong Resend payload shape).
**Operability note:** first-touch approval → send is ASYNC (outbox `enqueueEvent` → `dispatch-outbox` cron → `approval.approved` → `on-approval-approved`→`handleCampaignFirstTouchApproved` syncs draft+item to `approved` → then sends cron). So after a human approves, item advance + send are delayed by ≥1–2 cron ticks, not instant. (In the drill I applied the sync writes directly to avoid waiting.)

## STATUS (2026-06-09)
- **Build:** all **10 MCM slices** done, committed, tagged on `master`. `origin/master` = `150933a`. Suite green (4173/4174, only pre-existing `TC-3K-030`).
- **Staging deployed** (`150933a`, incl. ISSUE-001 hotfix `bbd4824`). Inngest endpoint live (200), all 13 functions registered.
- **Migrations 20240045 + 20240046 APPLIED to staging** (ref `smbausuyetlgxflyhmfg`), verified.
- **Phase C (dry-run) COMPLETE ✅:** both crons green; assignment `5aeac081-…` → step 1 `awaiting_approval` (draft + approval req, Pending in `/inbox`), step 2 correctly **held** at `draft_ready` (gated auto-approve not yet triggered). **Zero pilot sends** — `email_events`=0; the only 2 `email_sends` rows are pre-existing noise from 2026-05-27 (`failed`, recipient `jharmon@harbordiner.com`, draft `f17129e2…`, unrelated to this assignment).
- ⚠️ **Send-check baseline:** `email_sends` already holds 2 old failed rows (pre-2026-05-27). Future "zero sends" checks must scope to the assignment/draft, not `count(*)` on the whole table.
- **Phase D first send COMPLETE ✅ (2026-06-10):** gates flipped ON for the test tenant; `Process Campaign Sends` dispatched both steps → 2 real sends to `mgervasio@321swipe.com`, assignment auto-`completed`. `email_events` still empty → **Resend webhook → staging not yet confirmed** (blocks bounce-stop drill). Remaining: manual-stop + bounce-stop + kill-switch drills, then Phase E.

## KEY FACTS
- **Staging Supabase ref:** `smbausuyetlgxflyhmfg`. **Prod / hard-stop ref:** `kxrplupzbsmujjznzhpy` (also `.env.remote-dev`) — never apply there for the pilot. Prod is at `20240034` (12 migrations behind = separate release).
- **Test tenant:** Verian Internal `10000000-0000-0000-0000-000000000001`, workspace `main` `20000000-0000-0000-0000-000000000001`.
- **Controls (per-tenant, staging):** ALL 4 now ON for tenant `10000000-…01` — `campaign_scheduler_enabled`, `campaign_approval_routing_enabled`, `campaign_send_dispatch_enabled`, `email_sending_enabled` = `is_enabled=true, value=true`. `getBooleanControl` needs **is_enabled AND value=true (jsonb boolean)**; tenant row overrides platform (`resolveSystemControl` tries tenant_id first). Unique key `(tenant_id, key)` → flip via `INSERT…ON CONFLICT (tenant_id, key) DO UPDATE`. NOTE: an `email_sending_enabled` row with `tenant_id=10000000…` but `scope='platform'` pre-existed at `value=false`; the flip UPDATEs it (scope label stays 'platform', harmless — resolution keys on tenant_id+value). **Kill switch:** set both send gates `is_enabled=false`. Platform `email_sending_enabled` (tenant_id null) stays `false` → other tenants unaffected.
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
