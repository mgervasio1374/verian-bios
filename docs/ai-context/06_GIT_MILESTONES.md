# 06 — Git Milestones

## Current Branch

`master`

## Tags

| Tag | Milestone |
|-----|-----------|
| `phase-3b2-data-import-foundation-v1` | Phase 3B.2 Data Import Foundation complete — CSV/XLSX pipeline, staging tables, dedupe, CRM commit, Inngest async path, admin UI |
| `phase-3b1-stabilization-v1` | Phase 3B.1 Stabilization / Hardening Foundation complete — FK attribution, SEB reconciler, scheduled LA, Operational Health |
| `phase-3b-learning-agent-v1` | Learning Agent Foundation complete — advisory signals, learning_snapshots, agent monitor UI |
| `phase-3b-event-tracking-v1` | Event Tracking / Send Outcome Tracking Foundation complete |
| `phase-3b-send-bridge-v1` | Send / Email Draft Bridge Foundation complete |
| `phase-3b-human-review-bridge-v1` | Human Review / Approval Bridge Foundation complete |
| `phase-3b-quality-review-agent-v1.1` | QRA Foundation complete — backend + UI integration |
| `phase-3b-quality-review-agent-v1` | QRA Foundation backend committed |
| `phase-3b-copywriting-agent-v1` | Copywriting Agent Foundation locked |
| `phase-3b-message-strategy-agent-v1` | Message Strategy Agent Foundation locked |
| `phase-3b-revenue-learning-engine-foundation-v1` | Phase 3B Foundation initial tag |
| `phase-3b-revenue-learning-engine-foundation-v1.1` | Phase 3B Foundation final tag (all commits included) |
| `phase-4-statement-workflow-complete` | Phase 4 statement approval workflow complete |

## Commit Log (Most Recent First)

| SHA | Message | Group |
|-----|---------|-------|
| `6a39849` | Phase 3B.2: implement Data Import Foundation | Phase 3B.2 |
| `0af660e` | Phase 3B.1: implement Stabilization Hardening foundation | Phase 3B.1 |
| `44ea577` | Phase 3B: implement Learning Agent foundation | Phase 3B LA |
| `c631fc0` | Docs: add Phase 3B Learning Agent implementation plan | Phase 3B Docs |
| `352e602` | Docs: add Phase 3B Learning Agent design | Phase 3B Docs |
| `5f63d94` | Docs: update AI context after Event Tracking completion | Phase 3B Docs |
| `28db22a` | Phase 3B: implement Event Tracking Send Outcome Tracking foundation | Phase 3B ET |
| `fd8a4fb` | Phase 3B: implement Send Email Draft Bridge foundation | Phase 3B SEB |
| `ea3342c` | Phase 3B: implement Human Review Approval Bridge foundation | Phase 3B HRB |
| `4493de5` | Docs: add Phase 3B Human Review Approval Bridge implementation plan | Phase 3B Docs |
| `96f32f8` | Phase 3B: add QRA UI integration to message workspace | Phase 3B QRA |
| `38d1f12` | Chore: ignore Claude worktrees | Chore |
| `435b890` | Phase 3B: implement Quality Review Agent foundation | Phase 3B QRA |
| `0fcb91e` | Docs: update AI context for Quality Review Agent planning | Phase 3B Docs |
| `60ed136` | Docs: add Phase 3B Quality Review Agent implementation plan v1.0 | Phase 3B Docs |
| `dd26ec8` | Docs: add Phase 3B Quality Review Agent design and test cases v1.0 | Phase 3B Docs |
| `5765c7a` | Docs: add Phase 3B1 follow-up accountability roadmap | Phase 3B Docs |
| `5edf9c2` | Phase 3A: add artifacts document module | Phase 3A |
| `11bc621` | Phase 3A: enhance CRM workspace and intelligence UI | Phase 3A |
| `4521edb` | Phase 3A: add agent monitor and system controls UI | Phase 3A |
| `94406d2` | Phase 4: enhance statement approval workflow | Phase 4 |
| `6870099` | Phase 3A: add email quality and rewrite loop foundation | Phase 3A |
| `487a479` | Tooling: add Vitest test scripts | Tooling |
| `3f0367a` | Phase 3A: add intelligence infrastructure | Phase 3A |
| `5968ba2` | Phase 3B: implement Message Strategy Agent foundation | Phase 3B |
| `40e56b1` | Phase 3B: implement Copywriting Agent foundation | Phase 3B |
| `e55965b` | Polish statement proposal email copy | Phase 4 |
| `b50665d` | Add statement analysis PDF proposal package | Phase 4 |

## What Each Group Contains

### Phase 3A: Intelligence Infrastructure (`3f0367a`)
- `supabase/migrations/20240016_phase3a_intelligence_tables.sql`
- `supabase/migrations/20240017_phase3a_rls_indexes_seed.sql`
- `types/database.ts` — full schema regeneration
- `modules/intelligence/repositories/` — agent-run, agent-run-step, activity-event, company-score, guardrail-event, system-control, recommendation repos
- `modules/intelligence/services/` — agent-run-logging, activity-event, system-control, guardrail, company-scoring, recommendation-generation, recommendation-reconciliation, recommendation-completion services
- `modules/intelligence/types.agent.ts` — agent types including activity event types

### Tooling: Vitest (`487a479`)
- `package.json` — Vitest scripts and devDependencies
- `vitest.config.ts` — test framework configuration

### Phase 3A: Email Quality + Rewrite Loop (`6870099`)
- `supabase/migrations/20240018_phase3b1_follow_up_controls_seed.sql` and related
- Email quality foundation tables and services

### Phase 3B: Message Strategy Agent (`5968ba2`)
- `supabase/migrations/20240022_phase3b_message_strategies.sql`
- `modules/messaging/strategy/` — all strategy agent files
- `modules/messaging/repositories/message-strategy.repo.ts`
- `modules/messaging/actions/message-strategy.actions.ts`
- `app/(workspace)/[workspaceSlug]/message-workspace/` — workspace UI
- `tests/message-strategy.test.ts` + 30 fixtures

### Phase 3B: Copywriting Agent (`40e56b1`)
- `supabase/migrations/20240023_phase3b_message_versions.sql`
- `modules/messaging/copywriting/` — all copywriting agent files
- `modules/messaging/repositories/message-version.repo.ts`
- `modules/messaging/actions/copywriting-agent.actions.ts`
- `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx`
- Extended `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx`
- `tests/copywriting-agent.test.ts` + 35 fixtures
- `modules/intelligence/types.agent.ts` — added `MESSAGE_VERSIONS_GENERATED`

### Phase 3B: Quality Review Agent Planning (`dd26ec8`, `60ed136`, `0fcb91e`)
- `docs/roadmap/phase-3b-quality-review-agent-design-test-cases.md` — Design & Test Cases v1.0 (locked)
- `docs/roadmap/phase-3b-quality-review-agent-implementation-plan.md` — Implementation Plan v1.0 (locked)
- `docs/ai-context/` — AI context recovery pack
- `AGENTS.md` — AI context recovery protocol appended

### Phase 3B: Quality Review Agent Backend (`435b890`)
- `supabase/migrations/20240024_phase3b_quality_reviews.sql` — quality_reviews table, 7 indexes, RLS, trigger
- `modules/messaging/quality-review/` — all QRA modules (types, scoring, risk-flags, composite, ranking, reasoning, validation, message-type-rules, service)
- `modules/messaging/repositories/quality-review.repo.ts`
- `modules/messaging/actions/quality-review-agent.actions.ts`
- `modules/intelligence/types.agent.ts` — added `QUALITY_REVIEW_COMPLETED`, `QUALITY_REVIEW_NO_RECOMMENDATION`
- `tests/fixtures/quality-review-agent/TC-QRA-001.json` through `TC-QRA-035.json` — 35 fixtures
- `tests/quality-review-agent.test.ts` — 126 QRA tests

### Phase 3B: Quality Review Agent UI Integration (`96f32f8`)
- `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx` — QRA score/rank/risk-flags/recommended badge display; "Quality Review" button
- `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx` — `listQualityReviewsForStrategy` wired

### Phase 3B: Human Review / Approval Bridge Planning (`4493de5`)
- `docs/roadmap/phase-3b-human-review-approval-bridge-design-test-cases.md` — Design & Test Cases v1.0 (locked)
- `docs/roadmap/phase-3b-human-review-approval-bridge-implementation-plan.md` — Implementation Plan v1.0 (locked)

### Phase 3B: Human Review / Approval Bridge Foundation (`ea3342c`)
- `modules/messaging/human-review/human-review.types.ts` — HRB_ERROR_CODES (HRB_001–HRB_018), HRB_ACTION_TYPES (6), REJECTION_REASONS (12), all interfaces
- `modules/messaging/human-review/human-review.validation.ts` — Pure validation: `validateApprovalEligibility` (18 gates), `validateSelectEligibility`, `validateRejectEligibility`, risk flag helpers
- `modules/messaging/human-review/human-review.audit.ts` — Pure event payload builders for all 6 HRB action types
- `modules/messaging/human-review/human-review.service.ts` — Orchestration: select, reject, approve, eligibility check, regeneration request, event recording
- `modules/messaging/actions/human-review.actions.ts` — 6 server actions (select, reject, approve, acknowledgeRiskAndApprove, requestRegeneration, returnToStrategy)
- `modules/messaging/repositories/message-version.repo.ts` — Extended: 7 new HRB status-update and query functions
- `modules/intelligence/types.agent.ts` — Added 6 HRB `ActivityEventType` constants (additive only)
- `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx` — Full bridge UI: Approve button, RejectModal, OverrideReasonModal, RiskAcknowledgementModal, status indicators, critical risk banner, all-rejected prompt
- `tests/fixtures/human-review-bridge/TC-HRB-001.json` through `TC-HRB-035.json` — 35 HRB fixtures
- `tests/human-review-bridge.test.ts` — 100 HRB tests

### Phase 3B: Send / Email Draft Bridge Foundation (`fd8a4fb`)
- `modules/messaging/send-bridge/send-bridge.types.ts` — SEB_ERROR_CODES (SEB_001–SEB_014), SEB_ACTION_TYPES (2), all interfaces
- `modules/messaging/send-bridge/send-bridge.validation.ts` — Pure validation: `validateDraftCreationEligibility` (14 gates), helper functions
- `modules/messaging/send-bridge/send-bridge.audit.ts` — Pure event payload builders: `buildDraftCreatedPayload`, `buildDraftCreationBlockedPayload`
- `modules/messaging/send-bridge/send-bridge.service.ts` — Orchestration: `createEmailDraftFromApprovedVersion` (17-step flow), `getDraftStatusForVersion`
- `modules/messaging/actions/send-bridge.actions.ts` — 1 server action: `createEmailDraftFromApprovedVersionAction`
- `modules/messaging/repositories/email-draft.repo.ts` — Extended: added `getEmailDraftForVersion` read helper (duplicate guard via `ai_generation_metadata->>'message_version_id'`)
- `modules/intelligence/types.agent.ts` — Added 2 SEB `ActivityEventType` constants (`SEB_ACTION_DRAFT_CREATED`, `SEB_ACTION_DRAFT_CREATION_BLOCKED`) — additive only
- `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx` — Extended: "Create Email Draft" button, `CreateDraftConfirmModal`, draft status indicators for approved versions
- `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx` — Extended: `sendBridgeSvc` import, draft status loading loop, new props to panel
- `tests/fixtures/send-bridge/TC-SEB-001.json` through `TC-SEB-035.json` — 35 SEB fixtures
- `tests/send-bridge.test.ts` — 89 SEB tests

### Phase 3B: Event Tracking / Send Outcome Tracking Foundation (`28db22a`)
- `modules/messaging/event-tracking/event-tracking.types.ts` — `ET_ACTION_TYPES` (9 constants), `EtPhase3bMeta`, `EtSendEventPayload`, `EtOutcomeEventPayload`, `SendStatusResult` interfaces
- `modules/messaging/event-tracking/event-tracking.attribution.ts` — Pure helpers: `extractPhase3bMeta`, `isPhase3bSend`, `buildPhase3bSendMetadata`, `RESEND_EVENT_TO_ET_TYPE`
- `modules/messaging/event-tracking/event-tracking.audit.ts` — Pure payload builders: `buildSendInitiatedPayload`, `buildSendSucceededPayload`, `buildSendFailedPayload`, `buildWebhookOutcomePayload`
- `modules/messaging/services/email-send.service.ts` — Extended: Phase 3B metadata extraction + `email_sends.metadata` enrichment; `ET_SEND_INITIATED`, `ET_SEND_SUCCEEDED`, `ET_SEND_FAILED` emissions (all `.catch(() => {})`)
- `modules/messaging/repositories/email-send.repo.ts` — Extended: added `getSendStatusForDraft` read helper
- `modules/intelligence/types.agent.ts` — Added 9 ET_ `ActivityEventType` constants (additive only)
- `app/api/webhooks/resend/route.ts` — Extended: 3 new imports; `RESEND_EVENT_TO_ET_TYPE` map; `email_sends` select expanded from `id, tenant_id, status` → `id, tenant_id, workspace_id, contact_id, company_id, draft_id, metadata, status`; Phase 3B activity event block after `23505` idempotency guard
- `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/page.tsx` — Extended: `emailSendRepo` import, `sendStatusByDraftId` loading loop, passes new prop to panel
- `app/(workspace)/[workspaceSlug]/message-workspace/[leadId]/GeneratedVersionsPanel.tsx` — Extended: `SendStatus` interface, `sendStatusByDraftId` prop, delivery status badges (Delivered / Bounced / Complaint / Send Failed / Sent)
- `tests/fixtures/event-tracking/TC-ET-001.json` through `TC-ET-035.json` — 35 ET fixtures
- `tests/event-tracking.test.ts` — 81 ET tests

### Phase 3B: Learning Agent Foundation (`44ea577`)
- `supabase/migrations/20240025_phase3b_learning_snapshots.sql` — new `learning_snapshots` table with `advisory = true` DB constraint, 10 signal names check constraint, 6 dimension values check constraint, partial unique index on `(tenant_id, run_id, signal_name, dimension, dimension_value) WHERE deleted_at IS NULL`
- `modules/messaging/learning-agent/learning-agent.types.ts` — `LA_SIGNAL_NAMES` (10 constants), `LA_DIMENSIONS` (6 constants), `LA_CONFIDENCE` (4 constants), `LA_ACTION_TYPES` (2 constants), thresholds, all interfaces
- `modules/messaging/learning-agent/learning-agent.confidence.ts` — `classifyConfidence`, `calculateRate`, `isEngagementSignal`, `getThresholds`
- `modules/messaging/learning-agent/learning-agent.signals.ts` — `buildVersionEventMap`, `calculateAllSignals`, all 10 signals × 6 dimensions, pure functions
- `modules/messaging/learning-agent/learning-agent.audit.ts` — `buildSignalsComputedPayload`, `buildSignalsFailedPayload`
- `modules/messaging/learning-agent/learning-agent.service.ts` — `runLearningAnalysis` (9-step orchestration)
- `modules/messaging/repositories/learning-snapshot.repo.ts` — `writeSnapshots`, `getLatestRunId`, `getSnapshotsByRunId`, `getLatestSnapshotsForTenant`, `listRunIds`, `loadPhase3bActivityEvents`, `loadVersionDimensions`
- `modules/messaging/actions/learning-agent.actions.ts` — server action: `runLearningAnalysisAction`
- `modules/intelligence/types.agent.ts` — added `LA_SIGNALS_COMPUTED`, `LA_SIGNALS_COMPUTATION_FAILED` (additive only)
- `app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx` — extended: learning snapshots loader, Learning Signals section, advisory alert display
- `app/(workspace)/[workspaceSlug]/settings/agent-monitor/RunAnalysisButton.tsx` — new client component: "Run Learning Analysis" button with loading state
- `tests/fixtures/learning-agent/TC-LA-001.json` through `TC-LA-042.json` — 42 fixtures
- `tests/learning-agent.test.ts` — 53 LA tests

### Phase 3B.2: Data Import Foundation (`6a39849`)
- `supabase/migrations/20240027_phase3b2_import_tables.sql` — `import_batches` (11-status CHECK, workflow_enabled_default DEFAULT false, column_mapping jsonb) + `import_rows` (validation/duplicate/commit status CHECKs, FK to companies/contacts/leads); RLS: memberships-based SELECT; writes via service client
- `types/database.ts` — `import_batches` and `import_rows` Row/Insert/Update/Relationships added
- `modules/intelligence/types.agent.ts` — 9 IMPORT_ ActivityEventType constants added (additive)
- `modules/imports/import.types.ts` — IMPORT_BATCH_STATUS (11), IMPORT_ROW_VALIDATION_STATUS, IMPORT_ROW_DUPLICATE_STATUS, IMPORT_ROW_COMMIT_STATUS, IMPORT_SOURCE_TYPE (5), IMPORT_FIELD_ALIASES (~50 header aliases), IMPORT_BACKGROUND_THRESHOLD=1000, NormalizedImportRow, 9 audit payload interfaces
- `modules/imports/import.normalization.ts` — normalizeEmail, normalizePhone, normalizeWebsite, normalizeState, normalizePostalCode, normalizeName, splitFullName, normalizeRow
- `modules/imports/import.mapping.ts` — detectColumnMapping (case-insensitive alias matching), applyMapping, validateMapping
- `modules/imports/import.validation.ts` — validateEmail (RFC 5322), validatePhone (PHONE_TOO_SHORT warning), validateRequiredFields, validateRow
- `modules/imports/import.audit.ts` — 9 pure payload builder functions for all IMPORT_ event types
- `modules/imports/import.parser.ts` — `import 'server-only'`; `import * as XLSX from 'xlsx'` (ESM namespace import); parseCsv (skipEmptyLines: 'greedy'), parseXlsx, parseFile
- `modules/imports/repositories/import-batch.repo.ts` — createBatch, getBatch, updateBatchStatus, updateBatchCounts, listBatchesForWorkspace
- `modules/imports/repositories/import-row.repo.ts` — createRows, listRowsByBatch, listInvalidRowsByBatch, listDuplicateRowsByBatch, listCommittableRows, updateRowValidation, updateRowDedupe, updateRowCommit, updateRowNormalizedData
- `modules/imports/import.dedupe.ts` — checkEmailDuplicate, checkPhoneDuplicate, checkDomainDuplicate, checkNameCityDuplicate, checkExternalIdDuplicate, checkWithinBatchDuplicate, checkRowForDuplicates
- `modules/imports/import.commit.ts` — upsertCompany, insertContact, insertLead (status='imported_unreviewed', workflow_enabled=false), commitRow; writes ONLY to companies/contacts/leads
- `modules/imports/import.service.ts` — orchestration: createImportBatch, parseAndStage, validateBatch, dedupeBatch, approveBatch, commitBatch; sync (≤1000 rows) and Inngest async (>1000 rows) paths; all emitEvent calls non-fatal
- `modules/imports/actions/import.actions.ts` — server actions: createImportBatchAction, approveAndCommitAction, cancelImportBatchAction, getImportBatchDetailAction, listImportBatchesAction
- `inngest/functions/process-import-batch.ts` — Inngest function (2-arg v4 form) for `import/batch.approved`; verifies approved/committing status before commit
- `inngest/index.ts` — processImportBatch registered (9 functions total)
- `app/(workspace)/[workspaceSlug]/settings/imports/page.tsx` — import batch list
- `app/(workspace)/[workspaceSlug]/settings/imports/new/page.tsx` — upload page
- `app/(workspace)/[workspaceSlug]/settings/imports/[batchId]/page.tsx` — detail page: validation/dedupe summary, approve/cancel
- `app/(workspace)/[workspaceSlug]/settings/imports/[batchId]/ImportUploadForm.tsx` — client component
- `app/(workspace)/[workspaceSlug]/settings/imports/[batchId]/CommitConfirmModal.tsx` — client component
- `components/layout/Sidebar.tsx` — "Imports" nav entry added
- `tests/__mocks__/server-only.ts` — empty export for Vitest compatibility
- `vitest.config.ts` — server-only alias added
- `tests/fixtures/imports/TC-IM-001.json` through `TC-IM-069.json` — 69 fixtures
- `tests/import-foundation.test.ts` — 156 tests (69 fixture existence + 87 unit)

### Phase 3B.1: Stabilization / Hardening Foundation (`0af660e`)
- `supabase/migrations/20240026_phase3b1_email_sends_attribution.sql` — adds `message_version_id uuid` and `strategy_id uuid` (nullable, `ON DELETE SET NULL`) to `email_sends`; partial indexes `idx_email_sends_message_version` and `idx_email_sends_strategy`
- `types/database.ts` — manually updated: `message_version_id` and `strategy_id` added to `email_sends` Row/Insert/Update/Relationships
- `modules/messaging/repositories/email-send.repo.ts` — `CreateEmailSendInput` extended with optional `messageVersionId?` and `strategyId?`; both included in INSERT
- `modules/messaging/services/email-send.service.ts` — passes `messageVersionId` and `strategyId` from `phase3bMeta` to `createEmailSend`
- `modules/messaging/event-tracking/event-tracking.attribution.ts` — added `EmailSendAttributionFields` interface and `resolvePhase3bAttributionFromSend` pure function (FK-first with JSONB fallback)
- `app/api/webhooks/resend/route.ts` — select expanded to include `message_version_id, strategy_id`; Phase 3B attribution block uses `resolvePhase3bAttributionFromSend`
- `modules/messaging/send-bridge/send-bridge-reconciliation.types.ts` — `StuckDraftStateA`, `StuckDraftStateB`, `StuckStateC`, `SebReconciliationResult` types
- `modules/messaging/send-bridge/send-bridge-reconciliation.service.ts` — `runSebReconciliation`: detects State A (no approval_request_id), State B (pending approval_request linked), State C (approved draft + unsuperseded siblings); State A/B report-only; State C auto-fixed via `supersedePendingDraftsForLead`
- `inngest/functions/reconcile-send-bridge-stuck-drafts.ts` — Inngest function `*/15 * * * *`: calls `runSebReconciliation`, logs results
- `inngest/functions/scheduled-learning-agent-run.ts` — Inngest function `0 6 * * *`: enumerates active tenants, calls `runLearningAnalysis` per tenant with `triggeredBy: 'scheduled:inngest'`
- `inngest/index.ts` — registers both new Inngest functions (8 total)
- `modules/messaging/repositories/operational-health.repo.ts` — `getSebStuckDraftCounts`, `getFailedSendCount`, `getLatestLaRunStatus` (all read-only, tenant-scoped)
- `app/(workspace)/[workspaceSlug]/settings/agent-monitor/page.tsx` — extended: Operational Health card (stuck draft counts, failed sends last 24h, LA run status); positioned between System Controls and Learning Signals
- `tests/phase-3b1-stabilization.test.ts` — 56 tests: attribution helpers (FK-first, JSONB fallback, Phase 3A null), reconciliation type shapes, scheduled LA sentinel/result, operational health result shapes, migration SQL assertions, Inngest schedule assertions, guardrail file-content checks

## QA Verification Log

| Date | Tests | Build | Notes |
|------|-------|-------|-------|
| 2026-05-24 | 802/802 passed | PASSED | Phase 3B.2 Data Import Foundation — 156 new tests, 646 existing pass. TypeScript clean. Guardrails pass. |
| 2026-05-22 | 646/646 passed | PASSED | Phase 3B.1 Foundation — 56 new tests, 590 existing pass. TypeScript clean. |
| 2026-05-21 | 590/590 passed | PASSED | LA Foundation v1.0 — 53 LA tests, 537 existing tests all pass. TypeScript clean. |
| 2026-05-21 | 537/537 passed | PASSED | ET Foundation v1.0 — 81 ET tests, 456 existing tests all pass. TypeScript clean. |
| 2026-05-21 | 456/456 passed | PASSED | SEB Foundation v1.0 — 89 SEB tests, 367 existing tests all pass. TypeScript clean. |
| 2026-05-21 | 367/367 passed | PASSED | HRB Foundation v1.0 — full bridge UI, 100 HRB tests. ESLint 0 errors. |
| 2026-05-21 | 267/267 passed | PASSED | Baseline before HRB code implementation. ESLint 0 errors. |
| 2026-05-20 | 267/267 passed | PASSED | QRA Foundation v1.1 — backend + UI integration. ESLint 0 errors. |
| 2026-05-19 | 141/141 passed | PASSED | Final QA before Phase 3B commit sequence |

## Current HEAD

`6a39849` — Phase 3B.2: implement Data Import Foundation

## Migrations Sequence

| Migration | Contents |
|-----------|----------|
| `20240016` | Phase 3A intelligence tables |
| `20240017` | Phase 3A RLS, indexes, seed |
| `20240018` | Phase 3B1 follow-up controls seed |
| `20240022` | Phase 3B message_strategies table |
| `20240023` | Phase 3B message_versions table |
| `20240024` | Phase 3B quality_reviews table |
| `20240025` | Phase 3B learning_snapshots table (Learning Agent) |
| `20240026` | Phase 3B.1 email_sends attribution FK columns (Stabilization) |
| `20240027` | Phase 3B.2 import_batches + import_rows tables (Data Import Foundation) |

Note: No new migration was added for the Human Review / Approval Bridge, the Send / Email Draft Bridge, or Event Tracking. All three use existing tables and columns only. Phase 3B provenance travels via `email_drafts.ai_generation_metadata` (jsonb) at draft creation, then is copied into `email_sends.metadata` (jsonb) at send time. Event Tracking activity events are appended to the existing `activity_events` table. The Learning Agent adds migration `20240025` for `learning_snapshots` — its only write target.
