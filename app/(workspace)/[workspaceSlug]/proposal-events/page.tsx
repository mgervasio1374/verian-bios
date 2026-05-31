import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { listProposalEventInboxItemsForWorkspace } from '@/modules/proposals/repositories/proposal-events.repo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClipboardList } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
  searchParams: Promise<{ status?: string; captureSource?: string }>
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent:      'secondary',
  viewed:    'default',
  accepted:  'default',
  rejected:  'destructive',
  expired:   'outline',
  withdrawn: 'secondary',
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

function isOverdue(iso: string | null): boolean {
  if (!iso) return false
  return new Date(iso) < new Date()
}

export default async function ProposalEventsPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params
  const { status, captureSource } = await searchParams

  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.leads.view')

  const statusOpt = status === 'all' || !status ? undefined : (status as 'open' | 'closed' | string)

  const events = await listProposalEventInboxItemsForWorkspace(ctx.tenantId, ctx.workspaceId, {
    status: statusOpt,
    captureSource: captureSource || undefined,
  })

  const base = `/${workspaceSlug}/proposal-events`

  const statusFilters: { label: string; value: string }[] = [
    { label: 'All',    value: 'all' },
    { label: 'Open',   value: 'open' },
    { label: 'Closed', value: 'closed' },
  ]

  const activeFilter = status || 'all'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proposal Events</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All proposal events for this workspace.
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2">
        {statusFilters.map(f => (
          <Link
            key={f.value}
            href={f.value === 'all' ? base : `${base}?status=${f.value}`}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeFilter === f.value
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No proposal events yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Proposal events are created from matched captures in the Proposal Inbox.
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Proposal Events ({events.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Sent</th>
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-left p-3 font-medium">Reference</th>
                  <th className="text-left p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium">Savings</th>
                  <th className="text-left p-3 font-medium">Lead</th>
                  <th className="text-left p-3 font-medium">Next Follow-up</th>
                  <th className="text-left p-3 font-medium">Commitments</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr
                    key={e.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[e.proposal_status] ?? 'outline'}>
                        {e.proposal_status}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                      {fmtDate(e.proposal_sent_at)}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs font-mono">
                        {e.capture_source}
                      </Badge>
                    </td>
                    <td className="p-3 max-w-[160px] truncate text-muted-foreground">
                      {e.proposal_reference ?? '—'}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {fmtAmount(e.proposal_amount, e.proposal_currency)}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {e.estimated_savings !== null
                        ? fmtAmount(e.estimated_savings, e.proposal_currency)
                        : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs font-mono max-w-[120px] truncate">
                      {e.lead_id ?? '—'}
                    </td>
                    <td className={`p-3 text-xs whitespace-nowrap ${isOverdue(e.next_open_follow_up_due_at) ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {fmtDate(e.next_open_follow_up_due_at)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {e.open_commitment_count} / {e.total_commitment_count}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                      {fmtDate(e.created_at)}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/${workspaceSlug}/proposal-events/${e.id}`}
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
