'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { triggerLeadScoringAction } from '@/modules/intelligence/actions/lead-scoring.actions'

interface ScoreLeadButtonProps {
  leadId:    string
  hasScores: boolean
}

type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; fitScore: number; urgencyScore: number; draftCreated: boolean }
  | { type: 'error';   message: string }

export function ScoreLeadButton({ leadId, hasScores }: ScoreLeadButtonProps) {
  const router = useRouter()
  const [state, setState]   = useState<State>({ type: 'idle' })
  const [, startTransition] = useTransition()

  function handleScore() {
    setState({ type: 'loading' })
    startTransition(async () => {
      const result = await triggerLeadScoringAction(leadId)
      if (result.success) {
        setState({
          type:         'success',
          fitScore:     result.data.fitScore,
          urgencyScore: result.data.urgencyScore,
          draftCreated: result.data.draftCreated,
        })
        // Refresh server component so scores/recommendation/draft render fresh
        router.refresh()
      } else {
        setState({ type: 'error', message: result.error })
      }
    })
  }

  return (
    <div className="space-y-2">
      {state.type === 'error' && (
        <div className="flex items-start gap-1.5 rounded-md bg-red-50 border border-red-200 px-2.5 py-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
      )}

      {state.type === 'success' && (
        <div className="flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>
            Scored — Fit {state.fitScore}/100 · Urgency {state.urgencyScore}/100
            {state.draftCreated ? ' · Email draft created' : ''}
          </span>
        </div>
      )}

      <button
        onClick={handleScore}
        disabled={state.type === 'loading'}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                   hover:text-foreground border rounded-md px-3 py-1.5 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state.type === 'loading'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <BarChart2 className="h-3.5 w-3.5" />
        }
        {state.type === 'loading'
          ? 'Scoring…'
          : hasScores ? 'Re-score Lead' : 'Score Lead'
        }
      </button>
    </div>
  )
}
