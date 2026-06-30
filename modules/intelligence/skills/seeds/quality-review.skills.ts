// MCM v2 — Quality Review agent starter skills. Grounded in the agent's
// responsibility: score generated drafts for compliance, truth, and quality
// before they advance. House style: no em/en dashes, no unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'
import type { QualityReviewScoringParams } from '@/modules/messaging/quality-review/quality-review-agent.types'
import {
  QRA_LENGTH_TARGETS,
  QRA_URGENCY_PHRASES,
  QRA_AI_CORPORATE_PATTERNS,
  QRA_GUILT_LANGUAGE_PATTERNS,
  QRA_VAGUE_CTA_PHRASES,
  QRA_GENERIC_PHRASES,
  QRA_PARTNER_PATTERNS,
  QRA_RECOMMENDATION_MIN_SCORE,
} from '@/modules/messaging/quality-review/quality-review-agent.types'

// The structured scoring parameters the Quality Review scorers read (Slice 2-style
// wiring). The static seed reproduces TODAY'S EXACT constant values by importing
// them directly, so the seed + the scorers' fallbacks can never drift.
export type QualityReviewSkillDefinition = AgentSkillDefinition & { scoring?: QualityReviewScoringParams }

export const QR_SCORING_SKILL_SLUG = 'scoring-parameters'

const SCORING_PARAMETERS_SEED: QualityReviewSkillDefinition = {
  skillSlug:    QR_SCORING_SKILL_SLUG,
  skillVersion: 1,
  category:     'scoring',
  name:         'Scoring parameters',
  guidance:     'Structured, overridable parameters the deterministic Quality Review scorers read: length bands per message type, the phrase lists each scorer flags, and the composite recommendation threshold. Values here mirror the built-in defaults; override per key to retune scoring without code changes.',
  requiredElements:  [],
  forbiddenElements: [],
  examples:          [],
  antiPatterns:      [],
  scoring: {
    lengthTargets: QRA_LENGTH_TARGETS,
    phrases: {
      urgency:     QRA_URGENCY_PHRASES,
      aiCorporate: QRA_AI_CORPORATE_PATTERNS,
      guilt:       QRA_GUILT_LANGUAGE_PATTERNS,
      vagueCta:    QRA_VAGUE_CTA_PHRASES,
      generic:     QRA_GENERIC_PHRASES,
      partner:     QRA_PARTNER_PATTERNS,
    },
    recommendationMinScore: QRA_RECOMMENDATION_MIN_SCORE,
  },
}

// The scoring seed for the resolver's static tier (and the control-off fallback).
export function getQualityReviewScoringSeed(): QualityReviewSkillDefinition {
  return SCORING_PARAMETERS_SEED
}

const SKILLS: AgentSkillDefinition[] = [
  SCORING_PARAMETERS_SEED,
  {
    skillSlug:    'compliance_claim_check',
    skillVersion: 1,
    category:     'compliance',
    name:         'Compliance claim check',
    guidance:     'Reject any draft that states a specific rate or savings figure without a calculated source, or that uses guaranteed-outcome language. Compliance failures block; they are not style notes.',
    requiredElements: [
      'A pass or fail verdict on claim compliance',
      'The specific offending phrase when failing',
    ],
    forbiddenElements: [
      'Passing a draft with a dollar or percent savings figure that has no calculated source',
      'Passing guaranteed-outcome language',
    ],
    examples: [
      'Draft says "save 30 percent" with no calculation: fail with the offending phrase.',
      'Draft says "worth reviewing what the analysis could find": pass.',
    ],
    antiPatterns: [
      'Treating a hard compliance miss as a soft suggestion',
      'Letting a specific figure through because the rest reads well',
    ],
  },
  {
    skillSlug:    'truth_grounding',
    skillVersion: 1,
    category:     'truth',
    name:         'Truth grounding',
    guidance:     'Every concrete claim in the draft must trace to a provided field or finding. Flag invented facts, fabricated prior conversations, and references to reviews that did not happen.',
    requiredElements: [
      'A check that each concrete claim maps to a source field',
      'A flag listing any ungrounded claim',
    ],
    forbiddenElements: [
      'Passing a draft that references a conversation with no notes',
      'Passing an invented operational detail about the merchant',
    ],
    examples: [
      'Draft cites "as we discussed at the expo" with no conversation notes: flag it.',
      'Draft references only fields present in the lead context: pass.',
    ],
    antiPatterns: [
      'Assuming a plausible-sounding claim is true',
      'Grading tone while ignoring fabricated facts',
    ],
  },
  {
    skillSlug:    'single_cta_check',
    skillVersion: 1,
    category:     'structure',
    name:         'Single CTA check',
    guidance:     'A draft should ask for exactly one next step. Multiple competing calls to action dilute the response and should be flagged.',
    requiredElements: [
      'A count of distinct calls to action',
      'A flag when more than one is present',
    ],
    forbiddenElements: [
      'Passing a draft with two or more competing asks',
      'Passing a draft with no clear next step',
    ],
    examples: [
      'One scheduling link and nothing else: pass.',
      'Reply to me, book a call, and visit the site: flag for multiple CTAs.',
    ],
    antiPatterns: [
      'Allowing a stacked list of next steps',
      'Counting a sign-off as a CTA',
    ],
  },
  {
    skillSlug:    'personalization_presence',
    skillVersion: 1,
    category:     'quality',
    name:         'Personalization presence',
    guidance:     'Confirm at least one specific, grounded personalization detail is present and reads naturally. Generic mail-merge tokens left unfilled are a failure.',
    requiredElements: [
      'A check that at least one specific detail is present',
      'A check that no unresolved merge tokens remain',
    ],
    forbiddenElements: [
      'Passing a draft containing a literal unresolved token',
      'Counting a bare first name as sufficient personalization',
    ],
    examples: [
      'Draft references the merchant industry context naturally: pass.',
      'Draft still contains a placeholder token: fail.',
    ],
    antiPatterns: [
      'Accepting a generic template with only a name filled in',
      'Treating forced personalization as natural',
    ],
  },
  {
    skillSlug:    'length_band',
    skillVersion: 1,
    category:     'structure',
    name:         'Length band',
    guidance:     'Score the draft against the length band implied by its channel and sequence position. Over-long late-sequence touches should be flagged.',
    requiredElements: [
      'The expected length band for the draft',
      'A pass or fail against that band',
    ],
    forbiddenElements: [
      'Passing a long body where an ultra-short touch was expected',
    ],
    examples: [
      'Touch 3 expected ultra-short, draft is two short sentences: pass.',
      'First touch expected short, draft is six paragraphs: fail.',
    ],
    antiPatterns: [
      'Ignoring sequence position when judging length',
      'Rewarding length as thoroughness',
    ],
  },
  {
    skillSlug:    'brand_voice_no_em_dash',
    skillVersion: 1,
    category:     'style',
    name:         'Brand voice (no em dash)',
    guidance:     'House voice avoids em and en dashes and avoids filler openers. Flag drafts that use them so the copy stays in the plain, direct house register.',
    requiredElements: [
      'A scan for em or en dashes',
      'A scan for banned filler openers',
    ],
    forbiddenElements: [
      'Passing a draft that contains an em or en dash',
      'Passing a draft that opens with a banned filler phrase',
    ],
    examples: [
      'Draft uses plain hyphens and a direct opener: pass.',
      'Draft uses an em dash in the first line: flag it.',
    ],
    antiPatterns: [
      'Allowing stylistic dashes because the sentence reads well',
      'Overlooking a filler opener in an otherwise clean draft',
    ],
  },
]

export function getAllQualityReviewSkills(): AgentSkillDefinition[] {
  return SKILLS
}
