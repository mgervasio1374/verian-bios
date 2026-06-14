// Agent sweep — first test coverage for the lead-scoring agent's two pure scoring
// functions (fit + urgency). Both were substantive but untested; this locks the
// dimension math and the garbage-input hardening (negative/NaN value, unparseable
// dates) added in the agent-sweep pass. Pure functions — no DB, no mocks.
// TC-LS-01..12

import { describe, it, expect } from 'vitest'
import { calculateFitScore } from '@/modules/intelligence/services/fit-score.service'
import { calculateUrgencyScore } from '@/modules/intelligence/services/urgency-score.service'
import type { LeadRow } from '@/modules/intelligence/types'

const DAY = 86_400_000

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'ld-1', tenant_id: 't1', workspace_id: 'w1',
    company_id: 'co-1', contact_id: 'ct-1',
    estimated_value: 12_000, source: 'referral', stage: 'proposal',
    priority: 'high', expected_close_date: null,
    created_at: new Date().toISOString(),
    ...over,
  } as unknown as LeadRow
}

// ---------------------------------------------------------------------------
// Fit score
// ---------------------------------------------------------------------------

describe('TC-LS-01: calculateFitScore dimension math', () => {
  it('sums data_completeness + value tier + source + stage', () => {
    const r = calculateFitScore(lead({ estimated_value: 22_000, source: 'referral', stage: 'negotiation' }))
    // completeness 12+12+6=30, value 30, source 20, stage 20 → capped 100
    expect(r.dimensions).toMatchObject({ data_completeness: 30, value_signal: 30, source_quality: 20, stage_signal: 20 })
    expect(r.score).toBe(100)
    expect(r.confidence).toBe(0.85)
  })

  it('unknown source and stage fall back to 4 each (not a crash)', () => {
    const r = calculateFitScore(lead({ source: 'mystery', stage: 'unheard_of' as never }))
    expect(r.dimensions.source_quality).toBe(4)
    expect(r.dimensions.stage_signal).toBe(4)
  })
})

describe('TC-LS-02: fit score garbage-value hardening', () => {
  it('negative estimated_value contributes no value_signal AND no completeness bonus', () => {
    const r = calculateFitScore(lead({ estimated_value: -5000, company_id: null, contact_id: null }))
    expect(r.dimensions.value_signal).toBe(0)
    expect(r.dimensions.data_completeness).toBe(0) // no company/contact, and negative value does not count
  })

  it('non-numeric / NaN estimated_value is treated as no value', () => {
    const r = calculateFitScore(lead({ estimated_value: 'abc' as never }))
    expect(r.dimensions.value_signal).toBe(0)
    // company+contact still present → 24, but no +6 value bonus
    expect(r.dimensions.data_completeness).toBe(24)
  })

  it('a valid positive value still earns the completeness bonus (no regression)', () => {
    const r = calculateFitScore(lead({ estimated_value: 4000 }))
    expect(r.dimensions.data_completeness).toBe(30) // 12+12+6
    expect(r.dimensions.value_signal).toBe(10)       // 3000..5000 tier
  })
})

// ---------------------------------------------------------------------------
// Urgency score
// ---------------------------------------------------------------------------

describe('TC-LS-03: calculateUrgencyScore dimension math', () => {
  it('stage + priority + overdue close date + age', () => {
    const r = calculateUrgencyScore(lead({
      stage: 'negotiation', priority: 'critical',
      expected_close_date: new Date(Date.now() - DAY).toISOString(), // overdue
      created_at: new Date(Date.now() - 100 * DAY).toISOString(),    // 100d old
    }))
    expect(r.dimensions).toMatchObject({ stage_progress: 25, priority_signal: 30, close_date_proximity: 30, lead_age: 15 })
    expect(r.score).toBe(100)
    expect(r.confidence).toBe(0.90)
  })

  it('future close date is tiered by proximity', () => {
    const r = calculateUrgencyScore(lead({ expected_close_date: new Date(Date.now() + 20 * DAY).toISOString() }))
    expect(r.dimensions.close_date_proximity).toBe(22) // 15..30 day tier
  })
})

describe('TC-LS-04: urgency score garbage-date hardening', () => {
  it('unparseable close date → no proximity credit and no confidence boost from it', () => {
    const r = calculateUrgencyScore(lead({ expected_close_date: 'not-a-date' as never, priority: 'medium' }))
    expect(r.dimensions.close_date_proximity).toBe(0)
    expect(r.confidence).toBe(0.45) // no valid close date, default priority
  })

  it('missing / unparseable created_at does not leak NaN into age or score', () => {
    const r = calculateUrgencyScore(lead({ created_at: 'garbage' as never }))
    expect(Number.isFinite(r.dimensions.lead_age)).toBe(true)
    expect(r.dimensions.lead_age).toBe(1) // treated as age 0 → minimal bucket
    expect(Number.isFinite(r.score)).toBe(true)
    expect(r.key_inputs.age_in_days).toBe(0)
  })

  it('future-dated created_at clamps age to 0 (no negative age)', () => {
    const r = calculateUrgencyScore(lead({ created_at: new Date(Date.now() + 30 * DAY).toISOString() }))
    expect(r.key_inputs.age_in_days).toBe(0)
    expect(r.dimensions.lead_age).toBe(1)
  })
})
