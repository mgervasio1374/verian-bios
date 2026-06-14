import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getProposalEventById } from '@/modules/proposals/repositories/proposal-events.repo'
import { listCommitmentsForProposalEvent } from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProposalStatusControl } from './ProposalStatusControl'
import { ApproveSendControl } from './ApproveSendControl'

interface PageProps {
  params: Promise<{ workspaceSlug: string; eventId: string }>
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft:     'outline',
  sent:      'secondary',
  viewed:    'default',
  accepted:  'default',
  rejected:  'destructive',
  expired:   'outline',
  withdrawn: 'secondary',
}

const COMMITMENT_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open:           'default',
  completed:      'secondary',
  skipped:        'outline',
  proposal_closed: 'secondary',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtAmount(amount: number | null, currency: string): string {
  if (amount === null) return '—'
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false
  return new Date(iso) < new Date()
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm break-all">{value ?? <span className="text-muted-foreground">—</span>}</span>
    </div>
  )
}

export default async function ProposalEventDetailPage({ params }: PageProps) {
  const { workspaceSlug, eventId } = await params

  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.leads.view')

  const event = await getProposalEventById(ctx.tenantId, ctx.workspaceId, eventId)
  if (!event) notFound()

  const commitments = await listCommitmentsForProposalEvent(ctx.tenantId, ctx.workspaceId, eventId)

  const base = `/${workspaceSlug}/proposal-events`

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Proposal Event</h1>
            <Badge variant={STATUS_VARIANT[event.proposal_status] ?? 'outline'}>
              {event.proposal_status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">{event.id}</p>
        </div>
        <Link href={base} className="text-sm text-muted-foreground hover:underline">
          ← Proposal Events
        </Link>
      </div>

      {/* Proposal Details */}
      <Card>
        <CardHeader><CardTitle>Proposal Details</CardTitle></CardHeader>
        <CardContent className="py-2">
          <DetailRow label="Status"      value={<Badge variant={STATUS_VARIANT[event.proposal_status] ?? 'outline'}>{event.proposal_status}</Badge>} />
          <DetailRow label="Sent at"     value={fmtDate(event.proposal_sent_at)} />
          {event.first_viewed_at && (
            <DetailRow label="Viewed"    value={fmtDate(event.first_viewed_at)} />
          )}
          <DetailRow label="Reference"   value={event.proposal_reference} />
          <DetailRow label="Amount"      value={fmtAmount(event.proposal_amount, event.proposal_currency)} />
          <DetailRow label="Savings"     value={event.estimated_savings !== null ? fmtAmount(event.estimated_savings, event.proposal_currency) : null} />
          <DetailRow label="Source"      value={<Badge variant="outline" className="text-xs font-mono">{event.capture_source}</Badge>} />
          <DetailRow label="Created"     value={fmtDate(event.created_at)} />
          <DetailRow label="Updated"     value={fmtDate(event.updated_at)} />
        </CardContent>
      </Card>

      {/* Linked Records */}
      <Card>
        <CardHeader><CardTitle>Linked Records</CardTitle></CardHeader>
        <CardContent className="py-2">
          <DetailRow label="Lead ID"     value={event.lead_id    ? <span className="font-mono text-xs">{event.lead_id}</span>    : null} />
          <DetailRow label="Company ID"  value={event.company_id ? <span className="font-mono text-xs">{event.company_id}</span> : null} />
          <DetailRow label="Contact ID"  value={event.contact_id ? <span className="font-mono text-xs">{event.contact_id}</span> : null} />
          <DetailRow
            label="Capture ID"
            value={
              event.capture_id ? (
                <Link
                  href={`/${workspaceSlug}/proposal-inbox/${event.capture_id}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {event.capture_id}
                </Link>
              ) : null
            }
          />
        </CardContent>
      </Card>

      {/* Approve & Send (draft hosted proposals only) */}
      {event.proposal_status === 'draft' && (
        <ApproveSendControl proposalEventId={event.id} />
      )}

      {/* Status Transition (open proposals only) */}
      {(event.proposal_status === 'sent' || event.proposal_status === 'viewed') && (
        <ProposalStatusControl
          proposalEventId={event.id}
          currentStatus={event.proposal_status}
        />
      )}

      {/* Follow-Up Commitments */}
      <Card>
        <CardHeader><CardTitle>Follow-Up Commitments</CardTitle></CardHeader>
        <CardContent className="p-0">
          {commitments.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No follow-up commitments found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">#</th>
                    <th className="text-left p-3 font-medium">Due</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Rule</th>
                    <th className="text-left p-3 font-medium">Assigned</th>
                    <th className="text-left p-3 font-medium">Completed</th>
                    <th className="text-left p-3 font-medium">Completed by</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.map(c => {
                    const overdueOpen = c.commitment_status === 'open' && isOverdue(c.follow_up_due_at)
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-muted-foreground">{c.follow_up_sequence}</td>
                        <td className={`p-3 text-xs whitespace-nowrap ${overdueOpen ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          {fmtDate(c.follow_up_due_at)}
                        </td>
                        <td className="p-3">
                          <Badge variant={overdueOpen ? 'destructive' : (COMMITMENT_STATUS_VARIANT[c.commitment_status] ?? 'outline')}>
                            {c.commitment_status}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs font-mono text-muted-foreground">{c.schedule_rule_key}</td>
                        <td className="p-3 text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                          {c.assigned_to_user_id ?? '—'}
                        </td>
                        <td className="p-3 text-xs whitespace-nowrap text-muted-foreground">
                          {fmtDate(c.completed_at)}
                        </td>
                        <td className="p-3 text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                          {c.completed_by_user_id ?? '—'}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[160px] truncate">
                          {c.completion_notes ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
