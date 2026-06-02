'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { sendFollowUpDraftAction } from '@/modules/proposals/actions/proposal-follow-up-send.actions'

interface SendFollowUpDraftButtonProps {
  commitmentId: string
  draftStatus: string | null
  emailSendingEnabled: boolean
  disabled?: boolean
}

type State =
  | { type: 'idle' }
  | { type: 'confirming' }
  | { type: 'loading' }
  | { type: 'success' }
  | { type: 'error'; message: string }

export function SendFollowUpDraftButton({
  commitmentId,
  draftStatus,
  emailSendingEnabled,
  disabled,
}: SendFollowUpDraftButtonProps) {
  const [state, setState]    = useState<State>({ type: 'idle' })
  const [, startTransition]  = useTransition()
  const router               = useRouter()
  // Synchronous in-flight guard: prevents double-submit on fast double-click before
  // React re-renders to the loading state.
  const inFlightRef          = useRef(false)

  // No draft linked — nothing to show for send
  if (!draftStatus) return null

  // Draft exists but is still pending review — cannot send yet
  if (draftStatus === 'pending_approval') {
    return (
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        Draft pending approval
      </span>
    )
  }

  // Draft was already sent — read-only indicator
  if (draftStatus === 'sent' || state.type === 'success') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 font-medium whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Sent
      </span>
    )
  }

  // Draft approved but email sending is currently disabled
  if (draftStatus === 'approved' && !emailSendingEnabled) {
    return (
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        Email sending disabled
      </span>
    )
  }

  // Draft not in a sendable state (rejected, superseded, etc.)
  if (draftStatus !== 'approved') return null

  // ---- Active send path: draft is approved and emailSendingEnabled = true ----

  function handleConfirm() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setState({ type: 'loading' })

    startTransition(async () => {
      try {
        const result = await sendFollowUpDraftAction({ commitmentId })
        if (result.success) {
          setState({ type: 'success' })
          router.refresh()
        } else {
          setState({ type: 'error', message: result.error })
        }
      } finally {
        inFlightRef.current = false
      }
    })
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
          Send this follow-up email?
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          This sends the approved draft. It cannot be undone.
        </p>
        <div className="flex gap-1">
          <button
            onClick={handleConfirm}
            disabled={inFlightRef.current}
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
        Sending…
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
      Send Email
    </button>
  )
}
