# 07 — Next Steps

## Completed — Quality Review Agent Foundation v1.1

Closed. All deliverables committed and tagged. See `06_GIT_MILESTONES.md` for details.

## Completed — Human Review / Approval Bridge Foundation v1.0

All deliverables committed, tagged, and QA-verified.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked |
| Implementation Plan v1.0 | Locked |
| Code implementation | Complete — `ea3342c`, tag `phase-3b-human-review-bridge-v1` |
| QA: 367/367 tests, build, TypeScript | PASSED |

## Completed — Send / Email Draft Bridge Foundation v1.0

All deliverables committed, tagged, and QA-verified.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.1 | Locked (`docs/roadmap/phase-3b-send-email-draft-bridge-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-send-email-draft-bridge-implementation-plan.md`) |
| Code implementation | Complete — `fd8a4fb`, tag `phase-3b-send-bridge-v1` |
| QA: 456/456 tests, build, TypeScript | PASSED |

### What was delivered

- `send-bridge.types.ts` — SEB_ERROR_CODES (SEB_001–SEB_014), SEB_ACTION_TYPES, all interfaces
- `send-bridge.validation.ts` — `validateDraftCreationEligibility` (14 gates, pure function)
- `send-bridge.audit.ts` — `buildDraftCreatedPayload`, `buildDraftCreationBlockedPayload` (pure functions)
- `send-bridge.service.ts` — `createEmailDraftFromApprovedVersion` (17-step write flow), `getDraftStatusForVersion`
- `send-bridge.actions.ts` — `createEmailDraftFromApprovedVersionAction`
- `email-draft.repo.ts` extended with `getEmailDraftForVersion` (duplicate guard)
- `types.agent.ts` extended with 2 SEB event types (additive)
- `GeneratedVersionsPanel.tsx` extended: "Create Email Draft" button, confirmation modal, draft status indicators
- `page.tsx` extended: draft status loading for approved versions
- 35 SEB test fixtures + 89-test suite

### Key behavior

The reviewer clicks **"Create Email Draft"** on an approved version card. The bridge:
1. Validates 14 gate conditions (no writes if any fail)
2. Creates `email_draft` as `pending_approval`
3. Creates `approval_request` as `pending`
4. Links `approval_request_id` to the draft
5. Auto-resolves `approval_request` to `approved` (HRB approval is the human gate)
6. Syncs `email_draft.status` to `approved`
7. Supersedes prior pending drafts for the lead (runs last)
8. Emits `SEB_ACTION_DRAFT_CREATED` activity event

The draft is immediately sendable via the existing `sendApprovedDraftAction`. No second approval step. No auto-send.

## Approved Next Phase

**Phase 3B Event Tracking / Send Outcome Tracking — Design & Test Cases**

Status: **Not started.** Design must be produced and approved before any code is written.

## What Event Tracking Should Accomplish

Event Tracking closes the feedback loop on the pipeline by recording what happens after an email is sent:

- Consumes `email_sends` records (the send outcome from Phase 3A)
- Tracks opens, clicks, bounces, replies — linking them back to the `message_version` and `message_strategy` that produced the email
- Stores outcome records that the Learning Agent can consume in a future phase
- Does not build the Learning Agent
- Does not modify Phase 3A send behavior

## What the Design Must Specify

Before any code is written, the Design & Test Cases document must define:

1. What outcome events to track (open, click, bounce, reply, conversion)
2. Where outcome data comes from (Resend webhooks already exist at `/api/webhooks/resend`; supplement as needed)
3. Schema for outcome records (new table, or extend `activity_events`)
4. How outcome records link back to `message_version_id` and `strategy_id`
5. Gate conditions and idempotency rules
6. Test cases covering all event types and link-back logic

## What the Design Must NOT Do

- Do not build the Learning Agent
- Do not modify Phase 3A send behavior
- Do not modify QRA, HRB, or Send Bridge logic
- Do not auto-update strategy weights or priors

## Process Reminder

Standard sequence applies:

1. Design & Test Cases — produce document, get user approval
2. Implementation Plan — produce document, get user approval
3. Code implementation — follow locked plan
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag
6. Update `docs/ai-context/` files
