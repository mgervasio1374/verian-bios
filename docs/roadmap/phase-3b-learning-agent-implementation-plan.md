# Phase 3B Learning Agent — Implementation Plan

**Status:** Draft — Awaiting user approval before code implementation begins.
**Version:** 1.0
**Date:** 2026-05-21
**Prerequisite:** Design & Test Cases v1.0 approved (`docs/roadmap/phase-3b-learning-agent-design-test-cases.md`)

---

## 1. Executive Summary

This plan defines the engineering build for Phase 3B Learning Agent — the analytics and advisory layer that reads historical outcome data collected by Event Tracking and produces evidence-based learning signals about outbound messaging performance.

**What this implementation builds:**
- A `learning-agent` module with pure signal calculation, confidence helpers, and audit payload builders
- A `learning-snapshot.repo.ts` repository for writing and reading learning snapshots
- A `learning-agent.service.ts` orchestration service: `runLearningAnalysis`
- A `learning-agent.actions.ts` server action for on-demand triggering
- Two new `ActivityEventType` constants: `LA_SIGNALS_COMPUTED`, `LA_SIGNALS_COMPUTATION_FAILED`
- Migration `20240025_phase3b_learning_snapshots.sql` — new `learning_snapshots` table
- 42 test fixtures and a new `learning-agent.test.ts` suite
- A minimal read-only learning signals view in the agent monitor settings area

**What this implementation does not build:**
- No automatic strategy parameter changes
- No QRA score updates
- No message copy changes
- No new email sends or Resend API calls
- No external LLM calls
- No real-time feedback loop
- No cross-tenant data sharing
- No active learning weight adjustments

**Test count expectation:** 537 existing + ≥ 42 LA = ≥ 579 total

---

## 2. Final v1 Decisions

All seven open questions from the design document (Section 18) are resolved here.

| # | Question | v1 Decision |
|---|---------|------------|
| 1 | Trigger model | **On-demand only in v1.** A "Run Learning Analysis" button in the agent monitor triggers a server action. Scheduled cron (nightly) is deferred to v2 — it would require Inngest or a similar job infrastructure and adds operational complexity that is not justified for an advisory-only output layer. |
| 2 | Migration number | **`20240025`** — the next number after the current latest (`20240024_phase3b_quality_reviews.sql`). File: `20240025_phase3b_learning_snapshots.sql`. |
| 3 | Approval-to-send denominator source and join | **Two-step query using `activity_events`:** (a) Query `HRB_ACTION_APPROVED` events for the tenant in the lookback window → collect `entity_id` (= `message_version_id`) set. (b) Query `ET_SEND_INITIATED` events for the same tenant and window → collect `entity_id` set. (c) Approval-to-send denominator = count of unique version IDs from step (a). Numerator = count of version IDs in the intersection of (a) and (b). This join is correct because both event types use `entity_id = message_version_id` as the stable key. |
| 4 | Open/click tracking detection wording | **"No open/click events recorded."** When zero `ET_EMAIL_OPENED` events exist in the window for a given dimension, the Learning Agent produces a snapshot row with `confidence = 'insufficient'`, `numerator = 0`, `denominator = N` (delivered count), and `notes = 'No open events recorded in this window. Open tracking may not be enabled in Resend.'` No "0%" is displayed. The signal is presented as "unknown" not "zero." Same pattern for click rate. |
| 5 | `strategy_angle` join reliability | **Batch load from `message_versions` via `entity_id`.** The Learning Agent loads all distinct `entity_id` values from the ET_ event set, then batch-queries `message_versions` to retrieve `strategy_angle` and `message_type`. Versions where `strategy_angle = null` are excluded from angle-grouped signals and logged: "X versions excluded from angle grouping: strategy_angle null." This is expected to be rare since `strategy_angle` is always set by the Copywriting Agent at generation time. |
| 6 | Lookback window configuration | **Hardcoded 90 days in v1.** The value is defined as a constant (`LEARNING_AGENT_LOOKBACK_DAYS = 90`) in `learning-agent.types.ts`. A future implementation can expose it as a workspace system control. |
| 7 | `LA_` ActivityEventType naming | **`LA_SIGNALS_COMPUTED` and `LA_SIGNALS_COMPUTATION_FAILED`** — uppercase, underscore-separated, matching the `ET_` and `HRB_` prefix conventions already in use. Both are additive additions to the `ActivityEventType` const object. |

---

## 3. Non-Goals

| Non-Goal | Reason |
|----------|--------|
| Scheduled cron execution | Deferred to v2; on-demand is sufficient for advisory signals |
| Automatic strategy weight updates | Requires separately approved active-learning design |
| QRA score modifications | QRA is evaluation-only; locked |
| Message copy changes | Copy is immutable |
| New email sends | Learning Agent never initiates sends |
| External LLM calls | Deterministic arithmetic aggregation only |
| Real-time streaming analysis | Batch analytics; on-demand trigger only |
| Cross-tenant learning | All queries scoped to `tenant_id` |
| A/B statistical significance | Requires randomised assignment; future work |
| Reply tracking | Inbound email infrastructure not built |
| Revenue conversion | No conversion event defined |

---

## 4. Implementation Scope

### 4.1 New Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20240025_phase3b_learning_snapshots.sql` | New `learning_snapshots` table, indexes, RLS |
| `modules/messaging/learning-agent/learning-agent.types.ts` | Signal constants, interfaces, confidence types, snapshot shape |
| `modules/messaging/learning-agent/learning-agent.confidence.ts` | Pure helpers: `classifyConfidence`, `CONFIDENCE_THRESHOLDS`, `LOOKBACK_DAYS` |
| `modules/messaging/learning-agent/learning-agent.signals.ts` | Pure signal calculation functions: aggregate events, calculate rates, apply thresholds |
| `modules/messaging/learning-agent/learning-agent.audit.ts` | Pure payload builders: `buildSignalsComputedPayload`, `buildSignalsFailedPayload` |
| `modules/messaging/learning-agent/learning-agent.service.ts` | Orchestration: `runLearningAnalysis` |
| `modules/messaging/repositories/learning-snapshot.repo.ts` | `writeSnapshots`, `getLatestSnapshots`, `getSnapshotRunIds` |
| `modules/messaging/actions/learning-agent.actions.ts` | Server action: `runLearningAnalysisAction` |
| `tests/fixtures/learning-agent/TC-LA-001.json` → `TC-LA-042.json` | 42 test fixtures |
| `tests/learning-agent.test.ts` | LA test suite |

### 4.2 Existing Files to Modify

| File | Change |
|------|--------|
| `modules/intelligence/types.agent.ts` | Add 2 LA_ `ActivityEventType` constants (additive only) |
| `app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx` (or equivalent) | Add minimal read-only learning signals display and "Run Analysis" button |

### 4.3 Files Explicitly Not Modified

- All Phase 3B agent files (MSA, CA, QRA, HRB, Send Bridge, Event Tracking) — locked
- `modules/messaging/services/email-send.service.ts` — unchanged
- `app/api/webhooks/resend/route.ts` — unchanged
- `supabase/migrations/20240024*.sql` and earlier — unchanged
- Any existing repo that handles `message_strategies`, `quality_reviews`, or `message_versions` writes — the Learning Agent reads these tables through direct Supabase client queries (not via the existing write-path repos, to make the read-only intent explicit)

---

## 5. Proposed Module Structure

```
modules/
  messaging/
    learning-agent/
      learning-agent.types.ts          — all types, constants, signal definitions
      learning-agent.confidence.ts     — pure helpers: classify, threshold, cold-start
      learning-agent.signals.ts        — pure: aggregate events, calculate rates
      learning-agent.audit.ts          — pure: buildSignalsComputedPayload, buildSignalsFailedPayload

      learning-agent.service.ts        — orchestration: runLearningAnalysis

    repositories/
      learning-snapshot.repo.ts        — write/read learning_snapshots

    actions/
      learning-agent.actions.ts        — server action: runLearningAnalysisAction

modules/
  intelligence/
    types.agent.ts                     — extend: add 2 LA_ constants

supabase/
  migrations/
    20240025_phase3b_learning_snapshots.sql

app/
  (workspace)/
    [workspaceSlug]/
      settings/
        agent-monitor/
          page.tsx or sub-page        — extend: learning signals display (read-only)

tests/
  fixtures/
    learning-agent/
      TC-LA-001.json through TC-LA-042.json

  learning-agent.test.ts
```

---

## 6. Migration Plan

**File:** `supabase/migrations/20240025_phase3b_learning_snapshots.sql`

### 6.1 `learning_snapshots` Table Schema

```sql
CREATE TABLE learning_snapshots (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid        NOT NULL REFERENCES tenants(id),
  workspace_id     uuid        REFERENCES workspaces(id),
  run_id           uuid        NOT NULL,           -- Groups all snapshots from one analysis run
  signal_name      text        NOT NULL,           -- e.g. 'delivery_rate', 'bounce_rate'
  dimension        text        NOT NULL,           -- e.g. 'tenant_wide', 'score_band', 'message_type'
  dimension_value  text        NOT NULL,           -- e.g. 'all', 'strong', 'close_deal_now'
  numerator        integer     NOT NULL DEFAULT 0,
  denominator      integer     NOT NULL DEFAULT 0,
  rate             numeric(6,4),                   -- null when denominator = 0 or confidence = 'insufficient'
  sample_n         integer     NOT NULL DEFAULT 0, -- = denominator
  confidence       text        NOT NULL,           -- 'insufficient' | 'low' | 'moderate' | 'high'
  lookback_days    integer     NOT NULL DEFAULT 90,
  window_start     timestamptz NOT NULL,
  window_end       timestamptz NOT NULL,
  advisory         boolean     NOT NULL DEFAULT true,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  notes            text,
  deleted_at       timestamptz
);
```

### 6.2 Unique Constraint (Idempotency Within a Run)

```sql
CREATE UNIQUE INDEX uix_learning_snapshots_run_signal
  ON learning_snapshots (tenant_id, run_id, signal_name, dimension, dimension_value)
  WHERE deleted_at IS NULL;
```

This prevents the same signal from being written twice in the same run, while allowing multiple runs for the same tenant (each with its own `run_id` and `computed_at`).

### 6.3 Indexes

```sql
-- Primary query pattern: latest snapshots for a tenant
CREATE INDEX idx_learning_snapshots_tenant_computed
  ON learning_snapshots (tenant_id, computed_at DESC)
  WHERE deleted_at IS NULL;

-- Query by dimension for UI display
CREATE INDEX idx_learning_snapshots_dimension
  ON learning_snapshots (tenant_id, dimension, dimension_value, computed_at DESC)
  WHERE deleted_at IS NULL;

-- Query by run_id for fetching all snapshots from a specific run
CREATE INDEX idx_learning_snapshots_run_id
  ON learning_snapshots (tenant_id, run_id)
  WHERE deleted_at IS NULL;
```

### 6.4 RLS Policy

```sql
ALTER TABLE learning_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role (used by Learning Agent service) has full access via service client
-- Authenticated users can read their own tenant's snapshots
CREATE POLICY "users can read own tenant learning snapshots"
  ON learning_snapshots FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policy for authenticated users —
-- all writes are done via service role (service client).
```

### 6.5 Advisory Constraint

```sql
-- Enforce advisory = true at DB level for v1 —
-- the Learning Agent never writes advisory = false
ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_advisory_true CHECK (advisory = true);
```

### 6.6 Check Constraints

```sql
ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_valid_confidence CHECK (
    confidence IN ('insufficient', 'low', 'moderate', 'high')
  );

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_valid_signal_name CHECK (
    signal_name IN (
      'send_success_rate',
      'send_failure_rate',
      'delivery_rate',
      'bounce_rate',
      'complaint_rate',
      'delivery_failure_rate',
      'open_rate',
      'click_rate',
      'approval_to_send_rate',
      'unknown_outcome_rate'
    )
  );

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_valid_dimension CHECK (
    dimension IN (
      'tenant_wide',
      'message_type',
      'strategy_angle',
      'score_band',
      'qra_recommended',
      'version_label'
    )
  );

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_rate_range CHECK (
    rate IS NULL OR (rate >= 0 AND rate <= 1)
  );

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_denominator_nonneg CHECK (denominator >= 0);

ALTER TABLE learning_snapshots
  ADD CONSTRAINT chk_numerator_nonneg CHECK (numerator >= 0);
```

---

## 7. Type Contracts and Interfaces

**File:** `modules/messaging/learning-agent/learning-agent.types.ts`

All types and constants use `as const`. No `enum` keyword.

### 7.1 Signal Name Constants

```
const LA_SIGNAL_NAMES = {
  SEND_SUCCESS_RATE:      'send_success_rate',
  SEND_FAILURE_RATE:      'send_failure_rate',
  DELIVERY_RATE:          'delivery_rate',
  BOUNCE_RATE:            'bounce_rate',
  COMPLAINT_RATE:         'complaint_rate',
  DELIVERY_FAILURE_RATE:  'delivery_failure_rate',
  OPEN_RATE:              'open_rate',
  CLICK_RATE:             'click_rate',
  APPROVAL_TO_SEND_RATE:  'approval_to_send_rate',
  UNKNOWN_OUTCOME_RATE:   'unknown_outcome_rate',
} as const

type LaSignalName = typeof LA_SIGNAL_NAMES[keyof typeof LA_SIGNAL_NAMES]
```

### 7.2 Dimension Constants

```
const LA_DIMENSIONS = {
  TENANT_WIDE:      'tenant_wide',
  MESSAGE_TYPE:     'message_type',
  STRATEGY_ANGLE:   'strategy_angle',
  SCORE_BAND:       'score_band',
  QRA_RECOMMENDED:  'qra_recommended',
  VERSION_LABEL:    'version_label',
} as const

type LaDimension = typeof LA_DIMENSIONS[keyof typeof LA_DIMENSIONS]
```

### 7.3 Confidence Constants

```
const LA_CONFIDENCE = {
  INSUFFICIENT: 'insufficient',
  LOW:          'low',
  MODERATE:     'moderate',
  HIGH:         'high',
} as const

type LaConfidence = typeof LA_CONFIDENCE[keyof typeof LA_CONFIDENCE]
```

### 7.4 Action Type Constants

```
const LA_ACTION_TYPES = {
  LA_SIGNALS_COMPUTED:           'LA_SIGNALS_COMPUTED',
  LA_SIGNALS_COMPUTATION_FAILED: 'LA_SIGNALS_COMPUTATION_FAILED',
} as const

type LaActionType = typeof LA_ACTION_TYPES[keyof typeof LA_ACTION_TYPES]
```

### 7.5 Core Interfaces

```
// Single computed signal — maps to one learning_snapshots row
interface LearningSignal {
  signalName:      LaSignalName
  dimension:       LaDimension
  dimensionValue:  string
  numerator:       number
  denominator:     number
  rate:            number | null
  sampleN:         number
  confidence:      LaConfidence
  advisory:        true
  notes:           string | null
}

// Input to runLearningAnalysis
interface LearningAnalysisInput {
  tenantId:     string
  workspaceId:  string
  triggeredBy:  string           // userId of the reviewer who clicked "Run Analysis"
  lookbackDays: number           // default: LEARNING_AGENT_LOOKBACK_DAYS = 90
}

// Result from runLearningAnalysis
interface LearningAnalysisResult {
  ok:             boolean
  runId?:         string
  snapshotCount?: number
  totalSends?:    number
  errorReason?:   string
}

// Payload for LA_SIGNALS_COMPUTED activity event
interface LaSignalsComputedPayload {
  action_type:     'LA_SIGNALS_COMPUTED'
  run_id:          string
  tenant_id:       string
  signals_computed: number
  total_sends:     number
  lookback_days:   number
  window_start:    string
  window_end:      string
  triggered_by:    string
  computed_at:     string
}

// Payload for LA_SIGNALS_COMPUTATION_FAILED activity event
interface LaSignalsFailedPayload {
  action_type:  'LA_SIGNALS_COMPUTATION_FAILED'
  run_id:       string
  tenant_id:    string
  error_reason: string
  triggered_by: string
  timestamp:    string
}
```

### 7.6 Constants

```
// Lookback window: hardcoded 90 days in v1
const LEARNING_AGENT_LOOKBACK_DAYS = 90

// Minimum send count for standard signals
const STANDARD_THRESHOLDS = {
  insufficient: 5,   // < 5 → insufficient
  low:          20,  // 5–19 → low
  moderate:     50,  // 20–49 → moderate
  // ≥ 50 → high
} as const

// Minimum delivered count for open/click rate signals (sparser events)
const ENGAGEMENT_THRESHOLDS = {
  insufficient: 10,  // < 10 → insufficient
  low:          30,  // 10–29 → low
  moderate:     100, // 30–99 → moderate
  // ≥ 100 → high
} as const
```

---

## 8. Pure Function Design

### 8.1 `learning-agent.confidence.ts`

Pure functions — no I/O, no async.

```
classifyConfidence(n: number, thresholds: typeof STANDARD_THRESHOLDS): LaConfidence
  → Returns 'insufficient' | 'low' | 'moderate' | 'high' based on n vs thresholds

calculateRate(numerator: number, denominator: number): number | null
  → Returns null if denominator = 0; else numerator / denominator

isEngagementSignal(signalName: LaSignalName): boolean
  → Returns true for 'open_rate' and 'click_rate' — these use ENGAGEMENT_THRESHOLDS
```

### 8.2 `learning-agent.signals.ts`

Pure functions — no I/O, no async. All inputs pre-loaded.

The key challenge: the Learning Agent receives raw `activity_events` rows and supporting lookup maps, and must produce `LearningSignal[]` for each dimension. The pure functions take pre-loaded data and perform aggregation.

```
// Primary aggregation input shape (built by service from loaded data)
interface PhaseB3bEventRecord {
  entityId:           string   // message_version_id
  eventType:          string   // ET_SEND_INITIATED, ET_EMAIL_DELIVERED, etc.
  strategyId:         string | null
  qualityReviewId:    string | null
  versionLabel:       string | null
  compositeScore:     number | null
  occurredAt:         string
}

// Dimension context loaded by service for joining
interface VersionDimensionContext {
  versionId:        string
  strategyAngle:    string | null
  messageType:      string | null
  scoreBand:        string | null     // from quality_reviews
  isRecommended:    boolean | null    // from quality_reviews
}

// Build a per-version event summary (called by service before pure functions)
buildVersionEventMap(
  events: PhaseB3bEventRecord[]
): Map<string, Set<string>>
  → Returns Map<versionId, Set<eventType>> with deduplication applied

// Calculate all signals for a given group of version IDs
calculateSignalsForGroup(params: {
  versionIds:       Set<string>
  versionEventMap:  Map<string, Set<string>>
  signalName:       LaSignalName
  dimension:        LaDimension
  dimensionValue:   string
}): LearningSignal

// Top-level function: iterate all dimensions and calculate all signals
calculateAllSignals(params: {
  events:              PhaseB3bEventRecord[]
  dimensionContextMap: Map<string, VersionDimensionContext>
  approvedVersionIds:  Set<string>  // from HRB_ACTION_APPROVED events
}): LearningSignal[]
```

### 8.3 `learning-agent.audit.ts`

Pure payload builders — no I/O, no async.

```
buildSignalsComputedPayload(params: {
  runId:           string
  tenantId:        string
  snapshotsCount:  number
  totalSends:      number
  lookbackDays:    number
  windowStart:     string
  windowEnd:       string
  triggeredBy:     string
}): LaSignalsComputedPayload

buildSignalsFailedPayload(params: {
  runId:        string
  tenantId:     string
  errorReason:  string
  triggeredBy:  string
}): LaSignalsFailedPayload
```

---

## 9. Repository Design

**File:** `modules/messaging/repositories/learning-snapshot.repo.ts`

Read-only consumer of `message_versions`, `quality_reviews`, and `activity_events`. Write-only to `learning_snapshots`.

### 9.1 Write Functions

```
writeSnapshots(params: {
  runId:       string
  tenantId:    string
  workspaceId: string
  signals:     LearningSignal[]
  windowStart: string
  windowEnd:   string
  computedAt:  string
  lookbackDays: number
}): Promise<number>
  → Inserts all LearningSignal rows into learning_snapshots with run_id.
  → Uses INSERT with ON CONFLICT DO NOTHING on the partial unique index
    (tenant_id, run_id, signal_name, dimension, dimension_value WHERE deleted_at IS NULL)
    to be safe against accidental double-writes within the same run.
  → Returns count of rows inserted.
```

### 9.2 Read Functions (for UI)

```
getLatestRunId(tenantId: string): Promise<string | null>
  → SELECT run_id FROM learning_snapshots WHERE tenant_id = X AND deleted_at IS NULL
    ORDER BY computed_at DESC LIMIT 1
  → Returns the most recent run_id for the tenant

getSnapshotsByRunId(tenantId: string, runId: string): Promise<SnapshotRow[]>
  → Returns all learning_snapshots for the given run_id

getLatestSnapshotsForTenant(tenantId: string): Promise<SnapshotRow[]>
  → Fetches all rows for the latest run_id
  → Equivalent to: getSnapshotsByRunId(tenantId, await getLatestRunId(tenantId))

listRunIds(tenantId: string, limit: number): Promise<{ runId: string; computedAt: string }[]>
  → Returns the N most recent run_ids for the tenant (for historical comparison)
```

### 9.3 Data-Loading Functions (for service, reading source tables)

These are read-only queries against existing tables. They do not modify any data.

```
loadPhase3bActivityEvents(params: {
  tenantId:     string
  windowStart:  string
  windowEnd:    string
  eventTypes:   string[]  // ET_ types + HRB_ACTION_APPROVED
}): Promise<ActivityEventRow[]>
  → SELECT from activity_events WHERE tenant_id, event_type IN (...), occurred_at >= windowStart
  → Filters to metadata.source = 'phase_3b_send_bridge' for ET_ events
    (HRB_ACTION_APPROVED does not have source in metadata — matched by event_type only)

loadVersionDimensions(
  tenantId:   string,
  versionIds: string[]
): Promise<Map<string, VersionDimensionContext>>
  → Batch query: message_versions WHERE id IN (versionIds)
  → Batch query: quality_reviews WHERE version_id IN (versionIds)
  → Merges into Map<versionId, VersionDimensionContext>
  → Handles null strategy_angle and null score_band gracefully
```

**Why separate from the existing repos?** The Learning Agent's data loading is read-only and cross-cutting — it needs to join multiple tables in ways that the existing purpose-built repos don't support. Using the Supabase client directly (via service client) keeps the Learning Agent's read path explicit and separate from the operational repos that handle writes.

---

## 10. Service Boundary Design

**File:** `modules/messaging/learning-agent/learning-agent.service.ts`

### 10.1 `runLearningAnalysis(input: LearningAnalysisInput): Promise<LearningAnalysisResult>`

**Purpose:** Execute the full learning analysis flow and write snapshot results.

**Flow:**

```
STEP 1 — Validate input
  → tenantId must be non-null
  → lookbackDays must be between 30 and 365

STEP 2 — Generate run_id and window
  → run_id = crypto.randomUUID()
  → windowEnd = now()
  → windowStart = windowEnd - lookbackDays days

STEP 3 — Load ET_ events from activity_events
  → Load all ET_ event types + HRB_ACTION_APPROVED for tenant/window
  → Filter ET_ events to metadata.source === 'phase_3b_send_bridge'
  → HRB_ACTION_APPROVED events: no source filter (HRB doesn't write source)
  → Collect all distinct entity_ids (message_version_ids) from ET_ events

STEP 4 — Load version dimension context
  → Batch-load message_versions for all distinct entity_ids
  → Batch-load quality_reviews for all distinct entity_ids
  → Merge into Map<versionId, VersionDimensionContext>
  → Log count of versionIds where strategy_angle = null (excluded from angle grouping)

STEP 5 — Build HRB approved version ID set
  → From HRB_ACTION_APPROVED events: collect entity_ids (= approved version_ids)
  → These form the denominator for approval_to_send_rate signal

STEP 6 — Call pure calculation function
  → calculateAllSignals({ events, dimensionContextMap, approvedVersionIds })
  → Returns LearningSignal[] (may be empty for cold-start tenants)

STEP 7 — Write snapshots to learning_snapshots
  → writeSnapshots({ runId, tenantId, workspaceId, signals, windowStart, windowEnd, computedAt, lookbackDays })
  → If zero signals produced, still writes a "zero sends" sentinel row for UI display
  → Records snapshotCount from return value

STEP 8 — Emit LA_SIGNALS_COMPUTED activity event (non-fatal)
  → activityEventService.recordActivity({
      tenantId, workspaceId,
      eventType: 'LA_SIGNALS_COMPUTED',
      eventSummary: `Learning Agent computed ${snapshotCount} signals for ${totalSends} sends`,
      metadata: buildSignalsComputedPayload(...)
    }).catch(() => {})

STEP 9 — Return result
  → { ok: true, runId, snapshotCount, totalSends }

ON ERROR (any step 3–7):
  → Emit LA_SIGNALS_COMPUTATION_FAILED (non-fatal)
  → Return { ok: false, errorReason: error.message }
  → Prior snapshots remain accessible
```

**Critical constraint:** If step 7 (write) fails after step 6 (calculate), the calculation is discarded and the service returns failure. No partial snapshot writes. The prior run's snapshots remain intact.

---

## 11. Signal Calculation Rules

This section defines exactly how each signal is computed from the event set.

### 11.1 Deduplication Rule (Universal)

For all signals, **each `message_version_id` (entity_id) is counted at most once per event type**. Multiple `ET_EMAIL_OPENED` events for the same version (different opens by the same person, each with a unique `provider_event_id`) count as ONE open for rate calculation purposes.

**Implementation:** Build a `Map<versionId, Set<eventType>>` (the `buildVersionEventMap` function). For each versionId, the Set tracks which event types it has at least one of. Rate calculations use `Set.has(eventType)` logic.

### 11.2 Per-Signal Numerator and Denominator

| Signal | Denominator version set | Numerator version set |
|--------|------------------------|----------------------|
| `send_success_rate` | Has `ET_SEND_INITIATED` | Has `ET_SEND_SUCCEEDED` |
| `send_failure_rate` | Has `ET_SEND_INITIATED` | Has `ET_SEND_FAILED` |
| `delivery_rate` | Has `ET_SEND_SUCCEEDED` | Has `ET_EMAIL_DELIVERED` |
| `bounce_rate` | Has `ET_SEND_SUCCEEDED` | Has `ET_EMAIL_BOUNCED` |
| `complaint_rate` | Has `ET_SEND_SUCCEEDED` | Has `ET_EMAIL_COMPLAINED` |
| `delivery_failure_rate` | Has `ET_SEND_SUCCEEDED` | Has `ET_EMAIL_DELIVERY_FAILED` |
| `open_rate` | Has `ET_EMAIL_DELIVERED` | Has `ET_EMAIL_OPENED` |
| `click_rate` | Has `ET_EMAIL_DELIVERED` | Has `ET_EMAIL_CLICKED` |
| `unknown_outcome_rate` | Has `ET_SEND_SUCCEEDED` | Has `ET_SEND_SUCCEEDED` AND NOT has any of `ET_EMAIL_DELIVERED`, `ET_EMAIL_BOUNCED`, `ET_EMAIL_COMPLAINED`, `ET_EMAIL_DELIVERY_FAILED` |
| `approval_to_send_rate` | In `approvedVersionIds` set (HRB approvals) | In `approvedVersionIds` AND has `ET_SEND_INITIATED` |

All sets are intersected with the **dimension filter** before calculation:
- `tenant_wide` → all versionIds in the full event set
- `message_type = 'X'` → versionIds where `dimensionContextMap.get(versionId).messageType === 'X'`
- `strategy_angle = 'X'` → versionIds where `dimensionContextMap.get(versionId).strategyAngle === 'X'`
- `score_band = 'X'` → versionIds where `dimensionContextMap.get(versionId).scoreBand === 'X'`
- `qra_recommended = 'true'` → versionIds where `dimensionContextMap.get(versionId).isRecommended === true`
- `version_label = 'A'` → versionIds where their `version_label` (from ET_ metadata) matches

### 11.3 Confidence Classification

```
Standard signals (all except open_rate, click_rate):
  denominator < 5   → 'insufficient'  (rate = null)
  denominator 5–19  → 'low'           (rate calculated)
  denominator 20–49 → 'moderate'      (rate calculated)
  denominator ≥ 50  → 'high'          (rate calculated)

Engagement signals (open_rate, click_rate):
  denominator < 10   → 'insufficient'  (rate = null, special notes)
  denominator 10–29  → 'low'           (rate calculated)
  denominator 30–99  → 'moderate'      (rate calculated)
  denominator ≥ 100  → 'high'          (rate calculated)
```

When `confidence = 'insufficient'`, `rate = null` — not 0%, not undefined, explicitly null.

### 11.4 Open/Click Rate Zero-Event Handling

If a dimension's delivered count is ≥ the threshold but `ET_EMAIL_OPENED` count is 0:
- `open_rate = 0.0` (i.e., 0/N)
- `confidence` = calculated normally from delivered count
- `notes = 'Zero open events recorded. Open tracking may not be enabled in Resend.'`

This is different from the case where the delivered count is below threshold (where `rate = null`).

### 11.5 Missing Metadata Handling

For ET_ events where `metadata.strategy_id = null`:
- The version IS included in tenant-wide signal denominator/numerator
- The version is EXCLUDED from strategy_id-grouped signals
- Log entry: count of excluded versions per signal
- No error thrown

For ET_ events where `metadata.composite_score` is not a number:
- The version is excluded from `score_band` grouping
- Log entry: count of excluded events with malformed composite_score
- No error thrown

### 11.6 Approval-to-Send Calculation Detail

**Step 1** — Collect all version IDs from `HRB_ACTION_APPROVED` events in the window:
```
approvedVersionIds = new Set(
  hrbApprovedEvents.map(e => e.entity_id).filter(Boolean)
)
```

**Step 2** — Collect all version IDs from `ET_SEND_INITIATED` events in the window:
```
sentVersionIds = new Set(
  etInitiatedEvents.map(e => e.entity_id).filter(Boolean)
)
```

**Step 3** — Calculate:
```
denominator = approvedVersionIds.size
numerator   = [...approvedVersionIds].filter(id => sentVersionIds.has(id)).length
```

**Edge cases:**
- A version that was approved in the window but sent outside the window: counted in denominator (approved), NOT in numerator (send initiated outside window) — correctly counted as "approved but not sent within window"
- A version that was sent but HRB approval event is outside the window: counted in numerator (sent), NOT in denominator — this is acceptable; the signal measures "of versions approved in this window, how many were sent?"
- `entity_id = null` in HRB events: logged and excluded from both sets

---

## 12. Server Action Design

**File:** `modules/messaging/actions/learning-agent.actions.ts`

```
'use server'

runLearningAnalysisAction(workspaceSlug: string)
  : Promise<{ success: boolean; snapshotCount?: number; totalSends?: number; error?: string }>

Behavior:
  1. createSupabaseServerClient() + buildRequestContext(supabase)
  2. requirePermission(ctx, 'crm.companies.view')  // existing permission pattern
  3. Call learningAgentService.runLearningAnalysis({
       tenantId:     ctx.tenantId,
       workspaceId:  ctx.workspaceId,
       triggeredBy:  ctx.userId,
       lookbackDays: LEARNING_AGENT_LOOKBACK_DAYS,
     })
  4. On success: revalidatePath(`/${workspaceSlug}/settings/agent-monitor`)
  5. Return { success: true, snapshotCount, totalSends } or { success: false, error }
```

---

## 13. `types.agent.ts` Changes

**File:** `modules/intelligence/types.agent.ts`

Add 2 LA_ constants to the `ActivityEventType` const object. **Additive only** — no existing entries modified.

```
  // Phase 3B — Learning Agent (additive)
  LA_SIGNALS_COMPUTED:           'LA_SIGNALS_COMPUTED',
  LA_SIGNALS_COMPUTATION_FAILED: 'LA_SIGNALS_COMPUTATION_FAILED',
```

These are appended after the existing ET_ constants. The `ActivityEventType` union type is regenerated automatically from the const object.

---

## 14. UI Design (Minimal Read-Only)

The v1 UI is minimal and read-only. It lives in the existing agent monitor settings area.

**File modified:** `app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx` (or the appropriate settings page structure)

### 14.1 Learning Signals Section

Displayed below existing agent monitor content:

```
Section header: "Learning Signals (Phase 3B Revenue Learning Engine)"

If no snapshots exist:
  "No learning analysis has been run yet.
   Click 'Run Analysis' to compute outcome signals from your Phase 3B send history."

If snapshots exist:
  "Last computed: [computed_at timestamp] · [totalSends] Phase 3B sends analysed · 90-day window"
  "All signals are advisory only. No automatic actions are taken."

  Display table:
  | Signal | Dimension | Value | Rate | N | Confidence |
  | Delivery rate | Score band | Strong | 93.6% | 47 | Moderate |
  | Bounce rate | Tenant-wide | All | 4.2% | 47 | Moderate |
  ...

  If confidence = 'insufficient': show "—" for rate, show "Insufficient data (N < 5)"

Button: [Run Learning Analysis]
  → Calls runLearningAnalysisAction
  → Shows loading state while running
  → Refreshes on completion
```

### 14.2 Alert Display (Advisory Only)

If the latest snapshot contains signals exceeding advisory alert thresholds (complaint rate ≥ 0.5% or bounce rate ≥ 10%, with moderate+ confidence), display a banner:

```
⚠ Advisory: Complaint rate for [dimension] is [X]% — review send practices.
This is informational only. No automatic action has been taken.
```

### 14.3 Page Loader Changes

The `agent-monitor` page needs to:
1. Load the latest run's snapshots via `learningSnapshotRepo.getLatestSnapshotsForTenant`
2. Pass snapshots to the display component
3. Pass `snapshotCount = 0` for cold-start tenants

---

## 15. Integration With Existing Infrastructure

### 15.1 `activity-event.service.ts`

The Learning Agent uses `activityEventService.recordActivity` for both audit events. Same non-fatal pattern as HRB, SEB, and Event Tracking: `.catch(() => {})`.

### 15.2 `event-tracking.attribution.ts`

The `extractPhase3bMeta` pure function from Event Tracking can be reused to parse `metadata` fields from ET_ activity events. The Learning Agent imports it directly to avoid duplicating the metadata extraction logic.

### 15.3 No Modification to Event Tracking

The Learning Agent reads from tables already populated by Event Tracking. It does not modify any Event Tracking behavior, files, or data.

---

## 16. Test Fixture Plan

**Fixture location:** `tests/fixtures/learning-agent/TC-LA-001.json` through `TC-LA-042.json`

**Fixture schema:**

```json
{
  "meta": {
    "test_case_id": "TC-LA-001",
    "scenario_name": "no_phase3b_sends_returns_insufficient_data",
    "description": "..."
  },
  "input": {
    "events": [],
    "version_dimensions": {},
    "approved_version_ids": []
  },
  "expected": {
    "all_signals_insufficient": true,
    "rate_null": true,
    "total_sends": 0
  }
}
```

**Coverage by test case (TC-LA-001 through TC-LA-042):** All 42 design test cases from the Design & Test Cases document map 1:1 to fixtures.

---

## 17. Test Suite Structure

**File:** `tests/learning-agent.test.ts`

```
Learning Agent — Confidence and Threshold Tests
  ├── classifyConfidence: standard thresholds (0–4, 5–19, 20–49, ≥50)
  ├── classifyConfidence: engagement thresholds (0–9, 10–29, 30–99, ≥100)
  ├── calculateRate: null when denominator = 0
  ├── calculateRate: correct arithmetic for non-zero denominator
  └── isEngagementSignal: true for open_rate and click_rate only

Learning Agent — Signal Calculation Tests (pure functions)
  ├── buildVersionEventMap: deduplicates multiple opens for same version
  ├── buildVersionEventMap: correctly maps event types per version
  ├── calculateAllSignals: tenant-wide delivery rate from event set
  ├── calculateAllSignals: bounce rate from event set
  ├── calculateAllSignals: complaint rate from event set
  ├── calculateAllSignals: send failure rate from event set
  ├── calculateAllSignals: open rate (zero events → 0.0, not null, with note)
  ├── calculateAllSignals: click rate (zero events → 0.0, not null, with note)
  ├── calculateAllSignals: open rate (insufficient delivered count → null)
  ├── calculateAllSignals: approval-to-send rate (correct intersection)
  ├── calculateAllSignals: unknown outcome rate (sent, no follow-on event)
  ├── calculateAllSignals: groups by score_band correctly
  ├── calculateAllSignals: groups by message_type correctly
  ├── calculateAllSignals: groups by strategy_angle correctly
  ├── calculateAllSignals: groups by qra_recommended correctly
  ├── calculateAllSignals: Phase 3A events excluded (metadata.source filter)
  ├── calculateAllSignals: version with null strategy_angle excluded from angle grouping
  ├── calculateAllSignals: version with malformed composite_score excluded from score_band
  └── calculateAllSignals: cold start (empty event set → all insufficient)

Learning Agent — Audit Builder Tests
  ├── buildSignalsComputedPayload: has LA_SIGNALS_COMPUTED action_type
  ├── buildSignalsComputedPayload: includes all required fields
  ├── buildSignalsFailedPayload: has LA_SIGNALS_COMPUTATION_FAILED action_type
  └── buildSignalsFailedPayload: includes error_reason

Learning Agent — Guardrail Tests
  ├── No message_strategy update in any signal
  ├── No quality_review update in any signal
  ├── No message_version copy update in any signal
  ├── No email_sends insert in any signal
  ├── advisory flag is always true
  ├── confidence always one of four valid values
  └── rate always null or 0.0–1.0

Learning Agent — Fixture-Based Tests (42 test cases)
  └── For each TC-LA-001 through TC-LA-042:
        Load fixture → run calculateAllSignals (or classifyConfidence) → assert expected
```

**Expected new tests:** ≥ 42 (targeting ~60–65 including pure function unit tests above)
**Expected total tests after implementation:** ≥ 579 (537 + ≥ 42)

---

## 18. QA Checklist

Before marking implementation complete:

### Logic and Calculation

- [ ] `learning-agent.types.ts` created with all constants and interfaces
- [ ] `learning-agent.confidence.ts` with `classifyConfidence`, `calculateRate`, threshold constants
- [ ] `learning-agent.signals.ts` with `buildVersionEventMap`, `calculateAllSignals`, and all per-signal helpers
- [ ] `learning-agent.audit.ts` with `buildSignalsComputedPayload`, `buildSignalsFailedPayload`
- [ ] All signals match the numerator/denominator definitions in Section 11.2
- [ ] `advisory = true` enforced on all computed signals (not just runtime — DB constraint also)

### Migration

- [ ] `20240025_phase3b_learning_snapshots.sql` created with correct table, indexes, RLS, check constraints
- [ ] `advisory` column has DB-level `CHECK (advisory = true)` constraint
- [ ] Unique partial index on `(tenant_id, run_id, signal_name, dimension, dimension_value) WHERE deleted_at IS NULL`
- [ ] `confidence` column check constraint covers all 4 valid values
- [ ] `signal_name` check constraint covers all 10 valid signal names
- [ ] `dimension` check constraint covers all 6 valid dimension values

### Repository

- [ ] `learning-snapshot.repo.ts` created with `writeSnapshots`, `getLatestRunId`, `getSnapshotsByRunId`, `getLatestSnapshotsForTenant`, `loadPhase3bActivityEvents`, `loadVersionDimensions`
- [ ] No existing repo files modified
- [ ] `writeSnapshots` uses INSERT with ON CONFLICT DO NOTHING (not upsert that overwrites)
- [ ] `loadPhase3bActivityEvents` filters correctly to Phase 3B events only
- [ ] Phase 3B filter: ET_ events filtered via `metadata.source = 'phase_3b_send_bridge'`; `HRB_ACTION_APPROVED` events matched by `event_type` only (no source filter)

### Service

- [ ] `learning-agent.service.ts` implements `runLearningAnalysis` in 9-step flow
- [ ] Failed computation emits `LA_SIGNALS_COMPUTATION_FAILED` (non-fatal)
- [ ] Successful computation emits `LA_SIGNALS_COMPUTED` (non-fatal)
- [ ] No partial snapshot writes on failure
- [ ] `extractPhase3bMeta` from event-tracking.attribution.ts is reused (not duplicated)

### `types.agent.ts`

- [ ] 2 LA_ constants added (additive only — no existing entries modified)
- [ ] TypeScript compiles cleanly with new union type

### Server Action

- [ ] `learning-agent.actions.ts` created with `runLearningAnalysisAction`
- [ ] Permission check uses existing `crm.companies.view` pattern
- [ ] `revalidatePath` called on success

### UI

- [ ] Agent monitor page loads latest learning snapshots
- [ ] "Run Learning Analysis" button calls server action
- [ ] Cold start (no snapshots) shows informational message
- [ ] Insufficient confidence shows "—" not "0%"
- [ ] Advisory alert displayed when complaint or bounce rate exceeds threshold
- [ ] All advisory banners include "advisory only — no automatic action taken"

### Guardrail Verification

- [ ] Grep: no `message_strategies` INSERT or UPDATE in learning-agent files
- [ ] Grep: no `quality_reviews` INSERT or UPDATE in learning-agent files
- [ ] Grep: no `message_versions` INSERT or UPDATE in learning-agent files
- [ ] Grep: no `email_sends` INSERT in learning-agent files
- [ ] Grep: no `email_drafts` INSERT in learning-agent files
- [ ] Grep: no `resend.emails.send` in learning-agent files
- [ ] Grep: no external LLM API calls in learning-agent files
- [ ] Grep: no cross-tenant queries (all queries include `tenant_id =` filter)

### Test Suite

- [ ] 42 fixtures created (`TC-LA-001.json` through `TC-LA-042.json`)
- [ ] `tests/learning-agent.test.ts` created
- [ ] `npx vitest run` → PASSED, ≥ 579 tests (537 + ≥ 42), 0 failures
- [ ] All 537 existing tests still pass (no regressions)
- [ ] `npx next build` → PASSED, 0 errors
- [ ] TypeScript → PASSED
- [ ] `npx eslint` on modified files → 0 errors

---

## 19. Implementation Sequence

Execute steps in this order. Complete each before starting the next.

1. **Inspect** — Re-read all source files at implementation time. Confirm `HRB_ACTION_APPROVED` events use `entity_id = message_version_id`. Confirm `message_versions.strategy_angle` is always populated. Confirm the `activity_events` table has `metadata` jsonb and `entity_id` columns.

2. **Migration** — Create `supabase/migrations/20240025_phase3b_learning_snapshots.sql`. Apply to local database if needed for TypeScript type regeneration.

3. **`learning-agent.types.ts`** — Create. All constants and interfaces. `as const` throughout.

4. **`learning-agent.confidence.ts`** — Create. `classifyConfidence`, `calculateRate`, `isEngagementSignal`, threshold constants, `LEARNING_AGENT_LOOKBACK_DAYS`.

5. **`learning-agent.signals.ts`** — Create. `buildVersionEventMap`, `calculateAllSignals`, all per-signal helpers. Pure functions only.

6. **`learning-agent.audit.ts`** — Create. `buildSignalsComputedPayload`, `buildSignalsFailedPayload`. Pure functions only.

7. **Extend `modules/intelligence/types.agent.ts`** — Add 2 LA_ constants inside `ActivityEventType` const object after ET_ constants. Additive only.

8. **`learning-snapshot.repo.ts`** — Create. All read and write functions. Import `extractPhase3bMeta` from event-tracking.attribution for Phase 3B metadata parsing.

9. **`learning-agent.service.ts`** — Create. `runLearningAnalysis` following the 9-step flow in Section 10.1.

10. **`learning-agent.actions.ts`** — Create. One server action: `runLearningAnalysisAction`.

11. **Create 42 test fixtures** — `tests/fixtures/learning-agent/TC-LA-001.json` through `TC-LA-042.json`. Cover all 42 design test cases.

12. **`tests/learning-agent.test.ts`** — Create. Pure function tests, guardrail tests, 42 fixture-based tests.

13. **Extend UI** — Modify `agent-monitor` page to add learning signals display section and "Run Analysis" button. Load snapshot data from `learningSnapshotRepo.getLatestSnapshotsForTenant`.

14. **QA pass** — `npx vitest run` (≥ 579, 0 failures) + `npx next build` (0 errors) + lint.

15. **Guardrail grep pass** — Confirm no writes to locked tables. Confirm no LLM calls. Confirm all advisory flags are true.

16. **Implementation summary** — Report files created, test count, build status, deviations from plan.

---

## 20. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `HRB_ACTION_APPROVED` entity_id is null or inconsistent | Low | Medium | The HRB service writes `entity_id = versionId` for all HRB events — confirmed from HRB audit builder. Log and exclude null entity_ids. |
| `activity_events` table grows large, making the full-scan query slow | Medium | Medium | The query is filtered by `tenant_id`, `occurred_at >= windowStart`, and `event_type IN (...)`. For v1 volumes, this is acceptable. Future: add index on `(tenant_id, event_type, occurred_at)` if needed. |
| `message_versions.strategy_angle` is null for some versions | Low | Low | Excluded from angle-grouped signals with count logged. Tenant-wide signals still calculated correctly. |
| Quality reviews missing for some versions (QRA not run before HRB approval) | Low | Low | `quality_review_id` in ET_ metadata may be null if QRA wasn't run. Those versions are excluded from `score_band` and `qra_recommended` groupings. |
| Migration `20240025` conflicts with a future migration added between now and implementation | Very Low | Low | Check migration numbers at implementation time. The next known migration after 20240024 is 20240025. |
| `learning_snapshots` table exists but `types/database.ts` not regenerated | Low | Medium | TypeScript types must be regenerated after migration is applied. The implementation sequence requires this. |
| Reviewers misinterpret "low confidence" signals as reliable | Medium (UX) | Low (technical) | UI must display confidence labels prominently. "Insufficient data" shown as "—" not "0%". Advisory banner on every report. |
| Running the analysis while a batch of sends is in-progress | Very Low | Low | Snapshots reflect the exact moment of computation. This is documented in the Edge Cases section. Next run will include the in-progress sends. |

---

## 21. Final Acceptance Criteria

| Criterion | Met? |
|-----------|------|
| All 7 open questions from design resolved | ✓ |
| Migration `20240025` defined with schema, indexes, RLS, constraints | ✓ |
| Advisory-only enforcement at both code and DB level | ✓ |
| Signal calculation rules defined (numerators, denominators, deduplication) | ✓ |
| Approval-to-send join path defined | ✓ |
| Confidence thresholds confirmed (standard and engagement) | ✓ |
| Phase 3B vs Phase 3A separation specified | ✓ |
| Open/click zero-event wording specified | ✓ |
| Idempotency strategy defined (run_id + partial unique index) | ✓ |
| Repository design defined (write and read functions) | ✓ |
| Service 9-step flow defined | ✓ |
| Server action defined | ✓ |
| `types.agent.ts` additions defined (2 LA_ constants, additive) | ✓ |
| UI design defined (minimal read-only) | ✓ |
| Test fixture plan — 42 fixtures | ✓ |
| QA checklist — 35+ items | ✓ |
| Implementation sequence — 16 ordered steps | ✓ |
| Risks and mitigations identified | ✓ |
| No code written | ✓ |
| No SQL written | ✓ |
| No migrations created yet | ✓ |
| No sending introduced | ✓ |

---

## 22. Recommended Next Step

Once this implementation plan is approved by the user:

**Phase 3B Learning Agent — Code Implementation**

The coding agent must follow the 16-step sequence in Section 19 exactly. Key constraints to preserve:

1. All `learning_snapshots` rows carry `advisory = true` (enforced by DB constraint)
2. The 9-step `runLearningAnalysis` flow in Section 10.1 is the implementation contract
3. No writes to `message_strategies`, `message_versions`, `quality_reviews`, or any Phase 3B agent table
4. Phase 3B detection: ET_ events filtered via `metadata.source === 'phase_3b_send_bridge'`; HRB events matched by `event_type` only
5. All 537 existing tests must not regress
6. Migration must be applied before TypeScript types are used (or mock the type)

After implementation:
- Run QA: `npx vitest run` (≥ 579) + `npx next build` + lint
- Produce implementation summary
- Commit, tag as `phase-3b-learning-agent-v1`
- Update `docs/ai-context/` files

---

*Document status: Draft. Awaiting user approval before code implementation begins.*
*Version: 1.0 — 2026-05-21*
