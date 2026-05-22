# Phase 3B.1 Stabilization / Hardening — Final QA / Lock Report / Closeout

**Document status:** Final — For review and approval before Phase 3B.1 is locked.
**Version:** 1.0
**Date:** 2026-05-22
**Scope:** Phase 3B.1 Stabilization / Hardening Foundation

---

## 1. Executive Summary

The Phase 3B.1 Stabilization / Hardening Foundation is **complete**. All deliverables have been designed, reviewed, implemented, committed, tagged, and QA-verified.

The Phase 3B Revenue Learning Engine Foundation (all seven pipeline layers) remains **locked and unchanged**. Phase 3B.1 is additive and hardening-only — it makes the Phase 3B Foundation more reliable, more observable, and less dependent on operational assumptions that could fail at scale or under adverse conditions.

### What Phase 3B.1 Hardened

| Area | What Was Done |
|------|--------------|
| DB attribution | Added explicit `message_version_id` and `strategy_id` FK columns to `email_sends`; populated at send time; FK-first detection in webhook handler |
| Send Bridge reconciliation | Detects 3 stuck states from partial SEB write sequences; auto-fixes State C (unsuperseded siblings); reports States A and B |
| Scheduled Learning Agent | Daily Inngest cron at 06:00 UTC; enumerates all active tenants; runs advisory signal computation without manual intervention |
| Operational Health visibility | New read-only card on agent monitor: stuck draft counts, failed send count, Learning Agent last run status |

### QA Baseline (Final Verified State)

| Check | Result |
|-------|--------|
| `npx vitest run` | **PASSED** |
| Total tests | **646 / 646** |
| `npx next build` | **PASSED** |
| TypeScript | **PASSED** |
| Guardrail grep pass | **PASSED** |

**Previous locked Phase 3B baseline:** 590 / 590
**Phase 3B.1 tests added:** 56
**Current HEAD:** `0af660e` — Phase 3B.1: implement Stabilization Hardening foundation
**Tag:** `phase-3b1-stabilization-v1`

---

## 2. Completed Phase 3B.1 Components

### 2.1 DB Attribution Hardening

**Purpose:** Reduce reliance on JSONB-only Phase 3B provenance in `email_sends`. Add indexed FK columns that the webhook handler can prefer over JSONB parsing — eliminating silent attribution failures caused by malformed or missing JSONB metadata.

**Major files:**
- `supabase/migrations/20240026_phase3b1_email_sends_attribution.sql`
- `types/database.ts` — updated `email_sends` Row/Insert/Update/Relationships
- `modules/messaging/repositories/email-send.repo.ts` — extended `CreateEmailSendInput` with `messageVersionId?` and `strategyId?`
- `modules/messaging/services/email-send.service.ts` — passes FK values from `phase3bMeta` to `createEmailSend`

**Key behavior:**
- `email_sends.message_version_id` and `email_sends.strategy_id` are populated for all new Phase 3B sends at the moment `createEmailSend` is called
- Both columns are nullable — Phase 3A sends leave them `null`, which is correct
- Existing JSONB metadata in `email_sends.metadata` is not removed or altered; the FK columns are purely additive
- Old Phase 3B sends (created before migration `20240026`) have `null` FK columns and continue to work via JSONB fallback

**Guardrails:**
- Phase 3A send path (`phase3bMeta === null`) passes `messageVersionId: null, strategyId: null` — both columns default to `null` for Phase 3A sends
- The `CreateEmailSendInput` extension uses optional fields (`messageVersionId?`) — all existing callers remain valid without modification

**Test coverage:** TC-S01 (FK column populated), TC-S02 (strategy_id FK), TC-S03 (supplementary fields from JSONB), TC-S04 (Phase 3A null), TC-S12 (malformed JSONB with FK present), TC-S09 (existing `extractPhase3bMeta` unchanged), TC-S11 (migration SQL idempotency guards)

---

### 2.2 Event Tracking FK-First Attribution Fallback

**Purpose:** Make Phase 3B Event Tracking attribution in the Resend webhook handler more reliable by reading explicit FK columns first and falling back to JSONB only when FK columns are absent (old sends).

**Major files:**
- `modules/messaging/event-tracking/event-tracking.attribution.ts` — added `EmailSendAttributionFields` interface and `resolvePhase3bAttributionFromSend` pure function
- `app/api/webhooks/resend/route.ts` — expanded `email_sends` select; replaced `isPhase3bSend + extractPhase3bMeta` attribution block with `resolvePhase3bAttributionFromSend`

**Key behavior:**

`resolvePhase3bAttributionFromSend` is a pure function with the following strategy:
1. If `send.message_version_id` is non-null → treat as Phase 3B send; use explicit FK columns for `message_version_id` and `strategy_id`; complement with JSONB metadata for supplementary fields (`quality_review_id`, `version_label`, `composite_score`, `approved_by`, `lead_id`, `send_initiated_by`)
2. If `send.message_version_id` is null → fall back to `extractPhase3bMeta(metadata)` (original behavior)
3. If both are absent/null → return null (Phase 3A send or unattributed)

The webhook handler now selects `message_version_id, strategy_id` from `email_sends` in addition to existing columns.

**What does NOT change:** `extractPhase3bMeta`, `isPhase3bSend`, `buildPhase3bSendMetadata`, `RESEND_EVENT_TO_ET_TYPE`, all ET_ event types, all ET_ payload shapes, Phase 3A exclusion logic.

**Guardrails:**
- Phase 3A sends: `message_version_id = NULL` in the select → `resolvePhase3bAttributionFromSend` falls back to JSONB → `extractPhase3bMeta` returns null → no ET_ event emitted (correct)
- Old JSONB-only Phase 3B sends: `message_version_id = NULL` → JSONB fallback → ET_ event emitted (backward-compatible)
- New Phase 3B sends: `message_version_id` populated → FK-first path → ET_ event emitted (more reliable)

**Test coverage:** TC-S01–S07 (FK-first + fallback + Phase 3A null), TC-S09 (existing `extractPhase3bMeta` unchanged), TC-S12 (malformed JSONB with FK present), Phase 3A unchanged assertions

---

### 2.3 Send Bridge Reconciliation

**Purpose:** Detect and safely recover (where safe) the three stuck states that can result from a partial Send Bridge (SEB) 17-step write sequence failure.

**Major files:**
- `modules/messaging/send-bridge/send-bridge-reconciliation.types.ts`
- `modules/messaging/send-bridge/send-bridge-reconciliation.service.ts`
- `inngest/functions/reconcile-send-bridge-stuck-drafts.ts`

**Stuck state taxonomy:**

| State | Condition | Detection | Resolution |
|-------|-----------|-----------|-----------|
| A | Phase 3B `pending_approval` draft, `approval_request_id = NULL`, > 10 min old | Supabase filter on `email_drafts` | Report-only |
| B | Phase 3B `pending_approval` draft linked to a `pending` `approval_request`, > 10 min old | Two-step query | Report-only |
| C | Phase 3B `approved` draft with `pending`/`pending_approval` siblings for same lead | Two-step query | Auto-fix: `supersedePendingDraftsForLead` |
| E | `pending_approval` draft linked to an `approved` `approval_request` | Existing `reconcileEmailDraftStatus` job | Already handled (no change) |

**Grace period:** 10 minutes. Drafts younger than 10 minutes are ignored to avoid flagging in-progress SEB write sequences.

**State A cause:** SEB Step 11 (INSERT draft) succeeded; Step 12 (INSERT approval_request) or Step 13 (link) failed. The draft is stuck — SEB_011 duplicate guard prevents re-creation. Requires operator investigation.

**State B cause:** SEB Steps 11–13 succeeded; Step 14 (resolve approval_request to `approved`) failed. The draft and approval_request exist and are linked, but the approval_request is still `pending`. The existing `reconcileEmailDraftStatus` job handles State E (approval_request already `approved`, draft not synced); State B is a different case (approval_request still `pending`).

**State C cause:** SEB Steps 11–15 succeeded (draft is `approved`); Step 16 (`supersedePendingDraftsForLead`) failed. Prior pending drafts were not cleaned up. Non-blocking — the reviewer can still send the approved draft — but creates confusing UI state.

**Key behavior:**
- Runs every 15 minutes via Inngest cron (`*/15 * * * *`)
- Per-run result: `{ stateA: { found, reported }, stateB: { found, reported }, stateC: { found, fixed, errors }, ranAt }`
- State C fix uses the existing idempotent `supersedePendingDraftsForLead(tenantId, leadId)` — safe to run twice with no negative effect
- All three states are visible in the Inngest dashboard per run

**Guardrails (enforced in code):**
- Never sends email
- Never creates `email_drafts`
- Never creates `email_sends`
- Never auto-resolves `approval_requests`
- Never reads or writes `message_version` content
- Never calls Resend API
- Never calls `sendApprovedDraftAction`

**Test coverage:** TC-R01 (State A shape), TC-R03 (State B shape), TC-R05 (State C shape), TC-R06 (State C auto-fix increments), TC-R08 (no side-effect fields in result), TC-R11 (idempotency), TC-R12 (empty result), TC-R13/R14 (State A/B found === reported — no auto-fix), guardrail file-content assertion tests

---

### 2.4 Scheduled Learning Agent Run

**Purpose:** Automatically refresh advisory Learning Agent signals for all active tenants daily, eliminating the need for a manual "Run Analysis" click.

**Major file:**
- `inngest/functions/scheduled-learning-agent-run.ts`

**Key behavior:**
- Cron: `0 6 * * *` (daily at 06:00 UTC)
- Tenant enumeration: queries `workspaces` table (`deleted_at IS NULL`), selects first workspace per tenant by stable `id` sort order for execution context
- Per-tenant: calls `runLearningAnalysis({ tenantId, workspaceId, triggeredBy: 'scheduled:inngest', lookbackDays: 90 })`
- `triggeredBy: 'scheduled:inngest'` distinguishes scheduled runs from manual runs in `LA_SIGNALS_COMPUTED` audit events
- Per-tenant error isolation: `try/catch` per tenant step; one tenant failing does not abort others
- `retries: 0` on the Inngest function — a full retry would re-run all tenants; per-tenant errors are already caught
- Returns: `{ tenantsProcessed, tenantsWithData, tenantsWithError, results[] }` — visible in Inngest dashboard

**What does NOT change:**
- `runLearningAnalysis` service logic, signal math, confidence thresholds — identical to manual run
- `RunAnalysisButton` and `runLearningAnalysisAction` server action — manual trigger unchanged
- `learning_snapshots.advisory = true` DB constraint — enforced identically for scheduled and manual runs

**Workspace ID note:** The `workspaceId` passed to `runLearningAnalysis` for scheduled runs is execution context for the `learning_snapshots.workspace_id` column — not a signal dimension. Learning signals are tenant-scoped, not workspace-scoped.

**Guardrails:**
- Advisory-only: `runLearningAnalysis` is unchanged; all existing LA guardrails apply
- No strategy updates, no QRA updates, no message copy changes, no sends, no Resend calls
- Cross-tenant isolation: each tenant's run is independent; no cross-tenant data sharing

**Test coverage:** TC-L07 (per-tenant error counted in result), TC-L11 (sentinel value specification), TC-L12 (result shape), schedule assertion test (`0 6 * * *` in file content), sentinel assertion (`'scheduled:inngest'` in file content), guardrail file-content check (no Resend calls in scheduled function)

---

### 2.5 Operational Health Card

**Purpose:** Provide read-only operational visibility in the agent monitor so an operator can detect issues (stuck drafts, failed sends, stale Learning Agent) without requiring direct database access.

**Major files:**
- `modules/messaging/repositories/operational-health.repo.ts`
- `app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx` (extended)

**Repo functions:**

| Function | Source table | What it returns |
|----------|-------------|----------------|
| `getSebStuckDraftCounts(tenantId)` | `email_drafts`, `approval_requests` | `{ stateA: number, stateB: number }` — same logic as reconciler detection |
| `getFailedSendCount(tenantId)` | `email_sends` | `{ count, windowHours: 24 }` — failed sends in last 24 hours |
| `getLatestLaRunStatus(tenantId)` | `activity_events` | `{ computedAt, snapshotCount, totalSends, ok }` or null |

All three functions: read-only, tenant-scoped, service client, non-fatal (callers wrap in try/catch).

**Card layout:** Positioned between System Controls and Learning Signals in the agent monitor page.

**Card contents:**
- **Stuck Phase 3B Drafts** — State A (no approval link) and State B (pending approval) counts; yellow badge if > 0; advisory note
- **Failed Sends (last 24h)** — count; yellow badge if > 0
- **Learning Agent Last Run** — timestamp, snapshot count, total sends, Completed/Failed badge
- **Advisory disclaimer** — "All indicators above are informational only. No automatic action is taken."

**Guardrails:**
- No action buttons — the card is read-only
- All loading non-fatal — a query failure shows "Unable to load" without breaking the rest of the page
- Webhook failure indicator deferred — `webhook_events.processed` flag is not a reliable failure counter; the `processing_error` column addition was deferred to a future migration

**Note on deferred webhook metric:** The design considered surfacing unprocessed webhook counts. After analysis, `webhook_events` rows are marked `processed = true` after the handler runs (even when the handler catches exceptions). The flag is therefore not a reliable failure indicator. A dedicated `processing_error` column would be required, adding migration `20240027`. This was deferred from Phase 3B.1 to keep scope clean.

**Test coverage:** TC-M01/M02 (SebStuckDraftCounts shape), TC-M03/M04 (FailedSendMetrics shape), TC-M05 (ok=true for LA_SIGNALS_COMPUTED), TC-M06 (ok=false for LA_SIGNALS_COMPUTATION_FAILED)

---

### 2.6 Phase 3B.1 Test Suite

**File:** `tests/phase-3b1-stabilization.test.ts`

**Test count:** 56

**Coverage areas:**

| Area | Tests |
|------|-------|
| `resolvePhase3bAttributionFromSend` — FK-first path | 3 |
| `resolvePhase3bAttributionFromSend` — Phase 3A null | 2 |
| `resolvePhase3bAttributionFromSend` — JSONB fallback | 2 |
| `resolvePhase3bAttributionFromSend` — malformed JSONB with FK | 1 |
| `extractPhase3bMeta` and `isPhase3bSend` unchanged behavior | 4 |
| `EmailSendAttributionFields` interface shape | 2 |
| `RESEND_EVENT_TO_ET_TYPE` map unchanged | 2 |
| SEB reconciliation types — shape validation | 4 |
| SEB reconciliation — State A/B report-only guardrail | 3 |
| SEB reconciliation — State C auto-fix and idempotency | 2 |
| SEB reconciliation — no side-effect fields in result | 1 |
| Scheduled LA — sentinel and result shape | 3 |
| Operational Health — SebStuckDraftCounts shape | 2 |
| Operational Health — FailedSendMetrics shape | 2 |
| Operational Health — LatestLaRunStatus shape | 3 |
| Advisory flag preserved in Learning Agent types | 1 |
| Phase 3A unaffected | 2 |
| Migration SQL — ON DELETE SET NULL, indexes, no NOT NULL, no backfill, IF NOT EXISTS | 8 |
| Inngest schedule — cron strings and sentinel | 3 |
| Guardrail file-content — reconciler | 2 |
| Guardrail file-content — scheduled LA | 2 |

**Approach:** Pure function tests (no DB dependency), type-level shape assertions, and `fs.readFileSync`-based file-content assertions for migration SQL, Inngest schedule strings, and guardrail code checks.

---

## 3. Database / Migration Summary

### 3.1 Migration File

**File:** `supabase/migrations/20240026_phase3b1_email_sends_attribution.sql`

```sql
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS message_version_id uuid
    REFERENCES message_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS strategy_id uuid
    REFERENCES message_strategies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_sends_message_version
  ON email_sends(message_version_id)
  WHERE message_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_sends_strategy
  ON email_sends(strategy_id)
  WHERE strategy_id IS NOT NULL;
```

### 3.2 Column Properties

| Property | `message_version_id` | `strategy_id` |
|----------|---------------------|--------------|
| Type | `uuid` | `uuid` |
| Nullable | Yes | Yes |
| Default | None (implicit null) | None (implicit null) |
| FK target | `message_versions(id)` | `message_strategies(id)` |
| FK behavior | `ON DELETE SET NULL` | `ON DELETE SET NULL` |
| Index | Partial (`WHERE IS NOT NULL`) | Partial (`WHERE IS NOT NULL`) |
| `NOT NULL` constraint | No | No |
| Backfill | No | No |

### 3.3 Backward Compatibility

| Scenario | message_version_id | strategy_id | metadata JSONB | Behavior |
|----------|-------------------|-------------|---------------|---------|
| New Phase 3B send (post-migration) | Populated (UUID) | Populated (UUID) | Populated | FK-first attribution at webhook time |
| Old Phase 3B send (pre-migration) | NULL | NULL | Populated | JSONB fallback attribution at webhook time |
| Phase 3A template send | NULL | NULL | Phase 3A fields only | No ET_ event emitted (correct) |

**`email_sends.metadata` is never removed or altered.** The FK columns are purely additive. Old sends retain full JSONB attribution and continue to produce ET_ events via the fallback path.

### 3.4 `types/database.ts` Update

`types/database.ts` is maintained in-repo. Updated manually (Approach A from the implementation plan) to add `message_version_id: string | null` and `strategy_id: string | null` to `email_sends.Row`, `email_sends.Insert` (as optional), `email_sends.Update` (as optional), and two FK relationship entries to `email_sends.Relationships`. No `supabase gen types` CLI run required.

---

## 4. Attribution Flow After Phase 3B.1

The Phase 3B provenance chain is unchanged end-to-end, with one additive layer:

```
1. Send Bridge creates email_draft
   └── email_drafts.ai_generation_metadata = {
         source: 'phase_3b_send_bridge',
         message_version_id, strategy_id, quality_review_id,
         version_label, composite_score, approved_by, ...
       }

2. Reviewer clicks Send → sendApprovedDraft() in email-send.service.ts
   └── Reads ai_generation_metadata from draft
   └── extractPhase3bMeta() → EtPhase3bMeta | null
   └── If Phase 3B send:
       - buildPhase3bSendMetadata() → copies all fields into email_sends.metadata
       - createEmailSend() → writes email_sends with:
           metadata:           { source, message_version_id, strategy_id, ... }   (JSONB — unchanged)
           message_version_id: phase3bMeta.message_version_id                     (FK — Phase 3B.1 new)
           strategy_id:        phase3bMeta.strategy_id                             (FK — Phase 3B.1 new)
   └── If Phase 3A send (phase3bMeta is null):
       - metadata: { template_used, ... }  (no source field)
       - message_version_id: null
       - strategy_id: null

3. Resend fires webhook → app/api/webhooks/resend/route.ts
   └── processResendEvent() selects email_send including:
       id, tenant_id, workspace_id, contact_id, company_id,
       draft_id, metadata, status, message_version_id, strategy_id
   └── resolvePhase3bAttributionFromSend({ message_version_id, strategy_id, metadata })
       ├── If message_version_id IS NOT NULL (new send):
       │     → FK-first path: returns meta using FK columns + JSONB for supplementary fields
       │     → ET_ event emitted with reliable entity_id = message_version_id
       ├── If message_version_id IS NULL, metadata has source = 'phase_3b_send_bridge' (old send):
       │     → JSONB fallback: extractPhase3bMeta(metadata) returns meta
       │     → ET_ event emitted (backward-compatible)
       └── If message_version_id IS NULL and no phase_3b_send_bridge source:
             → returns null → no ET_ event (Phase 3A sends correctly excluded)

4. Learning Agent (manual or scheduled:inngest)
   └── Reads activity_events where event_type IN (ET_ types, HRB_ACTION_APPROVED)
   └── entity_id (UUID column, indexed) = message_version_id — reliable since Phase 3B Foundation
   └── attribution chain is unchanged; FK columns on email_sends are not read by Learning Agent
```

---

## 5. Send Bridge Reconciliation Summary

### 5.1 State Classification

The Send Bridge (SEB) writes across 17 sequential steps. A crash between steps 11–16 can leave data in a partially-settled state. The reconciler classifies and handles three resulting states:

**State A — Draft with no approval_request link**
- Observable: `email_drafts.status = 'pending_approval'`, `approval_request_id IS NULL`, `ai_generation_metadata->>source = 'phase_3b_send_bridge'`, `created_at < now() - 10 min`
- Cause: Step 11 (INSERT draft) succeeded; Step 12 (INSERT approval_request) or Step 13 (link) failed
- Impact: Reviewer cannot send the draft (Phase 3A double-gate fails). SEB_011 prevents re-creation.
- Resolution: **Report-only.** Requires operator investigation. Fix: delete stuck draft (allows re-creation) or manually link an approval_request.

**State B — Draft linked to a pending approval_request**
- Observable: `email_drafts.status = 'pending_approval'`, `approval_request_id IS NOT NULL → approval_requests.status = 'pending'`, Phase 3B source, `created_at < now() - 10 min`
- Cause: Step 13 (link) succeeded; Step 14 (resolve approval_request to `approved`) failed
- Impact: Draft stuck. SEB_011 prevents re-creation.
- Resolution: **Report-only.** Auto-resolving approval_requests autonomously is a guardrail violation risk. Requires operator investigation.
- Note: The existing `reconcileEmailDraftStatus` handles State E (approval_request already `approved`, draft not yet synced) — that is a different case and continues to be handled by the existing job unchanged.

**State C — Approved draft with unsuperseded pending siblings**
- Observable: `email_drafts.status = 'approved'` (Phase 3B), AND same `lead_id` has `status IN ('pending', 'pending_approval')` siblings with `deleted_at IS NULL`
- Cause: Steps 11–15 succeeded (draft is `approved`); Step 16 (`supersedePendingDraftsForLead`) failed
- Impact: Non-blocking — reviewer can still send the approved draft. Cosmetic: UI may show multiple active drafts for the lead.
- Resolution: **Auto-fixed.** Calls `supersedePendingDraftsForLead(tenantId, leadId)` — the existing idempotent function. Safe to run twice.

### 5.2 Cron Schedule and Behavior

```
Inngest function: reconcile-send-bridge-stuck-drafts
Schedule: */15 * * * *  (every 15 minutes)
Retries: 1
```

Per-run result logged in Inngest dashboard:
```
{
  stateA: { found: N, reported: N },   // N = count detected; always found === reported (no fix)
  stateB: { found: N, reported: N },   // same
  stateC: { found: N, fixed: N, errors: N },
  ranAt: ISO timestamp
}
```

### 5.3 Guardrails Enforced in Code

```
// From send-bridge-reconciliation.service.ts header comment:
//   - Never sends email
//   - Never creates email_drafts
//   - Never creates email_sends
//   - Never auto-resolves approval_requests
//   - Never modifies message_version content
//   - Never calls Resend
```

Verified by guardrail grep pass: zero matches for `resend.emails`, `sendApprovedDraftAction`, `.from('email_drafts').insert`, `.from('email_sends').insert`, `resolveApprovalRequest`, or any write to locked tables in the reconciliation service file.

---

## 6. Scheduled Learning Agent Summary

### 6.1 Schedule and Trigger

```
Inngest function: scheduled-learning-agent-run
Schedule: 0 6 * * *  (daily at 06:00 UTC)
Retries: 0  (per-tenant errors caught individually; full retry would re-run all tenants)
```

The cron time of 06:00 UTC was chosen as off-peak for most usage, ensuring signals are fresh for the business day.

### 6.2 Execution Flow

```
Step 1 — enumerate-active-tenants
  Query: SELECT tenant_id, id FROM workspaces WHERE deleted_at IS NULL
         ORDER BY tenant_id ASC, id ASC
  Result: Map<tenantId, workspaceId> — first workspace per tenant (stable selection)

Step 2 — run-tenant-{tenantId} (one Inngest step per tenant)
  Calls: runLearningAnalysis({
    tenantId,
    workspaceId,             // execution context; not a signal dimension
    triggeredBy: 'scheduled:inngest',
    lookbackDays: 90,
  })
  On success: { ok: true, snapshotCount, totalSends }
  On failure: { ok: false, errorReason } — continues to next tenant

Step 3 — summarize
  Returns: {
    tenantsProcessed, tenantsWithData, tenantsWithError, results[],
  }
```

### 6.3 What Distinguishes Scheduled from Manual Runs

| Field | Manual run | Scheduled run |
|-------|-----------|--------------|
| `triggeredBy` in `LA_SIGNALS_COMPUTED` event | `ctx.userId` (user UUID) | `'scheduled:inngest'` |
| Trigger source | `runLearningAnalysisAction` server action | Inngest cron step |
| `learning_snapshots` content | Identical signal math | Identical signal math |
| `advisory = true` enforcement | Yes (DB constraint) | Yes (DB constraint) |

### 6.4 Manual Run Unchanged

The `RunAnalysisButton.tsx` client component and `runLearningAnalysisAction` server action are unchanged. Manual and scheduled runs call the same `runLearningAnalysis` service. Concurrent runs produce valid, independent `learning_snapshots` rows with different `run_id` values. The UI shows the most recent by `computed_at`.

---

## 7. Operational Health UI Summary

### 7.1 Position and Purpose

The Operational Health card is a new read-only section in `app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx`, positioned between the existing System Controls card and the existing Learning Signals card.

It provides minimal operational visibility without building a full admin product.

### 7.2 Card Contents

```
Section: Operational Health

┌─────────────────────────────────────────────────────────────┐
│ Stuck Phase 3B Drafts                                       │
│   No approval link (State A):  [None | N stuck]            │
│   Pending approval (State B):  [None | N stuck]            │
│   (If > 0): "Stuck drafts cannot be sent until resolved."  │
│                                                             │
│ Failed Sends (last 24h)                                     │
│   [None | N failed]                                         │
│                                                             │
│ Learning Agent Last Run                                     │
│   [timestamp] · [Completed | Failed]                       │
│   "N signals · N sends analysed"  (if Completed)           │
│                                                             │
│ ────────────────────────────────────────────────────────── │
│ All indicators above are informational only.               │
│ No automatic action is taken.                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Data Loading

All three data-loading calls are non-fatal — wrapped in individual try/catch blocks:

```typescript
// All non-fatal in page.tsx:
try { sebStuckCounts = await operationalHealthRepo.getSebStuckDraftCounts(ctx.tenantId) } catch {}
try { failedSendCount = await operationalHealthRepo.getFailedSendCount(ctx.tenantId) } catch {}
try { latestLaRun = await operationalHealthRepo.getLatestLaRunStatus(ctx.tenantId) } catch {}
```

A query failure shows a fallback value (0 counts, null status) without breaking the agent monitor page.

### 7.4 What Is NOT Shown

**Webhook failure count:** Deferred. The `webhook_events.processed` flag is set to `true` after the handler catches exceptions — it is not a reliable failure indicator. Adding a `processing_error` column would require migration `20240027`. This is deferred to Phase 3B.2 or later.

**No action buttons:** The Operational Health card has no buttons that modify pipeline state. Stuck draft resolution requires operator investigation, not UI automation.

---

## 8. QA Summary

### 8.1 Test Breakdown

| Component | Test file | Tests |
|-----------|-----------|-------|
| Message Strategy Agent | `tests/message-strategy.test.ts` | 41 |
| Copywriting Agent | `tests/copywriting-agent.test.ts` | 100 |
| Quality Review Agent | `tests/quality-review-agent.test.ts` | 126 |
| Human Review Bridge | `tests/human-review-bridge.test.ts` | 100 |
| Send Bridge | `tests/send-bridge.test.ts` | 89 |
| Event Tracking | `tests/event-tracking.test.ts` | 81 |
| Learning Agent | `tests/learning-agent.test.ts` | 53 |
| Phase 3B.1 Stabilization | `tests/phase-3b1-stabilization.test.ts` | **56** |
| **Total** | | **646** |

**Previous locked Phase 3B baseline:** 590 / 590
**Phase 3B.1 additions:** 56
**Current baseline:** 646 / 646

### 8.2 Build and TypeScript

| Check | Result |
|-------|--------|
| `npx next build` | PASSED — compiled successfully, 0 errors |
| TypeScript | PASSED — no new errors from `types/database.ts` updates or new files |
| `npx vitest run` | PASSED — 646/646, 0 failures, 0 skipped |

### 8.3 Guardrail Verification

All guardrail grep checks passed on Phase 3B.1 source files:

| Check | Result |
|-------|--------|
| No `resend.emails` / `resend.send` / `await resend.` in reconciler or scheduled functions | PASSED |
| No `sendApprovedDraftAction` in new Phase 3B.1 files | PASSED |
| No `email_sends` INSERT in reconciliation service | PASSED |
| No `email_drafts` INSERT in reconciliation service | PASSED |
| No `resolveApprovalRequest` / `approval_requests.update` in reconciliation service | PASSED |
| No `message_strategies` INSERT or UPDATE in new files | PASSED |
| No `quality_reviews` INSERT or UPDATE in new files | PASSED |
| No `body_text` / `subject_line` writes in new files | PASSED |
| No external LLM calls in new files | PASSED |

### 8.4 Source-Level Test Coverage

Phase 3B.1 includes 15 file-content assertion tests (using `fs.readFileSync`) that verify structural properties of the implementation cannot silently regress:

- Migration SQL: `ON DELETE SET NULL` for both columns, both index names, no `NOT NULL` on `ADD COLUMN` lines, no `UPDATE`/`INSERT` (no backfill), `IF NOT EXISTS` guards
- Inngest cron strings: `'*/15 * * * *'` in reconciler, `'0 6 * * *'` in scheduled LA
- Inngest sentinel: `'scheduled:inngest'` in scheduled LA file
- Reconciler guardrails: no `resolveApprovalRequest`, no `email_sends` insert
- Scheduled LA guardrails: no `resend.emails`, no `email_drafts`/`email_sends` insert

---

## 9. Guardrails Locked

All Phase 3B guardrails remain in force. Phase 3B.1 adds the following additional locked guardrails:

| Guardrail | Scope |
|-----------|-------|
| SEB reconciler must never auto-resolve `approval_requests` | States A and B are report-only; no approval_request writes |
| SEB reconciler must never create `email_drafts` | Read-only except State C (supersede existing pending drafts) |
| SEB reconciler must never create `email_sends` | `email_sends` created only by the Phase 3A send flow |
| SEB reconciler must never call Resend or `sendApprovedDraftAction` | Reconciler is diagnostic; no send triggering |
| SEB reconciler must never modify `message_version` content | Copy is immutable |
| Scheduled Learning Agent must remain advisory-only | Same `runLearningAnalysis` service; same `advisory = true` DB constraint |
| Scheduled Learning Agent must not change strategy parameters | No MSA/QRA writes; advisory observation only |
| Operational Health card must have no action buttons | Read-only UI; no pipeline state modifications |
| JSONB metadata in `email_sends` must not be removed | FK columns are additive; old sends use JSONB fallback |
| Phase 3A template send behavior must remain unchanged | FK columns default to null; `resolvePhase3bAttributionFromSend` returns null |
| No active learning introduced | No `message_strategy` weight updates or selection changes |
| No external LLM calls | All Phase 3B.1 code is deterministic |

---

## 10. Known Limitations / Deferred Work

These are honest limitations of the Phase 3B.1 Foundation. They do not prevent it from being locked; they inform what Phase 3B.2 should address.

| Limitation | Notes |
|-----------|-------|
| Webhook failure visibility deferred | `webhook_events.processed` flag is not a reliable failure counter; `processing_error` column addition (migration `20240027`) deferred to Phase 3B.2 |
| State A and B are report-only, not auto-fixed | Resolving stuck approval_requests autonomously requires human judgment; operator must investigate |
| No backfill of older `email_sends` FK columns | Pre-migration Phase 3B sends have `null` FK columns; JSONB fallback covers them correctly |
| Scheduled Learning Agent uses one workspace per tenant | Execution context only; not a signal dimension. Future: make `workspaceId` nullable in `runLearningAnalysis` |
| No active learning / strategy weighting | Advisory signals only; future Phase 3C requires separately approved design |
| No reply tracking | Inbound email infrastructure not built |
| No revenue conversion tracking | Conversion event not defined |
| No richer Learning Agent dashboard | Signal trends over time, run history comparison, per-strategy drill-down deferred |
| `email_sends` FK backfill for old records | Low priority; JSONB fallback is correct and complete for old records |

---

## 11. Final Lock Criteria

Phase 3B.1 is ready to be locked as a stable hardening layer. The following checklist confirms all acceptance criteria are met:

| Criterion | Status |
|-----------|--------|
| Phase 3B.1 Design & Test Cases v1.0 committed and locked | ✓ `docs/roadmap/phase-3b1-stabilization-hardening-design-test-cases.md` |
| Phase 3B.1 Implementation Plan v1.0 committed and locked | ✓ `docs/roadmap/phase-3b1-stabilization-hardening-implementation-plan.md` |
| Implementation committed and tagged | ✓ `0af660e`, tag `phase-3b1-stabilization-v1` |
| AI Context Recovery Pack updated | ✓ All 6 `docs/ai-context/` files updated |
| Migration `20240026` created with correct schema | ✓ `ON DELETE SET NULL`, partial indexes, `IF NOT EXISTS`, no backfill |
| `types/database.ts` updated with new `email_sends` columns | ✓ Row/Insert/Update/Relationships updated |
| `email-send.repo.ts` extended with FK fields | ✓ Optional `messageVersionId?` and `strategyId?` in `CreateEmailSendInput` |
| `email-send.service.ts` populates FK fields for Phase 3B sends | ✓ Phase 3A sends leave both null |
| `resolvePhase3bAttributionFromSend` added — FK-first, JSONB fallback | ✓ Pure function, no I/O |
| Webhook handler uses FK-first attribution | ✓ Select expanded; `resolvePhase3bAttributionFromSend` used |
| Old JSONB-only Phase 3B sends still produce ET_ events | ✓ JSONB fallback path verified by test TC-S06 |
| Phase 3A sends remain excluded from ET_ events | ✓ `resolvePhase3bAttributionFromSend` returns null for Phase 3A |
| SEB reconciliation types and service created | ✓ `send-bridge-reconciliation.types.ts`, `.service.ts` |
| State A and B detected — report-only | ✓ `found === reported` in result |
| State C auto-fixed via idempotent `supersedePendingDraftsForLead` | ✓ Only write in reconciler |
| SEB reconciler Inngest function registered — `*/15 * * * *` | ✓ In `inngest/index.ts` (8 functions total) |
| Scheduled Learning Agent Inngest function registered — `0 6 * * *` | ✓ In `inngest/index.ts` |
| `triggeredBy: 'scheduled:inngest'` sentinel in scheduled function | ✓ Distinguishable in audit trail |
| Per-tenant error isolation in scheduled function | ✓ try/catch per tenant step |
| `operational-health.repo.ts` created — read-only, tenant-scoped | ✓ 3 query functions |
| Operational Health card added to agent monitor | ✓ Non-fatal loading, advisory disclaimer, no action buttons |
| `npx vitest run` → 646/646, 0 failures | ✓ PASSED |
| `npx next build` → 0 errors | ✓ PASSED |
| TypeScript → 0 errors | ✓ PASSED |
| Guardrail grep pass — 9 checks | ✓ PASSED |
| Next phase identified | ✓ Phase 3B.1 Final QA / Lock Report / Closeout → this document |

**Verdict: Phase 3B.1 Foundation is complete. All 25 acceptance criteria are met. Phase 3B.1 may be locked.**

---

## 12. Recommended Next Phase Options

The following directions are available after Phase 3B.1 is locked.

### Option A — Phase 3B.2 Production Monitoring / Admin Tooling

**What:** Address deferred monitoring items:
- Add `processing_error` column to `webhook_events` (migration `20240027`) for reliable webhook failure counting
- Surface webhook failure count in the Operational Health card
- Add State A/B stuck draft admin resolution UI (view details, trigger investigation)
- Add Learning Agent run history UI (compare runs over time)
- Add Inngest webhook alerting configuration for SEB reconciler and scheduled LA failures

**Why now:** Operational tooling gaps become more visible as send volume grows. Completing monitoring before active learning reduces operational risk.

**Effort:** Low to medium — primarily a migration, repo extension, and UI additions.

### Option B — UI/UX Polish for Message Workspace and Agent Monitor

**What:**
- Message workspace version card layout improvements (strategy context panel, version comparison view)
- Learning Agent signal trends over time (run history navigation, per-strategy drill-down)
- Insufficient data empty states for new tenants
- Advisory alert configuration (tenant-configurable bounce/complaint thresholds)

**Why now:** The pipeline is technically complete and stable. UI polish directly improves reviewer adoption and trust in agent-generated content.

**Effort:** Low to medium — primarily front-end work with no schema changes.

### Option C — Phase 3C Active Learning Design

**What:** Begin the separately approved design for allowing the Message Strategy Agent to soft-bias future decisions based on high-confidence Learning Agent signals.

**Important:** This requires a full design-and-approval cycle before any code is written. No active learning may be introduced without a locked implementation plan.

**Effort:** Large — design document, implementation plan, and careful implementation. Not to be started without explicit scope.

### Option D — Production Deployment Checklist / Environment Validation

**What:** Prepare Phase 3B and Phase 3B.1 for production:
- Inngest production key configuration and cron registration
- Supabase migration application to production (`20240022`–`20240026`)
- Resend webhook secret configuration
- RLS policy validation
- Load test for `activity_events` query volume at scale

**Why now:** Phase 3B.1 introduced two new Inngest functions that require production registration. The migration sequence must be applied to production before the new FK columns are available.

**Effort:** Medium — primarily infrastructure and ops work; no new feature code.

---

## 13. Final Recommendation

### Lock Phase 3B.1 Foundation

Phase 3B.1 Stabilization / Hardening Foundation is complete, verified, and ready to lock. All 25 acceptance criteria are met. No outstanding code changes, failed tests, or missing deliverables prevent the lock.

**Recommended action:** Review this document and mark Phase 3B.1 as locked. Do not begin any new features or active learning design until this report is reviewed and the lock is confirmed.

### Immediate Next Step Recommendation

**Phase 3B.2 Production Monitoring / Admin Tooling (Option A)** is the recommended immediate next step, with the highest-priority items:

1. Add `processing_error` to `webhook_events` — closes the only remaining monitoring gap from Phase 3B.1
2. Surface webhook failure count in the Operational Health card
3. Validate production Inngest configuration and cron registration for both new Phase 3B.1 functions

Alternatively, **Option D (Production Deployment Checklist)** is the right next step if Phase 3B is being deployed to production for the first time — migration application, environment configuration, and Inngest registration all need to happen before the scheduled Learning Agent and SEB reconciler can run in production.

**Before Phase 3C (Active Learning):** A full design-and-approval cycle is required. No code changes to strategy selection or QRA weighting logic may be made without a locked implementation plan approved by the user.

---

*Document status: Final draft — awaiting user review and approval before Phase 3B.1 is formally locked.*
*Version: 1.0 — 2026-05-22*
