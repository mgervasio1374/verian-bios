# Phase 3B Human Review / Approval Bridge — Implementation Plan

**Status:** Draft — Awaiting user approval before code implementation begins.
**Version:** 1.0
**Date:** 2026-05-21
**Prerequisite:** Design & Test Cases v1.0 locked and approved (`docs/roadmap/phase-3b-human-review-approval-bridge-design-test-cases.md`)

---

## 1. Executive Summary

This plan defines the engineering build for the Phase 3B Human Review / Approval Bridge — the workflow and state-management layer that connects the Quality Review Agent output to explicit human decision-making.

The bridge enables human reviewers to **select**, **reject**, and **approve** `message_version` candidates based on the QRA rankings, scores, and risk flags. It enforces gate conditions, records audit events, and produces a single well-defined handoff state (`approved`) that a future Send / Email Draft Bridge can consume.

**This implementation:**
- Creates a `human-review` service module with pure validation functions and orchestration
- Extends `message-version.repo.ts` with the DB operations needed for status transitions
- Creates `human-review.actions.ts` as the server action layer
- Adds six new `ActivityEventType` values to `modules/intelligence/types.agent.ts` (additive only)
- Extends `GeneratedVersionsPanel.tsx` with the full bridge UI (approve button, modals, status indicators)
- Creates 35 test fixtures and a new test suite

**This implementation does not:**
- Send email
- Create `email_drafts`
- Create `approval_requests`
- Bridge into the Phase 3A send workflow
- Modify `message_version` body text or subject line
- Modify `message_strategy` records
- Call external LLMs
- Trigger the Learning Agent or Event Tracking

The bridge produces human review state changes and activity event records only.

---

## 2. Implementation Scope

### 2.1 New Files to Create

| File | Purpose |
|------|---------|
| `modules/messaging/human-review/human-review.types.ts` | All interfaces, error codes, action types, constants |
| `modules/messaging/human-review/human-review.validation.ts` | Pure validation functions — eligibility checker, gate conditions |
| `modules/messaging/human-review/human-review.service.ts` | Orchestration — select, reject, approve, record events |
| `modules/messaging/human-review/human-review.audit.ts` | Audit event builder — constructs activity_event payloads |
| `modules/messaging/repositories/human-review.repo.ts` | Audit activity reads; query helpers for review history |
| `modules/messaging/actions/human-review.actions.ts` | Server actions — all bridge actions |
| `tests/fixtures/human-review-bridge/TC-HRB-001.json` → `TC-HRB-035.json` | 35 test fixtures |
| `tests/human-review-bridge.test.ts` | HRB Vitest test suite |

### 2.2 Existing Files to Modify

| File | What Changes |
|------|-------------|
| `modules/messaging/repositories/message-version.repo.ts` | Add status-update and query functions for review workflow |
| `modules/intelligence/types.agent.ts` | Add 6 HRB activity event type constants (additive only) |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx` | Full bridge UI: approve button, reject modal, override modal, risk acknowledgement, status indicators |

### 2.3 Files Explicitly Not Modified

- `modules/messaging/copywriting/` — locked, do not touch
- `modules/messaging/strategy/` — locked, do not touch
- `modules/messaging/quality-review/` — locked, do not touch
- Any Phase 3A service or repository
- `supabase/migrations/` — no new migration in v1 (no new table)
- `types/database.ts` — no schema changes

---

## 3. Non-Goals

The following are explicitly out of scope and must not be built, even if the implementation reveals an opportunity to do so:

| Non-Goal | Reason |
|----------|--------|
| Email sending | Sending is a future bridge; not in v1 scope |
| `email_draft` creation | Deferred to Send / Email Draft Bridge |
| `approval_request` creation | Deferred; not in v1 scope |
| Send / Email Draft Bridge | Separate phase, separate plan |
| Phase 3A approval/send workflow modification | Phase 3A is locked |
| Learning Agent | Not scoped |
| Event Tracking integration | Not scoped |
| External LLM calls | No LLM in any bridge component |
| Copy editing (body/subject) | Editing is out of v1 scope; these fields are immutable in bridge |
| `final_subject_line` writes | Not written by bridge |
| `final_body_text` writes | Not written by bridge |
| `user_edited` writes | Not written by bridge |
| QRA score or rank modification | QRA records are read-only from bridge |
| `message_strategy` field modification | Strategy is read-only from bridge |
| New DB table | No new migration; use activity_events for audit |
| Reopen rejected version | No reopen flow in v1 bridge |
| Replace existing approved version | HRB_018 blocks second approval; no replacement flow in v1 |

---

## 4. Proposed Module/File Structure

```
modules/
  messaging/
    human-review/
      human-review.types.ts          — interfaces, error codes, action types, constants
      human-review.validation.ts     — pure eligibility and gate-condition functions
      human-review.service.ts        — orchestration: select, reject, approve, event recording
      human-review.audit.ts          — pure event payload builders per action type

    repositories/
      human-review.repo.ts           — audit activity reads, review history queries
      message-version.repo.ts        — extend: status update, query by strategy functions

    actions/
      human-review.actions.ts        — server actions: all bridge actions

modules/
  intelligence/
    types.agent.ts                   — extend: add 6 HRB activity event type constants

app/
  (workspace)/
    [workspaceSlug]/
      message-workspace/
        [leadId]/
          GeneratedVersionsPanel.tsx — extend: bridge UI, modals, status indicators

tests/
  fixtures/
    human-review-bridge/
      TC-HRB-001.json                — select pending version
      TC-HRB-002.json                — deselect prior on new select
      TC-HRB-003.json                — reject pending with reason
      TC-HRB-004.json                — reject selected version
      TC-HRB-005.json                — cannot select superseded
      TC-HRB-006.json                — cannot approve superseded
      TC-HRB-007.json                — cannot approve rejected
      TC-HRB-008.json                — approve selected, strong score
      TC-HRB-009.json                — approve pending directly
      TC-HRB-010.json                — critical risk blocks approval
      TC-HRB-011.json                — high risk requires acknowledgement
      TC-HRB-012.json                — medium risk allows approval
      TC-HRB-013.json                — low score approved with override reason
      TC-HRB-014.json                — low score blocked without override reason
      TC-HRB-015.json                — missing QRA blocks approval
      TC-HRB-016.json                — recommended version selected
      TC-HRB-017.json                — non-recommended selected with reason
      TC-HRB-018.json                — non-recommended approved with reason
      TC-HRB-019.json                — approved does not create email_draft
      TC-HRB-020.json                — approved does not create approval_request
      TC-HRB-021.json                — approved does not send email
      TC-HRB-022.json                — approval sets reviewed_by / reviewed_at
      TC-HRB-023.json                — rejection sets rejection_reason
      TC-HRB-024.json                — approval audit event recorded
      TC-HRB-025.json                — rejection audit event recorded
      TC-HRB-026.json                — regeneration preserves approved/rejected
      TC-HRB-027.json                — strategy invalid_reasons blocks approval
      TC-HRB-028.json                — tenant mismatch blocks action
      TC-HRB-029.json                — permission missing blocks action
      TC-HRB-030.json                — body_html non-null blocks approval
      TC-HRB-031.json                — second approval blocked by HRB_018
      TC-HRB-032.json                — superseded QRA not used for gating
      TC-HRB-033.json                — selected status persists (load check)
      TC-HRB-034.json                — approved badge renders correctly
      TC-HRB-035.json                — critical risk renders block indicator

  human-review-bridge.test.ts        — HRB test suite
```

### 4.1 Responsibility of Each File

**`human-review.types.ts`**
All types: error code constants (`HRB_ERROR_CODES`), action type constants (`HRB_ACTION_TYPES`), rejection reason constants, interfaces for inputs/outputs and audit events. No logic. Uses `as const` pattern throughout — no TypeScript `enum` keyword.

**`human-review.validation.ts`**
Pure functions only. No I/O. No side effects.
- `validateApprovalEligibility(version, strategy, qualityReview, user, systemControls, options)` → `ApprovalEligibilityResult`
- `validateSelectEligibility(version, strategy, user)` → `{ allowed: boolean; error?: string }`
- `validateRejectEligibility(version, user, reason)` → `{ allowed: boolean; error?: string }`
- `hasCriticalRiskFlag(riskFlags)` → `boolean`
- `hasHighRiskFlag(riskFlags)` → `boolean`
- `isStrategyActive(strategy)` → `boolean`
- `deriveApprovalError(conditions)` → `string | null` — returns first failing HRB code

**`human-review.service.ts`**
Orchestration functions with I/O. Calls repo and audit functions. Each function validates inputs, calls repo, records event, returns result.
- `selectVersion` — validate, update status, deselect prior, record event
- `rejectVersion` — validate, update status, record event
- `approveVersionForNextStep` — full gate check, update status, record event
- `validateApprovalEligibility` — pure gate check returning eligibility result
- `requestVersionRegeneration` — delegates to Copywriting Agent action, records event
- `recordReviewEvent` — calls activity-event service
- `getReviewEventsForVersion` — calls repo
- `getSelectedVersionForStrategy` — calls repo
- `getApprovedVersionForStrategy` — calls repo
- `deselectPriorSelectedVersion` — internal; reverts prior selected version to pending

**`human-review.audit.ts`**
Pure event payload builders. Given action inputs, returns a structured `ActivityEvent`-compatible payload. No I/O.
- `buildSelectEventPayload(...)` → audit payload
- `buildDeselectEventPayload(...)` → audit payload
- `buildRejectEventPayload(...)` → audit payload
- `buildApproveEventPayload(...)` → audit payload
- `buildRegenerationRequestedPayload(...)` → audit payload
- `buildReturnedToStrategyPayload(...)` → audit payload

**`human-review.repo.ts`**
Read-only queries for review history from activity_events. Optional in v1 — only create if `getReviewEventsForVersion` is needed for UI.
- `listHumanReviewActivityForVersion(versionId, tenantId)` → activity events
- `listHumanReviewActivityForStrategy(strategyId, tenantId)` → activity events

**`message-version.repo.ts` additions**
New functions appended to the existing file:
- `updateMessageVersionApprovalStatus(versionId, status, reviewedBy, reviewedAt, tenantId)` — core status setter
- `setMessageVersionRejectionReason(versionId, reason, tenantId)` — sets rejection_reason field
- `getMessageVersionWithStrategy(versionId, tenantId)` — joins version + strategy for eligibility check
- `getSelectedVersionForStrategy(strategyId, tenantId)` — finds current selected version
- `getApprovedVersionForStrategy(strategyId, tenantId)` — finds current approved version (for HRB_018 check)
- `deselectOtherVersionsForStrategy(strategyId, excludeVersionId, tenantId)` — reverts other selected versions to pending

**`human-review.actions.ts`**
Next.js server actions. Each calls the service and revalidates the path.
- `selectMessageVersionForReviewAction`
- `rejectMessageVersionForReviewAction`
- `approveMessageVersionForNextStepAction`
- `acknowledgeRiskAndApproveAction`
- `requestVersionRegenerationAction`
- `returnToStrategyAction`

Note on existing actions: `selectMessageVersionAction` and `rejectMessageVersionAction` exist in `copywriting-agent.actions.ts`. Those are simple status-setters without audit events. The new HRB actions replace them in the UI. The existing actions may remain for backward compatibility but the UI should import from `human-review.actions.ts` for all bridge flows.

**`GeneratedVersionsPanel.tsx`**
Client component. Extends existing QRA display with:
- Bridge action imports from `human-review.actions.ts`
- Inline modal components: `RejectModal`, `OverrideReasonModal`, `RiskAcknowledgementModal`
- Status indicators per card: Selected badge, Approved badge
- Critical risk block banner per card
- Approve for Next Step button with conditional enable/disable
- All-rejected prompt with regeneration button

---

## 5. Data Model and Storage Decision

### 5.1 No New Database Table in v1

**Decision confirmed:** The bridge does not create a new migration or table. All audit data is written to the existing `activity_events` table using the existing `activityEventService`. The `message_version_review_event` table defined conceptually in the design document is deferred until the Learning Agent or advanced analytics requires rich event querying.

### 5.2 Fields Written on message_versions

The bridge writes to these existing fields only:

| Field | Written By | When |
|-------|-----------|------|
| `approval_status` | All review actions | Every state transition |
| `reviewed_by` | All review actions | Every state transition |
| `reviewed_at` | All review actions | Every state transition |
| `rejection_reason` | Reject action | On rejection only |

The bridge **does not write** to:
- `subject_line`, `body_text`, `preview_text`, `body_html`
- `final_subject_line`, `final_body_text`
- `user_edited`, `user_edit_summary`
- `differentiation_profile`

### 5.3 activity_events Payload Structure per Action

All bridge audit events use the existing `activity_events` infrastructure from Phase 3A (`modules/intelligence/services/activity-event.service.ts`).

**Approved event payload:**
```
event_type:               HRB_ACTION_APPROVED
event_summary:            "Reviewer [user_name] approved version [version_label] for [strategy.message_type]"
subject_type:             'message_version'
subject_id:               version_id
tenant_id:                tenant_id
metadata: {
  version_id:             string
  strategy_id:            string
  previous_status:        string
  new_status:             'approved'
  user_id:                string
  composite_score_at_action: number
  score_band_at_action:   string
  is_recommended_at_action: boolean
  risk_flags_at_action:   RiskFlag[]
  risk_acknowledged:      boolean | null
  override_reason:        string | null
  timestamp:              ISO string
}
```

**Rejected event payload:**
```
event_type:               HRB_ACTION_REJECTED
event_summary:            "Reviewer [user_name] rejected version [version_label]"
subject_type:             'message_version'
subject_id:               version_id
metadata: {
  version_id:             string
  strategy_id:            string
  previous_status:        string
  new_status:             'rejected'
  rejection_reason:       string
  reviewer_note:          string | null
  user_id:                string
  timestamp:              ISO string
}
```

**Selected event payload:**
```
event_type:               HRB_ACTION_SELECTED
event_summary:            "Reviewer [user_name] selected version [version_label]"
subject_type:             'message_version'
subject_id:               version_id
metadata: {
  version_id:             string
  strategy_id:            string
  previous_status:        string
  new_status:             'selected'
  prior_selected_version_id: string | null
  user_id:                string
  timestamp:              ISO string
}
```

**Deselected event payload (when prior selection reverted):**
```
event_type:               HRB_ACTION_DESELECTED
event_summary:            "Version [version_label] deselected (replaced by new selection)"
subject_type:             'message_version'
subject_id:               prior_version_id
metadata: {
  version_id:             string   (prior version)
  strategy_id:            string
  new_selected_version_id: string  (replacement)
  user_id:                string
  timestamp:              ISO string
}
```

**Regeneration requested payload:**
```
event_type:               HRB_ACTION_REGENERATION_REQUESTED
event_summary:            "Reviewer [user_name] requested version regeneration"
subject_type:             'message_strategy'
subject_id:               strategy_id
metadata: {
  strategy_id:            string
  regeneration_note:      string | null
  user_id:                string
  timestamp:              ISO string
}
```

**Returned to strategy payload:**
```
event_type:               HRB_ACTION_RETURNED_TO_STRATEGY
event_summary:            "Reviewer returned to strategy editing"
subject_type:             'message_strategy'
subject_id:               strategy_id
metadata: {
  strategy_id:            string
  user_id:                string
  timestamp:              ISO string
}
```

---

## 6. Type Contracts and Interfaces

All types defined in `human-review.types.ts`. No TypeScript `enum` keyword. Use `as const` throughout.

### 6.1 Error Codes

```
const HRB_ERROR_CODES = {
  VERSION_NOT_FOUND:              'HRB_001',
  TENANT_MISMATCH:                'HRB_002',
  STRATEGY_NOT_FOUND:             'HRB_003',
  STRATEGY_SUPERSEDED:            'HRB_004',
  STRATEGY_INVALID:               'HRB_005',
  VERSION_SUPERSEDED:             'HRB_006',
  VERSION_REJECTED:               'HRB_007',
  VERSION_ALREADY_APPROVED:       'HRB_008',
  QUALITY_REVIEW_MISSING:         'HRB_009',
  CRITICAL_RISK_PRESENT:          'HRB_010',
  HIGH_RISK_NOT_ACKNOWLEDGED:     'HRB_011',
  VERSION_CONTENT_MISSING:        'HRB_012',
  BODY_HTML_POPULATED:            'HRB_013',
  PERMISSION_DENIED:              'HRB_014',
  AGENT_PAUSED:                   'HRB_015',
  LOW_SCORE_NO_OVERRIDE:          'HRB_016',
  NO_ACTIVE_STRATEGY:             'HRB_017',
  EXISTING_APPROVED_VERSION:      'HRB_018',
} as const

type HrbErrorCode = typeof HRB_ERROR_CODES[keyof typeof HRB_ERROR_CODES]
```

### 6.2 Action Types

```
const HRB_ACTION_TYPES = {
  SELECTED:                'HRB_ACTION_SELECTED',
  DESELECTED:              'HRB_ACTION_DESELECTED',
  REJECTED:                'HRB_ACTION_REJECTED',
  APPROVED:                'HRB_ACTION_APPROVED',
  REGENERATION_REQUESTED:  'HRB_ACTION_REGENERATION_REQUESTED',
  RETURNED_TO_STRATEGY:    'HRB_ACTION_RETURNED_TO_STRATEGY',
} as const

type HrbActionType = typeof HRB_ACTION_TYPES[keyof typeof HRB_ACTION_TYPES]
```

### 6.3 Rejection Reason Codes

```
const REJECTION_REASONS = {
  WRONG_TONE:          'wrong_tone',
  WEAK_CTA:            'weak_cta',
  TOO_GENERIC:         'too_generic',
  TOO_LONG:            'too_long',
  TOO_SHORT:           'too_short',
  INACCURATE:          'inaccurate',
  COMPLIANCE_CONCERN:  'compliance_concern',
  LOW_QUALITY:         'low_quality',
  NOT_RELEVANT:        'not_relevant',
  DUPLICATE_ANGLE:     'duplicate_angle',
  STRATEGIC_MISMATCH:  'strategic_mismatch',
  OTHER:               'other',
} as const

type RejectionReason = typeof REJECTION_REASONS[keyof typeof REJECTION_REASONS]
```

### 6.4 Core Interfaces

```
// Minimal strategy shape for bridge validation
interface HumanReviewStrategy {
  id:               string
  tenant_id:        string
  lead_id:          string
  message_type:     string
  status:           string       // 'draft' | 'approved' | 'in_use' | 'superseded' | 'error'
  invalid_reasons:  string[]
  requires_human_review: boolean
}

// Minimal version shape for bridge validation
interface HumanReviewVersion {
  id:               string
  tenant_id:        string
  strategy_id:      string
  version_label:    string
  subject_line:     string | null
  body_text:        string | null
  body_html:        string | null
  approval_status:  string       // 'pending' | 'selected' | 'rejected' | 'approved' | 'superseded'
  reviewed_by:      string | null
  reviewed_at:      string | null
  rejection_reason: string | null
}

// Minimal QRA shape for bridge gating
interface HumanReviewQualityReview {
  id:               string
  tenant_id:        string
  version_id:       string
  strategy_id:      string
  composite_score:  number
  score_band:       string
  is_recommended:   boolean
  risk_flags:       Array<{ code: string; severity: string; message: string }>
  superseded_at:    string | null
}

// Reviewer context
interface HumanReviewer {
  user_id:    string
  tenant_id:  string
}

// System control state relevant to bridge
interface HumanReviewSystemControls {
  global_agent_pause: boolean
}

// Result type for eligibility check
interface ApprovalEligibilityResult {
  allowed:         boolean
  error:           HrbErrorCode | null
  errorMessage:    string | null
}

// Return type from bridge actions
interface HumanReviewResult {
  success:          boolean
  versionId?:       string
  newStatus?:       string
  error?:           HrbErrorCode
  errorMessage?:    string
}

// Input to selectVersion
interface SelectVersionInput {
  versionId:        string
  strategyId:       string
  userId:           string
  tenantId:         string
  selectReason?:    string
}

// Input to rejectVersion
interface RejectVersionInput {
  versionId:        string
  strategyId:       string
  userId:           string
  tenantId:         string
  rejectionReason:  RejectionReason
  reviewerNote?:    string
}

// Input to approveVersionForNextStep
interface ApproveVersionInput {
  versionId:          string
  strategyId:         string
  userId:             string
  tenantId:           string
  overrideReason?:    string    // required if composite_score < 70
  riskAcknowledged?:  boolean   // required if high severity risk flags present
}

// Input to requestVersionRegeneration
interface RegenerationRequestInput {
  strategyId:         string
  leadId:             string
  userId:             string
  tenantId:           string
  regenerationNote?:  string
}

// Audit event payload (written to activity_events.metadata)
interface HumanReviewEventPayload {
  action_type:                   HrbActionType
  version_id?:                   string
  strategy_id:                   string
  previous_status?:              string
  new_status?:                   string
  user_id:                       string
  rejection_reason?:             string
  reviewer_note?:                string
  override_reason?:              string
  risk_acknowledged?:            boolean
  composite_score_at_action?:    number
  score_band_at_action?:         string
  is_recommended_at_action?:     boolean
  risk_flags_at_action?:         Array<{ code: string; severity: string; message: string }>
  prior_selected_version_id?:    string
  new_selected_version_id?:      string
  regeneration_note?:            string
  timestamp:                     string
}
```

---

## 7. Service Boundary Design

**File:** `modules/messaging/human-review/human-review.service.ts`

All functions are `async`. All accept typed inputs. All return `HumanReviewResult` or similar typed result.

---

### `selectVersion(input: SelectVersionInput): Promise<HumanReviewResult>`

**Purpose:** Set a version to `selected`. Revert any prior selected version to `pending`.

**Validation (calls `validateSelectEligibility`):**
- Version exists and belongs to tenant — else HRB_001 / HRB_002
- Version `approval_status` is `pending` or `selected` — else HRB_006 / HRB_007
- Version is not `superseded` or `rejected` — else HRB_006 / HRB_007
- Strategy exists and is active — else HRB_003 / HRB_004

**Side effects (in order):**
1. Call `deselectPriorSelectedVersion(strategyId, versionId, tenantId)` — reverts prior selected version
2. Call `updateMessageVersionApprovalStatus(versionId, 'selected', userId, now, tenantId)`
3. Call `activityEventService.record(buildSelectEventPayload(...))`
4. If prior version deselected: record `buildDeselectEventPayload(...)` for prior version

**Returns:** `{ success: true, versionId, newStatus: 'selected' }` or `{ success: false, error: HrbErrorCode }`

---

### `rejectVersion(input: RejectVersionInput): Promise<HumanReviewResult>`

**Purpose:** Set a version to `rejected` with a structured reason.

**Validation (calls `validateRejectEligibility`):**
- Version exists and belongs to tenant — else HRB_001 / HRB_002
- Version `approval_status` is `pending` or `selected` — else HRB_006 (superseded) / HRB_007 (already rejected) / HRB_008 (approved — allowed to reject approved in v1 design; confirm in implementation)
- `rejectionReason` is a valid `RejectionReason` code — else return error
- If `rejectionReason === 'other'`: `reviewerNote` must be non-empty

**Side effects (in order):**
1. Call `updateMessageVersionApprovalStatus(versionId, 'rejected', userId, now, tenantId)`
2. Call `setMessageVersionRejectionReason(versionId, rejectionReason, tenantId)`
3. Call `activityEventService.record(buildRejectEventPayload(...))`

**Returns:** `{ success: true, versionId, newStatus: 'rejected' }` or `{ success: false, error: HrbErrorCode }`

---

### `approveVersionForNextStep(input: ApproveVersionInput): Promise<HumanReviewResult>`

**Purpose:** Mark a version as `approved`. Does not send. Does not create email_draft.

**Validation (calls `validateApprovalEligibility`):**
Full 18-condition gate check as defined in Section 11. Returns first failing HRB code.

**Side effects (in order):**
1. Call `updateMessageVersionApprovalStatus(versionId, 'approved', userId, now, tenantId)`
2. Call `activityEventService.record(buildApproveEventPayload(...))` — includes snapshot of composite_score, score_band, is_recommended, risk_flags, risk_acknowledged, override_reason
3. Does NOT create email_draft
4. Does NOT create approval_request
5. Does NOT trigger send

**Returns:** `{ success: true, versionId, newStatus: 'approved' }` or `{ success: false, error: HrbErrorCode }`

---

### `validateApprovalEligibility(versionId, tenantId, options?): Promise<ApprovalEligibilityResult>`

**Purpose:** Gate check only — no side effects. Used by both the service and UI eligibility display.

**Behavior:**
- Loads version, strategy, quality_review, system_controls
- Runs all 18 conditions in sequence
- Returns first failing error code, or `{ allowed: true, error: null }`

**Side effects:** None.

---

### `requestVersionRegeneration(input: RegenerationRequestInput): Promise<HumanReviewResult>`

**Purpose:** Delegate to Copywriting Agent to produce new versions. Does not generate copy itself.

**Behavior:**
- Calls `generateMessageVersionsAction(strategyId, leadId, workspaceSlug, true)` (forceRegenerate)
- Records `HRB_ACTION_REGENERATION_REQUESTED` event
- Copywriting Agent's regeneration supersedes `pending` versions; `selected`, `approved`, `rejected` are preserved

**Returns:** Copywriting Agent result propagated, plus event confirmation.

---

### `recordReviewEvent(payload: HumanReviewEventPayload, tenantId: string): Promise<void>`

**Purpose:** Write an activity event for any bridge action.

**Behavior:**
- Calls `activityEventService.createActivityEvent(...)` with the HRB action type and metadata payload.

---

### `getSelectedVersionForStrategy(strategyId, tenantId): Promise<HumanReviewVersion | null>`

**Purpose:** Retrieve current selected version, if any.

**Behavior:** Calls `message-version.repo.ts` `getSelectedVersionForStrategy`.

---

### `getApprovedVersionForStrategy(strategyId, tenantId): Promise<HumanReviewVersion | null>`

**Purpose:** Retrieve current approved version, if any. Used for HRB_018 check.

---

### `deselectPriorSelectedVersion(strategyId, excludeVersionId, tenantId): Promise<void>`

**Purpose:** Internal helper. Reverts any version in `selected` state (other than `excludeVersionId`) back to `pending`.

**Behavior:**
- Calls `deselectOtherVersionsForStrategy(strategyId, excludeVersionId, tenantId)` on the repo

---

## 8. Repository Boundary Design

### 8.1 Approach

- **Extend** `message-version.repo.ts` for all `message_versions` status-update and query operations. This keeps DB operations for the `message_versions` table in one file.
- **Create** `human-review.repo.ts` for activity_event read queries related to bridge history. These are distinct from the message_version entity.
- **No new DB table** in v1. Use existing tables only.

### 8.2 Additions to `message-version.repo.ts`

```
// Sets approval_status, reviewed_by, reviewed_at
updateMessageVersionApprovalStatus(
  versionId: string,
  newStatus: string,
  reviewedBy: string,
  reviewedAt: string,
  tenantId: string
): Promise<void>

// Sets rejection_reason on the version record
setMessageVersionRejectionReason(
  versionId: string,
  reason: string,
  tenantId: string
): Promise<void>

// Loads version with its strategy (join) for eligibility validation
getMessageVersionWithStrategy(
  versionId: string,
  tenantId: string
): Promise<{ version: HumanReviewVersion; strategy: HumanReviewStrategy } | null>

// Finds current selected version for a strategy (returns null if none)
getSelectedVersionForStrategy(
  strategyId: string,
  tenantId: string
): Promise<HumanReviewVersion | null>

// Finds current approved version for a strategy (returns null if none)
getApprovedVersionForStrategy(
  strategyId: string,
  tenantId: string
): Promise<HumanReviewVersion | null>

// Reverts all selected versions under a strategy to pending (except excludeVersionId)
deselectOtherVersionsForStrategy(
  strategyId: string,
  excludeVersionId: string,
  tenantId: string
): Promise<void>

// Lists all non-superseded versions for a strategy (for all-rejected check)
getNonSupersededVersionsForStrategy(
  strategyId: string,
  tenantId: string
): Promise<HumanReviewVersion[]>
```

### 8.3 New `human-review.repo.ts`

Created only if `getReviewEventsForVersion` is needed in the UI (for showing review history). If the v1 UI does not surface review history, this file may be deferred.

```
// Reads bridge activity events for a specific version (from activity_events table)
listHumanReviewActivityForVersion(
  versionId: string,
  tenantId: string
): Promise<ActivityEvent[]>

// Reads bridge activity events for a strategy (for overview)
listHumanReviewActivityForStrategy(
  strategyId: string,
  tenantId: string
): Promise<ActivityEvent[]>
```

### 8.4 Supabase Client Usage

Service functions use the Supabase service-role client (`createSupabaseServiceRoleClient`) for writes to `message_versions`, consistent with other Phase 3B agents. Server actions build request context via `buildRequestContext` before calling the service.

---

## 9. Server Action Design

**File:** `modules/messaging/actions/human-review.actions.ts`

All actions are Next.js server actions (`'use server'`). Each builds request context, checks auth/tenant, calls the service, revalidates path, and returns a typed result.

---

### `selectMessageVersionForReviewAction`

**Inputs:** `versionId: string`, `strategyId: string`, `workspaceSlug: string`, `selectReason?: string`

**Permissions:** `messaging.versions.review` (or equivalent existing permission)

**Service call:** `humanReviewService.selectVersion({ versionId, strategyId, userId, tenantId, selectReason })`

**On success:** `revalidatePath('/${workspaceSlug}/message-workspace/${leadId}')` via router refresh

**Return:** `{ success: boolean; error?: string }`

**No-send guarantee:** No send, no email_draft, no approval_request triggered.

---

### `rejectMessageVersionForReviewAction`

**Inputs:** `versionId: string`, `strategyId: string`, `rejectionReason: string`, `workspaceSlug: string`, `reviewerNote?: string`

**Permissions:** `messaging.versions.review`

**Validation:** `rejectionReason` must be a valid `RejectionReason` code

**Service call:** `humanReviewService.rejectVersion({ versionId, strategyId, userId, tenantId, rejectionReason, reviewerNote })`

**Return:** `{ success: boolean; error?: string }`

---

### `approveMessageVersionForNextStepAction`

**Inputs:** `versionId: string`, `strategyId: string`, `workspaceSlug: string`, `options: { overrideReason?: string; riskAcknowledged?: boolean }`

**Permissions:** `messaging.versions.approve` (elevated; distinct from review permission)

**Service call:** `humanReviewService.approveVersionForNextStep({ versionId, strategyId, userId, tenantId, ...options })`

**Return:** `{ success: boolean; error?: string; errorCode?: HrbErrorCode }`

**No-send guarantee:** Service explicitly asserts no email_draft, approval_request, or send side effect.

---

### `acknowledgeRiskAndApproveAction`

**Inputs:** Same as approve, with `riskAcknowledged: true` enforced before calling service

**Permissions:** `messaging.versions.approve`

**Validation:** Asserts `riskAcknowledged === true` before delegating to approve service

**Service call:** `humanReviewService.approveVersionForNextStep({ ..., riskAcknowledged: true })`

**Return:** Same as approve action

---

### `requestVersionRegenerationAction`

**Inputs:** `strategyId: string`, `leadId: string`, `workspaceSlug: string`, `regenerationNote?: string`

**Permissions:** `messaging.versions.review`

**Service call:** `humanReviewService.requestVersionRegeneration({ strategyId, leadId, userId, tenantId, regenerationNote })`

**Return:** `{ success: boolean; error?: string }`

---

### `returnToStrategyAction`

**Inputs:** `strategyId: string`, `leadId: string`, `workspaceSlug: string`, `note?: string`

**Permissions:** `messaging.versions.review`

**Service call:** Records `HRB_ACTION_RETURNED_TO_STRATEGY` event; returns redirect target

**Return:** `{ success: boolean; redirectTo: string }`

---

## 10. Review State Transition Logic

**File:** `modules/messaging/human-review/human-review.validation.ts` (transition guard functions)

### 10.1 State Machine

```
                    ┌─────────────────────────────────────────┐
                    │             message_version              │
                    │                                          │
      ┌─────────────┤  approval_status transition model        │
      │             │                                          │
      │  Created ───┼──► pending                              │
      │             │       │                                 │
      │             │       ├──► selected ◄─── deselect       │
      │             │       │       │                         │
      │             │       ├───────┤                         │
      │             │       │       ▼                         │
      │             │       ├──► rejected  (terminal in v1)   │
      │             │       │                                 │
      │             │       └──► approved  (terminal in v1)   │
      │             │               (handoff to future bridge)│
      │             │                                         │
      │  Regen  ────┼──► superseded  (terminal)              │
      └─────────────┤                                          │
                    └─────────────────────────────────────────┘
```

### 10.2 Transition Table

| From | To | Trigger | Guard |
|------|-----|---------|-------|
| `pending` | `selected` | Reviewer selects | Version not superseded/rejected/approved |
| `pending` | `rejected` | Reviewer rejects | Version not superseded; reason required |
| `pending` | `approved` | Reviewer approves directly | Full gate check (HRB_001–HRB_018) |
| `selected` | `approved` | Reviewer approves | Full gate check |
| `selected` | `rejected` | Reviewer rejects | Reason required |
| `selected` | `pending` | Reviewer deselects | Optional in v1 |
| `approved` | `rejected` | Reviewer reverts | Only if Send Bridge has not consumed it |
| Any non-superseded | `superseded` | Copywriting Agent regeneration | Does not override approved/rejected |
| `superseded` | any | — | Blocked by HRB_006 |
| `rejected` | `approved` | — | Blocked by HRB_007 (no reopen in v1) |
| `rejected` | `selected` | — | Blocked by HRB_007 |
| `approved` | `selected` | — | Illogical; blocked |

### 10.3 Deselect Behavior

When a reviewer selects version V-B and version V-A is already `selected`:
1. V-A status → `pending` (silent reversion)
2. V-B status → `selected`
3. Two audit events recorded: `HRB_ACTION_DESELECTED` for V-A, `HRB_ACTION_SELECTED` for V-B

Both updates should succeed atomically or roll back. If the repo does not support transactions, deselect V-A first, then select V-B, catching and reversing on failure.

### 10.4 Regeneration and Status Preservation

When `requestVersionRegenerationAction` is called:
- Copywriting Agent's `generateMessageVersionsAction(strategyId, leadId, workspaceSlug, forceRegenerate: true)` supersedes `pending` versions
- `selected`, `approved`, `rejected` versions are **not** superseded
- The bridge does not directly supersede any version; it delegates entirely to the Copywriting Agent

---

## 11. Approval Eligibility Rules

**File:** `modules/messaging/human-review/human-review.validation.ts`

`validateApprovalEligibility` checks conditions in this order and returns the first failure.

| # | Condition | HRB Code | Resolution |
|---|-----------|----------|-----------|
| 1 | Version record not found | HRB_001 | Verify version_id; refresh page |
| 2 | Tenant ID mismatch between version/strategy and request | HRB_002 | Authentication issue |
| 3 | Strategy record not found | HRB_003 | Verify strategy_id |
| 4 | Strategy `status` is `superseded` | HRB_004 | Generate new strategy |
| 5 | Strategy has blocking `invalid_reasons` | HRB_005 | Fix strategy |
| 6 | Version `approval_status` is `superseded` | HRB_006 | Select a current version |
| 7 | Version `approval_status` is `rejected` | HRB_007 | Cannot reopen in v1; regenerate |
| 8 | Version `approval_status` is `approved` | HRB_008 | Already approved |
| 9 | No non-superseded `quality_review` exists | HRB_009 | Run Quality Review first |
| 10 | Critical risk flag present in quality review | HRB_010 | Cannot override; regenerate |
| 11 | High-severity flags present, `riskAcknowledged` not `true` | HRB_011 | Confirm acknowledgement |
| 12 | `subject_line` or `body_text` is empty | HRB_012 | Version is incomplete |
| 13 | `body_html` is non-null | HRB_013 | v1 invariant violation |
| 14 | User lacks `messaging.versions.approve` permission | HRB_014 | Request permission |
| 15 | `global_agent_pause` is `true` | HRB_015 | Check System Controls |
| 16 | `composite_score < 70` and `overrideReason` is null/empty | HRB_016 | Provide override reason |
| 17 | No active strategy exists for this lead | HRB_017 | Generate strategy first |
| 18 | Another non-superseded version under same strategy has `approval_status = approved` | HRB_018 | One approval per strategy in v1 |

All conditions must pass for `allowed: true`. The function returns on the first failure.

---

## 12. Risk Acknowledgement and Override Flow

### 12.1 Critical Risk (HRB_010)

- Any `risk_flag` with `severity === 'critical'` unconditionally blocks approval
- No override path in v1
- UI renders a red banner on the version card: "Approval blocked — critical risk flag present"
- Approve button is disabled with tooltip
- Reject and Regenerate remain available

### 12.2 High Risk Acknowledgement

**When:** One or more `risk_flags` have `severity === 'high'` and no critical flags

**UX flow:**
1. Reviewer clicks "Approve for Next Step"
2. If high risk flags present → open `RiskAcknowledgementModal`
3. Modal lists high-severity flag codes and messages
4. Reviewer must check: "I acknowledge the risk flags and approve this version"
5. On confirm: call `acknowledgeRiskAndApproveAction` with `riskAcknowledged: true`
6. On cancel: no change to version state

**Service behavior:** If `riskAcknowledged !== true` and high flags exist → return `HRB_011`

**Audit recording:** `risk_acknowledged: true` stored in approve event metadata

### 12.3 Low-Score Override (HRB_016)

**When:** `composite_score < 70` and no critical flags

**UX flow:**
1. Reviewer clicks "Approve for Next Step"
2. UI detects low score → open `OverrideReasonModal`
3. Modal shows: "This version scores [X/100], below the recommended threshold of 70."
4. Requires text input: "Reason for approving below threshold"
5. On confirm with non-empty reason: call `approveMessageVersionForNextStepAction` with `overrideReason`
6. On cancel or empty reason: no action

**Service behavior:** If `composite_score < 70` and `overrideReason` is null/empty → return `HRB_016`

**Audit recording:** `override_reason` stored in approve event metadata

### 12.4 Combined: Low Score + High Risk

Both conditions may apply simultaneously (score < 70 AND high risk flags).

**UX flow:**
1. Click approve → low-score modal appears first (collect override reason)
2. On confirm → high-risk acknowledgement modal appears second
3. On both confirmed → call action with both `overrideReason` and `riskAcknowledged: true`

Alternatively, one combined modal may display both requirements. The Implementation Plan authorizes either approach; the coding agent should choose the simpler UX.

### 12.5 Non-Recommended Selection/Approval

- Selecting a non-recommended version: allowed without restriction. UI optionally surfaces an informational note.
- Approving a non-recommended version: allowed if all gates pass. Non-recommended status alone is not a gate condition.
- Optional `selectReason` may be recorded in the select event payload if provided.

---

## 13. Audit Event Design

### 13.1 ActivityEventType Additions

The following constants are added to `modules/intelligence/types.agent.ts` in the `ACTIVITY_EVENT_TYPES` (or equivalent) as const object.

**Additive only.** No existing entries renamed, removed, or modified.

```
// Phase 3B — Human Review / Approval Bridge (additive)
HRB_ACTION_SELECTED:               'hrb_action_selected',
HRB_ACTION_DESELECTED:             'hrb_action_deselected',
HRB_ACTION_REJECTED:               'hrb_action_rejected',
HRB_ACTION_APPROVED:               'hrb_action_approved',
HRB_ACTION_REGENERATION_REQUESTED: 'hrb_action_regeneration_requested',
HRB_ACTION_RETURNED_TO_STRATEGY:   'hrb_action_returned_to_strategy',
```

These values are the `event_type` field written to `activity_events`.

### 13.2 Payload Requirements Per Event

See Section 5.3 for the complete payload structure per action. Implementation must store all required fields in `activity_events.metadata` (jsonb). The payload must not include PII or sensitive business content beyond identifiers and status codes.

### 13.3 Event Summary Field

`event_summary` should be a human-readable, non-sensitive summary for display in the Agent Monitor. Examples:
- "Reviewer approved version B for cold_outreach"
- "Reviewer rejected version A (reason: weak_cta)"
- "Reviewer selected version C"

---

## 14. UI / Message Workspace Integration

**File:** `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx`

### 14.1 New Imports

```
import {
  selectMessageVersionForReviewAction,
  rejectMessageVersionForReviewAction,
  approveMessageVersionForNextStepAction,
  acknowledgeRiskAndApproveAction,
  requestVersionRegenerationAction,
} from '@/modules/messaging/actions/human-review.actions'
```

Note: The UI should no longer call `selectMessageVersionAction` or `rejectMessageVersionAction` from `copywriting-agent.actions` for human review flows. The new bridge actions are the correct entry points.

### 14.2 New UI State

```
// Per-panel state additions
isApprovingVersionId:     string | null     // which version is being approved
isRejecting:              boolean
showRejectModal:          boolean
showOverrideModal:        boolean
showRiskAckModal:         boolean
activeVersionForModal:    string | null
approveError:             string | null
```

### 14.3 Status Indicator per Version Card

Each version card header adds a status badge alongside the existing approval badge. The visual treatment per status:

| Status | Card Treatment |
|--------|---------------|
| `pending` | Default border; no special badge |
| `selected` | Left green accent bar; "Selected" green badge |
| `rejected` | Muted/dimmed; red tint border; "Rejected" badge; rejection reason shown below |
| `approved` | Bold blue border; "Approved" badge; reviewer identity + timestamp shown |
| `superseded` | Grayed-out; "Superseded" badge; no action buttons |

### 14.4 Critical Risk Banner

When version has a risk flag with `severity === 'critical'`:
- Red banner above the action buttons: "⚠ Approval blocked — critical risk flag present"
- Approve button: disabled, tooltip "Resolve critical risk flag before approving"
- Reject and Regeneration: remain enabled

### 14.5 Approve Button Behavior

Add "Approve for Next Step" button to each version card for `pending` and `selected` versions.

```
onClick behavior:
  1. Check eligibility (client-side or server-side)
  2. If critical risk → show block banner, do not open modal
  3. If low score (composite_score < 70, no critical risk) → open OverrideReasonModal
  4. Else if high risk → open RiskAcknowledgementModal
  5. Else → call approveMessageVersionForNextStepAction directly
```

### 14.6 Inline Modal Components

Three modal components defined inline in `GeneratedVersionsPanel.tsx` (no separate files in v1):

**`RejectModal`**
- Dropdown: rejection reason (12 options)
- Text area (optional unless `other` selected): reviewer note
- Confirm / Cancel buttons
- On confirm: call `rejectMessageVersionForReviewAction`

**`OverrideReasonModal`**
- Warning text: "This version scores [X]/100, below the recommended threshold of 70."
- Text input: "Reason for approving below threshold" (required)
- Confirm / Cancel
- On confirm with non-empty reason: proceed to risk ack check or approve directly

**`RiskAcknowledgementModal`**
- List: high-severity risk flags (code + message)
- Checkbox: "I acknowledge the risk flags and approve this version" (required)
- Confirm / Cancel
- On confirm with checkbox checked: call `acknowledgeRiskAndApproveAction`

### 14.7 Action Buttons Per Status

| Status | Buttons |
|--------|---------|
| `pending` | Select, Reject, Approve for Next Step |
| `selected` | Reject, Approve for Next Step (selecting another version deselects this one) |
| `rejected` | View rejection reason only |
| `approved` | "Approved" indicator; reviewer identity + timestamp; no action buttons |
| `superseded` | View only |

**"Approve & Send" button:** Remains disabled with tooltip "Sending coming in a future phase." This button is NOT repurposed for the bridge approve action — a separate "Approve for Next Step" button is added.

### 14.8 All-Versions-Rejected State

If all non-superseded versions have `approval_status = rejected`:
- Below the version cards, show: "All versions have been rejected."
- Two buttons: "Request Regeneration" | "Return to Strategy"

### 14.9 Approved Version Display

When a version is `approved`:
- "Approved" badge on card header
- `reviewed_by` identity and `reviewed_at` timestamp shown below the badge
- No approve/select/reject buttons (view-only)
- "Next step: Send / Email Draft Bridge (coming in a future phase)" informational note

---

## 15. Integration With Message Strategy Agent

The bridge reads `message_strategy` to validate context and gate conditions. It does not modify the strategy.

### Gate conditions derived from strategy:

| Strategy Field | Gate Usage |
|---------------|-----------|
| `status` | Must be `draft`, `approved`, or `in_use` — else HRB_004 / HRB_017 |
| `invalid_reasons` | Must be empty or non-blocking — else HRB_005 |
| `tenant_id` | Must match request context — else HRB_002 |

### The bridge must not:
- Call `messageStrategyService.generateStrategy()`
- Modify any `message_strategy` field
- Override `confidence_score`, `confidence_band`, `requires_human_review`, or `message_type`

---

## 16. Integration With Copywriting Agent

The bridge reads `message_version` records (created by the Copywriting Agent) and updates their review-related fields only.

### Fields the bridge writes:
- `approval_status`
- `reviewed_by`
- `reviewed_at`
- `rejection_reason`

### Fields the bridge never writes:
- `subject_line`, `body_text`, `preview_text`, `body_html`
- `final_subject_line`, `final_body_text`
- `user_edited`, `user_edit_summary`
- `differentiation_profile`, `compliance_passed`, `structural_passed`

### Regeneration:
When the reviewer requests regeneration, the bridge calls `generateMessageVersionsAction` (from `copywriting-agent.actions.ts`) with `forceRegenerate: true`. This delegates all copy generation logic to the Copywriting Agent. The bridge does not contain any generation code.

### Interaction with existing select/reject:
The existing `selectMessageVersionAction` and `rejectMessageVersionAction` in `copywriting-agent.actions.ts` perform simple status updates without audit event recording. The bridge UI should import from `human-review.actions.ts` instead. The old actions may remain in the codebase for backward compatibility but should not be used in the bridge UI flow.

---

## 17. Integration With Quality Review Agent

The bridge reads `quality_reviews` for display and gating. It does not modify quality review records.

### Fields used for gating:

| Field | Gate Condition |
|-------|---------------|
| `composite_score` | < 70 requires `overrideReason` (HRB_016) |
| `risk_flags[].severity` | `critical` → HRB_010; `high` → HRB_011 if not acknowledged |
| `superseded_at` | Non-null → stale; excluded from gating (HRB_009 if all stale) |

### Fields used for display only:
`score_band`, `rank_position`, `is_recommended`, all dimension scores, `strengths`, `weaknesses`, `human_review_notes`, `recommended_edits`, `comparison_summary`

### The bridge must not:
- Modify `composite_score`, `score_band`, `rank_position`, or `is_recommended`
- Delete or supersede `quality_review` records
- Call `runQualityReviewAction` as part of approval flow
- Treat `is_recommended = true` as an approval

---

## 18. Integration With Existing Phase 3A Approval / Draft Workflow

### Decision: Option A — Bridge stops at `approved` message_version

**Confirmed:** The bridge marks a `message_version` as `approved` and stops. No `email_draft` is created. No `approval_request` is created. No Phase 3A approval/send workflow is triggered.

**Why:**
- Maintains the no-auto-send guarantee across all Phase 3B v1 work
- Keeps Phase 3A and Phase 3B cleanly separated (Phase 3A does not need to understand QRA or message_versions)
- The `approved` state is a well-defined handoff point with a clear, audited schema
- Allows the Learning Agent to later observe approval → send latency as a signal
- Sending remains gated behind a separate, explicitly-scoped Send / Email Draft Bridge

**Future handoff:**
When the Send / Email Draft Bridge is designed and implemented, it will:
1. Query `message_versions` with `approval_status = 'approved'` for a given strategy/lead
2. Optionally create `email_draft` or call the Phase 3A send workflow
3. That bridge will be a separate Phase 3B component with its own design and implementation plan

The current bridge should not anticipate, pre-wire, or leave hooks for the Send Bridge. Its output — `approved` status + audit event — is the complete, self-contained handoff artifact.

---

## 19. Invalid Condition Model

Error code family: `HRB_001` through `HRB_018`

Defined in `human-review.types.ts` as `HRB_ERROR_CODES` (as const). Used by validation functions to return typed errors.

| Code | Action Blocked | Condition | Suggested Fix |
|------|---------------|-----------|---------------|
| HRB_001 | Any | Version record not found in DB | Verify version_id; refresh page |
| HRB_002 | Any | Tenant ID mismatch between request context and version/strategy | Authentication/data issue |
| HRB_003 | Any | Strategy record not found | Verify strategy_id; refresh page |
| HRB_004 | Approve, Select | Strategy `status` is `superseded` | Return to strategy list; generate new strategy |
| HRB_005 | Approve | Strategy has blocking `invalid_reasons` | Fix strategy via Message Strategy Agent |
| HRB_006 | Select, Approve | Version `approval_status` is `superseded` | Version no longer available; select a current version |
| HRB_007 | Select, Approve | Version `approval_status` is `rejected` | Cannot reopen in v1; request regeneration |
| HRB_008 | Approve | Version `approval_status` is already `approved` | Version already approved |
| HRB_009 | Approve | No non-superseded `quality_review` exists for this version | Run Quality Review first |
| HRB_010 | Approve | Critical risk flag present — `severity === 'critical'` | No override path in v1; regenerate or reject |
| HRB_011 | Approve | High-severity risk flags present without `riskAcknowledged = true` | Confirm acknowledgement in the approval modal |
| HRB_012 | Approve | `body_text` or `subject_line` is empty | Version is incomplete; regenerate |
| HRB_013 | Approve | `body_html` is non-null | v1 invariant violation; contact support |
| HRB_014 | Any | User lacks required permission (`messaging.versions.approve` or `messaging.versions.review`) | Request permission from workspace admin |
| HRB_015 | Approve, Generate | `global_agent_pause` is `true` | Unpause agents in System Controls |
| HRB_016 | Approve | `composite_score < 70` and `overrideReason` is null/empty | Provide an override reason in the approval modal |
| HRB_017 | Approve, Select | No active strategy (`draft`/`approved`/`in_use`) exists for this lead | Generate a strategy first |
| HRB_018 | Approve | Another non-superseded `message_version` under the same strategy already has `approval_status = approved` | One approved version per strategy in v1; no replacement workflow |

---

## 20. Test Fixture Plan

### 20.1 Fixture Location

`tests/fixtures/human-review-bridge/TC-HRB-001.json` through `TC-HRB-035.json`

### 20.2 Fixture Schema

Each fixture is a JSON file with this structure:

```json
{
  "meta": {
    "test_case_id": "TC-HRB-001",
    "scenario_name": "select_pending_version",
    "description": "Reviewer selects a pending version — should set approval_status to selected"
  },
  "input": {
    "action": "select",
    "version": {
      "id": "uuid-v1",
      "tenant_id": "uuid-tenant",
      "strategy_id": "uuid-s1",
      "version_label": "A",
      "subject_line": "Subject line text",
      "body_text": "Body text content here",
      "body_html": null,
      "approval_status": "pending",
      "reviewed_by": null,
      "reviewed_at": null,
      "rejection_reason": null
    },
    "strategy": {
      "id": "uuid-s1",
      "tenant_id": "uuid-tenant",
      "lead_id": "uuid-lead",
      "message_type": "cold_outreach",
      "status": "approved",
      "invalid_reasons": [],
      "requires_human_review": false
    },
    "quality_review": {
      "id": "uuid-qr1",
      "version_id": "uuid-v1",
      "tenant_id": "uuid-tenant",
      "composite_score": 82,
      "score_band": "strong",
      "is_recommended": true,
      "risk_flags": [],
      "superseded_at": null
    },
    "other_versions": [],
    "user": {
      "user_id": "uuid-user",
      "tenant_id": "uuid-tenant"
    },
    "system_controls": {
      "global_agent_pause": false
    },
    "options": {}
  },
  "expected": {
    "success": true,
    "new_approval_status": "selected",
    "reviewed_by_set": true,
    "reviewed_at_set": true,
    "error_code": null,
    "activity_event_type": "hrb_action_selected",
    "no_email_draft_created": true,
    "no_approval_request_created": true,
    "no_send_triggered": true,
    "notes": "Basic select: pending → selected"
  }
}
```

### 20.3 Fixture Coverage by Test Case

| Fixture | Action | Key Scenario |
|---------|--------|-------------|
| TC-HRB-001 | select | Pending → selected, score 82, no risk flags |
| TC-HRB-002 | select | New select deselects prior selected (V-A → pending, V-B → selected) |
| TC-HRB-003 | reject | Pending → rejected, reason: weak_cta |
| TC-HRB-004 | reject | Selected → rejected |
| TC-HRB-005 | select | Superseded version → HRB_006 |
| TC-HRB-006 | approve | Superseded version → HRB_006 |
| TC-HRB-007 | approve | Rejected version → HRB_007 |
| TC-HRB-008 | approve | Selected version, score 85, no risk → approved |
| TC-HRB-009 | approve | Pending version (never selected), score 75 → approved directly |
| TC-HRB-010 | approve | Critical risk flag → HRB_010 |
| TC-HRB-011 | approve | High risk, riskAcknowledged = false → HRB_011; retry true → approved |
| TC-HRB-012 | approve | Medium risk, no acknowledgement required → approved |
| TC-HRB-013 | approve | Score 62, overrideReason provided → approved |
| TC-HRB-014 | approve | Score 62, no overrideReason → HRB_016 |
| TC-HRB-015 | approve | No QRA record → HRB_009 |
| TC-HRB-016 | select | Recommended version selected → selected |
| TC-HRB-017 | select | Non-recommended selected, optional reason → selected |
| TC-HRB-018 | approve | Non-recommended, score 72, approved with reason → approved |
| TC-HRB-019 | approve | After approval: no email_draft in DB |
| TC-HRB-020 | approve | After approval: no approval_request in DB |
| TC-HRB-021 | approve | After approval: no send event emitted |
| TC-HRB-022 | approve | reviewed_by and reviewed_at set on approval |
| TC-HRB-023 | reject | rejection_reason set to 'wrong_tone' |
| TC-HRB-024 | approve | Activity event with correct payload recorded |
| TC-HRB-025 | reject | Activity event with rejection_reason recorded |
| TC-HRB-026 | regenerate | Approved/rejected preserved; pending superseded |
| TC-HRB-027 | approve | Strategy has blocking invalid_reasons → HRB_005 |
| TC-HRB-028 | approve | Tenant mismatch → HRB_002 |
| TC-HRB-029 | approve | User missing permission → HRB_014 |
| TC-HRB-030 | approve | body_html non-null → HRB_013 |
| TC-HRB-031 | approve | Second approve under same strategy → HRB_018 |
| TC-HRB-032 | approve | Superseded QRA ignored; active QRA used for gating → approved |
| TC-HRB-033 | load | Version in selected state persists after reload |
| TC-HRB-034 | load | Approved version renders approved badge + reviewer info |
| TC-HRB-035 | load | Critical risk renders block indicator in UI |

### 20.4 Test Suite Structure

`tests/human-review-bridge.test.ts`:

```
Human Review Bridge Tests
  ├── Validation — validateApprovalEligibility
  │     ├── All HRB gate conditions (HRB_001–HRB_018) — one test per condition
  │     └── Happy path: all conditions met → allowed: true
  ├── Validation — validateSelectEligibility
  │     ├── Blocked conditions (superseded, rejected, approved)
  │     └── Happy path: pending → allowed
  ├── Validation — validateRejectEligibility
  │     ├── Blocked conditions
  │     └── Happy path
  ├── State Machine — hasCriticalRiskFlag
  │     ├── Empty risk flags → false
  │     ├── Low/medium/high flags only → false
  │     └── Critical flag present → true
  ├── State Machine — hasHighRiskFlag
  │     ├── No high flags → false
  │     └── High flag present → true
  ├── Fixture-based integration tests (35 test cases)
  │     └── For each TC-HRB-001 through TC-HRB-035:
  │           Load fixture → run validation/service → assert expected outcome
  └── Audit event builders
        ├── buildApproveEventPayload — required fields present
        ├── buildRejectEventPayload — required fields present
        └── buildSelectEventPayload — required fields present
```

**Expected total tests after implementation:** ≥ 302 (267 existing + ≥ 35 HRB tests)

---

## 21. QA Checklist

Before marking implementation complete, verify all of the following:

### Service and Logic

- [ ] `human-review.types.ts` created with all error codes, action types, rejection reasons, interfaces
- [ ] `human-review.validation.ts` pure functions pass all gate condition tests
- [ ] `human-review.service.ts` implements all 10 service functions
- [ ] `human-review.audit.ts` pure event builder functions implemented
- [ ] `human-review.repo.ts` created (at minimum `listHumanReviewActivityForVersion`)
- [ ] `message-version.repo.ts` extended with all 7 new functions
- [ ] `modules/intelligence/types.agent.ts` extended with 6 HRB event types (additive, no regressions)

### Server Actions

- [ ] `human-review.actions.ts` created with all 6 server actions
- [ ] Each action calls service, revalidates path, returns typed result
- [ ] No send, no email_draft, no approval_request in any action

### Gate Conditions

- [ ] HRB_001 through HRB_018 all enforced in `validateApprovalEligibility`
- [ ] HRB_018 blocks second approval under same strategy
- [ ] HRB_010 (critical risk) blocks with no override path
- [ ] HRB_011 (high risk) requires `riskAcknowledged = true`
- [ ] HRB_016 (low score) requires non-empty `overrideReason`

### State Transitions

- [ ] pending → selected works and deselects prior selected version
- [ ] pending → rejected works with reason
- [ ] pending → approved works with all gate conditions met
- [ ] selected → approved works
- [ ] selected → rejected works
- [ ] superseded → any returns HRB_006
- [ ] rejected → approved returns HRB_007

### UI

- [ ] GeneratedVersionsPanel imports from `human-review.actions.ts`
- [ ] "Approve for Next Step" button added per version card
- [ ] `RejectModal` with 12 rejection reason options
- [ ] `OverrideReasonModal` for low-score scenarios
- [ ] `RiskAcknowledgementModal` for high-risk scenarios
- [ ] Critical risk banner renders and disables Approve button
- [ ] Selected badge renders on selected versions
- [ ] Approved badge renders with reviewer identity + timestamp
- [ ] Rejected versions show reason and are view-only
- [ ] Superseded versions are view-only
- [ ] All-versions-rejected state shows regeneration prompt
- [ ] "Approve & Send" button remains disabled (future bridge)

### Audit Events

- [ ] `HRB_ACTION_SELECTED` recorded on select
- [ ] `HRB_ACTION_DESELECTED` recorded when prior selected version is reverted
- [ ] `HRB_ACTION_REJECTED` recorded on reject with reason in metadata
- [ ] `HRB_ACTION_APPROVED` recorded on approve with full context snapshot
- [ ] `HRB_ACTION_REGENERATION_REQUESTED` recorded on regeneration

### Test Suite

- [ ] 35 fixtures created (TC-HRB-001 through TC-HRB-035)
- [ ] `human-review-bridge.test.ts` created
- [ ] `npx vitest run` → PASSED, ≥ 302 tests
- [ ] Existing 267 tests still pass (no regressions)
- [ ] `npx next build` → PASSED
- [ ] TypeScript → PASSED
- [ ] `npx eslint` on modified UI files → 0 errors, 0 warnings

### Scope Compliance

- [ ] No email_draft created anywhere in the implementation
- [ ] No approval_request created anywhere in the implementation
- [ ] No send behavior anywhere in the implementation
- [ ] No QRA scores/ranks modified
- [ ] No message_strategy fields modified
- [ ] No message_version body/subject fields modified
- [ ] No external LLM calls
- [ ] Phase 3A services not modified

---

## 22. Implementation Sequence

Execute steps in this exact order. Do not proceed to the next step before the current step is verified.

1. **Inspection** — Read `message-version.repo.ts`, `copywriting-agent.actions.ts`, `GeneratedVersionsPanel.tsx`, `modules/intelligence/types.agent.ts`. Understand current state of all files to be modified. Do not write any code yet.

2. **`human-review.types.ts`** — Create. Define `HRB_ERROR_CODES`, `HRB_ACTION_TYPES`, `REJECTION_REASONS` as const objects. Define all interfaces: `HumanReviewVersion`, `HumanReviewStrategy`, `HumanReviewQualityReview`, `HumanReviewer`, `HumanReviewSystemControls`, `ApprovalEligibilityResult`, `HumanReviewResult`, `HumanReviewEventPayload`, `SelectVersionInput`, `RejectVersionInput`, `ApproveVersionInput`, `RegenerationRequestInput`.

3. **`human-review.validation.ts`** — Create. Pure functions only. Implement: `validateApprovalEligibility`, `validateSelectEligibility`, `validateRejectEligibility`, `hasCriticalRiskFlag`, `hasHighRiskFlag`, `isStrategyActive`. These functions must have no I/O.

4. **`human-review.audit.ts`** — Create. Pure event payload builders. Implement all 6 `build*EventPayload` functions. No I/O.

5. **Extend `message-version.repo.ts`** — Add the 7 new repo functions listed in Section 8. Do not modify existing functions.

6. **`human-review.repo.ts`** — Create. Implement `listHumanReviewActivityForVersion` and `listHumanReviewActivityForStrategy` using the activity_events table. Create only if needed for service or UI; otherwise note as deferred.

7. **`human-review.service.ts`** — Create. Implement all 10 service functions. Import from validation, audit, repos, and the existing `activityEventService`. Ensure no send, no draft, no approval_request in any code path.

8. **Extend `modules/intelligence/types.agent.ts`** — Add 6 `HRB_ACTION_*` event type constants to the existing `ACTIVITY_EVENT_TYPES` object. Additive only.

9. **`human-review.actions.ts`** — Create. Implement all 6 server actions. Each: builds context, checks permission, calls service, revalidates path.

10. **Create 35 test fixtures** — `tests/fixtures/human-review-bridge/TC-HRB-001.json` through `TC-HRB-035.json`. Follow fixture schema from Section 20. Cover all test cases from the design document.

11. **`tests/human-review-bridge.test.ts`** — Create. Implement validation unit tests, state machine tests, audit builder tests, and fixture-based integration tests. Target ≥ 35 tests.

12. **Extend `GeneratedVersionsPanel.tsx`** — Implement full bridge UI: import bridge actions, add status indicators, add "Approve for Next Step" button, implement three inline modals (`RejectModal`, `OverrideReasonModal`, `RiskAcknowledgementModal`), add critical risk banner, add approved/selected/rejected visual states, add all-rejected prompt.

13. **QA pass** — Run `npx vitest run`. Must show ≥ 302 tests passing with 0 failures. Run `npx next build`. Run `npx eslint` on modified UI files. Fix any failures before proceeding.

14. **Guardrail correction pass** — Verify: no email_draft anywhere, no approval_request anywhere, no send behavior anywhere, no QRA modification, no strategy modification, no body/subject writes, no external LLM calls.

15. **Implementation summary** — Report: all files created, test count, build status, lint status, deviations from plan (if any). Stop. Do not proceed to Send / Email Draft Bridge.

---

## 23. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Approval action mistaken for sending | Medium | High | Service explicitly asserts no send; QA checklist includes no-send verification; "Approve & Send" button remains disabled |
| Critical risk accidentally approvable | Low | High | `hasCriticalRiskFlag` check is first gate before any override logic; HRB_010 has no override path; unit tested |
| Two approved versions under one strategy | Medium | High | HRB_018 check in `validateApprovalEligibility`; `getApprovedVersionForStrategy` called before approve; unit tested in TC-HRB-031 |
| Rejected version accidentally reopened | Low | Medium | HRB_007 blocks all transitions from `rejected`; unit tested |
| Prior selected version not reverted | Medium | Low | `deselectOtherVersionsForStrategy` runs atomically before select; TC-HRB-002 validates |
| Activity events insufficient for future Learning Agent | Medium | Low | Comprehensive metadata payload defined; dedicated review event table deferred but conceptually designed |
| Permissions not mapped correctly | Medium | Medium | Permission strings defined in types; server actions check before calling service; TC-HRB-029 validates |
| Existing select/reject behavior regresses | Medium | Medium | Existing QRA tests (267) must still pass; old `selectMessageVersionAction` and `rejectMessageVersionAction` retained in codebase |
| Generated version content accidentally modified | Low | High | Bridge only writes `approval_status`, `reviewed_by`, `reviewed_at`, `rejection_reason`; types enforce this; QA checklist item |
| Superseded QRA review used for gating | Low | Medium | `validateApprovalEligibility` filters `quality_reviews` by `superseded_at IS NULL`; TC-HRB-032 validates |
| UI modal state leaks across version cards | Low | Low | Each modal tracks `activeVersionForModal` state; only one modal open at a time |

---

## 24. Final Acceptance Criteria

This implementation plan is complete and approvable when all of the following are confirmed:

| Criterion | Met? |
|-----------|------|
| Implementation scope defined (new files + modified files) | ✓ |
| Non-goals explicitly listed | ✓ |
| Module/file structure defined with per-file responsibility | ✓ |
| Data model decision confirmed (no new table; use activity_events) | ✓ |
| All type interfaces defined | ✓ |
| Service boundary defined with 10 functions, inputs, outputs, side effects | ✓ |
| Repository boundary defined with 7 additions to message-version.repo.ts | ✓ |
| All 6 server actions defined with permission, validation, service call, return shape | ✓ |
| State machine documented with all transitions and guards | ✓ |
| All 18 HRB gate conditions defined with error codes and resolutions | ✓ |
| Risk acknowledgement and override flows defined | ✓ |
| Audit event payloads defined per action type | ✓ |
| UI behavior defined per approval_status state | ✓ |
| All three modal components specified | ✓ |
| Integration decisions with all upstream agents confirmed | ✓ |
| Option A confirmed: bridge stops at approved, no email_draft | ✓ |
| 35 test fixtures planned with fixture schema defined | ✓ |
| QA checklist covering all scope items | ✓ |
| Implementation sequence defined (15 steps in order) | ✓ |
| Risks and mitigations identified | ✓ |
| No code written | ✓ |
| No SQL written | ✓ |
| No sending introduced | ✓ |
| No email_drafts introduced | ✓ |
| No approval_requests introduced | ✓ |

---

## 25. Recommended Next Step

Once this implementation plan is approved by the user:

**Phase 3B Human Review / Approval Bridge — Code Implementation**

The coding agent should follow the 15-step implementation sequence in Section 22 exactly. Key constraints to preserve throughout:

1. The bridge is a workflow/state-management layer — not an AI agent
2. No send behavior, no email_draft creation, no approval_request creation
3. HRB_018 must block all second approvals under the same strategy
4. Critical risk (HRB_010) must block approval with no override path in v1
5. Activity events (not a new table) are the audit mechanism in v1
6. The existing 267 tests must not regress
7. Stop before implementing the Send / Email Draft Bridge

After implementation:

- Run full QA: `npx vitest run` (≥ 302 tests) + `npx next build` + lint
- Produce implementation summary
- Commit, tag as `phase-3b-human-review-bridge-v1`
- Update `docs/ai-context/` files
- Plan Send / Email Draft Bridge design (separate document, separate phase)

---

*Document status: Draft. Awaiting user approval before code implementation begins.*
*Version: 1.0 — 2026-05-21*
