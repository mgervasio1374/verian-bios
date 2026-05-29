import Link from 'next/link'
import { DRAFT_SOURCE_BADGE } from '@/modules/messaging/drafts/draft-source.constants'

interface Props {
  sourceType:     string | null
  sourceAssetId?: string | null
  workspaceSlug?: string
}

export function DraftSourceBadge({ sourceType, sourceAssetId, workspaceSlug }: Props) {
  if (!sourceType) return null

  const config = DRAFT_SOURCE_BADGE[sourceType]
  if (!config) return null

  const badge = (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${config.colorClass}`}>
      {config.label}
    </span>
  )

  if (sourceType === 'campaign_asset_render' && sourceAssetId && workspaceSlug) {
    return (
      <Link href={`/${workspaceSlug}/settings/campaign-assets/${sourceAssetId}`}>
        {badge}
      </Link>
    )
  }

  return badge
}
