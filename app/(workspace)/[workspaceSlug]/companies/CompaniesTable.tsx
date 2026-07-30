'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompanyName } from '@/lib/format'
import { addCompaniesToSegmentAction } from '@/modules/crm/actions/segment.actions'
import { updateCompaniesCustomerStatusAction } from '@/modules/crm/actions/company.actions'
import { bulkAssignCampaignAction } from '@/modules/messaging/actions/campaign-assignment.actions'
import {
  checkActiveBroadcastAction,
  createBroadcastAction,
  startBroadcastAction,
  queueBroadcastAction,
  terminateBroadcastAction,
} from '@/modules/messaging/actions/broadcast.actions'
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

interface BroadcastAssetOption { id: string; name: string }

interface Props {
  companies:       CompanyRow[]
  segments:        SegmentWithCount[]
  sequences:       SequenceOption[]
  broadcastAssets: BroadcastAssetOption[]
  /** company id -> segment names, for the Segment column. */
  segmentsByCompany: Record<string, string[]>
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
  broadcastAssets,
  segmentsByCompany,
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
  const [searchInput,     setSearchInput]     = useState(search)
  const [targetSegmentId, setTargetSegmentId] = useState('')
  const [customerStatusValue, setCustomerStatusValue] = useState('')
  const [error,           setError]           = useState<string | null>(null)
  const [successMessage,  setSuccessMessage]  = useState<string | null>(null)

  const [showAssignPanel,  setShowAssignPanel]  = useState(false)
  const [assignSequenceId, setAssignSequenceId] = useState('')
  const [showBlastPanel,   setShowBlastPanel]   = useState(false)
  const [blastName,        setBlastName]        = useState('')
  const [blastAssetId,     setBlastAssetId]     = useState('')
  const [blastGraceDays,   setBlastGraceDays]   = useState('7')
  // 'selected' = the checked rows on this page; 'filtered' = every company
  // matching the current filters, resolved server-side. The table paginates at
  // 50 and clears selection when paging, so 'filtered' is the only way to
  // address a whole book in one send.
  const [blastScope,       setBlastScope]       = useState<'selected' | 'filtered'>('selected')
  const [blastStartDate,   setBlastStartDate]   = useState('')
  const [blastStartTime,   setBlastStartTime]   = useState('10:00')
  const [blastWindowStart, setBlastWindowStart] = useState('09:00')
  const [blastWindowEnd,   setBlastWindowEnd]   = useState('17:00')
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

  // Live search: each keystroke re-queries the server after a short settle, so
  // results narrow letter-by-letter across the WHOLE dataset (not just the
  // loaded page). The guard makes the effect a no-op once the URL catches up.
  useEffect(() => {
    if (searchInput.trim() === search) return
    const timer = setTimeout(() => {
      setSelectedIds(new Set())
      navigate({ search: searchInput.trim() })
    }, 350)
    return () => clearTimeout(timer)
    // navigate is re-created per render but only closes over current props —
    // including it would reset the debounce timer on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search])

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

  function handleCreateBroadcast() {
    setError(null)
    setSuccessMessage(null)

    const asset = broadcastAssets.find(a => a.id === blastAssetId)
    if (!blastName.trim()) { setError('Give the one-time email a name.'); return }
    if (!asset)            { setError('Pick the email to send.'); return }

    const scopeLabel = blastScope === 'filtered'
      ? `all ${total} ${total === 1 ? 'company' : 'companies'} matching the current filters`
      : `${selectedIds.size} selected ${selectedIds.size === 1 ? 'company' : 'companies'}`
    const confirmed = window.confirm(
      `Send a one-time email to the contacts of ${scopeLabel}?\n\n` +
      `Email: ${asset.name}\n` +
      `Starts: ${blastStartDate ? `${blastStartDate} at ${blastStartTime}` : 'as soon as it is started'}\n` +
      `Sends between ${blastWindowStart} and ${blastWindowEnd} each day\n\n` +
      'It goes out at the current sending velocity, not all at once, and yields ' +
      'to any campaign that starts while it runs.\n\n' +
      'Customers, former customers, suppressed addresses, and duplicate inboxes are excluded.'
    )
    if (!confirmed) return

    startTransition(async () => {
      const created = await createBroadcastAction({
        name:                 blastName.trim(),
        campaignEmailAssetId: blastAssetId,
        ...(blastScope === 'filtered'
          ? {
              filter: {
                search:         search || undefined,
                segmentId:      activeSegmentId || undefined,
                status:         activeStatus || undefined,
                industry:       activeIndustry || undefined,
                customerStatus: (activeCustomer || undefined) as
                  'prospect' | 'customer' | 'former_customer' | undefined,
              },
            }
          : { companyIds: Array.from(selectedIds) }),
        gracePeriodDays:      Number(blastGraceDays) || 7,
        startDate:            blastStartDate || undefined,
        startTime:            blastStartTime || undefined,
        sendWindowStart:      blastWindowStart,
        sendWindowEnd:        blastWindowEnd,
      })
      if (!created.success) { setError(created.error); return }

      const r = created.data
      if (r.totalRecipients === 0) {
        setError('No sendable recipients after exclusions. Nothing was started.')
        return
      }
      const started = await startBroadcastAction(r.broadcastId)
      if (!started.success) { setError(started.error); return }

      const excluded = [
        r.skippedDuplicateEmail  > 0 ? `${r.skippedDuplicateEmail} duplicate inboxes` : null,
        r.skippedSuppressed      > 0 ? `${r.skippedSuppressed} suppressed` : null,
        r.skippedCustomers       > 0 ? `${r.skippedCustomers} customers` : null,
        r.skippedFormerCustomers > 0 ? `${r.skippedFormerCustomers} former customers` : null,
        r.skippedDoNotContact    > 0 ? `${r.skippedDoNotContact} do-not-contact` : null,
        r.skippedNoEmail         > 0 ? `${r.skippedNoEmail} without email` : null,
      ].filter(Boolean).join(', ')

      setSuccessMessage(
        `One-time email started: ${r.totalRecipients} recipients.` +
        (excluded ? ` Excluded: ${excluded}.` : '')
      )
      setSelectedIds(new Set())
      setShowBlastPanel(false)
      setBlastName('')
      setBlastAssetId('')
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
      // A campaign automatically outranks a running broadcast for the daily
      // send allowance, but the operator still owns the choice the automatic
      // yield cannot make: hold the blast, let it trickle alongside, or drop it.
      const active = await checkActiveBroadcastAction()
      if (active.success && active.data) {
        const b = active.data
        const hold = window.confirm(
          `A one-time email is ${b.status}: "${b.name}", ${b.remaining} recipients left.\n\n` +
          'This campaign takes priority for the daily send allowance either way.\n\n' +
          `OK: hold the one-time email and resume it ${b.gracePeriodDays} days after this campaign finishes.\n` +
          'Cancel: decide between keeping it running or dropping it.'
        )
        if (hold) {
          if (b.status === 'active') {
            const queued = await queueBroadcastAction(b.broadcastId)
            if (!queued.success) { setError(queued.error); return }
          }
        } else {
          const keep = window.confirm(
            `Keep "${b.name}" running alongside this campaign?\n\n` +
            'OK: keep it running. It sends only what the campaign leaves of the daily allowance.\n' +
            'Cancel: terminate it. Remaining recipients will never be emailed.'
          )
          if (!keep) {
            const terminated = await terminateBroadcastAction(b.broadcastId)
            if (!terminated.success) { setError(terminated.error); return }
          }
        }
      }

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
      // Both of these read as missing assignments unless we say why, so they get
      // their own sentence rather than joining the terse skipped list.
      const formerSuffix = t.skippedFormerCustomers > 0
        ? ` Skipped ${t.skippedFormerCustomers} former customer${t.skippedFormerCustomers === 1 ? '' : 's'} — they need a win-back campaign, not cold copy.`
        : ''
      const sharedInboxSuffix = t.skippedDuplicateRecipient > 0
        ? ` Skipped ${t.skippedDuplicateRecipient} contact${t.skippedDuplicateRecipient === 1 ? '' : 's'} already in this campaign — one person can own several locations, and they get one email.`
        : ''
      setSuccessMessage(
        `Created ${t.created} assignment${t.created === 1 ? '' : 's'}.${skipped ? ` Skipped: ${skipped}.` : ''}${customerSuffix}${formerSuffix}${sharedInboxSuffix}${warningSuffix}`
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
        {/* Search — live (debounced) server search via the same navigate() as the
            filters, so it composes with segment/status/industry. Supports * as a
            wildcard: "b*" = starts with b, "*son" = ends with son. */}
        <form
          onSubmit={e => { e.preventDefault(); setSelectedIds(new Set()); navigate({ search: searchInput.trim() }) }}
          className="flex items-center gap-2"
        >
          <input
            type="search"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search companies…  (b* = starts with B)"
            className="rounded border px-2 py-1.5 text-sm bg-background w-64"
            aria-label="Search companies — * acts as a wildcard"
            title="Filters as you type. Use * as a wildcard: b* matches names starting with B, *son matches names ending in son."
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearchInput(''); setSelectedIds(new Set()); navigate({ search: '' }) }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          )}
        </form>

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
            <button
              type="button"
              onClick={() => { setBlastScope('selected'); setShowBlastPanel(true) }}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              One-time email
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

      {/* Always-available entry point. The bulk toolbar only appears once rows
          are checked, but a whole-book send is defined by the FILTER, not by a
          selection, so it must be reachable with nothing checked. */}
      {!showBlastPanel && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => { setBlastScope(selectedIds.size > 0 ? 'selected' : 'filtered'); setShowBlastPanel(true) }}
            disabled={pending}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            Send a one-time email
          </button>
        </div>
      )}

      {/* One-time email panel — a single send to the chosen cohort, dripped at
          the current velocity and yielding to any campaign. */}
      {showBlastPanel && (
        broadcastAssets.length === 0 ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            No activated email assets exist yet.{' '}
            <Link href={`/${workspaceSlug}/settings/campaign-assets`} className="text-primary hover:underline">
              Create and activate one
            </Link>
            {' '}first. Only reviewed, active copy can go out as a one-time email.
          </div>
        ) : (
          <div className="space-y-3 rounded-md border bg-muted/20 px-3 py-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium">One-time email</div>
              <button
                type="button"
                onClick={() => setShowBlastPanel(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium">Who it goes to</div>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="blast-scope"
                  checked={blastScope === 'filtered'}
                  onChange={() => setBlastScope('filtered')}
                  className="mt-0.5"
                />
                <span>
                  All {total} {total === 1 ? 'company' : 'companies'} matching the current filters
                  <span className="block text-muted-foreground">
                    Resolved on the server, so it covers every page, not just this one.
                    Narrow it first with search, segment, industry, or status.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="blast-scope"
                  checked={blastScope === 'selected'}
                  onChange={() => setBlastScope('selected')}
                  disabled={selectedIds.size === 0}
                  className="mt-0.5"
                />
                <span className={selectedIds.size === 0 ? 'text-muted-foreground' : ''}>
                  Only the {selectedIds.size} checked on this page
                  {selectedIds.size === 0 && (
                    <span className="block">Check some rows to use this.</span>
                  )}
                </span>
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Name</span>
                <input
                  type="text"
                  value={blastName}
                  onChange={e => setBlastName(e.target.value)}
                  placeholder="e.g. Fall rate review offer"
                  className="w-56 rounded border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Email</span>
                <select
                  value={blastAssetId}
                  onChange={e => setBlastAssetId(e.target.value)}
                  className="w-56 rounded border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Choose an active asset…</option>
                  {broadcastAssets.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Grace period</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    value={blastGraceDays}
                    onChange={e => setBlastGraceDays(e.target.value)}
                    className="w-16 rounded border px-2 py-1.5 text-sm"
                  />
                  <span className="text-muted-foreground">days</span>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t pt-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Start on</span>
                <input
                  type="date"
                  value={blastStartDate}
                  onChange={e => setBlastStartDate(e.target.value)}
                  className="rounded border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">at</span>
                <input
                  type="time"
                  value={blastStartTime}
                  onChange={e => setBlastStartTime(e.target.value)}
                  className="rounded border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Send only between</span>
                <div className="flex items-center gap-1">
                  <input
                    type="time"
                    value={blastWindowStart}
                    onChange={e => setBlastWindowStart(e.target.value)}
                    className="rounded border px-2 py-1.5 text-sm"
                  />
                  <span className="text-muted-foreground">and</span>
                  <input
                    type="time"
                    value={blastWindowEnd}
                    onChange={e => setBlastWindowEnd(e.target.value)}
                    className="rounded border px-2 py-1.5 text-sm"
                  />
                </div>
              </label>
              <span className="pb-2 text-xs text-muted-foreground">America/New_York</span>
              <button
                type="button"
                onClick={handleCreateBroadcast}
                disabled={
                  pending || !blastAssetId || !blastName.trim() ||
                  (blastScope === 'selected' && selectedIds.size === 0) ||
                  (blastScope === 'filtered' && total === 0)
                }
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? 'Starting…' : 'Start sending'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Sends at the current velocity until the rotation finishes, and only inside the
              window above, every day it runs. Leave the start date blank to begin as soon as
              you start it. If a campaign starts meanwhile it takes priority, and you can hold
              this email and resume it after the grace period rather than losing the list.
            </p>
          </div>
        )
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
                {/* Segment and Marketing are computed post-query — not sortable */}
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Segment</th>
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
                      {formatCompanyName(c.name)}
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
                    {(segmentsByCompany[c.id]?.length ?? 0) > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {segmentsByCompany[c.id].map(name => (
                          <span
                            key={name}
                            className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
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
