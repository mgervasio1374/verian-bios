import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as companyService from '@/modules/crm/services/company.service'
import * as segmentService from '@/modules/crm/services/segment.service'
import { listSegmentsForWorkspace } from '@/modules/crm/repositories/segment.repo'
import { AddCompanyDialog } from './AddCompanyDialog'
import { CompaniesTable } from './CompaniesTable'

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

  const [companies, segments] = await Promise.all([
    (async () => {
      let ids: string[] | undefined
      if (segment) {
        ids = await segmentService.listCompanyIdsForSegment(ctx, segment).catch(() => [])
        if (ids.length === 0) return []
      }
      return companyService.listCompanies(ctx, { search, ids, limit: 50, offset })
    })().catch(() => []),
    listSegmentsForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => []),
  ])

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
        workspaceSlug={workspaceSlug}
        activeSegmentId={segment ?? ''}
        search={search ?? ''}
      />
    </div>
  )
}
