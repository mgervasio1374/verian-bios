'use client'

import { useState, useTransition } from 'react'
import { Lightbulb, Loader2, AlertTriangle, Info } from 'lucide-react'
import { triggerCompanyRecommendationAction } from '@/modules/intelligence/actions/company-recommendation.actions'
import type { CompanyRecommendationResult } from '@/modules/intelligence/services/recommendation-generation.service'

const PRIORITY_CLASSES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high:     'bg-orange-100 text-orange-800',
  medium:   'bg-blue-100 text-blue-800',
  low:      'bg-gray-100 text-gray-700',
}

const TYPE_LABELS: Record<string, string> = {
  prioritize_outreach:        'Prioritize Outreach',
  enrich_contact_data:        'Enrich Contact Data',
  request_statement_review:   'Request Statement Review',
  human_review_required:      'Human Review Required',
  monitor_only:               'Monitor Only',
  archive_due_to_poor_fit:    'Archive / Deprioritize',
}

interface GenerateRecommendationButtonProps {
  companyId:           string
  currentTitle:        string | null
  currentType:         string | null
  currentPriority:     string | null
  currentConfidence:   number | null
}

type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success';   result:  CompanyRecommendationResult }
  | { type: 'duplicate'; message: string }
  | { type: 'error';     message: string }

export function GenerateRecommendationButton({
  companyId,
  currentTitle,
  currentType,
  currentPriority,
  currentConfidence,
}: GenerateRecommendationButtonProps) {
  const [state, setState] = useState<State>({ type: 'idle' })
  const [, startTransition] = useTransition()

  const displayTitle      = state.type === 'success' ? state.result.title      : currentTitle
  const displayType       = state.type === 'success' ? state.result.recommendationType : currentType
  const displayPriority   = state.type === 'success' ? state.result.priority   : currentPriority
  const displayConfidence = state.type === 'success' ? state.result.confidence  : currentConfidence

  function handleGenerate() {
    setState({ type: 'loading' })
    startTransition(async () => {
      const actionResult = await triggerCompanyRecommendationAction(companyId)
      if (!actionResult.success) {
        setState({ type: 'error', message: actionResult.error })
        return
      }
      const result = actionResult.data
      if (!result.success && result.duplicate) {
        setState({ type: 'duplicate', message: result.error })
        return
      }
      if (!result.success) {
        setState({ type: 'error', message: result.error })
        return
      }
      setState({ type: 'success', result })
    })
  }

  return (
    <div className="space-y-3">
      {/* Current / new recommendation display */}
      {displayTitle && displayType && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium leading-snug">{displayTitle}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {TYPE_LABELS[displayType] ?? displayType}
            </span>
            {displayPriority && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_CLASSES[displayPriority] ?? PRIORITY_CLASSES.low}`}>
                {displayPriority}
              </span>
            )}
            {displayConfidence !== null && displayConfidence !== undefined && (
              <span className="text-xs text-muted-foreground">
                {(displayConfidence * 100).toFixed(0)}% confidence
              </span>
            )}
          </div>
        </div>
      )}

      {!displayTitle && state.type === 'idle' && (
        <p className="text-sm text-muted-foreground">No recommendation yet.</p>
      )}

      {/* Duplicate notice */}
      {state.type === 'duplicate' && (
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>An active recommendation already exists. Resolve it before regenerating.</span>
        </div>
      )}

      {/* Error banner */}
      {state.type === 'error' && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="break-words">{state.message}</span>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={handleGenerate}
        disabled={state.type === 'loading'}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                   hover:text-foreground border rounded-md px-3 py-1.5 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state.type === 'loading'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Lightbulb className="h-3.5 w-3.5" />
        }
        {state.type === 'loading'
          ? 'Generating…'
          : displayTitle ? 'Regenerate' : 'Generate Recommendation'
        }
      </button>
    </div>
  )
}
