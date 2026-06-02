'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MinusCircle, Loader2, AlertTriangle } from 'lucide-react'
import { skipFollowUpCommitmentAction } from '@/modules/proposals/actions/proposal-follow-up-mutations.actions'

interface SkipFollowUpButtonProps {
  commitmentId: string
  disabled?: boolean
}

type State =
  | { type: 'idle' }
  | { type: 'confirming' }
  | { type: 'loading' }
  | { type: 'success' }
  | { type: 'error'; message: string }

export function SkipFollowUpButton({ commitmentId, disabled }: SkipFollowUpButtonProps) {
  const [state, setState]         = useState<State>({ type: 'idle' })
  const [skippedReason, setSkippedReason] = useState('')
  const [, startTransition]       = useTransition()
  const router                    = useRouter()

  function handleConfirm() {
    setState({ type: 'loading' })
    const normalizedReason = skippedReason.trim() || undefined
    startTransition(async () => {
      const result = await skipFollowUpCommitmentAction({
        commitmentId,
        skippedReason: normalizedReason,
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
        <MinusCircle className="h-3.5 w-3.5" />
        Skipped
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
      <div className="flex flex-col gap-1.5 min-w-[160px]">
        <p className="text-[10px] text-muted-foreground whitespace-nowrap">
          Skip this follow-up commitment?
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          This marks the commitment as skipped. It does not send an email.
        </p>
        <textarea
          value={skippedReason}
          onChange={e => setSkippedReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={2}
          className="text-[10px] border rounded px-1.5 py-1 resize-none text-foreground
                     placeholder:text-muted-foreground/50 w-full"
        />
        <div className="flex gap-1">
          <button
            onClick={handleConfirm}
            className="text-[10px] font-medium text-white bg-amber-600 hover:bg-amber-700
                       rounded px-2 py-0.5 transition-colors whitespace-nowrap"
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
        Skipping…
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
      Skip
    </button>
  )
}
