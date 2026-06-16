import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProposalEventRow } from '@/modules/proposals/repositories/proposal-events.repo'

// Reusable proposal-pipeline card for the company (and, later, contact) detail
// pages. Presentational only — no client state.

interface ProposalsCardProps {
  proposals:     ProposalEventRow[]
  workspaceSlug: string
  title?:        string
}

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600 border border-gray-200',
  sent:      'bg-blue-50 text-blue-700 border border-blue-200',
  viewed:    'bg-teal-50 text-teal-700 border border-teal-200',
  accepted:  'bg-green-50 text-green-700 border border-green-200',
  rejected:  'bg-red-50 text-red-700 border border-red-200',
  expired:   'bg-gray-100 text-gray-500 border border-gray-200',
  withdrawn: 'bg-gray-100 text-gray-500 border border-gray-200',
}

function fmtAmount(amount: number | null, currency: string): string {
  if (amount === null) return ''
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ProposalsCard({ proposals, workspaceSlug, title = 'Proposals' }: ProposalsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {proposals.length > 0 && (
            <span className="text-xs text-muted-foreground">{proposals.length}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {proposals.length === 0 ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">No proposals yet.</p>
        ) : (
          <div className="divide-y">
            {proposals.map((p) => {
              const currency = p.proposal_currency ?? 'USD'
              const annual   = fmtAmount(p.proposal_amount, currency)
              const monthly  = fmtAmount(p.estimated_savings, currency)
              return (
                <Link
                  key={p.id}
                  href={`/${workspaceSlug}/proposal-events/${p.id}`}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors"
                >
                  <span className={`text-xs font-medium capitalize rounded-full px-2 py-0.5 shrink-0 ${STATUS_BADGE[p.proposal_status] ?? STATUS_BADGE.draft}`}>
                    {p.proposal_status}
                  </span>
                  <div className="flex-1 min-w-0">
                    {annual && (
                      <p className="text-sm font-medium truncate">{annual}/yr est. savings</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {p.first_viewed_at
                        ? `Viewed ${fmtDate(p.first_viewed_at)}`
                        : p.proposal_sent_at
                          ? `Sent ${fmtDate(p.proposal_sent_at)}`
                          : `Created ${fmtDate(p.created_at)}`}
                      {monthly && ` · ${monthly}/mo`}
                    </p>
                  </div>
                  <span className="text-xs text-primary shrink-0">View →</span>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
