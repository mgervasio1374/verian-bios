import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as captureRepo from '@/modules/proposals/repositories/proposal-captures.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProposalCaptureReviewActions } from './ProposalCaptureReviewActions'

interface PageProps {
  params: Promise<{ workspaceSlug: string; captureId: string }>
}

const MATCH_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:         'secondary',
  matched:         'default',
  unmatched:       'outline',
  dismissed:       'secondary',
  manual_override: 'outline',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm break-all">{value ?? <span className="text-muted-foreground">—</span>}</span>
    </div>
  )
}

export default async function CaptureDetailPage({ params }: PageProps) {
  const { workspaceSlug, captureId } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const capture = await captureRepo.getCaptureById(ctx.tenantId, ctx.workspaceId, captureId)
  if (!capture) notFound()

  const isPending = capture.match_status === 'pending'

  const leads = isPending
    ? await leadRepo.listLeads({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, limit: 200 })
    : []

  const base = `/${workspaceSlug}/proposal-inbox`

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Proposal Capture</h1>
            <Badge variant={MATCH_STATUS_VARIANT[capture.match_status] ?? 'outline'}>
              {capture.match_status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">{capture.id}</p>
        </div>
        <Link href={base} className="text-sm text-muted-foreground hover:underline">
          ← Proposal Inbox
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Capture Details</CardTitle></CardHeader>
        <CardContent className="py-2">
          <DetailRow
            label="Source"
            value={<Badge variant="outline" className="text-xs font-mono">{capture.capture_source}</Badge>}
          />
          <DetailRow label="Sender" value={capture.raw_sender_email} />
          <DetailRow label="Recipient" value={capture.raw_recipient_email} />
          <DetailRow
            label="Subject"
            value={capture.raw_subject ?? <span className="italic text-muted-foreground">no subject</span>}
          />
          <DetailRow label="Received" value={fmtDate(capture.raw_received_at)} />
          <DetailRow label="Captured at" value={fmtDate(capture.created_at)} />
          {capture.attachments_count > 0 && (
            <DetailRow
              label="Attachments"
              value={
                capture.attachment_names && capture.attachment_names.length > 0
                  ? `${capture.attachments_count} (${capture.attachment_names.join(', ')})`
                  : String(capture.attachments_count)
              }
            />
          )}
        </CardContent>
      </Card>

      {capture.raw_body_excerpt && (
        <Card>
          <CardHeader><CardTitle>Body Excerpt</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap text-muted-foreground leading-relaxed">
              {capture.raw_body_excerpt}
            </pre>
          </CardContent>
        </Card>
      )}

      {capture.match_status !== 'pending' && (capture.matched_lead_id || capture.review_notes || capture.reviewed_at) && (
        <Card>
          <CardHeader><CardTitle>Review Result</CardTitle></CardHeader>
          <CardContent className="py-2">
            {capture.matched_lead_id && (
              <DetailRow label="Matched Lead ID" value={capture.matched_lead_id} />
            )}
            {capture.matched_company_id && (
              <DetailRow label="Matched Company ID" value={capture.matched_company_id} />
            )}
            {capture.matched_contact_id && (
              <DetailRow label="Matched Contact ID" value={capture.matched_contact_id} />
            )}
            {capture.reviewed_at && (
              <DetailRow label="Reviewed at" value={fmtDate(capture.reviewed_at)} />
            )}
            {capture.review_notes && (
              <DetailRow label="Notes" value={capture.review_notes} />
            )}
          </CardContent>
        </Card>
      )}

      {isPending && (
        <ProposalCaptureReviewActions
          captureId={capture.id}
          backHref={base}
          leads={leads.map(l => ({ id: l.id, name: l.name }))}
        />
      )}
    </div>
  )
}
