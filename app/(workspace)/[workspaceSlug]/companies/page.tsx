import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import * as segmentService from '@/modules/crm/services/segment.service'
import { listSegmentsForWorkspace } from '@/modules/crm/repositories/segment.repo'
import { listManualSequencesForWorkspace } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { listCampaignTypes } from '@/modules/campaign-sequence/repositories/campaign-type.repo'
import { AddCompanyDialog } from './AddCompanyDialog'
import { CompaniesTable } from './CompaniesTable'

// Bulk campaign assignment fans out to up to 100 companies' contacts in one
// server action; actions inherit this segment config, so give them headroom.
export const maxDuration = 60

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
  searchParams: Promise<{ search?: string; page?: string; segment?: string }>
}

export default async function CompaniesPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params
  const { search, page, segment } = await searchParams
  const offset = ((Number(page) || 1) - 1) * 50

  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [companies, segments, manualSequences, campaignTypes] = await Promise.all([
    (async () => {
      let ids: string[] | undefined
      if (segment) {
        ids = await segmentService.listCompanyIdsForSegment(ctx, segment).catch(() => [])
        if (ids.length === 0) return []
      }
      return companyService.listCompanies(ctx, { search, ids, limit: 50, offset })
    })().catch(() => []),
    listSegmentsForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => []),
    listManualSequencesForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => []),
    listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId }).catch(() => []),
  ])

  const typeSlugById = new Map(campaignTypes.map(t => [t.id, t.slug]))
  const sequences = manualSequences.map(s => ({
    id:               s.id,
    name:             s.name,
    campaignTypeSlug: typeSlugById.get(s.campaign_type_id) ?? '',
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-muted-foreground text-sm">{companies.length} records</p>
        </div>
        <AddCompanyDialog />
      </div>

      <CompaniesTable
        companies={companies}
        segments={segments}
        sequences={sequences}
        workspaceSlug={workspaceSlug}
        activeSegmentId={segment ?? ''}
        search={search ?? ''}
      />
    </div>
  )
}
