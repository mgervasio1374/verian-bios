'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addCompaniesToSegmentAction } from '@/modules/crm/actions/segment.actions'
import { updateCompaniesCustomerStatusAction } from '@/modules/crm/actions/company.actions'
import { bulkAssignCampaignAction } from '@/modules/messaging/actions/campaign-assignment.actions'
// V5: pure timing helpers for the live touch-schedule preview (no DB, client-safe)
import {
  computeTouchSchedule,
  dateInZoneISO,
  addDaysISO,
  shiftISODateBackOffWeekend,
  DEFAULT_TIMEZONE,
} from '@/modules/campaign-sequence/schedule-timing'
import { INDUSTRY_OPTIONS, COMPANY_STATUS_OPTIONS } from '@/modules/crm/constants'
import type { SegmentWithCount } from '@/modules/crm/repositories/segment.repo'
import type { Database } from '@/types/database'

type CompanyRow = Database['public']['Tables']['companies']['Row']

interface SequenceOption {
  id:               string
  name:             string
  campaignTypeSlug: string
  promptRisk?:      boolean // V1 prompt-leak heuristic (warning only)
  // V5 schedule preview inputs
  dayOffsets:       number[]
  sendTime:         string | null
  timeZone:         string | null
  skipWeekends:     boolean
}

function formatISODate(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function getStatusBadgeClass(status: string | null): string {
  switch (status) {
    case 'active':   return 'bg-teal-50 text-teal-700 border border-teal-200'
    case 'prospect': return 'bg-blue-50 text-blue-700 border border-blue-200'
    case 'churned':  return 'bg-red-50 text-red-700 border border-red-200'
    default:         return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
}

const CUSTOMER_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '',                label: 'All' },
  { value: 'prospect',        label: 'Prospects' },
  { value: 'customer',        label: 'Customers' },
  { value: 'former_customer', label: 'Former' },
]

const CUSTOMER_SET_OPTIONS: { value: string; label: string }[] = [
  { value: 'prospect',        label: 'Prospect' },
  { value: 'customer',        label: 'Customer' },
  { value: 'former_customer', label: 'Former customer' },
]

// Sortable columns map header labels to whitelisted repo columns (Location sorts by city).
const SORTABLE_COLUMNS: { label: string; column: string }[] = [
  { label: 'Name',     column: 'name' },
  { label: 'Industry', column: 'industry' },
  { label: 'Location', column: 'city' },
  { label: 'Status',   column: 'status' },
  { label: 'Source',   column: 'source' },
]

interface Props {
  companies:       CompanyRow[]
  segments:        SegmentWithCount[]
  sequences:       SequenceOption[]
  inCampaignIds:   string[]
  workspaceSlug:   string
  activeSegmentId: string
  activeStatus:    string
  activeIndustry:  string
  activeCustomer:  string
  activeSort:      string
  activeDir:       'asc' | 'desc'
  search:          string
  total:           number
  currentPage:     number
  pageSize:        number
  totalPages:      number
}

export function CompaniesTable({
  companies,
  segments,
  sequences,
  inCampaignIds,
  workspaceSlug,
  activeSegmentId,
  activeStatus,
  activeIndustry,
  activeCustomer,
  activeSort,
  activeDir,
  search,
  total,
  currentPage,
  pageSize,
  totalPages,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const inCampaign = useMemo(() => new Set(inCampaignIds), [inCampaignIds])

  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set())
  const [targetSegmentId, setTargetSegmentId] = useState('')
  const [customerStatusValue, setCustomerStatusValue] = useState('')
  const [error,           setError]           = useState<string | null>(null)
  const [successMessage,  setSuccessMessage]  = useState<string | null>(null)

  const [showAssignPanel,  setShowAssignPanel]  = useState(false)
  const [assignSequenceId, setAssignSequenceId] = useState('')
  const [preApproved,      setPreApproved]      = useState(false)
  const [startMode,        setStartMode]        = useState<'now' | 'date'>('now')
  const [startDate,        setStartDate]        = useState('')
  const [eventDate,        setEventDate]        = useState('') // panel-side math only — never stored

  // V5: live touch-schedule preview + event-date guard (warning only)
  const selectedSequence = sequences.find(s => s.id === assignSequenceId) ?? null
  const previewZone      = selectedSequence?.timeZone || DEFAULT_TIMEZONE
  const previewDayISOs   = useMemo(() => {
    if (!selectedSequence || selectedSequence.dayOffsets.length === 0) return []
    const startDateISO = startMode === 'date' && startDate
      ? startDate
      : dateInZoneISO(new Date(), previewZone)
    return computeTouchSchedule({
      startDateISO,
      dayOffsets:   selectedSequence.dayOffsets,
      sendTime:     selectedSequence.sendTime,
      timeZone:     selectedSequence.timeZone,
      skipWeekends: selectedSequence.skipWeekends,
    }).map(d => dateInZoneISO(d, previewZone))
  }, [selectedSequence, startMode, startDate, previewZone])

  const finalTouchISO = previewDayISOs.length > 0 ? previewDayISOs[previewDayISOs.length - 1] : null
  // Warn when the final touch lands inside the week before the event, or on/after it
  const eventWarning = (() => {
    if (!eventDate || !finalTouchISO || !selectedSequence) return null
    if (finalTouchISO <= addDaysISO(eventDate, -7)) return null
    const lastOffset = Math.max(...selectedSequence.dayOffsets)
    const suggested  = shiftISODateBackOffWeekend(addDaysISO(eventDate, -7 - lastOffset))
    return `Final touch lands ${formatISODate(finalTouchISO)} — inside the week before your ${formatISODate(eventDate)} event. Latest recommended start: ${formatISODate(suggested)}.`
  })()

  const allSelected = companies.length > 0 && companies.every(c => selectedIds.has(c.id))
  const hasFilter   = Boolean(activeSegmentId || search || activeStatus || activeIndustry || activeCustomer)

  // Selected companies that are existing customers — bulk-assign will skip them.
  const selectedCustomerCount = companies.filter(
    c => selectedIds.has(c.id) &&
      (c as unknown as Record<string, unknown>).customer_status === 'customer',
  ).length

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

  // Server-driven navigation preserving all other params
  function navigate(overrides: Record<string, string>) {
    const merged: Record<string, string> = {
      search,
      segment:  activeSegmentId,
      status:   activeStatus,
      industry: activeIndustry,
      customer: activeCustomer,
      sort:     activeSort,
      dir:      activeSort ? activeDir : '',
      ...overrides,
    }
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value)
    }
    const qs = params.toString()
    router.push(`/${workspaceSlug}/companies${qs ? `?${qs}` : ''}`)
  }

  function handleFilterChange(key: 'segment' | 'status' | 'industry' | 'customer', value: string) {
    setSelectedIds(new Set()) // filters change the visible rows — stale selection would be misleading
    navigate({ [key]: value })
  }

  function handleSort(column: string) {
    const nextDir = activeSort === column && activeDir === 'asc' ? 'desc' : 'asc'
    navigate({ sort: column, dir: nextDir })
  }

  // Pagination — navigate() preserves all active params; it does NOT carry `page`,
  // so filter/sort changes implicitly reset to page 1. Here we set it explicitly.
  function goToPage(p: number) {
    const clamped = Math.min(Math.max(1, p), totalPages)
    setSelectedIds(new Set()) // selection is per-page; clear when paging
    navigate({ page: clamped > 1 ? String(clamped) : '' })
  }

  function sortIndicator(column: string): string {
    if (activeSort !== column) return ''
    return activeDir === 'asc' ? ' ▲' : ' ▼'
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

  function handleSetCustomerStatus() {
    setError(null)
    setSuccessMessage(null)

    if (!customerStatusValue) {
      setError('Pick a customer status to set.')
      return
    }

    const ids = Array.from(selectedIds)
    startTransition(async () => {
      const result = await updateCompaniesCustomerStatusAction(ids, customerStatusValue)
      if (!result.success) {
        setError(result.error)
        return
      }
      const label = CUSTOMER_SET_OPTIONS.find(o => o.value === customerStatusValue)?.label ?? customerStatusValue
      setSuccessMessage(`Set ${result.data.updated} ${result.data.updated === 1 ? 'company' : 'companies'} to ${label}.`)
      setSelectedIds(new Set())
      setCustomerStatusValue('')
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

    if (startMode === 'date' && !startDate) {
      setError('Pick a start date or switch to "Start immediately".')
      return
    }
    const startsAt = startMode === 'date' ? startDate : undefined

    const count = selectedIds.size
    const customerNote = selectedCustomerCount > 0
      ? `\n\nNote: ${selectedCustomerCount} selected ${selectedCustomerCount === 1 ? 'company is an existing customer' : 'companies are existing customers'} and will be skipped.`
      : ''
    const confirmed = window.confirm(
      `Assign campaign to the contacts of ${count} ${count === 1 ? 'company' : 'companies'}?\n\n` +
      `Sequence: ${sequence.name}\n` +
      `Pre-approved first touch: ${preApproved ? 'yes' : 'no'}\n` +
      `Start: ${startsAt ? `on ${startsAt}` : 'immediately'}` +
      customerNote
    )
    if (!confirmed) return

    const ids = Array.from(selectedIds)
    startTransition(async () => {
      const result = await bulkAssignCampaignAction(ids, assignSequenceId, preApproved, undefined, startsAt)
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
      const warningSuffix = t.warnings?.length ? ` ⚠ ${t.warnings.join(' ')}` : ''
      const customerSuffix = t.skippedCustomers > 0
        ? ` Skipped ${t.skippedCustomers} customer${t.skippedCustomers === 1 ? '' : 's'} — excluded from campaigns.`
        : ''
      setSuccessMessage(
        `Created ${t.created} assignment${t.created === 1 ? '' : 's'}.${skipped ? ` Skipped: ${skipped}.` : ''}${customerSuffix}${warningSuffix}`
      )
      setSelectedIds(new Set())
      setShowAssignPanel(false)
      setAssignSequenceId('')
      setPreApproved(false)
      setStartMode('now')
      setStartDate('')
      setEventDate('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="segment-filter">
            Segment
          </label>
          <select
            id="segment-filter"
            value={activeSegmentId}
            onChange={e => handleFilterChange('segment', e.target.value)}
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

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="status-filter">
            Status
          </label>
          <select
            id="status-filter"
            value={activeStatus}
            onChange={e => handleFilterChange('status', e.target.value)}
            className="rounded border px-2 py-1.5 text-sm bg-background"
          >
            <option value="">All</option>
            {COMPANY_STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="industry-filter">
            Industry
          </label>
          <select
            id="industry-filter"
            value={activeIndustry}
            onChange={e => handleFilterChange('industry', e.target.value)}
            className="rounded border px-2 py-1.5 text-sm bg-background"
          >
            {INDUSTRY_OPTIONS.map(o => (
              <option key={o} value={o}>{o || 'All'}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="customer-filter">
            Customer
          </label>
          <select
            id="customer-filter"
            value={activeCustomer}
            onChange={e => handleFilterChange('customer', e.target.value)}
            className="rounded border px-2 py-1.5 text-sm bg-background"
          >
            {CUSTOMER_FILTER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
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
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <select
              value={customerStatusValue}
              onChange={e => setCustomerStatusValue(e.target.value)}
              className="rounded border px-2 py-1.5 text-xs bg-background"
              aria-label="Customer status"
            >
              <option value="">Set customer status…</option>
              {CUSTOMER_SET_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSetCustomerStatus}
              disabled={pending || !customerStatusValue}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Apply'}
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

            {sequences.find(s => s.id === assignSequenceId)?.promptRisk && (
              <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 max-w-md">
                This sequence references an asset that looks like an AI prompt, not finished
                email copy — it will be sent literally. Review the asset before assigning.
              </div>
            )}

            {/* V2: start control */}
            <div className="space-y-1 text-xs max-w-md">
              <span className="font-medium">Start</span>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="assign-start"
                  checked={startMode === 'now'}
                  onChange={() => setStartMode('now')}
                  disabled={pending}
                />
                Start immediately
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="assign-start"
                  checked={startMode === 'date'}
                  onChange={() => setStartMode('date')}
                  disabled={pending}
                />
                Start on date
                <input
                  type="date"
                  value={startDate}
                  onChange={e => { setStartMode('date'); setStartDate(e.target.value) }}
                  disabled={pending}
                  className="rounded border px-2 py-1 text-xs bg-background"
                />
              </label>
              <span className="block text-muted-foreground">
                Touches are scheduled from this date using each step&apos;s day offset.
              </span>
            </div>

            {/* V5: event-date guard + live schedule preview */}
            <label className="flex flex-col gap-1 text-xs max-w-md">
              <span className="font-medium">Event date (optional — e.g. the show)</span>
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                disabled={pending}
                className="rounded border px-2 py-1 text-xs bg-background w-fit"
              />
            </label>

            {previewDayISOs.length > 0 && (
              <div className="rounded border bg-muted/20 px-3 py-2 text-xs max-w-md space-y-1">
                <span className="font-medium">Touch schedule preview</span>
                <ol className="list-decimal list-inside text-muted-foreground">
                  {previewDayISOs.map((dayISO, i) => (
                    <li key={i}>{formatISODate(dayISO)}</li>
                  ))}
                </ol>
              </div>
            )}

            {eventWarning && (
              <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 max-w-md">
                ⚠ {eventWarning}
              </div>
            )}

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
                {SORTABLE_COLUMNS.map(col => (
                  <th key={col.column} className="px-4 py-3 text-left font-medium text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => handleSort(col.column)}
                      className="hover:text-foreground"
                    >
                      {col.label}{sortIndicator(col.column)}
                    </button>
                  </th>
                ))}
                {/* Marketing is computed post-query — not sortable */}
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Marketing</th>
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
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(() => {
                        const cs = (c as unknown as Record<string, unknown>).customer_status as string | undefined
                        if (cs === 'customer') {
                          return (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                              Customer
                            </span>
                          )
                        }
                        if (cs === 'former_customer') {
                          return (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                              Former
                            </span>
                          )
                        }
                        return null
                      })()}
                      {inCampaign.has(c.id) ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                          In campaign
                        </span>
                      ) : null}
                      {!inCampaign.has(c.id) &&
                        (c as unknown as Record<string, unknown>).customer_status !== 'customer' &&
                        (c as unknown as Record<string, unknown>).customer_status !== 'former_customer' && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination footer — preserves all active params; bounds-disabled. */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="rounded border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
