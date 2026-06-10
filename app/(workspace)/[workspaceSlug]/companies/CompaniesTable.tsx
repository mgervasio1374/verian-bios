'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addCompaniesToSegmentAction } from '@/modules/crm/actions/segment.actions'
import { bulkAssignCampaignAction } from '@/modules/messaging/actions/campaign-assignment.actions'
import type { SegmentWithCount } from '@/modules/crm/repositories/segment.repo'
import type { Database } from '@/types/database'

type CompanyRow = Database['public']['Tables']['companies']['Row']

interface SequenceOption {
  id:               string
  name:             string
  campaignTypeSlug: string
}

function getStatusBadgeClass(status: string | null): string {
  switch (status) {
    case 'active':   return 'bg-teal-50 text-teal-700 border border-teal-200'
    case 'prospect': return 'bg-blue-50 text-blue-700 border border-blue-200'
    case 'churned':  return 'bg-red-50 text-red-700 border border-red-200'
    default:         return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
}

interface Props {
  companies:       CompanyRow[]
  segments:        SegmentWithCount[]
  sequences:       SequenceOption[]
  workspaceSlug:   string
  activeSegmentId: string
  search:          string
}

export function CompaniesTable({ companies, segments, sequences, workspaceSlug, activeSegmentId, search }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set())
  const [targetSegmentId, setTargetSegmentId] = useState('')
  const [error,           setError]           = useState<string | null>(null)
  const [successMessage,  setSuccessMessage]  = useState<string | null>(null)

  const [showAssignPanel,  setShowAssignPanel]  = useState(false)
  const [assignSequenceId, setAssignSequenceId] = useState('')
  const [preApproved,      setPreApproved]      = useState(false)

  const allSelected = companies.length > 0 && companies.every(c => selectedIds.has(c.id))
  const hasFilter   = Boolean(activeSegmentId || search)

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(companies.map(c => c.id)))
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleSegmentFilterChange(segmentId: string) {
    setSelectedIds(new Set())
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (segmentId) params.set('segment', segmentId)
    const qs = params.toString()
    router.push(`/${workspaceSlug}/companies${qs ? `?${qs}` : ''}`)
  }

  function handleAddToSegment() {
    setError(null)
    setSuccessMessage(null)

    if (!targetSegmentId) {
      setError('Pick a segment to add the selected companies to.')
      return
    }

    const ids = Array.from(selectedIds)
    startTransition(async () => {
      const result = await addCompaniesToSegmentAction(targetSegmentId, ids)
      if (!result.success) {
        setError(result.error)
        return
      }
      const segmentName = segments.find(s => s.id === targetSegmentId)?.name ?? 'segment'
      setSuccessMessage(`Added ${result.data.added} ${result.data.added === 1 ? 'company' : 'companies'} to ${segmentName}`)
      setSelectedIds(new Set())
      router.refresh()
    })
  }

  function handleBulkAssign() {
    setError(null)
    setSuccessMessage(null)

    const sequence = sequences.find(s => s.id === assignSequenceId)
    if (!sequence) {
      setError('Pick a campaign sequence to assign.')
      return
    }

    const count = selectedIds.size
    const confirmed = window.confirm(
      `Assign campaign to the contacts of ${count} ${count === 1 ? 'company' : 'companies'}?\n\n` +
      `Sequence: ${sequence.name}\n` +
      `Pre-approved first touch: ${preApproved ? 'yes' : 'no'}`
    )
    if (!confirmed) return

    const ids = Array.from(selectedIds)
    startTransition(async () => {
      const result = await bulkAssignCampaignAction(ids, assignSequenceId, preApproved)
      if (!result.success) {
        setError(result.error)
        return
      }
      const t = result.data
      const skipped = [
        t.skippedDuplicate     > 0 ? `${t.skippedDuplicate} duplicates` : null,
        t.skippedNoEmail       > 0 ? `${t.skippedNoEmail} without email` : null,
        t.skippedDoNotContact  > 0 ? `${t.skippedDoNotContact} do-not-contact` : null,
        t.companiesWithNoContacts > 0 ? `${t.companiesWithNoContacts} companies without contacts` : null,
        t.failed               > 0 ? `${t.failed} failed` : null,
      ].filter(Boolean).join(', ')
      setSuccessMessage(
        `Created ${t.created} assignment${t.created === 1 ? '' : 's'}.${skipped ? ` Skipped: ${skipped}.` : ''}`
      )
      setSelectedIds(new Set())
      setShowAssignPanel(false)
      setAssignSequenceId('')
      setPreApproved(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {/* Segment filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="segment-filter">
          Segment
        </label>
        <select
          id="segment-filter"
          value={activeSegmentId}
          onChange={e => handleSegmentFilterChange(e.target.value)}
          className="rounded border px-2 py-1.5 text-sm bg-background"
        >
          <option value="">All companies</option>
          {segments.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.member_count})
            </option>
          ))}
        </select>
      </div>

      {successMessage && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {/* Bulk toolbar — one action for now; S3 adds more buttons alongside */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-xs font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={targetSegmentId}
              onChange={e => setTargetSegmentId(e.target.value)}
              className="rounded border px-2 py-1.5 text-xs bg-background"
            >
              <option value="">Choose segment…</option>
              {segments.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddToSegment}
              disabled={pending}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? 'Adding…' : 'Add to segment'}
            </button>
            <button
              type="button"
              onClick={() => setShowAssignPanel(prev => !prev)}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Assign campaign
            </button>
          </div>
        </div>
      )}

      {/* Assign-campaign panel (MCM v2 Slice S3) */}
      {selectedIds.size > 0 && showAssignPanel && (
        sequences.length === 0 ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            No manual campaign sequences exist yet.{' '}
            <Link href={`/${workspaceSlug}/settings/campaign-sequences`} className="text-primary hover:underline">
              Create one in Campaign Sequences
            </Link>{' '}
            first.
          </div>
        ) : (
          <div className="rounded-md border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold">Assign campaign to selected companies&apos; contacts</p>

            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium">Campaign sequence</span>
              <select
                value={assignSequenceId}
                onChange={e => setAssignSequenceId(e.target.value)}
                disabled={pending}
                className="rounded border px-2 py-1.5 text-sm bg-background max-w-md"
              >
                <option value="">Choose sequence…</option>
                {sequences.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.campaignTypeSlug})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-start gap-2 text-xs max-w-md">
              <input
                type="checkbox"
                checked={preApproved}
                onChange={e => setPreApproved(e.target.checked)}
                disabled={pending}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Pre-approved — skip first-touch approval</span>
                <span className="block text-muted-foreground mt-0.5">
                  All steps send automatically on schedule once sending is enabled. Leave unchecked
                  to review each contact&apos;s first email in the inbox.
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={handleBulkAssign}
              disabled={pending || !assignSequenceId}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending
                ? 'Assigning…'
                : `Assign to contacts of ${selectedIds.size} ${selectedIds.size === 1 ? 'company' : 'companies'}`}
            </button>
          </div>
        )
      )}

      {companies.length === 0 ? (
        hasFilter ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No companies match the current filter.
          </p>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No companies yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add your first company to get started</p>
          </div>
        )
      ) : (
        <div className="rounded-lg border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all companies"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Industry</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelected(c.id)}
                      aria-label={`Select ${c.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${workspaceSlug}/companies/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.domain && (
                      <p className="text-xs text-muted-foreground">{c.domain}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.industry ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', getStatusBadgeClass(c.status))}>
                      {c.status ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{c.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
