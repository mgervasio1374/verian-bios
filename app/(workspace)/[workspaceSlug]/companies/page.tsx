import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import * as segmentService from '@/modules/crm/services/segment.service'
import { listSegmentsForWorkspace } from '@/modules/crm/repositories/segment.repo'
import { listManualSequencesForWorkspace } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { listCampaignSequenceStepsForSequence } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { listCampaignTypes } from '@/modules/campaign-sequence/repositories/campaign-type.repo'
import { getCompaniesInActiveCampaigns } from '@/modules/messaging/repositories/campaign-assignment.repo'
import { sequencesWithPromptRisk } from '@/modules/campaign-sequence/services/sequence-usage.service'
import { AddCompanyDialog } from './AddCompanyDialog'
import { CompaniesTable } from './CompaniesTable'

// Bulk campaign assignment fans out to up to 100 companies' contacts in one
// server action; actions inherit this segment config, so give them headroom.
export const maxDuration = 60

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
  searchParams: Promise<{
    search?: string
    page?: string
    segment?: string
    status?: string
    industry?: string
    sort?: string
    dir?: string
  }>
}

export default async function CompaniesPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params
  const { search, page, segment, status, industry, sort, dir } = await searchParams
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
      return companyService.listCompanies(ctx, {
        search,
        ids,
        status,
        industry,
        orderBy:  sort,
        orderDir: dir === 'desc' ? 'desc' : dir === 'asc' ? 'asc' : undefined,
        limit:    50,
        offset,
      })
    })().catch(() => []),
    listSegmentsForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => []),
    listManualSequencesForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => []),
    listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId }).catch(() => []),
  ])

  const typeSlugById = new Map(campaignTypes.map(t => [t.id, t.slug]))
  // V1 prompt-leak heuristic: flag sequences referencing prompt-shaped assets
  const promptRiskIds = await sequencesWithPromptRisk(ctx.tenantId, ctx.workspaceId)
    .catch(() => new Set<string>())
  // V5: thread each sequence's day offsets + delivery settings so the assign
  // panel can preview touch landing dates and run the event-date guard.
  const sequences = await Promise.all(manualSequences.map(async s => {
    const steps = await listCampaignSequenceStepsForSequence(s.id, ctx.tenantId, ctx.workspaceId)
      .catch(() => [])
    const record = s as unknown as Record<string, unknown>
    return {
      id:               s.id,
      name:             s.name,
      campaignTypeSlug: typeSlugById.get(s.campaign_type_id) ?? '',
      promptRisk:       promptRiskIds.has(s.id),
      dayOffsets:       steps.map(step => (step.day_offset as number) ?? 0),
      sendTime:         (record.send_time as string | null) ?? null,
      timeZone:         (record.timezone as string | null) ?? null,
      skipWeekends:     Boolean(record.skip_weekends),
    }
  }))

  // Marketing-status rollup for the displayed page (Set isn't serializable — pass an array)
  const inCampaign = await getCompaniesInActiveCampaigns(
    ctx.tenantId,
    ctx.workspaceId,
    companies.map(c => c.id),
  ).catch(() => new Set<string>())

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-muted-foreground text-sm">{companies.length} records</p>
        </div>
        <AddCompanyDialog
          workspaceSlug={workspaceSlug}
          segments={segments.map(s => ({ id: s.id, name: s.name }))}
        />
      </div>

      <CompaniesTable
        companies={companies}
        segments={segments}
        sequences={sequences}
        inCampaignIds={[...inCampaign]}
        workspaceSlug={workspaceSlug}
        activeSegmentId={segment ?? ''}
        activeStatus={status ?? ''}
        activeIndustry={industry ?? ''}
        activeSort={sort ?? ''}
        activeDir={dir === 'desc' ? 'desc' : 'asc'}
        search={search ?? ''}
      />
    </div>
  )
}
