import Link from 'next/link'
import { getProposalFollowUpQueueAction } from '@/modules/proposals/actions/proposal-follow-up-queue.actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ListChecks } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
  searchParams: Promise<{ due?: string }>
}

const PROPOSAL_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
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

function isOverdue(iso: string): boolean {
  return new Date(iso) < new Date()
}

export default async function ProposalFollowUpsPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params
  const { due: dueParam } = await searchParams

  // Validate due param server-side (action sanitizer also validates, but be explicit here)
  const due = dueParam === 'overdue' || dueParam === 'today' || dueParam === 'upcoming' || dueParam === 'all'
    ? dueParam as 'overdue' | 'today' | 'upcoming' | 'all'
    : undefined

  const result = await getProposalFollowUpQueueAction({ due })

  const base      = `/${workspaceSlug}/proposal-follow-ups`
  const eventsBase = `/${workspaceSlug}/proposal-events`

  const dueFilters: { label: string; value: 'overdue' | 'today' | 'upcoming' | null }[] = [
    { label: 'All Open',  value: null },
    { label: 'Overdue',   value: 'overdue' },
    { label: 'Today',     value: 'today' },
    { label: 'Upcoming',  value: 'upcoming' },
  ]

  const activeDue = due ?? null

  // Error / failure state
  if (!result.success) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Follow-Up Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Open follow-up commitments across all proposals, sorted by due date.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load the follow-up queue. Please try refreshing the page.
        </div>
      </div>
    )
  }

  const { items, summary, appliedFilters, generatedAt } = result.data

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Follow-Up Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Open follow-up commitments across all proposals, sorted by due date.
        </p>
      </div>

      {/* Due filter tabs — URL-based, read-only */}
      <div className="flex gap-2">
        {dueFilters.map(f => (
          <Link
            key={f.value ?? 'all'}
            href={f.value ? `${base}?due=${f.value}` : base}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeDue === f.value
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Summary strip — returned-row counts only, not global DB totals */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>{summary.totalReturned} shown</span>
        <span className={summary.overdueCount > 0 ? 'text-destructive font-medium' : ''}>
          {summary.overdueCount} overdue
        </span>
        <span>{summary.todayCount} today</span>
        <span>{summary.upcomingCount} upcoming</span>
        {appliedFilters.limit !== undefined && (
          <span className="text-muted-foreground/60">limit {appliedFilters.limit}</span>
        )}
        <span className="ml-auto">Generated {fmtDate(generatedAt)}</span>
      </div>

      {/* Empty states */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <ListChecks className="h-10 w-10 text-muted-foreground mb-3" />
          {due ? (
            <>
              <p className="text-sm font-medium">No commitments matching this filter.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try a different filter or{' '}
                <Link href={base} className="text-primary hover:underline">
                  view all open commitments
                </Link>.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">No open follow-up commitments.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Commitments appear here when proposals have upcoming follow-ups.{' '}
                <Link href={eventsBase} className="text-primary hover:underline">
                  View Proposal Events →
                </Link>
              </p>
            </>
          )}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Open Commitments ({items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Due</th>
                  <th className="text-left p-3 font-medium">Seq</th>
                  <th className="text-left p-3 font-medium">Proposal Status</th>
                  <th className="text-left p-3 font-medium">Proposal Sent</th>
                  <th className="text-left p-3 font-medium">Schedule Rule</th>
                  <th className="text-left p-3 font-medium">Lead</th>
                  <th className="text-left p-3 font-medium">Company</th>
                  <th className="text-left p-3 font-medium">Contact</th>
                  <th className="text-left p-3 font-medium">Assigned To</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const overdue = isOverdue(item.follow_up_due_at)
                  return (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className={`p-3 text-xs whitespace-nowrap ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {fmtDate(item.follow_up_due_at)}
                        {overdue && (
                          <Badge variant="destructive" className="ml-1.5 text-[10px] align-middle">
                            overdue
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        #{item.follow_up_sequence}
                      </td>
                      <td className="p-3">
                        <Badge variant={PROPOSAL_STATUS_VARIANT[item.proposal_status] ?? 'outline'}>
                          {item.proposal_status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(item.proposal_sent_at)}
                      </td>
                      <td className="p-3 text-xs font-mono text-muted-foreground">
                        {item.schedule_rule_key}
                      </td>
                      <td className="p-3 text-xs font-mono text-muted-foreground max-w-[100px] truncate">
                        {item.lead_id ?? '—'}
                      </td>
                      <td className="p-3 text-xs font-mono text-muted-foreground max-w-[100px] truncate">
                        {item.company_id ?? '—'}
                      </td>
                      <td className="p-3 text-xs font-mono text-muted-foreground max-w-[100px] truncate">
                        {item.contact_id ?? '—'}
                      </td>
                      <td className="p-3 text-xs font-mono text-muted-foreground max-w-[100px] truncate">
                        {item.assigned_to_user_id ?? '—'}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(item.created_at)}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/${workspaceSlug}/proposal-events/${item.proposal_event_id}`}
                          className="text-xs text-primary hover:underline whitespace-nowrap"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
