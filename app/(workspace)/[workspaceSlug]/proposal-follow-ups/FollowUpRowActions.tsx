'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CompleteFollowUpButton } from './CompleteFollowUpButton'
import { SkipFollowUpButton } from './SkipFollowUpButton'
import { RescheduleFollowUpButton } from './RescheduleFollowUpButton'
import { GenerateFollowUpDraftButton } from './GenerateFollowUpDraftButton'
import { SendFollowUpDraftButton } from './SendFollowUpDraftButton'

interface Props {
  commitmentId:        string
  draftId:             string | null
  draftStatus:         string | null
  currentDueAt:        string
  emailSendingEnabled: boolean
  proposalEventId:     string
  workspaceSlug:       string
  canMutate:           boolean
  canSendEmail:        boolean
}

// Collapses the per-row action cluster behind a disclosure. Default state shows
// only "View →" + a compact "Manage" toggle; expanding reveals the action
// buttons inline. The toggle ONLY hides controls behind a click — it never
// grants them: Send still renders solely for canSendEmail, mutations solely for
// canMutate. The server component computes those permissions and passes them in.
export function FollowUpRowActions({
  commitmentId,
  draftId,
  draftStatus,
  currentDueAt,
  emailSendingEnabled,
  proposalEventId,
  workspaceSlug,
  canMutate,
  canSendEmail,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasActions = canMutate || canSendEmail

  return (
    <div className="flex flex-col gap-1.5 items-end">
      <Link
        href={`/${workspaceSlug}/proposal-events/${proposalEventId}`}
        className="text-xs text-primary hover:underline whitespace-nowrap"
      >
        View →
      </Link>

      {hasActions && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
        >
          Manage
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}

      {expanded && (
        <div className="flex flex-col gap-1.5 items-end">
          {canMutate && (
            <>
              <CompleteFollowUpButton commitmentId={commitmentId} />
              <SkipFollowUpButton commitmentId={commitmentId} />
              <RescheduleFollowUpButton commitmentId={commitmentId} currentDueAt={currentDueAt} />
              <GenerateFollowUpDraftButton commitmentId={commitmentId} existingDraftId={draftId} />
            </>
          )}
          {canSendEmail && (
            <SendFollowUpDraftButton
              commitmentId={commitmentId}
              draftStatus={draftStatus}
              emailSendingEnabled={emailSendingEnabled}
            />
          )}
        </div>
      )}
    </div>
  )
}
