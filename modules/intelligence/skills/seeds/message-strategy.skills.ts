// MCM v2 — Message Strategy agent starter skills. Grounded in the agent's
// responsibility: choose the relationship-aware message angle and constraints for
// a lead. House style: no em/en dashes, no unsupported rate/savings claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'relationship_stage_angle',
    skillVersion: 1,
    category:     'strategy',
    name:         'Relationship-stage angle',
    guidance:     'Pick the angle from where the relationship actually stands: cold, inbound, mid-sequence, post-proposal, or existing customer. The chosen angle must match the strongest known signal, not a default cold opener.',
    requiredElements: [
      'A stage classification derived from the lead context (cold, inbound, engaged, customer)',
      'An angle that matches that stage',
    ],
    forbiddenElements: [
      'Treating an inbound or existing relationship as a cold prospect',
      'Defaulting to cold outreach when engagement signals exist',
    ],
    examples: [
      'Inbound form submission within 48 hours: choose a responsive acknowledgment angle, not discovery.',
      'No reply across two prior touches: choose a fresh-angle reframe, not a repeat.',
    ],
    antiPatterns: [
      'Always selecting the cold-outreach angle regardless of stage',
      'Ignoring prior-message context when one exists',
    ],
  },
  {
    skillSlug:    'customer_vs_prospect_framing',
    skillVersion: 1,
    category:     'strategy',
    name:         'Customer vs prospect framing',
    guidance:     'Frame existing customers as a relationship to maintain and prospects as a relationship to earn. Never re-introduce the company to someone who already buys from it.',
    requiredElements: [
      'A framing flag indicating customer or prospect',
      'Constraints that suppress prospecting language for customers',
    ],
    forbiddenElements: [
      'Re-pitching the company to an existing customer',
      'Account-management framing for a net-new prospect',
    ],
    examples: [
      'Customer with an active account: frame around a periodic review or operational check-in.',
      'Net-new prospect: frame around relevance and a low-friction first step.',
    ],
    antiPatterns: [
      'Sending a customer a cold-prospect introduction',
      'Offering a first-touch discount frame to a long-term customer',
    ],
  },
  {
    skillSlug:    'statement_evidence_angle',
    skillVersion: 1,
    category:     'strategy',
    name:         'Statement-evidence angle',
    guidance:     'When a reviewed statement exists, lead the angle with a grounded finding from that review. When no statement exists, the angle must invite one rather than imply findings.',
    requiredElements: [
      'A gate on whether a completed review is available',
      'Angle text that only references findings when they are present',
    ],
    forbiddenElements: [
      'Implying findings before any statement has been reviewed',
      'Referencing a specific figure without a calculated source',
    ],
    examples: [
      'Completed review present: lead with one specific category finding.',
      'No statement yet: invite a statement review as the next step.',
    ],
    antiPatterns: [
      'Claiming an interchange finding before a review exists',
      'Hinting at savings to manufacture urgency',
    ],
  },
  {
    skillSlug:    'objection_preempt',
    skillVersion: 1,
    category:     'strategy',
    name:         'Objection pre-empt',
    guidance:     'Anticipate the most likely objection for the segment (switching cost, skepticism about processors, time) and select an angle that addresses it briefly without arguing.',
    requiredElements: [
      'One anticipated objection for the segment',
      'An angle that lowers that objection, not a rebuttal',
    ],
    forbiddenElements: [
      'Arguing against an objection the prospect has not raised',
      'Over-explaining to the point of defensiveness',
    ],
    examples: [
      'Switching-cost worry: frame the first step as analysis-only, no commitment.',
      'Processor skepticism: lead with an observation, not a claim.',
    ],
    antiPatterns: [
      'Listing rebuttals to objections nobody raised',
      'Turning the message into a debate',
    ],
  },
  {
    skillSlug:    'channel_constraints',
    skillVersion: 1,
    category:     'constraint',
    name:         'Channel constraints',
    guidance:     'Set length and tone constraints to the channel and sequence position. Later touches must be shorter and use a different angle than earlier ones.',
    requiredElements: [
      'A length band tied to channel and sequence position',
      'A differentiation note versus the prior touch',
    ],
    forbiddenElements: [
      'Repeating the prior touch with a new subject only',
      'Long bodies at late sequence positions',
    ],
    examples: [
      'Email touch 3: ultra-short, single question, new angle.',
      'First email: short, one observation and one clear next step.',
    ],
    antiPatterns: [
      'Identical body length and structure across every touch',
      'Escalating length as the sequence progresses',
    ],
  },
]

export function getAllMessageStrategySkills(): AgentSkillDefinition[] {
  return SKILLS
}
