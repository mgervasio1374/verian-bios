# Phase 3C.3 — System Intelligence Recommendation Generator
## Design & Test Cases v1.0

**Date:** 2026-05-26
**Status:** DRAFT — awaiting user approval before implementation

---

## 1. Objective

Add a deterministic, on-demand recommendation generator to the System Intelligence layer. When triggered, the generator inspects current system state — open structured errors, failed import batches, workflow health — and writes actionable recommendations to the existing `agent_recommendations` table. The generator is advisory-only, produces no sends, no auto-actions, and respects the same deduplication and tenant-isolation guarantees as all other Phase 3C components.

---

## 2. Problem Being Solved

Phase 3C.1 defined the `SYSTEM_*` recommendation types and created the Pending System Recommendations table on the System Intelligence page. Phase 3C.2 added lifecycle actions for errors and recommendations. However, there is no service that actually *generates* system recommendations — the table is populated only by manual or future external tooling.

Phase 3C.3 closes this gap: a "Generate Recommendations" button on the System Intelligence page runs a generator that evaluates current conditions and writes typed recommendations. Users then triage them via the existing Dismiss action from Phase 3C.2.

---

## 3. System Boundary

**In scope:**
- A new generator service that reads system state and writes to `agent_recommendations`
- A server action that wraps the generator
- A client component "Generate Recommendations" button wired to the server action
- Deduplication: skip a recommendation type if a `pending` rec of that type already exists
- Activity event recording for each generator run (non-fatal)
- 3 recommendation types in scope for v1: `SYSTEM_ERROR_DIAGNOSIS`, `SYSTEM_IMPORT_HEALTH`, `SYSTEM_WORKFLOW_RECOMMENDATION`

**Out of scope for v1:**
- `SYSTEM_PERFORMANCE_WARNING` — insufficient deterministic signal available; deferred
- `SYSTEM_DOCUMENTATION_NEEDED` — requires subjective heuristics; deferred
- Scheduled / automatic generation runs — on-demand only in v1
- LLM-assisted recommendation text — all text is deterministic template strings
- Auto-resolve or auto-dismiss of existing recommendations
- Email or Resend calls of any kind
- New database tables
- New Supabase migrations (all data fits in existing `agent_recommendations` columns)

---

## 4. What Is Explicitly Out of Scope

| Item | Reason |
|------|--------|
| External LLM calls | Deterministic generation is a hard guardrail |
| Scheduled auto-generation | On-demand only in v1, consistent with Learning Agent v1 pattern |
| Auto-dismiss stale recommendations | Human dismissal is the only dismiss path |
| `SYSTEM_PERFORMANCE_WARNING` | Deferred — no clear deterministic threshold available |
| `SYSTEM_DOCUMENTATION_NEEDED` | Deferred — too subjective for deterministic logic |
| Resend / email | Not in scope for any intelligence module |
| New migrations | Existing `agent_recommendations` columns are sufficient |
| New routes | System Intelligence page already exists |
| Writes to messaging tables | Generator touches only `agent_recommendations` and `activity_events` |

---

## 5. Relationship to Phase 3C.1 and Phase 3C.2

| Phase | What it provided | Used by Phase 3C.3 |
|-------|-----------------|---------------------|
| Phase 3C.1 | `agent_recommendations` extended with `source_agent` and `severity` columns; `SYSTEM_*` recommendation types defined in `ActivityEventType`; System Intelligence page reads and displays recs | Generator writes recommendations using these columns and types |
| Phase 3C.1 | `automation_failures` table extended with severity/status/module; `getOpenErrorsSummary` service | Generator reads error state via the same service |
| Phase 3C.1 | `getWorkflowHealth` health service | Generator reads workflow state via the same service |
| Phase 3C.2 | `dismissRecommendationAction` — users can dismiss generated recommendations | Generator output is triaged via the existing Dismiss button |
| Phase 3C.2 | Non-fatal activity event pattern (`.catch(() => {})`) | Generator follows the same pattern |

Phase 3C.3 adds no new tables and does not modify Phase 3C.1 or Phase 3C.2 modules — it only adds a new module and extends the page.

---

## 6. Proposed Architecture

```
System Intelligence Page (server component)
  ├── [existing] Open Errors table + Resolve/Investigate/Ignore buttons
  ├── [existing] Workflow Health summary card
  ├── [existing] Failed Import Batches table
  ├── [existing] Pending System Recommendations table + Dismiss button
  └── [NEW] GenerateRecsButton (client component)
              │
              ▼
       generateSystemRecommendationsAction ('use server')
              │
              ▼
       runSystemRecommendationGenerator(ctx)
              ├── reads: getOpenErrorsSummary(ctx)
              ├── reads: getWorkflowHealth(ctx)
              ├── reads: listFailedImportBatches(tenantId)
              ├── reads: listPendingSystemRecs(tenantId)  ← new repo fn
              ├── evaluates: 3 condition checks (one per rec type)
              ├── writes: agent_recommendations (only for conditions met + no pending dup)
              └── emits: SYSTEM_REC_GENERATOR_RUN activity event (non-fatal)
```

---

## 7. Recommendation Generation Model

### Generator run lifecycle

1. Load current system state (parallel fetches): open errors summary, workflow health, failed import batches, existing pending system recs.
2. For each of the 3 in-scope rec types, evaluate the trigger condition.
3. If the condition is met AND no pending rec of that type already exists: create a new `agent_recommendations` row.
4. If the condition is met BUT a pending rec already exists: skip (dedup). Do not update the existing rec.
5. If the condition is not met: skip.
6. Emit `SYSTEM_REC_GENERATOR_RUN` activity event with counts (created, skipped_dedup, skipped_no_condition).
7. Return a result object: `{ created: number, skippedDedup: number, skippedNoCondition: number }`.

### Trigger conditions and output (v1)

| Rec type | Trigger condition | Severity | Priority | Title template |
|----------|------------------|----------|----------|----------------|
| `SYSTEM_ERROR_DIAGNOSIS` | `criticalCount >= 1` OR `errorCount >= REC_THRESHOLD.ERROR_COUNT_MIN` | `critical` if criticalCount >= 1, else `error` | `high` | "N open critical/error-level failures require investigation" |
| `SYSTEM_IMPORT_HEALTH` | `failedBatchCount >= 1` | `error` | `high` | "N import batch(es) failed or partially committed" |
| `SYSTEM_WORKFLOW_RECOMMENDATION` | `stuckCount >= 1` OR `failedCount >= 1` | `warning` | `medium` | "N stuck and M failed workflow(s) detected" |

### Threshold constants (defined in `system-recommendation.types.ts`)

```typescript
export const REC_THRESHOLD = {
  ERROR_COUNT_MIN: 3,  // minimum non-critical errors to trigger SYSTEM_ERROR_DIAGNOSIS
} as const
```

### Body text

Body text is a deterministic template string summarising counts and advising the user to check the relevant table. No LLM. No external calls. Example:

```
SYSTEM_ERROR_DIAGNOSIS body:
"2 critical and 4 error-level failures are currently open. Review the Critical & Open Errors
table on this page and use Resolve, Investigate, or Ignore to triage each one."
```

### Fields written to agent_recommendations

| Column | Value |
|--------|-------|
| `tenant_id` | `ctx.tenantId` |
| `recommendation_type` | one of the 3 SYSTEM_* types |
| `title` | template string with embedded counts |
| `body` | template string with advisory text |
| `severity` | determined by condition (see table above) |
| `priority` | `'high'` or `'medium'` |
| `source_agent` | `'system_recommendation_generator'` |
| `status` | default `'pending'` (DB default, not written explicitly) |

---

## 8. Diagnostic Logic Model

Each check is a pure function that takes current state and returns a boolean plus recommendation fields:

```typescript
function checkErrorDiagnosis(summary: OpenErrorsSummary): RecCheckResult | null
function checkImportHealth(failedBatches: FailedBatch[]): RecCheckResult | null
function checkWorkflowRecommendation(health: WorkflowHealthReport): RecCheckResult | null
```

Where `RecCheckResult` contains: `{ recommendationType, title, body, severity, priority }`.

All three are pure functions — no DB calls inside. The service calls all three after loading state, then writes results to the DB. This keeps the logic testable without Supabase mocking.

---

## 9. Data Model Impact

**No new migrations required.**

All data is written to the existing `agent_recommendations` table using existing columns. The `source_agent` and `severity` columns were added in Phase 3C.1 migration `20240029`. The `body` column holds the advisory text. No `entity_id` / `entity_type` column is needed — entity context is embedded in the `body` text.

### New read function needed in recommendation.repo.ts

```typescript
// Check for existing pending system recs before creating duplicates
export async function listPendingSystemRecs(tenantId: string): Promise<AgentRecommendationRow[]>
```

Queries `agent_recommendations` where `tenant_id = tenantId AND recommendation_type IN (SYSTEM_REC_TYPES) AND status IN ('pending', 'new')`.

This is the only modification to an existing file outside the new module.

---

## 10. Repository / Service / Module Impact

### New module (all new files)

```
modules/intelligence/system-recommendation/
  system-recommendation.types.ts     ← REC_THRESHOLD constants, RecCheckResult interface,
                                       SystemRecGeneratorResult interface
  system-recommendation.service.ts   ← runSystemRecommendationGenerator(ctx)
  system-recommendation.actions.ts   ← 'use server'; generateSystemRecommendationsAction
```

### Existing files modified

| File | Change |
|------|--------|
| `modules/intelligence/repositories/recommendation.repo.ts` | Add `listPendingSystemRecs(tenantId)` read function |
| `modules/intelligence/types.agent.ts` | Add 2 new `ActivityEventType` constants (additive): `SYSTEM_REC_GENERATOR_RUN`, `SYSTEM_REC_GENERATOR_FAILED` |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` | Import and render `GenerateRecsButton` component |

### New UI component

```
app/(workspace)/[workspaceSlug]/settings/system-intelligence/GenerateRecsButton.tsx
```

A `'use client'` component (the only client component on this page). Pattern mirrors `RunAnalysisButton.tsx` from agent-monitor: manages loading state via `useTransition`, calls the server action. The System Intelligence page itself remains a server component.

---

## 11. UI Impact

**System Intelligence page changes:**

1. Import `GenerateRecsButton` at the top of the page.
2. Add a "Generate Recommendations" section above or within the Pending System Recommendations card:
   - Brief label: "Analyse current system state and generate recommendations."
   - `<GenerateRecsButton />` — triggers `generateSystemRecommendationsAction`
   - After the action completes, `revalidatePath` refreshes the recommendations table.
3. No new routes, no new pages.
4. Page remains a server component.

---

## 12. Agent / Runtime Impact

No Inngest functions, no scheduled runs, no cron jobs in v1. The generator runs only when the user clicks the button. This is intentional — consistent with Learning Agent v1 (scheduled runs added in Phase 3B.1 after the on-demand version was stable).

---

## 13. Event / Logging / Observability Impact

### New ActivityEventType constants (additive to `types.agent.ts`)

| Constant | Value | When emitted |
|----------|-------|-------------|
| `SYSTEM_REC_GENERATOR_RUN` | `'SYSTEM_REC_GENERATOR_RUN'` | After each generator run (success), recording created/skipped counts |
| `SYSTEM_REC_GENERATOR_FAILED` | `'SYSTEM_REC_GENERATOR_FAILED'` | If the generator throws an uncaught error |

### Event emission pattern

Follows the established non-fatal pattern:
```typescript
recordActivityEvent({ ... }).catch(() => {})
```

Generator errors must not block the user-facing response. If the generator itself fails, `SYSTEM_REC_GENERATOR_FAILED` is emitted non-fatally before re-throwing.

### Event payload for SYSTEM_REC_GENERATOR_RUN

```typescript
{
  tenantId, workspaceId, eventType: 'SYSTEM_REC_GENERATOR_RUN',
  eventSource: 'system_intelligence_ui',
  entityType: 'system_recommendation_generator',
  entityId: tenantId,
  properties: {
    created:            number,   // new recs written
    skippedDedup:       number,   // recs skipped because pending already exists
    skippedNoCondition: number,   // conditions not met
  }
}
```

---

## 14. Security / RLS Implications

- Generator reads: uses service client (`createSupabaseServiceClient`) — bypasses RLS, same pattern as all other intelligence modules. All queries are scoped with `.eq('tenant_id', ctx.tenantId)`.
- Generator writes to `agent_recommendations`: service client, tenant-scoped.
- `generateSystemRecommendationsAction` calls `buildRequestContext` + `requirePermission('crm.companies.view')` — same permission gate as all other System Intelligence actions.
- No cross-tenant data access possible: all reads and writes include `tenant_id` filter.
- No new RLS policies needed.

---

## 15. Staging / Prod Safety Considerations

| Concern | Assessment |
|---------|------------|
| Migration on staging | None — no migrations |
| Migration on production | None — no migrations |
| Accidental email send | Impossible — no Resend, no email_sends write |
| Production Supabase writes | Only if explicitly deployed to production via `vercel --prod` — production Supabase is a separate project |
| Staging deployability | Generator is additive; no existing code paths changed |
| Test regression | 903-test baseline preserved; new tests add to the baseline |

---

## 16. Test Strategy

Tests follow the established pattern in `tests/phase3c-system-intelligence.test.ts`: source-code file-content assertions using `fs.readFileSync`. No Supabase mock needed. Pure logic functions (the three `check*` functions) are verified via source content; no runtime DB calls in tests.

Tests appended to `tests/phase3c-system-intelligence.test.ts` (same file as Phase 3C.1 and 3C.2 tests).

---

## 17. Specific Test Cases

The following test cases will be added as new `describe` blocks in `tests/phase3c-system-intelligence.test.ts`:

### Block 1 — ActivityEventType: generator constants (2 tests)

```
TC-3C3-001  SYSTEM_REC_GENERATOR_RUN is defined in ActivityEventType
TC-3C3-002  SYSTEM_REC_GENERATOR_FAILED is defined in ActivityEventType
```

### Block 2 — system-recommendation.types.ts: constants (3 tests)

```
TC-3C3-003  REC_THRESHOLD constant is exported
TC-3C3-004  REC_THRESHOLD.ERROR_COUNT_MIN is a positive integer
TC-3C3-005  RecCheckResult interface shape is present in types file
```

### Block 3 — system-recommendation.service.ts: source assertions (5 tests)

```
TC-3C3-006  exports runSystemRecommendationGenerator
TC-3C3-007  service uses service client (createSupabaseServiceClient), not user client
TC-3C3-008  service does not call Resend or nodemailer
TC-3C3-009  service does not write to email_drafts or email_sends
TC-3C3-010  service emits SYSTEM_REC_GENERATOR_RUN activity event
```

### Block 4 — system-recommendation.actions.ts: source assertions (3 tests)

```
TC-3C3-011  actions file has 'use server' directive
TC-3C3-012  exports generateSystemRecommendationsAction
TC-3C3-013  actions file calls revalidatePath
```

### Block 5 — recommendation.repo.ts: new function (2 tests)

```
TC-3C3-014  exports listPendingSystemRecs
TC-3C3-015  listPendingSystemRecs filters by tenant_id and system rec types
```

### Block 6 — GenerateRecsButton client component (3 tests)

```
TC-3C3-016  GenerateRecsButton.tsx exists
TC-3C3-017  GenerateRecsButton.tsx has 'use client' directive
TC-3C3-018  GenerateRecsButton.tsx references generateSystemRecommendationsAction
```

### Block 7 — System Intelligence page: generator integration (3 tests)

```
TC-3C3-019  page imports GenerateRecsButton
TC-3C3-020  page renders GenerateRecsButton
TC-3C3-021  page remains a server component (no 'use client')
```

### Block 8 — Guardrail: no messaging table writes in new module (4 tests)

```
TC-3C3-022  system-recommendation.service.ts does not write to email_drafts
TC-3C3-023  system-recommendation.service.ts does not write to email_sends
TC-3C3-024  system-recommendation.service.ts does not call sendApprovedDraftAction
TC-3C3-025  system-recommendation.service.ts does not call external LLMs (no 'openai', no 'anthropic')
```

### Block 9 — Guardrail: deduplication (2 tests)

```
TC-3C3-026  system-recommendation.service.ts references listPendingSystemRecs (dedup check)
TC-3C3-027  system-recommendation.service.ts uses source_agent 'system_recommendation_generator'
```

**Total new test cases: 27**
**Projected test baseline after Phase 3C.3: 930/930**

---

## 18. Risks and Open Questions

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Generator fires repeatedly, creating many recommendations | Low | Deduplication check: skip if pending rec of same type exists |
| `listPendingSystemRecs` returns stale data if recs were just dismissed | Very low | Supabase reads are consistent within a request; page revalidates after action |
| Threshold constants too aggressive (too many recs generated) | Low | Constants are defined explicitly; can be tuned without a migration |
| Page performance degradation from extra DB read | Low | `listPendingSystemRecs` is a lightweight SELECT; runs in parallel with other page queries |
| `recommendation.repo.ts` modification breaks existing recommendation write paths | Low | `listPendingSystemRecs` is additive (new function only); existing functions untouched |

### Open Questions

| # | Question | Default if not answered |
|---|----------|------------------------|
| Q1 | Should `REC_THRESHOLD.ERROR_COUNT_MIN` be 3, or a different value? | Default: 3 |
| Q2 | Should the generator button appear inside the Pending System Recommendations card or above it as a standalone section? | Default: small section above the recommendations table, with a one-line label |
| Q3 | Should `SYSTEM_REC_GENERATOR_RUN` activity event be emitted even when 0 new recs are created (all conditions met but all deduped)? | Default: yes — record all runs for observability |
| Q4 | Should the generator result (created/skipped counts) be displayed in the UI after the button click? | Default: no — page revalidates and shows the updated recommendations table; no result toast in v1 |
| Q5 | Should `workspace_id` be included in `agent_recommendations` writes? | Default: yes, from `ctx.workspaceId` — consistent with how structured errors are written |

---

## 19. Approval Checkpoint Before Implementation

This document must be reviewed and approved before any code is written.

**Questions to resolve before implementation:**
- [ ] Q1–Q5 above answered or accepted as defaults
- [ ] 27 test cases confirmed as sufficient
- [ ] Module path `modules/intelligence/system-recommendation/` approved
- [ ] Client component name `GenerateRecsButton.tsx` approved
- [ ] `recommendation.repo.ts` modification (adding `listPendingSystemRecs`) approved
- [ ] 3 rec types in scope confirmed; 2 deferred types confirmed

**After approval, follow the standard sequence:**
1. ~~Design & Test Cases~~ — this document (pending approval)
2. Implementation Plan — produce document, get approval
3. Code — follow locked plan
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag
6. Update `docs/ai-context/` files
