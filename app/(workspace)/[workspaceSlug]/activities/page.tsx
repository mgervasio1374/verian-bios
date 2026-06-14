import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { Activity } from 'lucide-react'
import { format } from 'date-fns'
import { PageStatusBanner } from '@/components/PageStatusBanner'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function ActivitiesPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const service = createSupabaseServiceClient()
  const { data: activities } = await service
    .from('activities')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('workspace_id', ctx.workspaceId)
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .limit(100)

  const items = activities ?? []

  const activityTypeIcon: Record<string, string> = {
    call: '📞',
    email: '✉️',
    meeting: '📅',
    note: '📝',
    task: '✅',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activities</h1>
        <p className="text-muted-foreground text-sm">{items.length} recent activities</p>
      </div>

      <PageStatusBanner
        variant="planned"
        purpose="Activity logging is coming soon — calls, notes, and meetings will be logged here. This page currently shows system-generated activity only."
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Activity className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No activities logged yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((a) => (
            <div key={a.id} className="flex gap-3 rounded-lg border bg-background p-3">
              <span className="text-lg leading-none mt-0.5">
                {activityTypeIcon[a.activity_type] ?? '•'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium capitalize">
                    {a.activity_type}{a.subject ? `: ${a.subject}` : ''}
                  </p>
                  {a.occurred_at && (
                    <span className="text-xs text-muted-foreground flex-none">
                      {format(new Date(a.occurred_at), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
                {a.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.body}</p>}
                {a.outcome && <p className="text-xs text-green-700 mt-1">Outcome: {a.outcome}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
