# Phase 3B Event Tracking / Send Outcome Tracking — Design & Test Cases

**Status:** Draft v1.0 — Awaiting user approval before implementation planning begins.
**Version:** 1.0
**Date:** 2026-05-21
**Prerequisite:** Send / Email Draft Bridge Foundation v1.0 complete and QA-verified (`fd8a4fb`, tag `phase-3b-send-bridge-v1`).

---

## 1. Executive Overview

The Phase 3B Revenue Learning Engine has now completed its outbound messaging pipeline through send:

```
Message Strategy Agent      → produces message_strategy
Copywriting Agent           → produces message_version[] (plain text, body_html null)
Quality Review Agent        → produces quality_review[] (scores, risk flags, recommendation)
Human Review / Approval Bridge → sets message_version.approval_status = 'approved'
Send / Email Draft Bridge   → creates email_draft (approved), auto-resolved approval_request
Phase 3A send flow          → reviewer clicks "Send" → sendApprovedDraftAction → email_sends → Resend
```

An email has now been sent. But the pipeline has no way to answer: what happened after it was sent? Was it delivered? Opened? Did it bounce? Did the contact reply?

**Phase 3B Event Tracking / Send Outcome Tracking** closes this observational gap. It is an attribution and observation layer — a read-mostly extension that captures what happens after `sendApprovedDraftAction` completes, and attributes those outcomes back to the full Phase 3B provenance chain: the strategy that chose the angle, the copywriting agent that produced the text, the QRA that scored it, and the HRB approval that authorized it.

**Critical discovery before writing this design:** More Phase 3A infrastructure for event tracking already exists than anticipated:

| Already Exists | Exists in |
|---------------|-----------|
| `email_events` table | DB — records one row per webhook event, linked to `email_send_id` |
| `webhook_events` table | DB — records every raw inbound webhook for audit |
| `email_sends` table | DB — records each send attempt with status |
| `/api/webhooks/resend/route.ts` | Code — full webhook handler with signature verification, idempotency, delivery state transitions, auto-unsubscribe on complaint |
| Idempotency via `provider_event_id` unique constraint | DB — prevents duplicate event processing |
| HMAC-SHA256 signature verification | Code — Standard Webhooks spec, 5-minute timestamp tolerance |
| Auto-unsubscribe on `email.complained` | Code — upserts into `unsubscribes` table |

**The gap this phase fills:**

The existing infrastructure links `email_events → email_send_id → email_sends → draft_id → email_drafts`. But `email_drafts` stores Phase 3B provenance in its `ai_generation_metadata` jsonb column — a path that requires a multi-hop join to reach, and is not denormalized for fast attribution.

Phase 3B Event Tracking adds:

1. **Phase 3B context denormalization into `email_sends.metadata`** at send time — so that `message_version_id`, `strategy_id`, `quality_review_id` travel with every `email_send` record without a new column or migration.
2. **Activity events for key internal events** (send initiated, sent, send failed) — which currently write to `email_sends` but emit no `activity_events` entry with full Phase 3B context.
3. **Activity events for key webhook outcomes** (delivery, bounce, open, click, complaint) — emitted from the webhook handler with Phase 3B attribution, enabling the Learning Agent to query `activity_events` directly without reconstructing the join chain.
4. **UI status signals** in the message workspace — so the reviewer can see what happened to the email they sent.

**What it is not:** Event Tracking is not the Learning Agent. It stores facts. It does not score them, weight them, or use them to update the Message Strategy Agent's priors. Learning — deciding what those facts mean for future strategy selection — is explicitly deferred.

---

## 2. Completed Prerequisites

Before Event Tracking can be designed or implemented, the following must be true. All are confirmed as of `fd8a4fb`:

| Prerequisite | Source | Status |
|-------------|--------|--------|
| `email_sends` table and repo exist | Phase 3A | ✓ |
| `email_events` table exists with `provider_event_id` unique constraint | Phase 3A | ✓ |
| `webhook_events` table exists | Phase 3A | ✓ |
| `/api/webhooks/resend/route.ts` exists with signature verification | Phase 3A | ✓ |
| `email_drafts.ai_generation_metadata` contains Phase 3B provenance | Send Bridge | ✓ |
| `email_sends.metadata` carries `draft_id` | Phase 3A send service | ✓ |
| `activity_events` table and service exist | Phase 3A | ✓ |
| `ActivityEventType` const object extensible | Phase 3B | ✓ |

---

## 3. Design Goals

1. Attribute every post-send outcome back to the Phase 3B pipeline that produced it: `message_version_id`, `strategy_id`, `quality_review_id`, `approved_by`, and `draft_id`.
2. Use existing infrastructure (`email_events`, `webhook_events`, `email_sends`) wherever possible. Add as little new surface area as possible in v1.
3. Enrich `email_sends.metadata` with Phase 3B context **at send time** so that attribution is available on the send record immediately — no retroactive join required.
4. Emit `activity_events` for key outcomes (send initiated, delivered, bounced, opened, clicked, complained) with full Phase 3B context — providing a clean, pre-attributed feed for the future Learning Agent.
5. Surface outcome status in the message workspace UI so the reviewer can see the result of their send decision.
6. Enforce no-Learning guardrails: record facts, do not score or update strategy weights.
7. Maintain the no-auto-send guarantee: event tracking observes only — it never initiates, retries, or suppresses sends.
8. Prepare the Learning Agent's data feed without building the agent.

---

## 4. Non-Goals

| Non-Goal | Reason |
|----------|--------|
| Update strategy weights or scoring priors | Learning Agent responsibility — future work |
| Infer reply intent from delivery events | Requires human judgment or ML classification |
| Send follow-up emails based on outcomes | No auto-send; this is observation only |
| Track replies from the recipient | Requires inbound email infrastructure (Resend does not deliver inbound email) |
| Modify QRA scores based on send outcomes | QRA records are locked |
| Modify HRB decisions based on send outcomes | HRB records are locked |
| Modify generated copy based on send outcomes | Copy is immutable |
| Build a new AI agent | This is a data pipeline, not an AI agent |
| Create new Resend webhook event types | Resend's event vocabulary is fixed |
| Track Phase 3A (template-based) email outcomes differently | Phase 3A emails already write to `email_events`; this phase adds Phase 3B attribution context on top |
| Implement reply tracking in v1 | Requires separate inbound email infrastructure; deferred |
| Track email read time or dwell time | Not available from standard webhook providers |

---

## 5. Existing Phase 3A Infrastructure — Detailed Inventory

### 5.1 `email_sends` Table

Records each send attempt. Fields relevant to Event Tracking:

| Field | Type | Used for |
|-------|------|---------|
| `id` | uuid | Primary key; referenced by `email_events.email_send_id` |
| `tenant_id` | uuid | Tenant scoping |
| `workspace_id` | uuid | Workspace scoping |
| `draft_id` | uuid | Links to `email_drafts` — indirect path to Phase 3B provenance |
| `resend_message_id` | text | The Resend message ID — used to match inbound webhook events |
| `status` | text | `queued → sent → delivered / bounced / complained / failed` |
| `to_email` | text | Recipient address |
| `contact_id` | uuid | Links to contact |
| `company_id` | uuid | Links to company |
| `metadata` | jsonb | Carries `draft_id`, `send_initiated_by`, `template_used`, etc. |
| `sent_at` | timestamptz | When the Resend API call succeeded |
| `error_message` | text | Error reason if `status = 'failed'` |

**Gap:** `metadata` does not currently carry `message_version_id`, `strategy_id`, or `quality_review_id` for Phase 3B-originated sends.

### 5.2 `email_events` Table

Records one row per inbound webhook event (delivered, bounced, opened, clicked, etc.):

| Field | Type | Used for |
|-------|------|---------|
| `id` | uuid | Primary key |
| `tenant_id` | uuid | Tenant scoping |
| `email_send_id` | uuid | FK to `email_sends` |
| `resend_message_id` | text | Raw provider message ID |
| `event_type` | text | e.g., `email.delivered`, `email.opened`, `email.bounced` |
| `occurred_at` | timestamptz | When the event occurred per Resend |
| `payload` | jsonb | Full Resend event data payload |
| `provider_event_id` | text | Resend webhook ID; **unique constraint** provides idempotency |

**Gap:** No `message_version_id`, `strategy_id`, or Phase 3B attribution fields.

### 5.3 `/api/webhooks/resend/route.ts` — Current Behavior

The existing webhook handler:
- Verifies HMAC-SHA256 signature using Standard Webhooks spec
- Rejects stale webhooks (> 5 minutes old)
- Inserts into `webhook_events` (raw audit)
- Finds `email_send` by `resend_message_id`
- Inserts into `email_events` (idempotent via `provider_event_id` unique constraint)
- Updates `email_sends.status` for terminal delivery states (`delivered`, `bounced`, `complained`, `failed`)
- Auto-unsubscribes on `email.complained`
- Returns 200 on all errors (to prevent Resend retry storms)

**Gap:** Does not emit `activity_events`. Does not look up Phase 3B context from `email_drafts.ai_generation_metadata`. Does not differentiate Phase 3B-originated sends from Phase 3A template-based sends.

### 5.4 `email-send.service.ts` — Current Behavior

The existing send service:
- Creates `email_sends` record with `status = 'queued'`
- Calls Resend API
- On success: updates `email_sends.status = 'sent'`, `email_drafts.status = 'sent'`
- On failure: updates `email_sends.status = 'failed'`
- Does NOT emit any `activity_events`
- Does NOT copy Phase 3B metadata into `email_sends.metadata`

**Gap:** Phase 3B context is not carried forward from `email_drafts.ai_generation_metadata` into `email_sends.metadata` at send time.

### 5.5 Existing `ActivityEventType` Constants

Phase 3A already has: `EMAIL_OPENED`, `EMAIL_CLICKED`, `EMAIL_BOUNCED`, `PROPOSAL_SENT`. These are generic types. Phase 3B Event Tracking will add specific Phase 3B outcome types alongside them (additive only).

---

## 6. Event Taxonomy

### 6.1 Internal Events (from application code — no webhook required)

These events are triggered by `sendApprovedDraftAction` and the underlying `sendApprovedDraft` service. No webhook is required. Attribution context is available at call time.

| Event | Trigger | When |
|-------|---------|------|
| `ET_SEND_INITIATED` | `sendApprovedDraft` creates `email_send` record | Reviewer clicks Send; queued record written |
| `ET_SEND_SUCCEEDED` | `sendApprovedDraft` receives Resend message ID | Resend accepted the email for delivery |
| `ET_SEND_FAILED` | `sendApprovedDraft` catches Resend error | Resend rejected or timed out |

**Attribution context available at send time:** `tenant_id`, `workspace_id`, `lead_id`, `contact_id`, `company_id`, `draft_id`, `email_send_id`, `user_id` (the reviewer who clicked Send).

**Phase 3B context available at send time (from `email_drafts.ai_generation_metadata`):** `message_version_id`, `strategy_id`, `quality_review_id`, `version_label`, `composite_score`, `approved_by`.

**Design decision for v1:** The send service should read `email_drafts.ai_generation_metadata` at send time and:
1. Copy Phase 3B fields into `email_sends.metadata` (no migration — jsonb only)
2. Emit an `activity_event` with full attribution

This enrichment is opt-in: if `ai_generation_metadata.source !== 'phase_3b_send_bridge'`, the send service treats the draft as a Phase 3A template draft and does not emit Phase 3B activity events. Phase 3A behavior is not changed.

### 6.2 Webhook Events (from Resend via `/api/webhooks/resend/route.ts`)

These events arrive asynchronously after the email is sent, delivered by Resend.

| Resend Event | Meaning | Terminal status change | Phase 3B activity event |
|-------------|---------|----------------------|------------------------|
| `email.delivered` | Recipient's mail server accepted the email | `email_sends.status → delivered` | `ET_EMAIL_DELIVERED` |
| `email.bounced` | Hard or soft bounce | `email_sends.status → bounced` | `ET_EMAIL_BOUNCED` |
| `email.complained` | Recipient marked as spam | `email_sends.status → complained` | `ET_EMAIL_COMPLAINED` |
| `email.failed` | Resend-level delivery failure | `email_sends.status → failed` | `ET_EMAIL_DELIVERY_FAILED` |
| `email.opened` | Recipient opened the email (requires open tracking) | No status change | `ET_EMAIL_OPENED` |
| `email.clicked` | Recipient clicked a link (requires click tracking) | No status change | `ET_EMAIL_CLICKED` |
| `email.delivery_delayed` | Temporary delivery delay | No status change | Logged only; no activity event in v1 |

**Events NOT currently delivered by Resend:**
- `email.replied` — Resend does not handle inbound email
- `email.unsubscribed` — available for list sends with `List-Unsubscribe`; may not apply to individual transactional sends

### 6.3 Events Not Available in v1

| Event | Why not available | Future path |
|-------|------------------|------------|
| Reply tracking | Resend does not deliver inbound email; requires a separate inbound email provider or Gmail/Outlook API monitoring | Future: integrate with Outlook monitoring (already planned in Phase 3B-1) |
| Conversion tracking | No conversion definition exists yet | Future: Learning Agent defines conversion |
| Read time / dwell time | Not available from standard webhook providers | Not planned |
| Link destination reached | Would require custom redirect infrastructure | Not planned |
| Auto-reply vs. genuine reply | Requires content analysis | Not planned |

### 6.4 Event Completeness Summary

| Event | Source | v1 scope |
|-------|--------|----------|
| `ET_SEND_INITIATED` | Internal | ✓ Capture |
| `ET_SEND_SUCCEEDED` | Internal | ✓ Capture |
| `ET_SEND_FAILED` | Internal | ✓ Capture |
| `ET_EMAIL_DELIVERED` | Resend webhook | ✓ Capture |
| `ET_EMAIL_BOUNCED` | Resend webhook | ✓ Capture |
| `ET_EMAIL_COMPLAINED` | Resend webhook | ✓ Capture |
| `ET_EMAIL_DELIVERY_FAILED` | Resend webhook | ✓ Capture |
| `ET_EMAIL_OPENED` | Resend webhook | ✓ Capture (if tracking enabled) |
| `ET_EMAIL_CLICKED` | Resend webhook | ✓ Capture (if tracking enabled) |
| `ET_EMAIL_REPLIED` | Inbound email provider | ✗ Future work |
| `ET_EMAIL_DELIVERY_DELAYED` | Resend webhook | Log only; no activity event |
| `ET_EMAIL_UNSUBSCRIBED` | Resend webhook (list unsubscribe) | Log only; unsubscribes handled by existing Phase 3A suppression |

---

## 7. Attribution Model

### 7.1 The Attribution Chain

Every Event Tracking record must be attributable to:

```
activity_event
  ├── tenant_id                    (from email_send.tenant_id)
  ├── workspace_id                 (from email_send.workspace_id)
  ├── lead_id                      (from email_draft.lead_id)
  ├── contact_id                   (from email_send.contact_id)
  ├── company_id                   (from email_send.company_id)
  ├── email_send_id                (direct)
  ├── draft_id                     (from email_send.draft_id)
  ├── message_version_id           (from email_draft.ai_generation_metadata)
  ├── strategy_id                  (from email_draft.ai_generation_metadata)
  ├── quality_review_id            (from email_draft.ai_generation_metadata)
  ├── version_label                (from email_draft.ai_generation_metadata)
  ├── composite_score              (from email_draft.ai_generation_metadata)
  ├── approved_by                  (from email_draft.ai_generation_metadata)
  └── send_initiated_by            (user_id who clicked Send)
```

### 7.2 Attribution Strategy — v1 (No Migration Required)

**The key challenge:** Webhook events arrive at `processResendEvent` with only `resend_message_id`. From there:
- `email_sends.resend_message_id` → `email_send.id`, `email_send.draft_id`
- `email_drafts.ai_generation_metadata` → Phase 3B provenance

This requires two queries at webhook processing time. For v1, this is acceptable.

**The v1 attribution flow:**

**Step 1 — At send time** (`sendApprovedDraft`):

Read `email_drafts.ai_generation_metadata`. If `source === 'phase_3b_send_bridge'`, copy the Phase 3B fields into `email_sends.metadata`:

```json
{
  "source":               "phase_3b_send_bridge",
  "draft_id":             "<uuid>",
  "message_version_id":   "<uuid>",
  "strategy_id":          "<uuid>",
  "quality_review_id":    "<uuid>",
  "version_label":        "A",
  "composite_score":      82,
  "approved_by":          "<user-uuid>",
  "send_initiated_by":    "<user-uuid>",
  ...existing fields...
}
```

After this enrichment, `email_sends.metadata` carries the full Phase 3B context. No new column needed.

**Step 2 — At webhook processing time** (`processResendEvent`):

For Phase 3B-originated sends (detected via `email_sends.metadata.source === 'phase_3b_send_bridge'`), emit an `activity_event` with the Phase 3B attribution already available in `email_sends.metadata`. No additional query to `email_drafts` required.

**Why this is correct:**

- Phase 3A template-based sends have `metadata.source` that is NOT `'phase_3b_send_bridge'` — they are unaffected.
- The Phase 3B context is denormalized into `email_sends.metadata` once at send time, then read from there for all subsequent webhook events.
- No migration is required. No new DB table. Existing `metadata` jsonb column carries the data.

### 7.3 Phase 3B vs Phase 3A Send Detection

| Send origin | `email_drafts.ai_generation_metadata.source` | Event Tracking behavior |
|------------|----------------------------------------------|------------------------|
| Phase 3B Send Bridge | `'phase_3b_send_bridge'` | Emit Phase 3B activity events with full attribution |
| Phase 3A template | `'lead_created_workflow'` or other | Do not emit Phase 3B activity events; Phase 3A behavior unchanged |
| Unknown / null | — | Skip Phase 3B enrichment; log and continue |

---

## 8. Internal Event Model

Internal events are emitted by `sendApprovedDraft` in `email-send.service.ts`. These require minimal changes to the existing service: one additional DB read (the draft's `ai_generation_metadata`) and one `activityEventService.recordActivity` call per event type.

### 8.1 `ET_SEND_INITIATED`

**When:** After `email_sends` record is created (`status = 'queued'`), before Resend API call.

**Why:** Records that a human explicitly triggered a send for a Phase 3B-approved email. This is the starting point of the send outcome chain.

**Activity event payload:**
```json
{
  "action_type":          "ET_SEND_INITIATED",
  "email_send_id":        "<uuid>",
  "draft_id":             "<uuid>",
  "message_version_id":   "<uuid>",
  "strategy_id":          "<uuid>",
  "quality_review_id":    "<uuid>",
  "version_label":        "A",
  "composite_score":      82,
  "send_initiated_by":    "<user-uuid>",
  "to_email":             "recipient@example.com",
  "timestamp":            "<ISO>"
}
```

### 8.2 `ET_SEND_SUCCEEDED`

**When:** After Resend returns a `resendMessageId` (success path). After `email_sends.status` is updated to `'sent'`.

**Why:** Confirms the email left the platform. The `resend_message_id` stored here is the key that connects all future webhook events.

**Additional fields:** `resend_message_id`

### 8.3 `ET_SEND_FAILED`

**When:** After Resend throws an error. After `email_sends.status` is updated to `'failed'`.

**Why:** Records that the send was attempted but rejected by Resend. The `error_reason` is captured for debugging.

**Additional fields:** `error_reason`

---

## 9. Webhook Event Model

Webhook events are emitted by `processResendEvent` in the webhook handler. The existing handler already writes to `email_events`. Event Tracking adds a second write: `activityEventService.recordActivity` for Phase 3B-originated sends only.

### 9.1 What Changes in the Webhook Handler (v1)

The existing handler's behavior is **not changed**. Event Tracking adds a conditional block after the existing `email_events` insert:

```
if (emailSend.metadata.source === 'phase_3b_send_bridge') {
  await activityEventService.recordActivity({
    tenantId:     emailSend.tenant_id,
    eventType:    eventTypeToActivityType[eventType],
    entityType:   'message_version',
    entityId:     emailSend.metadata.message_version_id,
    leadId:       emailSend.lead_id,
    contactId:    emailSend.contact_id,
    companyId:    emailSend.company_id,
    metadata:     { ...Phase 3B attribution ... }
  })
}
```

This block is isolated. If it fails, the existing `email_events` record is already written. The webhook still returns 200. Errors are logged.

### 9.2 Phase 3B Activity Event Types Added

All are additive to `ActivityEventType` in `modules/intelligence/types.agent.ts`:

| Constant | String value |
|----------|-------------|
| `ET_SEND_INITIATED` | `'ET_SEND_INITIATED'` |
| `ET_SEND_SUCCEEDED` | `'ET_SEND_SUCCEEDED'` |
| `ET_SEND_FAILED` | `'ET_SEND_FAILED'` |
| `ET_EMAIL_DELIVERED` | `'ET_EMAIL_DELIVERED'` |
| `ET_EMAIL_BOUNCED` | `'ET_EMAIL_BOUNCED'` |
| `ET_EMAIL_COMPLAINED` | `'ET_EMAIL_COMPLAINED'` |
| `ET_EMAIL_DELIVERY_FAILED` | `'ET_EMAIL_DELIVERY_FAILED'` |
| `ET_EMAIL_OPENED` | `'ET_EMAIL_OPENED'` |
| `ET_EMAIL_CLICKED` | `'ET_EMAIL_CLICKED'` |

### 9.3 Resend Event → Activity Event Type Mapping

| Resend `event_type` | Phase 3B `ActivityEventType` |
|--------------------|------------------------------|
| — (internal, on queued) | `ET_SEND_INITIATED` |
| — (internal, on sent) | `ET_SEND_SUCCEEDED` |
| — (internal, on failed) | `ET_SEND_FAILED` |
| `email.delivered` | `ET_EMAIL_DELIVERED` |
| `email.bounced` | `ET_EMAIL_BOUNCED` |
| `email.complained` | `ET_EMAIL_COMPLAINED` |
| `email.failed` | `ET_EMAIL_DELIVERY_FAILED` |
| `email.opened` | `ET_EMAIL_OPENED` |
| `email.clicked` | `ET_EMAIL_CLICKED` |
| `email.delivery_delayed` | Log only — no activity event |

---

## 10. Data Model Considerations

### 10.1 No New Tables Required in v1

| Table | Role | Changes in v1 |
|-------|------|--------------|
| `email_sends` | Send attempt record | `metadata` jsonb enriched with Phase 3B context at send time — no schema change |
| `email_events` | One row per webhook event | Read as-is; no new columns |
| `webhook_events` | Raw webhook audit | Read as-is; no changes |
| `activity_events` | Audit / attribution feed | New ET_ event types written here |
| `unsubscribes` | Suppression list | Existing Phase 3A behavior unchanged |

### 10.2 `email_sends.metadata` Enrichment (v1)

No migration. The `metadata` column is already `jsonb` and carries arbitrary content. Event Tracking adds Phase 3B fields at send time:

| Field added to metadata | Source | Purpose |
|------------------------|--------|---------|
| `source` | `'phase_3b_send_bridge'` | Detects Phase 3B origin at event time |
| `message_version_id` | `email_drafts.ai_generation_metadata` | Primary Phase 3B attribution key |
| `strategy_id` | `email_drafts.ai_generation_metadata` | Links to message_strategy |
| `quality_review_id` | `email_drafts.ai_generation_metadata` | Links to quality_review |
| `version_label` | `email_drafts.ai_generation_metadata` | Human-readable version identifier |
| `composite_score` | `email_drafts.ai_generation_metadata` | QRA score at time of approval |
| `approved_by` | `email_drafts.ai_generation_metadata` | HRB reviewer identity |
| `send_initiated_by` | `ctx.userId` | Reviewer who clicked Send |

### 10.3 Future Migration Considerations

V1 is sufficient for observation and attribution. However, the following migration may be warranted in Phase 3B v2 or the Learning Agent phase:

| Migration | Benefit | When to add |
|-----------|---------|------------|
| Add `message_version_id uuid` to `email_sends` | Direct FK join without jsonb path; enables indexed queries | When Learning Agent needs to query outcome by version at scale |
| Add `message_version_id uuid` to `email_events` | Direct attribution on each event row | When Learning Agent needs per-event attribution without going through `email_sends` |
| Add `strategy_id uuid` to `email_sends` | Direct strategy outcome aggregation | Same trigger as above |

These are not needed for v1 observation. Flag for Phase 3B v2 design.

### 10.4 What Is Stored Where

| Data | Stored in | Reason |
|------|-----------|--------|
| Raw webhook payload | `webhook_events` | Full audit trail; unchanged |
| Per-event delivery/open/click records | `email_events` | Existing idempotent infrastructure; unchanged |
| Phase 3B outcome attribution feed | `activity_events` | Pre-attributed; ready for Learning Agent |
| Phase 3B context at send time | `email_sends.metadata` | Enables attribution without re-querying `email_drafts` |
| Suppression (unsubscribes, complaints) | `unsubscribes` | Existing Phase 3A mechanism; unchanged |

---

## 11. Idempotency and Deduplication Rules

### 11.1 Webhook Idempotency (Existing — No Change)

The existing webhook handler already enforces idempotency via the `provider_event_id` unique constraint on `email_events`. A duplicate Resend webhook delivery (same `webhook-id` header) results in a `23505` unique violation on insert, which is caught and silently ignored. This behavior is unchanged.

### 11.2 Activity Event Idempotency (New)

Activity events (`activity_events` table) are NOT currently deduplicated — they are append-only. For Phase 3B Event Tracking activity events:

- **Internal events** (`ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED`): At most one of each per `email_send_id`. The send service only calls these once per execution. Retry of the entire send action would be blocked by the existing idempotency guard in `getActiveSendForDraft` (which blocks duplicate sends for the same draft). No additional deduplication needed.
- **Webhook-triggered activity events**: These are emitted after the `email_events` idempotency check passes. Since `email_events` already guarantees one row per `provider_event_id`, and the activity event emission follows immediately, activity events are at-most-once per unique webhook delivery. If the activity event write fails after the `email_events` write succeeds, the event is lost but the raw data remains in `email_events`. This is acceptable for v1 (observation, not enforcement).

### 11.3 Missing `email_send` Match

If a webhook event arrives with a `resend_message_id` that matches no `email_sends` record:
- Log the unknown message ID (existing behavior)
- Do not emit an activity event (no attribution context available)
- Return 200 (existing behavior; prevents Resend retries)

This scenario occurs for Phase 3A template sends or emails sent outside of Verian BIOS entirely.

### 11.4 Stale or Replayed Webhooks

The existing timestamp tolerance check (reject if > 5 minutes old) prevents replayed webhooks. Webhooks within tolerance are handled idempotently via `provider_event_id`. No additional stale-event handling is required.

---

## 12. Error Handling

### 12.1 Webhook Handler Error Containment (Existing Pattern)

The existing webhook handler wraps all event processing in a try/catch and always returns 200. This prevents Resend from re-queuing events on application errors. Event Tracking must preserve this pattern.

If `activityEventService.recordActivity` fails:
- Log the error
- Do not re-throw
- Continue to mark `webhook_events` as processed
- Return 200

The `email_events` record has already been written by this point; the raw event data is not lost.

### 12.2 Send Service Error Containment

If Phase 3B metadata enrichment fails in `sendApprovedDraft` (e.g., `email_drafts` read fails):
- Log the error
- Continue with the send (do not block the send for a metadata enrichment failure)
- Emit internal events without Phase 3B context if enrichment failed, or skip them

The reviewer's send action must succeed even if Event Tracking enrichment fails. Observability is never a gate on sending.

### 12.3 Malformed Webhook Payload

If `payload.data.email_id` is absent or `payload.type` is unknown:
- Existing handler logs and returns early (no `email_events` insert)
- No activity event emitted
- `webhook_events` still gets the raw payload for debugging

---

## 13. Guardrails

The following guardrails apply to Event Tracking and must remain in force throughout implementation:

| Guardrail | Statement |
|-----------|-----------|
| No learning | Event tracking records facts only. No scores are updated. No strategy weights change. No QRA records change. |
| No sending | Event tracking never initiates, triggers, retries, or suppresses any email send. |
| No copy modification | `body_text`, `subject_line`, `body_html` are never touched by event tracking. |
| No HRB/QRA modification | `message_version.approval_status`, `quality_review` records — all immutable from event tracking. |
| No auto-unsubscribe on new events | Existing Phase 3A auto-unsubscribe on complaint is preserved. Event tracking does not add new auto-unsubscribe triggers. |
| Phase 3A behavior unchanged | All existing Phase 3A webhook, send, and email_events behavior is unchanged. Event tracking adds to it, not replaces it. |
| Webhook handler still returns 200 | Event tracking errors never cause non-2xx responses that would trigger Resend retries. |
| No migration required in v1 | All data stored in existing jsonb columns. A future migration may be needed for Learning Agent scale — but it is not required for observation. |
| Event tracking is additive | New activity event types are added with `as const` — no enum, no existing entries modified. |
| No new AI agent | Event tracking is a data pipeline. It does not reason, generate, classify, or predict. |

---

## 14. Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| `email_drafts.ai_generation_metadata.source` is not `'phase_3b_send_bridge'` | Skip Phase 3B enrichment; do not emit ET_ activity events; Phase 3A behavior applies |
| `ai_generation_metadata` is null or malformed | Log and continue send without Phase 3B enrichment |
| `message_version_id` in metadata refers to a deleted or superseded version | Activity event still recorded as-is — provenance is historical; version deletion does not block attribution |
| Webhook arrives before send record is written (race condition) | `email_sends` lookup by `resend_message_id` returns null; existing handler logs and returns; no activity event |
| Multiple `email.opened` events for the same email | Each is idempotent via `provider_event_id`; second and subsequent opens insert into `email_events` as separate rows (Resend sends one per open pixel hit with a different event ID); activity events are emitted for each open — the Learning Agent may choose to deduplicate at query time |
| `email.delivery_delayed` event | Logged in `email_events`; no status change; no activity event; no Phase 3B action |
| Bounce for a Phase 3B send | `ET_EMAIL_BOUNCED` activity event emitted with full attribution; existing `email_sends.status → bounced` behavior unchanged; no auto-suppression in v1 beyond what Phase 3A already does |
| Complaint for a Phase 3B send | `ET_EMAIL_COMPLAINED` activity event emitted; existing auto-unsubscribe behavior unchanged |
| Reviewer sends same approved draft twice | `getActiveSendForDraft` blocks the second send before Resend is called; only one `ET_SEND_INITIATED` event emitted |
| `resend_message_id` matches two `email_sends` records | Shouldn't happen (Resend assigns unique IDs); if it did, `email_sends` lookup would return first match; log anomaly |
| Send succeeds but `ET_SEND_SUCCEEDED` activity event fails | Send is already marked `status = 'sent'`; the raw `email_sends` record is the source of truth; activity event loss is logged but non-fatal |
| Phase 3B version that was approved, drafted, sent, and then its strategy is superseded | Attribution still points to the strategy as it was at send time; strategy supersession does not affect historical event records |

---

## 15. UI Behavior

### 15.1 Current State (after Send Bridge)

The message workspace `[leadId]` page currently shows:
- Approved version card with "Ready to Send" badge when draft is in `approved` status
- No visibility into what happens after the reviewer sends

### 15.2 Required UI Changes (Event Tracking scope)

**Primary location:** Message workspace `[leadId]` page, within each version card for approved versions.

**Draft/send status progression for the approved card:**

| `email_draft.status` | `email_send.status` | UI shown |
|---------------------|-------------------|---------|
| `approved` | — (no send yet) | "Ready to Send" badge + Send button |
| `sent` | `queued` | "Sending…" badge |
| `sent` | `sent` | "Sent ✓" — with timestamp |
| `sent` | `delivered` | "Delivered ✓" — with timestamp |
| `sent` | `bounced` | "Bounced ✗" — amber warning badge |
| `sent` | `complained` | "Complaint" — red warning badge |
| `sent` | `failed` | "Send Failed ✗" — with error reason |
| `sent` | `opened` (from event count) | "Opened" — green badge if `email_events` has `email.opened` |
| `sent` | `clicked` (from event count) | "Clicked" — teal badge if `email_events` has `email.clicked` |

**Note:** `email_draft.status = 'sent'` is set by `sendApprovedDraft` on success. The delivery status (`delivered`, `bounced`, etc.) lives on `email_send.status` and requires a second lookup.

**Secondary location:** Lead record view — show a "Messages sent" section with send/delivery/engagement status for each Phase 3B-originated email.

**UI behavior rules:**
- Opened/clicked status is additive — "Sent → Delivered → Opened" is shown as the most advanced state
- Bounce/complaint overrides open/click — always show the most severe negative outcome
- Status refreshes on page reload (server-side data load); no real-time push in v1
- No action buttons on the "Sent" state — event tracking is observation only

### 15.3 Page Loader Changes

`page.tsx` must load, for each Phase 3B-approved version that has been sent:
1. `email_send` record linked to the approved draft (query `email_sends` by `draft_id`)
2. Most recent `email_event` outcome (query `email_events` by `email_send_id`, ordered by `occurred_at DESC`)

This produces a `sendStatusByVersionId` map, analogous to the existing `draftStatusByVersionId` map.

---

## 16. Learning Agent Handoff Considerations

This section describes what Event Tracking provides to the future Learning Agent without building it.

### 16.1 What the Learning Agent Will Want

When scoped, the Learning Agent will need to answer questions like:
- "For all emails generated with strategy angle X and QRA score > 75 in the last 90 days — what was the delivery rate? Open rate? Reply rate?"
- "Which version labels (A, B, C) from the Copywriting Agent performed best on email.opened events?"
- "When a reviewer overrides a low-QRA score and approves anyway — how do those emails perform vs. normal approvals?"

### 16.2 What Event Tracking Provides

After this phase, `activity_events` will contain rows with:
- `event_type` = `ET_EMAIL_DELIVERED` / `ET_EMAIL_OPENED` / `ET_EMAIL_CLICKED` / etc.
- `entity_type` = `'message_version'`
- `entity_id` = `message_version_id`
- `metadata` = full Phase 3B attribution (strategy_id, quality_review_id, composite_score, version_label, approved_by, etc.)

The Learning Agent can query `activity_events WHERE event_type = 'ET_EMAIL_DELIVERED' AND metadata->>'strategy_id' = 'X'` to get delivery outcomes for a strategy without joining through `email_sends → email_drafts → ai_generation_metadata`.

### 16.3 What Event Tracking Explicitly Does NOT Do

- Does not calculate open rates, click rates, or delivery rates
- Does not determine whether an outcome is "good" or "bad" for a strategy
- Does not update `message_strategy.status` based on outcomes
- Does not update QRA composite scores based on outcomes
- Does not create a feedback loop of any kind

The Learning Agent will implement the reasoning layer on top of the observation layer that Event Tracking provides.

### 16.4 Schema Readiness for Learning Agent

The `activity_events` approach with `metadata` jsonb provides flexibility for the Learning Agent's first version. If the Learning Agent needs query performance, a migration adding `message_version_id` and `strategy_id` as indexed columns on `email_sends` and/or `email_events` would be the next step. Event Tracking is designed so that migration is an additive index, not a data backfill — the data already exists in `metadata`.

---

## 17. Test Case Matrix

All test cases are behavioral specifications. No code is written here.

---

**TC-ET-001 — Internal send initiated event captured for Phase 3B send**
Input: Reviewer calls `sendApprovedDraftAction` on a Phase 3B-originated draft (`ai_generation_metadata.source = 'phase_3b_send_bridge'`). Send succeeds.
Expected: `ET_SEND_INITIATED` activity event written with `message_version_id`, `strategy_id`, `quality_review_id`, `send_initiated_by` in metadata. `email_sends.metadata` contains Phase 3B fields.
Pass condition: Activity event found with correct attribution. `email_sends.metadata.message_version_id` matches draft's version.

---

**TC-ET-002 — Internal send succeeded event captured**
Input: `sendApprovedDraft` receives a valid `resendMessageId` from Resend.
Expected: `ET_SEND_SUCCEEDED` activity event written with `resend_message_id` and full Phase 3B attribution.
Pass condition: Activity event found. `email_sends.status = 'sent'`. `email_sends.resend_message_id` set.

---

**TC-ET-003 — Internal send failed event captured**
Input: Resend API throws an error during `sendApprovedDraft`.
Expected: `ET_SEND_FAILED` activity event written with `error_reason`. `email_sends.status = 'failed'`.
Pass condition: Activity event with `action_type = 'ET_SEND_FAILED'`. No email sent. Draft remains `status = 'approved'`.

---

**TC-ET-004 — Delivery webhook event captured and attributed**
Input: Resend sends `email.delivered` webhook for a `resend_message_id` that matches a Phase 3B `email_send`.
Expected: `ET_EMAIL_DELIVERED` activity event written with full Phase 3B attribution. `email_sends.status = 'delivered'`. `email_events` row inserted.
Pass condition: Three writes verified: `email_events` row, `email_sends` status update, `activity_events` row.

---

**TC-ET-005 — Bounce webhook event captured**
Input: Resend sends `email.bounced` webhook for a Phase 3B send.
Expected: `ET_EMAIL_BOUNCED` activity event written. `email_sends.status = 'bounced'`. `email_events` row inserted.
Pass condition: Activity event found with `action_type = 'ET_EMAIL_BOUNCED'`, `message_version_id`, `strategy_id`, `lead_id`, `contact_id`.

---

**TC-ET-006 — Complaint webhook triggers auto-unsubscribe and activity event**
Input: Resend sends `email.complained` webhook.
Expected: `ET_EMAIL_COMPLAINED` activity event written. `email_sends.status = 'complained'`. `unsubscribes` row upserted. `email_events` row inserted.
Pass condition: All four side effects confirmed. Auto-unsubscribe behavior unchanged from existing Phase 3A pattern.

---

**TC-ET-007 — Open event captured without changing email_send status**
Input: Resend sends `email.opened` webhook.
Expected: `ET_EMAIL_OPENED` activity event written. `email_sends.status` NOT changed (remains `'delivered'` or `'sent'`). `email_events` row inserted.
Pass condition: `email_sends.status` unchanged. Activity event with `action_type = 'ET_EMAIL_OPENED'` found.

---

**TC-ET-008 — Click event captured without changing email_send status**
Input: Resend sends `email.clicked` webhook.
Expected: `ET_EMAIL_CLICKED` activity event written. `email_sends.status` NOT changed. `email_events` row inserted.
Pass condition: `email_sends.status` unchanged. Activity event with `action_type = 'ET_EMAIL_CLICKED'` found.

---

**TC-ET-009 — Duplicate webhook delivery ignored (idempotency)**
Input: Resend delivers the same `email.delivered` webhook twice with the same `webhook-id` (same `provider_event_id`).
Expected: First delivery: processed normally. Second delivery: `23505` unique violation on `email_events` insert; silently ignored. No duplicate activity event emitted.
Pass condition: `email_events` has exactly one row for this `provider_event_id`. `activity_events` has exactly one `ET_EMAIL_DELIVERED` for this send.

---

**TC-ET-010 — Unknown webhook event type safely ignored**
Input: Resend sends a webhook with `event_type = 'email.delivery_delayed'` or any unknown type.
Expected: `webhook_events` row inserted. `email_events` row inserted (event type stored as-is). No `activity_events` row for this type. `email_sends.status` not changed. Returns 200.
Pass condition: No error. `email_sends` unchanged. No Phase 3B activity event.

---

**TC-ET-011 — Webhook with no matching email_send handled safely**
Input: `email.delivered` webhook arrives for a `resend_message_id` that has no matching `email_sends` record.
Expected: `webhook_events` row inserted. `email_events` insert NOT attempted (cannot link). No activity event. Warning logged. Returns 200.
Pass condition: No exception thrown. `email_events` has no orphaned row for this message ID.

---

**TC-ET-012 — Webhook with missing email_id handled safely**
Input: Webhook payload has no `data.email_id` field.
Expected: `webhook_events` row inserted. Processing exits early (cannot link). No `email_events` row. Warning logged. Returns 200.
Pass condition: No exception. `email_events` unchanged.

---

**TC-ET-013 — Malformed webhook payload rejected safely**
Input: POST body is not valid JSON.
Expected: Returns 400. `webhook_events` not inserted (parse failed before insert). No processing.
Pass condition: 400 response. No rows inserted. Existing error handling preserved.

---

**TC-ET-014 — Invalid webhook signature rejected**
Input: `RESEND_WEBHOOK_SECRET` is configured. Request has invalid `webhook-signature` header.
Expected: Returns 401. No processing. No rows inserted.
Pass condition: 401 response. Existing signature verification unchanged.

---

**TC-ET-015 — Stale webhook rejected**
Input: `webhook-timestamp` is > 300 seconds old.
Expected: Returns 401. No processing. Existing timestamp tolerance check unchanged.
Pass condition: 401 response.

---

**TC-ET-016 — Phase 3A template send does not emit Phase 3B activity events**
Input: `sendApprovedDraftAction` is called on a Phase 3A template draft (no `ai_generation_metadata`, or `source !== 'phase_3b_send_bridge'`).
Expected: Send proceeds normally. `email_sends` record created. Resend called. BUT: no `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED` activity events emitted. No Phase 3B metadata enrichment in `email_sends.metadata`.
Pass condition: `activity_events` has no ET_ rows for this send. Phase 3A behavior is unaffected.

---

**TC-ET-017 — Phase 3B attribution carried from send to webhook event**
Input: Phase 3B email sent (TC-ET-001). Subsequently, `email.delivered` webhook arrives.
Expected: `ET_EMAIL_DELIVERED` activity event has `message_version_id`, `strategy_id`, `quality_review_id` matching the original send. Attribution is correct end-to-end.
Pass condition: All Phase 3B fields match the original `message_version` that was approved, drafted, and sent.

---

**TC-ET-018 — Attribution traces back to message_version via email_sends.metadata**
Input: Phase 3B send with known `message_version_id`. Query `email_sends` for this send.
Expected: `email_sends.metadata.message_version_id` matches the known version ID. Join to `activity_events` by this ID retrieves the ET_ events.
Pass condition: Attribution chain is complete without querying `email_drafts`.

---

**TC-ET-019 — Attribution traces to strategy and quality_review**
Input: Phase 3B send. Look up `ET_EMAIL_DELIVERED` activity event metadata.
Expected: `metadata.strategy_id` matches the strategy that produced the message version. `metadata.quality_review_id` matches the QRA record for that version.
Pass condition: Full provenance chain accessible from a single activity event row.

---

**TC-ET-020 — No score update occurs on delivery event**
Input: Phase 3B email delivered successfully. `ET_EMAIL_DELIVERED` event captured.
Expected: `quality_review.composite_score` unchanged. `message_strategy.status` unchanged. `message_version.approval_status` unchanged.
Pass condition: All Phase 3B records match their pre-send state.

---

**TC-ET-021 — No score update occurs on open event**
Input: `ET_EMAIL_OPENED` captured for a Phase 3B email.
Expected: QRA records unchanged. Strategy records unchanged. Version records unchanged.
Pass condition: All Phase 3B records unchanged.

---

**TC-ET-022 — No new email sent by event tracking**
Input: Any ET_ activity event captured (delivery, open, click, bounce).
Expected: No new `email_sends` rows created. No Resend API call made by event tracking. `email_sends` table has exactly one row for the original send.
Pass condition: `email_sends` count unchanged after event processing.

---

**TC-ET-023 — Bounce event does not auto-suppress the contact**
Input: `ET_EMAIL_BOUNCED` captured for a Phase 3B send.
Expected: `unsubscribes` table NOT updated (bounce is different from complaint). Contact's `do_not_contact` flag NOT changed. Suppression NOT triggered by bounce alone.
Pass condition: `unsubscribes` unchanged. Contact record unchanged. Only `email_sends.status = 'bounced'` and activity event written.

---

**TC-ET-024 — Complaint event auto-suppresses and emits activity event**
Input: `ET_EMAIL_COMPLAINED` captured for a Phase 3B send (reusing TC-ET-006).
Expected: Both the auto-unsubscribe (existing Phase 3A behavior) AND the `ET_EMAIL_COMPLAINED` activity event occur.
Pass condition: `unsubscribes` row exists. Activity event exists with Phase 3B attribution. Both effects confirmed.

---

**TC-ET-025 — Activity event has correct tenant and workspace scoping**
Input: Phase 3B send and subsequent delivery event for tenant-001 / workspace-001.
Expected: Both `ET_SEND_SUCCEEDED` and `ET_EMAIL_DELIVERED` activity events have `tenant_id = 'tenant-001'` and `workspace_id = 'workspace-001'`.
Pass condition: No cross-tenant contamination. Attribution is tenant-scoped throughout.

---

**TC-ET-026 — Event tracking does not generate body_text or subject_line**
Input: Any ET_ activity event processing.
Expected: `message_version.body_text` and `message_version.subject_line` unchanged. No generated content in any event payload.
Pass condition: No copy fields written or modified during event tracking.

---

**TC-ET-027 — Delivery delayed event does not cause status regression**
Input: `email.delivery_delayed` arrives after `email.delivered`.
Expected: No status change (no mapping in `EVENT_TO_SEND_STATUS` for `delivery_delayed`). `email_sends.status` remains `'delivered'`. `email_events` row inserted. No activity event.
Pass condition: `email_sends.status` = `'delivered'` (unchanged). No regression.

---

**TC-ET-028 — Multiple opens do not create duplicate activity events for the same provider_event_id**
Input: `email.opened` webhook delivered twice with the same `webhook-id`.
Expected: Second delivery hits `23505` on `email_events` insert; silently dropped. Only one `ET_EMAIL_OPENED` activity event.
Pass condition: One `email_events` row, one `ET_EMAIL_OPENED` activity event, per `provider_event_id`.

---

**TC-ET-029 — Multiple opens with DIFFERENT provider_event_ids each create an event**
Input: Recipient opens email three times. Each open has a different `webhook-id` from Resend (Resend sends one per pixel hit).
Expected: Three `email_events` rows. Three `ET_EMAIL_OPENED` activity events. `email_sends.status` unchanged after each.
Pass condition: Three rows in `email_events`, three rows in `activity_events` for this send. No status regression.

---

**TC-ET-030 — send_initiated_by is the reviewing user who clicked Send (not the approver)**
Input: User A approved the message via HRB. User B clicked "Send" later.
Expected: `ET_SEND_INITIATED` activity event has `send_initiated_by = 'user-B-id'`. The `approved_by` field in metadata has `'user-A-id'`.
Pass condition: Two distinct user IDs in the event. Attribution correctly distinguishes the approver from the sender.

---

**TC-ET-031 — Enrichment failure does not block the send**
Input: `email_drafts` read fails during Phase 3B metadata enrichment in `sendApprovedDraft`.
Expected: Error is caught and logged. Send continues to Resend. `email_sends` record created (without Phase 3B metadata enrichment). Resend called. Email delivered.
Pass condition: Email is sent despite enrichment failure. No ET_ activity event emitted (acceptable for v1 — observability is never a send gate).

---

**TC-ET-032 — UI shows "Delivered" badge after delivery webhook processed**
Input: Phase 3B email has been sent and `email.delivered` webhook has been processed. Page loads `[leadId]` message workspace.
Expected: Version card shows "Delivered ✓" badge with timestamp. No "Create Email Draft" or "Ready to Send" button shown.
Pass condition: UI reflects `email_send.status = 'delivered'`. Correct state displayed without further action.

---

**TC-ET-033 — UI shows "Bounced" warning after bounce webhook processed**
Input: `email.bounced` webhook processed. Page loads.
Expected: Version card shows "Bounced ✗" amber warning badge. No "Send" or "Create Draft" option shown.
Pass condition: Bounce state is visible to the reviewer in the message workspace.

---

**TC-ET-034 — UI shows "Opened" badge when open event recorded**
Input: `ET_EMAIL_OPENED` event captured. Page loads.
Expected: Version card shows "Opened" green engagement badge alongside "Sent ✓".
Pass condition: Open engagement visible. No status regression from delivery state.

---

**TC-ET-035 — Activity event query returns correct event chain for one send**
Input: Phase 3B email that was sent, delivered, and opened. Query `activity_events` by `entity_id = message_version_id`.
Expected: Returns exactly: `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_EMAIL_DELIVERED`, `ET_EMAIL_OPENED` — all attributed to the same `message_version_id`, `strategy_id`, `quality_review_id`.
Pass condition: Complete event chain accessible by querying `activity_events` on a single `entity_id`. Ready for Learning Agent consumption.

---

## 18. Acceptance Criteria

The design is complete and approvable when all of the following are true:

| Criterion | Met? |
|-----------|------|
| Event Tracking role and boundaries clearly defined | ✓ |
| Existing Phase 3A infrastructure fully inventoried | ✓ |
| No new tables required in v1 | ✓ |
| Attribution strategy defined (metadata enrichment at send time) | ✓ |
| Internal event types defined (3) | ✓ |
| Webhook event types defined (7 captured, 2 logged only) | ✓ |
| Events not available in v1 identified (reply, unsubscribe) | ✓ |
| Idempotency rules defined (existing `provider_event_id`; no new mechanism needed) | ✓ |
| Phase 3B vs Phase 3A origin detection defined | ✓ |
| ActivityEventType additions defined (9 ET_ constants, additive) | ✓ |
| Error containment rules defined (observability never blocks sends) | ✓ |
| No-learning guardrails defined | ✓ |
| UI behavior defined per send/delivery/engagement state | ✓ |
| Learning Agent handoff considerations defined | ✓ |
| Future migration path identified (optional, flagged for v2) | ✓ |
| 35 test cases defined | ✓ |
| No code written | ✓ |
| No SQL written | ✓ |
| No sending introduced | ✓ |

---

## 19. Open Questions

The following questions should be resolved during the Implementation Plan or during initial implementation:

| # | Question | Implication |
|---|---------|-------------|
| 1 | **Does Resend send `email.sent` as a webhook event** in addition to the API response? | If yes, it could serve as an additional confirmation event. If not (current understanding), the internal `ET_SEND_SUCCEEDED` is the only "sent" signal. Check Resend webhook documentation. |
| 2 | **Is open tracking enabled on Phase 3B sends?** Open and click tracking require Resend tracking to be enabled per email or globally. If not enabled, `email.opened` and `email.clicked` webhooks will not fire. | Implementation plan should note whether tracking is enabled and how to configure it. |
| 3 | **Does `email.delivery_delayed` warrant a Phase 3B activity event?** Currently specified as log-only. If delayed delivery is common, a UI state for "Delivery Delayed" may be useful. | Implementation plan may choose to add `ET_EMAIL_DELIVERY_DELAYED`. |
| 4 | **Where exactly is `send_initiated_by` (the reviewer's userId) available in `sendApprovedDraft`?** It is `ctx.userId` passed in the request context. Confirm this is available and is the correct user ID. | No blocker; confirm during implementation. |
| 5 | **Should bounce events also trigger auto-suppression** (similar to complaints)? Currently this design says bounce does not auto-suppress. Hard bounces in particular could warrant auto-suppression. | Implementation plan should decide: no suppression (current recommendation), or suppress on hard bounce only. |
| 6 | **`email_events` currently stores `tenant_id` from the `email_send` record** (indirectly). Is `workspace_id` also available at webhook processing time? | `email_sends` has `workspace_id`; confirm it is returned in the select query in `processResendEvent`. |

---

## 20. Recommended Next Step

Once this design is approved by the user:

**Phase 3B Event Tracking / Send Outcome Tracking — Implementation Plan**

That plan should specify:

1. **Exact changes to `email-send.service.ts`**: where to read `ai_generation_metadata`, which fields to copy into `email_sends.metadata`, where to emit the 3 internal activity events.
2. **Exact changes to `/api/webhooks/resend/route.ts`**: where to check for Phase 3B origin, which activity events to emit, error containment pattern.
3. **Exact `ActivityEventType` additions** (9 constants, additive only).
4. **Exact `email_sends` lookup expansion** in `processResendEvent`: the select must include `metadata`, `contact_id`, `company_id`, `workspace_id` fields to build the activity event payload.
5. **Exact `email_send` lookup function** needed for the send service (read `email_draft` by `draftId` to get `ai_generation_metadata`).
6. **UI component changes**: `sendStatusByVersionId` loading in `page.tsx`, version card state rendering.
7. **Test fixtures** and test suite: `tests/fixtures/event-tracking/TC-ET-001.json` through `TC-ET-035.json`, `tests/event-tracking.test.ts`.
8. **QA checklist**: vitest (≥ 35 new tests), build, TypeScript, lint.
9. **Resolve open questions 1–6** before or during implementation.

---

*Document status: Draft. Awaiting user approval before implementation planning begins.*
*Version: 1.0 — 2026-05-21*
