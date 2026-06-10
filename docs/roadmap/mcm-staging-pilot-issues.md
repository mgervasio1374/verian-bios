# MCM Staging Pilot — Issue Ledger

**Purpose:** a lightweight running log of every bug / gap / lesson found while bringing Manual
Campaign Mode live on staging. **Record fast, triage later.** Append a new entry the moment
something surfaces; distill into real fixes/backlog in a later pass.

**How to add an entry:** copy the block, bump the ID, fill it in. Keep it terse.
Severity: `blocker` (pipeline dead) · `major` (feature unusable) · `minor` · `cosmetic` · `process` (lesson, not a defect).
Status: `open` · `fix-drafted` · `fixed-staging` · `resolved` · `noted`.

---

## ISSUE-001 — Campaign crons crash: `workspaces.deleted_at does not exist`
- **Date:** 2026-06-09 · **Severity:** blocker · **Status:** fix-drafted (commit + redeploy pending)
- **Area:** Inngest crons — `process-campaign-schedule`, `process-campaign-approvals`, `process-campaign-sends` (+ pre-existing `scheduled-learning-agent-run`)
- **Symptom:** empty Approval Inbox after assigning a lead; Inngest run **Failed** — `enumerate-active-tenants: column workspaces.deleted_at does not exist`.
- **Root cause:** the `enumerate-active-tenants` step filters `workspaces` by `.is('deleted_at', null)`, but `workspaces` has no `deleted_at` (it has `status`). Bug originated in `scheduled-learning-agent-run` and was mirrored into the 3 MCM crons (Slice 3 prompt said to mirror it).
- **Why missed:** untyped service client (`createClient<any>`) → compiles; source-read tests never execute the query → suite green. Runtime-only.
- **Fix:** drop `.is('deleted_at', null)` in all 4 files + regression guard asserting no `deleted_at`. (Hotfix drafted.)
- **Class:** `untyped-client-schema-mismatch` / `source-read-blind-spot`.

## ISSUE-002 — Campaign types not seeded (prerequisite gap)
- **Date:** 2026-06-09 · **Severity:** major · **Status:** fixed-staging (prereq to document for prod)
- **Area:** Campaign Sequences builder / data seeding
- **Symptom:** Campaign Type dropdown empty → can't author a sequence. (Assets existed; types did not.)
- **Root cause:** `campaign_types` table empty for the tenant; **no UI to create campaign types**; assets don't create them.
- **Fix:** seeded 2 types via SQL on staging (`initial_contact`, `statement_follow_up`, both `active`, ws `main`). Slug must equal the assets' `campaign_type` AND be a standard `CAMPAIGN_TYPE` so the assignment picker shows the sequence.
- **Action:** add **"seed campaign types per workspace"** to go-live prereqs; consider a campaign-type admin UI.
- **Class:** `data-seeding-prereq` / `missing-admin-ui`.

## ISSUE-003 — Stale "Runtime note" banner on Campaign Sequences page
- **Date:** 2026-06-09 · **Severity:** cosmetic · **Status:** open
- **Area:** `app/(workspace)/[workspaceSlug]/settings/campaign-sequences/page.tsx`
- **Symptom:** banner reads "…require migration 20240045 to be applied. The sequence builder is dormant until that operator step is complete" — but 20240045 is applied; misleading.
- **Root cause:** hardcoded note added in Slice 9 page.tsx.
- **Fix:** remove/condition the banner (quick follow-up).
- **Class:** `stale-ui-copy`.

## ISSUE-004 — Deploy-before-migrate ordering window (process)
- **Date:** 2026-06-09 · **Severity:** process · **Status:** noted
- **Symptom:** pushing code (master→staging) before applying 20240045/46 opened a window where `createCampaignAssignment` errored (insert references `campaign_sequence_id` before the column existed).
- **Lesson:** for **production**, migrate-then-deploy (not deploy-then-migrate). On staging it was low-stakes and closed by running Phase B promptly.
- **Class:** `release-ordering`.

---

## ISSUE-005 — Manually invoking an event handler with empty payload crashes it (operator note)
- **Date:** 2026-06-09 · **Severity:** process · **Status:** noted
- **Symptom:** `on-campaign-assignment-activated` run **Failed** — `listCampaignScheduleItemsForAssignment: invalid input syntax for type uuid: "undefined"`; trigger was `inngest/function.invoked`.
- **Cause:** the function was **Invoked from the dashboard with no payload**. It's event-triggered (`campaign.assignment_activated`) and needs `{assignmentId, tenantId, workspaceId,…}`. The real event-driven run succeeded (assignment had 2 materialized items). Red herring.
- **Lesson:** only Invoke the **crons** (`process-campaign-*`) with an empty payload. For event handlers, let the real event fire (or Invoke with a valid payload). Verified materialize works — ISSUE-001 (promotion cron) is the actual blocker.
- **Class:** `operator-runbook`.

## Patterns / themes (to distill later)

- **P1 — Untyped service client + source-read tests = runtime-only schema bugs.** The repos use `createClient<any>`, so column/typo mistakes compile; source-read tests never run them. (ISSUE-001 is the first instance; expect more as each cron/query runs against the real schema for the first time.)
  - *Mitigations to weigh:* (a) **smoke-test each cron's first real run** in the Inngest dashboard during go-live; (b) regenerate `types/database.ts` post-migration and migrate the hottest queries onto the typed client; (c) a thin integration test that executes each cron's enumerate/list against a seeded DB.
- **P2 — Per-workspace data must be seeded** (campaign types; verified sender; ≥1 active asset per intended step type) before the authoring UI is usable. No admin UI for campaign types yet.
- **P3 — Slug ↔ id ↔ enum alignment** keeps biting (asset `campaign_type` slug vs `campaign_type_id` UUID vs `CAMPAIGN_TYPE` enum). Already fixed in code twice (Slices 9/10); seeding must respect it (ISSUE-002).
