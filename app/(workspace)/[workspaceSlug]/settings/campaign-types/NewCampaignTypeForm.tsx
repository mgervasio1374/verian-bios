'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createCampaignTypeAction } from '@/modules/campaign-sequence/actions/campaign-type.actions'

// Client-side mirror of slugifyCampaignTypeName for the live preview only. The
// server re-derives the slug authoritatively on create.
function previewSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function NewCampaignTypeForm() {
  const [pending, startTransition] = useTransition()
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState(false)

  const slug = previewSlug(name)

  function handleCreate() {
    setError(null)
    setSuccess(false)
    if (!name.trim()) { setError('Campaign type name is required.'); return }
    startTransition(async () => {
      const result = await createCampaignTypeAction(name, description)
      if (!result.success) { setError(result.error); return }
      setSuccess(true)
      setName('')
      setDescription('')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">New Campaign Type</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
            Campaign type created successfully.
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Name</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            placeholder="e.g. Renewal Outreach"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Slug (auto-derived, fixed at creation)</span>
          <input
            type="text"
            value={slug}
            readOnly
            disabled
            className="rounded border px-2 py-1.5 text-sm bg-muted text-muted-foreground font-mono"
            placeholder="renewal_outreach"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Description (optional)</span>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            placeholder="What this campaign type is for"
          />
        </label>

        <button
          type="button"
          onClick={handleCreate}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create Campaign Type'}
        </button>
      </CardContent>
    </Card>
  )
}
