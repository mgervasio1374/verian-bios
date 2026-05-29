'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitForReviewAction } from './actions'

interface Props {
  workspaceSlug: string
  assetId:       string
}

export function SubmitForReviewButton({ workspaceSlug, assetId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        await submitForReviewAction(workspaceSlug, assetId)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Submit failed')
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSubmit}
        disabled={pending}
        className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit for Review'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
