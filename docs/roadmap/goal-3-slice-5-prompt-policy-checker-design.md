# Goal 3 Slice 5 Design — Prompt Policy Checker

## Executive Summary

The prompt policy checker is a future component that evaluates proposed AI-development prompts against a selected Verian policy profile before those prompts are acted on by Claude, passed to Codex, or routed through a future Verian Agent Bridge. It reads a prompt, identifies the selected policy, scans the proposed action summary and prompt text for blocked or missing elements, and returns a structured pass/warning/blocked result.

The checker is a safety assistant and policy consistency layer. It is not a perfect security system, a replacement for human approval, a substitute for Codex review, or a runtime gate. Its role is to catch obvious violations and flag missing safeguards before work proceeds — not to certify that a prompt is safe.

## Measurable Goal

- A checker design document exists (this file).
- The design defines checker inputs and outputs.
- The design defines pass/warning/blocked behavior.
- The design defines blocked-action detection strategy.
- The design defines how the checker uses the policy registry.
- The design explicitly excludes checker implementation and bridge automation from this slice.

## Why Design Before Implementation

The checker will become a policy enforcement aid that is called by the Verian Agent Bridge before any prompt routing. A poorly designed checker risks:

- False confidence — a "pass" result could cause reviewers to skip human approval when a high-risk policy requires it.
- False negatives — blocked phrases not covered by the initial pattern list could slip through.
- Premature complexity — starting with model-assisted detection before deterministic checks are validated introduces unpredictable failure modes.

Designing the checker's scope, input/output contracts, and non-responsibilities explicitly before writing any code ensures the implementation stays bounded and the limitations are visible.

## Proposed Future Checker File

```
modules/verian-policy/checker.ts
```

**This file is not created in this slice.**

It will be created in Goal 3 Slice 6 (or later) pending approval. It must import only from:
- `@/modules/verian-policy/types`
- `@/modules/verian-policy/registry`

It must not import Supabase clients, services, repositories, UI components, server actions, API routes, automation modules, or bridge modules.

## Proposed Future Test File

```
tests/goal3-policy-checker.test.ts
```

**This file is not created in this slice.**

It will be created alongside or after `checker.ts`. It will use the source-reading test pattern established in Goal 3 Slice 4 plus behavioral tests against the checker's exported function(s).

## Proposed Checker Input Shape

Design only — no type file created in this slice.

```typescript
type VerianPromptPolicyCheckInput = {
  policyId: VerianPolicyProfileId
  promptText: string
  intendedActionSummary?: string
  changedFiles?: string[]
  evidenceProvided?: string[]
}
```

- `policyId` — which policy profile to evaluate against
- `promptText` — the full proposed prompt text to scan
- `intendedActionSummary` — optional plain-language summary of what the prompt intends to do
- `changedFiles` — optional list of files the action will touch (for file-scope checks)
- `evidenceProvided` — optional list of evidence items already collected (compared against `requiredEvidence`)

## Proposed Checker Output Shape

Design only — no type file created in this slice.

```typescript
type VerianPromptPolicyCheckResult = {
  policyId: VerianPolicyProfileId
  status: 'pass' | 'warning' | 'blocked'
  issues: VerianPolicyValidationIssue[]
  summary: string
}
```

- `status: 'blocked'` — at least one blocking violation detected; do not proceed
- `status: 'warning'` — no hard blocks but missing evidence, ambiguous phrasing, or reviewer language absent
- `status: 'pass'` — no violations detected; still subject to human approval if policy requires it
- `issues` — structured list of `VerianPolicyValidationIssue` objects (severity, message, policyId, action)
- `summary` — human-readable one-paragraph summary of the result

## Checker Responsibilities

The future `checker.ts` should:

1. Load the selected policy profile from `VERIAN_POLICY_REGISTRY` by `policyId`. Return `status: 'blocked'` with `unknown_policy` issue if not found.
2. Scan `promptText` and `intendedActionSummary` for phrases that match entries in the profile's `blockedActions` list.
3. Flag any match as a `blocked_action_detected` issue with severity `'blocking'`.
4. If `requiresCodexReview: true` and the prompt text does not reference Codex review or a Codex artifact, flag as `missing_required_reviewer` with severity `'warning'`.
5. If `requiresHumanApproval: true` and the prompt text does not reference human approval or Michael sign-off, flag as `missing_required_reviewer` with severity `'warning'`.
6. If `evidenceProvided` is supplied, compare against the profile's `requiredEvidence` list. Flag any missing evidence items as `missing_required_evidence` with severity `'warning'`.
7. Under `BRIDGE_REVIEW_ONLY`, flag any bridge execution phrase as `bridge_action_blocked` with severity `'blocking'`.
8. Under any profile, flag sending, production touch, migration application, DB writes, and automation phrases as blocking unless the phrase appears in `allowedActions` for the selected profile.
9. Aggregate issues and determine overall `status`: any `'blocking'` issue → `'blocked'`; any `'warning'` issue with no blocking → `'warning'`; no issues → `'pass'`.
10. Produce a `summary` string describing the result in plain language.

## Non-Responsibilities

The checker must not:

- Execute prompts or send them to any model
- Call Claude, Codex, or ChatGPT
- Run shell commands or Git commands
- Inspect live Git state, branches, or working tree
- Apply migrations or run migration commands
- Touch databases or issue DB write commands
- Modify files or create files
- Send emails or campaign messages
- Enable `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- Modify system controls
- Replace human approval — a `'pass'` result does not mean Michael has approved
- Replace Codex review — a `'pass'` result does not mean Codex has reviewed
- Replace runtime feature gates — the checker operates on text, not live system state

## Violation Categories

| Category | Severity | Description |
|---|---|---|
| `blocked_action_detected` | blocking | A phrase matching a blocked action was found in the prompt or action summary |
| `missing_required_evidence` | warning | A required evidence item from the profile was not listed in `evidenceProvided` |
| `missing_required_reviewer` | warning | The profile requires Codex or human approval but the prompt does not reference it |
| `bridge_action_blocked` | blocking | A bridge execution phrase was found under `BRIDGE_REVIEW_ONLY` |
| `sending_action_blocked` | blocking | An email or campaign sending phrase was found |
| `production_action_blocked` | blocking | A production touch phrase was found |
| `migration_action_blocked` | blocking | A migration application phrase was found and the profile does not allow it |
| `automation_action_blocked` | blocking | An automation or background job phrase was found |
| `unknown_policy` | blocking | The supplied `policyId` does not exist in the registry |
| `ambiguous_prompt` | warning | The prompt is too vague to confirm or deny policy compliance |

## Detection Strategy

The initial checker implementation should use **explicit keyword and phrase matching** only:

- Maintain a static list of blocked phrases per violation category.
- Scan `promptText` and `intendedActionSummary` using simple string inclusion (`includes()` or `indexOf()`).
- Match case-insensitively where appropriate.
- **Start conservative**: if a phrase is ambiguous, prefer warning or blocking over pass.
- Do not claim semantic perfection — the checker catches obvious violations, not all possible violations.
- Do not attempt natural language inference in the initial implementation.
- Later versions may add model-assisted review (e.g., asking Claude to evaluate ambiguous prompts), but only after deterministic checks exist, are tested, and have a track record of low false-negative rates.

## Example Blocked Phrases

The following phrases should trigger blocking or warning when found in a prompt that does not use a policy that explicitly allows the corresponding action:

| Phrase | Category |
|---|---|
| `apply migration` | `migration_action_blocked` |
| `run migration` | `migration_action_blocked` |
| `touch production` | `production_action_blocked` |
| `update production` | `production_action_blocked` |
| `enable EMAIL_SENDING_ENABLED` | `sending_action_blocked` |
| `enable CAMPAIGN_SENDING_ENABLED` | `sending_action_blocked` |
| `send email` | `sending_action_blocked` |
| `send campaign` | `sending_action_blocked` |
| `call approveAndSendAction` | `sending_action_blocked` |
| `call sendFollowUpDraftAction` | `sending_action_blocked` |
| `create background job` | `automation_action_blocked` |
| `start automation` | `automation_action_blocked` |
| `route prompts between models` | `bridge_action_blocked` |
| `implement bridge` | `bridge_action_blocked` |

## Example Result

A prompt that requests applying a migration under `LOW_RISK_DOCS_ONLY` would return:

```json
{
  "policyId": "LOW_RISK_DOCS_ONLY",
  "status": "blocked",
  "issues": [
    {
      "severity": "blocking",
      "message": "Phrase 'apply migration' detected. Policy LOW_RISK_DOCS_ONLY blocks 'apply-migration'.",
      "policyId": "LOW_RISK_DOCS_ONLY",
      "action": "apply-migration"
    }
  ],
  "summary": "BLOCKED — 1 blocking violation detected. The phrase 'apply migration' is not permitted under LOW_RISK_DOCS_ONLY. No action should be taken until the policy or prompt is corrected."
}
```

A docs-only prompt with no violations under `LOW_RISK_DOCS_ONLY` would return:

```json
{
  "policyId": "LOW_RISK_DOCS_ONLY",
  "status": "pass",
  "issues": [],
  "summary": "PASS — No violations detected under LOW_RISK_DOCS_ONLY. Human approval is not required for this policy. Proceed with the documented action."
}
```

## Bridge Dependency

Once the Verian Agent Bridge is designed and implemented (in a future goal, after policy profiles and tests are approved), the bridge must:

1. Accept a `policyId` alongside any prompt to be routed.
2. Call the checker with the full prompt text and policy ID before routing.
3. **Stop routing** if `status: 'blocked'` is returned — do not pass the prompt to any model.
4. **Require Michael approval** before proceeding if `status: 'warning'` is returned.
5. Allow routing to proceed if `status: 'pass'`, subject to any additional review requirements in the policy (Codex review, human approval) that the checker flags via `issues`.
6. Never use checker `'pass'` as a substitute for human approval when `requiresHumanApproval: true`.
7. Never use checker `'pass'` as a substitute for Codex review when `requiresCodexReview: true`.

The bridge must not be implemented until the checker exists, is tested, and has been reviewed.

## Tests / Verification Strategy

Future `tests/goal3-policy-checker.test.ts` should verify:

- Unknown `policyId` returns `status: 'blocked'` with `unknown_policy` issue
- Prompt containing `touch production` returns `status: 'blocked'` under `LOW_RISK_DOCS_ONLY`
- Prompt containing `send email` returns `status: 'blocked'` under all current profiles
- Prompt containing `apply migration` returns `status: 'blocked'` under `LOW_RISK_DOCS_ONLY` and `MEDIUM_RISK_BACKEND_NO_MIGRATION`
- Prompt containing `route prompts between models` returns `status: 'blocked'` under `BRIDGE_REVIEW_ONLY`
- Prompt under `HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION` without Codex/human reference returns `missing_required_reviewer` warning
- A minimal docs-only prompt returns `status: 'pass'` under `LOW_RISK_DOCS_ONLY`
- An ambiguous prompt (no clear action) returns `status: 'warning'` or `'blocked'`
- `checker.ts` does not import Supabase, services, repositories, UI, server actions, API routes, automation, or bridge modules (source-reading assertion)
- `checker.ts` does not call any external model or execute any command (source-reading assertion)

## Risks

| Risk | Mitigation |
|---|---|
| False negatives (blocked phrase not matched) | Start with conservative phrase list; add phrases as violations are discovered |
| False positives (safe prompt blocked) | Allow policy-specific overrides; log false positive reports for refinement |
| Prompt wording bypasses simple string matching | Explicitly document that the checker is not a perfect gate; preserve human approval |
| Users over-trust checker result | Document prominently that `'pass'` does not replace human approval or Codex review |
| Checker becomes too complex too early | Implement deterministic phrase matching first; defer model-assisted review to a later version |
| Bridge uses checker before tests are strong enough | Bridge design requires checker tests to exist and pass before bridge implementation begins |

## Stop Conditions

Work on Goal 3 Slice 5 must stop before any of the following:

- Implementing checker logic in this slice
- Creating `modules/verian-policy/checker.ts`
- Creating bridge files or bridge infrastructure
- Automating model handoffs
- Executing prompts against any model
- Modifying `registry.ts`, `types.ts`, or any existing test files
- Touching production, staging, or dev databases
- Creating UI, server actions, or API routes
- Applying migrations
- Sending emails or campaigns

## Recommended Next Prompt

Goal 3 Slice 5 is this design document commit and push. After this document is committed and pushed:

- If Michael approves the checker design, Goal 3 Slice 6 may implement `modules/verian-policy/checker.ts` with deterministic phrase-matching only.
- Alternatively, a Codex review of this design may be run first under the `CODEX_REVIEW_REQUIRED` policy before implementation begins.
- Goal 3 Slice 6 must not create bridge files, must not route prompts between models, and must not touch any existing registry, type, or test files.
