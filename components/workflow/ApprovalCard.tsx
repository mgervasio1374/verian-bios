'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { approveRequestAction, rejectRequestAction } from '@/modules/workflow/actions/approval.actions'
import { CheckCheck, X, Clock } from 'lucide-react'
import type { Database } from '@/types/database'
import { format } from 'date-fns'

type ApprovalRow = Database['public']['Tables']['approval_requests']['Row']

export function ApprovalCard({ approval }: { approval: ApprovalRow }) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [resolved, setResolved] = useState(false)

  if (resolved) return null

  async function handleApprove() {
    setLoading('approve')
    const result = await approveRequestAction(approval.id)
    if (result.success) {
      toast.success('Request approved')
      setResolved(true)
    } else {
      toast.error(result.error)
    }
    setLoading(null)
  }

  async function handleReject() {
    setLoading('reject')
    const result = await rejectRequestAction(approval.id, 'Rejected via inbox')
    if (result.success) {
      toast.warning('Request rejected')
      setResolved(true)
    } else {
      toast.error(result.error)
    }
    setLoading(null)
  }

  const requestTypeLabel = approval.request_type.replace(/_/g, ' ')
  const payload = (approval.payload ?? {}) as Record<string, unknown>
  const isEmailDraft = approval.request_type === 'email_draft_review'

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm capitalize">{requestTypeLabel}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              <Clock className="inline h-3 w-3 mr-1" />
              {format(new Date(approval.created_at), 'MMM d, yyyy h:mm a')}
            </p>
          </div>
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Pending</span>
        </div>
      </CardHeader>
      <CardContent className="pb-3 space-y-2">
        {isEmailDraft && payload.subject ? (
          <>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                To: {typeof payload.to_name === 'string' && payload.to_name
                  ? `${payload.to_name} <${payload.to_email}>`
                  : String(payload.to_email ?? '')}
              </p>
              <p className="text-sm font-medium">{String(payload.subject)}</p>
            </div>
            {typeof payload.body_preview === 'string' && payload.body_preview && (
              <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-4 border-l-2 border-border pl-2">
                {payload.body_preview}
              </p>
            )}
          </>
        ) : (
          <>
            {approval.subject_type && (
              <p className="text-xs text-muted-foreground capitalize">
                Subject: {approval.subject_type}{approval.subject_id ? ` (${approval.subject_id.slice(0, 8)}…)` : ''}
              </p>
            )}
          </>
        )}
        {approval.expires_at && (
          <p className="text-xs text-orange-600">
            Expires: {format(new Date(approval.expires_at), 'MMM d, yyyy')}
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2 pt-0">
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={loading !== null}
          className="h-7 text-xs"
        >
          <CheckCheck className="h-3 w-3 mr-1" />
          {loading === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReject}
          disabled={loading !== null}
          className="h-7 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          {loading === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
      </CardFooter>
    </Card>
  )
}
