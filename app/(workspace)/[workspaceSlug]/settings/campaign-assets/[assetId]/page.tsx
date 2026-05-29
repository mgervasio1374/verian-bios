import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { CampaignAssetDetail } from '../CampaignAssetDetail'
import { CampaignAssetEditor } from '../CampaignAssetEditor'
import { CampaignAssetReviewPanel } from '../CampaignAssetReviewPanel'
import { CloneAssetButton } from '../CloneAssetButton'

interface PageProps {
  params:      Promise<{ workspaceSlug: string; assetId: string }>
  searchParams: Promise<{ edit?: string }>
}

export default async function CampaignAssetDetailPage({ params, searchParams }: PageProps) {
  const { workspaceSlug, assetId } = await params
  const { edit }                   = await searchParams

  if (assetId === 'new') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">New Campaign Asset</h1>
        <CampaignAssetEditor workspaceSlug={workspaceSlug} />
      </div>
    )
  }

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  const asset    = await assetRepo.getAssetById(ctx.tenantId, assetId).catch(() => null)

  if (!asset) notFound()

  if (edit === '1' && asset.status === 'draft') {
    const initial = {
      assetName:             asset.asset_name,
      campaignType:          asset.campaign_type,
      subjectTemplate:       asset.subject_template,
      bodyTemplateHtml:      asset.body_template_html,
      bodyTemplateText:      asset.body_template_text,
      personalizationFields: (asset.personalization_fields as string[]) ?? [],
      requiredFields:        (asset.required_fields as string[]) ?? [],
      fallbackValues:        (asset.fallback_values as Record<string, string>) ?? {},
    }
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Edit Asset</h1>
        <CampaignAssetEditor workspaceSlug={workspaceSlug} assetId={assetId} initial={initial} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <CloneAssetButton
          workspaceSlug={workspaceSlug}
          sourceId={assetId}
          sourceName={asset.asset_name}
        />
      </div>

      {(asset.status === 'under_review' || asset.status === 'approved' || asset.status === 'active') && (
        <CampaignAssetReviewPanel asset={asset} workspaceSlug={workspaceSlug} />
      )}

      <CampaignAssetDetail asset={asset} workspaceSlug={workspaceSlug} />
    </div>
  )
}
