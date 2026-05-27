# Phase 3H — Send Safety Hardening
## Design Document & Test Case Outline v1.0

**Status:** Design — awaiting user approval before implementation planning begins
**Phase theme:** Send Safety Hardening
**Depends on:** Phase 3G complete and locked (`a4f488a`, `phase-3g-agent-operations-readiness-v1`)
**Tests baseline:** 1048/1048
**Next migration available:** `20240033`
**Date:** 2026-05-27

---

## Section 1 — Problem Statement

### 1.1 Why Phase 3H Is Required Before Live Sending Expansion

Phase 3G's source audit revealed that the email send path has four significant safety gaps that must be closed before any expansion of live sending, controlled pilot, or campaign model work:

1. **The kill switch is decorative.** `EMAIL_SENDING_ENABLED` exists in the `system_controls` table and is exposed in the System Controls UI, but `sendApprovedDraft()` never reads it. An operator can disable the kill switch with no effect on actual sending.

2. **Phase 3A sends are invisible.** Auto-path sends (template-based drafts created by the lead workflow) produce `email_sends` rows and Resend API calls, but emit no `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, or `ET_SEND_FAILED` activity events. The lead detail page Workflow Activity timeline shows nothing for these sends. Operators cannot tell whether a send occurred, succeeded, or failed unless they query the DB directly.

3. **Webhook delivery failures are silent.** Permanent bounces, complaints, and delivery delays update `email_sends.status` and insert into `email_events`, but create no operator-visible alert. The complaint path does auto-unsubscribe (existing Phase 3A behavior), but generates no structured error in System Intelligence. A permanent bounce at a lead's email address is invisible to the operator beyond the status badge.

4. **Failure attribution is JSONB-only.** `email_sends.error_message` is populated on failure, but there is no typed `failure_reason` column. The sender (`ctx.userId`) is stored in `metadata.send_initiated_by` (JSONB) with no typed `triggered_by` column. Structured reporting and audit queries require JSONB path expressions.

Phase 3H addresses all four gaps. It is a prerequisite for Phase 3M (Live Pilot) and a hard dependency for the Phase 3K campaign stop-condition model.

### 1.2 Why `EMAIL_SENDING_ENABLED` Must Become a Real Send Gate

The current architecture of `sendApprovedDraft()` (verified in `modules/messaging/services/email-send.service.ts`) has 8 gates enforced before the Resend API call:

1. Permission check (`messaging.send_emails`)
2. Draft ownership (tenant + workspace)
3. Lifecycle double-gate (draft status = `approved` AND approval_request status = `approved`)
4. Idempotency (no active send for draft)
5. Recipient validation (email present, `do_not_contact = false`)
6. Suppression (unsubscribes + suppression_rules)
7. Rate limit (`checkEmailRateLimit`)
8. Sender identity present

None of these checks read `SystemControlKey.EMAIL_SENDING_ENABLED`. The control key exists in `types.agent.ts` and is seeded in `system_controls`, but the gate is absent from the send path. This means:

- An operator disabling `EMAIL_SENDING_ENABLED` in the System Controls page has no effect on the ability to send email.
- The only way to stop all sends today is to delete sender identities or set rate limits to zero.
- For Phase 3M live pilot, the ability to disable sending with a single system control toggle is a hard requirement. Without Gate 0, there is no reliable emergency stop.

Gate 0 must be the first async check in `sendApprovedDraft()` — before any draft or contact reads. A disabled kill switch should exit immediately without touching any other data.

### 1.3 Why Webhook Failures Must Surface in System Intelligence

The Resend webhook handler at `app/api/webhooks/resend/route.ts` currently:
- Inserts into `email_events` (idempotent via `provider_event_id`)
- Updates `email_sends.status` for terminal states
- Emits `ET_EMAIL_*` activity events for Phase 3B sends
- Auto-unsubscribes on `email.complained`

It does NOT create structured errors in `automation_failures`. This means:
- A permanent bounce (indicating an invalid contact email) creates no operator alert.
- A complaint (indicating the recipient marked the email as spam — the most severe deliverability signal) creates an auto-unsubscribe but generates no `critical`-severity structured error.
- Delivery delays (soft failure, may resolve) are completely invisible beyond the webhook event record.

System Intelligence (Phase 3C) exists precisely to surface these events to operators. Without structured errors for bounce/complaint/delay, the System Intelligence page is incomplete as a monitoring tool.

---

## Section 2 — Proposed Scope

Phase 3H is send-path hardening. It touches the send service, webhook handler, structured error types, and one migration. It introduces no new features, no new user-facing pages, and no automatic sending.

| # | Change | File(s) |
|---|--------|---------|
| 2.1 | Gate 0: enforce `EMAIL_SENDING_ENABLED` in `sendApprovedDraft` | `email-send.service.ts` |
| 2.2 | Emit `ET_SEND_*` for all sends, not only Phase 3B sends | `email-send.service.ts` |
| 2.3 | Add typed `failure_reason` and `triggered_by` columns to `email_sends` | Migration `20240033`, `types/database.ts`, `email-send.service.ts`, `email-send.repo.ts` |
| 2.4 | Permanent bounce → `EMAIL_PERMANENT_BOUNCE` structured error | `route.ts`, `structured-error.types.ts` |
| 2.5 | Complaint → `EMAIL_COMPLAINT_RECEIVED` structured error (severity `critical`) | `route.ts`, `structured-error.types.ts` |
| 2.6 | Delivery delay → `EMAIL_DELIVERY_DELAYED` structured error (idempotent) | `route.ts`, `structured-error.types.ts` |
| 2.7 | Add `WEBHOOK_FAILURE_TYPE` constants | `structured-error.types.ts` |
| 2.8 | Verify unsubscribe link in email templates | Audit only — gap documented |

---

## Section 3 — Migration Assessment

### 3.1 Migration `20240033` Is Required

Two typed columns on `email_sends` do not exist today:

| Column | Type | Reason |
|--------|------|--------|
| `failure_reason` | `text` | Currently written to `email_sends.metadata.error` (JSONB). A typed column allows direct indexed queries and structured reporting. |
| `triggered_by` | `text` | Currently written to `email_sends.metadata.send_initiated_by` (JSONB). A typed column captures `ctx.userId` for audit and attribution queries. |

Both are nullable — existing rows are not back-filled. Both are additive. The existing `error_message` column (added in migration `20240013`) captures the raw Resend error message and is retained alongside `failure_reason`.

### 3.2 Conceptual SQL (Migration `20240033`)

```sql
-- Phase 3H: Send Safety Hardening
-- Adds typed attribution and failure columns to email_sends.

ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS triggered_by   text;
```

No new tables. No changes to `automation_failures`. No changes to `email_drafts`, `email_events`, or `unsubscribes`.

### 3.3 No Additional Migration Required for Structured Errors

`automation_failures` already has a `correlation_id text` column (added in migration `20240028`). No unique constraint exists on `(tenant_id, failure_type, correlation_id)` — the delivery delay idempotency guard uses a check-before-insert pattern in code rather than a DB constraint.

---

## Section 4 — Send Gate Design

### 4.1 Gate Order After Phase 3H

The revised gate sequence in `sendApprovedDraft()`:

| Gate | What | How | Error reason |
|------|------|-----|--------------|
| 0 | Permission | `requirePermission(ctx, 'messaging.send_emails')` — synchronous, no DB | (throws) |
| **1 (new)** | **`EMAIL_SENDING_ENABLED` kill switch** | **`getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, ctx.tenantId)` — first async check** | **`'sending_disabled_by_system_control'`** |
| 2 | Fetch draft | `emailSendRepo.getEmailDraftForSending(...)` | `'draft_not_found'` |
| 3 | Lifecycle double-gate | draft status + approval_request status | `'draft_not_approved'` / `'approval_request_not_approved'` |
| 4 | Idempotency | `emailSendRepo.getActiveSendForDraft(...)` | `'duplicate_send_blocked'` |
| 5 | Recipient validation | contact email present + `do_not_contact = false` | `'recipient_contact_not_found'` etc. |
| 6 | Suppression | `suppressionRepo.checkEmailSuppression(...)` | `'suppression_blocked'` |
| 7 | Rate limit | `rateLimitService.checkEmailRateLimit(...)` | (throws) |
| 8 | Sender identity | `emailDraftRepo.getDefaultSenderIdentity(...)` | `'no_sender_identity_configured'` |

The permission check remains first because it is synchronous (no DB read). `EMAIL_SENDING_ENABLED` becomes the first async check, before any draft or contact data is loaded.

### 4.2 What Happens When `EMAIL_SENDING_ENABLED` Is False

```
sendApprovedDraft(ctx, draftId)
  → requirePermission(ctx, 'messaging.send_emails')   ← synchronous guard unchanged
  → getBooleanControl('email_sending_enabled', ctx.tenantId)
      → row is null or is_enabled = false or value = false
      → return { ok: false, reason: 'sending_disabled_by_system_control' }
      ← no further DB reads; no email_send row created
```

The caller (`sendApprovedDraftAction`) surfaces this as a user-visible error message. No `email_sends` row is written. No Resend API call is made.

### 4.3 Tenant Scope

`getBooleanControl` in `system-control.repo.ts` already implements tenant-scoped resolution with platform fallback:
1. Query `system_controls` WHERE `key = 'email_sending_enabled'` AND `tenant_id = ctx.tenantId`
2. If found → use it
3. If not found → query WHERE `key = 'email_sending_enabled'` AND `tenant_id IS NULL` (platform default)

This means `EMAIL_SENDING_ENABLED` can be set per-tenant (for the Phase 3M controlled pilot: one tenant enabled, all others disabled) or platform-wide. The default value when no row exists is `false` (the `getBooleanControl` `defaultValue` parameter defaults to `false`).

### 4.4 Environment Scope

Gate 0 is enforced in ALL environments (local, staging, production). The non-production fallback sender (`onboarding@resend.dev`) already exists for local/staging and is a separate guard. Gate 0 provides an explicit, human-readable kill switch above the sender identity layer. Staging tests requiring send verification must explicitly set `EMAIL_SENDING_ENABLED = true` for the staging tenant.

---

## Section 5 — Activity Event Design

### 5.1 Current Gap

Lines 176–194, 238–257, and 272–289 of `email-send.service.ts` wrap all three ET_ emissions in `if (phase3bMeta !== null)`. `phase3bMeta` is only non-null when the draft was created via the Phase 3B Send Bridge (i.e., `metadata.source === 'phase_3b_send_bridge'`). Auto-path drafts (created by `createLeadEmailDraft` in `email-draft.service.ts`) set `metadata.template_used` but not `metadata.source`, so `extractPhase3bMeta` returns `null` and all ET_ events are suppressed.

### 5.2 Proposed Fix

Move the ET_ emission blocks outside the `if (phase3bMeta !== null)` guard. When `phase3bMeta` is non-null, the Phase 3B-rich payload (version label, strategy_id, etc.) is used — unchanged from current behavior. When `phase3bMeta` is null (Phase 3A auto-path send), a simplified payload is emitted.

### 5.3 Entity Type and ID for Phase 3A Sends

For Phase 3B sends: `entityType = 'message_version'`, `entityId = phase3bMeta.message_version_id`
For Phase 3A sends: `entityType = 'email_draft'`, `entityId = draftId`

The `email_drafts` table has a `lead_id` column (migration `20240006`). The draft object fetched by `getEmailDraftForSending` includes this field (currently accessed via `(draft as unknown as Record<string, unknown>)['lead_id']` — already done for Phase 3B metadata, same pattern applies).

### 5.4 Activity Event Payloads

**`ET_SEND_INITIATED` (Phase 3A path):**
```
entityType:    'email_draft'
entityId:      draftId
eventSummary:  `Send initiated for draft to ${draft.to_email}`
leadId:        draft.lead_id ?? undefined
contactId:     draft.contact_id ?? undefined
companyId:     draft.company_id ?? undefined
metadata: {
  emailSendId:   emailSend.id,
  draftId,
  toEmail:       draft.to_email,
  triggeredBy:   ctx.userId,
  sendPath:      'phase_3a_template',
}
```

**`ET_SEND_SUCCEEDED` (Phase 3A path):**
```
eventSummary:  `Send succeeded for draft to ${draft.to_email}`
metadata: {
  emailSendId, draftId, toEmail, resendMessageId, sendPath: 'phase_3a_template'
}
```

**`ET_SEND_FAILED` (Phase 3A path):**
```
eventSummary:  `Send failed for draft to ${draft.to_email}: ${errorMessage}`
metadata: {
  emailSendId, draftId, toEmail, errorReason: errorMessage, sendPath: 'phase_3a_template'
}
```

Phase 3B payloads are unchanged — they continue to use `etAudit.build*Payload()` functions.

### 5.5 Null `lead_id` Handling

If `draft.lead_id` is null (possible for manually created drafts not linked to a lead), the activity event is still emitted — `leadId` is simply undefined. The activity event will not appear in a lead's Workflow Activity timeline but will still be recorded in `activity_events` with `entity_type = 'email_draft'`.

### 5.6 Non-Fatal Pattern

All three ET_ emissions remain non-fatal (`.catch(() => {})`) — unchanged from the existing Phase 3B pattern. An activity event recording failure must never block or fail a send.

---

## Section 6 — Webhook Structured Error Design

### 6.1 Where to Add Structured Errors

All three new structured error calls go inside `processResendEvent()` in `app/api/webhooks/resend/route.ts`. Each call is individually wrapped in try/catch so that a failure creating a structured error does not propagate and does not break the existing webhook processing (status updates, activity events, auto-unsubscribe).

The outer `try/catch` in the `POST` handler already ensures 200 OK regardless. The inner non-fatal pattern aligns with Phase 3C.4 (workflow and outbox error emission).

### 6.2 Permanent Bounce — `EMAIL_PERMANENT_BOUNCE`

**Trigger:** `eventType === 'email.bounced'` AND `payload.data.bounce_type === 'hard'`

Resend's `email.bounced` webhook payload includes a `bounce_type` field. Only `'hard'` bounces are permanent (undeliverable address). Soft bounces (`'soft'`) are transient and do not generate a structured error.

**Structured error:**
```typescript
{
  failureType:     WEBHOOK_FAILURE_TYPE.EMAIL_PERMANENT_BOUNCE,
  severity:        SE_SEVERITY.ERROR,
  module:          'resend_webhook',
  tenantId:        emailSend.tenant_id,
  workspaceId:     emailSend.workspace_id ?? null,
  correlationId:   emailSend.id,  // one error per email_send
  context: {
    emailSendId: emailSend.id,
    toEmail:     payload.data.to?.[0] ?? null,
    bounceType:  payload.data.bounce_type ?? null,
  },
}
```

**Why `correlationId = emailSend.id`:** Resend may retry webhooks. The idempotency guard on `email_events` (via `provider_event_id`) prevents duplicate event rows, but structured error creation occurs after the `23505` early return — duplicates would not be blocked. Using `correlationId` plus a check-before-insert pattern prevents duplicate structured errors for the same bounce.

**After-effects:** No change to the existing `email_sends.status = 'bounced'` update. No contact `do_not_contact` flag change (that is Phase 3K scope for campaign stop conditions). The structured error surfaces in System Intelligence for operator review.

### 6.3 Complaint — `EMAIL_COMPLAINT_RECEIVED`

**Trigger:** `eventType === 'email.complained'`

**Structured error:**
```typescript
{
  failureType:     WEBHOOK_FAILURE_TYPE.EMAIL_COMPLAINT_RECEIVED,
  severity:        SE_SEVERITY.CRITICAL,
  module:          'resend_webhook',
  tenantId:        emailSend.tenant_id,
  workspaceId:     emailSend.workspace_id ?? null,
  correlationId:   emailSend.id,
  context: {
    emailSendId: emailSend.id,
    toEmail:     payload.data.to?.[0] ?? null,
  },
}
```

**Severity rationale:** `critical` is appropriate because a complaint indicates the recipient actively flagged the message as spam. This has direct deliverability and compliance impact. Complaints surface at the top of the System Intelligence Critical & Open Errors list, ensuring immediate operator visibility.

**After-effects:** The existing auto-unsubscribe behavior is preserved unchanged — it runs before the structured error creation. `email_sends.status` update to `'complained'` is preserved unchanged.

**Idempotency:** Same `correlationId = emailSend.id` + check-before-insert pattern as bounce.

### 6.4 Delivery Delay — `EMAIL_DELIVERY_DELAYED`

**Trigger:** `eventType === 'email.delivery_delayed'`

Resend can emit multiple `email.delivery_delayed` events for the same send (each retry attempt may generate one). The `email_events` table records each via the idempotency guard. Only ONE structured error per email send is desired.

**Idempotency pattern (check-before-insert):**
```typescript
// Before creating structured error:
const { data: existing } = await supabase
  .from('automation_failures')
  .select('id')
  .eq('tenant_id', emailSend.tenant_id)
  .eq('failure_type', WEBHOOK_FAILURE_TYPE.EMAIL_DELIVERY_DELAYED)
  .eq('correlation_id', emailSend.id)
  .maybeSingle()

if (!existing) {
  await createStructuredError({ ... })
}
```

**Structured error:**
```typescript
{
  failureType:     WEBHOOK_FAILURE_TYPE.EMAIL_DELIVERY_DELAYED,
  severity:        SE_SEVERITY.WARNING,
  module:          'resend_webhook',
  tenantId:        emailSend.tenant_id,
  workspaceId:     emailSend.workspace_id ?? null,
  correlationId:   emailSend.id,
  context: {
    emailSendId: emailSend.id,
    toEmail:     payload.data.to?.[0] ?? null,
  },
}
```

**Severity rationale:** `warning` — delivery delays may resolve on their own. If they persist (no `email.delivered` follows), the operator should investigate. `warning` is correct; it does not clutter the Critical & Open Errors list with the urgency of bounces or complaints.

**After-effects:** No `email_sends.status` change (not in `EVENT_TO_SEND_STATUS` map — correct and unchanged). The `email_events` row is still inserted for each delayed event (existing behavior).

### 6.5 Non-Fatal Behavior — 200 OK Preserved

Each structured error creation is wrapped in its own non-fatal block:

```typescript
// Non-fatal: do not allow structured error creation to break webhook
createStructuredError({ ... }).catch((err) => {
  console.error('[resend-webhook] Failed to create structured error:', err)
})
```

The `.catch()` pattern ensures that if `createStructuredError` throws (e.g., Supabase unreachable), processing continues and the webhook returns 200. Resend retry storms are avoided.

### 6.6 Tenant Association

The `emailSend` row selected in `processResendEvent` includes `tenant_id` and `workspace_id`. Both are passed directly to structured error creation. Tenant isolation is maintained — structured errors are scoped to the correct tenant and appear only in that tenant's System Intelligence page.

### 6.7 New Constants — `WEBHOOK_FAILURE_TYPE`

Add to `modules/intelligence/structured-errors/structured-error.types.ts`:

```typescript
export const WEBHOOK_FAILURE_TYPE = {
  EMAIL_PERMANENT_BOUNCE:   'EMAIL_PERMANENT_BOUNCE',
  EMAIL_COMPLAINT_RECEIVED: 'EMAIL_COMPLAINT_RECEIVED',
  EMAIL_DELIVERY_DELAYED:   'EMAIL_DELIVERY_DELAYED',
} as const
export type WebhookFailureType = typeof WEBHOOK_FAILURE_TYPE[keyof typeof WEBHOOK_FAILURE_TYPE]
```

The existing `WORKFLOW_FAILURE_TYPE` constant block is unchanged. Both blocks coexist in the same file.

---

## Section 7 — Unsubscribe Safety

### 7.1 Current State

Email templates are stored in the `email_templates` table and seeded in migration `20240010_phase35_seed.sql`. After reading the seed templates (all 9 templates: `email_initial_contact`, `email_standard_follow_up`, `email_request_statement`, `email_urgent_outreach`, `email_close_deal`, `email_negotiation_push`, `email_proposal_ready`, `email_proposal_follow_up`, `email_initial_contact` / `intake_initial_contact`), **none include an unsubscribe link** in `body_html_template` or `body_text_template`.

The current outgoing email HTML is plain content followed by a sender signature: `<p>Hi {{contact_first_name}},</p> ... <p>Best,<br>{{sender_name}}</p>`. No `List-Unsubscribe` header is set in the Resend API call. No unsubscribe URL is included in the email body.

### 7.2 What Exists (Partial Compliance)

The system does have:
- An `unsubscribes` table (migration `20240006`)
- A suppression check at send time (`suppressionRepo.checkEmailSuppression`) — prevents sending to anyone in the `unsubscribes` table
- Auto-unsubscribe on complaint (webhook handler upserts into `unsubscribes` on `email.complained`)

This means if a recipient complains, they are blocked from future sends. However, there is no proactive mechanism for a recipient to self-service unsubscribe without complaining.

### 7.3 CAN-SPAM Requirement

CAN-SPAM (US) requires all commercial emails to include: a clear opt-out mechanism, prompt processing of opt-out requests, a physical mailing address. These are individual transactional sales prospecting emails, so full bulk-email-style compliance may have nuances — but the industry standard for outbound sales sequences is to include a plain-text unsubscribe option.

### 7.4 Required Future Change

Before Phase 3M live pilot, outgoing emails must include an opt-out mechanism. Recommended approach:

**Option A — Footer injection at send time (recommended):**
In `sendApprovedDraft()`, before the Resend API call, append a plain unsubscribe line to `body_text` and an HTML unsubscribe block to `body_html`. The unsubscribe link points to a new API route (`/api/unsubscribe?token=...`) which adds the address to `unsubscribes` and returns a confirmation page. The token is a signed HMAC of `tenantId + email + emailSendId`.

**Option B — Resend `List-Unsubscribe` header:**
Pass `headers: { 'List-Unsubscribe': '<mailto:unsubscribe@domain.com>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }` in the Resend API call. Requires a dedicated reply-catch inbox. Simpler for bulk lists; less visible for individual sales emails.

**Phase 3H finding:** The unsubscribe link gap is confirmed. It is NOT implemented in Phase 3H — it requires a new API route and footer injection logic. Phase 3H documents the gap. The Phase 3H staging smoke test (section 10) notes this as a known limitation for testing. This change must be completed before Phase 3M.

**Out-of-scope for Phase 3H implementation:** The unsubscribe route and footer injection are non-trivial UI/routing changes. They are scoped to a future phase (tentatively Phase 3I or a Phase 3H.1 sub-phase).

---

## Section 8 — Out-of-Scope Items

The following are explicitly out of scope for Phase 3H:

| Item | Reason |
|------|--------|
| Campaign model / multi-step sequences | Phase 3K scope |
| Follow-up scheduling | Phase 3L scope |
| Live production pilot | Phase 3M scope — requires 3H + 3I + 3J + 3K all satisfied |
| Bulk sending | Not in roadmap for individual outbound workflow |
| Automatic sending without approval | Core safety model — never |
| Email engine redesign | Phase 3J scope (unified draft path) |
| Phase 3I agent decision log | Next phase after 3H |
| Unsubscribe link implementation | Documented gap; implementation deferred beyond 3H |
| Contact `do_not_contact` auto-set on bounce | Phase 3K campaign stop condition scope |
| Reply detection | Phase 3L scope |
| Webhook signature enforcement changes | Existing implementation unchanged |
| `email.opened` / `email.clicked` structured errors | Not failure states; no structured error warranted |
| Soft bounce structured error | Only hard bounces are permanent; soft bounces are transient |

---

## Section 9 — Test Case Outline

### 9.1 Test Pattern

Phase 3H tests follow the source-reading pattern established in all prior phases: `fs.readFileSync` + `path.join(process.cwd(), relPath)` to assert source content without runtime execution. No Supabase mocking, no Resend API calls, no test doubles for services. Tests verify structural and behavioral contracts: that the correct check is present, in the correct order, with the correct constants.

### 9.2 Test File

`tests/phase3h-send-safety-hardening.test.ts`

### 9.3 Test Case Outline

**Block 0 — `EMAIL_SENDING_ENABLED` gate (email-send.service.ts)**
- TC-3H-001: `sendApprovedDraft()` source contains an import of `system-control.repo` or equivalent
- TC-3H-002: `sendApprovedDraft()` source references `EMAIL_SENDING_ENABLED` system control key
- TC-3H-003: `sendApprovedDraft()` source contains `sending_disabled_by_system_control` reason string
- TC-3H-004: The `EMAIL_SENDING_ENABLED` check appears before the draft fetch (Gate 0 is first async check)

**Block 1 — Gate ordering**
- TC-3H-005: `requirePermission` call precedes the `EMAIL_SENDING_ENABLED` read (synchronous permission before async DB read)
- TC-3H-006: `EMAIL_SENDING_ENABLED` check precedes `getEmailDraftForSending` in source order

**Block 2 — Activity events for all sends**
- TC-3H-007: `ET_SEND_INITIATED` emission is NOT inside an `if (phase3bMeta !== null)` guard (all sends emit this)
- TC-3H-008: `ET_SEND_SUCCEEDED` emission is NOT inside an `if (phase3bMeta !== null)` guard
- TC-3H-009: `ET_SEND_FAILED` emission is NOT inside an `if (phase3bMeta !== null)` guard
- TC-3H-010: Phase 3A activity event payload contains `sendPath: 'phase_3a_template'` (distinguishes from Phase 3B)

**Block 3 — `failure_reason` column**
- TC-3H-011: Migration `20240033` SQL contains `ADD COLUMN IF NOT EXISTS failure_reason text`
- TC-3H-012: `types/database.ts` `email_sends` Row contains `failure_reason: string | null`
- TC-3H-013: `email-send.service.ts` failure path writes `failure_reason` to `updateEmailSend`

**Block 4 — `triggered_by` column**
- TC-3H-014: Migration `20240033` SQL contains `ADD COLUMN IF NOT EXISTS triggered_by text`
- TC-3H-015: `types/database.ts` `email_sends` Row contains `triggered_by: string | null`
- TC-3H-016: `email-send.service.ts` success and failure paths write `triggered_by` from `ctx.userId`

**Block 5 — Webhook failure type constants**
- TC-3H-017: `structured-error.types.ts` exports `WEBHOOK_FAILURE_TYPE` constant
- TC-3H-018: `WEBHOOK_FAILURE_TYPE` contains `EMAIL_PERMANENT_BOUNCE`
- TC-3H-019: `WEBHOOK_FAILURE_TYPE` contains `EMAIL_COMPLAINT_RECEIVED`
- TC-3H-020: `WEBHOOK_FAILURE_TYPE` contains `EMAIL_DELIVERY_DELAYED`

**Block 6 — Permanent bounce structured error**
- TC-3H-021: `route.ts` references `EMAIL_PERMANENT_BOUNCE` failure type
- TC-3H-022: Permanent bounce block checks `bounce_type === 'hard'` before creating structured error
- TC-3H-023: Permanent bounce structured error uses severity `'error'`
- TC-3H-024: Bounce structured error creation is non-fatal (`.catch()` present)

**Block 7 — Complaint structured error**
- TC-3H-025: `route.ts` references `EMAIL_COMPLAINT_RECEIVED` failure type
- TC-3H-026: Complaint structured error uses severity `'critical'`
- TC-3H-027: Complaint structured error creation follows (does not precede) the auto-unsubscribe block
- TC-3H-028: Complaint structured error creation is non-fatal (`.catch()` present)

**Block 8 — Delivery delay structured error**
- TC-3H-029: `route.ts` references `EMAIL_DELIVERY_DELAYED` failure type
- TC-3H-030: Delivery delay structured error uses severity `'warning'`
- TC-3H-031: Delivery delay idempotency guard is present (check-before-insert query present in source)
- TC-3H-032: Delivery delay structured error creation is non-fatal

**Block 9 — Safety guardrails**
- TC-3H-033: No `resend.emails.send` call in `structured-error.types.ts` or `structured-error.repo.ts`
- TC-3H-034: No automatic send triggered by bounce handler (no `sendApprovedDraft` call in webhook handler)
- TC-3H-035: Webhook handler `POST` function still returns `NextResponse.json({ received: true })` (200 OK)

**Estimated test count:** ~35 new tests → baseline reaches ~1083/1083

---

## Section 10 — Manual Staging Smoke Test Plan

Staging environment only. No production Supabase. No production Vercel deployment. No real customer emails.

### 10.1 Pre-conditions

- `EMAIL_SENDING_ENABLED` system control row set to `false` for staging tenant (`smbausuyetlgxflyhmfg`) before test
- Migration `20240033` applied to staging Supabase only
- A controlled test lead with a valid, controlled test email address exists in staging

### 10.2 Smoke Test Checklist (10 items)

| # | Test | Expected result |
|---|------|----------------|
| 1 | Login to staging (`staging@verian.internal`) | Login succeeds, workspace loads |
| 2 | Attempt to send an approved draft while `EMAIL_SENDING_ENABLED = false` | Send blocked. UI shows error. No `email_sends` row created. No Resend API call. |
| 3 | Set `EMAIL_SENDING_ENABLED = true` for staging tenant in `system_controls` | Change persists. System Controls page reflects updated value. |
| 4 | Send an auto-path draft (Phase 3A template send) | `ET_SEND_INITIATED` appears in lead Workflow Activity timeline. |
| 5 | Confirm send succeeded for auto-path draft | `ET_SEND_SUCCEEDED` appears in lead Workflow Activity timeline. `email_sends.triggered_by` populated. |
| 6 | Simulate permanent bounce via Resend test event for staging send | `EMAIL_PERMANENT_BOUNCE` structured error appears in System Intelligence → Critical & Open Errors. Severity: `error`. |
| 7 | Simulate complaint via Resend test event for staging send | `EMAIL_COMPLAINT_RECEIVED` structured error appears in System Intelligence. Severity: `critical`. Auto-unsubscribe confirmed (lead address in `unsubscribes`). |
| 8 | Simulate delivery delay via Resend test event (twice for same send) | ONE `EMAIL_DELIVERY_DELAYED` structured error in System Intelligence (idempotency guard works). Second event produces no second structured error. |
| 9 | Inspect `email_sends` row for test send | `failure_reason` and `triggered_by` columns populated where applicable. |
| 10 | Set `EMAIL_SENDING_ENABLED = false` again after test | System Controls reflects change. Verify no further sends succeed. |

### 10.3 Known Staging Limitation

No unsubscribe link is present in outgoing emails at this stage. This is documented as a gap (Section 7). Staging smoke test proceeds without unsubscribe link verification — that check is deferred to the phase that implements it.

---

## Section 11 — Risks and Guardrails

### 11.1 Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Gate 0 is inserted after the draft fetch rather than before | Critical | Test TC-3H-006 enforces source order; code review |
| Structured error creation in webhook blocks 200 OK | High | Non-fatal `.catch()` pattern; TC-3H-032/TC-3H-035 verify |
| Delivery delay idempotency check is a race condition | Low | Accepted for v1; two concurrent webhooks could create two rows; resolved by operator |
| `phase3bMeta` guard removal accidentally breaks Phase 3B attribution | High | Phase 3B events continue to use `etAudit.build*Payload()` with `phase3bMeta`; Phase 3A events use separate simplified payload; both paths tested |
| `failure_reason` and `triggered_by` column nullability breaks TypeScript | Medium | `database.ts` must type both as `string | null`; `email-send.repo.ts` `CreateEmailSendInput` extended |
| `bounce_type` field absent from Resend payload in some edge cases | Low | Null-safe check: `payload.data.bounce_type === 'hard'`; if absent, no structured error (fail safe) |
| Complaint structured error before auto-unsubscribe | Low | Structured error creation must be placed AFTER the existing auto-unsubscribe block to preserve Phase 3A ordering |

### 11.2 Guardrails

| Guardrail | Reason |
|-----------|--------|
| Gate 0 (`EMAIL_SENDING_ENABLED`) must be the first async check — before any draft reads | Kill switch must exit immediately; draft data is not loaded if sending is disabled |
| `EMAIL_SENDING_ENABLED` defaults to `false` for all tenants where no row exists | `getBooleanControl` default is `false` — opt-in, not opt-out |
| All webhook structured error creation calls are non-fatal | Resend must always receive 200 OK; error logging must never block webhook processing |
| Auto-unsubscribe block is preserved unchanged on complaint | Existing Phase 3A behavior must not regress |
| No Resend API call in any new Phase 3H code outside `sendApprovedDraft()` | No auto-sends, no triggered sends, no background sends |
| Phase 3B activity event payloads are unchanged | `etAudit.build*Payload()` functions continue to be used for Phase 3B sends |
| Soft bounces (`bounce_type !== 'hard'`) produce no structured error | Only permanent bounces warrant operator attention; soft bounces are transient |
| Migration `20240033` must be `ADD COLUMN IF NOT EXISTS` | Idempotent — safe if applied twice |
| Staging smoke test must pass before production deployment | No production migration or deployment until all 10 staging checks pass |
| Production deployment is explicit via `vercel --prod` only | Git disconnect (Track A) remains in effect |
| Do not reconnect production Vercel Git | Track A guardrail unchanged |
| `20240033` is the only new migration in Phase 3H | Next available after Phase 3H remains `20240034` |

---

## Section 12 — Final Recommendation

### 12.1 Phase 3H Readiness Assessment

Phase 3H is **ready for implementation planning**. The source audit (Phase 3G) fully characterized all four gaps. The design above is specific enough to proceed to implementation without further investigation:

- Gate 0 uses `getBooleanControl(SystemControlKey.EMAIL_SENDING_ENABLED, ctx.tenantId)` — the function and key both exist
- ET_ event restructuring has clear source locations (lines 176–195, 238–258, 271–292 of `email-send.service.ts`)
- Structured error creation reuses `createStructuredError()` and `WEBHOOK_FAILURE_TYPE` pattern established in Phase 3C.4
- Migration `20240033` is a two-line `ALTER TABLE` — no schema complexity
- All file targets are known; no new modules or routes are required

### 12.2 Critical Blocker Before Phase 3M

Phase 3H is a hard prerequisite for Phase 3M (Live Pilot). The unsubscribe link gap (Section 7) is not addressed in Phase 3H but must be resolved before Phase 3M. The Phase 3H implementation plan should formally note the unsubscribe gap as a Phase 3H.1 or Phase 3I deliverable — and include it in the Phase 3M gate checklist.

### 12.3 File Manifest

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/20240033_phase3h_email_send_hardening.sql` | New | `failure_reason text`, `triggered_by text` on `email_sends` |
| `types/database.ts` | Modified | Add `failure_reason: string \| null`, `triggered_by: string \| null` to `email_sends` Row/Insert/Update |
| `modules/messaging/services/email-send.service.ts` | Modified | Gate 0; ET_ events for all sends; populate `failure_reason` + `triggered_by` |
| `modules/messaging/repositories/email-send.repo.ts` | Modified | `CreateEmailSendInput` extended with `failureReason?` and `triggeredBy?` fields |
| `modules/intelligence/structured-errors/structured-error.types.ts` | Modified | Add `WEBHOOK_FAILURE_TYPE` constant block + `WebhookFailureType` |
| `app/api/webhooks/resend/route.ts` | Modified | Non-fatal structured errors for bounce (hard only), complaint, delivery delay |
| `tests/phase3h-send-safety-hardening.test.ts` | New | ~35 source-reading tests |

### 12.4 Exact Next Prompt — Phase 3H Implementation Plan

After user approves this design document:

```
Begin Phase 3H implementation plan only.

Current confirmed state:
- Phase 3H design document approved:
  docs/roadmap/phase-3h-send-safety-hardening-design.md
- Tests baseline: 1048/1048
- Next migration available: 20240033
- Phase 3H has not started — no code written

Implementation plan should include:

1. Confirmation of Phase 3H scope (no auto-send, no new routes, no UI pages)
2. Step-by-step implementation sequence (migration first, then types, then service, then webhook, then tests)
3. Exact code changes at function level for each file in the manifest
4. Gate 0 implementation detail: exact call signature for getBooleanControl
5. ET_ event restructure: exact before/after pseudocode for the phase3bMeta guard removal
6. email-send.repo.ts change: CreateEmailSendInput extension
7. Webhook structured error additions: exact placement in processResendEvent for each event type
8. Test suite structure: 9 describe blocks, 35 estimated test cases
9. Staging smoke test sequence (10 items, same as design section 10)
10. Risks and guardrails (from design section 11)
11. Completion criteria

Hard constraints:
- Do not write implementation code.
- Do not create migrations.
- Do not apply migrations.
- Do not modify production.
- Do not deploy.
- Do not create commits.
- Implementation plan only.
```

---

*Phase 3H Design Document & Test Case Outline v1.0 — 2026-05-27*
