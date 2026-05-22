# Phase 3B + Phase 3B.1 — Production Deployment Readiness Checklist

**Document status:** Reference document — for pre-deployment review. No actions are taken by reading this document.
**Version:** 1.0
**Date:** 2026-05-22
**Scope:** Phase 3B Revenue Learning Engine Foundation + Phase 3B.1 Stabilization / Hardening

---

## 1. Executive Summary

Phase 3B and Phase 3B.1 are **locked**. All code is committed, tagged, and QA-verified.

| Check | Result |
|-------|--------|
| `npx vitest run` | PASSED — 646/646 tests |
| `npx next build` | PASSED — 0 errors |
| TypeScript | PASSED |
| HEAD commit | `0af660e` — Phase 3B.1: implement Stabilization Hardening foundation |
| Tags | `phase-3b-learning-agent-v1`, `phase-3b1-stabilization-v1` |

**This document is deployment-readiness preparation only.** It documents what must be verified, configured, and tested before any production deployment is performed. It does not trigger a deployment, modify environment variables, apply database migrations, or make any configuration changes.

Reading this checklist is the precondition for safe production deployment. Deployment itself is a separate human-performed operation.

---

## 2. Deployment Scope

The following Phase 3B and Phase 3B.1 capabilities are included in this deployment:

| Layer | What gets deployed |
|-------|-------------------|
| Message Strategy Agent | Produces `message_strategy` rows; strategy selection logic |
| Copywriting Agent | Produces `message_version[]` rows; compliance and differentiation validators |
| Quality Review Agent | Produces `quality_review` rows; composite scoring, risk flags, recommendation |
| Human Review / Approval Bridge | Reviewer select/reject/approve UI; 18 gate conditions; 6 reviewer actions |
| Send / Email Draft Bridge | Creates `email_draft` (approved); 14 gate conditions; 17-step write sequence |
| Event Tracking | ET_ activity events; Phase 3B attribution in `email_sends.metadata`; webhook handler expansion |
| Learning Agent (on-demand) | `runLearningAnalysisAction` server action; `learning_snapshots` writes; agent monitor Learning Signals card |
| **Phase 3B.1: Attribution hardening** | `email_sends.message_version_id` and `strategy_id` FK columns; FK-first webhook attribution |
| **Phase 3B.1: SEB Reconciler** | `reconcile-send-bridge-stuck-drafts` Inngest function; runs every 15 minutes |
| **Phase 3B.1: Scheduled Learning Agent** | `scheduled-learning-agent-run` Inngest function; runs daily at 06:00 UTC |
| **Phase 3B.1: Operational Health UI** | Read-only agent monitor card: stuck drafts, failed sends, LA run status |

---

## 3. Non-Goals

This document explicitly does NOT:

- Perform a production deployment
- Apply database migrations to any environment
- Change, generate, or rotate any environment variable or secret
- Trigger a Vercel deployment
- Register Inngest functions in production
- Configure or change Resend webhook settings
- Enable active learning or automatic strategy updates
- Add auto-send, auto-retry, or automated follow-up behavior
- Introduce any behavior beyond what is locked in the Phase 3B and Phase 3B.1 foundations

---

## 4. Required Production Systems

| System | Role | Dashboard |
|--------|------|-----------|
| **Vercel** | Next.js hosting; server actions; API routes; static page serving | vercel.com |
| **Supabase** | PostgreSQL database; authentication; RLS; storage | supabase.com |
| **Inngest** | Background job orchestration; scheduled cron functions; event-driven triggers | inngest.com |
| **Resend** | Email sending API; webhook delivery for send outcomes | resend.com |
| **GitHub** | Source code, CI/CD trigger for Vercel deployments | github.com |

### 4.1 Endpoint Dependencies

| Endpoint | Purpose | System |
|----------|---------|--------|
| `POST /api/inngest` | Inngest function registration and event delivery | Inngest |
| `POST /api/webhooks/resend` | Resend delivery webhook (delivered, bounced, complained, opened, clicked, failed) | Resend |
| `POST /api/intake/statement` | Statement intake form submissions | External forms / 321 Swipe |
| `POST /api/intake/contact` | Contact intake form submissions | External forms / 321 Swipe |
| `POST /api/intake/free-analysis` | Free analysis intake form submissions | External forms / 321 Swipe |

The `RESEND_WEBHOOK_SECRET` must be configured and the webhook URL pointed at the production `/api/webhooks/resend` endpoint for Event Tracking to function correctly.

---

## 5. Environment Variables Checklist

All variables are confirmed by inspecting source code. No secrets or values are invented or listed here — only variable names and their purposes.

### 5.1 Supabase

| Variable | Purpose | Prod Required | Where Configured | Validation |
|----------|---------|--------------|-----------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL — used by browser client, server client, and service client | **Yes** | Vercel env vars (all environments); `.env.local` for dev | Verify matches Supabase project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key — public, used by browser auth | **Yes** | Vercel env vars (all environments) | Verify matches Supabase project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — bypasses RLS; used by all repo functions that write to intelligence/messaging tables | **Yes** | Vercel env vars (production only — do NOT expose to browser) | Verify matches Supabase project Settings → API → service_role key; confirm it is NOT prefixed with `NEXT_PUBLIC_` |

**Critical note:** `SUPABASE_SERVICE_ROLE_KEY` is used by `createSupabaseServiceClient()` in every repository that writes `learning_snapshots`, `activity_events`, `email_sends`, `email_drafts`, and `approval_requests`. If this key is missing or wrong, all agent operations will fail silently or throw.

### 5.2 Inngest

| Variable | Purpose | Prod Required | Where Configured | Validation |
|----------|---------|--------------|-----------------|-----------|
| `INNGEST_EVENT_KEY` | Inngest event key — used by `inngest.createFunction` client; required for event publishing | **Yes** | Vercel env vars; Inngest app settings | Get from Inngest dashboard → App → Event key; must match the app serving functions |
| `INNGEST_SIGNING_KEY` | Inngest signing key — used by Inngest SDK internally to verify incoming requests to `/api/inngest` | **Yes** | Vercel env vars | Get from Inngest dashboard → App → Signing key; without this, Inngest cannot securely deliver events to the app |

**Note:** `INNGEST_SIGNING_KEY` appears in `.env.example` and is required by the Inngest SDK for production security even though it is not directly referenced in application code (the SDK reads it automatically). Missing it in production disables Inngest function verification.

### 5.3 Resend

| Variable | Purpose | Prod Required | Where Configured | Validation |
|----------|---------|--------------|-----------------|-----------|
| `RESEND_API_KEY` | Resend API key — used by `lib/resend/client.ts` for all email sends | **Yes** | Vercel env vars (server-only; not prefixed `NEXT_PUBLIC_`) | Get from Resend dashboard → API Keys; verify the key has sending permissions for the configured domain |
| `RESEND_WEBHOOK_SECRET` | Resend webhook signing secret — used by `app/api/webhooks/resend/route.ts` to verify webhook authenticity | **Yes** | Vercel env vars | Get from Resend dashboard → Webhooks → your webhook → Signing secret; if missing, signature verification is skipped (security risk) |

**Critical note on `RESEND_WEBHOOK_SECRET`:** If this variable is not set, the webhook handler skips signature verification. This means any request to `/api/webhooks/resend` would be processed. In production this key must be set. The handler rejects requests with invalid signatures when the secret is configured.

### 5.4 App / Public

| Variable | Purpose | Prod Required | Where Configured | Validation |
|----------|---------|--------------|-----------------|-----------|
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app — used in Inngest statement workflow email links | **Yes** | Vercel env vars; defaults to `https://verian-bios.vercel.app` | Must match actual production domain; used in outbound email links |
| `NEXT_PUBLIC_APP_NAME` | Display name of the app | No (has default) | Vercel env vars | Currently not verified against a default in the `.env.example`; set to `Verian BIOS` |

### 5.5 Intake API

| Variable | Purpose | Prod Required | Where Configured | Validation |
|----------|---------|--------------|-----------------|-----------|
| `INTAKE_API_KEY` | Bearer token for authenticating intake form submissions to `/api/intake/*` | **Yes** (if intake forms are active) | Vercel env vars | Must match the key configured in the external form submission system; if not set, all intake requests are rejected |
| `INTAKE_TENANT_ID` | Tenant UUID for routing intake submissions | **Yes** (if intake active) | Vercel env vars | Must be a valid tenant UUID in the production database |
| `INTAKE_WORKSPACE_ID` | Workspace UUID for routing intake submissions | **Yes** (if intake active) | Vercel env vars | Must be a valid workspace UUID in the production database |

### 5.6 Optional / Contextual

| Variable | Purpose | Prod Required | Where Configured | Validation |
|----------|---------|--------------|-----------------|-----------|
| `CALENDLY_LINK` | Calendly booking URL embedded in statement workflow emails | No (has fallback `https://calendly.com/321swipe`) | Vercel env vars | Set to the correct Calendly link for the production team |
| `SALES_EMAIL` | Sales contact email embedded in statement workflow emails | No | Vercel env vars | Set if statement workflow email templates use it |

### 5.7 Sender Identity in Production

**Important:** In non-production environments (`NODE_ENV !== 'production'`), the email send service falls back to `Verian BIOS <onboarding@resend.dev>` if no sender identity is configured in the database. In production (`NODE_ENV === 'production'`), this fallback is disabled — if no `sender_identities` record exists for the tenant with `is_default = true`, all sends will fail with `no_sender_identity_configured`.

**Action required before production:** Verify that a `sender_identities` row exists in the production database for each tenant that will send emails. Ensure the domain is verified in Resend.

---

## 6. Supabase Migration Readiness

### 6.1 Full Migration Sequence

The production database must have all migrations applied in order. As of Phase 3B.1:

| # | Migration | Contents |
|---|-----------|---------|
| 1 | `20240001_platform.sql` | tenants, workspaces, roles, permissions, memberships |
| 2 | `20240002_crm.sql` | contacts, leads, companies, CRM tables |
| 3 | `20240003_workflow.sql` | approval_requests, webhook_events, system_events |
| 4 | `20240004_intelligence.sql` | intelligence tables (early) |
| 5 | `20240005_artifacts.sql` | document vault / artifacts |
| 6 | `20240006_messaging.sql` | email_drafts, email_sends, email_events, sender_identities |
| 7 | `20240007_rls.sql` | Row Level Security policies |
| 8 | `20240008_seed.sql` | Platform seed data |
| 9 | `20240009_hardening.sql` | Schema hardening |
| 10 | `20240010_phase35_seed.sql` | Phase 3.5 seed |
| 11 | `20240011_phase36_email_draft_lifecycle.sql` | Email draft lifecycle columns |
| 12 | `20240012_approval_request_reconcile_index.sql` | Reconciliation index |
| 13 | `20240013_phase4_email_send.sql` | email_sends: contact_id, company_id, error_message, idempotency index |
| 14 | `20240014_phase41_email_events.sql` | email_events table |
| 15 | `20240015_phase4_statement_workflow.sql` | Statement workflow |
| 16 | `20240016_phase3a_intelligence_tables.sql` | activity_events, agent_runs, company_scores, guardrail_events, system_controls |
| 17 | `20240017_phase3a_rls_indexes_seed.sql` | Phase 3A RLS, indexes, seed |
| 18 | `20240018_phase3b1_follow_up_controls_seed.sql` | Follow-up accountability seed |
| 19 | `20240019_email_quality_reviews.sql` | Email quality reviews (Phase 3A rewrite loop) |
| 20 | `20240020_email_draft_versions.sql` | Email draft versioning |
| 21 | `20240021_email_quality_suggested_scores.sql` | Quality suggested scores |
| 22 | `20240022_phase3b_message_strategies.sql` | **Phase 3B**: message_strategies table |
| 23 | `20240023_phase3b_message_versions.sql` | **Phase 3B**: message_versions table |
| 24 | `20240024_phase3b_quality_reviews.sql` | **Phase 3B**: quality_reviews table |
| 25 | `20240025_phase3b_learning_snapshots.sql` | **Phase 3B**: learning_snapshots table + advisory constraint |
| 26 | `20240026_phase3b1_email_sends_attribution.sql` | **Phase 3B.1**: email_sends FK columns + partial indexes |

**Latest migration:** `20240026_phase3b1_email_sends_attribution.sql`

### 6.2 Migration Application

Migrations must be applied in numeric order. Skipping or reordering migrations is not supported. Use the Supabase CLI or Supabase dashboard SQL editor.

**Recommended command (Supabase CLI):**
```bash
npx supabase db push --db-url <PRODUCTION_DB_URL>
```

Or use the Supabase dashboard → SQL Editor for each migration file individually if CLI is not available.

### 6.3 Migration Verification SQL

After applying all migrations, run these queries to confirm the production schema is correct:

**Verify Phase 3B tables exist:**
```sql
-- message_strategies
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'message_strategies';

-- message_versions
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'message_versions';

-- quality_reviews
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'quality_reviews';

-- learning_snapshots
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'learning_snapshots';
```

**Verify Phase 3B.1 columns on email_sends:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'email_sends'
  AND column_name IN ('message_version_id', 'strategy_id')
ORDER BY column_name;
-- Expected: 2 rows, both data_type = 'uuid', is_nullable = 'YES'
```

**Verify Phase 3B.1 partial indexes exist:**
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'email_sends'
  AND indexname IN ('idx_email_sends_message_version', 'idx_email_sends_strategy');
-- Expected: 2 rows
```

**Verify existing critical tables and constraints:**
```sql
-- activity_events exists (Phase 3A, required for ET_ and LA_)
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'activity_events';

-- email_events exists (Phase 4, required for Resend webhook idempotency)
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'email_events';

-- webhook_events exists (Phase 3A, raw inbound webhook log)
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'webhook_events';

-- learning_snapshots advisory = true constraint exists
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name = 'chk_advisory_true';
-- Expected: 1 row with check_clause = '(advisory = true)'
```

**Verify FK constraints on email_sends (Phase 3B.1):**
```sql
SELECT constraint_name, column_name, foreign_table_name
FROM information_schema.key_column_usage kcu
JOIN information_schema.referential_constraints rc
  ON kcu.constraint_name = rc.constraint_name
JOIN information_schema.table_constraints tc
  ON rc.unique_constraint_name = tc.constraint_name
WHERE kcu.table_name = 'email_sends'
  AND kcu.column_name IN ('message_version_id', 'strategy_id');
-- Expected: 2 rows (message_version_id → message_versions, strategy_id → message_strategies)
```

### 6.4 Migration Rollback Notes

If a migration must be rolled back in production, follow these steps **only under explicit operator approval**:

**Rollback of `20240026` only (Phase 3B.1 attribution):**
```sql
-- Only if BOTH new FK columns must be removed:
DROP INDEX IF EXISTS idx_email_sends_message_version;
DROP INDEX IF EXISTS idx_email_sends_strategy;
ALTER TABLE email_sends
  DROP COLUMN IF EXISTS message_version_id,
  DROP COLUMN IF EXISTS strategy_id;
```
This is safe because no other table references these columns. JSONB attribution fallback will continue to work for all existing Phase 3B sends.

**Do not roll back Phase 3B migrations (`20240022`–`20240025`)** without explicit guidance. These tables contain production data that would be lost.

---

## 7. RLS / Service Role Validation

### 7.1 Service Role Requirements

The application uses `createSupabaseServiceClient()` (which uses `SUPABASE_SERVICE_ROLE_KEY`) for all write operations in intelligence, messaging, and reconciliation contexts. This bypasses RLS by design — the application enforces tenant scoping in all query conditions (`WHERE tenant_id = ...`).

**Tables written via service client:**
- `learning_snapshots` — written by Learning Agent (manual and scheduled)
- `activity_events` — written by HRB, SEB, ET, LA audit events
- `email_drafts` — written by Send Bridge service (via service client in some paths)
- `email_sends` — written by send service
- `approval_requests` — written by Send Bridge

### 7.2 RLS Policy Verification

The following policies must be active. Verify in Supabase dashboard → Authentication → Policies:

| Table | Policy | Expected behavior |
|-------|--------|-------------------|
| `learning_snapshots` | `users can read own tenant learning snapshots` | Authenticated users can SELECT where `tenant_id IN (memberships WHERE user_id = auth.uid())` |
| `learning_snapshots` | No INSERT/UPDATE/DELETE for authenticated users | All writes via service client only |
| `activity_events` | Tenant-scoped SELECT for authenticated users | Confirm policy exists |
| `message_strategies` | Tenant-scoped read/write for workspace members | Confirm policy exists |
| `message_versions` | Tenant-scoped read/write for workspace members | Confirm policy exists |
| `quality_reviews` | Tenant-scoped read/write for workspace members | Confirm policy exists |

### 7.3 Advisory Constraint Verification

```sql
-- Confirm learning_snapshots enforces advisory = true at DB level:
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'chk_advisory_true';
-- MUST return 1 row. If 0 rows, migration 20240025 was not applied correctly.
```

### 7.4 Cross-Tenant Isolation Verification

All repositories that query `learning_snapshots`, `activity_events`, `email_sends`, and `email_drafts` include an explicit `WHERE tenant_id = ?` condition. This is enforced in code, not by RLS, for service-client queries. The Learning Agent and Operational Health repo are verified to include this condition in all queries.

---

## 8. Inngest Production Readiness

### 8.1 Required Environment Variables

| Variable | Required | Notes |
|----------|---------|-------|
| `INNGEST_EVENT_KEY` | **Yes** | Used by `inngest.createFunction` client constructor |
| `INNGEST_SIGNING_KEY` | **Yes** | Used by Inngest SDK to verify incoming requests to `/api/inngest`; must match the key in Inngest dashboard |

### 8.2 Inngest Endpoint

The Inngest serve handler is at:
```
POST /api/inngest
GET  /api/inngest  (introspection, used by Inngest dashboard)
PUT  /api/inngest  (sync endpoint)
```

**File:** `app/api/inngest/route.ts`

The production Inngest app must be pointed at: `https://<production-domain>/api/inngest`

### 8.3 Expected Registered Functions

After deployment, the Inngest dashboard should show **8 functions** registered:

| Function ID | Name | Trigger |
|-------------|------|---------|
| `dispatch-outbox` | Dispatch Outbox | Event-driven |
| `on-lead-created` | On Lead Created | Event-driven |
| `on-approval-approved` | On Approval Approved | Event-driven |
| `on-approval-rejected` | On Approval Rejected | Event-driven |
| `reconcile-email-draft-status` | Reconcile Email Draft Status | Cron `*/5 * * * *` |
| `on-statement-received` | On Statement Received | Event-driven |
| `reconcile-send-bridge-stuck-drafts` | Reconcile Send Bridge Stuck Drafts | Cron `*/15 * * * *` |
| `scheduled-learning-agent-run` | Scheduled Learning Agent Run | Cron `0 6 * * *` |

### 8.4 Cron Schedule Validation

After deployment, verify in the Inngest dashboard:

| Function | Expected cron | Verification |
|----------|--------------|-------------|
| `reconcile-send-bridge-stuck-drafts` | `*/15 * * * *` | Should run every 15 minutes; check Runs tab for recent executions |
| `scheduled-learning-agent-run` | `0 6 * * *` | Should run once per day at 06:00 UTC; check Runs tab |
| `reconcile-email-draft-status` | `*/5 * * * *` | Existing function; verify still present and running |

### 8.5 Inngest Function Registration Steps

1. Deploy the application to Vercel production (see Section 10)
2. Navigate to Inngest dashboard → Apps → your app
3. Click **Sync** (or navigate to `https://<production-domain>/api/inngest` to trigger sync)
4. Verify all 8 functions appear in the Functions list
5. Check that `scheduled-learning-agent-run` and `reconcile-send-bridge-stuck-drafts` show the correct cron schedules

### 8.6 Safe Manual Test Strategy

After deployment, trigger a single safe manual test before relying on cron:

**Test `reconcile-send-bridge-stuck-drafts`:**
- Navigate to Inngest dashboard → Functions → `reconcile-send-bridge-stuck-drafts` → Invoke
- No required payload
- Expected result: `{ stateA: { found: 0, reported: 0 }, stateB: { found: 0, reported: 0 }, stateC: { found: 0, fixed: 0, errors: 0 }, ranAt: ... }` (all zeros on a fresh production database)

**Test `scheduled-learning-agent-run`:**
- Only invoke after Supabase migrations are applied and at least one workspace exists
- Navigate to Inngest dashboard → Functions → `scheduled-learning-agent-run` → Invoke
- Expected result: `{ tenantsProcessed: N, tenantsWithData: 0, tenantsWithError: 0, results: [...] }` (no errors; no data yet on a fresh deployment)
- Do NOT invoke if there is any concern about writing to production `learning_snapshots` prematurely

### 8.7 Failure Visibility

- All Inngest function failures appear in the Inngest dashboard → Runs tab
- `reconcile-send-bridge-stuck-drafts` has `retries: 1`; failures will retry once
- `scheduled-learning-agent-run` has `retries: 0`; per-tenant failures are caught and logged; function-level failures appear in the Inngest dashboard
- Both functions log structured results at the function level (visible as Inngest run output)

---

## 9. Resend / Webhook Readiness

### 9.1 Webhook Endpoint

```
URL: https://<production-domain>/api/webhooks/resend
Method: POST
```

**File:** `app/api/webhooks/resend/route.ts`

### 9.2 Required Resend Webhook Events

Configure the Resend webhook to deliver these event types:

| Event | Phase 3B use |
|-------|-------------|
| `email.delivered` | ET_EMAIL_DELIVERED activity event |
| `email.bounced` | ET_EMAIL_BOUNCED activity event |
| `email.complained` | ET_EMAIL_COMPLAINED activity event; auto-unsubscribe |
| `email.failed` | ET_EMAIL_DELIVERY_FAILED activity event |
| `email.opened` | ET_EMAIL_OPENED activity event |
| `email.clicked` | ET_EMAIL_CLICKED activity event |
| `email.delivery_delayed` | Logged only — no activity event emitted |

### 9.3 Webhook Signature Verification

The handler reads `RESEND_WEBHOOK_SECRET` and verifies using HMAC-SHA256 (Standard Webhooks / svix spec). The secret must match the one configured in Resend.

**Verification behavior:**
- If `RESEND_WEBHOOK_SECRET` is set: invalid signatures return HTTP 401; stale timestamps (> 5 minutes) are rejected
- If `RESEND_WEBHOOK_SECRET` is not set: signature verification is skipped (development convenience — must NOT be left unset in production)

### 9.4 Idempotency and Duplicate Protection

Every Resend webhook delivery includes a `Webhook-Id` header (`svix-id` in older versions). This is used as `provider_event_id` in `email_events`. A unique constraint on `provider_event_id` prevents duplicate processing.

**Behavior on duplicate:**
1. Duplicate `email_events` insert → PostgreSQL `23505` unique constraint violation
2. Handler detects error code `23505` → logs "Duplicate event ignored" → returns HTTP 200
3. The Phase 3B activity event block is NOT executed for duplicate webhooks (runs after the idempotency guard)

### 9.5 Phase 3A vs Phase 3B Event Routing

All inbound Resend webhooks are processed. The Phase 3B activity event block is guarded by `resolvePhase3bAttributionFromSend`:
- If `email_send.message_version_id IS NOT NULL` → Phase 3B send → emit ET_ activity event
- If JSONB `metadata.source === 'phase_3b_send_bridge'` → old Phase 3B send → emit ET_ activity event (fallback)
- Otherwise → Phase 3A send → no ET_ activity event emitted; all other processing (email_events insert, status update, unsubscribe) still occurs normally

### 9.6 Test Webhook Strategy

After configuring the production webhook:

1. Send a test email via the existing Phase 3A send flow from the production app
2. In the Resend dashboard → Emails, find the sent email and use "Resend webhook" to replay the `email.delivered` event to the production endpoint
3. Verify in the Supabase `email_events` table that a row was inserted with the correct `email_send_id`
4. If it was a Phase 3B send: verify in `activity_events` that an `ET_EMAIL_DELIVERED` row was created

### 9.7 Disable / Repoint Strategy

To disable Phase 3B Event Tracking without a code rollback:
1. In Resend dashboard → Webhooks → disable the webhook endpoint
2. Webhook events will stop arriving; existing `email_events` and `activity_events` rows are unaffected
3. The Learning Agent will still run but will not have new delivery outcomes to analyze

To repoint to a different environment (e.g., rolling back to a preview):
1. Update the webhook URL in Resend dashboard
2. Update `RESEND_WEBHOOK_SECRET` in the target environment if it differs

---

## 10. Vercel Deployment Readiness

### 10.1 Build Command

The production build command is:
```bash
next build
```

Defined in `package.json` as `"build": "next build"`. No custom build scripts beyond standard Next.js.

**Verified:** `npx next build` passes with 0 errors on the locked codebase. TypeScript is clean.

### 10.2 Required Environment Variables in Vercel

All variables from Section 5 must be configured in Vercel → Project → Settings → Environment Variables. Recommended environment scoping:

| Variable | Production | Preview | Development |
|----------|-----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ (prod project) | ✓ (staging project) | ✓ (local) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ (staging) | ✓ |
| `INNGEST_EVENT_KEY` | ✓ | ✓ (dev app) | ✓ |
| `INNGEST_SIGNING_KEY` | ✓ | ✓ | ✓ |
| `RESEND_API_KEY` | ✓ | ✓ (test mode) | ✓ |
| `RESEND_WEBHOOK_SECRET` | ✓ | ✓ (if webhook configured) | optional |
| `NEXT_PUBLIC_APP_URL` | ✓ (prod domain) | ✓ (preview URL) | ✓ |
| `INTAKE_API_KEY` | ✓ | ✓ | optional |
| `INTAKE_TENANT_ID` | ✓ | ✓ | optional |
| `INTAKE_WORKSPACE_ID` | ✓ | ✓ | optional |

### 10.3 Preview vs Production Caution

Vercel preview deployments share the same environment variable configuration unless explicitly separated. If preview deployments are connected to a staging Supabase project, they should use different `NEXT_PUBLIC_SUPABASE_URL` and keys to prevent test data from contaminating production.

**Risk:** If preview and production share the same Supabase project, the scheduled Learning Agent cron (`0 6 * * *`) registered from a preview deployment could run against production data.

**Mitigation:** Use separate Inngest apps for preview vs production, or disable cron functions on preview apps.

### 10.4 Domain / `NEXT_PUBLIC_APP_URL` Validation

`NEXT_PUBLIC_APP_URL` is used in outbound email links (statement workflow). Set this to the exact production domain:
```
NEXT_PUBLIC_APP_URL=https://app.verian.io   # example — use actual production domain
```

Trailing slashes are stripped automatically in `on-statement-received.ts`.

### 10.5 Server Actions and Route Handler Compatibility

Phase 3B uses Next.js Server Actions (`'use server'` directive) for all agent actions and the `runLearningAnalysisAction`. These require:
- Next.js version ≥ 14 (project uses 16.2.4 — compatible)
- No static export mode (server actions are incompatible with `output: 'export'`)

**Verified:** `next.config.ts` has no special configuration that would conflict with server actions.

### 10.6 Post-Deployment Verification

After Vercel deployment completes:
1. Confirm the deployment is listed in Vercel → Deployments as "Ready"
2. Confirm the production domain resolves to the new deployment
3. Check Vercel → Functions → any function invocation errors in the last 5 minutes

---

## 11. Post-Deployment Smoke Test Checklist

Execute these tests manually after deployment. Each test should be performed in the production environment by a team member with appropriate access.

### 11.1 Application Basics

- [ ] App loads at production URL without console errors
- [ ] Login / Supabase auth flow works (user can sign in)
- [ ] Workspace selector loads and correct workspaces appear
- [ ] `/[workspaceSlug]/dashboard` loads without error
- [ ] `/[workspaceSlug]/leads` loads and displays lead list
- [ ] `/[workspaceSlug]/settings/agent-monitor` loads without error
- [ ] Operational Health card appears (may show all zeros — this is expected on a fresh deployment)
- [ ] Learning Signals section appears (may show "No learning analysis has been run yet")

### 11.2 Message Workspace (Phase 3B Core Flow)

- [ ] `/[workspaceSlug]/message-workspace` loads
- [ ] Opening a lead in the message workspace displays version cards (if any exist from prior data)
- [ ] "Generate Strategy" button is present (MSA trigger)
- [ ] If strategy exists: "Generate Versions" button is present (CA trigger)
- [ ] If versions exist: "Quality Review" button is present (QRA trigger)
- [ ] If quality reviews exist: Approve/Reject buttons are present (HRB)
- [ ] If an approved version exists: "Create Email Draft" button is present (SEB)
- [ ] If a draft exists: "Send" button requires explicit click (no auto-send)

### 11.3 Send Bridge Verification

- [ ] Creating an email draft from an approved version does NOT automatically send it
- [ ] The `email_draft.status = 'approved'` after creation (verify in Supabase or via UI status)
- [ ] The reviewer must explicitly click "Send" to trigger `sendApprovedDraftAction`
- [ ] Three distinct clicks required: (1) Approve version, (2) Create Email Draft, (3) Send

### 11.4 Event Tracking Verification

- [ ] After sending a Phase 3B email, verify in Supabase `email_sends` table: `message_version_id` and `strategy_id` are populated (non-null) — confirms Phase 3B.1 attribution hardening
- [ ] After Resend delivers the email and fires a webhook: verify in Supabase `activity_events` that an `ET_EMAIL_DELIVERED` row appears with `entity_id = message_version_id` — confirms ET_ attribution

### 11.5 Learning Agent Verification

- [ ] Click "Run Learning Analysis" in the agent monitor
- [ ] The button shows a loading state, then shows a result message
- [ ] `learning_snapshots` table in Supabase shows new rows with `advisory = true`
- [ ] Learning Signals section in the agent monitor updates after the run
- [ ] If zero Phase 3B sends exist: result shows "0 signals computed from 0 sends" — this is correct

### 11.6 Inngest Verification

- [ ] Inngest dashboard shows 8 registered functions
- [ ] `reconcile-send-bridge-stuck-drafts` is listed with cron `*/15 * * * *`
- [ ] `scheduled-learning-agent-run` is listed with cron `0 6 * * *`
- [ ] No failed runs in the last hour for any function (Inngest → Runs)

### 11.7 Phase 3A Template Email Behavior (Regression Check)

- [ ] If Phase 3A template-based sends are active: verify they still work after Phase 3B.1 deployment
- [ ] Phase 3A sends should NOT produce ET_ activity events (verify `activity_events` does not gain ET_ rows for Phase 3A sends)
- [ ] Phase 3A sends should have `message_version_id = NULL` and `strategy_id = NULL` in `email_sends`

---

## 12. Production Guardrails Checklist

Verify these properties hold in the deployed production system:

| Guardrail | Verification |
|-----------|-------------|
| No auto-send | Three distinct human clicks are required before an email sends; confirmed by SEB behavior |
| No auto-retry | `sendApprovedDraft` has no retry logic; failed sends are recorded as `status = 'failed'` and require human re-action |
| No active learning | `learning_snapshots.advisory = true` is enforced by DB `CHECK` constraint; verify constraint exists (Section 6.3) |
| No automatic strategy updates | `message_strategies` is only written by `generateMessageStrategyAction` on explicit trigger |
| No QRA score mutation by Learning Agent | Learning Agent reads `quality_reviews` but writes only to `learning_snapshots` |
| No message copy mutation | `message_versions.body_text` and `subject_line` are immutable after creation |
| No external LLM calls from ET or LA | All signal calculation is deterministic arithmetic; no HTTP calls to LLM endpoints |
| Scheduled Learning Agent advisory-only | Calls unchanged `runLearningAnalysis`; `advisory = true` DB constraint enforced |
| Operational Health card read-only | No action buttons on the card; `operational-health.repo.ts` has only SELECT queries |
| State A/B reconciliation report-only | `SebReconciliationResult.stateA.found === .reported`; no `approval_requests` writes |
| State C only auto-supersedes pending siblings | `supersedePendingDraftsForLead` is the only write in the reconciler; no draft creation |

---

## 13. Monitoring / Logging Checklist

After deployment, ensure these observability surfaces are active and accessible:

| Surface | What to monitor | Access |
|---------|----------------|--------|
| **Vercel Logs** | Server action errors, route handler errors, build failures | Vercel dashboard → Project → Logs |
| **Inngest Dashboard** | Function run history, cron execution, per-step results, error counts | Inngest dashboard → Runs |
| **Supabase Logs** | Database query errors, RLS violations, slow queries | Supabase dashboard → Logs → Postgres |
| **Supabase activity_events** | Phase 3B audit trail (HRB_, SEB_, ET_, LA_ events) | Supabase → Table Editor → activity_events |
| **Resend Dashboard** | Send success/failure, webhook delivery attempts, bounce/complaint rates | Resend dashboard → Emails / Webhooks |
| **Agent Monitor (in-app)** | Stuck draft counts, failed sends last 24h, LA run status | `/[workspaceSlug]/settings/agent-monitor` |

### 13.1 Known Monitoring Gap

**Webhook failure visibility is limited in Phase 3B.1.** The `webhook_events` table records all inbound webhooks but the `processed` flag is set to `true` even when the webhook handler catches an exception internally. A dedicated `processing_error` column (migration `20240027`) was deferred from Phase 3B.1. Until that migration is applied:

- Webhook failures are visible in Vercel logs (`console.error('[resend-webhook] Processing error:', ...)`)
- They are NOT reliably surfaced in the Operational Health card
- Use Resend dashboard → Webhooks → your endpoint → Recent deliveries to identify retried webhooks

---

## 14. Rollback Plan

### 14.1 Code Rollback (Vercel)

If a deployment causes issues, roll back in Vercel dashboard → Deployments → select the prior deployment → Promote. This reverts the application code without affecting the database.

**Important:** Rolling back code does not roll back database migrations. If `20240026` has been applied to production, rolling back the application code will leave Phase 3B.1 columns on `email_sends` — this is safe, as the old code simply ignores the new columns.

### 14.2 Inngest Function Disable

If a specific Inngest function is causing issues (e.g., `scheduled-learning-agent-run` is failing for all tenants), disable it in Inngest dashboard → Functions → select function → Disable (or remove cron trigger). This stops future cron executions without a code rollback. Re-enable after diagnosing the issue.

**Note:** Disabling `scheduled-learning-agent-run` does not affect the manual "Run Learning Analysis" button, which calls a server action directly.

### 14.3 Resend Webhook Disable

If the Resend webhook handler is causing issues, disable the webhook in Resend dashboard → Webhooks → your endpoint → Disable. This stops Resend from sending events to the application. Existing `email_events` and `activity_events` rows are unaffected. Re-enable after diagnosing.

### 14.4 Migration Rollback (Caution)

Rolling back migrations from production databases is high-risk and should only be done under explicit operator guidance.

**Safe to roll back:** `20240026` only — removes Phase 3B.1 FK columns from `email_sends`. JSONB attribution fallback continues to work. No data loss. Verification: run the DROP INDEX and DROP COLUMN commands from Section 6.4.

**Do not roll back without explicit guidance:**
- `20240022`–`20240025` (Phase 3B tables) — contain production `message_strategies`, `message_versions`, `quality_reviews`, and `learning_snapshots` rows
- `20240001`–`20240021` (platform, CRM, messaging baseline) — core application tables

### 14.5 What Should Not Be Rolled Back Casually

- Any migration that has live production data rows
- Any change that would cause a foreign key constraint violation on rollback
- The `advisory = true` DB constraint on `learning_snapshots` — removing it would allow non-advisory rows to be inserted in future

---

## 15. Go / No-Go Checklist

Complete every item before performing a production deployment. A single unchecked item should pause the deployment.

### Environment

- [ ] `NEXT_PUBLIC_SUPABASE_URL` configured in Vercel production environment
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` configured in Vercel production environment
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configured in Vercel production environment (server-only, not public)
- [ ] `INNGEST_EVENT_KEY` configured in Vercel production environment
- [ ] `INNGEST_SIGNING_KEY` configured in Vercel production environment
- [ ] `RESEND_API_KEY` configured in Vercel production environment
- [ ] `RESEND_WEBHOOK_SECRET` configured in Vercel production environment
- [ ] `NEXT_PUBLIC_APP_URL` set to actual production domain
- [ ] `INTAKE_API_KEY`, `INTAKE_TENANT_ID`, `INTAKE_WORKSPACE_ID` configured if intake forms are active
- [ ] No production secrets checked in to the repository

### Database

- [ ] All 26 migrations (`20240001`–`20240026`) applied to production Supabase in order
- [ ] `email_sends.message_version_id` column exists and is nullable (verified by SQL in Section 6.3)
- [ ] `email_sends.strategy_id` column exists and is nullable (verified by SQL in Section 6.3)
- [ ] `idx_email_sends_message_version` partial index exists
- [ ] `idx_email_sends_strategy` partial index exists
- [ ] `learning_snapshots` table exists with `chk_advisory_true` constraint
- [ ] `activity_events`, `email_events`, `webhook_events` tables exist
- [ ] At least one `sender_identities` row with `is_default = true` exists for each sending tenant

### Build and Code

- [ ] Local `npx next build` passes with 0 errors
- [ ] `npx vitest run` passes 646/646
- [ ] TypeScript passes
- [ ] HEAD is at `0af660e` or a later commit that includes all Phase 3B.1 changes

### Inngest

- [ ] All 8 Inngest functions visible in dashboard after deployment
- [ ] `reconcile-send-bridge-stuck-drafts` shows cron `*/15 * * * *`
- [ ] `scheduled-learning-agent-run` shows cron `0 6 * * *`
- [ ] Manual invocation of `reconcile-send-bridge-stuck-drafts` produces clean result (all zeros or small counts)

### Resend

- [ ] Resend webhook configured to point at production `/api/webhooks/resend` URL
- [ ] All 7 webhook event types configured (delivered, bounced, complained, failed, opened, clicked, delivery_delayed)
- [ ] `RESEND_WEBHOOK_SECRET` set and matches Resend dashboard signing secret
- [ ] Test webhook delivery verified (replay a delivered event from Resend dashboard)

### Smoke Tests

- [ ] App loads and auth works
- [ ] Message workspace opens
- [ ] No auto-send occurs (three explicit clicks verified)
- [ ] Agent monitor loads with Operational Health card
- [ ] Manual "Run Learning Analysis" produces a valid result
- [ ] Phase 3A template email behavior unaffected (if applicable)

### Rollback

- [ ] Rollback plan reviewed and understood by deployment team
- [ ] Vercel prior deployment identified (can be promoted if needed)
- [ ] Inngest dashboard accessible for function management
- [ ] Resend webhook can be disabled if needed

---

## 16. Recommended Deployment Order

Execute in this exact sequence. Do not skip steps or re-order them.

```
Step 1  — Confirm clean baseline
         └── git log HEAD → confirm 0af660e or later
         └── git tag -l → confirm phase-3b1-stabilization-v1 exists
         └── npx next build → PASSED locally

Step 2  — Verify environment variables
         └── Open Vercel → Settings → Environment Variables
         └── Confirm all required variables from Section 5 are present in Production scope
         └── Confirm SUPABASE_SERVICE_ROLE_KEY is NOT prefixed with NEXT_PUBLIC_

Step 3  — Apply Supabase migrations to production
         └── Apply migrations 20240022 through 20240026 in numeric order
             (if not already applied from prior deployments, start from 20240001)
         └── Run verification SQL from Section 6.3 after each Phase 3B migration
         └── Confirm email_sends has both new FK columns

Step 4  — Verify database schema
         └── Run all verification SQL from Section 6.3
         └── Confirm chk_advisory_true constraint exists on learning_snapshots
         └── Confirm sender_identities row exists for sending tenants

Step 5  — Deploy to Vercel preview
         └── Push to preview branch / trigger preview deployment
         └── Confirm build passes in Vercel logs
         └── Run smoke tests from Section 11 on preview URL
         └── Confirm Operational Health card loads on preview

Step 6  — Validate preview
         └── All smoke test items from Section 11 pass on preview
         └── No new errors in Vercel logs for preview deployment
         └── Go / No-Go checklist from Section 15 fully satisfied

Step 7  — Promote / deploy to production
         └── Merge to main branch or promote in Vercel
         └── Confirm production deployment is "Ready" in Vercel

Step 8  — Register and verify Inngest functions
         └── Navigate to Inngest dashboard → Apps → your app
         └── Click Sync to register functions from the new production deployment
         └── Confirm 8 functions are listed
         └── Confirm cron schedules for Phase 3B.1 functions
         └── Manually invoke reconcile-send-bridge-stuck-drafts (expect all zeros)

Step 9  — Configure and verify Resend webhook
         └── In Resend dashboard → Webhooks → update production URL if needed
         └── Confirm RESEND_WEBHOOK_SECRET matches
         └── Replay a test webhook event and verify email_events insert

Step 10 — Run production smoke tests
         └── All items from Section 11 pass on production URL
         └── Verify Phase 3B send creates email_sends with non-null message_version_id

Step 11 — Monitor first 24 hours
         └── Check Inngest dashboard the morning after deployment for:
             - scheduled-learning-agent-run result at 06:00 UTC
             - reconcile-send-bridge-stuck-drafts results every 15 minutes (should be clean)
         └── Check Vercel logs for any unexpected errors
         └── Check agent monitor Operational Health card for any unexpected stuck drafts or failed sends
         └── Check Resend dashboard for successful webhook delivery
```

---

## 17. Final Recommendation

### Production Readiness Assessment

Phase 3B and Phase 3B.1 are technically ready for production deployment. The code is locked, tested (646/646), and TypeScript-clean. The architecture is well-understood, guardrails are enforced at both code and DB levels, and the rollback paths are clear.

### Recommendation: One Dry-Run Before Production

**Before the first full production deployment, perform a dry-run against a staging environment** that mirrors production as closely as possible. Specifically:

1. Apply all 26 migrations to a staging Supabase project
2. Configure all environment variables in Vercel with staging values
3. Deploy to a Vercel preview environment connected to staging
4. Run the complete Go / No-Go checklist (Section 15) against staging
5. Run all smoke tests (Section 11) against staging
6. Manually invoke both new Inngest cron functions and verify they run cleanly
7. Send a test Phase 3B email and verify ET_ attribution in staging `activity_events`

**Rationale:** Two new Inngest cron functions (`reconcile-send-bridge-stuck-drafts` and `scheduled-learning-agent-run`) are deploying for the first time. While both are safe (no destructive writes, advisory-only outputs), their first production execution should be observed in a lower-stakes environment first.

If a full staging environment is not available, perform the dry-run on a Vercel preview deployment connected to a dedicated staging Supabase project.

**After a successful staging dry-run:** Proceed to production deployment following the sequence in Section 16.

**Do not skip the dry-run** simply because tests pass locally. Environment variable misconfiguration, Supabase migration sequencing issues, and Inngest cron registration problems are not detectable by local `vitest run` or `next build` — they are only visible when running against actual production infrastructure.

---

*Document status: Final — for review before production deployment. No deployment actions have been performed by creating this document.*
*Version: 1.0 — 2026-05-22*
