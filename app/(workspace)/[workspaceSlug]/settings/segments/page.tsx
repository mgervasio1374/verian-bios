import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { listSegmentsForWorkspace } from '@/modules/crm/repositories/segment.repo'
import { SegmentList } from './SegmentList'
import { NewSegmentForm } from './NewSegmentForm'

export default async function SegmentsPage() {
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)

  const segments = await listSegmentsForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Segments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group companies into named segments (e.g. a vendor show list) for bulk campaign
            assignment. Segments do not change a company&apos;s source.
          </p>
        </div>
      </div>

      <SegmentList segments={segments} />

      <NewSegmentForm />
    </div>
  )
}
