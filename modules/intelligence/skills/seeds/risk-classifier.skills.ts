// MCM v2 — Risk Classifier agent starter skills (Class B governance). Grounded in
// the agent's responsibility: classify task/content risk to drive approval
// routing. Governed, not auto-learned. House style: no em/en dashes, no
// unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'risk_tiers',
    skillVersion: 1,
    category:     'policy',
    name:         'Risk tiers',
    guidance:     'Define a small, ordered set of risk tiers (for example low, elevated, high) with non-overlapping meanings so every task lands in exactly one tier.',
    requiredElements: [
      'An ordered list of named tiers',
      'A rule that assigns exactly one tier per task',
    ],
    forbiddenElements: [
      'Overlapping tiers that allow two classifications',
      'A task left with no tier',
    ],
    examples: [
      'A read-only summary task lands in the low tier.',
    ],
    antiPatterns: [
      'Inventing a new tier per task',
      'Leaving ambiguous tasks unclassified',
    ],
  },
  {
    skillSlug:    'tier_signals',
    skillVersion: 1,
    category:     'policy',
    name:         'Tier signals',
    guidance:     'Map concrete signals to tiers: production side effects, irreversible actions, and external sends raise the tier; read-only and dry-run lower it.',
    requiredElements: [
      'Signals mapped to the tier they imply',
    ],
    forbiddenElements: [
      'Raising risk with no signal behind it',
    ],
    examples: [
      'A task that sends external email raises the tier above read-only work.',
    ],
    antiPatterns: [
      'Classifying by gut with no signal',
      'Treating a dry-run as high risk',
    ],
  },
  {
    skillSlug:    'profile_mapping',
    skillVersion: 1,
    category:     'policy',
    name:         'Profile mapping',
    guidance:     'Map each tier to a downstream approval profile so the classification drives routing rather than sitting inert. Higher tiers map to stricter approval.',
    requiredElements: [
      'A tier-to-approval-profile mapping',
    ],
    forbiddenElements: [
      'A high tier that maps to no additional control',
    ],
    examples: [
      'The high tier maps to a human-approval profile.',
    ],
    antiPatterns: [
      'Classifying risk but routing everything the same way',
    ],
  },
]

export function getAllRiskClassifierSkills(): AgentSkillDefinition[] {
  return SKILLS
}
