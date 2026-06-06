import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import * as followUpRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import * as proposalEventRepo from '@/modules/proposals/repositories/proposal-events.repo'
import { listPendingApprovals } from '@/modules/workflow/repositories/approval.repo'
import * as leadService from '@/modules/crm/services/lead.service'
import { getDraftStatusCounts } from '@/modules/messaging/repositories/email-draft.repo'
import { getProposedAssignments } from '@/modules/messaging/repositories/campaign-assignment.repo'
import Link from 'next/link'
import { ListChecks, FileText, ClipboardList, Zap, LayoutList } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function OperationsPage({ params }: PageProps) {
  const { workspaceSlug } = await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const [overdueFollowUps, todayFollowUps, upcomingFollowUps, openProposals, pendingApprovals, leadsByStage, draftCounts, proposedAssignments] =
    await Promise.all([
      followUpRepo.listProposalFollowUpQueueItemsForWorkspace(ctx.tenantId, ctx.workspaceId, { due: 'overdue', limit: 20 }).catch(() => []),
      followUpRepo.listProposalFollowUpQueueItemsForWorkspace(ctx.tenantId, ctx.workspaceId, { due: 'today',   limit: 20 }).catch(() => []),
      followUpRepo.listProposalFollowUpQueueItemsForWorkspace(ctx.tenantId, ctx.workspaceId, { due: 'upcoming', limit: 10 }).catch(() => []),
      proposalEventRepo.listProposalEventInboxItemsForWorkspace(ctx.tenantId, ctx.workspaceId, { status: 'open', limit: 20 }).catch(() => []),
      listPendingApprovals(ctx.tenantId, ctx.workspaceId).catch(() => []),
      leadService.listLeadsByStage(ctx).catch(() => ({})),
      getDraftStatusCounts(ctx.tenantId).catch(() => []),
      getProposedAssignments(ctx.workspaceId).catch(() => []),
    ])

  const draftCountMap = Object.fromEntries(draftCounts.map(d => [d.status, d.count]))

  const productionStates = [
    { label: 'Planned',           count: proposedAssignments.length,                color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200' },
    { label: 'Draft Ready',       count: draftCountMap['draft'] ?? 0,               color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'  },
    { label: 'Awaiting Approval', count: pendingApprovals.length,                   color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
    { label: 'Approved',          count: draftCountMap['approved'] ?? 0,            color: 'text-teal-600',   bg: 'bg-teal-50',   border: 'border-teal-200'  },
    { label: 'Sent',              count: draftCountMap['sent'] ?? 0,                color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
    { label: 'Stopped / Responded', count: draftCountMap['superseded'] ?? 0,        color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200'  },
  ]

  const totalLeads = Object.values(leadsByStage).flat().length
  const followUpsDueCount = overdueFollowUps.length + todayFollowUps.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Operations</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Current operations snapshot — follow-up urgency is date-sensitive; proposals, approvals, and pipeline show current totals.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">

        {/* Follow-Ups */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-semibold">Follow-Ups Due</h2>
            {followUpsDueCount > 0 && (
              <span className="ml-auto text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5">
                {followUpsDueCount}
              </span>
            )}
          </div>
          {overdueFollowUps.length === 0 && todayFollowUps.length === 0 ? (
            <p className="text-xs text-muted-foreground">No follow-ups overdue or due today</p>
          ) : (
            <div className="space-y-1">
              {overdueFollowUps.slice(0, 5).map((f) => (
                <Link
                  key={f.id}
                  href={`/${workspaceSlug}/proposal-follow-ups`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">
                    {f.proposal_reference ?? f.proposal_event_id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-red-600 shrink-0">Overdue</span>
                </Link>
              ))}
              {todayFollowUps.slice(0, 5).map((f) => (
                <Link
                  key={f.id}
                  href={`/${workspaceSlug}/proposal-follow-ups`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">
                    {f.proposal_reference ?? f.proposal_event_id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">Today</span>
                </Link>
              ))}
            </div>
          )}
          {upcomingFollowUps.length > 0 && (
            <p className="text-xs text-muted-foreground pt-1 border-t">
              {upcomingFollowUps.length} upcoming — <Link href={`/${workspaceSlug}/proposal-follow-ups`} className="underline">view all</Link>
            </p>
          )}
        </div>

        {/* Open Proposals */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold">Open Proposals</h2>
            {openProposals.length > 0 && (
              <span className="ml-auto text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                {openProposals.length}
              </span>
            )}
          </div>
          {openProposals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No open proposals</p>
          ) : (
            <div className="space-y-1">
              {openProposals.slice(0, 6).map((e) => (
                <Link
                  key={e.id}
                  href={`/${workspaceSlug}/proposal-events/${e.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">
                    {e.proposal_reference ?? e.id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize shrink-0">{e.proposal_status}</span>
                </Link>
              ))}
            </div>
          )}
          {openProposals.length > 6 && (
            <p className="text-xs text-muted-foreground pt-1 border-t">
              +{openProposals.length - 6} more — <Link href={`/${workspaceSlug}/proposal-inbox`} className="underline">view all</Link>
            </p>
          )}
        </div>

        {/* Pending Approvals */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold">Awaiting Approval</h2>
            {pendingApprovals.length > 0 && (
              <span className="ml-auto text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                {pendingApprovals.length}
              </span>
            )}
          </div>
          {pendingApprovals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No drafts awaiting approval</p>
          ) : (
            <div className="space-y-1">
              {pendingApprovals.slice(0, 6).map((a) => (
                <Link
                  key={a.id}
                  href={`/${workspaceSlug}/inbox`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1 capitalize">
                    {a.request_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">Pending</span>
                </Link>
              ))}
            </div>
          )}
          {pendingApprovals.length > 6 && (
            <p className="text-xs text-muted-foreground pt-1 border-t">
              +{pendingApprovals.length - 6} more — <Link href={`/${workspaceSlug}/inbox`} className="underline">view all</Link>
            </p>
          )}
        </div>

        {/* Lead Pipeline */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-semibold">Lead Pipeline</h2>
            {totalLeads > 0 && (
              <span className="ml-auto text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5">
                {totalLeads}
              </span>
            )}
          </div>
          {totalLeads === 0 ? (
            <p className="text-xs text-muted-foreground">No open leads</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(leadsByStage)
                .filter(([, leads]) => leads.length > 0)
                .slice(0, 6)
                .map(([stage, leads]) => (
                  <div key={stage} className="flex items-center gap-2 px-2 py-1">
                    <span className="text-xs text-foreground capitalize flex-1">{stage.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground">{leads.length}</span>
                  </div>
                ))}
            </div>
          )}
          <Link href={`/${workspaceSlug}/leads`} className="text-xs text-primary hover:underline block pt-1 border-t">
            View all leads →
          </Link>
        </div>

      </div>

      {/* Production Schedule */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <LayoutList className="h-4 w-4 text-slate-600" />
          <h2 className="text-sm font-semibold">Production Schedule</h2>
          <span className="ml-auto text-xs text-muted-foreground">Read-only visibility</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-6">
          {productionStates.map(s => (
            <div key={s.label} className={`rounded-md border ${s.border} ${s.bg} px-3 py-2 text-center`}>
              <p className={`text-lg font-bold leading-none ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground border-t pt-2">
          Visibility layer only — no scheduling execution or sending. Drafts awaiting approval can be reviewed in{' '}
          <Link href={`/${workspaceSlug}/inbox`} className="underline">Inbox</Link>.
        </p>
      </div>

    </div>
  )
}
