import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { Brain } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function MessageWorkspaceIndexPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)

  // Load recent leads for quick access
  const { data: recentLeads } = await supabase
    .from('leads')
    .select('id, stage, source, created_at, company_id')
    .eq('tenant_id', ctx.tenantId)
    .not('stage', 'in', '(closed_won,closed_lost)')
    .order('created_at', { ascending: false })
    .limit(10)

  const leadIds = (recentLeads ?? []).map(l => l.company_id).filter((id): id is string => !!id)
  const { data: companies } = leadIds.length > 0
    ? await supabase.from('companies').select('id, name').in('id', leadIds)
    : { data: [] }

  const companyMap = Object.fromEntries((companies ?? []).map(c => [c.id, c.name]))

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Message Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Phase 3B — Message Strategy Agent. Select a lead to view or generate a strategy.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-background p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phase 3B Status</p>
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="text-green-700 font-medium">✓ Message Strategy Agent — Foundation complete</p>
          <p className="text-muted-foreground">○ Copywriting Agent — Not yet implemented</p>
          <p className="text-muted-foreground">○ Quality Review Agent — Not yet implemented</p>
          <p className="text-muted-foreground">○ Learning Agent — Not yet implemented</p>
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        <div className="px-4 py-3 border-b bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Active Leads</p>
        </div>
        {(!recentLeads || recentLeads.length === 0) ? (
          <p className="p-4 text-sm text-muted-foreground">No active leads found.</p>
        ) : (
          <div className="divide-y">
            {recentLeads.map(lead => (
              <Link
                key={lead.id}
                href={`/${workspaceSlug}/message-workspace/${lead.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">
                    {lead.company_id ? (companyMap[lead.company_id] ?? 'Unknown Company') : 'Unknown Company'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Stage: {lead.stage ?? '—'} · Source: {lead.source ?? '—'}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(lead.created_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        To generate a strategy for a specific lead, navigate to{' '}
        <code className="bg-muted px-1 rounded">/{workspaceSlug}/message-workspace/[leadId]</code>
      </p>
    </div>
  )
}
