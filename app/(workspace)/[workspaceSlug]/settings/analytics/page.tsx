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
