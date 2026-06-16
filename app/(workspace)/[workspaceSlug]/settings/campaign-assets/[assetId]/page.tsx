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
import { DeleteAssetButton } from '../DeleteAssetButton'
import { assetUsage } from '@/modules/campaign-sequence/services/sequence-usage.service'
import { listCampaignTypes } from '@/modules/campaign-sequence/repositories/campaign-type.repo'

// V3.1: AI revision retries transient 429/5xx (up to ~3x30s worst case);
// server actions inherit this segment config, so give them headroom.
export const maxDuration = 60

interface PageProps {
  params:      Promise<{ workspaceSlug: string; assetId: string }>
  searchParams: Promise<{ edit?: string }>
}

export default async function CampaignAssetDetailPage({ params, searchParams }: PageProps) {
  const { workspaceSlug, assetId } = await params
  const { edit }                   = await searchParams

  if (assetId === 'new') {
    // Build ctx (the early return predated it) so the dropdown can read DB types.
    const supabase = await createSupabaseServerClient()
    const ctx      = await buildRequestContext(supabase)
    const types    = await listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId }).catch(() => [])
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">New Campaign Asset</h1>
        <CampaignAssetEditor workspaceSlug={workspaceSlug} campaignTypes={types.map(t => ({ slug: t.slug, name: t.name }))} />
      </div>
    )
  }

  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  const asset    = await assetRepo.getAssetById(ctx.tenantId, assetId).catch(() => null)

  if (!asset) notFound()

  const sourceDrafts      = await emailDraftRepo.getDraftsBySourceAsset(ctx.tenantId, assetId, 10).catch(() => [])
  const assignedLeads     = await assignmentRepo.getCampaignAssignmentsForAsset(ctx.workspaceId, assetId).catch(() => [])

  // V1 usage rules: editable unless an ACTIVE assignment's sequence references
  // this asset (any status — operator-owned copy in manual mode); hard delete
  // only when nothing references it at all.
  const usage = await assetUsage(assetId, ctx.tenantId, ctx.workspaceId)
    .catch(() => ({ activeAssignments: 1, referencedBySteps: true, referencedByDrafts: true }))
  const editable  = usage.activeAssignments === 0
  const deletable = editable && !usage.referencedBySteps && !usage.referencedByDrafts

  if (edit === '1' && editable) {
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
    const types = await listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId }).catch(() => [])
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Edit Asset</h1>
        <CampaignAssetEditor
          workspaceSlug={workspaceSlug}
          assetId={assetId}
          campaignTypes={types.map(t => ({ slug: t.slug, name: t.name }))}
          initial={initial}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {asset.status === 'draft' ? (
          <SubmitForReviewButton workspaceSlug={workspaceSlug} assetId={assetId} />
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          {editable ? (
            <Link
              href={`/${workspaceSlug}/settings/campaign-assets/${assetId}?edit=1`}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Edit Content
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">
              Locked — used by an active campaign. Stop the campaign first to edit.
            </span>
          )}
          <CloneAssetButton
            workspaceSlug={workspaceSlug}
            sourceId={assetId}
            sourceName={asset.asset_name}
          />
          {deletable && (
            <DeleteAssetButton
              workspaceSlug={workspaceSlug}
              assetId={assetId}
              assetName={asset.asset_name}
            />
          )}
        </div>
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
