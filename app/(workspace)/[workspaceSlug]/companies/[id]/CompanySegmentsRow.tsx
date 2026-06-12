'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import {
  addCompanyToSegmentAction,
  removeCompanyFromSegmentAction,
} from '@/modules/crm/actions/segment.actions'

interface SegmentOption {
  id:   string
  name: string
}

interface Props {
  companyId:        string
  companySegments:  SegmentOption[] // segments this company is in
  workspaceSegments: SegmentOption[] // all segments in the workspace
}

export function CompanySegmentsRow({ companyId, companySegments, workspaceSegments }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const memberIds = new Set(companySegments.map(s => s.id))
  const available = workspaceSegments.filter(s => !memberIds.has(s.id))

  function handleAdd(segmentId: string) {
    if (!segmentId) return
    setError(null)
    startTransition(async () => {
      const result = await addCompanyToSegmentAction(segmentId, companyId)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleRemove(segmentId: string) {
    setError(null)
    startTransition(async () => {
      const result = await removeCompanyFromSegmentAction(segmentId, companyId)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Segments</span>

        {companySegments.length === 0 && (
          <span className="text-xs text-muted-foreground">No segments</span>
        )}

        {companySegments.map(segment => (
          <span
            key={segment.id}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
          >
            {segment.name}
            <button
              type="button"
              onClick={() => handleRemove(segment.id)}
              disabled={pending}
              aria-label={`Remove from ${segment.name}`}
              className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {available.length > 0 && (
          <select
            value=""
            onChange={e => handleAdd(e.target.value)}
            disabled={pending}
            className="rounded border px-2 py-0.5 text-xs bg-background"
          >
            <option value="">Add to segment…</option>
            {available.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
