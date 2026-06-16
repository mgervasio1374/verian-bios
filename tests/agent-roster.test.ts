// Agent sweep — Agent Monitor all-agents roster. Unit tests for the pure roster
// aggregation (no DB): name-mapping fold, telemetry flagging, and the
// expected-vs-actual anomaly ("leads ingested but a lead-processing agent ran 0").
// TC-AR-01..06

import { describe, it, expect } from 'vitest'
import {
  AGENT_ROSTER, buildRoster, anomalies,
  type RunAggregate,
} from '@/modules/intelligence/agent-roster'

const runs = (over: Partial<RunAggregate> = {}): RunAggregate => ({ runs: 0, completed: 0, failed: 0, lastRunAt: null, ...over })

describe('TC-AR-01: roster shape', () => {
  // MCM v2: +1 agent (statement_review_agent, business_intelligence) → 18→19.
  // Category set unchanged at 5.
  it('lists 19 agents (15 registry + 3 live runtime + 1 statement review) across all 5 categories', () => {
    expect(AGENT_ROSTER).toHaveLength(19)
    const cats = new Set(AGENT_ROSTER.map(a => a.category))
    expect([...cats].sort()).toEqual(['business_intelligence', 'development', 'execution', 'messaging', 'policy_safety'])
  })
})

describe('TC-AR-02: aggregation folds telemetry names onto one row', () => {
  it('sums runs/decisions/usage across an agent\'s telemetry names and picks the latest run', () => {
    const runsByName = new Map([
      ['recommendation_generation_v1', runs({ runs: 3, completed: 3, lastRunAt: '2026-06-10T00:00:00Z' })],
      ['recommendation_generator',     runs({ runs: 2, completed: 1, failed: 1, lastRunAt: '2026-06-12T00:00:00Z' })],
    ])
    const decisionsByName = new Map([['recommendation_generator', 5]])
    const usageByName = new Map([['recommendation_generation_v1', { tokens: 1000, cost: 0.5 }]])

    const rows = buildRoster(AGENT_ROSTER, runsByName, decisionsByName, usageByName, 0)
    const rec = rows.find(r => r.key === 'campaign_recommendation_agent')!
    expect(rec.agg).toMatchObject({ runs: 5, completed: 4, failed: 1, decisions: 5, totalTokens: 1000, costUsd: 0.5 })
    expect(rec.agg.lastRunAt).toBe('2026-06-12T00:00:00Z') // latest of the two
    expect(rec.hasTelemetry).toBe(true)
  })
})

describe('TC-AR-03: agents with no telemetry', () => {
  it('skeletal/definition-only agents report hasTelemetry=false and zero aggregates', () => {
    const rows = buildRoster(AGENT_ROSTER, new Map(), new Map(), new Map(), 0)
    const skeletal = rows.find(r => r.key === 'risk_classifier_agent')!
    expect(skeletal.hasTelemetry).toBe(false)
    expect(skeletal.agg.runs).toBe(0)
    expect(skeletal.anomaly).toBe(false) // not a lead processor → never anomalous
  })
})

describe('TC-AR-04: expected-vs-actual anomaly', () => {
  it('leads ingested but a lead-processing agent logged 0 runs → anomaly', () => {
    // copywriting processes leads; give it no runs while leads were ingested
    const rows = buildRoster(AGENT_ROSTER, new Map(), new Map(), new Map(), 7)
    const copy = rows.find(r => r.key === 'copywriting_agent')!
    expect(copy.processesLeads).toBe(true)
    expect(copy.anomaly).toBe(true)
    expect(anomalies(rows).map(r => r.key)).toContain('copywriting_agent')
  })

  it('no anomaly when the lead-processing agent did run', () => {
    const runsByName = new Map([['copywriting_agent', runs({ runs: 4, completed: 4 })]])
    const rows = buildRoster(AGENT_ROSTER, runsByName, new Map(), new Map(), 7)
    expect(rows.find(r => r.key === 'copywriting_agent')!.anomaly).toBe(false)
  })

  it('no anomaly when zero leads were ingested (nothing was expected)', () => {
    const rows = buildRoster(AGENT_ROSTER, new Map(), new Map(), new Map(), 0)
    expect(anomalies(rows)).toHaveLength(0)
  })
})
