# 01 — Locked Decisions

These decisions are finalized. They must not be reversed or reinterpreted without explicit user approval.

## Locked Source Documents

The following documents have been approved and locked. They serve as the specification source of truth for their respective phases.

| Document | Status |
|----------|--------|
| Phase 3B Architecture Specification — Revenue Learning Engine | Locked |
| Phase 3B Skills & Playbooks Pack v1.0 | Locked |
| Phase 3B Message Strategy Agent — Design & Test Cases v1.0 | Locked |
| Phase 3B Message Strategy Agent — Implementation Plan v1.0 | Locked |
| Phase 3B Message Strategy Agent Foundation — Code Implementation v1.0 | Locked |
| Phase 3B Copywriting Agent — Design & Test Cases v1.0 | Locked |
| Phase 3B Copywriting Agent — Implementation Plan v1.0 | Locked |
| Phase 3B Copywriting Agent Foundation — Code Implementation v1.0 | Locked |
| Phase 3B Quality Review Agent — Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b-quality-review-agent-design-test-cases.md`) |
| Phase 3B Quality Review Agent — Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-quality-review-agent-implementation-plan.md`) |
| Phase 3B Quality Review Agent Foundation — Code Implementation v1.0 | Locked (`435b890`, `96f32f8`) |
| Phase 3B Human Review / Approval Bridge — Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b-human-review-approval-bridge-design-test-cases.md`) |
| Phase 3B Human Review / Approval Bridge — Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-human-review-approval-bridge-implementation-plan.md`) |
| Phase 3B Human Review / Approval Bridge Foundation — Code Implementation v1.0 | Locked (`ea3342c`) |
| Phase 3B Send / Email Draft Bridge — Design & Test Cases v1.1 | Locked (`docs/roadmap/phase-3b-send-email-draft-bridge-design-test-cases.md`) |
| Phase 3B Send / Email Draft Bridge — Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-send-email-draft-bridge-implementation-plan.md`) |
| Phase 3B Send / Email Draft Bridge Foundation — Code Implementation v1.0 | Locked (`fd8a4fb`) |
| Phase 3B Event Tracking — Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b-event-tracking-send-outcome-design-test-cases.md`) |
| Phase 3B Event Tracking — Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-event-tracking-send-outcome-implementation-plan.md`) |
| Phase 3B Event Tracking Foundation — Code Implementation v1.0 | Locked (`28db22a`) |
| Phase 3B Learning Agent — Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b-learning-agent-design-test-cases.md`) |
| Phase 3B Learning Agent — Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-learning-agent-implementation-plan.md`) |
| Phase 3B Learning Agent Foundation — Code Implementation v1.0 | Locked (`44ea577`) |

## Locked Architectural Decisions

### Agent Pipeline Layering

```
Message Strategy Agent → Copywriting Agent → [Quality Review Agent] → [Human Approval] → [Sending]
```

Each agent is strictly separated. An agent may only consume outputs from the agent to its left. No agent skips a layer.

### Strategy Controls Copy

The Message Strategy Agent owns all strategic decisions: message type, skill selection, offer angle, tone, audience context, required inclusions. The Copywriting Agent reads the strategy and executes it. The Copywriting Agent may not override strategy decisions.

### Quality Review Agent Scores Later

Quality scoring, best-version ranking, strategic fit evaluation, and risk flagging belong to the Quality Review Agent — not the Copywriting Agent. The Copywriting Agent does not score, rank, or filter its own output beyond compliance and structural validation.

### Human Approval and Sending Are Separate

No agent approves a message for sending. No agent triggers sending. Human approval and send triggering are separate, downstream steps not owned by any v1 agent.

### Learning Agent Foundation Is Implemented (v1.0)

The Learning Agent is implemented, committed, and tagged (`44ea577`, tag `phase-3b-learning-agent-v1`). It is advisory-only and must remain that way.

**What it does:**
- On-demand trigger only in v1 — a "Run Learning Analysis" button in the agent monitor
- Reads Phase 3B `ET_` activity events filtered to `metadata.source === 'phase_3b_send_bridge'` for all send/outcome signals
- Reads `HRB_ACTION_APPROVED` events (by `event_type` only, no source filter) for the `approval_to_send_rate` denominator
- Uses a 90-day lookback window (`LEARNING_AGENT_LOOKBACK_DAYS = 90`, hardcoded in v1)
- Calculates 10 signals: `send_success_rate`, `send_failure_rate`, `delivery_rate`, `bounce_rate`, `complaint_rate`, `delivery_failure_rate`, `open_rate`, `click_rate`, `approval_to_send_rate`, `unknown_outcome_rate`
- Groups each signal by 6 dimensions: `tenant_wide`, `message_type`, `strategy_angle`, `score_band`, `qra_recommended`, `version_label`
- Applies minimum sample thresholds and confidence levels (`insufficient` / `low` / `moderate` / `high`) — standard thresholds for most signals, higher engagement thresholds for `open_rate` and `click_rate`
- When `open_rate` or `click_rate` denominator ≥ threshold but zero open/click events exist, rate = 0.0 with a note — not null
- Deduplicates events by `entity_id` per event type (multiple opens/clicks for same version = one counted)
- Writes advisory `learning_snapshots` rows — one per signal × dimension × dimension_value combination per `run_id`
- Emits `LA_SIGNALS_COMPUTED` on success or `LA_SIGNALS_COMPUTATION_FAILED` on failure (both non-fatal `.catch(() => {})`)
- Displays read-only learning signals in the agent monitor settings page

**What it does not do:**
- Does not automatically change `message_strategy` parameters — advisory only
- Does not update `quality_reviews` scores or rankings
- Does not modify `message_version` copy (`body_text`, `subject_line`)
- Does not create `email_drafts` or `email_sends`
- Does not call Resend API
- Does not call external LLMs — all arithmetic aggregation, deterministic
- Does not auto-suppress, auto-send, auto-retry, or trigger any automated follow-up
- Does not share data across tenants — all queries include `tenant_id =` filter
- Does not process Phase 3A template sends — `isPhase3bSend()` gate enforced

**DB enforcement:** Every `learning_snapshots` row has `advisory = true` enforced by a `CHECK (advisory = true)` DB constraint in migration `20240025`.

### body_html Is Always Null in v1

The Copywriting Agent produces `body_text` only. `body_html` is null at the type level, enforced in the structural validator, and set to null in the repository insert. This will be revisited in a future version.

### No External LLM Calls in Copywriting Agent v1

The Copywriting Agent uses deterministic rule-based generation only. No calls to Claude API, OpenAI, or any other LLM are permitted in v1. Future LLM adapters may be added without changing service contracts, by design.

### Vitest Is the Test Framework

The project had no test framework before Phase 3B. Vitest was added as an approved deviation. All agent tests use Vitest with fixture-based pure function testing.

### Pure Functions Throughout

Version planner, compliance validator, structural validator, differentiation validator, subject generator, body generator, preview generator, and retry coordinator are all pure functions — no I/O, no side effects. This was a deliberate design choice for testability and predictability.

### Phase 3A Is Locked

Phase 3A services, repositories, types, and migrations must not be modified unless explicitly scoped in a new approved task.

### Quality Review Agent Is Evaluation-Only

The Quality Review Agent reads `message_strategy` and `message_version` records and produces `quality_review` records. It must not write or rewrite copy, modify any `message_version` content, modify any `message_strategy` field, approve messages for sending, create `email_drafts`, create `approval_requests`, call external LLMs in v1, or take any action that affects the pipeline beyond producing quality_review records.

### QRA Recommendation Is Advisory

The Quality Review Agent may mark one version per strategy run as `is_recommended = true`. This recommendation is advisory — it does not approve the version, does not trigger sending, and does not replace human review.

### QRA v1 Is Deterministic

The Quality Review Agent uses rule-based, pure-function scoring in v1. No external LLM calls. No randomness. Future LLM-assisted scoring may be introduced only under a separately approved design.

### Human Review / Approval Bridge Is Not an AI Agent

The Human Review / Approval Bridge is a workflow and state-management layer only. It does not reason, generate, score, or evaluate. It surfaces agent outputs and enforces gate conditions so that a human reviewer can make an explicit decision.

### HRB Stops at `approved` message_version in v1 (Option A)

The bridge marks a `message_version` as `approved` and stops. It does not create `email_drafts`, does not create `approval_requests`, and does not trigger sending. The `approved` state is the handoff point for a future Send / Email Draft Bridge.

### HRB Enforces One-Approved-Per-Strategy Policy

Only one non-superseded `message_version` per strategy may have `approval_status = approved` at a time. A second approval attempt is blocked with `HRB_018`. No replacement workflow exists in v1.

### HRB Uses activity_events for Audit Trail in v1

No new database table is created for the bridge in v1. All reviewer action audit records are written to the existing `activity_events` table. A dedicated review event table is deferred until the Learning Agent or advanced analytics requires it.

### HRB Critical Risk Blocks Approval Unconditionally

If a `quality_review` record contains a risk flag with `severity === 'critical'`, approval is blocked. No override path exists in v1. This decision may only be changed under a separately approved design.

### Send / Email Draft Bridge Is Implemented (v1.0)

The bridge that converts an `approved` `message_version` into a send-ready `email_draft` is now implemented and locked (`fd8a4fb`, tag `phase-3b-send-bridge-v1`).

**What it does:**
- Validates 14 gate conditions (SEB_001–SEB_014) before any DB write
- Creates `email_draft` as `pending_approval`, then creates and auto-resolves an `approval_request` to `approved`, satisfying the Phase 3A double-gate required by `sendApprovedDraftAction`
- Supersedes prior pending drafts for the lead (runs last, after all writes succeed)
- Emits `SEB_ACTION_DRAFT_CREATED` or `SEB_ACTION_DRAFT_CREATION_BLOCKED` activity events
- Triggered by an explicit "Create Email Draft" human action — not automatic on HRB approval

**What it does not do:**
- Does not call Resend API
- Does not insert into `email_sends`
- Does not call `sendApprovedDraftAction`
- Does not modify `message_version` content or `approval_status`
- Does not modify QRA records or HRB logic
- Does not create new database tables or migrations
- Does not call external LLMs
- Does not trigger the Learning Agent

**Sending still requires a separate explicit human action** through the existing Phase 3A send flow (`sendApprovedDraftAction`).

### Event Tracking / Send Outcome Tracking Is Implemented (v1.0)

The observation and attribution layer that records what happens after a Phase 3B-originated email is sent is now implemented and locked (`28db22a`, tag `phase-3b-event-tracking-v1`).

**What it does:**
- Enriches `email_sends.metadata` with Phase 3B provenance at send time (`message_version_id`, `strategy_id`, `quality_review_id`, `version_label`, `composite_score`, `approved_by`, `send_initiated_by`, `lead_id`)
- Emits `ET_SEND_INITIATED` after the `email_send` record is created (before Resend API call)
- Emits `ET_SEND_SUCCEEDED` after Resend accepts the email
- Emits `ET_SEND_FAILED` after a Resend failure is recorded
- Expands the `email_sends` select in `processResendEvent` (webhook handler) to include `metadata`, `workspace_id`, `contact_id`, `company_id`, `draft_id` — enabling Phase 3B attribution at webhook time
- Emits `ET_EMAIL_DELIVERED`, `ET_EMAIL_BOUNCED`, `ET_EMAIL_COMPLAINED`, `ET_EMAIL_DELIVERY_FAILED`, `ET_EMAIL_OPENED`, `ET_EMAIL_CLICKED` from the webhook handler for Phase 3B-originated sends only
- All activity event calls are non-fatal (`.catch(() => {})`) — event tracking failures never block sends
- Duplicate webhook protection: Phase 3B block runs only after the existing `23505` idempotency guard passes
- Surfaces delivery status (Delivered / Bounced / Complaint / Send Failed / Sent) in the message workspace version card UI

**What it does not do:**
- Does not update QRA scores, HRB decisions, or strategy weights
- Does not send email or call Resend API beyond the existing send flow
- Does not insert into `email_sends`
- Does not modify generated message copy
- Does not create new database tables or migrations
- Does not trigger the Learning Agent
- Does not auto-suppress bounces (complaint auto-unsubscribe is existing Phase 3A behavior, unchanged)
- Does not change Phase 3A template email behavior

**Phase 3B detection:** `email_sends.metadata.source === 'phase_3b_send_bridge'` distinguishes Phase 3B sends from Phase 3A template sends. Phase 3A sends are unaffected.

**`email.delivery_delayed`** remains log-only — no activity event emitted.

**Learning Agent feed:** `activity_events` rows with `ET_` event types carry full Phase 3B attribution (`message_version_id`, `strategy_id`, `quality_review_id`) — queryable by the future Learning Agent without reconstructing the join chain.
