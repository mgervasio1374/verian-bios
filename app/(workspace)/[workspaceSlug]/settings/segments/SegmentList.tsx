'use client'

import { Fragment, useState, useTransition } from 'react'
import { updateSegmentAction, deleteSegmentAction } from '@/modules/crm/actions/segment.actions'
import type { SegmentWithCount } from '@/modules/crm/repositories/segment.repo'
import { SegmentManager } from './SegmentManager'

interface Props {
  segments: SegmentWithCount[]
}

export function SegmentList({ segments }: Props) {
  const [pending, startTransition] = useTransition()

  const [expandedId,      setExpandedId]      = useState<string | null>(null)
  const [editingId,       setEditingId]       = useState<string | null>(null)
  const [editName,        setEditName]        = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [error,           setError]           = useState<string | null>(null)

  function startEdit(segment: SegmentWithCount) {
    setEditingId(segment.id)
    setEditName(segment.name)
    setEditDescription(segment.description ?? '')
    setError(null)
  }

  function handleSaveEdit(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateSegmentAction(id, {
        name:        editName,
        description: editDescription,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setEditingId(null)
    })
  }

  function handleDelete(segment: SegmentWithCount) {
    if (!window.confirm(`Delete segment "${segment.name}"? Companies are not deleted — only the grouping.`)) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await deleteSegmentAction(segment.id)
      if (!result.success) setError(result.error)
      if (expandedId === segment.id) setExpandedId(null)
    })
  }

  if (segments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No segments yet. Create your first segment below.
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
              <th className="text-left pb-2 pr-4">Description</th>
              <th className="text-left pb-2 pr-4">Companies</th>
              <th className="text-left pb-2 pr-4">Created</th>
              <th className="text-left pb-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {segments.map(segment => (
              <Fragment key={segment.id}>
                <tr className="hover:bg-muted/30">
                  {editingId === segment.id ? (
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
                        <input
                          type="text"
                          value={editDescription}
                          onChange={e => setEditDescription(e.target.value)}
                          className="rounded border px-2 py-1 text-sm w-full"
                          placeholder="Description"
                        />
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{segment.member_count}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {new Date(segment.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(segment.id)}
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
                      <td className="py-2 pr-4 font-medium">{segment.name}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {segment.description ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{segment.member_count}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {new Date(segment.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === segment.id ? null : segment.id)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {expandedId === segment.id ? 'Close' : 'Manage'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(segment)}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(segment)}
                          disabled={pending}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
                {expandedId === segment.id && (
                  <tr>
                    <td colSpan={5} className="py-3 pr-4">
                      <SegmentManager segmentId={segment.id} segmentName={segment.name} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
