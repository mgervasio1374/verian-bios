'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { deactivateExemplarAction } from '@/modules/messaging/actions/copy-exemplar.actions'
import type { CopyExemplarRow } from '@/modules/messaging/repositories/copy-exemplar.repo'

const SKILL_LABELS: Record<string, string> = {
  cold_outreach:              'Cold outreach',
  new_inquiry_response:       'New inquiry response',
  statement_review_follow_up: 'Statement review follow-up',
  re_engagement:              'Re-engagement',
  proposal_send:              'Proposal send email',
}

export function ExemplarList({ exemplars }: { exemplars: CopyExemplarRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDeactivate(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deactivateExemplarAction(id)
      if (!result.success) { setError(result.error); return }
      router.refresh()
    })
  }

  if (exemplars.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            No exemplars yet. Author one below, or save a rewrite variant from a lead&apos;s draft.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Group by skill so the page reads as a per-context voice library.
  const bySkill = new Map<string, CopyExemplarRow[]>()
  for (const ex of exemplars) {
    const arr = bySkill.get(ex.skill_slug) ?? []
    arr.push(ex)
    bySkill.set(ex.skill_slug, arr)
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">{error}</div>
      )}
      {[...bySkill.entries()].map(([skill, rows]) => (
        <Card key={skill}>
          <CardHeader>
            <CardTitle className="text-sm">{SKILL_LABELS[skill] ?? skill}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map(ex => (
              <div key={ex.id} className={`rounded-md border p-3 ${ex.is_active ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{ex.subject}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {ex.source === 'promoted' ? 'Promoted from a rewrite' : 'Authored'}
                      {!ex.is_active && ' · inactive'}
                    </p>
                  </div>
                  {ex.is_active && (
                    <button
                      type="button"
                      onClick={() => handleDeactivate(ex.id)}
                      disabled={pending}
                      className="shrink-0 text-xs text-muted-foreground hover:text-red-700 border rounded-md px-2 py-1 disabled:opacity-50"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
                <pre className="mt-2 text-[11px] whitespace-pre-wrap font-sans text-muted-foreground leading-relaxed">
                  {ex.body_text}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
