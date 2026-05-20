'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Loader2, CheckCircle2 } from 'lucide-react'
import { runRecommendationReconciliationAction } from '@/modules/intelligence/actions/recommendation-reconciliation.actions'

export function ReconcileButton() {
  const [result, setResult] = useState<{ completed: number; scanned: number } | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)

  function handleRun() {
    setError(null)
    setResult(null)
    setLoading(true)

    startTransition(async () => {
      const res = await runRecommendationReconciliationAction()
      setLoading(false)
      if (res.success) {
        setResult({ completed: res.data.completed, scanned: res.data.scanned })
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleRun}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                   hover:text-foreground border rounded-md px-3 py-1.5 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <RefreshCw className="h-3.5 w-3.5" />
        }
        {loading ? 'Running…' : 'Reconcile Recommendations'}
      </button>
      {result && (
        <span className="flex items-center gap-1 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {result.completed} completed / {result.scanned} scanned
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
