import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatCompanyName } from '@/lib/format'
import { buildRequestContext } from '@/lib/auth/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import * as aiUsageRepo from '@/modules/intelligence/repositories/ai-usage-event.repo'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function AiUsagePage({ params: _params }: PageProps) {
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [summary, byAgent, byModel, byFeature, topLeads, trend, failedCalls] = await Promise.all([
    aiUsageRepo.getUsageSummary(ctx.tenantId, 'today').catch(() => ({
      totalTokensToday:  0,
      totalTokensMonth:  0,
      totalCostUsdToday: 0,
      totalCostUsdMonth: 0,
      callCountToday:    0,
      callCountMonth:    0,
      failedCallsToday:  0,
    })),
    aiUsageRepo.getUsageByAgent(ctx.tenantId, 'today').catch(() => []),
    aiUsageRepo.getUsageByModel(ctx.tenantId, 'month').catch(() => []),
    aiUsageRepo.getUsageByFeature(ctx.tenantId, 'month').catch(() => []),
    aiUsageRepo.getTopLeadsByUsage(ctx.tenantId, 10).catch(() => []),
    aiUsageRepo.getUsageTrend(ctx.tenantId, 30).catch(() => []),
    aiUsageRepo.getFailedCalls(ctx.tenantId, 20).catch(() => []),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Usage</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Token usage, cost estimates, and budget tracking across all AI agents.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Tokens Today"  value={summary.totalTokensToday.toLocaleString()} />
        <KpiCard label="Cost Today"    value={`$${summary.totalCostUsdToday.toFixed(4)}`} />
        <KpiCard label="Calls Today"   value={summary.callCountToday.toLocaleString()} />
        <KpiCard
          label="Failed Today"
          value={summary.failedCallsToday.toLocaleString()}
          highlight={summary.failedCallsToday > 0}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label="Tokens This Month" value={summary.totalTokensMonth.toLocaleString()} />
        <KpiCard label="Cost This Month"   value={`$${summary.totalCostUsdMonth.toFixed(4)}`} />
      </div>

      {/* By Agent */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Usage by Agent</CardTitle></CardHeader>
        <CardContent>
          {byAgent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-1">Agent</th>
                  <th className="text-right pb-1">Calls Today</th>
                  <th className="text-right pb-1">Tokens Today</th>
                  <th className="text-right pb-1">Cost Today</th>
                  <th className="text-right pb-1">Calls Month</th>
                  <th className="text-right pb-1">Cost Month</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byAgent.map((row) => (
                  <tr key={row.agentName}>
                    <td className="py-1.5 font-mono text-xs">{row.agentName}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.callsToday}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.tokensToday.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">${row.costUsdToday.toFixed(4)}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.callsMonth}</td>
                    <td className="py-1.5 text-right tabular-nums">${row.costUsdMonth.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* By Model */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Usage by Model (This Month)</CardTitle></CardHeader>
        <CardContent>
          {byModel.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-1">Model</th>
                  <th className="text-right pb-1">Calls</th>
                  <th className="text-right pb-1">Prompt Tokens</th>
                  <th className="text-right pb-1">Completion Tokens</th>
                  <th className="text-right pb-1">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byModel.map((row) => (
                  <tr key={row.modelName}>
                    <td className="py-1.5 font-mono text-xs">{row.modelName}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.calls}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.promptTokens.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.completionTokens.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">${row.estimatedCostUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* By Feature */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Usage by Feature (This Month)</CardTitle></CardHeader>
        <CardContent>
          {byFeature.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-1">Feature</th>
                  <th className="text-right pb-1">Calls</th>
                  <th className="text-right pb-1">Tokens</th>
                  <th className="text-right pb-1">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byFeature.map((row) => (
                  <tr key={row.featureName}>
                    <td className="py-1.5 font-mono text-xs">{row.featureName}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.calls}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.tokens.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">${row.estimatedCostUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Top Leads by AI Cost */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Top Leads by AI Cost (All Time)</CardTitle></CardHeader>
        <CardContent>
          {topLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lead usage data yet.</p>
          ) : (
            <ol className="space-y-2">
              {topLeads.map((row) => (
                <li key={row.leadId} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">
                    {row.leadName ?? row.leadId}
                    {row.companyName && (
                      <span className="text-muted-foreground ml-1">· {formatCompanyName(row.companyName)}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {row.calls} call{row.calls !== 1 ? 's' : ''}
                  </span>
                  <span className="font-mono text-xs tabular-nums">${row.estimatedCostUsd.toFixed(4)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Campaign Asset Usage placeholder */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Campaign Asset Usage</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Campaign email asset usage will appear here when campaign assets have been used.
          </p>
        </CardContent>
      </Card>

      {/* 30-Day Trend */}
      <Card>
        <CardHeader><CardTitle className="text-sm">30-Day Usage Trend</CardTitle></CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trend data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left pb-1">Date</th>
                  <th className="text-right pb-1">Tokens</th>
                  <th className="text-right pb-1">Est. Cost</th>
                  <th className="text-right pb-1">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {trend.slice(0, 30).map((row) => (
                  <tr key={row.date}>
                    <td className="py-1 font-mono text-xs">{row.date}</td>
                    <td className="py-1 text-right tabular-nums">{row.totalTokens.toLocaleString()}</td>
                    <td className="py-1 text-right tabular-nums">${row.estimatedCostUsd.toFixed(4)}</td>
                    <td className={`py-1 text-right tabular-nums ${row.failedCalls > 0 ? 'text-red-600' : ''}`}>
                      {row.failedCalls}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Recent Failed AI Calls */}
      {failedCalls.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Failed AI Calls</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {failedCalls.map((row) => (
                <li key={row.id} className="text-xs space-y-0.5 border-b pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{row.agent_name}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{row.model_name}</span>
                    <span className="text-muted-foreground ml-auto">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                  {row.error_reason && (
                    <p className="text-red-700 truncate">{row.error_reason}</p>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  highlight,
}: {
  label:      string
  value:      string
  highlight?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold tabular-nums mt-1 ${highlight ? 'text-red-600' : ''}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
