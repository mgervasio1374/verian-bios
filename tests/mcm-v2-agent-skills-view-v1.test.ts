// mcm-v2 — Agent Map slice 2: Skills section on the per-agent profile + #skills
// deep-link from the catalog + back-to-map link. Source-read. TC-ASV-01..08

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'settings', 'agent-monitor', 'agent', '[agentKey]', 'page.tsx')
const CATALOG = join(__dirname, '..', 'app', '(workspace)', '[workspaceSlug]', 'settings', 'agent-monitor', 'map', 'AgentCatalog.tsx')

const profile = readFileSync(PROFILE, 'utf8')
const catalog = readFileSync(CATALOG, 'utf8')

describe('TC-ASV-01: profile imports the skills sources + family map', () => {
  it('getAllSkillDefinitions + listLearnedSkills + AGENT_SKILL_FAMILY', () => {
    expect(profile).toContain('getAllSkillDefinitions')
    expect(profile).toContain('listLearnedSkills')
    expect(profile).toContain('AGENT_SKILL_FAMILY')
  })
})

describe('TC-ASV-02: skills loaded by family — seed (copywriting + registry) + learned', () => {
  it('resolves the family and loads both sources', () => {
    expect(profile).toContain('const family = AGENT_SKILL_FAMILY[agentKey]')
    // Copywriting keeps its rich module; every other family loads from the registry.
    expect(profile).toContain("const isCopywritingFamily = family === 'copywriting'")
    expect(profile).toContain('isCopywritingFamily ? getAllSkillDefinitions() : []')
    expect(profile).toContain('AGENT_SEED_SKILLS[family]()')
    expect(profile).toContain('listLearnedSkills(ctx.tenantId, { family })')
  })
  it('learned load is best-effort (fail-open)', () => {
    expect(profile).toContain('.catch(() => [])')
  })
})

describe('TC-ASV-03: renders a #skills section', () => {
  it('Card has id="skills"', () => {
    expect(profile).toContain('id="skills"')
    expect(profile).toContain('<CardTitle className="text-sm">Skills</CardTitle>')
  })
})

describe('TC-ASV-04: empty-state branch', () => {
  it('shows the empty message when no skills', () => {
    expect(profile).toContain('totalSkills === 0')
    expect(profile).toContain('No skills defined for this agent yet.')
  })
})

describe('TC-ASV-05: seed + learned rows rendered with version + tags', () => {
  it('seed shows slug/version/category/seed; learned shows slug/version/source/status', () => {
    expect(profile).toContain('{s.skillSlug}')
    expect(profile).toContain('v{s.skillVersion}')
    expect(profile).toContain('seed')
    expect(profile).toContain('{s.skill_slug}')
    expect(profile).toContain('v{s.skill_version}')
    expect(profile).toContain('{s.status}')
  })
})

describe('TC-ASV-06: back row links both Agent Monitor and Agent Map', () => {
  it('keeps the Agent Monitor link + adds an Agent Map link', () => {
    expect(profile).toContain('Agent Monitor')
    expect(profile).toContain('Agent Map')
    expect(profile).toContain('`${monitorBase}/map`')
  })
})

describe('TC-ASV-07: catalog skills link deep-links to #skills; traces does not', () => {
  it('skills href ends with #skills', () => {
    expect(catalog).toContain('href={`${profileHref}#skills`}')
  })
  it('traces link uses the bare profile href (no anchor)', () => {
    // The Traces link still points at the bare profileHref; only the skills link
    // carries the #skills anchor.
    expect(catalog).toContain('href={profileHref}')
  })
})

describe('TC-ASV-08: profile remains gated crm.companies.view', () => {
  it('permission unchanged', () => {
    expect(profile).toContain("requirePermission(ctx, 'crm.companies.view')")
  })
})
