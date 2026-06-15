'use client'

import { useState, useTransition } from 'react'
import { Printer, FileText, Send, Loader2, CheckCircle2 } from 'lucide-react'
import { submitProposalInquiry } from '@/modules/proposals/actions/proposal-inquiry.actions'

// Dual print: "summary" prints only the proposal's numbers page; "full" prints
// the proposal followed by the backing intelligence pages. We toggle a body
// class that the page's print CSS keys off, then clear it on afterprint so the
// live view is never left in a print-scoped state.
function printWithMode(mode: 'summary' | 'full') {
  const cls = mode === 'summary' ? 'print-summary' : 'print-full'
  const clear = () => {
    document.body.classList.remove('print-summary', 'print-full')
    window.removeEventListener('afterprint', clear)
  }
  document.body.classList.remove('print-summary', 'print-full')
  document.body.classList.add(cls)
  window.addEventListener('afterprint', clear)
  window.print()
}

export function PrintButtons() {
  return (
    <div className="no-print flex items-center gap-2">
      <button
        type="button"
        onClick={() => printWithMode('summary')}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
      >
        <Printer className="h-4 w-4" />
        Print proposal
      </button>
      <button
        type="button"
        onClick={() => printWithMode('full')}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
      >
        <FileText className="h-4 w-4" />
        Print full document
      </button>
    </div>
  )
}

// Light, removable casual-copy deterrent for the intelligence panel (the
// "shown work"): non-selectable + right-click suppressed + a faint print-hidden
// watermark. This is friction, NOT real protection — the merchant's own numbers
// on the left remain fully selectable. Drop this wrapper to remove entirely.
export function IntelligenceGuard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        aria-hidden
        className="no-print pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
      >
        <span className="rotate-[-30deg] whitespace-nowrap text-5xl font-bold uppercase tracking-widest text-gray-900/[0.04]">
          321 Swipe · Confidential
        </span>
      </div>
      {children}
    </div>
  )
}

export function ProposalContactForm({ token }: { token: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await submitProposalInquiry(token, name, email, message)
      if (res.success) {
        setDone(res.message)
        setName(''); setEmail(''); setMessage('')
      } else {
        setError(res.message)
      }
    })
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-sm text-emerald-800">{done}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-gray-700">
          Your name
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Jane Doe"
          />
        </label>
        <label className="text-xs font-medium text-gray-700">
          Your email
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="jane@business.com"
          />
        </label>
      </div>
      <label className="text-xs font-medium text-gray-700 block">
        Message
        <textarea
          value={message} onChange={e => setMessage(e.target.value)} rows={4}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="I have a question about my savings estimate…"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {pending ? 'Sending…' : 'Send message'}
      </button>
    </div>
  )
}
