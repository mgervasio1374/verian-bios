import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildRequestContext } from '@/lib/auth/context'
import { Badge } from '@/components/ui/badge'
import { TrendingUp } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function OpportunitiesPage({ params }: PageProps) {
  await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const svc = createSupabaseServiceClient()
  const { data: opportunities } = await svc
    .from('opportunities')
    .select('id, name, stage, status, value, expected_close_date, created_at')
    .eq('tenant_id', ctx.tenantId)
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = opportunities ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Opportunities</h1>
        <p className="text-muted-foreground text-sm">{rows.length} records</p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No opportunities yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Opportunities are created when leads are converted
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stage</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Value</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Close Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((opp) => (
                <tr key={opp.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{opp.name}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {opp.stage.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {opp.value != null ? `$${Number(opp.value).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={opp.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {opp.expected_close_date
                      ? new Date(opp.expected_close_date).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(opp.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'won'  ? 'default'     :
    status === 'lost' ? 'destructive' :
    'secondary'
  return (
    <Badge variant={variant as 'default' | 'destructive' | 'secondary'}>
      {status}
    </Badge>
  )
}
