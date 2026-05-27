# Phase 3H — Send Safety Hardening
## Implementation Plan v1.0

**Status:** Proposed — awaiting user approval before any implementation begins
**Design document:** `docs/roadmap/phase-3h-send-safety-hardening-design.md`
**Depends on:** Phase 3G complete and locked (`a4f488a`, `phase-3g-agent-operations-readiness-v1`)
**Tests baseline:** 1048/1048
**Next migration available:** `20240033`
**Date:** 2026-05-27

---

## Section 1 — Scope Confirmation

Phase 3H is **send-path hardening only**. It closes four safety gaps identified in Phase 3G. It produces no new features, no new user-visible pages, and no automatic sending.

### 1.1 What Phase 3H Delivers

| # | Deliverable | Scope |
|---|-------------|-------|
| 1 | Gate 0: `EMAIL_SENDING_ENABLED` enforced before any DB reads in `sendApprovedDraft()` | Send service |
| 2 | `ET_SEND_INITIATED` / `ET_SEND_SUCCEEDED` / `ET_SEND_FAILED` emitted for all sends | Send service |
| 3 | `email_sends.triggered_by` typed column, populated at insert time from `ctx.userId` | Migration + repo + service |
| 4 | `email_sends.failure_reason` typed column, populated at failure time | Migration + repo + service |
| 5 | `WEBHOOK_FAILURE_TYPE` constants for three new failure types | Structured error types |
| 6 | `EMAIL_PERMANENT_BOUNCE` structured error on hard bounce | Webhook handler |
| 7 | `EMAIL_COMPLAINT_RECEIVED` structured error on complaint | Webhook handler |
| 8 | `EMAIL_DELIVERY_DELAYED` structured error on delay (idempotent) | Webhook handler |
| 9 | Test suite: `tests/phase3h-send-safety-hardening.test.ts` | ~35 source-reading tests |

### 1.2 Explicit Out-of-Scope (Never Start These in Phase 3H)

- No auto-send, no triggered send, no background send
- No campaign model
- No follow-up scheduling
- No live pilot
- No new UI pages or routes
- No unsubscribe link implementation (gap documented — Phase 3M prerequisite)
- No contact `do_not_contact` auto-set on bounce (Phase 3K scope)
- No production Supabase migration during implementation
- No production Vercel deployment during implementation

---

## Section 2 — Ordered Implementation Sequence

Steps must be followed in order. Each step depends on the previous.

| Step | Action | File(s) |
|------|--------|---------|
| 1 | Create migration `20240033` | `supabase/migrations/20240033_phase3h_email_send_hardening.sql` |
| 2 | Update database types | `types/database.ts` |
| 3 | Extend email send repo | `modules/messaging/repositories/email-send.repo.ts` |
| 4 | Add `WEBHOOK_FAILURE_TYPE` constants | `modules/intelligence/structured-errors/structured-error.types.ts` |
| 5 | Update send service — Gate 0 | `modules/messaging/services/email-send.service.ts` |
| 6 | Update send service — ET_ for all sends + attribution | `modules/messaging/services/email-send.service.ts` |
| 7 | Update webhook handler — structured errors | `app/api/webhooks/resend/route.ts` |
| 8 | Write test suite | `tests/phase3h-send-safety-hardening.test.ts` |
| 9 | Local verification | `npx vitest run` + `npx next build` |

**Why migration first:** TypeScript types in `types/database.ts` reflect the DB schema. If the migration is written first, the types can be updated to match before any service code references the new columns. If service code were written first, TypeScript would error on unknown columns until types are updated.

---

## Section 3 — Migration Plan

### 3.1 File

`supabase/migrations/20240033_phase3h_email_send_hardening.sql`

### 3.2 Changes

Two `text` columns added to `email_sends`. Both nullable. Both use `ADD COLUMN IF NOT EXISTS` for idempotency.

```sql
-- Phase 3H: Send Safety Hardening
-- Adds typed attribution and failure tracking columns to email_sends.
-- Both columns are nullable: existing rows are not back-filled.
-- failure_reason: structured send failure code or message for audit queries.
-- triggered_by:   ctx.userId of the operator who initiated the send.

ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS triggered_by   text;
```

### 3.3 No Other Schema Changes

- No new tables
- No changes to `automation_failures`, `email_drafts`, `email_events`, `unsubscribes`
- No index additions (not required for v1 — both columns are plain text for audit, not filtered at volume)
- Migration file is the only new file in `supabase/migrations/`

### 3.4 Migration Application Order

1. Local Docker Supabase during development (apply to verify TypeScript alignment)
2. Staging Supabase (`smbausuyetlgxflyhmfg`) immediately before staging smoke test
3. Production Supabase (`kxrplupzbsmujjznzhpy`) only after staging smoke test passes — in a separate explicit step, not during implementation

---

## Section 4 — Database Types Update

### 4.1 File

`types/database.ts` — `email_sends` table section (currently at lines ~2322–2379)

### 4.2 Changes

Add two fields to the `Row`, `Insert`, and `Update` sub-types for `email_sends`.

**Row** (currently ends with `workspace_id: string | null`):
```typescript
failure_reason: string | null   // ← add after error_message
triggered_by: string | null     // ← add after tenant_id (or anywhere — alphabetical preferred)
```

**Insert** (all optional):
```typescript
failure_reason?: string | null
triggered_by?: string | null
```

**Update** (all optional):
```typescript
failure_reason?: string | null
triggered_by?: string | null
```

### 4.3 Exact Insertions

In `Row`: add `failure_reason: string | null` after line `error_message: string | null`, and `triggered_by: string | null` after `to_email: string`.

In `Insert`: add `failure_reason?: string | null` after `error_message?: string | null`, and `triggered_by?: string | null` after `to_email: string`.

In `Update`: add `failure_reason?: string | null` after `error_message?: string | null`, and `triggered_by?: string | null` after `to_email?: string`.

No other changes to `types/database.ts`.

---

## Section 5 — Email Send Repo Update

### 5.1 File

`modules/messaging/repositories/email-send.repo.ts`

### 5.2 Change 1 — `CreateEmailSendInput`

Add `triggeredBy` to the input interface (currently ends with `strategyId?: string | null`):

```typescript
interface CreateEmailSendInput {
  tenantId: string
  workspaceId?: string | null
  draftId: string
  senderIdentityId?: string | null
  toEmail: string
  subject: string
  contactId?: string | null
  companyId?: string | null
  metadata: Record<string, unknown>
  messageVersionId?: string | null
  strategyId?: string | null
  triggeredBy?: string | null    // ← new: ctx.userId at send time
}
```

Add `triggered_by` to the Supabase INSERT call inside `createEmailSend` (after `strategy_id`):

```typescript
triggered_by: input.triggeredBy ?? null,
```

### 5.3 Change 2 — `UpdateEmailSendInput`

Add `failureReason` to the update interface (currently ends with `metadata?: Record<string, unknown>`):

```typescript
interface UpdateEmailSendInput {
  status?: string
  resendMessageId?: string | null
  sentAt?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
  failureReason?: string | null    // ← new: send failure code/message
}
```

Add `failure_reason` to the patch object inside `updateEmailSend` (after `error_message` handling):

```typescript
if (update.failureReason !== undefined) patch.failure_reason = update.failureReason
```

### 5.4 No Other Changes to This File

`getEmailDraftForSending`, `getActiveSendForDraft`, `getSendStatusForDraft` — all unchanged.

---

## Section 6 — Structured Error Types Update

### 6.1 File

`modules/intelligence/structured-errors/structured-error.types.ts`

### 6.2 Change — Add `WEBHOOK_FAILURE_TYPE`

Add after the existing `WORKFLOW_FAILURE_TYPE` block (currently lines 20–24):

```typescript
export const WEBHOOK_FAILURE_TYPE = {
  EMAIL_PERMANENT_BOUNCE:   'EMAIL_PERMANENT_BOUNCE',
  EMAIL_COMPLAINT_RECEIVED: 'EMAIL_COMPLAINT_RECEIVED',
  EMAIL_DELIVERY_DELAYED:   'EMAIL_DELIVERY_DELAYED',
} as const
export type WebhookFailureType = typeof WEBHOOK_FAILURE_TYPE[keyof typeof WEBHOOK_FAILURE_TYPE]
```

No changes to `SE_SEVERITY`, `SE_STATUS`, `WORKFLOW_FAILURE_TYPE`, `CreateStructuredErrorInput`, or `StructuredErrorStats`.

---

## Section 7 — Send Service Update

### 7.1 File

`modules/messaging/services/email-send.service.ts`

### 7.2 Change 1 — Import `system-control.repo`

Add import at the top of the file (with the existing repo imports):

```typescript
import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'
import { SystemControlKey } from '@/modules/intelligence/types.agent'
```

### 7.3 Change 2 — Gate 0: `EMAIL_SENDING_ENABLED`

Insert after `requirePermission(ctx, 'messaging.send_emails')` and before the draft fetch. This becomes the first async check — no DB read has occurred at this point.

**Before (line 46):**
```typescript
// ---- 1. Permission ----
requirePermission(ctx, 'messaging.send_emails')

// ---- 2. Fetch draft (scoped to tenant + workspace) ----
const draft = await emailSendRepo.getEmailDraftForSending(...)
```

**After:**
```typescript
// ---- 0. Permission (synchronous — no DB) ----
requirePermission(ctx, 'messaging.send_emails')

// ---- 1. Kill switch: EMAIL_SENDING_ENABLED ----
// First async check. Reads system_controls for tenant override, falls back to
// platform default. Returns false if row absent — opt-in, not opt-out.
const sendingEnabled = await systemControlRepo.getBooleanControl(
  SystemControlKey.EMAIL_SENDING_ENABLED,
  ctx.tenantId
)
if (!sendingEnabled) {
  return { ok: false, reason: 'sending_disabled_by_system_control' }
}

// ---- 2. Fetch draft (scoped to tenant + workspace) ----
const draft = await emailSendRepo.getEmailDraftForSending(...)
```

All existing gate numbers shift by 1 in the comments (2 → 3, 3 → 4, etc.) to reflect the new ordering. The renumbering is comment-only — no logic changes.

### 7.4 Change 3 — Pass `triggeredBy` to `createEmailSend`

The `ctx.userId` is currently written only to `metadata.send_initiated_by` (JSONB). Phase 3H also writes it to the new `triggered_by` typed column.

In the `createEmailSend` call (currently at line 156), add `triggeredBy`:

```typescript
emailSend = await emailSendRepo.createEmailSend({
  tenantId:         ctx.tenantId,
  workspaceId:      ctx.workspaceId,
  draftId,
  senderIdentityId: senderIdentity?.id ?? null,
  toEmail:          draft.to_email,
  subject:          draft.subject,
  contactId:        draft.contact_id,
  companyId:        draft.company_id,
  metadata:         sendMetadata,
  messageVersionId: phase3bMeta?.message_version_id ?? null,
  strategyId:       phase3bMeta?.strategy_id ?? null,
  triggeredBy:      ctx.userId,    // ← new: typed column alongside metadata.send_initiated_by
})
```

The existing `metadata.send_initiated_by: ctx.userId` in `baseMetadata` is preserved unchanged for backward compatibility.

### 7.5 Change 4 — Emit ET_ Events for All Sends (Remove Phase 3B Guard)

**Current pattern (three separate guarded blocks):**
```typescript
// Phase 3B Event Tracking: ET_SEND_INITIATED (non-fatal)
if (phase3bMeta !== null) {
  activityEventService.recordActivity({ ... }).catch(() => {})
}
```

**New pattern — all three blocks become unconditional.** Each block uses a ternary to select Phase 3B vs. Phase 3A parameters.

The `lead_id` for Phase 3A sends is read from the draft object. It is already accessed in the service via `(draft as unknown as Record<string, unknown>)['lead_id']` (line 151 — the Phase 3B metadata building). The same pattern is reused.

**Local variable to define once above all three blocks:**
```typescript
// Derive lead_id for Phase 3A sends (Phase 3B gets it from phase3bMeta.lead_id)
const draftLeadId = (draft as unknown as Record<string, unknown>)['lead_id'] as string | null
```

#### 7.5.1 ET_SEND_INITIATED (after `emailSend` is created, before Resend call)

Replace the current `if (phase3bMeta !== null) { ... }` block with:

```typescript
// ET_SEND_INITIATED: emitted for ALL sends — Phase 3A and Phase 3B
activityEventService.recordActivity({
  tenantId:     ctx.tenantId,
  workspaceId:  ctx.workspaceId,
  eventType:    'ET_SEND_INITIATED',
  entityType:   phase3bMeta !== null ? 'message_version' : 'email_draft',
  entityId:     phase3bMeta !== null
    ? (phase3bMeta.message_version_id ?? undefined)
    : draftId,
  eventSummary: phase3bMeta !== null
    ? `Send initiated for version ${phase3bMeta.version_label ?? '?'} to ${draft.to_email}`
    : `Send initiated for draft to ${draft.to_email}`,
  leadId:       phase3bMeta !== null
    ? (phase3bMeta.lead_id ?? undefined)
    : (draftLeadId ?? undefined),
  contactId:    draft.contact_id ?? undefined,
  companyId:    draft.company_id ?? undefined,
  metadata: {
    ...(etAudit.buildSendInitiatedPayload({
      emailSendId: emailSend.id,
      draftId,
      phase3bMeta,
      toEmail: draft.to_email,
    }) as unknown as Record<string, unknown>),
    ...(phase3bMeta === null ? { send_path: 'phase_3a_template' } : {}),
  },
}).catch(() => {})
```

**Key decisions:**
- `phase3bMeta` is `null` for Phase 3A — `buildSendInitiatedPayload` already handles `null` gracefully (all Phase 3B fields become `null` in the payload)
- `send_path: 'phase_3a_template'` is spread into the payload only for Phase 3A to distinguish send origins
- `entityType: 'email_draft'` for Phase 3A (no `message_version` exists)

#### 7.5.2 ET_SEND_SUCCEEDED (in the success path, after status update)

Replace the current `if (phase3bMeta !== null) { ... }` block with:

```typescript
// ET_SEND_SUCCEEDED: emitted for ALL sends
activityEventService.recordActivity({
  tenantId:     ctx.tenantId,
  workspaceId:  ctx.workspaceId,
  eventType:    'ET_SEND_SUCCEEDED',
  entityType:   phase3bMeta !== null ? 'message_version' : 'email_draft',
  entityId:     phase3bMeta !== null
    ? (phase3bMeta.message_version_id ?? undefined)
    : draftId,
  eventSummary: phase3bMeta !== null
    ? `Send succeeded for version ${phase3bMeta.version_label ?? '?'}`
    : `Send succeeded for draft to ${draft.to_email}`,
  leadId:       phase3bMeta !== null
    ? (phase3bMeta.lead_id ?? undefined)
    : (draftLeadId ?? undefined),
  contactId:    draft.contact_id ?? undefined,
  companyId:    draft.company_id ?? undefined,
  metadata: {
    ...(etAudit.buildSendSucceededPayload({
      emailSendId:    emailSend.id,
      draftId,
      phase3bMeta,
      toEmail:        draft.to_email,
      resendMessageId,
    }) as unknown as Record<string, unknown>),
    ...(phase3bMeta === null ? { send_path: 'phase_3a_template' } : {}),
  },
}).catch(() => {})
```

#### 7.5.3 ET_SEND_FAILED (in the catch block, after `updateEmailSend`)

Replace the current `if (phase3bMeta !== null) { ... }` block with:

```typescript
// ET_SEND_FAILED: emitted for ALL sends
activityEventService.recordActivity({
  tenantId:     ctx.tenantId,
  workspaceId:  ctx.workspaceId,
  eventType:    'ET_SEND_FAILED',
  entityType:   phase3bMeta !== null ? 'message_version' : 'email_draft',
  entityId:     phase3bMeta !== null
    ? (phase3bMeta.message_version_id ?? undefined)
    : draftId,
  eventSummary: phase3bMeta !== null
    ? `Send failed for version ${phase3bMeta.version_label ?? '?'}: ${errorMessage}`
    : `Send failed for draft to ${draft.to_email}: ${errorMessage}`,
  leadId:       phase3bMeta !== null
    ? (phase3bMeta.lead_id ?? undefined)
    : (draftLeadId ?? undefined),
  contactId:    draft.contact_id ?? undefined,
  companyId:    draft.company_id ?? undefined,
  metadata: {
    ...(etAudit.buildSendFailedPayload({
      emailSendId:  emailSend.id,
      draftId,
      phase3bMeta,
      toEmail:      draft.to_email,
      errorReason:  errorMessage,
    }) as unknown as Record<string, unknown>),
    ...(phase3bMeta === null ? { send_path: 'phase_3a_template' } : {}),
  },
}).catch(() => {})
```

### 7.6 Change 5 — Populate `failure_reason` in the Failure Path

In the failure `catch` block, extend the `updateEmailSend` call to also write `failure_reason`:

**Before (current failure path update):**
```typescript
await emailSendRepo.updateEmailSend(emailSend.id, {
  status:        'failed',
  errorMessage,
  metadata:      { ...sendMetadata, error: errorMessage },
})
```

**After:**
```typescript
await emailSendRepo.updateEmailSend(emailSend.id, {
  status:        'failed',
  errorMessage,
  failureReason: errorMessage,    // ← new: typed column alongside metadata.error
  metadata:      { ...sendMetadata, error: errorMessage },
})
```

The existing `metadata.error: errorMessage` JSONB field is preserved unchanged for backward compatibility with existing queries.

---

## Section 8 — Webhook Handler Update

### 8.1 File

`app/api/webhooks/resend/route.ts`

### 8.2 Change 1 — Add Imports

At the top of `route.ts`, add imports for structured error creation and new failure type constants:

```typescript
import * as structuredErrorRepo from '@/modules/intelligence/structured-errors/structured-error.repo'
import { WEBHOOK_FAILURE_TYPE, SE_SEVERITY } from '@/modules/intelligence/structured-errors/structured-error.types'
```

No other imports change.

### 8.3 Change 2 — Add Structured Errors Inside `processResendEvent`

All three structured error blocks are added at the **end of `processResendEvent`**, after the existing `email.complained` auto-unsubscribe block. They are positioned after the `23505` early return (so duplicate webhook events do not trigger duplicate structured errors) and after all existing processing (status update, activity events, auto-unsubscribe).

Each block is individually non-fatal — a thrown error inside `.catch()` is swallowed and logged.

#### 8.3.1 Permanent Bounce — `EMAIL_PERMANENT_BOUNCE`

Add after the `email.complained` auto-unsubscribe block:

```typescript
// Phase 3H: Permanent bounce → structured error for System Intelligence
// Only 'hard' bounces are permanent (invalid address). Soft bounces are transient.
if (eventType === 'email.bounced' && payload.data?.bounce_type === 'hard') {
  structuredErrorRepo.createStructuredError({
    tenantId:      emailSend.tenant_id,
    workspaceId:   (emailSend.workspace_id as string | null) ?? null,
    failureType:   WEBHOOK_FAILURE_TYPE.EMAIL_PERMANENT_BOUNCE,
    severity:      SE_SEVERITY.ERROR,
    module:        'resend_webhook',
    correlationId: emailSend.id,
    context: {
      emailSendId: emailSend.id,
      toEmail:     Array.isArray(payload.data?.to) ? (payload.data.to[0] as string) : null,
      bounceType:  (payload.data?.bounce_type as string) ?? null,
    },
  }).catch((err) => {
    console.error('[resend-webhook] Failed to create EMAIL_PERMANENT_BOUNCE error:', err)
  })
}
```

**Idempotency:** Resend's `email.bounced` event is deduplicated by the `email_events` idempotency guard (the `23505` early return above). If the event fires once, the structured error fires once. No additional check-before-insert is required for bounce because the `provider_event_id` guard handles it.

#### 8.3.2 Complaint — `EMAIL_COMPLAINT_RECEIVED`

Add after the bounce block:

```typescript
// Phase 3H: Complaint → critical structured error for System Intelligence
// Placed after auto-unsubscribe block to preserve existing Phase 3A ordering.
if (eventType === 'email.complained') {
  structuredErrorRepo.createStructuredError({
    tenantId:      emailSend.tenant_id,
    workspaceId:   (emailSend.workspace_id as string | null) ?? null,
    failureType:   WEBHOOK_FAILURE_TYPE.EMAIL_COMPLAINT_RECEIVED,
    severity:      SE_SEVERITY.CRITICAL,
    module:        'resend_webhook',
    correlationId: emailSend.id,
    context: {
      emailSendId: emailSend.id,
      toEmail:     Array.isArray(payload.data?.to) ? (payload.data.to[0] as string) : null,
    },
  }).catch((err) => {
    console.error('[resend-webhook] Failed to create EMAIL_COMPLAINT_RECEIVED error:', err)
  })
}
```

**Idempotency:** Same as bounce — `23505` guard handles it at the `email_events` layer. The `23505` early return at line 213 prevents duplicate processing for the same `provider_event_id`, so the structured error fires at most once per unique complaint event.

#### 8.3.3 Delivery Delay — `EMAIL_DELIVERY_DELAYED` (with check-before-insert)

Add after the complaint block:

```typescript
// Phase 3H: Delivery delay → warning structured error (idempotent via check-before-insert)
// Resend may emit multiple delivery_delayed events for the same send.
// The email_events 23505 guard deduplicates per-event; but multiple delayed events
// for the same send each have distinct provider_event_ids — they all insert into
// email_events. We want at most ONE structured error per email_send.
if (eventType === 'email.delivery_delayed') {
  // Check-before-insert: only create if no existing ERROR_DELIVERY_DELAYED for this send
  const { data: existingDelay } = await supabase
    .from('automation_failures')
    .select('id')
    .eq('tenant_id', emailSend.tenant_id)
    .eq('failure_type', WEBHOOK_FAILURE_TYPE.EMAIL_DELIVERY_DELAYED)
    .eq('correlation_id', emailSend.id)
    .maybeSingle()

  if (!existingDelay) {
    structuredErrorRepo.createStructuredError({
      tenantId:      emailSend.tenant_id,
      workspaceId:   (emailSend.workspace_id as string | null) ?? null,
      failureType:   WEBHOOK_FAILURE_TYPE.EMAIL_DELIVERY_DELAYED,
      severity:      SE_SEVERITY.WARNING,
      module:        'resend_webhook',
      correlationId: emailSend.id,
      context: {
        emailSendId: emailSend.id,
        toEmail:     Array.isArray(payload.data?.to) ? (payload.data.to[0] as string) : null,
      },
    }).catch((err) => {
      console.error('[resend-webhook] Failed to create EMAIL_DELIVERY_DELAYED error:', err)
    })
  }
}
```

**Why check-before-insert for delay only:** `email.bounced` and `email.complained` each fire at most once per message (Resend does not retry bounce/complaint events in a way that produces multiple distinct `provider_event_id` values for the same underlying event). `email.delivery_delayed` may fire multiple times with distinct `provider_event_id` values as Resend retries delivery — each one passes the `23505` guard and becomes its own `email_events` row. Without the check-before-insert, each would create a new structured error.

### 8.4 Existing Behavior Preserved

| Behavior | Status |
|----------|--------|
| Webhook signature verification | Unchanged |
| `webhook_events` insert + `processed` update | Unchanged |
| `email_events` insert (idempotent via `provider_event_id`) | Unchanged |
| Phase 3B activity event emission | Unchanged |
| `email_sends.status` update (terminal states) | Unchanged |
| Complaint auto-unsubscribe | Unchanged — runs before new structured error block |
| 200 OK always returned | Unchanged — outer `try/catch` in `POST` preserved |

---

## Section 9 — Unsubscribe Gap

### 9.1 Confirmed Gap

Email templates seeded in migration `20240010_phase35_seed.sql` contain no unsubscribe link in `body_html_template` or `body_text_template`. The Resend API call in `sendApprovedDraft()` does not pass a `List-Unsubscribe` header. This is a CAN-SPAM compliance gap.

### 9.2 What Exists

- `unsubscribes` table with `(tenant_id, email)` unique constraint
- Suppression check at send time via `suppressionRepo.checkEmailSuppression`
- Auto-unsubscribe on `email.complained` (webhook handler — preserved unchanged)

Recipients cannot self-service unsubscribe without complaining. There is no proactive opt-out link.

### 9.3 Phase 3H Decision

**Do not implement the unsubscribe route or footer injection in Phase 3H.** This requires a new API route, a signed token scheme, and footer injection logic at send time — a larger scope change than the other Phase 3H items.

The gap is documented here and must be resolved before Phase 3M (Live Pilot). It is added to the Phase 3M gate checklist.

### 9.4 Future Implementation (Phase 3M Prerequisite)

Recommended approach (to be designed in detail before Phase 3M):
- Append an unsubscribe footer to `body_html` and `body_text` at send time in `sendApprovedDraft()` — not in the templates
- Footer links to `/api/unsubscribe?token=...` where token is HMAC-signed `tenantId + email + emailSendId`
- The `/api/unsubscribe` route adds the address to `unsubscribes` and renders a confirmation page
- Optionally: set `List-Unsubscribe` header in Resend API call for mail client integration

---

## Section 10 — Test Plan

### 10.1 Test File

`tests/phase3h-send-safety-hardening.test.ts`

### 10.2 Pattern

Source-reading via `fs.readFileSync` + `path.join(process.cwd(), relPath)`. No Supabase mocking. No Resend API calls. Tests assert structural contracts (imports present, constants defined, guards appear in correct order, non-fatal patterns used).

### 10.3 Full Test Case List (~35 tests)

**Block 0 — Gate 0: `EMAIL_SENDING_ENABLED` in send service** (~4 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-001 | Send service imports `system-control.repo` | Source contains `system-control.repo` import |
| TC-3H-002 | Send service references `EMAIL_SENDING_ENABLED` key | Source contains `SystemControlKey.EMAIL_SENDING_ENABLED` |
| TC-3H-003 | Kill switch returns correct reason | Source contains `'sending_disabled_by_system_control'` |
| TC-3H-004 | `getBooleanControl` is called | Source contains `getBooleanControl(` |

**Block 1 — Gate ordering** (~2 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-005 | Permission check precedes kill switch | `requirePermission` appears before `getBooleanControl` in source |
| TC-3H-006 | Kill switch precedes draft fetch | `getBooleanControl` appears before `getEmailDraftForSending` in source |

**Block 2 — Activity events for all sends** (~4 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-007 | `ET_SEND_INITIATED` not inside `phase3bMeta !== null` guard | Source does NOT contain `if (phase3bMeta !== null) {` before `ET_SEND_INITIATED` |
| TC-3H-008 | `ET_SEND_SUCCEEDED` not gated by `phase3bMeta` | Source does NOT contain `if (phase3bMeta !== null) {` before `ET_SEND_SUCCEEDED` |
| TC-3H-009 | `ET_SEND_FAILED` not gated by `phase3bMeta` | Source does NOT contain `if (phase3bMeta !== null) {` before `ET_SEND_FAILED` |
| TC-3H-010 | Phase 3A send path label present | Source contains `phase_3a_template` |

**Block 3 — `failure_reason` column** (~3 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-011 | Migration SQL contains `failure_reason` | Migration file contains `ADD COLUMN IF NOT EXISTS failure_reason text` |
| TC-3H-012 | `database.ts` types `failure_reason` | `types/database.ts` contains `failure_reason: string \| null` |
| TC-3H-013 | Service writes `failure_reason` on failure | `email-send.service.ts` contains `failureReason: errorMessage` |

**Block 4 — `triggered_by` column** (~4 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-014 | Migration SQL contains `triggered_by` | Migration file contains `ADD COLUMN IF NOT EXISTS triggered_by text` |
| TC-3H-015 | `database.ts` types `triggered_by` | `types/database.ts` contains `triggered_by: string \| null` |
| TC-3H-016 | Repo input accepts `triggeredBy` | `email-send.repo.ts` contains `triggeredBy` field in `CreateEmailSendInput` |
| TC-3H-017 | Service passes `ctx.userId` as `triggeredBy` | `email-send.service.ts` contains `triggeredBy: ctx.userId` |

**Block 5 — `WEBHOOK_FAILURE_TYPE` constants** (~4 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-018 | Constants block exported | `structured-error.types.ts` contains `WEBHOOK_FAILURE_TYPE` |
| TC-3H-019 | `EMAIL_PERMANENT_BOUNCE` present | `structured-error.types.ts` contains `EMAIL_PERMANENT_BOUNCE` |
| TC-3H-020 | `EMAIL_COMPLAINT_RECEIVED` present | `structured-error.types.ts` contains `EMAIL_COMPLAINT_RECEIVED` |
| TC-3H-021 | `EMAIL_DELIVERY_DELAYED` present | `structured-error.types.ts` contains `EMAIL_DELIVERY_DELAYED` |

**Block 6 — Permanent bounce structured error** (~4 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-022 | Webhook handler references `EMAIL_PERMANENT_BOUNCE` | `route.ts` contains `WEBHOOK_FAILURE_TYPE.EMAIL_PERMANENT_BOUNCE` |
| TC-3H-023 | Bounce block checks `bounce_type === 'hard'` | `route.ts` contains `bounce_type` check |
| TC-3H-024 | Bounce error uses severity `error` | `route.ts` contains `SE_SEVERITY.ERROR` near bounce block |
| TC-3H-025 | Bounce error creation is non-fatal | `route.ts` contains `.catch(` near `EMAIL_PERMANENT_BOUNCE` |

**Block 7 — Complaint structured error** (~4 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-026 | Webhook handler references `EMAIL_COMPLAINT_RECEIVED` | `route.ts` contains `WEBHOOK_FAILURE_TYPE.EMAIL_COMPLAINT_RECEIVED` |
| TC-3H-027 | Complaint error uses severity `critical` | `route.ts` contains `SE_SEVERITY.CRITICAL` |
| TC-3H-028 | Auto-unsubscribe block precedes complaint structured error | `unsubscribes` upsert appears before `EMAIL_COMPLAINT_RECEIVED` in source |
| TC-3H-029 | Complaint error creation is non-fatal | `route.ts` contains `.catch(` near `EMAIL_COMPLAINT_RECEIVED` |

**Block 8 — Delivery delay structured error** (~4 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-030 | Webhook handler references `EMAIL_DELIVERY_DELAYED` | `route.ts` contains `WEBHOOK_FAILURE_TYPE.EMAIL_DELIVERY_DELAYED` |
| TC-3H-031 | Delay error uses severity `warning` | `route.ts` contains `SE_SEVERITY.WARNING` |
| TC-3H-032 | Idempotency check present | `route.ts` contains `maybeSingle()` or check-before-insert pattern near `EMAIL_DELIVERY_DELAYED` |
| TC-3H-033 | Delay error creation is non-fatal | `route.ts` contains `.catch(` near `EMAIL_DELIVERY_DELAYED` |

**Block 9 — Safety guardrails** (~2 tests)

| # | Test | Assertion |
|---|------|-----------|
| TC-3H-034 | No `resend.emails.send` in `structured-error.types.ts` or `structured-error.repo.ts` | Neither file contains `resend.emails.send` |
| TC-3H-035 | Webhook handler still returns `received: true` | `route.ts` contains `NextResponse.json({ received: true })` |

**Total: 35 tests → baseline reaches 1083/1083**

---

## Section 11 — Staging Smoke Test Plan

### 11.1 Pre-conditions

- Migration `20240033` applied to staging Supabase (`smbausuyetlgxflyhmfg`) only
- Staging Vercel deployment live (auto-deploys from `origin/master`)
- `EMAIL_SENDING_ENABLED` system control confirmed `false` for staging tenant before test begins
- A controlled test lead with a controlled test email address exists in staging

### 11.2 Smoke Test Checklist (10 items)

| # | Action | Expected Result |
|---|--------|----------------|
| 1 | Login to staging (`staging@verian.internal`) | Login succeeds. Workspace loads. |
| 2 | With `EMAIL_SENDING_ENABLED = false` (default): attempt to send an approved draft | Send blocked. UI shows error reason. No `email_sends` row created. No Resend API call. |
| 3 | Set `EMAIL_SENDING_ENABLED = true` for staging tenant in `system_controls` via Supabase dashboard | Row updated. System Controls page on staging reflects the change. |
| 4 | Send an auto-path (Phase 3A template) draft for the test lead | `ET_SEND_INITIATED` appears in the lead's Workflow Activity timeline on `/leads/[id]`. |
| 5 | Confirm the auto-path send succeeds | `ET_SEND_SUCCEEDED` appears in Workflow Activity. `email_sends.triggered_by` populated with staging user ID. |
| 6 | Simulate a hard bounce via Resend test webhook for the staging send | `EMAIL_PERMANENT_BOUNCE` structured error appears in System Intelligence → Critical & Open Errors. Severity badge shows `error`. |
| 7 | Simulate a complaint via Resend test webhook for the staging send | `EMAIL_COMPLAINT_RECEIVED` structured error appears in System Intelligence. Severity badge shows `critical`. `unsubscribes` table contains the test email. |
| 8 | Simulate a delivery delay via Resend test webhook (twice for the same send) | ONE `EMAIL_DELIVERY_DELAYED` structured error in System Intelligence. Second webhook delivery produces no second structured error (idempotency guard works). |
| 9 | Inspect the test `email_sends` row in Supabase dashboard | `failure_reason` populated on any failed sends. `triggered_by` populated with staging user ID on all sends. |
| 10 | Set `EMAIL_SENDING_ENABLED = false` again for staging tenant | System Controls page reflects the change. Subsequent send attempt blocked as in step 2. |

### 11.3 Known Limitation at Smoke Test Time

No unsubscribe link is present in outgoing emails. Documented gap (Section 9). Does not block Phase 3H staging smoke test.

### 11.4 Resend Test Webhook Simulation

Resend provides a test event dashboard for staging. For environments without test webhook access, a local `curl` to `/api/webhooks/resend` with a crafted payload and no signature enforcement (`RESEND_WEBHOOK_SECRET` unset on staging) is acceptable for smoke testing bounce/complaint/delay structured error creation.

---

## Section 12 — Risks and Guardrails

### 12.1 Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Gate 0 inserted after draft fetch instead of before | Test TC-3H-006 (source order assertion); code review of implementation PR |
| Phase 3B activity event attribution broken (payload degraded) | Phase 3B sends continue using `phase3bMeta`-rich paths; TC-3H-007/008/009 verify guard removal, not payload content |
| `draftLeadId` cast fails at runtime if `lead_id` not in draft select | `getEmailDraftForSending` uses `select('*')` — all columns returned including `lead_id`; cast is safe |
| Complaint structured error fires before auto-unsubscribe | TC-3H-028 enforces source order (unsubscribes block before complaint structured error) |
| Delivery delay check-before-insert race condition (two concurrent webhooks) | Accepted for v1; results in at most one extra structured error row; operator can resolve/dismiss |
| `bounce_type` absent from some Resend payload variants | Null-safe: `payload.data?.bounce_type === 'hard'`; if field absent → no structured error (fail safe) |
| `triggered_by` not written to existing send rows | Accepted: `triggered_by` is null for all sends before migration; future sends populate it |

### 12.2 Hard Guardrails

| Guardrail | Enforcement |
|-----------|-------------|
| No production Supabase migration during Phase 3H implementation | Migration applied to local + staging only; production is a separate explicit step |
| No production Vercel deployment during Phase 3H implementation | Deploy only after staging smoke test fully passes |
| `EMAIL_SENDING_ENABLED` defaults to `false` when no row exists | `getBooleanControl` default parameter is `false` — opt-in only |
| All webhook structured error calls are non-fatal | Each wrapped in `.catch()` — webhook always returns 200 |
| Auto-unsubscribe on complaint is preserved unchanged | Complaint auto-unsubscribe block is untouched; structured error is added AFTER it |
| Existing JSONB metadata fields preserved | `metadata.send_initiated_by`, `metadata.error` kept alongside new typed columns |
| No `resend.emails.send` call in any new Phase 3H code | TC-3H-034 verifies; code review |
| Migration uses `ADD COLUMN IF NOT EXISTS` | Idempotent — safe if applied twice |
| No new routes or API endpoints | Route manifest unchanged |
| `20240033` is the only migration in Phase 3H | Next available after Phase 3H: `20240034` |

---

## Section 13 — Completion Criteria

Phase 3H is complete when all of the following are verified:

| Criterion | How Verified |
|-----------|-------------|
| All 7 source files modified (migration + 4 existing + 1 new test file) | `git status` shows exactly those files changed |
| `npx vitest run` passes with ≥ 1083/1083 tests | Test run output |
| `npx next build` passes (TypeScript clean) | Build output — no errors |
| Staging migration `20240033` applied | Supabase dashboard |
| All 10 staging smoke test items pass | Manual checklist sign-off |
| No production migration applied | Production Supabase remains at migration `20240032` |
| No production deployment | Production Vercel remains at `dpl_2aiTEQ1eRz7Eus8QNfmmpipAkmaa` |
| AI context docs updated | `00_CURRENT_STATUS.md`, `06_GIT_MILESTONES.md`, `07_NEXT_STEPS.md` |
| Commit tagged and pushed | `phase-3h-send-safety-hardening-v1` tag on HEAD commit |

---

## Section 14 — File Manifest

| File | Action | Step |
|------|--------|------|
| `supabase/migrations/20240033_phase3h_email_send_hardening.sql` | New | 1 |
| `types/database.ts` | Modified — add `failure_reason`, `triggered_by` to `email_sends` Row/Insert/Update | 2 |
| `modules/messaging/repositories/email-send.repo.ts` | Modified — `CreateEmailSendInput` + `UpdateEmailSendInput` extensions | 3 |
| `modules/intelligence/structured-errors/structured-error.types.ts` | Modified — add `WEBHOOK_FAILURE_TYPE` block | 4 |
| `modules/messaging/services/email-send.service.ts` | Modified — Gate 0, ET_ for all sends, `triggeredBy` + `failureReason` | 5–6 |
| `app/api/webhooks/resend/route.ts` | Modified — bounce/complaint/delay structured errors | 7 |
| `tests/phase3h-send-safety-hardening.test.ts` | New — 35 source-reading tests | 8 |

**No other files modified.**

---

## Section 15 — Exact Next Prompt (Phase 3H Implementation)

After user approves this implementation plan:

```
Proceed with Phase 3H implementation only.

Current confirmed state:
- Phase 3H design approved:
  docs/roadmap/phase-3h-send-safety-hardening-design.md
- Phase 3H implementation plan approved:
  docs/roadmap/phase-3h-implementation-plan.md
- Tests baseline: 1048/1048
- Next migration available: 20240033
- No implementation has started
- Working tree clean

Hard constraints:
- Implement exactly what is in the approved plan
- Do not create additional features
- Do not apply migrations to staging or production during implementation
- Do not deploy to production during implementation
- Do not create commits until all 7 files are complete and all tests pass

Implementation sequence (follow exactly):
1. Create supabase/migrations/20240033_phase3h_email_send_hardening.sql
2. Update types/database.ts (email_sends Row/Insert/Update)
3. Update modules/messaging/repositories/email-send.repo.ts
4. Update modules/intelligence/structured-errors/structured-error.types.ts
5. Update modules/messaging/services/email-send.service.ts
6. Update app/api/webhooks/resend/route.ts
7. Create tests/phase3h-send-safety-hardening.test.ts

After all 7 files are complete:
- Run npx vitest run
- Run npx next build
- Report results
- Do not commit until I explicitly approve

Do not:
- Add features not in the plan
- Modify production Supabase
- Deploy production
- Create or push tags
- Commit without explicit approval
```

---

*Phase 3H Implementation Plan v1.0 — 2026-05-27*
