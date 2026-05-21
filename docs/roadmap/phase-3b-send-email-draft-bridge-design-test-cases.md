# Phase 3B Send / Email Draft Bridge — Design & Test Cases

**Status:** Draft v1.1 — Revised to resolve send-flow contradiction; awaiting user approval before implementation planning begins.
**Version:** 1.1
**Date:** 2026-05-21
**Prerequisite:** Human Review / Approval Bridge Foundation v1.0 complete and QA-verified (`ea3342c`, tag `phase-3b-human-review-bridge-v1`).

---

## 1. Executive Overview

The Phase 3B Revenue Learning Engine has now produced, scored, ranked, and human-approved outbound email candidates. The pipeline state as of the completed Human Review / Approval Bridge:

```
Message Strategy Agent      → produces message_strategy
Copywriting Agent           → produces message_version[] (plain text, body_html null)
Quality Review Agent        → produces quality_review[] (scores, risk flags, recommendation)
Human Review / Approval Bridge → sets message_version.approval_status = 'approved'
```

A `message_version` with `approval_status = 'approved'` is the pipeline's clean handoff state. It means: a human has reviewed all available information and explicitly approved this version for the next step. However, "approved" does not mean "send." The bridge stops there intentionally.

The **Send / Email Draft Bridge** is the next layer. Its purpose is to convert an `approved` `message_version` into an `email_draft` row inside the existing Phase 3A email draft system — creating a reviewable, editable, send-ready artifact that can be dispatched through the established send workflow.

**Why this bridge exists:**

The Phase 3A `email_drafts` table and its send workflow (`email_sends`, `email_send.service.ts`, `sendApprovedDraftAction`) already handle the mechanics of sending email through Resend: idempotency, suppression checks, sender identity, `email_sends` records, and status tracking. The Send Bridge does not replace any of that. It is a thin translation layer that:

- Validates the approved `message_version` is safe to draft
- Runs recipient safety checks (contact linked, email present, not suppressed, not do_not_contact)
- Creates a new `email_draft` record populated from the `message_version`'s content
- Supersedes any existing pending drafts for the same lead
- Records provenance (version_id, strategy_id, quality_review_id, approval context) in `ai_generation_metadata`
- Emits an audit activity event
- **Stops.** The draft exists; a human must take the next action to send it.

**Core principle preserved:**

Agents recommend. Humans decide — at every gate. The Send Bridge is not an AI agent. It does not reason, score, or generate. It is the mechanism that moves a human-approved Phase 3B artifact into the Phase 3A send workflow, where humans retain full control over sending.

**Position in the full pipeline:**

```
Message Strategy Agent
→ Copywriting Agent
→ Quality Review Agent
→ Human Review / Approval Bridge  (Complete — HRB approval = explicit human decision)
→ Send / Email Draft Bridge       ← this document
→ [existing Phase 3A send flow: email_draft → approval → sendApprovedDraftAction]
→ Event Tracking                  (future)
→ Learning Agent                  (future)
```

---

## 2. Completed Prerequisites

Before the Send Bridge can run for any given lead, the following must be true:

| Prerequisite | Source |
|-------------|--------|
| `message_strategy` record exists and is active | Message Strategy Agent |
| `message_version` record exists with `approval_status = 'approved'` | HRB |
| `quality_review` record exists for the approved version | Quality Review Agent |
| Lead has a linked contact | CRM / lead record |
| Contact has an email address | CRM / contact record |
| Contact is not `do_not_contact` | CRM / contact record |
| Contact email is not suppressed or unsubscribed | suppression repo |
| A default sender identity is configured for the workspace | Phase 3A infrastructure |

If any prerequisite is absent, the bridge must block draft creation and return a clear error — not create a partial draft.

---

## 3. Design Goals

1. Convert an `approved` `message_version` into an `email_draft` using the existing Phase 3A schema, with no new tables required.
2. Use the `message_version`'s `subject_line` and `body_text` directly — no template rendering, no rewriting.
3. Store full Phase 3B provenance in `ai_generation_metadata` for audit and future Learning Agent consumption.
4. Enforce the no-auto-send guarantee: creating a draft does not send; the draft requires a separate explicit send action.
5. Prevent duplicate drafts for the same `message_version` using a guard on `ai_generation_metadata.message_version_id`.
6. Supersede any existing `draft` or `pending_approval` email drafts for the same lead when creating a new one — maintaining the one-active-draft-per-lead invariant already enforced by Phase 3A.
7. Trigger safety checks (suppression, do_not_contact) before any DB writes.
8. Surface draft status in the message workspace UI so the reviewer can see what happened.

---

## 4. Non-Goals

| Non-Goal | Reason |
|----------|--------|
| Auto-send on draft creation | No-auto-send is a locked principle |
| Rewrite or modify `body_text` or `subject_line` | Version content is immutable |
| Generate `body_html` | body_html is null in Phase 3B v1; this may be added in a future design |
| Build a new AI agent | The bridge is a state-management translation layer |
| Modify QRA scores or rankings | QRA records are read-only |
| Modify HRB approval state | HRB decisions are immutable from this bridge |
| Require a second manual approval round-trip | The bridge creates and auto-resolves an `approval_request` at draft-creation time; HRB approval is the human gate, not a second Phase 3A queue |
| Call Resend API | Draft creation is not sending |
| Build the Learning Agent | Future work |
| Trigger Event Tracking | Future work |
| Call external LLMs | No AI in the bridge |
| Modify Phase 3A email infrastructure | Phase 3A is locked; the bridge uses it read/write but does not alter it |

---

## 5. Key Design Decision — Trigger Model

### Question: When is the draft created?

**Option A — Automatic on HRB approval:**
The moment a human approves a `message_version` via HRB, the system automatically creates an `email_draft`.

**Option B — Explicit "Create Draft" human action (Recommended for v1):**
After HRB approval, the reviewer sees an "approved" state badge in the UI. A separate "Create Email Draft" button allows them to explicitly trigger draft creation when ready.

**Why Option B:**

- Maintains the human-at-every-gate principle. Approval and draft-creation are distinct decisions: "this copy is good" vs. "I'm ready to prepare this for sending now."
- Allows the reviewer to approve a version without immediately committing to a send-ready draft (e.g., they may want to review recipient data first, or wait for a strategic timing window).
- Prevents surprise drafts if a reviewer approves and then realizes the lead isn't ready for outreach.
- Consistent with Option A in the HRB design (bridge stops at `approved`; next action is always explicit).

**Recommendation:** Option B. The bridge is triggered by an explicit user action in the message workspace UI, not automatically on HRB approval.

---

## 6. State Flow

### 6.1 Full State Journey

```
message_version.approval_status = 'approved'     ← HRB handoff point
        │
        │  [Human clicks "Create Email Draft" in message workspace]
        │
        ▼
  Send Bridge validates (all read-only — no DB writes yet):
    - version approved and not superseded
    - strategy active
    - contact linked, email present, not suppressed
    - sender identity configured
    - no active non-rejected duplicate draft for this version
        │
        │  [All gates pass — begin writes]
        │
        ▼
  Step 1 — INSERT email_draft:
    status = 'pending_approval'   ← initial; transitioned below
    subject = version.subject_line
    body_text = version.body_text
    body_html = null
    to_email = contact.email
    to_name = contact.first_name + last_name
    generated_by_ai = true
    ai_generation_metadata = { message_version_id, ..., reason_created: 'phase_3b_hrb_approval' }
        │
        ▼
  Step 2 — INSERT approval_request:
    request_type = 'email_draft_review'
    status = 'pending'   ← immediately resolved below
    payload = { draft_id, hrb_version_id, hrb_approved_by, hrb_approved_at, ... }
        │
        ▼
  Step 3 — UPDATE email_draft.approval_request_id = approval_request.id
        │
        ▼
  Step 4 — RESOLVE approval_request:
    approval_request.status = 'approved'
    (HRB approval is treated as the final content approval;
     no second manual approval step is required)
        │
        ▼
  Step 5 — SYNC approval decision to draft:
    email_draft.status = 'approved'   ← final state
    email_draft.approved_at, email_draft.approved_by set
        │
        ▼
  Step 6 — Supersede prior pending/pending_approval drafts for lead
    (runs last; only after all previous steps succeed)
        │
        ▼
  Step 7 — Emit SEB_ACTION_DRAFT_CREATED activity event
        │
        │  [Reviewer sees "Ready to Send" in UI]
        │
        ▼
  [Human clicks "Send" — existing sendApprovedDraftAction]
    Double-gate check:  email_draft.status == 'approved' ✓
                        approval_request.status == 'approved' ✓
        │
        ▼
  email_sends INSERT → Resend API called → email sent
```

### 6.2 Draft Status Values (Existing Phase 3A)

| Status | Meaning in context of Send Bridge |
|--------|----------------------------------|
| `draft` | Created by bridge. Ready for review. Not yet in Phase 3A approval flow. |
| `pending_approval` | Optionally transitioned via Phase 3A approval workflow if that flow is invoked. |
| `approved` | Phase 3A approval complete. Ready to send via `sendApprovedDraftAction`. |
| `rejected` | Phase 3A reviewer rejected the draft. Not sent. |
| `superseded` | Replaced when a newer draft was created for the same lead. |

**Why the bridge produces `status = 'approved'` — the double-gate requirement:**

`sendApprovedDraft` (the existing Phase 3A send function) enforces a hard double-gate:
1. `email_draft.status` must equal `'approved'`
2. `email_draft.approval_request_id` must be non-null
3. The linked `approval_request.status` must also equal `'approved'`

A draft in any other status — `'draft'`, `'pending_approval'` — **cannot be sent** via the existing send flow. Modifying `sendApprovedDraft` to relax this gate is not permitted (Phase 3A is locked).

**The bridge therefore creates both records and resolves them in a single atomic sequence:**
- `email_draft` starts as `pending_approval`, transitions to `approved` via `syncApprovalDecisionToDraft`
- `approval_request` starts as `pending`, transitions to `approved` via `resolveApprovalRequest`
- HRB approval is the human gate. The Phase 3A `approval_request` captures that decision for auditing and satisfies the double-gate. No second manual approval step is required.

From the reviewer's perspective, clicking "Create Email Draft" produces a draft that is **immediately ready to send** — they see a "Send" button, not a pending approval queue.

### 6.3 message_version State After Draft Creation

The `message_version.approval_status` **does not change** when a draft is created. It remains `approved`. The link from version to draft is captured in `email_draft.ai_generation_metadata`, not by modifying the version record.

A future enhancement could add a `draft_id` field to `message_versions`, but this requires a migration and is deferred.

---

## 7. Bridge Responsibilities

### What the Bridge Does

- Reads `message_version` (approved) to extract `subject_line`, `body_text`, `strategy_id`, `version_label`
- Reads `message_strategy` to confirm active status and provide context metadata
- Reads `quality_review` to include QRA provenance in metadata
- Reads lead record to get `contact_id`, `company_id`
- Reads contact record to get `email`, `first_name`, `last_name`, `do_not_contact`
- Runs suppression check via existing `suppressionRepo.checkEmailSuppression`
- Reads default sender identity via existing `emailDraftRepo.getDefaultSenderIdentity`
- Checks for an existing draft linked to this `message_version_id` to prevent duplicates
- Supersedes existing `draft` or `pending_approval` email drafts for the same lead
- Creates `email_draft` row via existing `emailDraftRepo.createEmailDraft` (status `pending_approval` initially)
- Creates `approval_request` via existing `approvalRepo.createApprovalRequest` (required by the Phase 3A double-gate)
- Links approval_request to draft via existing `emailDraftRepo.linkApprovalToEmailDraft`
- Auto-resolves the approval_request to `approved` via existing `approvalRepo.resolveApprovalRequest` (HRB approval is the human gate)
- Syncs approval decision to draft via existing `emailDraftService.syncApprovalDecisionToDraft` (transitions draft to `approved`)
- Supersedes prior pending drafts for the same lead (after all previous writes succeed)
- Emits `SEB_ACTION_DRAFT_CREATED` activity event
- Returns `{ ok: true, draftId }` to the calling action

### What the Bridge Does Not Do

- Does not send email
- Does not call Resend API
- Does not create `email_sends` records
- Does not require a second manual approval from the reviewer — the auto-resolved `approval_request` satisfies the Phase 3A double-gate using the prior HRB approval as authority
- Does not modify `message_version` content or approval status
- Does not modify `quality_review` records
- Does not modify `message_strategy` fields
- Does not rewrite or generate copy
- Does not call external LLMs
- Does not trigger Learning Agent
- Does not trigger Event Tracking (future)

---

## 8. Phase 3A Infrastructure Reuse

The following existing Phase 3A components are consumed by the bridge without modification:

| Component | Usage |
|-----------|-------|
| `email_drafts` table | The bridge inserts into this table |
| `emailDraftRepo.createEmailDraft` | Creates the draft record (status `pending_approval`) |
| `emailDraftRepo.linkApprovalToEmailDraft` | Links approval_request_id to the draft |
| `emailDraftRepo.supersedePendingDraftsForLead` | Supersedes prior pending drafts for the lead (step 6) |
| `emailDraftRepo.getDefaultSenderIdentity` | Populates `sender_identity_id` |
| `emailDraftService.syncApprovalDecisionToDraft` | Transitions draft status to `approved` |
| `approvalRepo.createApprovalRequest` | Creates the `approval_request` (status `pending`) |
| `approvalRepo.resolveApprovalRequest` | Immediately resolves approval_request to `approved` |
| `suppressionRepo.checkEmailSuppression` | Recipient safety check |
| `sendApprovedDraftAction` | Used downstream by reviewer to send — bridge does not call this |
| `email_sends` table | Created by existing send flow; bridge does not touch this |

**Phase 3A is locked — no existing functions are modified.** The bridge calls Phase 3A functions as designed consumers. One new read helper will be added to support the duplicate-guard query (`getEmailDraftForVersion`). This helper is a Send Bridge implementation concern — it queries a Phase 3A table without altering Phase 3A behavior.

---

## 9. Data Model Considerations

### 9.1 New Fields Required on `email_drafts`

No new columns are required for v1. All Phase 3B provenance is stored in `ai_generation_metadata` (existing jsonb column).

### 9.2 `ai_generation_metadata` Payload for Phase 3B Drafts

```json
{
  "source":               "phase_3b_send_bridge",
  "message_version_id":   "uuid",
  "strategy_id":          "uuid",
  "quality_review_id":    "uuid",
  "version_label":        "A",
  "composite_score":       82,
  "score_band":           "strong",
  "is_recommended":        true,
  "approved_by":          "user-uuid",
  "approved_at":          "2026-05-21T...",
  "override_reason":      null,
  "risk_flags_at_approval": [],
  "reason_created":       "phase_3b_hrb_approval",
  "generated_at":         "2026-05-21T..."
}
```

This payload:
- Allows auditing which version produced which draft
- Gives the Learning Agent future access to the full provenance chain
- Provides duplicate detection via `message_version_id` lookup
- Records the approval context (who approved, when, any override reason)

### 9.3 Duplicate Guard Strategy

Before creating a draft, query `email_drafts` for any non-deleted record where:
- `tenant_id = tenantId`
- `lead_id = leadId`
- `ai_generation_metadata->>'message_version_id' = versionId`
- `status NOT IN ('superseded', 'rejected')`

If found, return an error (`SEB_011`) rather than creating a duplicate.

Note: if the existing draft was rejected (Phase 3A reviewer rejected it), a new draft creation should be allowed — the reviewer may want to try again after the original rejection.

### 9.4 `body_html` Handling

Phase 3B `message_version.body_html` is always null (locked decision). The `email_draft.body_html` field is therefore `null` for all Phase 3B-originated drafts. This may be revisited when `body_html` generation is scoped as a separate sub-task.

### 9.5 Existing `email_draft_versions` Table

The `email_draft_versions` table tracks editable versions of a draft. The bridge creates the initial `email_draft` but does not create a corresponding `email_draft_version` row. Whether to auto-create a version 1 snapshot is an implementation decision for the Implementation Plan.

### 9.6 Future Migration Consideration

A future migration could add:
- `message_version_id uuid REFERENCES message_versions(id)` on `email_drafts` — enabling proper FK joins instead of jsonb lookup
- `strategy_id uuid REFERENCES message_strategies(id)` on `email_drafts` — for direct querying

These are not required in v1.

---

## 10. Recipient Resolution

The draft recipient is resolved from the lead's linked contact:

| Source | Field | Used for |
|--------|-------|---------|
| `lead.contact_id` | — | Identifies the contact |
| `contact.email` | `to_email` | Required — blocks draft creation if absent |
| `contact.first_name` + `contact.last_name` | `to_name` | Optional; formatted as "First Last" |
| `contact.do_not_contact` | — | Blocks draft creation if true |
| Suppression check on `contact.email` | — | Blocks if email is suppressed or unsubscribed |

**If any required recipient field is missing, the bridge fails before writing anything to the database.**

---

## 11. Safety Checks

Run these checks **before** any database write. If a check fails, return an error and write nothing.

| Check | Error code | Notes |
|-------|-----------|-------|
| Contact linked to lead | SEB_004 | `lead.contact_id` must be non-null |
| Contact email present | SEB_005 | `contact.email` must be non-null and non-empty |
| Contact not do_not_contact | SEB_006 | `contact.do_not_contact` must be false |
| Email not suppressed or unsubscribed | SEB_007 | Via `suppressionRepo.checkEmailSuppression` |
| Default sender identity exists | SEB_012 | Via `emailDraftRepo.getDefaultSenderIdentity` |

These reuse the same safety infrastructure as the existing `email-draft.service.ts` `runSafetyChecks` function. The bridge may extract that function or call it directly.

---

## 12. No-Auto-Send Guarantee

The no-auto-send guarantee is enforced at multiple layers:

1. **Bridge design:** The bridge creates and approves a draft record — it does NOT call `sendApprovedDraftAction`, does NOT insert into `email_sends`, and does NOT call the Resend API. Creating a draft, even in `approved` status, does not send.
2. **Separate send action:** `sendApprovedDraftAction` is only triggered when a reviewer explicitly clicks "Send" in the UI. It is a distinct server action not called by the bridge.
3. **Three distinct human clicks required:**
   - HRB: reviewer clicks "Approve for Next Step" — approves the copy
   - Send Bridge: reviewer clicks "Create Email Draft" — creates a send-ready draft
   - Send: reviewer clicks "Send" — calls `sendApprovedDraftAction` → Resend API → email sent
4. **Audit trail:** Every send action creates an `email_sends` row and is traceable. No send is possible without that record. The absence of `email_sends` rows proves no send occurred.
5. **`sendApprovedDraft` double-gate:** Even if someone were to call `sendApprovedDraftAction` directly, it runs 8 independent safety and idempotency checks before touching Resend. Auto-send is structurally impossible.

---

## 13. Duplicate Draft Prevention

### 13.1 Per-Version Duplicate Guard

Before any write, the bridge queries `email_drafts` for any record where:
- `tenant_id = tenantId`
- `ai_generation_metadata->>'message_version_id' = versionId`
- `deleted_at IS NULL`
- `status NOT IN ('superseded', 'rejected')`

If found, return `SEB_011` — do not create a duplicate. A prior rejected draft allows re-creation; a prior superseded draft allows re-creation.

**Application-level guard only.** This check uses a JSONB path expression (`->>'message_version_id'`), not a DB-enforced unique constraint. Two concurrent submissions for the same version could both pass the read check before either write completes, resulting in two drafts. This risk is low for manual UI flows but should be acknowledged. A future migration adding a `message_version_id` column with a partial unique index is recommended after v1.

### 13.2 Lead-Level Supersede (One Active Draft Per Lead)

The bridge calls `emailDraftRepo.supersedePendingDraftsForLead` to supersede any existing `draft` or `pending_approval` drafts for the same lead, maintaining the one-active-draft-per-lead invariant already established in Phase 3A.

### 13.3 Atomicity and Write Ordering

Supabase does not expose multi-statement transactions in the standard JavaScript client. The bridge therefore uses a safe ordering designed to leave the system in a recoverable state if any write fails mid-sequence:

**Ordering (see Section 6.1):**
All validation → create draft → create approval_request → link → resolve → sync → supersede prior drafts

**Why supersede runs last:** If any earlier write fails, the prior draft remains active (the lead is not left without a usable draft). The new draft either doesn't exist (clean failure) or exists as `pending_approval` (stale but visible). The retry on a next attempt will detect the stale draft via the duplicate guard or status inspection.

**Partial failure recovery:**
- If `approval_request` creation fails after draft insert: draft exists as `pending_approval` with no linked approval. This is detectable — the duplicate guard (checking `status NOT IN ('superseded', 'rejected')`) will catch it on retry and return `SEB_011`. The implementation plan should define a cleanup path (e.g., delete the orphaned draft or surface it to the admin).
- If `syncApprovalDecisionToDraft` fails: draft stays as `pending_approval`, approval_request is `approved`. Phase 3A's `assertDraftIsApprovable` can still catch this. Retry of the entire bridge action would hit the duplicate guard.
- If supersede fails after all other writes succeed: the new draft is `approved` and usable; the prior draft remains. The lead briefly has two active drafts. Phase 3A idempotency guards on `sendApprovedDraft` prevent double-sends.

This ordering intentionally differs from Phase 3A's `createLeadEmailDraft` (which supersedes before creating), because the Send Bridge's multi-step create sequence is more complex and failure mid-way is more consequential.

---

## 14. UI Behavior in Message Workspace

### 14.1 Current State (after HRB)

The approved `message_version` card in `GeneratedVersionsPanel` currently shows:
- "Approved" badge
- Reviewer identity and timestamp
- "Approve & Send" button — disabled with "coming in future phase" tooltip
- No "Create Draft" option

### 14.2 Required Changes (Send Bridge UI)

**In `GeneratedVersionsPanel.tsx` (or a new adjacent component):**

For `approved` versions, the current disabled "Approve & Send" button should be replaced or supplemented with a "Create Email Draft" button:

| Version Status | Draft Status | Button State |
|---------------|-------------|-------------|
| `approved` | No draft | "Create Email Draft" — enabled |
| `approved` | `approved` | "Ready to Send" badge + "View / Send Draft" link — enabled |
| `approved` | `sent` | "Sent" — informational; no further action |
| `approved` | `superseded` | "Create Email Draft" — enabled (prior draft superseded) |
| `approved` | `rejected` | "Create Email Draft" — enabled (prior draft rejected by Phase 3A) |
| `approved` | `pending_approval` | "Draft In Progress" — informational (bridge partially complete; should be transient) |
| Any other status | — | Button hidden or disabled |

Note: Because the bridge transitions the draft to `approved` in a single user action, the reviewer should normally see either "No draft" or "Ready to Send" — the `pending_approval` and `draft` states are internal and should be transient. They may be visible if a partial failure occurred.

**Approval-stage modal or confirmation:**
When the reviewer clicks "Create Email Draft":
1. Show confirmation: "Create an email draft for [Contact Name] ([contact email]) using the approved version?"
2. Show any warnings (e.g., existing pending draft will be superseded)
3. Confirm / Cancel

**After draft creation:**
- Show success message: "Email draft created. View and send it in the lead's email draft section."
- Show "View Draft" link navigating to the lead email draft UI

**Safety error display:**
- If safety check fails (no email, suppressed, etc.): show inline error in the version card
- Error should explain specifically what's blocking (e.g., "This contact has no email address linked.")

### 14.3 Draft Status Indicator

The version card should load and display the current draft status for the approved version. This requires loading `email_drafts` linked to this version via `ai_generation_metadata.message_version_id` on page load.

---

## 15. Server/Service Behavior (Conceptual)

No code is written in this document. These are conceptual descriptions for the Implementation Plan.

### 15.1 Conceptual Service: `send-bridge.service.ts`

```
createEmailDraftFromApprovedVersion(versionId, leadId, userId, tenantId)
  — VALIDATION PHASE (read-only; no DB writes) —
  1. Load message_version → validate approval_status = 'approved', not superseded (SEB_001/003)
  2. Load message_strategy → validate active status (SEB_008)
  3. Load quality_review → capture provenance; validate tenant (SEB_013)
  4. Load lead → get contact_id, company_id; validate tenant (SEB_013)
  5. Load contact → get email, first_name, last_name, do_not_contact
  6. Run safety checks: contact linked (SEB_004), email present (SEB_005),
       do_not_contact (SEB_006), suppression check (SEB_007)
  7. Load sender identity → validate present (SEB_012)
  8. Load version content → validate subject_line + body_text non-empty (SEB_009),
       body_html null (SEB_010)
  9. Duplicate guard → check for existing active draft for this version (SEB_011)
  — WRITE PHASE (ordered for safe partial failure recovery) —
  10. Build ai_generation_metadata payload
  11. INSERT email_draft (status = 'pending_approval', generated_by_ai = true, ...)
  12. INSERT approval_request (request_type = 'email_draft_review', status = 'pending',
        payload = { draft_id, hrb_version_id, hrb_approved_by, hrb_approved_at, ... })
  13. UPDATE email_draft.approval_request_id = new approval_request.id
  14. RESOLVE approval_request → status = 'approved' (HRB approval is the human gate)
  15. SYNC approval decision to draft → email_draft.status = 'approved'
  16. SUPERSEDE prior pending drafts for lead (runs last)
  17. Emit SEB_ACTION_DRAFT_CREATED activity event
  18. Return { ok: true, draftId }

getDraftStatusForVersion(versionId, tenantId)
  → Query email_drafts WHERE ai_generation_metadata->>'message_version_id' = versionId
       AND tenant_id = tenantId AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1
  → Returns { draftId, status } or null if no draft exists
```

### 15.2 Conceptual Server Action: `send-bridge.actions.ts`

```
createEmailDraftFromApprovedVersionAction(versionId, strategyId, leadId, workspaceSlug)
  → Build request context
  → Check permission (existing pattern)
  → Call send-bridge.service.createEmailDraftFromApprovedVersion
  → revalidatePath
  → Return { success, draftId?, error? }
```

### 15.3 Conceptual Repository Changes

**No new table.** However, a new read function may be needed:

```
getEmailDraftForVersion(versionId, tenantId)
  → SELECT from email_drafts WHERE ai_generation_metadata->>'message_version_id' = versionId
     AND tenant_id = tenantId AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 1
```

This enables the "draft status for version" UI query.

---

## 16. Audit / Activity Events

Use existing `activity_events` infrastructure. Add these event type constants to `modules/intelligence/types.agent.ts` (additive only):

| Event Type | When Emitted |
|------------|-------------|
| `SEB_ACTION_DRAFT_CREATED` | Email draft successfully created from approved version |
| `SEB_ACTION_DRAFT_CREATION_BLOCKED` | Draft creation attempted but blocked (with reason code) |

**`SEB_ACTION_DRAFT_CREATED` payload:**
```json
{
  "action_type":          "SEB_ACTION_DRAFT_CREATED",
  "draft_id":             "uuid",
  "message_version_id":   "uuid",
  "strategy_id":          "uuid",
  "quality_review_id":    "uuid",
  "lead_id":              "uuid",
  "contact_id":           "uuid",
  "user_id":              "uuid",
  "superseded_draft_ids": [],
  "timestamp":            "ISO"
}
```

**`SEB_ACTION_DRAFT_CREATION_BLOCKED` payload:**
```json
{
  "action_type":          "SEB_ACTION_DRAFT_CREATION_BLOCKED",
  "message_version_id":   "uuid",
  "strategy_id":          "uuid",
  "lead_id":              "uuid",
  "user_id":              "uuid",
  "error_code":           "SEB_007",
  "error_reason":         "contact_email_suppressed",
  "timestamp":            "ISO"
}
```

---

## 17. Error Handling and Invalid Conditions

Error code family: `SEB_001` through `SEB_014`

| Code | Action Blocked | Condition | Suggested Fix |
|------|---------------|-----------|---------------|
| SEB_001 | Create draft | `message_version.approval_status` is not `approved` | Approve the version via HRB first |
| SEB_002 | Create draft | `message_version.approval_status` is `rejected` | Cannot create draft from a rejected version |
| SEB_003 | Create draft | `message_version.approval_status` is `superseded` | Version is no longer available |
| SEB_004 | Create draft | No contact linked to lead | Link a contact to this lead in the CRM |
| SEB_005 | Create draft | Contact has no email address | Add an email address to the contact record |
| SEB_006 | Create draft | Contact is marked `do_not_contact` | Do not send to this contact |
| SEB_007 | Create draft | Contact email is suppressed or unsubscribed | Email is on the suppression list; do not proceed |
| SEB_008 | Create draft | Strategy is superseded or in error state | The strategy is no longer active |
| SEB_009 | Create draft | `subject_line` or `body_text` is empty | Version content is incomplete — regenerate |
| SEB_010 | Create draft | `body_html` is non-null | Phase 3B v1 invariant violation; contact support |
| SEB_011 | Create draft | A non-superseded, non-rejected draft already exists for this version | Draft already created; view the existing draft |
| SEB_012 | Create draft | No default sender identity configured for workspace | Configure a sender identity in workspace settings |
| SEB_013 | Create draft | Tenant mismatch between version, lead, and request context | Authentication/data issue |
| SEB_014 | Create draft | User lacks required permission | Request permission from workspace admin |

**Ordering guarantee:** All validation (SEB_001–SEB_014) runs before any database write. If any validation check fails, no data is written and no supersede call is made. Writes begin only after all validation passes (see Section 13.3 for write ordering and partial-failure recovery).

---

## 18. Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| HRB approved a version but a new strategy was then generated (superseding old strategy) | SEB_008 — strategy superseded; approved version is still technically valid content but strategy context is stale. Design leaves open: should the superseded strategy block draft creation? Recommended: block, because the email context may be wrong. |
| HRB approved a version with a low-score override | Draft is created normally; the `ai_generation_metadata` includes the override_reason for audit |
| Approved version's contact email changes between approval and draft creation | Safety checks run at draft-creation time; if email is now absent or suppressed, draft creation is blocked (SEB_005 or SEB_007) |
| Draft is rejected by Phase 3A reviewer; reviewer wants to try again | SEB_011 only blocks if non-rejected draft exists; rejected draft allows new creation |
| Regeneration was requested after approval (HRB_018 was set, strategy now has no approved version) | Draft creation would fail SEB_001 (no approved version) — correct behavior |
| Multiple approved versions (HRB_018 prevents this in v1, but guard exists) | Draft creation guard on `message_version_id` ensures only the specific version's draft is blocked from duplication, not the lead's |
| Contact email becomes suppressed after draft is created but before send | Phase 3A `sendApprovedDraftAction` runs suppression check before sending — suppression is caught there |
| Sender identity is removed after draft creation | Phase 3A send flow handles missing sender identity |
| The same approved version is submitted twice concurrently | SEB_011 on the second request; the first write wins |

---

## 19. Guardrails

The following guardrails apply to the Send / Email Draft Bridge and must remain in force throughout implementation:

| Guardrail | Statement |
|-----------|-----------|
| No auto-send | Draft creation does not trigger sending. The send action is always a separate explicit human step. |
| No copy modification | The bridge copies `subject_line` and `body_text` verbatim from the `message_version`. No rewriting. |
| No body_html generation | `body_html` is always null in Phase 3B v1. The bridge sets it to null. |
| No QRA modification | `quality_review` records are read-only; the bridge only reads them for provenance. |
| No HRB state modification | `message_version.approval_status` is not changed by the bridge. |
| No new AI agent | The bridge is a translation/state-management layer. No reasoning, generation, or LLM calls. |
| No Phase 3A behavior modification | Phase 3A services are called as designed consumers — no existing function signatures or logic are changed. The bridge adds one new read helper that queries a Phase 3A table; this is a bridge concern, not a Phase 3A change. |
| Safety checks before writes | All validation runs before any database write, including the supersede call. |
| Learning Agent not triggered | Future work. |
| Audit event always emitted | Both success and failure outcomes emit activity events for traceability. |

---

## 20. Test Case Matrix

All test cases are behavioral specifications. No code is written here.

---

**TC-SEB-001 — Approved version creates email draft successfully**
Input: `message_version.approval_status = 'approved'`, active strategy, active QRA, contact with email, not suppressed, sender identity present, no existing draft for this version
Expected: Draft created with `status = 'approved'`, `subject = version.subject_line`, `body_text = version.body_text`, `body_html = null`, `to_email = contact.email`, `ai_generation_metadata.message_version_id = versionId`. Linked `approval_request.status = 'approved'`. `email_draft.approval_request_id` is non-null.
Pass condition: `{ ok: true, draftId: 'uuid' }`. DB records verified. Draft is immediately sendable via `sendApprovedDraftAction`.

---

**TC-SEB-002 — Pending (unapproved) version cannot create draft**
Input: `message_version.approval_status = 'pending'`, all other conditions valid
Expected: Blocked with `SEB_001`
Pass condition: `{ ok: false, error: 'SEB_001' }`. No draft record created.

---

**TC-SEB-003 — Rejected version cannot create draft**
Input: `message_version.approval_status = 'rejected'`
Expected: Blocked with `SEB_002`
Pass condition: `{ ok: false, error: 'SEB_002' }`. No draft record created.

---

**TC-SEB-004 — Superseded version cannot create draft**
Input: `message_version.approval_status = 'superseded'`
Expected: Blocked with `SEB_003`
Pass condition: `{ ok: false, error: 'SEB_003' }`. No draft created.

---

**TC-SEB-005 — Selected but not approved version cannot create draft**
Input: `message_version.approval_status = 'selected'`
Expected: Blocked with `SEB_001`
Pass condition: `{ ok: false, error: 'SEB_001' }`

---

**TC-SEB-006 — No contact linked to lead blocks draft creation**
Input: `message_version.approval_status = 'approved'`, lead has no `contact_id`
Expected: Blocked with `SEB_004`
Pass condition: No draft created. No supersede call made.

---

**TC-SEB-007 — Contact with no email address blocks draft creation**
Input: Approved version, contact exists but `contact.email = null`
Expected: Blocked with `SEB_005`
Pass condition: No draft created.

---

**TC-SEB-008 — do_not_contact contact blocks draft creation**
Input: Approved version, contact exists with email, `contact.do_not_contact = true`
Expected: Blocked with `SEB_006`
Pass condition: No draft created. No suppression check needed (do_not_contact check runs first).

---

**TC-SEB-009 — Suppressed contact email blocks draft creation**
Input: Approved version, contact with email, email is on suppression list
Expected: Blocked with `SEB_007`
Pass condition: No draft created.

---

**TC-SEB-010 — Unsubscribed contact email blocks draft creation**
Input: Approved version, contact with email, email is marked unsubscribed in suppression repo
Expected: Blocked with `SEB_007`
Pass condition: No draft created.

---

**TC-SEB-011 — Superseded strategy blocks draft creation**
Input: Approved version, but `message_strategy.status = 'superseded'`
Expected: Blocked with `SEB_008`
Pass condition: No draft created.

---

**TC-SEB-012 — Empty subject_line blocks draft creation**
Input: Approved version, `subject_line = ''`
Expected: Blocked with `SEB_009`
Pass condition: No draft created.

---

**TC-SEB-013 — Empty body_text blocks draft creation**
Input: Approved version, `body_text = ''`
Expected: Blocked with `SEB_009`
Pass condition: No draft created.

---

**TC-SEB-014 — Non-null body_html blocks draft creation**
Input: Approved version, `body_html = '<p>content</p>'` (Phase 3B invariant violation)
Expected: Blocked with `SEB_010`
Pass condition: No draft created.

---

**TC-SEB-015 — Duplicate draft for same version is blocked**
Input: Approved version, a non-superseded, non-rejected draft already exists in `email_drafts` with `ai_generation_metadata.message_version_id = versionId`
Expected: Blocked with `SEB_011`. Existing draft is not affected.
Pass condition: `{ ok: false, error: 'SEB_011' }`. Only one draft record exists for this version.

---

**TC-SEB-016 — Duplicate guard allows creation after prior draft was rejected**
Input: Approved version, a prior draft for this version exists but its `status = 'rejected'`
Expected: Draft creation proceeds. New draft created with `status = 'approved'`. Approval_request created and resolved.
Pass condition: `{ ok: true, draftId: 'new-uuid' }`. Two draft records exist for this version; new one is `approved` and active.

---

**TC-SEB-017 — Duplicate guard allows creation after prior draft was superseded**
Input: Approved version, a prior draft for this version exists but its `status = 'superseded'`
Expected: Draft creation proceeds. New draft created.
Pass condition: `{ ok: true }`. New active draft exists.

---

**TC-SEB-018 — No default sender identity configured blocks draft creation**
Input: All conditions valid, but no sender identity with `is_default = true` exists for the workspace
Expected: Blocked with `SEB_012`
Pass condition: No draft created.

---

**TC-SEB-019 — Tenant mismatch blocks draft creation**
Input: `message_version.tenant_id` differs from request context `tenant_id`
Expected: Blocked with `SEB_013`
Pass condition: No draft created.

---

**TC-SEB-020 — User without permission blocked**
Input: Valid approved version, but user lacks required permission
Expected: Blocked with `SEB_014`
Pass condition: No draft created.

---

**TC-SEB-021 — Draft created with correct Phase 3B provenance in metadata**
Input: Approved version with known `strategy_id`, `quality_review.id`, `composite_score = 82`, `is_recommended = true`, approved by `userId`
Expected: Draft `ai_generation_metadata` contains:
  - `source = 'phase_3b_send_bridge'`
  - `message_version_id = versionId`
  - `strategy_id = strategyId`
  - `quality_review_id = qualityReviewId`
  - `composite_score = 82`
  - `is_recommended = true`
  - `approved_by = userId`
  - `reason_created = 'phase_3b_hrb_approval'`
Pass condition: All fields present and correct in DB record.

---

**TC-SEB-022 — Existing pending draft for lead is superseded after new draft is created**
Input: Approved version for lead-1. An existing `email_draft` with `status = 'pending_approval'` exists for lead-1 (from a different version or prior flow).
Expected: New draft created with `status = 'approved'`. After all writes succeed, prior draft transitioned to `status = 'superseded'`.
Pass condition: Two draft records exist; prior is `superseded`, new is `approved`. Supersede runs after all new draft writes complete (see Section 13.3 for ordering rationale).

---

**TC-SEB-023 — Draft body_html is null for all Phase 3B-originated drafts**
Input: Any valid approved version (body_text present, body_html null)
Expected: Created draft has `body_html = null`
Pass condition: `email_drafts.body_html IS NULL`. Confirmed in DB record.

---

**TC-SEB-024 — Draft is not automatically sent**
Input: Draft successfully created (status = `approved` after bridge completes)
Expected: No `email_sends` row created. No Resend API call made. Draft is `approved` but NOT sent.
Pass condition: `email_sends` table has no record with `draft_id = newDraftId`. Draft status is `approved`, not `sent`. Send requires a separate explicit reviewer action.

---

**TC-SEB-025 — approval_request is created and auto-resolved to approved at draft creation**
Input: Draft successfully created from an approved version
Expected: An `approval_request` with `request_type = 'email_draft_review'` is created and immediately resolved to `status = 'approved'`. The `email_draft.approval_request_id` references it. No pending approval in the reviewer's approval queue.
Pass condition: One `approval_requests` row found with `status = 'approved'` and correct `draft_id` in payload. No `pending` approval_request remains for this draft.

---

**TC-SEB-026 — Activity event emitted on successful draft creation**
Input: Draft successfully created
Expected: `SEB_ACTION_DRAFT_CREATED` activity event recorded with correct payload (`draft_id`, `message_version_id`, `strategy_id`, `user_id`, `timestamp`)
Pass condition: Activity event found in `activity_events` with correct fields.

---

**TC-SEB-027 — Activity event emitted on blocked draft creation**
Input: Draft creation blocked (any SEB error)
Expected: `SEB_ACTION_DRAFT_CREATION_BLOCKED` activity event recorded with `error_code` and `error_reason`
Pass condition: Activity event found with correct error code.

---

**TC-SEB-028 — Validation runs before supersede call**
Input: Valid approved version BUT contact has `do_not_contact = true`. An existing pending draft for this lead also exists.
Expected: Blocked with `SEB_006`. The existing pending draft is NOT superseded.
Pass condition: `{ ok: false, error: 'SEB_006' }`. Prior draft still in `pending_approval` status.

---

**TC-SEB-029 — Approved version from low-score override can create draft**
Input: Approved version, `composite_score = 62`, HRB approval included `overrideReason = 'Relationship context justifies'`, no critical risk flags, all safety checks pass
Expected: Draft created successfully. `ai_generation_metadata.composite_score = 62`, `override_reason` captured.
Pass condition: `{ ok: true }`. Draft includes override context in metadata.

---

**TC-SEB-030 — Regeneration after rejection does not inherit draft eligibility**
Input: Version-A was approved by HRB, then reviewer requested regeneration (which superseded Version-A). Version-B is new and pending.
Expected: Version-A is `superseded` → SEB_003 blocks draft creation. Version-B is `pending` → SEB_001 blocks. No draft created.
Pass condition: Both versions block correctly. No draft created.

---

**TC-SEB-031 — UI: "Create Email Draft" button appears for approved versions**
Input: `message_version.approval_status = 'approved'`, no existing draft for this version
Expected: "Create Email Draft" button is visible and enabled in the version card
Pass condition: Button renders correctly in approved state

---

**TC-SEB-032 — UI: "Ready to Send" state shown when draft already exists**
Input: `message_version.approval_status = 'approved'`, existing draft with `status = 'approved'` linked to this version
Expected: "View / Send Draft" link shown instead of "Create Email Draft". Draft is immediately sendable. No second "Create Draft" button.
Pass condition: UI correctly reflects `approved` draft state; "Create Email Draft" button is replaced by send-readiness indicator

---

**TC-SEB-033 — UI: Safety error displayed when contact has no email**
Input: Reviewer clicks "Create Email Draft", contact has no email address
Expected: Inline error in version card: "This contact has no email address. Add an email to proceed."
Pass condition: SEB_005 error message surfaced correctly in UI

---

**TC-SEB-034 — UI: Confirmation modal shown before draft creation**
Input: Reviewer clicks "Create Email Draft" on eligible approved version
Expected: Confirmation modal shows contact name, email address, and warning if an existing draft will be superseded
Pass condition: Modal renders with correct recipient details before any action is taken

---

**TC-SEB-035 — UI: Existing pending draft superseded warning in confirmation modal**
Input: Approved version, an existing `draft` or `pending_approval` email draft exists for the same lead
Expected: Confirmation modal prominently warns: "An existing draft will be superseded."
Pass condition: Warning message appears in the confirmation step

---

## 21. Acceptance Criteria

The design is complete and approvable when all of the following are true:

| Criterion | Met? |
|-----------|------|
| Bridge role and boundaries clearly defined | ✓ |
| Trigger model decided — explicit human action (Option B) | ✓ |
| Phase 3A infrastructure identified and reuse strategy defined | ✓ |
| No new database table required in v1 | ✓ |
| `ai_generation_metadata` payload structure defined | ✓ |
| Recipient resolution logic defined | ✓ |
| Safety checks defined and ordered before writes | ✓ |
| Duplicate guard strategy defined | ✓ |
| No-auto-send guarantee enforced at multiple layers | ✓ |
| Draft status model defined (using existing `email_drafts.status`) | ✓ |
| Phase 3A integration approach defined (bridge creates `approved` draft + auto-resolved approval_request; existing sendApprovedDraftAction works unchanged) | ✓ |
| Double-gate requirement of sendApprovedDraft understood and satisfied | ✓ |
| Atomicity limitations acknowledged with safe write ordering defined | ✓ |
| Application-level vs DB-enforced duplicate guard clearly distinguished | ✓ |
| UI behavior defined per version and draft state | ✓ |
| Error codes defined (SEB_001–SEB_014) | ✓ |
| Audit events defined (2 event types) | ✓ |
| Edge cases identified and handled | ✓ |
| 35 test cases defined | ✓ |
| No code written | ✓ |
| No SQL written | ✓ |
| No sending introduced | ✓ |
| Open questions identified | ✓ (see Section 22) |

---

## 22. Open Questions

The following questions should be resolved before or during the Implementation Plan. The most critical (question 1) is now resolved by this revision.

| # | Status | Question | Implication |
|---|--------|---------|-------------|
| 1 | **RESOLVED** | **Draft status and approval_request requirement.** `sendApprovedDraft` requires `draft.status = 'approved'` AND a linked `approval_request.status = 'approved'`. The bridge must create both and auto-resolve the approval_request. No second manual approval step is required. | Draft is created as `approved`, immediately sendable. Design updated accordingly. |
| 2 | Open | **Superseded strategy behavior.** If the strategy is superseded after the version was approved, should the bridge block? This design recommends blocking (SEB_008). | Could be relaxed: allow draft creation if HRB approved the version before the strategy was superseded. Implementation Plan should confirm. |
| 3 | Open | **`email_draft_versions` initial row.** Should the bridge auto-create a `version_type = 'original'` row in `email_draft_versions` on creation? | Low friction if omitted for v1; the table is populated on first edit. Implementation Plan should decide. |
| 4 | Open | **message_version_id FK migration (future).** A proper `message_version_id` column with a partial unique index on `email_drafts` would replace the jsonb guard and provide DB-enforced uniqueness. | Flag for Phase 3B v2 / Learning Agent phase. Not needed for v1. |
| 5 | Open | **UI placement.** Should "Create Email Draft" live in `GeneratedVersionsPanel.tsx` or in a dedicated lead-level section? | Both valid. Recommend `GeneratedVersionsPanel` for v1 (keeps workflow cohesive). Implementation Plan should confirm. |
| 6 | Open | **`email_sending_enabled` gate.** Should a disabled sending system control block draft creation or only display a warning? | Recommended: warning in UI only; do not block draft creation. Implementation Plan should confirm. |

---

## 23. Recommended Next Step

Once this design is approved by the user:

**Phase 3B Send / Email Draft Bridge — Implementation Plan**

That plan should specify:

1. Whether superseded strategy blocks draft creation (v1: yes — SEB_008, or confirm relaxed)
2. Whether `email_draft_versions` initial row is created automatically
3. Whether `email_sending_enabled` gates draft creation or display only
4. Exact module structure: `modules/messaging/send-bridge/`
5. Exact service functions and their signatures (see Section 15.1 for conceptual spec)
6. Exact repository additions needed (one new read helper `getEmailDraftForVersion`; Phase 3A functions called directly)
7. Partial-failure handling strategy for the multi-step write sequence (see Section 13.3)
8. UI component changes to `GeneratedVersionsPanel.tsx`
9. Activity event type constants to add to `modules/intelligence/types.agent.ts`
10. Test fixtures: `tests/fixtures/send-bridge/TC-SEB-001.json` through `TC-SEB-035.json`
11. Test file: `tests/send-bridge.test.ts`
12. QA checklist: vitest (≥ 35 new tests), build, TypeScript, lint

---

*Document status: Draft. Awaiting user approval before implementation planning begins.*
*Version: 1.0 — 2026-05-21*
