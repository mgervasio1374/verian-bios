// ============================================================
// MCM — Quality Review skill resolver (Slice 2-style wiring)
//
// Resolves the quality_review 'scoring-parameters' skill through the shared 3-tier
// plumbing (resolveSkillTiered): tenant DB row -> global DB row -> static seed.
// Mirrors resolveCopywritingSkill. Malformed definition jsonb falls through to the
// next tier (never throws). The static seed reproduces today's constants, so the
// off-path / no-skill path is byte-identical to pre-wiring behavior.
// ============================================================

import { resolveSkillTiered } from '@/modules/intelligence/skills/agent-skill.resolver'
import {
  getQualityReviewScoringSeed,
  QR_SCORING_SKILL_SLUG,
  type QualityReviewSkillDefinition,
} from '@/modules/intelligence/skills/seeds/quality-review.skills'
import type { LearnedSkillRow } from '@/modules/messaging/skills/learned-skill.repo'
import type { QualityReviewScoringParams } from '@/modules/messaging/quality-review/quality-review-agent.types'

export { QR_SCORING_SKILL_SLUG, getQualityReviewScoringSeed }
export type { QualityReviewSkillDefinition }

const QR_FAMILY = 'quality_review'

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

function isBand(v: unknown): v is { min: number; max: number } {
  return !!v && typeof v === 'object'
    && typeof (v as Record<string, unknown>).min === 'number'
    && typeof (v as Record<string, unknown>).max === 'number'
}

// Defensively parse the `scoring` block. Returns:
//   undefined  -> no scoring present (valid; resolver still returns the skill)
//   null       -> scoring present but the wrong TYPE (malformed -> fall through)
//   object     -> the well-typed subset (per-key tolerant; unknown keys dropped)
function parseScoring(raw: unknown): QualityReviewScoringParams | null | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: QualityReviewScoringParams = {}

  if (r.lengthTargets && typeof r.lengthTargets === 'object') {
    const bands: Record<string, { min: number; max: number }> = {}
    for (const [k, v] of Object.entries(r.lengthTargets as Record<string, unknown>)) {
      if (isBand(v)) bands[k] = { min: v.min, max: v.max }
    }
    if (Object.keys(bands).length > 0) out.lengthTargets = bands
  }

  if (r.phrases && typeof r.phrases === 'object') {
    const p = r.phrases as Record<string, unknown>
    const phrases: NonNullable<QualityReviewScoringParams['phrases']> = {}
    for (const key of ['urgency', 'aiCorporate', 'guilt', 'vagueCta', 'generic', 'partner'] as const) {
      if (isStringArray(p[key])) phrases[key] = p[key] as string[]
    }
    if (Object.keys(phrases).length > 0) out.phrases = phrases
  }

  if (typeof r.recommendationMinScore === 'number') {
    out.recommendationMinScore = r.recommendationMinScore
  }

  return out
}

// Builds a QualityReviewSkillDefinition from a learned_skills row. Tolerant of
// missing/extra base keys; returns null only when the definition is unusable
// (not an object, or a present-but-mistyped scoring block).
function parseDefinition(
  row: LearnedSkillRow,
  slug: string,
  version: number,
): QualityReviewSkillDefinition | null {
  const d = row.definition
  if (!d || typeof d !== 'object') return null
  const def = d as Record<string, unknown>

  const scoring = parseScoring(def.scoring)
  if (scoring === null) return null // present but malformed -> fall through to seed

  return {
    skillSlug:         slug,
    skillVersion:      version,
    category:          typeof def.category === 'string' ? def.category : (row.category ?? 'scoring'),
    name:              typeof def.name === 'string' ? def.name : slug,
    guidance:          typeof def.guidance === 'string' ? def.guidance : '',
    requiredElements:  isStringArray(def.requiredElements)  ? def.requiredElements  : [],
    forbiddenElements: isStringArray(def.forbiddenElements) ? def.forbiddenElements : [],
    examples:          isStringArray(def.examples)          ? def.examples          : [],
    antiPatterns:      isStringArray(def.antiPatterns)      ? def.antiPatterns      : [],
    ...(scoring ? { scoring } : {}),
  }
}

export function resolveQualityReviewSkill(
  tenantId: string,
  slug:     string,
  version:  number,
): Promise<QualityReviewSkillDefinition | null> {
  return resolveSkillTiered(
    tenantId,
    QR_FAMILY,
    slug,
    version,
    parseDefinition,
    (s, v) => (s === QR_SCORING_SKILL_SLUG && v === 1 ? getQualityReviewScoringSeed() : null),
  )
}
