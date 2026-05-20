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

### Learning Agent Is Future Work

The Learning Agent is not part of Phase 3B Foundation. It is not to be designed or implemented until explicitly scoped.

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
