import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { getCampaignWorkQueue } from '@/modules/messaging/services/campaign-queue.service'
import type { DraftReadiness, CampaignQueueEntry } from '@/modules/messaging/services/campaign-queue.service'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

function DraftReadinessBadge({ readiness }: { readiness: DraftReadiness }) {
  if (readiness === 'no_draft') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        No Draft
      </span>
    )
  }
  if (readiness === 'has_pending_draft') {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
        Draft Pending
      </span>
    )
  }
  if (readiness === 'has_approved_draft') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        Draft Approved
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
      Draft Linked
    </span>
  )
}

export default async function CampaignQueuePage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx      = await buildRequestContext(supabase)

  let queue: CampaignQueueEntry[] = []
  let queueError: string | null = null
  try {
    queue = await getCampaignWorkQueue(ctx.tenantId, ctx.workspaceId)
  } catch (err) {
    queueError = err instanceof Error ? err.message : 'Failed to load campaign queue'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaign Work Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {queueError ? 'Error loading queue.' : `${queue.length} active campaign assignment${queue.length !== 1 ? 's' : ''} awaiting draft creation.`}
        </p>
      </div>

      {queueError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load campaign queue: {queueError}
        </div>
      )}

      {!queueError && queue.length === 0 && (
        <div className="rounded-md border border-dashed px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">No active campaign assignments.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Assign leads to campaigns on each lead&apos;s detail page.
          </p>
        </div>
      )}

      {!queueError && queue.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lead</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campaign</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Asset</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Assigned</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {queue.map((entry) => (
                <tr key={entry.assignment.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-medium">{entry.leadName ?? '—'}</div>
                    {entry.leadStatus && (
                      <div className="text-xs text-muted-foreground">{entry.leadStatus}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {entry.assignment.campaign_type.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.assetName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">
                    {entry.assignment.assignment_source.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(entry.assignment.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <DraftReadinessBadge readiness={entry.draftReadiness} />
                  </td>
                  <td className="px-4 py-3">
                    {entry.assignment.lead_id ? (
                      <Link
                        href={`/${workspaceSlug}/leads/${entry.assignment.lead_id}`}
                        className="text-primary hover:underline text-xs"
                      >
                        View Lead →
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
