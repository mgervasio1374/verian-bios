'use client'

import type { AssetStatus } from '@/modules/messaging/campaign-assets/campaign-asset.types'

const STATUS_CONFIG: Record<AssetStatus, { label: string; className: string }> = {
  draft:        { label: 'Draft',       className: 'bg-gray-100 text-gray-700' },
  under_review: { label: 'In Review',   className: 'bg-yellow-100 text-yellow-800' },
  approved:     { label: 'Approved',    className: 'bg-blue-100 text-blue-800' },
  active:       { label: 'Active',      className: 'bg-green-100 text-green-800' },
  retired:      { label: 'Retired',     className: 'bg-muted text-muted-foreground' },
}

export function CampaignAssetStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as AssetStatus] ?? { label: status, className: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
