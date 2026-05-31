import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { listProposalCapturesForReview } from '@/modules/proposals/services/proposal-capture-review.service'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Inbox } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
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

export default async function ProposalInboxPage({ params }: PageProps) {
  await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const result = await listProposalCapturesForReview(ctx.tenantId, ctx.workspaceId)
  const captures = result.ok ? result.captures : []
  const loadError = !result.ok

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proposal Capture Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pending proposal captures awaiting review and lead matching.
        </p>
      </div>

      {loadError ? (
        <Card>
          <CardContent className="py-8 text-center text-destructive text-sm">
            Failed to load proposal captures. Please refresh to try again.
          </CardContent>
        </Card>
      ) : captures.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">All caught up!</p>
          <p className="text-xs text-muted-foreground mt-1">
            No pending proposal captures. Captures will appear here when received
            via BCC/forward or manual entry.
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Pending Captures ({captures.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-left p-3 font-medium">Sender</th>
                  <th className="text-left p-3 font-medium">Subject</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Received</th>
                  <th className="text-left p-3 font-medium">Captured</th>
                </tr>
              </thead>
              <tbody>
                {captures.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs font-mono">
                        {c.capture_source}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground max-w-[180px] truncate">
                      {c.raw_sender_email ?? '—'}
                    </td>
                    <td className="p-3 max-w-[240px] truncate">
                      {c.raw_subject ? (
                        c.raw_subject
                      ) : (
                        <span className="text-muted-foreground italic">no subject</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={MATCH_STATUS_VARIANT[c.match_status ?? 'pending'] ?? 'outline'}
                      >
                        {c.match_status ?? 'pending'}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                      {fmtDate(c.raw_received_at)}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                      {fmtDate(c.created_at)}
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
