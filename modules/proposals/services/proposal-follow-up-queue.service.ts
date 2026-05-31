import * as queueRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'
import type {
  ProposalFollowUpQueueItem,
  ListProposalFollowUpQueueOptions,
} from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'

export type { ProposalFollowUpQueueItem }

// Counts derived from the returned page of items only — not from global DB totals.
// All fields reflect rows included in this response, not the entire workspace dataset.
export interface ProposalFollowUpQueueSummary {
  totalReturned: number   // total items in this page/response
  overdueCount: number    // items with follow_up_due_at before today's UTC day start
  todayCount: number      // items with follow_up_due_at within today's UTC day
  upcomingCount: number   // items with follow_up_due_at after today's UTC day end
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

  // Derive day boundaries in UTC for summary bucketing.
  const now      = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

  const overdueCount  = items.filter(i => new Date(i.follow_up_due_at) < dayStart).length
  const todayCount    = items.filter(i => {
    const d = new Date(i.follow_up_due_at)
    return d >= dayStart && d < dayEnd
  }).length
  const upcomingCount = items.filter(i => new Date(i.follow_up_due_at) >= dayEnd).length

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
