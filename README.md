# Verian BIOS

321 Swipe's Business Intelligence Operating System — a revenue-operations platform combining CRM, proposal/statement intelligence, campaign orchestration, gated email delivery, agent-assisted copywriting, learning signals, and operational monitoring.

## Stack

- **Next.js 16** (App Router) + **React 19**, deployed on Vercel
- **Supabase/PostgreSQL** — auth, persistence, RLS, storage
- **Inngest** — event-driven background work (campaign scheduling/approvals/sends, imports, learning, reconciliation, ops watchdog)
- **Resend** — outbound email + delivery webhooks; inbound reply capture endpoint
- Provider-agnostic **LLM layer** (`lib/llm/`) with retry/fallback chains

## Architecture

```
UI / server components → server actions → domain services → repositories → Supabase
External + scheduled events → webhooks / Inngest → the same services + repositories
```

Domain modules live under `modules/`: `crm`, `proposals`, `messaging`, `campaign-sequence`, `intelligence`, `workflow`, `import`, `verian-agent-bridge` (dry-run only), `verian-policy`.

Key invariants:

- **Tenant isolation is explicit.** The service-role Supabase client (`lib/supabase/service.ts`) bypasses RLS by design; every repository must filter by `tenant_id`.
- **Human approval and delivery are separated.** Campaign scheduling, approval, and sending are distinct stages, each behind its own kill switch (`system_controls`: `campaign_scheduler_enabled`, `campaign_send_dispatch_enabled`, `email_sending_enabled`).
- **Webhooks are fail-closed and durable.** The Resend webhook rejects deliveries when the signing secret is missing; inbound email is written to the `webhook_events` ledger before processing.
- **Agents are honest about maturity.** `modules/intelligence/agent-roster.ts` distinguishes live / gated / skeletal / definition-only; the Agent Bridge is enforced dry-run-only.

## Environments

| | Vercel project | Supabase ref | Deploys |
|---|---|---|---|
| **Staging** | `verian-bios-staging` (verian-bios-staging.vercel.app) | `smbausuyetlgxflyhmfg` | auto on push to `master` |
| **Production** | `verian-bios` (verian-bios.vercel.app) | `kxrplupzbsmujjznzhpy` | **manual** `vercel --prod` only |

**Release discipline: migrate-then-deploy.** Apply migrations to the target database (`npx supabase migration up --linked`) and verify **before** deploying code that needs them. Production migrations are a deliberate step — never casual. The repo's Supabase CLI link should normally point at staging.

## Development

```bash
npm install
npm run dev        # local dev server
npx vitest run     # full test suite
npx tsc --noEmit   # typecheck
npx eslint .       # lint (errors block CI)
```

CI (`.github/workflows/ci.yml`) runs lint + typecheck + the full suite on every push/PR to `master`. The suite includes behavioral tests and source-pin "tripwire" tests; when a pin fails because implementation legitimately changed, update it faithfully (assert the new truth, never delete the guard).

Migrations are sequential files in `supabase/migrations/` — the highest number is the schema version.

## Documentation map

- `AGENTS.md` / `CLAUDE.md` — AI-agent context recovery protocol
- `docs/ai-context/` — canonical status + locked decisions (00 explains how to derive **current** state from the repo rather than trusting snapshots)
- `docs/roadmap/` — design docs, slice plans, audit and release reports
