// ============================================================
// MCM v2 — Async copywriting skill resolver (learning-loop read path)
//
// Resolves a copywriting skill through the DB-backed learned_skills store with a
// fallback to the static seed (getSkillDefinition). This is PURELY ADDITIVE — the
// existing sync getSkillDefinition and all current copywriting callers are
// unchanged. Wiring this into generation is a deliberate later slice.
//
// Resolution order:
//   1. DB tenant-specific active row   (learned_skills, tenant_id = tenantId)
//   2. DB global active row            (learned_skills, tenant_id IS NULL)
//   3. Static seed                     (getSkillDefinition)
//   -> null if none of the above resolve.
//
// Malformed definition jsonb falls through to the next tier rather than throwing.
// No side effects beyond the reads.
// ============================================================

import type { CopywritingSkillDefinition, SkillCategory } from './copywriting-agent.types'
import { getSkillDefinition } from './copywriting-agent.skill-definitions'
import { getLearnedSkill, type LearnedSkillRow } from '@/modules/messaging/skills/learned-skill.repo'

const COPYWRITING_FAMILY = 'copywriting'

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  'context', 'audience', 'positioning', 'tone', 'compliance',
])

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

// Defensively parse a learned_skills.definition jsonb into a CopywritingSkillDefinition.
// Returns null on any shape mismatch so the caller can fall through to the next tier.
function parseDefinition(
  row: LearnedSkillRow,
  slug: string,
  version: number,
): CopywritingSkillDefinition | null {
  const d = row.definition
  if (!d || typeof d !== 'object') return null
  const def = d as Record<string, unknown>

  // category may live on the definition or fall back to the column.
  const rawCategory = (typeof def.category === 'string' ? def.category : row.category) ?? ''
  if (!VALID_CATEGORIES.has(rawCategory)) return null

  if (typeof def.toneRules !== 'string') return null
  if (typeof def.messagingRules !== 'string') return null
  if (typeof def.ctaGuidance !== 'string') return null
  if (typeof def.complianceNotes !== 'string') return null
  if (!isStringArray(def.requiredElements)) return null
  if (!isStringArray(def.forbiddenElements)) return null
  if (!isStringArray(def.examples)) return null
  if (!isStringArray(def.antiPatterns)) return null

  return {
    skillSlug:         slug,
    skillVersion:      version,
    category:          rawCategory as SkillCategory,
    toneRules:         def.toneRules,
    messagingRules:    def.messagingRules,
    requiredElements:  def.requiredElements,
    forbiddenElements: def.forbiddenElements,
    ctaGuidance:       def.ctaGuidance,
    complianceNotes:   def.complianceNotes,
    examples:          def.examples,
    antiPatterns:      def.antiPatterns,
  }
}

// Reads one DB tier (tenant-specific when tenantId is a string, global when null),
// returning the parsed definition only when the row is active and well-formed.
async function resolveDbTier(
  tenantId: string | null,
  slug: string,
  version: number,
): Promise<CopywritingSkillDefinition | null> {
  const row = await getLearnedSkill(tenantId, COPYWRITING_FAMILY, slug, version)
  if (!row || row.status !== 'active') return null
  return parseDefinition(row, slug, version)
}

export async function resolveCopywritingSkill(
  tenantId: string,
  slug:     string,
  version:  number,
): Promise<CopywritingSkillDefinition | null> {
  // 1. DB tenant-specific active row
  const tenantSkill = await resolveDbTier(tenantId, slug, version)
  if (tenantSkill) return tenantSkill

  // 2. DB global active row (tenant_id IS NULL)
  const globalSkill = await resolveDbTier(null, slug, version)
  if (globalSkill) return globalSkill

  // 3. Static seed fallback
  return getSkillDefinition(slug, version)
}
