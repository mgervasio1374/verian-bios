# 04 — Copywriting Agent Summary

## Status

Implemented, committed, tagged, QA-verified.

**Tag:** `phase-3b-copywriting-agent-v1`

## Purpose

The Copywriting Agent consumes a `message_strategy` record and produces 2–4 `message_version` candidate rows. Each version is a fully formed outbound email candidate: subject line, plain-text body, and preview text.

## What It Produces

Per strategy, it produces an array of `message_version` rows, each containing:

- `subject_line` — deterministically generated from strategy type + angle
- `body_text` — deterministically generated from strategy type + angle + lead context
- `preview_text` — derived from the first sentence of body_text
- `body_html` — always `null` in v1
- `version_label` — e.g., `A`, `B`, `C`, `D`
- `strategy_angle` — identifies which differentiation angle was used
- `differentiation_profile` — JSON object describing how this version differs from others
- `compliance_passed` — boolean result of compliance validation
- `compliance_errors` — array of error codes if failed
- `structural_passed` — boolean result of structural validation
- `approval_status` — starts as `pending`

## Version Counts by Message Type

| Message Type | Versions |
|-------------|----------|
| cold_outreach | 4 |
| new_inquiry_response | 3 |
| statement_submitted_confirmation | 2 |
| statement_review_follow_up | 3 |
| statement_not_submitted_follow_up | 4 |
| proposal_follow_up | 2 |
| no_response_follow_up | 4 |
| re_engagement | 2 |
| partner_member_specific_campaign | 3 |
| event_expo_follow_up | 4 |
| referral_request | 2 |
| customer_nurture | 3 |

## Validation Pipeline

1. **Compliance validator** — banned phrases, urgency language, guaranteed outcome claims, inbound/cold framing violations, partner claims without confirmed membership, review-complete language without findings context
2. **Structural validator** — body_html null enforcement, CTA count, subject line length, body length
3. **Differentiation validator** — pairwise profile comparison across 8 dimensions; minimum 2-dimension difference required between any two versions

## Retry Coordinator

Up to 2 attempts per version slot. Eligible retry error codes: `COPY_015`, `COPY_016`, `COPY_019`, `COPY_020`.

## Compliance Error Codes

`COPY_001` through `COPY_020` — defined in `copywriting-agent.types.ts`.

## Warning Codes

`COPY_WARN_001` (single CTA warning), `COPY_WARN_002` — defined in `copywriting-agent.types.ts`.

## Key Compliance Guards

| Guard | Rule |
|-------|------|
| Review-complete language | Only allowed when `message_type === statement_review_follow_up` AND `proof_point` or `pain_point_hypothesis` is present |
| Dollar/percentage savings claims | Only allowed when `offer_angle === confirmed_savings_review` |
| Inbound acknowledgment language | Not allowed when lead source is cold/manual/import |
| Cold discovery language | Not allowed when lead source is inbound (website, tawk.to, etc.) |
| Partner names (certainpath, bcsg) | Only allowed when `partner_membership.confirmed === true` |
| Exclusivity claims | Never allowed in v1 |
| Deceptive urgency | Never allowed |
| Guaranteed outcomes | Never allowed |
| Event conversation references | Only allowed when `conversationNotes` is present in lead context |

## File Map

| File | Purpose |
|------|---------|
| `supabase/migrations/20240023_phase3b_message_versions.sql` | DB migration |
| `modules/messaging/copywriting/copywriting-agent.types.ts` | All types, error codes, constants |
| `modules/messaging/copywriting/copywriting-agent.skill-definitions.ts` | Static skill definitions (condensed seed of Skills & Playbooks Pack v1.0) |
| `modules/messaging/copywriting/copywriting-agent.version-planner.ts` | Pure version plan generator |
| `modules/messaging/copywriting/copywriting-agent.subjects.ts` | Pure subject line generator |
| `modules/messaging/copywriting/copywriting-agent.body.ts` | Pure body text generator |
| `modules/messaging/copywriting/copywriting-agent.preview.ts` | Pure preview text deriver |
| `modules/messaging/copywriting/copywriting-agent.compliance.ts` | Pure compliance validator |
| `modules/messaging/copywriting/copywriting-agent.validation.ts` | Pure structural validator |
| `modules/messaging/copywriting/copywriting-agent.differentiation.ts` | Pure pairwise differentiation validator |
| `modules/messaging/copywriting/copywriting-agent.retry.ts` | Retry coordinator |
| `modules/messaging/copywriting/copywriting-agent.service.ts` | Main 11-step service orchestrator |
| `modules/messaging/repositories/message-version.repo.ts` | DB read/write operations |
| `modules/messaging/actions/copywriting-agent.actions.ts` | 6 server actions |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx` | UI: version cards, generate, select, reject |
| `tests/copywriting-agent.test.ts` | 100 copywriting tests + 41 strategy tests = 141 total |
| `tests/fixtures/copywriting-agent/TC-CA-001.json` → `TC-CA-035.json` | 35 test fixtures |

## Lead Context Fields

The `CopywritingLeadContext` type includes two typed fields that are critical for compliance:

- `eventName: string | null` — populated from `strategy.audience_context` heuristic when `message_type === event_expo_follow_up`
- `conversationNotes: string | null` — populated from `strategy.proof_point` when `message_type === event_expo_follow_up`

These are typed on the struct — not cast at call sites.

## Server Actions

| Action | Purpose |
|--------|---------|
| `generateMessageVersionsAction` | Run the Copywriting Agent for a strategy |
| `getMessageVersionsAction` | Fetch existing versions for a strategy |
| `selectMessageVersionAction` | Set approval_status = selected |
| `rejectMessageVersionAction` | Set approval_status = rejected |
| `getCanGenerateAction` | Check gate conditions |
| `getVersionGenerationCountAction` | Get generation attempt count |

## Rules

- Execution-only agent
- Consumes `message_strategy` — does not produce strategies
- Produces `message_version` candidates only
- Deterministic v1 — no external LLM calls
- `body_html` is always null
- Does not score quality
- Does not rank best version
- Does not send
- Does not create `email_drafts`
- Does not create `approval_requests`
- Does not approve for send
- Strategy controls copy — no strategy overrides by the Copywriting Agent
