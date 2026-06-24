// MCM v2 — Company Scoring agent starter skills. Grounded in the agent's
// responsibility: compute company-level fit/intent scores from enrichment
// signals. House style: no em/en dashes, no unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'firmographic_fit',
    skillVersion: 1,
    category:     'scoring',
    name:         'Firmographic fit',
    guidance:     'Score fit from firmographics that map to card-processing suitability: industry, business model, estimated size, and locations. Use only enrichment fields that are present.',
    requiredElements: [
      'Firmographic signals with weights',
      'A rule to skip absent fields rather than guess',
    ],
    forbiddenElements: [
      'Inferring size or volume with no supporting field',
    ],
    examples: [
      'Multi-location service business in a served industry scores high on firmographic fit.',
    ],
    antiPatterns: [
      'Assuming volume from headcount with no data',
      'Penalizing a company for a missing field',
    ],
  },
  {
    skillSlug:    'intent_signals',
    skillVersion: 1,
    category:     'scoring',
    name:         'Intent signals',
    guidance:     'Layer intent on top of fit: recent engagement, inbound activity, or a submitted statement at the company level. Keep intent and fit as separate components.',
    requiredElements: [
      'Intent signals tracked separately from fit',
    ],
    forbiddenElements: [
      'Folding intent into the fit component so the two cannot be read apart',
    ],
    examples: [
      'A company with a recent inbound and a reviewed statement carries strong intent.',
    ],
    antiPatterns: [
      'Reporting one blended number with no fit/intent split',
      'Treating a stale signal as current intent',
    ],
  },
  {
    skillSlug:    'enrichment_confidence_weighting',
    skillVersion: 1,
    category:     'confidence',
    name:         'Enrichment confidence weighting',
    guidance:     'Weight each enrichment signal by its source confidence. Low-confidence or stale enrichment should move the score less than verified data.',
    requiredElements: [
      'A confidence weight per enrichment source',
      'A reduced influence for low-confidence fields',
    ],
    forbiddenElements: [
      'Treating a low-confidence guess as a verified fact',
    ],
    examples: [
      'A verified industry field outweighs a low-confidence inferred one.',
    ],
    antiPatterns: [
      'Scoring all sources at equal weight regardless of confidence',
      'Letting a stale enrichment dominate the score',
    ],
  },
]

export function getAllCompanyScoringSkills(): AgentSkillDefinition[] {
  return SKILLS
}
