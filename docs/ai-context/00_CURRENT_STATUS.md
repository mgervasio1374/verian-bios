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
| Phase 3C.2 | Not started. Awaiting design approval. |

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
| Production Vercel | Untouched — no deployments triggered |
| Temporary debug route | Removed (`0b6441f`) — `/api/debug/staging-auth` returns 404 |
| Local dev seed | `supabase/seed.sql` committed at `9153a86` — local-only, never run on staging/production |

## QA Status (Last Verified)

Verified after staging foundation cleanup commit `0b6441f`.

```
npx vitest run      → PASSED
npx next build      → PASSED
TypeScript          → PASSED
879/879 tests passed
  (77 new tests added since Phase 3B.2: Phase 3C.1 Structured Errors + System Intelligence)
```

## Active Routes

| Route | Status |
|-------|--------|
| `/[workspaceSlug]/message-workspace` | Active |
| `/[workspaceSlug]/message-workspace/[leadId]` | Active — includes QRA display, "Quality Review" button, HRB bridge UI, Send Bridge "Create Email Draft" button, and Event Tracking delivery status badges |
| `/[workspaceSlug]/settings/agent-monitor` | Active — includes Learning Signals section, "Run Learning Analysis" button, and Phase 3B.1 Operational Health card |
| `/[workspaceSlug]/settings/system-controls` | Active |
| `/[workspaceSlug]/settings/system-intelligence` | Active — Phase 3C.1 System Intelligence UI |
| `/[workspaceSlug]/settings/health` | Active — Workflow Health page |
| `/[workspaceSlug]/settings/imports` | Active — import batch list |
| `/[workspaceSlug]/settings/imports/new` | Active — upload new import file |
| `/[workspaceSlug]/settings/imports/[batchId]` | Active — batch detail: validation summary, dedupe results, approve/cancel |

## Working Tree

Clean. `master` up to date with `origin/master`.

## HEAD Commit

`0b6441f` — Debug: remove temporary staging auth diagnostic route

## Guardrails for Next Work

| Guardrail | Reason |
|-----------|--------|
| Production remains untouched unless explicitly instructed | No production migrations or deployments have been performed; this boundary must be maintained |
| Staging must remain deployable | Both DB grant migrations and all app code must stay compatible with staging at all times |
| Tests must stay green | 879/879 is the current baseline; no regression allowed |
| Migrations must remain ordered and auditable | Every future migration gets the next sequential number; no gaps, no reuse, no retroactive changes |
| No environment-crossing assumptions | Local seed data, staging users, and remote dev state are not shared; never assume data from one env exists in another |
| No debug routes left behind | Temporary diagnostic routes must be removed within the same work session; do not merge to master without cleanup |
| Phase 3C.2 requires approved design before any code | Follow the standard sequence: Design & Test Cases → approval → Implementation Plan → approval → code |

## Last Updated

2026-05-25 — after Staging Foundation v1 locked and tagged `staging-foundation-v1`.
