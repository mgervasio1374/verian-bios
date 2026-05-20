# 07 — Next Steps

## Approved Next Phase

**Phase 3B Quality Review Agent — Code Implementation**

Status: **Not started.** Both prerequisite documents are locked. Code implementation requires an explicit user prompt to begin.

## Locked Planning Documents

| Document | Path | Status |
|----------|------|--------|
| Design & Test Cases v1.0 | `docs/roadmap/phase-3b-quality-review-agent-design-test-cases.md` | Locked |
| Implementation Plan v1.0 | `docs/roadmap/phase-3b-quality-review-agent-implementation-plan.md` | Locked |

The implementation must follow the locked implementation plan exactly. Do not make architectural decisions independently.

## What the Code Implementation Must Build (in sequence)

1. `supabase/migrations/20240024_phase3b_quality_reviews.sql` — quality_reviews table, indexes, RLS, trigger
2. `modules/messaging/quality-review/quality-review-agent.types.ts` — all types, error codes, score band constants, QRA-owned pattern constants
3. `modules/messaging/repositories/quality-review.repo.ts` — repository
4. `modules/messaging/quality-review/quality-review-agent.scoring.ts` — 8 pure scoring functions
5. `modules/messaging/quality-review/quality-review-agent.risk-flags.ts` — risk flag detector, RFL-001–RFL-025
6. `modules/messaging/quality-review/quality-review-agent.composite.ts` — composite score calculator
7. `modules/messaging/quality-review/quality-review-agent.ranking.ts` — ranking and recommendation assignment
8. `modules/messaging/quality-review/quality-review-agent.reasoning.ts` — reasoning generator
9. `modules/messaging/quality-review/quality-review-agent.validation.ts` — invalid condition checker, QRA_001–QRA_013
10. `modules/messaging/quality-review/quality-review-agent.message-type-rules.ts` — 12 message type rules
11. `modules/messaging/quality-review/quality-review-agent.service.ts` — 12-step orchestration service
12. `modules/messaging/actions/quality-review-agent.actions.ts` — server actions
13. `modules/intelligence/types.agent.ts` — add `quality_review_agent`, `QUALITY_REVIEW_COMPLETED`, `QUALITY_REVIEW_NO_RECOMMENDATION` (additive only)
14. `tests/fixtures/quality-review-agent/TC-QRA-001.json` through `TC-QRA-035.json` — 35 fixtures
15. `tests/quality-review-agent.test.ts` — QRA Vitest test suite
16. `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx` — extended with quality review display
17. Full QA: `npx vitest run` (176+ tests expected) + `npx next build` + TypeScript + lint

## What the Code Implementation Must NOT Do

- Do not begin approval/send bridge work
- Do not begin Learning Agent design or implementation
- Do not add external LLM calls
- Do not approve messages or wire sending
- Do not create `email_drafts` or `approval_requests`
- Do not modify `message_version` content
- Do not modify `message_strategy` records
- Do not stop at fewer than 176 total tests (141 existing + 35 QRA)
- Do not skip the guardrail correction pass before final QA

## QA Expectations After Implementation

| Metric | Expected |
|--------|---------|
| Total tests | ≥ 176 (141 existing + 35 QRA) |
| `npx vitest run` | PASSED |
| `npx next build` | PASSED |
| TypeScript | PASSED |
| Existing tests | All 141 still passing (no regressions) |

## After Quality Review Agent

Once the Quality Review Agent is implemented, committed, and QA-verified:

- Human approval flow can be extended to use quality review rankings (separate scope)
- Body HTML generation can be scoped as a separate sub-task
- Learning Agent design can begin (requires separate design session)

## Process Reminder

Standard sequence applies:

1. Implementation Plan already locked — proceed to code implementation
2. Code implementation — follow locked plan, with guardrail correction pass before final QA
3. QA: `npx vitest run` + `npx next build`
4. Commit, tag, push
5. Update `docs/ai-context/` files
