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
| Phase 3E | Not started. |

## Staging Foundation v1 — Locked

**Tag:** `staging-foundation-v1`
**Commit:** `0b6441f` — Debug: remove temporary staging auth diagnostic route
**Staging URL:** `https://verian-bios-staging.vercel.app`
**Staging Supabase project ref:** `smbausuyetlgxflyhmfg`

### Verified Environment Chain

| Environment | Supabase ref | Migrations applied | Auth/Access |
|-------------|-------------|-------------------|-------------|
| Local | Docker / `127.0.0.1:54321` | 001–031 | Local seed user `dev@verian.local` |
| Remote dev | `kxrplupzbsmujjznzhpy` | 001–031 | Standard dev access |
| Staging | `smbausuyetlgxflyhmfg` | 001–031 | `staging@verian.internal` / platform_admin |

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
| Production Supabase | Untouched — no migrations applied |
| Production Vercel (`verian-bios.vercel.app`) | **Git disconnected (Track A complete, 2026-05-26).** Production no longer auto-deploys from `origin/master`. Staging (`verian-bios-staging`) continues to auto-deploy from master. Production deploys are now explicit and manual via `vercel --prod` or Vercel dashboard only. |
| Temporary debug route | Removed (`0b6441f`) — `/api/debug/staging-auth` returns 404 (unauthenticated requests receive 307 → /login from middleware before reaching the absent route handler) |
| Local dev seed | `supabase/seed.sql` committed at `9153a86` — local-only, never run on staging/production |

## QA Status (Last Verified)

Verified at Phase 3D commit `08c3cdd`.

```
npx vitest run      → PASSED
npx next build      → PASSED
TypeScript          → PASSED
1009/1009 tests passed
  (22 new tests added since Phase 3C.6: Phase 3D Revenue Analytics)
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
| `/[workspaceSlug]/settings/analytics` | Active — Phase 3D: Revenue Analytics dashboard; Lead Pipeline, Email Performance (30d), Strategy Performance panels; read-only server component |

## Working Tree

Clean. `master` up to date with `origin/master`.

## HEAD Commit

`08c3cdd` — Phase 3D: implement revenue analytics dashboard

## Lock Tag

`phase-3d-revenue-analytics-v1` → `08c3cdd`

## Guardrails for Next Work

| Guardrail | Reason |
|-----------|--------|
| Production Supabase remains untouched unless explicitly instructed | No production migrations have been applied; this boundary must be maintained |
| Production Vercel (`verian-bios`) no longer auto-deploys from `origin/master` | Track A complete — Git disconnected. Production deploys must be explicit via `vercel --prod` or Vercel dashboard |
| Do not reconnect production Vercel Git without explicit user approval | Reconnecting restores auto-deploy on every master push |
| Staging (`verian-bios-staging`) auto-deploys from master — unchanged | Staging is the continuous integration target; every push to master deploys staging |
| Staging must remain deployable | All app code must stay compatible with staging at all times |
| Tests must stay green | 1009/1009 is the current baseline; no regression allowed |
| Migrations must remain ordered and auditable | Every future migration gets the next sequential number; no gaps, no reuse, no retroactive changes. Next available: `20240032`. |
| No environment-crossing assumptions | Local seed data, staging users, and remote dev state are not shared; never assume data from one env exists in another |
| No debug routes left behind | Temporary diagnostic routes must be removed within the same work session; do not merge to master without cleanup |
| Phase 3E requires approved design before any code | Follow the standard sequence: Design & Test Cases → approval → Implementation Plan → approval → code |

## Last Updated

2026-05-27 — after Phase 3D Revenue Analytics complete (commit `08c3cdd`, tag `phase-3d-revenue-analytics-v1`, staging smoke-tested, 1009/1009 tests).
