'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Inbox } from 'lucide-react'
import { releaseImportedLeadsAction } from '@/modules/crm/actions/lead.actions'

interface ImportedLead {
  id:              string
  name:            string
  estimated_value: number | null
  created_at:      string
}

interface Props {
  leads:         ImportedLead[]
  workspaceSlug: string
}

export function ImportedLeadsReview({ leads, workspaceSlug }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError]     = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (leads.length === 0) return null

  const allSelected = leads.length > 0 && leads.every(l => selectedIds.has(l.id))

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(leads.map(l => l.id)))
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function release(ids: string[]) {
    if (ids.length === 0) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await releaseImportedLeadsAction(ids)
      if (!result.success) {
        setError(result.error)
        return
      }
      setMessage(`Released ${result.data.released} lead${result.data.released === 1 ? '' : 's'} into the pipeline.`)
      setSelectedIds(new Set())
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200">
        <Inbox className="h-4 w-4 text-amber-700" />
        <span className="text-sm font-semibold text-amber-900">Imported — Needs Review</span>
        <span className="text-xs text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">{leads.length}</span>
        <span className="ml-auto text-xs text-amber-800">
          Review imported leads, then release them into the active pipeline.
        </span>
      </div>

      {(message || error) && (
        <div className="px-4 pt-3">
          {message && <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">{message}</div>}
          {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">{error}</div>}
        </div>
      )}

      {/* Bulk toolbar */}
      <div className="flex items-center gap-3 px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-amber-900">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all imported leads" />
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
        </label>
        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => release(Array.from(selectedIds))}
            disabled={pending}
            className="ml-auto rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? 'Releasing…' : `Release ${selectedIds.size} into pipeline`}
          </button>
        )}
      </div>

      <div className="bg-card rounded-b-lg overflow-hidden divide-y">
        {leads.map(lead => (
          <div key={lead.id} className="flex items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              checked={selectedIds.has(lead.id)}
              onChange={() => toggleSelected(lead.id)}
              aria-label={`Select ${lead.name}`}
            />
            <Link
              href={`/${workspaceSlug}/leads/${lead.id}`}
              className="text-sm font-medium flex-1 min-w-0 truncate hover:underline"
            >
              {lead.name}
            </Link>
            {lead.estimated_value != null && (
              <span className="text-xs text-muted-foreground shrink-0">${lead.estimated_value.toLocaleString()}</span>
            )}
            <button
              type="button"
              onClick={() => release([lead.id])}
              disabled={pending}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50 shrink-0"
            >
              Release
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
