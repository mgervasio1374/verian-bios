'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { convertCaptureToProposalEventAction } from '@/modules/proposals/actions/capture-to-event-conversion.actions'
import { SCHEDULE_RULES } from '@/modules/proposals/lib/schedule-rules'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ProposalCaptureConvertActionProps {
  captureId: string
  rawReceivedAt: string | null
}

type Phase = 'form' | 'success'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// datetime-local has no timezone; format defaults in local time intentionally
// so the displayed value matches the operator's clock, not UTC.
function formatLocalDateTimeInputValue(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return [
    d.getFullYear(),
    pad2(d.getMonth() + 1),
    pad2(d.getDate()),
  ].join('-') + 'T' + [
    pad2(d.getHours()),
    pad2(d.getMinutes()),
  ].join(':')
}

export function ProposalCaptureConvertAction({
  captureId,
  rawReceivedAt,
}: ProposalCaptureConvertActionProps) {
  const router = useRouter()

  const [phase,             setPhase]             = useState<Phase>('form')
  const [proposalSentAt,    setProposalSentAt]    = useState(formatLocalDateTimeInputValue(rawReceivedAt))
  const [proposalReference, setProposalReference] = useState('')
  const [proposalAmount,    setProposalAmount]    = useState('')
  const [proposalCurrency,  setProposalCurrency]  = useState('USD')
  const [estimatedSavings,  setEstimatedSavings]  = useState('')
  const [scheduleRuleKey,   setScheduleRuleKey]   = useState('standard_3_5_10')
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const [successData,       setSuccessData]       = useState<{
    proposalEventId: string
    commitmentCount: number
  } | null>(null)

  async function handleSubmit() {
    if (!proposalSentAt) {
      setError('Proposal sent date is required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await convertCaptureToProposalEventAction({
        captureId,
        proposalSentAt:    new Date(proposalSentAt).toISOString(),
        proposalReference: proposalReference.trim() || null,
        proposalAmount:    proposalAmount    ? Number(proposalAmount)    : null,
        proposalCurrency:  proposalCurrency || 'USD',
        estimatedSavings:  estimatedSavings ? Number(estimatedSavings) : null,
        scheduleRuleKey:   scheduleRuleKey  || undefined,
      })
      if (!result.success) {
        setError(String(result.error))
        return
      }
      setSuccessData({
        proposalEventId: result.data.proposalEventId,
        commitmentCount: result.data.commitmentCount,
      })
      setPhase('success')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed')
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'success' && successData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Proposal Event Created</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Proposal event created with {successData.commitmentCount} follow-up
            {successData.commitmentCount !== 1 ? 's' : ''} scheduled.
          </p>
          <p className="font-mono text-xs text-muted-foreground">{successData.proposalEventId}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Proposal Event</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Proposal sent date *</label>
          <input
            type="datetime-local"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={proposalSentAt}
            onChange={e => setProposalSentAt(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Proposal reference (optional)</label>
          <input
            type="text"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={proposalReference}
            onChange={e => setProposalReference(e.target.value)}
            placeholder="e.g. PROP-2024-001"
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Proposal amount (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={proposalAmount}
              onChange={e => setProposalAmount(e.target.value)}
              placeholder="0.00"
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Currency</label>
            <input
              type="text"
              maxLength={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={proposalCurrency}
              onChange={e => setProposalCurrency(e.target.value.toUpperCase())}
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Estimated savings (optional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={estimatedSavings}
            onChange={e => setEstimatedSavings(e.target.value)}
            placeholder="0.00"
            disabled={loading}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Follow-up schedule</label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={scheduleRuleKey}
            onChange={e => setScheduleRuleKey(e.target.value)}
            disabled={loading}
          >
            {SCHEDULE_RULES.map(r => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSubmit} disabled={loading || !proposalSentAt}>
          {loading ? 'Creating…' : 'Create Proposal Event'}
        </Button>
      </CardContent>
    </Card>
  )
}
