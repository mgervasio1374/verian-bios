# 00 — Current Project Status

## Project Identity

**Product:** Verian BIOS — 321 Swipe's Business Intelligence Operating System
**Repo path:** `C:\Projects\verian-bios`
**Branch:** `master`

---

## ⚠️ Derive current state — do not trust snapshots

A July 2026 audit found the previous version of this file ~150 commits stale and
called it "a material operational risk." Snapshots rot. Before acting on anything
below, derive the live truth from the repo:

| Question | Authoritative source |
|---|---|
| What code is current? | `git log --oneline -10` and `git describe --tags` |
| What schema version? | Highest-numbered file in `supabase/migrations/` |
| What migrations does each DB have? | `npx supabase migration list --linked` (link decides target — **verify the ref before trusting the answer**) |
| What features exist? | `components/layout/sidebar-nav.config.ts` (nav = real product surface) |
| Which agents are real vs. aspirational? | `modules/intelligence/agent-roster.ts` (`implState` is honest) |
| What's deployed where? | Vercel dashboard — `verian-bios-staging` auto-deploys master; `verian-bios` (prod) is manual-only |
| Are the send gates on? | `system_controls` rows per tenant: `campaign_scheduler_enabled`, `campaign_send_dispatch_enabled`, `email_sending_enabled` (plus platform-level `email_sending_enabled`) |
| Is the suite green? | `npx vitest run` / `npx tsc --noEmit` / `npx eslint . --quiet` — CI enforces all three on master |

The **environments and release discipline** are documented in `README.md`
(staging `smbausuyetlgxflyhmfg`, prod `kxrplupzbsmujjznzhpy`, migrate-then-deploy,
prod DB changes are a deliberate hard-stop step).

---

## Snapshot — verified 2026-07-03

Point-in-time only. Prefer the derivation table above.

### Phase history (compressed)

Phases 3A–3X (core intelligence → campaign machinery), Goals 1–5 (campaign
sequences, policy layer, dry-run Agent Bridge), Manual Campaign Mode + MCM v2
(segments, bulk assign, scheduling, AI sequence generation, sender identities,
suppression/CAN-SPAM/hard-bounce/opt-out handling, inbound reply capture,
deliverability, outcome artery, ops alerting + watchdog) are **shipped**. The
per-phase detail table this file used to carry is preserved in git history
(`git show d4a5a1d:docs/ai-context/00_CURRENT_STATUS.md`) and in the slice tags
(`git tag --list`). `06_GIT_MILESTONES.md` and `07_NEXT_STEPS.md` are historical
documents — do not treat their "next steps" as current.

### Environment state (as of this snapshot)

| Environment | Supabase ref | Schema | Notes |
|---|---|---|---|
| Staging | `smbausuyetlgxflyhmfg` | `20240068` | auto-deploys master |
| Production | `kxrplupzbsmujjznzhpy` | `20240068` | manual deploys; Supabase org on **Pro** (daily backups; PITR not yet enabled) |

Send gates: platform `email_sending_enabled` OFF; tenant-level gates were toggled
during the CP_FT campaign study — **check `system_controls` live, do not assume**.

### Ops-hardening slice (2026-07-03, this run)

- Fully green baseline: 5,5xx tests / tsc / eslint errors zero; **CI added** (`.github/workflows/ci.yml`)
- `types/database.ts` regenerated from staging (84 → 96 tables)
- Resend webhook **fail-closed** when `RESEND_WEBHOOK_SECRET` missing (503)
- Inbound email: **durable raw-payload ledger** in `webhook_events` before processing
- Watchdog: monitoring failures surface as `monitoringFailed` alerts; throttle keys
  per (check, tenant); optional `OPS_DEADMAN_PING_URL` dead-man ping
- Baseline security headers in `next.config.ts`
- Proposal capture/review/status audit events emitted for real (TODOs completed)

### Standing constraints (still true unless a migration/tag says otherwise)

- Verian Agent Bridge: **dry-run only** — removing that constraint requires a
  dedicated policy review slice and Michael's approval
- Real cold outreach requires the warmed `outreach.321swipe.com` subdomain —
  never cold-blast the root domain
- Production data changes run as user-executed SQL, not agent-issued mass writes
