# 07 — Next Steps

## Completed — Quality Review Agent Foundation v1.1

Closed. All deliverables committed and tagged. See `06_GIT_MILESTONES.md` for details.

## Completed — Human Review / Approval Bridge Foundation v1.0

All deliverables committed, tagged, and QA-verified.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked |
| Implementation Plan v1.0 | Locked |
| Code implementation | Complete — `ea3342c`, tag `phase-3b-human-review-bridge-v1` |
| QA: 367/367 tests, build, TypeScript | PASSED |

## Completed — Send / Email Draft Bridge Foundation v1.0

All deliverables committed, tagged, and QA-verified.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.1 | Locked (`docs/roadmap/phase-3b-send-email-draft-bridge-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-send-email-draft-bridge-implementation-plan.md`) |
| Code implementation | Complete — `fd8a4fb`, tag `phase-3b-send-bridge-v1` |
| QA: 456/456 tests, build, TypeScript | PASSED |

### What was delivered

- `send-bridge.types.ts` — SEB_ERROR_CODES (SEB_001–SEB_014), SEB_ACTION_TYPES, all interfaces
- `send-bridge.validation.ts` — `validateDraftCreationEligibility` (14 gates, pure function)
- `send-bridge.audit.ts` — `buildDraftCreatedPayload`, `buildDraftCreationBlockedPayload` (pure functions)
- `send-bridge.service.ts` — `createEmailDraftFromApprovedVersion` (17-step write flow), `getDraftStatusForVersion`
- `send-bridge.actions.ts` — `createEmailDraftFromApprovedVersionAction`
- `email-draft.repo.ts` extended with `getEmailDraftForVersion` (duplicate guard)
- `types.agent.ts` extended with 2 SEB event types (additive)
- `GeneratedVersionsPanel.tsx` extended: "Create Email Draft" button, confirmation modal, draft status indicators
- `page.tsx` extended: draft status loading for approved versions
- 35 SEB test fixtures + 89-test suite

### Key behavior

The reviewer clicks **"Create Email Draft"** on an approved version card. The bridge:
1. Validates 14 gate conditions (no writes if any fail)
2. Creates `email_draft` as `pending_approval`
3. Creates `approval_request` as `pending`
4. Links `approval_request_id` to the draft
5. Auto-resolves `approval_request` to `approved` (HRB approval is the human gate)
6. Syncs `email_draft.status` to `approved`
7. Supersedes prior pending drafts for the lead (runs last)
8. Emits `SEB_ACTION_DRAFT_CREATED` activity event

The draft is immediately sendable via the existing `sendApprovedDraftAction`. No second approval step. No auto-send.

## Completed — Event Tracking / Send Outcome Tracking Foundation v1.0

All deliverables committed, tagged, and QA-verified.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b-event-tracking-send-outcome-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-event-tracking-send-outcome-implementation-plan.md`) |
| Code implementation | Complete — `28db22a`, tag `phase-3b-event-tracking-v1` |
| QA: 537/537 tests, build, TypeScript | PASSED |

### What was delivered

- `event-tracking.types.ts` — `ET_ACTION_TYPES` (9 constants), `EtPhase3bMeta`, payload interfaces
- `event-tracking.attribution.ts` — `extractPhase3bMeta`, `isPhase3bSend`, `buildPhase3bSendMetadata`, `RESEND_EVENT_TO_ET_TYPE`
- `event-tracking.audit.ts` — 4 pure payload builders for all ET_ event types
- `email-send.service.ts` extended: Phase 3B metadata enrichment into `email_sends.metadata`; `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` (all non-fatal)
- `email-send.repo.ts` extended: `getSendStatusForDraft` read helper
- `types.agent.ts` extended: 9 ET_ ActivityEventType constants (additive)
- `route.ts` extended: `email_sends` select expanded; Phase 3B activity event block after `23505` guard
- `page.tsx` extended: `sendStatusByDraftId` loading for sent versions
- `GeneratedVersionsPanel.tsx` extended: delivery status badges
- 35 ET fixtures + 81-test suite

### Key behavior

- Phase 3B provenance (`message_version_id`, `strategy_id`, `quality_review_id`) is copied into `email_sends.metadata` at send time when `metadata.source === 'phase_3b_send_bridge'`
- Internal events (`ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED`) emitted by `email-send.service.ts`
- Webhook events attributed back to Phase 3B context for Phase 3B-originated sends only; Phase 3A template sends unaffected
- `email.delivery_delayed` remains log-only — no activity event
- Duplicate webhook idempotency: Phase 3B block runs only after the existing `23505` early return
- All activity event calls non-fatal (`.catch(() => {})`) — never blocks a send
- Message workspace now shows: Sent / Delivered / Bounced / Complaint / Send Failed per approved version card

## Completed — Learning Agent Foundation v1.0

All deliverables committed, tagged, and QA-verified.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b-learning-agent-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b-learning-agent-implementation-plan.md`) |
| Code implementation | Complete — `44ea577`, tag `phase-3b-learning-agent-v1` |
| QA: 590/590 tests, build, TypeScript | PASSED |

### What was delivered

- `supabase/migrations/20240025_phase3b_learning_snapshots.sql` — `learning_snapshots` table with `advisory = true` DB constraint, 10 signal names, 6 dimension values, partial unique index on `(tenant_id, run_id, signal_name, dimension, dimension_value) WHERE deleted_at IS NULL`
- `learning-agent.types.ts` — `LA_SIGNAL_NAMES` (10), `LA_DIMENSIONS` (6), `LA_CONFIDENCE` (4), `LA_ACTION_TYPES` (2), threshold constants, all interfaces
- `learning-agent.confidence.ts` — `classifyConfidence`, `calculateRate`, `isEngagementSignal`, `getThresholds`
- `learning-agent.signals.ts` — `buildVersionEventMap`, `calculateAllSignals`, 10 signals × 6 dimensions, pure functions
- `learning-agent.audit.ts` — `buildSignalsComputedPayload`, `buildSignalsFailedPayload`
- `learning-agent.service.ts` — `runLearningAnalysis` (9-step orchestration)
- `learning-snapshot.repo.ts` — `writeSnapshots`, read functions, `loadPhase3bActivityEvents`, `loadVersionDimensions`
- `learning-agent.actions.ts` — server action: `runLearningAnalysisAction`
- `types.agent.ts` extended: `LA_SIGNALS_COMPUTED`, `LA_SIGNALS_COMPUTATION_FAILED` (additive)
- `agent-monitor/page.tsx` extended: learning snapshots loader, Learning Signals table, advisory alert display
- `RunAnalysisButton.tsx` — new client component: "Run Learning Analysis" button with loading state
- 42 LA fixtures + 53-test suite

### Key behavior

- On-demand trigger from agent monitor settings page
- Reads Phase 3B ET_ activity events (filtered by `metadata.source === 'phase_3b_send_bridge'`) for send/outcome signals
- Reads `HRB_ACTION_APPROVED` events (by event_type only) for `approval_to_send_rate` denominator
- Loads `message_versions` and `quality_reviews` for dimension context (strategy_angle, message_type, score_band, is_recommended)
- 90-day lookback window hardcoded in v1
- Writes one `learning_snapshots` row per signal × dimension × dimension_value per run
- All rows are advisory — enforced at code and DB level
- Emits `LA_SIGNALS_COMPUTED` or `LA_SIGNALS_COMPUTATION_FAILED` per run (non-fatal)
- Agent monitor page displays a read-only learning signals table with advisory alert banners for high complaint/bounce rates

## Phase 3B Revenue Learning Engine — Foundation Complete

**The Phase 3B outbound intelligence loop is foundation-complete.** All seven layers are implemented, committed, tagged, and QA-verified:

| Layer | Tag |
|-------|-----|
| Message Strategy Agent | `phase-3b-message-strategy-agent-v1` |
| Copywriting Agent | `phase-3b-copywriting-agent-v1` |
| Quality Review Agent | `phase-3b-quality-review-agent-v1.1` |
| Human Review / Approval Bridge | `phase-3b-human-review-bridge-v1` |
| Send / Email Draft Bridge | `phase-3b-send-bridge-v1` |
| Event Tracking / Send Outcome Tracking | `phase-3b-event-tracking-v1` |
| Learning Agent | `phase-3b-learning-agent-v1` |

## Completed — Phase 3B.1 Stabilization / Hardening Foundation v1.0

All deliverables committed, tagged, and QA-verified.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b1-stabilization-hardening-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b1-stabilization-hardening-implementation-plan.md`) |
| Code implementation | Complete — `0af660e`, tag `phase-3b1-stabilization-v1` |
| QA: 646/646 tests, build, TypeScript | PASSED |

### What was delivered

- `supabase/migrations/20240026_phase3b1_email_sends_attribution.sql` — `message_version_id` and `strategy_id` FK columns (nullable, `ON DELETE SET NULL`) + partial indexes on `email_sends`
- `types/database.ts` — updated with new `email_sends` columns in Row/Insert/Update/Relationships
- `email-send.repo.ts` — `CreateEmailSendInput` extended; both new FK fields included in INSERT
- `email-send.service.ts` — populates FK fields from `phase3bMeta` at send time; Phase 3A sends default to null
- `event-tracking.attribution.ts` — `EmailSendAttributionFields` interface + `resolvePhase3bAttributionFromSend` (FK-first, JSONB fallback)
- `app/api/webhooks/resend/route.ts` — webhook handler select expanded; Phase 3B block uses FK-first attribution
- `send-bridge-reconciliation.types.ts` — stuck state types and `SebReconciliationResult`
- `send-bridge-reconciliation.service.ts` — `runSebReconciliation`: State A/B report-only; State C auto-fixed via `supersedePendingDraftsForLead`
- `reconcile-send-bridge-stuck-drafts.ts` — Inngest function `*/15 * * * *`
- `scheduled-learning-agent-run.ts` — Inngest function `0 6 * * *`; `triggeredBy: 'scheduled:inngest'`; per-tenant, continues on individual failure
- `inngest/index.ts` — both new functions registered (8 total)
- `operational-health.repo.ts` — `getSebStuckDraftCounts`, `getFailedSendCount`, `getLatestLaRunStatus`
- `agent-monitor/page.tsx` — Operational Health card added (stuck drafts, failed sends last 24h, LA run status; advisory disclaimer; no action buttons)
- `tests/phase-3b1-stabilization.test.ts` — 56 tests

### Key behavior

- New Phase 3B sends have `email_sends.message_version_id` and `strategy_id` populated; old sends use JSONB fallback
- Webhook handler is FK-first; old JSONB-only Phase 3B sends continue to emit ET_ events via fallback
- State C stuck drafts (approved Phase 3B draft + unsuperseded pending siblings) are auto-fixed nightly by the SEB reconciler
- State A and State B stuck drafts are reported-only and visible in the Operational Health card
- Learning Agent runs daily at 06:00 UTC without requiring manual trigger; manual trigger still works
- Operational Health card in agent monitor surfaces stuck drafts, failed sends, and LA run status — advisory, no auto-action

## Completed — Phase 3B.2 Data Import Foundation v1.0

All deliverables committed, tagged, and QA-verified.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3b2-data-import-foundation-design.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3b2-data-import-foundation-implementation-plan.md`) |
| Code implementation | Complete — `6a39849`, tag `phase-3b2-data-import-foundation-v1` |
| QA: 802/802 tests, build, TypeScript, guardrails | PASSED |

### What was delivered

- Three-layer import pipeline: Source → Staging (import_batches/import_rows) → CRM Commit
- Parser: CSV (PapaParse, skipEmptyLines:'greedy') and XLSX (xlsx ESM namespace import); server-only guard
- Column mapping: case-insensitive alias detection from ~50 IMPORT_FIELD_ALIASES; validateMapping
- Normalization: email, phone, website (domain extraction), state (→ 2-letter abbr), postal code, name
- Validation: RFC 5322 email, phone length warning, required fields (company_name)
- Dedupe: email, phone, domain, name+city, externalId, within-batch; runs in parallel
- Commit: upsertCompany → insertContact (if contact data) → insertLead (status='imported_unreviewed', workflow_enabled=false); writes ONLY to companies/contacts/leads
- Orchestration: sync (≤1000 rows inline) and async (>1000 rows → Inngest `import/batch.approved` event)
- Inngest function `process-import-batch`: 2-arg v4 createFunction form, retries: 1
- 9 server actions: createImportBatchAction, approveAndCommitAction, cancelImportBatchAction, getImportBatchDetailAction, listImportBatchesAction
- Admin UI: 3 pages (list, new, detail) + 2 client components; Imports nav link in Sidebar
- 69 test fixtures + 156 tests; all 6 guardrails clean

### Guardrail verification (all PASS)

- No Resend calls in import module or process-import-batch.ts
- No sendApprovedDraftAction references in import module
- No message_strategies/message_versions/quality_reviews writes in import module
- No external LLM calls in import module
- `metadata.workflow_enabled = false` present in import.commit.ts insertLead

## Completed — Phase 3C.2 Structured Error Lifecycle Actions v1.0

All deliverables committed, tagged, and staging-smoke-tested.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3c2-structured-error-lifecycle-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3c2-structured-error-lifecycle-implementation-plan.md`) |
| Code implementation | Complete — `b5ab433`, tag `phase-3c2-structured-error-lifecycle-v1` |
| QA: 903/903 tests, build, TypeScript | PASSED |
| Manual staging smoke | PASSED — login, workspace, page load confirmed |

### What was delivered

- `structured-error.actions.ts` — four `'use server'` actions: `resolveErrorAction`, `investigateErrorAction`, `ignoreErrorAction`, `dismissRecommendationAction`
- `structured-error.repo.ts` — added `updateErrorStatus()` and `dismissRecommendation()`
- `structured-error.service.ts` — added `investigateError()` and `ignoreError()`
- `types.agent.ts` — added 4 ActivityEventType constants: `SE_ERROR_RESOLVED`, `SE_ERROR_INVESTIGATING`, `SE_ERROR_IGNORED`, `SE_REC_DISMISSED`
- `import.service.ts` — `commitBatch()` emits `IMPORT_COMMIT_FAILURE` structured error non-fatally on catastrophic failure; re-throws
- `process-import-batch.ts` — Inngest handler emits `INNGEST_IMPORT_BATCH_FAILURE` structured error non-fatally; re-throws
- `system-intelligence/page.tsx` — Resolve / Investigate / Ignore buttons in errors table; Dismiss button in recommendations table; page remains a server component
- `tests/phase3c-system-intelligence.test.ts` — 24 new test cases appended

---

## Completed — Track A Deployment Flow Cleanup

All deliverables complete and verified.

| Deliverable | Status |
|-------------|--------|
| Design (`docs/roadmap/deployment-flow-cleanup-design.md`) | Locked — `bdd6b00` |
| Implementation Plan Option C (`docs/roadmap/deployment-flow-cleanup-option-c-implementation-plan.md`) | Locked — `b29093d` |
| Vercel setting change — `verian-bios` Git disconnected | Complete — 2026-05-26 |
| Verification test push `cbfb790` | Complete — staging deployed ✓, production did not ✓ |
| Final report (`docs/roadmap/deployment-flow-cleanup-final-report.md`) | Locked |
| AI context updated | Complete |

### What was delivered

- `verian-bios` production Vercel project Git connection disconnected (Option C).
- `verian-bios-staging` continues to auto-deploy from `origin/master` — unchanged.
- Production deploys are now explicit and manual via `vercel --prod` or Vercel dashboard.
- No code changed. No migrations created. No Supabase touched.

## Completed — Phase 3C.6 System Intelligence Wrap-Up v1.0

All deliverables committed, tagged, and staging-smoke-tested.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3c6-system-intelligence-wrap-up-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3c6-implementation-plan.md`) |
| Code implementation | Complete — `9a32d3c`, tag `phase-3c6-system-intelligence-wrap-up-v1` |
| QA: 987/987 tests, build, TypeScript | PASSED |
| Manual staging smoke | PASSED — login ✓, workspace ✓, System Intelligence page ✓, Pending Recommendations ✓, Generate Recommendations ✓ |

### What was delivered

**Part A — `resolved_by` Attribution:**
- `structured-error.repo.ts` — `resolveStructuredError` now accepts optional `resolvedBy?: string | null` and writes `resolved_by: resolvedBy ?? null` in the UPDATE
- `structured-error.service.ts` — `resolveError` now passes `ctx.userId` as third argument; `ignoreError` and `investigateError` unchanged; `dismissRecommendationAction` unaffected
- No migration — `resolved_by` column already existed in `automation_failures` (Phase 3C.1, migration `20240028`)

**Part B — `SYSTEM_PERFORMANCE_WARNING` Recommendation:**
- `system-recommendation.types.ts` — `OUTBOX_QUEUE_DEPTH_MIN: 10` added to `REC_THRESHOLD`
- `system-recommendation.service.ts` — `checkPerformanceWarning(pendingOutboxCount)` pure function added; wired into checks array via `healthReport.outbox.pendingCount`; generates `SYSTEM_PERFORMANCE_WARNING` rec when pending outbox count ≥ 10; advisory only
- Existing dedup loop handles the new rec type without changes

12 new tests across 4 describe blocks.

### Key behavior

- Resolved structured errors now record `resolved_by` in `automation_failures` — the Resolution card on the error detail page (Phase 3C.5) will show the resolving user's ID going forward
- When resolved via `buildSystemContext`, `resolved_by` is written as `'system'` — auditable and correct
- Pre-Phase-3C.6 resolved errors remain `resolved_by = null` — forward-looking fix only, no back-fill
- The `SYSTEM_PERFORMANCE_WARNING` rec type can now be generated automatically when the outbox queue is backed up (≥ 10 pending events) — closes the dead-type gap in the recommendation filter

---

## Completed — Phase 3C.5 System Intelligence Detail Views v1.0

All deliverables committed, tagged, and staging-smoke-tested.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3c5-system-intelligence-detail-views-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3c5-implementation-plan.md`) |
| Code implementation | Complete — `bce57a2`, tag `phase-3c5-system-intelligence-detail-views-v1` |
| QA: 975/975 tests, build, TypeScript | PASSED |
| Manual staging smoke | PASSED — login ✓, workspace ✓, System Intelligence page ✓, View link ✓, detail page loads ✓, lifecycle actions render ✓, Generate Recommendations ✓ |

### What was delivered

- `structured-error.repo.ts` — `getStructuredErrorById(id, tenantId)`: returns full `AutomationFailureRow | null`; tenant isolation via `.eq('tenant_id', tenantId)`; no status filter; service client
- `structured-error.actions.ts` — optional `errorId` form field + conditional second `revalidatePath` in `resolveErrorAction`, `investigateErrorAction`, `ignoreErrorAction`; `dismissRecommendationAction` unchanged; list-page callers unaffected
- `system-intelligence/page.tsx` — View link column added to Critical & Open Errors table; links to `errors/[err.id]`
- `errors/[errorId]/page.tsx` — new server component; all `automation_failures` metadata; conditional sections for context, payload_snapshot, stack_trace, resolution; lifecycle action forms with `name="errorId"`; `notFound()` on null (tenant-safe 404)
- 20 new tests across 8 describe blocks

### Key behavior

- Operators can click **View** on any row in the Critical & Open Errors table to open a full detail page
- Detail page is accessible via direct URL — resolved and ignored errors can be reviewed after the fact
- Tenant isolation is enforced at the repo layer: `getStructuredErrorById` filters by `tenant_id`; a mismatched or missing record triggers `notFound()` — no cross-tenant leakage
- Lifecycle actions (Resolve / Investigate / Ignore) on the detail page revalidate both the list and the detail page, so the operator sees the updated status immediately without navigating back
- Existing list-page forms are unchanged — they omit `errorId`, so the conditional revalidation never fires from the list context
- No new migrations — reads from existing `automation_failures` table (Phase 3C.1)
- No Resend, no external LLMs, no auto-actions

---

## Completed — Phase 3C.4 Workflow & Outbox Error Emission v1.0

All deliverables committed, tagged, and staging-smoke-tested.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3c4-workflow-error-emission-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3c4-implementation-plan.md`) |
| Code implementation | Complete — `f465795`, tag `phase-3c4-workflow-outbox-error-emission-v1` |
| QA: 955/955 tests, build, TypeScript | PASSED |
| Manual staging smoke | PASSED — login ✓, workspace ✓, System Intelligence page ✓, Critical & Open Errors ✓, Workflow Health ✓, Generate Recommendations ✓ |

### What was delivered

- `structured-error.types.ts` — `WORKFLOW_FAILURE_TYPE` (`WORKFLOW_RUN_FAILED`, `OUTBOX_EVENT_DISPATCH_FAILED`) and `WorkflowFailureType` (additive)
- `workflow-run.service.ts` — non-fatal `createStructuredError` emission in `failWorkflowRun`; `_ctx` → `ctx`
- `event-dispatch.service.ts` — guarded non-fatal `createStructuredError` emission in `dispatchPendingEvents`; guard: `event.attempts + 1 >= 5` (final attempt only)
- `tests/phase3c-system-intelligence.test.ts` — 25 new tests across 9 describe blocks

### Key behavior

- Failed workflow runs now emit structured error rows into `automation_failures` with `failure_type: 'WORKFLOW_RUN_FAILED'`, `severity: 'error'`, `workflow_run_id` populated
- Permanently failed outbox events (after 5 dispatch attempts) now emit structured error rows with `failure_type: 'OUTBOX_EVENT_DISPATCH_FAILED'`, `context: { event_id, event_type, attempts: 5 }`
- Both errors appear automatically in the Critical & Open Errors table on the System Intelligence page
- Existing Resolve / Investigate / Ignore lifecycle actions apply to these errors without any new UI
- The `SYSTEM_ERROR_DIAGNOSIS` recommendation now fires more accurately when workflow or outbox failures accumulate in `automation_failures`
- All emissions are non-fatal — existing `failWorkflowRun` and `dispatchPendingEvents` behavior is unchanged
- No new migrations, no new routes, no new UI

### Accepted limitations (v1)

- `failWorkflowRun` duplicates: if called more than once for the same run, multiple rows are created — accepted for v1 (Option A)
- Outbox restart gap: if the server restarts between `markEventDispatchFailed` and the non-fatal emission, the structured error may not be written — accepted for v1; reconciler is future work

---

## Completed — Phase 3C.3 System Intelligence Recommendation Generator v1.0

All deliverables committed, tagged, and staging-smoke-tested.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3c3-system-intelligence-recommendations-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3c3-system-intelligence-recommendations-implementation-plan.md`) |
| Code implementation | Complete — `3d45928`, tag `phase-3c3-system-intelligence-recommendations-v1` |
| QA: 930/930 tests, build, TypeScript | PASSED |
| Manual staging smoke | PASSED — login ✓, workspace ✓, Generate Recommendations button ✓, generates with "Done." ✓ |

### What was delivered

- `system-recommendation.types.ts` — `REC_THRESHOLD` (ERROR_COUNT_MIN=3), `RecCheckResult`, `SystemRecGeneratorResult`
- `system-recommendation.service.ts` — pure check functions for 3 rec types; orchestrator `runSystemRecommendationGenerator`
- `system-recommendation.actions.ts` — `'use server'` action `generateSystemRecommendationsAction`
- `GenerateRecsButton.tsx` — client component with loading state, server action call, result display
- `types.agent.ts` extended: `SYSTEM_REC_GENERATOR_RUN`, `SYSTEM_REC_GENERATOR_FAILED` (additive)
- `recommendation.repo.ts` extended: `listPendingSystemRecs()` for deduplication
- `system-intelligence/page.tsx` extended: button section above Pending System Recommendations; page remains server component
- 27 new tests across 9 describe blocks

### Key behavior

- Generator is triggered on-demand via button click on the System Intelligence settings page
- Reads open structured errors, failed/partially-committed import batches, workflow health, and existing pending recs in parallel
- Deduplication prevents duplicate pending recs of the same type from being created
- Writes to existing `agent_recommendations` table (no new migrations)
- Advisory only — no auto-send, no external LLMs, no Resend
- Activity events emitted non-fatally on run and on failure
- Production Vercel did not auto-deploy (Git-disconnected as of Track A); staging auto-deployed and smoke-tested

---

## Completed — Phase 3E Lead Workflow Control v1.0

All deliverables committed, tagged, migration applied to staging, and staging-smoke-tested.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3e-design-test-cases.md`) |
| Code implementation | Complete — `48bfbbb`, tag `phase-3e-lead-workflow-control-v1` |
| QA: 1027/1027 tests, build, TypeScript | PASSED |
| Migration `20240032` applied to staging | PASSED |
| Manual staging smoke | PASSED — 23/23 checklist items |
| Migration `20240032` applied to production (`kxrplupzbsmujjznzhpy`) | PASSED — 2026-05-27 |
| Production Vercel deployment (`dpl_GQdBM9Sewy9G4BtSB2aaJQotPQKH`) | PASSED — `https://verian-bios.vercel.app` live |
| Manual production smoke | PASSED — 2026-05-27 |

### What was delivered

- `supabase/migrations/20240032_phase3e_lead_workflow_enabled.sql` — adds `workflow_enabled boolean NOT NULL DEFAULT false` to `leads`; corrects the design-document error that assumed the column already existed
- `types/database.ts` — `workflow_enabled` added to leads Row/Insert/Update
- `modules/crm/actions/lead.actions.ts` — `setWorkflowEnabledAction(leadId, enabled)` appended; thin action delegating to `leadService.updateLead`; revalidates lead detail and kanban
- `app/(workspace)/[workspaceSlug]/leads/[id]/WorkflowToggle.tsx` — new `'use client'` component; "Workflow: On/Off" badge + "Enable/Disable Workflow" button; optimistic local state; loading state; inline error
- `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` — `WorkflowToggle` rendered below stage/priority/status row on lead detail page
- `app/(workspace)/[workspaceSlug]/leads/page.tsx` — read-only "WF On" badge added to `LeadCard` when `workflow_enabled === true`
- 18 tests across 6 describe blocks (migration/types correctness, action guardrails, component structure, page integration, kanban read-only constraint)

### Key behavior

- Operators enable/disable the AI outbound workflow per lead directly from the lead detail page — closing the gap identified in Phase 3D analytics ("Workflow Off: N")
- Enabling workflow does NOT immediately trigger `dispatchPendingEvents()` — the existing cron picks up the lead on the next scheduled pass
- Kanban card shows "WF On" badge for a quick visual scan; toggle interaction is on the detail page only
- Permission gate: `requirePermission(ctx, 'crm.leads.edit')` inside `leadService.updateLead`; tenant isolation enforced at repo layer
- Migration `20240032` applied to staging and production; production Vercel deployed `dpl_GQdBM9Sewy9G4BtSB2aaJQotPQKH` at `https://verian-bios.vercel.app`; production smoke-tested 2026-05-27

### Schema correction note

The Phase 3E design document incorrectly stated that `workflow_enabled` already existed as a real `leads` column. It did not — Phase 3B.2 stored it in `metadata` JSONB only. Migration `20240032` adds the proper column. This also fixes a latent Phase 3D analytics bug (the analytics repo queried the column as if it existed; it now resolves correctly).

---

## Completed — Phase 3D Revenue Analytics v1.0

All deliverables committed, tagged, and staging-smoke-tested.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3d-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3d-implementation-plan.md`) |
| Code implementation | Complete — `08c3cdd`, tag `phase-3d-revenue-analytics-v1` |
| QA: 1009/1009 tests, build, TypeScript | PASSED |
| Manual staging smoke | PASSED — login ✓, workspace ✓, Analytics sidebar link ✓, /main/settings/analytics loads ✓, all 3 panels render ✓ |

### What was delivered

- `modules/analytics/` — self-contained new module; imports nothing from existing modules except the service client
- `analytics.types.ts` — 5 interfaces: `LeadPipelineStats`, `EmailSendMetrics`, `LearningSignalRow`, `LearningSignalSummary`, `RevenueDashboard`
- `analytics.repo.ts` — 4 read-only query functions; all use `createSupabaseServiceClient()` and `.eq('tenant_id', tenantId)`
- `analytics.service.ts` — `buildRevenueDashboard` orchestrates all 4 sources in `Promise.all`
- `app/(workspace)/[workspaceSlug]/settings/analytics/page.tsx` — server component, 4 summary cards, 3 panels, empty states, footer navigation
- `components/layout/Sidebar.tsx` — Analytics nav item added between Imports and Settings (`BarChart2` icon)
- `tests/phase3d-revenue-analytics.test.ts` — 22 tests, source-reading pattern
- No migrations — all data already in existing tables

---

## Completed — Phase 3F Workflow Execution Visibility v1.0

All deliverables committed, tagged, and staging-smoke-tested.

| Deliverable | Status |
|-------------|--------|
| Design & Test Cases v1.0 | Locked (`docs/roadmap/phase-3f-design-test-cases.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3f-implementation-plan.md`) |
| Code implementation | Complete — `f43f797`, tag `phase-3f-workflow-execution-visibility-v1` |
| QA: 1048/1048 tests, build, TypeScript | PASSED |
| Manual staging smoke | PASSED — login ✓, workspace ✓, lead detail ✓, Workflow Activity ✓, Email Draft History ✓, Workflow Errors ✓ |
| Production Vercel deployment (`dpl_2aiTEQ1eRz7Eus8QNfmmpipAkmaa`) | PASSED — `https://verian-bios.vercel.app` live |
| Manual production smoke | PASSED — 14/14 checks 2026-05-27 |

### What was delivered

- `structured-error.repo.ts` extended — `getWorkflowErrorsForLead(tenantId, leadId)`: two-query pattern via `workflow_runs` (subject_type/subject_id) → `automation_failures` (status in open/investigating); early exit on empty runIds; tenant-isolated; read-only; no migration
- `LeadActivityTimeline.tsx` — new server component; `EVENT_LABELS` map (18 entries); `OUTCOME_COLORS` map; `formatRelativeTime` helper; empty state; renders `occurred_at`, `event_summary`, `event_type`
- `leads/[id]/page.tsx` extended — 3 new imports; `Promise.all` extended with `activityEvents` + `workflowErrors` (both non-fatal with `.catch(() => [])`); Email Draft History card (`emailDrafts.slice(1)`); Workflow Errors card (links to `system-intelligence/errors/[id]`); `LeadActivityTimeline` at bottom
- `tests/phase3f-workflow-visibility.test.ts` — 21 source-reading tests, 6 describe blocks
- No migration created. Next available migration remains `20240033`.

### Key behavior

- Operators see a live `Workflow Activity` timeline on the lead detail page — all 18 ET_/HRB_/SEB_/LA_ event types labeled and color-coded
- Prior email drafts (all except the current one) surface in `Email Draft History` with status badge, subject, and date
- Open and investigating automation failures linked to the lead's workflow runs surface in a `Workflow Errors` panel with severity badge and a direct link to the error detail page
- All three panels are advisory and read-only — no server actions, no sends, no external LLMs
- Activity events and workflow errors are non-fatal: a Supabase failure on either fetch does not break the lead detail page load
- Production deployed at `dpl_2aiTEQ1eRz7Eus8QNfmmpipAkmaa` — `https://verian-bios.vercel.app` live and smoke-tested 2026-05-27. No migration required (Phase 3F added no DB changes). Vercel settings unchanged.

---

## Completed — Phase 3G Agent Operations Readiness & Control Map v1.0

All deliverables committed, tagged, and locked. Documentation/control-map phase only — no source code changed, no migration created.

| Deliverable | Status |
|-------------|--------|
| Design — Agent Operations Readiness & Control Map | Locked (`docs/roadmap/phase-3g-agent-operations-readiness-design.md`) |
| Implementation Plan v1.0 | Locked (`docs/roadmap/phase-3g-implementation-plan.md`) |
| Code implementation | N/A — documentation-only phase |
| QA: 1048/1048 tests (unchanged baseline) | PASSED — no source changes |
| Tag | `phase-3g-agent-operations-readiness-v1 → a4f488a` |

### What was delivered

- **Agent inventory** — 13 active agents catalogued; 4 planned agents (3I–3M scope)
- **Decision lifecycle** — 12 steps mapped; steps 10–12 (follow-up scheduling, campaign assignment, live pilot) not yet implemented
- **Critical gap identified** — two disconnected draft creation paths: Phase 3A template path (direct, no LLM) vs. Phase 3B pipeline (Message Strategy → Copywriting → QRA → HRB → SEB); never unified; must be fixed in Phase 3J before campaigns are possible
- **Kill switch audit** — `EMAIL_SENDING_ENABLED` system control exists in DB but is **not enforced** in `sendApprovedDraft()` — Gate 0 is missing; Phase 3H must add it
- **Activity event gap** — `ET_SEND_INITIATED`/`ET_SEND_SUCCEEDED`/`ET_SEND_FAILED` are gated by `phase3bMeta !== null`; Phase 3A auto-path sends emit no events to the Workflow Activity timeline
- **Roadmap 3H→3M defined** — Phase 3H (Send Safety Hardening), 3I (Agent Decision Log), 3J (Unified Draft Path), 3K (Campaign Assignment), 3L (Follow-up Scheduling), 3M (Live Pilot)
- **Pause milestone** — "System Verified for Controlled Live Sending" gate defined: requires 3H + 3I + 3J + 3K all satisfied before any production sending can expand

### Key source audit findings (from `email-send.service.ts`)

- `sendApprovedDraft()` has 8 gates (permission, draft ownership, dual status gate, idempotency, recipient validation, suppression, rate limit, sender identity) — **Gate 0 (`EMAIL_SENDING_ENABLED`) is missing**
- `failure_reason` stored as `metadata.error` JSONB, not a typed column — migration `20240033` will add it
- `triggered_by` stored as `metadata.send_initiated_by` JSONB, not a typed column — migration `20240033` will add it
- Non-production fallback sender `onboarding@resend.dev` correctly guarded

---

## Next Recommended Step

### Phase 3H Design — Send Safety Hardening

Phase 3G is fully complete: locked at `a4f488a`, tag `phase-3g-agent-operations-readiness-v1`. **Do not start Phase 3H implementation until the user explicitly approves a direction.** Phase 3H implementation has not started.

**Phase 3H scope (from implementation plan):**

1. **Gate 0** — Read `EMAIL_SENDING_ENABLED` from `system_controls` at the top of `sendApprovedDraft()`, before any DB reads; return error immediately if disabled
2. **Emit ET_ for ALL sends** — move `ET_SEND_INITIATED`/`ET_SEND_SUCCEEDED`/`ET_SEND_FAILED` outside the `if (phase3bMeta !== null)` guard so Phase 3A auto-path sends appear in the Workflow Activity timeline
3. **Migration `20240033`** — `ALTER TABLE email_sends ADD COLUMN failure_reason text, ADD COLUMN triggered_by text`
4. **Permanent bounce** → `EMAIL_PERMANENT_BOUNCE` structured error (severity `error`)
5. **Complaint** → `EMAIL_COMPLAINT_RECEIVED` structured error (severity `critical`)
6. **Delivery delay** → `EMAIL_DELIVERY_DELAYED` structured error (severity `warning`, idempotent via `correlation_id`)
7. **New `WEBHOOK_FAILURE_TYPE` constants** in `structured-error.types.ts`

**Critical finding driving Phase 3H:** `EMAIL_SENDING_ENABLED` kill switch is not enforced in the send path — production can send emails regardless of the system control setting. Phase 3H must fix this before any expansion of live sending.

When user approves, follow the standard sequence:

1. Design & Test Cases — produce document, get user approval
2. Implementation Plan — produce document, get user approval
3. Code implementation — follow locked plan
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag
6. Update `docs/ai-context/` files

---

## Process Reminder

Standard sequence applies to any future phase:

1. Design & Test Cases — produce document, get user approval
2. Implementation Plan — produce document, get user approval
3. Code implementation — follow locked plan
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag
6. Update `docs/ai-context/` files
