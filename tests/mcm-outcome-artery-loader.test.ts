// mcm — The Learning Agent's event LOADER must accept MCM campaign events, not
// just Phase-3B-attributed ones. Regression for the gap where 138 MCM ET_SEND
// events were silently dropped at load (extractPhase3bMeta filter), leaving the
// learning loop blind despite events existing. TC-OAL-01..03

import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/supabase/service', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function builder(): any {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b, eq: () => b, in: () => b, gte: () => b, lte: () => b,
      order: () => Promise.resolve({ data: db.rows, error: null }),
    })
    return b
  }
  return { createSupabaseServiceClient: () => ({ from: () => builder() }) }
})

import { loadPhase3bActivityEvents } from '@/modules/messaging/repositories/learning-snapshot.repo'

const load = () => loadPhase3bActivityEvents({
  tenantId: 't-1',
  eventTypes: ['ET_SEND_SUCCEEDED', 'ET_EMAIL_DELIVERED', 'ET_EMAIL_CLICKED'],
  windowStart: '2026-06-01T00:00:00Z',
  windowEnd: '2026-07-31T00:00:00Z',
})

beforeEach(() => { db.rows = [] })

describe('TC-OAL-01: MCM events survive the loader', () => {
  it('accepts send-time (send_path) and webhook (source) MCM markers', async () => {
    db.rows = [
      { entity_id: 'si-1', event_type: 'ET_SEND_SUCCEEDED', occurred_at: '2026-07-01T00:00:00Z',
        metadata: { send_path: 'mcm_campaign', campaign_assignment_id: 'a-1' } },
      { entity_id: 'si-1', event_type: 'ET_EMAIL_DELIVERED', occurred_at: '2026-07-01T01:00:00Z',
        metadata: { source: 'mcm_campaign', campaign_assignment_id: 'a-1' } },
    ]
    const records = await load()
    expect(records).toHaveLength(2)
    expect(records.map(r => r.eventType).sort()).toEqual(['ET_EMAIL_DELIVERED', 'ET_SEND_SUCCEEDED'])
    expect(records.every(r => r.entityId === 'si-1')).toBe(true)
    expect(records.every(r => r.strategyId === null)).toBe(true)
  })
})

describe('TC-OAL-02: Phase-3B events unchanged (rich attribution preserved)', () => {
  it('keeps strategy/version attribution for phase_3b_send_bridge events', async () => {
    db.rows = [
      { entity_id: 'mv-1', event_type: 'ET_EMAIL_CLICKED', occurred_at: '2026-07-01T00:00:00Z',
        metadata: { source: 'phase_3b_send_bridge', strategy_id: 'st-1', version_label: 'V1', composite_score: 88 } },
    ]
    const records = await load()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ entityId: 'mv-1', strategyId: 'st-1', versionLabel: 'V1', compositeScore: 88 })
  })
})

describe('TC-OAL-03: unattributed events still dropped', () => {
  it('skips phase_3a_template / unmarked events', async () => {
    db.rows = [
      { entity_id: 'd-1', event_type: 'ET_SEND_SUCCEEDED', occurred_at: '2026-07-01T00:00:00Z',
        metadata: { send_path: 'phase_3a_template' } },
      { entity_id: 'd-2', event_type: 'ET_EMAIL_DELIVERED', occurred_at: '2026-07-01T00:00:00Z',
        metadata: {} },
    ]
    const records = await load()
    expect(records).toHaveLength(0)
  })
})
