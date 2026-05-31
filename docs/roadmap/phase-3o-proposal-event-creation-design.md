# Phase 3O — Proposal Event Creation From Captures Design

**Status:** Design only — awaiting implementation authorization  
**Created:** 2026-05-31  
**Revised:** 2026-05-31 (Codex review rev 1 — mandatory link step, idempotency strengthening, commitment count validation)  
**Predecessor:** Phase 3N — Proposal Capture System v1 (locked `phase-3n-proposal-capture-system-v1`, commit `42b1b69`)  
**Migration required:** None — all tables exist from migration `20240038`

---

## 1. Executive Summary

Phase 3N built the capture → review → match workflow. When an operator reviews an inbox capture and clicks "Match to Lead," the capture is marked `matched` with `matched_lead_id` set — but **no `proposal_event` is created and `resolved_event_id` remains null**. This was an explicit, documented deferral (Slice 7 comment):

> "Slice 7 marks the capture as matched only — proposal event creation remains a separate step (manual capture flow or later ingest pipeline)."

Phase 3O closes this gap. It introduces a single, operator-initiated "Create Proposal Event" action that converts a matched-but-unresolved capture into a normalized `proposal_event` record with associated follow-up commitments. No email is sent. No automation is triggered. No new database tables are required.

---

## 2. Current Phase 3N Foundation

### What exists

| Asset | Status |
|---|---|
| `proposal_captures` table | Exists — migration 20240038 |
| `proposal_events` table | Exists — migration 20240038 |
| `proposal_follow_up_commitments` table | Exists — migration 20240038 |
| `proposal_captures.resolved_event_id` FK | Exists — points to `proposal_events.id` |
| `getCaptureById` repo | Exists — tenant + workspace scoped |
| `createProposalEvent` repo | Exists — used by manual flow |
| `createFollowUpCommitments` repo | Exists — used by manual flow |
| `updateCaptureMatchStatus` repo | Exists — sets resolved_event_id |
| `getOpenProposalEventForLead` repo | Exists — guards one-open-proposal rule |
| `buildFollowUpCommitmentsFromRule` lib | Exists — deterministic, schedule-rule-driven |
| `isFutureDate` lib | Exists — date validation |
| `isClosedProposalStatus` lib | Exists — terminal status check |
| Inbox list page | Exists — `/proposal-inbox` |
| Capture detail page | Exists — `/proposal-inbox/[captureId]` |
| `reviewProposalCaptureAction` | Exists — dismiss / match |

### What the manual flow already does

`createManualProposalCapture` (Slice 5) handles the full bundle atomically:

```
capture created → proposal_event created → capture.resolved_event_id set → commitments created
```

This works only for operator-initiated "mark as sent" flows where all proposal details are known upfront.

### The gap Phase 3O fills

For captures that arrive via BCC/forward/inbox review (non-manual path):

```
capture arrives (pending)
  → operator reviews → "Match to Lead"
  → capture: match_status='matched', matched_lead_id set
  → ⚠️  resolved_event_id = null (no proposal_event created)
  → ⚠️  no follow-up commitments created
  → Phase 3O: operator clicks "Create Proposal Event"
  → proposal_event created + resolved_event_id set + commitments created
```

---

## 3. Problem Statement

After a capture is matched to a lead, it remains in a partial state:
- Verian knows a proposal was sent (or is being tracked)
- Verian does not have a normalized proposal lifecycle record
- No follow-up commitments exist
- Future automation phases (calendar scheduling, follow-up trigger) have no event to anchor to
- The capture detail UI shows "matched" but offers no path forward

The fix is a single operator-initiated conversion step with explicit input for the proposal sent date.

---

## 4. Proposed Concept: Capture-to-Event Conversion

A **conversion** is the act of creating a `proposal_event` from an existing matched capture, setting `resolved_event_id` on the capture, and creating follow-up commitments. It is:

- **Operator-initiated** — never automatic
- **Idempotent** — a capture with a non-null `resolved_event_id` cannot be converted again
- **Explicit about date** — the operator must confirm or provide `proposal_sent_at`
- **Scoped** — tenant + workspace boundary enforced at every layer
- **Commitment-creating** — creates follow-up commitments using the same schedule-rule system as the manual flow
- **Send-free** — no email, no campaign trigger, no Inngest invocation
- **Atomically complete** — a conversion is only considered successful when ALL THREE conditions hold simultaneously: the `proposal_event` exists, `capture.resolved_event_id` points to it, and commitments were created at the expected count. Any single step failure rolls back the event.

---

## 5. Eligibility Rules

A capture is eligible for conversion if and only if ALL of the following are true:

| Condition | Rule |
|---|---|
| `match_status === 'matched'` | Dismissed captures cannot be converted |
| `resolved_event_id IS NULL` | Already-converted captures are idempotent-rejected |
| `matched_lead_id IS NOT NULL` | Lead must be present (set during match review) |
| `deleted_at IS NULL` | Soft-deleted captures cannot be converted |
| Lead still exists in same workspace | Validated at conversion time, not just at match time |
| No open proposal for that lead | Enforced by one-open-proposal DB constraint + server guard |

Ineligible captures:
- `match_status === 'pending'` → not yet reviewed
- `match_status === 'dismissed'` → explicitly rejected, must not be converted
- `match_status === 'unmatched'` → no lead assigned
- `resolved_event_id IS NOT NULL` → already converted, return `already_resolved` error

---

## 6. Idempotency

`proposal_captures.resolved_event_id` is the capture-level idempotency key — **but only because it is written reliably as a mandatory step, not as a best-effort side-effect.**

### Idempotency contract

A conversion is complete and idempotent-safe only when ALL of the following are true:
1. `proposal_event` exists and is not withdrawn
2. `capture.resolved_event_id` points to that `proposal_event`
3. Follow-up commitments were created at the full planned count (non-zero, equals `planned.length`)

If any condition is not met, the service must withdraw the event, leave `resolved_event_id` null, and return `create_failed`. An operator may then retry safely.

### Checks

- Before any DB write: check `capture.resolved_event_id`. If non-null → return `{ ok: false, error: 'already_resolved' }`.
- After writing `proposal_event`: set `resolved_event_id` on the capture. **Failure here is fatal — withdraw the event and return `create_failed`.** Do not proceed to commitment creation with `resolved_event_id` unset.
- After creating commitments: validate `created.length > 0 && created.length === planned.length`. If not satisfied — withdraw the event and return `create_failed`.
- The DB FK `proposal_captures_resolved_event_id_fkey` prevents a capture from pointing to a deleted event.

### Note on the one-open-proposal index

`idx_proposal_events_one_open_per_lead` protects against duplicate open proposals at the lead level under concurrent writes. It does not replace capture-level idempotency — a second conversion attempt for the same capture after a partial failure must still be caught by the `resolved_event_id` check, not by the DB index alone.

**Concurrent conversion attempts:** If two requests race on the same capture, the second will find `resolved_event_id` already set (assuming the first writer completed fully) and return `already_resolved`. This is safe — the first writer wins.

A future phase may add a DB unique partial index on `resolved_event_id WHERE resolved_event_id IS NOT NULL` if automated-scale race safety requires it. For Phase 3O, the sequential check is sufficient given the operator-driven (non-automated) context.

---

## 7. Proposal Sent Date — The Key Ambiguity

The `raw_received_at` field on a capture records **when Verian received or processed the capture**, not when the proposal was sent to the client. These can differ by hours or days.

### Resolution

- The operator must **confirm or override** `proposal_sent_at`.
- The UI should **pre-populate** the field with `raw_received_at` as a default (most captures are processed same-day or next-day).
- The service should **reject future dates** (`isFutureDate` — existing utility).
- The service should **accept dates up to 90 days in the past** (proposals captured late are common; no lower-bound restriction in Phase 3O).

This is the only field that cannot be fully derived from the capture record. All other fields (leadId, companyId, contactId) come from the capture's matched FK values.

---

## 8. Data Flow

### Input to the conversion service

```typescript
interface ConvertCaptureToProposalEventInput {
  captureId: string
  proposalSentAt: string          // operator-confirmed ISO 8601 UTC
  proposalReference?: string | null
  proposalAmount?: number | null
  proposalCurrency?: string       // default: 'USD'
  estimatedSavings?: number | null
  scheduleRuleKey?: string        // default: 'standard_3_5_10'
}
```

### Fields derived server-side (never from client)

| Field | Source |
|---|---|
| `tenantId` | `buildRequestContext(supabase)` |
| `workspaceId` | `buildRequestContext(supabase)` |
| `userId` | `buildRequestContext(supabase)` |
| `leadId` | `capture.matched_lead_id` |
| `companyId` | `lead.company_id` (re-loaded from lead, not from capture field) |
| `contactId` | `capture.matched_contact_id` |
| `captureSource` | `capture.capture_source` |
| `captureId` | the capture's own `id` |

### Compensating cleanup pattern (same as manual flow, with mandatory link step)

Steps are sequential; each step compensates if a later step fails.

```
Step 1: Validate proposalSentAt — isFutureDate check
  ↳ on failure: return invalid_proposal_sent_at (no DB calls made)
Step 2: Load capture — getCaptureById
  ↳ on null: return capture_not_found
Step 3: Validate eligibility — match_status, resolved_event_id, matched_lead_id
  ↳ on resolved_event_id non-null: return already_resolved
  ↳ on wrong match_status: return capture_not_eligible
  ↳ on null matched_lead_id: return capture_not_eligible
Step 4: Re-load lead — getLead; validate workspace membership; derive companyId
  ↳ on null or wrong workspace: return lead_not_found
Step 5: Check one-open-proposal guard — getOpenProposalEventForLead
  ↳ on existing open proposal: return open_proposal_exists
Step 6: Create proposal_event — createProposalEvent
  ↳ on 23505/constraint violation: return open_proposal_exists
  ↳ on other failure: return create_failed (nothing to compensate yet)
Step 7: Set resolved_event_id on capture — updateCaptureMatchStatus (MANDATORY)
  ↳ on failure: withdraw proposal_event → return create_failed
  ↳ NOTE: this step is FATAL — do not continue to Step 8 if it fails.
    A live open event with no resolved_event_id link is an inconsistent state.
Step 8: Create follow-up commitments — createFollowUpCommitments
  ↳ on throw: withdraw proposal_event → return create_failed
  ↳ on zero results (created.length === 0): withdraw proposal_event → return create_failed
  ↳ on partial results (created.length !== planned.length): withdraw → return create_failed
  ↳ NOTE: an open event with no commitments or partial commitments must not be left active.
```

**Commitment count validation rule:** After `createFollowUpCommitments` returns, the service must assert:
```
created.length > 0 && created.length === planned.length
```
Any deviation (zero, partial, or excess) is treated as a fatal failure with event withdrawal. This matches the guard already present in `createManualProposalCapture` (Phase 3N Slice 5).

### Result type

```typescript
type ConvertCaptureToProposalEventResult =
  | { ok: true; proposalEventId: string; captureId: string; commitmentCount: number }
  | { ok: false; error:
      | 'capture_not_found'
      | 'capture_not_eligible'     // pending, dismissed, or unmatched
      | 'already_resolved'         // resolved_event_id already set
      | 'lead_not_found'           // lead no longer exists in this workspace
      | 'open_proposal_exists'     // one-open-proposal rule violation
      | 'invalid_proposal_sent_at' // null, invalid, or future date
      | 'create_failed'            // unexpected DB write failure
    }
```

---

## 9. Tenant / Workspace Scoping Rules

Every layer applies both `tenant_id` and `workspace_id`:

| Layer | Scoping |
|---|---|
| `getCaptureById` | `.eq('tenant_id').eq('workspace_id')` — already correct |
| `getOpenProposalEventForLead` | `.eq('tenant_id').eq('workspace_id')` — already correct |
| `createProposalEvent` | `tenant_id` and `workspace_id` from context, not input |
| `createFollowUpCommitments` | `tenant_id` and `workspace_id` from context |
| `updateCaptureMatchStatus` (link step) | `.eq('tenant_id').eq('workspace_id')` — already correct |
| Lead re-validation | `getLead(input.leadId, tenantId)` + `lead.workspace_id !== workspaceId` check |
| Server action | `tenantId`, `workspaceId`, `userId` exclusively from `buildRequestContext` |

Client input is limited to: `captureId`, `proposalSentAt`, `proposalReference`, `proposalAmount`, `proposalCurrency`, `estimatedSavings`, `scheduleRuleKey`. No `tenantId`, `workspaceId`, `leadId`, `companyId`, or `contactId` may be accepted from client payload.

---

## 10. UI Behavior

### Where the action appears

On `app/(workspace)/[workspaceSlug]/proposal-inbox/[captureId]/page.tsx`:

Show the "Create Proposal Event" panel **only when:**
- `capture.match_status === 'matched'`
- `capture.resolved_event_id === null`
- `capture.matched_lead_id !== null`

Do **not** show it when:
- `match_status === 'dismissed'`
- `match_status === 'pending'`
- `resolved_event_id !== null` (already resolved — show read-only event link instead)

### Panel content

```
[Create Proposal Event]

Proposal sent at *
  <input type="datetime-local"> (pre-populated from raw_received_at if available)

Proposal reference (optional)
  <input type="text">

Proposal amount (optional)
  <input type="number" step="0.01">

Currency
  <select>USD / GBP / EUR / other</select>

Estimated savings (optional)
  <input type="number" step="0.01">

Follow-up schedule
  <select>Standard 3/5/10 days | Aggressive 2/4/7 days | Light 5/14 days | Single 7 days</select>

[Create Proposal Event]  ← disabled while loading
```

### After success

- Hide the form
- Show a success card: "Proposal event created. ID: `{proposalEventId}`. `{commitmentCount}` follow-up commitments scheduled."
- `router.refresh()` to reload server data
- Back link to inbox still available

### After failure

- Show inline error (same pattern as `ProposalCaptureReviewActions`)
- Keep form values so operator can retry

### Already-resolved state

When `resolved_event_id` is non-null, show a read-only card:
```
Proposal Event Created
Event ID: {resolved_event_id}
```

No action buttons. The capture is fully resolved.

---

## 11. Repository Plan

No new repository methods are required. All needed calls exist:

| Method | File | Already exists |
|---|---|---|
| `getCaptureById` | `proposal-captures.repo.ts` | Yes |
| `updateCaptureMatchStatus` (set `resolvedEventId`) | `proposal-captures.repo.ts` | Yes |
| `getOpenProposalEventForLead` | `proposal-events.repo.ts` | Yes |
| `createProposalEvent` | `proposal-events.repo.ts` | Yes |
| `createFollowUpCommitments` | `proposal-follow-up-commitments.repo.ts` | Yes |
| `getLead` | `crm/repositories/lead.repo.ts` | Yes |

---

## 12. Service Plan

### New file
`modules/proposals/services/capture-to-event-conversion.service.ts`

### Exports

```typescript
export interface ConvertCaptureToProposalEventInput { ... }

export type ConvertCaptureToProposalEventResult =
  | { ok: true; proposalEventId: string; captureId: string; commitmentCount: number }
  | { ok: false; error: ConvertCaptureError }

export async function convertCaptureToProposalEvent(
  tenantId: string,
  workspaceId: string,
  userId: string,
  input: ConvertCaptureToProposalEventInput
): Promise<ConvertCaptureToProposalEventResult>
```

### Internal constants

```typescript
const ELIGIBLE_STATUSES_FOR_CONVERSION = ['matched'] as const
```

`pending`, `dismissed`, `unmatched`, and `manual_override` are all ineligible. Only `matched` captures with a null `resolved_event_id` may be converted.

### Key internal guards (in order)

1. Validate `proposalSentAt` — `isFutureDate` → `invalid_proposal_sent_at`
2. Load capture via `getCaptureById` — null → `capture_not_found`
3. Check `capture.resolved_event_id` — non-null → `already_resolved`
4. Check `capture.match_status` — not `'matched'` → `capture_not_eligible`
5. Check `capture.matched_lead_id` — null → `capture_not_eligible`
6. Re-load lead — null or cross-workspace → `lead_not_found`; derive `companyId` from lead
7. Check `getOpenProposalEventForLead` — non-null → `open_proposal_exists`
8. `createProposalEvent` — catch 23505/constraint → `open_proposal_exists`; other → `create_failed`
9. `updateCaptureMatchStatus` with `resolvedEventId` — **failure is FATAL**: `withdrawEventForCleanup` → return `create_failed`. Do not continue to step 10.
10. `createFollowUpCommitments` — on throw OR `created.length === 0` OR `created.length !== planned.length`: `withdrawEventForCleanup` → return `create_failed`

---

## 13. Server Action Plan

### New file
`modules/proposals/actions/capture-to-event-conversion.actions.ts`

```typescript
'use server'

export interface ConvertCaptureToProposalEventActionInput {
  captureId: string
  proposalSentAt: string
  proposalReference?: string | null
  proposalAmount?: number | null
  proposalCurrency?: string
  estimatedSavings?: number | null
  scheduleRuleKey?: string
}

export async function convertCaptureToProposalEventAction(
  input: ConvertCaptureToProposalEventActionInput
): Promise<ActionResult<{ proposalEventId: string; captureId: string; commitmentCount: number }>>
```

Rules:
- `tenantId`, `workspaceId`, `userId` exclusively from `buildRequestContext`
- Permission check: `requirePermission(ctx, 'crm.leads.view')` — consistent with other proposal actions
- No `leadId`, `companyId`, `contactId`, `tenantId`, or `workspaceId` accepted from client input

---

## 14. UI Component Plan

### New client component
`app/(workspace)/[workspaceSlug]/proposal-inbox/[captureId]/ProposalCaptureConvertAction.tsx`

```typescript
'use client'
// Props: captureId, backHref, defaultSentAt (raw_received_at from server), workspaceSlug
// State: proposalSentAt, proposalReference, proposalAmount, proposalCurrency,
//        estimatedSavings, scheduleRuleKey, loading, error, result
// On submit: convertCaptureToProposalEventAction(...)
// On success: show result card; router.refresh()
// On error: show inline error; keep form values
```

### Server page update
`app/(workspace)/[workspaceSlug]/proposal-inbox/[captureId]/page.tsx`

Add conditional section between "Review Result" card and the existing `ProposalCaptureReviewActions`:

```
if match_status === 'matched' && resolved_event_id === null:
  render <ProposalCaptureConvertAction ... />
elif resolved_event_id !== null:
  render read-only "Proposal Event Created" card showing resolved_event_id
```

---

## 15. Migration Assessment

**No new migration is required.** All tables and columns exist:

| Need | Column | Status |
|---|---|---|
| Store event | `proposal_events.*` | Exists (migration 20240038) |
| Link capture → event | `proposal_captures.resolved_event_id` | Exists (migration 20240038) |
| Track commitments | `proposal_follow_up_commitments.*` | Exists (migration 20240038) |
| One-open-proposal guard | `idx_proposal_events_one_open_per_lead` | Exists (migration 20240038) |

The Phase 3O implementation is purely code — no new tables, columns, indexes, or constraints.

---

## 16. Testing Plan

All tests use the existing Phase 3N pattern: `fs.readFileSync` + `toContain` / regex, pure-function imports. No Supabase mocking. No LLM mocking. Tests are added to `tests/phase3n-proposal-capture.test.ts` (or a new `tests/phase3o-capture-conversion.test.ts`).

### Source-reading tests (conversion service)

| TC | Description |
|---|---|
| TC-3O-001 | Service file imports `getCaptureById`, `createProposalEvent`, `updateCaptureMatchStatus`, `createFollowUpCommitments`, `getOpenProposalEventForLead` |
| TC-3O-002 | Service file imports `getLead` from CRM lead repo |
| TC-3O-003 | Service file imports `isFutureDate` |
| TC-3O-004 | Service file imports `buildFollowUpCommitmentsFromRule` |
| TC-3O-005 | Service exports `ConvertCaptureToProposalEventInput` interface |
| TC-3O-006 | Service exports `ConvertCaptureToProposalEventResult` type with `ok: true` arm |
| TC-3O-007 | Service exports `ConvertCaptureToProposalEventResult` type with `already_resolved` error |
| TC-3O-008 | Service exports `ConvertCaptureToProposalEventResult` type with `capture_not_eligible` error |
| TC-3O-009 | Service exports `ConvertCaptureToProposalEventResult` type with `open_proposal_exists` error |
| TC-3O-010 | Service exports `ConvertCaptureToProposalEventResult` type with `invalid_proposal_sent_at` error |
| TC-3O-011 | Service checks `isFutureDate` before any DB call |
| TC-3O-012 | Service checks `capture.resolved_event_id` before creating event |
| TC-3O-013 | Service checks `capture.match_status` against eligible statuses |
| TC-3O-014 | Service checks `capture.matched_lead_id` is non-null |
| TC-3O-015 | Service validates lead workspace membership (`lead.workspace_id !== workspaceId`) |
| TC-3O-016 | Service derives `companyId` from lead — comment confirms "account domain field" not used |
| TC-3O-017 | Service calls `getOpenProposalEventForLead` before `createProposalEvent` |
| TC-3O-018 | Service catches `23505`/constraint error and maps to `open_proposal_exists` |
| TC-3O-019 | Service sets `resolvedEventId` via `updateCaptureMatchStatus` after event creation |
| TC-3O-020 | Service calls `buildFollowUpCommitmentsFromRule` with provided or default rule |
| TC-3O-021 | Service calls `withdrawEventForCleanup` on commitment creation failure |
| TC-3O-022 | Service does NOT import OpenAI, Anthropic, Claude, Resend, or Inngest |
| TC-3O-023 | Service does NOT contain `EMAIL_SENDING_ENABLED` or `CAMPAIGN_SENDING_ENABLED` |
| TC-3O-024 | Service does NOT call `sendEmail` or reference `send email` |
| TC-3O-025 | Service uses `DEFAULT_SCHEDULE_RULE_KEY` or `'standard_3_5_10'` as default fallback |

### Source-reading tests (action)

| TC | Description |
|---|---|
| TC-3O-026 | Action file has `'use server'` directive |
| TC-3O-027 | Action does not accept `tenantId`, `workspaceId`, or `leadId` in input interface |
| TC-3O-028 | Action calls `buildRequestContext` and `requirePermission` |
| TC-3O-029 | Action passes only `ctx.tenantId`, `ctx.workspaceId`, `ctx.userId` to service |
| TC-3O-030 | Action does NOT import OpenAI, Anthropic, Claude, Resend, or Inngest |

### Source-reading tests (UI)

| TC | Description |
|---|---|
| TC-3O-031 | Client component has `'use client'` directive |
| TC-3O-032 | Client component imports `convertCaptureToProposalEventAction` |
| TC-3O-033 | Client component uses `useRouter` and `useState` |
| TC-3O-034 | Client component does NOT have a "Send" button |
| TC-3O-035 | Detail page renders `ProposalCaptureConvertAction` only when `match_status === 'matched'` |
| TC-3O-036 | Detail page renders read-only event card when `resolved_event_id` is non-null |

### Source-reading tests — mandatory link step and commitment count guard

| TC | Description |
|---|---|
| TC-3O-041 | Service comment or code confirms that `updateCaptureMatchStatus` (resolved_event_id link) failure triggers `withdrawEventForCleanup` and returns `create_failed` — not `continue` |
| TC-3O-042 | Service validates `created.length > 0` after `createFollowUpCommitments` — zero results triggers withdrawal |
| TC-3O-043 | Service validates `created.length === planned.length` — partial commitment creation triggers withdrawal |
| TC-3O-044 | Service success path comment or structure confirms all three: event created, resolved_event_id linked, commitments at full count |

### Pure-function tests (eligibility)

| TC | Description |
|---|---|
| TC-3O-045 | `isFutureDate` rejects a date 1 second in the future |
| TC-3O-046 | `isFutureDate` accepts a date 1 second in the past |
| TC-3O-047 | `buildFollowUpCommitmentsFromRule` produces correct count for `standard_3_5_10` (3 items) |
| TC-3O-048 | `buildFollowUpCommitmentsFromRule` produces correct count for `light_5_14` (2 items) |

---

## 17. Safety Guardrails

| Risk | Mitigation |
|---|---|
| Duplicate event creation | `resolved_event_id` non-null check before any write; DB FK prevents orphan links |
| Live open event with no capture link | `resolved_event_id` link step is **mandatory and fatal** — failure withdraws the event |
| Partial commitment creation leaves open event | Count guard (`created.length > 0 && === planned.length`) — failure withdraws the event |
| Zero commitments silently accepted | Explicit `created.length === 0` check — treated as fatal failure, not empty success |
| Race condition on concurrent conversion | Server-side guard + DB `idx_proposal_events_one_open_per_lead` as race-safe last line |
| Cross-workspace mutation | `getCaptureById` scoped by `tenant_id + workspace_id`; lead re-validated at conversion time |
| Incorrect company association | `companyId` always derived from re-loaded lead, never from capture field or client input |
| Converting a dismissed capture | `capture_not_eligible` — only `match_status === 'matched'` is allowed |
| Future proposal_sent_at | `isFutureDate` check before any DB write |
| Committing follow-up at wrong schedule | Operator selects rule from curated list; `buildFollowUpCommitmentsFromRule` is deterministic |
| Accidental email/campaign trigger | No Resend, Inngest, or email send import anywhere in Phase 3O files |
| Misusing raw body/subject content | Conversion service reads only structured FK fields from the capture; raw content is never forwarded to external services |
| Creating obligations for already-closed lead | One-open-proposal guard catches this; operator should review before converting |

---

## 18. Out-of-Scope Items (Explicit)

| Item | Deferred to |
|---|---|
| Automated conversion of matched captures | Future automation phase |
| Sending follow-up emails | Email sending remains disabled |
| Campaign trigger on conversion | CAMPAIGN_SENDING_ENABLED remains disabled |
| BCC/forward capture ingest handler | Future ingest pipeline phase |
| Proposal event detail page / route | Future UI phase |
| AI/LLM parsing of raw body for proposal details | Future AI-enrichment phase |
| Calendar sync for follow-up commitments | Phase 4 |
| Bulk conversion of multiple captures | Future batch processing phase |
| Re-conversion (changing event after resolution) | Requires separate re-link workflow — not Phase 3O |

---

## 19. Recommended Implementation Slices

| Slice | Deliverable | Files |
|---|---|---|
| 3O-1 | Design document (this document) | `docs/roadmap/phase-3o-proposal-event-creation-design.md` |
| 3O-2 | Conversion service | `modules/proposals/services/capture-to-event-conversion.service.ts` |
| 3O-3 | Server action wrapper | `modules/proposals/actions/capture-to-event-conversion.actions.ts` |
| 3O-4 | UI — client component + server page update | `[captureId]/ProposalCaptureConvertAction.tsx`, `[captureId]/page.tsx` |
| 3O-5 | Tests — source-reading + pure-function | `tests/phase3o-capture-conversion.test.ts` |
| 3O-6 | Safety review + Codex review | No code — review only |
| 3O-7 | Lock tag | `phase-3o-capture-to-event-v1` |

### Slice boundaries

Each slice should be committed and pushed individually. Tests must pass at every slice boundary. No code may introduce email sending, campaign automation, or LLM imports at any slice.

---

## 20. Codex Review Checkpoint

Before lock, Codex should review:
- Service eligibility guards (all conditions in order)
- Mandatory `resolved_event_id` link step — confirmed fatal on failure, not non-fatal
- Commitment count guard — `created.length > 0 && === planned.length` confirmed present
- Compensating cleanup chain — event withdrawn on link failure AND on commitment failure
- Idempotency check (`resolved_event_id` non-null guard runs before any DB write)
- Server action input surface (no `tenantId`, `workspaceId`, `leadId`, `companyId`, `contactId` from client)
- UI conditional rendering (not shown for dismissed, pending, or already-resolved)
- Forbidden import scan (no OpenAI, Anthropic, Resend, Inngest)

---

## 21. Lock Criteria

Phase 3O is ready to lock when:
- [ ] All slice commits are pushed to `origin/master`
- [ ] All Phase 3O tests pass
- [ ] All Phase 3N tests (250) still pass
- [ ] `resolved_event_id` is correctly set after a successful conversion
- [ ] If `resolved_event_id` link step fails after event creation: event is withdrawn and `create_failed` is returned — tested
- [ ] If `createFollowUpCommitments` returns zero results: event is withdrawn and `create_failed` is returned — tested
- [ ] If `createFollowUpCommitments` returns fewer than planned: event is withdrawn and `create_failed` is returned — tested
- [ ] No converted capture can remain with `resolved_event_id = null` while leaving an active open `proposal_event` behind
- [ ] Converting a dismissed capture returns `capture_not_eligible`
- [ ] Converting an already-resolved capture returns `already_resolved`
- [ ] Converting when lead already has an open proposal returns `open_proposal_exists`
- [ ] No email, campaign, or LLM imports in any Phase 3O file
- [ ] Codex review returns no Critical, High, or Medium findings
- [ ] Working tree is clean
- [ ] No new migrations were created or applied
- [ ] Production remains untouched
- [ ] EMAIL_SENDING_ENABLED remains disabled
- [ ] CAMPAIGN_SENDING_ENABLED remains disabled
- [ ] Lock tag `phase-3o-capture-to-event-v1` created and pushed

---

*Document generated: 2026-05-31. Phase 3N lock commit: `42b1b6992868a7f20183ddd6a3fa853e7d8bed98`.*
