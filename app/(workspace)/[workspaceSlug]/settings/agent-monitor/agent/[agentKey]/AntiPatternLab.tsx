'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FlaskConical } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  runAntiPatternExtractionAction,
  applyAntiPatternsAction,
} from '@/modules/messaging/learning/anti-pattern-lab.actions'

interface Pattern {
  flaggedSnippet:  string
  patternName:     string
  antiPatternRule: string
  rationale:       string
  confidence:      'low' | 'medium' | 'high'
}

interface Props {
  // Canonical copywriting slugs the rewrite loop resolves; first is the default target.
  targetSlugs: string[]
}

export function AntiPatternLab({ targetSlugs }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [targetSlug, setTargetSlug] = useState(targetSlugs[0] ?? 'cold_outreach')
  const [raw, setRaw] = useState('')
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [approved, setApproved] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)

  function toggleApprove(i: number) {
    setApproved(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  function handleExtract() {
    setError(null)
    setSummary(null)
    setPatterns([])
    setApproved(new Set())
    // Split pasted text into samples on blank-line delimiters.
    const samples = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    if (samples.length === 0) { setError('Paste at least one sample email.'); return }
    startTransition(async () => {
      const res = await runAntiPatternExtractionAction(targetSlug, samples)
      if (!res.success) { setError(res.error); return }
      setPatterns(res.data.patterns)
      if (res.data.patterns.length === 0) setSummary('No transferable patterns were found in those samples.')
    })
  }

  function handleApply() {
    setError(null)
    setSummary(null)
    const rules = patterns.filter((_, i) => approved.has(i)).map(p => p.antiPatternRule)
    if (rules.length === 0) { setError('Approve at least one pattern to apply.'); return }
    startTransition(async () => {
      const res = await applyAntiPatternsAction(targetSlug, rules)
      if (!res.success) { setError(res.error); return }
      setSummary(`Applied ${res.data.appliedCount} new anti-pattern${res.data.appliedCount === 1 ? '' : 's'} (${res.data.totalAntiPatterns} total on "${targetSlug}").`)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Anti-Pattern Lab</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Paste known-bad emails (separate multiple with a blank line). The model extracts transferable
          failure patterns — review the reasoning, approve the good ones, and apply them as anti-patterns
          to the selected copywriting skill the rewrite loop uses.
        </p>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Target copywriting skill</span>
          <select
            value={targetSlug}
            onChange={e => setTargetSlug(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm bg-background w-full max-w-xs"
          >
            {targetSlugs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Sample bad emails</span>
          <textarea
            value={raw}
            onChange={e => setRaw(e.target.value)}
            rows={6}
            className="rounded border px-2 py-1.5 text-xs font-mono"
            placeholder={'Paste a junk/spam email here.\n\nBlank line separates a second sample.'}
          />
        </label>

        <button
          type="button"
          onClick={handleExtract}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Extract patterns
        </button>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">{error}</div>
        )}
        {summary && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">{summary}</div>
        )}

        {patterns.length > 0 && (
          <div className="space-y-2">
            {patterns.map((p, i) => (
              <div key={i} className="rounded-md border p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs font-medium">
                    <input type="checkbox" checked={approved.has(i)} onChange={() => toggleApprove(i)} />
                    Approve
                  </label>
                  <span className="text-sm font-medium">{p.patternName || 'Pattern'}</span>
                  <Badge variant="outline" className="text-xs">{p.confidence}</Badge>
                </div>
                {p.flaggedSnippet && (
                  <p className="text-xs italic text-muted-foreground">“{p.flaggedSnippet}”</p>
                )}
                <p className="text-sm">{p.antiPatternRule}</p>
                {/* Glass box: the model's visible reasoning for this pattern. */}
                <div className="rounded bg-muted/50 px-2 py-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reasoning</p>
                  <p className="text-xs text-foreground mt-0.5">{p.rationale || '—'}</p>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={handleApply}
              disabled={pending || approved.size === 0}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Apply approved ({approved.size})
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
