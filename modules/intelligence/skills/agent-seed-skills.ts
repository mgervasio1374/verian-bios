// MCM v2 — Agent seed-skill registry. Maps each skill family to its static
// starter-skill provider, replacing the hardcoded family==='copywriting' branch
// in the profile/map. Copywriting keeps its own richer module and render; it is
// resolved separately and is NOT in this generic registry.
//
// Class B (governance) families are listed in AGENT_NON_LEARNABLE_FAMILIES: their
// seeds are governed, not auto-learned. The future auto-learn feed and the UI use
// that constant to mark them "governed (not auto-learned)".

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'
import { getAllMessageStrategySkills } from '@/modules/intelligence/skills/seeds/message-strategy.skills'
import { getAllQualityReviewSkills } from '@/modules/intelligence/skills/seeds/quality-review.skills'
import { getAllSubjectLineSkills } from '@/modules/intelligence/skills/seeds/subject-line.skills'
import { getAllPersonalizationSkills } from '@/modules/intelligence/skills/seeds/personalization.skills'
import { getAllLeadScoringSkills } from '@/modules/intelligence/skills/seeds/lead-scoring.skills'
import { getAllCompanyScoringSkills } from '@/modules/intelligence/skills/seeds/company-scoring.skills'
import { getAllCampaignRecommendationSkills } from '@/modules/intelligence/skills/seeds/campaign-recommendation.skills'
import { getAllStatementExtractionSkills } from '@/modules/intelligence/skills/seeds/statement-extraction.skills'
import { getAllStatementReviewSkills } from '@/modules/intelligence/skills/seeds/statement-review.skills'
import { getAllSalesOpsIntelligenceSkills } from '@/modules/intelligence/skills/seeds/sales-ops-intelligence.skills'
import { getAllPromptPolicySkills } from '@/modules/intelligence/skills/seeds/prompt-policy.skills'
import { getAllRiskClassifierSkills } from '@/modules/intelligence/skills/seeds/risk-classifier.skills'
import { getAllApprovalGateSkills } from '@/modules/intelligence/skills/seeds/approval-gate.skills'

export const AGENT_SEED_SKILLS: Record<string, () => AgentSkillDefinition[]> = {
  // Class A (learning) — messaging
  message_strategy:        getAllMessageStrategySkills,
  quality_review:          getAllQualityReviewSkills,
  subject_line:            getAllSubjectLineSkills,
  personalization:         getAllPersonalizationSkills,
  // Class A (learning) — business intelligence
  lead_scoring:            getAllLeadScoringSkills,
  company_scoring:         getAllCompanyScoringSkills,
  campaign_recommendation: getAllCampaignRecommendationSkills,
  statement_extraction:    getAllStatementExtractionSkills,
  statement_review:        getAllStatementReviewSkills,
  sales_ops_intelligence:  getAllSalesOpsIntelligenceSkills,
  // Class B (governance)
  prompt_policy:           getAllPromptPolicySkills,
  risk_classifier:         getAllRiskClassifierSkills,
  approval_gate:           getAllApprovalGateSkills,
}

// Class B governance families — seeds are governed, not auto-learned. The UI marks
// these and the future auto-learn feed (Slice 4) excludes them.
export const AGENT_NON_LEARNABLE_FAMILIES = ['prompt_policy', 'risk_classifier', 'approval_gate'] as const

export function isNonLearnableFamily(family: string | null | undefined): boolean {
  return !!family && (AGENT_NON_LEARNABLE_FAMILIES as readonly string[]).includes(family)
}

// Look up a single seed skill from the registry by family/slug/version.
export function getSeedSkill(
  family: string,
  slug: string,
  version: number,
): AgentSkillDefinition | null {
  const provider = AGENT_SEED_SKILLS[family]
  if (!provider) return null
  return provider().find(s => s.skillSlug === slug && s.skillVersion === version) ?? null
}
