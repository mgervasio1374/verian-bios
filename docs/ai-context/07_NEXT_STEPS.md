# 07 — Next Steps

## Completed — Quality Review Agent Foundation v1.1

Closed. All deliverables committed and tagged. See `06_GIT_MILESTONES.md` for details.

## Completed — Human Review / Approval Bridge Planning

Both planning documents are locked and committed.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b-human-review-approval-bridge-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-human-review-approval-bridge-implementation-plan.md`) |
| Code implementation | **Not started — next step** |

## Approved Next Phase

**Phase 3B Human Review / Approval Bridge — Code Implementation**

Status: **Not started.** Both prerequisite documents are locked. Code implementation requires an explicit user prompt to begin.

## Locked Planning Documents

| Document | Path | Status |
|----------|------|--------|
| Design & Test Cases v1.0 | `docs/roadmap/phase-3b-human-review-approval-bridge-design-test-cases.md` | Locked |
| Implementation Plan v1.0 | `docs/roadmap/phase-3b-human-review-approval-bridge-implementation-plan.md` | Locked |

The implementation must follow the locked implementation plan exactly. Do not make architectural decisions independently.

## What the Code Implementation Must Build (in sequence)

Follow the 15-step sequence from the Implementation Plan (Section 22):

1. **Inspect** — Read existing `message-version.repo.ts`, `copywriting-agent.actions.ts`, `GeneratedVersionsPanel.tsx`, `modules/intelligence/types.agent.ts`
2. **`human-review.types.ts`** — HRB error codes (HRB_001–HRB_018), action types, rejection reasons, all interfaces
3. **`human-review.validation.ts`** — Pure functions: `validateApprovalEligibility`, `validateSelectEligibility`, `validateRejectEligibility`, risk flag helpers
4. **`human-review.audit.ts`** — Pure event payload builders for all 6 action types
5. **Extend `message-version.repo.ts`** — 7 new functions: `updateMessageVersionApprovalStatus`, `setMessageVersionRejectionReason`, `getMessageVersionWithStrategy`, `getSelectedVersionForStrategy`, `getApprovedVersionForStrategy`, `deselectOtherVersionsForStrategy`, `getNonSupersededVersionsForStrategy`
6. **`human-review.repo.ts`** — Audit activity reads from `activity_events` (optional if v1 UI does not surface review history)
7. **`human-review.service.ts`** — 10 service functions: select, reject, approve, validate eligibility, request regeneration, record event, get events, get selected/approved, deselect prior
8. **Extend `modules/intelligence/types.agent.ts`** — Add 6 HRB activity event type constants (additive only)
9. **`human-review.actions.ts`** — 6 server actions: select, reject, approve, acknowledgeRiskAndApprove, requestRegeneration, returnToStrategy
10. **35 test fixtures** — `tests/fixtures/human-review-bridge/TC-HRB-001.json` through `TC-HRB-035.json`
11. **`tests/human-review-bridge.test.ts`** — Validation unit tests, state machine tests, audit builder tests, fixture-based integration tests
12. **Extend `GeneratedVersionsPanel.tsx`** — Full bridge UI: Approve for Next Step button, RejectModal, OverrideReasonModal, RiskAcknowledgementModal, status indicators, critical risk banner, approved/selected/rejected visual states, all-rejected prompt
13. **QA pass** — `npx vitest run` (≥ 302 tests), `npx next build`, ESLint
14. **Guardrail correction pass** — Verify no email_draft, no approval_request, no send, no QRA modification, no strategy modification, no body/subject writes
15. **Implementation summary** — Report files created, test count, build status. Stop before Send Bridge.

## Key HRB v1 Decisions (Locked)

| Decision | Value |
|----------|-------|
| Bridge stops at | `approved` message_version — no email_draft, no send |
| Audit mechanism | `activity_events` table (existing); no new DB table in v1 |
| One selected per strategy | Enforced — selecting V-B reverts V-A to pending |
| One approved per strategy | Enforced — HRB_018 blocks second approval |
| Critical risk policy | Unconditionally blocks approval; no override in v1 |
| High risk policy | Requires `riskAcknowledged = true` |
| Low score policy | `composite_score < 70` requires `overrideReason` (non-empty string) |
| QRA recommendation | Advisory display only; does not gate approval |
| Error codes | HRB_001 through HRB_018 |
| Send / Email Draft Bridge | Future work — separate design required |

## What the Code Implementation Must NOT Do

- Do not send email
- Do not create `email_drafts`
- Do not create `approval_requests`
- Do not modify `body_text` or `subject_line`
- Do not modify QRA scores or rankings
- Do not modify `message_strategy` fields
- Do not call external LLMs
- Do not trigger Learning Agent
- Do not create a new DB table or migration
- Do not begin Send / Email Draft Bridge work
- Do not stop at fewer than 302 total tests (267 existing + ≥ 35 HRB)

## QA Expectations After Implementation

| Metric | Expected |
|--------|---------|
| Total tests | ≥ 302 (267 existing + ≥ 35 HRB) |
| `npx vitest run` | PASSED |
| `npx next build` | PASSED |
| TypeScript | PASSED |
| ESLint (modified UI files) | 0 errors, 0 warnings |
| Existing 267 tests | All still passing (no regressions) |

## After Human Review / Approval Bridge

Once the HRB is implemented, committed, and QA-verified:

- Send / Email Draft Bridge can be designed (separate design document required)
- Body HTML generation can be scoped as a separate sub-task
- Learning Agent design can begin (separate design session required)

## Process Reminder

Standard sequence applies:

1. Implementation Plan already locked — proceed to code implementation
2. Code implementation — follow locked plan, with guardrail correction pass before final QA
3. QA: `npx vitest run` + `npx next build`
4. Commit, tag as `phase-3b-human-review-bridge-v1`
5. Update `docs/ai-context/` files
