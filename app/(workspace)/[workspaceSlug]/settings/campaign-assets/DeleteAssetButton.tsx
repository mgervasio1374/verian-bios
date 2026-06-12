'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteAssetAction } from './actions'

interface Props {
  workspaceSlug: string
  assetId:       string
  assetName:     string
}

export function DeleteAssetButton({ workspaceSlug, assetId, assetName }: Props) {
  const router = useRouter()
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()

  function handleDelete() {
    setError(null)
    if (!window.confirm(`Delete asset "${assetName}"? Nothing references it, so this removes it permanently.`)) {
      return
    }
    setLoading(true)
    startTransition(async () => {
      const result = await deleteAssetAction(workspaceSlug, assetId)
      setLoading(false)
      if (result.ok) {
        router.push(`/${workspaceSlug}/settings/campaign-assets`)
      } else {
        setError(result.error ?? 'Delete failed.')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
        {loading
          ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          : <Trash2 className="h-4 w-4 mr-1" />}
        Delete Asset
      </Button>
      {error && <p className="text-xs text-red-600 max-w-[280px] text-right">{error}</p>}
    </div>
  )
}
