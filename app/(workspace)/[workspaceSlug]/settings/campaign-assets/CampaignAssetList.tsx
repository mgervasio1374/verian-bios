import Link from 'next/link'
import type { Database } from '@/types/database'
import { CAMPAIGN_TYPE } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { CampaignAssetStatusBadge } from './CampaignAssetStatusBadge'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

const CAMPAIGN_TYPE_VALUES = Object.values(CAMPAIGN_TYPE)

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

interface Props {
  assets:        CampaignEmailAssetRow[]
  workspaceSlug: string
}

export function CampaignAssetList({ assets, workspaceSlug }: Props) {
  if (assets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No campaign email assets yet. Create your first asset to get started.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b">
            <th className="text-left pb-2 pr-4">Asset Name</th>
            <th className="text-left pb-2 pr-4">Campaign Type</th>
            <th className="text-left pb-2 pr-4">Status</th>
            <th className="text-right pb-2 pr-4">Fields</th>
            <th className="text-right pb-2 pr-4">Required</th>
            <th className="text-left pb-2 pr-4">AI</th>
            <th className="text-left pb-2 pr-4">Approved By</th>
            <th className="text-left pb-2 pr-4">Approved</th>
            <th className="text-left pb-2 pr-4">Updated</th>
            <th className="text-left pb-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {assets.map((asset) => {
            const isKnownType = CAMPAIGN_TYPE_VALUES.includes(asset.campaign_type as typeof CAMPAIGN_TYPE_VALUES[number])
            const fields      = (asset.personalization_fields as string[]) ?? []
            const required    = (asset.required_fields as string[]) ?? []
            return (
              <tr key={asset.id} className="hover:bg-muted/30">
                <td className="py-2 pr-4 font-medium">
                  <Link
                    href={`/${workspaceSlug}/settings/campaign-assets/${asset.id}`}
                    className="hover:underline text-foreground"
                  >
                    {asset.asset_name}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {isKnownType ? asset.campaign_type.replace(/_/g, ' ') : 'Custom'}
                </td>
                <td className="py-2 pr-4">
                  <CampaignAssetStatusBadge status={asset.status} />
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{fields.length}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{required.length}</td>
                <td className="py-2 pr-4">
                  {asset.llm_generated ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800">AI</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground truncate max-w-[120px]">
                  {asset.approved_by ?? '—'}
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {asset.approved_at ? formatRelative(asset.approved_at) : '—'}
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {formatRelative(asset.updated_at)}
                </td>
                <td className="py-2 text-xs">
                  <Link
                    href={`/${workspaceSlug}/settings/campaign-assets/${asset.id}`}
                    className="text-primary hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
