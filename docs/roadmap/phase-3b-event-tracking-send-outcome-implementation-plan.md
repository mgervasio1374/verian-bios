# Phase 3B Event Tracking / Send Outcome Tracking — Implementation Plan

**Status:** Draft — Awaiting user approval before code implementation begins.
**Version:** 1.0
**Date:** 2026-05-21
**Prerequisite:** Design & Test Cases v1.0 approved (`docs/roadmap/phase-3b-event-tracking-send-outcome-design-test-cases.md`)

---

## 1. Executive Summary

This plan defines the engineering build for Phase 3B Event Tracking / Send Outcome Tracking — the observation and attribution layer that records what happens after a Phase 3B-originated email is sent through the existing Phase 3A send flow.

**What this implementation builds:**
- A `event-tracking` helper module with pure attribution functions and audit payload builders
- Enrichment of `email_sends.metadata` with Phase 3B provenance at send time
- Three internal activity events emitted from `email-send.service.ts` (`ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED`)
- Six webhook-triggered activity events emitted from `route.ts` (delivered, bounced, complained, delivery_failed, opened, clicked)
- Nine new `ActivityEventType` constants in `types.agent.ts` (additive only)
- A new `getSendStatusForDraft` read helper in `email-send.repo.ts`
- Extended `page.tsx` to load send delivery status for sent versions
- Extended `GeneratedVersionsPanel.tsx` to display delivery status badges
- 35 test fixtures and a new `event-tracking.test.ts` suite

**What this implementation does not build:**
- No Learning Agent behavior
- No score updates
- No generated copy changes
- No new database tables or migrations
- No new sends initiated by event tracking
- No Resend API calls beyond the existing send flow
- No reply tracking
- No auto-suppression on bounce (complaint auto-suppression is existing Phase 3A behavior, unchanged)

**Test count expectation:** 456 existing + ≥ 35 ET = ≥ 491 total

---

## 2. Final v1 Decisions

All six open questions from the design document (Section 19) are resolved here.

| # | Question | v1 Decision |
|---|---------|------------|
| 1 | Does Resend send `email.sent` as a webhook event? | **No.** Resend only notifies delivery outcomes via webhooks. The API response message ID is the only "sent" confirmation. `ET_SEND_SUCCEEDED` is the internal event emitted when Resend accepts the email — no webhook handling needed for this. |
| 2 | Are open/click tracking enabled, or just passively supported? | **Passive support only.** Open and click events are captured if they arrive (i.e., if Resend tracking is enabled in the project). No configuration changes are mandated by this implementation. If tracking is disabled, `email.opened` and `email.clicked` webhooks simply won't arrive and no `ET_EMAIL_OPENED` / `ET_EMAIL_CLICKED` events are emitted. |
| 3 | Does `email.delivery_delayed` get an `ET_` activity event or remain log-only? | **Log-only in v1.** No `ET_EMAIL_DELIVERY_DELAYED` constant added. The existing `email_events` row is written (raw audit). No activity event. Consistent with the design's "log only" decision. |
| 4 | Is `ctx.userId` the correct `send_initiated_by`? | **Yes, confirmed.** `ctx.userId` in `sendApprovedDraft` is the authenticated reviewer who clicked "Send." This is the correct field. |
| 5 | Should hard bounces auto-suppress? | **No auto-suppression in v1.** Bounce observation is written to `activity_events` and `email_events`. No `unsubscribes` upsert on bounce. Existing Phase 3A auto-unsubscribe on complaint is unchanged. |
| 6 | Is `workspace_id` returned in the webhook `email_sends` lookup? | **Critical gap confirmed.** The current `processResendEvent` select is `'id, tenant_id, status'` only. `workspace_id`, `contact_id`, `company_id`, `draft_id`, and `metadata` are ALL absent. The select must be expanded to `'id, tenant_id, workspace_id, contact_id, company_id, draft_id, metadata'`. This is the most important implementation detail in this plan. |

---

## 3. Non-Goals

| Non-Goal | Reason |
|----------|--------|
| No Learning Agent behavior | Future work — explicitly deferred |
| No scoring or weight updates | Observation only; no reasoning |
| No QRA modification | QRA records locked |
| No HRB modification | HRB records locked |
| No Send Bridge modification | Send Bridge behavior locked |
| No generated copy changes | `body_text`, `subject_line` immutable |
| No new DB table or migration | All provenance in existing `metadata` jsonb |
| No new Resend API calls | Event tracking observes; it does not send |
| No auto-suppression on bounce | Only on complaint (existing Phase 3A behavior) |
| No reply tracking | Requires inbound email infrastructure; deferred |
| No delivery_delayed activity event | Log-only in v1 |

---

## 4. Implementation Scope

### 4.1 New Files to Create

| File | Purpose |
|------|---------|
| `modules/messaging/event-tracking/event-tracking.types.ts` | ET_ action type constants, Phase 3B metadata interface, event payload interfaces |
| `modules/messaging/event-tracking/event-tracking.attribution.ts` | Pure helpers: extract Phase 3B meta, detect Phase 3B origin, build enriched send metadata |
| `modules/messaging/event-tracking/event-tracking.audit.ts` | Pure payload builders for all 9 ET_ event types |
| `tests/fixtures/event-tracking/TC-ET-001.json` → `TC-ET-035.json` | 35 test fixtures |
| `tests/event-tracking.test.ts` | ET test suite |

### 4.2 Existing Files to Modify

| File | Change |
|------|--------|
| `modules/intelligence/types.agent.ts` | Add 9 ET_ `ActivityEventType` constants (additive only) |
| `modules/messaging/services/email-send.service.ts` | Phase 3B metadata enrichment in `sendMetadata`; emit `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` activity events |
| `modules/messaging/repositories/email-send.repo.ts` | Add `getSendStatusForDraft` read helper (delivery status lookup for UI) |
| `app/api/webhooks/resend/route.ts` | Expand `processResendEvent` select to include `metadata`, `workspace_id`, `contact_id`, `company_id`, `draft_id`; add Phase 3B activity event emission after `email_events` idempotency check |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx` | Add `sendStatusByDraftId` loading for `'sent'` draft versions; pass to `GeneratedVersionsPanel` |
| `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx` | Add `sendStatusByDraftId` prop; extend approved-version card to show delivery/bounce/complaint/open/click states |

### 4.3 Files Explicitly Not Modified

- All Phase 3B agent files (MSA, CA, QRA, HRB, Send Bridge) — locked
- `modules/messaging/services/email-draft.service.ts` — not needed
- `supabase/migrations/` — no new migrations in v1
- Any Phase 3A service other than `email-send.service.ts` and `email-send.repo.ts`

---

## 5. Proposed Module Structure

```
modules/
  messaging/
    event-tracking/
      event-tracking.types.ts          — ET_ constants, interfaces
      event-tracking.attribution.ts    — pure helpers for metadata extraction and detection
      event-tracking.audit.ts          — pure payload builders for all 9 ET_ events

    services/
      email-send.service.ts            — extend: Phase 3B enrichment + 3 internal events

    repositories/
      email-send.repo.ts               — extend: add getSendStatusForDraft

modules/
  intelligence/
    types.agent.ts                     — extend: add 9 ET_ constants

app/
  api/
    webhooks/
      resend/
        route.ts                       — extend: expand select, add Phase 3B activity events

  (workspace)/
    [workspaceSlug]/
      message-workspace/
        [leadId]/
          page.tsx                     — extend: load send delivery status
          GeneratedVersionsPanel.tsx   — extend: display delivery status per version card

tests/
  fixtures/
    event-tracking/
      TC-ET-001.json through TC-ET-035.json

  event-tracking.test.ts
```

---

## 6. Type Contracts and Interfaces

**File:** `modules/messaging/event-tracking/event-tracking.types.ts`

All types and constants use `as const`. No `enum` keyword.

### 6.1 Action Types

```
const ET_ACTION_TYPES = {
  ET_SEND_INITIATED:       'ET_SEND_INITIATED',
  ET_SEND_SUCCEEDED:       'ET_SEND_SUCCEEDED',
  ET_SEND_FAILED:          'ET_SEND_FAILED',
  ET_EMAIL_DELIVERED:      'ET_EMAIL_DELIVERED',
  ET_EMAIL_BOUNCED:        'ET_EMAIL_BOUNCED',
  ET_EMAIL_COMPLAINED:     'ET_EMAIL_COMPLAINED',
  ET_EMAIL_DELIVERY_FAILED:'ET_EMAIL_DELIVERY_FAILED',
  ET_EMAIL_OPENED:         'ET_EMAIL_OPENED',
  ET_EMAIL_CLICKED:        'ET_EMAIL_CLICKED',
} as const

type EtActionType = typeof ET_ACTION_TYPES[keyof typeof ET_ACTION_TYPES]
```

### 6.2 Phase 3B Metadata Interface

```
// Shape of Phase 3B fields extracted from email_drafts.ai_generation_metadata
// or email_sends.metadata (after enrichment at send time)
interface EtPhase3bMeta {
  source:              string          // 'phase_3b_send_bridge'
  message_version_id:  string | null
  strategy_id:         string | null
  quality_review_id:   string | null
  version_label:       string | null
  composite_score:     number | null
  approved_by:         string | null
  lead_id:             string | null   // stored in metadata at send time
  send_initiated_by:   string | null   // ctx.userId at send time
}
```

### 6.3 Event Payload Interfaces

```
// Payload written to activity_events.metadata for internal send events
interface EtSendEventPayload {
  action_type:          EtActionType
  email_send_id:        string
  draft_id:             string
  message_version_id:   string | null
  strategy_id:          string | null
  quality_review_id:    string | null
  version_label:        string | null
  composite_score:      number | null
  approved_by:          string | null
  send_initiated_by:    string | null
  to_email:             string | null
  resend_message_id?:   string | null   // present on ET_SEND_SUCCEEDED
  error_reason?:        string          // present on ET_SEND_FAILED
  timestamp:            string
}

// Payload written to activity_events.metadata for webhook-driven events
interface EtOutcomeEventPayload {
  action_type:          EtActionType
  email_send_id:        string
  draft_id:             string | null
  message_version_id:   string | null
  strategy_id:          string | null
  quality_review_id:    string | null
  version_label:        string | null
  composite_score:      number | null
  approved_by:          string | null
  send_initiated_by:    string | null
  resend_message_id:    string
  resend_event_type:    string          // e.g., 'email.delivered'
  occurred_at:          string
  timestamp:            string
}

// Result from getSendStatusForDraft (UI lookup)
interface SendStatusResult {
  sendId:     string
  sendStatus: string  // 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'
}
```

---

## 7. Attribution Helpers

**File:** `modules/messaging/event-tracking/event-tracking.attribution.ts`

Pure functions only — no I/O, no async.

### 7.1 `extractPhase3bMeta`

```
extractPhase3bMeta(aiGenerationMetadata: Record<string, unknown> | null): EtPhase3bMeta | null
```

Reads the `ai_generation_metadata` jsonb from either `email_drafts` (at send time) or `email_sends.metadata` (at webhook time). Returns `null` if `source !== 'phase_3b_send_bridge'`.

Implementation: Check `aiGenerationMetadata?.source === 'phase_3b_send_bridge'`. Extract typed fields. Return null if source mismatch or metadata is null.

### 7.2 `isPhase3bSend`

```
isPhase3bSend(sendMetadata: Record<string, unknown> | null): boolean
```

Returns `true` if `sendMetadata?.source === 'phase_3b_send_bridge'`. Used in the webhook handler to decide whether to emit Phase 3B activity events.

### 7.3 `buildPhase3bSendMetadata`

```
buildPhase3bSendMetadata(
  phase3bMeta: EtPhase3bMeta,
  sendInitiatedBy: string,
  leadId: string | null,
  existingFields: Record<string, unknown>
): Record<string, unknown>
```

Returns the enriched `email_sends.metadata` object. Merges Phase 3B fields into the existing send metadata fields (template_used, recommendation_used, etc.).

Result shape:
```json
{
  ...existingFields,
  "source":             "phase_3b_send_bridge",
  "message_version_id": "<uuid>",
  "strategy_id":        "<uuid>",
  "quality_review_id":  "<uuid>",
  "version_label":      "A",
  "composite_score":    82,
  "approved_by":        "<uuid>",
  "send_initiated_by":  "<uuid>",
  "lead_id":            "<uuid>"
}
```

### 7.4 Webhook Event Type → Activity Type Map

```
const RESEND_EVENT_TO_ET_TYPE: Record<string, EtActionType> = {
  'email.delivered':  'ET_EMAIL_DELIVERED',
  'email.bounced':    'ET_EMAIL_BOUNCED',
  'email.complained': 'ET_EMAIL_COMPLAINED',
  'email.failed':     'ET_EMAIL_DELIVERY_FAILED',
  'email.opened':     'ET_EMAIL_OPENED',
  'email.clicked':    'ET_EMAIL_CLICKED',
}
```

`email.delivery_delayed` is deliberately absent (log-only, no activity event).

---

## 8. Audit Payload Builders

**File:** `modules/messaging/event-tracking/event-tracking.audit.ts`

Pure functions only — no I/O, no async.

### 8.1 `buildSendInitiatedPayload`

```
buildSendInitiatedPayload(params: {
  emailSendId:       string
  draftId:           string
  phase3bMeta:       EtPhase3bMeta | null
  toEmail:           string
}): EtSendEventPayload
```

Returns payload with `action_type = 'ET_SEND_INITIATED'`. Phase 3B fields are null if `phase3bMeta` is null.

### 8.2 `buildSendSucceededPayload`

```
buildSendSucceededPayload(params: {
  emailSendId:       string
  draftId:           string
  phase3bMeta:       EtPhase3bMeta | null
  toEmail:           string
  resendMessageId:   string | null
}): EtSendEventPayload
```

Returns payload with `action_type = 'ET_SEND_SUCCEEDED'`. Includes `resend_message_id`.

### 8.3 `buildSendFailedPayload`

```
buildSendFailedPayload(params: {
  emailSendId:       string
  draftId:           string
  phase3bMeta:       EtPhase3bMeta | null
  toEmail:           string
  errorReason:       string
}): EtSendEventPayload
```

Returns payload with `action_type = 'ET_SEND_FAILED'`. Includes `error_reason`.

### 8.4 `buildWebhookOutcomePayload`

```
buildWebhookOutcomePayload(params: {
  etActionType:      EtActionType
  emailSendId:       string
  draftId:           string | null
  phase3bMeta:       EtPhase3bMeta | null
  resendMessageId:   string
  resendEventType:   string
  occurredAt:        string
}): EtOutcomeEventPayload
```

Used for all 6 webhook-driven event types. `etActionType` is looked up from `RESEND_EVENT_TO_ET_TYPE`.

---

## 9. `types.agent.ts` Changes

**File:** `modules/intelligence/types.agent.ts`

Add 9 ET_ constants to the `ActivityEventType` const object. **Additive only** — no existing entries modified.

```
  // Phase 3B — Event Tracking / Send Outcome Tracking (additive)
  ET_SEND_INITIATED:        'ET_SEND_INITIATED',
  ET_SEND_SUCCEEDED:        'ET_SEND_SUCCEEDED',
  ET_SEND_FAILED:           'ET_SEND_FAILED',
  ET_EMAIL_DELIVERED:       'ET_EMAIL_DELIVERED',
  ET_EMAIL_BOUNCED:         'ET_EMAIL_BOUNCED',
  ET_EMAIL_COMPLAINED:      'ET_EMAIL_COMPLAINED',
  ET_EMAIL_DELIVERY_FAILED: 'ET_EMAIL_DELIVERY_FAILED',
  ET_EMAIL_OPENED:          'ET_EMAIL_OPENED',
  ET_EMAIL_CLICKED:         'ET_EMAIL_CLICKED',
```

These are appended after the existing SEB constants. The `ActivityEventType` union type is regenerated automatically from the const object.

---

## 10. `email-send.service.ts` Changes

**File:** `modules/messaging/services/email-send.service.ts`

This is the most consequential change. The service requires three additions:

### 10.1 New Imports

```
import * as etAttribution from '@/modules/messaging/event-tracking/event-tracking.attribution'
import * as etAudit       from '@/modules/messaging/event-tracking/event-tracking.audit'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
```

### 10.2 Phase 3B Metadata Extraction (before `createEmailSend`)

After the draft is loaded (after step 2 in `sendApprovedDraft`), extract Phase 3B metadata:

```
const draftMeta   = (draft.ai_generation_metadata ?? {}) as Record<string, unknown>
const phase3bMeta = etAttribution.extractPhase3bMeta(draftMeta)
```

Then when building `sendMetadata`, if `phase3bMeta !== null`, merge Phase 3B fields:

```
const sendMetadata: Record<string, unknown> = {
  template_used:       draftMeta.template_used       ?? null,
  recommendation_used: draftMeta.recommendation_used ?? null,
  score_snapshot:      draftMeta.score_snapshot       ?? null,
  send_initiated_by:   ctx.userId,
  draft_id:            draftId,
  ...(phase3bMeta !== null
    ? etAttribution.buildPhase3bSendMetadata(phase3bMeta, ctx.userId, draft.lead_id ?? null, {})
    : {})
}
```

This means `sendMetadata.source === 'phase_3b_send_bridge'` for Phase 3B sends, enabling the webhook handler to detect origin.

### 10.3 `ET_SEND_INITIATED` (after `createEmailSend` succeeds)

After `emailSend` is created (after the try/catch that wraps `createEmailSend`), emit the initiated event:

```
// Phase 3B event tracking — non-fatal
if (phase3bMeta !== null) {
  activityEventService.recordActivity({
    tenantId:     ctx.tenantId,
    workspaceId:  ctx.workspaceId,
    eventType:    'ET_SEND_INITIATED',
    entityType:   'message_version',
    entityId:     phase3bMeta.message_version_id ?? undefined,
    eventSummary: `Send initiated for version ${phase3bMeta.version_label ?? '?'} to ${draft.to_email}`,
    leadId:       draft.lead_id ?? undefined,
    contactId:    draft.contact_id ?? undefined,
    companyId:    draft.company_id ?? undefined,
    metadata:     etAudit.buildSendInitiatedPayload({
      emailSendId:  emailSend.id,
      draftId,
      phase3bMeta,
      toEmail:      draft.to_email,
    }) as unknown as Record<string, unknown>,
  }).catch(() => {})
}
```

**Critical:** `.catch(() => {})` — activity event failure must never block the send.

### 10.4 `ET_SEND_SUCCEEDED` (in success path after `updateEmailSend`)

After the `Promise.all([updateEmailSend, updateDraftStatus])` succeeds:

```
// Phase 3B event tracking — non-fatal
if (phase3bMeta !== null) {
  activityEventService.recordActivity({
    ...
    eventType: 'ET_SEND_SUCCEEDED',
    metadata:  etAudit.buildSendSucceededPayload({
      emailSendId: emailSend.id,
      draftId,
      phase3bMeta,
      toEmail:          draft.to_email,
      resendMessageId,
    }) as unknown as Record<string, unknown>,
  }).catch(() => {})
}
```

### 10.5 `ET_SEND_FAILED` (in failure path after `updateEmailSend`)

After the existing failure-path `updateEmailSend` call:

```
// Phase 3B event tracking — non-fatal
if (phase3bMeta !== null) {
  activityEventService.recordActivity({
    ...
    eventType: 'ET_SEND_FAILED',
    metadata:  etAudit.buildSendFailedPayload({
      emailSendId:  emailSend.id,
      draftId,
      phase3bMeta,
      toEmail:      draft.to_email,
      errorReason:  errorMessage,
    }) as unknown as Record<string, unknown>,
  }).catch(() => {})
}
```

### 10.6 No Change to Return Values

`sendApprovedDraft` returns the same `SendResult` type. No new fields. No behavior change to callers. Event tracking is transparent.

---

## 11. `email-send.repo.ts` Changes

**File:** `modules/messaging/repositories/email-send.repo.ts`

Add one new read function at the end of the file. No existing functions modified.

### 11.1 `getSendStatusForDraft`

```
getSendStatusForDraft(draftId: string, tenantId: string)
  → SELECT id, status FROM email_sends
    WHERE draft_id = draftId
      AND tenant_id = tenantId
    ORDER BY created_at DESC
    LIMIT 1
  → Returns { sendId: string; sendStatus: string } | null
```

Returns the most recent send attempt for a given draft. Used by `page.tsx` to surface delivery status (delivered, bounced, etc.) in the message workspace UI.

This is a read-only helper. It does not modify any data.

---

## 12. `route.ts` (Webhook Handler) Changes

**File:** `app/api/webhooks/resend/route.ts`

### 12.1 Expand the `email_sends` Select Query

**Current (line 174–176 in the existing file):**
```
const { data: emailSend } = await supabase
  .from('email_sends')
  .select('id, tenant_id, status')
  .eq('resend_message_id', resendMessageId)
  .single()
```

**Updated:**
```
const { data: emailSend } = await supabase
  .from('email_sends')
  .select('id, tenant_id, workspace_id, contact_id, company_id, draft_id, metadata, status')
  .eq('resend_message_id', resendMessageId)
  .single()
```

This is the critical fix. Without `metadata`, `workspace_id`, `contact_id`, `company_id`, and `draft_id`, Phase 3B attribution is impossible at webhook time.

**The TypeScript type for `emailSend`** will automatically expand because Supabase infers the return type from the select string. No type annotation needed.

### 12.2 New Imports in `route.ts`

```
import * as etAttribution from '@/modules/messaging/event-tracking/event-tracking.attribution'
import * as etAudit       from '@/modules/messaging/event-tracking/event-tracking.audit'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
```

### 12.3 Phase 3B Activity Event Emission in `processResendEvent`

**Placement:** After the existing `email_events` insert succeeds (after the `23505` duplicate check passes). Before the `email_sends` status update. This ordering ensures:
- If `email_events` insert hit `23505` (duplicate), we return early — no activity event for duplicates ✓
- If `email_events` insert succeeded, we emit the activity event — at-most-once per unique `provider_event_id` ✓

**New block to add (inside `processResendEvent`, after `email_events` insert):**

```
// Phase 3B activity event — only for Phase 3B-originated sends
const sendMeta = (emailSend.metadata ?? {}) as Record<string, unknown>
if (etAttribution.isPhase3bSend(sendMeta)) {
  const phase3bMeta = etAttribution.extractPhase3bMeta(sendMeta)
  const etType = RESEND_EVENT_TO_ET_TYPE[eventType]
  if (etType && phase3bMeta) {
    activityEventService.recordActivity({
      tenantId:     emailSend.tenant_id,
      workspaceId:  emailSend.workspace_id ?? undefined,
      eventType:    etType,
      entityType:   'message_version',
      entityId:     phase3bMeta.message_version_id ?? undefined,
      eventSummary: `${etType} for version ${phase3bMeta.version_label ?? '?'}`,
      leadId:       phase3bMeta.lead_id ?? undefined,
      contactId:    emailSend.contact_id ?? undefined,
      companyId:    emailSend.company_id ?? undefined,
      metadata:     etAudit.buildWebhookOutcomePayload({
        etActionType:   etType,
        emailSendId:    emailSend.id,
        draftId:        emailSend.draft_id ?? null,
        phase3bMeta,
        resendMessageId,
        resendEventType: eventType,
        occurredAt,
      }) as unknown as Record<string, unknown>,
    }).catch(() => {})
  }
}
```

**Error containment:** `.catch(() => {})` — activity event failure never surfaces as an error in `processResendEvent`. The existing `try/catch` in the route handler already prevents non-2xx responses.

### 12.4 `RESEND_EVENT_TO_ET_TYPE` Constant

Add this constant at the module level in `route.ts` (near the existing `EVENT_TO_SEND_STATUS`):

```
// Phase 3B Event Tracking — maps Resend event types to ET_ activity types
// email.delivery_delayed is deliberately absent (log-only, no activity event)
const RESEND_EVENT_TO_ET_TYPE: Record<string, string> = {
  'email.delivered':  'ET_EMAIL_DELIVERED',
  'email.bounced':    'ET_EMAIL_BOUNCED',
  'email.complained': 'ET_EMAIL_COMPLAINED',
  'email.failed':     'ET_EMAIL_DELIVERY_FAILED',
  'email.opened':     'ET_EMAIL_OPENED',
  'email.clicked':    'ET_EMAIL_CLICKED',
}
```

### 12.5 What Does NOT Change in `route.ts`

- Signature verification logic — unchanged
- Timestamp tolerance check — unchanged
- `webhook_events` insert — unchanged
- `email_events` insert — unchanged
- `23505` duplicate guard — unchanged (still causes early return before activity event)
- `EVENT_TO_SEND_STATUS` map and status update logic — unchanged
- Auto-unsubscribe on `email.complained` — unchanged
- The existing 200 return — unchanged

The Phase 3B additions are isolated after the idempotency check and before the status update, wrapped in their own error-contained block.

---

## 13. `email-send.repo.ts` — New Read Helper Detail

```
getSendStatusForDraft(draftId: string, tenantId: string):
  Promise<{ sendId: string; sendStatus: string } | null>
```

SELECT query:
```sql
SELECT id, status
FROM email_sends
WHERE draft_id = $draftId
  AND tenant_id = $tenantId
ORDER BY created_at DESC
LIMIT 1
```

Uses `.maybeSingle()` so returns `null` when no send exists (draft created but not yet sent).

Returns `{ sendId: data.id, sendStatus: data.status }` or `null`.

Note: `maybeSingle()` is preferred over `.single()` here because a draft may not have been sent yet (it's in `approved` or `pending_approval` status, not `sent`).

---

## 14. Page Loader Changes

**File:** `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx`

### 14.1 New Import

```
import * as emailSendRepo from '@/modules/messaging/repositories/email-send.repo'
```

Note: This uses the service-client repo (not server-client) since page.tsx loads data at server render time. The existing pattern in page.tsx uses `supabase` directly for inline queries, but for the send status, we'll use the repo import pattern consistent with the rest of Phase 3B.

### 14.2 Send Status Loading

After the existing `draftStatusByVersionId` loading loop, add:

```
// Load send delivery status for versions that have been sent (Event Tracking UI)
const sendStatusByDraftId = new Map<string, { sendId: string; sendStatus: string }>()
for (const [versionId, draftStatus] of draftStatusByVersionId) {
  if (draftStatus.status === 'sent') {
    const sendStatus = await emailSendRepo.getSendStatusForDraft(draftStatus.draftId, ctx.tenantId)
      .catch(() => null)
    if (sendStatus) {
      sendStatusByDraftId.set(draftStatus.draftId, sendStatus)
    }
  }
}
```

Only loads send status for versions where the draft has already been marked `sent` — minimizes unnecessary DB queries.

### 14.3 Pass to `GeneratedVersionsPanel`

```
<GeneratedVersionsPanel
  ...existing props...
  draftStatusByVersionId={draftStatusByVersionId}
  sendStatusByDraftId={sendStatusByDraftId}
  contactName={contactName}
  contactEmail={contact?.email ?? null}
/>
```

---

## 15. `GeneratedVersionsPanel.tsx` Changes

**File:** `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx`

### 15.1 New Props

```
interface SendStatus {
  sendId:     string
  sendStatus: string
}

interface GeneratedVersionsPanelProps {
  // ...existing props...
  sendStatusByDraftId?: Map<string, SendStatus>
}
```

### 15.2 New VersionCard Props

Pass the send status through to `VersionCard`:

```
<VersionCard
  ...existing props...
  draftStatus={draftStatusByVersionId?.get(v.id) ?? null}
  sendStatus={
    draftStatusByVersionId?.get(v.id)?.draftId
      ? sendStatusByDraftId?.get(draftStatusByVersionId.get(v.id)!.draftId) ?? null
      : null
  }
  contactName={contactName}
  contactEmail={contactEmail}
/>
```

### 15.3 Extended VersionCard Props

```
function VersionCard({
  ...existing params...
  draftStatus,
  sendStatus,
  contactName,
  contactEmail,
}: {
  ...existing types...
  sendStatus?: { sendId: string; sendStatus: string } | null
})
```

### 15.4 Updated Approved Version UI (within the approved state section)

Replace or extend the `draftStatus.status === 'sent'` branch in the approved state section. Current state shows "Sent ✓". New states:

```
// Sent state — look at send delivery status for richer information
{draftStatus?.status === 'sent' && (() => {
  const ss = sendStatus?.sendStatus
  if (ss === 'delivered') return <DeliveredBadge />
  if (ss === 'bounced')   return <BouncedBadge />
  if (ss === 'complained') return <ComplaintBadge />
  if (ss === 'failed')    return <SendFailedBadge />
  // Default: sent but no delivery confirmation yet
  return <SentBadge />
})()}
```

**Badge components (inline):**

| State | Component | Color | Icon | Text |
|-------|-----------|-------|------|------|
| `delivered` | `DeliveredBadge` | Green | `CheckCircle2` | "Delivered" |
| `bounced` | `BouncedBadge` | Amber | `AlertTriangle` | "Bounced" |
| `complained` | `ComplaintBadge` | Red | `XCircle` | "Complaint" |
| `failed` | `SendFailedBadge` | Red | `XCircle` | "Send Failed" |
| Default (sent, no delivery yet) | `SentBadge` | Blue | `CheckCircle2` | "Sent ✓" |

**No action buttons** on any of these badge states. Event tracking is observation only.

### 15.5 DraftStatus Interface Extension

The existing `DraftStatus` interface in `GeneratedVersionsPanel.tsx` remains unchanged. `sendStatus` is a separate prop, not merged into `DraftStatus`. This keeps the concerns separate and avoids changing the existing Send Bridge data flow.

---

## 16. Integration With Existing Activity Events

### 16.1 `activityEventService.recordActivity` Usage Pattern

The same pattern used in HRB, SEB, and other Phase 3B modules:

```
activityEventService.recordActivity({
  tenantId:     string,
  workspaceId?: string,
  eventType:    string,       // ET_ constant
  entityType:   'message_version',
  entityId?:    string,       // message_version_id
  eventSummary: string,
  leadId?:      string,
  contactId?:   string,
  companyId?:   string,
  metadata:     Record<string, unknown>,  // EtSendEventPayload or EtOutcomeEventPayload
}).catch(() => {})
```

All calls are wrapped in `.catch(() => {})`. Activity event failures are non-fatal in every call site.

### 16.2 Why Not Reuse Phase 3A `EMAIL_OPENED`, `EMAIL_BOUNCED` etc.?

Phase 3A already has generic `EMAIL_OPENED`, `EMAIL_CLICKED`, `EMAIL_BOUNCED` constants. Phase 3B Event Tracking uses separate `ET_EMAIL_OPENED` etc. constants for two reasons:

1. **Different attribution shape.** Phase 3A events have a generic shape; Phase 3B events carry `message_version_id`, `strategy_id`, `quality_review_id` — a richer provenance chain the Learning Agent specifically needs.
2. **Query isolation.** The Learning Agent can query `activity_events WHERE event_type LIKE 'ET_%'` to get only Phase 3B-attributed events, without filtering out Phase 3A events of the same type.

Phase 3A constants are not deprecated or removed.

---

## 17. Test Fixture Plan

### 17.1 Fixture Location

`tests/fixtures/event-tracking/TC-ET-001.json` through `TC-ET-035.json`

### 17.2 Fixture Schema

Consistent with prior Phase 3B fixtures:

```json
{
  "meta": {
    "test_case_id": "TC-ET-001",
    "scenario_name": "send_initiated_event_captured_for_phase3b_send",
    "description": "..."
  },
  "input": {
    "phase3b_meta": { "source": "phase_3b_send_bridge", "message_version_id": "...", ... },
    "send_metadata": { ... },
    "resend_event_type": null,
    "email_send_id": "...",
    "draft_id": "...",
    ...
  },
  "expected": {
    "action_type": "ET_SEND_INITIATED",
    "has_message_version_id": true,
    "has_strategy_id": true,
    "no_score_update": true,
    ...
  }
}
```

### 17.3 Fixture Coverage by Test Case

| Fixture | Test Case | Key assertion |
|---------|----------|--------------|
| TC-ET-001 | Internal send initiated event captured | `ET_SEND_INITIATED` payload has Phase 3B attribution |
| TC-ET-002 | Internal send succeeded event captured | `ET_SEND_SUCCEEDED` payload includes `resend_message_id` |
| TC-ET-003 | Internal send failed event captured | `ET_SEND_FAILED` payload includes `error_reason` |
| TC-ET-004 | Delivery webhook event captured and attributed | `ET_EMAIL_DELIVERED` with full Phase 3B chain |
| TC-ET-005 | Bounce webhook event captured | `ET_EMAIL_BOUNCED`, no auto-suppression |
| TC-ET-006 | Complaint webhook triggers auto-unsubscribe and activity event | Both `ET_EMAIL_COMPLAINED` and existing unsubscribe behavior |
| TC-ET-007 | Open event captured without changing email_send status | `ET_EMAIL_OPENED`, status unchanged |
| TC-ET-008 | Click event captured without changing email_send status | `ET_EMAIL_CLICKED`, status unchanged |
| TC-ET-009 | Duplicate webhook ignored (idempotency via provider_event_id) | Second event: `23505` → no activity event duplicate |
| TC-ET-010 | Unknown webhook event type safely ignored or logged | `email.delivery_delayed` → no ET_ activity event |
| TC-ET-011 | Missing email_id in webhook handled safely | No email_events insert, no activity event, returns 200 |
| TC-ET-012 | Webhook with no matching email_send handled safely | Log and return; no activity event |
| TC-ET-013 | Malformed webhook payload rejected safely | 400 response, no rows |
| TC-ET-014 | Phase 3A template send does not emit ET_ events | `source !== 'phase_3b_send_bridge'` → no ET_ activity events |
| TC-ET-015 | Phase 3B attribution carried from send to webhook event | `message_version_id` in ET_ event matches original send |
| TC-ET-016 | Attribution traces to strategy_id | `strategy_id` present and correct |
| TC-ET-017 | Attribution traces to quality_review_id | `quality_review_id` present and correct |
| TC-ET-018 | No score update on delivery event | QRA/HRB/version records unchanged after ET event |
| TC-ET-019 | No score update on open event | QRA/HRB/version records unchanged |
| TC-ET-020 | No new email sent by event tracking | `email_sends` count unchanged after ET processing |
| TC-ET-021 | Bounce does NOT auto-suppress contact | `unsubscribes` table unchanged on bounce |
| TC-ET-022 | Complaint auto-suppresses AND emits activity event | Both effects confirmed |
| TC-ET-023 | send_initiated_by is the reviewing user who clicked Send | Correct user ID in payload |
| TC-ET-024 | approved_by is the HRB approver (distinct from send_initiated_by) | Two distinct user IDs |
| TC-ET-025 | Tenant and workspace scoped correctly in all ET_ events | No cross-tenant contamination |
| TC-ET-026 | extractPhase3bMeta returns null for Phase 3A metadata | `source !== 'phase_3b_send_bridge'` → null |
| TC-ET-027 | extractPhase3bMeta returns null for null input | Null input → null |
| TC-ET-028 | isPhase3bSend returns false for non-Phase 3B metadata | Correct detection |
| TC-ET-029 | RESEND_EVENT_TO_ET_TYPE covers all 6 capture events | All 6 mapped; `delivery_delayed` absent |
| TC-ET-030 | enrichment failure does not block the send | Phase 3B enrichment error caught; send proceeds |
| TC-ET-031 | Activity event failure does not block the send | `.catch` swallows error; send result unaffected |
| TC-ET-032 | UI: Delivered badge shown when email_send.status = 'delivered' | Correct badge rendered |
| TC-ET-033 | UI: Bounced badge shown when email_send.status = 'bounced' | Correct amber badge |
| TC-ET-034 | UI: Send Failed badge shown when email_send.status = 'failed' | Correct red badge |
| TC-ET-035 | Activity event query returns full chain for one Phase 3B send | All ET_ events attributable to one message_version_id |

---

## 18. Test Suite Structure

**File:** `tests/event-tracking.test.ts`

```
Event Tracking — Pure Function Tests
  ├── extractPhase3bMeta
  │     ├── returns correct meta for Phase 3B source
  │     ├── returns null for Phase 3A source
  │     ├── returns null for null input
  │     └── handles missing optional fields gracefully
  ├── isPhase3bSend
  │     ├── returns true for phase_3b_send_bridge
  │     ├── returns false for other sources
  │     └── returns false for null input
  ├── buildPhase3bSendMetadata
  │     ├── includes all required Phase 3B fields
  │     ├── preserves existing send metadata fields
  │     └── includes lead_id and send_initiated_by
  ├── RESEND_EVENT_TO_ET_TYPE
  │     ├── all 6 capture events are mapped
  │     └── email.delivery_delayed is absent
  ├── buildSendInitiatedPayload
  │     ├── has action_type = ET_SEND_INITIATED
  │     ├── has all required Phase 3B fields
  │     └── null phase3bMeta produces null Phase 3B fields
  ├── buildSendSucceededPayload
  │     ├── has action_type = ET_SEND_SUCCEEDED
  │     └── includes resend_message_id
  ├── buildSendFailedPayload
  │     ├── has action_type = ET_SEND_FAILED
  │     └── includes error_reason
  └── buildWebhookOutcomePayload
        ├── has correct action_type for each Resend event type
        ├── includes resend_event_type in payload
        └── Phase 3B fields are present from phase3bMeta

Event Tracking — No-Learning Guardrail Tests
  ├── ET_ action types do not include any update/score/learn types
  ├── ET_ action types are all observation-type strings
  └── No QRA or HRB modification in any payload builder

Event Tracking — Fixture-Based Tests (35 test cases)
  └── For each TC-ET-001 through TC-ET-035:
        Load fixture → run relevant pure function → assert expected output
```

**Expected new tests:** ≥ 35 (targeting ~50 including the helper function tests above)
**Expected total tests after implementation:** ≥ 491 (456 existing + ≥ 35 ET)

---

## 19. QA Checklist

Before marking implementation complete:

### Logic and Attribution

- [ ] `event-tracking.types.ts` created with all constants and interfaces
- [ ] `event-tracking.attribution.ts` with `extractPhase3bMeta`, `isPhase3bSend`, `buildPhase3bSendMetadata`, `RESEND_EVENT_TO_ET_TYPE`
- [ ] `event-tracking.audit.ts` with all 4 payload builders
- [ ] `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` emitted from `email-send.service.ts` (non-fatal)
- [ ] `email_sends.metadata` enriched with Phase 3B fields at send time when `source = 'phase_3b_send_bridge'`
- [ ] `lead_id` included in `email_sends.metadata` for Phase 3B sends

### Webhook Handler

- [ ] `processResendEvent` select expanded to include `metadata, workspace_id, contact_id, company_id, draft_id`
- [ ] `RESEND_EVENT_TO_ET_TYPE` constant defined in `route.ts`
- [ ] Phase 3B activity event emitted **after** `email_events` idempotency check passes (after `23505` guard)
- [ ] Duplicate webhook (`23505`) results in early return — **no** duplicate activity event
- [ ] Phase 3A sends (non-Phase-3B metadata) do not emit ET_ activity events
- [ ] All existing webhook behavior unchanged: signature check, `webhook_events` insert, `email_events` insert, status updates, auto-unsubscribe on complaint
- [ ] Webhook still returns 200 even when activity event emission fails

### `types.agent.ts`

- [ ] 9 ET_ constants added (additive only — no existing entries modified)
- [ ] TypeScript compiles cleanly with new union type

### Repository

- [ ] `getSendStatusForDraft` added to `email-send.repo.ts` (no existing functions modified)

### UI

- [ ] `page.tsx` loads `sendStatusByDraftId` for sent versions
- [ ] `GeneratedVersionsPanel.tsx` accepts `sendStatusByDraftId` prop
- [ ] Delivered / Bounced / Complaint / SendFailed / Sent badges render correctly
- [ ] No action buttons on delivery status badges (observation only)
- [ ] `sendStatus` is undefined / null for non-sent versions (no error rendered)

### No-Send / No-Learning Guardrails

- [ ] No `resend.emails.send` call in any event tracking file
- [ ] No `email_sends` INSERT in any event tracking file (only READ via `getSendStatusForDraft`)
- [ ] No modification to `message_version`, `message_strategy`, `quality_review` records
- [ ] No modification to `email_drafts` records
- [ ] No modification to `approval_requests` records
- [ ] Grep confirmation: no `resend.emails.send` in `event-tracking/`
- [ ] Grep confirmation: no `INSERT` into `email_sends` in `event-tracking/`
- [ ] Grep confirmation: `email-send.service.ts` still returns the same `SendResult` type

### Test Suite

- [ ] 35 fixtures created (`TC-ET-001.json` through `TC-ET-035.json`)
- [ ] `tests/event-tracking.test.ts` created
- [ ] `npx vitest run` → PASSED, ≥ 491 tests (456 + ≥ 35), 0 failures
- [ ] All 456 existing tests still pass (no regressions)
- [ ] `npx next build` → PASSED, 0 errors
- [ ] TypeScript → PASSED
- [ ] `npx eslint` on modified files → 0 errors

---

## 20. Implementation Sequence

Execute steps in this order. Complete each before starting the next.

1. **Inspect** — Re-read all modified files at implementation time to note exact line numbers for insertion points. Confirm the exact shape of `EmailDraftRow` (that `ai_generation_metadata` and `lead_id` are accessible). Confirm `processResendEvent`'s exact parameter signature.

2. **`event-tracking.types.ts`** — Create. All constants and interfaces. `as const` throughout, no `enum`.

3. **`event-tracking.attribution.ts`** — Create. `extractPhase3bMeta`, `isPhase3bSend`, `buildPhase3bSendMetadata`, `RESEND_EVENT_TO_ET_TYPE`. Pure functions only.

4. **`event-tracking.audit.ts`** — Create. All 4 payload builders. Pure functions only.

5. **Extend `modules/intelligence/types.agent.ts`** — Add 9 ET_ constants inside the `ActivityEventType` const object after the SEB constants. Additive only.

6. **Extend `modules/messaging/services/email-send.service.ts`** — Add 3 imports, Phase 3B metadata extraction and `sendMetadata` enrichment, `ET_SEND_INITIATED` emission (after `createEmailSend`), `ET_SEND_SUCCEEDED` emission (in success path), `ET_SEND_FAILED` emission (in failure path). All non-fatal.

7. **Extend `modules/messaging/repositories/email-send.repo.ts`** — Add `getSendStatusForDraft` at end of file. No existing functions modified.

8. **Extend `app/api/webhooks/resend/route.ts`** — Add 3 imports, `RESEND_EVENT_TO_ET_TYPE` constant, expand `email_sends` select in `processResendEvent`, add Phase 3B activity event emission block after `email_events` idempotency check. No existing behavior changed.

9. **Create 35 test fixtures** — `tests/fixtures/event-tracking/TC-ET-001.json` through `TC-ET-035.json`. Follow fixture schema from Section 17.2.

10. **`tests/event-tracking.test.ts`** — Create. Pure function tests, guardrail tests, 35 fixture-based tests.

11. **Extend `modules/messaging/repositories/email-send.repo.ts`** — Already done in step 7. (Check only.)

12. **Extend `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx`** — Add `emailSendRepo` import, `sendStatusByDraftId` loading loop, pass new prop to `GeneratedVersionsPanel`.

13. **Extend `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx`** — Add `SendStatus` interface, `sendStatusByDraftId` prop, update `VersionCard` props and signature, implement delivery badge states.

14. **QA pass** — `npx vitest run` (≥ 491, 0 failures) + `npx next build` (0 errors) + `npx eslint` on modified files.

15. **Guardrail verification pass** — Grep all new files for: `resend.emails.send`, `from('email_sends').insert`, `body_text =`, `subject_line =`, `message_version.update`, `quality_review.update`. Confirm none present.

16. **Implementation summary** — Report files created, test count, build status, deviations from plan. Stop before Learning Agent.

---

## 21. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `processResendEvent` select expansion introduces TypeScript type error | Low | Medium | Supabase client infers type from select string; expanding the select should widen the type automatically. Verify during step 8. |
| `email_sends.metadata` jsonb read in `processResendEvent` fails for Phase 3A sends | Very Low | Low | `isPhase3bSend` checks `source` field; null or missing field returns false; no ET_ event emitted |
| Activity event emission in `email-send.service.ts` adds latency to send | Very Low | Low | Events are fire-and-forget (`.catch(() => {})`); no `await` on the activity event call in the critical path |
| `getSendStatusForDraft` returns stale status between webhook and page load | Low | Low | Page loads current status at request time; refresh loads updated status; no caching risk |
| `lead_id` not available from `email_drafts` at send time | Very Low | Medium | `getEmailDraftForSending` selects `*` which includes `lead_id`; confirmed from code read. |
| Duplicate webhook delivers duplicate ET_ activity event | Very Low | Low | `23505` guard causes early return before Phase 3B block is reached; structural guarantee |
| Regressions in existing 456 tests from `types.agent.ts` addition | Very Low | Medium | Additive only; TypeScript will catch type errors; existing tests import the type but don't test specific values |
| webhook handler's Phase 3B block throws and is caught by existing try/catch | Very Low | None | Existing `try/catch` in `POST` already handles all errors; `.catch(() => {})` on activity event adds another layer |

---

## 22. Final Acceptance Criteria

| Criterion | Met? |
|-----------|------|
| All 6 open questions from design resolved | ✓ |
| No new DB table or migration required | ✓ |
| `email_sends` select expansion specified precisely | ✓ |
| Internal event emission pattern defined | ✓ |
| Webhook event emission pattern defined | ✓ |
| Phase 3B detection strategy defined (`source` field in metadata) | ✓ |
| Idempotency preserved (Phase 3B block after `23505` guard) | ✓ |
| Phase 3A behavior unchanged | ✓ |
| No Learning Agent behavior | ✓ |
| No score updates | ✓ |
| `getSendStatusForDraft` helper defined | ✓ |
| UI delivery badge states defined | ✓ |
| Page loader wiring defined | ✓ |
| Test fixture plan — 35 fixtures, full coverage | ✓ |
| QA checklist defined | ✓ |
| Implementation sequence — 16 ordered steps | ✓ |
| Risks and mitigations identified | ✓ |
| No code written | ✓ |
| No SQL written | ✓ |
| No migrations | ✓ |
| No sending introduced | ✓ |

---

## 23. Recommended Next Step

Once this implementation plan is approved by the user:

**Phase 3B Event Tracking / Send Outcome Tracking — Code Implementation**

The coding agent must follow the 16-step sequence in Section 20 exactly. Key constraints to preserve:

1. Activity events are always non-fatal — `.catch(() => {})` on every call
2. The Phase 3B activity event block in `processResendEvent` runs **only** after the `email_events` idempotency check passes (after the `23505` early return) — duplicates must not produce duplicate activity events
3. `processResendEvent` select must be expanded to include `metadata, workspace_id, contact_id, company_id, draft_id`
4. No modification to any Phase 3B agent files (MSA, CA, QRA, HRB, Send Bridge)
5. No new DB tables or migrations
6. All 456 existing tests must pass
7. Stop before Learning Agent or any score computation

After implementation:
- Run QA: `npx vitest run` (≥ 491) + `npx next build` + lint
- Produce implementation summary
- Commit, tag as `phase-3b-event-tracking-v1`
- Update `docs/ai-context/` files

---

*Document status: Draft. Awaiting user approval before code implementation begins.*
*Version: 1.0 — 2026-05-21*
