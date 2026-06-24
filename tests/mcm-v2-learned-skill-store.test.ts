// mcm-v2 — Learned Skill Store (learning-loop moat substrate).
// Covers the async resolver's resolution order + defensive parsing, and the
// migration shape (table / unique index / RLS), plus confirms the static seed
// module and copywriting callers are untouched.
// TC-LSS-01..10

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Resolver — mock the repo so resolution order is deterministic
// ---------------------------------------------------------------------------

vi.mock('@/modules/messaging/skills/learned-skill.repo', () => ({
  getLearnedSkill: vi.fn(),
}))

import { resolveCopywritingSkill } from '@/modules/messaging/copywriting/copywriting-skill.resolver'
import { getLearnedSkill } from '@/modules/messaging/skills/learned-skill.repo'
import { getSkillDefinition } from '@/modules/messaging/copywriting/copywriting-agent.skill-definitions'

const getLearnedSkillMock = vi.mocked(getLearnedSkill)

// A well-formed copywriting definition jsonb (CopywritingSkillDefinition minus slug/version).
function goodDefinition(tag: string): Record<string, unknown> {
  return {
    category:          'context',
    toneRules:         `tone ${tag}`,
    messagingRules:    `messaging ${tag}`,
    requiredElements:  [`req ${tag}`],
    forbiddenElements: [`forbid ${tag}`],
    ctaGuidance:       `cta ${tag}`,
    complianceNotes:   `compliance ${tag}`,
    examples:          [`example ${tag}`],
    antiPatterns:      [`anti ${tag}`],
  }
}

function row(over: Record<string, unknown>) {
  return {
    id: 'ls-1', tenant_id: null, workspace_id: null,
    skill_family: 'copywriting', skill_slug: 'cold_outreach', skill_version: 1,
    category: 'context', definition: goodDefinition('x'),
    status: 'active', source: 'human', created_by_user_id: null,
    created_at: 'now', updated_at: 'now',
    ...over,
  }
}

beforeEach(() => getLearnedSkillMock.mockReset())

describe('TC-LSS-01: resolves the DB tenant-specific active row first', () => {
  it('returns the tenant definition without consulting the global tier result', async () => {
    getLearnedSkillMock
      .mockResolvedValueOnce(row({ tenant_id: 't-1', definition: goodDefinition('tenant') }) as never) // tenant
      .mockResolvedValueOnce(row({ definition: goodDefinition('global') }) as never)                    // global (ignored)

    const def = await resolveCopywritingSkill('t-1', 'cold_outreach', 1)
    expect(def?.toneRules).toBe('tone tenant')
    expect(def?.skillSlug).toBe('cold_outreach')
    expect(def?.skillVersion).toBe(1)
  })
})

describe('TC-LSS-02: falls back to the global DB row when no tenant row', () => {
  it('returns the global definition', async () => {
    getLearnedSkillMock
      .mockResolvedValueOnce(null as never)                                        // tenant absent
      .mockResolvedValueOnce(row({ definition: goodDefinition('global') }) as never) // global present

    const def = await resolveCopywritingSkill('t-1', 'cold_outreach', 1)
    expect(def?.toneRules).toBe('tone global')
  })
})

describe('TC-LSS-03: falls back to the static seed when no DB rows', () => {
  it('returns the seed definition for a known slug', async () => {
    getLearnedSkillMock.mockResolvedValue(null as never)

    const def = await resolveCopywritingSkill('t-1', 'cold_outreach', 1)
    const seed = getSkillDefinition('cold_outreach', 1)
    expect(def).not.toBeNull()
    expect(def).toEqual(seed)
  })
})

describe('TC-LSS-04: returns null when nothing resolves', () => {
  it('no DB rows + unknown slug → null', async () => {
    getLearnedSkillMock.mockResolvedValue(null as never)
    const def = await resolveCopywritingSkill('t-1', 'no_such_skill', 1)
    expect(def).toBeNull()
  })
})

describe('TC-LSS-05: a non-active tenant row falls through to global', () => {
  it('retired tenant row is skipped, global active row wins', async () => {
    getLearnedSkillMock
      .mockResolvedValueOnce(row({ tenant_id: 't-1', status: 'retired', definition: goodDefinition('tenant') }) as never)
      .mockResolvedValueOnce(row({ definition: goodDefinition('global') }) as never)

    const def = await resolveCopywritingSkill('t-1', 'cold_outreach', 1)
    expect(def?.toneRules).toBe('tone global')
  })
})

describe('TC-LSS-06: malformed definition jsonb falls through rather than throwing', () => {
  it('malformed tenant row → falls through to the static seed (no throw)', async () => {
    getLearnedSkillMock
      .mockResolvedValueOnce(row({ tenant_id: 't-1', definition: { toneRules: 123, requiredElements: 'nope' } }) as never)
      .mockResolvedValueOnce(null as never) // no global

    const def = await resolveCopywritingSkill('t-1', 'cold_outreach', 1)
    // Did not throw; fell through to the seed.
    expect(def).toEqual(getSkillDefinition('cold_outreach', 1))
  })

  it('non-object definition is treated as malformed', async () => {
    getLearnedSkillMock
      .mockResolvedValueOnce(row({ tenant_id: 't-1', definition: null }) as never)
      .mockResolvedValueOnce(null as never)
    const def = await resolveCopywritingSkill('t-1', 'cold_outreach', 1)
    expect(def).toEqual(getSkillDefinition('cold_outreach', 1))
  })
})

// ---------------------------------------------------------------------------
// Migration shape
// ---------------------------------------------------------------------------

describe('TC-LSS-07: migration 20240063 defines learned_skills with columns, checks, unique index, RLS', () => {
  const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20240063_learned_skills.sql'), 'utf8')

  it('creates the table with the listed columns', () => {
    expect(sql).toContain('CREATE TABLE learned_skills')
    for (const col of [
      'tenant_id', 'workspace_id', 'skill_family', 'skill_slug', 'skill_version',
      'category', 'definition', 'status', 'source', 'created_by_user_id',
      'created_at', 'updated_at',
    ]) {
      expect(sql).toContain(col)
    }
    expect(sql).toContain('definition         jsonb       NOT NULL')
  })

  it('enforces the status and source CHECK constraints', () => {
    expect(sql).toMatch(/status\s+text\s+NOT NULL\s+DEFAULT 'active' CHECK \(status IN \('active','draft','retired'\)\)/)
    expect(sql).toMatch(/source\s+text\s+NOT NULL\s+DEFAULT 'human'\s+CHECK \(source IN \('seed','learned','human'\)\)/)
  })

  it('creates the COALESCE unique index + the lookup/tenant indexes', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX idx_learned_skills_unique')
    expect(sql).toContain('COALESCE(tenant_id')
    expect(sql).toContain('idx_learned_skills_lookup')
    expect(sql).toContain('idx_learned_skills_tenant')
  })

  it('enables RLS with tenant-scoped + global read + service-role policies', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('current_tenant_id()')
    expect(sql).toContain('is_workspace_member')
    expect(sql).toContain('"learned_skills_select"')
    expect(sql).toContain('"learned_skills_select_global"')
    expect(sql).toContain('tenant_id IS NULL')
    expect(sql).toContain("auth.role() = 'service_role'")
    // Writes are not granted to ordinary members.
    expect(sql).toContain('GRANT SELECT ON learned_skills TO authenticated')
    expect(sql).toContain('GRANT ALL    ON learned_skills TO service_role')
  })
})

// ---------------------------------------------------------------------------
// Zero behavior change — seed module + existing callers untouched
// ---------------------------------------------------------------------------

describe('TC-LSS-08: static seed module is unchanged (no learned-skill wiring, still sync)', () => {
  const seed = readFileSync(join(__dirname, '..', 'modules', 'messaging', 'copywriting', 'copywriting-agent.skill-definitions.ts'), 'utf8')
  it('exposes sync getSkillDefinition and does not import the store/resolver', () => {
    expect(seed).toContain('export function getSkillDefinition')
    expect(seed).not.toContain('learned-skill')
    expect(seed).not.toContain('resolveCopywritingSkill')
    expect(seed).not.toContain('createSupabaseServiceClient')
  })
})

describe('TC-LSS-09: the main copy path consumes the resolver via the LLM adapter (Slice 2)', () => {
  // Originally this pinned that P1 left the main path unwired. Slice 2
  // (copywriting-main-path-skill-wire) intentionally wires it: the LLM adapter
  // resolves the skill gated on LEARNED_SKILLS_ENABLED, and the service threads
  // tenantId into the adapter rather than calling the resolver itself.
  it('the service threads tenantId into the adapter, not the resolver directly', () => {
    const svc = readFileSync(join(__dirname, '..', 'modules', 'messaging', 'copywriting', 'copywriting-agent.service.ts'), 'utf8')
    expect(svc).not.toContain('resolveCopywritingSkill')
    expect(svc).toContain('generateBodyWithLlm(angle, strategy, ctx, tenantId)')
  })
  it('the LLM adapter resolves the skill gated on LEARNED_SKILLS_ENABLED', () => {
    const llm = readFileSync(join(__dirname, '..', 'modules', 'messaging', 'copywriting', 'copywriting-agent.llm.ts'), 'utf8')
    expect(llm).toContain('resolveCopywritingSkill')
    expect(llm).toContain('LEARNED_SKILLS_ENABLED')
  })
})

describe('TC-LSS-10: resolver lives in a service file, not the seed module', () => {
  it('the seed module does not define resolveCopywritingSkill', () => {
    const seed = readFileSync(join(__dirname, '..', 'modules', 'messaging', 'copywriting', 'copywriting-agent.skill-definitions.ts'), 'utf8')
    expect(seed).not.toContain('async function resolveCopywritingSkill')
  })
})
