// mcm-v2 — Proposal pipeline dashboard. Behavioral tests for the pipeline stats
// aggregation (pure + repo), zero-denominator guards, tenant/workspace scoping,
// and the follow-up queue-health integration.
// TC-PP-01..10

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  rows:    [] as Array<{ proposal_status: string; proposal_amount: number | null }>,
  eqCalls: [] as Array<[string, unknown]>,
  isCalls: [] as Array<[string, unknown]>,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {}
    Object.assign(builder, {
      from:   () => builder,
      select: () => builder,
      eq:     (c: string, v: unknown) => { h.eqCalls.push([c, v]); return builder },
      is:     (c: string, v: unknown) => { h.isCalls.push([c, v]); return builder },
      in:     () => builder,
      order:  () => builder,
      limit:  () => builder,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then:   (onF: any, onR?: any) => Promise.resolve({ data: h.rows, error: null }).then(onF, onR),
    })
    return builder
  },
}))

vi.mock('@/modules/proposals/repositories/proposal-follow-up-commitments.repo', () => ({
  listProposalFollowUpQueueItemsForWorkspace: vi.fn(),
}))

import {
  aggregateProposalPipeline,
  getProposalPipelineStats,
} from '@/modules/proposals/repositories/proposal-analytics.repo'
import { getProposalFollowUpQueueForWorkspace } from '@/modules/proposals/services/proposal-follow-up-queue.service'
import * as commitmentRepo from '@/modules/proposals/repositories/proposal-follow-up-commitments.repo'

// A representative mix: 2 draft, 3 sent, 2 viewed, 2 accepted, 1 rejected.
function seededMix() {
  return [
    { proposal_status: 'draft',    proposal_amount: 9999 },   // excluded from pipeline + rates
    { proposal_status: 'draft',    proposal_amount: null },
    { proposal_status: 'sent',     proposal_amount: 1000 },
    { proposal_status: 'sent',     proposal_amount: 2000 },
    { proposal_status: 'sent',     proposal_amount: null },   // null counts as 0
    { proposal_status: 'viewed',   proposal_amount: 3000 },
    { proposal_status: 'viewed',   proposal_amount: 500 },
    { proposal_status: 'accepted', proposal_amount: 4000 },
    { proposal_status: 'accepted', proposal_amount: 1000 },
    { proposal_status: 'rejected', proposal_amount: 7777 },   // not counted in won
  ]
}

// ---------------------------------------------------------------------------
// Pure aggregation
// ---------------------------------------------------------------------------

describe('TC-PP-01: aggregateProposalPipeline over a seeded mix', () => {
  it('computes status counts, open/won sums, and view/win rates', () => {
    const s = aggregateProposalPipeline(seededMix())

    expect(s.statusCounts).toEqual({ draft: 2, sent: 3, viewed: 2, accepted: 2, rejected: 1 })
    expect(s.totalProposals).toBe(10)
    expect(s.openCount).toBe(5) // 3 sent + 2 viewed

    // savings pipeline = open only (sent+viewed): 1000+2000+0 + 3000+500 = 6500
    expect(s.savingsPipeline).toBe(6500)
    // won = accepted only: 4000+1000 = 5000 (rejected 7777 excluded)
    expect(s.wonSavings).toBe(5000)

    // view denom = sent+viewed+accepted+rejected = 3+2+2+1 = 8; viewed-or-past = 2+2+1 = 5
    expect(s.viewRate).toBeCloseTo(5 / 8, 6)
    // win = accepted/(accepted+rejected) = 2/3
    expect(s.winRate).toBeCloseTo(2 / 3, 6)
  })
})

describe('TC-PP-02: zero-denominator guards (never NaN)', () => {
  it('empty input → all zeros', () => {
    const s = aggregateProposalPipeline([])
    expect(s).toMatchObject({ totalProposals: 0, openCount: 0, savingsPipeline: 0, wonSavings: 0, viewRate: 0, winRate: 0 })
    expect(Number.isNaN(s.viewRate)).toBe(false)
    expect(Number.isNaN(s.winRate)).toBe(false)
  })

  it('only drafts → viewRate 0, winRate 0', () => {
    const s = aggregateProposalPipeline([
      { proposal_status: 'draft', proposal_amount: 100 },
      { proposal_status: 'draft', proposal_amount: 200 },
    ])
    expect(s.viewRate).toBe(0)
    expect(s.winRate).toBe(0)
    expect(s.savingsPipeline).toBe(0)
  })

  it('sent but none decided → winRate 0, viewRate computed', () => {
    const s = aggregateProposalPipeline([
      { proposal_status: 'sent',   proposal_amount: 100 },
      { proposal_status: 'viewed', proposal_amount: 200 },
    ])
    expect(s.winRate).toBe(0)            // accepted+rejected = 0
    expect(s.viewRate).toBeCloseTo(1 / 2, 6) // viewed(1)/(sent+viewed=2)
  })
})

// ---------------------------------------------------------------------------
// Repo: getProposalPipelineStats
// ---------------------------------------------------------------------------

describe('TC-PP-03: getProposalPipelineStats', () => {
  beforeEach(() => { h.rows = []; h.eqCalls = []; h.isCalls = [] })

  it('aggregates the fetched rows and scopes to tenant + workspace + non-deleted', async () => {
    h.rows = seededMix()
    const s = await getProposalPipelineStats('tenant-1', 'ws-1')

    expect(s.totalProposals).toBe(10)
    expect(s.savingsPipeline).toBe(6500)
    expect(s.winRate).toBeCloseTo(2 / 3, 6)

    expect(h.eqCalls).toContainEqual(['tenant_id', 'tenant-1'])
    expect(h.eqCalls).toContainEqual(['workspace_id', 'ws-1'])
    expect(h.isCalls).toContainEqual(['deleted_at', null])
  })

  it('no rows → zeroed stats, no NaN', async () => {
    h.rows = []
    const s = await getProposalPipelineStats('tenant-1', 'ws-1')
    expect(s.totalProposals).toBe(0)
    expect(s.viewRate).toBe(0)
    expect(s.winRate).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Follow-up queue health integration
// ---------------------------------------------------------------------------

describe('TC-PP-04: follow-up queue health counts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns overdue / today / upcoming counts from the queue', async () => {
    const now = Date.now()
    vi.mocked(commitmentRepo.listProposalFollowUpQueueItemsForWorkspace).mockResolvedValue([
      { follow_up_due_at: new Date(now - 86_400_000).toISOString() },        // overdue
      { follow_up_due_at: new Date(now + 60_000).toISOString() },            // upcoming
      { follow_up_due_at: new Date(now + 7 * 86_400_000).toISOString() },    // upcoming
    ] as never)

    const res = await getProposalFollowUpQueueForWorkspace('tenant-1', 'ws-1', { due: 'all', limit: 500 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.summary.totalReturned).toBe(3)
    expect(res.summary.overdueCount).toBe(1)
    expect(res.summary.upcomingCount).toBe(2)
    expect(typeof res.summary.todayCount).toBe('number')
  })

  it('load failure → ok:false (page falls back to zeros)', async () => {
    vi.mocked(commitmentRepo.listProposalFollowUpQueueItemsForWorkspace).mockRejectedValue(new Error('boom'))
    const res = await getProposalFollowUpQueueForWorkspace('tenant-1', 'ws-1')
    expect(res.ok).toBe(false)
  })
})
