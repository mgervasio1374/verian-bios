'use client'

// NOTE: this is currently the ONLY stop surface for contact-scoped campaign
// assignments — the lead page's stop card lists assignments by lead, so
// contact-scoped rows (V1 bulk-assign flow) never appear there.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { stopCampaignSequenceAction } from '@/modules/messaging/actions/campaign-assignment.actions'

interface Props {
  assignmentId: string
}

export function StopCampaignButton({ assignmentId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleStop() {
    setError(null)
    if (!window.confirm('Stop this campaign? Pending touches are cancelled and the assignment is retired.')) {
      return
    }
    startTransition(async () => {
      const result = await stopCampaignSequenceAction(assignmentId)
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
        onClick={handleStop}
        disabled={pending}
        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        {pending ? 'Stopping…' : 'Stop'}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  )
}
