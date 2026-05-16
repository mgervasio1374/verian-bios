'use client'

import { useState } from 'react'
import { CheckCheck, X, Clock, AlertTriangle } from 'lucide-react'
import { approveAndSendAction, rejectTokenAction, holdTokenAction } from './actions'

interface ReviewFormProps {
  token: string
  initialSubject: string
  initialBodyText: string
  initialBodyHtml: string
  hasPdf?: boolean
}

type ActionState =
  | { type: 'idle' }
  | { type: 'loading'; action: 'approve' | 'reject' | 'hold' }
  | { type: 'success'; action: 'approve' | 'reject' | 'hold' }
  | { type: 'error'; message: string }

export function ReviewForm({
  token,
  initialSubject,
  initialBodyText,
  initialBodyHtml,
  hasPdf = false,
}: ReviewFormProps) {
  const [subject, setSubject] = useState(initialSubject)
  const [bodyText, setBodyText] = useState(initialBodyText)
  const [rejectReason, setRejectReason] = useState('')
  const [holdNotes, setHoldNotes] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showHold, setShowHold] = useState(false)
  const [state, setState] = useState<ActionState>({ type: 'idle' })

  const isLoading = state.type === 'loading'
  const isDone = state.type === 'success'

  if (state.type === 'success') {
    const messages: Record<string, { title: string; body: string }> = {
      approve: {
        title: 'Approved & Sent',
        body: 'The proposal email has been sent to the prospect. The lead stage has been updated to Proposal Sent.',
      },
      reject: {
        title: 'Proposal Rejected',
        body: 'The approval request has been marked as rejected.',
      },
      hold: {
        title: 'Held for Later',
        body: 'Your notes have been saved. The approval request remains open.',
      },
    }
    const { title, body } = messages[state.action] ?? messages.approve
    return (
      <div className="bg-white rounded-xl border shadow-sm p-8 text-center space-y-3">
        <CheckCheck className="h-10 w-10 text-green-500 mx-auto" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    )
  }

  async function handleApprove() {
    setState({ type: 'loading', action: 'approve' })
    const result = await approveAndSendAction(token, subject, bodyText, initialBodyHtml)
    if (result.success) {
      setState({ type: 'success', action: 'approve' })
    } else {
      setState({ type: 'error', message: result.error })
    }
  }

  async function handleReject() {
    setState({ type: 'loading', action: 'reject' })
    const result = await rejectTokenAction(token, rejectReason)
    if (result.success) {
      setState({ type: 'success', action: 'reject' })
    } else {
      setState({ type: 'error', message: result.error })
    }
  }

  async function handleHold() {
    setState({ type: 'loading', action: 'hold' })
    const result = await holdTokenAction(token, holdNotes)
    if (result.success) {
      setState({ type: 'success', action: 'hold' })
    } else {
      setState({ type: 'error', message: result.error })
    }
  }

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {state.type === 'error' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      {/* Email editor */}
      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Proposed Customer Email
        </h2>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={isLoading || isDone}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Body
            <span className="ml-2 text-muted-foreground font-normal normal-case">
              — edit directly before approving
            </span>
          </label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            disabled={isLoading || isDone}
            rows={14}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono leading-relaxed
                       focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 resize-y"
          />
        </div>
      </div>

      {/* Action panel */}
      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Decision
        </h2>

        {/* Primary: Approve & Send */}
        <button
          onClick={handleApprove}
          disabled={isLoading || isDone || !subject.trim() || !bodyText.trim()}
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700
                     text-white font-semibold rounded-lg px-4 py-3 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCheck className="h-4 w-4" />
          {isLoading && state.action === 'approve'
            ? 'Approving & Sending…'
            : hasPdf ? 'Approve & Send to Prospect (PDF attached)' : 'Approve & Send to Prospect'}
        </button>

        {/* Secondary actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setShowHold(!showHold); setShowReject(false) }}
            disabled={isLoading || isDone}
            className="flex items-center justify-center gap-1.5 border rounded-lg px-4 py-2.5
                       text-sm font-medium text-muted-foreground hover:bg-muted/50
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Clock className="h-4 w-4" />
            Hold
          </button>
          <button
            onClick={() => { setShowReject(!showReject); setShowHold(false) }}
            disabled={isLoading || isDone}
            className="flex items-center justify-center gap-1.5 border border-red-200 rounded-lg px-4 py-2.5
                       text-sm font-medium text-red-600 hover:bg-red-50
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <X className="h-4 w-4" />
            Reject
          </button>
        </div>

        {/* Hold notes */}
        {showHold && (
          <div className="space-y-2 border-t pt-4">
            <label className="text-xs font-medium text-muted-foreground">
              Hold notes (optional)
            </label>
            <textarea
              value={holdNotes}
              onChange={(e) => setHoldNotes(e.target.value)}
              disabled={isLoading}
              rows={3}
              placeholder="Why are you holding this? What's needed before it can proceed?"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 resize-none"
            />
            <button
              onClick={handleHold}
              disabled={isLoading}
              className="w-full border rounded-lg px-4 py-2 text-sm font-medium
                         text-muted-foreground hover:bg-muted/50 disabled:opacity-50
                         disabled:cursor-not-allowed transition-colors"
            >
              {isLoading && state.action === 'hold' ? 'Saving…' : 'Save Hold Notes'}
            </button>
          </div>
        )}

        {/* Reject reason */}
        {showReject && (
          <div className="space-y-2 border-t pt-4">
            <label className="text-xs font-medium text-muted-foreground">
              Reason for rejection (optional)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              disabled={isLoading}
              rows={3}
              placeholder="Why is this proposal being rejected?"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 resize-none"
            />
            <button
              onClick={handleReject}
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold
                         rounded-lg px-4 py-2 text-sm transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading && state.action === 'reject' ? 'Rejecting…' : 'Confirm Rejection'}
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-center text-muted-foreground pb-4">
        Approve & Send will immediately deliver the email to the prospect.
        The customer email will not be sent without your approval.
      </p>
    </div>
  )
}
