# Phase 3B Human Review / Approval Bridge — Design & Test Cases

**Status:** Draft — Awaiting user approval before implementation planning begins.
**Version:** 1.0
**Date:** 2026-05-20
**Author:** Claude (Verian BIOS AI context recovery session)
**Prerequisite:** Quality Review Agent Foundation v1.1 complete and QA-verified.

---

## 1. Executive Overview

The Phase 3B Revenue Learning Engine now produces three layers of machine output for every outbound message opportunity:

1. **Message Strategy Agent** — decides *what* to send and *why*
2. **Copywriting Agent** — writes 2–4 candidate versions
3. **Quality Review Agent** — scores, ranks, and flags each version

None of those agents approves a message for sending. None of them sends. All of their outputs are recommendations, candidates, and advisory evaluations. This is by design.

The **Human Review / Approval Bridge** is the layer that makes those agent outputs actionable for a human reviewer. It is not an AI agent. It is not a sending system. It is a structured workflow and state-management layer that:

- Surfaces the QRA ranking, composite scores, risk flags, recommended version, and human review notes in a readable reviewer interface
- Allows a human to select, reject, or approve a specific version
- Enforces guardrails before any state transition
- Preserves a complete audit trail of every reviewer action
- Defines a clear handoff point that a future Send / Email Draft Bridge can consume

Without the Human Review / Approval Bridge, the QRA recommendation has no safe path into human hands. It would require the reviewer to mentally track approval state across unstructured UI state or separate systems. The bridge creates a first-class workflow layer between the agent pipeline and human action.

**Why a bridge, not an agent?**

The bridge does not reason, generate, or evaluate. It surfaces what agents produced and lets a human make an explicit decision. The distinction is intentional: agents recommend, humans decide. The bridge is the mechanism that enforces and records that decision.

**Position in the pipeline:**

```
Message Strategy Agent
→ Copywriting Agent
→ Quality Review Agent
→ Human Review / Approval Bridge   ← this document
→ Send / Email Draft Bridge        (future)
→ Event Tracking                   (future)
→ Learning Agent                   (future)
```

**What this prepares for:**

Once a version is marked `approved`, it becomes the well-defined input to a future Send / Email Draft Bridge. That bridge will convert an approved `message_version` into an `email_draft` or trigger a send event. By stopping the current bridge at the `approved` state — without creating drafts or triggering sends — we preserve a clean separation of concerns and maintain the no-auto-send guarantee through all Phase 3B v1 work.

---

## 2. Bridge Role and Boundaries

### What the Bridge Does

- Loads `message_strategy` record for the active strategy on a lead
- Loads `message_version[]` records for that strategy
- Loads `quality_review[]` records linked to those versions
- Displays QRA composite scores, score bands, rankings, risk flags, risk severity, human review notes, recommended version badge, and recommended edits
- Allows a human reviewer to **select** a preferred version
- Allows a human reviewer to **reject** a version (with reason)
- Allows a human reviewer to **approve** a selected or pending version for the next workflow step
- Allows a human reviewer to **request regeneration** of versions
- Allows a human reviewer to **return to strategy** when the issue is strategic
- Stores reviewer identity (`reviewed_by`, `reviewed_at`) on state transitions
- Stores `rejection_reason` on rejection
- Stores `override_reason` when a low-score or non-recommended version is approved
- Records audit events for every action
- Enforces gate conditions before allowing state transitions
- Enforces critical risk block (no critical-risk version can be approved in v1)

### What the Bridge Does Not Do

- Does not generate copy — not one character of body text
- Does not rewrite or edit original `body_text` or `subject_line` (editing is out of scope for v1)
- Does not run or re-run the QRA
- Does not change `composite_score`, `score_band`, `rank_position`, or `is_recommended`
- Does not delete `quality_review` records
- Does not send email
- Does not auto-send under any condition
- Does not create `email_drafts` (v1 scope; reserved for future Send / Email Draft Bridge)
- Does not create `approval_requests` (v1 scope; reserved for future workflow extension)
- Does not modify `message_strategy` content or status
- Does not trigger the Learning Agent
- Does not trigger Event Tracking
- Does not call external LLMs
- Does not generate new `message_version` records (regeneration delegates to Copywriting Agent)
- Does not store final_subject_line or final_body_text (editing is out of v1 scope; these fields exist but are not populated here)

---

## 3. Inputs Required by the Bridge

### 3.1 Strategy Inputs

Loaded from `message_strategy` via `strategy_id`:

| Field | Purpose |
|-------|---------|
| `id` | Primary key |
| `tenant_id` | Tenancy guard |
| `lead_id` | Links to lead context |
| `company_id` | Optional company context |
| `campaign_id` | Optional campaign context |
| `message_type` | Determines what kind of message is being reviewed |
| `primary_goal` | The strategic objective (inform, qualify, convert) |
| `cta` | The call-to-action the versions should include |
| `tone` | The selected tone (e.g., professional, conversational) |
| `status` | Must be active — `draft`, `approved`, or `in_use`; `superseded` blocks approval |
| `requires_human_review` | Flag from strategy agent; if true, approval is always required |
| `invalid_reasons` | Any blocking validation errors from strategy — blocks approval if present |
| `confidence_score` | Strategy agent confidence (0.0–1.0) |
| `confidence_band` | Human-readable confidence label |
| `selected_skills` | Skills applied — for reviewer context |
| `reasoning` | Why the strategy was selected — for reviewer context |

### 3.2 Message Version Inputs

Loaded from `message_versions` via `strategy_id`:

| Field | Purpose |
|-------|---------|
| `id` | Primary key |
| `tenant_id` | Tenancy guard |
| `strategy_id` | Links to strategy |
| `subject_line` | Candidate subject line |
| `preview_text` | Preview text |
| `body_text` | Full plain-text body |
| `body_html` | Must be null in v1 — non-null blocks approval |
| `message_type` | Should match strategy message_type |
| `version_label` | Label (A, B, C, D) |
| `strategy_angle` | Differentiation angle used |
| `approval_status` | Current status: `pending`, `selected`, `rejected`, `approved`, `superseded` |
| `reviewed_by` | User ID of last reviewer action |
| `reviewed_at` | Timestamp of last reviewer action |
| `rejection_reason` | Populated on rejection |
| `user_edited` | Whether human has edited copy (false in v1 bridge scope) |
| `final_subject_line` | Edited subject (out of v1 bridge scope — not written here) |
| `final_body_text` | Edited body (out of v1 bridge scope — not written here) |
| `created_at` | For ordering |
| `updated_at` | For recency |

### 3.3 Quality Review Inputs

Loaded from `quality_reviews` via `version_id`:

| Field | Purpose |
|-------|---------|
| `id` | Primary key |
| `tenant_id` | Tenancy guard |
| `version_id` | Links to message_version |
| `strategy_id` | Links to strategy |
| `composite_score` | 0–100 weighted score |
| `score_band` | excellent / strong / usable / needs_review / do_not_use |
| `rank_position` | Relative rank (1 = best) |
| `is_recommended` | Advisory recommendation flag |
| `strategic_fit_score` | Dimension score |
| `compliance_confidence_score` | Dimension score |
| `cta_clarity_score` | Dimension score |
| `specificity_score` | Dimension score |
| `tone_fit_score` | Dimension score |
| `differentiation_score` | Dimension score |
| `consistency_score` | Dimension score |
| `readability_score` | Dimension score |
| `risk_score` | Aggregate risk burden |
| `risk_flags` | Array of `{ code, severity, message }` |
| `compliance_flags` | Compliance-specific flags |
| `strengths` | String array of identified strengths |
| `weaknesses` | String array of identified weaknesses |
| `human_review_notes` | QRA-generated guidance for the reviewer |
| `recommended_edits` | QRA-generated edit suggestions |
| `comparison_summary` | How this version compares to others |
| `superseded_at` | Non-null if this quality review is stale |

Only non-superseded quality reviews are used for gating. Superseded reviews are display-only.

### 3.4 Reviewer / User Inputs

| Field | Purpose |
|-------|---------|
| `user_id` | Identity for `reviewed_by` |
| `user_name` | Display name |
| `role` | Used for permission checks |
| `workspace_id` | Workspace context |
| `tenant_id` | Must match version/strategy tenant |
| `permissions` | Must include `messaging.review` or equivalent |

### 3.5 System Control Inputs

Loaded from `system_controls`:

| Control Key | Purpose |
|-------------|---------|
| `email_generation_engine` | If paused, generation is blocked but review may proceed |
| `global_agent_pause` | If true, agents are paused; review still allowed |
| `require_message_approval` | If true, explicit approval is required before next-step handoff |
| `email_sending_enabled` | Informs UI state; does not gate approval |
| `campaign_sending_enabled` | Informs UI state; does not gate approval |

---

## 4. Human Review State Model

### 4.1 Conceptual States

The bridge operates against the following human review states:

| State | Description |
|-------|-------------|
| `pending_review` | Generated but not yet acted on by a human |
| `selected` | Human has chosen this as their preferred candidate |
| `rejected` | Human has rejected this version |
| `approved_for_next_step` | Human has approved this version; ready for Send/Draft Bridge |
| `returned_for_regeneration` | Human has requested new versions; pending versions may be superseded |
| `superseded` | This version was replaced by a regeneration run |
| `blocked` | Cannot be acted on due to active guardrail (critical risk, invalid strategy, etc.) |

### 4.2 Mapping to message_version.approval_status

These conceptual states map to the existing `approval_status` enum on `message_versions`:

| Conceptual State | approval_status Value |
|------------------|-----------------------|
| pending_review | `pending` |
| selected | `selected` |
| rejected | `rejected` |
| approved_for_next_step | `approved` |
| superseded | `superseded` |
| blocked | displayed via UI warning; no separate DB state |
| returned_for_regeneration | triggers regeneration; pending versions superseded |

**Design decision:** The bridge uses existing `approval_status` values rather than introducing a new status column. This avoids a migration for the state machine itself, though an audit event table is defined conceptually in Section 13.

### 4.3 Review Event History

To support future Learning Agent context and full audit accountability, a lightweight review event log is defined conceptually. See Section 13 for full schema.

---

## 5. message_version Approval Status Model

### 5.1 Status Definitions

**`pending`**
- Set by Copywriting Agent when version is created
- Version is generated but no human has acted on it
- Eligible for: select, reject, approve (direct), view

**`selected`**
- Set by bridge when reviewer selects a preferred candidate
- Advisory preference, not an approval
- Does not create email_draft, approval_request, or send event
- Eligible for: approve, reject, deselect
- Only one version per strategy should be `selected` at a time

**`rejected`**
- Set by bridge when reviewer rejects a version
- Requires `rejection_reason`
- Version is not deleted — preserved for audit and future Learning Agent context
- Not eligible for further action in v1 (no reopen flow in v1 bridge)

**`approved`**
- Set by bridge when reviewer explicitly approves a version for the next step
- Does not send email
- Does not create email_draft in v1
- Does not create approval_request in v1
- Is the designated handoff state for the future Send / Email Draft Bridge
- Requires valid QRA review, no critical risk, score >= 70 or override_reason provided
- Only one version per strategy may be `approved` at a time
- `approved` is exclusive per strategy in v1 — approving a second non-superseded version under the same strategy is blocked with HRB_018. No direct replacement workflow exists in v1.

**`superseded`**
- Set by Copywriting Agent on previous versions when regeneration is triggered
- Not available for selection, rejection, or approval
- Retained for audit and display purposes

### 5.2 Allowed Status Transitions

```
pending    → selected         (reviewer selects)
pending    → rejected         (reviewer rejects)
pending    → approved         (reviewer approves directly, policy permitting)
selected   → approved         (reviewer approves selected)
selected   → rejected         (reviewer rejects after selecting)
selected   → pending          (reviewer deselects — implementation optional)
approved   → rejected         (only if not yet consumed by Send Bridge; requires explicit intent)
pending / selected / rejected → superseded    (through Copywriting Agent regeneration)
superseded → [no transition]  (terminal state)
rejected   → [no transition in v1]  (no reopen in v1 bridge)
```

### 5.3 Forbidden Transitions

```
superseded → any             (blocked by HRB_006)
rejected   → approved        (blocked by HRB_007 — no reopen in v1)
rejected   → selected        (blocked by HRB_007)
approved   → selected        (illogical; approval supersedes selection)
[any] → [any] across tenants (blocked by HRB_002)
[second version] → approved  when another non-superseded approved version already exists under the same strategy (blocked by HRB_018 — one approved per strategy in v1)
```

---

## 6. Reviewer Actions

### Action A — Select Version

**Purpose:** Mark a version as the reviewer's preferred candidate. Does not approve. Does not send.

**Inputs:** `version_id`, `strategy_id`, `user_id`, optional `select_reason` (required if selecting non-recommended version)

**Pre-conditions:**
- Version exists and belongs to tenant
- Version `approval_status` is `pending` (or optionally `selected`, to re-select a different one)
- Version is not `superseded`, `rejected`, or `approved`
- Strategy exists and is active
- User has `messaging.review` permission

**Side effects:**
- Sets `approval_status = selected` on target version
- If another version in same strategy is currently `selected`, it is reverted to `pending`
- Sets `reviewed_by`, `reviewed_at`
- Records `HRB_ACTION_SELECTED` audit event

**Return value:** `{ success: true, versionId, newStatus: 'selected' }` or `{ success: false, error: HRB_xxx }`

---

### Action B — Reject Version

**Purpose:** Remove a version from consideration. Preserves the record for audit.

**Inputs:** `version_id`, `strategy_id`, `user_id`, `rejection_reason` (required), optional `reviewer_note`

**Pre-conditions:**
- Version exists and belongs to tenant
- Version `approval_status` is `pending` or `selected`
- Version is not `superseded` or already `rejected`
- Strategy exists
- User has `messaging.review` permission

**Side effects:**
- Sets `approval_status = rejected`
- Sets `rejection_reason`
- Sets `reviewed_by`, `reviewed_at`
- Records `HRB_ACTION_REJECTED` audit event

**Return value:** `{ success: true, versionId, newStatus: 'rejected' }` or `{ success: false, error: HRB_xxx }`

**If all versions rejected:**
- UI should prompt: "All versions have been rejected. Would you like to request regeneration?"
- Does not automatically regenerate

---

### Action C — Approve Version for Next Step

**Purpose:** Human explicitly marks a version ready for the downstream Send / Email Draft Bridge. Does not send. Does not create email_draft.

**Inputs:** `version_id`, `strategy_id`, `user_id`, optional `override_reason` (required if score < 70 or non-recommended), optional `risk_acknowledged` (required if high-severity risk flags present)

**Pre-conditions (gate check):**
- Version exists and belongs to tenant — else HRB_001 / HRB_002
- Version `approval_status` is `pending` or `selected` — else HRB_007 (rejected) / HRB_008 (already approved) / HRB_006 (superseded)
- Strategy is active — else HRB_004 / HRB_005
- Quality review exists and is not superseded — else HRB_009
- No critical risk flags — else HRB_010 (no override allowed in v1)
- If `composite_score < 70`: `override_reason` is required — else HRB_016
- If high-severity risk flags: `risk_acknowledged = true` required — else HRB_011
- `body_text` is non-empty — else HRB_011
- `subject_line` is non-empty — else HRB_012
- `body_html` is null — else HRB_013
- User has `messaging.approve` permission — else HRB_014
- `global_agent_pause` is false — else HRB_015
- No other non-superseded version under the same strategy already has `approval_status = approved` — else HRB_018

**Side effects:**
- Sets `approval_status = approved`
- Sets `reviewed_by`, `reviewed_at`
- Stores `override_reason` in audit event if provided
- Records `HRB_ACTION_APPROVED` audit event with full approval context
- Does NOT create email_draft
- Does NOT create approval_request
- Does NOT send email

**Return value:** `{ success: true, versionId, newStatus: 'approved' }` or `{ success: false, error: HRB_xxx }`

---

### Action D — Request Regeneration

**Purpose:** Human wants the Copywriting Agent to produce new versions. Delegates to Copywriting Agent — bridge does not generate.

**Inputs:** `strategy_id`, `user_id`, optional `regeneration_note`

**Pre-conditions:**
- Strategy exists and is active
- Copywriting Agent gate check passes (`canGenerateMessageVersions`)
- No other regeneration in flight
- User has `messaging.review` permission

**Side effects:**
- Calls `generateMessageVersionsAction` with `forceRegenerate = true`
- Copywriting Agent supersedes existing `pending` versions
- Existing `selected`, `approved`, `rejected` versions are NOT superseded
- Records `HRB_ACTION_REGENERATION_REQUESTED` audit event

**Return value:** Result of Copywriting Agent invocation, propagated

---

### Action E — Return to Strategy

**Purpose:** Human determines the message opportunity itself needs strategic adjustment. Redirects to Strategy Agent UI. Does not modify the strategy.

**Inputs:** `strategy_id`, `user_id`, `workspaceSlug`, `leadId`

**Side effects:**
- Records `HRB_ACTION_RETURNED_TO_STRATEGY` audit event
- Returns redirect target to UI

**Return value:** `{ success: true, redirectTo: '/[workspaceSlug]/message-workspace/[leadId]' }`

---

## 7. Approval Decision Rules

### 7.1 Approval Is Allowed When All of the Following Are True

1. Version `approval_status` is `pending` or `selected`
2. Version `body_html` is null
3. Version `body_text` is non-empty
4. Version `subject_line` is non-empty
5. Strategy `status` is `draft`, `approved`, or `in_use`
6. Strategy has no blocking `invalid_reasons`
7. A non-superseded `quality_review` exists for this version
8. No critical risk flags in the quality review
9. `composite_score >= 70` OR `override_reason` is provided
10. If high-severity risk flags exist: `risk_acknowledged = true`
11. User has `messaging.approve` permission
12. `global_agent_pause` is false
13. `tenant_id` matches across version, strategy, and request context
14. No other non-superseded `message_version` under the same strategy already has `approval_status = approved`

### 7.2 Approval Is Blocked When Any of the Following Are True

| Condition | Error Code | Override? |
|-----------|-----------|-----------|
| Version not found | HRB_001 | No |
| Tenant mismatch | HRB_002 | No |
| Strategy not found | HRB_003 | No |
| Strategy is superseded | HRB_004 | No |
| Strategy has blocking invalid_reasons | HRB_005 | No |
| Version is superseded | HRB_006 | No |
| Version is rejected | HRB_007 | No |
| Version is already approved | HRB_008 | No |
| Quality review missing or all superseded | HRB_009 | No |
| Critical risk flag present | HRB_010 | No — not in v1 |
| High risk, acknowledgement not provided | HRB_011 | Yes — provide acknowledgement |
| body_text missing | HRB_012 | No |
| subject_line missing | HRB_012 | No |
| body_html is non-null | HRB_013 | No |
| User lacks permission | HRB_014 | No |
| global_agent_pause active | HRB_015 | No |
| Score < 70 without override_reason | HRB_016 | Yes — provide override_reason |
| No active strategy | HRB_017 | No |
| Another non-superseded approved version already exists under this strategy | HRB_018 | No — no replacement workflow in v1 |

### 7.3 Low-Score Override Policy

When `composite_score < 70` and no critical risk flags:
- Approval is permitted if `override_reason` is provided
- `override_reason` must be a non-empty string
- Recorded in audit event
- UI must display explicit warning: "This version scores below the recommended threshold. A reason is required to approve."

### 7.4 Critical Risk Block Policy (No Override in v1)

When any risk flag has `severity === 'critical'`:
- Approval is blocked unconditionally
- UI must display: "Approval blocked — critical risk flag present. Regenerate or resolve the flagged issue."
- No override_reason can unlock this in v1
- Reviewer may reject the version or request regeneration

---

## 8. Rejection Rules

### 8.1 Rejection Is Always Easy

Rejection should have minimal friction. Any `pending` or `selected` version can be rejected at any time by a permitted reviewer.

### 8.2 Rejection Requires a Reason

The reviewer must select a structured `rejection_reason`. Optional free-text `reviewer_note` may supplement.

### 8.3 Rejection Reason Categories

| Code | Label |
|------|-------|
| `wrong_tone` | Wrong tone for this lead |
| `weak_cta` | Call to action is unclear or weak |
| `too_generic` | Too generic — not personalized enough |
| `too_long` | Message is too long |
| `too_short` | Message is too short |
| `inaccurate` | Contains inaccurate information |
| `compliance_concern` | Compliance or legal concern |
| `low_quality` | General quality issue |
| `not_relevant` | Not relevant for this lead at this time |
| `duplicate_angle` | Too similar to a version already rejected |
| `strategic_mismatch` | The strategy direction is wrong — return to strategy |
| `other` | Other (free text required if selected) |

### 8.4 Rejection Side Effects

- Sets `approval_status = rejected`
- Sets `rejection_reason` to structured code
- Sets `reviewed_by`, `reviewed_at`
- Optionally sets `reviewer_note` (if surfaced in UI — implementation decision)
- Does not delete the version
- Records `HRB_ACTION_REJECTED` audit event
- Does not affect strategy, lead, or campaign state

### 8.5 All Versions Rejected

If all non-superseded versions are rejected:
- UI prompts: "All versions have been rejected. Request regeneration or return to strategy."
- Regeneration can be requested via Action D
- Strategy edit can be initiated via Action E
- System does not auto-regenerate

---

## 9. Selection Rules

### 9.1 Selection Is Lightweight

Selection indicates a human preference — it is not an approval and does not trigger any downstream action. It is a "shortlist of one" that persists across page reloads and is visible to the reviewer.

### 9.2 Only One Selected Version Per Strategy (Recommended)

At any given time, only one version per strategy should be in `selected` state. When a reviewer selects a version:
- The newly selected version becomes `selected`
- Any previously `selected` version under the same strategy is reverted to `pending`
- This reversion is silent and recorded in the audit log

**Rationale:** Multiple `selected` versions would create ambiguity at the approval stage. A single selected version provides a clear anchor for the reviewer.

### 9.3 Selection Can Change

A reviewer may change their selection by selecting a different version. Prior selections revert to `pending`.

### 9.4 Selection Is Not Approval

Selecting a version does not:
- Set `approval_status = approved`
- Create email_draft
- Create approval_request
- Send email
- Trigger any downstream action

It simply records a preference and makes the "Approve" action more prominent in the UI.

### 9.5 Selecting a Non-Recommended Version

A reviewer may select any version, including non-recommended ones. The UI should:
- Indicate that the selected version differs from the QRA recommendation
- Optionally prompt for a reason (implementation decision — not a hard block)
- Record the action without requiring a reason in v1

---

## 10. QRA Recommendation Relationship

### 10.1 QRA Recommendation Is Advisory Only

`is_recommended = true` on a `quality_review` record does not approve a version, does not block a human from selecting a different version, and does not carry any enforcement weight beyond UI surfacing.

### 10.2 UI Display of Recommendation

The recommended version must display:
- Recommended badge (star icon + "Recommended" label)
- Composite score + score band
- Rank position
- `human_review_notes` from QRA
- `recommended_edits` from QRA (if any)
- Risk flags with severity indicators
- Strengths list
- Weaknesses list
- Comparison summary

All other versions display the same data minus the recommended badge.

### 10.3 Selecting Non-Recommended Version

Allowed without restriction. UI optionally surfaces: "You're selecting a version that wasn't the top-ranked. The QRA recommends version X."

### 10.4 Approving Non-Recommended Version

Allowed with same approval rules that apply to any version. If the version score < 70, `override_reason` is still required. Non-recommended status alone does not require an override reason.

### 10.5 QRA Cannot Block Human Review

The QRA may produce:
- Critical risk flags → blocks **approval** only, not viewing or selecting
- Low composite scores → requires **override reason** for approval, not a blanket block on viewing

A reviewer can always view all versions regardless of QRA output.

### 10.6 Superseded QRA Reviews

If a quality review has `superseded_at` non-null, it is stale. Only non-superseded reviews should gate approval. Superseded reviews may be shown as historical context but must not be used for gate evaluation.

---

## 11. Risk Flag Handling

### 11.1 Risk Severity Levels

| Severity | UI Treatment | Approval Effect |
|----------|-------------|-----------------|
| `critical` | Red banner, prominent warning | Blocks approval. No override in v1. |
| `high` | Orange warning | Approval requires `risk_acknowledged = true` |
| `medium` | Amber warning | Approval allowed; warning displayed |
| `low` | Gray informational note | No effect on approval |

### 11.2 Critical Risk UI Display

When a critical risk flag is present:
- Display a red banner at the top of the version card: "⚠ Approval blocked — critical risk detected"
- List the flag code and message
- Disable the Approve button with tooltip: "Resolve critical risk before approving"
- Reject and Regenerate remain available

### 11.3 High Risk Acknowledgement

When high-severity flags are present and reviewer attempts to approve:
- Display confirmation modal: "This version has high-severity risk flags. Do you acknowledge the risk?"
- Reviewer must check an acknowledgement checkbox
- `risk_acknowledged` is recorded in the audit event
- `HRB_011` is returned if reviewer attempts approval without acknowledgement

### 11.4 Medium and Low Risk

- Displayed in the version card risk flags list
- No confirmation required
- No effect on approval gate

### 11.5 Risk Acknowledgement Model

Risk acknowledgement is recorded in the audit event, not as a separate DB field on `message_versions`. The audit event records:
- `risk_flags_present`: array of flags at time of approval
- `risk_acknowledged`: boolean
- `highest_severity_at_approval`: critical / high / medium / low / none

---

## 12. Human Override Model

### 12.1 Allowed Overrides

| Override | Mechanism | Recording |
|----------|-----------|-----------|
| Approve a version scoring < 70 (no critical risk) | Provide `override_reason` string | Recorded in audit event |
| Select a non-recommended version | Allowed by default; reason optional | Recorded if reason provided |
| Reject a recommended version | Allowed; `rejection_reason` required | Recorded in audit event |
| Request regeneration despite acceptable score | Allowed with optional note | Recorded in audit event |

### 12.2 Disallowed Overrides (v1)

| Blocked Action | Reason |
|----------------|--------|
| Approve a version with critical risk | No override path in v1 |
| Approve a superseded version | Terminal state |
| Approve a rejected version | No reopen in v1 |
| Approve without permission | Permission is non-negotiable |
| Approve if tenant mismatch | Security boundary |
| Send via approval action | Sending is not in bridge scope |

### 12.3 Override Recording

Every approved override records:
- `user_id`
- `timestamp`
- `action`: `approved`
- `previous_status`
- `new_status`: `approved`
- `override_reason`: provided string
- `risk_acknowledged`: boolean
- `composite_score_at_approval`: numeric
- `is_recommended_at_approval`: boolean
- `risk_flags_at_approval`: array snapshot

This data exists to give the Learning Agent rich future context about human decision patterns.

---

## 13. Audit Trail Design

### 13.1 Why an Audit Trail Matters

Every reviewer action has downstream implications. For the Learning Agent (future work), knowing that a human overrode a QRA recommendation, or approved a low-scoring version, or rejected the top-ranked version, is signal. Without an event trail, that signal is lost.

### 13.2 Existing Fields on message_versions

The following fields already exist and should be used:

| Field | When Written |
|-------|-------------|
| `approval_status` | Every state transition |
| `reviewed_by` | Every state transition |
| `reviewed_at` | Every state transition |
| `rejection_reason` | On rejection |
| `user_edited` | Not used by v1 bridge |
| `final_subject_line` | Not used by v1 bridge |
| `final_body_text` | Not used by v1 bridge |

### 13.3 Conceptual Review Event Model

For full audit accountability, define a conceptual `message_version_review_event` model. The Implementation Plan should decide whether to create a new table or log via the existing `activity_events` infrastructure.

```
message_version_review_event {
  id                          uuid, primary key
  tenant_id                   uuid
  version_id                  uuid → message_versions.id
  strategy_id                 uuid → message_strategies.id
  action_type                 text  -- selected, rejected, approved, regeneration_requested, returned_to_strategy, deselected
  previous_status             text  -- prior approval_status
  new_status                  text  -- new approval_status
  user_id                     uuid
  rejection_reason            text | null
  override_reason             text | null
  risk_acknowledged           boolean | null
  composite_score_at_action   integer | null
  is_recommended_at_action    boolean | null
  risk_flags_at_action        jsonb | null  -- snapshot of flags at time of action
  reviewer_note               text | null
  metadata                    jsonb | null
  created_at                  timestamptz
}
```

Action type constants (additive — to be added to `modules/intelligence/types.agent.ts` if using the existing activity event system):
- `HRB_ACTION_SELECTED`
- `HRB_ACTION_DESELECTED`
- `HRB_ACTION_REJECTED`
- `HRB_ACTION_APPROVED`
- `HRB_ACTION_REGENERATION_REQUESTED`
- `HRB_ACTION_RETURNED_TO_STRATEGY`

### 13.4 Option: Use Existing Activity Events

If a new DB table is undesirable, these events may be logged as `activity_events` with `event_type` values from the constants above. The `event_summary` field carries a human-readable description. `metadata` carries the structured payload.

**Recommendation:** Use `activity_events` for v1. Reserve the dedicated `message_version_review_event` table for a future phase when event querying for Learning Agent becomes a requirement.

---

## 14. UI / Message Workspace Design

### 14.1 Existing UI State

The current `GeneratedVersionsPanel` (as of QRA Foundation v1.1) shows:
- Version cards with subject, preview, body (collapsible)
- QRA composite score badge + score band
- Recommended badge (if `is_recommended = true`)
- Rank position
- Risk flags (collapsible)
- Strengths and weaknesses (collapsible)
- Human review notes from QRA
- Select button (sets `pending → selected`)
- Reject button (sets `pending → rejected`)
- Approve & Send button — disabled with "coming in future phase" tooltip
- Quality Review button in header

### 14.2 New Bridge UI Additions

#### Version Card Status Indicators

Each version card header should prominently show its `approval_status` in addition to the QRA score badge:

| Status | Visual Treatment |
|--------|-----------------|
| `pending` | No special highlight; default card border |
| `selected` | Green card border or left-accent stripe; "Selected" badge |
| `rejected` | Dimmed/muted; red-tinted border; "Rejected" badge; rejection reason visible |
| `approved` | Bold blue/green outline; "Approved" badge; no send button |
| `superseded` | Grayed-out; "Superseded" badge |

#### Approve Button

When version is `pending` or `selected` and gate conditions pass:
- Show enabled "Approve for Next Step" button
- If score < 70: show warning and open override reason modal on click
- If critical risk: button is disabled with clear tooltip

When approval is blocked:
- Show disabled button with tooltip explaining the block reason

#### Reject Reason Modal

On reject click, display a modal with:
- Structured reason dropdown (rejection reason categories)
- Optional free-text note
- Confirm / Cancel

#### Override Reason Modal

On approve click when score < 70 (no critical risk):
- Display: "This version scores [X/100], below the recommended threshold of 70."
- Require text input: "Reason for approving below threshold"
- Confirm / Cancel

#### Risk Acknowledgement Confirmation

On approve click when high-severity risk flags present:
- Display list of high-severity flags with codes and messages
- Checkbox: "I acknowledge the risk flags and approve this version"
- Confirm / Cancel

#### Regeneration Prompt

When all versions are rejected:
- Display: "All versions have been rejected. Request regeneration or return to strategy."
- Two buttons: "Request Regeneration" and "Return to Strategy"

#### Approved State Display

When a version is `approved`:
- Show "Approved" badge prominently
- Show reviewer identity and timestamp (from `reviewed_by` / `reviewed_at`)
- "Approve & Send" remains disabled — future bridge will enable
- Approved versions are not re-actionable in v1 (no un-approve button in v1)

### 14.3 Action Buttons Per Status

| Status | Available Actions |
|--------|-----------------|
| `pending` | Select, Reject, Approve for Next Step |
| `selected` | Approve for Next Step, Reject, Deselect (optional) |
| `rejected` | View reason only (no reopen in v1) |
| `approved` | View details only (no send in v1) |
| `superseded` | View only |

### 14.4 Blocked Version UI

If `approval_status = blocked` is emitted (e.g., during approval attempt with gate failure):
- Show inline error banner under the version card
- Display specific HRB error code and user-facing message
- Do not change the version's stored status

---

## 15. Server Action Design

All actions are conceptual. No code is written here.

---

### 15.1 `selectMessageVersionForReviewAction`

**Purpose:** Set a version to `selected` and deselect any previously selected version for the same strategy.

**Inputs:** `versionId: string`, `strategyId: string`, `workspaceSlug: string`, `selectReason?: string`

**Validations:**
- Version exists and belongs to tenant
- Version status is `pending` (or `selected` for re-selection)
- Strategy is active
- User has `messaging.review` permission

**Side effects:**
- Sets target version `approval_status = selected`
- Sets `reviewed_by`, `reviewed_at`
- If prior `selected` version found under same strategy, resets it to `pending`
- Records `HRB_ACTION_SELECTED` and (if applicable) `HRB_ACTION_DESELECTED` events

**Returns:** `{ success: boolean, versionId: string, newStatus: string, error?: string }`

---

### 15.2 `rejectMessageVersionForReviewAction`

**Purpose:** Set a version to `rejected` with a structured reason.

**Inputs:** `versionId: string`, `strategyId: string`, `rejectionReason: string`, `reviewerNote?: string`, `workspaceSlug: string`

**Validations:**
- Version exists and belongs to tenant
- Version status is `pending` or `selected`
- `rejectionReason` is non-empty and a valid rejection reason code
- User has `messaging.review` permission

**Side effects:**
- Sets `approval_status = rejected`
- Sets `rejection_reason`
- Sets `reviewed_by`, `reviewed_at`
- Records `HRB_ACTION_REJECTED` event

**Returns:** `{ success: boolean, versionId: string, newStatus: string, error?: string }`

---

### 15.3 `approveMessageVersionForNextStepAction`

**Purpose:** Mark a version as approved for the downstream Send / Email Draft Bridge. Does not send. Does not create email_draft.

**Inputs:**
```
versionId: string
strategyId: string
workspaceSlug: string
overrideReason?: string        // required if composite_score < 70
riskAcknowledged?: boolean     // required if high-severity risk flags present
```

**Validations:** Full gate check as defined in Section 7 (HRB_001 through HRB_017).

**Side effects:**
- Sets `approval_status = approved`
- Sets `reviewed_by`, `reviewed_at`
- Records `HRB_ACTION_APPROVED` event with full approval context snapshot
- Does NOT create email_draft
- Does NOT create approval_request
- Does NOT send email

**Returns:** `{ success: boolean, versionId: string, newStatus: string, error?: string }`

---

### 15.4 `acknowledgeRiskAndApproveAction`

**Purpose:** Combined action for high-risk acknowledgement + approval in a single user-confirmed step.

**Inputs:** Same as `approveMessageVersionForNextStepAction` with `riskAcknowledged: true` enforced.

**Validations:** Same as approve gate; additionally validates that `riskAcknowledged === true` before proceeding.

**Side effects:** Same as approve.

**Returns:** Same as approve.

---

### 15.5 `requestVersionRegenerationAction`

**Purpose:** Trigger the Copywriting Agent to produce new versions. Existing `pending` versions are superseded. Existing `selected`, `approved`, `rejected` versions are preserved.

**Inputs:** `strategyId: string`, `workspaceSlug: string`, `leadId: string`, `regenerationNote?: string`

**Validations:**
- Strategy is active
- Copywriting Agent gate check passes
- User has `messaging.review` permission (or `messaging.generate`)

**Side effects:**
- Calls `generateMessageVersionsAction` with `forceRegenerate = true`
- Records `HRB_ACTION_REGENERATION_REQUESTED` event

**Returns:** Result from Copywriting Agent action, propagated

---

## 16. Repository / Service Boundary Design

### 16.1 Service Layer

Define a dedicated service:

**`modules/messaging/human-review/human-review.service.ts`**

Conceptual functions:

| Function | Purpose |
|----------|---------|
| `selectVersion(versionId, userId, tenantId, options?)` | Validate and execute selection |
| `rejectVersion(versionId, userId, tenantId, reason, note?)` | Validate and execute rejection |
| `approveVersionForNextStep(versionId, userId, tenantId, options)` | Full gate check and approval |
| `validateApprovalEligibility(versionId, tenantId)` | Returns eligibility result without side effects |
| `recordReviewEvent(event)` | Write to activity_events or review event table |
| `getReviewEventsForVersion(versionId, tenantId)` | Fetch event history |
| `getSelectedVersionForStrategy(strategyId, tenantId)` | Returns current selected version, if any |
| `getApprovedVersionForStrategy(strategyId, tenantId)` | Returns current approved version, if any |
| `deselectPriorSelectedVersion(strategyId, excludeVersionId, tenantId)` | Internal — reverts prior selection |

### 16.2 Repository Layer

**Option A — Extend `message-version.repo.ts`:**
- Add `updateApprovalStatus`, `setReviewed`, `getVersionsByStrategy` if not already present
- No new repo file required
- Simpler footprint

**Option B — New `human-review.repo.ts`:**
- Owns all review-related reads/writes
- Cleaner separation of concerns
- Slightly more files to maintain

**Recommendation:** Option B for the service layer. Use the existing `message-version.repo.ts` for raw status updates; create `human-review.repo.ts` for audit event writes and review queries. The service layer orchestrates both.

### 16.3 Tradeoff Summary

| Approach | Pro | Con |
|----------|-----|-----|
| Extend message-version.repo.ts | Fewer files | Mixed concerns over time |
| Dedicated human-review.repo.ts | Clean boundaries | Additional file |
| Use activity_events for audit | No new table | Query flexibility limited |
| Dedicated review event table | Full query power for Learning Agent | Requires migration |

**Recommended v1 approach:**
- `human-review.service.ts` — new service
- Extend `message-version.repo.ts` with any missing status update functions
- Use `activity_events` for audit log in v1 (no new table migration)
- Designate a review event table as a Phase 3B v2 item if Learning Agent requires it

---

## 17. Integration With Message Strategy Agent

### 17.1 Read-Only Relationship

The bridge reads `message_strategy` to validate that the strategy is active and to provide reviewer context. It does not modify any strategy field.

### 17.2 Strategy Status Gates

| Strategy Status | Effect on Bridge |
|-----------------|-----------------|
| `draft` | Bridge allowed — strategy in progress |
| `approved` | Bridge allowed — strategy is validated |
| `in_use` | Bridge allowed — versions being generated/reviewed |
| `superseded` | Bridge blocked — HRB_004 |
| `error` | Bridge blocked — HRB_005 if blocking invalid_reasons |

### 17.3 Bridge Must Not

- Re-run the Message Strategy Agent
- Modify `message_type`, `tone`, `cta`, `required_inclusions`, `avoid`, or any strategy field
- Override `confidence_score` or `confidence_band`
- Change `requires_human_review` flag

---

## 18. Integration With Copywriting Agent

### 18.1 message_version Record Ownership

The Copywriting Agent creates `message_version` records. The bridge updates their `approval_status`, `reviewed_by`, `reviewed_at`, and `rejection_reason`. These are the only fields the bridge writes to `message_versions`.

### 18.2 Copy Is Immutable in v1 Bridge

The bridge does not write to:
- `subject_line`
- `body_text`
- `preview_text`
- `body_html`
- `final_subject_line`
- `final_body_text`
- `differentiation_profile`

These fields remain as the Copywriting Agent produced them. Editing is out of scope for v1 bridge.

### 18.3 Regeneration Delegation

When the reviewer requests regeneration, the bridge delegates entirely to `generateMessageVersionsAction`. It does not contain any copy generation logic.

---

## 19. Integration With Quality Review Agent

### 19.1 Read-Only Relationship

The bridge reads `quality_reviews` for display and gating. It does not modify any quality review field.

### 19.2 Fields Used for Gating

| Field | Gate Usage |
|-------|-----------|
| `composite_score` | < 70 requires override_reason |
| `risk_flags` | Critical → block; High → acknowledgement required |
| `superseded_at` | Non-null → stale, not used for gating |
| `is_recommended` | Advisory display only |

### 19.3 Fields Used for Display Only

All other `quality_review` fields are display-only: score bands, dimension scores, strengths, weaknesses, human_review_notes, recommended_edits, comparison_summary.

### 19.4 Bridge Must Not

- Modify `composite_score`, `score_band`, `rank_position`, `is_recommended`
- Delete or supersede `quality_review` records
- Re-run QRA
- Treat QRA recommendation as an approval

---

## 20. Integration With Existing Phase 3A Approval / Draft Workflow

### 20.1 The Decision

The Verian BIOS platform has an existing Phase 3A approval workflow that may use `email_drafts` or related constructs. The key design question is: where does the Phase 3B bridge stop, and where does Phase 3A pick up?

### 20.2 Option A — Bridge Stops at approved message_version (Recommended for v1)

The bridge produces an `approved` `message_version`. No `email_draft` is created. No `approval_request` is created. A future **Send / Email Draft Bridge** reads approved `message_versions` and creates the appropriate Phase 3A constructs to pass to the send workflow.

**Why this is recommended:**
- Maintains the no-auto-send guarantee across all Phase 3B v1 work
- Keeps Phase 3A and Phase 3B cleanly separated — Phase 3A does not need to understand QRA or message_versions
- The `approved` state is a well-defined handoff point with a clear schema
- Allows the Learning Agent to later observe approval → send latency as a signal
- Sending remains gated behind a separate human action in the future send bridge

### 20.3 Option B — Bridge Creates email_draft (Deferred)

Human approves → bridge creates `email_draft` using approved version's `subject_line` / `body_text`. The existing Phase 3A approval workflow then routes the draft.

**Why this is deferred:**
- Creates Phase 3A dependency inside Phase 3B bridge
- `email_draft` creation is itself a meaningful action that deserves its own bridge with its own gate conditions
- Conflating approval with draft creation reduces auditability

### 20.4 Future Handoff Point

Once the Send / Email Draft Bridge is designed and implemented:
- It reads `message_versions` with `approval_status = approved`
- It optionally creates `email_draft` records or triggers the Phase 3A send workflow
- The bridge is a separate Phase 3B component with its own design document

---

## 21. Invalid Review / Approval Conditions

Error code family: `HRB_001` through `HRB_018`

| Code | Action Blocked | Condition | Suggested Fix |
|------|---------------|-----------|---------------|
| HRB_001 | Any | Version record not found | Verify version_id; refresh page |
| HRB_002 | Any | Tenant ID mismatch between version/strategy and request context | Authentication issue — do not retry |
| HRB_003 | Any | Strategy record not found | Verify strategy_id; refresh page |
| HRB_004 | Approve, Select | Strategy is superseded | Return to strategy list; generate new strategy |
| HRB_005 | Approve | Strategy has blocking invalid_reasons | Fix strategy first (return to Message Strategy Agent) |
| HRB_006 | Select, Approve | Version is superseded | Version is no longer available; select a current version |
| HRB_007 | Select, Approve | Version is rejected | Cannot act on rejected version in v1; request regeneration |
| HRB_008 | Approve | Version is already approved | Version already approved — no action needed |
| HRB_009 | Approve | No active quality_review found for this version | Run Quality Review first |
| HRB_010 | Approve | Critical risk flag present in quality_review | Cannot approve — resolve the flagged issue or reject and regenerate |
| HRB_011 | Approve | High-severity risk flags present without acknowledgement | Confirm risk acknowledgement in the approval modal |
| HRB_012 | Approve | body_text or subject_line is empty | Version is incomplete — contact support or regenerate |
| HRB_013 | Approve | body_html is non-null | body_html must be null in v1 — contact support |
| HRB_014 | Any | User lacks required permission | Request permission from workspace admin |
| HRB_015 | Approve, Generate | global_agent_pause is active | Agent is paused — check System Controls |
| HRB_016 | Approve | composite_score < 70 without override_reason | Provide an override reason or select a higher-scoring version |
| HRB_017 | Approve, Select | No active strategy exists for this lead | Generate a strategy first |
| HRB_018 | Approve | Another non-superseded `message_version` under the same strategy already has `approval_status = approved` | A second approval is blocked in v1. Use a future replacement workflow, or regenerate the strategy and versions. |

---

## 22. Agent and System Guardrails

The following guardrails are permanent for the Human Review / Approval Bridge. They must not be removed or modified without explicit user approval.

| Guardrail | Statement |
|-----------|-----------|
| Not an AI agent | The bridge contains no AI, LLM calls, or reasoning logic |
| No copy generation | The bridge does not generate, rewrite, or edit any copy |
| No quality scoring | The bridge does not compute or modify QRA scores |
| No send | The bridge does not send email under any condition |
| No email_draft creation in v1 | Approval does not create email_drafts in v1 |
| No approval_request creation in v1 | Approval does not create approval_requests in v1 |
| No Learning Agent trigger | The bridge does not call or initialize the Learning Agent |
| No Event Tracking | The bridge does not trigger outcome event tracking |
| No external LLMs | The bridge makes no external API calls |
| No strategy modification | Strategy fields are read-only from the bridge |
| No body_text modification | Original generated copy is immutable in v1 |
| Critical risk always blocks approval | No override path for critical risk flags in v1 |
| One approved version per strategy in v1 | Only one non-superseded `message_version` per strategy may be `approved`. A second approval is blocked with HRB_018. No replacement workflow exists in v1. |
| Human must explicitly act | No auto-approval, no auto-selection, no auto-send |
| Sending gated by future bridge | `approved` status is not a send trigger |

---

## 23. Test Case Suite

All test cases are behavioral specifications. No code is written here.

---

**TC-HRB-001 — Select pending version**

Input: `pending` version, active strategy, active QRA, valid user
Expected: `approval_status = selected`, `reviewed_by` set, `reviewed_at` set, `HRB_ACTION_SELECTED` audit event recorded
Pass condition: Action returns `{ success: true, newStatus: 'selected' }`

---

**TC-HRB-002 — Selecting one version deselects prior selected version under same strategy**

Input: Strategy with one `selected` version (V-A). Reviewer selects V-B.
Expected: V-B becomes `selected`, V-A reverts to `pending`, audit event records `HRB_ACTION_DESELECTED` for V-A
Pass condition: Only one version in `selected` state per strategy at end

---

**TC-HRB-003 — Reject pending version with reason**

Input: `pending` version, valid `rejection_reason = 'weak_cta'`, valid user
Expected: `approval_status = rejected`, `rejection_reason = 'weak_cta'`, `reviewed_by` set, audit event recorded
Pass condition: `{ success: true, newStatus: 'rejected' }`

---

**TC-HRB-004 — Reject selected version**

Input: `selected` version, valid `rejection_reason`, valid user
Expected: `approval_status = rejected`, prior selection cleared from strategy
Pass condition: `{ success: true, newStatus: 'rejected' }`

---

**TC-HRB-005 — Cannot select superseded version**

Input: `superseded` version, valid user
Expected: Rejected with `HRB_006`
Pass condition: `approval_status` unchanged, `{ success: false, error: 'HRB_006' }`

---

**TC-HRB-006 — Cannot approve superseded version**

Input: `superseded` version, valid user, valid QRA, valid strategy
Expected: Rejected with `HRB_006`
Pass condition: `{ success: false, error: 'HRB_006' }`

---

**TC-HRB-007 — Cannot approve rejected version**

Input: `rejected` version, valid user, valid QRA, valid strategy
Expected: Rejected with `HRB_007`
Pass condition: `{ success: false, error: 'HRB_007' }`

---

**TC-HRB-008 — Approve selected version with strong QRA score**

Input: `selected` version, `composite_score = 85`, no critical/high risk flags, valid strategy, valid user
Expected: `approval_status = approved`, audit event recorded, no email_draft created, no send triggered
Pass condition: `{ success: true, newStatus: 'approved' }`

---

**TC-HRB-009 — Approve pending version directly**

Input: `pending` version (never selected), `composite_score = 75`, no blocking flags, valid strategy, valid user
Expected: `approval_status = approved`; direct pending → approved transition is allowed
Pass condition: `{ success: true, newStatus: 'approved' }`

---

**TC-HRB-010 — Block approval when critical risk flag exists**

Input: `pending` version, `composite_score = 80`, one `critical` risk flag, valid strategy, valid user
Expected: Rejected with `HRB_010`; no override path in v1
Pass condition: `{ success: false, error: 'HRB_010' }`, `approval_status` unchanged

---

**TC-HRB-011 — High risk flag requires acknowledgement**

Input: `pending` version, `composite_score = 78`, one `high` risk flag, `riskAcknowledged = false`
Expected: Rejected with `HRB_011`
Pass condition: `{ success: false, error: 'HRB_011' }`

Retry with `riskAcknowledged = true`:
Expected: `approval_status = approved`, `risk_acknowledged = true` in audit event
Pass condition: `{ success: true, newStatus: 'approved' }`

---

**TC-HRB-012 — Medium risk displays warning but allows approval**

Input: `pending` version, `composite_score = 75`, one `medium` risk flag, no acknowledgement required
Expected: `approval_status = approved`, audit event shows medium flag present, no acknowledgement gate
Pass condition: `{ success: true, newStatus: 'approved' }`

---

**TC-HRB-013 — Low score below 70 with override reason**

Input: `pending` version, `composite_score = 62`, no critical/high flags, `overrideReason = 'Reviewer has relationship context'`, valid user
Expected: `approval_status = approved`, `override_reason` recorded in audit event
Pass condition: `{ success: true, newStatus: 'approved' }`

---

**TC-HRB-014 — Low score below 70 without override reason**

Input: `pending` version, `composite_score = 62`, no critical/high flags, `overrideReason` empty/null
Expected: Rejected with `HRB_016`
Pass condition: `{ success: false, error: 'HRB_016' }`, `approval_status` unchanged

---

**TC-HRB-015 — No QRA record blocks approval**

Input: `pending` version with no associated `quality_review`, valid strategy, valid user
Expected: Rejected with `HRB_009`
Pass condition: `{ success: false, error: 'HRB_009' }`

---

**TC-HRB-016 — QRA recommended version selected successfully**

Input: `pending` version with `is_recommended = true`, valid user
Expected: `approval_status = selected`, `HRB_ACTION_SELECTED` event recorded
Pass condition: `{ success: true, newStatus: 'selected' }`

---

**TC-HRB-017 — Non-recommended version selected with optional reason**

Input: `pending` version with `is_recommended = false`, `selectReason = 'Better tone for this contact'`, valid user
Expected: `approval_status = selected`, reason recorded if provided
Pass condition: `{ success: true, newStatus: 'selected' }`

---

**TC-HRB-018 — Non-recommended version approved with override reason (if score < 70)**

Input: Non-recommended version, `composite_score = 65`, `overrideReason = 'Reviewer judgment'`, no critical risk
Expected: `approval_status = approved`, override and non-recommended status both recorded in audit
Pass condition: `{ success: true, newStatus: 'approved' }`

---

**TC-HRB-019 — Approved version does not create email_draft**

Input: Approve a `pending` version successfully
Expected: No `email_draft` record created in the database
Pass condition: DB query for `email_drafts` by `version_id` returns zero rows

---

**TC-HRB-020 — Approved version does not create approval_request**

Input: Same as TC-HRB-019
Expected: No `approval_request` record created
Pass condition: DB query confirms zero rows

---

**TC-HRB-021 — Approved version does not send email**

Input: Same as TC-HRB-019
Expected: No send event emitted, no Resend/email API called
Pass condition: No outbound email event in activity log; no external call made

---

**TC-HRB-022 — Approval records reviewed_by and reviewed_at**

Input: Approve `pending` version with `userId = 'user-abc'`
Expected: `reviewed_by = 'user-abc'`, `reviewed_at` is a non-null ISO timestamp within 1 second of action
Pass condition: DB fields set correctly

---

**TC-HRB-023 — Rejection records rejection_reason**

Input: Reject `pending` version with `rejectionReason = 'wrong_tone'`
Expected: `rejection_reason = 'wrong_tone'` stored on version record
Pass condition: DB field set correctly

---

**TC-HRB-024 — Approval audit event recorded**

Input: Approve `pending` version
Expected: `HRB_ACTION_APPROVED` event recorded in audit log with: `version_id`, `user_id`, `previous_status`, `new_status`, `composite_score_at_action`, `is_recommended_at_action`, `risk_flags_at_action`
Pass condition: Audit event found with correct fields

---

**TC-HRB-025 — Rejection audit event recorded**

Input: Reject `pending` version with reason
Expected: `HRB_ACTION_REJECTED` event recorded with: `version_id`, `user_id`, `rejection_reason`, `previous_status = 'pending'`, `new_status = 'rejected'`
Pass condition: Audit event found with correct fields

---

**TC-HRB-026 — Regeneration does not delete approved or rejected versions**

Input: Strategy with one `approved` version (V-A), one `rejected` version (V-B), two `pending` versions (V-C, V-D)
Action: Request regeneration
Expected: V-A remains `approved`, V-B remains `rejected`. V-C and V-D become `superseded`. New versions created by Copywriting Agent.
Pass condition: V-A.approval_status = 'approved', V-B.approval_status = 'rejected'

---

**TC-HRB-027 — Strategy with blocking invalid_reasons blocks approval**

Input: Strategy with `invalid_reasons` containing a blocking error, `pending` version
Expected: Rejected with `HRB_005`
Pass condition: `{ success: false, error: 'HRB_005' }`, `approval_status` unchanged

---

**TC-HRB-028 — Tenant mismatch blocks action**

Input: Version belonging to `tenant_id = 'tenant-A'`, request context has `tenant_id = 'tenant-B'`
Expected: Rejected with `HRB_002`
Pass condition: `{ success: false, error: 'HRB_002' }`; no modification to DB record

---

**TC-HRB-029 — User without permission blocked**

Input: User without `messaging.review` permission attempts to select a version
Expected: Rejected with `HRB_014`
Pass condition: `{ success: false, error: 'HRB_014' }`

---

**TC-HRB-030 — body_html populated blocks approval**

Input: Version with `body_html = '<p>content</p>'`, all other conditions valid
Expected: Rejected with `HRB_013`
Pass condition: `{ success: false, error: 'HRB_013' }`

---

**TC-HRB-031 — Existing approved version blocks second approval under same strategy**

Input: Strategy with one already-`approved` version (V-A). Reviewer attempts to approve a second version (V-B). Both V-A and V-B are non-superseded.
Expected: Action blocked with `HRB_018`. V-A remains `approved`. V-B remains unchanged (its prior `approval_status` is unmodified). No replacement workflow is triggered.
Pass condition: `{ success: false, error: 'HRB_018' }`. V-A.approval_status = 'approved'. V-B.approval_status unchanged.

---

**TC-HRB-032 — Superseded QRA review ignored in gating**

Input: Version with one non-superseded `quality_review` (composite_score = 80) and one superseded `quality_review` (composite_score = 45)
Expected: Gating uses the non-superseded review (score 80). Approval succeeds.
Pass condition: `{ success: true, newStatus: 'approved' }`; superseded review did not trigger block

---

**TC-HRB-033 — Selected version persists after page reload**

Input: Reviewer selects V-B. Page is refreshed.
Expected: V-B still appears with `approval_status = selected` and "Selected" badge in UI.
Pass condition: UI correctly reflects persisted DB state on re-render

---

**TC-HRB-034 — Approved version appears as approved in UI**

Input: Version transitioned to `approved` state.
Expected: Version card shows "Approved" badge, `reviewed_by` identity, `reviewed_at` timestamp. Approve button hidden or replaced with "Approved" indicator.
Pass condition: UI renders approved state correctly without re-render artifacts

---

**TC-HRB-035 — Critical risk displayed prominently with block indicator in UI**

Input: Version with at least one `critical` risk flag.
Expected: Version card shows red critical risk banner. Approve button is disabled with tooltip "Approval blocked — critical risk present". Reject and Regenerate remain enabled.
Pass condition: UI renders block state; no approval is possible via UI interaction

---

## 24. Acceptance Criteria

The design document is complete and approvable when all of the following are true:

| Criterion | Met? |
|-----------|------|
| Bridge role and boundaries clearly defined (does / does not do) | ✓ |
| Full input model defined for strategy, versions, QRA, user, system controls | ✓ |
| State model defined and mapped to existing approval_status values | ✓ |
| All approval_status transitions defined with allowed and forbidden rules | ✓ |
| All five reviewer actions defined with pre-conditions, side effects, and return values | ✓ |
| Approval gate conditions defined (all 18 error codes, HRB_001–HRB_018) | ✓ |
| Rejection reason categories defined | ✓ |
| Selection policy defined (single selected per strategy) | ✓ |
| QRA recommendation relationship defined (advisory, no enforcement beyond gating) | ✓ |
| Risk flag handling defined for all four severity levels | ✓ |
| Override model defined — what can and cannot be overridden | ✓ |
| Audit trail model defined conceptually | ✓ |
| UI behavior defined per approval_status state | ✓ |
| All five server actions defined conceptually with inputs, validations, side effects | ✓ |
| Service and repository boundaries defined | ✓ |
| Phase 3A integration decision made (Option A — stop at approved) | ✓ |
| Invalid conditions defined with 18 error codes (HRB_001–HRB_018) | ✓ |
| One-approved-version-per-strategy policy resolved — HRB_018 defined, no open questions remain | ✓ |
| Agent and system guardrails affirmed | ✓ |
| At least 30 test cases included | ✓ (35 defined) |
| No code written | ✓ |
| No SQL written | ✓ |
| No sending introduced | ✓ |
| No email_drafts created in v1 | ✓ |
| No approval_requests created in v1 | ✓ |

---

## 25. Recommended Next Step

Once this design is approved by the user, create:

**Phase 3B Human Review / Approval Bridge — Implementation Plan**

That plan should specify:

1. Whether to create a dedicated `message_version_review_event` table (with migration) or use `activity_events` for audit logging in v1
2. Whether to introduce a new `human-review.service.ts` or extend existing services
3. Exact repository function signatures for message-version status updates
4. Whether `message-version.repo.ts` needs new helper functions (`getSelectedVersionForStrategy`, `getApprovedVersionForStrategy`, `deselectPriorSelected`)
5. Exact UI changes to `GeneratedVersionsPanel.tsx` — modal components, state machine rendering, action button conditions
6. Whether the Approve & Send button is repurposed or a new button added
7. Exact server action file: `modules/messaging/actions/human-review.actions.ts`
8. Exact activity event type constants to add to `modules/intelligence/types.agent.ts`
9. Test fixtures for `tests/fixtures/human-review-bridge/` (30+ fixtures)
10. Test file: `tests/human-review-bridge.test.ts`
11. QA checklist: vitest, build, TypeScript, lint, no regressions

---

*Document status: Draft. Awaiting user approval before implementation planning begins.*
*Version: 1.0 — 2026-05-20*
