import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { CampaignAssetList } from './CampaignAssetList'
import { AiAssetDraftButton } from './AiAssetDraftButton'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function CampaignAssetsPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  const assets   = await assetRepo.listAssetsForWorkspace(ctx.tenantId, ctx.workspaceId).catch(() => [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaign Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage reusable email templates for campaign automation.
          </p>
        </div>
        <Link
          href={`/${workspaceSlug}/settings/campaign-assets/new`}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          New Asset
        </Link>
      </div>

      <CampaignAssetList assets={assets} workspaceSlug={workspaceSlug} />

      <AiAssetDraftButton workspaceSlug={workspaceSlug} />
    </div>
  )
}
