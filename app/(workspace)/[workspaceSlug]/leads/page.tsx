import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as leadService from '@/modules/crm/services/lead.service'
import { getPipelineStages } from '@/lib/config/resolve'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap } from 'lucide-react'
import Link from 'next/link'
import { AddLeadDialog } from './AddLeadDialog'
import type { Database } from '@/types/database'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

type LeadRow = Database['public']['Tables']['leads']['Row']

export default async function LeadsPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [leadsByStage, stages] = await Promise.all([
    leadService.listLeadsByStage(ctx).catch(() => ({} as Record<string, LeadRow[]>)),
    getPipelineStages(ctx.tenantId, 'lead').catch(() => []),
  ])

  const totalLeads = Object.values(leadsByStage).flat().length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm">{totalLeads} open leads</p>
        </div>
        <AddLeadDialog />
      </div>

      {totalLeads === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Zap className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No open leads</p>
          <p className="text-xs text-muted-foreground mt-1">Add your first lead to start the pipeline</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.filter((s) => !s.is_terminal).map((stage) => {
            const stageLeads = leadsByStage[stage.slug] ?? []
            return (
              <div key={stage.id} className="flex-none w-64">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: stage.color ?? '#6B7280' }}
                  />
                  <span className="text-sm font-medium">{stage.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    {stageLeads.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {stageLeads.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} workspaceSlug={workspaceSlug} />
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="rounded-lg border border-dashed p-3 text-center">
                      <p className="text-xs text-muted-foreground">No leads</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LeadCard({ lead, workspaceSlug }: { lead: LeadRow; workspaceSlug: string }) {
  const priorityColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-blue-100 text-blue-800',
    low: 'bg-gray-100 text-gray-600',
  }

  return (
    <Link href={`/${workspaceSlug}/leads/${lead.id}`}>
      <div className="rounded-lg border bg-background p-3 hover:shadow-sm transition-shadow cursor-pointer">
        <p className="text-sm font-medium line-clamp-2">{lead.name}</p>
        {lead.estimated_value && (
          <p className="text-xs text-muted-foreground mt-1">
            ${lead.estimated_value.toLocaleString()}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize ${priorityColors[lead.priority] ?? priorityColors.medium}`}>
            {lead.priority}
          </span>
          {lead.workflow_enabled && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
              WF On
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
