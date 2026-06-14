// #35 — AI cost math: estimateCostUsd + recordUsage auto-cost. Behavioral.
// TC-COST-01..02

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
}))

// recordUsage inserts via the service client — capture the row.
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      from:   () => builder,
      insert: (row: Record<string, unknown>) => { h.inserted = row; return builder },
      select: () => builder,
      single: () => Promise.resolve({ data: { id: 'evt1', ...h.inserted }, error: null }),
    })
    return builder
  },
}))

import { estimateCostUsd, isPricedModel, normalizeModelName } from '@/modules/intelligence/pricing/model-pricing'
import { recordUsage } from '@/modules/intelligence/repositories/ai-usage-event.repo'

beforeEach(() => { h.inserted = null })

// ---------------------------------------------------------------------------
// TC-COST-01: estimateCostUsd
// ---------------------------------------------------------------------------

describe('TC-COST-01: estimateCostUsd (behavioral)', () => {
  it('gpt-4o-mini: 1M prompt + 0 completion → $0.15', () => {
    expect(estimateCostUsd('gpt-4o-mini', 1_000_000, 0)).toBe(0.15)
  })

  it('gpt-4o-mini: 0 prompt + 1M completion → $0.60', () => {
    expect(estimateCostUsd('gpt-4o-mini', 0, 1_000_000)).toBe(0.60)
  })

  it('gpt-4o-mini: realistic mix → exact expected sum', () => {
    // 200k prompt @ 0.15/1M + 50k completion @ 0.60/1M = 0.03 + 0.03 = 0.06
    expect(estimateCostUsd('gpt-4o-mini', 200_000, 50_000)).toBe(0.06)
  })

  it('an openai/-prefixed name resolves the same price', () => {
    expect(estimateCostUsd('openai/gpt-4o-mini', 1_000_000, 0)).toBe(0.15)
    expect(normalizeModelName('openai/gpt-4o-mini')).toBe('gpt-4o-mini')
  })

  it('claude-sonnet-4-6 prices at 3/15 per 1M', () => {
    // 1M prompt @ 3.00 + 1M completion @ 15.00 = 18.00
    expect(estimateCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000)).toBe(18)
  })

  it('an unknown model → 0, and isPricedModel reflects the map', () => {
    expect(estimateCostUsd('some-unknown-model', 1_000_000, 1_000_000)).toBe(0)
    expect(isPricedModel('some-unknown-model')).toBe(false)
    expect(isPricedModel('openai/gpt-4o-mini')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-COST-02: recordUsage computes cost when none is passed
// ---------------------------------------------------------------------------

describe('TC-COST-02: recordUsage auto-cost (behavioral)', () => {
  it('persists estimated_cost_usd computed from tokens + model when no cost is passed', async () => {
    await recordUsage({
      tenantId: 't1', agentName: 'campaign_asset_creator', modelName: 'gpt-4o-mini',
      promptTokens: 200_000, completionTokens: 50_000,
    })
    expect(h.inserted?.estimated_cost_usd).toBe(estimateCostUsd('gpt-4o-mini', 200_000, 50_000))
    expect(h.inserted?.estimated_cost_usd).toBe(0.06)
  })

  it('respects an explicitly-passed cost', async () => {
    await recordUsage({
      tenantId: 't1', agentName: 'a', modelName: 'gpt-4o-mini',
      promptTokens: 200_000, completionTokens: 50_000, estimatedCostUsd: 0.99,
    })
    expect(h.inserted?.estimated_cost_usd).toBe(0.99)
  })

  it('an unknown model records 0 (never guesses)', async () => {
    await recordUsage({
      tenantId: 't1', agentName: 'a', modelName: 'mystery-model',
      promptTokens: 1_000_000, completionTokens: 1_000_000,
    })
    expect(h.inserted?.estimated_cost_usd).toBe(0)
  })
})
