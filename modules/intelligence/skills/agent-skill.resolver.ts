// ============================================================
// MCM v2 — Generic agent skill resolver (seed-agent-skills slice)
//
// Generalizes the copywriting 3-tier resolution to any agent family:
//   1. DB tenant-specific active row   (learned_skills, tenant_id = tenantId)
//   2. DB global active row            (learned_skills, tenant_id IS NULL)
//   3. Static seed registry            (AGENT_SEED_SKILLS)
//   -> null if none resolve.
//
// resolveSkillTiered is the shared plumbing both this resolver and the copywriting
// resolver delegate to, so the tier order is defined once. Malformed definition
// jsonb falls through to the next tier rather than throwing. No side effects.
//
// PLUMBING ONLY — no agent consumes resolveAgentSkill yet (wiring is a later slice).
// ============================================================

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'
import { getSeedSkill } from '@/modules/intelligence/skills/agent-seed-skills'
import { getLearnedSkill, type LearnedSkillRow } from '@/modules/messaging/skills/learned-skill.repo'

// Parser: row.definition jsonb -> T | null. Returns null on shape mismatch so the
// caller falls through to the next tier.
export type SkillRowParser<T> = (row: LearnedSkillRow, slug: string, version: number) => T | null

// Static seed lookup for the final tier.
export type StaticSeedLookup<T> = (slug: string, version: number) => T | null

// Reads one DB tier (tenant-specific when tenantId is a string, global when null),
// returning the parsed definition only when the row is active and well-formed.
async function resolveDbTier<T>(
  tenantId: string | null,
  family: string,
  slug: string,
  version: number,
  parse: SkillRowParser<T>,
): Promise<T | null> {
  const row = await getLearnedSkill(tenantId, family, slug, version)
  if (!row || row.status !== 'active') return null
  return parse(row, slug, version)
}

// Shared 3-tier control flow: tenant DB -> global DB -> static seed.
export async function resolveSkillTiered<T>(
  tenantId: string,
  family: string,
  slug: string,
  version: number,
  parse: SkillRowParser<T>,
  staticSeed: StaticSeedLookup<T>,
): Promise<T | null> {
  const tenantSkill = await resolveDbTier(tenantId, family, slug, version, parse)
  if (tenantSkill) return tenantSkill

  const globalSkill = await resolveDbTier(null, family, slug, version, parse)
  if (globalSkill) return globalSkill

  return staticSeed(slug, version)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

// Defensively parse a learned_skills.definition jsonb into the generic
// AgentSkillDefinition shape. Returns null on any mismatch.
function parseAgentDefinition(
  row: LearnedSkillRow,
  slug: string,
  version: number,
): AgentSkillDefinition | null {
  const d = row.definition
  if (!d || typeof d !== 'object') return null
  const def = d as Record<string, unknown>

  const category = (typeof def.category === 'string' ? def.category : row.category) ?? ''
  if (!category) return null
  if (typeof def.name !== 'string') return null
  if (typeof def.guidance !== 'string') return null
  if (!isStringArray(def.requiredElements)) return null
  if (!isStringArray(def.forbiddenElements)) return null
  if (!isStringArray(def.examples)) return null
  if (!isStringArray(def.antiPatterns)) return null

  return {
    skillSlug:         slug,
    skillVersion:      version,
    category,
    name:              def.name,
    guidance:          def.guidance,
    requiredElements:  def.requiredElements,
    forbiddenElements: def.forbiddenElements,
    examples:          def.examples,
    antiPatterns:      def.antiPatterns,
  }
}

// Generic 3-tier resolver for any non-copywriting family. Copywriting has its own
// richer resolver (resolveCopywritingSkill) that delegates to the same plumbing.
export function resolveAgentSkill(
  family:   string,
  tenantId: string,
  slug:     string,
  version:  number,
): Promise<AgentSkillDefinition | null> {
  return resolveSkillTiered(
    tenantId,
    family,
    slug,
    version,
    parseAgentDefinition,
    (s, v) => getSeedSkill(family, s, v),
  )
}
