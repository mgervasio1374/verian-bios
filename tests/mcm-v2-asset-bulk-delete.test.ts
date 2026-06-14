// MCM v2 — Campaign Assets bulk/inline delete + filter. Behavioral tests:
//  - bulkDeleteCampaignAssetsAction deletes only unreferenced ids, tallies the rest
//  - in-use (sequence-referenced) assets are provably protected
//  - filterAssets returns the correct subset
//
// TC-ABD-01..05

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  referenced:  new Set<string>(),
  deleteCalls: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({}) }))
vi.mock('@/lib/auth/context', () => ({
  buildRequestContext: () => Promise.resolve({ tenantId: 't1', workspaceId: 'w1', userId: 'u1' }),
}))
vi.mock('@/lib/auth/permissions', () => ({ requirePermission: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

vi.mock('@/modules/campaign-sequence/repositories/campaign-sequence-step.repo', () => ({
  listAssetIdsReferencedBySteps: (ids: string[]) =>
    Promise.resolve(new Set(ids.filter(id => h.referenced.has(id)))),
}))

// The action uses `import * as assetRepo` — mock deleteAsset, capture ids.
vi.mock('@/modules/messaging/repositories/campaign-email-asset.repo', () => ({
  deleteAsset: (_tenantId: string, id: string) => { h.deleteCalls.push(id); return Promise.resolve() },
}))

import { bulkDeleteCampaignAssetsAction } from '@/app/(workspace)/[workspaceSlug]/settings/campaign-assets/actions'
import { filterAssets } from '@/app/(workspace)/[workspaceSlug]/settings/campaign-assets/asset-filter'

beforeEach(() => {
  h.referenced = new Set()
  h.deleteCalls = []
})

// ---------------------------------------------------------------------------
// TC-ABD-01: bulk delete only removes unreferenced ids + tallies the rest
// ---------------------------------------------------------------------------

describe('TC-ABD-01: bulkDeleteCampaignAssetsAction (behavioral)', () => {
  it('deletes only unreferenced assets; referenced ones are skipped and survive', async () => {
    h.referenced = new Set(['b']) // 'b' is in a sequence step

    const result = await bulkDeleteCampaignAssetsAction(['a', 'b', 'c'])

    expect(result.ok).toBe(true)
    expect(result.deleted).toBe(2)
    expect(result.skippedInUse).toBe(1)

    // 'b' was never passed to deleteAsset — it is provably protected.
    expect(h.deleteCalls.sort()).toEqual(['a', 'c'])
    expect(h.deleteCalls).not.toContain('b')
  })

  it('all-referenced selection deletes nothing and tallies them all as in-use', async () => {
    h.referenced = new Set(['a', 'b'])
    const result = await bulkDeleteCampaignAssetsAction(['a', 'b'])
    expect(result.deleted).toBe(0)
    expect(result.skippedInUse).toBe(2)
    expect(h.deleteCalls).toEqual([])
  })

  it('dedupes ids and rejects an empty selection', async () => {
    const empty = await bulkDeleteCampaignAssetsAction([])
    expect(empty.ok).toBe(false)

    h.referenced = new Set()
    const dup = await bulkDeleteCampaignAssetsAction(['a', 'a', 'a'])
    expect(dup.deleted).toBe(1)
    expect(h.deleteCalls).toEqual(['a'])
  })
})

// ---------------------------------------------------------------------------
// TC-ABD-02: filterAssets
// ---------------------------------------------------------------------------

describe('TC-ABD-02: filterAssets (pure)', () => {
  const assets = [
    { asset_name: 'Fall Expo_1', campaign_type: 'initial_contact' },
    { asset_name: 'Fall Expo_2', campaign_type: 'initial_contact' },
    { asset_name: 'Spring Push_1', campaign_type: 'check_in' },
  ]

  it('filters by campaign type', () => {
    const out = filterAssets(assets, { campaignType: 'check_in' })
    expect(out.map(a => a.asset_name)).toEqual(['Spring Push_1'])
  })

  it('filters by case-insensitive name search', () => {
    const out = filterAssets(assets, { search: 'fall expo' })
    expect(out).toHaveLength(2)
  })

  it('combines type + search (AND)', () => {
    const out = filterAssets(assets, { campaignType: 'initial_contact', search: '_2' })
    expect(out.map(a => a.asset_name)).toEqual(['Fall Expo_2'])
  })

  it('empty filter returns everything', () => {
    expect(filterAssets(assets, {})).toHaveLength(3)
  })
})
