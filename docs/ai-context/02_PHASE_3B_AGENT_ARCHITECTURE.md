# 02 — Phase 3B Agent Architecture

## Revenue Learning Engine Overview

Phase 3B is the Verian Revenue Learning Engine. It is a multi-agent pipeline that produces outbound messaging candidates, evaluates them, and eventually learns from outcomes.

## Agent Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Revenue Learning Engine                         │
│                                                                     │
│  Lead + History                                                     │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────────┐                                           │
│  │  Message Strategy    │  Decides WHAT to send and WHY            │
│  │  Agent               │  Produces: message_strategy              │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐                                           │
│  │  Copywriting Agent   │  Writes candidate versions               │
│  │                      │  Produces: message_version[]             │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐  (Implemented)                           │
│  │  Quality Review      │  Scores and ranks versions               │
│  │  Agent               │  Produces: quality_review                │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐  (Implemented)                           │
│  │  Human Review /      │  Selects, rejects, approves versions     │
│  │  Approval Bridge     │  Produces: approved message_version      │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐  (Implemented)                           │
│  │  Send / Email Draft  │  Creates send-ready email_draft          │
│  │  Bridge              │  Produces: approved email_draft          │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐  (Implemented)                           │
│  │  Event Tracking /    │  Tracks sends, outcomes, responses       │
│  │  Send Outcome Track. │  Produces: ET_ activity_events           │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐  (Implemented)                           │
│  │  Learning Agent      │  Computes advisory outcome signals       │
│  └──────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────┘
```

## Agent Responsibilities

### Message Strategy Agent (Implemented)

- **Input:** Lead record, prior message history, workspace context
- **Output:** `message_strategy` row
- **Decides:** Message type, skill slug, offer angle, tone, pain point, proof point, audience context, required inclusions, avoid list, lead source classification, partner membership context
- **Does not:** Write copy, send messages, score quality

### Copywriting Agent (Implemented)

- **Input:** `message_strategy` row, lead record
- **Output:** `message_version[]` rows (2–4 candidates per strategy)
- **Produces:** Subject line, body text (plain text only), preview text, version label, differentiation profile
- **Validates:** Compliance (banned phrases, urgency, guaranteed outcomes, inbound/cold framing, partner claims, review-complete gates), structural correctness, version differentiation
- **Does not:** Score quality, rank best version, approve for send, generate body_html, call external LLMs

### Quality Review Agent (Implemented — v1.1 committed and tagged)

- **Status:** Complete. Design, plan, backend, and UI integration all committed. Tags: `phase-3b-quality-review-agent-v1`, `phase-3b-quality-review-agent-v1.1`.
- **Input:** `message_strategy` row, `message_version[]` rows, skill definitions, optional prior message context
- **Output:** `quality_review` rows — one per evaluated version
- **Scores per version:** Strategic fit, compliance confidence, CTA clarity, specificity/personalization, tone fit, differentiation, subject/body consistency, readability
- **Also produces per version:** `composite_score`, `score_band`, `rank_position`, `is_recommended`, `risk_flags`, `scoring_reasoning`, `human_review_notes`, `comparison_summary`, `recommended_edits`
- **Does not:** Write copy, modify versions, approve, send, create email_drafts, create approval_requests, call external LLMs in v1
- **Recommendation is advisory:** `is_recommended` marks the strongest version but does not approve or send it

### Human Review / Approval Bridge (Implemented — v1.0 committed and tagged)

- **Status:** Complete. Design, plan, and code implementation all committed. Tag: `phase-3b-human-review-bridge-v1`.
- **Input:** `message_strategy` row, `message_version[]` rows, `quality_review[]` rows, reviewer identity, system controls
- **Output:** Updated `approval_status` on `message_version` (`selected`, `rejected`, `approved`) + `activity_event` audit records
- **Actions:** Select preferred version, reject version (with reason), approve version for next step, request regeneration, return to strategy
- **Gate conditions:** 18 error codes (HRB_001–HRB_018); critical risk unconditionally blocks approval
- **One-approved-per-strategy:** HRB_018 blocks second approval under same strategy
- **Audit:** Activity events written per action; no new DB table in v1
- **Does not:** Write copy, modify QRA scores, send email, create email_drafts, create approval_requests, call external LLMs
- **Handoff:** `approved` message_version is the handoff state consumed by the Send / Email Draft Bridge

### Send / Email Draft Bridge (Implemented — v1.0 committed and tagged)

- **Status:** Complete. Design, plan, and code implementation all committed. Tag: `phase-3b-send-bridge-v1`.
- **Input:** `approved` `message_version`, reviewer identity, lead/contact/sender identity data
- **Output:** `email_draft` with `status = 'approved'` + linked `approval_request` (auto-resolved) + `activity_event` audit record
- **Trigger:** Explicit "Create Email Draft" human action in the message workspace — not automatic on HRB approval
- **14 gate conditions:** SEB_001–SEB_014 (version approved, strategy active, contact linked, email present, not suppressed, sender identity present, no duplicate, etc.)
- **Write sequence (safe ordering):** CREATE draft (pending_approval) → CREATE approval_request (pending) → LINK → RESOLVE approval_request (approved) → SYNC draft (approved) → SUPERSEDE prior pending drafts
- **Double-gate:** The auto-resolved `approval_request` satisfies `sendApprovedDraftAction`'s Phase 3A double-gate check; no second manual approval step required
- **Audit:** `SEB_ACTION_DRAFT_CREATED` or `SEB_ACTION_DRAFT_CREATION_BLOCKED` written to `activity_events`; no new DB table
- **Does not:** Call Resend, insert `email_sends`, call `sendApprovedDraftAction`, modify `message_version`, modify QRA records, call external LLMs, create migrations
- **Handoff:** `approved` `email_draft` is immediately sendable via the existing `sendApprovedDraftAction`; reviewer must explicitly trigger send

### Event Tracking / Send Outcome Tracking (Implemented — v1.0 committed and tagged)

- **Status:** Complete. Design, plan, and code implementation all committed. Tag: `phase-3b-event-tracking-v1`.
- **Input:** Phase 3B send events (from `sendApprovedDraft`) and Resend webhook events (via `/api/webhooks/resend/route.ts`)
- **Output:** `ET_` activity event rows in `activity_events` with full Phase 3B provenance; send delivery status visible in message workspace UI
- **Internal events (from send service):** `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED`
- **Webhook events (from Resend):** `ET_EMAIL_DELIVERED`, `ET_EMAIL_BOUNCED`, `ET_EMAIL_COMPLAINED`, `ET_EMAIL_DELIVERY_FAILED`, `ET_EMAIL_OPENED`, `ET_EMAIL_CLICKED`
- **Attribution:** Phase 3B provenance (`message_version_id`, `strategy_id`, `quality_review_id`) is copied into `email_sends.metadata` at send time; webhook handler reads it back via `metadata.source === 'phase_3b_send_bridge'` detection
- **Idempotency:** Duplicate webhook protection via existing `provider_event_id` unique constraint; Phase 3B activity event block placed after the `23505` early-return guard
- **Non-fatal:** All activity event calls wrapped in `.catch(() => {})` — event tracking failures never block sends
- **UI:** Message workspace version cards show Delivered / Bounced / Complaint / Send Failed / Sent badges
- **Does not:** Update scores, modify copy, send email, call Resend, create migrations, trigger Learning Agent, auto-suppress on bounce
- **Phase 3A template emails:** Unchanged — `source !== 'phase_3b_send_bridge'` → no ET_ activity events emitted
- **Handoff:** `activity_events` with `ET_` types carry full Phase 3B attribution — pre-attributed feed for the Learning Agent

### Learning Agent (Implemented — v1.0 committed and tagged)

- **Status:** Complete. Design, plan, and code implementation all committed. Tag: `phase-3b-learning-agent-v1`.
- **Input:** Phase 3B `ET_` activity events (filtered by `metadata.source === 'phase_3b_send_bridge'`); `HRB_ACTION_APPROVED` events (for `approval_to_send_rate` denominator); `message_versions` and `quality_reviews` for dimension context
- **Output:** `learning_snapshots` rows — one per signal × dimension × dimension_value per `run_id` — and one `LA_SIGNALS_COMPUTED` or `LA_SIGNALS_COMPUTATION_FAILED` activity event per run
- **Trigger:** On-demand "Run Learning Analysis" button in the agent monitor settings page (v1); scheduled cron deferred to v2
- **Lookback window:** 90 days hardcoded in v1 (`LEARNING_AGENT_LOOKBACK_DAYS = 90`)
- **10 signals calculated:** `send_success_rate`, `send_failure_rate`, `delivery_rate`, `bounce_rate`, `complaint_rate`, `delivery_failure_rate`, `open_rate`, `click_rate`, `approval_to_send_rate`, `unknown_outcome_rate`
- **6 dimensions:** `tenant_wide`, `message_type`, `strategy_angle`, `score_band`, `qra_recommended`, `version_label`
- **Confidence model:** `insufficient` / `low` / `moderate` / `high` with minimum sample thresholds; standard for most signals, higher for open/click engagement signals
- **All outputs advisory:** `advisory = true` on every `learning_snapshots` row, enforced by DB `CHECK` constraint in migration `20240025`
- **Does not:** Change strategies, update QRA scores, modify copy, create drafts or sends, call Resend, call external LLMs, trigger auto-send or auto-retry, share data across tenants

## Data Model Relationships

```
lead
 └── message_strategy          (1 active per lead at a time)
      └── message_version[]    (2–4 candidates per strategy)
           └── quality_review  (1 per version, from Quality Review Agent — implemented)
                └── approved message_version  (1 per strategy, from Human Review Bridge — implemented)
                     └── email_draft (approved, from Send Bridge — implemented)
                          └── approval_request (auto-resolved, satisfies Phase 3A double-gate)
                               └── email_send → ET_ activity_events (from Event Tracking — implemented)
                                    ├── ET_SEND_INITIATED / ET_SEND_SUCCEEDED / ET_SEND_FAILED
                                    └── ET_EMAIL_DELIVERED / ET_EMAIL_BOUNCED / ET_EMAIL_OPENED / ...

ET_ activity_events + HRB_ACTION_APPROVED activity_events
 └── Learning Agent (implemented) reads events + message_versions + quality_reviews
      └── learning_snapshots (advisory, run_id-grouped, 10 signals × 6 dimensions)
           └── LA_SIGNALS_COMPUTED activity_event (audit trail per run)
```

## Key Design Principles

1. **Separation of concerns** — each agent does one job and one job only
2. **Strategy controls copy** — Copywriting Agent cannot override strategy decisions
3. **Pure functions** — all generation and validation logic is pure (no I/O)
4. **Deterministic v1** — no randomness, no LLM calls, reproducible output
5. **Fixture-driven testing** — all agents tested against JSON fixtures
6. **Compliance first** — compliance validator runs before structural validator; failed compliance triggers retry
7. **Human in the loop** — no agent approves or sends without human confirmation
