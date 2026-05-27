# Phase 3D — Revenue Analytics
## Implementation Plan v1.0

**Date:** 2026-05-26
**Status:** APPROVED — ready for implementation
**Design doc:** `docs/roadmap/phase-3d-design-test-cases.md`

**Approved decisions:**
- Route: `/[workspaceSlug]/settings/analytics`
- Sidebar nav: Yes — add "Analytics" link to `components/layout/Sidebar.tsx`
- Learning signals: Show both `strategy_angle` and `message_type` dimensions
- Open/click rate source: `activity_events` ET_ event counts only (v1)
- Analytics dashboard viewed event: Deferred to v2 — not in this phase
- Open error count: Thin `getOpenErrorCount` query in `analytics.repo.ts`
- Migrations: None
- Estimated test count: ~22 new tests
- Expected test baseline: 987 + 22 = **~1009/1009**

---

## Scope

**5 files to create. 1 file to modify. No new migrations.**

| File | Action |
|------|--------|
| `modules/analytics/analytics.types.ts` | **Create** — all analytics interfaces |
| `modules/analytics/analytics.repo.ts` | **Create** — 4 read-only query functions |
| `modules/analytics/analytics.service.ts` | **Create** — orchestrator, builds RevenueDashboard |
| `app/(workspace)/[workspaceSlug]/settings/analytics/page.tsx` | **Create** — server component, 3 panels |
| `tests/phase3d-revenue-analytics.test.ts` | **Create** — 22 tests across 5 describe blocks |
| `components/layout/Sidebar.tsx` | **Modify** — add Analytics nav item |

---

## Step 1 — Create `modules/analytics/analytics.types.ts`

Create the file with all Phase 3D analytics interfaces:

```typescript
export interface LeadPipelineStats {
  total:            number
  newLast30Days:    number
  workflowEnabled:  number
  workflowDisabled: number
  byStage:    Record<string, number>
  byPriority: Record<string, number>
}

export interface EmailSendMetrics {
  windowDays:    number
  totalSends:    number
  delivered:     number
  bounced:       number
  complained:    number
  failed:        number
  openEvents:    number
  clickEvents:   number
  deliveryRate:  number | null
  bounceRate:    number | null
  complaintRate: number | null
  openRate:      number | null
  clickRate:     number | null
}

export interface LearningSignalRow {
  dimension:      string
  dimensionValue: string
  signalName:     string
  rate:           number | null
  sampleN:        number
  confidence:     string
  computedAt:     string
}

export interface LearningSignalSummary {
  latestRunId: string | null
  latestRunAt: string | null
  signals:     LearningSignalRow[]
}

export interface RevenueDashboard {
  pipeline:        LeadPipelineStats
  emailMetrics:    EmailSendMetrics
  learningSignals: LearningSignalSummary
  openErrorCount:  number
  generatedAt:     string
}
```

---

## Step 2 — Create `modules/analytics/analytics.repo.ts`

Create the file with 4 read-only query functions. All use the service client. All enforce tenant isolation via `.eq('tenant_id', tenantId)`.

```typescript
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import type {
  LeadPipelineStats,
  EmailSendMetrics,
  LearningSignalRow,
  LearningSignalSummary,
} from './analytics.types'

const WINDOW_DAYS = 30

function windowStart(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function getLeadPipelineStats(tenantId: string): Promise<LeadPipelineStats> {
  const supabase = createSupabaseServiceClient()
  const thirtyDaysAgo = windowStart(WINDOW_DAYS)

  const [allLeads, newLeads] = await Promise.all([
    supabase
      .from('leads')
      .select('stage, priority, workflow_enabled')
      .eq('tenant_id', tenantId),
    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', thirtyDaysAgo),
  ])

  const rows = allLeads.data ?? []
  const byStage:    Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  let workflowEnabled  = 0
  let workflowDisabled = 0

  for (const row of rows) {
    if (row.stage)    byStage[row.stage]       = (byStage[row.stage] ?? 0) + 1
    if (row.priority) byPriority[row.priority] = (byPriority[row.priority] ?? 0) + 1
    if (row.workflow_enabled) workflowEnabled++
    else workflowDisabled++
  }

  return {
    total:            rows.length,
    newLast30Days:    newLeads.count ?? 0,
    workflowEnabled,
    workflowDisabled,
    byStage,
    byPriority,
  }
}

export async function getEmailSendMetrics(
  tenantId:   string,
  windowDays: number = WINDOW_DAYS,
): Promise<EmailSendMetrics> {
  const supabase = createSupabaseServiceClient()
  const since = windowStart(windowDays)

  const [sendsResult, activityResult] = await Promise.all([
    supabase
      .from('email_sends')
      .select('status')
      .eq('tenant_id', tenantId)
      .gte('created_at', since),
    supabase
      .from('activity_events')
      .select('event_type')
      .eq('tenant_id', tenantId)
      .in('event_type', ['ET_EMAIL_OPENED', 'ET_EMAIL_CLICKED'])
      .gte('occurred_at', since),
  ])

  const sends   = sendsResult.data ?? []
  const counts: Record<string, number> = {}
  for (const row of sends) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }

  let openEvents  = 0
  let clickEvents = 0
  for (const row of activityResult.data ?? []) {
    if (row.event_type === 'ET_EMAIL_OPENED') openEvents++
    if (row.event_type === 'ET_EMAIL_CLICKED') clickEvents++
  }

  const totalSends = sends.length
  const delivered  = counts['delivered']  ?? 0
  const bounced    = counts['bounced']    ?? 0
  const complained = counts['complained'] ?? 0
  const failed     = counts['failed']     ?? 0

  return {
    windowDays,
    totalSends,
    delivered,
    bounced,
    complained,
    failed,
    openEvents,
    clickEvents,
    deliveryRate:  totalSends > 0 ? delivered  / totalSends : null,
    bounceRate:    totalSends > 0 ? bounced    / totalSends : null,
    complaintRate: totalSends > 0 ? complained / totalSends : null,
    openRate:      delivered  > 0 ? openEvents  / delivered : null,
    clickRate:     delivered  > 0 ? clickEvents / delivered : null,
  }
}

export async function getLatestLearningSignals(tenantId: string): Promise<LearningSignalSummary> {
  const supabase = createSupabaseServiceClient()

  const { data: latest } = await supabase
    .from('learning_snapshots')
    .select('run_id, computed_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) {
    return { latestRunId: null, latestRunAt: null, signals: [] }
  }

  const { data: rows } = await supabase
    .from('learning_snapshots')
    .select('dimension, dimension_value, signal_name, rate, sample_n, confidence, computed_at')
    .eq('tenant_id', tenantId)
    .eq('run_id', latest.run_id)
    .is('deleted_at', null)
    .in('dimension', ['strategy_angle', 'message_type'])

  const signals: LearningSignalRow[] = (rows ?? []).map(r => ({
    dimension:      r.dimension,
    dimensionValue: r.dimension_value,
    signalName:     r.signal_name,
    rate:           r.rate !== null ? Number(r.rate) : null,
    sampleN:        r.sample_n,
    confidence:     r.confidence,
    computedAt:     r.computed_at,
  }))

  return {
    latestRunId: latest.run_id,
    latestRunAt: latest.computed_at,
    signals,
  }
}

export async function getOpenErrorCount(tenantId: string): Promise<number> {
  const supabase = createSupabaseServiceClient()
  const { count } = await supabase
    .from('automation_failures')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('status', ['open', 'investigating'])
  return count ?? 0
}
```

**Notes:**
- All 4 functions use `createSupabaseServiceClient()` — same pattern as all other repo files
- `getLeadPipelineStats` runs 2 sub-queries in `Promise.all`: one for all leads (stage/priority/workflow_enabled), one for the 30-day new-lead count
- `getEmailSendMetrics` runs 2 sub-queries in `Promise.all`: `email_sends` status counts + `activity_events` open/click counts
- `getLatestLearningSignals` first finds the most recent `run_id`, then fetches all rows for that run filtered to `strategy_angle` and `message_type` dimensions
- `getOpenErrorCount` uses `{ count: 'exact', head: true }` — no rows returned, just the count

---

## Step 3 — Create `modules/analytics/analytics.service.ts`

```typescript
import type { RequestContext } from '@/types/context'
import type { RevenueDashboard } from './analytics.types'
import * as repo from './analytics.repo'

export async function buildRevenueDashboard(ctx: RequestContext): Promise<RevenueDashboard> {
  const [pipeline, emailMetrics, learningSignals, openErrorCount] = await Promise.all([
    repo.getLeadPipelineStats(ctx.tenantId),
    repo.getEmailSendMetrics(ctx.tenantId, 30),
    repo.getLatestLearningSignals(ctx.tenantId),
    repo.getOpenErrorCount(ctx.tenantId),
  ])

  return {
    pipeline,
    emailMetrics,
    learningSignals,
    openErrorCount,
    generatedAt: new Date().toISOString(),
  }
}
```

**Notes:**
- Single exported function — no other exports
- All 4 data sources fetched in `Promise.all` — parallel, no sequential dependency
- `RevenueDashboard` is a direct assembly of the 4 results plus `generatedAt`
- No rate calculations in the service — rates are computed in `analytics.repo.ts` at the source

---

## Step 4 — Create `app/(workspace)/[workspaceSlug]/settings/analytics/page.tsx`

Full server component. No `'use client'`. Create the directory and file.

```typescript
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { buildRevenueDashboard } from '@/modules/analytics/analytics.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

const CONFIDENCE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  high:         'default',
  moderate:     'secondary',
  low:          'outline',
  insufficient: 'outline',
}

const STAGE_ORDER = [
  'new', 'new_inquiry', 'analysis_requested', 'statement_received',
  'statement_review', 'contacted', 'proposal', 'negotiation', 'won', 'lost',
]

function fmtRate(rate: number | null): string {
  if (rate === null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default async function AnalyticsPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const dashboard = await buildRevenueDashboard(ctx)
  const { pipeline, emailMetrics, learningSignals } = dashboard
  const base = `/${workspaceSlug}`

  const sortedStages = Object.entries(pipeline.byStage).sort(([a], [b]) => {
    const ai = STAGE_ORDER.indexOf(a)
    const bi = STAGE_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const angleSignals = learningSignals.signals.filter(s => s.dimension === 'strategy_angle')
  const typeSignals  = learningSignals.signals.filter(s => s.dimension === 'message_type')

  const buildSignalMap = (signals: typeof learningSignals.signals) => {
    const map: Record<string, Record<string, number | null>> = {}
    for (const s of signals) {
      if (!map[s.dimensionValue]) map[s.dimensionValue] = {}
      map[s.dimensionValue][s.signalName] = s.rate
    }
    return map
  }

  const angleMap = buildSignalMap(angleSignals)
  const typeMap  = buildSignalMap(typeSignals)

  const getConf = (signals: typeof learningSignals.signals, dv: string): string =>
    signals.find(s => s.dimensionValue === dv)?.confidence ?? 'insufficient'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Revenue Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          30-day rolling window. All data is read-only — no actions are triggered from this page.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Leads</p>
            <p className="text-3xl font-bold mt-1">{pipeline.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Sends (30d)</p>
            <p className="text-3xl font-bold mt-1">{emailMetrics.totalSends}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Delivery Rate</p>
            <p className="text-3xl font-bold mt-1">{fmtRate(emailMetrics.deliveryRate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Latest LA Run</p>
            <p className="text-xl font-bold mt-1">{fmtDate(learningSignals.latestRunAt)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Panel 1 — Lead Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          {pipeline.total === 0 ? (
            <p className="text-sm text-muted-foreground">No leads yet.</p>
          ) : (
            <div className="space-y-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Stage</th>
                    <th className="text-right p-2 font-medium">Count</th>
                    <th className="text-right p-2 font-medium">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStages.map(([stage, count]) => (
                    <tr key={stage} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">{stage}</td>
                      <td className="p-2 text-right">{count}</td>
                      <td className="p-2 text-right text-muted-foreground">
                        {`${((count / pipeline.total) * 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid grid-cols-3 gap-4 text-sm pt-2 border-t">
                <div>
                  <p className="text-muted-foreground">New (30d)</p>
                  <p className="text-xl font-bold">{pipeline.newLast30Days}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Workflow On</p>
                  <p className="text-xl font-bold">{pipeline.workflowEnabled}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Workflow Off</p>
                  <p className="text-xl font-bold">{pipeline.workflowDisabled}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panel 2 — Email Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Performance (30-day)</CardTitle>
        </CardHeader>
        <CardContent>
          {emailMetrics.totalSends === 0 ? (
            <p className="text-sm text-muted-foreground">No email sends in the last 30 days.</p>
          ) : (
            <div className="grid grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Sends</p>
                <p className="text-2xl font-bold">{emailMetrics.totalSends}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Delivery Rate</p>
                <p className="text-2xl font-bold">{fmtRate(emailMetrics.deliveryRate)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Bounce Rate</p>
                <p className={`text-2xl font-bold ${
                  emailMetrics.bounceRate !== null && emailMetrics.bounceRate > 0.05
                    ? 'text-destructive' : ''
                }`}>
                  {fmtRate(emailMetrics.bounceRate)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Open Rate</p>
                <p className="text-2xl font-bold">{fmtRate(emailMetrics.openRate)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Click Rate</p>
                <p className="text-2xl font-bold">{fmtRate(emailMetrics.clickRate)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panel 3 — Strategy Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Strategy Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {!learningSignals.latestRunId ? (
            <p className="text-sm text-muted-foreground">
              No learning data yet. Run the Learning Analysis from{' '}
              <Link href={`${base}/settings/agent-monitor`} className="text-primary hover:underline">
                Agent Monitor
              </Link>{' '}
              to generate signals.
            </p>
          ) : (
            <div className="space-y-6">
              <p className="text-xs text-muted-foreground">
                Latest run: {fmtDate(learningSignals.latestRunAt)}
              </p>

              {Object.keys(angleMap).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">By Strategy Angle</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Angle</th>
                        <th className="text-right p-2 font-medium">Delivery</th>
                        <th className="text-right p-2 font-medium">Open</th>
                        <th className="text-right p-2 font-medium">Click</th>
                        <th className="text-right p-2 font-medium">Sample N</th>
                        <th className="text-right p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(angleMap).map(([dv, rates]) => (
                        <tr key={dv} className="border-b last:border-0">
                          <td className="p-2 font-mono text-xs">{dv}</td>
                          <td className="p-2 text-right">{fmtRate(rates['delivery_rate'] ?? null)}</td>
                          <td className="p-2 text-right">{fmtRate(rates['open_rate'] ?? null)}</td>
                          <td className="p-2 text-right">{fmtRate(rates['click_rate'] ?? null)}</td>
                          <td className="p-2 text-right text-muted-foreground">
                            {angleSignals.find(s => s.dimensionValue === dv)?.sampleN ?? '—'}
                          </td>
                          <td className="p-2 text-right">
                            <Badge
                              variant={CONFIDENCE_VARIANT[getConf(angleSignals, dv)] ?? 'outline'}
                              className="text-xs"
                            >
                              {getConf(angleSignals, dv)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {Object.keys(typeMap).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">By Message Type</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-right p-2 font-medium">Delivery</th>
                        <th className="text-right p-2 font-medium">Open</th>
                        <th className="text-right p-2 font-medium">Click</th>
                        <th className="text-right p-2 font-medium">Sample N</th>
                        <th className="text-right p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(typeMap).map(([dv, rates]) => (
                        <tr key={dv} className="border-b last:border-0">
                          <td className="p-2 font-mono text-xs">{dv}</td>
                          <td className="p-2 text-right">{fmtRate(rates['delivery_rate'] ?? null)}</td>
                          <td className="p-2 text-right">{fmtRate(rates['open_rate'] ?? null)}</td>
                          <td className="p-2 text-right">{fmtRate(rates['click_rate'] ?? null)}</td>
                          <td className="p-2 text-right text-muted-foreground">
                            {typeSignals.find(s => s.dimensionValue === dv)?.sampleN ?? '—'}
                          </td>
                          <td className="p-2 text-right">
                            <Badge
                              variant={CONFIDENCE_VARIANT[getConf(typeSignals, dv)] ?? 'outline'}
                              className="text-xs"
                            >
                              {getConf(typeSignals, dv)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation footer */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <Link href={`${base}/settings/agent-monitor`} className="text-primary hover:underline">
          → Agent Monitor
        </Link>
        <Link href={`${base}/settings/system-intelligence`} className="text-primary hover:underline">
          → System Intelligence
        </Link>
        <Link href={`${base}/settings/health`} className="text-primary hover:underline">
          → Workflow Health
        </Link>
      </div>
    </div>
  )
}
```

**Notes:**
- No `'use client'` — full server component
- `buildRevenueDashboard` is called once; all data fetched in a single `Promise.all` inside the service
- `STAGE_ORDER` sorts pipeline stages by natural sales progression; unknown stages fall to the end alphabetically
- `buildSignalMap` groups learning snapshot rows by `dimensionValue` and collects all signal rates per value — supports the two sub-tables without N+1 queries
- `fmtRate(null)` returns `'—'` — all zero-denominator cases are handled in the repo

---

## Step 5 — Modify `components/layout/Sidebar.tsx`

**File:** `components/layout/Sidebar.tsx`

### 5a — Add `BarChart2` to the lucide-react import

Replace:
```typescript
import {
  LayoutDashboard,
  Building2,
  Users,
  Zap,
  TrendingUp,
  Activity,
  CheckCircle2,
  FolderOpen,
  Settings,
  ChevronLeft,
  ArrowDownToLine,
  Bot,
  ShieldAlert,
  MessageSquare,
  Upload,
  Brain,
} from 'lucide-react'
```

With:
```typescript
import {
  LayoutDashboard,
  Building2,
  Users,
  Zap,
  TrendingUp,
  Activity,
  CheckCircle2,
  FolderOpen,
  Settings,
  ChevronLeft,
  ArrowDownToLine,
  Bot,
  ShieldAlert,
  MessageSquare,
  Upload,
  Brain,
  BarChart2,
} from 'lucide-react'
```

### 5b — Add Analytics nav item after Imports

Replace:
```typescript
    { label: 'Imports',             href: `${base}/settings/imports`,             icon: <Upload className="h-4 w-4" /> },
    { label: 'Settings',        href: `${base}/settings`,                  icon: <Settings className="h-4 w-4" /> },
```

With:
```typescript
    { label: 'Imports',             href: `${base}/settings/imports`,             icon: <Upload className="h-4 w-4" /> },
    { label: 'Analytics',           href: `${base}/settings/analytics`,           icon: <BarChart2 className="h-4 w-4" /> },
    { label: 'Settings',        href: `${base}/settings`,                  icon: <Settings className="h-4 w-4" /> },
```

**Notes:**
- `BarChart2` is available in `lucide-react` — no new package required
- The nav item is positioned after Imports and before Settings, consistent with the settings-area grouping (Agent Monitor → System Controls → Sys Intelligence → Imports → Analytics → Settings)
- Active state detection uses `pathname.startsWith(item.href)` — will highlight "Analytics" when on the analytics page or any sub-page

---

## Step 6 — Create `tests/phase3d-revenue-analytics.test.ts`

Create the new test file. Follows the same source-reading pattern as `tests/phase3c-system-intelligence.test.ts`.

```typescript
// Phase 3D — Revenue Analytics: test suite

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

// -------------------------------------------------------
// Block 1 — getLeadPipelineStats: query correctness (5 tests)
// -------------------------------------------------------
describe('Phase 3D — getLeadPipelineStats: query correctness', () => {
  const repoSource = readProjectFile('modules/analytics/analytics.repo.ts')

  it('repo queries leads table for pipeline stats', () => {
    expect(repoSource).toContain("'leads'")
  })
  it('repo groups results by stage into byStage record', () => {
    expect(repoSource).toContain('byStage')
  })
  it('repo filters by tenant_id for tenant isolation', () => {
    expect(repoSource).toContain(".eq('tenant_id'")
  })
  it('repo uses rows.length for total count (handles empty set)', () => {
    expect(repoSource).toContain('rows.length')
  })
  it('repo counts workflow_enabled flag per lead', () => {
    expect(repoSource).toContain('workflow_enabled')
  })
})

// -------------------------------------------------------
// Block 2 — getEmailSendMetrics: query and rate calculation (6 tests)
// -------------------------------------------------------
describe('Phase 3D — getEmailSendMetrics: query and rate calculation', () => {
  const repoSource = readProjectFile('modules/analytics/analytics.repo.ts')

  it('repo accepts and applies windowDays parameter', () => {
    expect(repoSource).toContain('windowDays')
  })
  it('repo queries email_sends table for send metrics', () => {
    expect(repoSource).toContain("'email_sends'")
  })
  it('repo queries activity_events for ET_EMAIL_OPENED and ET_EMAIL_CLICKED counts', () => {
    expect(repoSource).toContain('ET_EMAIL_OPENED')
    expect(repoSource).toContain('ET_EMAIL_CLICKED')
  })
  it('repo computes deliveryRate field', () => {
    expect(repoSource).toContain('deliveryRate')
  })
  it('repo guards deliveryRate against division by zero when totalSends is 0', () => {
    expect(repoSource).toContain('totalSends > 0')
  })
  it('repo guards openRate and clickRate against division by zero when delivered is 0', () => {
    expect(repoSource).toContain('delivered > 0')
  })
})

// -------------------------------------------------------
// Block 3 — getLatestLearningSignals: query correctness (4 tests)
// -------------------------------------------------------
describe('Phase 3D — getLatestLearningSignals: query correctness', () => {
  const repoSource = readProjectFile('modules/analytics/analytics.repo.ts')

  it('repo returns latestRunId: null when no learning snapshots exist', () => {
    expect(repoSource).toContain('latestRunId: null')
  })
  it('repo queries learning_snapshots by run_id to get latest run rows', () => {
    expect(repoSource).toContain('run_id')
  })
  it('repo queries learning_snapshots table', () => {
    expect(repoSource).toContain("'learning_snapshots'")
  })
  it('repo maps snapshot rows to LearningSignalRow shape with dimensionValue', () => {
    expect(repoSource).toContain('dimensionValue')
  })
})

// -------------------------------------------------------
// Block 4 — buildRevenueDashboard: orchestration (4 tests)
// -------------------------------------------------------
describe('Phase 3D — buildRevenueDashboard: orchestration', () => {
  const serviceSource = readProjectFile('modules/analytics/analytics.service.ts')

  it('service fetches all data sources in Promise.all', () => {
    expect(serviceSource).toContain('Promise.all')
  })
  it('service returns a RevenueDashboard-shaped object', () => {
    expect(serviceSource).toContain('RevenueDashboard')
  })
  it('service includes emailMetrics in the returned dashboard', () => {
    expect(serviceSource).toContain('emailMetrics')
  })
  it('service includes learningSignals in the returned dashboard', () => {
    expect(serviceSource).toContain('learningSignals')
  })
})

// -------------------------------------------------------
// Block 5 — rate calculation correctness (3 tests)
// -------------------------------------------------------
describe('Phase 3D — rate calculation correctness', () => {
  const repoSource = readProjectFile('modules/analytics/analytics.repo.ts')

  it('delivery rate is computed as delivered / totalSends', () => {
    expect(repoSource).toContain('delivered / totalSends')
  })
  it('open rate is computed as openEvents / delivered', () => {
    expect(repoSource).toContain('openEvents / delivered')
  })
  it('click rate is computed as clickEvents / delivered', () => {
    expect(repoSource).toContain('clickEvents / delivered')
  })
})
```

---

## Post-Implementation Checklist

After all 6 steps are complete, run in order:

```
npx vitest run
```
Expected: **~1009/1009 passed** (987 existing + 22 new)

```
npx next build
```
Expected: clean compile, no TypeScript errors, **35 routes** (one new route added: `/settings/analytics`)

```
git status --short
```
Expected: 1 modified file + 5 created files:
- `components/layout/Sidebar.tsx` ← modified
- `modules/analytics/analytics.types.ts` ← new
- `modules/analytics/analytics.repo.ts` ← new
- `modules/analytics/analytics.service.ts` ← new
- `app/(workspace)/[workspaceSlug]/settings/analytics/page.tsx` ← new
- `tests/phase3d-revenue-analytics.test.ts` ← new

No migrations created. No Vercel settings changed. Production untouched.

---

## Commit Sequence (after QA approval)

```
git add modules/analytics/analytics.types.ts
git add modules/analytics/analytics.repo.ts
git add modules/analytics/analytics.service.ts
git add "app/(workspace)/[workspaceSlug]/settings/analytics/page.tsx"
git add components/layout/Sidebar.tsx
git add tests/phase3d-revenue-analytics.test.ts
git commit -m "Phase 3D: implement revenue analytics dashboard"
```

Then:
1. Annotated tag: `phase-3d-revenue-analytics-v1`
2. Push tag + master to origin
3. Verify staging deployment
4. Update `docs/ai-context/` files

---

## Guardrails in Force

| Guardrail | Status |
|-----------|--------|
| No production modifications | In force |
| No Vercel settings changes | In force |
| No migrations | In force — next available: `20240032` |
| No email / Resend calls | In force — analytics module is read-only |
| No external LLM calls | In force |
| Page is server component | In force — no `'use client'` in `page.tsx` |
| Tenant isolation enforced at repo layer | In force — `.eq('tenant_id', tenantId)` on all 4 queries |
| Analytics is read-only | In force — no writes, no server actions, no forms |
| No `ANALYTICS_DASHBOARD_VIEWED` event | In force — deferred to v2 per approved decision |
| Staging remains deployable | In force |
| Tests stay green (~1009/1009 target) | In force |
| Phase 3A / 3B / 3C modules unchanged | In force — analytics module imports nothing from existing modules |
| Phase 3C System Intelligence unchanged | In force — `getOpenErrorCount` is a new thin query; does not call or modify Phase 3C code |
