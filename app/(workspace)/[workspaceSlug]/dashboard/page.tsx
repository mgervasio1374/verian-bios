import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { countCompanies } from '@/modules/crm/services/company.service'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import * as approvalRepo from '@/modules/workflow/repositories/approval.repo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Zap, CheckCircle2, TrendingUp } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function DashboardPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [companyCount, openLeads, pendingApprovals] = await Promise.all([
    countCompanies(ctx).catch(() => 0),
    leadRepo.listLeads({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, status: 'open', limit: 500 }).catch(() => []),
    approvalRepo.listPendingApprovals(ctx.tenantId, ctx.workspaceId).catch(() => []),
  ])

  const highPriorityLeads = openLeads.filter((l) => l.priority === 'high' || l.priority === 'critical')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">{workspaceSlug} workspace</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          title="Companies"
          value={companyCount}
          icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Open Leads"
          value={openLeads.length}
          icon={<Zap className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          title="High Priority"
          value={highPriorityLeads.length}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          highlight={highPriorityLeads.length > 0}
        />
        <MetricCard
          title="Pending Approvals"
          value={pendingApprovals.length}
          icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
          highlight={pendingApprovals.length > 0}
        />
      </div>

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Open Leads</CardTitle>
        </CardHeader>
        <CardContent>
          {openLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open leads yet.</p>
          ) : (
            <div className="divide-y">
              {openLeads.slice(0, 8).map((lead) => (
                <div key={lead.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{lead.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{lead.stage.replace(/_/g, ' ')}</p>
                  </div>
                  <PriorityBadge priority={lead.priority} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pendingApprovals.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium capitalize">{a.request_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MetricCard({
  title, value, icon, highlight = false,
}: {
  title: string
  value: number
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? 'border-amber-300' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-blue-100 text-blue-800',
    low: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${styles[priority] ?? styles.medium}`}>
      {priority}
    </span>
  )
}
