'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { generateSystemRecommendationsAction } from '@/modules/intelligence/system-recommendation/system-recommendation.actions'

interface Props {
  workspaceSlug: string
}

export function GenerateRecsButton({ workspaceSlug }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setResult(null)
    try {
      const res = await generateSystemRecommendationsAction(workspaceSlug)
      setResult(res.success ? 'Done.' : `Failed: ${res.error ?? 'Unknown error'}`)
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
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Analysing…</>
          : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Recommendations</>}
      </Button>
      {result && (
        <p className="text-xs text-muted-foreground">{result}</p>
      )}
    </div>
  )
}
