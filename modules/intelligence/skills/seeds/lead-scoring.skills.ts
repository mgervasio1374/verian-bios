// MCM v2 — Lead Scoring agent starter skills. Grounded in the agent's
// responsibility: score inbound leads for fit and urgency to prioritize
// outreach. House style: no em/en dashes, no unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'fit_signals',
    skillVersion: 1,
    category:     'scoring',
    name:         'Fit signals',
    guidance:     'Reward signals that indicate a good processing-cost fit: card-accepting business type, plausible volume, and an industry the program serves well. Fit reflects suitability, not intent.',
    requiredElements: [
      'A set of positive fit signals with weights',
      'A separation between fit and urgency',
    ],
    forbiddenElements: [
      'Scoring fit from intent signals like a recent reply',
      'Rewarding signals with no basis in the data',
    ],
    examples: [
      'Field-service business that takes cards across technicians scores high on fit.',
    ],
    antiPatterns: [
      'Conflating a fast reply with good fit',
      'Boosting fit for an industry with no card volume',
    ],
  },
  {
    skillSlug:    'urgency_signals',
    skillVersion: 1,
    category:     'scoring',
    name:         'Urgency signals',
    guidance:     'Reward time-sensitive signals: a recent inbound, a submitted statement, or a stated renewal window. Urgency drives ordering within a fit band, not fit itself.',
    requiredElements: [
      'A set of urgency signals with recency weighting',
    ],
    forbiddenElements: [
      'Treating an old signal as fresh',
      'Letting urgency override a clear disqualifier',
    ],
    examples: [
      'Statement submitted in the last week raises urgency.',
    ],
    antiPatterns: [
      'Scoring a 90-day-old form as urgent',
      'Promoting a disqualified lead because it replied',
    ],
  },
  {
    skillSlug:    'disqualifiers',
    skillVersion: 1,
    category:     'gating',
    name:         'Disqualifiers',
    guidance:     'Hard disqualifiers cap or zero the score regardless of other signals: opted out, non-card business, or out of serviceable scope.',
    requiredElements: [
      'A list of disqualifiers that cap the score',
    ],
    forbiddenElements: [
      'Allowing positive signals to override a hard disqualifier',
    ],
    examples: [
      'Recorded opt-out caps the score to the bottom band.',
    ],
    antiPatterns: [
      'Scoring an opted-out contact as a priority',
      'Ignoring an out-of-scope business type',
    ],
  },
  {
    skillSlug:    'score_band_definitions',
    skillVersion: 1,
    category:     'scoring',
    name:         'Score band definitions',
    guidance:     'Map the numeric score to clear action bands (priority, standard, nurture, skip) so the score drives a decision rather than sitting as a raw number.',
    requiredElements: [
      'Named bands with thresholds',
      'A recommended action per band',
    ],
    forbiddenElements: [
      'Bands that overlap or leave gaps',
    ],
    examples: [
      'Priority band routes to immediate outreach; nurture band routes to a slow sequence.',
    ],
    antiPatterns: [
      'Reporting a raw score with no actionable band',
      'Shifting band thresholds per run without reason',
    ],
  },
]

export function getAllLeadScoringSkills(): AgentSkillDefinition[] {
  return SKILLS
}
