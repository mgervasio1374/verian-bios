'use client'

import { useState, useTransition } from 'react'
import {
  updateCampaignTypeAction,
  setCampaignTypeStatusAction,
} from '@/modules/campaign-sequence/actions/campaign-type.actions'

interface CampaignTypeRow {
  id:          string
  name:        string
  slug:        string
  description: string | null
  status:      string
}

interface Props {
  types: CampaignTypeRow[]
}

export function CampaignTypeList({ types }: Props) {
  const [pending, startTransition] = useTransition()
  const [editingId,       setEditingId]       = useState<string | null>(null)
  const [editName,        setEditName]        = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [error,           setError]           = useState<string | null>(null)

  function startEdit(t: CampaignTypeRow) {
    setEditingId(t.id)
    setEditName(t.name)
    setEditDescription(t.description ?? '')
    setError(null)
  }

  function handleSaveEdit(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateCampaignTypeAction(id, { name: editName, description: editDescription })
      if (!result.success) { setError(result.error); return }
      setEditingId(null)
    })
  }

  function handleToggleStatus(t: CampaignTypeRow) {
    const next = t.status === 'retired' ? 'active' : 'retired'
    if (next === 'retired' && !window.confirm(`Retire "${t.name}"? It will disappear from the campaign-type pickers.`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await setCampaignTypeStatusAction(t.id, next)
      if (!result.success) setError(result.error)
    })
  }

  if (types.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No campaign types yet. Create your first one below.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left pb-2 pr-4">Name</th>
              <th className="text-left pb-2 pr-4">Slug</th>
              <th className="text-left pb-2 pr-4">Description</th>
              <th className="text-left pb-2 pr-4">Status</th>
              <th className="text-left pb-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {types.map(t => (
              <tr key={t.id} className={`hover:bg-muted/30 ${t.status === 'retired' ? 'opacity-60' : ''}`}>
                {editingId === t.id ? (
                  <>
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="rounded border px-2 py-1 text-sm w-full"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      {/* Slug is immutable after creation — assets link to it. */}
                      <input
                        type="text"
                        value={t.slug}
                        readOnly
                        disabled
                        className="rounded border px-2 py-1 text-sm w-full bg-muted text-muted-foreground font-mono"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        className="rounded border px-2 py-1 text-sm w-full"
                        placeholder="Description"
                      />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{t.status}</td>
                    <td className="py-2 pr-4 space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(t.id)}
                        disabled={pending}
                        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2 pr-4 font-medium">{t.name}</td>
                    <td className="py-2 pr-4 text-xs font-mono text-muted-foreground">{t.slug}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{t.description ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        t.status === 'active'  ? 'bg-green-100 text-green-800' :
                        t.status === 'retired' ? 'bg-gray-100 text-gray-600'   :
                                                 'bg-yellow-100 text-yellow-800'
                      }`}>{t.status}</span>
                    </td>
                    <td className="py-2 pr-4 space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(t)}
                        disabled={pending}
                        className="text-xs text-primary hover:underline disabled:opacity-50"
                      >
                        {t.status === 'retired' ? 'Reactivate' : 'Retire'}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
