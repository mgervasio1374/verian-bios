# Phase 3B.1 Stabilization / Hardening — Implementation Plan

**Status:** Draft — Awaiting user approval before code implementation begins.
**Version:** 1.0
**Date:** 2026-05-22
**Prerequisite:** Phase 3B.1 Design & Test Cases v1.0 approved (`docs/roadmap/phase-3b1-stabilization-hardening-design-test-cases.md`)

---

## 1. Executive Summary

This plan translates the approved Phase 3B.1 design into a concrete, ordered code implementation. Phase 3B.1 is additive and hardening-only. It does not change any Phase 3B intelligence behavior, signal math, approval/rejection logic, or copy generation.

**What gets built:**

1. Migration `20240026` — adds `message_version_id` and `strategy_id` FK columns to `email_sends`
2. Attribution hardening — new columns populated at send time, FK-first fallback in webhook handler
3. SEB reconciler — new Inngest function detecting States A, B, C; auto-fixing State C only
4. Scheduled Learning Agent — new Inngest cron function running daily at 06:00 UTC
5. Operational Health UI — new card on agent monitor page (stuck drafts, failed sends, LA run status)
6. Test suite — new `tests/phase-3b1-stabilization.test.ts` covering all design test cases

**Expected test baseline after implementation:** ≥ 640 (590 existing + ≥ 50 new)

---

## 2. Final Decisions (Open Questions Resolved)

All seven open questions from the design document (Section 17) are resolved here:

| # | Question | Decision |
|---|---------|---------|
| 1 | FK delete behavior | `ON DELETE SET NULL` for both `message_version_id` and `strategy_id`. If the referenced version or strategy is hard-deleted, the FK column becomes null rather than throwing a constraint error. The JSONB metadata preserves the historical ID string. |
| 2 | Workspace ID for scheduled Learning Agent | Scheduled function queries one active workspace per tenant (MIN(id) as a stable tiebreaker). Does not make `workspaceId` nullable in `runLearningAnalysis`. The workspace_id in scheduled snapshots is execution context (used for the `learning_snapshots.workspace_id` column), not a query dimension. This is documented in the scheduled function. |
| 3 | SEB reconciler State B | Report-only in Phase 3B.1. The reconciler never auto-resolves `approval_requests`. Only State C (supersede) is auto-fixed. |
| 4 | Operational Health card visibility | Uses existing `crm.companies.view` permission — the same permission gate as the rest of the agent monitor page. No new permission is introduced. |
| 5 | Webhook failure indicator | Deferred. The `webhook_events.processed` flag is not a reliable failure indicator (the webhook handler marks rows processed after catching exceptions). The Operational Health card will not show a webhook failure metric in Phase 3B.1. This avoids misleading data without adding a `processing_error` column (migration `20240027` deferred). |
| 6 | Scheduled cron time | Fixed at `'0 6 * * *'` (06:00 UTC daily). Not tenant-configurable in v1. |
| 7 | Reconciler organization | `reconcileSendBridgeStuckDrafts` remains a separate Inngest function from the existing `reconcileEmailDraftStatus`. They address different problem domains and run on different schedules. |

---

## 3. Non-Goals (Reaffirmed)

These are explicitly out of scope for Phase 3B.1:

- No changes to MSA, CA, QRA, HRB, or SEB business logic
- No changes to Learning Agent signal math or confidence calculation
- No active learning or strategy weight updates
- No modification of generated message copy
- No auto-send, auto-retry, or auto-follow-up
- No new Resend API calls
- No external LLM calls
- No changes to Phase 3A template email behavior
- No `processing_error` column on `webhook_events`
- No webhook failure count in the Operational Health card (deferred)

---

## 4. Implementation Scope

### 4.1 New Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20240026_phase3b1_email_sends_attribution.sql` | Add `message_version_id`, `strategy_id` columns and indexes to `email_sends` |
| `modules/messaging/send-bridge/send-bridge-reconciliation.types.ts` | Types for reconciler results, stuck state records |
| `modules/messaging/send-bridge/send-bridge-reconciliation.service.ts` | Stuck state detection queries and State C auto-fix logic |
| `modules/messaging/repositories/operational-health.repo.ts` | Queries for operational health metrics (stuck counts, failed sends, LA run status) |
| `inngest/functions/reconcile-send-bridge-stuck-drafts.ts` | Inngest function: runs every 15 min, detects and reports/fixes SEB stuck states |
| `inngest/functions/scheduled-learning-agent-run.ts` | Inngest function: runs daily at 06:00 UTC, runs Learning Agent per tenant |
| `tests/phase-3b1-stabilization.test.ts` | New test suite for Phase 3B.1 |

### 4.2 Existing Files to Modify

| File | Change |
|------|--------|
| `types/database.ts` | Add `message_version_id` and `strategy_id` to `email_sends` Row, Insert, Update types and Relationships |
| `modules/messaging/repositories/email-send.repo.ts` | Extend `CreateEmailSendInput` with optional `message_version_id?`, `strategy_id?`; add to INSERT |
| `modules/messaging/services/email-send.service.ts` | Pass `message_version_id` and `strategy_id` from `phase3bMeta` when calling `createEmailSend` |
| `modules/messaging/event-tracking/event-tracking.attribution.ts` | Add `resolvePhase3bAttributionFromSend` helper: FK-first detection with JSONB fallback |
| `app/api/webhooks/resend/route.ts` | Expand select to include `message_version_id, strategy_id`; use new helper for Phase 3B detection |
| `app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx` | Add Operational Health card (stuck drafts, failed sends, LA run status) |
| `inngest/index.ts` | Register the two new Inngest functions |

### 4.3 Files Explicitly Not Modified

- All Phase 3B agent modules (strategy, copywriting, quality-review, human-review, send-bridge service, event-tracking service, learning-agent signals/confidence/audit)
- `modules/messaging/actions/learning-agent.actions.ts` — manual run server action unchanged
- `modules/messaging/repositories/learning-snapshot.repo.ts` — unchanged
- `modules/messaging/repositories/email-draft.repo.ts` — unchanged (the reconciler imports existing functions: `supersedePendingDraftsForLead`)
- All Phase 3A files — unchanged
- All test files for Phase 3B agents — unchanged (all 590 existing tests must still pass)

---

## 5. Proposed Module Structure

```
supabase/
  migrations/
    20240026_phase3b1_email_sends_attribution.sql     NEW

types/
  database.ts                                         MODIFY — add 2 columns to email_sends

modules/
  messaging/
    send-bridge/
      send-bridge-reconciliation.types.ts             NEW
      send-bridge-reconciliation.service.ts           NEW
    repositories/
      email-send.repo.ts                              MODIFY — extend CreateEmailSendInput
      operational-health.repo.ts                     NEW
    services/
      email-send.service.ts                           MODIFY — pass FK values to createEmailSend
    event-tracking/
      event-tracking.attribution.ts                  MODIFY — add resolvePhase3bAttributionFromSend

inngest/
  index.ts                                            MODIFY — register 2 new functions
  functions/
    reconcile-send-bridge-stuck-drafts.ts             NEW
    scheduled-learning-agent-run.ts                   NEW

app/
  (workspace)/
    [workspaceSlug]/
      settings/
        agent-monitor/
          page.tsx                                    MODIFY — add Operational Health card

tests/
  phase-3b1-stabilization.test.ts                    NEW
```

---

## 6. Migration Plan

### 6.1 Migration File

**File:** `supabase/migrations/20240026_phase3b1_email_sends_attribution.sql`

```sql
-- -------------------------------------------------------
-- Phase 3B.1: Attribution hardening for email_sends
-- Migration: 20240026
-- -------------------------------------------------------
-- Adds explicit message_version_id and strategy_id FK columns
-- to email_sends for Phase 3B-originated sends.
-- Both columns are nullable — Phase 3A sends leave them null.
-- ON DELETE SET NULL preserves historical records if the
-- referenced row is later hard-deleted.
-- The JSONB metadata column is not removed; the FK columns
-- are additive. Old Phase 3B sends (JSONB-only) still work
-- via the JSONB fallback path in event-tracking.attribution.ts.
-- -------------------------------------------------------

ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS message_version_id uuid
    REFERENCES message_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS strategy_id uuid
    REFERENCES message_strategies(id) ON DELETE SET NULL;

-- Partial indexes: only Phase 3B rows have non-null values.
-- Partial indexes keep index size minimal and build near-instantly.
CREATE INDEX IF NOT EXISTS idx_email_sends_message_version
  ON email_sends(message_version_id)
  WHERE message_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_sends_strategy
  ON email_sends(strategy_id)
  WHERE strategy_id IS NOT NULL;
```

### 6.2 Migration Safety

- `ADD COLUMN IF NOT EXISTS` with nullable columns: zero table lock, zero data movement in PostgreSQL.
- Both columns start as `NULL` for all existing rows — no backfill required.
- `IF NOT EXISTS` makes the migration idempotent (safe to re-run).
- Partial index build is near-instant: no existing rows have non-null values.
- `ON DELETE SET NULL` means a hard-delete of `message_versions` or `message_strategies` nulls the FK column rather than blocking or cascading. The historical JSONB metadata preserves the string ID for audit purposes.

### 6.3 Database Type Regeneration

The project keeps `types/database.ts` in-repo. After the migration is applied, this file must be updated. Two approaches are valid; the implementation plan supports either:

**Approach A — Manual update (preferred for this migration):** Edit `types/database.ts` directly to add the two new columns to the `email_sends` type. This is faster than regeneration and avoids requiring a locally-running Supabase instance. The edits are:

```typescript
// In email_sends.Row — add after workspace_id:
message_version_id: string | null
strategy_id: string | null

// In email_sends.Insert — add after workspace_id:
message_version_id?: string | null
strategy_id?: string | null

// In email_sends.Update — add after workspace_id:
message_version_id?: string | null
strategy_id?: string | null

// In email_sends.Relationships — add after email_sends_workspace_id_fkey:
{
  foreignKeyName: "email_sends_message_version_id_fkey"
  columns: ["message_version_id"]
  isOneToOne: false
  referencedRelation: "message_versions"
  referencedColumns: ["id"]
},
{
  foreignKeyName: "email_sends_strategy_id_fkey"
  columns: ["strategy_id"]
  isOneToOne: false
  referencedRelation: "message_strategies"
  referencedColumns: ["id"]
},
```

**Approach B — CLI regeneration:** Apply migration `20240026` to the local Supabase instance, then run `npx supabase gen types typescript --local > types/database.ts`. This produces the canonical updated type. Preferred if the local Supabase instance is already running and up to date.

**Implementation sequence dependency:** Step 1 (migration) must precede Step 2 (type update) must precede Steps 3 and 4 (repo and service changes that use the new types).

---

## 7. Attribution Hardening: Email Send Repo

### 7.1 `modules/messaging/repositories/email-send.repo.ts`

**Change:** Extend the `CreateEmailSendInput` interface with two optional fields, and include them in the INSERT object.

**Before (current `CreateEmailSendInput`):**
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
}
```

**After (Phase 3B.1 `CreateEmailSendInput`):**
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
  messageVersionId?: string | null   // Phase 3B attribution FK (nullable)
  strategyId?: string | null         // Phase 3B attribution FK (nullable)
}
```

**INSERT object change:** Add the two new fields to the insert payload:
```typescript
message_version_id: input.messageVersionId ?? null,
strategy_id:        input.strategyId ?? null,
```

**Backward compatibility:** Both new fields are optional (`?`). All existing callers (Phase 3A send path) that do not pass them will have `null` inserted, which is correct.

---

## 8. Attribution Hardening: Email Send Service

### 8.1 `modules/messaging/services/email-send.service.ts`

**Change:** When `phase3bMeta !== null`, pass `messageVersionId` and `strategyId` to `createEmailSend`.

**Current call site** (around line 156):
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
})
```

**After change:**
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
  // Phase 3B.1 attribution hardening: explicit FK columns alongside JSONB metadata.
  // null for Phase 3A sends (phase3bMeta === null).
  messageVersionId: phase3bMeta?.message_version_id ?? null,
  strategyId:       phase3bMeta?.strategy_id ?? null,
})
```

**Guardrail:** Phase 3A sends pass `phase3bMeta = null` through to this call. The null-coalescing `?? null` ensures both FK columns are `null` for Phase 3A sends. No existing Phase 3A behavior is affected.

---

## 9. Attribution Hardening: Event Tracking

### 9.1 `modules/messaging/event-tracking/event-tracking.attribution.ts`

**Change:** Add one new pure function `resolvePhase3bAttributionFromSend`. This function takes the expanded `emailSend` row fields (including the new FK columns) and returns Phase 3B attribution, preferring FK columns where present.

**New function to add:**

```typescript
// Shape of the email_send fields available at webhook time after Phase 3B.1 migration.
// message_version_id and strategy_id come from explicit FK columns (nullable).
// metadata contains the JSONB payload (always present for Phase 3B sends that used the bridge).
export interface EmailSendAttributionFields {
  message_version_id: string | null   // explicit FK column (null for old records or Phase 3A)
  strategy_id:        string | null   // explicit FK column
  metadata:           Record<string, unknown> | null
}

// resolvePhase3bAttributionFromSend
// Returns EtPhase3bMeta if the send is Phase 3B-originated, null otherwise.
// Strategy:
//   1. If message_version_id FK column is non-null → Phase 3B send.
//      Return meta from FK columns + JSONB for fields not yet promoted to columns.
//   2. Else fall back to extractPhase3bMeta(metadata) → handles old JSONB-only sends.
//   3. If both are null/missing → return null (Phase 3A or unattributed send).
//
// The FK-first path ensures ET_ events are emitted even if JSONB metadata is malformed,
// as long as the explicit columns were written correctly at send time.

export function resolvePhase3bAttributionFromSend(
  send: EmailSendAttributionFields
): EtPhase3bMeta | null {
  // Primary path: explicit FK column is the reliable Phase 3B marker
  if (send.message_version_id !== null) {
    // Use explicit columns for the core attribution IDs.
    // JSONB metadata carries the supplementary fields (version_label, composite_score, etc.)
    // that are not yet promoted to their own DB columns.
    const jsonbMeta = send.metadata ?? {}
    const fromJsonb = extractPhase3bMeta(jsonbMeta)

    return {
      source:             'phase_3b_send_bridge',
      message_version_id: send.message_version_id,
      strategy_id:        send.strategy_id,
      quality_review_id:  fromJsonb?.quality_review_id  ?? null,
      version_label:      fromJsonb?.version_label       ?? null,
      composite_score:    fromJsonb?.composite_score     ?? null,
      approved_by:        fromJsonb?.approved_by         ?? null,
      lead_id:            fromJsonb?.lead_id             ?? null,
      send_initiated_by:  fromJsonb?.send_initiated_by   ?? null,
    }
  }

  // Fallback path: FK columns not populated (old send predating migration, or Phase 3A)
  return extractPhase3bMeta(send.metadata ?? null)
}
```

**What does NOT change:** `extractPhase3bMeta`, `isPhase3bSend`, `buildPhase3bSendMetadata`, and `RESEND_EVENT_TO_ET_TYPE` are unchanged. The new function is purely additive.

### 9.2 `app/api/webhooks/resend/route.ts`

**Changes:**
1. Expand the `email_sends` select to include the two new FK columns.
2. Replace the `isPhase3bSend(sendMeta)` + `extractPhase3bMeta(sendMeta)` pattern with `resolvePhase3bAttributionFromSend(emailSend)`.

**Current select** (in `processResendEvent`):
```typescript
.select('id, tenant_id, workspace_id, contact_id, company_id, draft_id, metadata, status')
```

**After change:**
```typescript
.select('id, tenant_id, workspace_id, contact_id, company_id, draft_id, metadata, status, message_version_id, strategy_id')
```

**Current attribution block:**
```typescript
const sendMeta = (emailSend.metadata ?? {}) as Record<string, unknown>
if (etAttribution.isPhase3bSend(sendMeta)) {
  const phase3bMeta = etAttribution.extractPhase3bMeta(sendMeta)
  const etType = RESEND_EVENT_TO_ET_TYPE[eventType]
  if (etType && phase3bMeta) {
    activityEventService.recordActivity({ ... }).catch(() => {})
  }
}
```

**After change:**
```typescript
const phase3bMeta = etAttribution.resolvePhase3bAttributionFromSend({
  message_version_id: (emailSend as unknown as Record<string, unknown>)['message_version_id'] as string | null,
  strategy_id:        (emailSend as unknown as Record<string, unknown>)['strategy_id'] as string | null,
  metadata:           (emailSend.metadata ?? {}) as Record<string, unknown>,
})
if (phase3bMeta) {
  const etType = RESEND_EVENT_TO_ET_TYPE[eventType]
  if (etType) {
    activityEventService.recordActivity({ ... }).catch(() => {})
  }
}
```

**Note on type casting:** Until `types/database.ts` is updated with the new columns, the Supabase query result will be typed without `message_version_id` and `strategy_id`. The type cast `(emailSend as unknown as Record<string, unknown>)['message_version_id']` is the safe interim pattern. After the `types/database.ts` update, the cast can be removed. The implementation plan sequence ensures the type update happens before this code change.

**What does NOT change:** The `etAudit.buildWebhookOutcomePayload(...)` call, the `etType` resolution, the idempotency guard, the `EVENT_TO_SEND_STATUS` update, the complaint auto-unsubscribe logic — all unchanged.

---

## 10. SEB Reconciler Implementation Plan

### 10.1 `modules/messaging/send-bridge/send-bridge-reconciliation.types.ts`

Define all types and interfaces for the reconciler. No business logic — pure type definitions.

**Contents:**

```typescript
// Represents one stuck draft in State A (no approval_request_id)
interface StuckDraftStateA {
  draftId:   string
  tenantId:  string
  leadId:    string | null
  createdAt: string
}

// Represents one stuck draft in State B (linked to pending approval_request)
interface StuckDraftStateB {
  draftId:          string
  tenantId:         string
  leadId:           string | null
  approvalRequestId:string
  createdAt:        string
}

// Represents one State C situation (approved draft with unsuperseded pending siblings)
interface StuckStateC {
  tenantId:        string
  leadId:          string
  approvedDraftId: string
}

// Result returned by the reconciliation service and Inngest function
interface SebReconciliationResult {
  stateA: {
    found:    number
    reported: number
  }
  stateB: {
    found:    number
    reported: number
  }
  stateC: {
    found:   number
    fixed:   number
    errors:  number
  }
  ranAt: string
}
```

### 10.2 `modules/messaging/send-bridge/send-bridge-reconciliation.service.ts`

**Responsibilities:**
- Detection queries for States A, B, and C
- State C auto-fix (calls existing `supersedePendingDraftsForLead`)
- Returns `SebReconciliationResult`
- Never sends email, never creates drafts, never resolves approval_requests

**Architecture:** All DB access via `createSupabaseServiceClient()`. The service imports `supersedePendingDraftsForLead` from `email-draft.repo.ts`. No other repos imported for write operations.

**Key design decisions:**

For State A detection — Supabase filter chain:
```typescript
supabase
  .from('email_drafts')
  .select('id, tenant_id, lead_id, created_at')
  .eq('status', 'pending_approval')
  .is('approval_request_id', null)
  .is('deleted_at', null)
  .filter('ai_generation_metadata->>source', 'eq', 'phase_3b_send_bridge')
  .lt('created_at', graceThreshold)
  .limit(50)
```

For State B detection — two-step approach (preferred over PostgREST JOIN for clarity):

Step B1: Find Phase 3B `pending_approval` drafts with non-null `approval_request_id`:
```typescript
supabase
  .from('email_drafts')
  .select('id, tenant_id, lead_id, approval_request_id, created_at')
  .eq('status', 'pending_approval')
  .not('approval_request_id', 'is', null)
  .is('deleted_at', null)
  .filter('ai_generation_metadata->>source', 'eq', 'phase_3b_send_bridge')
  .lt('created_at', graceThreshold)
  .limit(50)
```

Step B2: For each result, check if the linked `approval_request.status = 'pending'`:
```typescript
supabase
  .from('approval_requests')
  .select('id, status')
  .in('id', approvalRequestIds)
  .eq('status', 'pending')
  .eq('request_type', 'email_draft_review')
```

Only drafts whose linked approval_request is in state `pending` are classified as State B.

For State C detection — two-step approach:

Step C1: Find all Phase 3B `approved` drafts for the tenant:
```typescript
supabase
  .from('email_drafts')
  .select('id, tenant_id, lead_id')
  .eq('status', 'approved')
  .is('deleted_at', null)
  .filter('ai_generation_metadata->>source', 'eq', 'phase_3b_send_bridge')
  .limit(100)
```

Step C2: For each lead_id from C1, check for pending siblings:
```typescript
supabase
  .from('email_drafts')
  .select('id')
  .eq('tenant_id', tenantId)
  .eq('lead_id', leadId)
  .in('status', ['pending', 'pending_approval'])
  .is('deleted_at', null)
  .neq('id', approvedDraftId)
  .limit(1)
```

If siblings exist, this is State C for that lead. Auto-fix by calling `supersedePendingDraftsForLead(tenantId, leadId)`.

**Grace period constant:**
```typescript
const GRACE_PERIOD_MINUTES = 10
// graceThreshold = new Date(Date.now() - GRACE_PERIOD_MINUTES * 60 * 1000).toISOString()
```

**Export:**
```typescript
export async function runSebReconciliation(): Promise<SebReconciliationResult>
```

### 10.3 `inngest/functions/reconcile-send-bridge-stuck-drafts.ts`

Follow the exact structural pattern of the existing `reconcile-email-draft-status.ts`:

```typescript
import { inngest } from '@/lib/inngest/client'
import { runSebReconciliation } from '@/modules/messaging/send-bridge/send-bridge-reconciliation.service'
import type { SebReconciliationResult } from '@/modules/messaging/send-bridge/send-bridge-reconciliation.types'

export const reconcileSendBridgeStuckDrafts = inngest.createFunction(
  {
    id: 'reconcile-send-bridge-stuck-drafts',
    name: 'Reconcile Send Bridge Stuck Drafts',
    retries: 1,
    triggers: [{ cron: '*/15 * * * *' }],  // every 15 minutes
  },
  async ({ step, logger }) => {
    const result = await step.run('detect-and-fix-stuck-drafts', async (): Promise<SebReconciliationResult> => {
      return runSebReconciliation()
    })

    // Summary logging visible in Inngest dashboard
    if (result.stateA.found > 0) {
      logger.warn('SEB Reconciler: State A stuck drafts detected (report-only)', result.stateA)
    }
    if (result.stateB.found > 0) {
      logger.warn('SEB Reconciler: State B stuck drafts detected (report-only)', result.stateB)
    }
    if (result.stateC.fixed > 0) {
      logger.info('SEB Reconciler: State C fixed (supersede)', result.stateC)
    }
    if (result.stateC.errors > 0) {
      logger.error('SEB Reconciler: State C fix errors', result.stateC)
    }
    if (result.stateA.found === 0 && result.stateB.found === 0 && result.stateC.found === 0) {
      logger.info('SEB Reconciler: no stuck drafts found')
    }

    return result
  }
)
```

**Guardrails enforced in the service (verified by code, not just comment):**
- No Resend API call
- No `sendApprovedDraftAction` call
- No `email_drafts` INSERT
- No `approval_requests` resolve/update
- No `message_version` content read or write

---

## 11. Scheduled Learning Agent Implementation Plan

### 11.1 `inngest/functions/scheduled-learning-agent-run.ts`

**Purpose:** Daily advisory signal refresh for all active tenants.

**Full implementation design:**

```typescript
import { inngest } from '@/lib/inngest/client'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { runLearningAnalysis } from '@/modules/messaging/learning-agent/learning-agent.service'
import { LEARNING_AGENT_LOOKBACK_DAYS } from '@/modules/messaging/learning-agent/learning-agent.types'

// Sentinel string that distinguishes scheduled runs from manual runs in the LA_ audit event.
const SCHEDULED_TRIGGERED_BY = 'scheduled:inngest'

interface TenantRunResult {
  tenantId:      string
  workspaceId:   string
  ok:            boolean
  snapshotCount: number
  totalSends:    number
  errorReason?:  string
}

interface ScheduledLearningAgentResult {
  tenantsProcessed: number
  tenantsWithData:  number
  tenantsWithError: number
  results:          TenantRunResult[]
}

export const scheduledLearningAgentRun = inngest.createFunction(
  {
    id: 'scheduled-learning-agent-run',
    name: 'Scheduled Learning Agent Run',
    retries: 0,   // No retry — per-tenant failures are logged; a full retry would re-run all tenants
    triggers: [{ cron: '0 6 * * *' }],  // daily at 06:00 UTC
  },
  async ({ step, logger }) => {
    // STEP 1: Enumerate active tenants
    const tenants = await step.run('enumerate-active-tenants', async () => {
      const supabase = createSupabaseServiceClient()
      const { data, error } = await supabase
        .from('workspaces')
        .select('tenant_id, id')
        .is('deleted_at', null)
        .order('tenant_id', { ascending: true })
        .order('id', { ascending: true })

      if (error) throw new Error(`Failed to enumerate tenants: ${error.message}`)

      // One workspace per tenant (first by id for stable selection)
      const tenantMap = new Map<string, string>()
      for (const row of data ?? []) {
        if (!tenantMap.has(row.tenant_id)) {
          tenantMap.set(row.tenant_id, row.id)
        }
      }
      return [...tenantMap.entries()].map(([tenantId, workspaceId]) => ({ tenantId, workspaceId }))
    })

    logger.info(`Scheduled Learning Agent: ${tenants.length} tenant(s) to process`)

    // STEP 2: Run Learning Agent per tenant
    const results: TenantRunResult[] = []

    for (const { tenantId, workspaceId } of tenants) {
      const result = await step.run(`run-tenant-${tenantId}`, async (): Promise<TenantRunResult> => {
        try {
          const analysisResult = await runLearningAnalysis({
            tenantId,
            workspaceId,
            triggeredBy:  SCHEDULED_TRIGGERED_BY,
            lookbackDays: LEARNING_AGENT_LOOKBACK_DAYS,
          })
          return {
            tenantId,
            workspaceId,
            ok:            analysisResult.ok,
            snapshotCount: analysisResult.snapshotCount ?? 0,
            totalSends:    analysisResult.totalSends ?? 0,
            errorReason:   analysisResult.errorReason,
          }
        } catch (err) {
          // Catch synchronous errors from runLearningAnalysis (should not occur but defensive)
          return {
            tenantId,
            workspaceId,
            ok:            false,
            snapshotCount: 0,
            totalSends:    0,
            errorReason:   err instanceof Error ? err.message : 'unknown_error',
          }
        }
      })
      results.push(result)
    }

    // STEP 3: Summarize
    const summary: ScheduledLearningAgentResult = {
      tenantsProcessed: results.length,
      tenantsWithData:  results.filter(r => r.ok && r.totalSends > 0).length,
      tenantsWithError: results.filter(r => !r.ok).length,
      results,
    }

    if (summary.tenantsWithError > 0) {
      logger.warn('Scheduled Learning Agent: some tenants had errors', {
        errored: results.filter(r => !r.ok).map(r => ({ tenantId: r.tenantId, reason: r.errorReason }))
      })
    } else {
      logger.info('Scheduled Learning Agent: all tenants processed successfully', {
        tenantsProcessed: summary.tenantsProcessed,
        tenantsWithData:  summary.tenantsWithData,
      })
    }

    return summary
  }
)
```

**Key design decisions:**

- **`retries: 0`** — A full retry would re-run all tenants even if only one failed. Per-tenant errors are already caught and logged. Inngest dashboard shows which tenants failed.
- **`step.run('run-tenant-${tenantId}')`** — Each tenant is a separate Inngest step, giving per-tenant visibility in the Inngest dashboard and per-step retry capability if desired.
- **`SCHEDULED_TRIGGERED_BY = 'scheduled:inngest'`** — Distinguishes scheduled from manual `LA_SIGNALS_COMPUTED` events in the audit trail.
- **`workspaceId` selection** — Queries `workspaces` with `ORDER BY tenant_id, id ASC` and picks the first workspace per tenant. This is deterministic (stable tiebreaker), not arbitrary. Note: `workspace_id` in the resulting `learning_snapshots` rows is execution context, not a filter dimension.
- **`runLearningAnalysis` unchanged** — The existing service function is called as-is. No modifications to the Learning Agent service for scheduled support.

### 11.2 `inngest/index.ts`

**Change:** Import and register both new functions.

**Before:**
```typescript
export const inngestFunctions = [
  dispatchOutbox,
  onLeadCreated,
  onApprovalApproved,
  onApprovalRejected,
  reconcileEmailDraftStatus,
  onStatementReceived,
]
```

**After:**
```typescript
export const inngestFunctions = [
  dispatchOutbox,
  onLeadCreated,
  onApprovalApproved,
  onApprovalRejected,
  reconcileEmailDraftStatus,
  onStatementReceived,
  reconcileSendBridgeStuckDrafts,  // Phase 3B.1
  scheduledLearningAgentRun,       // Phase 3B.1
]
```

---

## 12. Operational Health UI Implementation Plan

### 12.1 `modules/messaging/repositories/operational-health.repo.ts`

New repository. All reads. No writes. All queries are tenant-scoped. Non-fatal — callers wrap in try/catch.

**Functions to implement:**

```typescript
export interface SebStuckDraftCounts {
  stateA: number    // pending_approval, no approval_request_id, Phase 3B, > 10 min old
  stateB: number    // pending_approval, linked to pending approval_request, Phase 3B, > 10 min old
}

export interface FailedSendMetrics {
  count:      number    // failed sends in the last 24 hours for this tenant
  windowHours:number    // = 24
}

export interface LatestLaRunStatus {
  computedAt:    string    // ISO timestamp
  snapshotCount: number | null
  totalSends:    number | null
  ok:            boolean
}

export async function getSebStuckDraftCounts(tenantId: string): Promise<SebStuckDraftCounts>
export async function getFailedSendCount(tenantId: string): Promise<FailedSendMetrics>
export async function getLatestLaRunStatus(tenantId: string): Promise<LatestLaRunStatus | null>
```

**`getSebStuckDraftCounts` implementation:** Uses the same detection logic as `send-bridge-reconciliation.service.ts` but returns counts only (no data loading beyond count). Two separate Supabase queries:
- State A: `.eq('status', 'pending_approval').is('approval_request_id', null).is('deleted_at', null).filter('ai_generation_metadata->>source', 'eq', 'phase_3b_send_bridge').lt('created_at', graceThreshold)` — use `.select('id')` and count `data?.length ?? 0`.
- State B: Two-step as described in Section 10.2, but only counting results.

**`getFailedSendCount` implementation:**
```typescript
supabase
  .from('email_sends')
  .select('id')
  .eq('tenant_id', tenantId)
  .eq('status', 'failed')
  .gte('created_at', windowStart)   // windowStart = now - 24h
```
Count = `data?.length ?? 0`.

**`getLatestLaRunStatus` implementation:**
Query `activity_events` for the most recent `LA_SIGNALS_COMPUTED` or `LA_SIGNALS_COMPUTATION_FAILED` event for this tenant:
```typescript
supabase
  .from('activity_events')
  .select('event_type, occurred_at, metadata')
  .eq('tenant_id', tenantId)
  .in('event_type', ['LA_SIGNALS_COMPUTED', 'LA_SIGNALS_COMPUTATION_FAILED'])
  .order('occurred_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```
Map result:
- `ok = event_type === 'LA_SIGNALS_COMPUTED'`
- `computedAt = row.occurred_at`
- `snapshotCount = metadata?.signals_computed ?? null`
- `totalSends = metadata?.total_sends ?? null`

### 12.2 `app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx`

**Change:** Add data loading for operational health metrics and an Operational Health card to the JSX.

**Data loading additions** (in `AgentMonitorPage`):

```typescript
// Load operational health metrics (all non-fatal)
let sebStuckCounts: { stateA: number; stateB: number } = { stateA: 0, stateB: 0 }
let failedSendCount = 0
let latestLaRun: LatestLaRunStatus | null = null

try {
  sebStuckCounts = await operationalHealthRepo.getSebStuckDraftCounts(ctx.tenantId)
} catch { /* silent */ }

try {
  const failedMetrics = await operationalHealthRepo.getFailedSendCount(ctx.tenantId)
  failedSendCount = failedMetrics.count
} catch { /* silent */ }

try {
  latestLaRun = await operationalHealthRepo.getLatestLaRunStatus(ctx.tenantId)
} catch { /* silent */ }
```

**JSX position:** Between the System Controls card and the existing Learning Signals card.

**Operational Health card structure:**
```
Card: "Operational Health"
│
├── Stuck Phase 3B Drafts
│   ├── State A (no approval link): {n} or "None"
│   ├── State B (pending approval):  {n} or "None"
│   └── If any > 0: yellow badge + note: "Stuck drafts cannot be sent until resolved."
│
├── Failed Sends (last 24h)
│   └── {n} or "None" — yellow badge if > 0
│
├── Learning Agent Last Run
│   ├── Timestamp: "{date}" or "Never"
│   ├── Status: "Completed — {snapshotCount} signals · {totalSends} sends" or "Failed"
│   └── If ok=false: destructive badge
│
└── Advisory disclaimer:
    "All indicators above are informational only. No automatic action is taken."
```

**Shared components used:** `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Badge` — already imported. No new UI components needed.

---

## 13. Test Suite Implementation Plan

### 13.1 `tests/phase-3b1-stabilization.test.ts`

**Framework:** Vitest. `import { describe, it, expect } from 'vitest'`.

**No test fixtures needed.** Unlike Phase 3B agents, the Phase 3B.1 code is not fixture-driven — it operates on live DB state (reconciler, scheduled function) or pure functions (attribution helpers). Tests use in-memory data constructed in the test file itself.

**Test structure:**

```
Phase 3B.1 — Attribution Helpers (TC-S01 through TC-S12)
  ├── resolvePhase3bAttributionFromSend: FK-first path (TC-S01, TC-S02, TC-S03)
  ├── resolvePhase3bAttributionFromSend: JSONB fallback (TC-S06, TC-S07)
  ├── resolvePhase3bAttributionFromSend: Phase 3A null (TC-S04, TC-S07)
  ├── resolvePhase3bAttributionFromSend: FK present + malformed JSONB (TC-S12)
  └── Backward compatibility: existing extractPhase3bMeta unchanged (TC-S09)

Phase 3B.1 — Send Bridge Reconciliation (TC-R01 through TC-R17)
  ├── Reconciliation types: correct interface shapes (structural)
  ├── State A detection: correct predicate logic (unit tests on the detection query logic)
  ├── State B detection: two-step join logic
  ├── State C detection: approved draft + pending siblings
  ├── State C fix: calls supersedePendingDraftsForLead
  ├── Idempotency: second run makes no additional changes
  ├── Guardrail: no email_sends INSERT
  ├── Guardrail: no email_drafts INSERT
  ├── Guardrail: no approval_request resolve
  ├── Guardrail: no message_version write
  └── Result shape: returns SebReconciliationResult

Phase 3B.1 — Scheduled Learning Agent (TC-L01 through TC-L13)
  ├── Trigger: SCHEDULED_TRIGGERED_BY sentinel value correct
  ├── Per-tenant error: does not abort sibling tenants
  ├── Result shape: ScheduledLearningAgentResult fields present
  ├── Advisory: runLearningAnalysis called with advisory-only config
  └── Guardrail: no MSA/QRA/version writes

Phase 3B.1 — Operational Health Repo (TC-M01 through TC-M10)
  ├── getSebStuckDraftCounts: returns { stateA, stateB } shape
  ├── getFailedSendCount: returns { count, windowHours } shape
  ├── getLatestLaRunStatus: returns correct fields from LA_SIGNALS_COMPUTED event
  ├── getLatestLaRunStatus: ok=false for LA_SIGNALS_COMPUTATION_FAILED
  └── getLatestLaRunStatus: null when no LA runs exist
```

**Key approach for reconciliation tests:** The reconciliation service and detection functions are tested by mocking the Supabase client (using Vitest's `vi.mock`) or by extracting the predicate logic into pure functions that can be tested without DB calls. The implementation plan recommends the latter: where possible, extract detection predicates into pure helper functions (`isStatADraft`, `isStateBDraft`, `isStateCCase`) that can be unit-tested.

**For attribution helper tests:** `resolvePhase3bAttributionFromSend` is a pure function — easy to test directly.

**Expected test count:** ≥ 50 new tests (targeting 55–65 including pure function units). Total with existing 590 = ≥ 640.

---

## 14. Implementation Sequence

Execute steps in this exact order. Each step must be completed and verified before starting the next.

### Step 1 — Migration file

Create `supabase/migrations/20240026_phase3b1_email_sends_attribution.sql` with the exact SQL from Section 6.1.

Apply to local Supabase instance if running (`npx supabase db push` or `npx supabase migration up`).

### Step 2 — Update `types/database.ts`

Manually add `message_version_id: string | null` and `strategy_id: string | null` to:
- `email_sends.Row`
- `email_sends.Insert` (optional: `message_version_id?: string | null`, `strategy_id?: string | null`)
- `email_sends.Update` (optional: same)
- `email_sends.Relationships` (add two FK entries)

Verify TypeScript compiles with no new errors after this edit alone.

### Step 3 — Extend `email-send.repo.ts`

Add `messageVersionId?: string | null` and `strategyId?: string | null` to `CreateEmailSendInput`. Add both to the `insert({...})` object. Phase 3A callers omit them (both default to `null`).

### Step 4 — Extend `email-send.service.ts`

Add `messageVersionId: phase3bMeta?.message_version_id ?? null` and `strategyId: phase3bMeta?.strategy_id ?? null` to the `createEmailSend(...)` call. Verify the Phase 3A path (where `phase3bMeta === null`) leaves both as `null`.

### Step 5 — Extend `event-tracking.attribution.ts`

Add the `EmailSendAttributionFields` interface and `resolvePhase3bAttributionFromSend` function. No existing functions modified. Verify it is a pure function with no imports of Supabase or I/O modules.

### Step 6 — Extend `app/api/webhooks/resend/route.ts`

Expand the `email_sends` select. Replace the `isPhase3bSend` + `extractPhase3bMeta` call with `resolvePhase3bAttributionFromSend`. Import the new function and the new `EmailSendAttributionFields` interface.

### Step 7 — Create `send-bridge-reconciliation.types.ts`

Pure type file. No I/O.

### Step 8 — Create `send-bridge-reconciliation.service.ts`

Implement `runSebReconciliation`. Import `supersedePendingDraftsForLead` from `email-draft.repo.ts` and `createSupabaseServiceClient` from service client. Return `SebReconciliationResult`.

### Step 9 — Create `reconcile-send-bridge-stuck-drafts.ts` (Inngest function)

Follows the pattern of the existing `reconcile-email-draft-status.ts`. Calls `runSebReconciliation`.

### Step 10 — Create `scheduled-learning-agent-run.ts` (Inngest function)

Implements the full tenant-enumeration + per-tenant Learning Agent run pattern from Section 11.1.

### Step 11 — Update `inngest/index.ts`

Register both new functions. Verify the array has 8 entries after this change.

### Step 12 — Create `operational-health.repo.ts`

Implement the three query functions. All return structured types. All use service client. All tenant-scoped.

### Step 13 — Extend agent monitor `page.tsx`

Add the three data-loading calls (all non-fatal). Add the Operational Health card JSX in the correct position (between System Controls and Learning Signals).

### Step 14 — Create `tests/phase-3b1-stabilization.test.ts`

Implement all tests from Section 13. Target ≥ 50 tests. All existing tests must still pass.

### Step 15 — QA pass

See Section 15.

---

## 15. QA Checklist

Before marking Phase 3B.1 implementation complete, every item below must be verified.

### Tests

- [ ] `npx vitest run` → PASSED, ≥ 640 tests, 0 failures
- [ ] All 590 existing tests pass (no regressions)
- [ ] New tests cover all 50 design test cases (TC-S01–TC-M12)

### Build and Types

- [ ] `npx next build` → PASSED, 0 errors
- [ ] TypeScript → PASSED (no new errors from type file changes or new code)
- [ ] No TypeScript errors from `email_sends` type additions

### Migration Verification

- [ ] `20240026_phase3b1_email_sends_attribution.sql` created with correct SQL
- [ ] Both columns are nullable (`uuid` without NOT NULL)
- [ ] Both columns use `ON DELETE SET NULL`
- [ ] Both partial indexes defined (`WHERE ... IS NOT NULL`)
- [ ] `IF NOT EXISTS` guards on both `ADD COLUMN` and `CREATE INDEX`
- [ ] `types/database.ts` updated with new columns in Row/Insert/Update/Relationships

### Attribution Hardening Verification

- [ ] `createEmailSend` populates `message_version_id` for Phase 3B sends
- [ ] `createEmailSend` populates `strategy_id` for Phase 3B sends
- [ ] `createEmailSend` leaves both columns `null` for Phase 3A sends
- [ ] `resolvePhase3bAttributionFromSend` is a pure function (no I/O)
- [ ] FK-first path: `message_version_id` column preferred when non-null
- [ ] JSONB fallback path: `extractPhase3bMeta` called when FK column is null
- [ ] Phase 3A sends: `resolvePhase3bAttributionFromSend` returns null
- [ ] Webhook handler select includes `message_version_id, strategy_id`
- [ ] Existing `extractPhase3bMeta`, `isPhase3bSend`, `buildPhase3bSendMetadata`, `RESEND_EVENT_TO_ET_TYPE` unchanged

### SEB Reconciler Verification

- [ ] `reconcileSendBridgeStuckDrafts` function registered in `inngest/index.ts`
- [ ] Cron: `'*/15 * * * *'` (every 15 minutes)
- [ ] State A detection query uses correct filters (pending_approval, null approval_request_id, SEB source, > 10 min)
- [ ] State B detection uses two-step query (Phase 3B draft with non-null approval_request_id + pending approval_request)
- [ ] State C detection uses two-step query (approved SEB draft + pending siblings for same lead)
- [ ] State A result: report-only, no writes
- [ ] State B result: report-only, no writes
- [ ] State C fix: calls `supersedePendingDraftsForLead` (existing function, idempotent)
- [ ] Result is `SebReconciliationResult` with `{ stateA, stateB, stateC }` structure
- [ ] Existing `reconcileEmailDraftStatus` untouched

### Scheduled Learning Agent Verification

- [ ] `scheduledLearningAgentRun` function registered in `inngest/index.ts`
- [ ] Cron: `'0 6 * * *'` (06:00 UTC daily)
- [ ] Tenant enumeration: one workspace per tenant (stable selection)
- [ ] `triggeredBy: 'scheduled:inngest'` passed to `runLearningAnalysis`
- [ ] Per-tenant failure: caught, logged, does not abort other tenants
- [ ] `retries: 0` (full retry would re-run all tenants)
- [ ] Result is `ScheduledLearningAgentResult` with `{ tenantsProcessed, tenantsWithData, tenantsWithError, results[] }`
- [ ] `runLearningAnalysis` called with `lookbackDays: LEARNING_AGENT_LOOKBACK_DAYS` (90)
- [ ] Manual `RunAnalysisButton` unchanged (still calls `runLearningAnalysisAction` server action)

### Operational Health UI Verification

- [ ] `operational-health.repo.ts` created with three functions
- [ ] All three functions use service client (not user client)
- [ ] All three functions are tenant-scoped
- [ ] `getSebStuckDraftCounts`: counts State A and State B separately
- [ ] `getFailedSendCount`: filters by `status = 'failed'` and 24h window
- [ ] `getLatestLaRunStatus`: reads from `activity_events` with LA_ event types
- [ ] Agent monitor page: three non-fatal data-loading calls
- [ ] Operational Health card: positioned between System Controls and Learning Signals
- [ ] Stuck draft count > 0: shows warning badge + advisory note
- [ ] Failed send count > 0: shows warning badge
- [ ] LA run status: shows timestamp, snapshot count, ok/failed indicator
- [ ] Advisory disclaimer present: "All indicators above are informational only."
- [ ] No action buttons on the Operational Health card
- [ ] Existing page behavior (agent runs, system controls, learning signals) unchanged

### Guardrail Grep Pass

- [ ] `grep -r 'resend\|Resend' inngest/functions/reconcile-send-bridge* inngest/functions/scheduled-learning*` → 0 Resend API calls
- [ ] `grep -r 'sendApprovedDraftAction' modules/messaging/send-bridge/send-bridge-reconciliation*` → 0 results
- [ ] `grep -r "\.from('email_sends').*insert" modules/messaging/send-bridge/ inngest/functions/reconcile-send-bridge*` → 0 results
- [ ] `grep -r "\.from('email_drafts').*insert" modules/messaging/send-bridge/send-bridge-reconciliation*` → 0 results
- [ ] `grep -r 'resolveApprovalRequest\|approval_request.*update\|approval_request.*resolved' modules/messaging/send-bridge/send-bridge-reconciliation*` → 0 results
- [ ] `grep -r "message_strate" modules/messaging/send-bridge/ inngest/functions/` → only reads, no update
- [ ] `grep -r "quality_review" modules/messaging/send-bridge/send-bridge-reconciliation* inngest/functions/` → 0 results
- [ ] `grep -r 'body_text\|subject_line' modules/messaging/send-bridge/send-bridge-reconciliation* inngest/functions/` → 0 results
- [ ] `grep -r 'anthropic\|openai\|claude\|gpt' modules/messaging/send-bridge/ inngest/functions/` → 0 LLM calls

---

## 16. Rollback Plan

Phase 3B.1 is designed for safe rollback at each layer independently.

### 16.1 Migration Rollback

```sql
-- Rollback 20240026
DROP INDEX IF EXISTS idx_email_sends_message_version;
DROP INDEX IF EXISTS idx_email_sends_strategy;
ALTER TABLE email_sends
  DROP COLUMN IF EXISTS message_version_id,
  DROP COLUMN IF EXISTS strategy_id;
```

Safe at any time. No other tables reference these columns.

After rollback: revert `types/database.ts` edits, `email-send.repo.ts`, and `email-send.service.ts` to their pre-Phase-3B.1 state. The JSONB metadata fallback continues to work as before.

### 16.2 Attribution Fallback Rollback

If the new `resolvePhase3bAttributionFromSend` function causes issues:
- Revert `event-tracking.attribution.ts` to remove the new function
- Revert `app/api/webhooks/resend/route.ts` to use `isPhase3bSend` + `extractPhase3bMeta` directly
- The JSONB-only path is the original Phase 3B behavior and remains correct for all old records

### 16.3 Inngest Function Rollback

Remove `reconcileSendBridgeStuckDrafts` and `scheduledLearningAgentRun` from `inngest/index.ts` and redeploy. In-flight runs complete normally. No impact on any other application behavior.

### 16.4 UI Rollback

Revert the `page.tsx` changes. The Operational Health card is additive — removing it restores the original agent monitor page exactly.

---

## 17. Commit / Tag Plan

After all QA checks pass, the recommended commit and tag:

**Commit message:**
```
Phase 3B.1: implement Stabilization Hardening foundation
```

**Tag:**
```
phase-3b1-stabilization-v1
```

**AI Context files to update after commit:**

All six `docs/ai-context/` files should be updated in a subsequent docs commit:
- `00_CURRENT_STATUS.md` — update to Phase 3B.1 complete, new QA baseline (≥640 tests)
- `01_LOCKED_DECISIONS.md` — add Phase 3B.1 entries
- `02_PHASE_3B_AGENT_ARCHITECTURE.md` — update email_sends data model, add scheduled LA note
- `05_ACTIVE_GUARDRAILS.md` — add SEB reconciler guardrails
- `06_GIT_MILESTONES.md` — add commit SHA, tag, file list, QA entry
- `07_NEXT_STEPS.md` — mark Phase 3B.1 complete, update next phase

---

## 18. Unresolved Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `supabase gen types` not available or not run — `types/database.ts` desync | Low | Manual edit approach (Section 6.3 Approach A) avoids CLI dependency. Plan specifies the exact type additions. TypeScript check catches any type errors. |
| JSONB filter on `ai_generation_metadata->>'source'` slow at scale | Low (current volume) | The reconciler uses `LIMIT 50` and runs every 15 minutes. At high volume, a partial index on the JSONB field can be added in a future migration. |
| Scheduled Learning Agent tenant enumeration query returns no workspaces for a tenant | Very Low | The enumeration query filters `workspaces WHERE deleted_at IS NULL`. If a tenant has no workspaces, they are skipped. The per-tenant `runLearningAnalysis` validates `tenantId` is non-null. |
| Scheduled Learning Agent and manual run start within milliseconds — race on `learning_snapshots` unique index | Very Low | The unique index is `(tenant_id, run_id, ...)` — both runs use different `run_id` UUIDs. No unique constraint conflict. Both runs write valid independent rows. |
| New Inngest functions not deployed in production | Low | Ensure `inngest/index.ts` is deployed before expecting cron behavior. The Inngest dashboard will show the functions as registered only after deployment. |
| `webhook_events` table does not have `tenant_id` — webhook failure count cannot be tenant-scoped | Confirmed | Decision: webhook failure indicator is deferred. `operational-health.repo.ts` does not include a webhook failure query. The card shows only stuck drafts, failed sends, and LA run status. |
| State C auto-fix concurrently races with a new SEB run for the same lead | Very Low | The SEB `supersedePendingDraftsForLead` is idempotent — it uses status guards. If SEB runs simultaneously, one will set the status first; the other will find no matching rows (already superseded). No negative outcome. |

---

## 19. Final Acceptance Criteria

| Criterion | Met when |
|-----------|---------|
| Migration `20240026` created and applied | SQL file written, types updated |
| New Phase 3B sends populate explicit FK columns | `message_version_id` and `strategy_id` non-null in `email_sends` after send |
| Phase 3A sends leave both columns null | Verified by test TC-S04 |
| Webhook attribution uses FK-first path | `resolvePhase3bAttributionFromSend` in route.ts |
| Old JSONB-only sends still produce ET_ events | Verified by test TC-S06 |
| SEB reconciler registered and runs on schedule | In `inngest/index.ts`, cron every 15 minutes |
| State A and B detected and reported only | No approval_request modifications |
| State C auto-fix calls `supersedePendingDraftsForLead` | Idempotent supersede call in reconciler |
| Scheduled Learning Agent registered and runs daily | In `inngest/index.ts`, cron `0 6 * * *` |
| Manual run button unchanged | `RunAnalysisButton` unmodified |
| Operational Health card in agent monitor | Positioned between System Controls and Learning Signals |
| All health data loading non-fatal | try/catch wrapping all three repo calls |
| Advisory disclaimer on health card | Text present in rendered card |
| No action buttons on health card | Code review confirms |
| `npx vitest run` → ≥ 640, 0 failures | All 590 existing + ≥ 50 new tests pass |
| `npx next build` → 0 errors | TypeScript and build clean |
| Guardrail grep pass → 0 violations | All 9 grep checks pass |

---

*Document status: Draft — Awaiting user review and approval before implementation begins.*
*Version: 1.0 — 2026-05-22*
