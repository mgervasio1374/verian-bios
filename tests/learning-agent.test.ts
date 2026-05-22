// ============================================================
// Phase 3B — Learning Agent Tests
// Covers: confidence helpers, signal calculation (pure functions),
// audit builders, guardrail assertions, fixture-based cases.
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  classifyConfidence,
  calculateRate,
  isEngagementSignal,
  getThresholds,
} from '@/modules/messaging/learning-agent/learning-agent.confidence'

import {
  buildVersionEventMap,
  calculateAllSignals,
} from '@/modules/messaging/learning-agent/learning-agent.signals'

import {
  buildSignalsComputedPayload,
  buildSignalsFailedPayload,
} from '@/modules/messaging/learning-agent/learning-agent.audit'

import {
  LA_SIGNAL_NAMES,
  LA_DIMENSIONS,
  LA_CONFIDENCE,
  LA_ACTION_TYPES,
  STANDARD_THRESHOLDS,
  ENGAGEMENT_THRESHOLDS,
} from '@/modules/messaging/learning-agent/learning-agent.types'

import type {
  Phase3bEventRecord,
  VersionDimensionContext,
  LearningSignal,
} from '@/modules/messaging/learning-agent/learning-agent.types'

// ---- Test data helpers ----

function makeEvent(
  entityId: string,
  eventType: string,
  overrides: Partial<Phase3bEventRecord> = {}
): Phase3bEventRecord {
  return {
    entityId,
    eventType,
    strategyId:      'str-001',
    qualityReviewId: 'qr-001',
    versionLabel:    'A',
    compositeScore:  75,
    occurredAt:      '2026-05-01T10:00:00Z',
    ...overrides,
  }
}

function makeCtx(versionId: string, overrides: Partial<VersionDimensionContext> = {}): VersionDimensionContext {
  return {
    versionId,
    strategyAngle: 'urgency',
    messageType:   'follow_up',
    scoreBand:     'strong',
    isRecommended: true,
    ...overrides,
  }
}

// Build N distinct versions each with succeeded + delivered events
function makeSucceededDelivered(count: number, offset = 0): Phase3bEventRecord[] {
  const events: Phase3bEventRecord[] = []
  for (let i = 0; i < count; i++) {
    const id = `ver-${String(i + offset + 1).padStart(3, '0')}`
    events.push(makeEvent(id, 'ET_SEND_SUCCEEDED'))
    events.push(makeEvent(id, 'ET_EMAIL_DELIVERED'))
  }
  return events
}

// Build N distinct versions each with a single eventType
function makeEvents(count: number, eventType: string, offset = 0, overrides: Partial<Phase3bEventRecord> = {}): Phase3bEventRecord[] {
  const events: Phase3bEventRecord[] = []
  for (let i = 0; i < count; i++) {
    const id = `ver-${String(i + offset + 1).padStart(3, '0')}`
    events.push(makeEvent(id, eventType, overrides))
  }
  return events
}

function ctxMap(ids: string[], override: Partial<VersionDimensionContext> = {}): Map<string, VersionDimensionContext> {
  const map = new Map<string, VersionDimensionContext>()
  for (const id of ids) map.set(id, makeCtx(id, override))
  return map
}

function findSignal(
  signals: LearningSignal[],
  signalName: string,
  dimension: string,
  dimensionValue: string
): LearningSignal | undefined {
  return signals.find(
    s => s.signalName === signalName && s.dimension === dimension && s.dimensionValue === dimensionValue
  )
}

// ============================================================
// classifyConfidence — standard thresholds
// ============================================================

describe('classifyConfidence — standard thresholds', () => {
  it('returns insufficient for N < 5', () => {
    expect(classifyConfidence(0,  STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.INSUFFICIENT)
    expect(classifyConfidence(4,  STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.INSUFFICIENT)
  })

  it('returns low for N 5–19', () => {
    expect(classifyConfidence(5,  STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.LOW)
    expect(classifyConfidence(19, STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.LOW)
  })

  it('returns moderate for N 20–49', () => {
    expect(classifyConfidence(20, STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.MODERATE)
    expect(classifyConfidence(49, STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.MODERATE)
  })

  it('returns high for N >= 50', () => {
    expect(classifyConfidence(50,  STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.HIGH)
    expect(classifyConfidence(200, STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.HIGH)
  })
})

// ============================================================
// classifyConfidence — engagement thresholds
// ============================================================

describe('classifyConfidence — engagement thresholds', () => {
  it('returns insufficient for N < 10', () => {
    expect(classifyConfidence(0,  ENGAGEMENT_THRESHOLDS)).toBe(LA_CONFIDENCE.INSUFFICIENT)
    expect(classifyConfidence(9,  ENGAGEMENT_THRESHOLDS)).toBe(LA_CONFIDENCE.INSUFFICIENT)
  })

  it('returns low for N 10–29', () => {
    expect(classifyConfidence(10, ENGAGEMENT_THRESHOLDS)).toBe(LA_CONFIDENCE.LOW)
    expect(classifyConfidence(29, ENGAGEMENT_THRESHOLDS)).toBe(LA_CONFIDENCE.LOW)
  })

  it('returns moderate for N 30–99', () => {
    expect(classifyConfidence(30,  ENGAGEMENT_THRESHOLDS)).toBe(LA_CONFIDENCE.MODERATE)
    expect(classifyConfidence(99,  ENGAGEMENT_THRESHOLDS)).toBe(LA_CONFIDENCE.MODERATE)
  })

  it('returns high for N >= 100', () => {
    expect(classifyConfidence(100, ENGAGEMENT_THRESHOLDS)).toBe(LA_CONFIDENCE.HIGH)
    expect(classifyConfidence(500, ENGAGEMENT_THRESHOLDS)).toBe(LA_CONFIDENCE.HIGH)
  })
})

// ============================================================
// calculateRate
// ============================================================

describe('calculateRate', () => {
  it('returns null when denominator = 0', () => {
    expect(calculateRate(0, 0)).toBeNull()
    expect(calculateRate(5, 0)).toBeNull()
  })

  it('returns correct arithmetic for non-zero denominator', () => {
    expect(calculateRate(4, 5)).toBeCloseTo(0.8)
    expect(calculateRate(36, 40)).toBeCloseTo(0.9)
    expect(calculateRate(0, 10)).toBe(0)
  })
})

// ============================================================
// isEngagementSignal
// ============================================================

describe('isEngagementSignal', () => {
  it('returns true only for open_rate and click_rate', () => {
    expect(isEngagementSignal(LA_SIGNAL_NAMES.OPEN_RATE)).toBe(true)
    expect(isEngagementSignal(LA_SIGNAL_NAMES.CLICK_RATE)).toBe(true)
    expect(isEngagementSignal(LA_SIGNAL_NAMES.DELIVERY_RATE)).toBe(false)
    expect(isEngagementSignal(LA_SIGNAL_NAMES.BOUNCE_RATE)).toBe(false)
    expect(isEngagementSignal(LA_SIGNAL_NAMES.SEND_SUCCESS_RATE)).toBe(false)
    expect(isEngagementSignal(LA_SIGNAL_NAMES.APPROVAL_TO_SEND_RATE)).toBe(false)
  })
})

// ============================================================
// getThresholds
// ============================================================

describe('getThresholds', () => {
  it('returns engagement thresholds for open_rate and click_rate', () => {
    expect(getThresholds(LA_SIGNAL_NAMES.OPEN_RATE)).toBe(ENGAGEMENT_THRESHOLDS)
    expect(getThresholds(LA_SIGNAL_NAMES.CLICK_RATE)).toBe(ENGAGEMENT_THRESHOLDS)
  })

  it('returns standard thresholds for all other signals', () => {
    expect(getThresholds(LA_SIGNAL_NAMES.DELIVERY_RATE)).toBe(STANDARD_THRESHOLDS)
    expect(getThresholds(LA_SIGNAL_NAMES.BOUNCE_RATE)).toBe(STANDARD_THRESHOLDS)
  })
})

// ============================================================
// buildVersionEventMap
// ============================================================

describe('buildVersionEventMap', () => {
  it('maps version IDs to their event type sets', () => {
    const events = [
      makeEvent('ver-001', 'ET_SEND_SUCCEEDED'),
      makeEvent('ver-001', 'ET_EMAIL_DELIVERED'),
      makeEvent('ver-002', 'ET_SEND_SUCCEEDED'),
    ]
    const map = buildVersionEventMap(events)
    expect(map.get('ver-001')?.has('ET_SEND_SUCCEEDED')).toBe(true)
    expect(map.get('ver-001')?.has('ET_EMAIL_DELIVERED')).toBe(true)
    expect(map.get('ver-002')?.has('ET_SEND_SUCCEEDED')).toBe(true)
    expect(map.get('ver-002')?.has('ET_EMAIL_DELIVERED')).toBe(false)
  })

  it('deduplicates multiple events of the same type for a version', () => {
    const events = [
      makeEvent('ver-001', 'ET_EMAIL_OPENED'),
      makeEvent('ver-001', 'ET_EMAIL_OPENED'),
      makeEvent('ver-001', 'ET_EMAIL_OPENED'),
    ]
    const map = buildVersionEventMap(events)
    expect(map.get('ver-001')?.has('ET_EMAIL_OPENED')).toBe(true)
    expect(map.size).toBe(1)
  })

  it('handles events with missing entityId gracefully', () => {
    const events = [
      { ...makeEvent('', 'ET_SEND_SUCCEEDED') },  // empty entityId skipped
      makeEvent('ver-001', 'ET_SEND_SUCCEEDED'),
    ]
    const map = buildVersionEventMap(events)
    expect(map.size).toBe(1)
    expect(map.has('ver-001')).toBe(true)
  })
})

// ============================================================
// calculateAllSignals — empty input
// ============================================================

describe('calculateAllSignals — empty input (TC-LA-001)', () => {
  it('returns empty array when no events provided', () => {
    const signals = calculateAllSignals({
      events:              [],
      dimensionContextMap: new Map(),
      approvedVersionIds:  new Set(),
    })
    expect(signals).toHaveLength(0)
  })
})

// ============================================================
// calculateAllSignals — single send insufficient (TC-LA-002)
// ============================================================

describe('calculateAllSignals — single send (TC-LA-002)', () => {
  it('delivery_rate is insufficient when N=1', () => {
    const events = [
      makeEvent('ver-001', 'ET_SEND_SUCCEEDED'),
      makeEvent('ver-001', 'ET_EMAIL_DELIVERED'),
    ]
    const dimMap = ctxMap(['ver-001'])
    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })
    const dr = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(dr).toBeDefined()
    expect(dr!.confidence).toBe(LA_CONFIDENCE.INSUFFICIENT)
    expect(dr!.rate).toBeNull()
    expect(dr!.denominator).toBe(1)
  })
})

// ============================================================
// calculateAllSignals — exactly 5 sends low confidence (TC-LA-003)
// ============================================================

describe('calculateAllSignals — exactly 5 sends (TC-LA-003)', () => {
  it('delivery_rate has low confidence, rate=0.8 when 4/5 delivered', () => {
    const succeeded = makeEvents(5, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(4, 'ET_EMAIL_DELIVERED')
    const events = [...succeeded, ...delivered]
    const dimMap = ctxMap(succeeded.map(e => e.entityId))
    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })
    const dr = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(dr?.confidence).toBe(LA_CONFIDENCE.LOW)
    expect(dr?.rate).toBeCloseTo(0.8)
    expect(dr?.denominator).toBe(5)
    expect(dr?.numerator).toBe(4)
  })
})

// ============================================================
// calculateAllSignals — delivery rate + bounce rate (TC-LA-004)
// ============================================================

describe('calculateAllSignals — delivery and bounce rate (TC-LA-004)', () => {
  it('calculates delivery_rate=0.9, bounce_rate=1/40 with moderate confidence', () => {
    const succeeded = makeEvents(40, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(36, 'ET_EMAIL_DELIVERED')
    const bounced   = makeEvents(1,  'ET_EMAIL_BOUNCED',  36)   // ver-037 bounced instead of delivered
    const events    = [...succeeded, ...delivered, ...bounced]
    const dimMap    = ctxMap(succeeded.map(e => e.entityId))
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const dr = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(dr?.rate).toBeCloseTo(0.9)
    expect(dr?.denominator).toBe(40)
    expect(dr?.confidence).toBe(LA_CONFIDENCE.MODERATE)

    const br = findSignal(signals, LA_SIGNAL_NAMES.BOUNCE_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(br?.denominator).toBe(40)
    expect(br?.numerator).toBe(1)
  })
})

// ============================================================
// calculateAllSignals — send failure rate (TC-LA-007)
// ============================================================

describe('calculateAllSignals — send failure rate (TC-LA-007)', () => {
  it('send_success_rate and send_failure_rate use ET_SEND_INITIATED as denominator', () => {
    const initiated  = makeEvents(30, 'ET_SEND_INITIATED')
    const succeeded  = makeEvents(28, 'ET_SEND_SUCCEEDED')
    const failed     = makeEvents(2,  'ET_SEND_FAILED', 28)
    const events     = [...initiated, ...succeeded, ...failed]
    const allIds     = [...initiated.map(e => e.entityId)]
    const dimMap     = ctxMap(allIds)
    const signals    = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const ssr = findSignal(signals, LA_SIGNAL_NAMES.SEND_SUCCESS_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(ssr?.denominator).toBe(30)
    expect(ssr?.numerator).toBe(28)
    expect(ssr?.confidence).toBe(LA_CONFIDENCE.MODERATE)

    const sfr = findSignal(signals, LA_SIGNAL_NAMES.SEND_FAILURE_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(sfr?.denominator).toBe(30)
    expect(sfr?.numerator).toBe(2)
  })
})

// ============================================================
// calculateAllSignals — open rate: zero events → rate=0.0 (TC-LA-008)
// ============================================================

describe('calculateAllSignals — open rate zero events (TC-LA-008)', () => {
  it('open_rate = 0.0 with note when delivered >= 10 but zero opened', () => {
    const succeeded = makeEvents(20, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(20, 'ET_EMAIL_DELIVERED')
    const events    = [...succeeded, ...delivered]
    const dimMap    = ctxMap(succeeded.map(e => e.entityId))
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const or = findSignal(signals, LA_SIGNAL_NAMES.OPEN_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(or?.rate).toBe(0.0)
    expect(or?.numerator).toBe(0)
    expect(or?.denominator).toBe(20)
    expect(or?.notes).toContain('Zero open events')
  })
})

// ============================================================
// calculateAllSignals — open rate correct when events exist (TC-LA-009)
// ============================================================

describe('calculateAllSignals — open rate with events (TC-LA-009)', () => {
  it('open_rate = 12/30 = 0.40 with moderate confidence', () => {
    const succeeded = makeEvents(30, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(30, 'ET_EMAIL_DELIVERED')
    const opened    = makeEvents(12, 'ET_EMAIL_OPENED')
    const events    = [...succeeded, ...delivered, ...opened]
    const dimMap    = ctxMap(succeeded.map(e => e.entityId))
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const or = findSignal(signals, LA_SIGNAL_NAMES.OPEN_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(or?.rate).toBeCloseTo(0.4)
    expect(or?.numerator).toBe(12)
    expect(or?.denominator).toBe(30)
    expect(or?.confidence).toBe(LA_CONFIDENCE.MODERATE)
  })
})

// ============================================================
// calculateAllSignals — deduplication of multiple opens (TC-LA-010)
// ============================================================

describe('calculateAllSignals — multiple opens deduplicated (TC-LA-010)', () => {
  it('open_rate numerator counts a version once even with 5 open events', () => {
    // 10 versions delivered; ver-001 has 5 ET_EMAIL_OPENED events
    const succeeded = makeEvents(10, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(10, 'ET_EMAIL_DELIVERED')
    const opened5   = Array.from({ length: 5 }, () => makeEvent('ver-001', 'ET_EMAIL_OPENED'))
    const events    = [...succeeded, ...delivered, ...opened5]
    const dimMap    = ctxMap(succeeded.map(e => e.entityId))
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const or = findSignal(signals, LA_SIGNAL_NAMES.OPEN_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(or?.numerator).toBe(1)        // deduplicated — ver-001 counted once
    expect(or?.denominator).toBe(10)
    expect(or?.rate).toBeCloseTo(0.1)
  })
})

// ============================================================
// calculateAllSignals — click rate zero events (TC-LA-011)
// ============================================================

describe('calculateAllSignals — click rate zero events (TC-LA-011)', () => {
  it('click_rate = 0.0 with note when delivered >= 10 but zero clicked', () => {
    const succeeded = makeEvents(15, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(15, 'ET_EMAIL_DELIVERED')
    const events    = [...succeeded, ...delivered]
    const dimMap    = ctxMap(succeeded.map(e => e.entityId))
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const cr = findSignal(signals, LA_SIGNAL_NAMES.CLICK_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(cr?.rate).toBe(0.0)
    expect(cr?.notes).toContain('Zero click events')
  })
})

// ============================================================
// calculateAllSignals — unknown outcome rate (TC-LA-017)
// ============================================================

describe('calculateAllSignals — unknown outcome rate (TC-LA-017)', () => {
  it('unknown_outcome_rate = 1.0 when no follow-on webhook events exist', () => {
    const succeeded = makeEvents(10, 'ET_SEND_SUCCEEDED')
    const dimMap    = ctxMap(succeeded.map(e => e.entityId))
    const signals   = calculateAllSignals({ events: succeeded, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const uo = findSignal(signals, LA_SIGNAL_NAMES.UNKNOWN_OUTCOME_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(uo?.rate).toBeCloseTo(1.0)
    expect(uo?.numerator).toBe(10)
    expect(uo?.denominator).toBe(10)
  })

  it('unknown_outcome_rate = 0.0 when all versions have a known outcome', () => {
    const succeeded = makeEvents(10, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(10, 'ET_EMAIL_DELIVERED')
    const events    = [...succeeded, ...delivered]
    const dimMap    = ctxMap(succeeded.map(e => e.entityId))
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const uo = findSignal(signals, LA_SIGNAL_NAMES.UNKNOWN_OUTCOME_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(uo?.numerator).toBe(0)
    expect(uo?.rate).toBe(0)
  })
})

// ============================================================
// calculateAllSignals — score_band grouping (TC-LA-014)
// ============================================================

describe('calculateAllSignals — score_band grouping (TC-LA-014)', () => {
  it('produces separate delivery_rate rows for strong and usable score bands', () => {
    // 20 strong versions, 19 delivered; 10 usable versions, 7 delivered
    const strongSucceeded = makeEvents(20, 'ET_SEND_SUCCEEDED', 0)
    const strongDelivered = makeEvents(19, 'ET_EMAIL_DELIVERED', 0)
    const usableSucceeded = makeEvents(10, 'ET_SEND_SUCCEEDED', 20)
    const usableDelivered = makeEvents(7,  'ET_EMAIL_DELIVERED', 20)
    const events = [...strongSucceeded, ...strongDelivered, ...usableSucceeded, ...usableDelivered]

    const dimMap = new Map<string, VersionDimensionContext>()
    for (const e of strongSucceeded) dimMap.set(e.entityId, makeCtx(e.entityId, { scoreBand: 'strong', isRecommended: true }))
    for (const e of usableSucceeded) dimMap.set(e.entityId, makeCtx(e.entityId, { scoreBand: 'usable', isRecommended: false }))

    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const strong = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.SCORE_BAND, 'strong')
    expect(strong?.rate).toBeCloseTo(0.95)
    expect(strong?.denominator).toBe(20)
    expect(strong?.confidence).toBe(LA_CONFIDENCE.MODERATE)

    const usable = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.SCORE_BAND, 'usable')
    expect(usable?.rate).toBeCloseTo(0.7)
    expect(usable?.denominator).toBe(10)
    expect(usable?.confidence).toBe(LA_CONFIDENCE.LOW)  // N=10 → low (threshold: N<20=low)
  })
})

// ============================================================
// calculateAllSignals — strategy_angle grouping (TC-LA-015)
// ============================================================

describe('calculateAllSignals — strategy_angle grouping (TC-LA-015)', () => {
  it('produces separate delivery_rate rows per strategy angle', () => {
    const urgency     = makeEvents(20, 'ET_SEND_SUCCEEDED', 0)
    const urgDel      = makeEvents(19, 'ET_EMAIL_DELIVERED', 0)
    const social      = makeEvents(15, 'ET_SEND_SUCCEEDED', 20)
    const socDel      = makeEvents(11, 'ET_EMAIL_DELIVERED', 20)
    const events      = [...urgency, ...urgDel, ...social, ...socDel]

    const dimMap = new Map<string, VersionDimensionContext>()
    for (const e of urgency) dimMap.set(e.entityId, makeCtx(e.entityId, { strategyAngle: 'urgency' }))
    for (const e of social)  dimMap.set(e.entityId, makeCtx(e.entityId, { strategyAngle: 'social_proof' }))

    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const u = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.STRATEGY_ANGLE, 'urgency')
    expect(u?.rate).toBeCloseTo(0.95)
    expect(u?.denominator).toBe(20)

    const s = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.STRATEGY_ANGLE, 'social_proof')
    expect(s?.rate).toBeCloseTo(11/15)
    expect(s?.denominator).toBe(15)
  })
})

// ============================================================
// calculateAllSignals — approval_to_send_rate (TC-LA-016)
// ============================================================

describe('calculateAllSignals — approval_to_send_rate (TC-LA-016)', () => {
  it('calculates approval_to_send_rate = 6/10 when 4 approvals were not sent', () => {
    // 10 approved versions (IDs 001–010), 6 of them also have ET_SEND_INITIATED (001–006)
    const approvedVersionIds = new Set(
      Array.from({ length: 10 }, (_, i) => `apr-${String(i + 1).padStart(3, '0')}`)
    )
    const sentEvents = Array.from({ length: 6 }, (_, i) =>
      makeEvent(`apr-${String(i + 1).padStart(3, '0')}`, 'ET_SEND_INITIATED')
    )
    // Also add some succeeded events so the denominator set for other signals exists
    const succeededEvents = Array.from({ length: 6 }, (_, i) =>
      makeEvent(`apr-${String(i + 1).padStart(3, '0')}`, 'ET_SEND_SUCCEEDED')
    )
    const events = [...sentEvents, ...succeededEvents]
    const allIds = [...approvedVersionIds]
    const dimMap = ctxMap(allIds)
    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds })

    const ats = findSignal(signals, LA_SIGNAL_NAMES.APPROVAL_TO_SEND_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(ats?.denominator).toBe(10)
    expect(ats?.numerator).toBe(6)
    expect(ats?.rate).toBeCloseTo(0.6)
    expect(ats?.notes).toContain('4')
  })
})

// ============================================================
// calculateAllSignals — version_label grouping
// ============================================================

describe('calculateAllSignals — version_label grouping', () => {
  it('groups signals by version label A and B', () => {
    const aSucceeded = makeEvents(8, 'ET_SEND_SUCCEEDED', 0, { versionLabel: 'A' })
    const aDelivered = makeEvents(7, 'ET_EMAIL_DELIVERED', 0, { versionLabel: 'A' })
    const bSucceeded = makeEvents(6, 'ET_SEND_SUCCEEDED', 8, { versionLabel: 'B' })
    const bDelivered = makeEvents(5, 'ET_EMAIL_DELIVERED', 8, { versionLabel: 'B' })
    const events     = [...aSucceeded, ...aDelivered, ...bSucceeded, ...bDelivered]
    const allIds     = [...aSucceeded, ...bSucceeded].map(e => e.entityId)
    const dimMap     = ctxMap(allIds)
    const signals    = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const vA = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.VERSION_LABEL, 'A')
    expect(vA?.denominator).toBe(8)
    expect(vA?.numerator).toBe(7)

    const vB = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.VERSION_LABEL, 'B')
    expect(vB?.denominator).toBe(6)
    expect(vB?.numerator).toBe(5)
  })
})

// ============================================================
// calculateAllSignals — null strategy_angle excluded from angle group (TC-LA-019)
// ============================================================

describe('calculateAllSignals — null strategy_angle excluded (TC-LA-019)', () => {
  it('versions with null strategy_angle do not appear in strategy_angle dimension signals', () => {
    const succeeded    = makeEvents(8, 'ET_SEND_SUCCEEDED')
    const delivered    = makeEvents(7, 'ET_EMAIL_DELIVERED')
    const nullAngleCtx = ctxMap(succeeded.map(e => e.entityId), { strategyAngle: null })
    const events = [...succeeded, ...delivered]

    const signals = calculateAllSignals({ events, dimensionContextMap: nullAngleCtx, approvedVersionIds: new Set() })

    const strategyAngleSignals = signals.filter(s => s.dimension === LA_DIMENSIONS.STRATEGY_ANGLE)
    expect(strategyAngleSignals).toHaveLength(0)  // no angle groups when angle is null for all
  })
})

// ============================================================
// calculateAllSignals — QRA recommended grouping (TC-LA-033)
// ============================================================

describe('calculateAllSignals — qra_recommended grouping (TC-LA-033)', () => {
  it('produces separate rows for recommended=true and recommended=false', () => {
    const recSucceeded    = makeEvents(7, 'ET_SEND_SUCCEEDED', 0)
    const recDelivered    = makeEvents(6, 'ET_EMAIL_DELIVERED', 0)
    const nonRecSucceeded = makeEvents(5, 'ET_SEND_SUCCEEDED', 7)
    const nonRecDelivered = makeEvents(3, 'ET_EMAIL_DELIVERED', 7)
    const events = [...recSucceeded, ...recDelivered, ...nonRecSucceeded, ...nonRecDelivered]

    const dimMap = new Map<string, VersionDimensionContext>()
    for (const e of recSucceeded)    dimMap.set(e.entityId, makeCtx(e.entityId, { isRecommended: true }))
    for (const e of nonRecSucceeded) dimMap.set(e.entityId, makeCtx(e.entityId, { isRecommended: false }))

    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const recTrue  = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.QRA_RECOMMENDED, 'true')
    const recFalse = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.QRA_RECOMMENDED, 'false')

    expect(recTrue?.denominator).toBe(7)
    expect(recTrue?.numerator).toBe(6)
    expect(recFalse?.denominator).toBe(5)
    expect(recFalse?.numerator).toBe(3)
  })
})

// ============================================================
// calculateAllSignals — pure function idempotency (TC-LA-034)
// ============================================================

describe('calculateAllSignals — idempotency (TC-LA-034)', () => {
  it('produces identical results when called twice with same input', () => {
    const events  = makeSucceededDelivered(10)
    const dimMap  = ctxMap(events.filter(e => e.eventType === 'ET_SEND_SUCCEEDED').map(e => e.entityId))
    const input   = { events, dimensionContextMap: dimMap, approvedVersionIds: new Set<string>() }
    const run1    = calculateAllSignals(input)
    const run2    = calculateAllSignals(input)

    expect(run1.length).toBe(run2.length)
    const dr1 = findSignal(run1, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    const dr2 = findSignal(run2, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(dr1?.rate).toBe(dr2?.rate)
    expect(dr1?.numerator).toBe(dr2?.numerator)
  })
})

// ============================================================
// calculateAllSignals — advisory flag always true (TC-LA-031)
// ============================================================

describe('calculateAllSignals — advisory flag', () => {
  it('all produced signals have advisory = true', () => {
    const events  = makeSucceededDelivered(10)
    const dimMap  = ctxMap(events.filter(e => e.eventType === 'ET_SEND_SUCCEEDED').map(e => e.entityId))
    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })
    expect(signals.length).toBeGreaterThan(0)
    for (const sig of signals) {
      expect(sig.advisory).toBe(true)
    }
  })
})

// ============================================================
// calculateAllSignals — confidence always valid (TC-LA-028)
// ============================================================

describe('calculateAllSignals — confidence values valid', () => {
  it('all signals have a valid confidence label', () => {
    const events   = makeSucceededDelivered(10)
    const dimMap   = ctxMap(events.filter(e => e.eventType === 'ET_SEND_SUCCEEDED').map(e => e.entityId))
    const signals  = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })
    const valid    = new Set<string>(Object.values(LA_CONFIDENCE))
    for (const sig of signals) {
      expect(valid.has(sig.confidence)).toBe(true)
    }
  })
})

// ============================================================
// calculateAllSignals — rate always null or 0.0–1.0
// ============================================================

describe('calculateAllSignals — rate range', () => {
  it('all rates are null or within [0, 1]', () => {
    const events  = makeSucceededDelivered(20)
    const dimMap  = ctxMap(events.filter(e => e.eventType === 'ET_SEND_SUCCEEDED').map(e => e.entityId))
    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })
    for (const sig of signals) {
      if (sig.rate !== null) {
        expect(sig.rate).toBeGreaterThanOrEqual(0)
        expect(sig.rate).toBeLessThanOrEqual(1)
      }
    }
  })
})

// ============================================================
// calculateAllSignals — score_band with no sends produces no row (TC-LA-042)
// ============================================================

describe('calculateAllSignals — empty score band omitted (TC-LA-042)', () => {
  it('no signal row produced for score_band=do_not_use when it has zero events', () => {
    const succeeded = makeEvents(10, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(8,  'ET_EMAIL_DELIVERED')
    const events    = [...succeeded, ...delivered]
    // All versions are 'strong' band, none are 'do_not_use'
    const dimMap    = ctxMap(succeeded.map(e => e.entityId), { scoreBand: 'strong' })
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    const doNotUseSignal = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.SCORE_BAND, 'do_not_use')
    expect(doNotUseSignal).toBeUndefined()
  })
})

// ============================================================
// Audit Builders — TC-LA-035
// ============================================================

describe('buildSignalsComputedPayload (TC-LA-035)', () => {
  it('produces LA_SIGNALS_COMPUTED payload with all required fields', () => {
    const payload = buildSignalsComputedPayload({
      runId:          'run-001',
      tenantId:       'ten-001',
      snapshotsCount: 15,
      totalSends:     47,
      lookbackDays:   90,
      windowStart:    '2026-02-20T00:00:00Z',
      windowEnd:      '2026-05-21T00:00:00Z',
      triggeredBy:    'user-001',
    })

    expect(payload.action_type).toBe(LA_ACTION_TYPES.LA_SIGNALS_COMPUTED)
    expect(payload.run_id).toBe('run-001')
    expect(payload.tenant_id).toBe('ten-001')
    expect(payload.signals_computed).toBe(15)
    expect(payload.total_sends).toBe(47)
    expect(payload.lookback_days).toBe(90)
    expect(payload.triggered_by).toBe('user-001')
    expect(payload.computed_at).toBeTruthy()
  })
})

// ============================================================
// Audit Builders — TC-LA-036
// ============================================================

describe('buildSignalsFailedPayload (TC-LA-036)', () => {
  it('produces LA_SIGNALS_COMPUTATION_FAILED payload with all required fields', () => {
    const payload = buildSignalsFailedPayload({
      runId:       'run-002',
      tenantId:    'ten-001',
      errorReason: 'Database timeout',
      triggeredBy: 'user-001',
    })

    expect(payload.action_type).toBe(LA_ACTION_TYPES.LA_SIGNALS_COMPUTATION_FAILED)
    expect(payload.run_id).toBe('run-002')
    expect(payload.tenant_id).toBe('ten-001')
    expect(payload.error_reason).toBe('Database timeout')
    expect(payload.triggered_by).toBe('user-001')
    expect(payload.timestamp).toBeTruthy()
  })
})

// ============================================================
// Guardrail tests — no message_strategy, quality_review,
// message_version, email_drafts, email_sends modifications.
// These are code-level guardrails validated by structure.
// ============================================================

describe('Guardrail — no writes to locked tables', () => {
  it('calculateAllSignals produces only LearningSignal objects (no DB writes)', () => {
    const events  = makeSucceededDelivered(5)
    const dimMap  = ctxMap(events.filter(e => e.eventType === 'ET_SEND_SUCCEEDED').map(e => e.entityId))
    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })

    // Every returned object is a LearningSignal (advisory analytics output only)
    for (const sig of signals) {
      expect(sig).toHaveProperty('signalName')
      expect(sig).toHaveProperty('dimension')
      expect(sig).toHaveProperty('dimensionValue')
      expect(sig).toHaveProperty('numerator')
      expect(sig).toHaveProperty('denominator')
      expect(sig).toHaveProperty('advisory')
      expect(sig.advisory).toBe(true)
    }
  })

  it('classifyConfidence returns only valid confidence strings', () => {
    const validValues = new Set<string>(Object.values(LA_CONFIDENCE))
    const testCases   = [0, 4, 5, 19, 20, 49, 50, 200]
    for (const n of testCases) {
      const result = classifyConfidence(n, STANDARD_THRESHOLDS)
      expect(validValues.has(result)).toBe(true)
    }
  })
})

// ============================================================
// Fixture-based tests — map fixtures to programmatic input
// ============================================================

// TC-LA-001 (fixture validated above in the empty input test)
// TC-LA-002 (fixture validated above in single send test)
// TC-LA-003 (fixture validated above)
// Additional fixture-based tests follow:

describe('Fixture TC-LA-005: bounce rate 5/25', () => {
  it('calculates bounce_rate=0.20 with moderate confidence', () => {
    const succeeded = makeEvents(25, 'ET_SEND_SUCCEEDED')
    const bounced   = makeEvents(5,  'ET_EMAIL_BOUNCED')
    const delivered = makeEvents(20, 'ET_EMAIL_DELIVERED')
    const events    = [...succeeded, ...bounced, ...delivered]
    const dimMap    = ctxMap(succeeded.map(e => e.entityId))
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })
    const br = findSignal(signals, LA_SIGNAL_NAMES.BOUNCE_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(br?.numerator).toBe(5)
    expect(br?.denominator).toBe(25)
    expect(br?.rate).toBeCloseTo(0.2)
    expect(br?.confidence).toBe(LA_CONFIDENCE.MODERATE)
  })
})

describe('Fixture TC-LA-006: complaint rate 1/20', () => {
  it('calculates complaint_rate=0.05 with moderate confidence', () => {
    const succeeded  = makeEvents(20, 'ET_SEND_SUCCEEDED')
    const complained = makeEvents(1,  'ET_EMAIL_COMPLAINED')
    const events     = [...succeeded, ...complained]
    const dimMap     = ctxMap(succeeded.map(e => e.entityId))
    const signals    = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })
    const cr = findSignal(signals, LA_SIGNAL_NAMES.COMPLAINT_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(cr?.numerator).toBe(1)
    expect(cr?.denominator).toBe(20)
    expect(cr?.rate).toBeCloseTo(0.05)
  })
})

describe('Fixture TC-LA-021: zero denominator returns null rate', () => {
  it('calculateRate(0, 0) = null', () => {
    expect(calculateRate(0, 0)).toBeNull()
  })

  it('calculateAllSignals does not create signals when denominator = 0', () => {
    // No succeeded events → no delivery rate signal
    const signals = calculateAllSignals({
      events:              [],
      dimensionContextMap: new Map(),
      approvedVersionIds:  new Set(),
    })
    expect(signals).toHaveLength(0)
  })
})

describe('Fixture TC-LA-027: insufficient data presented honestly', () => {
  it('3 sends → delivery_rate confidence=insufficient, rate=null', () => {
    const succeeded = makeEvents(3, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(2, 'ET_EMAIL_DELIVERED')
    const events    = [...succeeded, ...delivered]
    const dimMap    = ctxMap(succeeded.map(e => e.entityId), { strategyAngle: 'social_proof' })
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })
    const dr = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(dr?.confidence).toBe(LA_CONFIDENCE.INSUFFICIENT)
    expect(dr?.rate).toBeNull()
    expect(dr?.sampleN).toBe(3)
    expect(dr?.notes).toContain('Insufficient')
  })
})

describe('Fixture TC-LA-028: confidence thresholds by sample size', () => {
  it('N=4 → insufficient', () => {
    expect(classifyConfidence(4, STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.INSUFFICIENT)
  })
  it('N=5 → low', () => {
    expect(classifyConfidence(5, STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.LOW)
  })
  it('N=20 → moderate', () => {
    expect(classifyConfidence(20, STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.MODERATE)
  })
  it('N=50 → high', () => {
    expect(classifyConfidence(50, STANDARD_THRESHOLDS)).toBe(LA_CONFIDENCE.HIGH)
  })
})

describe('Fixture TC-LA-030: signal includes all required output fields', () => {
  it('delivery_rate signal for 47 sends includes numerator, denominator, advisory, confidence', () => {
    const succeeded = makeEvents(47, 'ET_SEND_SUCCEEDED')
    const delivered = makeEvents(44, 'ET_EMAIL_DELIVERED')
    const events    = [...succeeded, ...delivered]
    const dimMap    = ctxMap(succeeded.map(e => e.entityId))
    const signals   = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: new Set() })
    const dr = findSignal(signals, LA_SIGNAL_NAMES.DELIVERY_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(dr?.numerator).toBe(44)
    expect(dr?.denominator).toBe(47)
    expect(dr?.signalName).toBe('delivery_rate')
    expect(dr?.advisory).toBe(true)
    expect(dr?.confidence).toBeDefined()
    expect(dr?.sampleN).toBe(47)
  })
})

describe('Fixture TC-LA-040: approval_to_send notes 7 not sent', () => {
  it('notes string mentions 7 approved versions not sent when 8/15 sent', () => {
    const allApprovedIds = new Set(
      Array.from({ length: 15 }, (_, i) => `apr-${String(i + 1).padStart(3, '0')}`)
    )
    const sentEvents = Array.from({ length: 8 }, (_, i) =>
      makeEvent(`apr-${String(i + 1).padStart(3, '0')}`, 'ET_SEND_INITIATED')
    )
    const succeededEvents = Array.from({ length: 8 }, (_, i) =>
      makeEvent(`apr-${String(i + 1).padStart(3, '0')}`, 'ET_SEND_SUCCEEDED')
    )
    const events = [...sentEvents, ...succeededEvents]
    const dimMap = ctxMap([...allApprovedIds])
    const signals = calculateAllSignals({ events, dimensionContextMap: dimMap, approvedVersionIds: allApprovedIds })

    const ats = findSignal(signals, LA_SIGNAL_NAMES.APPROVAL_TO_SEND_RATE, LA_DIMENSIONS.TENANT_WIDE, 'all')
    expect(ats?.denominator).toBe(15)
    expect(ats?.numerator).toBe(8)
    expect(ats?.notes).toContain('7')
  })
})
