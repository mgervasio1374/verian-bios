'use client'

import { useState, useTransition } from 'react'
import { BarChart2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { triggerCompanyScoringAction } from '@/modules/intelligence/actions/company-scoring.actions'
import type { CompanyScoringResult } from '@/modules/intelligence/services/company-scoring.service'

interface ScoreCompanyButtonProps {
  companyId:    string
  currentScore: number | null
}

type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; result: CompanyScoringResult }
  | { type: 'error';   message: string }

export function ScoreCompanyButton({ companyId, currentScore }: ScoreCompanyButtonProps) {
  const [state, setState] = useState<State>({ type: 'idle' })
  const [, startTransition] = useTransition()

  function handleScore() {
    setState({ type: 'loading' })
    startTransition(async () => {
      const result = await triggerCompanyScoringAction(companyId)
      if (result.success) {
        setState({ type: 'success', result: result.data })
      } else {
        setState({ type: 'error', message: result.error })
      }
    })
  }

  const score = state.type === 'success'
    ? state.result.overallScore
    : currentScore

  return (
    <div className="space-y-3">
      {/* Current score display */}
      {score !== null && (
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold tabular-nums">{score}</span>
          <span className="text-sm text-muted-foreground">/100</span>
          {state.type === 'success' && (
            <CheckCircle2 className="h-4 w-4 text-green-500 ml-1" />
          )}
        </div>
      )}

      {score === null && state.type === 'idle' && (
        <p className="text-sm text-muted-foreground">No score yet.</p>
      )}

      {/* Error banner */}
      {state.type === 'error' && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="break-words">{state.message}</span>
        </div>
      )}

      {/* Success dimension breakdown */}
      {state.type === 'success' && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {Object.entries(state.result.dimensions)
            .filter(([k]) => k !== 'overall')
            .map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-medium text-foreground">{val}</span>
              </div>
            ))}
        </div>
      )}

      {/* Trigger button */}
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
        {state.type === 'loading' ? 'Scoring…' : score !== null ? 'Re-score' : 'Score Company'}
      </button>
    </div>
  )
}
