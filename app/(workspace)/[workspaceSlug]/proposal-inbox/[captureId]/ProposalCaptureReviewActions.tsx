'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { reviewProposalCaptureAction } from '@/modules/proposals/actions/proposal-capture-review.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Lead {
  id: string
  name: string
}

interface ProposalCaptureReviewActionsProps {
  captureId: string
  backHref:  string
  leads:     Lead[]
}

type Phase = 'idle' | 'dismiss_confirm' | 'match_form'

export function ProposalCaptureReviewActions({
  captureId,
  backHref,
  leads,
}: ProposalCaptureReviewActionsProps) {
  const router = useRouter()
  const [phase,       setPhase]       = useState<Phase>('idle')
  const [leadId,      setLeadId]      = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  function reset() {
    setPhase('idle')
    setLeadId('')
    setReviewNotes('')
    setError(null)
  }

  async function handleDismiss() {
    setLoading(true)
    setError(null)
    try {
      const result = await reviewProposalCaptureAction({
        captureId,
        action:      'dismiss',
        reviewNotes: reviewNotes.trim() || null,
      })
      if (!result.success) {
        setError(String(result.error))
        return
      }
      router.push(backHref)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dismiss failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleMatch() {
    if (!leadId) {
      setError('Please select a lead to match.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await reviewProposalCaptureAction({
        captureId,
        action:      'match',
        leadId,
        reviewNotes: reviewNotes.trim() || null,
      })
      if (!result.success) {
        setError(String(result.error))
        return
      }
      router.push(backHref)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Match failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {phase === 'idle' && (
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setPhase('dismiss_confirm'); setError(null) }}>
              Dismiss
            </Button>
            <Button onClick={() => { setPhase('match_form'); setError(null) }}>
              Match to Lead
            </Button>
          </div>
        )}

        {phase === 'dismiss_confirm' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Dismiss this capture without linking it to a lead. It will be marked as dismissed.
            </p>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Review notes (optional)</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Why is this capture being dismissed?"
                disabled={loading}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={reset} disabled={loading}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDismiss} disabled={loading}>
                {loading ? 'Dismissing…' : 'Confirm Dismiss'}
              </Button>
            </div>
          </div>
        )}

        {phase === 'match_form' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Select lead *</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={leadId}
                onChange={e => setLeadId(e.target.value)}
                disabled={loading}
              >
                <option value="">— Select a lead —</option>
                {leads.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Review notes (optional)</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Add context about this match…"
                disabled={loading}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={reset} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleMatch} disabled={loading || !leadId}>
                {loading ? 'Matching…' : 'Confirm Match'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
