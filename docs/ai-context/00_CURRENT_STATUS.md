# 00 — Current Project Status

## Project Identity

**Product:** Verian BIOS — 321 Swipe's Business Intelligence Operating System
**Repo path:** `C:\Projects\verian-bios`
**Branch:** `master`

## Phase Overview

| Phase | Status |
|-------|--------|
| Phase 3A — Core Intelligence Infrastructure | Locked. Do not modify. |
| Phase 3B — Revenue Learning Engine | Foundation complete and locked. |
| Phase 3B.1 — Stabilization / Hardening | Complete. Committed, tagged. |
| Phase 3B.2 — Data Import Foundation | Complete. Committed, tagged `phase-3b2-data-import-foundation-v1`. |
| Phase 3C.1 — Structured Errors + System Intelligence | Complete. Committed, tagged `phase-3c1-system-intelligence-v1`. |
| Staging Foundation v1 | Complete. Committed, tagged `staging-foundation-v1`. |
| Phase 3C.2 — Structured Error Lifecycle Actions | Complete. Committed, tagged `phase-3c2-structured-error-lifecycle-v1`. |
| Track A — Deployment Flow Cleanup | Complete. Production Vercel Git disconnected; staging unchanged. Verified 2026-05-26. |
| Phase 3C.3 — System Intelligence Recommendation Generator | Complete. Committed `3d45928`, tagged `phase-3c3-system-intelligence-recommendations-v1`. Staging smoke-tested 2026-05-26. |
| Phase 3C.4 — Workflow & Outbox Error Emission | Complete. Committed `f465795`, tagged `phase-3c4-workflow-outbox-error-emission-v1`. Staging smoke-tested 2026-05-26. |
| Phase 3C.5 — System Intelligence Detail Views | Complete. Committed `bce57a2`, tagged `phase-3c5-system-intelligence-detail-views-v1`. Staging smoke-tested 2026-05-26. |
| Phase 3C.6 — System Intelligence Wrap-Up | Complete. Committed `9a32d3c`, tagged `phase-3c6-system-intelligence-wrap-up-v1`. Staging smoke-tested 2026-05-26. |
| Phase 3C.7 | Intentionally skipped for now. May be revisited later. |
| Phase 3D — Revenue Analytics | Complete. Committed `08c3cdd`, tagged `phase-3d-revenue-analytics-v1`. Staging smoke-tested 2026-05-27. |
| Phase 3E — Lead Workflow Control | Complete. Committed `48bfbbb`, tagged `phase-3e-lead-workflow-control-v1`. Staging migration `20240032` applied. Staging smoke-tested 2026-05-27. Production migration `20240032` applied. Production Vercel deployed (`dpl_GQdBM9Sewy9G4BtSB2aaJQotPQKH`). Production smoke-tested 2026-05-27. |
| Phase 3F — Workflow Execution Visibility | Complete. Committed `f43f797`, tagged `phase-3f-workflow-execution-visibility-v1`. No migration. Staging smoke-tested 2026-05-27. Production Vercel deployed (`dpl_2aiTEQ1eRz7Eus8QNfmmpipAkmaa`). Production smoke-tested 2026-05-27 (14/14 checks). |
| Phase 3G — Agent Operations Readiness & Control Map | Complete. Documentation/control-map only. Committed `a4f488a`, tagged `phase-3g-agent-operations-readiness-v1`. No source code changed. No migration created. Key finding: `EMAIL_SENDING_ENABLED` not enforced in `sendApprovedDraft()` — must be fixed in Phase 3H. |
| Phase 3H — Send Safety Hardening | Complete. Committed `b10d0db`, tagged `phase-3h-send-safety-hardening-v1`. Migration `20240033` applied to staging and production. Production Vercel deployed (`dpl_EVRkZE2uMYsxft5zCMYAtoqWxZ9F`). Production smoke-tested 2026-05-27 (11/11 checks). |
| Phase 3I — Agent Decision Log, AI Usage Tracking, Budget Enforcement & Campaign Email Asset Strategy | Locked. Committed `917738f`, tagged `phase-3i-agent-decision-usage-budget-campaign-assets-v1`. Migration `20240034` applied to local, staging, and production 2026-05-28. |
| Phase 3J — Campaign Email Asset Library | Locked. Committed `30068a6`, tagged `phase-3j-campaign-email-asset-library-v1`. No migration. Staging auto-deploy `dpl_7rKQPkaMNYpZ8zVfc72nTQP6G8La` 2026-05-28; authenticated smoke test PASSED. |
| Phase 3K — Unified Draft / Send Path | Locked. Committed through `bf98582`, tagged `phase-3k-unified-draft-send-path-v1`. Migration `20240035` applied to local and staging (`smbausuyetlgxflyhmfg`). Production migration `20240035` not applied. Staging UI smoke PASSED. Staging DB verification PASSED 29/29. |
| Phase 3L — Campaign Assignment Model | Locked. Committed `7adbd25`, tagged `phase-3l-campaign-assignment-model-v1`. Migration `20240036` applied to local and staging (`smbausuyetlgxflyhmfg`). Production migration `20240036` not applied. Staging UI smoke PASSED. Staging DB verification PASSED. |
| Phase 3M — Campaign Work Queue & Assignment-to-Draft Linkage | Locked. Committed `e33b130`, tagged `phase-3m-campaign-work-queue-v1`. Migration `20240037` applied to local only. Staging migration `20240037` not applied. Production migration `20240037` not applied. 90/90 tests. No LLM path. No send path. |
| Goal 5 — Verian Agent Bridge / Orchestration Layer | In progress. Bridge review queue / audit ledger schema and grant hardening (migrations 20240041–20240043) applied and verified on local and staging (`smbausuyetlgxflyhmfg`). Migration 20240044 (`policy_review_submitted` audit event type) applied to local and staging 2026-06-08. Intervening migrations 20240038–20240040 were applied previously as part of earlier phases/goals. Production not applied (hard stop). **Slice 10 locked**: bridge review queue + audit ledger repository/service implementation. **Slice 11 locked**: Policy-Check Service (dry-run only, outcome-recording). Codex reviewed: PASS WITH NOTES. No bridge execution. No executable model routing. No sending. No automation. Production remains hard stop. Lock tags: `goal-5-slice-10-bridge-review-queue-audit-v1`, `goal-5-slice-11-policy-check-service-v1`. Next: Goal 5 Slice 12 (not yet designed). |

## Staging Foundation v1 — Locked

**Tag:** `staging-foundation-v1`
**Commit:** `0b6441f` — Debug: remove temporary staging auth diagnostic route
**Staging URL:** `https://verian-bios-staging.vercel.app`
**Staging Supabase project ref:** `smbausuyetlgxflyhmfg`

### Verified Environment Chain

| Environment | Supabase ref | Migrations applied | Auth/Access |
|-------------|-------------|-------------------|-------------|
| Local | Docker / `127.0.0.1:54321` | 001–044 | Local seed user `dev@verian.local` |
| Production | `kxrplupzbsmujjznzhpy` | 001–034 (previously reported; not queried in Goal 5 Slice 11 work — production is a hard stop) | Standard access — `https://verian-bios.vercel.app` |
| Staging | `smbausuyetlgxflyhmfg` | 001–044 (20240044 applied 2026-06-08) | `staging@verian.internal` / platform_admin |

### Verified Access Paths

| Path | Status |
|------|--------|
| Login (`/login`) | Working — redirects to workspace on success |
| Workspace loading (`/main/dashboard`) | Working — no "No workspace access" error |
| Authenticated / RLS access | Working — `authenticated` role has table privileges; RLS evaluates correctly |
| Service-role access | Working — `service_role` role has table privileges; bypasses RLS as designed |
| DB grants (migrations 20240030 + 20240031) | Applied to all three environments |

### DB Grant Migrations

| Migration | Purpose |
|-----------|---------|
| `20240030_service_role_grants.sql` | Grants `service_role` USAGE + ALL on tables/sequences/routines + DEFAULT PRIVILEGES for future objects |
| `20240031_anon_authenticated_grants.sql` | Grants `anon` + `authenticated` same set — prerequisite for RLS evaluation on newer Supabase cloud projects |

**Why these were needed:** Supabase cloud projects created after mid-2024 do not automatically apply a catch-all `GRANT ALL ON ALL TABLES` at project creation. PostgreSQL enforces object-level privilege checks before RLS evaluation. Without explicit grants, any query fails with `42501: permission denied for table <name>` before RLS runs — even when RLS policies would allow the row.

### Safety State at Lock

| Item | State |
|------|-------|
| `RESEND_API_KEY` on staging | Dummy value — email sending disabled, safe |
| Production Supabase (`kxrplupzbsmujjznzhpy`) | Migrations 001–034 applied. `20240034` applied 2026-05-28. Production database is up to date. |
| Production Vercel (`verian-bios.vercel.app`) | **Git disconnected (Track A complete, 2026-05-26).** Production no longer auto-deploys from `origin/master`. Staging (`verian-bios-staging`) continues to auto-deploy from master. Production deploys are explicit and manual via `vercel --prod` or Vercel dashboard only. Latest deployment: `dpl_EVRkZE2uMYsxft5zCMYAtoqWxZ9F` (Phase 3H, 2026-05-27). |
| Temporary debug route | Removed (`0b6441f`) — `/api/debug/staging-auth` returns 404 (unauthenticated requests receive 307 → /login from middleware before reaching the absent route handler) |
| Local dev seed | `supabase/seed.sql` committed at `9153a86` — local-only, never run on staging/production |

## QA Status (Last Verified)

Verified at Goal 5 Slice 11 commit `fb3b2b2`.

```
npx vitest run (goal5-slice-11 only) → PASSED  48/48 Slice 11 tests passed
npx vitest run (related goal4/5)     → PASSED  152/152 related Goal 4/5 tests passed
TypeScript                           → 7 pre-existing test-file errors only
                                        (phase3h-send-safety-hardening.test.ts,
                                         quality-review-agent.test.ts); zero new Slice 11 errors
  48 new Slice 11 tests: TC-G5-S11-001 through TC-G5-S11-048 across 7 describe blocks
    Includes: type/action coverage, shared state machine, shared actor authorization,
    repository extension, service safety, directory inventory, mapper
```

## Active Routes

| Route | Status |
|-------|--------|
| `/[workspaceSlug]/message-workspace` | Active |
| `/[workspaceSlug]/message-workspace/[leadId]` | Active — includes QRA display, "Quality Review" button, HRB bridge UI, Send Bridge "Create Email Draft" button, and Event Tracking delivery status badges |
| `/[workspaceSlug]/settings/agent-monitor` | Active — includes Learning Signals section, "Run Learning Analysis" button, and Phase 3B.1 Operational Health card |
| `/[workspaceSlug]/settings/system-controls` | Active |
| `/[workspaceSlug]/settings/system-intelligence` | Active — Phase 3C.3: includes Generate Recommendations button (above Pending System Recommendations), Resolve / Investigate / Ignore buttons for open errors, Dismiss button for system recommendations; Phase 3C.5: View link per error row; Phase 3C.6: SYSTEM_PERFORMANCE_WARNING rec now generated when outbox pending count ≥ 10 |
| `/[workspaceSlug]/settings/system-intelligence/errors/[errorId]` | Active — Phase 3C.5: structured error detail page; shows full automation_failures metadata; Resolve / Investigate / Ignore actions with dual revalidation |
| `/[workspaceSlug]/settings/health` | Active — Workflow Health page |
| `/[workspaceSlug]/settings/imports` | Active — import batch list |
| `/[workspaceSlug]/settings/imports/new` | Active — upload new import file |
| `/[workspaceSlug]/settings/imports/[batchId]` | Active — batch detail: validation summary, dedupe results, approve/cancel |
| `/[workspaceSlug]/leads/[id]` | Active — Phase 3E: WorkflowToggle (enable/disable AI workflow per lead); Phase 3F: LeadActivityTimeline (workflow events, 18-type EVENT_LABELS map), Email Draft History (prior drafts via `emailDrafts.slice(1)`), Workflow Errors panel (linked `automation_failures` via `workflow_runs.subject_type/subject_id`); Phase 3I: AgentDecisionPanel (10 most recent agent decisions per lead, BLOCKED status with budget exhaustion message); Phase 3L: `CampaignAssignmentCard` (campaign type selector, asset picker, active/historical assignments, approve/reject proposed, retire assigned) |
| `/[workspaceSlug]/settings/analytics` | Active — Phase 3D: Revenue Analytics dashboard; Lead Pipeline, Email Performance (30d), Strategy Performance panels; read-only server component |
| `/[workspaceSlug]/settings/ai-usage` | Active — Phase 3I: AI Usage Board; token/cost KPIs (today/month); Usage by Agent, Model, Feature tables; Top Leads by AI Cost; 30-Day Usage Trend; Recent Failed AI Calls |
| `/[workspaceSlug]/settings/campaign-assets` | Active — Phase 3J: campaign email asset list with status badges; AI Draft button (campaign type + prompt brief → AI-generated draft, budget-gated); manual "New Asset" link |
| `/[workspaceSlug]/settings/campaign-queue` | Active — Phase 3M: Campaign Work Queue page; read-only server component; lists all `assigned` campaign assignments with draft readiness badge (No Draft / Draft Pending / Draft Approved / Draft Linked); visible error state on load failure; "View Lead →" links; sidebar nav via `ListTodo` icon |
| `/[workspaceSlug]/settings/campaign-assets/[assetId]` | Active — Phase 3J: asset detail view; edit mode (draft-only); Phase 3K: `SubmitForReviewButton` client component for draft-status assets; `CampaignAssetReviewPanel` converted to `'use client'` (direct server action calls for approve/activate/retire); clone button; Phase 3L: `AssignedLeadsPanel` (list of active/proposed assignments linked to this asset, up to 20, links to lead detail) |
| `/[workspaceSlug]/leads/[id]` (Draft from Campaign Asset) | Active — Phase 3K: `CreateDraftFromAssetCard` renders when active assets exist and no pending draft blocks; blocked explanation card when `hasActiveDraft` is true; `GenerateManualCampaignDraftButton` updated to canonical campaign type values; `source_type = campaign_asset_render` written on draft creation |
| `/[workspaceSlug]/leads/[id]` (Draft from Assignment) | Active — Phase 3M: `CreateDraftFromAssignmentCard` renders above `CreateDraftFromAssetCard` when lead has an `assigned` campaign assignment; calls `createDraftFromAssignmentAction`; blocked when `hasActiveDraft` is true; `CampaignAssignmentCard` extended with linked draft indicator ("Draft in progress") per active assignment; `linkedDraftsByAssignmentId` prop added |

## Working Tree

`?? docs/roadmap/operational-twin-north-star.md` (untracked only). `master` up to date with `origin/master`.

## HEAD Commit

`fb3b2b2` — Goal 5 Slice 11: add policy-check service

## Lock Tags

`goal-5-slice-11-policy-check-service-v1` → `fb3b2b2e355f20e07490fa2ac1f6628d10a229fa` (2026-06-08)
`goal-5-slice-10-bridge-review-queue-audit-v1` → `73f7c7b`
`phase-3m-campaign-work-queue-v1` → `e33b130`
`phase-3l-campaign-assignment-model-v1` → `7adbd25`
`phase-3k-unified-draft-send-path-v1` → `bf98582`
`phase-3j-campaign-email-asset-library-v1` → `30068a6`
`phase-3i-agent-decision-usage-budget-campaign-assets-v1` → `917738f`
`phase-3h-send-safety-hardening-v1` → `b10d0db`

## Guardrails for Next Work

| Guardrail | Reason |
|-----------|--------|
| Production Supabase (`kxrplupzbsmujjznzhpy`) is current through migration `20240034` (previously reported; not queried in Goal 5 staging workflow — production is a hard stop) | Migrations `20240035` through `20240044` applied to local and/or staging — not applied to production. Next available production migration is `20240035`. |
| Production Vercel (`verian-bios`) no longer auto-deploys from `origin/master` | Track A complete — Git disconnected. Production deploys must be explicit via `vercel --prod` or Vercel dashboard |
| Do not reconnect production Vercel Git without explicit user approval | Reconnecting restores auto-deploy on every master push |
| Staging (`verian-bios-staging`) auto-deploys from master — unchanged | Staging is the continuous integration target; every push to master deploys staging |
| Staging must remain deployable | All app code must stay compatible with staging at all times |
| Tests must stay green | 1332/1332 is the current baseline; no regression allowed |
| Migrations must remain ordered and auditable | Every future migration gets the next sequential number; no gaps, no reuse, no retroactive changes. Next available: `20240045`. (`20240035`–`20240036` applied to local and staging; not applied to production. `20240037` applied to local only. `20240038`–`20240040` applied to local and staging as part of earlier phases/goals; not applied to production. `20240041`–`20240043` are Goal 5 bridge review queue/audit migrations — applied to local and staging; not applied to production. `20240044` adds `policy_review_submitted` to `bridge_audit_events.event_type` CHECK — applied to local and staging 2026-06-08; not applied to production.) |
| No environment-crossing assumptions | Local seed data, staging users, and remote dev state are not shared; never assume data from one env exists in another |
| No debug routes left behind | Temporary diagnostic routes must be removed within the same work session; do not merge to master without cleanup |
| Any new phase requires approved design before any code | Follow the standard sequence: Design & Test Cases → approval → Implementation Plan → approval → code |
| `EMAIL_SENDING_ENABLED` kill switch is now enforced in `sendApprovedDraft()` as Gate 0 | Phase 3H implemented this — verified staging: sends are blocked before `email_sends` row creation when the control is false |

## Last Updated

2026-05-30 — Phase 3M locked. Implementation commit `e33b130`. Lock tag `phase-3m-campaign-work-queue-v1 → e33b130` created and pushed to origin. Migration `20240037` (`email_drafts.campaign_assignment_id` FK column + partial index) applied to local only; not applied to staging or production. 90/90 Phase 3M source-reading tests passed. No LLM path introduced. No send path introduced. `EMAIL_SENDING_ENABLED` remains disabled. `CAMPAIGN_SENDING_ENABLED` remains disabled. `generatedByAi` remains false on all campaign-asset-render drafts. Campaign queue is database-only/read-only. Staging migration state at Phase 3M lock: 001–036. Production migration state: 001–034 (previously reported). No production deploy.

2026-06-08 — Goal 5 Slice 11 locked. Policy-Check Service implementation (dry-run only, outcome-recording). 3 new files, 8 modified files; 48/48 Slice 11 tests PASS; 152/152 related Goal 4/5 tests PASS. TypeScript: 7 pre-existing test-file errors only. Local and staging migration state: 001–044 (migration 20240044 applied — `policy_review_submitted` audit event type). Production remains at 001–034 (hard stop). Next available migration: 20240045. `EMAIL_SENDING_ENABLED` remains disabled. `CAMPAIGN_SENDING_ENABLED` remains disabled. No bridge execution. No sending. No automation. Lock tag: `goal-5-slice-11-policy-check-service-v1 → fb3b2b2e355f20e07490fa2ac1f6628d10a229fa`.

2026-06-08 — Goal 5 Slice 10 locked. Bridge review queue + audit ledger repository/service implementation (7 new module files, 2 new test files, 3 updated guard tests, updated `types/database.ts`). Codex reviewed: PASS WITH NOTES. Slice 10 focused tests: 42/42 PASS. Related Goal 4/5 tests: 111/111 PASS. TypeScript: 7 pre-existing test-file errors only (phase3h-send-safety-hardening.test.ts, quality-review-agent.test.ts); zero new Slice 10 errors. Local migration state: 001–043. `EMAIL_SENDING_ENABLED` remains disabled. `CAMPAIGN_SENDING_ENABLED` remains disabled. No bridge execution. No executable model routing. No sending. No automation. No production touch. Lock tag: `goal-5-slice-10-bridge-review-queue-audit-v1 → 73f7c7b`.

2026-06-08 — Goal 5 bridge review queue / audit ledger schema and grant hardening applied and verified on local and staging (`smbausuyetlgxflyhmfg`). Goal 5 bridge review queue/audit migrations 20240041–20240043 applied to local and staging. Intervening migrations 20240038–20240040 were applied previously as part of earlier phases/goals. Not applied to production (hard stop). HEAD: `6319c06`. Staging migration state: 001–043. Local migration state: 001–043. Evidence report committed and pushed: `docs/roadmap/goal-5-staging-bridge-review-queue-audit-schema-grant-hardening-evidence-report.md`. `EMAIL_SENDING_ENABLED` remains disabled. `CAMPAIGN_SENDING_ENABLED` remains disabled. No bridge execution. No sending. No production touch.
