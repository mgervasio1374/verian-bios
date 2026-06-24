// MCM v2 — Prompt Policy agent starter skills (Class B governance). Grounded in
// the agent's responsibility: validate prompts against policy before model
// routing. Governance seeds are governed, not auto-learned. House style: no
// em/en dashes, no unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'blocked_categories',
    skillVersion: 1,
    category:     'policy',
    name:         'Blocked categories',
    guidance:     'Hard-block prompts that fall into prohibited categories regardless of phrasing. A blocked category stops routing; it is not a warning.',
    requiredElements: [
      'A list of blocked categories',
      'A block outcome when any match',
    ],
    forbiddenElements: [
      'Routing a prompt that matches a blocked category',
      'Downgrading a block to a warning',
    ],
    examples: [
      'A prompt requesting disallowed content is blocked before any model call.',
    ],
    antiPatterns: [
      'Allowing a blocked prompt through because it was reworded',
      'Treating a block as advisory',
    ],
  },
  {
    skillSlug:    'warn_categories',
    skillVersion: 1,
    category:     'policy',
    name:         'Warn categories',
    guidance:     'Attach a warning to prompts in sensitive but allowed categories so downstream review has context. A warning permits routing but records the concern.',
    requiredElements: [
      'A list of warn categories',
      'A warning attached without blocking',
    ],
    forbiddenElements: [
      'Silently routing a sensitive prompt with no warning recorded',
    ],
    examples: [
      'A borderline prompt routes with a recorded warning for reviewer context.',
    ],
    antiPatterns: [
      'Escalating every warning to a block',
      'Dropping the warning so review loses context',
    ],
  },
  {
    skillSlug:    'pass_criteria',
    skillVersion: 1,
    category:     'policy',
    name:         'Pass criteria',
    guidance:     'Define what a clean pass looks like so the default is not an implicit allow. A prompt passes only when it matches no blocked or warn category.',
    requiredElements: [
      'Explicit pass criteria',
      'A default that is not an unconditional allow',
    ],
    forbiddenElements: [
      'Passing by default when no rule matched the prompt shape',
    ],
    examples: [
      'A routine, in-scope prompt with no category hits passes cleanly.',
    ],
    antiPatterns: [
      'Allowing anything that did not explicitly match a block',
      'Leaving pass undefined so everything slips through',
    ],
  },
]

export function getAllPromptPolicySkills(): AgentSkillDefinition[] {
  return SKILLS
}
