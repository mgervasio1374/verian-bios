# Goal 3 Design — Verian Policy Layer

## Executive Summary

Every Goal 2 prompt contained the same long guardrail list: no production, no staging, no migrations, no email sending, no automation, no UI, no server actions, and so on — duplicated verbatim across every slice. Goal 3 designs a reusable Verian Policy Layer that replaces this repetition with structured, testable policy profiles. A future prompt can reference `MEDIUM_RISK_BACKEND_NO_MIGRATION` instead of pasting twenty blocked-action lines, and the policy layer owns what that means: what actions are allowed, what checks are required, what evidence must be collected, and when work must stop.

The policy layer must exist and be approved before the Verian Agent Bridge is built. The bridge should never route work between Claude, Codex, ChatGPT, or Verian without policy enforcement already in place.

## Measurable Goal

- A policy layer design document exists (this file).
- The design defines reusable policy profiles with allowed actions, blocked actions, required checks, required evidence, review requirements, and stop conditions.
- The design explains how future prompts can reference a policy profile by ID instead of repeating guardrail boilerplate.
- The design explicitly states that the Verian Agent Bridge must not be implemented until policy profiles are approved and testable.

## Why This Goal Comes Before the Verian Agent Bridge

The Verian Agent Bridge is intended to shorten the orchestration loop between Claude, Codex, ChatGPT, and Verian by reducing copy/paste and prompt length. But shortening prompts before safety is codified means removing the only thing currently enforcing guardrails. Today, safety lives in the prompt text itself. If the bridge moves instructions without policy enforcement, the guardrails disappear in transit.

Policy must own:
- which actions are allowed
- which actions are blocked at all times
- what approval gates are required before proceeding
- what stop conditions terminate a slice
- what evidence must be collected before committing or pushing

Once policy owns these things, the bridge can shorten prompts safely — because the policy layer, not the prompt text, becomes the authoritative safety source.

The bridge should reduce copy/paste and prompt length only after policy exists and is testable.

## Proposed Policy Profile Shape

Design only — no type file yet.

```typescript
type VerianPolicyProfile = {
  policyId: string
  name: string
  riskLevel: 'low' | 'medium' | 'high'
  allowedActions: string[]
  blockedActions: string[]
  requiredChecks: string[]
  requiredEvidence: string[]
  requiredReviewers: string[]
  requiresCodexReview: boolean
  requiresHumanApproval: boolean
  requiresProductivityReport: boolean
  stopConditions: string[]
}
```

Each profile is a static, named policy object. A prompt references a `policyId`. The policy layer resolves the full profile. The bridge (once built) validates generated prompts against the resolved profile before routing them.

## Initial Policy Profiles

### `LOW_RISK_DOCS_ONLY`
- **riskLevel:** low
- **allowedActions:** create markdown files, commit docs, push docs
- **blockedActions:** all code changes, all migrations, all DB writes, all sending, all automation, all UI, all system-control changes
- **requiredChecks:** git status clean, HEAD matches expected hash, no temp files, no tags
- **requiredEvidence:** git log, HEAD hash, file name in commit
- **requiresCodexReview:** false
- **requiresHumanApproval:** false
- **requiresProductivityReport:** false
- **stopConditions:** any file other than the target doc is changed

### `LOW_RISK_UI_POLISH_NO_DATA`
- **riskLevel:** low
- **allowedActions:** modify UI components, update styles, commit, push
- **blockedActions:** data model changes, migrations, DB writes, sending, automation, server actions that write data, system-control changes
- **requiredChecks:** git status, changed files list, vitest run, tsc
- **requiredEvidence:** test output, diff stat, changed file names
- **requiresCodexReview:** false
- **requiresHumanApproval:** false
- **requiresProductivityReport:** false
- **stopConditions:** any migration file modified, any DB write command run, any sending/automation added

### `MEDIUM_RISK_BACKEND_NO_MIGRATION`
- **riskLevel:** medium
- **allowedActions:** create/modify repository files, service files, test files, commit, push
- **blockedActions:** migrations created, migrations applied, DB write commands, production touch, staging/dev touch, sending, automation, UI, server actions, API routes, system-control changes, tag creation
- **requiredChecks:** git status clean, HEAD hash, origin hash, no temp files, no tags, vitest pass, tsc pass, diff stat, changed file names
- **requiredEvidence:** full test output, TypeScript output, git log, files in commit, HEAD and origin match after push
- **requiresCodexReview:** false
- **requiresHumanApproval:** false
- **requiresProductivityReport:** true (at goal completion)
- **stopConditions:** any migration touched, any write command run, any production/staging touch, any new failure introduced

### `HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION`
- **riskLevel:** high
- **allowedActions:** create/modify any source files, tests, migrations in dev only, commit, push
- **blockedActions:** production touch, email sending, campaign sending, automation/background jobs, system-control changes, CAMPAIGN_SENDING_ENABLED, EMAIL_SENDING_ENABLED, approveAndSendAction, sendFollowUpDraftAction, approveRequestAction
- **requiredChecks:** git status, HEAD, origin, temp files, tags, vitest, tsc, diff, changed files, migration status
- **requiredEvidence:** full test output, TypeScript output, diff stat, files in commit, migration applied confirmation, HEAD and origin match
- **requiresCodexReview:** true
- **requiresHumanApproval:** true
- **requiresProductivityReport:** true
- **stopConditions:** production touched, any send action triggered, any automation enabled

### `MIGRATION_DESIGN_ONLY`
- **riskLevel:** medium
- **allowedActions:** create migration SQL files, commit migration files, push migration files
- **blockedActions:** apply migrations, run migration commands, touch production, touch staging/dev, send, automate, modify system controls
- **requiredChecks:** git status, changed files list, migration file name matches expected naming convention
- **requiredEvidence:** migration file contents, git log, files in commit
- **requiresCodexReview:** false
- **requiresHumanApproval:** true (before application)
- **requiresProductivityReport:** false
- **stopConditions:** any migration applied without explicit authorization

### `STAGING_VERIFICATION_ONLY`
- **riskLevel:** medium
- **allowedActions:** run staging migration apply commands, verify staging state, commit verification notes
- **blockedActions:** production touch, send, automate, modify system controls, create new migrations
- **requiredChecks:** migration status on staging, rollback plan confirmed, diff vs production confirmed
- **requiredEvidence:** staging migration log, staging health check, git log
- **requiresCodexReview:** false
- **requiresHumanApproval:** true (before staging apply)
- **requiresProductivityReport:** true
- **stopConditions:** production touched, send triggered, staging apply fails without rollback plan

### `CODEX_REVIEW_REQUIRED`
- **riskLevel:** high
- **allowedActions:** prepare review artifact, pass to Codex, receive Codex output, commit review results
- **blockedActions:** apply Codex suggestions without human approval, skip Codex when required, auto-merge, auto-push after Codex output
- **requiredChecks:** Codex output received, human approval of Codex output, diff between pre/post Codex
- **requiredEvidence:** Codex input artifact, Codex output artifact, human approval record, git log
- **requiresCodexReview:** true
- **requiresHumanApproval:** true
- **requiresProductivityReport:** false
- **stopConditions:** Codex output applied without human review, auto-merge attempted

### `BRIDGE_REVIEW_ONLY`
- **riskLevel:** high
- **allowedActions:** review bridge design, review policy coverage, commit bridge design documents
- **blockedActions:** implement bridge code, route prompts between models, automate model handoffs, execute any bridge action, create any bridge infrastructure
- **requiredChecks:** policy profiles approved, policy tests exist, Codex review complete
- **requiredEvidence:** approved policy profiles, approved Codex review artifact, human sign-off
- **requiresCodexReview:** true
- **requiresHumanApproval:** true
- **requiresProductivityReport:** true
- **stopConditions:** any bridge code written before policy approved, any automation attempted

## Blocked Action Catalog

The following actions are blocked in all policies unless explicitly unlocked by a specific profile:

| Blocked action | Notes |
|---|---|
| Production touch | Never allowed without explicit HIGH_RISK + human approval |
| Staging/dev touch | Not allowed unless STAGING_VERIFICATION_ONLY |
| Migration creation | Not allowed unless MIGRATION_DESIGN_ONLY or HIGH_RISK_DEV |
| Migration application | Always requires human approval, never automated |
| Database write commands | Blocked in all service/repository slices |
| Email sending | Blocked in all profiles |
| Campaign sending | Blocked in all profiles |
| Automation/background jobs | Blocked in all profiles |
| Vercel settings changes | Blocked in all profiles |
| Environment variable changes | Blocked in all profiles |
| Supabase config changes | Blocked in all profiles |
| System control changes | Blocked in all profiles |
| Send/approve actions | sendFollowUpDraftAction, approveRequestAction, approveAndSendAction always blocked |
| Tag creation | Blocked unless explicitly listed in allowedActions |
| Push | Blocked unless explicitly listed in allowedActions |

## Required Evidence Catalog

The following evidence items should be collected before committing or pushing, as required by the active policy profile:

| Evidence item | When required |
|---|---|
| `git status --short` | All profiles |
| `git log --oneline` | All profiles |
| HEAD hash (`git rev-parse HEAD`) | All profiles |
| origin/master hash (`git rev-parse origin/master`) | Before and after push |
| Changed files (`git diff --name-only`) | All code/docs profiles |
| Git diff stat (`git diff --stat`) | All code profiles |
| Test output (vitest run) | All code profiles |
| TypeScript output (tsc --noEmit) | All code profiles |
| Files in commit (`git show --name-only`) | All profiles at commit time |
| Migration status | Any profile touching migrations |
| Tag status (`git tag --points-at HEAD`) | All profiles |
| Temp files (`git ls-files supabase/.temp`) | All profiles |
| Production/staging untouched confirmation | All profiles |
| Productivity report | MEDIUM_RISK, HIGH_RISK, STAGING_VERIFICATION, BRIDGE_REVIEW |

## Prompt-Shortening Strategy

Today a medium-risk backend slice prompt includes approximately 30 lines of guardrails repeated verbatim. With the policy layer in place, a future prompt can be shortened to:

**Current prompt format (excerpt):**
```
Do not touch production.
Do not touch staging/dev remote.
Do not change Vercel settings.
Do not change environment variables.
Do not change Supabase config.
Do not modify system controls.
Do not enable EMAIL_SENDING_ENABLED.
Do not enable CAMPAIGN_SENDING_ENABLED.
Do not send emails.
Do not click Send buttons.
... (20+ more lines)
```

**Future prompt format (proposed):**
```
Policy: MEDIUM_RISK_BACKEND_NO_MIGRATION
Slice: Goal 3 Slice 2 — policy profile type definitions
...
```

The policy layer resolves the full blocked-action list, required-evidence list, required-checks list, and stop conditions from the profile ID. The prompt contains only the work-specific context. This reduces prompt length and eliminates copy/paste drift — the guardrails are defined once in the policy layer and referenced by ID.

The estimated prompt length reduction is approximately 50% for medium-risk backend slices. High-risk slices with Codex review would see similar savings.

## Verian Agent Bridge Dependency

The Verian Agent Bridge is a future component that routes work between Claude, Codex, ChatGPT, and Verian. Before the bridge is implemented, the policy layer must be:

1. Designed (this document)
2. Reviewed and approved by Michael
3. Implemented as typed policy profiles (Goal 3 Slice 2)
4. Backed by a static registry (Goal 3 Slice 3)
5. Verified by source-reading tests (Goal 3 Slice 4)

Once policy is testable, the bridge can be designed (Goal 3 Slice 5 or later) to:
- Load the active policy profile for a given prompt
- Check generated prompt content against profile allowed/blocked actions
- Block policy violations before routing
- Create review artifacts for Codex review when `requiresCodexReview` is true
- Require human approval before high-risk actions
- Never bypass Codex review where required by the profile
- Never auto-apply Codex suggestions without human sign-off

The bridge must not be implemented until all of the above conditions are met.

## Explicit Exclusions

The following are excluded from Goal 3 entirely:

- No bridge implementation
- No model-to-model automation
- No code execution or runtime behavior
- No API routes
- No server actions
- No UI components
- No database schema changes
- No migrations
- No background jobs
- No production, staging, or dev database changes
- No email or campaign sending
- No Vercel, Supabase, or environment changes

## Suggested Implementation Slices

| Slice | Deliverable |
|---|---|
| Slice 1 | Policy layer design document only (this file) |
| Slice 2 | Policy profile type definitions (`modules/verian-policy/types.ts`) |
| Slice 3 | Static policy profile registry (`modules/verian-policy/registry.ts`) |
| Slice 4 | Source-reading policy tests (`tests/goal3-policy-*.test.ts`) |
| Slice 5 | Prompt policy checker design or initial implementation |
| Slice 6 | Goal 3 productivity report |

Each slice follows the same implement → test → verify → commit → push cadence as Goal 2.

## Tests / Verification Strategy

Future source-reading tests should verify:

- Each policy profile object includes at minimum one `allowedActions` entry
- Each policy profile object includes at minimum one `blockedActions` entry
- All HIGH_RISK profiles set `requiresHumanApproval: true`
- All HIGH_RISK profiles set `requiresCodexReview: true` unless explicitly documented otherwise
- All profiles set `blockedActions` to include `EMAIL_SENDING_ENABLED`
- All profiles set `blockedActions` to include `CAMPAIGN_SENDING_ENABLED`
- All profiles set `blockedActions` to include production touch
- All profiles set `blockedActions` to include migration application
- BRIDGE_REVIEW_ONLY blocks all bridge code execution
- All profiles that set `requiresProductivityReport: true` include a stop condition requiring report completion
- Registry exports every defined profile ID
- No profile silently removes the production-touch block

## Risks

| Risk | Mitigation |
|---|---|
| Policy profiles too vague | Define concrete allowed/blocked action strings, not abstract categories |
| Policy layer too complex too early | Start with 8 profiles; expand only when prompted by real slice needs |
| Bridge starting before policy is enforceable | This document explicitly gates bridge work on policy approval |
| False sense of safety if policies not tested | Goal 3 Slice 4 creates source-reading policy tests |
| Shortening prompts before policy coverage is complete | No prompt shortening until Slice 4 tests exist and pass |

## Stop Conditions

Work on Goal 3 must stop before any of the following:

- Implementing the bridge
- Automating Claude/Codex handoffs
- Executing generated code
- Applying migrations
- Touching production, staging, or dev databases
- Creating UI components, server actions, or API routes
- Changing environment variables, Vercel settings, Supabase config, or system controls

## Recommended Next Prompt

Goal 3 Slice 1 is this design document commit. After this document is committed and pushed, Goal 3 Slice 2 should begin only if the design is approved by Michael.

Goal 3 Slice 2 will create `modules/verian-policy/types.ts` with the `VerianPolicyProfile` type and associated supporting types. No registry, no tests, no bridge — types only.
