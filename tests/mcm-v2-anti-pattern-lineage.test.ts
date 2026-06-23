// mcm-v2 — Anti-Pattern lineage (Learning Loop P1b). Migration + repo + provenance
// persistence (per newly-applied rule, best-effort) + changelog. TC-APLN-01..06

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
function read(rel: string): string { return readFileSync(join(ROOT, rel), 'utf8') }
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20240066_anti_pattern_sources.sql')

describe('TC-APLN-01: migration creates anti_pattern_sources (additive, RLS, CHECK)', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  it('exists', () => { expect(existsSync(MIGRATION)).toBe(true) })
  it('creates the table with the columns + confidence CHECK', () => {
    expect(sql).toContain('CREATE TABLE anti_pattern_sources')
    for (const col of [
      'tenant_id', 'workspace_id', 'skill_family', 'skill_slug', 'skill_version',
      'anti_pattern_rule', 'pattern_name', 'source_excerpt', 'rationale', 'confidence',
      'applied_by_user_id', 'created_at',
    ]) {
      expect(sql).toContain(col)
    }
    expect(sql).toContain("confidence IN ('low','medium','high')")
  })
  it('enables RLS + service-role policy, mirrors learned_skills', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('current_tenant_id()')
    expect(sql).toContain("auth.role() = 'service_role'")
    expect(sql).toContain('GRANT SELECT ON anti_pattern_sources TO authenticated')
  })
  it('is additive — no destructive ops', () => {
    expect(sql).not.toContain('UPDATE ')
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
    expect(sql).not.toMatch(/DROP\s+TABLE/i)
  })
})

describe('TC-APLN-02: TC-G5-S12-047 ceiling is above this slice migration (20240066)', () => {
  it('guard forbids migrations strictly above the latest applied', () => {
    // The guard moves with each new migration; lineage added 20240066, and later
    // slices push it higher (P3.5 inbound reply capture moved it to 20240068).
    // The invariant for P1b: the guard must NOT catch 20240066.
    const guard = read('tests/goal5-slice-12-bridge-intake-service.test.ts')
    const m = guard.match(/parseInt\(match\[1\], 10\) >= (\d+)/)
    expect(m).toBeTruthy()
    expect(parseInt(m![1], 10)).toBeGreaterThan(20240066)
  })
})

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

const r = vi.hoisted(() => ({ inserted: null as unknown[] | null, insertThrows: false }))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    Object.assign(b, {
      from: () => b,
      insert: (rows: unknown[]) => {
        r.inserted = rows
        return Promise.resolve({ error: r.insertThrows ? { message: 'lineage down' } : null })
      },
      select: () => b,
      eq: () => b,
      order: () => Promise.resolve({ data: [], error: null }),
    })
    return b
  },
}))

import { insertAntiPatternSources, listAntiPatternSources } from '@/modules/messaging/learning/anti-pattern-source.repo'

beforeEach(() => { r.inserted = null; r.insertThrows = false })

describe('TC-APLN-03: repo exports + no-op on empty', () => {
  it('insert no-ops on empty', async () => {
    await insertAntiPatternSources([])
    expect(r.inserted).toBeNull()
  })
  it('insert maps fields', async () => {
    await insertAntiPatternSources([{ tenantId: 't-1', family: 'copywriting', slug: 'cold_outreach', antiPatternRule: 'Avoid X' }])
    expect(r.inserted).toHaveLength(1)
    expect((r.inserted as Record<string, unknown>[])[0].skill_family).toBe('copywriting')
  })
  it('list is callable', async () => {
    const rows = await listAntiPatternSources('t-1', { family: 'copywriting' })
    expect(Array.isArray(rows)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyAntiPatternsAction → lineage per newly-applied rule
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  ctx: { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'tenant_admin' } as Record<string, unknown>,
  labOn: true,
  learned: null as Record<string, unknown> | null,
  lineageThrows: false,
}))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth/context', () => ({ buildRequestContext: vi.fn(async () => h.ctx) }))
vi.mock('@/lib/auth/permissions', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/intelligence/repositories/system-control.repo', () => ({
  getBooleanControl: vi.fn(async () => h.labOn),
}))
vi.mock('@/modules/messaging/skills/learned-skill.repo', () => ({
  getLearnedSkill: vi.fn(async () => h.learned),
  upsertLearnedSkill: vi.fn(async () => ({ id: 'ls-1' })),
}))
// The source repo is NOT mocked — the action's real insertAntiPatternSources runs
// over the supabase mock above (assert via r.inserted; r.insertThrows = lineage failure).
vi.mock('@/modules/messaging/copywriting/copywriting-agent.skill-definitions', () => ({
  getSkillDefinition: vi.fn(() => ({
    skillSlug: 'cold_outreach', skillVersion: 1, category: 'context',
    toneRules: 't', messagingRules: 'm', requiredElements: [], forbiddenElements: [],
    ctaGuidance: 'c', complianceNotes: 'n', examples: [], antiPatterns: ['Avoid A'],
  })),
}))

import { applyAntiPatternsAction } from '@/modules/messaging/learning/anti-pattern-lab.actions'

beforeEach(() => {
  vi.clearAllMocks()
  r.inserted = null
  r.insertThrows = false
  h.ctx = { tenantId: 't-1', workspaceId: 'ws-1', userId: 'u-1', roleSlug: 'tenant_admin' }
  h.labOn = true
  h.learned = null
})

describe('TC-APLN-04: lineage row per NEWLY-applied rule (not dups)', () => {
  it('records B (new) but not A (already on the seed)', async () => {
    const res = await applyAntiPatternsAction('cold_outreach', [
      { antiPatternRule: 'Avoid B', patternName: 'PB', sourceExcerpt: 'snip', rationale: 'why', confidence: 'high' },
      { antiPatternRule: 'Avoid A' }, // already present on the seed → not new
    ])
    expect(res.success).toBe(true)
    // Repo maps to DB columns; only the new rule (B) is recorded.
    const rows = r.inserted as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      skill_family: 'copywriting', skill_slug: 'cold_outreach', skill_version: 1,
      anti_pattern_rule: 'Avoid B', source_excerpt: 'snip', rationale: 'why', confidence: 'high',
      applied_by_user_id: 'u-1',
    })
  })
})

describe('TC-APLN-05: a lineage-insert failure does NOT fail the apply', () => {
  it('apply still returns success', async () => {
    r.insertThrows = true
    const res = await applyAntiPatternsAction('cold_outreach', [{ antiPatternRule: 'Avoid B' }])
    expect(res.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Profile changelog + UI wiring
// ---------------------------------------------------------------------------

describe('TC-APLN-06: profile reads the changelog; lab passes provenance through', () => {
  it('profile reads listAntiPatternSources + renders the changelog', () => {
    const profile = read('app/(workspace)/[workspaceSlug]/settings/agent-monitor/agent/[agentKey]/page.tsx')
    expect(profile).toContain("listAntiPatternSources(ctx.tenantId, { family: 'copywriting' })")
    expect(profile).toContain('Learned anti-patterns')
    expect(profile).toContain('source_excerpt')
    expect(profile).toContain('rationale')
  })
  it('AntiPatternLab passes excerpt + rationale to applyAntiPatternsAction', () => {
    const panel = read('app/(workspace)/[workspaceSlug]/settings/agent-monitor/agent/[agentKey]/AntiPatternLab.tsx')
    expect(panel).toContain('sourceExcerpt:   p.flaggedSnippet')
    expect(panel).toContain('rationale:       p.rationale')
  })
})
