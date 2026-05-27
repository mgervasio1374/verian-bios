# Phase 3D — Revenue Analytics: Design & Test Cases

**Date:** 2026-05-26
**Status:** Draft — awaiting approval
**Author:** Claude (AI context)
**Baseline:** `835e11c` — Phase 3C complete, 987/987 tests, build clean

---

## 1. Phase 3D Objective

Build a **Revenue Analytics** page — a new business intelligence surface that aggregates the data already collected by Phase 3A (lead scoring), Phase 3B (email pipeline and learning), and Phase 3C (system intelligence) into performance metrics and trend views for operators.

The result is one new settings page (`/[workspaceSlug]/settings/analytics`), one new module (`modules/analytics/`), and no new database schema.

---

## 2. Problem Being Solved

The existing dashboard (`/[workspaceSlug]/dashboard`) answers: *"What needs my attention right now?"* It is operational — recommendations, agent runs, pending approvals, recent activity.

No surface answers: *"How is our outbound revenue operation performing?"*

Without a performance view, operators cannot:

- See email delivery, open, click, bounce, and complaint rates in one place
- Understand which message strategy angles are converting vs underperforming
- Track how the lead pipeline is distributed across stages
- Make data-driven decisions about outreach cadence and strategy tuning

This gap matters because the system has been collecting the answer since Phase 3B:

- `email_sends` records the outcome of every send (sent, delivered, bounced, complained, failed)
- `learning_snapshots` stores pre-computed rate signals per strategy angle, message type, score band, and other dimensions — as produced by the Learning Agent
- `leads` records stage and workflow status for every prospect
- `activity_events` records every ET_ event (open, click, bounce, complaint, etc.)

Phase 3D surfaces this data without requiring any new data collection.

---

## 3. Why Phase 3C Is Complete Enough to Proceed

Phase 3C delivered a coherent, staging-verified System Intelligence surface covering:
- Structured error capture from all four emission callsites
- Full lifecycle actions (Resolve / Investigate / Ignore / Dismiss)
- On-demand advisory recommendation generator
- Error detail views with dual revalidation
- `resolved_by` attribution and `SYSTEM_PERFORMANCE_WARNING` generation

All 987 tests pass. No blockers remain in Phase 3C. The accepted gaps (50-row cap, duplicate emission, dead filter entry) are low-risk at current usage volumes and can be addressed as part of a later maintenance pass or as Phase 3C.7. Phase 3D design can begin.

---

## 4. Proposed Phase 3D Scope

### Recommendation

**Phase 3D: Revenue Analytics — v1**

Deliver a single new page with three analytical panels, a new lightweight analytics module, and a sidebar navigation link.

### Deliverables

| Deliverable | Description |
|-------------|-------------|
| `modules/analytics/analytics.types.ts` | Interfaces for all analytics structs |
| `modules/analytics/analytics.repo.ts` | 4 read-only query functions (all tenant-isolated) |
| `modules/analytics/analytics.service.ts` | Orchestrator — fetches all sources in parallel, computes rates |
| `app/(workspace)/[workspaceSlug]/settings/analytics/page.tsx` | Server component — renders 3 panels |
| Sidebar nav link | Add "Analytics" link to the settings navigation |
| `tests/phase3d-revenue-analytics.test.ts` | New test suite — target ~20 tests |

### Page Layout (v1, 30-day fixed window)

**Panel 1 — Lead Pipeline**
- Total active leads
- Lead count by stage (as a table: stage name, count, percentage of total)
- New leads in the last 30 days
- Workflow-enabled vs disabled count

**Panel 2 — Email Performance**
- Source: `email_sends` status counts (same pattern as `health.repo.getEmailSendStatusCounts`)
- 30-day window applied on `email_sends.created_at`
- Metrics displayed: Total Sends, Delivery Rate, Bounce Rate, Complaint Rate
- Open Rate and Click Rate: sourced from `activity_events` ET_EMAIL_OPENED and ET_EMAIL_CLICKED counts (30-day window, Phase 3B sends only)
- Null rates displayed as "—" when denominator is zero

**Panel 3 — Strategy Performance (Learning Signals)**
- Source: `learning_snapshots` — the most recent Learning Agent run for the tenant
- Display: filtered to `dimension = 'strategy_angle'` — shows delivery_rate, open_rate, click_rate per angle
- Second sub-table: `dimension = 'message_type'` — same metrics per message type
- Sample N and confidence badge per row
- If no Learning Agent run has been completed: "No learning data yet. Run the Learning Analysis from Agent Monitor to generate signals."

**Summary cards at top:** Total Leads, Total Sends (30d), Delivery Rate, Latest LA Run date

**Navigation footer:** Links to Agent Monitor, System Intelligence, Workflow Health

---

## 5. What Is Explicitly Out of Scope

| Item | Reason |
|------|--------|
| Date range picker / configurable lookback | v1 uses 30-day fixed window; date filtering is future scope |
| Charts or graphs (bar, line, pie) | Server components only; interactive charts require client state; deferred to v2 |
| Lead stage conversion rate between stages | Requires historical stage-change events not yet captured; deferred |
| Revenue forecasting or deal value rollup | Requires `estimated_value` aggregation design; future scope |
| Per-lead analytics drill-down | Lead detail pages are out of scope for Phase 3D |
| Per-company analytics | Company scoring already exists; aggregate view is future scope |
| Comparison periods (this month vs last month) | Single window in v1 |
| Export (CSV, PDF) | Future scope |
| Scheduled report delivery | No Resend in Phase 3D |
| Real-time auto-refresh | Static server render is correct for v1 |
| Modifying any learning signals or strategy parameters | Analytics is read-only; learning loop is advisory-only (Phase 3B guardrail) |

---

## 6. Relationship to Phase 3A, 3B, and 3C

| Phase | Contribution to Phase 3D |
|-------|--------------------------|
| **Phase 3A** — Lead scoring | `leads` table (pipeline funnel); `fit_scores`, `urgency_scores` (future drill-down) |
| **Phase 3B** — Email pipeline | `email_sends` (email performance); `activity_events` ET_ events (open/click rates); `learning_snapshots` (strategy signals); `message_strategies` (strategy angle labels) |
| **Phase 3B.1** — Stabilization | `health.repo.getEmailSendStatusCounts` pattern reused in analytics repo |
| **Phase 3B.2** — Data import | `import_batches` (import health mini-card, future) |
| **Phase 3C** — System intelligence | `automation_failures` count (mini summary card only); structured error lifecycle unchanged |

Phase 3D is **read-only aggregation** of existing tables. It does not modify any Phase 3A, 3B, or 3C modules.

---

## 7. Proposed Architecture

```
modules/analytics/
  analytics.types.ts       ← All interfaces (no external deps)
  analytics.repo.ts        ← 4 read-only query functions, service client
  analytics.service.ts     ← Orchestrator: Promise.all, rate calculations

app/(workspace)/[workspaceSlug]/settings/analytics/
  page.tsx                 ← Server component, calls analytics.service.buildRevenueDashboard
```

No client components. No `'use client'` in the analytics module or page. All data fetched server-side on page load.

The analytics module is independent — it does not import from `modules/intelligence/`, `modules/workflow/`, or `modules/messaging/`. It reads directly from the relevant tables via the service client (same pattern as all other repo files in the codebase).

---

## 8. Data Model Impact

**No new migrations.** All data is in existing tables:

| Table | Used for |
|-------|----------|
| `leads` | Pipeline funnel: stage counts, new-in-30-days, workflow_enabled |
| `email_sends` | Email performance: status counts (sent/delivered/bounced/complained/failed) with 30-day filter |
| `activity_events` | Open/click rates: ET_EMAIL_OPENED and ET_EMAIL_CLICKED counts (30-day, Phase 3B sends) |
| `learning_snapshots` | Strategy performance: latest run's signals by dimension |
| `automation_failures` | Mini summary: open error count (reuses existing `getOpenErrorsSummary`) |

**Next available migration number remains `20240032`.**

---

## 9. Repository / Service / Module Impact

### New files (all in `modules/analytics/`)

**`analytics.types.ts`** — interfaces only:

```typescript
export interface LeadPipelineStats {
  total: number
  newLast30Days: number
  workflowEnabled: number
  workflowDisabled: number
  byStage: Record<string, number>      // stage → count
  byPriority: Record<string, number>   // priority → count
}

export interface EmailSendMetrics {
  windowDays: number
  totalSends: number
  delivered: number
  bounced: number
  complained: number
  failed: number
  openEvents: number      // ET_EMAIL_OPENED activity events
  clickEvents: number     // ET_EMAIL_CLICKED activity events
  deliveryRate: number | null     // delivered / totalSends
  bounceRate: number | null       // bounced / totalSends
  complaintRate: number | null    // complained / totalSends
  openRate: number | null         // openEvents / delivered
  clickRate: number | null        // clickEvents / delivered
}

export interface LearningSignalRow {
  dimension: string
  dimensionValue: string
  signalName: string
  rate: number | null
  sampleN: number
  confidence: string
  computedAt: string
}

export interface LearningSignalSummary {
  latestRunId: string | null
  latestRunAt: string | null
  signals: LearningSignalRow[]
}

export interface RevenueDashboard {
  pipeline: LeadPipelineStats
  emailMetrics: EmailSendMetrics
  learningSignals: LearningSignalSummary
  openErrorCount: number
  generatedAt: string
}
```

**`analytics.repo.ts`** — 4 functions:

```typescript
// 1. Aggregate lead counts by stage, priority, workflow_enabled
export async function getLeadPipelineStats(tenantId: string): Promise<LeadPipelineStats>

// 2. Email send status counts for a rolling window
export async function getEmailSendMetrics(tenantId: string, windowDays: number): Promise<EmailSendMetrics>
  // Queries email_sends for status counts (same pattern as health.repo.getEmailSendStatusCounts)
  // Also queries activity_events for ET_EMAIL_OPENED and ET_EMAIL_CLICKED counts

// 3. Latest Learning Agent run signals for the tenant
export async function getLatestLearningSignals(tenantId: string): Promise<LearningSignalSummary>
  // Gets MAX(computed_at) run for the tenant, then all rows for that run_id
  // Returns { latestRunId: null, signals: [] } when no runs exist

// 4. Open structured error count (thin wrapper — avoids re-importing health service)
export async function getOpenErrorCount(tenantId: string): Promise<number>
  // SELECT COUNT(*) FROM automation_failures WHERE tenant_id = ? AND status IN ('open','investigating')
```

**`analytics.service.ts`** — one exported function:

```typescript
export async function buildRevenueDashboard(ctx: RequestContext): Promise<RevenueDashboard>
  // Fetches all 4 sources in Promise.all
  // Calculates all rates (guards against division by zero → null)
  // Returns typed RevenueDashboard
```

### Existing files touched

| File | Change |
|------|--------|
| Settings sidebar nav component | Add "Analytics" link |
| `modules/intelligence/types.agent.ts` | Add 2 new activity event types: `ANALYTICS_DASHBOARD_VIEWED` (optional, for audit trail) |

**Note:** The `ANALYTICS_DASHBOARD_VIEWED` activity event is optional and can be deferred. The core analytics repo and service do not require it. It is listed here as a consideration, not a hard requirement.

---

## 10. UI Impact

### New route

`/[workspaceSlug]/settings/analytics` — server component, no `'use client'`

### Page structure

```
<div className="p-6 space-y-6">
  <h1>Revenue Analytics</h1>
  <p className="text-xs text-muted-foreground">30-day rolling window. All data is read-only.</p>

  {/* Summary cards */}
  <div className="grid grid-cols-4 gap-4">
    Total Leads | Sends (30d) | Delivery Rate | Latest LA Run
  </div>

  {/* Lead Pipeline Panel */}
  <Card>
    <CardHeader>Lead Pipeline</CardHeader>
    <CardContent>
      <table> stage | count | % of total </table>
      <p>New in last 30 days: {n}</p>
      <p>Workflow enabled: {n} / {total}</p>
    </CardContent>
  </Card>

  {/* Email Performance Panel */}
  <Card>
    <CardHeader>Email Performance (30-day)</CardHeader>
    <CardContent>
      <div className="grid grid-cols-5 gap-4">
        Total Sends | Delivery Rate | Bounce Rate | Complaint Rate | Open Rate | Click Rate
      </div>
    </CardContent>
  </Card>

  {/* Strategy Performance Panel */}
  <Card>
    <CardHeader>Strategy Performance (Latest Learning Agent Run)</CardHeader>
    <CardContent>
      {no signals → "No learning data yet..."}
      {has signals →
        <table> strategy_angle | delivery_rate | open_rate | click_rate | sample_n | confidence </table>
        <table> message_type   | delivery_rate | open_rate | click_rate | sample_n | confidence </table>
      }
    </CardContent>
  </Card>

  {/* Nav footer */}
  → Agent Monitor | → System Intelligence | → Workflow Health
</div>
```

### Sidebar change

Add "Analytics" link to the settings navigation alongside "Agent Monitor", "System Intelligence", etc. The exact sidebar component path needs to be identified during implementation (locate the settings nav layout file).

---

## 11. Workflow / Runtime Impact

None. The analytics page is a read-only server component with no side effects, no writes, no activity event emissions (unless the optional `ANALYTICS_DASHBOARD_VIEWED` event is included), no Inngest functions, and no scheduled jobs.

Page load performance: 4 parallel queries on page render. All queries use the service client (bypasses RLS). Expected response time: under 500ms for typical data volumes.

---

## 12. Security / RLS Implications

**All analytics queries use the service client** — same as all other settings pages in this codebase. No RLS is evaluated at the query layer. Instead, tenant isolation is enforced at the code layer: every query includes `.eq('tenant_id', tenantId)` where `tenantId` comes from `ctx.tenantId` (populated by `buildRequestContext` from the authenticated session).

This is consistent with Phase 3C and the health service pattern. No new RLS policies are needed.

**Permission check:** The analytics page must call `requirePermission(ctx, 'crm.companies.view')` — same guard used on the System Intelligence page. This ensures only authenticated members of the tenant can access it.

---

## 13. Staging / Production Safety Considerations

| Consideration | Status |
|---------------|--------|
| No new migrations | Safe — no schema changes to apply to staging or production |
| Staging auto-deploys from master | Analytics page will appear on staging after push; read-only so no data risk |
| Production Supabase untouched | Confirmed — no migrations, no data writes |
| Production Vercel manual-only | Confirmed — production deploy is explicit when the user chooses to promote |
| Empty state on staging | Acceptable — if no email sends, no LA runs: all panels show "No data yet" messages |
| No debug routes needed | Analytics page is a permanent production-quality route, not a diagnostic tool |

---

## 14. Test Strategy

### Test file

`tests/phase3d-revenue-analytics.test.ts`

### Approach

Follows the existing test pattern in this codebase:
- All repo and service functions tested with mocked Supabase client
- Pure functions (rate calculation) tested without mocking
- No UI tests (server component; `npx next build` TypeScript check is sufficient)

### Coverage targets

| Layer | What to test |
|-------|-------------|
| `analytics.repo.ts` | Query tenant isolation, data presence, empty-data edge cases |
| `analytics.service.ts` | Rate calculation correctness, division by zero guard, orchestration |
| Rate math helpers | Pure arithmetic: rate = numerator / denominator × 100, null when denominator = 0 |

---

## 15. Specific Test Cases

### Describe block 1: `Phase 3D — getLeadPipelineStats: query correctness`

1. **Returns correct total lead count for tenant** — mock returns 3 leads across 2 stages; verify `total = 3`
2. **Groups leads by stage correctly** — mock returns stage='new' ×2, stage='proposal' ×1; verify `byStage = { new: 2, proposal: 1 }`
3. **Filters by tenant_id (tenant isolation)** — verify `.eq('tenant_id', tenantId)` is called
4. **Returns zeros when tenant has no leads** — mock returns empty array; verify `total = 0`, `byStage = {}`, `newLast30Days = 0`
5. **Counts workflow_enabled correctly** — mock 3 leads: 2 with `workflow_enabled=true`, 1 with `false`; verify counts match

### Describe block 2: `Phase 3D — getEmailSendMetrics: query and rate calculation`

6. **Applies 30-day window filter** — verify query includes a date filter relative to `windowDays`
7. **Filters by tenant_id (tenant isolation)** — verify `.eq('tenant_id', tenantId)`
8. **Returns correct status counts** — mock returns sent=10, delivered=9, bounced=1; verify struct
9. **Calculates delivery rate correctly** — delivered=9, sent=10 → deliveryRate ≈ 0.9 (within floating point)
10. **Returns null rates when totalSends is zero** — no sends → deliveryRate, bounceRate, complaintRate all null
11. **Returns null openRate and clickRate when delivered is zero** — delivered=0 → openRate=null, clickRate=null

### Describe block 3: `Phase 3D — getLatestLearningSignals: query correctness`

12. **Returns null run when no learning snapshots exist** — mock empty result; verify `latestRunId = null`, `signals = []`
13. **Returns all signal rows for the latest run only** — mock two run_ids; verify only newer run's rows returned
14. **Filters by tenant_id (tenant isolation)** — verify `.eq('tenant_id', tenantId)`
15. **Returns rows with correct shape** — verify `dimension`, `dimensionValue`, `signalName`, `rate`, `sampleN`, `confidence` fields present

### Describe block 4: `Phase 3D — buildRevenueDashboard: orchestration`

16. **Fetches all data sources** — verify all 4 repo functions are called
17. **Assembles dashboard with correct shape** — verify `RevenueDashboard` fields: `pipeline`, `emailMetrics`, `learningSignals`, `openErrorCount`, `generatedAt`
18. **Handles all-zero email data without error** — no sends, no opens, no clicks → dashboard assembled with null rates and no thrown exception
19. **Handles missing learning signals gracefully** — `latestRunId = null` → `learningSignals.signals = []`, no exception

### Describe block 5: `Phase 3D — rate calculation helpers`

20. **`calculateRate(numerator, denominator)` — returns null when denominator is 0**
21. **`calculateRate(9, 10)` — returns 0.9**
22. **`calculateRate(0, 10)` — returns 0 (not null)**

**Target total: ~22 tests.** Baseline will be 987 + 22 = **~1009 tests**.

---

## 16. Risks and Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Empty staging data** — analytics page shows all zeros/null on staging because no real sends or LA runs exist | Low | Empty state messages per panel; not a defect |
| **Learning Agent never run** — strategy performance panel silently empty if tenant has never triggered LA | Low | Explicit "No learning data yet. Run the Learning Analysis from Agent Monitor." message |
| **email_sends count vs activity_events count divergence** — ET_EMAIL_OPENED counts may differ from email_sends delivered counts because not all email clients report opens | Accepted | v1 shows both sources; document in page description that open/click rates use event tracking, not ESP reporting |
| **Large lead count performance** — grouping leads by stage with a full table scan could be slow at high volume | Low at current scale | Index on `(tenant_id, workflow_enabled)` already exists; stage index may be needed — evaluate during implementation |
| **learning_snapshots query selects latest run by `computed_at`** — if two runs complete within the same second, result is non-deterministic | Very low | Use `MAX(run_id)` after `MAX(computed_at)` or order by computed_at DESC, limit 1 |

### Open Questions — Require User Answer Before Implementation

**Q1 — Route location:** Should the analytics page live at `/[workspaceSlug]/settings/analytics` (consistent with other settings pages) or at a top-level route like `/[workspaceSlug]/analytics`? The settings location is recommended for consistency with the existing navigation pattern.

**Q2 — Sidebar nav:** Is updating the settings sidebar navigation in scope for Phase 3D? Or should the analytics page be accessible only via direct URL / a link from the dashboard in v1?

**Q3 — Learning signals panel scope:** Should the strategy performance panel show only `dimension = 'strategy_angle'` in v1, or also `dimension = 'message_type'`? Showing both adds one more sub-table to the page.

**Q4 — Open/click rate source:** Email open and click rates can come from `activity_events` ET_ types (30-day count) or from a future Resend webhook aggregation. In v1, `activity_events` is the only source. Is this acceptable? Confirm: yes, `activity_events` only in v1.

**Q5 — Optional analytics audit event:** Should the page emit an `ANALYTICS_DASHBOARD_VIEWED` activity event (non-fatal, same pattern as other pages)? This would add one more event type to `types.agent.ts`. Recommendation: defer to v2 — no operational value in v1.

**Q6 — `getOpenErrorCount` reuse:** The analytics service needs an open error count. It can call `getOpenErrorsSummary` from the existing structured error service or add a thin repo query. Recommendation: add a thin `getOpenErrorCount` in `analytics.repo.ts` to keep the analytics module self-contained and avoid cross-module coupling.

---

## 17. Approval Checkpoint

This document is a **design draft** only. No code has been written.

Before implementation may begin, the following must be confirmed:

| Checkpoint | Question | Decision needed |
|------------|----------|-----------------|
| Route location | `/settings/analytics` vs `/analytics` | User decision |
| Sidebar nav in scope | Yes or no | User decision |
| Learning signals dimensions | `strategy_angle` only vs also `message_type` | User decision |
| Open/click rate source | `activity_events` only in v1 | Confirm or override |
| `ANALYTICS_DASHBOARD_VIEWED` event | Defer to v2 | Confirm or override |
| `getOpenErrorCount` approach | Thin analytics.repo.ts query | Confirm or override |
| Estimated test count | ~22 new tests → baseline becomes ~1009 | Confirm acceptable |
| Migrations | None — confirm no new migrations needed | Confirm |

**Standard sequence applies:**

1. Design & Test Cases ← **this document** — awaiting approval
2. Implementation Plan — produced after design is approved
3. Code implementation — follows locked plan
4. QA: `npx vitest run` + `npx next build`
5. Commit, tag, push
6. Update `docs/ai-context/` files

---

## Appendix: Directory Snapshot (Relevant Existing Files)

| Path | Role in Phase 3D |
|------|-----------------|
| `modules/analytics/` | **New** — analytics module |
| `modules/workflow/repositories/health.repo.ts` | Pattern reference for email_sends status count query |
| `modules/intelligence/structured-errors/structured-error.service.ts` | Pattern reference for open error count |
| `modules/intelligence/repositories/recommendation.repo.ts` | Pattern reference for service-client queries |
| `app/(workspace)/[workspaceSlug]/settings/system-intelligence/page.tsx` | Pattern reference for server component + service client |
| `app/(workspace)/[workspaceSlug]/settings/analytics/page.tsx` | **New** — analytics page |
| `tests/phase3c-system-intelligence.test.ts` | Pattern reference for test structure |
| `tests/phase3d-revenue-analytics.test.ts` | **New** — Phase 3D test suite |
