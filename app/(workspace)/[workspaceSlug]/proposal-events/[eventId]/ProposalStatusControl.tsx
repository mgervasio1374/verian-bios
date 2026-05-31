'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProposalStatusAction } from '@/modules/proposals/actions/proposal-status.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ProposalStatusControlProps {
  proposalEventId: string
  currentStatus: string
}

const TRANSITIONS: Record<string, { value: string; label: string }[]> = {
  sent: [
    { value: 'viewed',    label: 'Viewed' },
    { value: 'accepted',  label: 'Won / Accepted' },
    { value: 'rejected',  label: 'Lost / Rejected' },
    { value: 'expired',   label: 'Expired' },
    { value: 'withdrawn', label: 'Withdrawn' },
  ],
  viewed: [
    { value: 'accepted',  label: 'Won / Accepted' },
    { value: 'rejected',  label: 'Lost / Rejected' },
    { value: 'expired',   label: 'Expired' },
    { value: 'withdrawn', label: 'Withdrawn' },
  ],
}

type SuccessData = { newStatus: string; closedCommitmentIds: string[] }

export function ProposalStatusControl({ proposalEventId, currentStatus }: ProposalStatusControlProps) {
  const router = useRouter()
  const options = TRANSITIONS[currentStatus] ?? []

  const [selectedStatus, setSelectedStatus] = useState(options[0]?.value ?? '')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [successData,    setSuccessData]    = useState<SuccessData | null>(null)

  if (options.length === 0) return null

  if (successData) {
    return (
      <Card>
        <CardHeader><CardTitle>Status Updated</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>New status: <strong>{successData.newStatus}</strong></p>
          <p className="text-muted-foreground">
            {successData.closedCommitmentIds.length} open commitment
            {successData.closedCommitmentIds.length !== 1 ? 's' : ''} closed.
          </p>
        </CardContent>
      </Card>
    )
  }

  async function handleSubmit() {
    if (!selectedStatus) return
    setLoading(true)
    setError(null)
    try {
      const result = await updateProposalStatusAction({ proposalEventId, status: selectedStatus })
      if (!result.success) {
        setError(String(result.error))
        return
      }
      setSuccessData({
        newStatus:           result.data.status,
        closedCommitmentIds: result.data.closedCommitmentIds,
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Change Proposal Status</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Changing status does not send email or start automation.
        </p>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">New status</label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            disabled={loading}
          >
            {options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSubmit} disabled={loading || !selectedStatus}>
          {loading ? 'Updating…' : 'Confirm Status Change'}
        </Button>
      </CardContent>
    </Card>
  )
}
