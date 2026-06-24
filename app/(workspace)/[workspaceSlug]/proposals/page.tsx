import Link from 'next/link'
import { formatCompanyName } from '@/lib/format'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getProposalPipelineStats, getRecentProposals } from '@/modules/proposals/repositories/proposal-analytics.repo'
import { getProposalFollowUpQueueForWorkspace } from '@/modules/proposals/services/proposal-follow-up-queue.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

// Funnel display order.
const FUNNEL_ORDER = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'withdrawn']

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft:     'outline',
  sent:      'secondary',
  viewed:    'default',
  accepted:  'default',
  rejected:  'destructive',
  expired:   'outline',
  withdrawn: 'secondary',
}

function fmtRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function fmtUsd(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtAmount(amount: number | null, currency: string): string {
  if (amount === null) return '—'
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function ProposalsDashboardPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.leads.view')

  const [stats, recent, queue] = await Promise.all([
    getProposalPipelineStats(ctx.tenantId, ctx.workspaceId),
    getRecentProposals(ctx.tenantId, ctx.workspaceId, 10),
    getProposalFollowUpQueueForWorkspace(ctx.tenantId, ctx.workspaceId, { due: 'all', limit: 500 }),
  ])

  const followUps = queue.ok
    ? queue.summary
    : { overdueCount: 0, todayCount: 0, upcomingCount: 0, totalReturned: 0 }
  const followUpsDue = followUps.overdueCount + followUps.todayCount

  const base = `/${workspaceSlug}`

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proposals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pipeline overview across all proposals. Read-only — no actions are triggered from this page.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Open Proposals</p>
            <p className="text-3xl font-bold mt-1">{stats.openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Savings Pipeline</p>
            <p className="text-3xl font-bold mt-1 text-emerald-600">{fmtUsd(stats.savingsPipeline)}</p>
            <p className="text-xs text-muted-foreground mt-1">annual, open proposals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">View Rate</p>
            <p className="text-3xl font-bold mt-1">{fmtRate(stats.viewRate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <p className="text-3xl font-bold mt-1">{fmtRate(stats.winRate)}</p>
            <p className="text-xs text-muted-foreground mt-1">{fmtUsd(stats.wonSavings)} won</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Follow-ups Due</p>
            <p className={`text-3xl font-bold mt-1 ${followUps.overdueCount > 0 ? 'text-destructive' : ''}`}>
              {followUpsDue}
            </p>
            <Link href={`${base}/proposal-follow-ups`} className="text-xs text-primary hover:underline">
              {followUps.overdueCount} overdue →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Status funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.totalProposals === 0 ? (
            <p className="text-sm text-muted-foreground">No proposals yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-right p-2 font-medium">Count</th>
                  <th className="text-right p-2 font-medium">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {FUNNEL_ORDER.filter(s => (stats.statusCounts[s] ?? 0) > 0).map(s => {
                  const count = stats.statusCounts[s] ?? 0
                  return (
                    <tr key={s} className="border-b last:border-0">
                      <td className="p-2">
                        <Badge variant={STATUS_VARIANT[s] ?? 'outline'}>{s}</Badge>
                      </td>
                      <td className="p-2 text-right">{count}</td>
                      <td className="p-2 text-right text-muted-foreground">
                        {fmtRate(count / stats.totalProposals)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Recent proposals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Proposals</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {recent.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No proposals yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Company</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Annual Savings</th>
                  <th className="text-left p-3 font-medium">First Viewed</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{formatCompanyName(r.companyName) ?? '—'}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[r.proposalStatus] ?? 'outline'}>{r.proposalStatus}</Badge>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap text-muted-foreground">
                      {fmtAmount(r.proposalAmount, r.proposalCurrency)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.firstViewedAt)}</td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                    <td className="p-3">
                      <Link
                        href={`${base}/proposal-events/${r.id}`}
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
