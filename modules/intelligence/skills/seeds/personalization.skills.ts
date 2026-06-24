// MCM v2 — Personalization agent starter skills. Grounded in the agent's
// responsibility: inject lead-specific personalization into copy. House style:
// no em/en dashes, no unsupported rate/savings claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'structured_fields_only',
    skillVersion: 1,
    category:     'truth',
    name:         'Structured fields only',
    guidance:     'Personalize only from structured, provided fields (name, company, industry, city, state). Do not infer details that are not in the data.',
    requiredElements: [
      'A mapping from each inserted detail to a source field',
    ],
    forbiddenElements: [
      'Inserting a detail with no backing field',
      'Guessing the merchant size or processor from the name',
    ],
    examples: [
      'Insert the company industry when the industry field is present.',
      'Skip a location reference when city and state are both empty.',
    ],
    antiPatterns: [
      'Inferring revenue from a company name',
      'Filling a gap with a plausible guess',
    ],
  },
  {
    skillSlug:    'no_fabricated_claims',
    skillVersion: 1,
    category:     'compliance',
    name:         'No fabricated claims',
    guidance:     'Personalization must never introduce a savings figure, a current processor, or a finding that the source data does not contain.',
    requiredElements: [
      'A check that no claim is added beyond the provided fields',
    ],
    forbiddenElements: [
      'Adding a specific savings number during personalization',
      'Naming a current processor that is not in the data',
    ],
    examples: [
      'Reference the industry context without attaching a savings figure.',
    ],
    antiPatterns: [
      'Personalizing by inventing the merchant current rate',
      'Adding an unverified competitor name for color',
    ],
  },
  {
    skillSlug:    'one_specific_detail',
    skillVersion: 1,
    category:     'quality',
    name:         'One specific detail',
    guidance:     'Aim for one specific, relevant detail that proves the message was written for this recipient. More than one can read as scraped.',
    requiredElements: [
      'Exactly one prominent specific detail tied to the recipient',
    ],
    forbiddenElements: [
      'Stacking several scraped details into one sentence',
    ],
    examples: [
      'One natural reference to the merchant industry context.',
    ],
    antiPatterns: [
      'Listing city, founding year, and headcount in one line',
      'Over-personalizing to the point of sounding surveilled',
    ],
  },
  {
    skillSlug:    'natural_not_templated',
    skillVersion: 1,
    category:     'style',
    name:         'Natural, not templated',
    guidance:     'Inserted details must read as natural sentences, not visible template slots. No leftover tokens, no awkward grammar from a dropped-in value.',
    requiredElements: [
      'A check that no literal token remains',
      'A grammar check around each inserted value',
    ],
    forbiddenElements: [
      'A visible placeholder token in the output',
      'A sentence that breaks grammatically when the value is inserted',
    ],
    examples: [
      'Reads as a normal sentence with the company name in place.',
    ],
    antiPatterns: [
      'Leaving a raw token in the body',
      'Hi there, owner of company,',
    ],
  },
]

export function getAllPersonalizationSkills(): AgentSkillDefinition[] {
  return SKILLS
}
