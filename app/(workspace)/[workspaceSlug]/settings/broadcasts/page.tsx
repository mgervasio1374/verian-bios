import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { listBroadcasts } from '@/modules/messaging/services/broadcast.service'
import { BroadcastList } from './BroadcastList'

export default async function BroadcastsPage() {
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)

  const broadcasts = await listBroadcasts(ctx.tenantId, ctx.workspaceId).catch(() => [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">One-time Emails</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A single email sent once to a selected cohort, dripped out at the current sending
          velocity rather than in one burst. Campaigns always take priority for the daily
          allowance, so a one-time email slows or holds when a campaign starts instead of
          competing with it.
        </p>
      </div>

      <BroadcastList
        broadcasts={broadcasts.map(b => ({
          id:              b.id,
          name:            b.name,
          status:          b.status,
          totalRecipients: b.totalRecipients,
          sentCount:       b.sentCount,
          gracePeriodDays: b.gracePeriodDays,
          resumeAfter:     b.resumeAfter,
          startsAt:        b.startsAt,
          sendWindowStart: b.sendWindowStart,
          sendWindowEnd:   b.sendWindowEnd,
          timeZone:        b.timeZone,
        }))}
      />
    </div>
  )
}
