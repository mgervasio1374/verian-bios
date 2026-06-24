// MCM v2 — Subject Line agent starter skills. Grounded in the agent's
// responsibility: produce and rank subject-line options for a draft. House
// style: no em/en dashes, no unsupported rate/savings claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'specificity_over_curiosity',
    skillVersion: 1,
    category:     'quality',
    name:         'Specificity over curiosity',
    guidance:     'Favor a concrete, relevant subject over a vague curiosity hook. The reader should be able to tell what the email is about before opening it.',
    requiredElements: [
      'A concrete reference to topic, company, or context',
    ],
    forbiddenElements: [
      'Pure curiosity bait with no substance',
      'Misleading subjects that do not match the body',
    ],
    examples: [
      'Card mix and interchange for field contractors',
      'Statement review for your processing setup',
    ],
    antiPatterns: [
      'Quick question (with no topic)',
      'You will not believe this',
    ],
  },
  {
    skillSlug:    'length_under_50',
    skillVersion: 1,
    category:     'structure',
    name:         'Length under 50 characters',
    guidance:     'Keep subjects short enough to render fully on mobile, generally under 50 characters. Trim filler words before trimming meaning.',
    requiredElements: [
      'A character-length check with a target under 50',
    ],
    forbiddenElements: [
      'Subjects that truncate the key term on a phone',
    ],
    examples: [
      'Processing review for Apex HVAC',
      'A look at your card categories',
    ],
    antiPatterns: [
      'Long subject lines that bury the point past the fold',
      'Padding with greetings inside the subject',
    ],
  },
  {
    skillSlug:    'value_or_company_anchor',
    skillVersion: 1,
    category:     'relevance',
    name:         'Value or company anchor',
    guidance:     'Anchor the subject to either a concrete value theme or the recipient company so it reads as written for them, not blasted to a list.',
    requiredElements: [
      'A value theme or a company or industry anchor',
    ],
    forbiddenElements: [
      'Generic anchors that fit any recipient',
    ],
    examples: [
      'Interchange categories for HVAC operators',
      'Your statement, a quick read',
    ],
    antiPatterns: [
      'An update for you',
      'Important information',
    ],
  },
  {
    skillSlug:    'no_clickbait_or_spam_triggers',
    skillVersion: 1,
    category:     'compliance',
    name:         'No clickbait or spam triggers',
    guidance:     'Avoid spam-trigger words, all caps, excessive punctuation, and savings claims in the subject. The subject must not promise a specific outcome.',
    requiredElements: [
      'A scan for spam-trigger terms and punctuation abuse',
    ],
    forbiddenElements: [
      'All-caps words or multiple exclamation marks',
      'Specific savings or guaranteed-outcome claims in the subject',
    ],
    examples: [
      'Worth a look at your statement',
      'A question about your card mix',
    ],
    antiPatterns: [
      'SAVE BIG NOW',
      'Guaranteed lowest rates !!!',
    ],
  },
]

export function getAllSubjectLineSkills(): AgentSkillDefinition[] {
  return SKILLS
}
