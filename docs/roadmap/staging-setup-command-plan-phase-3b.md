# Phase 3B + Phase 3B.1 — Staging Setup Command Plan

**Document status:** Operator runbook — follow this document during staging setup.
**Version:** 1.0
**Date:** 2026-05-22
**Companion documents:**
- `docs/roadmap/staging-dry-run-checklist-phase-3b.md` — full verification checklist
- `docs/roadmap/staging-dry-run-evidence-template-phase-3b.md` — fill-in evidence capture
- `docs/roadmap/production-deployment-readiness-checklist-phase-3b.md` — production readiness reference

---

## 1. Executive Summary

Phase 3B and Phase 3B.1 are **locked**. All code is committed and QA-verified (646/646 tests, build clean).

This document is a **staging setup runbook** — a step-by-step sequence for an operator to set up the staging environment, apply migrations, register services, run the smoke test, and capture evidence. It is the practical companion to the staging dry-run checklist.

**This document does not perform any deployment or configuration change by itself.** Every step requires explicit human action. Reading this document changes nothing.

**Estimated time to complete:** 60–120 minutes (first-time setup); 30–45 minutes (subsequent dry runs against an existing staging environment).

---

## 2. Safety Rules

Read and confirm before starting. These rules are non-negotiable.

| Rule | Why |
|------|-----|
| ❌ Never use production Supabase keys in staging | A wrong service role key writes to production; data cannot be recovered |
| ❌ Never use the production Resend API key in staging | Staging sends would arrive in real customer inboxes |
| ❌ Never register preview and production Inngest endpoints in the same Inngest app without explicit approval | Cron jobs from the preview deployment would run against production tenant data |
| ❌ Never use real customer email addresses for staging sends | Personal data risk; customer trust |
| ❌ Never paste secrets (API keys, signing secrets, service role keys) into documentation, Git commits, Claude, ChatGPT, Slack messages, or screenshots | Secrets in plaintext are irrecoverable once exposed |

**Before continuing:** Confirm with the team that you have access to staging (not production) credentials for Supabase, Inngest, and Resend.

---

## 3. Required Accounts / Dashboards

Open these in your browser before starting:

| System | Dashboard URL | What you need access to |
|--------|--------------|------------------------|
| **GitHub** | github.com | Repository — to push branch and trigger preview builds |
| **Vercel** | vercel.com | Project → Settings → Environment Variables; Deployments |
| **Supabase** | supabase.com | Staging project → Settings → API; SQL Editor |
| **Inngest** | inngest.com | Apps → staging/dev app; Functions; Runs |
| **Resend** | resend.com | API Keys; Webhooks |

If you do not have access to any of the above, stop and obtain access before continuing.

---

## 4. Step 1 — Confirm Repo Baseline

Open a PowerShell terminal in the project root (`C:\Projects\verian-bios`) and run:

```powershell
# Confirm working tree is clean
git status --short
```
**Expected:** No output (or only untracked doc files). If modified application files are shown, stop and resolve before continuing.

```powershell
# Confirm HEAD commit
git log --oneline -10
```
**Expected first line:** `0af660e Phase 3B.1: implement Stabilization Hardening foundation` (or a later commit that includes all Phase 3B.1 changes).

```powershell
# Confirm Phase 3B tags are present
git tag --list "phase-3b*"
```
**Expected output includes:**
```
phase-3b-copywriting-agent-v1
phase-3b-event-tracking-v1
phase-3b-human-review-bridge-v1
phase-3b-learning-agent-v1
phase-3b-message-strategy-agent-v1
phase-3b-quality-review-agent-v1
phase-3b-quality-review-agent-v1.1
phase-3b-revenue-learning-engine-foundation-v1
phase-3b-revenue-learning-engine-foundation-v1.1
phase-3b-send-bridge-v1
phase-3b1-stabilization-v1
```

```powershell
# Confirm tests still pass locally before any staging work
npx vitest run
```
**Expected:** `646/646 tests passed`, 0 failures.

```powershell
# Confirm build is clean
npx next build
```
**Expected:** `✓ Compiled successfully`

**Record all results in the evidence template** (`docs/roadmap/staging-dry-run-evidence-template-phase-3b.md`, Section 2).

---

## 5. Step 2 — Identify or Create Staging Supabase Project

### 5.1 If a staging project already exists

1. Open Supabase → your staging project → **Settings → API**
2. Note the **Project URL** (e.g., `https://xyzabcdef.supabase.co`)
3. **Confirm it differs from the production URL** — if they are the same, stop immediately
4. Record the project name and URL in the evidence template (Section 1) — these are not secrets

### 5.2 If no staging project exists

1. In Supabase dashboard → **New project**
2. Name it clearly, e.g., `verian-bios-staging`
3. Choose a region close to your team
4. Set a database password — store it securely in your password manager, not in any doc
5. Wait for provisioning (1–2 minutes)
6. After provisioning: **Settings → API** → copy Project URL (non-secret), note anon key and service role key locations

### 5.3 Credential locations (Supabase)

| Variable | Where to find it | Notes |
|----------|----------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL | Safe to share; prefix `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon/public key | Safe in browser context |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role key | **Never expose to browser; never paste in docs** |

**Record in evidence template:** Staging project name, staging project URL (non-secret). Do not record key values.

---

## 6. Step 3 — Apply Staging Migrations

### 6.1 Check current migration state

In Supabase → staging project → **SQL Editor**, run:

```sql
SELECT
  to_regclass('public.message_strategies')  AS strategies,
  to_regclass('public.message_versions')    AS versions,
  to_regclass('public.quality_reviews')     AS quality_reviews,
  to_regclass('public.learning_snapshots')  AS learning_snapshots;
```

- If all four return non-null values → Phase 3B migrations are applied; skip to 6.3 to verify Phase 3B.1
- If any return null → continue to 6.2

### 6.2 Apply all migrations

**Preferred — Supabase CLI:**

```powershell
# Link to the staging project (run once; follow the prompts)
npx supabase link --project-ref <STAGING_PROJECT_REF>

# Push all pending migrations
npx supabase db push
```

Replace `<STAGING_PROJECT_REF>` with your staging project's reference ID (found in Supabase → Settings → General → Reference ID).

**Alternative — SQL Editor (if CLI is not configured):**

Open each migration file in `supabase/migrations/` in numeric order and execute it in the Supabase SQL Editor for the staging project. Do NOT skip files. Order is `20240001` → `20240002` → ... → `20240026`.

### 6.3 Verify Phase 3B.1 columns and indexes

In Supabase → SQL Editor, run each of the following and paste the output into the evidence template (Section 4):

```sql
-- Phase 3B.1: FK columns on email_sends
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'email_sends'
  AND column_name IN ('message_version_id', 'strategy_id')
ORDER BY column_name;
-- Expected: 2 rows; data_type = 'uuid'; is_nullable = 'YES'
```

```sql
-- Phase 3B.1: Partial indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'email_sends'
  AND indexname IN ('idx_email_sends_message_version', 'idx_email_sends_strategy');
-- Expected: 2 rows
```

```sql
-- Learning Agent advisory constraint
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name = 'chk_advisory_true';
-- Expected: 1 row, check_clause contains 'advisory = true'
```

```sql
-- Ancillary tables
SELECT
  to_regclass('public.activity_events')   AS activity_events,
  to_regclass('public.email_events')      AS email_events,
  to_regclass('public.webhook_events')    AS webhook_events,
  to_regclass('public.approval_requests') AS approval_requests;
-- Expected: all non-null
```

**Record all results** in evidence template Section 4. If any check fails, do not proceed — recheck the migration application.

---

## 7. Step 4 — Create Staging Tenant / Workspace / Sender Identity

### 7.1 Sign in to the staging app

After the Vercel preview is deployed (Step 6), sign in to the staging app with your user account. Supabase auth will create the necessary auth user row. A tenant and membership may auto-create on first login depending on the signup flow.

If no tenant auto-creates, insert minimal staging data directly in the Supabase SQL Editor:

```sql
-- Example: verify a tenant exists after first login
SELECT id, name FROM tenants ORDER BY created_at DESC LIMIT 5;
```

Note the staging tenant UUID for the evidence template.

### 7.2 Create a test workspace

In the staging app UI → workspace selector → create a new workspace named `staging-test` (or equivalent). Note the workspace UUID:

```sql
SELECT id, name, tenant_id FROM workspaces ORDER BY created_at DESC LIMIT 5;
```

### 7.3 Create sender identity for staging

A `sender_identities` row is required for email sending in production mode (Vercel sets `NODE_ENV = production` in all deployments, including previews). Without it, sends will fail with `no_sender_identity_configured`.

Insert a staging sender identity using a safe test address. In Supabase SQL Editor:

```sql
-- Replace tenant_id with your staging tenant UUID
-- Use onboarding@resend.dev for Resend test sends, or a personal/team test address
INSERT INTO sender_identities (tenant_id, name, email, is_default, is_verified, status)
VALUES (
  '<STAGING_TENANT_UUID>',
  'Verian BIOS Staging',
  'onboarding@resend.dev',
  true,
  true,
  'verified'
);
```

**Confirm:**
```sql
SELECT id, name, email, is_default, tenant_id
FROM sender_identities
WHERE tenant_id = '<STAGING_TENANT_UUID>';
-- Expected: 1 row with is_default = true
```

### 7.4 Create a test lead and contact

In the staging app UI → Leads → Add Lead. Use a controlled test email address (your own or a staging inbox) as the contact email. **Do not use real customer email addresses.**

Note the lead UUID and contact UUID for the smoke test (Step 9).

---

## 8. Step 5 — Configure Vercel Preview Environment Variables

1. Open Vercel → your project → **Settings → Environment Variables**
2. For each variable below, add or update the value in the **Preview** scope only
3. **Do not change Production scope values**

| Variable | Scope | Source | Action |
|----------|-------|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Preview | Supabase staging project → Settings → API → Project URL | Add/update |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview | Supabase staging project → Settings → API → anon/public | Add/update |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview | Supabase staging project → Settings → API → service_role | Add/update (never expose to browser) |
| `INNGEST_EVENT_KEY` | Preview | Inngest staging/dev app → Settings → Event key | Add/update |
| `INNGEST_SIGNING_KEY` | Preview | Inngest staging/dev app → Settings → Signing key | Add/update |
| `RESEND_API_KEY` | Preview | Resend → API Keys → staging/test key | Add/update |
| `RESEND_WEBHOOK_SECRET` | Preview | Resend → Webhooks → staging webhook → Signing secret (after Step 8) | Add after Step 8 |
| `NEXT_PUBLIC_APP_URL` | Preview | Vercel preview URL (from Step 6 after first deploy) | Add/update after Step 6 |
| `NEXT_PUBLIC_APP_NAME` | Preview | `Verian BIOS` | Optional; add if needed |
| `INTAKE_API_KEY` | Preview | Internal — only if intake is tested | Conditional |
| `INTAKE_TENANT_ID` | Preview | Staging tenant UUID from Step 4 | Conditional |
| `INTAKE_WORKSPACE_ID` | Preview | Staging workspace UUID from Step 4 | Conditional |
| `CALENDLY_LINK` | Preview | Staging team Calendly or fallback | Conditional |
| `SALES_EMAIL` | Preview | Staging team email | Conditional |

**Critical rule:** All variables above must be scoped to **Preview** (or a named staging environment), not to **Production**. Double-check the scope selector in Vercel before saving.

**After adding variables:** Do NOT redeploy yet — do Step 6 first to get the preview URL, then add `NEXT_PUBLIC_APP_URL`, then redeploy.

---

## 9. Step 6 — Deploy Vercel Preview

### 9.1 Trigger the preview deployment

Push the current branch to GitHub. Vercel will automatically create a preview deployment:

```powershell
# Push the current branch (use your actual branch name)
git push origin master
```

Or, if working from a feature branch:

```powershell
git push origin staging-validation
```

### 9.2 Capture the preview URL

1. Open Vercel → **Deployments**
2. Find the most recent preview deployment
3. Wait for status: **Ready**
4. Copy the preview URL (e.g., `https://verian-bios-git-master-[team].vercel.app`)
5. Record the URL in the evidence template (Section 1 and Section 5)

### 9.3 Set `NEXT_PUBLIC_APP_URL`

Now that you have the preview URL:

1. In Vercel → **Settings → Environment Variables**
2. Set `NEXT_PUBLIC_APP_URL` = `https://[your-preview-url]` (no trailing slash)
3. Scope: **Preview only**

### 9.4 Redeploy with the updated env var

Any environment variable change in Vercel requires a redeploy to take effect:

1. In Vercel → **Deployments** → find your preview → click **Redeploy**
2. Wait for **Ready** status again
3. Confirm the build passes with 0 errors in the build log

### 9.5 Quick validation

Open the preview URL in a browser:

- [ ] App loads without a white screen or 500 error
- [ ] Login page appears

If the app fails to load, check Vercel → Deployments → [your deployment] → **Function Logs** for errors. Common causes: `NEXT_PUBLIC_SUPABASE_URL` missing or wrong, `SUPABASE_SERVICE_ROLE_KEY` wrong format.

---

## 10. Step 7 — Register Inngest Staging Endpoint

### 10.1 Open Inngest dashboard

Navigate to [inngest.com](https://inngest.com) → your staging/dev Inngest app.

> **⚠️ Warning:** If you use the same Inngest app for both production and preview deployments, both will have active cron jobs. This means `scheduled-learning-agent-run` would run against production tenant data from the preview endpoint, and against staging tenant data from the production endpoint — potentially double-firing. Use a separate Inngest app for staging, or accept this behavior consciously and monitor Inngest runs carefully.

### 10.2 Sync the staging endpoint

1. In Inngest dashboard → **Apps** → your staging app
2. Click **Sync** (or **Add App** if first time)
3. Enter the staging endpoint URL:
   ```
   https://[your-preview-url]/api/inngest
   ```
4. Click **Connect** or **Sync**
5. Wait for Inngest to load the function list from the endpoint

### 10.3 Verify all 8 functions are registered

In Inngest → **Functions**, confirm all 8 functions appear:

| # | Function ID | Cron (if applicable) |
|---|-------------|---------------------|
| 1 | `dispatch-outbox` | — |
| 2 | `on-lead-created` | — |
| 3 | `on-approval-approved` | — |
| 4 | `on-approval-rejected` | — |
| 5 | `reconcile-email-draft-status` | `*/5 * * * *` |
| 6 | `on-statement-received` | — |
| 7 | `reconcile-send-bridge-stuck-drafts` | `*/15 * * * *` |
| 8 | `scheduled-learning-agent-run` | `0 6 * * *` |

If any function is missing, check that:
- The preview deployment is "Ready" (not still building)
- `INNGEST_EVENT_KEY` is configured in the Preview env scope
- The Inngest app's endpoint URL matches exactly (no trailing slash)

### 10.4 Manually invoke `reconcile-send-bridge-stuck-drafts`

1. In Inngest → **Functions** → `reconcile-send-bridge-stuck-drafts` → **Invoke**
2. Leave the payload empty (`{}` or blank)
3. Click **Invoke**
4. Wait for the run to complete (should be < 10 seconds)
5. Click the completed run to view the output JSON
6. **Copy the full JSON result** and paste it into the evidence template (Section 6.3)

**Expected result on a clean staging database:**
```json
{
  "stateA": { "found": 0, "reported": 0 },
  "stateB": { "found": 0, "reported": 0 },
  "stateC": { "found": 0, "fixed": 0, "errors": 0 },
  "ranAt": "2026-05-22T..."
}
```

If `stateC.errors > 0`, check Inngest run logs for details before continuing.

### 10.5 Manually invoke `scheduled-learning-agent-run`

Only invoke this after completing Step 4 (staging tenant and workspace exist):

1. In Inngest → **Functions** → `scheduled-learning-agent-run` → **Invoke**
2. Leave the payload empty
3. Click **Invoke**
4. Wait for the run (10–30 seconds depending on tenant count)
5. Copy the full JSON result and paste it into the evidence template (Section 6.4)

**Expected result with one staging tenant and no Phase 3B sends:**
```json
{
  "tenantsProcessed": 1,
  "tenantsWithData": 0,
  "tenantsWithError": 0,
  "results": [
    {
      "tenantId": "<staging-tenant-uuid>",
      "workspaceId": "<staging-workspace-uuid>",
      "ok": true,
      "snapshotCount": 0,
      "totalSends": 0
    }
  ]
}
```

Then verify in Supabase → staging `activity_events`:
```sql
SELECT event_type, occurred_at, metadata->>'triggered_by' AS triggered_by
FROM activity_events
WHERE event_type IN ('LA_SIGNALS_COMPUTED', 'LA_SIGNALS_COMPUTATION_FAILED')
ORDER BY occurred_at DESC
LIMIT 5;
```
**Expected:** `LA_SIGNALS_COMPUTED` row with `triggered_by = 'scheduled:inngest'`.

---

## 11. Step 8 — Configure Resend Staging Webhook

### 11.1 Create the staging webhook in Resend

1. Open Resend → **Webhooks** → **Add Webhook**
2. Enter the staging webhook URL:
   ```
   https://[your-preview-url]/api/webhooks/resend
   ```
3. Enable all event types:
   - `email.delivered`
   - `email.bounced`
   - `email.complained`
   - `email.failed`
   - `email.opened`
   - `email.clicked`
   - `email.delivery_delayed` *(optional — handler accepts but produces no ET_ event)*
4. Click **Create**

### 11.2 Copy the signing secret

After webhook creation, Resend shows a **Signing Secret** (format: `whsec_...`).

1. Copy the signing secret immediately — it may not be shown again
2. Store it temporarily in your password manager or a secure local notepad
3. **Do not paste it into this document, the evidence template, Slack, email, or any other plaintext location**

### 11.3 Add `RESEND_WEBHOOK_SECRET` to Vercel preview env vars

1. Open Vercel → Settings → Environment Variables
2. Add `RESEND_WEBHOOK_SECRET` = `[the signing secret from Resend]`
3. Scope: **Preview only**
4. Save

### 11.4 Redeploy the preview

```powershell
# Trigger a redeploy by making a no-op commit, OR use Vercel dashboard Redeploy button
# Option A: Use Vercel dashboard — Deployments → [latest] → Redeploy
# Option B: Empty commit
git commit --allow-empty -m "chore: trigger staging redeploy"
git push origin master
```

Wait for the new preview deployment to reach **Ready** status.

### 11.5 Send a test webhook event

In Resend → **Webhooks** → your staging webhook → **Send Test Event**:

1. Select event type: `email.delivered`
2. Click **Send**
3. The handler will return 200 (check Vercel function logs if not)

**Verify in Supabase staging `webhook_events`:**
```sql
SELECT id, event_type, source, processed
FROM webhook_events
ORDER BY created_at DESC
LIMIT 3;
```
**Expected:** A new row with `source = 'resend'`, `event_type = 'email.delivered'`, `processed = true`.

**Record webhook URL and delivery result** in evidence template (Section 7).

### 11.6 Test duplicate webhook replay

In Resend → Webhooks → your staging webhook → find the test event just sent → click **Resend** (replay):

1. The handler should still return 200
2. Check Vercel logs for: `[resend-webhook] Duplicate event ignored: <provider_event_id>`
3. Check Supabase `webhook_events` — only ONE row for that `provider_event_id`

---

## 12. Step 9 — Run Staging Smoke Test

Work through the complete end-to-end Phase 3B flow in the staging app. Use the test lead and contact created in Step 4.

Open the staging app at the preview URL and follow this sequence:

| # | Step | Action | Expected |
|---|------|--------|----------|
| 1 | Login | Sign in with your account | Auth succeeds; workspace selector appears |
| 2 | Workspace | Open the staging workspace | Dashboard loads |
| 3 | Leads | Open the test lead | Lead detail page loads |
| 4 | Message Workspace | Navigate to message workspace for test lead | Workspace UI loads |
| 5 | Strategy (MSA) | Click "Generate Strategy" (or verify existing) | `message_strategies` row created; strategy card shows |
| 6 | Versions (CA) | Click "Generate Versions" (or verify existing) | 2–4 version cards appear |
| 7 | Quality Review (QRA) | Click "Quality Review" (or verify existing) | Scores, score bands, recommended badge appear |
| 8 | Approve (HRB) | Click Approve on one version | Version moves to `approved` status; no send occurs |
| 9 | Create Draft (SEB) | Click "Create Email Draft" → confirm modal → confirm | Draft created; no email sent; "Send" button appears separately |
| 10 | Verify no auto-send | Check that no email was sent after step 8 and step 9 | `email_sends` table has 0 rows for this draft (until step 11) |
| 11 | Send (optional) | Click "Send" button explicitly | Email queued; `email_sends` row created with non-null `message_version_id` |
| 12 | Verify FK attribution | Check Supabase `email_sends` | `message_version_id` and `strategy_id` are non-null |
| 13 | Webhook outcome | After Resend delivers and fires webhook | ET_ activity event in `activity_events` |
| 14 | Learning Agent | Click "Run Learning Analysis" on agent monitor | Learning signals computed; `learning_snapshots` rows written |
| 15 | Operational Health | View agent monitor page | Operational Health card shows stuck counts, failed sends, LA run status |

**Abort conditions — stop and investigate if any of these occur:**
- An email is sent without clicking the "Send" button (auto-send violation)
- `email_sends.message_version_id` is null after a Phase 3B send (FK attribution broken)
- `message_strategies`, `quality_reviews`, or `message_versions` change after a Learning Agent run (guardrail violation)
- The agent monitor page crashes (non-fatal loading requirement violated)

For each smoke test step, record Pass / Fail / Notes in the evidence template (Section 8).

---

## 13. Step 10 — Fill Evidence Template

### 13.1 Complete the evidence template

Open `docs/roadmap/staging-dry-run-evidence-template-phase-3b.md` and fill in all sections:

| Template Section | What to fill |
|-----------------|-------------|
| Section 1 (Metadata) | Preview URL, project names, UUIDs — no secrets |
| Section 2 (Baseline) | Git output, vitest result, build result |
| Section 3 (Env Vars) | Configured/Not-configured for each variable |
| Section 4 (Migration) | Paste SQL query results |
| Section 5 (Vercel) | Deployment URL, build status, env scope verification |
| Section 6 (Inngest) | Function checklist, invocation results (full JSON) |
| Section 7 (Resend) | Webhook configuration, test event result |
| Section 8 (Smoke Test) | Pass/Fail/Notes for each step |
| Section 9 (Guardrails) | Observed guardrail behavior |
| Section 10 (Issues Log) | All issues found, severity, resolution |
| Section 11 (Go/No-Go) | Overall result, follow-ups, signoff |
| Section 12 (Recommendation) | Final recommendation |

### 13.2 What to capture vs what to omit

| Capture | Do not capture |
|---------|---------------|
| Project names, UUIDs, URLs | API keys, signing secrets, service role keys |
| SQL query output (non-sensitive rows) | Database passwords |
| Inngest run result JSON | Supabase connection strings with embedded credentials |
| Vercel deployment URL | Vercel personal access tokens |
| Pass/fail results and notes | Any `whsec_` or `sk_` prefixed values |

### 13.3 Share the completed evidence template

After filling in all sections, share the completed template with the team via your standard document sharing tool (Notion, Google Docs, Confluence, etc.). Do not commit a completed evidence template to Git if it contains UUIDs that could identify customers or internal systems — share it through an access-controlled channel instead.

---

## 14. Step 11 — Go / No-Go Review

### 14.1 Green-light conditions (all must be true to proceed)

After completing Steps 1–10, confirm each:

- [ ] Repo baseline confirmed at `0af660e` or later; 646/646 tests pass locally
- [ ] Staging Supabase URL differs from production — confirmed
- [ ] All 26 migrations applied; schema verified by SQL queries
- [ ] Phase 3B.1 FK columns, indexes, and advisory constraint confirmed
- [ ] Vercel preview build passed with staging env vars
- [ ] All 8 Inngest functions registered with correct cron schedules
- [ ] `reconcile-send-bridge-stuck-drafts` invocation succeeded (result captured)
- [ ] `scheduled-learning-agent-run` invocation succeeded (result captured)
- [ ] Resend webhook configured and test event delivered (200 response)
- [ ] Duplicate webhook replay produced no duplicate row
- [ ] End-to-end smoke test completed with no unexplained failures
- [ ] No auto-send occurred at any point
- [ ] `email_sends.message_version_id` non-null after Phase 3B send (if send was tested)
- [ ] All guardrails verified by observation
- [ ] Evidence template fully completed
- [ ] No production keys accidentally used in staging

### 14.2 No-go conditions — stop if any of these is true

| No-Go Condition | Action |
|----------------|--------|
| Production Supabase URL used in staging | Stop immediately; audit what was written to production; rotate service role key |
| Any Phase 3B migration failed or was skipped | Reapply migrations in order; re-verify schema |
| Fewer than 8 Inngest functions registered | Check env vars (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`); redeploy; re-sync |
| Resend webhook returns 401 | Check `RESEND_WEBHOOK_SECRET` matches Resend signing secret; redeploy preview |
| Email sent automatically without explicit "Send" click | Stop; escalate to development team — auto-send guardrail violated |
| `email_sends.message_version_id` null after Phase 3B send | Stop; check env vars, migration `20240026`, and email-send service code |
| Learning Agent mutates `quality_reviews`, `message_versions`, or `message_strategies` | Stop; escalate to development team — active learning guardrail violated |
| Cross-tenant data appears in `scheduled-learning-agent-run` results | Stop; audit tenant isolation in Learning Agent service |
| Agent monitor page crashes | Check Vercel function logs; fix non-fatal loading in operational-health.repo.ts |
| Any smoke test step fails with an unexplained error | Investigate before proceeding; document in Issues Log |

### 14.3 After a passing dry run

1. Confirm the evidence template is complete and shared with the team
2. Review any items discovered that were not in the production deployment readiness checklist — update that document if needed
3. Proceed to production deployment planning using `docs/roadmap/production-deployment-readiness-checklist-phase-3b.md`, following the 11-step deployment sequence in Section 16 of that document

### 14.4 After a failing dry run

1. Document all failures in the evidence template Section 10 (Issues Log)
2. Categorize each issue by severity (Critical / High / Medium / Low)
3. Resolve all Critical and High issues
4. For code-level issues: create a fix, run tests locally, get the fix into the locked codebase
5. For configuration issues: correct the env vars, migration, or Inngest/Resend settings
6. Re-run the relevant sections of this runbook after fixes are applied
7. Do not attempt production deployment until all Critical and High issues are resolved

---

## 15. Final Recommendation

**Complete this runbook fully before beginning production deployment planning.**

Local test results (646/646 passing, clean build) confirm code correctness, not environment correctness. The staging dry run is the bridge between local validation and production confidence. Skipping it or running it partially creates unnecessary risk for the first production deployment.

**Time investment:** 60–120 minutes for a first-time staging setup. This is significantly less than the time required to diagnose and recover from a production misconfiguration.

**After the staging dry run passes:** The team has concrete evidence that:
- All required environment variables work correctly with the actual Supabase, Inngest, and Resend services
- All 26 migrations apply successfully and the schema is correct
- All 8 Inngest functions register and can be invoked
- The Resend webhook is received, verified, and produces the correct DB side effects
- The Phase 3B pipeline (MSA → CA → QRA → HRB → SEB → ET → LA) works end-to-end on real infrastructure
- Phase 3B.1 FK attribution, SEB reconciler, scheduled Learning Agent, and Operational Health card all function correctly
- No guardrail violations occur in the live system
- Rollback paths are understood

This evidence, captured in the completed evidence template, is the concrete basis for production deployment approval.

---

*Document status: Final — operator runbook for staging setup and dry run.*
*Version: 1.0 — 2026-05-22*
