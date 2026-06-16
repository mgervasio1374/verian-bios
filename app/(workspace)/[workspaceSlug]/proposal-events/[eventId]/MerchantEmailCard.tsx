'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, RotateCcw, Sparkles, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  saveProposalEmailOverrideAction,
  clearProposalEmailOverrideAction,
} from '@/modules/proposals/actions/proposal-email-override.actions'
import { createExemplarAction } from '@/modules/messaging/actions/copy-exemplar.actions'

interface Props {
  eventId:       string
  toEmail:       string | null
  publicUrl:     string
  defaultSubject: string
  defaultBody:   string
  override:      { subject: string | null; bodyText: string | null } | null
  isDraft:       boolean
  canEdit:       boolean
  canManage:     boolean
}

export function MerchantEmailCard({
  eventId, toEmail, publicUrl, defaultSubject, defaultBody, override, isDraft, canEdit, canManage,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const hasOverride    = Boolean(override && (override.subject || override.bodyText))
  const currentSubject = override?.subject?.trim() || defaultSubject
  const currentBody    = override?.bodyText?.trim() || defaultBody

  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(currentSubject)
  const [body, setBody]       = useState(currentBody)
  const [error, setError]     = useState<string | null>(null)

  const [savedExemplar, setSavedExemplar] = useState(false)
  const [exemplarError, setExemplarError] = useState<string | null>(null)

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await saveProposalEmailOverrideAction(eventId, { subject, bodyText: body })
      if (res.success) { setEditing(false); router.refresh() } else { setError(res.error) }
    })
  }

  function handleReset() {
    setError(null)
    startTransition(async () => {
      const res = await clearProposalEmailOverrideAction(eventId)
      if (res.success) { setEditing(false); router.refresh() } else { setError(res.error) }
    })
  }

  function handleSaveExemplar() {
    setExemplarError(null)
    setSavedExemplar(false)
    startTransition(async () => {
      const res = await createExemplarAction({ skillSlug: 'proposal_send', subject: currentSubject, body: currentBody })
      if (res.success) setSavedExemplar(true)
      else setExemplarError(res.error)
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle>Merchant Email</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          This is what {toEmail ?? 'the merchant contact'} receives when you Approve &amp; Send.
          {hasOverride && <span className="ml-1 font-medium text-amber-700">Edited.</span>}
        </p>

        {!editing && (
          <>
            <div className="flex gap-3 py-2 border-b">
              <span className="text-xs text-muted-foreground w-40 shrink-0 pt-0.5">To</span>
              <span className="text-sm break-all">{toEmail ?? <span className="text-muted-foreground">No contact email</span>}</span>
            </div>
            <div className="flex gap-3 py-2 border-b">
              <span className="text-xs text-muted-foreground w-40 shrink-0 pt-0.5">Subject</span>
              <span className="text-sm break-all">{currentSubject}</span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Body</span>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm font-sans leading-relaxed">
                {currentBody}
              </pre>
            </div>
            <div className="flex gap-3 py-2 border-b">
              <span className="text-xs text-muted-foreground w-40 shrink-0 pt-0.5">Proposal link</span>
              <span className="font-mono text-xs break-all">{publicUrl}</span>
            </div>
          </>
        )}

        {editing && (
          <div className="space-y-2">
            <label className="block text-xs font-medium">
              Subject
              <input
                type="text" value={subject} onChange={e => setSubject(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs font-medium">
              Body
              <textarea
                value={body} onChange={e => setBody(e.target.value)} rows={12}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm font-sans leading-relaxed"
              />
            </label>
            <p className="text-[11px] text-muted-foreground">
              The proposal link is always included at send. If you remove it from the body, it is appended automatically.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-1.5 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          {isDraft && canEdit && !editing && (
            <button
              type="button" onClick={() => { setSubject(currentSubject); setBody(currentBody); setEditing(true) }}
              className="inline-flex items-center gap-1.5 text-xs font-medium border rounded-md px-3 py-1.5 hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit email
            </button>
          )}
          {isDraft && canEdit && editing && (
            <>
              <button
                type="button" onClick={handleSave} disabled={pending}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Save
              </button>
              <button
                type="button" onClick={() => { setEditing(false); setError(null) }} disabled={pending}
                className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1.5"
              >
                Cancel
              </button>
            </>
          )}
          {isDraft && canEdit && hasOverride && !editing && (
            <button
              type="button" onClick={handleReset} disabled={pending}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border rounded-md px-3 py-1.5 hover:bg-muted disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </button>
          )}
          {canManage && !editing && (
            savedExemplar ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved to Voice Exemplars
              </span>
            ) : (
              <button
                type="button" onClick={handleSaveExemplar} disabled={pending}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border rounded-md px-3 py-1.5 hover:bg-muted disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" /> Save to Voice Exemplars
              </button>
            )
          )}
        </div>
        {exemplarError && (
          <div className="flex items-start gap-1.5 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{exemplarError}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
