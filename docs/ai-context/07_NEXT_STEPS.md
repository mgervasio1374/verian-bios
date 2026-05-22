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

## Completed — Event Tracking / Send Outcome Tracking Foundation v1.0

All deliverables committed, tagged, and QA-verified.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b-event-tracking-send-outcome-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-event-tracking-send-outcome-implementation-plan.md`) |
| Code implementation | Complete — `28db22a`, tag `phase-3b-event-tracking-v1` |
| QA: 537/537 tests, build, TypeScript | PASSED |

### What was delivered

- `event-tracking.types.ts` — `ET_ACTION_TYPES` (9 constants), `EtPhase3bMeta`, payload interfaces
- `event-tracking.attribution.ts` — `extractPhase3bMeta`, `isPhase3bSend`, `buildPhase3bSendMetadata`, `RESEND_EVENT_TO_ET_TYPE`
- `event-tracking.audit.ts` — 4 pure payload builders for all ET_ event types
- `email-send.service.ts` extended: Phase 3B metadata enrichment into `email_sends.metadata`; `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` (all non-fatal)
- `email-send.repo.ts` extended: `getSendStatusForDraft` read helper
- `types.agent.ts` extended: 9 ET_ ActivityEventType constants (additive)
- `route.ts` extended: `email_sends` select expanded; Phase 3B activity event block after `23505` guard
- `page.tsx` extended: `sendStatusByDraftId` loading for sent versions
- `GeneratedVersionsPanel.tsx` extended: delivery status badges
- 35 ET fixtures + 81-test suite

### Key behavior

- Phase 3B provenance (`message_version_id`, `strategy_id`, `quality_review_id`) is copied into `email_sends.metadata` at send time when `metadata.source === 'phase_3b_send_bridge'`
- Internal events (`ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED`) emitted by `email-send.service.ts`
- Webhook events attributed back to Phase 3B context for Phase 3B-originated sends only; Phase 3A template sends unaffected
- `email.delivery_delayed` remains log-only — no activity event
- Duplicate webhook idempotency: Phase 3B block runs only after the existing `23505` early return
- All activity event calls non-fatal (`.catch(() => {})`) — never blocks a send
- Message workspace now shows: Sent / Delivered / Bounced / Complaint / Send Failed per approved version card

## Approved Next Phase

**Phase 3B Learning Agent — Design & Test Cases**

Status: **Not started.** Design must be produced and approved before any code is written.

## What the Learning Agent Should Accomplish

The Learning Agent closes the loop from observation back to strategy improvement:

- Reads the `activity_events` feed created by Event Tracking (`ET_` event types) — pre-attributed to `message_version_id`, `strategy_id`, `quality_review_id`
- Analyses outcome patterns: which version angles, QRA scores, message types, and strategy parameters correlate with delivery, opens, clicks
- Updates strategy priors or scoring weights so the Message Strategy Agent makes better decisions over time
- Does not auto-send — learning is a background analytics loop, not a send trigger

## What the Design Must Specify

Before any code is written, the Design & Test Cases document must define:

1. What the Learning Agent reads (which `activity_events` event types, over what time window)
2. What it produces (updated strategy weight records, skill performance records, or similar)
3. Where its output is stored (new table vs. extending existing)
4. How the Message Strategy Agent consumes learning signals (cold start, gradual influence, override thresholds)
5. How to prevent runaway feedback loops (safeguards on weight changes)
6. Test cases covering update logic, idempotency, and boundary conditions

## What the Design Must NOT Do

- Do not auto-send email based on learned patterns
- Do not modify the HRB approval gate or QRA scoring
- Do not modify generated copy or `message_version` records
- Do not modify Phase 3A send behavior or Event Tracking behavior

## Process Reminder

Standard sequence applies:

1. Design & Test Cases — produce document, get user approval
2. Implementation Plan — produce document, get user approval
3. Code implementation — follow locked plan
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag
6. Update `docs/ai-context/` files
