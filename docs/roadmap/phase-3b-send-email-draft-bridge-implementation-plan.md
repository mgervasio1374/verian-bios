# Phase 3B Send / Email Draft Bridge — Implementation Plan

**Status:** Draft — Awaiting user approval before code implementation begins.
**Version:** 1.0
**Date:** 2026-05-21
**Prerequisite:** Design & Test Cases v1.1 approved (`docs/roadmap/phase-3b-send-email-draft-bridge-design-test-cases.md`)

---

## 1. Executive Summary

This plan defines the engineering build for the Phase 3B Send / Email Draft Bridge — the thin translation layer that converts an HRB-approved `message_version` into a send-ready `email_draft` inside the existing Phase 3A email workflow.

**What this implementation builds:**
- A `send-bridge` service module with pure validation functions and orchestration
- A new read helper added to `email-draft.repo.ts` for duplicate detection
- A `send-bridge.actions.ts` server action layer
- Two new `ActivityEventType` constants in `modules/intelligence/types.agent.ts` (additive)
- Extended `GeneratedVersionsPanel.tsx` with "Create Email Draft" button, confirmation modal, and draft status indicator
- Extended `page.tsx` to load draft status per approved version
- 35 test fixtures and a new `send-bridge.test.ts` suite

**What this implementation does not build:**
- No sending — the bridge stops at `email_draft.status = 'approved'`; `sendApprovedDraftAction` remains the reviewer's explicit send step
- No new database tables or migrations
- No new AI agent, no LLM calls, no copy generation
- No changes to Phase 3A services, the HRB, or QRA

**Test count expectation:** 367 existing + ≥ 35 SEB = ≥ 402 total

---

## 2. Implementation Scope

### 2.1 New Files to Create

| File | Purpose |
|------|---------|
| `modules/messaging/send-bridge/send-bridge.types.ts` | SEB error codes, action types, all interfaces |
| `modules/messaging/send-bridge/send-bridge.validation.ts` | Pure gate-condition functions — 14 conditions |
| `modules/messaging/send-bridge/send-bridge.audit.ts` | Pure event payload builders for 2 SEB event types |
| `modules/messaging/send-bridge/send-bridge.service.ts` | Orchestration — `createEmailDraftFromApprovedVersion`, `getDraftStatusForVersion` |
| `modules/messaging/actions/send-bridge.actions.ts` | Server action: `createEmailDraftFromApprovedVersionAction` |
| `tests/fixtures/send-bridge/TC-SEB-001.json` → `TC-SEB-035.json` | 35 test fixtures |
| `tests/send-bridge.test.ts` | SEB test suite |

### 2.2 Existing Files to Modify

| File | Change |
|------|--------|
| `modules/messaging/repositories/email-draft.repo.ts` | Add `getEmailDraftForVersion` read helper (duplicate guard query) |
| `modules/intelligence/types.agent.ts` | Add 2 SEB `ActivityEventType` constants (additive only) |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx` | Add "Create Email Draft" button, confirmation modal, draft status indicator for approved versions |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx` | Wire draft status data loading for approved versions on page render |

### 2.3 Files Explicitly Not Modified

- Any Phase 3A service or repository (consumed, never altered)
- `modules/messaging/services/email-send.service.ts` — locked; bridge never calls Resend
- `modules/messaging/services/email-draft.service.ts` — called as-is; not modified
- `modules/workflow/repositories/approval.repo.ts` — called as-is; not modified
- `modules/messaging/human-review/` — HRB is locked; send bridge does not alter HRB logic
- `modules/messaging/quality-review/` — QRA is locked; read-only from bridge
- `supabase/migrations/` — no new migrations in v1

---

## 3. Non-Goals

| Non-Goal | Reason |
|----------|--------|
| Call Resend API | Bridge never sends; sending is `sendApprovedDraftAction` triggered by reviewer |
| Insert `email_sends` records | Created only by Phase 3A send flow, not by the bridge |
| Generate `body_html` | Always null in Phase 3B v1; bridge sets it to null |
| Require a second manual approval step | HRB approval is the human gate; the `approval_request` is auto-resolved |
| Create a new DB table or migration | All provenance stored in existing `ai_generation_metadata` jsonb column |
| Build the Learning Agent | Future work |
| Trigger Event Tracking | Future work |
| Modify HRB approval logic | HRB is locked |
| Modify QRA scoring | QRA is locked |
| Rewrite or edit `body_text` / `subject_line` | Version content is immutable |
| Create `email_draft_versions` initial row | Not created in v1 (see Section 4, Decision 3) |

---

## 4. Final v1 Decisions

All open questions from the design document (Section 22) are resolved here.

| # | Question | v1 Decision |
|---|---------|------------|
| 1 | Draft status + approval_request requirement | **RESOLVED in design v1.1.** Bridge creates `pending_approval` draft → creates `pending` approval_request → auto-resolves both to `approved`. Draft is immediately sendable via `sendApprovedDraftAction`. No second manual approval step. |
| 2 | Superseded strategy behavior | **BLOCK (SEB_008).** If `message_strategy.status = 'superseded'` at the time "Create Email Draft" is clicked, draft creation is blocked. The email context may be stale. Rationale: copy was approved in a specific strategic context; if that context has changed, the reviewer should consciously confirm before drafting. |
| 3 | `email_draft_versions` initial row | **Do NOT create.** The `email_draft_versions` table is populated on first edit, not on creation. Consistent with Phase 3A's `createLeadEmailDraft` which also does not create an initial version row. Keeps the bridge footprint minimal. |
| 4 | `message_version_id` FK migration | **Defer to future phase.** Application-level guard via jsonb is sufficient for v1. A migration adding `message_version_id uuid REFERENCES message_versions(id)` with a partial unique index is flagged for Phase 3B v2 / Learning Agent phase. |
| 5 | UI placement | **Inside `GeneratedVersionsPanel.tsx`.** Keeps the full workflow (generate → review → QRA → approve → draft → send) in one cohesive panel. The "Create Email Draft" button replaces the existing disabled "Approve & Send" placeholder on approved version cards. |
| 6 | `email_sending_enabled` system control | **Warning only; does not block draft creation.** The bridge creates the draft regardless of sending system controls — the draft is created, not sent. The reviewer will see a warning if sending is disabled, but the draft is still created so the reviewer can prepare it in advance. |

---

## 5. Proposed Module/File Structure

```
modules/
  messaging/
    send-bridge/
      send-bridge.types.ts          — SEB_ERROR_CODES, SEB_ACTION_TYPES, all interfaces
      send-bridge.validation.ts     — pure validation: validateDraftCreationEligibility (14 gates)
      send-bridge.audit.ts          — pure event builders: draft_created, draft_creation_blocked
      send-bridge.service.ts        — orchestration: createEmailDraftFromApprovedVersion,
                                      getDraftStatusForVersion

    repositories/
      email-draft.repo.ts           — extend: add getEmailDraftForVersion (read helper)

    actions/
      send-bridge.actions.ts        — server action: createEmailDraftFromApprovedVersionAction

modules/
  intelligence/
    types.agent.ts                  — extend: add 2 SEB ActivityEventType constants

app/
  (workspace)/
    [workspaceSlug]/
      message-workspace/
        [leadId]/
          GeneratedVersionsPanel.tsx — extend: Create Email Draft button, confirmation modal,
                                       draft status indicator
          page.tsx                  — extend: load draft status per approved version

tests/
  fixtures/
    send-bridge/
      TC-SEB-001.json through TC-SEB-035.json

  send-bridge.test.ts
```

### 5.1 Responsibility of Each New File

**`send-bridge.types.ts`**
All types and constants using `as const` — no TypeScript `enum` keyword.
- `SEB_ERROR_CODES` — SEB_001 through SEB_014
- `SEB_ACTION_TYPES` — 2 event type constants
- `VALID_SEB_ERROR_CODES` — Set for runtime validation
- Interfaces: `SendBridgeVersion`, `SendBridgeStrategy`, `SendBridgeQualityReview`, `SendBridgeLead`, `SendBridgeContact`, `SendBridgeSenderIdentity`, `DraftCreationEligibilityResult`, `SendBridgeResult`, `CreateDraftInput`, `DraftStatusResult`, `SebEventPayload`

**`send-bridge.validation.ts`**
Pure functions only — no I/O, no async.
- `validateDraftCreationEligibility(version, strategy, qualityReview, lead, contact, senderIdentity, existingDraft, hasPermission)` → `DraftCreationEligibilityResult`
- `hasDraftInProgress(existingDraft)` → `boolean`
- Helper extractors used by the service layer to check individual conditions

**`send-bridge.audit.ts`**
Pure event payload builders — no I/O.
- `buildDraftCreatedPayload(params)` → `SebEventPayload`
- `buildDraftCreationBlockedPayload(params)` → `SebEventPayload`

**`send-bridge.service.ts`**
Orchestration with I/O. Calls repos, Phase 3A services, and audit.
- `createEmailDraftFromApprovedVersion(input: CreateDraftInput)` → `Promise<SendBridgeResult>`
- `getDraftStatusForVersion(versionId, tenantId)` → `Promise<DraftStatusResult | null>`

**`send-bridge.actions.ts`**
Next.js server action. Builds context, checks permission, calls service, revalidates.
- `createEmailDraftFromApprovedVersionAction(versionId, strategyId, leadId, workspaceSlug)` → `Promise<{ success: boolean; draftId?: string; error?: string; errorCode?: string }>`

---

## 6. Data Model and Storage

### 6.1 No New Tables

The bridge uses:
- `email_drafts` — writes to existing columns only
- `approval_requests` — writes to existing schema only
- `activity_events` — writes using existing Phase 3A service

### 6.2 `ai_generation_metadata` Payload

Written to `email_drafts.ai_generation_metadata` (existing jsonb column):

```json
{
  "source":                "phase_3b_send_bridge",
  "message_version_id":    "<uuid>",
  "strategy_id":           "<uuid>",
  "quality_review_id":     "<uuid>",
  "version_label":         "A",
  "composite_score":        82,
  "score_band":            "strong",
  "is_recommended":         true,
  "approved_by":           "<user-uuid>",
  "approved_at":           "<ISO timestamp>",
  "override_reason":        null,
  "risk_flags_at_approval": [],
  "reason_created":        "phase_3b_hrb_approval",
  "generated_at":          "<ISO timestamp>"
}
```

`approved_by` and `approved_at` are read from the `message_version.reviewed_by` and `message_version.reviewed_at` fields set by the HRB approval action.

### 6.3 Duplicate Guard Query (Application-Level)

Added as `getEmailDraftForVersion` to `email-draft.repo.ts`:

```
SELECT id, status, created_at FROM email_drafts
WHERE tenant_id = $tenantId
  AND ai_generation_metadata->>'message_version_id' = $versionId
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 1
```

Returns the most recent draft for this version. The service checks if `status NOT IN ('superseded', 'rejected')` — if so, SEB_011 is returned.

**This is application-level only, not DB-enforced.** A concurrent submission race window exists. A future migration will add a `message_version_id` column with a partial unique index to enforce DB-level uniqueness.

### 6.4 `email_draft_versions` — Not Created

The bridge does not create an initial `email_draft_versions` row. If the reviewer edits the draft via the existing Phase 3A edit UI, the version row is created at that time. This is consistent with Phase 3A behavior.

---

## 7. Type Contracts and Interfaces

All defined in `send-bridge.types.ts`. All use `as const`, no `enum` keyword.

### 7.1 Error Codes

```
const SEB_ERROR_CODES = {
  VERSION_NOT_APPROVED:    'SEB_001',
  VERSION_REJECTED:        'SEB_002',
  VERSION_SUPERSEDED:      'SEB_003',
  CONTACT_NOT_LINKED:      'SEB_004',
  CONTACT_EMAIL_MISSING:   'SEB_005',
  CONTACT_DO_NOT_CONTACT:  'SEB_006',
  EMAIL_SUPPRESSED:        'SEB_007',
  STRATEGY_NOT_ACTIVE:     'SEB_008',
  VERSION_CONTENT_MISSING: 'SEB_009',
  BODY_HTML_POPULATED:     'SEB_010',
  DUPLICATE_DRAFT:         'SEB_011',
  SENDER_IDENTITY_MISSING: 'SEB_012',
  TENANT_MISMATCH:         'SEB_013',
  PERMISSION_DENIED:       'SEB_014',
} as const

type SebErrorCode = typeof SEB_ERROR_CODES[keyof typeof SEB_ERROR_CODES]
```

### 7.2 Action Types

```
const SEB_ACTION_TYPES = {
  SEB_ACTION_DRAFT_CREATED:          'SEB_ACTION_DRAFT_CREATED',
  SEB_ACTION_DRAFT_CREATION_BLOCKED: 'SEB_ACTION_DRAFT_CREATION_BLOCKED',
} as const

type SebActionType = typeof SEB_ACTION_TYPES[keyof typeof SEB_ACTION_TYPES]
```

### 7.3 Core Interfaces

```
// Minimal shape for bridge validation — loaded from DB
interface SendBridgeVersion {
  id:               string
  tenant_id:        string
  strategy_id:      string
  version_label:    string
  subject_line:     string | null
  body_text:        string | null
  body_html:        string | null
  approval_status:  string
  reviewed_by:      string | null
  reviewed_at:      string | null
}

interface SendBridgeStrategy {
  id:         string
  tenant_id:  string
  lead_id:    string
  message_type: string
  status:     string
}

interface SendBridgeQualityReview {
  id:               string
  composite_score:  number
  score_band:       string
  is_recommended:   boolean
  risk_flags:       Array<{ code: string; severity: string; message: string }>
}

interface SendBridgeLead {
  id:          string
  tenant_id:   string
  contact_id:  string | null
  company_id:  string | null
}

interface SendBridgeContact {
  id:              string
  email:           string | null
  first_name:      string | null
  last_name:       string | null
  do_not_contact:  boolean
}

interface SendBridgeSenderIdentity {
  id:    string
  name:  string
  email: string
}

// Draft lookup result (for duplicate guard)
interface ExistingDraftCheck {
  id:     string
  status: string
}

// Result of eligibility check (pure function output)
interface DraftCreationEligibilityResult {
  allowed:      boolean
  error:        SebErrorCode | null
  errorMessage: string | null
}

// Result from service/action layer
interface SendBridgeResult {
  ok:           boolean
  draftId?:     string
  error?:       SebErrorCode
  errorMessage?:string
}

// Input to createEmailDraftFromApprovedVersion
interface CreateDraftInput {
  versionId:    string
  strategyId:   string
  leadId:       string
  userId:       string
  tenantId:     string
  workspaceId:  string
}

// Result from getDraftStatusForVersion
interface DraftStatusResult {
  draftId: string
  status:  string   // 'approved' | 'sent' | 'pending_approval' | 'superseded' | 'rejected'
}

// Audit event payload written to activity_events.metadata
interface SebEventPayload {
  action_type:          SebActionType
  draft_id?:            string
  message_version_id:   string
  strategy_id:          string
  quality_review_id?:   string
  lead_id:              string
  contact_id?:          string
  user_id:              string
  superseded_draft_ids?:string[]
  error_code?:          SebErrorCode
  error_reason?:        string
  timestamp:            string
}
```

---

## 8. Service Boundary Design

**File:** `modules/messaging/send-bridge/send-bridge.service.ts`

### 8.1 `createEmailDraftFromApprovedVersion(input: CreateDraftInput): Promise<SendBridgeResult>`

**Purpose:** Execute the full draft creation flow including all 7 write steps.

**Validation phase (read-only — no writes):**
1. Load `message_version` by `versionId` + `tenantId` — check exists and `approval_status = 'approved'`, not superseded/rejected
2. Load `message_strategy` by `version.strategy_id` + `tenantId` — check active status
3. Load `quality_review` by `versionId` + `tenantId` — non-superseded; capture provenance
4. Load `lead` by `leadId` + `tenantId` — get `contact_id`, `company_id`; tenant check
5. Load `contact` by `lead.contact_id` + `tenantId` — get email, name, do_not_contact
6. Run safety checks: contact linked, email present, do_not_contact, suppression
7. Load `sender_identity` — must be non-null
8. Validate version content: `subject_line` non-empty, `body_text` non-empty, `body_html` null
9. Duplicate guard: call `emailDraftRepo.getEmailDraftForVersion`; if active non-rejected draft found → SEB_011

If any validation fails → call `activityEventService.recordActivity` with `SEB_ACTION_DRAFT_CREATION_BLOCKED` payload → return `{ ok: false, error: SebErrorCode }`

**Write phase (ordered for partial-failure safety):**
10. Build `ai_generation_metadata` payload from all loaded data
11. `emailDraftRepo.createEmailDraft(...)` → creates draft with `status = 'pending_approval'`
12. `approvalRepo.createApprovalRequest(...)` → creates approval_request with `status = 'pending'`, `request_type = 'email_draft_review'`, payload includes `draft_id` and HRB provenance
13. `emailDraftRepo.linkApprovalToEmailDraft(draftId, approvalRequestId)` → links approval_request_id
14. `approvalRepo.resolveApprovalRequest(approvalRequestId, tenantId, userId, 'approved', { hrb_version_id, ... })` → transitions to `approved`
15. `emailDraftService.syncApprovalDecisionToDraft(ctx, approval, 'approved')` → transitions draft to `approved`
16. `emailDraftRepo.supersedePendingDraftsForLead(tenantId, leadId)` → supersedes prior pending/pending_approval drafts (runs last)
17. `activityEventService.recordActivity(buildDraftCreatedPayload(...))` → emits audit event

**Side effects that must NOT happen:**
- No call to `sendApprovedDraftAction`
- No insertion into `email_sends`
- No call to Resend API

**Returns:** `{ ok: true, draftId }` or `{ ok: false, error: SebErrorCode, errorMessage }`

---

### 8.2 `getDraftStatusForVersion(versionId: string, tenantId: string): Promise<DraftStatusResult | null>`

**Purpose:** Query the current draft status for a given approved version. Used by the page loader to surface draft state in the UI.

**Behavior:**
- Calls `emailDraftRepo.getEmailDraftForVersion(versionId, tenantId)`
- Returns `{ draftId, status }` if found, `null` if no draft exists

**Side effects:** None (read-only).

---

## 9. Repository Boundary Design

### 9.1 Addition to `email-draft.repo.ts`

One new read function appended to the end of the existing file. No existing functions modified.

```
getEmailDraftForVersion(versionId: string, tenantId: string)
  → SELECT id, status FROM email_drafts
    WHERE tenant_id = tenantId
      AND ai_generation_metadata->>'message_version_id' = versionId
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  → Returns { id: string; status: string } | null
```

This query does not use an index on the jsonb field (no migration). For v1 with low volumes, sequential scan with jsonb filtering is acceptable. A future migration will add a proper column and index.

### 9.2 Phase 3A Repos Called Without Modification

| Repo / Service | Functions Called |
|----------------|-----------------|
| `emailDraftRepo` | `createEmailDraft`, `linkApprovalToEmailDraft`, `supersedePendingDraftsForLead`, `getDefaultSenderIdentity`, `getEmailDraftForVersion` (new read helper) |
| `emailDraftService` | `syncApprovalDecisionToDraft` |
| `approvalRepo` | `createApprovalRequest`, `resolveApprovalRequest` |
| `suppressionRepo` | `checkEmailSuppression` |
| `contactRepo` | `getContact` |
| `leadRepo` | `getLead` |
| `qrRepo` | `getLatestQualityReviewForVersion` or equivalent |
| `activityEventService` | `recordActivity` or equivalent |

No function signatures in any of these files are changed.

### 9.3 No New Repo File

The bridge does not require a dedicated `send-bridge.repo.ts`. All database interaction goes through existing Phase 3A repos (consumed without modification) and the one new read helper added to `email-draft.repo.ts`.

---

## 10. Server Action Design

**File:** `modules/messaging/actions/send-bridge.actions.ts`

```
'use server'

createEmailDraftFromApprovedVersionAction(
  versionId:     string,
  strategyId:    string,
  leadId:        string,
  workspaceSlug: string
): Promise<{ success: boolean; draftId?: string; error?: string; errorCode?: string }>
```

**Behavior:**
1. `createSupabaseServerClient()` + `buildRequestContext(supabase)` — standard pattern
2. `requirePermission(ctx, 'crm.companies.view')` — uses existing permission (same mapping as HRB)
3. Call `sendBridgeService.createEmailDraftFromApprovedVersion({ versionId, strategyId, leadId, userId: ctx.userId, tenantId: ctx.tenantId, workspaceId: ctx.workspaceId })`
4. If success: `revalidatePath('/${workspaceSlug}/message-workspace/${leadId}')`
5. Return `{ success: true, draftId }` or `{ success: false, error: errorMessage, errorCode }`

**Permission note:** `crm.companies.view` is the existing permission pattern for all Phase 3B server actions. A proper `messaging.send_emails` permission is defined on `sendApprovedDraft` in Phase 3A, but that is the send action — this action creates a draft, not sends. The reviewer clicking "Send" later will need `messaging.send_emails` (enforced by the existing Phase 3A send flow).

---

## 11. Approval Request Flow

This section details the 6-step write sequence inside `createEmailDraftFromApprovedVersion` (steps 11–16 from Section 8.1):

### Step 11 — Create draft as `pending_approval`

Call `emailDraftRepo.createEmailDraft` with:
- `status: 'pending_approval'` — initial state; will transition below
- `subject: version.subject_line`
- `body_text: version.body_text`
- `body_html: null`
- `to_email: contact.email`
- `to_name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null`
- `generated_by_ai: true`
- `ai_generation_metadata: { source: 'phase_3b_send_bridge', message_version_id, ..., reason_created: 'phase_3b_hrb_approval' }`
- `lead_id, contact_id, company_id, sender_identity_id, workspace_id, tenant_id`
- `template_id: null` (Phase 3B uses raw copy, not templates)
- `workflow_run_id: null`

### Step 12 — Create approval_request as `pending`

Call `approvalRepo.createApprovalRequest` with:
- `request_type: 'email_draft_review'`
- `status: 'pending'` (created by the existing function; immediately resolved in step 14)
- `payload: { draft_id, message_version_id, hrb_approved_by, hrb_approved_at, strategy_id, quality_review_id, composite_score }`

### Step 13 — Link approval_request_id to draft

Call `emailDraftRepo.linkApprovalToEmailDraft(draftId, approvalRequestId)`

### Step 14 — Resolve approval_request to `approved`

Call `approvalRepo.resolveApprovalRequest(approvalRequestId, tenantId, userId, 'approved', { hrb_authority: true, message_version_id })`.

This transitions `approval_request.status` from `pending` to `approved`. The `approved_by` is set to the current user ID.

**This does not send email.** Resolving an `approval_request` only changes the record's status.

### Step 15 — Sync approval decision to draft

Call `emailDraftService.syncApprovalDecisionToDraft(ctx, approval, 'approved')`.

This function reads from `approval.payload.draft_id` and calls `emailDraftRepo.updateDraftStatus(draftId, { status: 'approved', approvedAt: now, approvedBy: userId, ifCurrentStatus: 'pending_approval' })`.

After this step: `email_draft.status = 'approved'`, `email_draft.approved_at` set.

**The draft is now in the same state as a Phase 3A-approved draft.** `sendApprovedDraftAction` can now be called by the reviewer to send.

### Step 16 — Supersede prior pending drafts

Call `emailDraftRepo.supersedePendingDraftsForLead(tenantId, leadId)`.

This transitions any existing `draft` or `pending_approval` status drafts for the same lead to `superseded`. Runs last — after all previous writes succeed — so the lead is not left without a usable draft if an earlier step fails.

Returns array of superseded draft IDs (included in audit event payload).

### No-Send Guarantee

After step 16, the bridge function returns. It does not call `sendApprovedDraftAction`. It does not insert into `email_sends`. It does not call the Resend client. The reviewer must explicitly click "Send" in the UI to trigger sending.

---

## 12. Write Ordering and Atomicity

**Supabase does not support multi-statement transactions in the standard JS client.** The 7-step write sequence must be ordered to leave the system in a recoverable state if any step fails.

### Chosen Ordering (Safest for Recovery)

```
Validate (read-only)
  → Step 11: Create email_draft (pending_approval)
    → Step 12: Create approval_request (pending)
      → Step 13: Link approval_request_id to draft
        → Step 14: Resolve approval_request (approved)
          → Step 15: Sync draft to approved
            → Step 16: Supersede prior pending drafts (runs last)
              → Step 17: Emit audit event
```

**Why supersede runs last:** If any write step 11–15 fails, the prior draft is not orphaned — it remains active and usable. The lead is never left without a draft.

### Partial Failure Scenarios

| Failure point | State left | Recovery |
|---------------|-----------|---------|
| Step 11 fails (create draft) | Nothing written | Safe — retry allowed; no duplicate guard hit |
| Step 12 fails (create approval) | Orphaned draft in `pending_approval` with no approval_request | Duplicate guard (SEB_011) catches on retry. Implementation should log the stale draft ID. Cleanup: delete via admin or surface as partial failure in UI. |
| Step 13 fails (link) | Draft exists; approval_request exists; not linked | Stale state. Retry hits duplicate guard. Manual cleanup needed. |
| Step 14 fails (resolve) | Draft as `pending_approval`; approval_request as `pending` | Phase 3A `assertDraftIsApprovable` would allow approval if reviewer manually approves. Bridge retry hits duplicate guard. |
| Step 15 fails (sync) | Draft as `pending_approval`; approval_request as `approved` | Not sendable via `sendApprovedDraftAction` (draft not `approved`). Retry hits duplicate guard. Manual sync needed. |
| Step 16 fails (supersede) | New draft `approved`; prior draft still `pending_approval` | Lead has two active drafts temporarily. Not sendable twice (Phase 3A idempotency guards prevent double-send). Low risk for v1. |
| Step 17 fails (audit event) | Draft and approval_request correct; event missed | Non-fatal; log the failure and continue. Draft is usable. |

**Stale `pending_approval` draft cleanup:** The implementation should detect a `pending_approval` draft with no linked `approval_request_id` and treat it as a partial failure rather than a normal duplicate (SEB_011). The Implementation Plan defers the specific cleanup mechanism (auto-delete vs. admin alert) to the coding agent's judgment during implementation.

---

## 13. Audit Event Design

### 13.1 ActivityEventType Additions

Add to the existing `ActivityEventType` const object in `modules/intelligence/types.agent.ts`. **Additive only** — no existing entries modified.

```
// Phase 3B — Send / Email Draft Bridge (additive)
SEB_ACTION_DRAFT_CREATED:           'SEB_ACTION_DRAFT_CREATED',
SEB_ACTION_DRAFT_CREATION_BLOCKED:  'SEB_ACTION_DRAFT_CREATION_BLOCKED',
```

Note: The existing HRB entries use uppercase string values (e.g., `'HRB_ACTION_SELECTED'`). SEB entries should follow the same pattern for consistency.

### 13.2 `SEB_ACTION_DRAFT_CREATED` Payload

Written to `activity_events.metadata`:
```json
{
  "action_type":           "SEB_ACTION_DRAFT_CREATED",
  "draft_id":              "<uuid>",
  "message_version_id":    "<uuid>",
  "strategy_id":           "<uuid>",
  "quality_review_id":     "<uuid>",
  "lead_id":               "<uuid>",
  "contact_id":            "<uuid>",
  "user_id":               "<uuid>",
  "superseded_draft_ids":  ["<uuid>", ...],
  "timestamp":             "<ISO>"
}
```

`event_summary`: `"Reviewer [user_id] created email draft from approved version [version_label]"`
`subject_type`: `'message_version'`
`subject_id`: `versionId`

### 13.3 `SEB_ACTION_DRAFT_CREATION_BLOCKED` Payload

```json
{
  "action_type":        "SEB_ACTION_DRAFT_CREATION_BLOCKED",
  "message_version_id": "<uuid>",
  "strategy_id":        "<uuid>",
  "lead_id":            "<uuid>",
  "user_id":            "<uuid>",
  "error_code":         "SEB_007",
  "error_reason":       "contact_email_suppressed",
  "timestamp":          "<ISO>"
}
```

`event_summary`: `"Draft creation blocked for version [version_label]: [error_code]"`

---

## 14. UI / Message Workspace Integration

**File modified:** `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx`

### 14.1 New Imports

```
import {
  createEmailDraftFromApprovedVersionAction,
} from '@/modules/messaging/actions/send-bridge.actions'
```

Note: The "Approve & Send" button currently disabled on approved version cards should be **replaced** by the "Create Email Draft" button — not kept alongside it. This avoids two competing CTAs for the same action slot.

### 14.2 New Props

```
interface GeneratedVersionsPanelProps {
  // existing props...
  draftStatusByVersionId?: Map<string, { draftId: string; status: string }>
}
```

The page loader passes a map of `versionId → { draftId, status }` for all approved versions. This allows the panel to display draft state without a client-side fetch.

### 14.3 New State Variables

```
isCreatingDraft:         boolean
showDraftConfirmModal:   boolean
draftConfirmVersionId:   string | null
draftError:              string | null
draftErrorCode:          string | null
```

### 14.4 `CreateDraftConfirmModal` (inline component)

Rendered when reviewer clicks "Create Email Draft" on an approved version card. Displays:
- Contact name and email address (to confirm recipient)
- Warning if an existing pending draft will be superseded
- Optional: `email_sending_enabled = false` warning (informational)
- Confirm / Cancel buttons

On confirm: calls `createEmailDraftFromApprovedVersionAction`. On success: calls `router.refresh()` to reload draft status.

### 14.5 Version Card Updates for Approved Versions

Replace the current disabled "Approve & Send" button with:

| Draft Status | UI |
|-------------|-----|
| `null` (no draft) | Enabled "Create Email Draft" button |
| `approved` | "Ready to Send" green badge + "View / Send Draft" link to lead draft UI |
| `sent` | "Sent ✓" informational badge; no action |
| `pending_approval` | "Draft In Progress" amber badge (transient state) |
| `superseded` or `rejected` | Enabled "Create Email Draft" button (re-creation allowed) |

### 14.6 Error Display

If `createEmailDraftFromApprovedVersionAction` returns `success: false`:
- Show inline error banner below the version card
- Display user-facing message mapped from `errorCode`:
  - SEB_004: "No contact linked to this lead — link a contact first."
  - SEB_005: "Contact has no email address — add one in the CRM."
  - SEB_006: "Contact is marked 'Do Not Contact'."
  - SEB_007: "Contact's email is suppressed or unsubscribed."
  - SEB_011: "A draft already exists for this version."
  - SEB_008: "The strategy has been superseded — review the current strategy first."
  - Default: generic error message with error code for support

---

## 15. Page Loader / Data Wiring

**File modified:** `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx`

Add draft status loading for approved versions:

```
// After loading messageVersions and qualityReviews:
const approvedVersions = messageVersions.filter(v => v.approvalStatus === 'approved')

const draftStatusByVersionId = new Map<string, { draftId: string; status: string }>()
if (approvedVersions.length > 0 && activeStrategy) {
  for (const version of approvedVersions) {
    const draftStatus = await sendBridgeSvc.getDraftStatusForVersion(version.id, ctx.tenantId)
      .catch(() => null)
    if (draftStatus) {
      draftStatusByVersionId.set(version.id, draftStatus)
    }
  }
}
```

Pass `draftStatusByVersionId` to `GeneratedVersionsPanel`.

**Import added:** `import * as sendBridgeSvc from '@/modules/messaging/send-bridge/send-bridge.service'`

This is a read-only operation on page load — no writes, no side effects.

---

## 16. Integration With Phase 3A Infrastructure

The bridge calls the following existing Phase 3A functions. None are modified.

| Phase 3A Component | How Called | Note |
|-------------------|-----------|------|
| `emailDraftRepo.createEmailDraft` | Step 11 | Creates draft; pass `template_id: null` |
| `emailDraftRepo.linkApprovalToEmailDraft` | Step 13 | Links approval_request_id |
| `emailDraftRepo.supersedePendingDraftsForLead` | Step 16 | Supersedes old pending drafts |
| `emailDraftRepo.getDefaultSenderIdentity` | Validation | Gets sender identity |
| `emailDraftRepo.getEmailDraftForVersion` | Validation (new helper) | Duplicate guard query |
| `emailDraftService.syncApprovalDecisionToDraft` | Step 15 | Syncs draft to `approved` |
| `approvalRepo.createApprovalRequest` | Step 12 | Creates approval record |
| `approvalRepo.resolveApprovalRequest` | Step 14 | Auto-resolves to approved |
| `suppressionRepo.checkEmailSuppression` | Validation | Suppression check |
| `contactRepo.getContact` | Validation | Loads contact |
| `leadRepo.getLead` | Validation | Loads lead |
| `sendApprovedDraftAction` | Not called | Used by reviewer independently |

`syncApprovalDecisionToDraft` is defined in `email-draft.service.ts`. Read the function signature and import correctly — it takes `(ctx: RequestContext, approval: Pick<ApprovalRow, 'id' | 'request_type' | 'payload'>, decision: 'approved' | 'rejected')`.

---

## 17. Integration With HRB

The bridge reads HRB-produced data to build provenance. It does not modify HRB state.

| HRB field read | Used for |
|---------------|---------|
| `message_version.approval_status` | Gate condition SEB_001 |
| `message_version.reviewed_by` | `approved_by` in metadata and approval payload |
| `message_version.reviewed_at` | `approved_at` in metadata and approval payload |

The bridge does not call any HRB service function. It reads `message_version` directly via the version repo.

---

## 18. Integration With QRA

The bridge reads QRA provenance but does not modify QRA records.

| QRA field read | Used for |
|---------------|---------|
| `quality_review.id` | `quality_review_id` in metadata |
| `quality_review.composite_score` | `composite_score` in metadata |
| `quality_review.score_band` | `score_band` in metadata |
| `quality_review.is_recommended` | `is_recommended` in metadata |
| `quality_review.risk_flags` | `risk_flags_at_approval` in metadata |

The bridge loads the most recent non-superseded quality_review for the approved version via `qrRepo` (existing QRA repo). If no quality_review exists, draft creation proceeds anyway — QRA data is provenance, not a gate condition for the Send Bridge (unlike HRB, which gates on QRA). The Send Bridge relies on HRB having already enforced QRA gates.

---

## 19. Invalid Condition Model

Error codes implemented in `send-bridge.validation.ts` as `validateDraftCreationEligibility`. Check order:

| # | Code | Condition | Blocks Write Phase |
|---|------|-----------|-------------------|
| 1 | SEB_013 | Tenant mismatch (version vs request context) | Yes |
| 2 | SEB_001 | `message_version.approval_status ≠ 'approved'` | Yes |
| 3 | SEB_002 | `message_version.approval_status = 'rejected'` | Yes (subset of SEB_001) |
| 4 | SEB_003 | `message_version.approval_status = 'superseded'` | Yes (subset of SEB_001) |
| 5 | SEB_008 | Strategy `status` not in ('draft', 'approved', 'in_use') | Yes |
| 6 | SEB_004 | Lead has no `contact_id` | Yes |
| 7 | SEB_005 | Contact email is null or empty | Yes |
| 8 | SEB_006 | Contact `do_not_contact = true` | Yes |
| 9 | SEB_007 | Email is suppressed or unsubscribed | Yes |
| 10 | SEB_012 | No default sender identity configured | Yes |
| 11 | SEB_009 | `subject_line` or `body_text` is empty | Yes |
| 12 | SEB_010 | `body_html` is non-null | Yes |
| 13 | SEB_011 | Active non-rejected draft already exists for this version | Yes |
| 14 | SEB_014 | User lacks permission | Yes (checked at action layer, not pure function) |

All conditions return on first failure. No write is attempted if any condition returns false.

---

## 20. Test Fixture Plan

### 20.1 Fixture Location

`tests/fixtures/send-bridge/TC-SEB-001.json` through `TC-SEB-035.json`

### 20.2 Fixture Schema

```json
{
  "meta": {
    "test_case_id": "TC-SEB-001",
    "scenario_name": "approved_version_creates_draft_successfully",
    "description": "Full happy path: approved version, active strategy, contact with email, not suppressed, sender identity present, no existing draft"
  },
  "input": {
    "version": { "approval_status": "approved", "subject_line": "...", "body_text": "...", "body_html": null, ... },
    "strategy": { "status": "approved", ... },
    "quality_review": { "composite_score": 82, "risk_flags": [], "superseded_at": null, ... },
    "lead": { "contact_id": "uuid-contact", ... },
    "contact": { "email": "test@example.com", "do_not_contact": false, ... },
    "sender_identity": { "id": "uuid-sender", ... },
    "existing_draft": null,
    "suppression_result": { "blocked": false },
    "user": { "user_id": "uuid-user", "tenant_id": "uuid-tenant" }
  },
  "expected": {
    "success": true,
    "new_draft_status": "approved",
    "approval_request_created": true,
    "approval_request_status": "approved",
    "error_code": null,
    "activity_event_type": "SEB_ACTION_DRAFT_CREATED",
    "no_email_sends_created": true,
    "no_resend_called": true,
    "body_html_null": true,
    "notes": "Happy path — draft immediately sendable"
  }
}
```

### 20.3 Coverage by Test Case

| Fixture | Scenario | Key assertion |
|---------|---------|--------------|
| TC-SEB-001 | Happy path, full approval flow | Draft `approved`, approval_request `approved`, no send |
| TC-SEB-002 | Pending version → SEB_001 | No draft created |
| TC-SEB-003 | Rejected version → SEB_002 | No draft created |
| TC-SEB-004 | Superseded version → SEB_003 | No draft created |
| TC-SEB-005 | Selected (not approved) version → SEB_001 | No draft created |
| TC-SEB-006 | No contact on lead → SEB_004 | No draft, no supersede |
| TC-SEB-007 | Contact email null → SEB_005 | No draft created |
| TC-SEB-008 | do_not_contact = true → SEB_006 | No draft created |
| TC-SEB-009 | Email suppressed → SEB_007 | No draft created |
| TC-SEB-010 | Email unsubscribed → SEB_007 | No draft created |
| TC-SEB-011 | Superseded strategy → SEB_008 | No draft created |
| TC-SEB-012 | Empty subject_line → SEB_009 | No draft created |
| TC-SEB-013 | Empty body_text → SEB_009 | No draft created |
| TC-SEB-014 | body_html non-null → SEB_010 | No draft created |
| TC-SEB-015 | Active duplicate draft → SEB_011 | No new draft, prior draft unchanged |
| TC-SEB-016 | Prior rejected draft allows recreation | New `approved` draft created |
| TC-SEB-017 | Prior superseded draft allows recreation | New `approved` draft created |
| TC-SEB-018 | No sender identity → SEB_012 | No draft created |
| TC-SEB-019 | Tenant mismatch → SEB_013 | No draft created |
| TC-SEB-020 | Permission denied → SEB_014 | No draft created |
| TC-SEB-021 | Draft has correct ai_generation_metadata | All provenance fields present |
| TC-SEB-022 | Prior pending draft superseded after new draft | Prior = superseded, new = approved |
| TC-SEB-023 | body_html is null in created draft | email_draft.body_html IS NULL |
| TC-SEB-024 | Draft created but not sent | No email_sends row, draft status = 'approved' not 'sent' |
| TC-SEB-025 | approval_request created and auto-resolved | approval_request.status = 'approved', draft.approval_request_id set |
| TC-SEB-026 | Audit event emitted on success | SEB_ACTION_DRAFT_CREATED with correct payload |
| TC-SEB-027 | Audit event emitted on block | SEB_ACTION_DRAFT_CREATION_BLOCKED with error_code |
| TC-SEB-028 | Validation before supersede | Blocked (SEB_006): prior pending draft NOT superseded |
| TC-SEB-029 | Low-score override version creates draft | Approved with override_reason in metadata |
| TC-SEB-030 | Regeneration after HRB approval → version superseded → SEB_003 | Draft creation blocked |
| TC-SEB-031 | UI: approved version shows "Create Email Draft" | Button visible, enabled |
| TC-SEB-032 | UI: approved draft shows "Ready to Send" state | Button replaced with send-readiness indicator |
| TC-SEB-033 | UI: error shown for SEB_005 (no email) | User-friendly message displayed |
| TC-SEB-034 | UI: confirmation modal before draft creation | Modal renders with recipient details |
| TC-SEB-035 | UI: existing draft supersede warning in modal | Warning shown when prior draft exists |

### 20.4 Test Suite Structure

`tests/send-bridge.test.ts`:

```
Send Bridge — validateDraftCreationEligibility (pure function tests)
  ├── SEB_001: version not approved
  ├── SEB_002: version rejected
  ├── SEB_003: version superseded
  ├── SEB_004: contact not linked
  ├── SEB_005: contact email missing
  ├── SEB_006: do_not_contact
  ├── SEB_007: email suppressed
  ├── SEB_008: strategy not active
  ├── SEB_009: subject or body empty
  ├── SEB_010: body_html non-null
  ├── SEB_011: duplicate draft exists
  ├── SEB_012: sender identity missing
  ├── SEB_013: tenant mismatch
  └── All conditions pass → allowed: true

Send Bridge — audit builders
  ├── buildDraftCreatedPayload — all required fields present
  └── buildDraftCreationBlockedPayload — error_code and reason present

Send Bridge — fixture-based tests (35 test cases)
  └── For each TC-SEB-001 through TC-SEB-035:
        Load fixture → run validateDraftCreationEligibility → assert expected
        (UI and write-phase tests assert expected state fields)
```

**Expected total tests after implementation:** ≥ 402 (367 existing + ≥ 35 SEB)

---

## 21. QA Checklist

Before marking implementation complete, verify all of the following:

### Service and Logic

- [ ] `send-bridge.types.ts` created with all error codes, action types, interfaces
- [ ] `send-bridge.validation.ts` all 14 gate conditions implemented and tested
- [ ] `send-bridge.audit.ts` both event builders implemented
- [ ] `send-bridge.service.ts` implements both service functions with correct write ordering

### Phase 3A Integration

- [ ] `email-draft.repo.ts` extended with `getEmailDraftForVersion` (no existing functions modified)
- [ ] `modules/intelligence/types.agent.ts` extended with 2 SEB event types (additive)
- [ ] `approvalRepo.createApprovalRequest` called with correct `request_type = 'email_draft_review'`
- [ ] `approvalRepo.resolveApprovalRequest` called immediately after linking
- [ ] `emailDraftService.syncApprovalDecisionToDraft` called with correct decision
- [ ] `supersedePendingDraftsForLead` called LAST (after all other writes succeed)

### No-Send Guarantee

- [ ] No call to `sendApprovedDraftAction` anywhere in the bridge code
- [ ] No insertion into `email_sends` table anywhere in the bridge code
- [ ] No call to `resend.emails.send` or any Resend client method
- [ ] Grep confirmation: `email_sends` not referenced in `modules/messaging/send-bridge/`
- [ ] Grep confirmation: `resend` client not imported in `modules/messaging/send-bridge/`

### Server Action

- [ ] `send-bridge.actions.ts` created with `createEmailDraftFromApprovedVersionAction`
- [ ] Permission check uses existing `crm.companies.view` pattern
- [ ] `revalidatePath` called on success

### UI

- [ ] `GeneratedVersionsPanel.tsx` updated with "Create Email Draft" button on approved cards
- [ ] Disabled "Approve & Send" placeholder removed or replaced (not coexisting)
- [ ] `CreateDraftConfirmModal` inline component implemented
- [ ] Draft status indicator renders correct state for `approved`, `sent`, `pending_approval`, `superseded`, `rejected`
- [ ] Error messages for each SEB code are user-friendly
- [ ] `page.tsx` loads draft status for approved versions and passes to panel

### Test Suite

- [ ] 35 fixtures created (TC-SEB-001 through TC-SEB-035)
- [ ] `tests/send-bridge.test.ts` created
- [ ] `npx vitest run` → PASSED, ≥ 402 tests, 0 failures
- [ ] All 367 existing tests still pass (no regressions)
- [ ] `npx next build` → PASSED, 0 errors
- [ ] TypeScript → PASSED
- [ ] `npx eslint` on modified files → 0 errors, 0 warnings

### Scope Compliance

- [ ] No email_draft_versions initial row created
- [ ] No new DB migration created
- [ ] No Phase 3A function signatures modified
- [ ] No Resend API call
- [ ] No email_sends insert
- [ ] No HRB state modification
- [ ] No QRA modification
- [ ] No generated copy modification (body_text, subject_line, body_html unchanged from version)
- [ ] No Learning Agent triggered

---

## 22. Implementation Sequence

Execute steps in this order. Complete each before starting the next.

1. **Inspect** — Read current state of: `email-draft.repo.ts`, `email-draft.service.ts`, `approval.repo.ts`, `send.service.ts`, `types.agent.ts`, `GeneratedVersionsPanel.tsx`, `page.tsx`. Note the exact function signatures for `createEmailDraft`, `linkApprovalToEmailDraft`, `createApprovalRequest`, `resolveApprovalRequest`, `syncApprovalDecisionToDraft`. Note the exact `ActivityEventType` const object structure.

2. **`send-bridge.types.ts`** — Create. All error codes (SEB_001–SEB_014), action types (2), all interfaces. `as const` throughout, no `enum`.

3. **`send-bridge.validation.ts`** — Create. Pure functions. `validateDraftCreationEligibility` checking all 14 conditions in order. Helpers: `isVersionApproved`, `isStrategyActive`, `hasPermission`.

4. **`send-bridge.audit.ts`** — Create. `buildDraftCreatedPayload` and `buildDraftCreationBlockedPayload`. Pure functions.

5. **Extend `email-draft.repo.ts`** — Add `getEmailDraftForVersion` at end of file. Do not modify existing functions.

6. **`send-bridge.service.ts`** — Create. Implement `createEmailDraftFromApprovedVersion` (18-step flow) and `getDraftStatusForVersion`. Import Phase 3A repos/services. Call write steps in defined order (Section 11). No Resend call, no email_sends insert.

7. **Extend `modules/intelligence/types.agent.ts`** — Add 2 SEB event type constants inside the `ActivityEventType` const object. Additive only.

8. **`send-bridge.actions.ts`** — Create. One server action: `createEmailDraftFromApprovedVersionAction`. Uses standard context/permission pattern.

9. **Create 35 test fixtures** — `tests/fixtures/send-bridge/TC-SEB-001.json` through `TC-SEB-035.json`. Follow fixture schema from Section 20.2. Cover all scenarios from Section 20.3.

10. **`tests/send-bridge.test.ts`** — Create. Validation unit tests (14 gate conditions + happy path), audit builder tests, 35 fixture-based integration tests.

11. **Extend `GeneratedVersionsPanel.tsx`** — Import bridge action. Add `draftStatusByVersionId` prop. Replace disabled "Approve & Send" with "Create Email Draft" on approved cards. Implement `CreateDraftConfirmModal`. Add draft status indicator per approved card. Add error display. (Do not remove existing HRB select/reject/approve UI.)

12. **Extend `page.tsx`** — Import `sendBridgeSvc`. Add draft status loading loop for approved versions. Pass `draftStatusByVersionId` to `GeneratedVersionsPanel`.

13. **QA pass** — `npx vitest run` (≥ 402 tests, 0 failures) + `npx next build` (0 errors) + `npx eslint` on modified files.

14. **Guardrail correction pass** — Grep all new files for: `email_sends`, `resend`, `sendApprovedDraftAction` (must not be called), `body_text =` (must not be written), `subject_line =` (must not be written). Confirm no send behavior exists.

15. **Implementation summary** — Report files created, test count, build status, deviations from plan. Stop before Learning Agent or Event Tracking.

---

## 23. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Reviewer confuses "draft approved" with "email sent" | Medium | High | Clear UI labeling: "Ready to Send — click Send to email" never "Sent"; audit trail absence of email_sends proves no send |
| Partial write failure leaves stale pending_approval draft | Low | Medium | Duplicate guard catches on retry; log stale draft ID clearly; cleanup deferred to implementation phase |
| Concurrent double-submission creates two drafts | Very Low | Low | Application-level guard is best-effort; Phase 3A idempotency on sendApprovedDraft prevents double-send; future FK index migration closes the gap |
| `syncApprovalDecisionToDraft` interface changes (Phase 3A) | Very Low | High | Phase 3A is locked; no function signatures change; inspect before calling |
| `resolveApprovalRequest` changes `approved_by` unexpectedly | Low | Low | Inspect exact behavior before calling; `approved_by` is set to `userId` — correct, as the reviewer IS the approver |
| body_html fallback in `sendApprovedDraft` wraps body_text in `<p>` | Low | None | This is acceptable Phase 3A behavior for plain-text drafts; the email renders correctly |
| Suppression check on draft creation passes but email changes before send | Low | Low | Phase 3A `sendApprovedDraft` runs suppression check again before calling Resend — double-checked |
| Regressions in existing 367 tests from types.agent.ts addition | Very Low | Medium | Only add to const object; TypeScript will catch type errors; existing tests import the type |

---

## 24. Final Acceptance Criteria

| Criterion | Met? |
|-----------|------|
| Implementation scope defined (new files + modified files) | ✓ |
| All 6 open questions resolved | ✓ |
| No new DB table or migration required | ✓ |
| Type interfaces defined | ✓ |
| Service boundary defined — 18-step flow, write ordering, atomicity | ✓ |
| Repository changes defined — 1 new read helper only | ✓ |
| Server action defined | ✓ |
| Approval request creation and auto-resolution defined | ✓ |
| No-send guarantee enforced at design level | ✓ |
| Partial failure scenarios documented | ✓ |
| Audit event payloads defined | ✓ |
| UI behavior defined per draft state | ✓ |
| Page loader wiring defined | ✓ |
| Test fixture plan — 35 fixtures, full coverage | ✓ |
| QA checklist — 40+ items | ✓ |
| Implementation sequence — 15 ordered steps | ✓ |
| Risks and mitigations identified | ✓ |
| No code written | ✓ |
| No SQL written | ✓ |
| No sending introduced | ✓ |

---

## 25. Recommended Next Step

Once this implementation plan is approved by the user:

**Phase 3B Send / Email Draft Bridge — Code Implementation**

The coding agent must follow the 15-step sequence in Section 22 exactly. Key constraints to preserve throughout:

1. The bridge stops at `email_draft.status = 'approved'`; no Resend call, no email_sends insert
2. Steps 11–16 in Section 8.1 are the correct write sequence; supersede runs last
3. Phase 3A functions are called without modification
4. `sendApprovedDraftAction` is the reviewer's send trigger; the bridge never calls it
5. 367 existing tests must not regress
6. Stop before Event Tracking or Learning Agent

After implementation:
- Run QA: `npx vitest run` (≥ 402) + `npx next build` + lint
- Produce implementation summary
- Commit, tag as `phase-3b-send-bridge-v1`
- Update `docs/ai-context/` files

---

*Document status: Draft. Awaiting user approval before code implementation begins.*
*Version: 1.0 — 2026-05-21*
