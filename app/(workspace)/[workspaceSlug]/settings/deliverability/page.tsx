import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/permissions'
import { getDeliverabilityOverview } from '@/modules/analytics/deliverability.repo'
import type { DeliverabilityHealth } from '@/modules/analytics/deliverability'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

const HEALTH_VARIANT: Record<DeliverabilityHealth, 'secondary' | 'outline' | 'destructive'> = {
  ok:       'secondary',
  warning:  'outline',
  critical: 'destructive',
}

function fmtRate(rate: number | null): string {
  if (rate === null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default async function DeliverabilityPage({ params }: PageProps) {
  await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)
  requirePermission(ctx, 'crm.companies.view')

  const overview = await getDeliverabilityOverview(ctx.tenantId)
  const { byDomain, bySender, recentBounces, suppression, totalSends } = overview

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Deliverability</h1>
        <p className="text-sm text-muted-foreground mt-1">
          30-day rolling window. Read-only — no actions are triggered from this page.
          Reputation is only flagged once a domain/sender clears a minimum sample.
        </p>
      </div>

      {/* Per-domain reputation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Recipient Domain</CardTitle>
        </CardHeader>
        <CardContent>
          {byDomain.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sends in the last 30 days.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Domain</th>
                  <th className="text-right p-2 font-medium">Sent</th>
                  <th className="text-right p-2 font-medium">Delivery</th>
                  <th className="text-right p-2 font-medium">Bounce</th>
                  <th className="text-right p-2 font-medium">Complaint</th>
                  <th className="text-right p-2 font-medium">Health</th>
                </tr>
              </thead>
              <tbody>
                {byDomain.map(d => (
                  <tr key={d.domain} className="border-b last:border-0">
                    <td className="p-2 font-mono text-xs">{d.domain}</td>
                    <td className="p-2 text-right">{d.sent}</td>
                    <td className="p-2 text-right">{fmtRate(d.deliveryRate)}</td>
                    <td className={`p-2 text-right ${d.bounceRate > 0.05 ? 'text-destructive' : ''}`}>
                      {fmtRate(d.bounceRate)}
                    </td>
                    <td className={`p-2 text-right ${d.complaintRate > 0.001 ? 'text-destructive' : ''}`}>
                      {fmtRate(d.complaintRate)}
                    </td>
                    <td className="p-2 text-right">
                      <Badge variant={HEALTH_VARIANT[d.health]} className="text-xs">{d.health}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Per-sender reputation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Sender Identity</CardTitle>
        </CardHeader>
        <CardContent>
          {bySender.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sends in the last 30 days.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Sender</th>
                  <th className="text-right p-2 font-medium">Sent</th>
                  <th className="text-right p-2 font-medium">Delivery</th>
                  <th className="text-right p-2 font-medium">Bounce</th>
                  <th className="text-right p-2 font-medium">Complaint</th>
                  <th className="text-right p-2 font-medium">Health</th>
                </tr>
              </thead>
              <tbody>
                {bySender.map(s => (
                  <tr key={s.senderIdentityId ?? '(unattributed)'} className="border-b last:border-0">
                    <td className="p-2">
                      <span className="font-medium">{s.senderName}</span>
                      {s.senderEmail !== s.senderName && (
                        <span className="text-xs text-muted-foreground ml-2 font-mono">{s.senderEmail}</span>
                      )}
                    </td>
                    <td className="p-2 text-right">{s.sent}</td>
                    <td className="p-2 text-right">{fmtRate(s.deliveryRate)}</td>
                    <td className={`p-2 text-right ${s.bounceRate > 0.05 ? 'text-destructive' : ''}`}>
                      {fmtRate(s.bounceRate)}
                    </td>
                    <td className={`p-2 text-right ${s.complaintRate > 0.001 ? 'text-destructive' : ''}`}>
                      {fmtRate(s.complaintRate)}
                    </td>
                    <td className="p-2 text-right">
                      <Badge variant={HEALTH_VARIANT[s.health]} className="text-xs">{s.health}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Recent permanent bounces */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Permanent Bounces</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBounces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No permanent bounces recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Email</th>
                  <th className="text-left p-2 font-medium">Type</th>
                  <th className="text-left p-2 font-medium">Sub-type</th>
                  <th className="text-right p-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recentBounces.map((b, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2 font-mono text-xs">{b.toEmail ?? '—'}</td>
                    <td className="p-2">{b.bounceType ?? '—'}</td>
                    <td className="p-2 text-muted-foreground">{b.bounceSubType ?? '—'}</td>
                    <td className="p-2 text-right text-muted-foreground">{fmtDate(b.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Suppression summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Unsubscribes</p>
            <p className="text-3xl font-bold mt-1">{suppression.unsubscribes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Email Suppression Rules</p>
            <p className="text-3xl font-bold mt-1">{suppression.emailRules}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Domain Suppression Rules</p>
            <p className="text-3xl font-bold mt-1">{suppression.domainRules}</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        {totalSends} sends in the window. Aggregated in-app at pilot volume; this moves to
        an RPC / materialized view at scale.
      </p>
    </div>
  )
}
