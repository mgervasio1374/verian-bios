# 06 — Git Milestones

## Current Branch

`master`

## Tags

| Tag | Milestone |
|-----|-----------|
| `phase-3f-workflow-execution-visibility-v1` | Phase 3F Workflow Execution Visibility complete — getWorkflowErrorsForLead (two-query repo), LeadActivityTimeline server component (18 EVENT_LABELS, OUTCOME_COLORS, formatRelativeTime, empty state), lead detail page: activity timeline + draft history (slice(1)) + workflow errors panel, no migration, 21 new tests, 1048/1048 total |
| `phase-3e-lead-workflow-control-v1` | Phase 3E Lead Workflow Control complete — migration 20240032 (workflow_enabled column), setWorkflowEnabledAction, WorkflowToggle client component, lead detail toggle, kanban read-only indicator, 18 new tests, 1027/1027 total |
| `phase-3d-revenue-analytics-v1` | Phase 3D Revenue Analytics complete — read-only analytics dashboard, 3 panels (Lead Pipeline, Email Performance, Strategy Performance), Analytics sidebar nav, 22 new tests, 1009/1009 total |
| `phase-3c6-system-intelligence-wrap-up-v1` | Phase 3C.6 System Intelligence Wrap-Up complete — resolved_by attribution in resolveStructuredError, SYSTEM_PERFORMANCE_WARNING recommendation generator with OUTBOX_QUEUE_DEPTH_MIN=10, 12 new tests |
| `phase-3c5-system-intelligence-detail-views-v1` | Phase 3C.5 System Intelligence Detail Views complete — `getStructuredErrorById`, dual revalidation in lifecycle actions, View link on list page, full error detail server component, 20 new tests |
| `phase-3c4-workflow-outbox-error-emission-v1` | Phase 3C.4 Workflow & Outbox Error Emission complete — structured errors from `failWorkflowRun` and `dispatchPendingEvents`, final-attempt-only outbox guard, 25 new tests |
| `phase-3c3-system-intelligence-recommendations-v1` | Phase 3C.3 System Intelligence Recommendation Generator complete — on-demand generator, 3 rec types, dedup, GenerateRecsButton, 27 new tests |
| `phase-3c2-structured-error-lifecycle-v1` | Phase 3C.2 Structured Error Lifecycle Actions complete — resolve/investigate/ignore/dismiss, emission in import callsites, activity events, 24 new tests |
| `staging-foundation-v1` | Staging Foundation v1 — Supabase staging, Vercel staging, auth, workspace access, and DB grants (migrations 030+031) verified |
| `phase-3c1-system-intelligence-v1` | Phase 3C.1 Structured Errors + System Intelligence Foundation complete |
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
| `f43f797` | Phase 3F: add workflow execution visibility | Phase 3F |
| `c54ece5` | Docs: record Phase 3E production deployment | Phase 3E Docs |
| `48bfbbb` | Phase 3E: implement lead workflow control | Phase 3E |
| `191c8f1` | Docs: add Phase 3E lead workflow control design | Phase 3E Docs |
| `08c3cdd` | Phase 3D: implement revenue analytics dashboard | Phase 3D |
| `bb5a68d` | Docs: add Phase 3D implementation plan | Phase 3D Docs |
| `201f8b2` | Docs: add Phase 3D revenue analytics design | Phase 3D Docs |
| `835e11c` | Docs: add Phase 3C wrap-up review | Phase 3C Docs |
| `480509c` | Docs: add Phase 3C.6 final lock report | Phase 3C.6 Docs |
| `9a32d3c` | Phase 3C.6: implement resolved_by attribution and performance warning recommendation | Phase 3C.6 |
| `4f5bdf0` | Docs: add Phase 3C.6 implementation plan | Phase 3C.6 Docs |
| `7f11c07` | Docs: add Phase 3C.6 system intelligence wrap-up design | Phase 3C.6 Docs |
| `212a58e` | Docs: add Phase 3C.5 final lock report | Phase 3C.5 Docs |
| `bce57a2` | Phase 3C.5: implement system intelligence error detail views | Phase 3C.5 |
| `18adac8` | Docs: add Phase 3C.5 implementation plan | Phase 3C.5 Docs |
| `e5428a2` | Docs: add Phase 3C.5 system intelligence detail views design | Phase 3C.5 Docs |
| `6247847` | Docs: add Phase 3C.4 final lock report | Phase 3C.4 Docs |
| `f465795` | Phase 3C.4: implement workflow and outbox error emission | Phase 3C.4 |
| `215e667` | Docs: add Phase 3C.4 implementation plan | Phase 3C.4 Docs |
| `cfe6531` | Docs: add Phase 3C.4 workflow error emission design | Phase 3C.4 Docs |
| `2cda2b9` | Docs: add Phase 3C.3 final lock report | Phase 3C.3 Docs |
| `3d45928` | Phase 3C.3: implement system intelligence recommendations | Phase 3C.3 |
| `518b21e` | Docs: add Phase 3C.3 system intelligence recommendations implementation plan | Phase 3C.3 Docs |
| `237d069` | Docs: add Phase 3C.3 system intelligence recommendations design | Phase 3C.3 Docs |
| `b6530c8` | Docs: add deployment flow cleanup final report | Track A |
| `cbfb790` | Docs: start deployment flow cleanup verification | Track A |
| `b29093d` | Docs: add deployment flow cleanup Option C implementation plan | Track A |
| `bdd6b00` | Docs: add deployment flow cleanup design | Track A |
| `45eebdf` | Docs: add Phase 3C.2 final lock report | Phase 3C.2 Docs |
| `b5ab433` | Phase 3C.2: implement structured error lifecycle actions | Phase 3C.2 |
| `4179ea9` | Docs: add Phase 3C.2 structured error lifecycle implementation plan | Phase 3C.2 Docs |
| `d42cbbd` | Docs: add Phase 3C.2 structured error lifecycle design | Phase 3C.2 Docs |
| `145e3b3` | Docs: update AI context after Staging Foundation v1 lock | Docs |
| `0b6441f` | Debug: remove temporary staging auth diagnostic route | Staging Foundation |
| `4d3bcb8` | DB: grant anon authenticated access for RLS evaluation | Staging Foundation |
| `d696f28` | DB: grant service role access for server-side flows | Staging Foundation |
| `9b7d33a` | Debug: add temporary staging auth diagnostic route | Staging Foundation (removed) |
| `9153a86` | Dev: add local Supabase seed file | Staging Foundation |
| `039fea3` | UI: add Workflow Health link to Settings page | Staging Foundation |
| `ea4b0b0` | Phase 3C.1: implement Structured Errors and System Intelligence foundation | Phase 3C.1 |
| `34f25c0` | Fix Phase 3B.2 lock report risks: findOrCreateCompany + test assertions | Phase 3B.2 |
| `4340105` | Docs: update AI context after Phase 3B.2 Data Import Foundation completion | Docs |
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

### Phase 3C.6: System Intelligence Wrap-Up (`9a32d3c`)
- `modules/intelligence/structured-errors/structured-error.repo.ts` — added optional `resolvedBy?: string | null` to `resolveStructuredError`; writes `resolved_by: resolvedBy ?? null` in the UPDATE; existing callers that omit the parameter get `resolved_by = null`; `.eq('tenant_id', tenantId)` unchanged
- `modules/intelligence/structured-errors/structured-error.service.ts` — `resolveError` now passes `ctx.userId` as third arg to `repo.resolveStructuredError`; `ignoreError` and `investigateError` unchanged; `dismissRecommendationAction` path unchanged
- `modules/intelligence/system-recommendation/system-recommendation.types.ts` — added `OUTBOX_QUEUE_DEPTH_MIN: 10` to `REC_THRESHOLD`; `ERROR_COUNT_MIN: 3` preserved
- `modules/intelligence/system-recommendation/system-recommendation.service.ts` — added `checkPerformanceWarning(pendingOutboxCount)` pure function; generates `SYSTEM_PERFORMANCE_WARNING` rec when pending outbox count ≥ 10; wired as fourth entry in checks array via `checkPerformanceWarning(healthReport.outbox.pendingCount)`; existing dedup loop handles the new type without changes
- `tests/phase3c-system-intelligence.test.ts` — 12 new tests across 4 describe blocks (resolved_by attribution ×3, userId threading ×2, threshold constant ×3, generator ×4)

### Phase 3C.5: System Intelligence Detail Views (`bce57a2`)
- `modules/intelligence/structured-errors/structured-error.repo.ts` — added `getStructuredErrorById(id, tenantId)`; returns `AutomationFailureRow | null`; tenant isolation via `.eq('tenant_id', tenantId)`; no status filter (resolved/ignored accessible via direct URL)
- `modules/intelligence/structured-errors/structured-error.actions.ts` — added optional `errorId` read + conditional second `revalidatePath` to `resolveErrorAction`, `investigateErrorAction`, `ignoreErrorAction`; `dismissRecommendationAction` unchanged; existing list-page callers unaffected
- `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` — added View link column header + cell linking to `errors/[err.id]` in Critical & Open Errors table
- `app/(workspace)/[workspaceSlug]/settings/system-intelligence/errors/[errorId]/page.tsx` — **new file** — full server component; renders all `automation_failures` metadata; conditional context/payload_snapshot/stack_trace/resolution sections; lifecycle action forms with `name="errorId"`; `notFound()` on null
- `tests/phase3c-system-intelligence.test.ts` — 20 new tests across 8 describe blocks (repo function, server component boundary, field coverage, lifecycle actions, list View link, dual revalidation, migration guardrail, external services guardrail)

### Phase 3C.4: Workflow & Outbox Error Emission (`f465795`)
- `modules/intelligence/structured-errors/structured-error.types.ts` — added `WORKFLOW_FAILURE_TYPE` (`WORKFLOW_RUN_FAILED`, `OUTBOX_EVENT_DISPATCH_FAILED`) and `WorkflowFailureType`; additive only
- `modules/workflow/services/workflow-run.service.ts` — added `createStructuredError` import and non-fatal emission in `failWorkflowRun`; `_ctx` renamed to `ctx`
- `modules/workflow/services/event-dispatch.service.ts` — added `createStructuredError` import and guarded non-fatal emission in `dispatchPendingEvents` catch block; guard: `event.attempts + 1 >= 5`
- `tests/phase3c-system-intelligence.test.ts` — 25 new tests across 9 describe blocks (constants, service source, guardrails, tenant isolation, outbox idempotency, cross-phase preservation)

### Phase 3C.3: System Intelligence Recommendation Generator (`3d45928`)
- `modules/intelligence/system-recommendation/system-recommendation.types.ts` — `REC_THRESHOLD` (ERROR_COUNT_MIN=3), `RecCheckResult`, `SystemRecGeneratorResult`
- `modules/intelligence/system-recommendation/system-recommendation.service.ts` — pure check functions (`checkErrorDiagnosis`, `checkImportHealth`, `checkWorkflowRecommendation`); orchestrator `runSystemRecommendationGenerator`
- `modules/intelligence/system-recommendation/system-recommendation.actions.ts` — `'use server'` action `generateSystemRecommendationsAction`; calls `requirePermission`, `runSystemRecommendationGenerator`, `revalidatePath`
- `app/(workspace)/[workspaceSlug]/settings/system-intelligence/GenerateRecsButton.tsx` — client component: loading state, calls `generateSystemRecommendationsAction`, displays "Done." or error
- `modules/intelligence/types.agent.ts` — added `SYSTEM_REC_GENERATOR_RUN`, `SYSTEM_REC_GENERATOR_FAILED` (additive)
- `modules/intelligence/repositories/recommendation.repo.ts` — added `listPendingSystemRecs()` for dedup; `Pick<RecommendationRow, 'id' | 'recommendation_type' | 'status'>[]` return type
- `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` — added `GenerateRecsButton` import and button section above Pending System Recommendations card; page remains server component
- `tests/phase3c-system-intelligence.test.ts` — 27 new tests across 9 describe blocks (generator constants, types, service source, actions source, repo function, button component, page integration, guardrails, dedup)

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
| 2026-05-27 | 1048/1048 passed | PASSED | Phase 3F Workflow Execution Visibility — production deployed. No migration. Vercel deployment `dpl_2aiTEQ1eRz7Eus8QNfmmpipAkmaa` live at `https://verian-bios.vercel.app`. Production smoke: passed 14/14 checks. Vercel settings unchanged. Production Supabase untouched (current through `20240032`). |
| 2026-05-27 | 1048/1048 passed | PASSED | Phase 3F Workflow Execution Visibility — 21 new tests, 1027 existing pass. No migration. Staging smoke: login ✓, workspace ✓, lead detail page ✓, Workflow Activity timeline ✓, Email Draft History section ✓, Workflow Errors panel ✓. Tag: `phase-3f-workflow-execution-visibility-v1`. |
| 2026-05-27 | 1027/1027 passed | PASSED | Phase 3E Lead Workflow Control — production deployed. Migration 20240032 applied to production (`kxrplupzbsmujjznzhpy`). Vercel deployment `dpl_GQdBM9Sewy9G4BtSB2aaJQotPQKH` live at `https://verian-bios.vercel.app`. Production smoke: passed. Vercel settings unchanged. |
| 2026-05-27 | 1027/1027 passed | PASSED | Phase 3E Lead Workflow Control — 18 new tests, 1009 existing pass. Migration 20240032 applied to staging. Staging smoke: login ✓, workspace ✓, Workflow Off badge ✓, Enable Workflow ✓, badge→Workflow On ✓, WF On kanban badge ✓, Disable Workflow ✓, WF On badge removed ✓, Revenue Analytics unchanged ✓. 23/23 checklist items passed. Tag: `phase-3e-lead-workflow-control-v1`. |
| 2026-05-27 | 1009/1009 passed | PASSED | Phase 3D Revenue Analytics — 22 new tests, 987 existing pass. Staging smoke: login ✓, workspace ✓, Analytics sidebar link ✓, /main/settings/analytics loads ✓, all 3 panels render ✓, footer links ✓. Tag: `phase-3d-revenue-analytics-v1`. |
| 2026-05-26 | 987/987 passed | PASSED | Phase 3C.6 System Intelligence Wrap-Up — 12 new tests, 975 existing pass. Staging smoke: login ✓, workspace ✓, System Intelligence page ✓, Pending Recommendations ✓, Generate Recommendations ✓. Tag: `phase-3c6-system-intelligence-wrap-up-v1`. |
| 2026-05-26 | 975/975 passed | PASSED | Phase 3C.5 System Intelligence Detail Views — 20 new tests, 955 existing pass. Staging smoke: login ✓, workspace ✓, System Intelligence page ✓, View link visible ✓, detail page loads ✓, lifecycle actions render ✓, Generate Recommendations ✓. Tag: `phase-3c5-system-intelligence-detail-views-v1`. |
| 2026-05-26 | 955/955 passed | PASSED | Phase 3C.4 Workflow & Outbox Error Emission — 25 new tests, 930 existing pass. Staging smoke: login ✓, workspace ✓, System Intelligence page ✓, Critical & Open Errors ✓, Workflow Health ✓, Generate Recommendations ✓. Tag: `phase-3c4-workflow-outbox-error-emission-v1`. |
| 2026-05-26 | 930/930 passed | PASSED | Phase 3C.3 System Intelligence Recommendation Generator — 27 new tests, 903 existing pass. Staging smoke: login ✓, workspace ✓, Generate Recommendations button visible ✓, generates with "Done." ✓. Tag: `phase-3c3-system-intelligence-recommendations-v1`. |
| 2026-05-26 | 903/903 passed (baseline unchanged) | N/A | Track A Deployment Flow Cleanup verified. Test push `cbfb790` (docs-only): staging (`verian-bios-staging`) deployed ✓; production (`verian-bios`) did not deploy ✓; production URL live ✓. No code or migrations changed. |
| 2026-05-26 | 903/903 passed | PASSED | Phase 3C.2 Structured Error Lifecycle Actions — 24 new tests, 879 existing pass. Manual staging smoke: login ✓, workspace ✓, pages ✓. Tag: `phase-3c2-structured-error-lifecycle-v1`. |
| 2026-05-25 | 879/879 passed | PASSED | Staging Foundation v1 locked — migrations 030+031 applied, debug route removed, staging smoke test passed. Tag: `staging-foundation-v1`. |
| 2026-05-25 | 879/879 passed | PASSED | Phase 3C.1 Structured Errors + System Intelligence — 77 new tests, 802 existing pass. Tag: `phase-3c1-system-intelligence-v1`. |
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

`f43f797` — Phase 3F: add workflow execution visibility

### Phase 3F: Workflow Execution Visibility (`f43f797`)
- `modules/intelligence/structured-errors/structured-error.repo.ts` — **modified** — `getWorkflowErrorsForLead(tenantId, leadId)` appended; two-query pattern: `workflow_runs (subject_type='lead', subject_id=leadId, limit 20)` → early return if empty → `automation_failures (workflow_run_id IN runIds, status IN ['open','investigating'], limit 10)`; read-only, tenant-isolated on both queries; no JOIN syntax; no new migration
- `app/(workspace)/[workspaceSlug]/leads/[id]/LeadActivityTimeline.tsx` — **new** — server component (no `'use client'`); `EVENT_LABELS` map (18 event types); `OUTCOME_COLORS` map (7 entries); `formatRelativeTime` inline arithmetic helper; empty state on `events.length === 0`; `occurred_at` displayed as relative time with ISO title tooltip; `event_summary` displayed when present
- `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` — **modified** — 3 new imports (`activityEventRepo`, `structuredErrorRepo`, `LeadActivityTimeline`); `Promise.all` extended from 4 to 6 items (`activityEvents` + `workflowErrors`, both with `.catch(() => [])` non-fatal fallback); JSX extended with Email Draft History card (`emailDrafts.slice(1)`), Workflow Errors card (links to `system-intelligence/errors/[id]`), `LeadActivityTimeline`
- `tests/phase3f-workflow-visibility.test.ts` — **new** — 21 source-reading tests across 6 describe blocks (repo function ×3, timeline structure ×4, timeline display ×3, page data loading ×4, page draft history ×2, page error awareness ×2, guardrails ×3)
- `docs/roadmap/phase-3f-design-test-cases.md` — **new** — Phase 3F design document
- `docs/roadmap/phase-3f-implementation-plan.md` — **new** — Phase 3F implementation plan

### Phase 3E: Lead Workflow Control (`48bfbbb`)
- `supabase/migrations/20240032_phase3e_lead_workflow_enabled.sql` — **new** — `ALTER TABLE leads ADD COLUMN workflow_enabled boolean NOT NULL DEFAULT false`; applied to staging (`smbausuyetlgxflyhmfg`) and production (`kxrplupzbsmujjznzhpy`) 2026-05-27
- `types/database.ts` — **modified** — `workflow_enabled: boolean` added to leads `Row`; `workflow_enabled?: boolean` added to `Insert` and `Update`
- `modules/crm/actions/lead.actions.ts` — **modified** — `setWorkflowEnabledAction(leadId, enabled)` appended; delegates to `leadService.updateLead`; revalidates lead detail and leads list; no `dispatchPendingEvents`; no Resend; no external LLM
- `app/(workspace)/[workspaceSlug]/leads/[id]/WorkflowToggle.tsx` — **new** — `'use client'`; optimistic local state; "Workflow: On/Off" badge; "Enable/Disable Workflow" button; loading state; inline error; calls `setWorkflowEnabledAction`
- `app/(workspace)/[workspaceSlug]/leads/[id]/page.tsx` — **modified** — `WorkflowToggle` imported and rendered below stage/priority/status row; passes `lead.workflow_enabled ?? false` and `lead.id`
- `app/(workspace)/[workspaceSlug]/leads/page.tsx` — **modified** — `LeadCard` gains read-only "WF On" green badge when `lead.workflow_enabled === true`; no interaction on kanban card
- `tests/phase3e-lead-workflow-control.test.ts` — **new** — 18 tests across 6 describe blocks (migration/types ×3, action correctness ×5, action guardrails ×3, toggle structure ×3, detail page integration ×2, kanban indicator ×2); source-reading pattern

### Phase 3D: Revenue Analytics (`08c3cdd`)
- `modules/analytics/analytics.types.ts` — **new** — `LeadPipelineStats`, `EmailSendMetrics`, `LearningSignalRow`, `LearningSignalSummary`, `RevenueDashboard` interfaces
- `modules/analytics/analytics.repo.ts` — **new** — `getLeadPipelineStats` (queries `leads`, 2 parallel sub-queries), `getEmailSendMetrics` (queries `email_sends` + `activity_events` ET_ counts, null-guarded rates), `getLatestLearningSignals` (finds latest `run_id` first, then fetches `strategy_angle`/`message_type` rows), `getOpenErrorCount` (thin count query on `automation_failures`); all use service client + `.eq('tenant_id', tenantId)`
- `modules/analytics/analytics.service.ts` — **new** — `buildRevenueDashboard`: single `Promise.all` across all 4 repo functions; returns `RevenueDashboard` with `generatedAt` timestamp
- `app/(workspace)/[workspaceSlug]/settings/analytics/page.tsx` — **new** — server component (no `'use client'`); `requirePermission(ctx, 'crm.companies.view')`; 4 summary cards; Lead Pipeline panel with `STAGE_ORDER` sort; Email Performance grid with bounce-rate highlight; Strategy Performance panel with `buildSignalMap` helper and two sub-tables; empty states for all zero-data cases; navigation footer
- `components/layout/Sidebar.tsx` — **modified** — added `BarChart2` to lucide-react imports; added Analytics nav item between Imports and Settings
- `tests/phase3d-revenue-analytics.test.ts` — **new** — 22 tests across 5 describe blocks (source-reading pattern)

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
| `20240028` | Phase 3C.1 (see Phase 3C.1 commit `ea4b0b0`) |
| `20240029` | Phase 3C.1 (see Phase 3C.1 commit `ea4b0b0`) |
| `20240030` | Staging Foundation — `service_role` GRANT ALL on all tables/sequences/routines + ALTER DEFAULT PRIVILEGES |
| `20240031` | Staging Foundation — `anon`+`authenticated` GRANT ALL on all tables/sequences/routines + ALTER DEFAULT PRIVILEGES |
| `20240032` | Phase 3E — `ALTER TABLE leads ADD COLUMN workflow_enabled boolean NOT NULL DEFAULT false`; applied to staging (`smbausuyetlgxflyhmfg`) and production (`kxrplupzbsmujjznzhpy`) |

Note: No new migration was added for the Human Review / Approval Bridge, the Send / Email Draft Bridge, or Event Tracking. All three use existing tables and columns only. Phase 3B provenance travels via `email_drafts.ai_generation_metadata` (jsonb) at draft creation, then is copied into `email_sends.metadata` (jsonb) at send time. Event Tracking activity events are appended to the existing `activity_events` table. The Learning Agent adds migration `20240025` for `learning_snapshots` — its only write target.
