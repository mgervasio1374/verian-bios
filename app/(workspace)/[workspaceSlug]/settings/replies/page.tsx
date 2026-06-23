import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { listInboundReplies } from '@/modules/messaging/inbound/inbound-reply.repo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare } from 'lucide-react'

const MATCH_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  matched:   'default',
  unmatched: 'outline',
  pending:   'secondary',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default async function RepliesPage() {
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.leads.view')

  const replies = await listInboundReplies(ctx.tenantId, ctx.workspaceId).catch(() => [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Replies</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inbound replies to outreach. A matched human reply stops the prospect&apos;s remaining touches;
          every reply is forwarded to the sales team. Read-only.
        </p>
      </div>

      {replies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No replies captured yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Replies arrive once inbound mail routing is configured to POST the capture webhook.
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Replies ({replies.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">From</th>
                  <th className="text-left p-3 font-medium">Subject</th>
                  <th className="text-left p-3 font-medium">Match</th>
                  <th className="text-left p-3 font-medium">Signals</th>
                  <th className="text-left p-3 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {replies.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 max-w-[220px] truncate">{r.from_email}</td>
                    <td className="p-3 max-w-[280px] truncate text-muted-foreground">
                      {r.subject ?? '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={MATCH_VARIANT[r.match_status] ?? 'outline'}>
                          {r.match_status}
                        </Badge>
                        {r.matched_contact_id && (
                          <span className="text-xs text-muted-foreground font-mono max-w-[100px] truncate">
                            {r.matched_contact_id}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.touches_stopped > 0 && (
                          <Badge variant="secondary">Sequence stopped ({r.touches_stopped})</Badge>
                        )}
                        {r.optout_suppressed && <Badge variant="destructive">Opt-out</Badge>}
                        {r.optout_detected && !r.optout_suppressed && (
                          <Badge variant="outline">Opt-out?</Badge>
                        )}
                        {r.is_auto_reply && <Badge variant="outline">Auto-reply</Badge>}
                        {!r.forwarded_at && <Badge variant="outline">Not forwarded</Badge>}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                      {fmtDate(r.received_at ?? r.created_at)}
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
