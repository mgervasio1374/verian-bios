# Phase 3B + Phase 3B.1 — Staging Dry-Run Checklist / Environment Validation

**Document status:** Reference document — staging validation checklist. No actions are taken by reading this document.
**Version:** 1.0
**Date:** 2026-05-22
**Scope:** Phase 3B Revenue Learning Engine + Phase 3B.1 Stabilization / Hardening — staging validation before production deployment

---

## 1. Executive Summary

Phase 3B and Phase 3B.1 are **locked**. All code is committed, tagged, and QA-verified.

| Check | Result |
|-------|--------|
| `npx vitest run` | PASSED — 646/646 tests |
| `npx next build` | PASSED — 0 errors |
| TypeScript | PASSED |
| HEAD commit | `0af660e` — Phase 3B.1: implement Stabilization Hardening foundation |

**This is a staging validation checklist only.** Its purpose is to validate the production deployment readiness checklist (`docs/roadmap/production-deployment-readiness-checklist-phase-3b.md`) against a real (non-production) environment before any production changes are made.

**No production changes should be made during this dry run.** All steps target a staging Supabase project, a staging Vercel preview deployment, an isolated Inngest app, and a staging Resend key or test domain. Production environment variables, production databases, and production Resend webhooks must remain untouched.

---

## 2. Purpose of Staging Dry Run

Local tests (`npx vitest run`, `npx next build`) confirm that the code is correct and compiles. They do not and cannot validate:

| What cannot be validated locally | Why |
|----------------------------------|-----|
| Vercel environment variable correctness | Variables are injected at build and runtime by Vercel; local runs use `.env.local` |
| Supabase migration application against a real database | Local Vitest uses no live DB; `next build` does not apply migrations |
| Inngest function registration and cron scheduling | Inngest crons require a publicly reachable endpoint; local dev server is not reachable by Inngest cloud |
| Resend webhook delivery and signature verification | Resend must be able to reach the webhook endpoint via HTTPS; `localhost` is not reachable |
| Sender identity configuration | Requires a real `sender_identities` row in the database and domain verified in Resend |
| Cross-system smoke tests (app → Supabase → Resend → Inngest → app) | All four systems must be simultaneously configured and running |
| `SUPABASE_SERVICE_ROLE_KEY` correctness | A wrong key causes silent write failures that only manifest at runtime |
| `INNGEST_SIGNING_KEY` correctness | A wrong signing key causes Inngest requests to be rejected; the app would appear to work but jobs would never run |
| Phase 3B.1 FK columns populated at send time | Requires a live send through the full stack |

The staging dry run is the mandatory step between "tests pass locally" and "production deployment."

---

## 3. Staging Environment Assumptions

The dry run requires an isolated non-production environment. The following components must be available and must NOT share resources with production:

| Component | Staging requirement |
|-----------|-------------------|
| **Supabase** | A dedicated staging Supabase project (separate URL, separate anon key, separate service role key). Never use production keys during a staging dry run. |
| **Vercel** | A Vercel preview deployment (preview environment, not production). Preview deployments are created automatically on push to a branch or can be promoted manually. |
| **Inngest** | Either a separate Inngest dev/staging app, or the same Inngest app used in development — NOT the production app registration. The staging endpoint must be a publicly reachable URL (not localhost). |
| **Resend** | A staging Resend API key associated with a verified test domain, or Resend test mode if available. Real customer email addresses must NOT be used during the dry run. |
| **App URL** | A staging/preview URL (e.g., `https://verian-bios-git-main.vercel.app`). `NEXT_PUBLIC_APP_URL` must point to this URL, not the production domain. |
| **Tenant / Workspace** | A dedicated staging tenant UUID and workspace UUID. Not production tenant IDs. |

**If a staging environment does not yet exist**, the minimum viable setup is:
1. Create a new Supabase project (free tier is sufficient)
2. Create a Vercel preview deployment from the current branch
3. Use the Inngest development app (already used locally) — but note that local Inngest dev mode is not triggered by Vercel preview builds; a separate Inngest integration is needed
4. Use Resend test mode or a personal/test domain

---

## 4. Staging Environment Variables Checklist

Before running any staging validation, confirm each variable is correctly set in the Vercel preview environment (or equivalent staging config). Do not use production values.

**How to check:** In Vercel → Project → Settings → Environment Variables, filter by the "Preview" environment scope.

| Variable | Required for Dry Run? | Source | Validation Method | Risk if Wrong |
|----------|----------------------|--------|------------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Staging Supabase project → Settings → API → Project URL | App login should succeed; Supabase logs show connection | App fails to connect to DB; auth broken |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Staging Supabase project → Settings → API → anon/public key | App login and read operations work | Auth fails; RLS violations |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Staging Supabase project → Settings → API → service_role key | Server actions write data successfully (e.g., generate strategy, run Learning Agent) | Silent write failures; agent operations appear to succeed but nothing is written |
| `INNGEST_EVENT_KEY` | **Yes** | Staging/dev Inngest app → Settings → Event key | Functions appear registered at `/api/inngest`; events can be sent | Inngest events rejected; cron functions never fire |
| `INNGEST_SIGNING_KEY` | **Yes** | Staging/dev Inngest app → Settings → Signing key | Inngest can deliver events to the staging endpoint without 401 errors | All Inngest deliveries fail with 401; functions appear registered but never execute |
| `RESEND_API_KEY` | **Yes** (if sending tested) | Resend → API Keys → staging/test key | A safe test email sends without error | Send fails; email_sends row created but Resend returns error |
| `RESEND_WEBHOOK_SECRET` | **Yes** (if webhook tested) | Resend → Webhooks → your staging webhook → Signing secret | Webhook delivery is accepted (200) with correct signature | Webhook rejected with 401 if secret is set; webhook processed insecurely if not set |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Staging/preview Vercel URL | Email links in statement workflow emails point to staging URL | Links in emails go to wrong environment; may expose staging data |
| `NEXT_PUBLIC_APP_NAME` | No (defaults to `Verian BIOS`) | Vercel env var | UI displays correct app name | Minor: wrong name in UI |
| `INTAKE_API_KEY` | Conditional (if intake tested) | Configured with external form system | Intake requests succeed | Intake requests rejected or unauthenticated |
| `INTAKE_TENANT_ID` | Conditional (if intake tested) | Staging tenant UUID from Supabase | `resolveIntakeTenant()` does not throw | Intake data routed to wrong tenant or throws on startup |
| `INTAKE_WORKSPACE_ID` | Conditional (if intake tested) | Staging workspace UUID from Supabase | Same as above | Same as above |
| `CALENDLY_LINK` | Conditional (if statement workflow tested) | Calendly link for staging/test team | Correct link in emails | Wrong Calendly link in outbound emails |
| `SALES_EMAIL` | Conditional (if statement workflow tested) | Test/staging email address | Correct email in notifications | Wrong email in statement workflow notifications |

### 4.1 Verification Steps

After configuring all variables in the Vercel preview environment:

- [ ] Open the staging app URL in a browser — confirm it loads (Supabase URL and anon key are correct)
- [ ] Sign in — confirm Supabase auth works
- [ ] Navigate to agent monitor — if it loads without error, server client likely works
- [ ] Check Vercel logs for any `process.env.XXX is undefined` or `createClient` errors immediately after deployment

### 4.2 Critical Isolation Check

Before proceeding, perform this check explicitly:

- [ ] Copy the `NEXT_PUBLIC_SUPABASE_URL` value used in the staging preview
- [ ] Compare it to the production Supabase URL
- [ ] **They must be different.** If they are the same, stop the dry run immediately — staging data would contaminate production.

---

## 5. Supabase Staging Migration Dry Run

### 5.1 Check Current Migration State

If a staging Supabase project already exists, check which migrations have already been applied before applying more:

```sql
-- If using Supabase migrations table:
SELECT name FROM schema_migrations ORDER BY name;

-- Or check for the most recently expected table:
SELECT to_regclass('public.message_strategies') AS strategies_exists,
       to_regclass('public.message_versions')   AS versions_exists,
       to_regclass('public.quality_reviews')    AS quality_exists,
       to_regclass('public.learning_snapshots') AS snapshots_exists;
```

If a table returns `null`, its migration has not been applied yet.

### 5.2 Apply Migrations in Order

Apply all pending migrations in numeric order. **Never skip a migration.** The full required sequence for Phase 3B + Phase 3B.1 is `20240001` through `20240026`.

**Recommended approach using Supabase CLI:**
```bash
npx supabase db push --db-url <STAGING_DB_URL>
```

**Alternative:** Open each migration `.sql` file and execute it in the Supabase dashboard → SQL Editor for the staging project.

**Safety check before applying:** Confirm you are targeting the staging project, not production. In the Supabase CLI, verify with:
```bash
npx supabase status
# Confirms which project is currently linked
```

### 5.3 Schema Verification SQL (Run Against Staging After All Migrations)

**Phase 3B tables:**
```sql
SELECT
  to_regclass('public.message_strategies')  AS strategies,
  to_regclass('public.message_versions')    AS versions,
  to_regclass('public.quality_reviews')     AS quality_reviews,
  to_regclass('public.learning_snapshots')  AS learning_snapshots;
-- All four should return the table OID (non-null)
```

**Phase 3B.1 columns on `email_sends`:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'email_sends'
  AND column_name IN ('message_version_id', 'strategy_id')
ORDER BY column_name;
-- Expected: 2 rows; data_type = 'uuid'; is_nullable = 'YES'
```

**Phase 3B.1 partial indexes:**
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'email_sends'
  AND indexname IN ('idx_email_sends_message_version', 'idx_email_sends_strategy');
-- Expected: 2 rows
```

**`learning_snapshots` advisory constraint:**
```sql
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name = 'chk_advisory_true';
-- Expected: 1 row with check_clause '(advisory = true)'
```

**Required ancillary tables (Phase 3A + baseline):**
```sql
SELECT
  to_regclass('public.activity_events')  AS activity_events,
  to_regclass('public.email_events')     AS email_events,
  to_regclass('public.webhook_events')   AS webhook_events,
  to_regclass('public.approval_requests') AS approval_requests;
-- All should be non-null
```

### 5.4 Staging Data Safety Check

- [ ] Confirm staging Supabase project URL does NOT match production URL
- [ ] Confirm no `message_strategies`, `message_versions`, or `learning_snapshots` rows exist that came from a real customer (if the project is shared — verify row counts look right)
- [ ] Confirm `sender_identities` table exists — if sending is tested, a row with `is_default = true` must exist for the staging tenant

### 5.5 Sender Identity Setup for Staging

In production, each sending tenant needs a `sender_identities` row with `is_default = true` and a Resend-verified domain. For staging:

**Option A (recommended):** Use Resend's Resend.dev domain in test mode. Create a `sender_identities` row in staging with:
- `email = 'onboarding@resend.dev'`
- `name = 'Verian BIOS'`
- `is_default = true`
- `is_verified = true`
- `tenant_id = <staging tenant UUID>`

**Option B:** Verify a test/personal domain in Resend and configure a `sender_identities` row pointing to that domain.

**Warning:** Without a `sender_identities` row, sends in production mode will fail with `no_sender_identity_configured`. In staging (`NODE_ENV !== 'production'`), the app falls back to `onboarding@resend.dev` automatically. However, it is best practice to configure this row explicitly even in staging.

---

## 6. Vercel Preview Dry Run

### 6.1 Deploy Preview Build

```bash
# Push your branch to trigger a Vercel preview:
git push origin main
# OR push a feature/staging branch:
git push origin staging-validation
```

Vercel automatically creates a preview deployment for every push. The preview URL is visible in Vercel → Deployments.

### 6.2 Confirm Build Passes

- [ ] In Vercel → Deployments → [preview deployment] → confirm status is "Ready"
- [ ] Open the Build Logs and confirm no errors (especially TypeScript errors or missing env var warnings)
- [ ] Confirm the build output matches what `npx next build` produces locally

### 6.3 Environment Variable Isolation

- [ ] Open Vercel → Project → Settings → Environment Variables
- [ ] Filter to "Preview" scope
- [ ] Confirm `NEXT_PUBLIC_SUPABASE_URL` is the **staging** Supabase URL (not production)
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is the **staging** service role key (not production)
- [ ] Confirm `RESEND_API_KEY` is a **staging/test** key (not the production sending key)

**If any production key is found in the preview scope, stop the dry run and correct the configuration before continuing.**

### 6.4 `NEXT_PUBLIC_APP_URL` Validation

Set `NEXT_PUBLIC_APP_URL` to the Vercel preview URL for this deployment:
```
NEXT_PUBLIC_APP_URL=https://verian-bios-git-main-[team].vercel.app
```
or the custom preview domain if configured.

Verify this is correct by:
- [ ] Navigating to the statement workflow (if applicable) and confirming email links point to the staging URL
- [ ] Checking that no links in emails would accidentally point to production

### 6.5 Server Actions and Route Handler Validation

- [ ] Navigate to `/[workspaceSlug]/settings/agent-monitor` — page loads without server error
- [ ] Open browser developer tools → Network tab → confirm server actions return 200 (not 500 or 403)
- [ ] Check Vercel → Functions logs for any uncaught exceptions immediately after page load

---

## 7. Inngest Staging Dry Run

### 7.1 Inngest Endpoint Registration

The Inngest serve endpoint is at `/api/inngest`. After the preview deployment is live:

1. Navigate to Inngest dashboard → Apps
2. Add or update the staging app with the preview endpoint URL:
   ```
   https://[preview-url]/api/inngest
   ```
3. Click **Sync** to register all functions from the endpoint
4. Confirm 8 functions appear:

| Function ID | Expected |
|-------------|---------|
| `dispatch-outbox` | ✓ |
| `on-lead-created` | ✓ |
| `on-approval-approved` | ✓ |
| `on-approval-rejected` | ✓ |
| `reconcile-email-draft-status` | ✓ |
| `on-statement-received` | ✓ |
| `reconcile-send-bridge-stuck-drafts` | ✓ (Phase 3B.1) |
| `scheduled-learning-agent-run` | ✓ (Phase 3B.1) |

- [ ] All 8 functions listed in Inngest dashboard
- [ ] `reconcile-email-draft-status` shows cron: `*/5 * * * *`
- [ ] `reconcile-send-bridge-stuck-drafts` shows cron: `*/15 * * * *`
- [ ] `scheduled-learning-agent-run` shows cron: `0 6 * * *`

### 7.2 Manual Invocation — `reconcile-send-bridge-stuck-drafts`

This function is safe to invoke at any time (it only reads and conditionally supersedes pending drafts).

1. In Inngest dashboard → Functions → `reconcile-send-bridge-stuck-drafts` → **Invoke**
2. No payload required (leave payload empty or `{}`)
3. Wait for the run to complete (should take < 5 seconds)
4. Check the run output:

**Expected result on a clean staging database (no Phase 3B sends yet):**
```json
{
  "stateA": { "found": 0, "reported": 0 },
  "stateB": { "found": 0, "reported": 0 },
  "stateC": { "found": 0, "fixed": 0, "errors": 0 },
  "ranAt": "2026-05-22T..."
}
```

- [ ] Run completes without error
- [ ] `stateA.found`, `stateB.found`, `stateC.found` are 0 (or small, expected numbers if test data exists)
- [ ] `stateC.errors` is 0

### 7.3 Manual Invocation — `scheduled-learning-agent-run`

**Only invoke this after staging test data exists (at least one active tenant and workspace).** Invoking with no tenants/workspaces produces a valid but empty result.

1. In Inngest dashboard → Functions → `scheduled-learning-agent-run` → **Invoke**
2. No payload required
3. Wait for the run (may take 10–30 seconds depending on tenant count)
4. Check the run output:

**Expected result on staging with one tenant and no Phase 3B sends:**
```json
{
  "tenantsProcessed": 1,
  "tenantsWithData": 0,
  "tenantsWithError": 0,
  "results": [
    {
      "tenantId": "<staging-tenant-id>",
      "workspaceId": "<staging-workspace-id>",
      "ok": true,
      "snapshotCount": 0,
      "totalSends": 0
    }
  ]
}
```

- [ ] Run completes without error
- [ ] No tenant has `ok: false`
- [ ] `tenantsWithError` is 0
- [ ] Check Supabase `activity_events` — an `LA_SIGNALS_COMPUTED` row should appear with `metadata.triggered_by = 'scheduled:inngest'`

### 7.4 Confirming Staging Tenant Isolation

- [ ] Check the `results[]` array — all `tenantId` values are staging tenant IDs
- [ ] No production tenant IDs appear in the results
- [ ] If unexpected tenants appear, stop and investigate — staging may be pointing at a shared/production database

### 7.5 Inngest Failure Visibility

- [ ] Navigate to Inngest dashboard → Runs → confirm all runs are visible with status (Completed / Failed)
- [ ] Confirm that a failed run (e.g., manually caused by using a wrong env key) shows an error message in the run output
- [ ] Confirm you know where to find Inngest run logs before production deployment

---

## 8. Resend / Webhook Staging Dry Run

### 8.1 Configure Staging Webhook Endpoint

In Resend dashboard → Webhooks:

1. Create a new webhook (or update the existing staging webhook) pointing to:
   ```
   https://[staging-preview-url]/api/webhooks/resend
   ```
2. Enable all relevant event types: `email.delivered`, `email.bounced`, `email.complained`, `email.failed`, `email.opened`, `email.clicked`, `email.delivery_delayed`
3. Copy the **Signing Secret** from the Resend webhook configuration
4. Set `RESEND_WEBHOOK_SECRET` in the Vercel preview environment to match this signing secret
5. Redeploy the preview if the env var was added after the initial deployment

### 8.2 Verify `RESEND_WEBHOOK_SECRET` Match

The webhook handler (`app/api/webhooks/resend/route.ts`) reads `RESEND_WEBHOOK_SECRET` and uses HMAC-SHA256 to verify signatures. If the secret does not match the Resend webhook signing secret:
- Webhook requests will return HTTP 401
- `webhook_events` rows will NOT be inserted
- `email_events` rows will NOT be inserted
- ET_ activity events will NOT be emitted

**Test:**
- [ ] In Resend dashboard → Webhooks → your staging webhook → **Send Test Event**
- [ ] In Vercel logs (Function logs for the preview deployment), confirm no 401 errors
- [ ] In Supabase staging `webhook_events` table, confirm a new row was inserted

### 8.3 Duplicate Webhook Test

To verify idempotency:

1. In Resend dashboard, find a webhook event that was already delivered (from the test above)
2. Use the **Resend** button (replay) to send the same event again
3. Verify in Vercel logs: `[resend-webhook] Duplicate event ignored: <provider_event_id>`
4. Verify in Supabase `email_events`: only ONE row for that `provider_event_id` (no duplicate)

- [ ] Duplicate replay produces a `console.log` "Duplicate event ignored" message in Vercel logs
- [ ] No duplicate `email_events` row is created
- [ ] The webhook still returns HTTP 200 (Resend expects 200; a non-200 triggers retry)

### 8.4 Invalid Signature Test (If Feasible)

To verify signature enforcement:

1. Use `curl` to send a POST to the staging webhook endpoint without valid signature headers:
   ```bash
   curl -X POST https://[staging-preview-url]/api/webhooks/resend \
     -H "Content-Type: application/json" \
     -d '{"type":"email.delivered","data":{"email_id":"test"}}'
   ```
2. Expected response: `HTTP 401` with body `{"error":"Missing webhook signature headers"}`

- [ ] Invalid request returns 401 (confirms signature verification is active)
- [ ] No `webhook_events` row created for the invalid request

### 8.5 Phase 3B vs Phase 3A Routing Verification

After a Phase 3B send is completed in staging (see Section 10):

- [ ] In Supabase `email_sends`: `message_version_id` and `strategy_id` are non-null (Phase 3B.1 FK attribution)
- [ ] After Resend delivers and fires a webhook: in Supabase `activity_events`, an `ET_EMAIL_DELIVERED` row exists with `entity_id = message_version_id` and `event_type = 'ET_EMAIL_DELIVERED'`

After a Phase 3A template send (if applicable):
- [ ] In Supabase `email_sends`: `message_version_id` is null, `strategy_id` is null
- [ ] No `ET_EMAIL_DELIVERED` row in `activity_events` for the Phase 3A send

---

## 9. Test Data Setup

### 9.1 Minimum Required Staging Data

The following staging data is required before running the full end-to-end smoke test (Section 10). Create this data using the staging app UI or direct Supabase SQL inserts.

| Data | Requirement | Setup method |
|------|-------------|-------------|
| Tenant | 1 staging tenant | Auto-created on first Supabase auth sign-in if `memberships` trigger exists; or insert directly |
| Workspace | 1 staging workspace linked to tenant | Create via app UI or insert |
| User membership | 1 user with `crm.companies.view` permission | Sign in as a user and ensure membership row exists |
| Lead | 1 test lead linked to workspace | Create via `/[workspaceSlug]/leads` UI |
| Contact | 1 test contact with a real-ish email | Create via CRM UI — **use a controlled test email address** |
| Company | 1 test company (optional, linked to lead) | Create via CRM UI |
| Sender identity | 1 row with `is_default = true`, test email address | Insert directly in Supabase staging or via any admin path |
| Message strategy | 1 active strategy for the test lead | Trigger via "Generate Strategy" in the message workspace |
| Message versions | 2–4 versions for the strategy | Trigger via "Generate Versions" in the message workspace |
| Quality reviews | Reviews for each version | Trigger via "Quality Review" button in the message workspace |
| Approved version | 1 version with `approval_status = 'approved'` | Use HRB Approve action in the message workspace |
| Approved email draft | 1 draft with `status = 'approved'` | Use "Create Email Draft" button in the message workspace |
| Test send | 1 email sent via "Send" button | **Only if Resend is configured and a safe test recipient is used** |

### 9.2 Test Contact Warning

> **IMPORTANT: Do not use real customer contact email addresses for staging sends.**

Use one of the following for any staging test sends:
- Your own team email address
- A dedicated test inbox (e.g., `staging-test@[your-domain].com`)
- Resend's built-in test recipient if available in test mode
- A `+tag` variant of a team address (e.g., `team+staging@example.com`)

Never import or copy real customer contacts into the staging environment.

### 9.3 Efficient Test Data Path

The fastest path to end-to-end test data is:

1. Sign in to the staging app with your user account
2. Create a test workspace
3. Create a test lead with your email address as the contact
4. Navigate to message workspace for the lead
5. Click through MSA → CA → QRA → HRB → SEB using the staging UI
6. Stop before clicking "Send" until Resend is confirmed configured

If creating a full message flow takes too long, insert minimal data directly via Supabase SQL. Ask the development team for the correct minimal data shape for `message_strategies` and `message_versions`.

---

## 10. End-to-End Staging Smoke Test

Work through this checklist in order. Check off each item as you verify it.

### 10.1 Application Basics

- [ ] Staging app loads at the preview URL without console errors
- [ ] Login flow works (Supabase auth succeeds)
- [ ] Workspace selector shows the staging workspace
- [ ] `/[workspaceSlug]/dashboard` loads without error
- [ ] `/[workspaceSlug]/leads` loads and shows test lead

### 10.2 Message Strategy Agent

- [ ] `/[workspaceSlug]/message-workspace` loads
- [ ] Open the test lead's message workspace
- [ ] Click "Generate Strategy" (or confirm an existing strategy displays)
- [ ] A `message_strategies` row appears in Supabase staging with `status = 'active'`

### 10.3 Copywriting Agent

- [ ] Click "Generate Versions" (or confirm existing versions display)
- [ ] 2–4 version cards appear in the workspace UI
- [ ] `message_versions` rows appear in Supabase staging with `approval_status = 'pending'`

### 10.4 Quality Review Agent

- [ ] Click "Quality Review" (or confirm existing reviews display)
- [ ] Composite scores, score bands, and recommended badge appear on version cards
- [ ] `quality_reviews` rows appear in Supabase staging

### 10.5 Human Review / Approval Bridge

- [ ] Approve button appears on a version card
- [ ] Clicking Approve opens a confirmation modal or directly approves
- [ ] One version transitions to `approval_status = 'approved'` in Supabase staging
- [ ] Attempting to approve a second version is blocked (HRB_018) — if tested

- [ ] Reject button appears on non-approved versions
- [ ] Clicking Reject opens the rejection reason modal
- [ ] Rejected version transitions to `approval_status = 'rejected'`

### 10.6 Send / Email Draft Bridge

- [ ] "Create Email Draft" button appears on the approved version card
- [ ] Clicking the button shows a confirmation modal (no auto-creation)
- [ ] After confirming, the draft is created
- [ ] In Supabase staging `email_drafts`: a row with `status = 'approved'` appears
- [ ] In Supabase staging `approval_requests`: a linked row with `status = 'approved'` appears
- [ ] **No email is sent automatically** — the reviewer must explicitly click "Send"

### 10.7 Phase 3B.1 Attribution Validation

- [ ] In Supabase staging `email_drafts`: `ai_generation_metadata` contains `source = 'phase_3b_send_bridge'`

After clicking the "Send" button (only if Resend is configured with a safe test recipient):

- [ ] In Supabase staging `email_sends`: a new row appears
- [ ] `email_sends.message_version_id` is **non-null** and equals the approved version's UUID (Phase 3B.1 FK attribution)
- [ ] `email_sends.strategy_id` is **non-null** and equals the strategy's UUID
- [ ] `email_sends.metadata.source = 'phase_3b_send_bridge'` (JSONB metadata preserved)

**If Resend is not yet configured:** Skip the send step. The Send Bridge verification above (approved draft creation, no auto-send) is sufficient to confirm the bridge works.

### 10.8 Event Tracking Validation

After a successful Phase 3B send to Resend (with webhook configured):

- [ ] In Supabase staging `activity_events`: an `ET_SEND_INITIATED` row appears immediately after send
- [ ] An `ET_SEND_SUCCEEDED` row appears after Resend accepts
- [ ] After Resend delivers and fires the `email.delivered` webhook: an `ET_EMAIL_DELIVERED` row appears
- [ ] `entity_id` on all ET_ rows matches `email_sends.message_version_id`

### 10.9 Learning Agent Manual Run

- [ ] Navigate to `/[workspaceSlug]/settings/agent-monitor`
- [ ] Click "Run Learning Analysis"
- [ ] The button shows a loading state then shows a result message
- [ ] In Supabase staging `learning_snapshots`: new rows appear with `advisory = true`
- [ ] The Learning Signals section in the agent monitor updates with the new signals (or shows "0 signals from 0 sends" if no Phase 3B sends have been made yet)

### 10.10 Scheduled Learning Agent

- [ ] Manually invoke `scheduled-learning-agent-run` in the Inngest dashboard (see Section 7.3)
- [ ] Confirm result has `tenantsProcessed >= 1` and `tenantsWithError = 0`
- [ ] In Supabase staging `activity_events`: an `LA_SIGNALS_COMPUTED` row appears with `metadata.triggered_by = 'scheduled:inngest'`

### 10.11 Operational Health Card

- [ ] Navigate to agent monitor page
- [ ] Operational Health card appears between System Controls and Learning Signals
- [ ] Stuck Phase 3B Drafts section shows:
  - State A: "None" (or a small number if there are intentional stuck test drafts)
  - State B: "None" (or expected count)
- [ ] Failed Sends (last 24h) section shows: "None" (or expected count)
- [ ] Learning Agent Last Run shows: timestamp of the most recent run + Completed badge
- [ ] Advisory disclaimer text is present: "All indicators above are informational only."
- [ ] No action buttons appear on the card

### 10.12 No Auto-Send Verification

- [ ] At no point in the above flow did an email send without explicit human action
- [ ] After HRB Approve: no send occurred automatically
- [ ] After "Create Email Draft": no send occurred automatically
- [ ] Only after explicit "Send" button click: the send was triggered

---

## 11. Guardrail Validation

Verify each guardrail holds in the staging environment by observation during the smoke test:

| Guardrail | Verification Method |
|-----------|-------------------|
| No auto-send | Confirmed by smoke test 10.12 — three distinct human clicks required |
| No auto-retry | After a failed send (if tested), no automatic retry occurred; send stays `status = 'failed'` |
| State A report-only | Invoke reconciler → `stateA.reported === stateA.found`; no approval_requests were created |
| State B report-only | Same as above; no approval_requests were resolved |
| State C only supersedes siblings | If test creates a State C condition: reconciler supersedes pending drafts but does not create new ones or send email |
| Scheduled Learning Agent advisory-only | `learning_snapshots.advisory = true` for all rows created by scheduled run; verified by Supabase query |
| Operational Health read-only | No "Fix" or "Send" buttons on the health card; confirmed by visual inspection |
| Learning Agent does not mutate QRA | Before/after counts on `quality_reviews` are identical after a manual or scheduled LA run |
| Learning Agent does not mutate message copy | `message_versions.body_text` and `subject_line` unchanged after any LA run |
| No active learning / no strategy weighting | `message_strategies` rows unchanged after any LA run; signal calculation produces no writes to strategy tables |
| Phase 3A sends remain unchanged | If any Phase 3A sends exist in staging: their `email_sends.message_version_id = NULL`; no ET_ events emitted for them |

---

## 12. Failure Scenarios to Simulate Safely

Simulate these scenarios on staging to verify correct error handling before production deployment.

### 12.1 Missing Sender Identity

1. Delete or disable the `sender_identities` row for the staging tenant (or set `is_default = false`)
2. Switch to `NODE_ENV=production` in staging (add it to Vercel env for the preview)
3. Attempt to send an email via the normal Phase 3B flow
4. Expected: send fails with `reason: 'no_sender_identity_configured'`; `email_drafts.status` remains `'approved'` (draft is preserved)
5. Restore the sender identity row afterward

- [ ] Send fails gracefully with the expected reason
- [ ] No exception thrown that breaks the app
- [ ] Draft remains sendable after the identity is restored

### 12.2 Duplicate Webhook Replay

1. Find a `provider_event_id` from a recent webhook in Supabase `email_events`
2. In Resend dashboard → replay the webhook event (or manually POST with the same `Webhook-Id` header)
3. Expected: handler returns 200; logs "Duplicate event ignored"; no new `email_events` row

- [ ] Duplicate replay returns 200
- [ ] No duplicate `email_events` row
- [ ] No duplicate `activity_events` ET_ row

### 12.3 Scheduled Learning Agent with No Phase 3B Data

1. Ensure staging has a tenant and workspace but zero Phase 3B sends
2. Invoke `scheduled-learning-agent-run` in Inngest dashboard
3. Expected: `{ tenantsProcessed: 1, tenantsWithData: 0, tenantsWithError: 0, results: [{ ok: true, snapshotCount: 0, totalSends: 0 }] }`
4. Verify in Supabase: `LA_SIGNALS_COMPUTED` activity event with `metadata.signals_computed = 0`

- [ ] No error thrown
- [ ] `snapshotCount = 0` is valid — not an error state
- [ ] Agent monitor shows "No learning analysis has been run yet" or "0 signals · 0 sends analysed"

### 12.4 Operational Health Card with One Query Failing

This cannot be easily simulated without temporarily breaking a query. Instead, verify the non-fatal behavior by code inspection: all three data-loading calls in the agent monitor page are wrapped in `try { ... } catch { /* silent */ }`. If any one query fails, the fallback values (`stateA: 0, stateB: 0, count: 0, null`) are used and the page renders normally.

- [ ] Confirmed by code review: `operational-health.repo.ts` is imported and called in three separate try/catch blocks in `page.tsx`
- [ ] The agent monitor page renders the Operational Health card even if one of the three queries returns an error

### 12.5 SEB Reconciler on Clean Database

1. Invoke `reconcile-send-bridge-stuck-drafts` when no Phase 3B drafts exist in staging
2. Expected: all zeros result, no error, < 5 seconds

- [ ] Clean zero-state result returned
- [ ] No error in Inngest dashboard or Vercel logs

---

## 13. Staging Dry-Run Evidence Checklist

Capture the following evidence during the staging dry run. This evidence should be reviewed before proceeding to the production deployment planning meeting.

| Evidence Item | What to Capture | Storage |
|---------------|----------------|---------|
| Vercel preview deployment URL | The full `https://...vercel.app` URL of the staging preview | Document / Notion |
| Supabase staging project name | Project name and URL (NOT the secret keys) | Document |
| Inngest app name | Name of the Inngest app used for staging | Document |
| Resend staging webhook URL | Full webhook endpoint URL as configured in Resend | Document |
| Migration verification SQL results | Copy/paste or screenshot of the schema verification query results from Section 5.3 | Screenshot or copy-paste |
| Inngest function list | Screenshot of the 8 functions listed in Inngest dashboard | Screenshot |
| `reconcile-send-bridge-stuck-drafts` invocation result | Full JSON result from manual invocation | Copy-paste |
| `scheduled-learning-agent-run` invocation result | Full JSON result from manual invocation | Copy-paste |
| Sample ET_ activity event | One `ET_EMAIL_DELIVERED` or `ET_SEND_INITIATED` row from Supabase `activity_events` (entity_id, event_type, metadata shape) | Copy-paste |
| Sample `learning_snapshots` row | Confirm `advisory = true`, correct signal_name, correct tenant_id | Copy-paste |
| Smoke test pass/fail notes | Which items passed, which failed, and what action was taken for failures | Notes document |
| Log excerpts (Vercel) | Any unexpected errors from Vercel Function logs during the dry run | Screenshot or copy-paste |

**Do not capture or store any secret key values (API keys, signing secrets, service role keys) in the evidence document.** Only capture non-secret identifiers.

---

## 14. Go / No-Go After Staging

### 14.1 Green-Light Conditions (All Must Be True)

All of the following must be confirmed before proceeding to production deployment:

- [ ] All required environment variables confirmed in staging scope (Section 4)
- [ ] Staging Supabase URL is different from production — confirmed isolation
- [ ] All 26 migrations applied to staging in order (Section 5)
- [ ] Schema verification SQL confirms all Phase 3B and Phase 3B.1 tables and columns (Section 5.3)
- [ ] `chk_advisory_true` constraint verified on `learning_snapshots`
- [ ] Vercel preview build passes with staging env vars (Section 6)
- [ ] All 8 Inngest functions registered with correct cron schedules (Section 7.1)
- [ ] `reconcile-send-bridge-stuck-drafts` manual invocation succeeded (Section 7.2)
- [ ] `scheduled-learning-agent-run` manual invocation succeeded (Section 7.3)
- [ ] Resend webhook configured and at least one test event received (Section 8)
- [ ] Duplicate webhook replay produces no duplicate rows (Section 12.2)
- [ ] End-to-end smoke test completed (Section 10) with no unexplained failures
- [ ] All guardrails verified by observation (Section 11)
- [ ] No auto-send occurred at any point (Section 10.12)
- [ ] Evidence checklist captured (Section 13)
- [ ] All staging dry-run evidence reviewed and no open questions remain
- [ ] Rollback plan understood (see Production Deployment Readiness Checklist, Section 14)

### 14.2 No-Go Conditions (Any Single Item Stops Deployment Planning)

If any of the following conditions is found during the staging dry run, **stop** and resolve before proceeding to production:

| No-Go Condition | Why |
|----------------|-----|
| A production Supabase key (`SUPABASE_URL` or `SERVICE_ROLE_KEY`) was accidentally used in staging | Risk of corrupting production data; requires full audit of what was written |
| Any Phase 3B migration (`20240022`–`20240026`) failed or was skipped | Production schema would be incomplete; agents would fail at runtime |
| Inngest functions are missing or showing wrong cron schedules | Scheduled jobs would not run in production |
| Resend signature verification returns unexpected 401 errors | Webhooks would not be processed; Event Tracking would be non-functional |
| An email sent automatically without explicit human "Send" action | Auto-send guardrail violation; must investigate before production |
| `email_sends.message_version_id` is null after a Phase 3B send | Phase 3B.1 attribution hardening not working; FK columns not being populated |
| Learning Agent mutations appear in `quality_reviews`, `message_versions`, or `message_strategies` | Active learning guardrail violated; must stop and investigate |
| Cross-tenant data appears in Learning Agent results | Tenant isolation broken |
| Operational Health card crashes the agent monitor page | Non-fatal loading requirement violated |
| Any smoke test failure that cannot be immediately explained and resolved | Unknown production risk |

### 14.3 Partial Pass

If most items pass but a small set of non-critical items fail (e.g., the Resend webhook is not yet configured but all database and Inngest items pass), document the partial pass and the outstanding items clearly. Do not proceed to production until all items are resolved.

---

## 15. Recommended Next Step After Successful Staging

After all green-light conditions in Section 14.1 are met:

### 15.1 Capture and Review Evidence

Collect all evidence items from Section 13 into a shared document (Notion, Google Docs, or similar). Schedule a brief 15-minute review meeting with the team to walk through:
- Any failures encountered and how they were resolved
- Any gaps discovered in the production deployment readiness checklist
- Any items in the production checklist that need updating based on staging findings

### 15.2 Update Production Checklist if Needed

If the staging dry run revealed any gaps, ambiguities, or missing steps in `docs/roadmap/production-deployment-readiness-checklist-phase-3b.md`, update that document before proceeding. The production checklist is a living pre-deployment reference and should reflect everything learned in staging.

### 15.3 Proceed to Production Deployment Planning

Once the evidence is reviewed and the production checklist is confirmed complete, proceed to production deployment following the 11-step deployment order in `docs/roadmap/production-deployment-readiness-checklist-phase-3b.md`, Section 16.

### 15.4 Do Not Begin Phase 3C Before Production Readiness is Proven

The Phase 3C Active Learning Design (if/when approved) should not begin until:
- Phase 3B and Phase 3B.1 are deployed to production
- The Phase 3B + Phase 3B.1 system is running stably in production (minimum 48 hours of monitoring)
- The Learning Agent is producing advisory signals from real send data

Active learning design built on an unstable or undeployed foundation creates unnecessary complexity.

---

*Document status: Final — staging validation reference. No deployment actions, code changes, migrations, or environment changes have been performed by creating this document.*
*Version: 1.0 — 2026-05-22*
