# Phase 3B Learning Agent — Design & Test Cases

**Status:** Draft v1.0 — Awaiting user approval before implementation planning begins.
**Version:** 1.0
**Date:** 2026-05-21
**Prerequisite:** Event Tracking / Send Outcome Tracking Foundation v1.0 complete and QA-verified (`28db22a`, tag `phase-3b-event-tracking-v1`).

---

## 1. Executive Overview

The Phase 3B Revenue Learning Engine has now completed its full outbound messaging pipeline through event observation:

```
Message Strategy Agent      → produces message_strategy
Copywriting Agent           → produces message_version[] (plain text)
Quality Review Agent        → produces quality_review[] (scores, risk flags, recommendation)
Human Review / Approval Bridge → sets message_version.approval_status = 'approved'
Send / Email Draft Bridge   → creates email_draft (approved), auto-resolved approval_request
Phase 3A send flow          → reviewer clicks "Send" → email_sends → Resend → email sent
Event Tracking              → emits ET_ activity_events with full Phase 3B provenance
```

An `activity_events` table now contains a pre-attributed feed of send outcomes, linked to `message_version_id`, `strategy_id`, `quality_review_id`, `version_label`, and `composite_score`. The data exists. The question is: what does it mean?

**The Learning Agent** is the final layer of the Revenue Learning Engine. Its purpose is to analyse the outcome data that Event Tracking has collected, calculate evidence-based signals about what is working and what is not, and surface those signals to reviewers and strategy parameters — but never to trigger automatic action.

**The Learning Agent is a read-mostly analytics layer.** It reads historical outcome data, calculates summary statistics, applies minimum sample thresholds and confidence indicators, and writes advisory signals to a read-only output. It does not change live strategy behaviour, does not rewrite copy, does not approve or send messages, and does not trigger automated follow-up.

**Core principle:** Agents recommend. Humans decide. This principle applies even at the learning layer. The Learning Agent says "based on N sends, version angle X has a 92% delivery rate with 80% confidence" — not "use angle X from now on." A human must read the signal and act on it. The Learning Agent does not have a write path into the pipeline's active decision logic in v1.

**Position in the full pipeline:**

```
Message Strategy Agent
→ Copywriting Agent
→ Quality Review Agent
→ Human Review / Approval Bridge
→ Send / Email Draft Bridge
→ [Phase 3A send flow + Resend]
→ Event Tracking                 (Complete)
→ Learning Agent                 ← this document
```

---

## 2. Completed Prerequisites

Before the Learning Agent can be designed or implemented, all of the following must be true. All are confirmed as of `28db22a`:

| Prerequisite | Source | Status |
|-------------|--------|--------|
| `activity_events` table exists with `ET_` event types | Event Tracking | ✓ |
| `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` events emitted | Event Tracking | ✓ |
| `ET_EMAIL_DELIVERED`, `ET_EMAIL_BOUNCED`, `ET_EMAIL_COMPLAINED`, `ET_EMAIL_OPENED`, `ET_EMAIL_CLICKED` emitted | Event Tracking | ✓ |
| `activity_events.metadata` carries `message_version_id`, `strategy_id`, `quality_review_id`, `version_label`, `composite_score` | Event Tracking | ✓ |
| `activity_events.entity_id` = `message_version_id` for all ET_ events | Event Tracking | ✓ |
| Phase 3B vs Phase 3A sends distinguishable via `metadata.source === 'phase_3b_send_bridge'` | Event Tracking | ✓ |
| `email_sends` table tracks `status` (queued, sent, delivered, bounced, complained, failed) | Phase 3A | ✓ |
| `email_events` table tracks one row per Resend webhook event | Phase 3A | ✓ |
| `quality_reviews` table carries `composite_score`, `score_band`, `risk_flags`, `is_recommended` | QRA | ✓ |
| `message_versions` carries `approval_status`, `version_label`, `strategy_angle`, `message_type` | CA | ✓ |
| `message_strategies` carries `message_type`, `status`, and phase 3B strategy parameters | MSA | ✓ |

**The key data availability insight:** Because Event Tracking pre-attributes all `ET_` events with `message_version_id` and `strategy_id`, the Learning Agent can query `activity_events WHERE event_type IN ('ET_EMAIL_DELIVERED', 'ET_EMAIL_BOUNCED', ...) AND metadata->>'strategy_id' = 'X'` without any joins through `email_sends` or `email_drafts`. The attribution chain was collapsed at write time.

---

## 3. Design Goals

1. Calculate honest, evidence-based outcome signals from the existing `activity_events` feed — not synthesised from models.
2. Apply minimum sample thresholds and confidence levels so the Learning Agent never presents unreliable statistics as facts.
3. Produce advisory-only output: signals inform reviewers, they do not change live strategy selection or QRA scoring.
4. Distinguish Phase 3B-originated sends from Phase 3A template sends throughout all calculations.
5. Surface signals at three granularity levels: strategy-level, version-level (by `version_label` and `strategy_angle`), and QRA score-band-level.
6. Prepare a clean, stable output schema that a future active Learning Agent can read to actually adjust strategy weights — without requiring the current v1 to do so.
7. Present "insufficient data" honestly and consistently — never extrapolate from fewer than the minimum sample threshold.
8. Store computed signals as durable snapshots so they can be reviewed, compared over time, and audited.
9. Operate read-mostly: the Learning Agent reads many tables but writes only to its own output table and an audit activity event.
10. Be triggerable on-demand or on a schedule — not blocking the send pipeline.

---

## 4. Non-Goals

| Non-Goal | Reason |
|----------|--------|
| Automatically update `message_strategy` selection parameters | Future work — requires approved active-learning design |
| Automatically adjust QRA `composite_score` weights | QRA is evaluation-only; locked |
| Rewrite or regenerate message copy | Copy is immutable from the Learning Agent's perspective |
| Send follow-up emails based on outcomes | No auto-send; humans trigger all sends |
| Classify reply intent or sentiment | Requires inbound email infrastructure and NLP; deferred |
| Calculate revenue conversion | No conversion event defined; deferred |
| Auto-suppress contacts based on bounce patterns | Auto-suppression belongs to Phase 3A |
| Call external LLMs for interpretation | v1 is deterministic analytics only; LLM-assisted interpretation is future optional work |
| Recommend a "next best action" that is automatically executed | All recommendations are advisory; no automated execution |
| Create a real-time learning loop | v1 is batch analytics, not streaming |
| Build a feedback loop into the QRA scoring algorithm | Future work under a separately approved design |

---

## 5. Data Sources

### 5.1 Primary Source: `activity_events` (Phase 3B ET_ events)

The Learning Agent's primary data source is the `activity_events` table, filtered to Phase 3B-originated events:

```
WHERE event_type IN (
  'ET_SEND_INITIATED',
  'ET_SEND_SUCCEEDED',
  'ET_SEND_FAILED',
  'ET_EMAIL_DELIVERED',
  'ET_EMAIL_BOUNCED',
  'ET_EMAIL_COMPLAINED',
  'ET_EMAIL_DELIVERY_FAILED',
  'ET_EMAIL_OPENED',
  'ET_EMAIL_CLICKED'
)
```

Key fields available in each row:
- `entity_id` — the `message_version_id` (primary attribution key)
- `lead_id` — the lead
- `metadata.strategy_id` — the strategy that produced the version
- `metadata.quality_review_id` — the QRA record
- `metadata.version_label` — 'A', 'B', 'C', 'D'
- `metadata.composite_score` — QRA composite score at time of approval
- `metadata.send_initiated_by` — reviewer who clicked Send
- `metadata.approved_by` — reviewer who approved via HRB
- `occurred_at` — when the event occurred

**Deduplication note:** The Learning Agent must count each `message_version_id` / `event_type` pair at most once per analysis window. Because `ET_EMAIL_OPENED` may be emitted multiple times for the same send (each open has a unique `provider_event_id`), the Learning Agent must de-duplicate opens per `message_version_id` before calculating open rate. The `entity_id` (version_id) is the stable grouping key.

### 5.2 Supporting Source: `email_sends`

Used to cross-check `email_sends.status` for versions where no webhook event arrived (e.g., a send that succeeded but never got a delivery confirmation). The `email_sends.metadata.message_version_id` links back to the version.

**Caveat:** `email_sends` status transitions are partially driven by Resend webhooks. A `status = 'sent'` row with no `ET_EMAIL_DELIVERED` event means either: (a) the webhook hasn't arrived yet, (b) Resend tracking is not enabled for that send, or (c) the event was missed. The Learning Agent must treat "sent but no delivery event" as an unknown outcome, not a failure.

### 5.3 Supporting Source: `quality_reviews`

Used to enrich signals with QRA context beyond what `metadata.composite_score` provides:
- `score_band` — 'excellent', 'strong', 'usable', 'needs_review', 'do_not_use'
- `risk_flags` — specific risk codes present at approval time
- `is_recommended` — whether QRA recommended this version
- `rank_position` — relative rank within the strategy run

Joined via `quality_review_id` from the `activity_events.metadata` field.

### 5.4 Supporting Source: `message_versions`

Used to group by:
- `strategy_angle` — e.g., 'urgency', 'social_proof', 'value_proposition'
- `message_type` — e.g., 'close_deal_now', 'standard_follow_up'
- `version_label` — 'A', 'B', 'C', 'D'

These are dimension axes for signal grouping.

### 5.5 Supporting Source: `message_strategies`

Used to understand the strategy context:
- `message_type` — what type of message the strategy recommended
- `status` — whether the strategy is still active or superseded
- Phase 3B strategy parameters (skill selection, offer angle, etc.)

### 5.6 Not Used

| Source | Why excluded |
|--------|-------------|
| Phase 3A `activity_events` (non-ET_ types) | Template email outcomes have different provenance — separate analysis if needed |
| `email_events` (raw Resend events) | Already aggregated into `ET_` activity_events; raw table used for debugging only |
| `webhook_events` | Raw audit only; Learning Agent uses processed ET_ events |
| `approval_requests` | Approval context is already in `activity_events.metadata.approved_by` |
| `unsubscribes` | Suppression is a Phase 3A operational concern, not a learning signal in v1 |

---

## 6. Learning Signal Taxonomy

### 6.1 What Is a Learning Signal?

A learning signal is a statistic calculated from a group of historical outcomes. Signals are:
- **Computed** — not stored raw; derived by aggregating `activity_events`
- **Grouped** — by dimension (strategy, version angle, score band, message type)
- **Qualified** — with sample count (N) and confidence level
- **Advisory** — presented as information, not directives

### 6.2 Signal Dimensions

Signals are calculated across these dimensions:

| Dimension | Grouping key | Example |
|-----------|-------------|---------|
| Strategy | `metadata.strategy_id` | "All sends under strategy str-123" |
| Version angle | `message_versions.strategy_angle` | "All versions using 'urgency' angle" |
| Message type | `message_versions.message_type` | "All 'close_deal_now' messages" |
| QRA score band | `quality_reviews.score_band` | "All 'strong' (70–84) versions" |
| Version label | `metadata.version_label` | "All 'A' versions within a strategy" |
| QRA recommended | `quality_reviews.is_recommended` | "Was QRA's recommended version sent?" |
| Tenant-wide | `tenant_id` | "All Phase 3B sends for this workspace" |

### 6.3 v1 Signal Set — Calculate These

| Signal | Numerator | Denominator | Notes |
|--------|-----------|-------------|-------|
| **Send success rate** | Count `ET_SEND_SUCCEEDED` | Count `ET_SEND_INITIATED` | Versions that reach Resend successfully |
| **Send failure rate** | Count `ET_SEND_FAILED` | Count `ET_SEND_INITIATED` | Versions that fail at the Resend API call |
| **Delivery rate** | Count distinct `ET_EMAIL_DELIVERED` per version | Count `ET_SEND_SUCCEEDED` | Delivered / accepted by Resend |
| **Bounce rate** | Count `ET_EMAIL_BOUNCED` per version | Count `ET_SEND_SUCCEEDED` | Hard or soft bounce |
| **Complaint rate** | Count `ET_EMAIL_COMPLAINED` per version | Count `ET_SEND_SUCCEEDED` | Spam complaints |
| **Delivery failure rate** | Count `ET_EMAIL_DELIVERY_FAILED` per version | Count `ET_SEND_SUCCEEDED` | Resend-level delivery failure |
| **Open rate** | Count distinct versions with ≥1 `ET_EMAIL_OPENED` | Count `ET_EMAIL_DELIVERED` | Only when `ET_EMAIL_OPENED` events exist |
| **Click rate** | Count distinct versions with ≥1 `ET_EMAIL_CLICKED` | Count `ET_EMAIL_DELIVERED` | Only when `ET_EMAIL_CLICKED` events exist |
| **Approval-to-send rate** | Count `ET_SEND_INITIATED` | Count `HRB_ACTION_APPROVED` (for same strategy) | What fraction of HRB approvals led to a send? |
| **Unknown outcome rate** | Count `ET_SEND_SUCCEEDED` with no follow-up webhook event | Count `ET_SEND_SUCCEEDED` | Sent but no delivery confirmation yet |

### 6.4 Signal Variants

Each signal is calculated at multiple aggregation levels:

- **Tenant-wide** — all Phase 3B sends for the workspace
- **By message type** — e.g., all `close_deal_now` versions
- **By strategy angle** — e.g., all `urgency` angle versions
- **By QRA score band** — e.g., all `strong` band versions
- **By QRA recommended** — `is_recommended = true` vs `false`

### 6.5 v1 Signals NOT Calculated

These require additional data, infrastructure, or ML components not available in v1:

| Signal | Why deferred |
|--------|-------------|
| Reply rate | Inbound email infrastructure not built |
| Reply quality / intent classification | Requires NLP / LLM |
| Conversion rate (revenue) | No conversion event defined |
| Time-to-open | Requires event timestamp precision beyond current data |
| A/B statistical significance testing | Requires proper experiment design (random assignment); current versioning is reviewer-selected, not randomised |
| Sentiment trend | Requires NLP analysis |
| Optimal send time | Insufficient granularity in current time data |
| Churn prediction | Out of scope |
| Copy element attribution | Requires structured copy decomposition |
| Automatic strategy weight updates | Active learning; deferred to future approved design |

---

## 7. Minimum Sample and Confidence Model

### 7.1 Why Sample Thresholds Matter

A strategy with 2 sends and 2 deliveries is not "100% delivery rate" — it is "2 observations, insufficient to conclude." Presenting small-sample statistics as confident findings is misleading and potentially harmful to strategy selection.

The Learning Agent must be honest about data scarcity. It must distinguish:

- **Insufficient** — fewer than the minimum sample; no rate reported; "insufficient data" returned
- **Low confidence** — minimum to moderate sample; rate reported with explicit caution
- **Moderate confidence** — moderate sample; rate reported with standard confidence label
- **High confidence** — large sample; rate reported as reliable finding

### 7.2 v1 Sample Thresholds

These thresholds are conservative and advisory. They can be adjusted by the Implementation Plan.

| Threshold | N (sends in denominator) | Confidence label |
|-----------|--------------------------|-----------------|
| Insufficient | < 5 | "Insufficient data (N < 5)" — no rate shown |
| Low | 5–19 | "Low confidence (N = X)" — rate shown with caution note |
| Moderate | 20–49 | "Moderate confidence (N = X)" |
| High | ≥ 50 | "High confidence (N = X)" |

**Open rate and click rate** require a higher threshold because they are more sparse (only emitted if tracking is enabled):

| Threshold | N (delivered events) | Confidence label |
|-----------|---------------------|-----------------|
| Insufficient | < 10 | "Insufficient data (N < 10)" — no rate shown |
| Low | 10–29 | "Low confidence (N = X)" |
| Moderate | 30–99 | "Moderate confidence (N = X)" |
| High | ≥ 100 | "High confidence (N = X)" |

### 7.3 Temporal Window

The v1 Learning Agent calculates signals over a configurable lookback window. Default: **90 days**. Minimum allowed: 30 days. Maximum allowed: 365 days.

Rationale: Older outcomes may reflect a different product, market, or copywriting quality that is no longer relevant. The window should be long enough to accumulate sample size but short enough to remain current.

### 7.4 Cold Start

For a tenant with few sends:
- All signals below threshold return "Insufficient data"
- The Learning Agent does not extrapolate from Phase 3A template email outcomes
- The Learning Agent does not use cross-tenant data (signals are tenant-scoped)
- The output is: "Not enough Phase 3B sends to calculate reliable signals yet. X sends completed in the last 90 days."

This is expected and correct behavior for new tenants. The Learning Agent must never fabricate confidence.

---

## 8. Advisory-Only Output Model

### 8.1 The Output Is Not a Command

Every signal the Learning Agent produces is advisory. It says:

> "Based on 47 Phase 3B sends in the last 90 days, versions with a QRA score band of 'strong' (70–84) have a delivery rate of 94.3% (moderate confidence). Versions with 'needs_review' score band have a delivery rate of 71.4% (low confidence, N=7)."

It does **not** say:
> "Use 'strong' band versions from now on." 

Strategy selection remains a human decision. The reviewer reads the signal and makes their own judgment.

### 8.2 Presentation Requirements

Every signal output must include:
- The signal name and dimension
- The calculated rate (percentage)
- The N (sample count used as denominator)
- The confidence label
- The lookback window
- The event types used as numerator and denominator
- Whether the signal is "advisory only — no automatic action taken"

### 8.3 Output Format in v1

v1 output is structured data (stored in a `learning_snapshots` table or computed on demand — see Section 10). Each snapshot or computed result includes:

```json
{
  "signal_name":      "delivery_rate",
  "dimension":        "score_band",
  "dimension_value":  "strong",
  "numerator":        44,
  "denominator":      47,
  "rate":             0.936,
  "rate_pct":         "93.6%",
  "sample_n":         47,
  "confidence":       "moderate",
  "lookback_days":    90,
  "window_start":     "2026-02-20",
  "window_end":       "2026-05-21",
  "tenant_id":        "ten-001",
  "computed_at":      "2026-05-21T12:00:00Z",
  "advisory":         true,
  "notes":            null
}
```

---

## 9. Data Model Considerations

### 9.1 v1 Decision: Compute On Demand or Store Snapshots?

**Option A — Compute on demand (pure query):**
Every time a reviewer views the Learning Agent report, the system queries `activity_events` and aggregates in real time.

**Option B — Store computed snapshots:**
The Learning Agent runs periodically (e.g., nightly or on-demand trigger) and writes computed signals to a `learning_snapshots` table.

**v1 Recommendation: Store computed snapshots (Option B).**

Reasons:
- `activity_events` will grow large; real-time aggregation across all ET_ events becomes expensive
- Snapshots allow comparison over time ("delivery rate improved from 71% to 89% over the last 30 days")
- Snapshots can be reviewed and audited without re-running the query
- The Implementation Plan should decide whether to run nightly vs. on-demand trigger

### 9.2 `learning_snapshots` Table (Future Migration)

A new table will be required. This is NOT created in the Learning Agent Design — it is flagged for the Implementation Plan.

Proposed schema (to be defined precisely in the Implementation Plan):

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `tenant_id` | uuid | Tenant scoping |
| `workspace_id` | uuid | Workspace scoping |
| `signal_name` | text | e.g., 'delivery_rate', 'bounce_rate' |
| `dimension` | text | e.g., 'score_band', 'message_type', 'tenant_wide' |
| `dimension_value` | text | e.g., 'strong', 'close_deal_now', 'all' |
| `numerator` | integer | Raw count (e.g., delivered events) |
| `denominator` | integer | Raw count (e.g., send succeeded events) |
| `rate` | numeric(6,4) | Calculated rate (0.0–1.0) |
| `sample_n` | integer | Denominator count (same as `denominator`) |
| `confidence` | text | 'insufficient', 'low', 'moderate', 'high' |
| `lookback_days` | integer | Window used for calculation |
| `window_start` | timestamptz | Start of lookback window |
| `window_end` | timestamptz | End of lookback window (≈ computed_at) |
| `advisory` | boolean | Always true in v1 |
| `computed_at` | timestamptz | When this snapshot was calculated |
| `notes` | text | Optional human-readable context |
| `deleted_at` | timestamptz | Soft delete |

**Indexes required:** `tenant_id, dimension, dimension_value, computed_at` for UI queries.

### 9.3 No New Columns on Existing Tables

The Learning Agent does **not** add columns to `message_strategies`, `message_versions`, `quality_reviews`, or `activity_events`. All Learning Agent data lives in `learning_snapshots` only.

### 9.4 Future Migration Flags

The following future migrations should be flagged for the Implementation Plan:

| Migration | Purpose | When needed |
|-----------|---------|------------|
| `learning_snapshots` table | Store computed signals | Required for v1 |
| `message_version_id` FK on `email_sends` | Enable direct indexed attribution without jsonb path | When Learning Agent needs query performance at scale |
| `strategy_id` on `email_sends` | Direct strategy aggregation | Same trigger |

---

## 10. Compute-On-Demand vs. Snapshot Decision

Based on Section 9.1, v1 uses stored snapshots.

**Snapshot lifecycle:**
1. A trigger event fires (on-demand button in UI, or nightly cron)
2. The Learning Agent service reads `activity_events` for the lookback window
3. Applies Phase 3B filter (`metadata.source = 'phase_3b_send_bridge'`)
4. Aggregates by each signal × dimension combination
5. Applies minimum sample thresholds and confidence levels
6. Writes rows to `learning_snapshots` (soft-deleting or superseding prior snapshots for the same `tenant_id / signal_name / dimension / dimension_value`)
7. Emits `LA_SIGNALS_COMPUTED` activity event (additive to `ActivityEventType`)

**The computation must be idempotent:** Running the Learning Agent twice in the same window produces the same result. Duplicate runs should supersede (not append) prior snapshots for the same dimension.

---

## 11. Guardrails

The following guardrails apply to the Learning Agent and must remain in force throughout implementation:

| Guardrail | Statement |
|-----------|-----------|
| No automatic strategy changes | Learning signals are written to `learning_snapshots` only; no `message_strategies` rows are modified |
| No automatic QRA weight updates | `quality_reviews` records are read-only to the Learning Agent |
| No copy modification | `message_versions.body_text` and `message_versions.subject_line` are never touched |
| No new sends | The Learning Agent never creates `email_drafts`, `email_sends`, or calls Resend |
| No HRB gate modification | HRB approval gates are not changed based on learning signals |
| Phase 3A sends excluded | All calculations filter to `metadata.source = 'phase_3b_send_bridge'`; Phase 3A template sends never enter the Learning Agent's numerator or denominator |
| No extrapolation below threshold | Signals below the minimum sample threshold return "insufficient data" — no rate is calculated or presented |
| No cross-tenant data | All queries and snapshots are scoped to `tenant_id`; no cross-tenant learning |
| Advisory output only | Every `learning_snapshots` row carries `advisory = true`; the schema enforces this |
| No external LLM calls in v1 | All calculations are deterministic aggregation; no ML model inference |
| Idempotent computation | Running twice overwrites prior snapshots for the same dimension; no duplicate rows accumulate |
| Audit trail | Every computation run emits `LA_SIGNALS_COMPUTED` activity event |

---

## 12. Error Handling

### 12.1 Missing Metadata

Some `activity_events` rows may have `metadata.strategy_id = null` (e.g., if the send failed before metadata was fully enriched). These rows must be:
- Counted in the denominator for send-level signals where applicable (e.g., `ET_SEND_FAILED` counts)
- Excluded from dimension-grouped signals (cannot group by a null strategy_id)
- Logged as "X events excluded due to missing strategy_id attribution"

### 12.2 Malformed Metadata

If `metadata` is present but does not contain the expected fields (e.g., `composite_score` is a string instead of a number), the row must be:
- Skipped silently for that specific dimension calculation
- Logged as "X events skipped due to malformed metadata"
- Not thrown as an error (non-fatal processing)

### 12.3 Zero Denominator

If the denominator for a rate calculation is 0, the rate must be returned as `null` with confidence `'insufficient'`. Never divide by zero or present infinity.

### 12.4 Computation Failure

If the Learning Agent computation fails partway through (e.g., database error):
- No partial snapshot is written
- An error is logged
- The prior snapshot (from the last successful run) remains accessible
- A `LA_SIGNALS_COMPUTATION_FAILED` activity event is emitted

### 12.5 No `activity_events` For a Dimension

If a dimension value (e.g., score band 'do_not_use') has no Phase 3B activity events at all, the Learning Agent simply does not produce a snapshot row for that value. It is not an error — it means no sends have used that score band. The UI should display "No data" not an error.

---

## 13. Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| A version was approved by HRB but never sent | `ET_SEND_INITIATED` absent; version counted in `approval-to-send` denominator if tracking HRB events; not in delivery rate denominator |
| A version was sent but received no webhook events | Counted in `ET_SEND_SUCCEEDED`; not in delivery or bounce numerator; classified as "unknown outcome" |
| Open/click events exist but tracking was enabled mid-window | Open and click rates are unreliable for the portion of the window before tracking was enabled. The Learning Agent cannot know when tracking was enabled — it must note this caveat if open/click rates differ significantly from delivery rates |
| A send that bounced later in the window | Correctly counted: `ET_SEND_SUCCEEDED` in denominator, `ET_EMAIL_BOUNCED` in bounce numerator |
| A complaint that also triggered auto-unsubscribe | `ET_EMAIL_COMPLAINED` counted in complaint numerator; the `unsubscribes` table change is a Phase 3A side-effect and is not double-counted |
| Duplicate `ET_EMAIL_OPENED` events for the same version (multiple opens) | Deduplicate by `entity_id` (version_id) — at most one open counted per version for open rate calculation |
| A strategy with 100 versions generated but only 2 sent | `approval_to_send` rate is very low (2/100); `sample_n = 2`; confidence is 'insufficient' for most signals; stated correctly |
| Phase 3A template email appears in `activity_events` | Filtered out via `metadata.source !== 'phase_3b_send_bridge'` before any calculation |
| Learning Agent run in the middle of a batch of sends | Snapshot reflects outcomes at the time of computation; not retroactively updated as new events arrive |
| Two Learning Agent runs in the same hour | Second run supersedes the first for all dimensions; idempotent result |
| Lookback window extends before Phase 3B was deployed | No Phase 3B ET_ events exist before deployment; denominator is correctly 0 for pre-deployment period; Learning Agent presents the real effective data window |

---

## 14. UI and Reporting Behavior

### 14.1 Where Learning Agent Output Appears

**Primary location:** A new "Learning" or "Outcomes" section within the workspace settings or agent monitor, accessible to workspace members with appropriate permissions. This is a read-only view — no actions can be taken from it.

**Secondary location (future):** The message workspace strategy panel may eventually surface a compact summary ("Delivery rate for this strategy angle: 91% (N=23, moderate confidence)") alongside strategy card UI.

### 14.2 Report Structure

The Learning Agent report should surface:

1. **Workspace-wide summary** — total Phase 3B sends in window, overall delivery rate, confidence
2. **By message type** — delivery, bounce, complaint, open (if available), click (if available)
3. **By QRA score band** — which score bands correlate with better delivery / engagement
4. **By strategy angle** — which copy angles perform better on delivery / engagement
5. **QRA recommended vs. non-recommended** — did sending the QRA-recommended version produce better outcomes?
6. **Approval-to-send rate** — fraction of HRB approvals that led to an actual send

### 14.3 "Insufficient Data" Display

When a dimension has insufficient data, the UI must show:
- The dimension name
- "Insufficient data — N < 5 sends"
- No rate displayed
- No progress bar or percentage shown

This prevents the UI from suggesting false precision.

### 14.4 Alert Thresholds (Advisory)

The Learning Agent may surface advisory alerts when signals cross concerning thresholds. These are informational only — no automated action results:

| Alert | Threshold | Severity |
|-------|-----------|---------|
| High bounce rate | Bounce rate ≥ 10% with ≥ 20 sends | Warning |
| High complaint rate | Complaint rate ≥ 0.5% with ≥ 20 sends | Critical warning |
| Low delivery rate | Delivery rate < 80% with ≥ 20 sends | Warning |
| QRA recommended version never sent | `is_recommended` versions never sent in N strategies | Informational |

All alerts include: the metric, the threshold, the N, the confidence level, and the note "advisory only — review and act as appropriate."

---

## 15. Future Agent Evolution Path

### 15.1 Phase 3B v2 — Active Learning (future, not in scope)

Once the v1 advisory layer has collected sufficient historical data and been validated by human reviewers, an active learning mechanism could be added:

- The Message Strategy Agent reads `learning_snapshots` to bias toward message types, angles, and QRA score bands with higher historical delivery rates
- Bias is applied as a soft weight — it can be overridden by the reviewer
- Any weight update requires a minimum confidence level (e.g., `'high'`) and a dampening factor to prevent overcorrection

This is not in scope for v1. No strategy weights are modified by the Learning Agent in v1.

### 15.2 Phase 3B v3 — LLM-Assisted Signal Interpretation (future optional)

A future version could use an LLM to:
- Summarise outcome patterns in natural language
- Suggest hypothesis for why a particular angle or score band underperformed
- Recommend strategic pivots with supporting evidence

This would require explicit scoping and approval. Not in scope for v1.

### 15.3 v1 as Foundation for Active Learning

The v1 Learning Agent is specifically designed so that the `learning_snapshots` schema can be consumed by a future active-learning layer without re-implementation:
- The `signal_name`, `dimension`, `dimension_value`, `rate`, `sample_n`, `confidence` fields are stable and queryable
- An active learning module can read snapshots where `confidence = 'high'` and apply soft priors
- The advisory flag can be changed to `advisory = false` for signals that are trusted enough to act on — but only under a separately approved design

---

## 16. Test Case Matrix

All test cases are behavioral specifications. No code is written here.

---

**TC-LA-001 — No Phase 3B sends returns insufficient data**
Input: `activity_events` has no `ET_` events for this tenant in the lookback window
Expected: All signals return `confidence = 'insufficient'`, `rate = null`, message: "No Phase 3B sends completed in the last 90 days."
Pass condition: No rate displayed. No error thrown. Snapshot either not written or written with all null rates.

---

**TC-LA-002 — Single send returns insufficient data**
Input: 1 `ET_SEND_SUCCEEDED`, 1 `ET_EMAIL_DELIVERED` for tenant
Expected: `delivery_rate` returns `confidence = 'insufficient'` (N=1 < 5). No percentage shown.
Pass condition: "Insufficient data (N < 5)" returned for all dimensional signals.

---

**TC-LA-003 — Exactly 5 sends returns low confidence**
Input: 5 `ET_SEND_SUCCEEDED`, 4 `ET_EMAIL_DELIVERED`
Expected: `delivery_rate = 0.80`, `confidence = 'low'`, `sample_n = 5`
Pass condition: Rate calculated and returned with 'low' confidence label. Caution note included.

---

**TC-LA-004 — Delivery rate calculated correctly**
Input: 40 `ET_SEND_SUCCEEDED`, 36 `ET_EMAIL_DELIVERED`, 4 `ET_EMAIL_BOUNCED`
Expected: `delivery_rate = 36/40 = 0.90`, `bounce_rate = 4/40 = 0.10`, `confidence = 'moderate'`, `sample_n = 40`
Pass condition: Rates match arithmetic. Both signals calculated.

---

**TC-LA-005 — Bounce rate calculated correctly**
Input: 25 `ET_SEND_SUCCEEDED`, 5 `ET_EMAIL_BOUNCED`, 20 `ET_EMAIL_DELIVERED`
Expected: `bounce_rate = 5/25 = 0.20`, `delivery_rate = 20/25 = 0.80`
Pass condition: Both rates correct. High bounce rate advisory alert triggered (≥10%, N≥20).

---

**TC-LA-006 — Complaint rate calculated correctly**
Input: 20 `ET_SEND_SUCCEEDED`, 1 `ET_EMAIL_COMPLAINED`, 19 other outcomes
Expected: `complaint_rate = 1/20 = 0.05`, advisory alert: "Complaint rate 5.0% exceeds threshold (≥0.5%)"
Pass condition: Rate correct. Advisory alert triggered.

---

**TC-LA-007 — Send failure rate calculated correctly**
Input: 30 `ET_SEND_INITIATED`, 28 `ET_SEND_SUCCEEDED`, 2 `ET_SEND_FAILED`
Expected: `send_success_rate = 28/30 ≈ 0.933`, `send_failure_rate = 2/30 ≈ 0.067`, `sample_n = 30`, `confidence = 'moderate'`
Pass condition: Both rates calculated from `ET_SEND_INITIATED` as denominator.

---

**TC-LA-008 — Open rate calculated only when open events exist**
Input: 20 `ET_EMAIL_DELIVERED`, 0 `ET_EMAIL_OPENED`
Expected: Open rate not reported (no open events; possibly tracking not enabled). Not reported as "0%."
Pass condition: `open_rate` is null or omitted. Note: "No open events recorded; tracking may not be enabled."

---

**TC-LA-009 — Open rate calculated correctly when events exist**
Input: 30 `ET_EMAIL_DELIVERED`, 12 distinct versions with `ET_EMAIL_OPENED` (deduplicated)
Expected: `open_rate = 12/30 = 0.40`. Numerator uses distinct versions with ≥1 open, not raw event count.
Pass condition: Rate deduplicates multiple opens per version. `confidence = 'moderate'` (N=30).

---

**TC-LA-010 — Multiple opens from same version deduplicated**
Input: One version with 5 `ET_EMAIL_OPENED` events (same `entity_id`, different `provider_event_id`). 10 total versions delivered.
Expected: Open rate numerator counts this version as 1, not 5. `open_rate = 1/10 = 0.10`.
Pass condition: De-duplication by `entity_id` confirmed.

---

**TC-LA-011 — Click rate calculated only when click events exist**
Input: 15 `ET_EMAIL_DELIVERED`, 0 `ET_EMAIL_CLICKED`
Expected: Click rate not reported. Note: "No click events recorded."
Pass condition: `click_rate` is null or omitted.

---

**TC-LA-012 — Phase 3A template sends excluded from Phase 3B learning**
Input: Mix of Phase 3B ET_ events and Phase 3A `activity_events` (e.g., `EMAIL_OPENED`, `EMAIL_BOUNCED` from Phase 3A)
Expected: Only `ET_` event types with `metadata.source = 'phase_3b_send_bridge'` are included in calculations. Phase 3A events are fully excluded.
Pass condition: Phase 3A events do not affect any rate calculation. If a Phase 3A bounce is present, it does not appear in bounce rate denominator or numerator.

---

**TC-LA-013 — Strategy-level outcomes grouped correctly**
Input: 10 sends for strategy-001, 15 sends for strategy-002. Delivery events attributed via `metadata.strategy_id`.
Expected: Two separate `learning_snapshots` rows, one per strategy, with their own rates and N values. Rates do not bleed across strategies.
Pass condition: Grouping by `metadata.strategy_id` is correct and isolated.

---

**TC-LA-014 — QRA score band outcomes grouped correctly**
Input: 20 versions with `score_band = 'strong'`, 10 with `score_band = 'usable'`. Delivery events present for both.
Expected: Two rows in `learning_snapshots` for `dimension = 'score_band'`, one with `dimension_value = 'strong'`, one with `dimension_value = 'usable'`. Rates calculated within each band.
Pass condition: Score bands correctly grouped. N values are accurate per band.

---

**TC-LA-015 — Strategy angle outcomes grouped correctly**
Input: 20 versions with `strategy_angle = 'urgency'`, 15 with `strategy_angle = 'social_proof'`.
Expected: Two separate signal rows, one per angle, with correct N and rate.
Pass condition: Grouping by `message_versions.strategy_angle` works correctly.

---

**TC-LA-016 — Approved but not sent versions counted in approval-to-send signal**
Input: 10 `HRB_ACTION_APPROVED` events, 6 `ET_SEND_INITIATED` events (4 approved versions not yet sent)
Expected: `approval_to_send_rate = 6/10 = 0.60`. Note: "4 approved versions not yet sent."
Pass condition: Denominator uses HRB approvals, numerator uses send initiations. HRB events must be joined via strategy_id or version_id.

---

**TC-LA-017 — Sent but no webhook outcome handled safely**
Input: 10 `ET_SEND_SUCCEEDED`, 0 delivery/bounce/complaint events (no Resend webhooks arrived yet)
Expected: `delivery_rate` has denominator 10 but numerator 0. Returns "unknown outcome rate = 100% (N=10, low confidence)" — not "0% delivery rate."
Pass condition: Versions with no follow-on webhook events are classified as "outcome unknown," not as failures.

---

**TC-LA-018 — Duplicate webhook activity events do not double-count**
Input: 2 `ET_EMAIL_DELIVERED` events for the same `entity_id` (same version delivered, but idempotency may not have caught a duplicate in rare cases)
Expected: De-duplicated by `entity_id` — at most one delivery counted per version.
Pass condition: Delivery rate numerator counts this version once.

---

**TC-LA-019 — Missing metadata strategy_id handled safely**
Input: Some `ET_` events have `metadata.strategy_id = null` (e.g., enrichment partial failure)
Expected: These events are excluded from strategy-level groupings. Counted in tenant-wide signals only if `message_version_id` is available. Log: "X events excluded from strategy grouping due to missing strategy_id."
Pass condition: No null-pointer error. Affected signals note the exclusion count.

---

**TC-LA-020 — Malformed composite_score metadata skipped**
Input: Some `activity_events` rows have `metadata.composite_score = "eighty"` (string, not number)
Expected: These rows are skipped for score-band dimensional analysis. Not thrown as error. Log: "X events skipped due to malformed composite_score."
Pass condition: Score band aggregations proceed without error for valid rows.

---

**TC-LA-021 — Zero denominator returns null rate, not error**
Input: A score band with 0 `ET_SEND_SUCCEEDED` events (e.g., 'do_not_use' band — versions in this band should be blocked by QRA, not sent)
Expected: `delivery_rate = null`, `confidence = 'insufficient'`, note: "No sends in this score band."
Pass condition: No division by zero. Clean null result.

---

**TC-LA-022 — No QRA score update occurs**
Input: Learning Agent computes that 'needs_review' band has high bounce rate. This is a learning signal.
Expected: `quality_reviews.composite_score` is NOT updated. `quality_reviews.score_band` is NOT changed. No QRA record is modified.
Pass condition: QRA table row counts identical before and after Learning Agent run.

---

**TC-LA-023 — No message_strategy update occurs**
Input: Learning Agent computes delivery rate by message type and finds 'close_deal_now' underperforms.
Expected: No `message_strategies` row is updated. Strategy selection parameters not changed.
Pass condition: `message_strategies` table row contents identical before and after Learning Agent run.

---

**TC-LA-024 — No message_version copy update occurs**
Input: Learning Agent computes signal for a version with high bounce rate.
Expected: `message_versions.body_text` and `message_versions.subject_line` are NOT modified. Version label NOT changed.
Pass condition: `message_versions` table row contents identical before and after.

---

**TC-LA-025 — No email is sent by the Learning Agent**
Input: Learning Agent runs computation
Expected: No `email_drafts` created. No `email_sends` created. No Resend API call made. `email_sends` table row count unchanged.
Pass condition: Observation only — no send side effects.

---

**TC-LA-026 — No Learning Agent output triggers automation**
Input: Learning Agent writes `learning_snapshots` rows with high-confidence delivery rate findings
Expected: No `message_strategies` are created or modified. No HRB gates changed. No approval status changed. No version regeneration triggered.
Pass condition: Only `learning_snapshots` and one audit `activity_event` are written.

---

**TC-LA-027 — Insufficient data presented honestly**
Input: 3 sends for 'social_proof' angle. 2 delivered.
Expected: Output includes: `signal_name = 'delivery_rate'`, `dimension = 'strategy_angle'`, `dimension_value = 'social_proof'`, `rate = null`, `confidence = 'insufficient'`, `sample_n = 3`, note: "Insufficient data (N < 5). Results will improve with more sends."
Pass condition: No rate shown. Clear insufficient data message.

---

**TC-LA-028 — Confidence increases with sample size**
Input: Same signal calculated at N=5, N=20, N=50
Expected:
- N=5 → `confidence = 'low'`
- N=20 → `confidence = 'moderate'`
- N=50 → `confidence = 'high'`
Pass condition: Confidence thresholds applied correctly. Labels match the model in Section 7.

---

**TC-LA-029 — Complaint/bounce warnings are advisory only**
Input: `complaint_rate = 0.12`, `bounce_rate = 0.25`, `sample_n = 30`
Expected: Advisory alerts generated with severity levels. No action triggered. No auto-suppression. No strategy blocked.
Pass condition: Alerts present in output. Pipeline behavior unchanged.

---

**TC-LA-030 — Learning output is explainable with counts and source event types**
Input: Delivery rate signal for score_band 'strong'
Expected: Output includes: `numerator = 44`, `denominator = 47`, `signal_name = 'delivery_rate'`, lookback window, event types used. Fully auditable.
Pass condition: All output fields populated. A human can reconstruct the calculation from the output.

---

**TC-LA-031 — Future recommendation is marked advisory, not executed**
Input: Signal shows 'urgency' angle has 95% delivery rate (high confidence). Future recommendation field populated.
Expected: If a future recommendation field exists, it is marked `advisory = true`, `auto_applied = false`, `requires_human_approval = true`. No strategy parameter is changed.
Pass condition: No strategy auto-update. Advisory flag confirmed.

---

**TC-LA-032 — No external LLM call required in v1**
Input: Learning Agent computes all signals
Expected: No call to any external LLM API (Claude, OpenAI, etc.). All calculations are pure arithmetic aggregations.
Pass condition: No outbound HTTP calls to LLM endpoints. Deterministic, reproducible output from same input data.

---

**TC-LA-033 — QRA recommended version tracking**
Input: 10 strategies where QRA marked a version as `is_recommended = true`. Of those, 7 resulted in a send (`ET_SEND_INITIATED`). Of those 7, 6 delivered.
Expected: `approval_to_send_rate` for QRA-recommended versions = 7/10. `delivery_rate` for QRA-recommended versions = 6/7. Both calculated separately from non-recommended versions.
Pass condition: `is_recommended = true` vs. `false` produces two signal rows for QRA recommendation dimension.

---

**TC-LA-034 — Computation idempotency (second run produces same result)**
Input: Learning Agent runs twice with same data and same lookback window
Expected: Second run overwrites (supersedes) prior `learning_snapshots` rows for same `tenant_id / signal_name / dimension / dimension_value`. Total row count stable. No duplicates accumulate.
Pass condition: `learning_snapshots` has the same number of rows after second run as after first. Values are identical.

---

**TC-LA-035 — Computation run emits audit activity event**
Input: Learning Agent completes a successful computation run
Expected: `LA_SIGNALS_COMPUTED` activity event written to `activity_events` with: tenant_id, signals_computed count, lookback_days, computed_at, N total sends analyzed.
Pass condition: One audit event per run. No errors thrown.

---

**TC-LA-036 — Computation failure emits error activity event**
Input: Learning Agent computation fails mid-run (e.g., DB timeout)
Expected: `LA_SIGNALS_COMPUTATION_FAILED` event emitted. No partial snapshots written. Prior snapshots remain unchanged and accessible.
Pass condition: Clean failure. Prior snapshot still queryable.

---

**TC-LA-037 — Lookback window correctly scoped**
Input: 90-day lookback window. Events before the window exist but should be excluded.
Expected: Only `activity_events` with `occurred_at >= (now - 90 days)` are included in calculations.
Pass condition: Pre-window events are excluded from all N counts and numerators.

---

**TC-LA-038 — Tenant scoping enforced**
Input: Two tenants (A and B) with different send outcomes. Learning Agent runs for tenant A.
Expected: Only tenant A's `activity_events` are included. Tenant B's events never appear in any calculation.
Pass condition: `WHERE tenant_id = tenant_A_id` is applied to all queries.

---

**TC-LA-039 — High confidence delivery rate advisory alert**
Input: score_band 'do_not_use' has a 55% delivery rate (N=12, low confidence). score_band 'excellent' has 98% delivery rate (N=52, high confidence).
Expected: Advisory insight: "'excellent' band outperforms 'do_not_use' band by 43 percentage points (high vs. low confidence). Review before acting on this comparison."
Pass condition: Both signals present. Comparison labelled with respective confidence levels. No automatic action.

---

**TC-LA-040 — Approval-to-send rate identifies unrealised approvals**
Input: 15 `HRB_ACTION_APPROVED` events in window. 8 `ET_SEND_INITIATED` events in window.
Expected: `approval_to_send_rate = 8/15 = 0.533`. Note: "7 approved versions were not sent within the lookback window."
Pass condition: Rate and gap correctly calculated. No automatic action to send the unrealised approvals.

---

**TC-LA-041 — Versions outside lookback window excluded**
Input: 50 sends in the last 90 days. 100 additional sends from 180+ days ago.
Expected: Only the 50 recent sends contribute to signals. The older 100 are excluded. N = 50.
Pass condition: Window filter correctly applied. Historical sends outside window do not inflate sample sizes.

---

**TC-LA-042 — Score band with no Phase 3B sends produces no snapshot row**
Input: Score band 'do_not_use' has 0 Phase 3B sends (QRA correctly blocked such versions from approval)
Expected: No `learning_snapshots` row for `dimension_value = 'do_not_use'`. This is not an error — it means no sends used this band.
Pass condition: Query handles the missing data gracefully. UI shows "No data" not an error for this dimension.

---

## 17. Acceptance Criteria

The design is complete and approvable when all of the following are true:

| Criterion | Met? |
|-----------|------|
| Learning Agent role and boundaries clearly defined | ✓ |
| Advisory-only output model specified | ✓ |
| Minimum sample thresholds defined | ✓ |
| Confidence level model defined | ✓ |
| Signal taxonomy v1 defined (what to calculate) | ✓ |
| Signal exclusions defined (what NOT to calculate in v1) | ✓ |
| Data sources identified | ✓ |
| Phase 3A vs Phase 3B source separation specified | ✓ |
| Deduplication rule for open/click events specified | ✓ |
| "Insufficient data" presentation specified | ✓ |
| `learning_snapshots` table schema sketched | ✓ |
| Future migration flags identified | ✓ |
| No automatic strategy changes | ✓ |
| No QRA modification | ✓ |
| No copy modification | ✓ |
| No new email sends | ✓ |
| No external LLM calls in v1 | ✓ |
| Advisory alert thresholds defined | ✓ |
| Idempotency model specified | ✓ |
| Audit event types defined (2 new LA_ types) | ✓ |
| UI/reporting behavior described | ✓ |
| Future evolution path described | ✓ |
| 42 test cases defined | ✓ |
| No code written | ✓ |
| No SQL written | ✓ |
| No sending introduced | ✓ |

---

## 18. Open Questions

The following questions should be resolved before or during the Implementation Plan:

| # | Question | Implication |
|---|---------|-------------|
| 1 | **Trigger model.** Should the Learning Agent run on a schedule (e.g., nightly cron) or on-demand from a UI button, or both? | Schedule requires a cron infrastructure (e.g., Inngest or DB trigger); on-demand is simpler but less fresh. Recommend: on-demand button in v1 with scheduled support in v2. |
| 2 | **`learning_snapshots` migration number.** What is the next migration number after `20240024`? | Implementation Plan must assign the correct migration sequence number. |
| 3 | **Approval-to-send denominator source.** The denominator for `approval_to_send_rate` requires reading `HRB_ACTION_APPROVED` events from `activity_events`. These are present in the existing data (HRB emits them). Confirm the join: `HRB_ACTION_APPROVED` events have `entity_id = message_version_id`. | Verify field name. Implementation Plan should confirm the join path. |
| 4 | **Open/click tracking enablement detection.** The Learning Agent cannot know if Resend open/click tracking was enabled for a given send. If zero open events exist, should it say "tracking disabled" or "zero opens"? | Recommend: present open/click rates only when ≥ 1 open/click event exists in the window; otherwise note "no open/click events recorded — tracking may not be enabled." |
| 5 | **Strategy angle source.** `strategy_angle` is on `message_versions`, not in `activity_events.metadata`. The Learning Agent must join `message_versions` via `entity_id` (= `message_version_id`). Confirm this join path is reliable and that `strategy_angle` is always populated. | If `strategy_angle` is ever null, those versions must be excluded from angle grouping with a count logged. |
| 6 | **Lookback window configurability.** Should the 90-day default be per-tenant configurable (in system controls) or hardcoded for v1? | Recommend: hardcoded 90 days for v1; add system control key in v2 if needed. |
| 7 | **LA_ ActivityEventType constants.** Two new constants are implied: `LA_SIGNALS_COMPUTED` and `LA_SIGNALS_COMPUTATION_FAILED`. These should be added to `types.agent.ts` additively. Confirm naming convention matches existing ET_ prefix approach. | Implementation Plan should confirm constant naming and add them as additive-only. |

---

## 19. Recommended Next Step

Once this design is approved by the user:

**Phase 3B Learning Agent — Implementation Plan**

That plan should specify:

1. Whether computation runs on-demand, on schedule, or both (resolve Open Question 1)
2. The exact migration for `learning_snapshots` (resolve Open Question 2)
3. Exact join paths for `strategy_angle`, `score_band`, and approval-to-send denominator
4. Whether `extractPhase3bMeta` from event-tracking.attribution.ts is reused for metadata parsing
5. The exact service module structure: `modules/messaging/learning-agent/`
6. How idempotency is implemented (soft-delete + re-insert, or upsert on unique constraint)
7. Test fixture structure and expected test count
8. QA checklist: vitest (≥ 35 new tests), build, TypeScript, lint

---

*Document status: Draft. Awaiting user approval before implementation planning begins.*
*Version: 1.0 — 2026-05-21*
