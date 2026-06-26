'use client'

// Operator action: "Mark Do Not Contact (Opt Out)". Fully honors an opt-out —
// flags the contact, suppresses the email, and terminates active campaigns +
// queued touches via optOutContactAction. Mirrors StopCampaignButton (confirm ->
// server action -> refresh). Renders nothing when the contact is already opted
// out (the DNC badge is shown by the page instead).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { optOutContactAction } from '@/modules/crm/actions/contact.actions'

interface Props {
  contactId:      string
  doNotContact?:  boolean
  className?:     string
}

export function OptOutContactButton({ contactId, doNotContact, className }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (doNotContact) return null

  function handleOptOut() {
    setError(null)
    if (!window.confirm('This stops all active campaigns for this contact and prevents future emails. Continue?')) {
      return
    }
    startTransition(async () => {
      const result = await optOutContactAction(contactId)
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
        onClick={handleOptOut}
        disabled={pending}
        className={className ?? 'text-xs font-medium text-red-600 hover:underline disabled:opacity-50'}
      >
        {pending ? 'Marking…' : 'Mark Do Not Contact'}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  )
}
