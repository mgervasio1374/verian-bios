// Send velocity governor — the warmup ramp.
//
// The property that matters most is the one that is easy to get wrong: a stage
// must not advance on elapsed days alone. A week where the pool ran dry would
// otherwise "complete" a 20/day stage on 12 total sends and promote to 50/day,
// producing exactly the volume curve that gets a young domain throttled.
//
// TC-SVG-01..12

import { describe, it, expect } from 'vitest'
import {
  dailyAllowance,
  isBusinessDay,
  toDateKey,
  countQualifyingDays,
  qualifyingDayThreshold,
  evaluateStageAdvance,
  currentStage,
  validateStages,
  type VelocityPolicy,
} from '@/modules/messaging/services/send-velocity.service'
import { evaluateSendHealth } from '@/modules/messaging/services/send-circuit-breaker.service'

const policy = (over: Partial<VelocityPolicy> = {}): VelocityPolicy => ({
  tenantId:          't1',
  warmupEnabled:     true,
  stages:            [{ cap: 20, days: 7 }, { cap: 50, days: 7 }, { cap: 100 }],
  currentStageIndex: 0,
  stageStartedOn:    '2026-08-03',   // a Monday
  hardDailyCeiling:  100,
  businessDaysOnly:  true,
  minVolumeRatio:    0.8,
  holdReason:        null,
  ...over,
})

// 2026-08-03 is a Monday; 08-08 Saturday; 08-09 Sunday.
const d = (s: string) => new Date(`${s}T12:00:00.000Z`)

// ---- Allowance -------------------------------------------------------------

describe('TC-SVG-01: no policy means no cap, so the feature is truly opt-in', () => {
  it('reports uncapped', () => {
    const a = dailyAllowance(null, d('2026-08-03'))
    expect(a.capped).toBe(false)
  })
})

describe('TC-SVG-02: the hard ceiling is never exceeded', () => {
  it('a stage cap above the plan ceiling is clamped to the ceiling', () => {
    const a = dailyAllowance(policy({ stages: [{ cap: 300 }], hardDailyCeiling: 100 }), d('2026-08-03'))
    expect(a.capped && a.limit).toBe(100)
  })
  it('a stage cap below the ceiling wins', () => {
    const a = dailyAllowance(policy(), d('2026-08-03'))
    expect(a.capped && a.limit).toBe(20)
  })
  it('an index past the end of the stage list falls back to the ceiling, never uncapped', () => {
    const a = dailyAllowance(policy({ currentStageIndex: 99 }), d('2026-08-03'))
    expect(a.capped).toBe(true)
    expect(a.capped && a.limit).toBe(100)
    expect(a.capped && a.reason).toBe('no_stage')
  })
})

describe('TC-SVG-03: warmup off still respects the plan ceiling', () => {
  it('caps at the ceiling with the ramp inert', () => {
    const a = dailyAllowance(policy({ warmupEnabled: false }), d('2026-08-03'))
    expect(a.capped && a.limit).toBe(100)
    expect(a.capped && a.reason).toBe('ceiling_only')
  })
  it('and ignores the weekend rule, which is a warmup behavior', () => {
    const a = dailyAllowance(policy({ warmupEnabled: false }), d('2026-08-08'))
    expect(a.capped && a.limit).toBe(100)
  })
})

describe('TC-SVG-04: business-days-only', () => {
  it('Saturday and Sunday allow nothing', () => {
    expect(isBusinessDay(d('2026-08-08'))).toBe(false)
    expect(isBusinessDay(d('2026-08-09'))).toBe(false)
    const sat = dailyAllowance(policy(), d('2026-08-08'))
    expect(sat).toMatchObject({ capped: true, limit: 0, reason: 'non_business_day' })
  })
  it('weekdays are unaffected', () => {
    expect(isBusinessDay(d('2026-08-03'))).toBe(true)
    expect(isBusinessDay(d('2026-08-07'))).toBe(true)
  })
  it('opting out of business-days-only permits weekend sending', () => {
    const a = dailyAllowance(policy({ businessDaysOnly: false }), d('2026-08-08'))
    expect(a.capped && a.limit).toBe(20)
  })
})

// ---- Qualifying days -------------------------------------------------------

describe('TC-SVG-05: a day only counts if real volume went out', () => {
  it('threshold is 80% of the effective cap by default', () => {
    expect(qualifyingDayThreshold(policy(), { cap: 20, days: 7 })).toBe(16)
  })
  it('the threshold uses the CLAMPED cap, not the raw stage cap', () => {
    // Stage wants 300/day but the plan allows 100 — a day cannot be judged
    // against volume the plan never permitted.
    const p = policy({ stages: [{ cap: 300, days: 7 }], hardDailyCeiling: 100 })
    expect(qualifyingDayThreshold(p, { cap: 300, days: 7 })).toBe(80)
  })
  it('never demands zero, even at ratio 0', () => {
    expect(qualifyingDayThreshold(policy({ minVolumeRatio: 0 }), { cap: 20 })).toBe(1)
  })
})

describe('TC-SVG-06: the dry-week trap', () => {
  const p = policy()
  it('7 elapsed days at trivial volume yield no qualifying days', () => {
    // 2 sends a day for a working week: real days elapsed, warmup not performed.
    const counts = new Map([
      ['2026-08-03', 2], ['2026-08-04', 2], ['2026-08-05', 2],
      ['2026-08-06', 2], ['2026-08-07', 2],
    ])
    expect(countQualifyingDays(p, { cap: 20, days: 7 }, counts, d('2026-08-10'))).toBe(0)
  })
  it('the same week at full volume yields five', () => {
    const counts = new Map([
      ['2026-08-03', 20], ['2026-08-04', 20], ['2026-08-05', 20],
      ['2026-08-06', 20], ['2026-08-07', 20],
    ])
    expect(countQualifyingDays(p, { cap: 20, days: 7 }, counts, d('2026-08-10'))).toBe(5)
  })
  it('a day exactly at the 80% threshold counts', () => {
    const counts = new Map([['2026-08-03', 16]])
    expect(countQualifyingDays(p, { cap: 20, days: 7 }, counts, d('2026-08-04'))).toBe(1)
  })
  it('one short of the threshold does not', () => {
    const counts = new Map([['2026-08-03', 15]])
    expect(countQualifyingDays(p, { cap: 20, days: 7 }, counts, d('2026-08-04'))).toBe(0)
  })
})

describe('TC-SVG-07: weekends are skipped, not counted against the ramp', () => {
  it('a zero-send Saturday neither credits nor penalizes', () => {
    const counts = new Map([
      ['2026-08-06', 20], ['2026-08-07', 20],   // Thu, Fri
      // Sat + Sun absent entirely
      ['2026-08-10', 20],                        // Mon
    ])
    const p = policy({ stageStartedOn: '2026-08-06' })
    expect(countQualifyingDays(p, { cap: 20, days: 7 }, counts, d('2026-08-11'))).toBe(3)
  })
})

describe('TC-SVG-08: today is never counted, being incomplete', () => {
  it('excludes the in-progress day', () => {
    const counts = new Map([['2026-08-03', 20], ['2026-08-04', 20]])
    // On 08-04, only 08-03 is complete.
    expect(countQualifyingDays(policy(), { cap: 20, days: 7 }, counts, d('2026-08-04'))).toBe(1)
  })
})

describe('TC-SVG-09: an unset stage clock yields nothing', () => {
  it('returns zero rather than iterating from the epoch', () => {
    expect(countQualifyingDays(policy({ stageStartedOn: null }), { cap: 20 }, new Map(), d('2026-08-04'))).toBe(0)
  })
})

// ---- Advance decision ------------------------------------------------------

const healthy   = evaluateSendHealth({ total: 200, bounced: 1,  complained: 0 })
const bouncing  = evaluateSendHealth({ total: 200, bounced: 20, complained: 0 })
const tinySample = evaluateSendHealth({ total: 20, bounced: 1,  complained: 0 })

describe('TC-SVG-10: advancing requires days AND volume AND health', () => {
  it('advances when all three hold', () => {
    const r = evaluateStageAdvance({ policy: policy(), qualifyingDays: 7, health: healthy })
    expect(r.advance).toBe(true)
    expect(r.advance && r.toIndex).toBe(1)
  })

  it('holds when the qualifying days are short', () => {
    const r = evaluateStageAdvance({ policy: policy(), qualifyingDays: 6, health: healthy })
    expect(r.advance).toBe(false)
    expect(r.advance === false && r.reason).toBe('days_not_met')
    expect(r.advance === false && r.detail).toContain('6/7')
  })

  it('holds while bouncing, even with the days served', () => {
    const r = evaluateStageAdvance({ policy: policy(), qualifyingDays: 14, health: bouncing })
    expect(r.advance).toBe(false)
    expect(r.advance === false && r.reason).toBe('unhealthy')
  })

  it('a below-sample health reading does NOT freeze the ramp', () => {
    // Warmup runs under the breaker's 50-send minimum by design; requiring a
    // confident-healthy verdict would stall stage one forever.
    const r = evaluateStageAdvance({ policy: policy(), qualifyingDays: 7, health: tinySample })
    expect(r.advance).toBe(true)
  })

  it('does nothing while warmup is disabled', () => {
    const r = evaluateStageAdvance({
      policy: policy({ warmupEnabled: false }), qualifyingDays: 99, health: healthy,
    })
    expect(r.advance === false && r.reason).toBe('warmup_disabled')
  })
})

describe('TC-SVG-11: the final stage is terminal', () => {
  it('a stage without a days value never advances', () => {
    const r = evaluateStageAdvance({
      policy: policy({ currentStageIndex: 2 }), qualifyingDays: 999, health: healthy,
    })
    expect(r.advance === false && r.reason).toBe('terminal_stage')
  })
  it('cannot run off the end of the stage list', () => {
    const p = policy({ stages: [{ cap: 20, days: 1 }], currentStageIndex: 0 })
    const r = evaluateStageAdvance({ policy: p, qualifyingDays: 99, health: healthy })
    expect(r.advance === false && r.reason).toBe('terminal_stage')
  })
})

describe('TC-SVG-12: configuration is genuinely adjustable', () => {
  it('20/day for 14 days is expressible and respected', () => {
    const p = policy({ stages: [{ cap: 20, days: 14 }, { cap: 50 }] })
    expect(evaluateStageAdvance({ policy: p, qualifyingDays: 13, health: healthy }).advance).toBe(false)
    expect(evaluateStageAdvance({ policy: p, qualifyingDays: 14, health: healthy }).advance).toBe(true)
  })
  it('currentStage tracks the index', () => {
    expect(currentStage(policy({ currentStageIndex: 1 }))?.cap).toBe(50)
  })
  it('toDateKey is UTC and stable', () => {
    expect(toDateKey(new Date('2026-08-03T23:59:59.999Z'))).toBe('2026-08-03')
    expect(toDateKey(new Date('2026-08-04T00:00:00.000Z'))).toBe('2026-08-04')
  })
})

describe('TC-SVG-13: a malformed ramp is rejected, not normalized', () => {
  it('accepts the default ramp', () => {
    expect(validateStages([{ cap: 20, days: 7 }, { cap: 50, days: 7 }, { cap: 100 }])).toBeNull()
  })
  it('rejects an empty list', () => {
    expect(validateStages([])).toContain('at least one stage')
  })
  it('rejects a stage that steps down, which would look like warming up while slowing', () => {
    expect(validateStages([{ cap: 50, days: 7 }, { cap: 20 }])).toContain('must not step down')
  })
  it('rejects a zero or negative cap', () => {
    expect(validateStages([{ cap: 0 }])).toContain('1 or more')
    expect(validateStages([{ cap: -5 }])).toContain('1 or more')
  })
  it('rejects a zero-day stage, which would advance instantly', () => {
    expect(validateStages([{ cap: 20, days: 0 }, { cap: 50 }])).toContain('1 or more')
  })
  it('requires the last stage to be open-ended', () => {
    expect(validateStages([{ cap: 20, days: 7 }])).toContain('last stage must have no duration')
  })
  it('rejects an open-ended stage in the middle', () => {
    expect(validateStages([{ cap: 20 }, { cap: 50 }])).toContain('only the last stage')
  })
  it('rejects a fractional cap', () => {
    expect(validateStages([{ cap: 20.5, days: 7 }, { cap: 50 }])).toContain('whole number')
  })
  it('accepts an equal-cap step (a pause at the same volume)', () => {
    expect(validateStages([{ cap: 20, days: 7 }, { cap: 20, days: 7 }, { cap: 50 }])).toBeNull()
  })
})
