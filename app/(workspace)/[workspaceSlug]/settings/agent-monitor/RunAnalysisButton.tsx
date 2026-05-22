'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { runLearningAnalysisAction } from '@/modules/messaging/actions/learning-agent.actions'
import { Brain, Loader2 } from 'lucide-react'

interface Props {
  workspaceSlug: string
}

export function RunAnalysisButton({ workspaceSlug }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setResult(null)
    try {
      const res = await runLearningAnalysisAction(workspaceSlug)
      if (res.success) {
        setResult(`Analysis complete — ${res.snapshotCount ?? 0} signals computed from ${res.totalSends ?? 0} sends.`)
      } else {
        setResult(`Analysis failed: ${res.error ?? 'Unknown error'}`)
      }
    } catch {
      setResult('Unexpected error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleClick}
        disabled={loading}
        variant="outline"
        size="sm"
        className="w-fit"
      >
        {loading
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Running…</>
          : <><Brain className="h-3.5 w-3.5 mr-1.5" />Run Learning Analysis</>}
      </Button>
      {result && (
        <p className="text-xs text-muted-foreground">{result}</p>
      )}
    </div>
  )
}
