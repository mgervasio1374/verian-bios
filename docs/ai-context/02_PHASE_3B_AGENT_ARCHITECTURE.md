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
│  ┌──────────────────────┐  (Design + plan locked; code next)       │
│  │  Human Review /      │  Selects, rejects, approves versions     │
│  │  Approval Bridge     │  Produces: approved message_version      │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐  (Future work)                           │
│  │  Send + Outcome      │  Sends, tracks, logs outcomes            │
│  │  Tracking            │                                           │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐  (Future work)                           │
│  │  Learning Agent      │  Learns from outcomes, updates priors    │
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

### Human Review / Approval Bridge (Design and plan locked — code implementation is next)

- **Status:** Design & Test Cases v1.0 locked. Implementation Plan v1.0 locked. Code implementation not yet started.
- **Input:** `message_strategy` row, `message_version[]` rows, `quality_review[]` rows, reviewer identity, system controls
- **Output:** Updated `approval_status` on `message_version` (`selected`, `rejected`, `approved`) + `activity_event` audit records
- **Actions:** Select preferred version, reject version (with reason), approve version for next step, request regeneration, return to strategy
- **Gate conditions:** 18 error codes (HRB_001–HRB_018); critical risk unconditionally blocks approval
- **One-approved-per-strategy:** HRB_018 blocks second approval under same strategy
- **Audit:** Activity events written per action; no new DB table in v1
- **Does not:** Write copy, modify QRA scores, send email, create email_drafts, create approval_requests, call external LLMs
- **Handoff:** `approved` message_version is the handoff state for the future Send / Email Draft Bridge

### Learning Agent (Future work)

- **Input:** Send outcomes, response data, conversion data
- **Output:** Updated priors, strategy weight adjustments
- **Not scoped yet**

## Data Model Relationships

```
lead
 └── message_strategy          (1 active per lead at a time)
      └── message_version[]    (2–4 candidates per strategy)
           └── quality_review  (1 per version, from Quality Review Agent — implemented)
                └── approved message_version  (1 per strategy, from Human Review Bridge — not yet built)
```

## Key Design Principles

1. **Separation of concerns** — each agent does one job and one job only
2. **Strategy controls copy** — Copywriting Agent cannot override strategy decisions
3. **Pure functions** — all generation and validation logic is pure (no I/O)
4. **Deterministic v1** — no randomness, no LLM calls, reproducible output
5. **Fixture-driven testing** — all agents tested against JSON fixtures
6. **Compliance first** — compliance validator runs before structural validator; failed compliance triggers retry
7. **Human in the loop** — no agent approves or sends without human confirmation
