'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, AlertTriangle, Mail } from 'lucide-react'
import { generateManualCampaignDraftAction } from '@/modules/messaging/actions/manual-campaign-draft.actions'

const CAMPAIGN_OPTIONS = [
  { value: 'new_lead_outreach',         label: 'New Lead Outreach' },
  { value: 'statement_review_followup', label: 'Statement Review Follow-Up' },
  { value: 'processing_cost_review',    label: 'Processing Cost Review' },
  { value: 'home_services_outreach',    label: 'Home Services Outreach' },
  { value: 'reengagement',              label: 'Re-Engagement' },
]

type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success' }
  | { type: 'error'; message: string }

export function ManualCampaignDraftButton({
  leadId,
  hasExistingDraft,
}: {
  leadId:           string
  hasExistingDraft: boolean
}) {
  const router = useRouter()
  const [campaignType, setCampaignType] = useState('new_lead_outreach')
  const [state, setState]               = useState<State>({ type: 'idle' })
  const [, startTransition]             = useTransition()

  function handleGenerate() {
    setState({ type: 'loading' })
    startTransition(async () => {
      const result = await generateManualCampaignDraftAction(leadId, campaignType)
      if (result.success) {
        setState({ type: 'success' })
        router.refresh()
      } else {
        setState({ type: 'error', message: result.error })
      }
    })
  }

  if (hasExistingDraft) {
    return (
      <p className="text-xs text-amber-700">
        This lead already has a pending draft. Review or resolve it before generating another.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Select an outreach type and generate the first draft for review.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={campaignType}
          onChange={e => { setCampaignType(e.target.value); setState({ type: 'idle' }) }}
          disabled={state.type === 'loading'}
          className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-sm
                     focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                     disabled:opacity-50"
        >
          {CAMPAIGN_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          onClick={handleGenerate}
          disabled={state.type === 'loading'}
          className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium
                     border rounded-md px-3 py-1.5 transition-colors
                     text-muted-foreground hover:text-foreground
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.type === 'loading'
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Mail className="h-3.5 w-3.5" />
          }
          {state.type === 'loading' ? 'Generating…' : 'Generate Draft'}
        </button>
      </div>

      {state.type === 'error' && (
        <div className="flex items-start gap-1.5 rounded-md bg-red-50 border border-red-200 px-2.5 py-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
      )}

      {state.type === 'success' && (
        <div className="flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Draft created — review it in the Email Draft Suggestion section above.</span>
        </div>
      )}
    </div>
  )
}
