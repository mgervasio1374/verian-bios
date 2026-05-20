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
│  ┌──────────────────────┐  (Not yet built)                         │
│  │  Quality Review      │  Scores and ranks versions               │
│  │  Agent               │  Produces: quality_review                │
│  └──────────┬───────────┘                                           │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────┐                                           │
│  │  Human Review        │  Selects, edits, approves, rejects       │
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

### Quality Review Agent (Not yet built)

- **Input:** `message_version[]` rows
- **Output:** `quality_review` rows
- **Will score:** Strategic fit, compliance confidence, CTA clarity, specificity/personalization, tone fit, differentiation quality, subject/body consistency, risk flags
- **Will produce:** Ranked version recommendation with reasoning
- **Design phase is next**

### Learning Agent (Future work)

- **Input:** Send outcomes, response data, conversion data
- **Output:** Updated priors, strategy weight adjustments
- **Not scoped yet**

## Data Model Relationships

```
lead
 └── message_strategy          (1 active per lead at a time)
      └── message_version[]    (2–4 candidates per strategy)
           └── quality_review  (1 per version, from Quality Review Agent)
```

## Key Design Principles

1. **Separation of concerns** — each agent does one job and one job only
2. **Strategy controls copy** — Copywriting Agent cannot override strategy decisions
3. **Pure functions** — all generation and validation logic is pure (no I/O)
4. **Deterministic v1** — no randomness, no LLM calls, reproducible output
5. **Fixture-driven testing** — all agents tested against JSON fixtures
6. **Compliance first** — compliance validator runs before structural validator; failed compliance triggers retry
7. **Human in the loop** — no agent approves or sends without human confirmation
