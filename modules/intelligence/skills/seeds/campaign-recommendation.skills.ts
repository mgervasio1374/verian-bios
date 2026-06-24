// MCM v2 — Campaign Recommendation agent starter skills. Grounded in the agent's
// responsibility: recommend the next campaign or action for a company. House
// style: no em/en dashes, no unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'sequence_fit_by_stage',
    skillVersion: 1,
    category:     'recommendation',
    name:         'Sequence fit by stage',
    guidance:     'Recommend the sequence that matches the relationship stage: cold intro, inbound follow-up, statement nurture, proposal follow-up, or customer nurture. The stage drives the choice.',
    requiredElements: [
      'A stage-to-sequence mapping',
      'The chosen sequence justified by the stage',
    ],
    forbiddenElements: [
      'Recommending a cold sequence for an engaged or customer relationship',
    ],
    examples: [
      'Proposal sent and unanswered: recommend the proposal follow-up sequence.',
    ],
    antiPatterns: [
      'Defaulting every company to the cold intro sequence',
      'Ignoring an active proposal when recommending',
    ],
  },
  {
    skillSlug:    'timing_heuristics',
    skillVersion: 1,
    category:     'recommendation',
    name:         'Timing heuristics',
    guidance:     'Recommend when to act, not just what. Respect recency of the last touch and avoid stacking sends. Suggest a wait when a recent touch is still in flight.',
    requiredElements: [
      'A timing recommendation tied to last-touch recency',
    ],
    forbiddenElements: [
      'Recommending an immediate send on top of a recent one',
    ],
    examples: [
      'Last touch two days ago: recommend waiting before the next.',
    ],
    antiPatterns: [
      'Recommending back-to-back sends',
      'Ignoring the last-contacted date',
    ],
  },
  {
    skillSlug:    'channel_recommendation',
    skillVersion: 1,
    category:     'recommendation',
    name:         'Channel recommendation',
    guidance:     'Recommend the channel that fits the relationship and available contact data. Do not recommend a channel for which there is no usable contact point.',
    requiredElements: [
      'A channel choice gated on available contact data',
    ],
    forbiddenElements: [
      'Recommending a channel with no contact handle on file',
    ],
    examples: [
      'Valid email and no phone on file: recommend email.',
    ],
    antiPatterns: [
      'Recommending a call with no phone number present',
    ],
  },
  {
    skillSlug:    'suppress_when',
    skillVersion: 1,
    category:     'gating',
    name:         'Suppress when',
    guidance:     'Recommend no action when suppression conditions apply: opted out, do-not-contact, an active reply, or an in-flight sequence. Recommending nothing is a valid output.',
    requiredElements: [
      'A list of suppression conditions',
      'A no-action recommendation when any apply',
    ],
    forbiddenElements: [
      'Recommending outreach to an opted-out or replied contact',
    ],
    examples: [
      'A human reply was detected: recommend pausing automated outreach.',
    ],
    antiPatterns: [
      'Always recommending a next send',
      'Recommending a touch into an active reply thread',
    ],
  },
]

export function getAllCampaignRecommendationSkills(): AgentSkillDefinition[] {
  return SKILLS
}
