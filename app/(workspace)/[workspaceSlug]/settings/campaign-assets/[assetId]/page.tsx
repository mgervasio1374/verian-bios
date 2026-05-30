import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import * as emailDraftRepo from '@/modules/messaging/repositories/email-draft.repo'
import * as assignmentRepo from '@/modules/messaging/repositories/campaign-assignment.repo'
import { AssignedLeadsPanel } from './AssignedLeadsPanel'
import { CampaignAssetDetail } from '../CampaignAssetDetail'
import { CampaignAssetEditor } from '../CampaignAssetEditor'
import { CampaignAssetReviewPanel } from '../CampaignAssetReviewPanel'
import { CloneAssetButton } from '../CloneAssetButton'
import { SubmitForReviewButton } from '../SubmitForReviewButton'

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

  const sourceDrafts      = await emailDraftRepo.getDraftsBySourceAsset(ctx.tenantId, assetId, 10).catch(() => [])
  const assignedLeads     = await assignmentRepo.getCampaignAssignmentsForAsset(ctx.workspaceId, assetId).catch(() => [])

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
        {asset.status === 'draft' ? (
          <SubmitForReviewButton workspaceSlug={workspaceSlug} assetId={assetId} />
        ) : (
          <div />
        )}
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

      <AssignedLeadsPanel
        assetId={assetId}
        workspaceSlug={workspaceSlug}
        assignments={assignedLeads}
      />

      {/* Drafts Created from This Asset */}
      <div className="rounded-lg border bg-background p-4 space-y-3">
        <p className="text-sm font-semibold">Drafts Created from This Asset ({sourceDrafts.length})</p>
        {sourceDrafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No drafts created from this asset yet.</p>
        ) : (
          <ol className="space-y-2">
            {sourceDrafts.map((draft) => (
              <li key={draft.id} className="flex items-center gap-3 text-sm">
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                  draft.status === 'approved' ? 'bg-green-100 text-green-800' :
                  draft.status === 'sent'     ? 'bg-blue-100 text-blue-800'  :
                  draft.status === 'rejected' ? 'bg-red-100 text-red-700'    :
                                                'bg-gray-100 text-gray-600'
                }`}>{draft.status.replace(/_/g, ' ')}</span>
                {draft.lead_id && (
                  <Link
                    href={`/${workspaceSlug}/leads/${draft.lead_id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    View Lead →
                  </Link>
                )}
                <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                  {new Date(draft.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
