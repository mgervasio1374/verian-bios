import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { listCampaignSequencesForWorkspace } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { listCampaignTypes } from '@/modules/campaign-sequence/repositories/campaign-type.repo'
import { listAssetsForWorkspace } from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { listSenderIdentities } from '@/modules/messaging/repositories/email-draft.repo'
import { SequenceBuilder } from './SequenceBuilder'
import { SequenceList } from './SequenceList'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function CampaignSequencesPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)

  const [sequences, types, senders, assets] = await Promise.all([
    listCampaignSequencesForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => []),
    listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId }).catch(() => []),
    listSenderIdentities(ctx.tenantId).catch(() => []),
    listAssetsForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => []),
  ])

  const usableAssets = assets.filter(a => a.status === 'active' || a.status === 'approved')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaign Sequences</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build manual multi-step outreach sequences for campaign automation.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Runtime note:</span> authoring_mode and
        sender_identity_id columns require migration 20240045 to be applied. The sequence builder
        is dormant until that operator step is complete.
      </div>

      <SequenceList sequences={sequences} types={types} workspaceSlug={workspaceSlug} />

      <SequenceBuilder
        workspaceSlug={workspaceSlug}
        campaignTypes={types}
        senderIdentities={senders}
        assets={usableAssets}
      />
    </div>
  )
}
