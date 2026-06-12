import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { listCampaignSequencesForWorkspace } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { listCampaignSequenceStepsForSequence } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import { listCampaignTypes } from '@/modules/campaign-sequence/repositories/campaign-type.repo'
import { listAssetsForWorkspace } from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { listSenderIdentities } from '@/modules/messaging/repositories/email-draft.repo'
import { sequenceUsageForWorkspace, usageState } from '@/modules/campaign-sequence/services/sequence-usage.service'
import { SequenceBuilder } from './SequenceBuilder'
import { SequenceList } from './SequenceList'
import { GenerateAiSequenceCard } from './GenerateAiSequenceCard'
import type { SequenceListRow } from './SequenceList'

// V6: AI sequence generation runs up to 5 sequential LLM calls; server
// actions inherit this segment config, so give them headroom.
export const maxDuration = 60

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

  // V1: usage probe + steps per sequence drive the edit/delete rule table
  const usageMap = await sequenceUsageForWorkspace(
    ctx.tenantId, ctx.workspaceId, sequences.map(s => s.id),
  ).catch(() => new Map())

  const rows: SequenceListRow[] = await Promise.all(
    sequences.map(async sequence => {
      const usage = usageMap.get(sequence.id) ?? { active: 0, total: 0, historical: false }
      const steps = await listCampaignSequenceStepsForSequence(
        sequence.id, ctx.tenantId, ctx.workspaceId,
      ).catch(() => [])
      return {
        sequence,
        usage:       usageState(usage),
        activeCount: usage.active,
        totalCount:  usage.total,
        steps: steps.map(s => ({
          id:                   s.id,
          step_number:          s.step_number,
          day_offset:           s.day_offset ?? 0,
          campaignEmailAssetId: s.campaign_email_asset_id ?? '',
        })),
      }
    }),
  )

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

      <SequenceList
        rows={rows}
        types={types}
        senderIdentities={senders}
        assets={usableAssets}
        workspaceSlug={workspaceSlug}
      />

      <GenerateAiSequenceCard campaignTypes={types} senderIdentities={senders} />

      <SequenceBuilder
        workspaceSlug={workspaceSlug}
        campaignTypes={types}
        senderIdentities={senders}
        assets={usableAssets}
      />
    </div>
  )
}
