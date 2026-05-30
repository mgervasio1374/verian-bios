'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createDraftFromAssignmentAction } from '@/modules/messaging/actions/campaign-assignment-draft.actions'
import type { CampaignAssignment } from '@/modules/messaging/types/campaign-assignment.types'

interface Props {
  assignment:     CampaignAssignment
  workspaceSlug:  string
  hasActiveDraft: boolean
  hasActiveAsset: boolean
  assetName:      string | null
}

export function CreateDraftFromAssignmentCard({
  assignment,
  workspaceSlug,
  hasActiveDraft,
  hasActiveAsset,
  assetName,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [succeeded, setSucceeded] = useState(false)

  if (hasActiveDraft) return null

  if (!hasActiveAsset) {
    return (
      <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium">
          {assignment.campaign_type.replace(/_/g, ' ')} assignment
        </span>{' '}
        — No active asset available for this campaign type. Activate an asset in Campaign Assets settings first.
      </div>
    )
  }

  function handleCreate() {
    setError(null)
    setMissingFields([])
    setSucceeded(false)
    startTransition(async () => {
      const result = await createDraftFromAssignmentAction(assignment.id, workspaceSlug)
      if (result.ok) {
        setSucceeded(true)
        if (result.missingFields.length > 0) setMissingFields(result.missingFields)
        router.refresh()
      } else {
        setError(result.reason)
      }
    })
  }

  return (
    <div className="rounded-md border bg-card px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-medium">
            {assignment.campaign_type.replace(/_/g, ' ')} campaign
          </span>
          {assetName && (
            <span className="text-muted-foreground"> — {assetName}</span>
          )}
        </div>
        <button
          className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50 shrink-0"
          onClick={handleCreate}
          disabled={isPending}
        >
          {isPending ? 'Creating…' : 'Create Draft'}
        </button>
      </div>

      {succeeded && missingFields.length > 0 && (
        <p className="text-xs text-yellow-700">
          Draft created with {missingFields.length} unresolved personalization field(s):{' '}
          {missingFields.join(', ')}. Review before approving.
        </p>
      )}

      {succeeded && missingFields.length === 0 && (
        <p className="text-xs text-green-700">Draft created and ready for review.</p>
      )}

      {error === 'pending_draft_exists' && (
        <p className="text-xs text-red-600">
          This lead already has a pending draft. Resolve it before creating another.
        </p>
      )}

      {error && error !== 'pending_draft_exists' && (
        <p className="text-xs text-red-600">Error: {error}</p>
      )}
    </div>
  )
}
