'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  pauseCampaignAssignmentAction,
  resumeCampaignAssignmentAction,
} from '@/modules/messaging/actions/campaign-assignment.actions'

interface Props {
  assignmentId: string
}

export function PauseCampaignButton({ assignmentId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handlePause() {
    setError(null)
    if (!window.confirm('Pause this campaign? Processing freezes in place until you resume.')) {
      return
    }
    startTransition(async () => {
      const result = await pauseCampaignAssignmentAction(assignmentId)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handlePause}
        disabled={pending}
        className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-50"
      >
        {pending ? 'Pausing…' : 'Pause'}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  )
}

export function ResumeCampaignButton({ assignmentId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleResume() {
    setError(null)
    // Resume does NOT re-anchor dates — surface the catch-up behavior up front.
    if (!window.confirm(
      'Resume this campaign? Touches that came due while paused will go out on the next scheduled run — dates are not re-anchored.'
    )) {
      return
    }
    startTransition(async () => {
      const result = await resumeCampaignAssignmentAction(assignmentId)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handleResume}
        disabled={pending}
        className="text-xs font-medium text-teal-700 hover:underline disabled:opacity-50"
      >
        {pending ? 'Resuming…' : 'Resume'}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  )
}
