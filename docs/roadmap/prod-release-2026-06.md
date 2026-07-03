# Production Release Plan — 2026-06 (staging 830b548 → prod)

Status: READY TO EXECUTE on go-ahead. Migrate-then-deploy. Prod = HARD STOP
(`kxrplupzbsmujjznzhpy`). Author: architect, 2026-06-17.
Supersedes the stale prod section (§6) of `mcm-go-live-runbook.md` (which still says prod@20240034).

## What this release ships
Brings prod from **code `555ae99` / DB `20240058`** up to **code `830b548` / DB `20240066`**:
**8 additive migrations** (`20240059`–`20240066`) + **87 commits** of code (the whole 6/13→6/17 delta:
moat consumption 3b, campaign-types A1/A2, Anti-Pattern Lab P1 + lineage P1b, plus prior accumulated work)
+ **1 new Inngest function** (`generate-ai-sequence`) + **prod tenant config** (AI flags + Bruce-as-default).

## Pre-flight facts (VERIFIED read-only, no relink — 2026-06-17)
- Prod DB = `20240058` (schema present through 57; 58 data-only; 59+ absent). Gap = 59–66.
- Migrations 59–66 are **all additive / non-destructive** (grep-confirmed: no drop/alter-type/delete). 61 (em-dash purge) + 62 (activity backfill) are safe data migrations.
- Prod **env fully provisioned**: `LLM_API_KEY`/`LLM_MODEL_NAME`/`LLM_API_BASE_URL`/`LLM_MODEL_FALLBACKS` (set 5d ago), Supabase keys, `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`, Resend key + webhook secret, `NEXT_PUBLIC_APP_URL`.
- Prod **1 workspace**; `campaign_types` = `{initial_contact, statement_follow_up}` — IDENTICAL to staging, so seed `20240065` adds the same +6 → 8 (zero surprise; ON CONFLICT preserves the 2).
- Prod **sends currently OFF** (tenant `email_sending_enabled=false`, `campaign_send_dispatch_enabled=false`). KEEP OFF.
- Prod **AI/learning flags NOT set** (`copywriting_agent_llm_enabled`/`learned_skills_enabled`/`anti_pattern_lab_enabled` absent → off). Set in Phase 4.
- Repo `.vercel` is linked to **prod** (`verian-bios`); prod deploys are MANUAL `vercel --prod`. Staging is the separate `verian-bios-staging` (auto).
- Control-gate logic: `getBooleanControl` returns true only if `is_enabled=true` AND `value` jsonb = `true`, tenant row resolved before platform default. So every flag insert sets BOTH.

## Decisions to confirm before executing
1. **Which AI flags to enable in prod** (tenant `10000000-…01`): minimum for the learning loop =
   `copywriting_agent_llm_enabled` + `learned_skills_enabled` + `anti_pattern_lab_enabled`.
   Optional (only if doing statement intake in prod): `statement_review_agent_enabled` + `statement_extraction_agent_enabled`.
2. **Sends stay OFF** — confirm. The AI features (drafts, rewrite, Lab) work WITHOUT sending; sends are a separate gate held until the `outreach.321swipe.com` DKIM/SPF/DMARC warm-up is done. This release does NOT touch send gates.
3. **Backups** — prod is free-plan (no PITR). No real data yet, so no backup ceremony now; but upgrade to **Pro before real campaign data** lands.
4. **Old test data** — prod has ~12 May test companies + stale approvals. Purge is optional and NOT blocking (additive migrations don't care). Decide separately.

---

## Phase 1 — MIGRATE (the relink danger window) ⚠️
The only step that points the CLI at prod. Discipline: confirm the ref before every op, do NOTHING else
during the window, relink back the moment it's done.

1. `npx supabase login` (refresh token — the 6/13 relink failed on a stale token).
2. `npx supabase link --project-ref kxrplupzbsmujjznzhpy` ← **DANGER WINDOW OPENS**.
3. `cat supabase/.temp/project-ref` → MUST read `kxrplupzbsmujjznzhpy`.
4. `npx supabase migration list --linked` → confirm Remote at `20240058`, Local has `59`–`66` pending.
5. `npx supabase migration up --linked` → applies 59–66.
6. Verify (still linked to prod): `migration list` shows Remote `20240066`; spot-check
   `learned_skills` / `statement_analysis_reviews` / `anti_pattern_sources` exist and `campaign_types` count = 8.
7. `npx supabase link --project-ref smbausuyetlgxflyhmfg` → `cat supabase/.temp/project-ref` MUST read staging ← **DANGER WINDOW CLOSES**.

## Phase 2 — DEPLOY (manual prod)
8. Confirm local HEAD = `origin/master` = `830b548` (the staging-proven, suite-green build).
9. Confirm repo `.vercel` → `verian-bios` (prod) via `.vercel/project.json` (`prj_vLPaExyQfodnSfg4zalTXgkZPVMJ`).
10. `vercel --prod` → wait for Ready; capture the deployment URL.
11. Smoke: `curl -sI https://verian-bios.vercel.app/` → 307 → `/login` (middleware+Supabase OK); `curl -s https://verian-bios.vercel.app/api/inngest` → 200.
Ordering note: MIGRATE before DEPLOY — `830b548` expects schema `66`; deploying first would 500 on missing tables.

## Phase 3 — INNGEST SYNC (new function this release)
12. This release adds `generate-ai-sequence`. After deploy, confirm the Inngest **Production** env lists it
    (alongside the existing 13). If missing, trigger a sync (Inngest dashboard "Sync", or re-hit
    `https://verian-bios.vercel.app/api/inngest`). Verify the 4 MCM crons are still registered.

## Phase 4 — CONFIG (prod tenant flags + Bruce default) — via REST, NO relink
All writes use the prod service_role key over PostgREST (`POST`/`PATCH` /rest/v1/...), so the relink window
stays migrations-only. Each is a deliberate, targeted prod write.
13. Insert the chosen AI flags (per Decision 1), tenant-scoped, `is_enabled=true` AND `value:true`,
    with NOT-NULL `label`+`description`. (POST /rest/v1/system_controls, one row per flag.)
14. Set Bruce as default identity: PATCH all prod `sender_identities` for the tenant `is_default=false`,
    then PATCH Bruce (`bhughes2@321swipe.com`, prod id `8513c87f-184e-4d50-9be2-ffcfc22c14b0`) `is_default=true`.
    (Two-step avoids the partial-unique two-default window.)

## Phase 5 — SEND-GATE SAFETY
15. Re-confirm tenant `email_sending_enabled=false` AND `campaign_send_dispatch_enabled=false`. DO NOT flip them.
    The release enables AI/learning features only; live sending stays gated until warm-up.

## Phase 6 — SMOKE (prod, no sends)
16. Log in (mgervasio@321swipe.com). Generate ONE AI draft → confirms the prod LLM key is still valid.
17. Agent Lab → Copywriting → Anti-Pattern Lab panel renders (control live); `campaign_types` shows 8;
    "Learned anti-patterns" changelog reads empty. No emails sent (gates off).

## Phase 7 — POST / FOLLOW-UPS
- Upgrade prod to Pro for PITR backups BEFORE any real campaign data.
- Optional: purge old May test data.
- Long pole (parallel): stand up `outreach.321swipe.com` + DKIM/SPF/DMARC + warm-up — the gate for real cold sends.

## Rollback
- Schema: additive → no rollback needed; new schema is backward-compatible with old code.
- Code: a bad deploy → `vercel` redeploy the prior prod build (`555ae99`); schema `66` stays (additive, compatible).
- Flags: reversible (`is_enabled=false`). Sends never enabled, so blast radius is zero throughout.

## Risk register
- **#1 — the relink window (Phase 1).** Mitigation: confirm ref before every op, no parallel work, relink back immediately. The flaky staging gateway has been 502/504-ing today; retries are expected — never assume a failed write half-applied (migration up is transactional per file).
- **LLM key validity** (set 5d ago) — verified by Phase 6 step 16, not assumed.
- **Inngest new function** — Phase 3 explicitly verifies `generate-ai-sequence` registered.
- **Accidental send** — Phase 5 guards; gates stay off.
