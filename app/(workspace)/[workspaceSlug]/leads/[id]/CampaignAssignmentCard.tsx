'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CAMPAIGN_TYPE } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import type { CampaignAssignment } from '@/modules/messaging/types/campaign-assignment.types'
import {
  createManualAssignmentAction,
  approveProposedAssignmentAction,
  rejectProposedAssignmentAction,
  retireCampaignAssignmentAction,
} from '@/modules/messaging/actions/campaign-assignment.actions'

interface ActiveAsset {
  id:            string
  name:          string
  campaign_type: string
}

interface LinkedDraft {
  id:     string
  status: string
}

interface CampaignAssignmentCardProps {
  leadId:                     string
  workspaceSlug:              string
  assignments:                CampaignAssignment[]
  activeAssets:               ActiveAsset[]
  linkedDraftsByAssignmentId?: Record<string, LinkedDraft[]>
}

const CAMPAIGN_OPTIONS = Object.values(CAMPAIGN_TYPE).map(value => ({
  value,
  label: value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
}))

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    proposed:  { label: 'Proposed',  className: 'bg-yellow-100 text-yellow-800' },
    assigned:  { label: 'Assigned',  className: 'bg-green-100 text-green-800' },
    paused:    { label: 'Paused',    className: 'bg-gray-100 text-gray-600' },
    completed: { label: 'Completed', className: 'bg-blue-100 text-blue-800' },
    retired:   { label: 'Retired',   className: 'bg-red-100 text-red-700' },
    rejected:  { label: 'Rejected',  className: 'bg-red-100 text-red-700' },
  }
  const { label, className } = config[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${className}`}>
      {label}
    </span>
  )
}

export function CampaignAssignmentCard({
  leadId,
  workspaceSlug,
  assignments,
  activeAssets,
  linkedDraftsByAssignmentId = {},
}: CampaignAssignmentCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [selectedType, setSelectedType] = useState<string>(CAMPAIGN_TYPE.INITIAL_CONTACT)
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const activeAssignments = assignments.filter(a =>
    a.assignment_status === 'proposed' || a.assignment_status === 'assigned'
  )
  const historicalAssignments = assignments.filter(a =>
    a.assignment_status === 'paused' ||
    a.assignment_status === 'completed' ||
    a.assignment_status === 'retired' ||
    a.assignment_status === 'rejected'
  )

  const assetsForSelectedType = activeAssets.filter(a => a.campaign_type === selectedType)

  // Check if a duplicate would result for the selected type
  const hasDuplicateForSelectedType = activeAssignments.some(
    a => a.campaign_type === selectedType
  )

  function handleApprove(assignmentId: string) {
    startTransition(async () => {
      await approveProposedAssignmentAction(assignmentId)
      router.refresh()
    })
  }

  function handleReject(assignmentId: string) {
    startTransition(async () => {
      await rejectProposedAssignmentAction(assignmentId)
      router.refresh()
    })
  }

  function handleRetire(assignmentId: string) {
    startTransition(async () => {
      await retireCampaignAssignmentAction(assignmentId, workspaceSlug)
      router.refresh()
    })
  }

  function handleSubmit() {
    setFormError(null)
    startTransition(async () => {
      const result = await createManualAssignmentAction(
        leadId,
        selectedType,
        selectedAssetId || undefined,
        reason || undefined
      )
      if (result.success) {
        setShowForm(false)
        setReason('')
        setSelectedAssetId('')
        router.refresh()
      } else {
        setFormError(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Campaign Assignment</CardTitle>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              disabled={isPending}
              className="text-xs text-primary hover:underline"
            >
              Assign Campaign
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Assignment form */}
        {showForm && (
          <div className="space-y-3 border rounded p-3 bg-muted/30">
            <div className="space-y-1">
              <label className="text-xs font-medium">Campaign Type</label>
              <select
                value={selectedType}
                onChange={e => {
                  setSelectedType(e.target.value)
                  setSelectedAssetId('')
                }}
                className="w-full text-sm border rounded px-2 py-1 bg-background"
              >
                {CAMPAIGN_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {assetsForSelectedType.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Campaign Asset (optional)</label>
                <select
                  value={selectedAssetId}
                  onChange={e => setSelectedAssetId(e.target.value)}
                  className="w-full text-sm border rounded px-2 py-1 bg-background"
                >
                  <option value="">Any active asset</option>
                  {assetsForSelectedType.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium">Reason (optional)</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                placeholder="Why is this lead being assigned to this campaign?"
                className="w-full text-sm border rounded px-2 py-1 bg-background resize-none"
              />
            </div>

            {hasDuplicateForSelectedType && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                This lead already has an active assignment for this campaign type.
              </p>
            )}

            {formError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                {formError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={isPending || hasDuplicateForSelectedType}
                className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded disabled:opacity-50"
              >
                {isPending ? 'Assigning…' : 'Assign'}
              </button>
              <button
                onClick={() => { setShowForm(false); setFormError(null) }}
                disabled={isPending}
                className="text-xs px-3 py-1 border rounded hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Active assignments */}
        {activeAssignments.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">No active campaign assignment.</p>
        )}

        {activeAssignments.map(a => {
          const linkedDrafts = linkedDraftsByAssignmentId[a.id] ?? []
          const latestLinkedDraft = linkedDrafts[0] ?? null
          return (
          <div key={a.id} className="border rounded p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium capitalize">
                {a.campaign_type.replace(/_/g, ' ')}
              </span>
              <StatusBadge status={a.assignment_status} />
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Source: {a.assignment_source.replace(/_/g, ' ')}</p>
              {a.assignment_reason && <p>Reason: {a.assignment_reason}</p>}
              <p>Assigned: {new Date(a.created_at).toLocaleDateString()}</p>
            </div>
            {latestLinkedDraft && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                Draft in progress —{' '}
                {latestLinkedDraft.status === 'pending_approval' ? 'Pending Approval' :
                 latestLinkedDraft.status === 'approved'         ? 'Approved'         :
                 latestLinkedDraft.status}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {a.assignment_status === 'proposed' && (
                <>
                  <button
                    onClick={() => handleApprove(a.id)}
                    disabled={isPending}
                    className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(a.id)}
                    disabled={isPending}
                    className="text-xs px-2 py-1 border rounded hover:bg-muted disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
              {(a.assignment_status === 'assigned' || a.assignment_status === 'paused') && (
                <button
                  onClick={() => handleRetire(a.id)}
                  disabled={isPending}
                  className="text-xs px-2 py-1 border rounded hover:bg-muted disabled:opacity-50"
                >
                  Retire
                </button>
              )}
            </div>
          </div>
        )})}

        {/* Historical accordion */}
        {historicalAssignments.length > 0 && (
          <div>
            <button
              onClick={() => setShowHistory(h => !h)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showHistory ? 'Hide' : 'Show'} history ({historicalAssignments.length})
            </button>
            {showHistory && (
              <div className="mt-2 space-y-2">
                {historicalAssignments.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge status={a.assignment_status} />
                    <span className="capitalize">{a.campaign_type.replace(/_/g, ' ')}</span>
                    <span className="ml-auto">{new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
