import * as queueRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import type {
  ProposalFollowUpQueueItem,
  ListProposalFollowUpQueueOptions,
} from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'

export type { ProposalFollowUpQueueItem }

// Counts derived from the returned page of items only — not from global DB totals.
// All fields reflect rows included in this response, not the entire workspace dataset.
// overdueCount and upcomingCount follow queue filter semantics (relative to now).
// todayCount is a UTC calendar-day helper count and may overlap with overdue or upcoming.
export interface ProposalFollowUpQueueSummary {
  totalReturned: number   // total items in this page/response
  overdueCount: number    // items with follow_up_due_at < now (matches 'overdue' filter semantics)
  todayCount: number      // items with follow_up_due_at within the current UTC calendar day
  upcomingCount: number   // items with follow_up_due_at >= now (matches 'upcoming' filter semantics)
}

export interface ProposalFollowUpQueueFilters {
  due: 'overdue' | 'today' | 'upcoming' | 'all' | undefined
  followUpSequence: number | undefined
  proposalStatus: string | string[] | undefined
  limit: number
  offset: number
}

export interface ProposalFollowUpQueueResponse {
  items: ProposalFollowUpQueueItem[]
  summary: ProposalFollowUpQueueSummary
  appliedFilters: ProposalFollowUpQueueFilters
  generatedAt: string
}

export type GetProposalFollowUpQueueResult =
  | ({ ok: true } & ProposalFollowUpQueueResponse)
  | { ok: false; error: 'load_failed' }

export async function getProposalFollowUpQueueForWorkspace(
  tenantId: string,
  workspaceId: string,
  opts?: ListProposalFollowUpQueueOptions
): Promise<GetProposalFollowUpQueueResult> {
  let items: ProposalFollowUpQueueItem[]
  try {
    items = await queueRepo.listProposalFollowUpQueueItemsForWorkspace(tenantId, workspaceId, opts)
  } catch {
    return { ok: false, error: 'load_failed' }
  }

  const limit  = opts?.limit  ?? 100
  const offset = opts?.offset ?? 0

  // Derive now and UTC day boundaries for summary bucketing.
  // overdueCount/upcomingCount use `now` to match queue filter semantics.
  // todayCount uses calendar-day boundaries as a helper count (may overlap with overdue/upcoming).
  const now      = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

  const overdueCount  = items.filter(i => new Date(i.follow_up_due_at) < now).length
  const todayCount    = items.filter(i => {
    const d = new Date(i.follow_up_due_at)
    return d >= dayStart && d < dayEnd
  }).length
  const upcomingCount = items.filter(i => new Date(i.follow_up_due_at) >= now).length

  const summary: ProposalFollowUpQueueSummary = {
    totalReturned: items.length,
    overdueCount,
    todayCount,
    upcomingCount,
  }

  const appliedFilters: ProposalFollowUpQueueFilters = {
    due:              opts?.due,
    followUpSequence: opts?.followUpSequence,
    proposalStatus:   opts?.proposalStatus,
    limit,
    offset,
  }

  return {
    ok:             true,
    items,
    summary,
    appliedFilters,
    generatedAt:    now.toISOString(),
  }
}
