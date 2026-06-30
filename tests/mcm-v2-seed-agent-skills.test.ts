// mcm-v2 — Seed agent skills (generalize the skill model to all Class A + B
// agents). TC-SAS-01..09

import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  AGENT_SEED_SKILLS,
  AGENT_NON_LEARNABLE_FAMILIES,
  isNonLearnableFamily,
  getSeedSkill,
} from '@/modules/intelligence/skills/agent-seed-skills'
import { AGENT_SKILL_FAMILY } from '@/modules/intelligence/agent-workflows'
import { getAllSkillDefinitions } from '@/modules/messaging/copywriting/copywriting-agent.skill-definitions'

// Documented starter slugs per family (from the slice spec).
const EXPECTED_SLUGS: Record<string, string[]> = {
  message_strategy:        ['relationship_stage_angle', 'customer_vs_prospect_framing', 'statement_evidence_angle', 'objection_preempt', 'channel_constraints'],
  quality_review:          ['compliance_claim_check', 'truth_grounding', 'single_cta_check', 'personalization_presence', 'length_band', 'brand_voice_no_em_dash', 'scoring-parameters'],
  subject_line:            ['specificity_over_curiosity', 'length_under_50', 'value_or_company_anchor', 'no_clickbait_or_spam_triggers'],
  personalization:         ['structured_fields_only', 'no_fabricated_claims', 'one_specific_detail', 'natural_not_templated'],
  lead_scoring:            ['fit_signals', 'urgency_signals', 'disqualifiers', 'score_band_definitions'],
  company_scoring:         ['firmographic_fit', 'intent_signals', 'enrichment_confidence_weighting'],
  campaign_recommendation: ['sequence_fit_by_stage', 'timing_heuristics', 'channel_recommendation', 'suppress_when'],
  statement_extraction:    ['extract_only_present_figures', 'no_guessing_on_scanned', 'field_normalization'],
  statement_review:        ['plausibility_bounds', 'outlier_flags', 'confidence_grading'],
  sales_ops_intelligence:  ['pipeline_health_signals', 'anomaly_definitions'],
  prompt_policy:           ['blocked_categories', 'warn_categories', 'pass_criteria'],
  risk_classifier:         ['risk_tiers', 'tier_signals', 'profile_mapping'],
  approval_gate:           ['approval_required_conditions', 'auto_pass_conditions', 'escalation_rules'],
}

describe('TC-SAS-01: each family getAll returns its documented slugs', () => {
  for (const [family, slugs] of Object.entries(EXPECTED_SLUGS)) {
    it(`${family} seeds match the documented slug set`, () => {
      const provider = AGENT_SEED_SKILLS[family]
      expect(provider, `registry missing ${family}`).toBeTypeOf('function')
      const got = provider().map(s => s.skillSlug)
      expect(got.sort()).toEqual([...slugs].sort())
    })
  }
})

describe('TC-SAS-02: every seed is well-formed (shape + v1)', () => {
  it('all generic seeds carry the AgentSkillDefinition fields', () => {
    for (const provider of Object.values(AGENT_SEED_SKILLS)) {
      for (const s of provider()) {
        expect(typeof s.skillSlug).toBe('string')
        expect(s.skillVersion).toBe(1)
        expect(typeof s.category).toBe('string')
        expect(typeof s.name).toBe('string')
        expect(typeof s.guidance).toBe('string')
        expect(Array.isArray(s.requiredElements)).toBe(true)
        expect(Array.isArray(s.forbiddenElements)).toBe(true)
        expect(Array.isArray(s.examples)).toBe(true)
        expect(Array.isArray(s.antiPatterns)).toBe(true)
      }
    }
  })
  it('each family has 2-7 starter skills (sales_ops/governance smaller; quality_review carries an extra scoring-parameters seed)', () => {
    for (const provider of Object.values(AGENT_SEED_SKILLS)) {
      const n = provider().length
      expect(n).toBeGreaterThanOrEqual(2)
      expect(n).toBeLessThanOrEqual(7)
    }
  })
})

describe('TC-SAS-03: AGENT_SKILL_FAMILY covers all Class A + B agents', () => {
  const CLASS_A_B_AGENTS = [
    // Class A — messaging
    'copywriting_agent', 'message_strategy_agent', 'quality_review_agent', 'subject_line_agent', 'personalization_agent',
    // Class A — business intelligence
    'lead_scoring_agent', 'company_scoring_agent', 'campaign_recommendation_agent',
    'statement_extraction_agent', 'statement_review_agent', 'sales_ops_intelligence_agent',
    // Class B — governance
    'prompt_policy_agent', 'risk_classifier_agent', 'approval_gate_agent',
  ]
  it('each Class A/B agent has a family entry', () => {
    for (const key of CLASS_A_B_AGENTS) {
      expect(AGENT_SKILL_FAMILY[key], `missing family for ${key}`).toBeTypeOf('string')
    }
  })
  it('copywriting stays mapped to the copywriting family', () => {
    expect(AGENT_SKILL_FAMILY.copywriting_agent).toBe('copywriting')
  })
  it('every non-copywriting family entry resolves to a registry provider', () => {
    for (const [key, family] of Object.entries(AGENT_SKILL_FAMILY)) {
      if (family === 'copywriting') continue
      expect(AGENT_SEED_SKILLS[family], `no registry for ${key} -> ${family}`).toBeTypeOf('function')
    }
  })
})

describe('TC-SAS-04: copywriting seed count is unchanged (no regression)', () => {
  it('getAllSkillDefinitions length is the existing 20', () => {
    // The copywriting library ships 20 static skills; this slice must not change it.
    expect(getAllSkillDefinitions().length).toBe(20)
  })
})

describe('TC-SAS-05: governance families flagged non-learnable', () => {
  it('the three governance families are the non-learnable set', () => {
    expect([...AGENT_NON_LEARNABLE_FAMILIES].sort()).toEqual(['approval_gate', 'prompt_policy', 'risk_classifier'])
  })
  it('isNonLearnableFamily is true for governance, false for learning + null', () => {
    expect(isNonLearnableFamily('prompt_policy')).toBe(true)
    expect(isNonLearnableFamily('risk_classifier')).toBe(true)
    expect(isNonLearnableFamily('approval_gate')).toBe(true)
    expect(isNonLearnableFamily('quality_review')).toBe(false)
    expect(isNonLearnableFamily('copywriting')).toBe(false)
    expect(isNonLearnableFamily(null)).toBe(false)
  })
})

describe('TC-SAS-06: house-style guard — no em/en dashes in ANY generic seed content', () => {
  const EM = '—'
  const EN = '–'
  it('no generic seed string contains an em or en dash', () => {
    const offenders: string[] = []
    for (const [family, provider] of Object.entries(AGENT_SEED_SKILLS)) {
      for (const s of provider()) {
        const strings = [
          s.skillSlug, s.category, s.name, s.guidance,
          ...s.requiredElements, ...s.forbiddenElements, ...s.examples, ...s.antiPatterns,
        ]
        for (const str of strings) {
          if (str.includes(EM) || str.includes(EN)) offenders.push(`${family}/${s.skillSlug}: ${str}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('TC-SAS-07: getSeedSkill resolves a single seed by family/slug/version', () => {
  it('returns the matching seed', () => {
    const s = getSeedSkill('lead_scoring', 'fit_signals', 1)
    expect(s?.skillSlug).toBe('fit_signals')
    expect(s?.name).toBe('Fit signals')
  })
  it('returns null for an unknown family or slug', () => {
    expect(getSeedSkill('nope', 'x', 1)).toBeNull()
    expect(getSeedSkill('lead_scoring', 'nope', 1)).toBeNull()
    expect(getSeedSkill('lead_scoring', 'fit_signals', 2)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Resolver — generic + copywriting delegation. Mock the DB tier only.
// ---------------------------------------------------------------------------

const db = vi.hoisted(() => ({
  tenantRow: null as Record<string, unknown> | null,
  globalRow: null as Record<string, unknown> | null,
}))

vi.mock('@/modules/messaging/skills/learned-skill.repo', () => ({
  getLearnedSkill: vi.fn(async (tenantId: string | null) => (tenantId === null ? db.globalRow : db.tenantRow)),
}))

import { resolveAgentSkill } from '@/modules/intelligence/skills/agent-skill.resolver'
import { resolveCopywritingSkill } from '@/modules/messaging/copywriting/copywriting-skill.resolver'

beforeEach(() => {
  vi.clearAllMocks()
  db.tenantRow = null
  db.globalRow = null
})

describe('TC-SAS-08: resolveAgentSkill — seed when no DB row, DB row when present', () => {
  it('no DB row → static seed from the registry', async () => {
    const res = await resolveAgentSkill('lead_scoring', 't1', 'fit_signals', 1)
    expect(res?.skillSlug).toBe('fit_signals')
    expect(res?.name).toBe('Fit signals')
  })

  it('active tenant DB row → parsed generic definition (overrides seed)', async () => {
    db.tenantRow = {
      status: 'active',
      category: 'scoring',
      definition: {
        category: 'scoring', name: 'Tenant fit', guidance: 'tenant guidance',
        requiredElements: ['a'], forbiddenElements: ['b'], examples: ['c'], antiPatterns: ['d'],
      },
    }
    const res = await resolveAgentSkill('lead_scoring', 't1', 'fit_signals', 1)
    expect(res?.name).toBe('Tenant fit')
    expect(res?.guidance).toBe('tenant guidance')
  })

  it('malformed DB row → falls through to the seed', async () => {
    db.tenantRow = { status: 'active', category: 'scoring', definition: { name: 'broken' } } // missing arrays
    const res = await resolveAgentSkill('lead_scoring', 't1', 'fit_signals', 1)
    expect(res?.name).toBe('Fit signals') // seed
  })

  it('unknown family + no DB row → null', async () => {
    const res = await resolveAgentSkill('nope', 't1', 'x', 1)
    expect(res).toBeNull()
  })
})

describe('TC-SAS-09: copywriting resolver unchanged (delegates, same behavior)', () => {
  it('no DB row → copywriting static seed', async () => {
    const res = await resolveCopywritingSkill('t1', 'cold_outreach', 1)
    expect(res?.skillSlug).toBe('cold_outreach')
    expect(typeof res?.toneRules).toBe('string')
  })

  it('active tenant DB row → parsed copywriting definition', async () => {
    db.tenantRow = {
      status: 'active',
      category: 'context',
      definition: {
        category: 'context', toneRules: 'TR', messagingRules: 'MR',
        requiredElements: [], forbiddenElements: [], ctaGuidance: 'CTA', complianceNotes: 'CN',
        examples: [], antiPatterns: [],
      },
    }
    const res = await resolveCopywritingSkill('t1', 'cold_outreach', 1)
    expect(res?.toneRules).toBe('TR')
    expect(res?.ctaGuidance).toBe('CTA')
  })

  it('unknown slug + no DB row → null', async () => {
    const res = await resolveCopywritingSkill('t1', 'does_not_exist', 1)
    expect(res).toBeNull()
  })
})
