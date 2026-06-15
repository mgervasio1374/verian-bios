'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createExemplarAction } from '@/modules/messaging/actions/copy-exemplar.actions'

// Keep in sync with EXEMPLAR_SKILL_SLUGS in copy-exemplar.service.ts.
const SKILLS: { slug: string; label: string }[] = [
  { slug: 'cold_outreach',              label: 'Cold outreach' },
  { slug: 'new_inquiry_response',       label: 'New inquiry response' },
  { slug: 'statement_review_follow_up', label: 'Statement review follow-up' },
  { slug: 're_engagement',              label: 'Re-engagement' },
]

export function NewExemplarForm() {
  const [pending, startTransition] = useTransition()

  const [skillSlug, setSkillSlug] = useState(SKILLS[0].slug)
  const [subject,   setSubject]   = useState('')
  const [body,      setBody]      = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)

  function handleCreate() {
    setError(null)
    setSuccess(false)
    if (!subject.trim()) { setError('Subject is required.'); return }
    if (!body.trim())    { setError('Body is required.'); return }

    startTransition(async () => {
      const result = await createExemplarAction({ skillSlug, subject, body })
      if (!result.success) { setError(result.error); return }
      setSuccess(true)
      setSubject('')
      setBody('')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">New Exemplar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
            Exemplar saved.
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Context</span>
          <select
            value={skillSlug}
            onChange={e => setSkillSlug(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            {SKILLS.map(s => <option key={s.slug} value={s.slug}>{s.label}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            placeholder="e.g. Reviewing your processing setup"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Body</span>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={8}
            className="rounded border px-2 py-1.5 text-sm font-sans"
            placeholder="Write the canonical email exactly as it should sound."
          />
        </label>

        <button
          type="button"
          onClick={handleCreate}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save Exemplar'}
        </button>
      </CardContent>
    </Card>
  )
}
