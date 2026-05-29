'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cloneAssetAction } from './actions'

interface Props {
  workspaceSlug: string
  sourceId:      string
  sourceName:    string
}

export function CloneAssetButton({ workspaceSlug, sourceId, sourceName }: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()
  const [newName, setNewName]      = useState(`${sourceName} (Copy)`)
  const [open,    setOpen]         = useState(false)
  const [error,   setError]        = useState<string | null>(null)

  function handleClone() {
    if (!newName.trim()) {
      setError('Asset name is required.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await cloneAssetAction(workspaceSlug, sourceId, newName)
      setOpen(false)
      router.push(`/${workspaceSlug}/settings/campaign-assets/${result.assetId}`)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border px-3 py-1.5 text-xs hover:bg-muted"
      >
        Clone
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <input
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        className="rounded border px-2 py-1 text-xs"
      />
      <button
        onClick={handleClone}
        disabled={pending}
        className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Cloning…' : 'Confirm Clone'}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground hover:underline"
      >
        Cancel
      </button>
    </div>
  )
}
