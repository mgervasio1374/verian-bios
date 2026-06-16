'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteProposalEventAction } from '@/modules/proposals/actions/proposal-event-delete.actions'

interface Props {
  eventId:       string
  workspaceSlug: string
}

// Soft-deletes a mis-keyed proposal event after a confirm. On success, redirects to
// the linked company (fallback: the proposal-events inbox).
export function DeleteProposalButton({ eventId, workspaceSlug }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!window.confirm('Delete this proposal event? This removes it from the pipeline. This cannot be undone from the UI.')) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await deleteProposalEventAction(eventId)
      if (!result.success) {
        setError(result.error)
        return
      }
      const dest = result.data.companyId
        ? `/${workspaceSlug}/companies/${result.data.companyId}`
        : `/${workspaceSlug}/proposal-events`
      router.push(dest)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="inline-flex items-center gap-1 text-sm font-medium text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Delete
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
