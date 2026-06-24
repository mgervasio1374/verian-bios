// MCM v2 — Statement Review agent starter skills. Grounded in the agent's
// responsibility: grade each statement analysis for plausibility and flag
// outliers. House style: no em/en dashes, no unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'plausibility_bounds',
    skillVersion: 1,
    category:     'review',
    name:         'Plausibility bounds',
    guidance:     'Check each figure against plausible bounds for merchant statements (for example an effective rate within a sane range). Out-of-bound values are flagged, not silently accepted.',
    requiredElements: [
      'Per-field plausibility bounds',
      'A flag when a value falls outside its bound',
    ],
    forbiddenElements: [
      'Passing a figure that is physically implausible',
    ],
    examples: [
      'An effective rate far above any real statement is flagged for review.',
    ],
    antiPatterns: [
      'Accepting any number the extractor returned',
      'Treating an obvious outlier as valid',
    ],
  },
  {
    skillSlug:    'outlier_flags',
    skillVersion: 1,
    category:     'review',
    name:         'Outlier flags',
    guidance:     'Flag internal inconsistencies: totals that do not reconcile with components, or fields that contradict each other. The flag explains which figures disagree.',
    requiredElements: [
      'A reconciliation check across related figures',
      'A flag naming the disagreeing fields',
    ],
    forbiddenElements: [
      'Passing a statement whose components do not sum to its total',
    ],
    examples: [
      'Fee components that do not add up to the stated total fees are flagged.',
    ],
    antiPatterns: [
      'Ignoring a total that contradicts its parts',
      'Flagging without saying which fields disagree',
    ],
  },
  {
    skillSlug:    'confidence_grading',
    skillVersion: 1,
    category:     'review',
    name:         'Confidence grading',
    guidance:     'Assign a confidence grade to the analysis based on completeness and consistency. A grade with missing key fields cannot be high confidence.',
    requiredElements: [
      'A confidence grade tied to completeness and consistency',
    ],
    forbiddenElements: [
      'Assigning high confidence when key fields are missing',
    ],
    examples: [
      'All key fields present and reconciled: high confidence.',
    ],
    antiPatterns: [
      'Grading everything high regardless of gaps',
      'Hiding missing fields behind a confident grade',
    ],
  },
]

export function getAllStatementReviewSkills(): AgentSkillDefinition[] {
  return SKILLS
}
