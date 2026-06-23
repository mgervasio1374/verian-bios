// mcm-v2 — Stop on human reply (P3.5). 'responded' mode extends the shared stop
// primitives. TC-IRS-01..03

import { describe, it, expect, vi, beforeEach } from 'vitest'

const cap = vi.hoisted(() => ({
  pending: [] as Array<{ id: string }>,
  updates: [] as Array<{ id: string; status: string; opts: Record<string, unknown> | undefined }>,
}))

vi.mock('@/modules/campaign-sequence/repositories/campaign-schedule-item.repo', () => ({
  listPendingScheduleItemsForAssignment: vi.fn(async () => cap.pending),
}))
vi.mock('@/modules/campaign-sequence/services/campaign-schedule-item.service', () => ({
  updateScheduleItemStatus: vi.fn(async (id: string, _t: string, _w: string, status: string, opts?: Record<string, unknown>) => {
    cap.updates.push({ id, status, opts })
    return { id, status }
  }),
}))

import {
  classifyStopTarget,
  stopReasonFor,
  stopAssignmentSchedule,
} from '@/modules/campaign-sequence/services/campaign-stop.service'

beforeEach(() => {
  cap.pending = []
  cap.updates = []
  vi.clearAllMocks()
})

describe('TC-IRS-01: pure helpers for responded mode', () => {
  it("classifyStopTarget('responded') === 'stopped_responded'", () => {
    expect(classifyStopTarget('responded')).toBe('stopped_responded')
  })
  it("stopReasonFor('responded') === 'response_detected'", () => {
    expect(stopReasonFor('responded')).toBe('response_detected')
  })
  it('existing modes are unchanged', () => {
    expect(classifyStopTarget('manual')).toBe('stopped_manual')
    expect(classifyStopTarget('bounced')).toBe('blocked')
    expect(classifyStopTarget('complained')).toBe('blocked')
  })
})

describe('TC-IRS-02: responded mode stops all pending items + writes response_detected_at', () => {
  it('transitions each pending item to stopped_responded', async () => {
    cap.pending = [{ id: 'i1' }, { id: 'i2' }]
    const res = await stopAssignmentSchedule('a1', 't1', 'ws1', 'responded', { respondedAt: '2026-06-22T10:00:00Z' })
    expect(res.stopped).toBe(2)
    expect(cap.updates).toHaveLength(2)
    for (const u of cap.updates) {
      expect(u.status).toBe('stopped_responded')
      expect(u.opts?.response_detected_at).toBe('2026-06-22T10:00:00Z')
      expect(u.opts?.stopped_reason).toBe('response_detected')
    }
  })

  it('defaults response_detected_at to now() when not supplied', async () => {
    cap.pending = [{ id: 'i1' }]
    await stopAssignmentSchedule('a1', 't1', 'ws1', 'responded')
    expect(cap.updates[0].opts?.response_detected_at).toBeTruthy()
  })
})

describe('TC-IRS-03: already-terminal items untouched (not in pending list)', () => {
  it('no pending items → nothing stopped', async () => {
    cap.pending = []
    const res = await stopAssignmentSchedule('a1', 't1', 'ws1', 'responded')
    expect(res.stopped).toBe(0)
    expect(cap.updates).toHaveLength(0)
  })
})
