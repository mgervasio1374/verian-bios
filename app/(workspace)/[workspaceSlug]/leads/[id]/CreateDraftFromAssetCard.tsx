'use client'

import { useState, useTransition } from 'react'
import { createDraftFromAssetAction } from '@/app/(workspace)/[workspaceSlug]/settings/campaign-assets/actions'

interface AssetOption {
  id:            string
  asset_name:    string
  campaign_type: string
  status:        string
}

interface Props {
  workspaceSlug: string
  leadId:        string
  activeAssets:  AssetOption[]
}

export function CreateDraftFromAssetCard({ workspaceSlug: _workspaceSlug, leadId, activeAssets }: Props) {
  const [selectedAssetId, setSelectedAssetId] = useState<string>(activeAssets[0]?.id ?? '')
  const [result, setResult] = useState<{ ok: boolean; error?: string; missingFields?: string[] } | null>(null)
  const [isPending, startTransition] = useTransition()

  if (activeAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No approved or active campaign assets available. Create and approve an asset in Campaign Assets settings first.
      </p>
    )
  }

  function handleCreate() {
    if (!selectedAssetId) return
    setResult(null)
    startTransition(async () => {
      const res = await createDraftFromAssetAction(selectedAssetId, leadId)
      setResult(res)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select
          className="flex-1 text-sm border rounded px-2 py-1.5 bg-background"
          value={selectedAssetId}
          onChange={(e) => setSelectedAssetId(e.target.value)}
          disabled={isPending}
        >
          {activeAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.asset_name} ({asset.campaign_type.replace(/_/g, ' ')})
            </option>
          ))}
        </select>
        <button
          className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
          onClick={handleCreate}
          disabled={isPending || !selectedAssetId}
        >
          {isPending ? 'Creating…' : 'Create Draft'}
        </button>
      </div>

      {result?.ok && (result.missingFields?.length ?? 0) > 0 && (
        <div className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 rounded px-3 py-2">
          Draft created with {result.missingFields!.length} unresolved personalization field(s):{' '}
          {result.missingFields!.join(', ')}. Review and edit before approving.
        </div>
      )}

      {result?.ok && (result.missingFields?.length ?? 0) === 0 && (
        <p className="text-xs text-green-700">Draft created and ready for review.</p>
      )}

      {result && !result.ok && result.error === 'pending_draft_exists' && (
        <p className="text-xs text-red-600">
          This lead already has a pending draft. Resolve it before creating another.
        </p>
      )}

      {result && !result.ok && result.error === 'asset_not_eligible' && (
        <p className="text-xs text-red-600">Selected asset is not approved or active.</p>
      )}

      {result && !result.ok && result.error !== 'pending_draft_exists' && result.error !== 'asset_not_eligible' && (
        <p className="text-xs text-red-600">Error: {result.error}</p>
      )}
    </div>
  )
}
