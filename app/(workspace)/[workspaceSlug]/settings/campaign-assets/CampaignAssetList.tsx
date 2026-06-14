'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Database } from '@/types/database'
import { CAMPAIGN_TYPE } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { CampaignAssetStatusBadge } from './CampaignAssetStatusBadge'
import { deleteAssetAction, bulkDeleteCampaignAssetsAction } from './actions'
import { filterAssets } from './asset-filter'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

const CAMPAIGN_TYPE_VALUES = Object.values(CAMPAIGN_TYPE)

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

interface Props {
  assets:        CampaignEmailAssetRow[]
  workspaceSlug: string
  // Asset ids referenced by a sequence step — protected from hard delete.
  referencedIds: string[]
}

export function CampaignAssetList({ assets, workspaceSlug, referencedIds }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const referenced = useMemo(() => new Set(referencedIds), [referencedIds])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [campaignType, setCampaignType] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Distinct campaign types present in the list drive the filter dropdown.
  const typeOptions = useMemo(
    () => Array.from(new Set(assets.map(a => a.campaign_type))).sort(),
    [assets],
  )

  const visible = useMemo(
    () => filterAssets(assets, { campaignType, search }),
    [assets, campaignType, search],
  )

  const visibleSelectableIds = visible.filter(a => !referenced.has(a.id)).map(a => a.id)
  const allSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every(id => selectedIds.has(id))

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(visibleSelectableIds))
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleBulkDelete() {
    setError(null)
    setMessage(null)
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected asset${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return

    startTransition(async () => {
      const result = await bulkDeleteCampaignAssetsAction(ids)
      if (!result.ok) {
        setError(result.error ?? 'Delete failed.')
        return
      }
      const skipNote = result.skippedInUse > 0
        ? ` Skipped ${result.skippedInUse} in use by a sequence.`
        : ''
      setMessage(`Deleted ${result.deleted} asset${result.deleted === 1 ? '' : 's'}.${skipNote}`)
      setSelectedIds(new Set())
      router.refresh()
    })
  }

  function handleInlineDelete(asset: CampaignEmailAssetRow) {
    setError(null)
    setMessage(null)
    if (!window.confirm(`Delete "${asset.asset_name}"? This cannot be undone.`)) return

    startTransition(async () => {
      const result = await deleteAssetAction(workspaceSlug, asset.id)
      if (!result.ok) {
        setError(result.error ?? 'Delete failed.')
        return
      }
      setSelectedIds(prev => { const n = new Set(prev); n.delete(asset.id); return n })
      setMessage(`Deleted "${asset.asset_name}".`)
      router.refresh()
    })
  }

  if (assets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No campaign email assets yet. Create your first asset to get started.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="asset-type-filter">
            Campaign Type
          </label>
          <select
            id="asset-type-filter"
            value={campaignType}
            onChange={e => { setCampaignType(e.target.value); setSelectedIds(new Set()) }}
            className="rounded border px-2 py-1.5 text-sm bg-background"
          >
            <option value="">All</option>
            {typeOptions.map(t => (
              <option key={t} value={t}>
                {CAMPAIGN_TYPE_VALUES.includes(t as typeof CAMPAIGN_TYPE_VALUES[number]) ? t.replace(/_/g, ' ') : t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="asset-search">
            Search
          </label>
          <input
            id="asset-search"
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Asset name…"
            className="rounded border px-2 py-1.5 text-sm bg-background"
          />
        </div>
      </div>

      {message && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">{message}</div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      {/* Bulk toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-xs font-medium">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={pending}
            className="ml-auto rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No assets match the current filter.</p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="w-8 pb-2 pr-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all assets"
                />
              </th>
              <th className="text-left pb-2 pr-4">Asset Name</th>
              <th className="text-left pb-2 pr-4">Campaign Type</th>
              <th className="text-left pb-2 pr-4">Status</th>
              <th className="text-right pb-2 pr-4">Fields</th>
              <th className="text-right pb-2 pr-4">Required</th>
              <th className="text-left pb-2 pr-4">AI</th>
              <th className="text-left pb-2 pr-4">Approved By</th>
              <th className="text-left pb-2 pr-4">Approved</th>
              <th className="text-left pb-2 pr-4">Updated</th>
              <th className="text-left pb-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((asset) => {
              const isKnownType = CAMPAIGN_TYPE_VALUES.includes(asset.campaign_type as typeof CAMPAIGN_TYPE_VALUES[number])
              const fields      = (asset.personalization_fields as string[]) ?? []
              const required    = (asset.required_fields as string[]) ?? []
              const inUse       = referenced.has(asset.id)
              return (
                <tr key={asset.id} className="hover:bg-muted/30">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(asset.id)}
                      onChange={() => toggleSelected(asset.id)}
                      disabled={inUse}
                      title={inUse ? 'In use by a sequence' : undefined}
                      aria-label={`Select ${asset.asset_name}`}
                    />
                  </td>
                  <td className="py-2 pr-4 font-medium">
                    <Link
                      href={`/${workspaceSlug}/settings/campaign-assets/${asset.id}`}
                      className="hover:underline text-foreground"
                    >
                      {asset.asset_name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {isKnownType ? asset.campaign_type.replace(/_/g, ' ') : 'Custom'}
                  </td>
                  <td className="py-2 pr-4">
                    <CampaignAssetStatusBadge status={asset.status} />
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fields.length}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{required.length}</td>
                  <td className="py-2 pr-4">
                    {asset.llm_generated ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800">AI</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground truncate max-w-[120px]">
                    {asset.approved_by ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {asset.approved_at ? formatRelative(asset.approved_at) : '—'}
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {formatRelative(asset.updated_at)}
                  </td>
                  <td className="py-2 text-xs whitespace-nowrap space-x-3">
                    <Link
                      href={`/${workspaceSlug}/settings/campaign-assets/${asset.id}`}
                      className="text-primary hover:underline"
                    >
                      View
                    </Link>
                    {inUse ? (
                      <span className="text-muted-foreground" title="In use by a sequence">Delete</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleInlineDelete(asset)}
                        disabled={pending}
                        className="text-red-600 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
