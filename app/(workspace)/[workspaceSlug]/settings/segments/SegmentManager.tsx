'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  addCompanyToSegmentAction,
  removeCompanyFromSegmentAction,
  listSegmentMembersAction,
  searchCompaniesNotInSegmentAction,
} from '@/modules/crm/actions/segment.actions'
import type { SegmentMember } from '@/modules/crm/repositories/segment.repo'

interface Props {
  segmentId:   string
  segmentName: string
}

export function SegmentManager({ segmentId, segmentName }: Props) {
  const [pending, startTransition] = useTransition()

  const [members, setMembers] = useState<SegmentMember[]>([])
  const [loaded,  setLoaded]  = useState(false)
  const [search,  setSearch]  = useState('')
  const [results, setResults] = useState<SegmentMember[]>([])
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listSegmentMembersAction(segmentId).then(result => {
      if (cancelled) return
      if (result.success) {
        setMembers(result.data)
      } else {
        setError(result.error)
      }
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [segmentId])

  function refreshMembers() {
    startTransition(async () => {
      const result = await listSegmentMembersAction(segmentId)
      if (result.success) setMembers(result.data)
    })
  }

  function handleSearch() {
    setError(null)
    startTransition(async () => {
      const result = await searchCompaniesNotInSegmentAction(segmentId, search)
      if (!result.success) {
        setError(result.error)
        return
      }
      setResults(result.data)
    })
  }

  function handleAdd(companyId: string) {
    setError(null)
    startTransition(async () => {
      const result = await addCompanyToSegmentAction(segmentId, companyId)
      if (!result.success) {
        setError(result.error)
        return
      }
      setResults(prev => prev.filter(c => c.company_id !== companyId))
      refreshMembers()
    })
  }

  function handleRemove(companyId: string) {
    setError(null)
    startTransition(async () => {
      const result = await removeCompanyFromSegmentAction(segmentId, companyId)
      if (!result.success) {
        setError(result.error)
        return
      }
      setMembers(prev => prev.filter(m => m.company_id !== companyId))
    })
  }

  return (
    <div className="rounded-md border bg-muted/20 p-4 space-y-4">
      <p className="text-xs font-semibold">Companies in &quot;{segmentName}&quot;</p>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {/* Member list */}
      {!loaded ? (
        <p className="text-xs text-muted-foreground">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-muted-foreground">No companies in this segment yet.</p>
      ) : (
        <ul className="space-y-1">
          {members.map(member => (
            <li key={member.company_id} className="flex items-center justify-between text-sm">
              <span>{member.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(member.company_id)}
                disabled={pending}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add companies */}
      <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-medium">Add companies</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            className="rounded border px-2 py-1.5 text-sm flex-1"
            placeholder="Search companies by name"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={pending}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            Search
          </button>
        </div>

        {results.length > 0 && (
          <ul className="space-y-1">
            {results.map(company => (
              <li key={company.company_id} className="flex items-center justify-between text-sm">
                <span>{company.name}</span>
                <button
                  type="button"
                  onClick={() => handleAdd(company.company_id)}
                  disabled={pending}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
