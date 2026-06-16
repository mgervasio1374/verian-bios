import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { listCampaignTypes } from '@/modules/campaign-sequence/repositories/campaign-type.repo'
import { CampaignTypeList } from './CampaignTypeList'
import { NewCampaignTypeForm } from './NewCampaignTypeForm'

export default async function CampaignTypesPage() {
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)

  // All statuses (admin view) — the author pickers filter to active elsewhere.
  const types = await listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId }).catch(() => [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaign Types</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Named campaign templates (e.g. &quot;Initial Contact&quot;). Create custom types, rename them,
          or retire ones you no longer use. The slug is fixed at creation — assets link to it.
        </p>
      </div>

      <CampaignTypeList
        types={types.map(t => ({
          id:          t.id,
          name:        t.name,
          slug:        t.slug,
          description: t.description,
          status:      t.status,
        }))}
      />

      <NewCampaignTypeForm />
    </div>
  )
}
