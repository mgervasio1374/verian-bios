// mcm-v2 — Campaign Types seed (A1). Migration shape + DB-backed dropdown wiring +
// guard ceiling bump. Source-read. TC-CTS-01..08

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { CAMPAIGN_TYPE } from '@/modules/messaging/campaign-assets/campaign-asset.constants'

const ROOT = join(__dirname, '..')
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20240065_seed_campaign_types.sql')
function read(rel: string): string { return readFileSync(join(ROOT, rel), 'utf8') }

const CANONICAL = Object.values(CAMPAIGN_TYPE)

describe('TC-CTS-01: migration file exists', () => {
  it('20240065_seed_campaign_types.sql present', () => {
    expect(existsSync(MIGRATION)).toBe(true)
  })
})

describe('TC-CTS-02: contains exactly the canonical 8 slugs (== Object.values(CAMPAIGN_TYPE))', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  it('each canonical slug appears', () => {
    for (const slug of CANONICAL) {
      expect(sql).toContain(`'${slug}'`)
    }
  })
  it('introduces no extra campaign-type slug literal in the VALUES list', () => {
    // Extract single-quoted slug-shaped tokens from the VALUES rows: ('slug','Name').
    const valueSlugs = [...sql.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'[^']+'\s*\)/g)].map(m => m[1])
    expect(valueSlugs.sort()).toEqual([...CANONICAL].sort())
  })
})

describe('TC-CTS-03: idempotent — ON CONFLICT … retired_at IS NULL DO NOTHING', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  it('matches the partial index inference clause', () => {
    expect(sql).toContain('ON CONFLICT')
    expect(sql).toContain('DO NOTHING')
    expect(sql).toContain('retired_at IS NULL')
    expect(sql).toMatch(/ON CONFLICT \(tenant_id, workspace_id, slug\) WHERE retired_at IS NULL DO NOTHING/)
  })
})

describe('TC-CTS-04: additive-only + per-workspace + active', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  it('no UPDATE/DELETE/DROP against campaign_types', () => {
    expect(sql).not.toContain('UPDATE campaign_types')
    expect(sql).not.toMatch(/DELETE\s+FROM\s+campaign_types/i)
    expect(sql).not.toMatch(/DROP\s+TABLE\s+campaign_types/i)
    expect(sql).not.toContain('DELETE')
    expect(sql).not.toContain('DROP')
  })
  it('seeds active rows from workspaces', () => {
    expect(sql).toContain("'active'")
    expect(sql).toContain('FROM workspaces')
  })
})

describe('TC-CTS-05: CampaignAssetEditor accepts campaignTypes + keeps CAMPAIGN_TYPE fallback', () => {
  const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/CampaignAssetEditor.tsx')
  it('prop + fallback retained', () => {
    expect(src).toContain('campaignTypes?:')
    expect(src).toContain('CAMPAIGN_TYPE')
    expect(src).toContain('FALLBACK_CAMPAIGN_TYPE_OPTIONS')
  })
})

describe('TC-CTS-06: AiAssetDraftButton accepts campaignTypes + keeps CAMPAIGN_TYPE fallback', () => {
  const src = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/AiAssetDraftButton.tsx')
  it('prop + fallback retained', () => {
    expect(src).toContain('campaignTypes?:')
    expect(src).toContain('CAMPAIGN_TYPE')
    expect(src).toContain('FALLBACK_CAMPAIGN_TYPE_OPTIONS')
  })
})

describe('TC-CTS-07: both pages fetch listCampaignTypes + pass campaignTypes to the child', () => {
  const detail = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/[assetId]/page.tsx')
  const list   = read('app/(workspace)/[workspaceSlug]/settings/campaign-assets/page.tsx')
  it('[assetId] page wires both branches', () => {
    // A2 (mcm-v2-campaign-types-admin) added status: 'active' to these author picks.
    expect(detail).toContain('listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, status: \'active\' })')
    // both editor renders carry the prop
    const occurrences = (detail.match(/campaignTypes=\{types\.map/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })
  it('list page wires AiAssetDraftButton', () => {
    expect(list).toContain('listCampaignTypes({ tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, status: \'active\' })')
    expect(list).toContain('campaignTypes={campaignTypes.map')
  })
})

describe('TC-CTS-08: TC-G5-S12-047 ceiling bumped to 20240066', () => {
  it('guard source forbids >= 20240066', () => {
    const guard = read('tests/goal5-slice-12-bridge-intake-service.test.ts')
    expect(guard).toContain('>= 20240066')
    expect(guard).toContain('parseInt(match[1], 10) >= 20240066')
  })
})
