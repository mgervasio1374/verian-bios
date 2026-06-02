'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Loader2, AlertTriangle } from 'lucide-react'
import { rescheduleFollowUpCommitmentAction } from '@/modules/proposals/actions/proposal-follow-up-mutations.actions'

interface RescheduleFollowUpButtonProps {
  commitmentId: string
  currentDueAt?: string
  disabled?: boolean
}

type State =
  | { type: 'idle' }
  | { type: 'confirming' }
  | { type: 'loading' }
  | { type: 'success' }
  | { type: 'error'; message: string }

// Convert an ISO timestamp to the format expected by datetime-local inputs (YYYY-MM-DDTHH:MM),
// using the operator's local timezone so the pre-populated value reads naturally.
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function RescheduleFollowUpButton({ commitmentId, currentDueAt, disabled }: RescheduleFollowUpButtonProps) {
  const [state, setState]                       = useState<State>({ type: 'idle' })
  const [nextFollowUpDueAt, setNextFollowUpDueAt] = useState(
    currentDueAt ? isoToDatetimeLocal(currentDueAt) : '',
  )
  const [, startTransition]                     = useTransition()
  const router                                  = useRouter()

  function handleConfirm() {
    if (!nextFollowUpDueAt) return
    const parsedDate = new Date(nextFollowUpDueAt)
    if (isNaN(parsedDate.getTime())) return
    // Convert datetime-local (local time, no timezone) to ISO string before passing to action.
    // Raw datetime-local values must NOT be passed directly — the server normalises via toISOString.
    const isoNextFollowUpDueAt = parsedDate.toISOString()
    setState({ type: 'loading' })
    startTransition(async () => {
      const result = await rescheduleFollowUpCommitmentAction({
        commitmentId,
        nextFollowUpDueAt: isoNextFollowUpDueAt,
      })
      if (result.success) {
        setState({ type: 'success' })
        router.refresh()
      } else {
        setState({ type: 'error', message: result.error })
      }
    })
  }

  if (state.type === 'success') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium whitespace-nowrap">
        <Calendar className="h-3.5 w-3.5" />
        Rescheduled
      </span>
    )
  }

  if (state.type === 'error') {
    return (
      <div className="flex flex-col gap-1 min-w-[140px]">
        <div className="flex items-start gap-1 rounded bg-red-50 border border-red-200 p-1.5 text-[10px] text-red-700">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="break-words">{state.message}</span>
        </div>
        <button
          onClick={() => setState({ type: 'idle' })}
          className="text-[10px] text-muted-foreground hover:text-foreground text-left"
        >
          Dismiss
        </button>
      </div>
    )
  }

  if (state.type === 'confirming') {
    return (
      <div className="flex flex-col gap-1.5 min-w-[180px]">
        <p className="text-[10px] text-muted-foreground whitespace-nowrap">
          Reschedule this follow-up commitment?
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          This changes the follow-up due date. It does not send an email or close the commitment.
        </p>
        <input
          type="datetime-local"
          value={nextFollowUpDueAt}
          onChange={e => setNextFollowUpDueAt(e.target.value)}
          className="text-[10px] border rounded px-1.5 py-1 text-foreground w-full"
        />
        <div className="flex gap-1">
          <button
            onClick={handleConfirm}
            disabled={!nextFollowUpDueAt}
            className="text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700
                       rounded px-2 py-0.5 transition-colors whitespace-nowrap
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
          <button
            onClick={() => setState({ type: 'idle' })}
            className="text-[10px] text-muted-foreground hover:text-foreground
                       border rounded px-2 py-0.5 transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (state.type === 'loading') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Rescheduling…
      </span>
    )
  }

  return (
    <button
      onClick={() => setState({ type: 'confirming' })}
      disabled={disabled}
      className="text-xs font-medium text-muted-foreground hover:text-foreground
                 border rounded-md px-2 py-1 transition-colors whitespace-nowrap
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Reschedule
    </button>
  )
}
