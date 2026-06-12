'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteManualSequenceAction,
  archiveSequenceAction,
} from '@/modules/campaign-sequence/actions/sequence-authoring.actions'
import { SequenceBuilder } from './SequenceBuilder'
import type { SequenceEditState } from './SequenceBuilder'
import type { CampaignSequenceRow, CampaignTypeRow } from '@/modules/campaign-sequence/types'
import type { Database } from '@/types/database'

type SenderIdentityRow  = Database['public']['Tables']['sender_identities']['Row']
type CampaignEmailAsset = Database['public']['Tables']['campaign_email_assets']['Row']

// V1 usage-aware row data (computed server-side on the page)
export interface SequenceListRow {
  sequence:    CampaignSequenceRow
  usage:       'active' | 'historical' | 'unused'
  activeCount: number
  totalCount:  number
  steps:       { id: string; step_number: number; day_offset: number; campaignEmailAssetId: string }[]
}

interface Props {
  rows:             SequenceListRow[]
  types:            CampaignTypeRow[]
  senderIdentities: SenderIdentityRow[]
  assets:           CampaignEmailAsset[]
  workspaceSlug:    string
}

function usageHint(row: SequenceListRow): string {
  if (row.usage === 'active')     return 'In active campaign'
  if (row.usage === 'historical') return `Used by ${row.totalCount} past campaign${row.totalCount === 1 ? '' : 's'}`
  return 'Unused'
}

export function SequenceList({ rows, types, senderIdentities, assets, workspaceSlug }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [showArchived, setShowArchived] = useState(false)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [error,        setError]        = useState<string | null>(null)

  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]))

  const visible = rows.filter(r => showArchived || r.sequence.status !== 'retired')
  const archivedCount = rows.filter(r => r.sequence.status === 'retired').length
  const editingRow = editingId ? rows.find(r => r.sequence.id === editingId) : null

  function handleDelete(row: SequenceListRow) {
    if (!window.confirm(`Delete sequence "${row.sequence.name}"? It has never been used — this removes it permanently.`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await deleteManualSequenceAction(row.sequence.id)
      if (!result.ok) {
        setError(result.error ?? 'Delete failed.')
        return
      }
      router.refresh()
    })
  }

  function handleArchive(row: SequenceListRow) {
    if (!window.confirm(`Archive sequence "${row.sequence.name}"? It will disappear from assignment pickers; past campaign history is kept.`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await archiveSequenceAction(row.sequence.id)
      if (!result.ok) {
        setError(result.error ?? 'Archive failed.')
        return
      }
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No campaign sequences yet. Create your first sequence below.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {archivedCount > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
          />
          Show archived ({archivedCount})
        </label>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left pb-2 pr-4">Name</th>
              <th className="text-left pb-2 pr-4">Campaign Type</th>
              <th className="text-left pb-2 pr-4">Status</th>
              <th className="text-left pb-2 pr-4">Usage</th>
              <th className="text-left pb-2 pr-4">Created</th>
              <th className="text-left pb-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map(row => {
              const seq      = row.sequence
              const archived = seq.status === 'retired'
              const locked   = row.usage === 'active'
              return (
                <tr key={seq.id} className="hover:bg-muted/30">
                  <td className="py-2 pr-4 font-medium">{seq.name}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {typeMap[seq.campaign_type_id] ?? seq.campaign_type_id}
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {archived ? 'archived' : seq.status}
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{usageHint(row)}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {new Date(seq.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-4 space-x-2 whitespace-nowrap">
                    {locked ? (
                      <span className="text-xs text-muted-foreground">
                        Locked — stop the campaign first
                      </span>
                    ) : archived ? (
                      <span className="text-xs text-muted-foreground">Archived</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => { setEditingId(editingId === seq.id ? null : seq.id); setError(null) }}
                          disabled={pending}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {editingId === seq.id ? 'Close' : 'Edit'}
                        </button>
                        {row.usage === 'unused' ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            disabled={pending}
                            className="text-xs text-red-600 hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleArchive(row)}
                            disabled={pending}
                            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                          >
                            Archive
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editingRow && (
        <SequenceBuilder
          workspaceSlug={workspaceSlug}
          campaignTypes={types}
          senderIdentities={senderIdentities}
          assets={assets}
          edit={{
            sequenceId:       editingRow.sequence.id,
            name:             editingRow.sequence.name,
            senderIdentityId: ((editingRow.sequence as unknown as Record<string, unknown>).sender_identity_id as string | null) ?? null,
            steps:            editingRow.steps,
            // Historical schedule items FK to step rows — removal only when never used
            allowStepRemoval: editingRow.usage === 'unused',
            // V5 delivery schedule (columns from migration 20240051, not in generated types)
            sendTime:     ((editingRow.sequence as unknown as Record<string, unknown>).send_time as string | null) ?? null,
            timeZone:     ((editingRow.sequence as unknown as Record<string, unknown>).timezone as string | null) ?? null,
            skipWeekends: Boolean((editingRow.sequence as unknown as Record<string, unknown>).skip_weekends),
          } satisfies SequenceEditState}
          onDone={() => { setEditingId(null); router.refresh() }}
        />
      )}
    </div>
  )
}
