# Phase 3B + Phase 3B.1 — Staging Dry-Run Evidence Template

**Document status:** Fill-in template — complete during staging dry run.
**Version:** 1.0
**Reference:** `docs/roadmap/staging-dry-run-checklist-phase-3b.md`

> **Security reminder:** Do NOT paste API keys, signing secrets, service role keys, or any other secret values into this document. Capture only non-secret identifiers (project names, URLs, UUIDs, SQL output rows) as evidence.

---

## 1. Header / Metadata

| Field | Value |
|-------|-------|
| Dry-run date | ` ` |
| Reviewer / operator | ` ` |
| Git commit tested (SHA) | ` ` |
| Branch tested | ` ` |
| Vercel preview URL | ` ` |
| Supabase staging project name | ` ` |
| Supabase staging project ID | ` ` |
| Inngest staging app name | ` ` |
| Resend staging webhook URL | ` ` |
| Staging tenant UUID | ` ` |
| Staging workspace UUID | ` ` |
| Staging test user email | ` ` |

---

## 2. Baseline Verification

### 2.1 Local Baseline

| Check | Result | Notes |
|-------|--------|-------|
| `git status` | ` ` | Should be "nothing to commit, working tree clean" |
| `git log --oneline -1` | ` ` | Should show `0af660e Phase 3B.1: implement...` or later |
| `git tag -l \| grep phase-3b` | ` ` | Should include `phase-3b1-stabilization-v1` |
| `npx vitest run` | ` ` | Expected: 646/646 passed |
| `npx next build` | ` ` | Expected: ✓ Compiled successfully |
| TypeScript | ` ` | Expected: 0 errors |

### 2.2 Baseline Notes

```
[Paste any relevant baseline output or notes here]
```

---

## 3. Environment Variables Verification

**Instruction:** For each variable, confirm it is set in the Vercel **Preview** (staging) scope. Do not paste the actual values — only confirm configured/not configured and note any issues.

| Variable | Configured? | Scope | Validation Result | Notes |
|----------|------------|-------|------------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ☐ Yes ☐ No | ` ` | ` ` | Must differ from production URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ☐ Yes ☐ No | ` ` | ` ` | ` ` |
| `SUPABASE_SERVICE_ROLE_KEY` | ☐ Yes ☐ No | ` ` | ` ` | Must NOT be prefixed `NEXT_PUBLIC_` |
| `INNGEST_EVENT_KEY` | ☐ Yes ☐ No | ` ` | ` ` | ` ` |
| `INNGEST_SIGNING_KEY` | ☐ Yes ☐ No | ` ` | ` ` | Required for request verification |
| `RESEND_API_KEY` | ☐ Yes ☐ No | ` ` | ` ` | Use staging/test key only |
| `RESEND_WEBHOOK_SECRET` | ☐ Yes ☐ No | ` ` | ` ` | Must match Resend staging webhook |
| `NEXT_PUBLIC_APP_URL` | ☐ Yes ☐ No | ` ` | ` ` | Must be staging/preview URL |
| `NEXT_PUBLIC_APP_NAME` | ☐ Yes ☐ No ☐ N/A | ` ` | ` ` | Optional; defaults to "Verian BIOS" |
| `INTAKE_API_KEY` | ☐ Yes ☐ No ☐ Not tested | ` ` | ` ` | ` ` |
| `INTAKE_TENANT_ID` | ☐ Yes ☐ No ☐ Not tested | ` ` | ` ` | Must be staging tenant UUID |
| `INTAKE_WORKSPACE_ID` | ☐ Yes ☐ No ☐ Not tested | ` ` | ` ` | Must be staging workspace UUID |
| `CALENDLY_LINK` | ☐ Yes ☐ No ☐ Not tested | ` ` | ` ` | ` ` |
| `SALES_EMAIL` | ☐ Yes ☐ No ☐ Not tested | ` ` | ` ` | ` ` |

### 3.1 Critical Isolation Check

| Check | Result |
|-------|--------|
| Staging `NEXT_PUBLIC_SUPABASE_URL` ≠ Production URL | ☐ Confirmed different ☐ **SAME — STOP** |
| Staging `SUPABASE_SERVICE_ROLE_KEY` ≠ Production service role key | ☐ Confirmed different ☐ **SAME — STOP** |
| Staging `RESEND_API_KEY` is test/staging key (not production sending key) | ☐ Confirmed ☐ **Production key — STOP** |

If any row shows **STOP**, halt the dry run and correct the environment variable configuration before continuing.

### 3.2 Environment Variable Notes

```
[Paste any relevant notes, errors, or validation results here — no secret values]
```

---

## 4. Supabase Migration Evidence

### 4.1 Migration State Check

Paste the output of the migration state query (or equivalent check) below:

```sql
-- Paste result here (non-secret — just table names / migration names)
```

### 4.2 Phase 3B Table Existence

Paste the output of the Phase 3B table check query:

```sql
-- Expected: all four values non-null
-- SELECT
--   to_regclass('public.message_strategies') AS strategies,
--   to_regclass('public.message_versions') AS versions,
--   to_regclass('public.quality_reviews') AS quality_reviews,
--   to_regclass('public.learning_snapshots') AS learning_snapshots;
```

**Paste result:**
```
[Output here]
```

| Table | Exists? |
|-------|--------|
| `message_strategies` | ☐ Yes ☐ No |
| `message_versions` | ☐ Yes ☐ No |
| `quality_reviews` | ☐ Yes ☐ No |
| `learning_snapshots` | ☐ Yes ☐ No |

### 4.3 Ancillary Tables

| Table | Exists? |
|-------|--------|
| `activity_events` | ☐ Yes ☐ No |
| `email_events` | ☐ Yes ☐ No |
| `webhook_events` | ☐ Yes ☐ No |
| `approval_requests` | ☐ Yes ☐ No |
| `email_drafts` | ☐ Yes ☐ No |
| `email_sends` | ☐ Yes ☐ No |

### 4.4 Phase 3B.1 Columns on `email_sends`

Paste the output of the column verification query:

```sql
-- Expected: 2 rows; data_type = 'uuid'; is_nullable = 'YES'
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'email_sends'
--   AND column_name IN ('message_version_id', 'strategy_id')
-- ORDER BY column_name;
```

**Paste result:**
```
[Output here — no secret data in this result]
```

| Column | Exists? | Type | Nullable |
|--------|--------|------|---------|
| `email_sends.message_version_id` | ☐ Yes ☐ No | ` ` | ` ` |
| `email_sends.strategy_id` | ☐ Yes ☐ No | ` ` | ` ` |

### 4.5 Phase 3B.1 Partial Indexes

Paste the output of the index check query:

```sql
-- Expected: 2 rows
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'email_sends'
--   AND indexname IN ('idx_email_sends_message_version', 'idx_email_sends_strategy');
```

**Paste result:**
```
[Output here]
```

| Index | Exists? |
|-------|--------|
| `idx_email_sends_message_version` | ☐ Yes ☐ No |
| `idx_email_sends_strategy` | ☐ Yes ☐ No |

### 4.6 `learning_snapshots` Advisory Constraint

Paste the output of the constraint check:

```sql
-- Expected: 1 row, check_clause = '(advisory = true)'
-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_schema = 'public'
--   AND constraint_name = 'chk_advisory_true';
```

**Paste result:**
```
[Output here]
```

| Constraint | Exists? | Clause correct? |
|-----------|--------|----------------|
| `chk_advisory_true` | ☐ Yes ☐ No | ☐ Yes (`(advisory = true)`) ☐ No |

### 4.7 Sender Identity for Staging Tenant

| Check | Result |
|-------|--------|
| `sender_identities` row exists for staging tenant with `is_default = true` | ☐ Yes ☐ No ☐ Not needed (non-production mode) |
| Email address in sender identity | ` ` (non-secret — e.g., `onboarding@resend.dev`) |

### 4.8 Migration Notes

```
[Any migration errors, warnings, or notes here]
```

---

## 5. Vercel Preview Evidence

| Field | Value |
|-------|-------|
| Deployment URL | ` ` |
| Deployment status | ☐ Ready ☐ Error ☐ Building |
| Build status | ☐ Passed (0 errors) ☐ Failed |
| Env vars scoped to Preview (not Production) | ☐ Confirmed ☐ Issue found |
| Vercel function logs reviewed | ☐ Yes ☐ No |
| Unexpected errors in logs | ☐ None ☐ Yes — see notes |
| `NEXT_PUBLIC_APP_URL` value in preview | ` ` |

### 5.1 Vercel Build Log Excerpt (if errors found)

```
[Paste relevant build log lines here — no secret values]
```

### 5.2 Vercel Preview Notes

```
[Any notes about the preview deployment]
```

---

## 6. Inngest Evidence

### 6.1 Registered Functions

| Function ID | Registered? | Cron Schedule (if applicable) | Notes |
|-------------|-----------|------------------------------|-------|
| `dispatch-outbox` | ☐ Yes ☐ No | Event-driven | ` ` |
| `on-lead-created` | ☐ Yes ☐ No | Event-driven | ` ` |
| `on-approval-approved` | ☐ Yes ☐ No | Event-driven | ` ` |
| `on-approval-rejected` | ☐ Yes ☐ No | Event-driven | ` ` |
| `reconcile-email-draft-status` | ☐ Yes ☐ No | `*/5 * * * *` | ` ` |
| `on-statement-received` | ☐ Yes ☐ No | Event-driven | ` ` |
| `reconcile-send-bridge-stuck-drafts` | ☐ Yes ☐ No | `*/15 * * * *` | ` ` |
| `scheduled-learning-agent-run` | ☐ Yes ☐ No | `0 6 * * *` | ` ` |

**Total functions registered:** ` ` / 8 expected

### 6.2 Cron Schedule Verification

| Function | Expected Cron | Actual Cron Shown in Dashboard | Match? |
|----------|--------------|-------------------------------|--------|
| `reconcile-email-draft-status` | `*/5 * * * *` | ` ` | ☐ Yes ☐ No |
| `reconcile-send-bridge-stuck-drafts` | `*/15 * * * *` | ` ` | ☐ Yes ☐ No |
| `scheduled-learning-agent-run` | `0 6 * * *` | ` ` | ☐ Yes ☐ No |

### 6.3 `reconcile-send-bridge-stuck-drafts` Manual Invocation Result

Paste the full JSON result from the Inngest manual invocation:

```json
{
  "stateA": { "found": 0, "reported": 0 },
  "stateB": { "found": 0, "reported": 0 },
  "stateC": { "found": 0, "fixed": 0, "errors": 0 },
  "ranAt": "REPLACE_WITH_ACTUAL"
}
```

**Replace the above with the actual output. Expected values for a clean database: all zeros.**

| Check | Result |
|-------|--------|
| Run completed without error | ☐ Yes ☐ No |
| `stateA.errors` = 0 | ☐ Yes ☐ No |
| `stateB.errors` = 0 | ☐ Yes ☐ No |
| `stateC.errors` = 0 | ☐ Yes ☐ No |
| No unexpected `found` counts | ☐ Yes ☐ No — see notes |

### 6.4 `scheduled-learning-agent-run` Manual Invocation Result

Paste the full JSON result:

```json
{
  "tenantsProcessed": 0,
  "tenantsWithData": 0,
  "tenantsWithError": 0,
  "results": []
}
```

**Replace the above with the actual output.**

| Check | Result |
|-------|--------|
| Run completed without error | ☐ Yes ☐ No |
| `tenantsWithError` = 0 | ☐ Yes ☐ No |
| All result items have `ok: true` | ☐ Yes ☐ No |
| `triggered_by: 'scheduled:inngest'` in LA activity event | ☐ Yes ☐ No ☐ Not verified |

### 6.5 `LA_SIGNALS_COMPUTED` Activity Event After Scheduled Run

Paste one sample row from Supabase `activity_events` (non-secret fields only):

```json
{
  "event_type": "LA_SIGNALS_COMPUTED",
  "occurred_at": "REPLACE",
  "metadata": {
    "triggered_by": "scheduled:inngest",
    "signals_computed": 0,
    "total_sends": 0,
    "lookback_days": 90
  }
}
```

**Paste actual row (redact `tenant_id` or leave as UUID — not a secret).**

### 6.6 Inngest Run Errors (if any)

```
[Paste any Inngest run error messages or stack traces here]
```

### 6.7 Inngest Notes

```
[Any notes about Inngest registration, cron behavior, or run results]
```

---

## 7. Resend / Webhook Evidence

| Field | Value |
|-------|-------|
| Staging webhook URL configured in Resend | ☐ Yes ☐ No |
| Signing secret set in Vercel preview env | ☐ Yes ☐ No |
| Signing secret matches Resend staging webhook | ☐ Confirmed ☐ Mismatch |
| Test webhook event delivered successfully | ☐ Yes ☐ No ☐ Not tested |
| HTTP response code for test event | ` ` (expected: 200) |

### 7.1 `webhook_events` Row After Test Event

Paste the relevant non-secret fields from the `webhook_events` row:

```
source:      resend
event_type:  [e.g., email.delivered]
processed:   true
id:          [UUID — non-secret]
```

`webhook_events` row created: ☐ Yes ☐ No

### 7.2 `email_events` Row After Test Event

| Check | Result |
|-------|--------|
| `email_events` row created with correct `email_send_id` | ☐ Yes ☐ No ☐ Not tested |
| `provider_event_id` populated | ☐ Yes ☐ No |

### 7.3 Duplicate Webhook Test

| Check | Result |
|-------|--------|
| Duplicate webhook replay sent | ☐ Yes ☐ No ☐ Not tested |
| Response code for duplicate | ` ` (expected: 200) |
| "Duplicate event ignored" in Vercel logs | ☐ Yes ☐ No ☐ Not tested |
| No duplicate `email_events` row created | ☐ Confirmed ☐ Duplicate found |

### 7.4 Invalid Signature Test

| Check | Result |
|-------|--------|
| Invalid request sent (no signature headers) | ☐ Yes ☐ No ☐ Not tested |
| Response code | ` ` (expected: 401) |
| Error message received | ` ` (expected: "Missing webhook signature headers") |

### 7.5 Phase 3B vs Phase 3A Routing

| Check | Result |
|-------|--------|
| Phase 3B send: ET_ activity event emitted after webhook | ☐ Yes ☐ No ☐ Not tested |
| Phase 3A send: no ET_ event emitted (if tested) | ☐ Yes ☐ No ☐ Not tested |

### 7.6 Resend / Webhook Notes

```
[Any notes about webhook configuration, delivery results, or issues]
```

---

## 8. End-to-End Smoke Test Evidence

For each item, mark pass/fail and add brief notes.

### 8.1 Application Basics

| Step | Result | Notes |
|------|--------|-------|
| App loads at staging preview URL | ☐ Pass ☐ Fail | ` ` |
| Login / Supabase auth works | ☐ Pass ☐ Fail | ` ` |
| Workspace selector shows staging workspace | ☐ Pass ☐ Fail | ` ` |
| Dashboard loads | ☐ Pass ☐ Fail | ` ` |
| Leads list loads | ☐ Pass ☐ Fail | ` ` |
| Agent monitor page loads | ☐ Pass ☐ Fail | ` ` |

### 8.2 Message Strategy Agent

| Step | Result | Notes |
|------|--------|-------|
| Message workspace opens for test lead | ☐ Pass ☐ Fail | ` ` |
| Strategy generation triggered or existing strategy displayed | ☐ Pass ☐ Fail ☐ Skipped | ` ` |
| `message_strategies` row created in staging Supabase | ☐ Yes ☐ No ☐ Not verified | ` ` |

### 8.3 Copywriting Agent

| Step | Result | Notes |
|------|--------|-------|
| Versions generated or existing versions displayed | ☐ Pass ☐ Fail ☐ Skipped | ` ` |
| 2–4 version cards visible | ☐ Pass ☐ Fail | ` ` |
| `message_versions` rows created in staging | ☐ Yes ☐ No ☐ Not verified | ` ` |

### 8.4 Quality Review Agent

| Step | Result | Notes |
|------|--------|-------|
| QRA scores/bands displayed on version cards | ☐ Pass ☐ Fail ☐ Skipped | ` ` |
| `quality_reviews` rows created in staging | ☐ Yes ☐ No ☐ Not verified | ` ` |

### 8.5 Human Review / Approval Bridge

| Step | Result | Notes |
|------|--------|-------|
| Approve button present | ☐ Pass ☐ Fail | ` ` |
| Version approved successfully | ☐ Pass ☐ Fail ☐ Skipped | ` ` |
| Reject button present | ☐ Pass ☐ Fail | ` ` |
| Rejection flow works | ☐ Pass ☐ Fail ☐ Skipped | ` ` |
| `message_versions.approval_status = 'approved'` in staging | ☐ Yes ☐ No ☐ Not verified | ` ` |

### 8.6 Send / Email Draft Bridge

| Step | Result | Notes |
|------|--------|-------|
| "Create Email Draft" button appears on approved version | ☐ Pass ☐ Fail | ` ` |
| Confirmation modal shown before creation | ☐ Pass ☐ Fail | ` ` |
| Draft created after confirmation | ☐ Pass ☐ Fail ☐ Skipped | ` ` |
| `email_drafts.status = 'approved'` in staging | ☐ Yes ☐ No ☐ Not verified | ` ` |
| `approval_requests.status = 'approved'` (linked) in staging | ☐ Yes ☐ No ☐ Not verified | ` ` |
| **NO email sent automatically after draft creation** | ☐ Confirmed ☐ Auto-send detected — STOP | ` ` |

### 8.7 Phase 3B.1 FK Attribution

| Check | Result | Notes |
|-------|--------|-------|
| After send: `email_sends.message_version_id` non-null | ☐ Yes ☐ No ☐ Not tested | ` ` |
| After send: `email_sends.strategy_id` non-null | ☐ Yes ☐ No ☐ Not tested | ` ` |
| After send: `email_sends.metadata.source = 'phase_3b_send_bridge'` | ☐ Yes ☐ No ☐ Not tested | ` ` |

**Sample `email_sends` row (non-secret fields only):**
```json
{
  "id": "REPLACE",
  "status": "sent",
  "message_version_id": "REPLACE",
  "strategy_id": "REPLACE",
  "metadata": { "source": "phase_3b_send_bridge" }
}
```

### 8.8 Event Tracking

| Check | Result | Notes |
|-------|--------|-------|
| `ET_SEND_INITIATED` activity event in staging | ☐ Yes ☐ No ☐ Not tested | ` ` |
| `ET_SEND_SUCCEEDED` activity event in staging | ☐ Yes ☐ No ☐ Not tested | ` ` |
| After webhook: `ET_EMAIL_DELIVERED` (or other outcome) | ☐ Yes ☐ No ☐ Not tested | ` ` |
| `entity_id` on ET_ events matches `message_version_id` | ☐ Yes ☐ No ☐ Not tested | ` ` |

**Sample `activity_events` ET_ row (non-secret fields only):**
```json
{
  "event_type": "ET_EMAIL_DELIVERED",
  "entity_type": "message_version",
  "entity_id": "REPLACE",
  "occurred_at": "REPLACE",
  "metadata": { "source": "phase_3b_send_bridge", "message_version_id": "REPLACE", "strategy_id": "REPLACE" }
}
```

### 8.9 Learning Agent

| Check | Result | Notes |
|-------|--------|-------|
| Manual "Run Learning Analysis" button works | ☐ Pass ☐ Fail | ` ` |
| `learning_snapshots` rows created with `advisory = true` | ☐ Yes ☐ No | ` ` |
| Learning Signals card updates after run | ☐ Pass ☐ Fail | ` ` |
| Scheduled run (manual invocation) produces valid result | ☐ Pass ☐ Fail ☐ Not tested | ` ` |

**Sample `learning_snapshots` row (non-secret fields only):**
```json
{
  "signal_name": "delivery_rate",
  "dimension": "tenant_wide",
  "dimension_value": "all",
  "numerator": 0,
  "denominator": 0,
  "rate": null,
  "confidence": "insufficient",
  "advisory": true
}
```

### 8.10 Operational Health Card

| Check | Result | Notes |
|-------|--------|-------|
| Operational Health card visible on agent monitor | ☐ Pass ☐ Fail | ` ` |
| State A stuck draft count shows (0 or expected) | ☐ Pass ☐ Fail | ` ` |
| State B stuck draft count shows (0 or expected) | ☐ Pass ☐ Fail | ` ` |
| Failed sends count shows (0 or expected) | ☐ Pass ☐ Fail | ` ` |
| Learning Agent last run shows timestamp and status | ☐ Pass ☐ Fail | ` ` |
| Advisory disclaimer text present | ☐ Pass ☐ Fail | ` ` |
| No action buttons on the health card | ☐ Confirmed ☐ Buttons found — document |

### 8.11 Phase 3A Regression Check

| Check | Result | Notes |
|-------|--------|-------|
| Phase 3A template email sends still work (if applicable) | ☐ Pass ☐ Fail ☐ Not tested | ` ` |
| Phase 3A send has `message_version_id = null` in `email_sends` | ☐ Yes ☐ No ☐ Not tested | ` ` |
| No ET_ event emitted for Phase 3A send | ☐ Confirmed ☐ ET_ event appeared — STOP | ` ` |

### 8.12 Smoke Test Summary

| Area | Overall Result |
|------|---------------|
| Application basics | ☐ Pass ☐ Fail ☐ Partial |
| Phase 3B core flow (MSA → CA → QRA → HRB → SEB) | ☐ Pass ☐ Fail ☐ Partial |
| Phase 3B.1 FK attribution | ☐ Pass ☐ Fail ☐ Not tested |
| Event Tracking | ☐ Pass ☐ Fail ☐ Not tested |
| Learning Agent | ☐ Pass ☐ Fail ☐ Partial |
| Operational Health | ☐ Pass ☐ Fail ☐ Partial |
| Phase 3A regression | ☐ Pass ☐ Fail ☐ Not tested |

---

## 9. Guardrail Evidence

| Guardrail | Verified? | Observation Method | Notes |
|-----------|----------|--------------------|-------|
| No auto-send at any point in the flow | ☐ Confirmed ☐ Violation | Watched for send after HRB approve and draft creation | ` ` |
| No auto-retry after failed send | ☐ Confirmed ☐ Violation ☐ Not tested | Checked `email_sends` row count after failure | ` ` |
| State A report-only (no approval_requests created by reconciler) | ☐ Confirmed ☐ Violation ☐ Not tested | Checked reconciler result and `approval_requests` count | ` ` |
| State B report-only (no approval_request auto-resolution) | ☐ Confirmed ☐ Violation ☐ Not tested | Checked reconciler result | ` ` |
| State C only supersedes pending siblings (no new drafts created) | ☐ Confirmed ☐ Violation ☐ Not tested | Checked `email_drafts` count before and after State C | ` ` |
| Scheduled Learning Agent advisory-only (`advisory = true` in all snapshot rows) | ☐ Confirmed ☐ Violation | Queried `learning_snapshots WHERE advisory = false` — expected 0 rows | ` ` |
| Operational Health card has no action buttons | ☐ Confirmed ☐ Buttons found | Visual inspection | ` ` |
| Learning Agent did not mutate `quality_reviews` | ☐ Confirmed ☐ Mutation found | Compared `quality_reviews` count/content before and after LA run | ` ` |
| Learning Agent did not mutate `message_versions` copy | ☐ Confirmed ☐ Mutation found | Compared `message_versions` content before and after LA run | ` ` |
| No active learning / strategy weighting | ☐ Confirmed ☐ Violation | Confirmed `message_strategies` rows unchanged after LA run | ` ` |
| Phase 3A sends remain unchanged | ☐ Confirmed ☐ Regression | Phase 3A email_sends rows unaffected by Phase 3B behavior | ` ` |

### 9.1 Advisory-Only Verification SQL

```sql
-- Confirm no non-advisory learning_snapshots rows exist:
-- SELECT COUNT(*) FROM learning_snapshots WHERE advisory = false;
-- Expected: 0
```

**Paste result:**
```
[Output here]
```

### 9.2 Guardrail Notes

```
[Any guardrail-related notes or observations]
```

---

## 10. Issues / Deviations Log

Record all issues encountered during the staging dry run, whether resolved or outstanding.

| ID | Severity | Area | Description | Evidence | Resolution | Owner | Status |
|----|---------|------|-------------|----------|-----------|-------|--------|
| DRY-001 | ` ` | ` ` | ` ` | ` ` | ` ` | ` ` | ` ` |
| DRY-002 | ` ` | ` ` | ` ` | ` ` | ` ` | ` ` | ` ` |
| DRY-003 | ` ` | ` ` | ` ` | ` ` | ` ` | ` ` | ` ` |

**Severity levels:** `Critical` (blocks go-live) | `High` (must resolve before go-live) | `Medium` (should resolve before go-live) | `Low` (can defer)

**Area options:** Env Vars | Supabase Migration | Vercel Build | Inngest | Resend/Webhook | Smoke Test | Guardrail | Other

**Status options:** Open | In Progress | Resolved | Deferred

### 10.1 Issues Notes

```
[Any additional context about issues found]
```

---

## 11. Go / No-Go Summary

### 11.1 Overall Result

☐ **GO** — All green-light conditions met. Proceed to production deployment planning.

☐ **PARTIAL PASS** — Most conditions met. Outstanding items listed below. Do not proceed to production until resolved.

☐ **NO-GO** — Critical issues found. Staging must be re-run after fixes.

### 11.2 Green-Light Conditions Summary

| Condition | Status |
|-----------|--------|
| All required env vars verified in staging scope | ☐ Met ☐ Not met |
| Staging Supabase URL confirmed different from production | ☐ Met ☐ Not met |
| All 26 migrations applied and schema verified | ☐ Met ☐ Not met |
| Phase 3B.1 columns and indexes confirmed | ☐ Met ☐ Not met |
| `chk_advisory_true` constraint confirmed | ☐ Met ☐ Not met |
| Vercel preview build passed | ☐ Met ☐ Not met |
| All 8 Inngest functions registered with correct cron | ☐ Met ☐ Not met |
| `reconcile-send-bridge-stuck-drafts` invocation succeeded | ☐ Met ☐ Not met |
| `scheduled-learning-agent-run` invocation succeeded | ☐ Met ☐ Not met |
| Resend webhook verified (end-to-end) | ☐ Met ☐ Not met |
| Duplicate webhook replay ignored | ☐ Met ☐ Not met |
| End-to-end smoke test completed | ☐ Met ☐ Not met |
| All guardrails verified | ☐ Met ☐ Not met |
| No auto-send observed | ☐ Met ☐ Not met |
| Evidence captured | ☐ Met ☐ Not met |
| No unexplained errors in logs | ☐ Met ☐ Not met |
| Rollback plan understood | ☐ Met ☐ Not met |

### 11.3 Required Follow-Ups (Partial Pass or No-Go)

| # | Follow-Up Item | Owner | Due |
|---|----------------|-------|-----|
| 1 | ` ` | ` ` | ` ` |
| 2 | ` ` | ` ` | ` ` |
| 3 | ` ` | ` ` | ` ` |

### 11.4 Production Checklist Updates Needed

If the staging dry run revealed gaps or inaccuracies in `docs/roadmap/production-deployment-readiness-checklist-phase-3b.md`, list them here:

| # | Section in Production Checklist | Update Needed |
|---|--------------------------------|--------------|
| 1 | ` ` | ` ` |
| 2 | ` ` | ` ` |

### 11.5 Final Reviewer Signoff

| Field | Value |
|-------|-------|
| Reviewer name | ` ` |
| Signoff date | ` ` |
| Go / No-Go decision | ` ` |
| Conditions attached (if partial) | ` ` |
| Next action | ` ` |

---

## 12. Final Recommendation

Check the appropriate box and add notes:

☐ **Proceed to production deployment planning**
> All green-light conditions met. Evidence captured. No open critical issues. Ready to follow the 11-step production deployment sequence in `docs/roadmap/production-deployment-readiness-checklist-phase-3b.md`.

☐ **Re-run staging dry run after fixes**
> One or more critical or high issues require code, configuration, or migration changes before the dry run can be considered passed. After fixes are applied and committed, repeat the relevant sections of this checklist.

> Open issues to resolve before re-run:
> ```
> [List issues here]
> ```

☐ **Defer deployment**
> External blockers (infrastructure, timing, team availability, scope change) prevent proceeding now. Document the blocker and schedule a follow-up.

> Blocker:
> ```
> [Describe the blocker]
> ```

### 12.1 Final Notes

```
[Any final notes, observations, or recommendations from the dry run team]
```

---

*Document completed by: ____________________*
*Date: ____________________*
*Reviewed by: ____________________*
