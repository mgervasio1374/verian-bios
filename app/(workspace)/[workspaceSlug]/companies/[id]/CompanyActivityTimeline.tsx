import type { Database } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Mirrors LeadActivityTimeline (same labels/colors/relative-time + row markup),
// scoped to a company. Does not alter the lead timeline.

type ActivityEventRow = Database['public']['Tables']['activity_events']['Row']

const EVENT_LABELS: Record<string, string> = {
  ET_SEND_INITIATED:                'Email send initiated',
  ET_SEND_SUCCEEDED:                'Email sent',
  ET_EMAIL_DELIVERED:               'Email delivered',
  ET_EMAIL_BOUNCED:                 'Email bounced',
  ET_EMAIL_COMPLAINED:              'Complaint received',
  ET_EMAIL_DELIVERY_FAILED:         'Delivery failed',
  ET_EMAIL_OPENED:                  'Email opened',
  ET_EMAIL_CLICKED:                 'Link clicked',
  HRB_ACTION_APPROVED:              'Draft approved',
  HRB_ACTION_REJECTED:              'Draft rejected',
  HRB_ACTION_SELECTED:              'Version selected for review',
  HRB_ACTION_REGENERATION_REQUESTED:'Regeneration requested',
  SEB_ACTION_DRAFT_CREATED:         'Email draft created',
  MESSAGE_VERSIONS_GENERATED:       'Message versions generated',
  MESSAGE_STRATEGY_GENERATED:       'Strategy generated',
  QUALITY_REVIEW_COMPLETED:         'Quality review completed',
  MANUAL_CAMPAIGN_DRAFT_CREATED:    'Manual draft created',
  LEAD_STAGE_CHANGED:               'Stage changed',
  savings_analysis_generated:       'Savings analysis generated',
  statement_ingested:               'Statement ingested',
  company_document_uploaded:        'Document uploaded',
}

const OUTCOME_COLORS: Record<string, string> = {
  ET_EMAIL_BOUNCED:         'text-amber-600',
  ET_EMAIL_COMPLAINED:      'text-red-600',
  ET_EMAIL_DELIVERY_FAILED: 'text-red-600',
  HRB_ACTION_REJECTED:      'text-amber-600',
  ET_SEND_SUCCEEDED:        'text-green-600',
  ET_EMAIL_DELIVERED:       'text-green-600',
  HRB_ACTION_APPROVED:      'text-green-600',
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

interface CompanyActivityTimelineProps {
  events: ActivityEventRow[]
}

export function CompanyActivityTimeline({ events }: CompanyActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Company Activity</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No activity recorded yet for this company.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Company Activity</CardTitle></CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-muted-foreground/40 flex-none" />
              <div className="min-w-0 flex-1">
                <span className={`font-medium ${OUTCOME_COLORS[event.event_type] ?? ''}`}>
                  {EVENT_LABELS[event.event_type] ?? event.event_type}
                </span>
                {event.event_summary && (
                  <span className="text-muted-foreground"> — {event.event_summary}</span>
                )}
              </div>
              <span
                className="text-xs text-muted-foreground whitespace-nowrap flex-none"
                title={event.occurred_at}
              >
                {formatRelativeTime(event.occurred_at)}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
