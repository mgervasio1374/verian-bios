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

## Next Recommended Step

### Phase 3C.4 Design

No Phase 3C.4 scope has been defined. When user direction is given, follow the standard sequence:

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
