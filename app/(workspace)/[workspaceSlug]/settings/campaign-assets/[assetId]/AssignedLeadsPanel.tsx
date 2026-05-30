import Link from 'next/link'
import type { CampaignAssignment } from '@/modules/messaging/types/campaign-assignment.types'

interface AssignedLeadsPanelProps {
  assetId:       string
  workspaceSlug: string
  assignments:   CampaignAssignment[]
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    proposed: { label: 'Proposed', className: 'bg-yellow-100 text-yellow-800' },
    assigned: { label: 'Assigned', className: 'bg-green-100 text-green-800' },
    paused:   { label: 'Paused',   className: 'bg-gray-100 text-gray-600' },
  }
  const { label, className } = config[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  )
}

export function AssignedLeadsPanel({ workspaceSlug, assignments }: AssignedLeadsPanelProps) {
  const PAGE_SIZE = 20
  const displayed = assignments.slice(0, PAGE_SIZE)

  return (
    <div className="rounded-lg border bg-background p-4 space-y-3">
      <p className="text-sm font-semibold">Assigned Leads ({assignments.length})</p>

      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads assigned to this campaign asset.</p>
      ) : (
        <>
          <div className="space-y-2">
            {displayed.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <StatusBadge status={a.assignment_status} />
                <span className="flex-1 text-muted-foreground text-xs capitalize">
                  {a.assignment_source.replace(/_/g, ' ')}
                </span>
                {a.lead_id && (
                  <Link
                    href={`/${workspaceSlug}/leads/${a.lead_id}`}
                    className="text-xs text-primary hover:underline whitespace-nowrap"
                  >
                    View Lead →
                  </Link>
                )}
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-auto">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
          {assignments.length > PAGE_SIZE && (
            <p className="text-xs text-muted-foreground">
              Showing {PAGE_SIZE} of {assignments.length} assignments.
            </p>
          )}
        </>
      )}
    </div>
  )
}
