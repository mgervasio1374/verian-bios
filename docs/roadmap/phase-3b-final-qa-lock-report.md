# Phase 3B Revenue Learning Engine — Final QA / Lock Report / Architecture Closeout

**Document status:** Final — For review and approval before Phase 3B is locked.
**Version:** 1.0
**Date:** 2026-05-21
**Scope:** All seven layers of the Phase 3B outbound intelligence loop

---

## 1. Executive Summary

The Phase 3B Revenue Learning Engine outbound intelligence loop is **foundation-complete**. All seven layers have been designed, reviewed, implemented, committed, tagged, and QA-verified.

### Completed Pipeline

```
Lead + History
    │
    ▼
Message Strategy Agent          Decides WHAT to send and WHY
    │                           → produces message_strategy
    ▼
Copywriting Agent               Writes 2–4 candidate versions
    │                           → produces message_version[]
    ▼
Quality Review Agent            Scores, ranks, and risk-flags candidates
    │                           → produces quality_review[] (one per version)
    ▼
Human Review / Approval Bridge  Human selects and approves one version
    │                           → sets message_version.approval_status = 'approved'
    ▼
Send / Email Draft Bridge       Creates a send-ready email_draft
    │                           → produces email_draft (status = 'approved')
    ▼
Phase 3A send flow              Human clicks Send
    │                           → produces email_send → Resend API call
    ▼
Event Tracking                  Observes and attributes outcomes
    │                           → produces ET_ activity_events in activity_events
    ▼
Learning Agent                  Computes advisory outcome signals
                                → produces learning_snapshots (advisory = true)
```

### QA Baseline (Final Verified State)

| Check | Result |
|-------|--------|
| `npx vitest run` | **PASSED** |
| Total tests | **590 / 590** |
| `npx next build` | **PASSED** |
| TypeScript | **PASSED** |
| Guardrail grep pass | **PASSED** |

**Current HEAD commit:** `44ea577` — Phase 3B: implement Learning Agent foundation
**Current tag:** `phase-3b-learning-agent-v1`

---

## 2. Completed Components

### 2.1 Message Strategy Agent

**Purpose:** Reads lead and workspace context and decides the outbound messaging strategy — what message type to use, which skill to apply, what offer angle to lead with, what to include and avoid. Produces a `message_strategy` row consumed by the Copywriting Agent.

**Commit/tag:** `5968ba2` / `phase-3b-message-strategy-agent-v1`

**Major files:**
- `modules/messaging/strategy/` — full strategy agent module
- `modules/messaging/repositories/message-strategy.repo.ts`
- `modules/messaging/actions/message-strategy.actions.ts`
- `supabase/migrations/20240022_phase3b_message_strategies.sql`

**Test count:** 41 (30 fixtures + 11 pure-function tests)

**Key behavior:**
- Reads lead, prior history, workspace context via server action
- Produces `message_strategy` row with: `message_type`, `skill_slug`, `offer_angle`, `tone`, `pain_point`, `proof_point`, `audience_context`, `required_inclusions`, `avoid_list`, `lead_source_classification`, `partner_membership_context`
- One active strategy per lead at a time; new strategy supersedes prior

**Guardrails:**
- Does not write copy
- Does not score, rank, or approve messages
- Does not trigger sending

---

### 2.2 Copywriting Agent

**Purpose:** Reads the active `message_strategy` and generates 2–4 candidate `message_version` rows. Validates each version for compliance and structural correctness, and ensures versions are meaningfully differentiated from each other.

**Commit/tag:** `40e56b1` / `phase-3b-copywriting-agent-v1`

**Major files:**
- `modules/messaging/copywriting/` — full CA module (planner, compliance validator, structural validator, differentiation validator, subject/body/preview generators, retry coordinator)
- `modules/messaging/repositories/message-version.repo.ts`
- `modules/messaging/actions/copywriting-agent.actions.ts`
- `supabase/migrations/20240023_phase3b_message_versions.sql`

**Test count:** 100 (35 fixtures + 65 pure-function tests)

**Key behavior:**
- Generates 2–4 `message_version` rows per strategy run
- Each version: `subject_line`, `body_text` (plain text only; `body_html = null` always), `preview_text`, `version_label` (A/B/C/D), `strategy_angle`, `differentiation_profile`
- Compliance validation runs before structural validation — failed compliance triggers retry (up to 3 attempts)
- Pairwise differentiation is required: at least 2 of 8 measured dimensions must differ between any two versions
- All generation and validation logic is pure (no I/O, no side effects)

**Guardrails:**
- `body_html` is always null — enforced at type, validator, and repo levels
- Does not score quality — that belongs to QRA
- Does not rank versions — that belongs to QRA
- Does not call external LLMs in v1
- Does not create `email_drafts` or `approval_requests`

---

### 2.3 Quality Review Agent

**Purpose:** Evaluates each `message_version` against the originating `message_strategy`. Scores 8 sub-dimensions, produces a composite score and score band, assigns risk flags, ranks versions, and marks one as recommended. Produces a `quality_review` row per version.

**Commit/tag:** `435b890` (backend), `96f32f8` (UI integration) / `phase-3b-quality-review-agent-v1.1`

**Major files:**
- `modules/messaging/quality-review/` — scoring, risk-flags, composite, ranking, reasoning, validation, message-type-rules, service
- `modules/messaging/repositories/quality-review.repo.ts`
- `modules/messaging/actions/quality-review-agent.actions.ts`
- `supabase/migrations/20240024_phase3b_quality_reviews.sql`

**Test count:** 126 (35 fixtures + 91 pure-function tests)

**Key behavior:**
- Scores each version on: strategic fit, compliance confidence, CTA clarity, specificity/personalization, tone fit, differentiation, subject/body consistency, readability
- Produces per version: `composite_score` (0–100), `score_band` (`excellent`/`strong`/`usable`/`needs_review`/`do_not_use`), `rank_position`, `is_recommended`, `risk_flags`, `scoring_reasoning`, `human_review_notes`, `comparison_summary`, `recommended_edits`
- One `quality_review` row per version per run; prior runs are soft-deleted (`superseded_at`)
- `is_recommended` marks the highest-ranked version — advisory only, does not approve

**Guardrails:**
- Does not write or rewrite copy
- Does not approve messages for sending
- Does not call external LLMs in v1
- Does not learn from outcomes — that belongs to the Learning Agent
- `is_recommended` is advisory; it does not trigger any automated action

---

### 2.4 Human Review / Approval Bridge (HRB)

**Purpose:** Surfaces agent outputs to a human reviewer and enforces gate conditions on state transitions. Allows a reviewer to select, reject, or approve a message version. Produces a complete audit trail in `activity_events`. The `approved` `message_version` is the handoff state to the Send Bridge.

**Commit/tag:** `ea3342c` / `phase-3b-human-review-bridge-v1`

**Major files:**
- `modules/messaging/human-review/human-review.types.ts` — 18 error codes (HRB_001–HRB_018), 6 action types, 12 rejection reasons
- `modules/messaging/human-review/human-review.validation.ts` — 18 gates: `validateApprovalEligibility`, `validateSelectEligibility`, `validateRejectEligibility`
- `modules/messaging/human-review/human-review.audit.ts` — pure event payload builders for all 6 HRB action types
- `modules/messaging/human-review/human-review.service.ts` — orchestration: select, reject, approve, request regeneration, return to strategy
- `modules/messaging/actions/human-review.actions.ts` — 6 server actions
- `modules/messaging/repositories/message-version.repo.ts` — extended with 7 HRB status-update and query functions
- `app/.../GeneratedVersionsPanel.tsx` — Approve button, RejectModal, OverrideReasonModal, RiskAcknowledgementModal, status indicators, critical risk banner

**Test count:** 100 (35 fixtures + 65 pure-function tests)

**Key behavior:**
- 6 reviewer actions: select, deselect, reject (with reason), approve, request regeneration, return to strategy
- 18 gate conditions evaluated before any write — validation is always pure (no I/O)
- Critical risk flag (`severity = 'critical'`) blocks approval unconditionally — no override path in v1
- One-approved-per-strategy policy: HRB_018 blocks a second approval under the same strategy
- All reviewer actions written to `activity_events` as `HRB_ACTION_*` events with `entity_id = message_version_id`
- Bridge does not create `email_drafts` or `approval_requests` — those belong to the Send Bridge
- Bridge stops at `approved` `message_version`; no auto-send

**Guardrails:**
- Does not send email
- Does not create `email_drafts` or `approval_requests`
- Does not modify copy (`body_text`, `subject_line` are read-only from bridge)
- Does not modify QRA scores or rankings
- Does not call external LLMs

---

### 2.5 Send / Email Draft Bridge (SEB)

**Purpose:** Converts an `approved` `message_version` into a send-ready `email_draft` inside the existing Phase 3A email draft system. Validates 14 gate conditions, runs the 17-step write sequence, records Phase 3B provenance in `ai_generation_metadata`, and emits an audit event. The produced `email_draft` (status `= 'approved'`) is immediately sendable through the existing `sendApprovedDraftAction`. No second approval step. No auto-send.

**Commit/tag:** `fd8a4fb` / `phase-3b-send-bridge-v1`

**Major files:**
- `modules/messaging/send-bridge/send-bridge.types.ts` — 14 error codes (SEB_001–SEB_014), 2 action types
- `modules/messaging/send-bridge/send-bridge.validation.ts` — `validateDraftCreationEligibility` (14 gates, pure)
- `modules/messaging/send-bridge/send-bridge.audit.ts` — pure payload builders
- `modules/messaging/send-bridge/send-bridge.service.ts` — `createEmailDraftFromApprovedVersion` (17-step write flow), `getDraftStatusForVersion`
- `modules/messaging/actions/send-bridge.actions.ts` — `createEmailDraftFromApprovedVersionAction`
- `modules/messaging/repositories/email-draft.repo.ts` — extended with `getEmailDraftForVersion` (duplicate guard)
- `app/.../GeneratedVersionsPanel.tsx` — "Create Email Draft" button, `CreateDraftConfirmModal`, draft status indicators

**Test count:** 89 (35 fixtures + 54 pure-function tests)

**Key behavior:**
- 14 gate conditions evaluated in order before any DB write (SEB_013 tenant → SEB_002 rejected → SEB_003 superseded → SEB_001 not approved → SEB_008 strategy → SEB_004 no contact → SEB_005 no email → SEB_006 do_not_contact → SEB_007 suppressed → SEB_012 no sender → SEB_009 content missing → SEB_010 body_html populated → SEB_011 duplicate → SEB_014 permission)
- 17-step write sequence: validate → create draft (pending_approval) → create approval_request (pending) → link approval_request to draft → resolve approval_request (approved) → sync draft status (approved) → supersede prior pending drafts for lead
- Phase 3B provenance stored in `email_drafts.ai_generation_metadata`: `source`, `message_version_id`, `strategy_id`, `quality_review_id`, `version_label`, `composite_score`, `approved_by`
- Auto-resolved `approval_request` satisfies `sendApprovedDraftAction`'s Phase 3A double-gate (requires both draft and approval_request to be `approved`)
- `supersedePendingDraftsForLead` runs last — only after all prior writes succeed
- Triggered by explicit "Create Email Draft" human click — not automatic on HRB approval

**Guardrails:**
- Does not call Resend API
- Does not insert into `email_sends`
- Does not call `sendApprovedDraftAction`
- Does not modify `message_version` content or `approval_status`
- Does not modify QRA records
- Does not call external LLMs
- Three distinct human actions are required before email is sent: (1) approve version (HRB), (2) create draft (SEB), (3) send (Phase 3A)

---

### 2.6 Event Tracking / Send Outcome Tracking (ET)

**Purpose:** Observes what happens after a Phase 3B-originated email is sent and attributes outcomes back to the originating `message_version`, `strategy_id`, and `quality_review_id`. Emits `ET_` activity events. Surfaces delivery status in the message workspace UI. Produces the pre-attributed feed that the Learning Agent reads.

**Commit/tag:** `28db22a` / `phase-3b-event-tracking-v1`

**Major files:**
- `modules/messaging/event-tracking/event-tracking.types.ts` — 9 ET_ constants, `EtPhase3bMeta`, payload interfaces
- `modules/messaging/event-tracking/event-tracking.attribution.ts` — `extractPhase3bMeta`, `isPhase3bSend`, `buildPhase3bSendMetadata`, `RESEND_EVENT_TO_ET_TYPE`
- `modules/messaging/event-tracking/event-tracking.audit.ts` — 4 pure payload builders
- `modules/messaging/services/email-send.service.ts` — extended: Phase 3B metadata enrichment + ET_SEND_* emissions
- `modules/messaging/repositories/email-send.repo.ts` — extended: `getSendStatusForDraft`
- `app/api/webhooks/resend/route.ts` — extended: expanded `email_sends` select + Phase 3B activity event block after idempotency guard
- `app/.../GeneratedVersionsPanel.tsx` — delivery status badges (Delivered / Bounced / Complaint / Send Failed / Sent)

**Test count:** 81 (35 fixtures + 46 pure-function tests)

**Key behavior:**
- At send time: Phase 3B provenance copied from `email_drafts.ai_generation_metadata` into `email_sends.metadata` (source, message_version_id, strategy_id, quality_review_id, version_label, composite_score, approved_by, send_initiated_by, lead_id)
- `ET_SEND_INITIATED` emitted after `email_send` record created, before Resend API call
- `ET_SEND_SUCCEEDED` emitted after Resend accepts; `ET_SEND_FAILED` after Resend failure
- At webhook time: `processResendEvent` selects expanded fields including `metadata`; `isPhase3bSend()` gates the Phase 3B block; `extractPhase3bMeta()` parses provenance
- Webhook events emitted: `ET_EMAIL_DELIVERED`, `ET_EMAIL_BOUNCED`, `ET_EMAIL_COMPLAINED`, `ET_EMAIL_DELIVERY_FAILED`, `ET_EMAIL_OPENED`, `ET_EMAIL_CLICKED`
- `email.delivery_delayed` is log-only — no activity event
- All ET_ calls are non-fatal: `.catch(() => {})` — event tracking never blocks a send
- Duplicate webhook protection: Phase 3B block runs only after the existing `23505` idempotency guard passes
- Phase 3A template email sends are unaffected — `source !== 'phase_3b_send_bridge'` → no ET_ events

**Guardrails:**
- Does not update QRA scores, HRB decisions, or strategy weights
- Does not send email or call Resend beyond the existing send flow
- Does not insert into `email_sends`
- Does not create new DB tables or migrations
- Does not trigger the Learning Agent

---

### 2.7 Learning Agent (LA)

**Purpose:** Reads the pre-attributed `ET_` activity events produced by Event Tracking and the `HRB_ACTION_APPROVED` events from the Human Review Bridge. Calculates 10 advisory outcome signals across 6 dimensions. Writes `learning_snapshots` rows — all marked `advisory = true` and enforced at the DB level. Emits an audit activity event per run. Surfaces signals in the agent monitor UI.

**Commit/tag:** `44ea577` / `phase-3b-learning-agent-v1`

**Major files:**
- `modules/messaging/learning-agent/learning-agent.types.ts` — 10 signal names, 6 dimensions, 4 confidence levels, 2 action types, threshold constants, interfaces
- `modules/messaging/learning-agent/learning-agent.confidence.ts` — `classifyConfidence`, `calculateRate`, `isEngagementSignal`, `getThresholds`
- `modules/messaging/learning-agent/learning-agent.signals.ts` — `buildVersionEventMap`, `calculateAllSignals` (10 signals × 6 dimensions, pure functions)
- `modules/messaging/learning-agent/learning-agent.audit.ts` — `buildSignalsComputedPayload`, `buildSignalsFailedPayload`
- `modules/messaging/learning-agent/learning-agent.service.ts` — `runLearningAnalysis` (9-step orchestration)
- `modules/messaging/repositories/learning-snapshot.repo.ts` — `writeSnapshots`, read functions, `loadPhase3bActivityEvents`, `loadVersionDimensions`
- `modules/messaging/actions/learning-agent.actions.ts` — `runLearningAnalysisAction`
- `app/.../settings/agent-monitor/page.tsx` — extended: learning snapshots loader, Learning Signals table, advisory alert banners
- `app/.../settings/agent-monitor/RunAnalysisButton.tsx` — "Run Learning Analysis" client component
- `supabase/migrations/20240025_phase3b_learning_snapshots.sql`

**Test count:** 53 (42 fixtures + 11 additional pure-function and guardrail tests)

**Key behavior:**
- On-demand trigger from agent monitor; scheduled cron deferred to v2
- 90-day lookback window hardcoded (`LEARNING_AGENT_LOOKBACK_DAYS = 90`)
- ET_ events filtered via `metadata.source === 'phase_3b_send_bridge'` — Phase 3A sends excluded
- `HRB_ACTION_APPROVED` events matched by event_type only (no source filter) for `approval_to_send_rate` denominator
- Each version's events deduplicated by `entity_id` per event type (multiple opens for same version = one open counted)
- 10 signals: `send_success_rate`, `send_failure_rate`, `delivery_rate`, `bounce_rate`, `complaint_rate`, `delivery_failure_rate`, `open_rate`, `click_rate`, `approval_to_send_rate`, `unknown_outcome_rate`
- 6 dimensions: `tenant_wide`, `message_type`, `strategy_angle`, `score_band`, `qra_recommended`, `version_label`
- Standard confidence thresholds (N<5 = insufficient, 5–19 = low, 20–49 = moderate, ≥50 = high); engagement thresholds for `open_rate`/`click_rate` (N<10/10–29/30–99/≥100)
- When open/click denominator ≥ threshold but zero events exist: rate = 0.0 with a "tracking may not be enabled" note — not null
- `approval_to_send_rate` TENANT_WIDE denominator = all `approvedVersionIds` (not intersected with ET_ event set — approved-but-not-sent versions are correctly included)
- Score bands/dimensions with zero sends produce no snapshot row — omission, not error
- `LA_SIGNALS_COMPUTED` or `LA_SIGNALS_COMPUTATION_FAILED` emitted per run (non-fatal)

**Guardrails:**
- Does not modify `message_strategies`, `quality_reviews`, or `message_versions`
- Does not create `email_drafts` or `email_sends`
- Does not call Resend API
- Does not call external LLMs
- `advisory = true` enforced on every `learning_snapshots` row by DB `CHECK` constraint in migration `20240025`
- No cross-tenant queries — all queries include `tenant_id =` filter
- Write path is `learning_snapshots` only — no other table receives writes from the Learning Agent

---

## 3. End-to-End Data Flow

The following documents the complete data flow from a new strategy through learning signal output.

### Step 1 — Strategy generation

A reviewer opens the message workspace for a lead and clicks "Generate Strategy." The Message Strategy Agent reads the lead record, prior email history, and workspace context. It produces a `message_strategies` row with `status = 'active'`.

```
message_strategies (status = 'active')
  ├── lead_id
  ├── message_type
  ├── skill_slug
  ├── offer_angle
  ├── tone
  └── (+ other strategy fields)
```

### Step 2 — Version generation

The Copywriting Agent reads the active `message_strategy` and generates 2–4 candidate `message_version` rows.

```
message_versions (approval_status = 'pending')
  ├── strategy_id → message_strategies.id
  ├── version_label (A, B, C, D)
  ├── subject_line
  ├── body_text (plain text)
  ├── body_html = null (always)
  └── strategy_angle
```

### Step 3 — Quality review

The Quality Review Agent reads the strategy and all versions and produces one `quality_reviews` row per version.

```
quality_reviews (per version)
  ├── version_id → message_versions.id
  ├── strategy_id
  ├── composite_score (0–100)
  ├── score_band ('excellent'|'strong'|'usable'|'needs_review'|'do_not_use')
  ├── rank_position
  ├── is_recommended (true on exactly one version per run)
  └── risk_flags (with severity: low|medium|high|critical)
```

### Step 4 — Human review and approval

The reviewer reads the QRA scores, rankings, risk flags, and notes in the message workspace. They select the preferred version and approve it (acknowledging any high-risk flags if present). The Human Review Bridge validates 18 gate conditions and writes the state transition.

```
message_versions (approval_status = 'approved')
  └── reviewed_by, reviewed_at populated

activity_events (HRB_ACTION_APPROVED)
  └── entity_id = message_version_id
  └── metadata: { version_id, strategy_id, composite_score_at_action, risk_flags_at_action, ... }
```

### Step 5 — Draft creation

The reviewer clicks "Create Email Draft." The Send Bridge validates 14 gate conditions and runs the 17-step write sequence.

```
email_drafts (status = 'approved')
  ├── contact_id, lead_id, workspace_id, tenant_id
  ├── subject = message_version.subject_line
  ├── body_text = message_version.body_text
  └── ai_generation_metadata = {
        source: 'phase_3b_send_bridge',
        message_version_id,
        strategy_id,
        quality_review_id,
        version_label,
        composite_score,
        approved_by
      }

approval_requests (status = 'approved', auto-resolved)
  └── linked to email_draft

activity_events (SEB_ACTION_DRAFT_CREATED)
  └── metadata: { version_id, strategy_id, draft_id, ... }
```

### Step 6 — Human sends

The reviewer clicks "Send" on the approved draft. The existing Phase 3A `sendApprovedDraftAction` runs: validates the double-gate (draft + approval_request both approved), resolves sender identity, calls Resend API, creates `email_sends` row.

```
email_sends (status = 'queued' → 'sent')
  ├── draft_id → email_drafts.id
  ├── metadata = {
        source: 'phase_3b_send_bridge',
        message_version_id,
        strategy_id,
        quality_review_id,
        version_label,
        composite_score,
        approved_by,
        send_initiated_by,
        lead_id
      }
  └── resend_message_id (after Resend accepts)

activity_events (ET_SEND_INITIATED)
  └── entity_id = message_version_id
  └── metadata: { email_send_id, draft_id, message_version_id, strategy_id, ... }

activity_events (ET_SEND_SUCCEEDED)
  └── entity_id = message_version_id
```

### Step 7 — Webhook outcomes arrive

Resend delivers the email and fires webhook events to `/api/webhooks/resend`. The webhook handler looks up the `email_send` (expanded select includes `metadata`), detects Phase 3B origin via `isPhase3bSend()`, and emits the appropriate ET_ activity event.

```
activity_events (ET_EMAIL_DELIVERED | ET_EMAIL_BOUNCED | ET_EMAIL_COMPLAINED | ...)
  └── entity_id = message_version_id
  └── metadata: { message_version_id, strategy_id, quality_review_id, composite_score, ... }

email_sends.status updated by existing Phase 3A webhook handler
```

### Step 8 — Learning Agent runs

A reviewer or administrator clicks "Run Learning Analysis" in the agent monitor. The Learning Agent loads ET_ events and HRB_ACTION_APPROVED events for the tenant over the 90-day window, loads dimension context from `message_versions` and `quality_reviews`, calculates all signals, and writes `learning_snapshots`.

```
learning_snapshots (per signal × dimension × dimension_value per run_id)
  ├── run_id (UUID, groups one analysis run)
  ├── signal_name (e.g., 'delivery_rate')
  ├── dimension (e.g., 'score_band')
  ├── dimension_value (e.g., 'strong')
  ├── numerator, denominator, rate (e.g., 44, 47, 0.9362)
  ├── sample_n, confidence (e.g., 47, 'moderate')
  ├── advisory = true (DB-enforced)
  └── notes (e.g., null or 'Insufficient data...')

activity_events (LA_SIGNALS_COMPUTED)
  └── metadata: { run_id, signals_computed, total_sends, lookback_days, ... }
```

---

## 4. Database / Data Model Summary

### Phase 3A Tables (Existing — Not Modified by Phase 3B Agents)

| Table | Purpose | Phase 3B use |
|-------|---------|--------------|
| `email_drafts` | Email draft record with subject, body, status | Send Bridge creates rows; ET_ reads `ai_generation_metadata` |
| `email_draft_versions` | Version history for email drafts | Untouched by Phase 3B |
| `approval_requests` | Double-gate approval control for drafts | Send Bridge creates and auto-resolves rows |
| `email_sends` | Record per send attempt; links to Resend | ET enriches `metadata` at send time; webhook handler updates `status` |
| `email_events` / `webhook_events` | Per-webhook event records with idempotency | Existing Phase 3A; ET_ block runs AFTER `23505` idempotency guard |
| `contacts`, `leads`, `companies` | CRM entities | HRB and SEB validate contact linkage, suppression, do_not_contact |
| `sender_identities` | Workspace email sender configuration | SEB validates sender identity before draft creation |
| `unsubscribes` | Suppression list | SEB checks; auto-unsubscribe on complaint is existing Phase 3A behavior |

### Phase 3B Tables (Added During Phase 3B — New Migrations)

| Table | Migration | Purpose |
|-------|-----------|---------|
| `message_strategies` | `20240022` | Strategy Agent output — one per lead strategy run |
| `message_versions` | `20240023` | Copywriting Agent output — 2–4 per strategy |
| `quality_reviews` | `20240024` | QRA output — one per version; composite score, bands, risk flags, recommendation |
| `learning_snapshots` | `20240025` | Learning Agent output — advisory signals per run, tenant-scoped |

### Phase 3A Shared Table (Attribution Spine)

| Table | Purpose in Phase 3B |
|-------|---------------------|
| `activity_events` | Audit trail and attribution spine for all Phase 3B actions. HRB, SEB, ET, and LA all write to this table additively. No new table was needed. Queried by the Learning Agent for all signal calculations. |

### Attribution Data Model

Phase 3B provenance travels as a payload chain:

```
message_versions.id (message_version_id)
    ↓  carried in
email_drafts.ai_generation_metadata
    ↓  copied into
email_sends.metadata  (at send time by email-send.service.ts)
    ↓  read from metadata in
activity_events (ET_SEND_*, ET_EMAIL_*) — entity_id = message_version_id
    ↓  read by
Learning Agent → learning_snapshots
```

The join chain is collapsed at write time. The Learning Agent does not need to traverse `email_drafts` or `email_sends` to attribute a delivery event to a version — the provenance is already in `activity_events.metadata`.

---

## 5. Activity Event Taxonomy

All Phase 3B actions write to the existing `activity_events` table. This table is the audit spine for the entire pipeline.

### HRB_ Events (Human Review / Approval Bridge)

| Event type | Trigger | entity_id |
|------------|---------|-----------|
| `HRB_ACTION_SELECTED` | Reviewer selects a version for consideration | `message_version_id` |
| `HRB_ACTION_DESELECTED` | Prior selected version is reverted when a new one is selected | `message_version_id` |
| `HRB_ACTION_REJECTED` | Reviewer rejects a version (with reason) | `message_version_id` |
| `HRB_ACTION_APPROVED` | Reviewer approves a version | `message_version_id` |
| `HRB_ACTION_REGENERATION_REQUESTED` | Reviewer requests new copy generation | `strategy_id` |
| `HRB_ACTION_RETURNED_TO_STRATEGY` | Reviewer returns to strategy selection | `strategy_id` |

**Purpose:** Full audit trail of reviewer decisions. `HRB_ACTION_APPROVED` events are also read by the Learning Agent to calculate `approval_to_send_rate`.

### SEB_ Events (Send / Email Draft Bridge)

| Event type | Trigger | entity_id |
|------------|---------|-----------|
| `SEB_ACTION_DRAFT_CREATED` | Draft successfully created from approved version | `message_version_id` |
| `SEB_ACTION_DRAFT_CREATION_BLOCKED` | Draft creation blocked by a gate condition | `message_version_id` |

**Purpose:** Audit trail for draft creation. Records which version produced a draft, what gate conditions were checked, and (for blocked) which gate failed.

### ET_ Events (Event Tracking / Send Outcome Tracking)

| Event type | Source | entity_id |
|------------|--------|-----------|
| `ET_SEND_INITIATED` | `email-send.service.ts` — after `email_send` row created | `message_version_id` |
| `ET_SEND_SUCCEEDED` | `email-send.service.ts` — after Resend accepts | `message_version_id` |
| `ET_SEND_FAILED` | `email-send.service.ts` — after Resend failure | `message_version_id` |
| `ET_EMAIL_DELIVERED` | Resend webhook `email.delivered` | `message_version_id` |
| `ET_EMAIL_BOUNCED` | Resend webhook `email.bounced` | `message_version_id` |
| `ET_EMAIL_COMPLAINED` | Resend webhook `email.complained` | `message_version_id` |
| `ET_EMAIL_DELIVERY_FAILED` | Resend webhook `email.failed` | `message_version_id` |
| `ET_EMAIL_OPENED` | Resend webhook `email.opened` | `message_version_id` |
| `ET_EMAIL_CLICKED` | Resend webhook `email.clicked` | `message_version_id` |

**Purpose:** The pre-attributed observation feed. Every ET_ event carries full Phase 3B provenance in its `metadata` field (`message_version_id`, `strategy_id`, `quality_review_id`, `version_label`, `composite_score`). This makes the Learning Agent's signal calculation a direct aggregation over `activity_events` — no complex join chain required.

Note: `email.delivery_delayed` is log-only. No ET_ event is emitted.

### LA_ Events (Learning Agent)

| Event type | Trigger | entity_id |
|------------|---------|-----------|
| `LA_SIGNALS_COMPUTED` | Successful completion of `runLearningAnalysis` | (none — tenant-level event) |
| `LA_SIGNALS_COMPUTATION_FAILED` | `runLearningAnalysis` fails | (none — tenant-level event) |

**Purpose:** Audit trail for each analysis run. Records `run_id`, signals computed, total sends analyzed, lookback window, and who triggered the analysis. Enables future tooling to track analysis run history and anomalies.

### Why `activity_events` Is the Audit Spine

A single normalized table is used rather than per-agent specialized tables for three reasons:

1. **Additive extension.** Each new agent simply appends new `event_type` values. No new table creation. No schema migration for audit trail additions.
2. **Cross-agent attribution.** The Learning Agent can join HRB approval events with ET_ send events by `entity_id` (both use `message_version_id`) without needing cross-table lookups.
3. **Unified observability.** The agent monitor, compliance auditing, and future analytics tools have a single table to query across all agent actions.

---

## 6. QA Summary

### Test Breakdown

| Component | Test file | Tests |
|-----------|-----------|-------|
| Message Strategy Agent | `tests/message-strategy.test.ts` | 41 |
| Copywriting Agent | `tests/copywriting-agent.test.ts` | 100 |
| Quality Review Agent | `tests/quality-review-agent.test.ts` | 126 |
| Human Review Bridge | `tests/human-review-bridge.test.ts` | 100 |
| Send Bridge | `tests/send-bridge.test.ts` | 89 |
| Event Tracking | `tests/event-tracking.test.ts` | 81 |
| Learning Agent | `tests/learning-agent.test.ts` | 53 |
| **Total** | | **590** |

### Fixture Coverage

| Component | Fixtures |
|-----------|----------|
| Message Strategy Agent | 30 (TC-MSA-001 through TC-MSA-030) |
| Copywriting Agent | 35 (TC-CA-001 through TC-CA-035) |
| Quality Review Agent | 35 (TC-QRA-001 through TC-QRA-035) |
| Human Review Bridge | 35 (TC-HRB-001 through TC-HRB-035) |
| Send Bridge | 35 (TC-SEB-001 through TC-SEB-035) |
| Event Tracking | 35 (TC-ET-001 through TC-ET-035) |
| Learning Agent | 42 (TC-LA-001 through TC-LA-042) |
| **Total fixtures** | **247** |

### Build and TypeScript

| Check | Result | Notes |
|-------|--------|-------|
| `npx next build` | PASSED | Compiled successfully; 0 errors |
| TypeScript | PASSED | Clean across all new and modified files |
| `npx vitest run` | PASSED | 590/590; 0 failures; 0 skipped |

### Guardrail Verification (Code-Level)

The following were verified by grep and code review:

| Check | Result |
|-------|--------|
| No `email_sends` INSERT in learning-agent files | PASSED |
| No `email_drafts` INSERT in learning-agent files | PASSED |
| No `message_strategies` INSERT or UPDATE in learning-agent files | PASSED |
| No `quality_reviews` INSERT or UPDATE in learning-agent files | PASSED |
| No `message_versions` INSERT or UPDATE in learning-agent files | PASSED |
| No Resend API call in learning-agent files | PASSED |
| No external LLM API call in learning-agent files | PASSED |
| All learning-snapshot repo queries include `tenant_id =` filter | PASSED |
| `learning_snapshots` INSERT only — no UPDATE/DELETE | PASSED |
| All ET_ activity calls wrapped in `.catch(() => {})` | PASSED |
| All LA_ activity calls wrapped in `.catch(() => {})` | PASSED |
| Send Bridge does not call `sendApprovedDraftAction` | PASSED |
| Send Bridge does not insert into `email_sends` | PASSED |
| Event Tracking does not emit ET_ events for Phase 3A template sends | PASSED (via `isPhase3bSend()` gate) |

---

## 7. Guardrails Locked

The following boundaries are locked for all Phase 3B foundation components. They must not be violated in any future session without explicit user approval and a corresponding guardrail document update.

### No Auto-Send

Three distinct explicit human actions are required before an email is sent:
1. Approve a version (HRB — human click)
2. Create a draft (SEB — human click)
3. Send (Phase 3A `sendApprovedDraftAction` — human click)

No agent in Phase 3B sends email. No agent in Phase 3B calls `sendApprovedDraftAction`. No agent in Phase 3B creates `email_sends` rows. This guarantee extends through all seven layers.

### No Uncontrolled Resend API Calls

The only path to Resend is through the existing Phase 3A `sendApprovedDraftAction`, which has its own double-gate (draft + approval_request both approved). The Send Bridge creates and auto-resolves the approval_request, but does not call Resend. Event Tracking observes the send — it does not initiate one.

### No Generated Copy Mutation After Approval

`message_version.body_text` and `message_version.subject_line` are immutable after creation. No Phase 3B layer (HRB, SEB, ET, LA) modifies these fields. The Send Bridge copies content verbatim from the `message_version` to the `email_draft`. If there is a discrepancy, the draft reflects the version's content at draft-creation time; the version is not retroactively updated.

### No QRA Score Mutation by Learning Agent

`quality_reviews` rows are read-only from the Learning Agent's perspective. The Learning Agent reads `score_band` and `is_recommended` to group signals by dimension — it does not write scores, update rankings, or modify the recommendation flag. QRA is evaluation-only and its records are immutable after creation.

### No Automatic Strategy Changes

`message_strategies` rows are not written by any agent downstream of the Message Strategy Agent. The Learning Agent reads outcomes and writes advisory signals — it does not update strategy parameters, adjust weights, or regenerate strategies. Any future active-learning strategy adjustment requires a separately approved design.

### No Learning Agent Automation Behavior

The Learning Agent is advisory-only. Every `learning_snapshots` row carries `advisory = true`, enforced by a DB-level `CHECK` constraint. The Learning Agent does not:
- Modify strategy selection logic
- Update QRA weights or thresholds
- Trigger automated sends, retries, or follow-up actions
- Auto-suppress contacts based on bounce or complaint signals
- Apply any learning signal without human review

### No External LLM Calls in Event Tracking or Learning Agent

Event Tracking is pure observation: attribution helpers are pure functions; all webhook handling is deterministic rule-based matching. The Learning Agent is pure arithmetic aggregation: all signal calculations are deterministic; no LLM is invoked for interpretation, pattern detection, or recommendation generation.

### Phase 3A Template Email Behavior Unchanged

All Phase 3A template-originated emails (not via the Send Bridge) are unaffected by Event Tracking and the Learning Agent. The `isPhase3bSend()` gate (`metadata.source === 'phase_3b_send_bridge'`) filters all ET_ event emissions and all Learning Agent signal calculations. Phase 3A sends do not appear in any `ET_` event, `learning_snapshots` row, or advisory signal.

### Tenant-Scoped Learning

Every `learning_snapshots` row is scoped to `tenant_id`. Every Learning Agent query includes `.eq('tenant_id', tenantId)`. No cross-tenant data is shared, combined, or referenced. The Learning Agent never uses another tenant's signal history as a prior for another tenant's calculations.

### Advisory-Only Learning Snapshots

`advisory = true` is enforced at both the application level (the Learning Agent's pure signal calculation always produces `advisory: true as const`) and the database level (`CHECK (advisory = true)` constraint in migration `20240025`). This constraint can only be relaxed by a separately approved design and a new migration that removes or changes the constraint.

---

## 8. Known Limitations / Technical Debt

These are honest limitations of the v1 foundation. They do not prevent the foundation from being locked; they inform what the next hardening phase should address.

### 8.1 Send Bridge Provenance via JSONB, Not DB FK

Phase 3B provenance (`message_version_id`, `strategy_id`, `quality_review_id`) travels through `email_drafts.ai_generation_metadata` and `email_sends.metadata` as JSONB fields. There is no foreign key from `email_sends` to `message_versions` or `message_strategies`. This means:
- Database-level referential integrity is not enforced for the Phase 3B attribution chain
- Queries against `activity_events.metadata` to extract provenance use JSONB path operators, which are not indexed for arbitrary paths
- At small volumes this is acceptable; at high volumes, a DB-level `message_version_id` column on `email_sends` would be more efficient

**Proposed fix:** Add indexed FK columns (`message_version_id`, `strategy_id`) to `email_sends` in a future hardening migration. No code change required — just a migration and a repo query update.

### 8.2 Send Bridge Write Sequence Is Not a Single DB Transaction

The 17-step Send Bridge write sequence (create draft → create approval_request → link → resolve → sync → supersede) is executed as sequential Supabase calls. Supabase's hosted Postgres does not support multi-statement client-level transactions in the same way a direct connection would. If the service crashes between step 8 (approval_request created) and step 9 (draft linked), the draft may exist in `pending_approval` without a linked approval_request. This is safe for the reviewer — the duplicate guard (SEB_011) would block re-creation — but the draft would be stuck in `pending_approval` until manually resolved.

**Proposed fix:** A Postgres function or an idempotent cleanup job that reconciles stuck drafts. Low priority given current volume.

### 8.3 Learning Agent Is On-Demand Only in v1

The "Run Learning Analysis" button requires a reviewer to manually trigger the analysis. Signals are not automatically refreshed. If no one clicks the button, the agent monitor will show stale data (or no data for new tenants). A nightly cron (via Inngest or pg_cron) would keep signals fresh without manual intervention.

**Proposed fix:** A scheduled Inngest job calling `runLearningAnalysisAction` nightly per tenant. Deferred to v2.

### 8.4 Open/Click Rate Interpretation Depends on Resend Tracking Availability

The Learning Agent cannot know whether Resend open and click tracking was enabled for a given send. If tracking was disabled, zero `ET_EMAIL_OPENED` events will exist — and the Learning Agent will display `open_rate = 0.0` with a note, which is technically correct but may mislead a reviewer into thinking no one opened the email (as opposed to "tracking wasn't enabled").

**Proposed fix:** A workspace-level configuration flag for "open tracking enabled" that the Learning Agent can read. Low priority.

### 8.5 Learning Snapshots Do Not Drive Strategy Weights

The signals produced by the Learning Agent are currently read-only advisory outputs for human consumption. They do not feed back into the Message Strategy Agent or the Quality Review Agent in any automated way. The full active-learning loop (where high-confidence signals soft-bias future strategy decisions) is a future approved design.

### 8.6 No Reply Quality / Revenue Conversion / Sentiment Learning

Three high-value signal types are explicitly deferred:
- **Reply rate and intent classification** — requires inbound email infrastructure and NLP
- **Revenue conversion** — requires a conversion event (e.g., merchant approval, statement signed) to be defined and tracked
- **Sentiment trend** — requires NLP or LLM-assisted analysis

None of these are blocked by the current implementation; they require additional infrastructure and approved design work.

### 8.7 No A/B Statistical Significance Testing

The current versioning model uses reviewer-selected versions, not randomly assigned A/B treatments. This means the delivery/open/click rate differences between version labels (A vs B) and strategy angles cannot be interpreted as causal A/B test results — they are observational. True statistical significance requires randomized assignment. This is deferred and requires a separately approved experiment design.

---

## 9. Deferred Future Work

The following items are explicitly out of scope for Phase 3B Foundation. They are recorded here for future roadmap planning.

### Infrastructure and Hardening

| Item | Priority | Notes |
|------|----------|-------|
| DB-level FK/index for `message_version_id` and `strategy_id` on `email_sends` | Medium | Improves query performance and referential integrity for the attribution chain |
| Send Bridge transaction hardening | Low | Idempotent cleanup job for stuck `pending_approval` drafts |
| Scheduled Learning Agent runs | Medium | Nightly Inngest job; requires job infrastructure decision |
| Production monitoring and alerting | Medium | Ops-level: delivery rate alerts, send volume anomaly detection |
| Admin tooling for Learning Agent | Low | Run history, signal comparison across runs, signal export |

### Analytics and Learning

| Item | Priority | Notes |
|------|----------|-------|
| Richer learning dashboard | Medium | Signal trends over time, run comparison, per-strategy signal drill-down |
| Reply tracking | High (future) | Inbound email infrastructure required; opens the quality-of-engagement signal |
| Revenue outcome tracking | High (future) | Conversion event definition required; enables full-funnel ROI signals |
| Active learning / strategy weighting | High (future) | Requires separately approved design; soft-bias on high-confidence signals only |
| Inbound email / reply classification | Medium (future) | NLP/LLM pipeline; sentiment, intent, outcome classification |
| A/B statistical significance | Low (future) | Requires randomized experiment assignment infrastructure |
| LLM-assisted signal interpretation | Low (future) | Natural language summaries of learning signals; requires approved LLM design |

### UI / UX

| Item | Priority | Notes |
|------|----------|-------|
| Message workspace polish | Medium | Version card layout, QRA score visualization, strategy context panel |
| Agent monitor learning signal views | Medium | Signal trends, confidence indicators, run history navigation |
| Insufficient data empty states | Low | Cleaner "not enough sends yet" messaging for new tenants |
| Advisory alert configuration | Low | Tenant-configurable alert thresholds for bounce/complaint rates |

---

## 10. Final Lock Criteria

Phase 3B is ready to be locked as a stable foundation. The following checklist confirms all acceptance criteria are met:

| Criterion | Status |
|-----------|--------|
| Message Strategy Agent — design doc complete | ✓ Locked |
| Message Strategy Agent — implementation plan complete | ✓ Locked |
| Message Strategy Agent — code committed and tagged | ✓ `phase-3b-message-strategy-agent-v1` |
| Copywriting Agent — design doc complete | ✓ Locked |
| Copywriting Agent — implementation plan complete | ✓ Locked |
| Copywriting Agent — code committed and tagged | ✓ `phase-3b-copywriting-agent-v1` |
| Quality Review Agent — design doc complete | ✓ Locked |
| Quality Review Agent — implementation plan complete | ✓ Locked |
| Quality Review Agent — code committed and tagged | ✓ `phase-3b-quality-review-agent-v1.1` |
| Human Review Bridge — design doc complete | ✓ Locked |
| Human Review Bridge — implementation plan complete | ✓ Locked |
| Human Review Bridge — code committed and tagged | ✓ `phase-3b-human-review-bridge-v1` |
| Send / Email Draft Bridge — design doc complete | ✓ Locked |
| Send / Email Draft Bridge — implementation plan complete | ✓ Locked |
| Send / Email Draft Bridge — code committed and tagged | ✓ `phase-3b-send-bridge-v1` |
| Event Tracking — design doc complete | ✓ Locked |
| Event Tracking — implementation plan complete | ✓ Locked |
| Event Tracking — code committed and tagged | ✓ `phase-3b-event-tracking-v1` |
| Learning Agent — design doc complete | ✓ Locked |
| Learning Agent — implementation plan complete | ✓ Locked |
| Learning Agent — code committed and tagged | ✓ `phase-3b-learning-agent-v1` |
| `npx vitest run` — 590/590 passed, 0 failures | ✓ PASSED |
| `npx next build` — 0 errors | ✓ PASSED |
| TypeScript — 0 errors | ✓ PASSED |
| Guardrail grep pass — no writes to locked tables | ✓ PASSED |
| AI Context Recovery Pack updated (`docs/ai-context/`) | ✓ Updated through Learning Agent |
| Final QA / Lock Report produced | ✓ This document |
| Next phase identified | ✓ Phase 3B.1 Stabilization or Phase 3C or UI/UX polish |

**Verdict: Phase 3B Foundation is complete. All 21 design/plan/code deliverables are committed and tagged. All 590 tests pass. The build is clean. The guardrails are verified. Phase 3B may be locked.**

---

## 11. Recommended Next Phase Options

The following directions are available after Phase 3B is locked. Each is mutually exclusive for an initial next step; they can be sequenced afterward.

### Option A — Phase 3B.1 Stabilization / Hardening

**What:** Address the technical debt items in Section 8 and Section 9. Specifically:
- Add `message_version_id` and `strategy_id` indexed FK columns to `email_sends`
- Add scheduled Learning Agent runs via Inngest
- Add a cleanup reconciler for stuck Send Bridge drafts
- Add production monitoring hooks for delivery rate and send volume anomalies

**Why now:** These are infrastructure-level issues that become more expensive to fix as data volume grows. A hardening sprint before new features reduces long-term maintenance risk.

**Effort:** Medium — 1–2 sprint. Primarily migrations, service extensions, and job setup.

### Option B — Phase 3C Active Learning Design

**What:** Begin the separately approved design for allowing the Message Strategy Agent to soft-bias future decisions based on high-confidence Learning Agent signals.

**Why this matters:** The full value of the Learning Engine is realized when signals inform strategy. Currently signals are read-only advisory.

**Guardrail:** This requires a full design-and-approval cycle before any code is written. The design must specify the weight update model, dampening factors, minimum confidence thresholds, override mechanisms, and safety guards.

**Effort:** Large — requires design document, implementation plan, and careful implementation. Not to be started without explicit scope and approval.

### Option C — UI/UX Polish for Message Workspace and Agent Monitor

**What:** Improve the reviewer-facing surfaces:
- Message workspace version card layout (strategy context panel, QRA score visualization, version comparison view)
- Agent monitor learning signals (signal trends over time, run history navigation, per-strategy drill-down)
- Insufficient data empty states for new tenants

**Why now:** The pipeline is technically complete but the reviewer experience may feel dense or opaque. UI polish directly improves adoption and trust in agent-generated content.

**Effort:** Low to medium — primarily front-end work with no schema changes.

### Option D — Production Readiness / Monitoring / Admin Tooling

**What:** Prepare the Phase 3B infrastructure for production use:
- Admin panel for managing Learning Agent run history
- Alerting for anomalous delivery rates or complaint spikes
- Logging and observability improvements
- Load testing for high-volume `activity_events` query patterns

**Why now:** If Phase 3B is expected to process meaningful send volumes, production readiness should precede new feature work.

**Effort:** Medium — primarily infrastructure, tooling, and ops work.

---

## 12. Final Recommendation

### Lock Phase 3B Foundation

Phase 3B Revenue Learning Engine Foundation is complete, verified, and ready to lock. No outstanding code changes, failed tests, or missing deliverables prevent the lock.

**Recommended action:** Review this document, commit it, and mark Phase 3B Foundation as locked. Do not begin any new intelligence features until this report is reviewed and the lock is confirmed.

### Immediate Next Step Recommendation

**Phase 3B.1 Stabilization / Hardening (Option A)** is the recommended immediate next step, specifically:

1. Add `message_version_id` (indexed FK) to `email_sends` — closes the attribution chain's only gap
2. Add a nightly scheduled Learning Agent run via Inngest — makes the advisory signals continuously fresh without manual action
3. Add a Send Bridge draft reconciler — eliminates the only known stuck-state risk

These three items are low-risk, high-value, and unblock Options B and C by ensuring the data foundation is clean before active learning or UX work begins.

**After stabilization:** Phase 3C Active Learning Design or UI/UX polish are both strong candidates depending on whether the immediate priority is product adoption (UI) or technical value-add (active learning).

**Before any active learning work:** A full design-and-approval cycle is required. No code changes to the strategy selection or QRA weighting logic may be made without a locked implementation plan approved by the user.

---

*Document status: Final draft — awaiting user review and approval before Phase 3B is formally locked.*
*Version: 1.0 — 2026-05-21*
