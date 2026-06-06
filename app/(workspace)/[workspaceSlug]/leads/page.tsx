import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as leadService from '@/modules/crm/services/lead.service'
import { getPipelineStages } from '@/lib/config/resolve'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import { AddLeadDialog } from './AddLeadDialog'
import type { Database } from '@/types/database'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

type LeadRow = Database['public']['Tables']['leads']['Row']

const priorityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-blue-100 text-blue-800',
  low: 'bg-gray-100 text-gray-600',
}

export default async function LeadsPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [leadsByStage, stages] = await Promise.all([
    leadService.listLeadsByStage(ctx).catch(() => ({} as Record<string, LeadRow[]>)),
    getPipelineStages(ctx.tenantId, 'lead').catch(() => []),
  ])

  const activeStages = stages.filter((s) => !s.is_terminal)
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
        <div className="space-y-6">
          {activeStages.map((stage) => {
            const stageLeads = leadsByStage[stage.slug] ?? []
            if (stageLeads.length === 0) return null
            return (
              <div key={stage.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color ?? '#6B7280' }}
                  />
                  <span className="text-sm font-semibold text-foreground">{stage.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    {stageLeads.length}
                  </span>
                </div>
                <div className="rounded-lg border bg-card overflow-hidden">
                  {stageLeads.map((lead, idx) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      workspaceSlug={workspaceSlug}
                      isLast={idx === stageLeads.length - 1}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LeadRow({
  lead,
  workspaceSlug,
  isLast,
}: {
  lead: LeadRow
  workspaceSlug: string
  isLast: boolean
}) {
  return (
    <Link href={`/${workspaceSlug}/leads/${lead.id}`}>
      <div
        className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors${
          isLast ? '' : ' border-b'
        }`}
      >
        <p className="text-sm font-medium flex-1 min-w-0 truncate">{lead.name}</p>
        {lead.estimated_value && (
          <span className="text-xs text-muted-foreground shrink-0">
            ${lead.estimated_value.toLocaleString()}
          </span>
        )}
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full capitalize shrink-0 ${
            priorityColors[lead.priority] ?? priorityColors.medium
          }`}
        >
          {lead.priority}
        </span>
        {lead.workflow_enabled && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
            WF On
          </span>
        )}
      </div>
    </Link>
  )
}
