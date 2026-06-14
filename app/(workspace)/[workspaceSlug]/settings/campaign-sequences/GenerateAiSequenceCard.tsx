'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  generateAiSequenceAction,
  getAiSequenceJobStatusAction,
} from '@/modules/campaign-sequence/actions/sequence-authoring.actions'
import type { CampaignTypeRow } from '@/modules/campaign-sequence/types'
import type { Database } from '@/types/database'

type SenderIdentityRow = Database['public']['Tables']['sender_identities']['Row']

const TOUCH_OPTIONS = [2, 3, 4, 5]
const POLL_INTERVAL_MS = 3000

interface Props {
  campaignTypes:    CampaignTypeRow[]
  senderIdentities: SenderIdentityRow[]
}

export function GenerateAiSequenceCard({ campaignTypes, senderIdentities }: Props) {
  const router = useRouter()

  const [name,             setName]             = useState('')
  const [campaignTypeId,   setCampaignTypeId]   = useState('')
  const [touches,          setTouches]          = useState(3)
  const [brief,            setBrief]            = useState('')
  const [senderIdentityId, setSenderIdentityId] = useState('')
  const [error,            setError]            = useState<string | null>(null)
  const [summary,          setSummary]          = useState<string | null>(null)

  // Async job state: once enqueued we poll until succeeded/failed.
  const [jobId,        setJobId]        = useState<string | null>(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [touchesDone,  setTouchesDone]  = useState(0)
  const [touchesTotal, setTouchesTotal] = useState(0)
  const submittedName = useRef('')

  const generating = jobId !== null

  function mapFailure(reason: string): string {
    if (reason.startsWith('llm_not_configured')) {
      return "AI drafting isn't configured. Set LLM_API_BASE_URL / LLM_API_KEY / LLM_MODEL_NAME."
    }
    if (reason.startsWith('invalid_touch_count')) return 'Touch count must be between 2 and 5.'
    return `Generation stopped: ${reason}`
  }

  // Poll the job while one is in flight.
  useEffect(() => {
    if (!jobId) return
    let cancelled = false

    const tick = async () => {
      const res = await getAiSequenceJobStatusAction(jobId)
      if (cancelled) return
      if (!res.ok || !res.job) {
        setError(res.error ?? 'Lost track of the generation job.')
        setJobId(null)
        return
      }
      setTouchesDone(res.job.touchesDone)
      setTouchesTotal(res.job.touchesTotal)

      if (res.job.status === 'succeeded') {
        setJobId(null)
        setSummary(
          `Created '${submittedName.current}' with ${res.job.touchesTotal} draft assets ` +
          `(${submittedName.current}_1…_${res.job.touchesTotal}). ` +
          'Review and activate each asset before assigning.'
        )
        setName('')
        setBrief('')
        router.refresh() // the new sequence appears in the list above
      } else if (res.job.status === 'failed') {
        setJobId(null)
        setError(mapFailure(res.job.error ?? 'unknown error'))
      }
    }

    void tick()
    const handle = setInterval(tick, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(handle) }
  }, [jobId, router])

  async function handleGenerate() {
    setError(null)
    setSummary(null)

    if (!name.trim())     { setError('Enter a campaign name (e.g. Fall Expo 2026).'); return }
    if (!campaignTypeId)  { setError('Pick a campaign type.'); return }
    if (!brief.trim())    { setError('Describe the campaign in the brief.'); return }

    setSubmitting(true)
    const result = await generateAiSequenceAction({
      name,
      campaignTypeId,
      touches,
      brief,
      senderIdentityId: senderIdentityId || null,
    })
    setSubmitting(false)

    if (!result.ok || !result.jobId) {
      setError(result.error ?? 'Could not start generation.')
      return
    }

    // Returned instantly — switch to the polling/generating state.
    submittedName.current = name.trim()
    setTouchesDone(0)
    setTouchesTotal(touches)
    setJobId(result.jobId)
  }

  const pending = submitting || generating

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Generate sequence with AI</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
            {summary}
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Campaign name</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            placeholder="e.g. Fall Expo 2026"
          />
          <span className="text-muted-foreground">
            Assets are named {'{name}'}_1 … {'{name}'}_N — next year&apos;s campaign gets a fresh name and fresh assets.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Campaign Type</span>
            <select
              value={campaignTypeId}
              onChange={e => setCampaignTypeId(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm"
            >
              <option value="">Select campaign type…</option>
              {campaignTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Touches</span>
            <select
              value={touches}
              onChange={e => setTouches(Number(e.target.value))}
              className="rounded border px-2 py-1.5 text-sm"
            >
              {TOUCH_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Sender Identity</span>
          <select
            value={senderIdentityId}
            onChange={e => setSenderIdentityId(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Workspace default</option>
            {senderIdentities.map(s => (
              <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Brief</span>
          <textarea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            rows={3}
            className="rounded border px-2 py-1.5 text-xs"
            placeholder="What is this campaign about? Who is it for?"
          />
          <span className="text-muted-foreground">
            Describe the email: audience, offer, tone, call to action.
          </span>
        </label>

        {generating && (
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
            Generating your sequence… (~1–2 min). Touch {Math.min(touchesDone + 1, touchesTotal)} of {touchesTotal}
            {touchesDone > 0 ? ` (${touchesDone} done)` : ''}. You can leave this open; it runs in the background.
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? `Generating ${touches} emails…` : 'Generate sequence with AI'}
        </button>

        <p className="text-xs text-muted-foreground">
          Each touch is generated with the previous emails in context, so later touches build on
          earlier ones. Generation runs in the background. All assets start as <strong>Draft</strong>
          {' '}and require review before activation.
        </p>
      </CardContent>
    </Card>
  )
}
