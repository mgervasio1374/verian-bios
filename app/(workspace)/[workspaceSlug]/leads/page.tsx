import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as leadService from '@/modules/crm/services/lead.service'
import { getPipelineStages } from '@/lib/config/resolve'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import { AddLeadDialog } from './AddLeadDialog'
import { ImportedLeadsReview } from './ImportedLeadsReview'
import type { Database } from '@/types/database'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
  searchParams: Promise<{ q?: string }>
}

type LeadRow = Database['public']['Tables']['leads']['Row']

const priorityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-blue-100 text-blue-800',
  low: 'bg-gray-100 text-gray-600',
}

export default async function LeadsPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params
  const { q } = await searchParams
  const query = (q ?? '').trim().toLowerCase()
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [allLeadsByStage, stages, importedLeads] = await Promise.all([
    leadService.listLeadsByStage(ctx).catch(() => ({} as Record<string, LeadRow[]>)),
    getPipelineStages(ctx.tenantId, 'lead').catch(() => []),
    leadService.listImportedUnreviewedLeads(ctx).catch(() => [] as LeadRow[]),
  ])

  // Lead name carries the company ("<contact> at <Company>" or the company itself),
  // so a name match covers "search by company". Filtered server-side.
  const leadsByStage: Record<string, LeadRow[]> = query
    ? Object.fromEntries(Object.entries(allLeadsByStage).map(([k, v]) =>
        [k, v.filter((l) => (l.name ?? '').toLowerCase().includes(query))]))
    : allLeadsByStage

  const activeStages = stages.filter((s) => !s.is_terminal)
  const totalLeads = Object.values(leadsByStage).flat().length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm">
            {totalLeads} open leads{query ? ` matching "${q}"` : ''}
          </p>
        </div>
        <AddLeadDialog />
      </div>

      {/* Search by company / lead name */}
      <form method="GET" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by company or lead name…"
          className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {query && (
          <Link href={`/${workspaceSlug}/leads`} className="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Clear</Link>
        )}
      </form>

      {/* #31: imported leads land outside the pipeline — surface them for triage */}
      <ImportedLeadsReview
        workspaceSlug={workspaceSlug}
        leads={importedLeads.map((l) => ({
          id:              l.id,
          name:            l.name,
          estimated_value: l.estimated_value,
          created_at:      l.created_at,
        }))}
      />

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
