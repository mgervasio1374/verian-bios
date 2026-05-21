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
| QA: 367/367 tests, build, TypeScript, ESLint | PASSED |

## Approved Next Phase

**Phase 3B Send / Email Draft Bridge — Design & Test Cases**

Status: **Not started.** Design must be produced and approved before any code is written. No code must be written for the Send Bridge until this design document is locked.

## What the Send / Email Draft Bridge Should Accomplish

The Send / Email Draft Bridge converts an `approved` `message_version` into an `email_draft` or triggers the appropriate Phase 3A send workflow. Key requirements:

- Consumes `message_version` records with `approval_status = approved`
- May create `email_draft` records (this is its purpose — first bridge where email_draft creation is in scope)
- Sending may require further human confirmation — the design must define where the final send gate lives
- No auto-send; a human must trigger the final send action
- The bridge should be a thin translation layer between the Phase 3B approval state and the Phase 3A sending workflow

## What the Design Must Specify

Before any code is written, the Design & Test Cases document must define:

1. Whether `email_drafts` are created immediately on approval, or only when reviewer clicks a separate "Create Draft" action
2. The exact schema of `email_draft` records (or whether existing Phase 3A constructs are reused)
3. Whether Phase 3A approval workflow applies after `email_draft` creation
4. Gate conditions that block draft creation (e.g., version already sent, strategy superseded)
5. Test cases covering draft creation, blocking conditions, and no-auto-send guarantee

## What the Design Must NOT Do

- Do not auto-send email without explicit human action
- Do not create a new AI agent
- Do not modify QRA scores or HRB decisions
- Do not build the Learning Agent
- Do not modify the HRB `approved` state machine

## Process Reminder

Standard sequence applies:

1. Design & Test Cases — produce document, get user approval
2. Implementation Plan — produce document, get user approval
3. Code implementation — follow locked plan
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag
6. Update `docs/ai-context/` files
