'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { generateFollowUpDraftAction } from '@/modules/proposals/actions/proposal-follow-up-draft.actions'

interface GenerateFollowUpDraftButtonProps {
  commitmentId: string
  existingDraftId?: string | null
  disabled?: boolean
}

type State =
  | { type: 'idle' }
  | { type: 'confirming' }
  | { type: 'loading' }
  | { type: 'success'; draftId: string }
  | { type: 'warning'; draftId: string; warningCode: string; message: string }
  | { type: 'error'; message: string }

function warningMessage(code: string | undefined): string {
  switch (code) {
    case 'approval_request_failed':
      return 'Draft created, but approval request setup failed. Review queue may need attention.'
    case 'approval_link_failed':
      return 'Draft created, but approval request was not linked to the draft. Review queue may need attention.'
    case 'audit_failed':
      return 'Draft created, but audit logging failed. The draft is recoverable.'
    default:
      return 'Draft created with a partial setup issue. The draft is recoverable.'
  }
}

export function GenerateFollowUpDraftButton({
  commitmentId,
  existingDraftId,
  disabled,
}: GenerateFollowUpDraftButtonProps) {
  const [state, setState]    = useState<State>({ type: 'idle' })
  const [, startTransition]  = useTransition()
  const router               = useRouter()
  // Synchronous in-flight guard: prevents double-submit on fast double-click before
  // React re-renders to the loading state. useTransition alone is not sufficient
  // because the state update is batched and the second click can fire before it lands.
  const inFlightRef          = useRef(false)

  // If a draft already exists, show a read-only indicator — not an active button.
  if (existingDraftId) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
        <FileText className="h-3.5 w-3.5" />
        Draft Exists
      </span>
    )
  }

  function handleConfirm() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setState({ type: 'loading' })

    startTransition(async () => {
      try {
        const result = await generateFollowUpDraftAction({ commitmentId })
        if (result.success) {
          if (result.data.warning) {
            // Do not refresh here — keep the warning visible so the operator can
            // read it. A manual refresh button is provided in the warning state.
            setState({
              type:        'warning',
              draftId:     result.data.draftId,
              warningCode: result.data.warning,
              message:     warningMessage(result.data.warning),
            })
          } else {
            setState({ type: 'success', draftId: result.data.draftId })
            router.refresh()
          }
        } else {
          setState({ type: 'error', message: result.error })
        }
      } finally {
        inFlightRef.current = false
      }
    })
  }

  if (state.type === 'success') {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-600 font-medium whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Draft Created
      </span>
    )
  }

  if (state.type === 'warning') {
    return (
      <div className="flex flex-col gap-1 min-w-[160px]">
        <div className="flex items-center gap-1 text-xs text-blue-600 font-medium whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Draft Created — Needs Review Setup
        </div>
        <div className="flex items-start gap-1 rounded bg-amber-50 border border-amber-200 p-1.5 text-[10px] text-amber-700">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="break-words">{state.message}</span>
        </div>
        <button
          onClick={() => router.refresh()}
          className="text-[10px] text-muted-foreground hover:text-foreground text-left"
        >
          Refresh queue
        </button>
      </div>
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
          Generate a draft email for this follow-up?
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          This creates a draft for review. It does not send an email.
        </p>
        <div className="flex gap-1">
          <button
            onClick={handleConfirm}
            className="text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700
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
        Generating…
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
      Generate Draft
    </button>
  )
}
