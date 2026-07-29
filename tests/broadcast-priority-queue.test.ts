// One-time broadcasts — priority yield, queueing, and the grace period.
//
// The scheduling model is a priority queue over one shared daily allowance:
// campaign assignments (priority 1) are dispatched first and a broadcast
// (priority 2) consumes only the leftover. Nothing has to "detect a pivot" —
// a campaign launched mid-blast simply eats the allowance first.
//
// The subtle rule is when the grace clock starts. It starts when campaigns
// FINISH, not when the broadcast was queued: otherwise a six-week campaign
// burns the whole grace period while it runs, and the blast resumes the morning
// after the campaign ends, which is precisely what the grace period exists to
// prevent.
//
// TC-BPQ-01..07

import { describe, it, expect } from 'vitest'
import {
  evaluateResume,
  broadcastAllowance,
  evaluateSendTiming,
  addDaysKey,
  toDateKey,
  BROADCAST_PRIORITY,
  CAMPAIGN_PRIORITY,
} from '@/modules/messaging/services/broadcast.scheduling'

const bc = (over: Partial<{ gracePeriodDays: number; resumeAfter: string | null }> = {}) => ({
  gracePeriodDays: 7,
  resumeAfter:     null as string | null,
  ...over,
})

describe('TC-BPQ-01: a broadcast always yields to campaigns', () => {
  it('ships at a lower priority than campaign assignments', () => {
    expect(BROADCAST_PRIORITY).toBe(2)
    expect(CAMPAIGN_PRIORITY).toBe(1)
    expect(CAMPAIGN_PRIORITY).toBeLessThan(BROADCAST_PRIORITY)
  })

  it('takes only what campaigns left behind', () => {
    expect(broadcastAllowance({ remainingAfterCampaigns: 12, broadcastStatus: 'active' })).toBe(12)
  })

  it('gets nothing when campaigns consumed the whole day', () => {
    expect(broadcastAllowance({ remainingAfterCampaigns: 0, broadcastStatus: 'active' })).toBe(0)
  })

  it('never goes negative if campaigns overran', () => {
    expect(broadcastAllowance({ remainingAfterCampaigns: -5, broadcastStatus: 'active' })).toBe(0)
  })

  it('sends nothing unless it is active', () => {
    for (const status of ['draft', 'queued', 'completed', 'terminated'] as const) {
      expect(broadcastAllowance({ remainingAfterCampaigns: 50, broadcastStatus: status })).toBe(0)
    }
  })
})

describe('TC-BPQ-02: a queued broadcast waits while campaigns run', () => {
  it('does not resume and does not start the grace clock', () => {
    const d = evaluateResume({ broadcast: bc(), activeCampaignCount: 3, today: '2026-09-15' })
    expect(d.action).toBe('wait')
    expect(d.action === 'wait' && d.reason).toBe('campaigns_active')
  })
})

describe('TC-BPQ-03: the grace clock starts when campaigns finish', () => {
  it('sets resume_after to today plus the grace period', () => {
    const d = evaluateResume({ broadcast: bc(), activeCampaignCount: 0, today: '2026-10-20' })
    expect(d.action).toBe('start_grace')
    expect(d.action === 'start_grace' && d.resumeAfter).toBe('2026-10-27')
  })

  it('respects a custom grace period', () => {
    const d = evaluateResume({
      broadcast: bc({ gracePeriodDays: 14 }), activeCampaignCount: 0, today: '2026-10-20',
    })
    expect(d.action === 'start_grace' && d.resumeAfter).toBe('2026-11-03')
  })

  it('a zero grace period resumes the next evaluation', () => {
    const d = evaluateResume({
      broadcast: bc({ gracePeriodDays: 0 }), activeCampaignCount: 0, today: '2026-10-20',
    })
    expect(d.action === 'start_grace' && d.resumeAfter).toBe('2026-10-20')
  })
})

describe('TC-BPQ-04: the broadcast waits out the grace period', () => {
  it('holds while inside the window', () => {
    const d = evaluateResume({
      broadcast: bc({ resumeAfter: '2026-10-27' }), activeCampaignCount: 0, today: '2026-10-26',
    })
    expect(d.action).toBe('wait')
    expect(d.action === 'wait' && d.reason).toBe('grace_period')
    expect(d.action === 'wait' && d.until).toBe('2026-10-27')
  })

  it('resumes on the day itself', () => {
    const d = evaluateResume({
      broadcast: bc({ resumeAfter: '2026-10-27' }), activeCampaignCount: 0, today: '2026-10-27',
    })
    expect(d.action).toBe('resume')
  })

  it('resumes after the day', () => {
    const d = evaluateResume({
      broadcast: bc({ resumeAfter: '2026-10-27' }), activeCampaignCount: 0, today: '2026-11-02',
    })
    expect(d.action).toBe('resume')
  })
})

describe('TC-BPQ-05: a new campaign during grace voids the accrued grace', () => {
  it('reverts to waiting on campaigns rather than resuming mid-campaign', () => {
    // Fall expo ended, grace started, then a second campaign launched. The blast
    // must not land the day after THAT one either.
    const d = evaluateResume({
      broadcast: bc({ resumeAfter: '2026-10-27' }), activeCampaignCount: 1, today: '2026-10-26',
    })
    expect(d.action).toBe('wait')
    expect(d.action === 'wait' && d.reason).toBe('campaigns_active')
  })
})

describe('TC-BPQ-06: the user scenario end to end', () => {
  it('blast to the whole book, fall expo interrupts, blast resumes a week later', () => {
    // September: expo campaign is live, blast is queued.
    let d = evaluateResume({ broadcast: bc(), activeCampaignCount: 40, today: '2026-09-10' })
    expect(d.action === 'wait' && d.reason).toBe('campaigns_active')

    // Mid-October: expo campaign completed. Grace begins now, not in September.
    d = evaluateResume({ broadcast: bc(), activeCampaignCount: 0, today: '2026-10-15' })
    expect(d.action === 'start_grace' && d.resumeAfter).toBe('2026-10-22')

    // The next day, still inside the window: no send.
    d = evaluateResume({
      broadcast: bc({ resumeAfter: '2026-10-22' }), activeCampaignCount: 0, today: '2026-10-16',
    })
    expect(d.action).toBe('wait')

    // A week after the campaign finished: back on.
    d = evaluateResume({
      broadcast: bc({ resumeAfter: '2026-10-22' }), activeCampaignCount: 0, today: '2026-10-22',
    })
    expect(d.action).toBe('resume')
  })
})

// ---- Send schedule ---------------------------------------------------------

const sched = (over: Partial<Parameters<typeof evaluateSendTiming>[0]> = {}) => ({
  startsAt:        null as string | null,
  sendWindowStart: '09:00',
  sendWindowEnd:   '17:00',
  timeZone:        'America/New_York',
  ...over,
})

// 2026-08-03 is a Monday. EDT is UTC-4, so 09:00 ET = 13:00 UTC, 17:00 ET = 21:00 UTC.
const at = (utc: string) => new Date(utc)

describe('TC-BPQ-08: a broadcast does not send before its start time', () => {
  it('holds before the start instant', () => {
    const v = evaluateSendTiming(sched({ startsAt: '2026-08-04T14:00:00.000Z' }), at('2026-08-03T14:00:00.000Z'))
    expect(v.canSend).toBe(false)
    expect(!v.canSend && v.reason).toBe('before_start')
  })
  it('sends once the start instant has passed, inside the window', () => {
    const v = evaluateSendTiming(sched({ startsAt: '2026-08-03T14:00:00.000Z' }), at('2026-08-03T15:00:00.000Z'))
    expect(v.canSend).toBe(true)
  })
  it('a start time does not override the window', () => {
    // Start passed, but 03:00 UTC is 11pm ET the previous evening.
    const v = evaluateSendTiming(sched({ startsAt: '2026-08-03T14:00:00.000Z' }), at('2026-08-04T03:00:00.000Z'))
    expect(v.canSend).toBe(false)
    expect(!v.canSend && v.reason).toBe('outside_window')
  })
})

describe('TC-BPQ-09: the daily window holds sending to business hours', () => {
  it('11pm Eastern does not send — the reported complaint', () => {
    // 2026-08-04T03:00Z = 2026-08-03 23:00 ET
    expect(evaluateSendTiming(sched(), at('2026-08-04T03:00:00.000Z')).canSend).toBe(false)
  })
  it('the UTC day rollover does not open a sending window', () => {
    // The governor's allowance resets at 00:00 UTC = 20:00 ET. Without the
    // window the whole day's quota would fire that evening.
    expect(evaluateSendTiming(sched(), at('2026-08-04T00:05:00.000Z')).canSend).toBe(false)
  })
  it('10am Eastern sends', () => {
    expect(evaluateSendTiming(sched(), at('2026-08-03T14:00:00.000Z')).canSend).toBe(true)
  })
  it('is inclusive of the opening minute', () => {
    expect(evaluateSendTiming(sched(), at('2026-08-03T13:00:00.000Z')).canSend).toBe(true)
  })
  it('is exclusive of the closing minute', () => {
    expect(evaluateSendTiming(sched(), at('2026-08-03T21:00:00.000Z')).canSend).toBe(false)
    expect(evaluateSendTiming(sched(), at('2026-08-03T20:59:00.000Z')).canSend).toBe(true)
  })
  it('honours a custom window', () => {
    const s = sched({ sendWindowStart: '10:00', sendWindowEnd: '12:00' })
    expect(evaluateSendTiming(s, at('2026-08-03T13:30:00.000Z')).canSend).toBe(false)  // 09:30 ET
    expect(evaluateSendTiming(s, at('2026-08-03T15:00:00.000Z')).canSend).toBe(true)   // 11:00 ET
  })
})

describe('TC-BPQ-10: the window is wall-clock, so DST does not shift it', () => {
  it('9am local sends in both EDT and EST', () => {
    // 2026-01-05 is EST (UTC-5): 09:00 ET = 14:00 UTC
    expect(evaluateSendTiming(sched(), at('2026-01-05T14:00:00.000Z')).canSend).toBe(true)
    expect(evaluateSendTiming(sched(), at('2026-01-05T13:00:00.000Z')).canSend).toBe(false) // 08:00 ET
    // 2026-08-03 is EDT (UTC-4): 09:00 ET = 13:00 UTC
    expect(evaluateSendTiming(sched(), at('2026-08-03T13:00:00.000Z')).canSend).toBe(true)
  })
  it('respects a different zone', () => {
    const s = sched({ timeZone: 'America/Los_Angeles' })
    // 2026-08-03T17:00Z = 10:00 PDT
    expect(evaluateSendTiming(s, at('2026-08-03T17:00:00.000Z')).canSend).toBe(true)
    // 2026-08-03T14:00Z = 07:00 PDT
    expect(evaluateSendTiming(s, at('2026-08-03T14:00:00.000Z')).canSend).toBe(false)
  })
})

describe('TC-BPQ-11: a malformed window fails closed', () => {
  it('refuses rather than defaulting to all day', () => {
    for (const bad of [{ sendWindowStart: '' }, { sendWindowEnd: '25:00' }, { sendWindowStart: 'noon' }]) {
      const v = evaluateSendTiming(sched(bad), at('2026-08-03T14:00:00.000Z'))
      expect(v.canSend).toBe(false)
      expect(!v.canSend && v.reason).toBe('bad_window')
    }
  })
  it('refuses an inverted window', () => {
    const v = evaluateSendTiming(sched({ sendWindowStart: '17:00', sendWindowEnd: '09:00' }), at('2026-08-03T14:00:00.000Z'))
    expect(!v.canSend && v.reason).toBe('bad_window')
  })
  it('ignores an unparseable start instant rather than blocking forever', () => {
    const v = evaluateSendTiming(sched({ startsAt: 'not-a-date' }), at('2026-08-03T14:00:00.000Z'))
    expect(v.canSend).toBe(true)
  })
})

describe('TC-BPQ-07: date helpers are UTC and cross boundaries correctly', () => {
  it('adds days across a month end', () => {
    expect(addDaysKey('2026-10-28', 7)).toBe('2026-11-04')
  })
  it('adds days across a year end', () => {
    expect(addDaysKey('2026-12-30', 7)).toBe('2027-01-06')
  })
  it('handles a leap day', () => {
    expect(addDaysKey('2028-02-26', 7)).toBe('2028-03-04')
  })
  it('toDateKey is UTC', () => {
    expect(toDateKey(new Date('2026-10-22T23:59:59.999Z'))).toBe('2026-10-22')
  })
})
