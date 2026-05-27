# Phase 3C — System Intelligence: Wrap-Up Review
## Review Document v1.0

**Date:** 2026-05-26
**Status:** Review complete — pending user direction
**Scope reviewed:** Phase 3C.1 through Phase 3C.6 (all six sub-phases)
**Test baseline at review:** 987/987
**Build baseline at review:** clean, 34 routes

---

## 1. Executive Summary

Phase 3C delivered a complete first-pass **System Intelligence** surface for Verian BIOS. Starting from a bare `automation_failures` table extended in Phase 3C.1, the six sub-phases built a coherent operator-facing triage and advisory loop:

- **Errors surface automatically** from four emission callsites (import pipeline, Inngest import handler, workflow failure, outbox dispatch failure)
- **Operators triage errors** via a list page with inline Resolve / Investigate / Ignore actions and a full detail page showing all metadata including the resolving user
- **The generator produces advisory recommendations** on demand from four signal types, deduplicates, and surfaces them in the UI for dismissal
- **No auto-actions, no email sending, no external LLM calls** — the entire surface is read-only advisory intelligence

The system is coherent, guarded, and staging-verified. All 987 tests pass. Six lock tags mark the delivery boundary cleanly.

---

## 2. Phase-by-Phase Delivery Summary

| Phase | Tag | Commit | Tests Added | Key Deliverable |
|-------|-----|--------|-------------|-----------------|
| 3C.1 — Foundation | `phase-3c1-system-intelligence-v1` | `ea4b0b0` | 77 | Schema extensions (migrations 028–029), System Intelligence page, health service integration |
| 3C.2 — Lifecycle Actions | `phase-3c2-structured-error-lifecycle-v1` | `b5ab433` | 24 | Resolve/Investigate/Ignore/Dismiss server actions; error emission in import pipeline |
| 3C.3 — Recommendation Generator | `phase-3c3-system-intelligence-recommendations-v1` | `3d45928` | 27 | On-demand generator; 3 rec types; deduplication; GenerateRecsButton |
| 3C.4 — Workflow & Outbox Emission | `phase-3c4-workflow-outbox-error-emission-v1` | `f465795` | 25 | `WORKFLOW_RUN_FAILED` and `OUTBOX_EVENT_DISPATCH_FAILED` non-fatal emission |
| 3C.5 — Detail Views | `phase-3c5-system-intelligence-detail-views-v1` | `bce57a2` | 20 | `getStructuredErrorById`; full error detail page; View link; dual revalidation |
| 3C.6 — Wrap-Up | `phase-3c6-system-intelligence-wrap-up-v1` | `9a32d3c` | 12 | `resolved_by` attribution; `SYSTEM_PERFORMANCE_WARNING` generator |
| **Total** | | | **185** | |

All 185 Phase 3C tests are currently green. No migrations were created in 3C.2–3C.6. The only schema changes for Phase 3C are migrations `20240028` and `20240029` (Phase 3C.1).

---

## 3. Current System Intelligence Capabilities

The System Intelligence page (`/[workspaceSlug]/settings/system-intelligence`) is a single server component with no client-side state. On each page load it fetches in parallel:

| Data source | Query | Display |
|-------------|-------|---------|
| `getOpenErrorsSummary` | Open + investigating errors, severity stats | 4 summary cards + Critical & Open Errors table |
| `getWorkflowHealth` | Stuck/failed workflows, pending outbox | Workflow Health summary |
| `agent_recommendations` | Pending/new recs of `SYSTEM_REC_TYPES` | Pending System Recommendations table |
| `import_batches` | Failed/partially_committed batches | Failed & Partially-Committed Imports table |

**Summary cards:** Open Errors count, Critical/Error count, Failed Batches count, System Recs pending count.

**Critical & Open Errors table:** Up to 20 open/investigating errors; columns: failure_type, severity badge, module, message (truncated), created date; per-row Resolve/Investigate/Ignore inline forms; per-row **View** link → detail page.

**Workflow Health card:** Stuck workflows, failed workflows, pending outbox event count; link → `/settings/health`.

**Failed & Partially-Committed Imports card:** Filename, status badge, total/committed/failed row counts, created date; link → `/settings/imports/[batchId]`.

**Generate Recommendations button:** Triggers the on-demand generator; shows loading state ("Analysing…") and result ("Done." or error message).

**Pending System Recommendations table:** Up to 20 pending recs; columns: recommendation_type, title, severity badge, source_agent, created date; per-row Dismiss form.

**Navigation footer:** Links to Workflow Health, Agent Monitor, Data Imports.

---

## 4. Current Structured Error Lifecycle

### Emission callsites (all non-fatal — `.catch(() => {})`)

| Callsite | Trigger | Failure type | Severity |
|----------|---------|--------------|----------|
| `import.service.ts` → `commitBatch` | Catastrophic commit failure | `IMPORT_COMMIT_FAILURE` | `error` |
| `inngest/process-import-batch.ts` | Inngest batch commit failure | `INNGEST_IMPORT_BATCH_FAILURE` | `error` |
| `workflow-run.service.ts` → `failWorkflowRun` | Workflow run transitions to failed | `WORKFLOW_RUN_FAILED` | `error` |
| `event-dispatch.service.ts` → `dispatchPendingEvents` | Outbox event reaches 5th dispatch attempt | `OUTBOX_EVENT_DISPATCH_FAILED` | `error` |

All emit to `automation_failures` with `status: 'open'`, `resolved: false`. The workflow callsite populates `workflow_run_id`. The outbox callsite populates `context: { event_id, event_type, attempts: 5 }`.

### Status transitions

```
open → investigating   (investigateErrorAction)
open → resolved        (resolveErrorAction, writes resolved_at + resolved_by = ctx.userId)
open → ignored         (ignoreErrorAction)
investigating → resolved
investigating → ignored
```

Status transitions are enforced by `updateErrorStatus` (investigate/ignore) and `resolveStructuredError` (resolve). All go through `RequestContext` for tenant isolation. All emit activity events non-fatally.

### Tenant isolation

All repo functions enforce `.eq('tenant_id', tenantId)` — no cross-tenant reads or writes. `getStructuredErrorById` returns `null` (→ `notFound()`) rather than leaking a 404 message if the record belongs to another tenant.

---

## 5. Current Recommendation Generator Capabilities

### Check functions (4 total, all pure)

| Function | Trigger condition | Rec type | Severity | Priority |
|----------|------------------|----------|----------|----------|
| `checkErrorDiagnosis` | criticalErrors ≥ 1 OR error-level count ≥ 3 | `SYSTEM_ERROR_DIAGNOSIS` | critical / error | high |
| `checkImportHealth` | failed/partially_committed batches ≥ 1 | `SYSTEM_IMPORT_HEALTH` | error | high |
| `checkWorkflowRecommendation` | stuck workflows ≥ 1 OR failed workflows ≥ 1 | `SYSTEM_WORKFLOW_RECOMMENDATION` | warning | medium |
| `checkPerformanceWarning` | pending outbox count ≥ 10 | `SYSTEM_PERFORMANCE_WARNING` | warning | medium |

### Orchestration

All four data sources are fetched in a single `Promise.all`. The checks array is evaluated sequentially. Any rec type already in `pendingTypes` (from `listPendingSystemRecs`) is skipped (deduplication). Passing checks are persisted to `agent_recommendations` via `persistRecommendation`. Activity events (`SYSTEM_REC_GENERATOR_RUN` / `SYSTEM_REC_GENERATOR_FAILED`) are emitted non-fatally.

### Advisory guarantee

No check function writes anywhere other than `agent_recommendations`. No auto-actions, no Resend calls, no external LLMs. The list page filter (`SYSTEM_REC_TYPES`) covers all four generated types plus `SYSTEM_DOCUMENTATION_NEEDED` (not yet generated — see §9).

---

## 6. Current Workflow / Outbox Error Emission Behavior

### `failWorkflowRun` (workflow-run.service.ts)

When a workflow run transitions to `failed`, `createStructuredError` is called with:
- `failureType: WORKFLOW_FAILURE_TYPE.WORKFLOW_RUN_FAILED`
- `severity: 'error'`
- `module: 'workflow_runs'`
- `workflowRunId: run.id`
- `errorMessage: error.message`

The error appears immediately in the Critical & Open Errors table on the System Intelligence page.

### `dispatchPendingEvents` (event-dispatch.service.ts)

When an outbox event exhausts all 5 dispatch attempts (guarded by `event.attempts + 1 >= 5`), `createStructuredError` is called with:
- `failureType: WORKFLOW_FAILURE_TYPE.OUTBOX_EVENT_DISPATCH_FAILED`
- `severity: 'error'`
- `module: 'event_dispatch_queue'`
- `context: { event_id, event_type, attempts: 5 }`

The guard prevents duplicate rows on retries 1–4.

Both emissions are **non-fatal** — the underlying `failWorkflowRun` and `dispatchPendingEvents` behaviors are completely unchanged. If the DB write fails, the error is silently swallowed and the workflow/outbox path continues normally.

---

## 7. Current Detail View Capabilities

The error detail page (`/[workspaceSlug]/settings/system-intelligence/errors/[errorId]`) is a full server component. It calls `getStructuredErrorById(errorId, ctx.tenantId)` and returns `notFound()` on null.

**Cards rendered (conditional where noted):**

| Card | Always? | Content |
|------|---------|---------|
| Error Details | Always | module, route, error_code, error_message |
| Correlation & Tracing | Always | correlation_id, workflow_run_id, job_execution_id |
| Context | Only if non-empty JSON | `context` jsonb pretty-printed |
| Payload Snapshot | Only if non-empty JSON | `payload_snapshot` jsonb pretty-printed |
| Stack Trace | Only if present | `stack_trace` pre-formatted |
| Resolution | Only if `resolved = true` | resolved_at, resolved_by (populated since Phase 3C.6) |
| Lifecycle actions | Only if open or investigating | Resolve / Investigate / Ignore forms with `errorId` for dual revalidation |

**Dual revalidation:** Lifecycle actions on the detail page pass `name="errorId"` in the form, triggering a second `revalidatePath` on the detail page in addition to the list page. List-page callers omit `errorId`, so the conditional revalidation never fires from the list context.

**Direct URL access:** No status filter — resolved and ignored errors remain accessible via direct URL for audit purposes.

---

## 8. Guardrails Preserved Across All of Phase 3C

| Guardrail | Status |
|-----------|--------|
| No production modifications | Preserved — no production migrations, no production Supabase writes |
| No Vercel settings changes | Preserved — Track A disconnect unchanged throughout |
| No migrations (3C.2–3C.6) | Preserved — all 5 subsequent phases use only existing columns |
| No email / Resend calls | Preserved — confirmed in every phase lock report |
| No external LLM calls | Preserved — all recommendation text is deterministic template strings |
| All error emission is non-fatal | Preserved — every emission callsite uses `.catch(() => {})` |
| Tenant isolation enforced at repo layer | Preserved — `.eq('tenant_id', tenantId)` on all reads and writes |
| Recommendations are advisory only | Preserved — writes to `agent_recommendations` only; no auto-actions |
| Staging remains deployable | Preserved — every phase smoke-tested on `verian-bios-staging` |
| Tests stay green | Preserved — 879 → 903 → 930 → 955 → 975 → 987; no regressions |
| Production Vercel is manual-only | Preserved — no phase triggered a production auto-deploy |
| Phase 3A / 3B modules locked | Preserved — only `modules/intelligence/` and `modules/workflow/services/` modified |

---

## 9. Known Limitations / Accepted Gaps

These items were explicitly accepted as out-of-scope during Phase 3C design reviews. They are documented here for Phase 3D or Phase 3C.7 planning.

| Gap | Impact | Accepted in |
|-----|--------|-------------|
| **`listOpenErrors` cap is 50 rows** — the list page itself shows only 20 (critical/error filter); in high-volume error environments some errors may not surface | Low for current usage; could hide errors at scale | Phase 3C.5 design |
| **No pagination / search on the Critical & Open Errors list** | Operators cannot browse beyond the top rows if many errors accumulate | Phase 3C.5 design |
| **`SYSTEM_DOCUMENTATION_NEEDED` rec type** — present in `SYSTEM_REC_TYPES` filter on the list page but no check function produces it | Dead filter entry; harmless but could confuse future developers | Phase 3C.6 design |
| **No back-fill of `resolved_by` for pre-Phase-3C.6 resolved rows** | Rows resolved before `9a32d3c` will always show "Resolved by —" | Phase 3C.6 design |
| **Duplicate `failWorkflowRun` emission** — if `failWorkflowRun` is called more than once for the same `run.id`, multiple `automation_failures` rows are created | Low risk in current code paths; could produce noisy duplicate errors | Phase 3C.4 design |
| **Outbox restart gap** — if the process restarts between `markEventDispatchFailed` and the non-fatal structured error emission, the error row may not be written | Low risk in normal operations; a workflow failure reconciler would close this | Phase 3C.4 design |
| **No auto-resolve on workflow retry success** — if a failed workflow run is later retried and completes, its `automation_failures` row remains open until manually resolved | Requires cross-module event coupling; deferred | Phase 3C.4 design |
| **No `ignored_by` / `investigated_by` attribution** — only `resolved_by` is written; ignore and investigate transitions have no user attribution in the schema | Schema doesn't have these columns; would require a migration | Phase 3C.6 design |
| **No severity escalation** — a failure that recurs many times within a time window is not escalated to critical | Future work; requires a scheduled scan job | Out of scope throughout |

---

## 10. Recommended Next Phase Options

### Option A — Phase 3C.7: Targeted Hardening (small scope)

A single focused phase to close the most impactful open gaps before advancing to Phase 3D.

**Highest-value candidates (in priority order):**

1. **Workflow failure reconciler** — scan `workflow_runs.status = 'failed'` and back-fill missing `automation_failures` rows. Closes the outbox restart gap and the duplicate emission problem. Requires a scheduled Inngest function (existing pattern from Phase 3B.1) and no new migrations.

2. **`SYSTEM_DOCUMENTATION_NEEDED` removal or implementation** — either remove the dead type from `SYSTEM_REC_TYPES` (1-line change) or add a `checkDocumentationNeeded` function. Removing it is lower risk; implementing requires defining a clear automated trigger.

3. **Pagination or row-limit increase** — increase `listOpenErrors` limit and add a "Show more" mechanism or server-side pagination. Prevents errors from being hidden at scale.

Estimated scope: 3–5 files, no new migrations, small test expansion (~8–12 tests). Could be done in one session.

---

### Option B — Declare Phase 3C Complete, Advance to Phase 3D

Phase 3C has delivered a coherent and well-tested System Intelligence surface. The remaining gaps are:
- All explicitly accepted during design reviews
- All low-risk at current usage volumes
- All well-documented in this review and in the individual lock reports

Declaring Phase 3C complete and beginning Phase 3D design is a legitimate choice. The accepted gaps can be addressed as part of Phase 3D hardening or as a standalone future micro-phase.

**Prerequisite before Phase 3D code:** an approved Phase 3D design document following the standard sequence.

---

### Option C — Phase 3C.7 (minimal): Remove Dead Filter Entry Only

The smallest possible Phase 3C.7: remove `SYSTEM_DOCUMENTATION_NEEDED` from the `SYSTEM_REC_TYPES` array in `page.tsx`. This is a 1-line change that cleans up the dead filter entry without opening any new scope. All other gaps remain accepted.

---

## 11. Recommended Phase 3C.7 Scope

If Phase 3C.7 proceeds, the recommended scope (in priority order) is:

**Tier 1 — High value, no migrations required:**
- Add `checkDocumentationNeeded` generator function OR remove `SYSTEM_DOCUMENTATION_NEEDED` from the filter (decision: does a clear automated trigger exist?)
- Increase `listOpenErrors` default limit to 100; update list page to show top 50 (up from 20); add a "View all" link to a future paginated view if needed

**Tier 2 — Medium value, no migrations required:**
- Workflow failure reconciler Inngest function: `*/30 * * * *`; scans `workflow_runs.status = 'failed'`; back-fills missing `automation_failures` rows; emits `WORKFLOW_RECONCILER_RUN` activity event

**Out of scope for Phase 3C.7:**
- `ignored_by` / `investigated_by` attribution (requires migration)
- Auto-resolve on workflow retry (requires cross-module event coupling)
- Severity escalation (requires scheduled scan + schema changes)

Estimated test additions for Tier 1 + Tier 2: ~10–15 tests.

---

## 12. Whether Phase 3C Should Be Considered Complete

**Yes — Phase 3C is functionally complete as designed.**

Every capability scoped during Phase 3C planning has been delivered:

| Planned capability | Delivered |
|-------------------|-----------|
| Structured error schema and emission infrastructure | Phase 3C.1 ✓ |
| Error lifecycle actions (resolve/investigate/ignore) | Phase 3C.2 ✓ |
| Recommendation dismissal | Phase 3C.2 ✓ |
| Error emission from import pipeline | Phase 3C.2 ✓ |
| On-demand recommendation generator | Phase 3C.3 ✓ |
| Error emission from workflow failures | Phase 3C.4 ✓ |
| Error emission from outbox failures | Phase 3C.4 ✓ |
| Error detail page with full metadata | Phase 3C.5 ✓ |
| `resolved_by` attribution | Phase 3C.6 ✓ |
| Performance warning recommendation | Phase 3C.6 ✓ |

The remaining items were explicitly deferred during design. Phase 3C can be closed and Phase 3D can begin.

---

## 13. Risks Before Moving to Phase 3D

| Risk | Severity | Mitigation |
|------|----------|------------|
| **High-volume error accumulation** — if a bug causes many errors before operators notice, the 50-row cap could hide them | Low at current scale; medium at production scale | Address in Phase 3C.7 or early Phase 3D |
| **Duplicate `failWorkflowRun` rows** — noisy duplicate errors in the System Intelligence list | Low at current code path volume | Document in code comment; address in Phase 3C.7 reconciler if needed |
| **Dead `SYSTEM_DOCUMENTATION_NEEDED` filter** — future developer confusion | Very low | Remove in Phase 3C.7 (trivial) or accept as a minor cleanup debt |
| **Production Vercel manual-only** — every production deploy requires explicit action | Process risk, not code risk | Covered by Track A guardrails; document in deployment runbook before Phase 3D |
| **Production Supabase has no Phase 3C migrations** | Process risk | Migrations 028–031 must be applied to production before Phase 3C features go live; explicit action required when production deployment is planned |

**No blocking risks.** Phase 3D design can begin immediately. The code is clean, the guardrails are in force, and the test baseline is green.

---

## 14. Final Recommendation

**Phase 3C is complete. Phase 3D design may begin.**

The choice between Option A (Phase 3C.7 first) and Option B (advance directly to Phase 3D) comes down to one question: **Is any of the accepted gap items causing operator pain in staging right now?**

- If yes → Phase 3C.7 (Tier 1 only — documentation needed cleanup + list cap increase). Estimated one session.
- If no → Skip Phase 3C.7. Declare Phase 3C closed. Begin Phase 3D design. The gaps are well-documented and can be addressed as Phase 3D maintenance items or a future micro-phase.

**Either choice is safe.** The codebase is clean, all guardrails are preserved, and 987/987 tests provide a stable baseline for whatever comes next.

If Phase 3D is chosen next, the standard sequence applies:

1. Phase 3D Design & Test Cases — produce document, get user approval
2. Phase 3D Implementation Plan — produce document, get user approval
3. Code implementation — follow locked plan
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag, push
6. Update `docs/ai-context/` files
