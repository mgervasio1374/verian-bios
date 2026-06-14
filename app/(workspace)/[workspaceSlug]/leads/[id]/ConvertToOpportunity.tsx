'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { convertLeadToOpportunityAction } from '@/modules/crm/actions/opportunity.actions'

interface Props {
  leadId:        string
  workspaceSlug: string
  defaultName:   string
  defaultValue:  number | null
  existingOpportunity: { id: string; name: string } | null
}

export function ConvertToOpportunity({ leadId, workspaceSlug, defaultName, defaultValue, existingOpportunity }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [open, setOpen]   = useState(false)
  const [name, setName]   = useState(defaultName)
  const [value, setValue] = useState(defaultValue != null ? String(defaultValue) : '')
  const [closeDate, setCloseDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Already converted — show the bidirectional link instead of the button.
  if (existingOpportunity) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <TrendingUp className="h-4 w-4 text-teal-600" />
        <span className="text-muted-foreground">Converted to opportunity:</span>
        <Link
          href={`/${workspaceSlug}/opportunities`}
          className="font-medium text-primary hover:underline"
        >
          {existingOpportunity.name}
        </Link>
      </div>
    )
  }

  function handleConvert() {
    setError(null)
    startTransition(async () => {
      const result = await convertLeadToOpportunityAction(leadId, {
        name:              name.trim() || undefined,
        value:             value.trim() ? Number(value) : null,
        expectedCloseDate: closeDate || null,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent/40"
      >
        <TrendingUp className="h-4 w-4" /> Convert to Opportunity
      </button>
    )
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3 max-w-md">
      <p className="text-sm font-semibold">Convert to Opportunity</p>
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium">Opportunity name</span>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="rounded border px-2 py-1.5 text-sm"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Value ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            placeholder="0"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Expected close (optional)</span>
          <input
            type="date"
            value={closeDate}
            onChange={e => setCloseDate(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleConvert}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? 'Converting…' : 'Create opportunity'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={pending}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
