# Phase 3B.1 Stabilization / Hardening — Design & Test Cases

**Status:** Draft v1.0 — Awaiting user approval before implementation planning begins.
**Version:** 1.0
**Date:** 2026-05-22
**Prerequisite:** Phase 3B Revenue Learning Engine Foundation locked. All seven layers committed, tagged, and QA-verified. See `docs/roadmap/phase-3b-final-qa-lock-report.md`.

---

## 1. Executive Overview

Phase 3B.1 is a targeted stabilization and hardening sprint. It does not introduce new intelligence capabilities. It makes the Phase 3B Foundation more reliable, more observable, and less dependent on operational assumptions that could fail at scale or under adverse conditions.

**What Phase 3B.1 addresses:**

1. **DB-level attribution hardening** — Phase 3B provenance (`message_version_id`, `strategy_id`) currently travels exclusively through JSONB metadata fields on `email_sends`. At send volumes where metadata parsing becomes a bottleneck, or where a metadata write is partially malformed, attribution can be lost silently. This phase adds explicit, indexed FK-level columns as a primary attribution path, with JSONB fallback for historical records.

2. **Send Bridge partial-write recovery** — The Send Bridge 17-step write sequence is not a single DB transaction. A crash between steps 11–16 can leave a draft, an approval_request, or their link in a partially-settled state. The existing `reconcileEmailDraftStatus` Inngest job already handles the most common Phase 3A mismatch case. This phase adds SEB-specific stuck-state detection and resolution for the states the existing reconciler does not cover.

3. **Scheduled Learning Agent runs** — The Learning Agent currently runs only when a reviewer manually clicks "Run Learning Analysis." This means learning signals go stale between manual runs. This phase adds a daily Inngest cron job that runs the Learning Agent for all active tenants automatically, keeping advisory signals fresh without requiring manual intervention.

4. **Basic operational visibility** — The agent monitor currently shows agent run history and system controls. This phase adds a minimal operational dashboard: stuck draft counts, failed send counts, webhook failure indicators, and Learning Agent run history — enough for an operator to detect and respond to issues without requiring a separate admin application.

**What Phase 3B.1 does not do:**

- Does not introduce active learning or strategy weight updates
- Does not change Message Strategy Agent, Copywriting Agent, QRA, HRB, or Send Bridge business logic
- Does not change Phase 3A template email behavior
- Does not add auto-send, auto-retry, or automated follow-up behavior
- Does not call external LLMs
- Does not call Resend API outside the existing send flow

**Position in the roadmap:**

```
Phase 3B Foundation (Locked)     ← complete
    │
    ▼
Phase 3B.1 Stabilization         ← this document
    │
    ▼
Phase 3C Active Learning Design  ← future (requires separately approved design)
```

---

## 2. Current Foundation State

As of the Phase 3B lock (`44ea577`, tag `phase-3b-learning-agent-v1`):

- **590/590 tests pass.** Build clean. TypeScript clean.
- **7 foundation layers** implemented: MSA → CA → QRA → HRB → SEB → ET → LA.
- **Inngest already in the project** at `lib/inngest/client.ts` and `inngest/index.ts`. Five Inngest functions exist: `dispatchOutbox`, `onLeadCreated`, `onApprovalApproved`, `onApprovalRejected`, `reconcileEmailDraftStatus`, `onStatementReceived`. The `reconcileEmailDraftStatus` function already runs on a cron (`'*/5 * * * *'`) and handles Phase 3A draft/approval_request mismatches.
- **`email_sends` has no explicit Phase 3B FK columns.** Provenance lives exclusively in `email_sends.metadata` (JSONB). The send service (`email-send.service.ts`) reads `ai_generation_metadata` from the draft at send time and copies it into `metadata` via `buildPhase3bSendMetadata`.
- **Event Tracking attribution** depends on `emailSend.metadata` JSONB parsing (`extractPhase3bMeta`) in the webhook handler. If `metadata` is malformed or missing the `source` key, attribution is silently lost.
- **Learning Agent queries `activity_events`** using `entity_id` (the UUID column, already indexed) and `metadata` fields. Entity_id is reliable. The JSONB metadata is used for dimension context (strategy_angle, composite_score) but the core signal keys use entity_id.
- **Three Send Bridge stuck states** exist that the existing reconciler does NOT handle. See Section 7.

---

## 3. Design Goals

| # | Goal | Metric |
|---|------|--------|
| 1 | Phase 3B `email_sends` rows have indexed, queryable `message_version_id` and `strategy_id` columns | All new Phase 3B sends populate both columns |
| 2 | Webhook attribution uses explicit FK columns where available, JSONB where not | No regression in ET_ event emission |
| 3 | Learning Agent preferentially uses explicit FK columns for dimension context queries | Dimension loading latency reduced at scale |
| 4 | Historical Phase 3B sends (JSONB-only) remain fully supported | Zero new test failures on existing behavior |
| 5 | All Send Bridge stuck states are detected and the safe subset are auto-resolved | No stuck draft requires manual DB intervention for states C and D |
| 6 | Learning Agent runs nightly without manual action | Tenant agents monitor shows signal age ≤ 25 hours |
| 7 | Concurrent manual + scheduled Learning Agent runs produce correct results | No snapshot corruption, no duplicate data |
| 8 | Operational visibility allows issue detection without DB access | Operator can identify stuck drafts, failed sends, LA failures from the agent monitor |

---

## 4. Non-Goals

| Non-Goal | Reason |
|----------|--------|
| Active learning / strategy weight updates | Requires separately approved design |
| QRA score recalculation or backfill | QRA is evaluation-only and locked |
| Message copy generation or modification | Copy is immutable |
| Auto-send or auto-retry behavior | Three explicit human actions remain required |
| New Resend API calls | No new outbound email behavior |
| External LLM calls | All Phase 3B.1 work is deterministic |
| Phase 3A template email changes | Phase 3A is locked |
| Building a full admin product | Minimal visibility only |
| Reply tracking or revenue conversion signals | Requires inbound infrastructure |
| A/B statistical significance | Requires randomized experiment infrastructure |
| Backfilling historical `email_sends` with FK values | Low priority; JSONB fallback handles old records |

---

## 5. Database Hardening Design

### 5.1 Problem Statement

The Phase 3B attribution chain relies on JSONB parsing at every hop:

```
email_drafts.ai_generation_metadata  →  (parsed at send time)
  ↓
email_sends.metadata                 →  (parsed in webhook handler)
  ↓
activity_events (ET_ events)         →  entity_id = message_version_id (UUID, indexed)
                                        metadata.strategy_id (JSONB, not indexed)
```

The weakest link is the `email_sends.metadata` → webhook handler → ET_ event chain. If `metadata` is partially written or the `source` field is missing, the webhook handler's `isPhase3bSend()` check silently returns false and no ET_ event is emitted for that send.

A secondary weakness: the Learning Agent must batch-load `message_versions` to retrieve `strategy_angle` and `message_type` for dimensional grouping. This join is currently done via `entity_id` from `activity_events`, which then requires a separate query to `quality_reviews` for score_band. Adding `message_version_id` to `email_sends` would allow future signal calculations to join directly without going through `activity_events.entity_id` as an intermediate.

### 5.2 Proposed New Columns on `email_sends`

Add two nullable UUID columns to `email_sends`:

```sql
message_version_id  uuid  REFERENCES message_versions(id)   -- nullable; null for Phase 3A sends
strategy_id         uuid  REFERENCES message_strategies(id)  -- nullable; null for Phase 3A sends
```

**Both are nullable.** Phase 3A template sends will have `NULL` in both columns. Only Phase 3B sends (those with `ai_generation_metadata.source = 'phase_3b_send_bridge'`) will have non-null values.

**Indexes required:**
```sql
CREATE INDEX idx_email_sends_message_version ON email_sends(message_version_id)
  WHERE message_version_id IS NOT NULL;

CREATE INDEX idx_email_sends_strategy ON email_sends(strategy_id)
  WHERE strategy_id IS NOT NULL;
```

Partial indexes keep the index small (only Phase 3B rows) and fast.

### 5.3 Where the Columns Are Populated

The `createEmailSend` function in `email-send.repo.ts` accepts an input struct. The `sendApprovedDraft` function in `email-send.service.ts` already extracts `phase3bMeta` at send time. The columns should be populated there, alongside the JSONB metadata enrichment:

```
When phase3bMeta !== null:
  emailSend.message_version_id = phase3bMeta.message_version_id ?? null
  emailSend.strategy_id        = phase3bMeta.strategy_id ?? null
```

This is an additive change to `createEmailSend`'s input struct and the `email-send.service.ts` call site. The JSONB metadata enrichment continues unchanged.

### 5.4 Event Tracking With Explicit FK Columns

Currently, the webhook handler reads:
```typescript
const sendMeta = (emailSend.metadata ?? {}) as Record<string, unknown>
if (etAttribution.isPhase3bSend(sendMeta)) {
  const phase3bMeta = etAttribution.extractPhase3bMeta(sendMeta)
  ...
}
```

After the migration, the webhook handler should prefer the explicit FK columns if available:

**Preferred path:** `emailSend.message_version_id !== null` → treat as Phase 3B send; use explicit columns where possible and complement with JSONB metadata for fields not yet promoted to columns (e.g., `version_label`, `composite_score`, `approved_by`).

**Fallback path:** `emailSend.message_version_id === null` → fall back to `extractPhase3bMeta(sendMeta)` for attribution. This covers existing Phase 3B sends (created before this migration) and all Phase 3A sends (which correctly return null attribution).

The webhook handler's `processResendEvent` currently selects `metadata, status` and other columns. After the migration, it should also select `message_version_id, strategy_id`.

This means `isPhase3bSend()` logic gains a more reliable primary check:
```
isPhase3bSend = emailSend.message_version_id !== null
             || extractPhase3bMeta(metadata) !== null   // fallback for old records
```

### 5.5 Learning Agent With Explicit FK Columns

The Learning Agent currently queries `activity_events` and uses `entity_id` as the primary key for signal calculation. This remains the correct approach — `entity_id` is already a proper UUID column, indexed, and populated reliably by Event Tracking.

However, the Learning Agent's dimension context loading (`loadVersionDimensions`) currently batch-queries `message_versions` using `entity_id` values from `activity_events`. This path is correct and does not need to change.

**What does change:** Because Event Tracking attribution is now more reliable (fewer missed ET_ events due to JSONB parsing failures), the Learning Agent's input data is more complete. This is an indirect improvement — no code change required in the Learning Agent itself.

**Future optimization (deferred to v2):** The explicit `strategy_id` column on `email_sends` enables a future direct join path between `email_sends` and `message_strategies` without routing through `activity_events`. This is noted here but not implemented in Phase 3B.1.

### 5.6 Backwards Compatibility Strategy

Old Phase 3B `email_sends` records (created before this migration) will have `message_version_id = NULL` and `strategy_id = NULL`. They have attribution in `metadata` only.

The JSONB fallback path must remain in all consumers:
- **Event Tracking (webhook handler):** Check explicit columns first, fall back to `extractPhase3bMeta(metadata)` if null.
- **Learning Agent:** No change required — it reads `activity_events`, not `email_sends` directly. ET_ events already have reliable `entity_id` attribution.
- **Any future queries against `email_sends`:** Always handle nullable `message_version_id`.

The JSONB fields in `email_sends.metadata` are never removed. They are complementary, not replaced. A future version could backfill `message_version_id` and `strategy_id` from `metadata` for old records if needed, but this is not part of Phase 3B.1.

### 5.7 Migration

**Number:** `20240026` (next after `20240025_phase3b_learning_snapshots.sql`)
**File:** `20240026_phase3b1_email_sends_attribution.sql`

Contents:
```sql
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS message_version_id uuid REFERENCES message_versions(id),
  ADD COLUMN IF NOT EXISTS strategy_id        uuid REFERENCES message_strategies(id);

CREATE INDEX idx_email_sends_message_version
  ON email_sends(message_version_id)
  WHERE message_version_id IS NOT NULL;

CREATE INDEX idx_email_sends_strategy
  ON email_sends(strategy_id)
  WHERE strategy_id IS NOT NULL;
```

This migration is safe to apply without locking the table because:
- Both new columns are nullable — no default value computation needed
- No data backfill required in the migration itself
- The indexes use partial conditions (`WHERE ... IS NOT NULL`) and will build quickly since no existing rows have non-null values at migration time

**No TypeScript type regeneration blocker:** The new columns will appear in the generated `Database` type after the migration is applied. Until regeneration, service code accesses them via the `input` struct which can be updated independently of the generated type. The implementation plan should address the regeneration step.

---

## 6. Send Bridge Reconciliation Design

### 6.1 Current Reconciliation Coverage

The existing `reconcileEmailDraftStatus` Inngest function (`inngest/functions/reconcile-email-draft-status.ts`) already handles one class of stuck state:

> **Handled (Phase 3A pattern):** `email_draft.status = 'pending_approval'` WHERE the linked `approval_request.status` is `'approved'` or `'rejected'`.
> **Resolution:** Auto-fix the draft status to match the approval decision.

This covers the Send Bridge's **Step 14 → Step 15 failure** (approval_request resolved, draft status sync failed) because that failure puts the draft in `pending_approval` with a linked `approved` approval_request — exactly the case the existing reconciler finds.

### 6.2 Stuck States NOT Currently Handled

The Send Bridge write sequence can produce stuck states the existing reconciler does not detect. Below is the full fault analysis:

**State A — Draft exists, no approval_request linked**

Cause: Step 11 (INSERT draft) succeeded; Step 12 (INSERT approval_request) or Step 13 (link approval_request to draft) failed.

Observable state:
```
email_drafts.status = 'pending_approval'
email_drafts.approval_request_id = NULL
email_drafts.ai_generation_metadata->>'source' = 'phase_3b_send_bridge'
email_drafts.created_at < now() - interval '10 minutes'  (grace period)
email_drafts.deleted_at IS NULL
```

Impact: The reviewer cannot send this draft (Phase 3A double-gate fails — draft has no approval_request). The SEB duplicate guard (SEB_011) blocks re-creation. The draft is stuck permanently.

**Resolution:** Report-only in v1. Auto-creating an approval_request and resolving it involves write logic equivalent to the SEB's write sequence. This is risky to auto-apply in a background job without careful testing. The operator should investigate and either delete the stuck draft (allowing re-creation) or manually link an approval_request.

**State B — Draft linked to a pending approval_request**

Cause: Step 13 (link approval_request to draft) succeeded; Step 14 (resolve approval_request to approved) failed.

Observable state:
```
email_drafts.status = 'pending_approval'
email_drafts.approval_request_id IS NOT NULL
  → approval_requests.status = 'pending'
  → approval_requests.request_type = 'email_draft_review'
email_drafts.ai_generation_metadata->>'source' = 'phase_3b_send_bridge'
email_drafts.created_at < now() - interval '10 minutes'
```

Impact: The draft is stuck. The reviewer cannot send. SEB_011 blocks re-creation.

**Resolution:** Report-only in v1. Auto-resolving an approval_request is a meaningful state change. While the intent is clear (the HRB already approved the version), a background job resolving approval_requests autonomously is a guardrail violation risk. The operator should investigate; a safe fix is to run the resolve step manually or allow the reviewer to re-trigger from the UI.

**State C — Supersede step failed (prior pending drafts not cleaned up)**

Cause: Steps 11–15 succeeded (draft is `approved`); Step 16 (`supersedePendingDraftsForLead`) failed.

Observable state:
```
email_drafts WHERE lead_id = X AND status IN ('pending', 'pending_approval')
  → has >= 1 row with deleted_at IS NULL
AND email_drafts WHERE lead_id = X AND status = 'approved'
  → has >= 1 row (the newly created SEB draft)
```

Impact: The lead has multiple active drafts. UI may show confusing state. The reviewer can still send the approved draft — this is a cosmetic/hygiene issue, not a blocking one.

**Resolution:** Auto-fix. The supersede logic is idempotent and safe — it soft-deletes pending drafts for a lead. Running it again on drafts that should have been superseded has no negative impact. The reconciler can safely call `supersedePendingDraftsForLead` for any lead that has both an approved Phase 3B draft and older pending drafts.

**State D — Audit event not emitted (already handled)**

Cause: Step 17 (emit `SEB_ACTION_DRAFT_CREATED`) failed.

This is already handled by design — Step 17 uses `.catch(() => {})`. The activity event is advisory. No reconciliation needed.

**State E — Existing reconciler handles this**

Cause: Step 14 (resolve approval_request) succeeded; Step 15 (sync draft status) failed.
The draft is at `pending_approval` with a linked `approved` approval_request.

This is already detected and fixed by the existing `reconcileEmailDraftStatus` Inngest function. No new reconciler logic needed.

### 6.3 New SEB Reconciliation Function

A new Inngest function `reconcileSendBridgeStuckDrafts` should be created alongside the existing `reconcileEmailDraftStatus`.

**Trigger:** `cron: '*/15 * * * *'` (every 15 minutes — less frequent than the Phase 3A reconciler since SEB stuck states are rarer and less time-sensitive).

**Grace period:** Only consider drafts created more than 10 minutes ago. This prevents false positives on in-progress SEB runs.

**Steps:**
1. Detect State A (no approval_request_id) → log and emit a monitoring event; do NOT auto-fix.
2. Detect State B (linked to pending approval_request) → log and emit a monitoring event; do NOT auto-fix.
3. Detect State C (approved draft, older pending drafts for same lead) → auto-fix by calling supersede logic.
4. Return a structured result for Inngest dashboard visibility.

**Implementation note:** The function should use `step.run()` for each detection/fix step to take advantage of Inngest's step-level retry and logging.

**Idempotency:** State C fix uses the existing `supersedePendingDraftsForLead` function, which is already idempotent (it checks current status before soft-deleting). Running it twice produces the same result.

### 6.4 Detection Queries (Design-Level)

**State A detection:**
```sql
SELECT ed.id, ed.tenant_id, ed.lead_id, ed.created_at
FROM email_drafts ed
WHERE ed.status = 'pending_approval'
  AND ed.approval_request_id IS NULL
  AND ed.deleted_at IS NULL
  AND ed.ai_generation_metadata->>'source' = 'phase_3b_send_bridge'
  AND ed.created_at < now() - interval '10 minutes'
LIMIT 50
```

**State B detection:**
```sql
SELECT ed.id, ed.tenant_id, ed.lead_id, ed.approval_request_id, ar.status as ar_status
FROM email_drafts ed
JOIN approval_requests ar ON ar.id = ed.approval_request_id
WHERE ed.status = 'pending_approval'
  AND ar.status = 'pending'
  AND ar.request_type = 'email_draft_review'
  AND ed.deleted_at IS NULL
  AND ed.ai_generation_metadata->>'source' = 'phase_3b_send_bridge'
  AND ed.created_at < now() - interval '10 minutes'
LIMIT 50
```

**State C detection:**
```sql
SELECT DISTINCT approved.lead_id, approved.tenant_id, approved.id as approved_draft_id
FROM email_drafts approved
WHERE approved.status = 'approved'
  AND approved.deleted_at IS NULL
  AND approved.ai_generation_metadata->>'source' = 'phase_3b_send_bridge'
  AND EXISTS (
    SELECT 1 FROM email_drafts older
    WHERE older.lead_id = approved.lead_id
      AND older.tenant_id = approved.tenant_id
      AND older.status IN ('pending', 'pending_approval')
      AND older.deleted_at IS NULL
      AND older.id != approved.id
  )
LIMIT 50
```

**Note on indexing:** State A and B queries use the JSONB path operator `ai_generation_metadata->>'source'`. This is acceptable for the low-volume reconciler query. If this becomes a performance issue at scale, a future migration could add a generated column or a GIN index. For Phase 3B.1, the JSONB filter is acceptable.

---

## 7. Scheduled Learning Agent Design

### 7.1 Current Trigger Model

The Learning Agent is triggered on-demand via `runLearningAnalysisAction` (a server action) called from the `RunAnalysisButton` client component in the agent monitor. This requires a human to navigate to the agent monitor and click the button. Signals are only refreshed when someone does this.

### 7.2 Proposed Scheduled Model

Add a new Inngest function: `scheduledLearningAgentRun`.

**Trigger:** `cron: '0 6 * * *'` — daily at 06:00 UTC. This time is chosen because it is early morning UTC (off-peak for most usage) and ensures signals are fresh for the business day.

**Tenant enumeration strategy:** Query all distinct `tenant_id` values from the `workspaces` table where `deleted_at IS NULL` (assuming workspaces have a soft-delete mechanism, or equivalently from `tenants` table). Run the Learning Agent for each tenant independently.

**Per-tenant execution:**
```
For each tenant_id:
  1. Load the tenant's most recent workspace_id (for workspaceId input to runLearningAnalysis)
  2. Call runLearningAnalysis({ tenantId, workspaceId, triggeredBy: 'scheduled', lookbackDays: 90 })
  3. Log result: { tenantId, ok, snapshotCount, totalSends, errorReason }
  4. Continue to next tenant regardless of per-tenant failure
```

The `triggeredBy` field for scheduled runs should be a sentinel string `'scheduled:inngest'` rather than a userId — this distinguishes automated runs from manual ones in the `LA_SIGNALS_COMPUTED` audit event.

### 7.3 Concurrency: Manual Run + Scheduled Run

The Learning Agent is a pure analytics job. Two simultaneous runs for the same tenant produce two sets of `learning_snapshots` rows with different `run_id` values. Both are valid. The UI reads the latest by `computed_at` — whichever run finishes last is what the user sees.

This is acceptable behavior. The partial unique index `(tenant_id, run_id, signal_name, dimension, dimension_value)` prevents duplicates within a single run, not across runs. No cross-run locking is needed.

**Worst case:** Manual run and scheduled run start within seconds of each other. Both write a full set of snapshots. The UI shows the one that completed last. This is correct — the data is the same because both read the same window of `activity_events`.

**No lock required.** The Inngest concurrency key (`id: 'scheduled-learning-agent-run'`) ensures only one scheduled run executes at a time, but a manual run can proceed concurrently with a scheduled run. This is intentional.

### 7.4 Tenant Selection Details

The scheduled function queries all active tenants. A tenant is considered active if it has at least one non-deleted workspace. The query:

```sql
SELECT DISTINCT tenant_id, MIN(id) as workspace_id
FROM workspaces
WHERE deleted_at IS NULL
GROUP BY tenant_id
```

This gives one `(tenant_id, workspace_id)` pair per tenant. The Learning Agent uses `workspaceId` for the `learning_snapshots.workspace_id` column — using the first workspace is acceptable for the scheduled run context.

**Alternative:** If `runLearningAnalysis` is extended to accept a nullable `workspaceId`, the scheduled function can pass null and the service can handle it. This is cleaner but requires a minor service contract change. The implementation plan should decide.

### 7.5 Empty Tenant Handling

For a new tenant with zero Phase 3B sends, `runLearningAnalysis` already handles this gracefully: `calculateAllSignals({ events: [] })` returns an empty array, `writeSnapshots` writes 0 rows, and `LA_SIGNALS_COMPUTED` is emitted with `signals_computed: 0, total_sends: 0`. The scheduled function should log this as a `no-data` result without treating it as an error.

### 7.6 Scheduled Run Result Logging

The Inngest function should return a structured summary visible in the Inngest dashboard:

```typescript
{
  tenantsProcessed: number,
  tenantsWithData:  number,
  tenantsWithError: number,
  results: Array<{
    tenantId:      string,
    ok:            boolean,
    snapshotCount: number,
    totalSends:    number,
    errorReason?:  string,
  }>
}
```

This allows Inngest dashboard monitoring without requiring DB access.

### 7.7 Manual Run Remains Supported

The `RunAnalysisButton` and `runLearningAnalysisAction` are unchanged. The manual trigger remains fully functional. Adding a scheduled trigger is purely additive. The agent monitor should display when the last run occurred (scheduled or manual) and whether it succeeded.

---

## 8. Monitoring / Admin Visibility Design

### 8.1 Design Principle

Phase 3B.1 monitoring is minimal operational visibility, not a full admin product. The goal is to surface enough signal in the existing agent monitor page that an operator can detect and respond to the four most important issue categories without needing direct database access.

The agent monitor page (`app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx`) already shows:
- Agent run summary stats (runs today, completed, failed, open guardrails)
- System controls (read-only)
- Recent agent runs table
- Learning signals (added in Phase 3B)

Phase 3B.1 adds a new **Operational Health** section to this page.

### 8.2 Operational Health Card Contents

#### Stuck Drafts Counter

Display the count of Phase 3B drafts in stuck states detected by the SEB reconciler:

| Signal | Source | Display |
|--------|--------|---------|
| State A (no approval_request) | SEB reconciler result or fresh query | `{n} stuck draft(s) — missing approval link` |
| State B (linked to pending approval_request) | SEB reconciler result or fresh query | `{n} stuck draft(s) — approval_request pending` |

If count = 0 for all states: "No stuck drafts detected."

If count > 0: show a yellow warning badge. Include a note: "These drafts cannot be sent until resolved. Contact your administrator." Do not surface a fix button in v1 — fixes require operator judgment.

#### Failed Send Counter

Display count of `email_sends WHERE status = 'failed' AND created_at >= now() - interval '24h'` for the current tenant.

If count > 0: "X send failure(s) in the last 24 hours." Yellow warning. No auto-retry — this is informational only.

#### Webhook Failure Indicator

The `webhook_events` table tracks all inbound Resend webhooks. A webhook is marked processed when `processResendEvent` completes without error. However, the current implementation marks it with `processed: true` even if `processResendEvent` threw an error (because the try/catch swallows the error). The issue is: `processResendEvent` errors are logged via `console.error` but not stored.

For Phase 3B.1: surface the count of `webhook_events WHERE processed = false AND created_at >= now() - interval '24h'` (if any exist — webhook_events are marked processed after the main handler, so unprocessed ones indicate an error occurred before the post-processing step). This is a proxy metric, not a precise count.

If the schema doesn't easily support this, this sub-item can be deferred to v2 with a note. The implementation plan should decide.

#### Learning Agent Last Run Status

Display:
- `Last analysis run: {timestamp}` — from `learning_snapshots.computed_at` (latest for tenant)
- `Status: Completed — {snapshotCount} signals · {totalSends} sends · {lookbackDays}-day window` or `Failed` (from `LA_SIGNALS_COMPUTATION_FAILED` activity event)
- `Next scheduled run: approximately {next 06:00 UTC}` — computed client-side

If no run has occurred: "No analysis has run yet."

### 8.3 High Bounce/Complaint Advisory Signals

This is already implemented in Phase 3B (the agent monitor Learning Signals section surfaces advisory alert banners for `bounce_rate ≥ 10%` and `complaint_rate ≥ 0.5%` with moderate+ confidence). No change needed.

Phase 3B.1 should ensure these alerts remain visible and are not pushed below the fold by the new Operational Health card. The layout order should be:
1. Header + stats (existing)
2. System Controls (existing)
3. **Operational Health** (new)
4. Learning Signals (existing, Phase 3B)
5. Recent Agent Runs (existing)

### 8.4 No Auto-Action From Monitoring

All monitoring is read-only and advisory. The Operational Health card must include:
> "All indicators above are informational. No automatic action is taken based on these signals."

No button on the Operational Health card triggers sends, resolves approvals, or modifies any Phase 3B records. The stuck draft indicator shows a count; resolution requires operator action outside the UI.

---

## 9. Data Model Considerations

### 9.1 New Columns on `email_sends`

| Column | Type | Nullable | FK |
|--------|------|----------|----|
| `message_version_id` | `uuid` | Yes | `message_versions(id)` |
| `strategy_id` | `uuid` | Yes | `message_strategies(id)` |

Both nullable. Neither has a DEFAULT. The FK constraints are without `ON DELETE CASCADE` — if a message_version or message_strategy is soft-deleted (not hard-deleted), the FK remains valid. No Phase 3B rows are hard-deleted in v1.

### 9.2 No New Tables

Phase 3B.1 does not add new tables. It adds:
- 2 columns to `email_sends` (migration `20240026`)
- 2 Inngest functions (`scheduledLearningAgentRun`, `reconcileSendBridgeStuckDrafts`)
- Operational Health section in the agent monitor page

### 9.3 Index Design

Two partial indexes on `email_sends` (described in Section 5.2). No index changes to other tables.

The State A/B/C detection queries for the SEB reconciler use JSONB path operators (`ai_generation_metadata->>'source'`). These are acceptable for a low-frequency background job. They are not on the hot write path. No additional indexes are required in Phase 3B.1 for reconciliation queries.

---

## 10. Migration Considerations

### 10.1 Migration `20240026`

**File:** `supabase/migrations/20240026_phase3b1_email_sends_attribution.sql`

**Content outline:**
```sql
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS message_version_id uuid REFERENCES message_versions(id),
  ADD COLUMN IF NOT EXISTS strategy_id        uuid REFERENCES message_strategies(id);

CREATE INDEX idx_email_sends_message_version
  ON email_sends(message_version_id)
  WHERE message_version_id IS NOT NULL;

CREATE INDEX idx_email_sends_strategy
  ON email_sends(strategy_id)
  WHERE strategy_id IS NOT NULL;
```

**Safety:**
- `ADD COLUMN IF NOT EXISTS` is safe to re-run (idempotent)
- Nullable columns with no DEFAULT do not lock the table in PostgreSQL (no row rewriting required)
- Partial indexes build on existing rows (all NULL initially) — near-instant on current data volumes
- No backfill in this migration — old records remain NULL in the new columns, which is correct (JSONB fallback handles them)

### 10.2 TypeScript Type Regeneration

After the migration is applied to Supabase, `types/database.ts` must be regenerated to include the new columns. Until regeneration, the TypeScript type for `email_sends` will not have `message_version_id` or `strategy_id`. The implementation must handle this via type casting or regenerating before writing the service code. The implementation plan should specify the regeneration step order.

### 10.3 No Migration Required for Reconciliation or Scheduling

The SEB reconciler and scheduled Learning Agent are Inngest function additions. They do not require schema migrations.

### 10.4 No Migration Required for Monitoring UI

The Operational Health card reads from existing tables (`email_sends`, `email_drafts`, `approval_requests`, `learning_snapshots`, `activity_events`, `webhook_events`). No schema changes needed.

### 10.5 Rollback Considerations

**Migration `20240026` rollback:**
```sql
DROP INDEX IF EXISTS idx_email_sends_message_version;
DROP INDEX IF EXISTS idx_email_sends_strategy;
ALTER TABLE email_sends
  DROP COLUMN IF EXISTS message_version_id,
  DROP COLUMN IF EXISTS strategy_id;
```

This is safe at any time since the columns are nullable and have no FK dependencies in other tables (other tables do not reference `email_sends.message_version_id`).

**Inngest function rollback:** Remove the functions from `inngest/index.ts` and redeploy. In-flight runs will complete; new runs will not be scheduled.

**Monitoring UI rollback:** Revert the agent monitor page component changes. Purely additive changes are trivially reversible.

---

## 11. Guardrails

All Phase 3B guardrails remain in force. Phase 3B.1 adds no new guardrail exceptions. The following are explicitly reaffirmed:

| Guardrail | Applies to Phase 3B.1 Work |
|-----------|---------------------------|
| No auto-send | SEB reconciler must never call Resend or `sendApprovedDraftAction` |
| No auto-resolve of approval_requests | State A and B: report only; never auto-create or auto-resolve approval_requests in the reconciler |
| No modification of message_version copy | Reconciler reads email_drafts for state detection; never reads or writes body_text/subject_line |
| No modification of QRA scores | No QRA interaction in any Phase 3B.1 component |
| No modification of message_strategies | No MSA interaction in any Phase 3B.1 component |
| No external LLM calls | All Phase 3B.1 work is deterministic |
| Learning Agent advisory = true | Scheduled run uses same `runLearningAnalysis` service — no behavioral change |
| Phase 3A sends unaffected | New `email_sends` columns are nullable and Phase 3A sends leave them null |
| No cross-tenant data | Scheduled run iterates tenants independently; each run is tenant-scoped |
| JSONB metadata not removed | New columns are additive; JSONB fallback preserved |

**New guardrail added by Phase 3B.1:**

| Guardrail | Reason |
|-----------|--------|
| SEB reconciler must not resolve `approval_requests` in States A or B | Auto-resolving approval_requests is a meaningful workflow state change that requires human judgment in v1 |
| SEB reconciler auto-fix scope is limited to State C (supersede) | Only the safe, idempotent, read-only-to-approval-state fix is automated |
| Scheduled Learning Agent must not write `advisory = false` | Same constraint as manual run; enforced by existing service logic and DB constraint |
| Monitoring Operational Health card must not surface any action button that modifies pipeline state | Advisory display only; no destructive or state-changing actions from the monitoring UI |

---

## 12. Error Handling

### 12.1 Migration Errors

If `20240026` fails (unlikely given its simplicity), the application continues to function normally — new `email_sends` rows will simply not have `message_version_id`/`strategy_id`. The JSONB fallback ensures no regressions.

### 12.2 SEB Reconciler Errors

Per-draft reconciliation errors are caught, logged, and counted as `errors` in the result struct. They do not abort the reconciliation run for other drafts. The Inngest function returns a full result with error counts regardless.

Reconciler failures (the function itself failing) cause Inngest to retry once (per `retries: 1`). If both attempts fail, the failure appears in the Inngest dashboard.

### 12.3 Scheduled Learning Agent Errors

Per-tenant learning analysis errors are caught and logged. The scheduled function continues to the next tenant. A per-tenant failure emits `LA_SIGNALS_COMPUTATION_FAILED` (same as the manual run) and is counted in the `tenantsWithError` result.

### 12.4 Monitoring UI Errors

All Operational Health data loading in the agent monitor page is non-fatal (wrapped in try/catch). If any monitoring query fails, the corresponding card section shows "Unable to load operational data. Please refresh." The rest of the agent monitor page continues to function.

---

## 13. Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| Phase 3A send creates `email_send` with new migration applied | `message_version_id = NULL`, `strategy_id = NULL`. No change in behavior. |
| Phase 3B send after migration — one of the Phase 3B provenance fields is null in `phase3bMeta` | Column set to null. Webhook handler falls back to JSONB for missing fields. Attribution partial but not lost. |
| Reconciler runs while SEB is mid-sequence (within 10-minute grace period) | Grace period prevents false positives. In-progress SEB runs are not flagged. |
| Two scheduled Learning Agent runs fire simultaneously (clock drift) | Both succeed with different `run_id` values. UI shows the later one. No corruption. |
| Tenant with zero workspaces (not possible in practice, but defensive) | `runLearningAnalysis` is not called for that tenant; the enumeration query requires at least one workspace. |
| Learning Agent scheduled run for a cold-start tenant (zero Phase 3B sends) | Returns `{ ok: true, snapshotCount: 0, totalSends: 0 }`. Emits `LA_SIGNALS_COMPUTED` with 0 signals. No error. |
| `websocket_events` table has processing failures that leave `processed = false` | Monitoring shows count. No auto-retry. Operator investigates. |
| A Phase 3B draft is manually deleted by an operator between State A detection and auto-fix | Reconciler finds nothing to fix for that draft. Logged as "already resolved." |
| State C auto-fix targets a draft that has already been superseded by a concurrent SEB run | `supersedePendingDraftsForLead` checks status before updating. No-op if already superseded. |
| State A/B stuck draft count in monitoring exceeds 50 (the LIMIT in detection queries) | Display shows "50+" rather than an exact count. LIMIT prevents slow monitoring queries. |
| `sendApprovedDraftAction` called on an un-resolved State A draft | Phase 3A double-gate fails (no approval_request). Returns `{ ok: false, reason: '...' }`. No email sent. |

---

## 14. QA Strategy

### 14.1 Test Framework

Vitest. Fixture-driven pure function tests for all new pure functions. Integration-level behavioral tests for reconciler detection logic (using in-memory test data, not live DB).

### 14.2 Expected Test Counts

| Suite | Expected count |
|-------|---------------|
| Attribution hardening (new columns, FK path, JSONB fallback) | ~25 |
| Send Bridge reconciler detection logic | ~20 |
| Scheduled Learning Agent (per-tenant run, empty tenant, error handling) | ~15 |
| Monitoring UI data loading (non-fatal behavior) | ~8 |
| No-regression: all 590 existing tests pass | 590 |
| **New total target** | **≥ 658** |

---

## 15. Test Case Matrix

### Category A — Database / Attribution Hardening

---

**TC-S01 — New Phase 3B email_send stores explicit message_version_id**

Input: `sendApprovedDraft` called on a Phase 3B draft (has `ai_generation_metadata.source = 'phase_3b_send_bridge'` with valid `message_version_id`).
Expected: `email_sends.message_version_id` is set to the extracted `message_version_id` UUID.
Pass condition: Non-null UUID in the column matches the version_id from the draft metadata.

---

**TC-S02 — New Phase 3B email_send stores explicit strategy_id**

Input: Same as TC-S01.
Expected: `email_sends.strategy_id` is set to the extracted `strategy_id` UUID.
Pass condition: Non-null UUID in the column matches the strategy_id from the draft metadata.

---

**TC-S03 — JSONB metadata field remains populated alongside explicit columns**

Input: Same as TC-S01.
Expected: `email_sends.metadata` still contains `source`, `message_version_id`, `strategy_id`, `quality_review_id`, `version_label`, `composite_score`, and all other Phase 3B provenance fields.
Pass condition: JSONB metadata is unchanged from Phase 3B Foundation behavior. Explicit columns are additive.

---

**TC-S04 — Phase 3A template send leaves new columns null**

Input: `sendApprovedDraft` called on a Phase 3A template draft (no `ai_generation_metadata.source = 'phase_3b_send_bridge'`).
Expected: `email_sends.message_version_id = NULL`, `email_sends.strategy_id = NULL`.
Pass condition: Both columns null. JSONB metadata contains only Phase 3A fields. No regression.

---

**TC-S05 — Event Tracking webhook handler uses explicit FK column when present**

Input: Resend webhook for a Phase 3B send where `email_send.message_version_id IS NOT NULL`.
Expected: ET_ activity event emitted using `emailSend.message_version_id` as `entity_id`. No reliance on JSONB parsing for this field.
Pass condition: `activity_events.entity_id = email_send.message_version_id`.

---

**TC-S06 — Event Tracking falls back to JSONB for old Phase 3B sends**

Input: Resend webhook for an old Phase 3B send where `email_send.message_version_id IS NULL` but `email_send.metadata.source = 'phase_3b_send_bridge'` and `metadata.message_version_id` is present.
Expected: ET_ activity event emitted using `extractPhase3bMeta(metadata).message_version_id` as `entity_id`.
Pass condition: `activity_events.entity_id = metadata.message_version_id`. No regression on old records.

---

**TC-S07 — Event Tracking produces no ET_ event for Phase 3A send after migration**

Input: Resend webhook for a Phase 3A send where `email_send.message_version_id IS NULL` and `email_send.metadata.source != 'phase_3b_send_bridge'`.
Expected: No ET_ activity event emitted. Existing Phase 3A behavior unchanged.
Pass condition: No ET_ event. No error. Phase 3A sends remain excluded.

---

**TC-S08 — Learning Agent uses explicit FK for dimension context where available**

Input: `loadVersionDimensions` called after migration; `email_sends` has `message_version_id` populated.
Expected: The Learning Agent's dimension loading correctly resolves `strategy_angle`, `message_type`, `score_band` via the version IDs derived from ET_ events.
Pass condition: Same result as before migration (no behavioral change in LA output; column is additive to the existing path).

---

**TC-S09 — Learning Agent handles old JSONB-only sends gracefully**

Input: `calculateAllSignals` receives ET_ events from `activity_events` where the underlying `email_send` was created before the migration (no explicit FK columns).
Expected: Signal calculation proceeds normally using `activity_events.entity_id` (already a proper UUID). No error from missing FK column.
Pass condition: Signal results identical to pre-migration behavior.

---

**TC-S10 — Indexes exist for new FK lookup fields**

Design-level test: Confirm the migration SQL includes partial indexes on `email_sends(message_version_id) WHERE NOT NULL` and `email_sends(strategy_id) WHERE NOT NULL`.
Expected: Migration SQL defines both indexes correctly.
Pass condition: Index definitions present in migration file.

---

**TC-S11 — Migration is backwards compatible (no data loss)**

Input: Apply migration `20240026` to a database with existing Phase 3B `email_sends` records.
Expected: All existing rows are preserved with `message_version_id = NULL`, `strategy_id = NULL`. JSONB metadata unchanged.
Pass condition: Zero row deletions or metadata field changes after migration.

---

**TC-S12 — Phase 3B send with null phase3bMeta fields handled safely**

Input: `sendApprovedDraft` on a Phase 3B draft where `phase3bMeta.message_version_id = null` (edge case: metadata present but version ID missing).
Expected: `email_sends.message_version_id = NULL`. JSONB metadata populated with available fields. No error thrown.
Pass condition: Graceful null handling. Email still sent normally.

---

**TC-S13 — No existing test suite regressions after migration**

Input: Run full `npx vitest run` suite after implementing Phase 3B.1 attribution changes.
Expected: All 590 existing tests pass. No new failures.
Pass condition: 590/590 existing tests pass.

---

### Category B — Send Bridge Reconciliation

---

**TC-R01 — Reconciler detects State A (draft with no approval_request_id)**

Input: `email_drafts` row with `status = 'pending_approval'`, `approval_request_id = NULL`, `ai_generation_metadata.source = 'phase_3b_send_bridge'`, `created_at > 10 minutes ago`.
Expected: Reconciler detection query returns this draft.
Pass condition: Draft appears in State A result set.

---

**TC-R02 — Reconciler does not flag State A within the 10-minute grace period**

Input: Same as TC-R01 but `created_at = 2 minutes ago`.
Expected: Draft NOT flagged by State A detection (within grace period — may still be in-progress SEB run).
Pass condition: Draft not in State A result set.

---

**TC-R03 — Reconciler detects State B (draft linked to pending approval_request)**

Input: `email_drafts.status = 'pending_approval'`, `approval_request_id IS NOT NULL` pointing to an `approval_requests` row with `status = 'pending'` and `request_type = 'email_draft_review'`, `created_at > 10 minutes ago`.
Expected: Reconciler detection query returns this draft.
Pass condition: Draft appears in State B result set.

---

**TC-R04 — Reconciler does not flag State B for Phase 3A drafts**

Input: Phase 3A draft (no `phase_3b_send_bridge` source in `ai_generation_metadata`) linked to a pending approval_request.
Expected: State B detection excludes Phase 3A drafts.
Pass condition: Phase 3A draft not in State B result set (existing `reconcileEmailDraftStatus` handles Phase 3A cases separately).

---

**TC-R05 — Reconciler detects State C (approved draft with unsuperseded prior pending drafts)**

Input: Lead has `email_drafts` row A with `status = 'approved'` (Phase 3B), and row B with `status = 'pending_approval'` (older, not superseded), both with `deleted_at IS NULL`.
Expected: State C detection returns lead_id and approved draft ID.
Pass condition: The lead appears in State C result set.

---

**TC-R06 — State C auto-fix supersedes the older pending draft**

Input: Same as TC-R05.
Expected: Reconciler calls `supersedePendingDraftsForLead`; older draft is soft-deleted (or status updated to indicate superseded).
Pass condition: After fix, only the approved Phase 3B draft remains active for the lead.

---

**TC-R07 — State C auto-fix does not affect the approved draft**

Input: Same as TC-R05.
Expected: The approved Phase 3B draft is not modified by the State C fix.
Pass condition: Approved draft status unchanged after reconciliation.

---

**TC-R08 — Reconciler does not send email**

Input: Any of TC-R01, TC-R03, TC-R05.
Expected: No call to Resend API, no `email_sends` INSERT, no `sendApprovedDraftAction` call in reconciler code.
Pass condition: Code-level guardrail check — no Resend or send calls in reconciler module.

---

**TC-R09 — Reconciler does not create new email_drafts**

Input: State A or B detected.
Expected: Reconciler reports-only (State A, B). State C fix only soft-deletes old drafts — no new drafts created.
Pass condition: `email_drafts` INSERT count = 0 after any reconciler run.

---

**TC-R10 — Reconciler does not modify message_version content**

Input: Any reconciler run.
Expected: No reads or writes to `message_versions.body_text` or `message_versions.subject_line`.
Pass condition: Code-level check — no `message_versions` write in reconciler module.

---

**TC-R11 — Reconciler State C fix is idempotent**

Input: Run reconciler twice on same data after State C fix.
Expected: Second run finds no State C instances for the lead (the fix already applied). Result: `stateC.found = 0`.
Pass condition: Second run makes no additional changes.

---

**TC-R12 — Reconciler handles empty result gracefully**

Input: No stuck drafts exist in any state.
Expected: Reconciler returns `{ stateA: 0, stateB: 0, stateC: { found: 0, fixed: 0 } }`. No error.
Pass condition: Clean no-op result.

---

**TC-R13 — Reconciler reports State A count without auto-fixing**

Input: 3 State A stuck drafts.
Expected: Reconciler returns `{ stateA: { found: 3, autoFixed: 0, reported: 3 } }`. No changes made to those drafts.
Pass condition: Stuck draft count unchanged after reconciler run.

---

**TC-R14 — Reconciler reports State B count without auto-fixing**

Input: 2 State B stuck drafts.
Expected: Reconciler returns `{ stateB: { found: 2, autoFixed: 0, reported: 2 } }`. No approval_request resolution.
Pass condition: Approval_request status unchanged after reconciler run.

---

**TC-R15 — State E (existing reconciler case) is not double-processed**

Input: Phase 3B draft at `pending_approval` with a linked `approved` approval_request (State E, handled by existing `reconcileEmailDraftStatus`).
Expected: SEB reconciler's State B detection excludes this case (it checks `ar.status = 'pending'`, not `'approved'`).
Pass condition: State E not in SEB reconciler's State B result. Existing reconciler continues to handle State E.

---

**TC-R16 — Reconciler respects LIMIT caps**

Input: 60 State A stuck drafts exist.
Expected: Reconciler query returns at most 50. Result notes count may be partial.
Pass condition: `stateA.found <= 50`. No timeout or query error.

---

**TC-R17 — Reconciler correctly scopes to Phase 3B drafts only**

Input: Mix of Phase 3A drafts in `pending_approval` (no SEB metadata) and Phase 3B stuck drafts.
Expected: Only Phase 3B drafts (with `ai_generation_metadata.source = 'phase_3b_send_bridge'`) appear in State A or B results. Phase 3A drafts excluded.
Pass condition: Phase 3A draft count in SEB reconciler result = 0.

---

### Category C — Scheduled Learning Agent

---

**TC-L01 — Scheduled run creates new learning_snapshots for an active tenant**

Input: Inngest cron fires; tenant has Phase 3B sends in the lookback window.
Expected: `learning_snapshots` rows are written with `run_id` = new UUID, `computed_at` ≈ now.
Pass condition: New rows present in `learning_snapshots` for tenant.

---

**TC-L02 — Scheduled run is advisory-only**

Input: Scheduled run completes.
Expected: No `message_strategies`, `message_versions`, or `quality_reviews` rows modified.
Pass condition: Code-level check — scheduled function calls `runLearningAnalysis` which is advisory-only.

---

**TC-L03 — Scheduled run emits LA_SIGNALS_COMPUTED activity event**

Input: Successful scheduled run for a tenant.
Expected: `activity_events` row with `event_type = 'LA_SIGNALS_COMPUTED'` and `metadata.triggered_by = 'scheduled:inngest'`.
Pass condition: Audit event distinguishable from manual run events.

---

**TC-L04 — Manual run continues to work after scheduled run infrastructure added**

Input: User clicks "Run Learning Analysis" button in the agent monitor while the scheduled function also exists.
Expected: Manual run executes `runLearningAnalysisAction` normally. New `learning_snapshots` written with new `run_id`. Agent monitor updates.
Pass condition: Manual trigger unaffected. Both manual and scheduled runs produce valid results.

---

**TC-L05 — Scheduled run for empty tenant returns safe no-data result**

Input: Tenant has zero Phase 3B sends in the 90-day window.
Expected: `runLearningAnalysis` returns `{ ok: true, snapshotCount: 0, totalSends: 0 }`. No error. Scheduled function logs as `no-data`.
Pass condition: No exception thrown. Tenant treated as no-data, not as failure.

---

**TC-L06 — Scheduled run correctly scopes per tenant**

Input: Two tenants, A and B, each with different Phase 3B send histories.
Expected: Tenant A's run produces snapshots only for Tenant A. Tenant B's run produces snapshots only for Tenant B.
Pass condition: `learning_snapshots.tenant_id` correct for each row. No cross-tenant data.

---

**TC-L07 — Scheduled run failure for one tenant does not abort others**

Input: Tenant A's `runLearningAnalysis` throws an error. Tenant B and C are queued after A.
Expected: Scheduled function catches Tenant A's error, logs it, emits `LA_SIGNALS_COMPUTATION_FAILED` for Tenant A, then continues with Tenant B and C.
Pass condition: Tenant B and C produce valid snapshots. Scheduled function returns with `tenantsWithError: 1`, not a global failure.

---

**TC-L08 — Concurrent manual and scheduled run produce valid distinct results**

Input: Scheduled run and manual run start within seconds of each other for the same tenant.
Expected: Both complete successfully. Two sets of `learning_snapshots` rows with different `run_id` values. UI shows the later one (higher `computed_at`).
Pass condition: No unique constraint violation, no data corruption. Both `run_id` values exist in `learning_snapshots`.

---

**TC-L09 — Repeated scheduled runs do not corrupt prior snapshots**

Input: Scheduled run fires Monday. Fires again Tuesday with the same tenant data.
Expected: Monday's snapshots remain untouched (different `run_id`). Tuesday's snapshots are new rows with a new `run_id`. The partial unique index prevents duplicates within a single `run_id`, not across runs.
Pass condition: Both Monday's and Tuesday's `run_id` rows exist. No rows overwritten or deleted.

---

**TC-L10 — Scheduled run does not modify strategy, QRA, or version records**

Input: Scheduled run completes for any tenant.
Expected: Zero writes to `message_strategies`, `quality_reviews`, `message_versions`.
Pass condition: Code-level guardrail check — scheduled function only calls `runLearningAnalysis` which has locked write path.

---

**TC-L11 — Scheduled run `triggeredBy` field contains sentinel value**

Input: Scheduled run completes.
Expected: `LA_SIGNALS_COMPUTED` event metadata contains `triggered_by: 'scheduled:inngest'`, distinguishable from manual run's user UUID.
Pass condition: Manual and scheduled runs are distinguishable in the audit trail.

---

**TC-L12 — Scheduled run result is visible in Inngest dashboard**

Design-level: The function returns a structured result (`tenantsProcessed`, `tenantsWithData`, `tenantsWithError`, `results[]`).
Expected: Inngest dashboard shows the summary for each scheduled run.
Pass condition: Return type is a serializable object with the required fields.

---

**TC-L13 — Scheduled cron does not fire if Inngest is not configured**

Input: `INNGEST_EVENT_KEY` is not set in the environment.
Expected: The Inngest client initializes but cron does not fire. No error in the application.
Pass condition: Application starts normally. No unhandled exception from missing Inngest key.

---

### Category D — Monitoring / Admin Visibility

---

**TC-M01 — Stuck draft count shown in Operational Health card**

Input: Agent monitor page loads with 2 State A stuck drafts for the tenant.
Expected: Operational Health card shows "2 stuck draft(s)" with a warning indicator.
Pass condition: Non-zero count displayed. Warning style applied.

---

**TC-M02 — Zero stuck drafts shows clean state**

Input: Agent monitor page loads with no stuck drafts.
Expected: "No stuck drafts detected." No warning indicator.
Pass condition: Clean state message shown.

---

**TC-M03 — Failed send count shown for last 24h**

Input: 3 `email_sends.status = 'failed'` rows in the last 24 hours for the tenant.
Expected: Operational Health shows "3 send failure(s) in the last 24 hours."
Pass condition: Correct count displayed. Warning indicator shown.

---

**TC-M04 — Failed send count = 0 shows clean state**

Input: No failed sends in last 24h.
Expected: "No send failures in the last 24 hours." Clean state.
Pass condition: Clean state message.

---

**TC-M05 — Learning Agent last run shown with timestamp**

Input: Agent monitor loads for tenant with completed Learning Agent runs.
Expected: "Last analysis run: {timestamp}" displayed. Snapshot count and total sends shown.
Pass condition: Timestamp and stats match latest `learning_snapshots.computed_at`.

---

**TC-M06 — Learning Agent last run shows failed status when last run failed**

Input: Most recent `activity_events` for tenant has `event_type = 'LA_SIGNALS_COMPUTATION_FAILED'`.
Expected: "Last analysis run: Failed" shown with error indication.
Pass condition: Failure status visible in the monitoring card.

---

**TC-M07 — Monitoring data loading failure is non-fatal**

Input: Operational Health query throws a database error.
Expected: Monitoring section shows "Unable to load operational data." Agent monitor page remains functional. Other sections (agent runs, system controls, learning signals) unaffected.
Pass condition: No uncaught exception. Page renders. Other sections intact.

---

**TC-M08 — No auto-action buttons on Operational Health card**

Input: Operational Health card renders with stuck drafts > 0.
Expected: Card shows count and advisory text. No "Fix" button, no "Retry" button, no "Send" button.
Pass condition: No interactive action elements on the Operational Health card that modify pipeline state.

---

**TC-M09 — High bounce/complaint advisory signals remain visible**

Input: Learning snapshots contain `bounce_rate ≥ 10%` with moderate confidence.
Expected: Advisory alert banner remains visible in the Learning Signals section. No regression from adding Operational Health card above it.
Pass condition: Advisory banner present below Operational Health card.

---

**TC-M10 — Operational Health card is admin-only or visible to all workspace members?**

Design-level question (see Section 17, Open Question 4): The implementation plan must decide visibility scope.
Expected: Implementation plan will specify. For now: design assumes visible to any workspace member with `crm.companies.view` permission (same as rest of agent monitor).
Pass condition: Consistent with existing agent monitor permission model.

---

**TC-M11 — Monitoring card layout order correct**

Design-level: Header/stats → System Controls → Operational Health → Learning Signals → Recent Agent Runs.
Expected: New Operational Health section appears between System Controls and Learning Signals.
Pass condition: Correct DOM/render order.

---

**TC-M12 — Advisory disclaimer present on Operational Health card**

Input: Operational Health card renders.
Expected: Text "All indicators above are informational. No automatic action is taken based on these signals." (or equivalent) is visible.
Pass condition: Disclaimer text present on the card.

---

## 16. Acceptance Criteria

Phase 3B.1 is complete when all of the following are true:

| Criterion | Status |
|-----------|--------|
| Migration `20240026` created with correct schema, indexes, FKs | Pending |
| `email_sends.message_version_id` and `strategy_id` populated for all new Phase 3B sends | Pending |
| JSONB metadata unchanged (existing behavior preserved) | Pending |
| Event Tracking uses explicit FK with JSONB fallback for old records | Pending |
| No regression in ET_ event emission for Phase 3B sends | Pending |
| Phase 3A sends remain unaffected | Pending |
| SEB reconciler Inngest function created | Pending |
| State A and B detected and reported (not auto-fixed) | Pending |
| State C detected and auto-fixed (supersede idempotent) | Pending |
| State E continues to be handled by existing reconciler | Pending |
| Scheduled Learning Agent Inngest function created | Pending |
| Scheduled run is advisory-only (same service, same guardrails) | Pending |
| Manual run continues to work | Pending |
| `triggeredBy: 'scheduled:inngest'` in LA audit events for scheduled runs | Pending |
| Operational Health card added to agent monitor | Pending |
| Stuck draft count visible | Pending |
| Failed send count visible | Pending |
| LA last run status visible | Pending |
| All monitoring data loading is non-fatal | Pending |
| No auto-action buttons on monitoring card | Pending |
| `npx vitest run` → ≥ 658 tests, 0 failures | Pending |
| `npx next build` → 0 errors | Pending |
| TypeScript → 0 errors | Pending |

---

## 17. Open Questions for Implementation Planning

The following questions are not resolved in this design document. They should be resolved in the implementation plan.

| # | Question | Implication |
|---|---------|-------------|
| 1 | **FK constraint behavior on message_versions soft-delete.** Phase 3B does not hard-delete message_versions. But if a future phase adds hard deletion, the FK on `email_sends.message_version_id` would throw a constraint error. Should the FK be `ON DELETE SET NULL` or `ON DELETE RESTRICT`? | `ON DELETE SET NULL` is safer for an attribution column. Implementation plan should confirm. |
| 2 | **`workspaceId` for scheduled Learning Agent runs.** The scheduled function needs a `workspaceId` to pass to `runLearningAnalysis`. Currently this is used for `learning_snapshots.workspace_id`. Should the scheduled run query the first workspace per tenant, or should `workspaceId` be made nullable in the service? | Making `workspaceId` nullable in the service is cleaner. Implementation plan should decide. |
| 3 | **SEB reconciler State B: report-only or auto-fix?** The design recommends report-only for State B (draft linked to pending approval_request). However, the auto-fix (resolve the approval_request to approved) is well-defined and safe. The implementation plan should confirm whether report-only is correct for v1. | If auto-fix is confirmed, the reconciler needs careful testing to avoid resolving approval_requests outside the SEB context. |
| 4 | **Operational Health card visibility.** Should the Operational Health card be visible to all workspace members, or only to admins (`tenant_admin`, `platform_admin`)? | The rest of the agent monitor uses `crm.companies.view`. Operational data (stuck counts, failed sends) may be too operational for all workspace members. Implementation plan should decide. |
| 5 | **Webhook failure indicator.** The current `webhook_events` table has a `processed` flag, but failures are logged via `console.error` and the record is still marked `processed`. The unprocessed count may not accurately reflect failures. Should a `processing_error` column be added to `webhook_events`, or should the failure indicator be skipped in Phase 3B.1? | Adding a column requires migration `20240027`. This may be scope-expanded beyond Phase 3B.1's intent. Recommendation: skip webhook failure indicator in Phase 3B.1 and surface it in Phase 3B.2 or via Inngest logs. Implementation plan should confirm. |
| 6 | **Scheduled Learning Agent cron time.** `0 6 * * *` (06:00 UTC daily) is proposed. Should this be configurable per tenant, or is a fixed UTC time acceptable for v1? | Fixed is acceptable for v1. A future system control can expose this. |
| 7 | **Should `reconcileSendBridgeStuckDrafts` be combined with the existing `reconcileEmailDraftStatus`?** The functions share similar detection patterns. Combining them into one function simplifies the Inngest function registry but increases function complexity. | Keep separate for Phase 3B.1. Combining is a refactor that can be done later. Implementation plan should confirm. |

---

## 18. Recommended Next Step

Once this design document is approved by the user:

**Phase 3B.1 Stabilization / Hardening — Implementation Plan**

That plan should specify:

1. Which open questions (Section 17) are resolved, and how
2. The exact migration SQL for `20240026`
3. The exact change to `email-send.service.ts` and `email-send.repo.ts` for FK population
4. The exact change to `app/api/webhooks/resend/route.ts` for the FK-first attribution path
5. The exact implementation of `reconcileSendBridgeStuckDrafts` Inngest function
6. The exact implementation of `scheduledLearningAgentRun` Inngest function
7. The exact changes to `inngest/index.ts` and `inngest/functions/`
8. The exact changes to the agent monitor page for the Operational Health card
9. The test file structure: which test cases are pure function tests vs. fixture-based
10. QA checklist: `npx vitest run` (≥ 658) + `npx next build` + TypeScript + guardrail grep

---

*Document status: Draft — Awaiting user review and approval before implementation planning begins.*
*Version: 1.0 — 2026-05-22*
