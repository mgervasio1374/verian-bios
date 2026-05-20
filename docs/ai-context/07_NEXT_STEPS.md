# 07 — Next Steps

## Completed — Quality Review Agent Foundation v1.1

The Quality Review Agent is fully implemented, committed, and QA-verified. This phase is closed.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked |
| Implementation Plan v1.0 | Locked |
| Backend (service, scoring, risk flags, composite, ranking, reasoning, validation, message type rules, repo, actions, migration, 35 fixtures, 126 tests) | Complete — `435b890` |
| UI integration (quality score display, recommended badge, risk flags, strengths/weaknesses, "Quality Review" button) | Complete — `96f32f8` |
| QA: 267/267 tests, build, TypeScript, lint | PASSED |
| Tags | `phase-3b-quality-review-agent-v1`, `phase-3b-quality-review-agent-v1.1` |

## Approved Next Phase

**Phase 3B Human Review / Approval Bridge — Design & Test Cases**

Status: **Not started.** Design must be produced and approved before any code is written.

## What the Approval Bridge Should Accomplish

The Approval Bridge connects the QRA output (ranked, scored `message_version` candidates) into the existing human workflow so a human reviewer can select a version and approve it for sending. Key requirements:

- A human reviewer sees the QRA-ranked versions (score, band, recommended badge, risk flags) in the UI.
- The reviewer can approve a specific version. Approval does not send — it only marks the version as approved.
- Sending remains gated behind a separate, explicit human action.
- The bridge should surface `is_recommended` from the quality review to guide the reviewer, but the reviewer is not bound by it.
- No new agent is built. This is a UI and data-layer bridge, not a new AI agent.
- The existing `approval_status` field on `message_versions` is the state machine to extend (`pending → selected → approved`).
- No `email_drafts` or `approval_requests` tables exist or need to be created in v1 scope.

## What the Design Must Specify

Before any code is written, the Design & Test Cases document must define:

1. **UI changes** — what the reviewer sees, what actions are available, what state transitions are triggered
2. **Data changes** — any new fields, status values, or tables required (minimal footprint preferred)
3. **Service changes** — what functions are added or extended (QRA service is read-only; message-version service may gain an `approveVersion` action)
4. **Gate conditions** — what blocks approval (e.g., version already rejected, strategy superseded)
5. **Test cases** — covering approval happy path, rejection, guard conditions, and state machine correctness

## What the Design Must NOT Do

- Do not wire email sending in this phase
- Do not create `email_drafts`
- Do not build a new AI agent
- Do not modify QRA scoring or recommendations
- Do not build the Learning Agent
- Do not expose any endpoint that sends an email without explicit human action

## Process Reminder

Standard sequence applies:

1. Design & Test Cases — produce document, get user approval
2. Implementation Plan — produce document, get user approval
3. Code implementation — follow locked plan
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag
6. Update `docs/ai-context/` files
