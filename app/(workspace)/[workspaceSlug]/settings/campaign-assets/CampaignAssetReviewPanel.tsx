'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Database } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CampaignAssetStatusBadge } from './CampaignAssetStatusBadge'
import { validateActivationReadiness } from '@/modules/messaging/services/campaign-asset-validation.service'
import { approveAssetAction, activateAssetAction, retireAssetAction } from './actions'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

interface Props {
  asset:         CampaignEmailAssetRow
  workspaceSlug: string
}

export function CampaignAssetReviewPanel({ asset, workspaceSlug }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const requiredFields = (asset.required_fields as string[]) ?? []
  const fallbackValues = (asset.fallback_values as Record<string, string>) ?? {}
  const readiness      = validateActivationReadiness({ requiredFields, fallbackValues })

  function handleApprove() {
    setError(null)
    startTransition(async () => {
      try {
        await approveAssetAction(workspaceSlug, asset.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Approve failed')
      }
    })
  }

  function handleActivate() {
    setError(null)
    startTransition(async () => {
      try {
        await activateAssetAction(workspaceSlug, asset.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Activate failed')
      }
    })
  }

  function handleRetire() {
    setError(null)
    startTransition(async () => {
      try {
        await retireAssetAction(workspaceSlug, asset.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Retire failed')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          Review Panel
          <CampaignAssetStatusBadge status={asset.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Subject (fallback render)</p>
          <p className="rounded bg-muted px-3 py-2 text-sm">{asset.subject_template}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Body Text (fallback render)</p>
          <pre className="rounded bg-muted px-3 py-2 text-xs whitespace-pre-wrap">{asset.body_template_text}</pre>
        </div>

        {!readiness.ready && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
            Missing required field fallbacks: {readiness.missingFields.join(', ')}
          </div>
        )}

        {asset.approved_by && (
          <p className="text-xs text-muted-foreground">
            Approved by: <span className="font-medium">{asset.approved_by}</span>
            {asset.approved_at && ` on ${new Date(asset.approved_at).toLocaleDateString()}`}
          </p>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 flex-wrap">
          {asset.status === 'under_review' && (
            <button
              onClick={handleApprove}
              disabled={pending}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? 'Approving…' : 'Approve'}
            </button>
          )}
          {asset.status === 'approved' && (
            <button
              onClick={handleActivate}
              disabled={pending || !readiness.ready}
              className="rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50"
            >
              {pending ? 'Activating…' : 'Activate'}
            </button>
          )}
          {asset.status === 'active' && (
            <button
              onClick={handleRetire}
              disabled={pending}
              className="rounded bg-destructive px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? 'Retiring…' : 'Retire'}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
