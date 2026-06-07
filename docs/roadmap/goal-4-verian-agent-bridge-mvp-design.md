# Goal 4 Design — Verian Agent Bridge MVP

## Executive Summary

The Verian Agent Bridge will reduce the manual overhead of orchestrating Claude, ChatGPT, Codex, and Qwen API by providing a structured, policy-checked task packaging and routing layer. Instead of repeating guardrails, model-selection logic, and evidence requirements in each individual prompt, the Bridge accepts a proposed task, selects or validates a policy profile from `VERIAN_POLICY_REGISTRY`, calls `checkVerianPromptPolicy` to verify the task against the policy, builds a structured task packet, recommends the appropriate agent and model, identifies required evidence and stop conditions, and returns a dry-run task packet for Michael approval.

The MVP is dry-run only. The Bridge produces structured recommendations and packets — it does not execute code, send prompts to models, write to databases, apply migrations, send emails, or route prompts autonomously. Human approval and Codex review gates remain active regardless of policy checker status.

## Measurable Goal

- A Bridge MVP design document exists (this file).
- The design defines the Bridge's purpose, scope, non-responsibilities, task packet shape, model routing approach, agent categories, policy integration, dry-run behavior, audit requirements, and stop conditions.
- The design explicitly excludes implementation, model calls, command execution, DB writes, sending, and automation from this slice.
- No Bridge code exists after this slice. No modules, no services, no tests, no routes.

## Why This Goal Follows Goal 3

Goal 3 created the Verian Policy Layer: typed policy profiles, a static registry of eight profiles, source-reading tests covering 107 assertions, a deterministic prompt policy checker, and a Codex-reviewed implementation. The Bridge should not exist without policy enforcement — using any agent or model to route work without first checking a policy profile creates the exact unchecked automation the guardrails are designed to prevent.

Goal 4 depends on Goal 3 but does not modify it. `VERIAN_POLICY_REGISTRY` and `checkVerianPromptPolicy` are the Bridge's two required entry points from the policy layer. The Bridge must not re-implement or override either.

## Core Operating Principle

```
Agents suggest.
Verian validates.
Humans approve high-risk actions.
The Bridge enforces policy.
```

No agent output is final without a Verian validation step. No high-risk action is taken without explicit human approval. No prompt is routed without first passing through `checkVerianPromptPolicy`.

## MVP Scope

The Bridge MVP may:

- Accept a proposed task with a task type and policy profile ID
- Require a valid policy profile ID from `VERIAN_POLICY_REGISTRY` before any further processing
- Call `checkVerianPromptPolicy` to evaluate the task prompt against the selected profile (in future implementation)
- Produce a dry-run task packet describing the recommended agent, model, allowed actions, blocked actions, required evidence, and stop conditions
- Recommend which agent category and model family should handle the task
- Generate structured prompts ready for Claude, Codex, Qwen, or GPT (for Michael to send manually during dry-run mode)
- Identify required evidence items that must be gathered before the task proceeds
- Identify stop conditions that must halt work immediately if triggered
- Produce audit-ready summaries of the task packet and policy check result
- Return the complete packet to Michael for review and approval before any action is taken

## Explicit Non-Responsibilities

The Bridge MVP must not:

- Execute shell commands or system commands
- Modify, create, or delete files
- Push commits or create tags
- Apply migrations or run migration commands
- Write to the database or run DB write commands
- Touch production, staging, or dev environments
- Send emails or campaign messages
- Enable `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED`
- Call any external model (Claude, Codex, GPT, Qwen) directly during the design phase
- Route prompts autonomously to any model without human review of the task packet
- Replace human approval — dry-run packets require Michael sign-off before any action
- Replace Codex review — Codex review requirements from the selected profile remain mandatory
- Bypass `checkVerianPromptPolicy` — no task packet may be produced without a policy check result
- Approve its own output — all Bridge outputs are proposals awaiting explicit approval

## Proposed Future Files

The following files are proposed for future slices. **None are created in this slice.**

```
modules/verian-agent-bridge/types.ts
modules/verian-agent-bridge/task-packet.ts
modules/verian-agent-bridge/model-router.ts
modules/verian-agent-bridge/agent-registry.ts
modules/verian-agent-bridge/dry-run.service.ts
tests/goal4-agent-bridge-design.test.ts
tests/goal4-agent-bridge-dry-run.test.ts
```

These files are not created until the design is approved and individual implementation slices are authorized. No `modules/verian-agent-bridge/` directory exists after this slice.

## Proposed Bridge Task Packet Shape

Design only — no type files are created in this slice.

```typescript
type VerianBridgeTaskPacket = {
  taskId: string
  goalId?: string
  sliceId?: string
  taskType: string
  riskLevel: 'low' | 'medium' | 'high'
  policyId: VerianPolicyProfileId
  requestedBy: 'michael' | 'system' | 'agent'
  intendedAgent: string
  recommendedModel: string
  promptText: string
  policyCheckStatus: 'pass' | 'warning' | 'blocked'
  requiredEvidence: string[]
  requiredReviewers: string[]
  stopConditions: string[]
  allowedActions: string[]
  blockedActions: string[]
  requiresHumanApproval: boolean
  requiresCodexReview: boolean
  dryRunOnly: true
}
```

Key invariants:
- `dryRunOnly` is always `true` in the MVP. It is a literal type to prevent runtime confusion.
- `policyCheckStatus` is set by the output of `checkVerianPromptPolicy` — it is not self-assigned by the Bridge.
- `allowedActions` and `blockedActions` are copied from the resolved `VerianPolicyProfile`, not invented by the Bridge.
- `requiresHumanApproval` and `requiresCodexReview` are copied from the resolved profile — they are not computed by the Bridge.

## Agent Categories

### Development Agents

**Purpose:** Implement, review, and test source code under policy governance.

**Allowed model family:** Claude (architecture, design, review), Codex (independent code review, regression analysis).

**Allowed actions:**
- `create-repository-file`, `create-service-file`, `create-type-file`, `create-test-file`, `create-migration-file` (under `MIGRATION_DESIGN_ONLY` only), `commit`, `push`

**Blocked actions:** All 14 ALWAYS_BLOCKED items; any production touch; any DB write outside of migration file creation.

**Required approvals:** Codex review for high-risk slices; Michael approval before push for high-risk slices.

---

### Business Intelligence Agents

**Purpose:** Analyze scoring data, campaign performance, and lead behavior. Surface insights; do not act on them autonomously.

**Allowed model family:** Claude or GPT for strategic analysis; Qwen for structured extraction, summarization, and simple classification from query results.

**Allowed actions:**
- `read-scoring-data`, `summarize-campaign-results`, `classify-lead-behavior`, `generate-insight-report`

**Blocked actions:** DB writes; production queries without human authorization; any send or approval action.

**Required approvals:** Michael approval before any insight is used to modify campaign policy or scoring thresholds.

---

### Messaging / Copy Agents

**Purpose:** Draft, revise, and score email and campaign copy. Never send autonomously.

**Allowed model family:** Qwen API (default for drafting/rewriting); Claude or GPT (escalation or premium review).

**Allowed actions:**
- `draft-email-variant`, `revise-email-draft`, `generate-subject-line`, `adjust-tone`, `score-draft`, `flag-compliance-issue`, `escalate-to-premium-model`

**Blocked actions:** `send-email`, `approve-final-output`, `change-campaign-policy`, `make-unsupported-savings-claim`, `make-unsupported-rate-claim`, `make-unsupported-compliance-claim`, `touch-production`, `bypass-human-approval`

**Required approvals:** Human approval before any draft enters an approval queue. Verian score ≥ 85 before escalation to approval queue is considered.

---

### Policy / Safety Agents

**Purpose:** Run policy checks, validate task packets, prepare Codex review artifacts, and flag policy violations before any action is taken.

**Allowed model family:** Verian deterministic logic (`checkVerianPromptPolicy`) for initial gate; Claude or Codex for secondary review of ambiguous edge cases.

**Allowed actions:**
- `run-policy-check`, `prepare-codex-review-artifact`, `validate-task-packet`, `flag-policy-violation`, `produce-audit-summary`

**Blocked actions:** All execution actions; any send action; any DB write; any production touch; any action that is itself the subject of the policy review.

**Required approvals:** Michael approval for any change to policy profiles or checker phrase maps.

---

### Execution Agents

**Purpose:** Act on already-approved, policy-checked task packets. Reserved for explicitly authorized actions only — no autonomous execution.

**Allowed model family:** Verian deterministic logic only (no model calls for execution decisions).

**Allowed actions:** Only the specific actions explicitly listed in the approved task packet's `allowedActions`.

**Blocked actions:** Any action not explicitly in `allowedActions`; any action that produces a `blocked` policy check result; any action requiring human approval that has not yet been received.

**Required approvals:** Human approval of the full task packet is a prerequisite. Codex review is required if the selected policy profile sets `requiresCodexReview: true`.

## Model Routing Design

| Model / System | Use Cases | Restrictions |
|---|---|---|
| **Qwen API** | Email drafts, subject lines, tone rewrites, short personalization, lead notes, simple classification, structured extraction, summarization, low-risk copy iteration | May not approve output, send, change policy, make unsupported claims, touch production |
| **Claude** | Architecture, strategy, policy design, compliance-sensitive review, campaign strategy, high-risk reasoning, escalations from Qwen | Requires policy check before task packet is generated |
| **GPT** | Premium reasoning, escalation alternative to Claude, comparative review | Requires policy check; same restrictions as Claude |
| **Codex** | Independent code review, implementation review, regression risk analysis, commit review | Used for review artifacts, not execution |
| **Verian deterministic logic** | Policy gates, policy checker, scoring thresholds, approval queue decisions | Always executes before model routing |
| **Human approval** | All high-risk final decisions; all `requiresHumanApproval: true` profiles | Cannot be delegated to any model |

**Routing priority order:**
1. Verian policy gate (`checkVerianPromptPolicy`) — must pass before any model is selected
2. Risk level and policy profile — determine model family eligibility
3. Task type — determines whether Qwen, Claude/GPT, or Codex is recommended
4. Escalation triggers — promote from Qwen to Claude/GPT if triggered
5. Human approval gate — must be satisfied before output is acted on for high-risk tasks

## Qwen Usage Design

Qwen API is a low-cost worker model. Its role is to handle repetitive, low-reasoning tasks that are well-defined, structured, and do not require compliance-sensitive judgment.

**Qwen may:**
- Generate email draft variants from approved templates
- Revise existing email drafts based on structured feedback
- Generate subject line options
- Adjust tone of existing copy
- Generate short personalization snippets from structured lead data
- Generate lead notes from structured activity records
- Classify low-risk information into predefined categories
- Extract structured fields from structured text
- Summarize structured context (not compliance-sensitive)
- Iterate on low-risk campaign copy within approved guardrails

**Qwen may not:**
- Approve any output as final
- Send emails or campaign messages
- Change campaign policy, scoring policy, or approval policy
- Make savings, rate, or compliance claims that are not supported by Verian data
- Touch production systems, staging, or dev environments
- Run migrations or DB write commands
- Approve its own output — all Qwen output must be scored and reviewed before advancing
- Bypass Verian scoring gates or human approval requirements

**Qwen output pipeline:**
1. Qwen generates draft or revision
2. Verian scoring service scores the output
3. If score ≥ 85 → eligible for human approval queue
4. If score < 85 after 3 attempts → escalate to Claude/GPT or human review
5. Human approves before any output enters the send queue

## Copywriting Agent Design

The Copywriting Agent is the primary Messaging / Copy Agent in the MVP. Its configuration:

| Parameter | Value |
|---|---|
| Default model | Qwen API |
| Target score | 85 |
| Max revision attempts | 3 |
| Human approval required | `true` |
| Auto-send allowed | `false` |
| Escalation model | Claude, GPT, or human review |

**Escalation triggers** (any of the following promotes the task out of Qwen tier):
- Score below 85 after 3 revision attempts
- Compliance risk detected in generated output
- Unsupported savings, rate, or compliance claim found
- High-value prospect flag is present on the lead record
- New campaign template that has not been previously approved
- Michael explicitly requests premium review

**Unsupported claim handling:**
Any Qwen output containing savings claims, rate claims, or compliance statements that are not directly supported by Verian data must be flagged as a compliance risk and must either block the output or escalate to human review. Qwen may not self-certify that a claim is supported.

## Policy Integration

The Bridge must integrate with the Goal 3 policy layer at every task entry point.

**Step 1 — Profile resolution.** The Bridge receives a `policyId` with every task request. It resolves the profile from `VERIAN_POLICY_REGISTRY`. If the `policyId` is not found, the Bridge returns `status: 'blocked'` with an unknown-policy issue and does not proceed.

**Step 2 — Policy check.** The Bridge calls `checkVerianPromptPolicy` with the task prompt and resolved `policyId`. The result is stored in `policyCheckStatus` on the task packet.

**Step 3 — Status handling:**
- `status: 'blocked'` → Bridge stops. The task packet is returned with `policyCheckStatus: 'blocked'`. No model is recommended. No actions are taken. Michael must resolve the violation before resubmitting.
- `status: 'warning'` → Bridge produces the task packet but marks it as requiring Michael approval before any action. The warning issues are listed in the packet.
- `status: 'pass'` → Bridge may produce the full task packet and model recommendation. Execution still requires human approval if `requiresHumanApproval: true` on the profile. Codex review is still required if `requiresCodexReview: true`.

**Step 4 — Gate preservation.** A `pass` result does not disable human approval or Codex review requirements. The task packet always reflects the `requiresHumanApproval` and `requiresCodexReview` values from the resolved policy profile, regardless of checker result.

## Dry-Run Workflow

The Bridge MVP operates in dry-run mode only. The workflow produces a reviewed-and-approved task packet; it does not execute anything.

```
1. Receive task request
   ├── task type
   ├── policy profile ID
   ├── prompt text
   └── optional: intended agent, changed files, evidence provided

2. Resolve policy profile
   └── if unknown → return blocked result immediately

3. Run policy check
   └── call checkVerianPromptPolicy(policyId, promptText)

4. Evaluate policy check result
   ├── blocked → return blocked task packet; stop
   ├── warning → continue but require Michael approval before any action
   └── pass → continue; preserve requiresHumanApproval and requiresCodexReview

5. Select agent category
   └── based on task type and risk level

6. Recommend model
   └── based on agent category, risk level, and escalation triggers

7. Build task packet
   ├── copy allowedActions from profile
   ├── copy blockedActions from profile
   ├── copy requiredEvidence from profile
   ├── copy stopConditions from profile
   ├── set requiresHumanApproval from profile
   ├── set requiresCodexReview from profile
   └── set dryRunOnly: true

8. Generate prompt packets
   └── structured prompts ready for Claude/Codex/Qwen/GPT
       (Michael sends manually during dry-run phase)

9. Produce audit summary
   └── task ID, policy ID, checker result, agent, model,
       required evidence, stop conditions, reviewer requirements

10. Return packet to Michael for review and approval
    └── no action is taken until Michael approves the packet
```

## Structured Output Requirements

All Bridge outputs must be structured artifacts, not free prose. Each output type:

**Task packet** — JSON-serializable `VerianBridgeTaskPacket` with all fields populated.

**Policy result** — The full `VerianPromptPolicyCheckResult` from `checkVerianPromptPolicy`, including `policyId`, `status`, `issues` array, and `summary` string.

**Agent recommendation** — Structured record: `{ agentCategory, rationale, escalationTriggered, escalationReason? }`.

**Model recommendation** — Structured record: `{ recommendedModel, alternativeModel?, rationale, costTier: 'low' | 'standard' | 'premium' }`.

**Required evidence** — Ordered list copied from the resolved policy profile's `requiredEvidence`, with completion status for each item.

**Stop conditions** — Ordered list copied from the resolved policy profile's `stopConditions`, with triggered status for each.

**Human approval requirement** — Structured record: `{ required: boolean, reason: string, status: 'pending' | 'approved' | 'denied' }`.

**Codex review requirement** — Structured record: `{ required: boolean, artifactRequired: string, status: 'pending' | 'complete' | 'skipped' }`.

## Audit / Logging Design

Future audit records (design only — no DB tables or migrations created in this slice):

| Field | Description |
|---|---|
| `taskId` | Unique identifier for the task request |
| `policyId` | The policy profile ID used for the check |
| `checkerResult` | `pass`, `warning`, or `blocked` |
| `promptHash` | Hash or truncated summary of the prompt text (not the full prompt) |
| `selectedAgent` | Agent category selected |
| `selectedModel` | Model recommended |
| `status` | Overall task packet status |
| `reviewerRequirements` | List of required reviewers from the profile |
| `approvalState` | `pending`, `approved`, or `denied` |
| `outputSummary` | One-sentence description of the dry-run packet produced |
| `timestamp` | ISO 8601 timestamp of packet creation |
| `actor` | Who requested the task (`michael`, `system`, or `agent`) |

Audit records must be append-only. No audit record may be modified after creation. Audit logging implementation requires a dedicated slice with its own DB migration, Codex review, and human approval before any migration is applied.

## Stop Conditions

The Bridge must stop immediately and return an error or blocked packet if any of the following are detected:

- `checkVerianPromptPolicy` returns `status: 'blocked'`
- `status: 'warning'` is returned and Michael has not yet approved the packet
- A high-risk task is requested without `requiresCodexReview: true` on the selected profile
- A high-risk task is requested without `requiresHumanApproval: true` on the selected profile
- The task request includes any sending action (email or campaign)
- The task request includes any DB write command
- The task request includes any migration application
- The task request includes any production or staging environment touch
- The task request proposes autonomous model-to-model routing without human review of the task packet
- The task request attempts to bypass `checkVerianPromptPolicy` by omitting a policy ID
- The Bridge's own output is used to approve itself without external human sign-off

## Risks

| Risk | Mitigation |
|---|---|
| False sense of automation safety | Document prominently that dry-run packets are proposals, not approvals |
| Bridge bypassing policy checker | Enforce: no `VerianBridgeTaskPacket` is valid without a `policyCheckStatus` field set by `checkVerianPromptPolicy` |
| Qwen used for high-risk reasoning | Model routing table explicitly blocks Qwen for high-risk task types; escalation triggers promote to Claude/GPT |
| Agents producing loose prose instead of structured outputs | All Bridge outputs are typed structured artifacts; free prose is not a valid packet format |
| Accidental model-to-model loops | Dry-run mode: Bridge does not call models; Michael sends packets manually; no autonomous chaining |
| Token/cost runaway | Qwen tier caps at 3 attempts; escalation to premium models requires explicit trigger; no autonomous retry loops |
| Audit gaps | All task packets logged with task ID, policy ID, and approval state; append-only audit design |
| Prompt injection | `checkVerianPromptPolicy` scans for blocked phrases; Bridge does not execute user-supplied prompt text |
| Policy drift | Policy profiles are static registry objects; changes require code review and Codex review before merge |
| Over-automation before approvals exist | MVP is dry-run only; autonomous routing is blocked at the architecture level until a dedicated slice enables it with explicit human authorization |

## Suggested Implementation Roadmap

| Slice | Deliverable | Risk |
|---|---|---|
| **Slice 1** (this slice) | Bridge MVP design document | LOW — docs only |
| **Slice 2** | Bridge task packet type definitions (`modules/verian-agent-bridge/types.ts`) | LOW — types only, no runtime behavior |
| **Slice 3** | Agent registry design or type definitions (`modules/verian-agent-bridge/agent-registry.ts`) | LOW — types or static data only |
| **Slice 4** | Model router design or type definitions (`modules/verian-agent-bridge/model-router.ts`) | LOW — types or static data only |
| **Slice 5** | Dry-run task packet builder (`modules/verian-agent-bridge/dry-run.service.ts`) | MEDIUM — implements policy integration and packet building; requires Codex review |
| **Slice 6** | Source-reading tests for all Goal 4 Bridge files | LOW — tests only, no runtime side effects |
| **Slice 7** | Goal 4 productivity report | LOW — docs only |

Each slice requires independent authorization before starting. No slice may begin until the prior slice is committed, pushed, and Michael has approved the next step. Slice 5 (the dry-run builder) requires Codex review before commit and push.

## Recommended Next Prompt

Goal 4 Slice 1 should be committed and pushed as a design-only deliverable.

After this design document is committed and pushed:
- If Michael approves the Bridge architecture, proceed to Goal 4 Slice 2 (type definitions only).
- Goal 4 must remain dry-run only until explicitly approved otherwise by Michael. No model-to-model routing, no autonomous execution, no external model calls may be introduced without a dedicated authorization step.
- The Bridge must not be implemented until source-reading tests exist and have passed for each module.
- Any proposal to enable autonomous routing or skip human approval requires a dedicated policy design review, not just a code review.
