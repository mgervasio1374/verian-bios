'use client'

import { useState, useTransition } from 'react'
import { Printer, Send, Loader2, CheckCircle2 } from 'lucide-react'
import { submitProposalInquiry } from '@/modules/proposals/actions/proposal-inquiry.actions'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      <Printer className="h-4 w-4" />
      Print
    </button>
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
