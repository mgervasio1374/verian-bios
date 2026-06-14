// MCM v2 — usage-check repo helper: which asset ids are referenced by a
// sequence step. Behavioral via a mocked service client.
//
// TC-AUC-01..03

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  // step rows the mocked query returns, and the captured .in() filter
  stepRows:  [] as Array<{ campaign_email_asset_id: string | null }>,
  inFilter:  null as { col: string; vals: unknown } | null,
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      from:   () => builder,
      select: () => builder,
      eq:     () => builder,
      in:     (col: string, vals: unknown) => { h.inFilter = { col, vals }; return builder },
      then:   (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve({ data: h.stepRows, error: null }).then(onF, onR),
    })
    return builder
  },
}))

import { listAssetIdsReferencedBySteps } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'

beforeEach(() => {
  h.stepRows = []
  h.inFilter = null
})

describe('TC-AUC-01: listAssetIdsReferencedBySteps (behavioral)', () => {
  it('returns the distinct set of referenced ids', async () => {
    h.stepRows = [
      { campaign_email_asset_id: 'a' },
      { campaign_email_asset_id: 'a' }, // duplicate — collapses
      { campaign_email_asset_id: 'c' },
    ]
    const set = await listAssetIdsReferencedBySteps(['a', 'b', 'c'], 't1')
    expect([...set].sort()).toEqual(['a', 'c'])
    expect(set.has('b')).toBe(false)
    // queried only the asked-for ids
    expect(h.inFilter).toEqual({ col: 'campaign_email_asset_id', vals: ['a', 'b', 'c'] })
  })

  it('returns an empty set when no step references any of them', async () => {
    h.stepRows = []
    const set = await listAssetIdsReferencedBySteps(['a', 'b'], 't1')
    expect(set.size).toBe(0)
  })

  it('short-circuits on empty input (no query)', async () => {
    const set = await listAssetIdsReferencedBySteps([], 't1')
    expect(set.size).toBe(0)
    expect(h.inFilter).toBeNull()
  })
})
