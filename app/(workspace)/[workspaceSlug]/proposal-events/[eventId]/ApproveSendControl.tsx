'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveAndSendProposalAction } from '@/modules/proposals/actions/proposal-approve-send.actions'
import { SCHEDULE_RULES, DEFAULT_SCHEDULE_RULE_KEY } from '@/modules/proposals/lib/schedule-rules'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ApproveSendControlProps {
  proposalEventId: string
}

type SuccessData = { commitmentsScheduled: number }

export function ApproveSendControl({ proposalEventId }: ApproveSendControlProps) {
  const router = useRouter()
  const [ruleKey, setRuleKey]   = useState(DEFAULT_SCHEDULE_RULE_KEY)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<SuccessData | null>(null)

  if (success) {
    return (
      <Card>
        <CardHeader><CardTitle>Proposal Sent</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>The proposal email was sent to the merchant.</p>
          <p className="text-muted-foreground">
            {success.commitmentsScheduled} follow-up
            {success.commitmentsScheduled !== 1 ? 's' : ''} scheduled.
          </p>
        </CardContent>
      </Card>
    )
  }

  async function handleSend() {
    setLoading(true)
    setError(null)
    try {
      const result = await approveAndSendProposalAction(proposalEventId, ruleKey)
      if (!result.success) {
        setError(String(result.error))
        return
      }
      setSuccess({ commitmentsScheduled: result.data.commitmentsScheduled })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Approve &amp; Send</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Sends the hosted proposal link to the merchant contact and starts the follow-up cadence.
          Requires email sending to be enabled.
        </p>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Follow-up cadence</label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={ruleKey}
            onChange={e => setRuleKey(e.target.value)}
            disabled={loading}
          >
            {SCHEDULE_RULES.map(r => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!confirming ? (
          <Button onClick={() => setConfirming(true)} disabled={loading}>
            Approve &amp; Send
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">Send the proposal email to the merchant now?</p>
            <div className="flex gap-2">
              <Button onClick={handleSend} disabled={loading}>
                {loading ? 'Sending…' : 'Confirm send'}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={loading}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
