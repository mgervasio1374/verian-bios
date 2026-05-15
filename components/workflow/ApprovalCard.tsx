'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  approveRequestAction,
  rejectRequestAction,
  getDraftForReviewAction,
} from '@/modules/workflow/actions/approval.actions'
import type { DraftDetail } from '@/modules/workflow/actions/approval.actions'
import { CheckCheck, X, Clock, Eye, Mail } from 'lucide-react'
import type { Database } from '@/types/database'
import { format } from 'date-fns'

type ApprovalRow = Database['public']['Tables']['approval_requests']['Row']

export function ApprovalCard({ approval }: { approval: ApprovalRow }) {
  const [loading, setLoading]     = useState<'approve' | 'reject' | null>(null)
  const [resolved, setResolved]   = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft]         = useState<DraftDetail | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)

  if (resolved) return null

  const payload      = (approval.payload ?? {}) as Record<string, unknown>
  const isEmailDraft = approval.request_type === 'email_draft_review'
  const draftId      = typeof payload.draft_id          === 'string' ? payload.draft_id          : null
  const templateSlug = typeof payload.template_slug     === 'string' ? payload.template_slug     : null
  const recRule      = typeof payload.recommendation_rule === 'string' ? payload.recommendation_rule : null

  async function openSheet() {
    setSheetOpen(true)
    if (!draftId || draft) return
    setDraftLoading(true)
    const result = await getDraftForReviewAction(draftId)
    if (result.success) {
      setDraft(result.data)
    } else {
      toast.error(`Could not load draft: ${result.error}`)
    }
    setDraftLoading(false)
  }

  async function handleApprove() {
    setLoading('approve')
    const result = await approveRequestAction(approval.id)
    if (result.success) {
      toast.success('Request approved')
      setResolved(true)
      setSheetOpen(false)
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
      setSheetOpen(false)
    } else {
      toast.error(result.error)
    }
    setLoading(null)
  }

  const toLine =
    typeof payload.to_name === 'string' && payload.to_name
      ? `${payload.to_name} <${String(payload.to_email ?? '')}>`
      : String(payload.to_email ?? '')

  return (
    <>
      {/* ---- Inbox card ---- */}
      <Card
        className={isEmailDraft ? 'cursor-pointer hover:shadow-sm transition-shadow' : ''}
        onClick={isEmailDraft ? openSheet : undefined}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-sm capitalize">
                {approval.request_type.replace(/_/g, ' ')}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                <Clock className="inline h-3 w-3 mr-1" />
                {format(new Date(approval.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              Pending
            </span>
          </div>
        </CardHeader>

        <CardContent className="pb-3 space-y-2">
          {isEmailDraft && payload.subject ? (
            <>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">To: {toLine}</p>
                <p className="text-sm font-medium">{String(payload.subject)}</p>
              </div>
              {typeof payload.body_preview === 'string' && payload.body_preview && (
                <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3 border-l-2 border-border pl-2">
                  {payload.body_preview}
                </p>
              )}
              <p className="text-xs text-primary flex items-center gap-1 pt-0.5">
                <Eye className="h-3 w-3" />
                Click to review full draft
              </p>
            </>
          ) : (
            approval.subject_type && (
              <p className="text-xs text-muted-foreground capitalize">
                Subject: {approval.subject_type}
                {approval.subject_id ? ` (${approval.subject_id.slice(0, 8)}…)` : ''}
              </p>
            )
          )}
          {approval.expires_at && (
            <p className="text-xs text-orange-600">
              Expires: {format(new Date(approval.expires_at), 'MMM d, yyyy')}
            </p>
          )}
        </CardContent>

        {/* Stop propagation so inline buttons don't open the sheet */}
        <CardFooter className="gap-2 pt-0" onClick={(e) => e.stopPropagation()}>
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

      {/* ---- Full-draft review sheet (email_draft_review only) ---- */}
      {isEmailDraft && (
        <Sheet open={sheetOpen} onOpenChange={(open) => setSheetOpen(open)}>
          <SheetContent
            side="right"
            className="data-[side=right]:sm:max-w-lg gap-0 p-0 flex flex-col"
          >
            {/* Header */}
            <SheetHeader className="shrink-0 border-b px-6 py-4">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" />
                Review Email Draft
              </SheetTitle>
            </SheetHeader>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">

              {/* Envelope */}
              <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2 text-sm">
                <SheetMetaRow label="To">
                  <span className="font-medium">{toLine}</span>
                </SheetMetaRow>
                <SheetMetaRow label="Subject">
                  <span className="font-semibold">{String(payload.subject ?? '')}</span>
                </SheetMetaRow>
                <SheetMetaRow label="Status">
                  <Badge
                    variant="outline"
                    className="text-amber-700 border-amber-300 bg-amber-50 text-xs"
                  >
                    Pending Review
                  </Badge>
                </SheetMetaRow>
              </div>

              {/* Email body */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email Body
                </p>

                {draftLoading ? (
                  <div className="flex items-center justify-center rounded-lg border bg-muted/20 h-40 text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : draft?.body_text ? (
                  <div className="rounded-lg border bg-background p-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                      {draft.body_text}
                    </pre>
                  </div>
                ) : draft?.body_html ? (
                  <div
                    className="rounded-lg border bg-background p-4 prose prose-sm max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: draft.body_html }}
                  />
                ) : typeof payload.body_preview === 'string' && payload.body_preview ? (
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                      {payload.body_preview}
                    </pre>
                    <p className="mt-2 text-xs italic text-muted-foreground">
                      Preview only — full body unavailable
                    </p>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No body content</p>
                )}
              </div>

              {/* Details */}
              {(templateSlug || recRule) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Details
                  </p>
                  <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2 text-xs">
                    {templateSlug && (
                      <SheetMetaRow label="Template">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {templateSlug}
                        </code>
                      </SheetMetaRow>
                    )}
                    {recRule && (
                      <SheetMetaRow label="Rule">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {recRule}
                        </code>
                      </SheetMetaRow>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky footer */}
            <SheetFooter className="shrink-0 border-t px-6 py-4 flex-row gap-3 mt-0">
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={loading !== null}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-1.5" />
                {loading === 'reject' ? 'Rejecting…' : 'Reject'}
              </Button>
              <Button
                onClick={handleApprove}
                disabled={loading !== null}
                className="flex-1"
              >
                <CheckCheck className="h-4 w-4 mr-1.5" />
                {loading === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

function SheetMetaRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}
