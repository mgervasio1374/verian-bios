# 03 — Message Strategy Agent Summary

## Status

Implemented, committed, tagged, QA-verified.

**Tag:** `phase-3b-message-strategy-agent-v1`

## Purpose

The Message Strategy Agent decides *what* to send and *why* for a given lead. It does not write copy. It produces a `message_strategy` record that the Copywriting Agent consumes.

## What It Produces

A `message_strategy` row containing:

- `message_type` — one of 12 types (e.g., `cold_outreach`, `statement_review_follow_up`)
- `skill_slug` + `skill_version` — which skill from the Skills & Playbooks Pack to use
- `offer_angle` — the specific value proposition angle
- `tone` — communication tone
- `pain_point_hypothesis` — hypothesized business pain
- `proof_point` — specific evidence supporting the approach
- `audience_context` — contextual signals about the lead
- `required_inclusions` — copy elements that must appear in the message
- `avoid` — phrases and approaches to exclude
- `confidence_score` — numeric confidence (0.0–1.0)
- `confidence_band` — human-readable band (`high`, `medium`, `low`, `very_low`)
- `decision_rationale` — explanation of why this strategy was selected

## Decision Tree

The agent uses an 11-priority decision tree (P1–P11):

| Priority | Rule |
|----------|------|
| P1 | Human override active → use override |
| P2 | Active proposal → proposal follow-up |
| P3 | Statement review complete → statement review follow-up |
| P4 | Statement submitted (not reviewed) → statement submitted confirmation |
| P5 | Statement not submitted after invitation → statement not submitted follow-up |
| P6 | Event/expo context → event follow-up |
| P7 | Partner member context → partner campaign |
| P8 | New inquiry → new inquiry response |
| P9 | Re-engagement context → re-engagement |
| P10 | Customer (active account) → customer nurture |
| P11 | Default → cold outreach |

## File Map

| File | Purpose |
|------|---------|
| `supabase/migrations/20240022_phase3b_message_strategies.sql` | DB migration |
| `modules/messaging/strategy/message-strategy.types.ts` | All types, constants, error codes |
| `modules/messaging/strategy/message-strategy.normalizer.ts` | Pure input normalizer |
| `modules/messaging/strategy/message-strategy.decision-tree.ts` | P1–P11 priority decision tree |
| `modules/messaging/strategy/message-strategy.skill-selector.ts` | Skill selection + SKILL_001-011 validation |
| `modules/messaging/strategy/message-strategy.confidence.ts` | Confidence scoring |
| `modules/messaging/strategy/message-strategy.validation.ts` | STRAT_001-013 error codes |
| `modules/messaging/strategy/message-strategy.override.ts` | Human override service |
| `modules/messaging/strategy/message-strategy.service.ts` | Main 9-step orchestrator |
| `modules/messaging/repositories/message-strategy.repo.ts` | DB read/write operations |
| `modules/messaging/actions/message-strategy.actions.ts` | Server actions |
| `app/(workspace)/[workspaceSlug]/message-workspace/page.tsx` | Strategy workspace listing |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx` | Lead strategy workspace |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/StrategyReviewPanel.tsx` | Client component |
| `tests/message-strategy.test.ts` | 41 tests |
| `tests/fixtures/message-strategy/tc-001.json` → `tc-030.json` | 30 test fixtures |

## Error Codes

`STRAT_001` through `STRAT_013` — defined in `message-strategy.types.ts`.

## Skill Validation Codes

`SKILL_001` through `SKILL_011` — defined in `message-strategy.types.ts`.

## Rules

- Strategy-only agent
- Does not write subject lines
- Does not write body copy
- Does not call external LLMs
- Does not send messages
- Does not approve messages
- Produces `message_strategy` objects only
