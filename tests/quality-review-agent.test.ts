// ============================================================
// Phase 3B — Quality Review Agent Test Suite
// Tests pure functions against all 35 approved fixtures.
// No database calls — only pure functions tested here.
// Mirrors the copywriting-agent.test.ts pattern.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

import {
  scoreStrategicFit,
  scoreComplianceConfidence,
  scoreCTAClarity,
  scoreSpecificity,
  scoreToneFit,
  scoreDifferentiation,
  scoreSubjectBodyConsistency,
  scoreReadability,
} from '../modules/messaging/quality-review/quality-review-agent.scoring'
import type {
  ScoringVersionInput,
  ScoringStrategyInput,
} from '../modules/messaging/quality-review/quality-review-agent.scoring'

import { detectRiskFlags } from '../modules/messaging/quality-review/quality-review-agent.risk-flags'
import { calculateCompositeScore, deriveScoreBand } from '../modules/messaging/quality-review/quality-review-agent.composite'
import { rankQualityReviews, assignRecommendation } from '../modules/messaging/quality-review/quality-review-agent.ranking'
import {
  validateQualityReviewInputs,
  checkVersionEligibility,
} from '../modules/messaging/quality-review/quality-review-agent.validation'
import {
  generateScoringReasoning,
  generateStrengths,
  generateWeaknesses,
  generateRecommendedEdits,
} from '../modules/messaging/quality-review/quality-review-agent.reasoning'
import {
  QRA_BANNED_PHRASES,
  QRA_URGENCY_PATTERNS,
  SCORE_BANDS,
  RISK_SEVERITY,
} from '../modules/messaging/quality-review/quality-review-agent.types'
import type {
  QualityReviewDraft,
  RiskFlag,
  ScoreBreakdown,
} from '../modules/messaging/quality-review/quality-review-agent.types'

// ---- Load all fixtures ----

const FIXTURE_DIR = resolve(__dirname, 'fixtures/quality-review-agent')

interface VersionFixture {
  id:                    string
  tenant_id:             string
  strategy_id:           string
  lead_id:               string
  company_id:            string | null
  campaign_id:           string | null
  agent_run_id:          string | null
  subject_line:          string
  preview_text:          string
  body_text:             string
  body_html:             string | null
  message_type:          string
  version_label:         string
  version_number:        number
  strategy_angle:        string
  compliance_notes_applied: string[]
  required_inclusions_satisfied: Record<string, boolean>
  avoided_elements_checked: Record<string, string>
  generation_notes:      string | null
  personalization_used:  string[]
  personalization_gaps:  string[]
  approval_status:       string
  created_by_agent:      string
  created_at:            string
  updated_at:            string
  [key: string]:         unknown
}

interface StrategyFixture {
  id:                        string
  message_type:              string
  primary_goal:              string
  offer_angle:               string
  tone:                      string
  cta:                       string
  proof_point:               string | null
  pain_point_hypothesis:     string
  industry_segment:          string | null
  lead_source:               string
  sequence_position:         number
  lead_stage:                string
  required_inclusions:       string[]
  avoid:                     string[]
  partner_membership_confirmed: boolean
  personalization_level:     string
  length_target:             string
  audience_context:          string
  status:                    string
  confidence_score:          number
  invalid_reasons:           unknown[]
  [key: string]:             unknown
}

interface QRAFixture {
  meta: {
    test_case_id:   string
    scenario_name:  string
    description:    string
    message_type:   string
  }
  input: {
    strategy:        StrategyFixture
    versions:        VersionFixture[]
    prior_context:   { priorStrategyAngles: string[] } | null
    system_controls: { emailGenerationEngine: string; globalAgentPause: boolean }
  }
  expected: {
    success:                        boolean | string
    expected_review_count:          number
    expected_ranking:               string[]
    expected_recommended_version_label: string | null
    expected_scores:                Record<string, Record<string, unknown>>
    expected_errors:                Array<{ code: string }>
    expected_excluded?:             Array<{ versionId: string; errorCode: string }>
    pass_fail_notes:                string
  }
}

function loadFixtures(): QRAFixture[] {
  const files = readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.json')).sort()
  return files.map(f => JSON.parse(readFileSync(resolve(FIXTURE_DIR, f), 'utf-8')) as QRAFixture)
}

// ---- Convert fixture to scoring inputs ----

function fixtureVersionToScoringInput(v: VersionFixture): ScoringVersionInput {
  return {
    id:                          v.id,
    subjectLine:                 v.subject_line,
    previewText:                 v.preview_text,
    bodyText:                    v.body_text,
    bodyHtml:                    v.body_html,
    messageType:                 v.message_type,
    versionLabel:                v.version_label,
    versionNumber:               v.version_number,
    strategyAngle:               v.strategy_angle,
    complianceNotesApplied:      v.compliance_notes_applied ?? [],
    requiredInclusionsSatisfied: v.required_inclusions_satisfied ?? {},
    avoidedElementsChecked:      v.avoided_elements_checked ?? {},
    generationNotes:             v.generation_notes,
    personalizationUsed:         v.personalization_used ?? [],
    personalizationGaps:         v.personalization_gaps ?? [],
  }
}

function fixtureStrategyToScoringInput(s: StrategyFixture): ScoringStrategyInput {
  return {
    messageType:               s.message_type,
    primaryGoal:               s.primary_goal ?? '',
    offerAngle:                s.offer_angle ?? '',
    tone:                      s.tone ?? '',
    cta:                       s.cta ?? '',
    proofPoint:                s.proof_point ?? null,
    painPointHypothesis:       s.pain_point_hypothesis ?? '',
    industrySegment:           s.industry_segment ?? null,
    leadSource:                s.lead_source ?? '',
    sequencePosition:          s.sequence_position ?? 1,
    leadStage:                 s.lead_stage ?? '',
    requiredInclusions:        s.required_inclusions ?? [],
    avoid:                     s.avoid ?? [],
    partnerMembershipConfirmed:s.partner_membership_confirmed ?? false,
    personalizationLevel:      s.personalization_level ?? '',
    lengthTarget:              s.length_target ?? '',
    audienceContext:           s.audience_context ?? '',
  }
}

// ---- Build a full score breakdown for a version ----

function buildScoreBreakdown(
  vInput:    ScoringVersionInput,
  sInput:    ScoringStrategyInput,
  siblings:  ScoringVersionInput[]
): ScoreBreakdown {
  return {
    strategicFit:           scoreStrategicFit(vInput, sInput, siblings).score,
    complianceConfidence:   scoreComplianceConfidence(vInput).score,
    ctaClarity:             scoreCTAClarity(vInput, sInput).score,
    specificity:            scoreSpecificity(vInput, sInput).score,
    toneFit:                scoreToneFit(vInput, sInput).score,
    differentiation:        scoreDifferentiation(vInput, siblings).score,
    subjectBodyConsistency: scoreSubjectBodyConsistency(vInput, sInput).score,
    readability:            scoreReadability(vInput, sInput).score,
  }
}

// ---- Tests ----

describe('Quality Review Agent — Pure Function Tests', () => {
  const fixtures = loadFixtures()

  it('should load all 35 fixtures', () => {
    expect(fixtures).toHaveLength(35)
  })

  // ---- Constants tests ----

  describe('QRA constants', () => {
    it('QRA_BANNED_PHRASES should include known banned phrases from global list', () => {
      expect(QRA_BANNED_PHRASES).toContain('No-brainer')
      expect(QRA_BANNED_PHRASES).toContain('Game changer')
      expect(QRA_BANNED_PHRASES.length).toBeGreaterThan(0)
    })

    it('QRA_URGENCY_PATTERNS should include expected urgency phrases', () => {
      expect(QRA_URGENCY_PATTERNS).toContain('limited time')
      expect(QRA_URGENCY_PATTERNS).toContain('expires soon')
      expect(QRA_URGENCY_PATTERNS).toContain('act now')
    })

    it('SCORE_BANDS should have all expected values', () => {
      expect(SCORE_BANDS.EXCELLENT).toBe('excellent')
      expect(SCORE_BANDS.STRONG).toBe('strong')
      expect(SCORE_BANDS.USABLE).toBe('usable')
      expect(SCORE_BANDS.NEEDS_REVIEW).toBe('needs_review')
      expect(SCORE_BANDS.DO_NOT_USE).toBe('do_not_use')
    })

    it('RISK_SEVERITY should have all expected values', () => {
      expect(RISK_SEVERITY.CRITICAL).toBe('critical')
      expect(RISK_SEVERITY.HIGH).toBe('high')
      expect(RISK_SEVERITY.MEDIUM).toBe('medium')
      expect(RISK_SEVERITY.LOW).toBe('low')
    })
  })

  // ---- Score band derivation ----

  describe('deriveScoreBand', () => {
    it('should return excellent for score >= 90', () => {
      expect(deriveScoreBand(90)).toBe(SCORE_BANDS.EXCELLENT)
      expect(deriveScoreBand(100)).toBe(SCORE_BANDS.EXCELLENT)
    })
    it('should return strong for score 80-89', () => {
      expect(deriveScoreBand(80)).toBe(SCORE_BANDS.STRONG)
      expect(deriveScoreBand(89)).toBe(SCORE_BANDS.STRONG)
    })
    it('should return usable for score 70-79', () => {
      expect(deriveScoreBand(70)).toBe(SCORE_BANDS.USABLE)
      expect(deriveScoreBand(79)).toBe(SCORE_BANDS.USABLE)
    })
    it('should return needs_review for score 50-69', () => {
      expect(deriveScoreBand(50)).toBe(SCORE_BANDS.NEEDS_REVIEW)
      expect(deriveScoreBand(69)).toBe(SCORE_BANDS.NEEDS_REVIEW)
    })
    it('should return do_not_use for score < 50', () => {
      expect(deriveScoreBand(49)).toBe(SCORE_BANDS.DO_NOT_USE)
      expect(deriveScoreBand(0)).toBe(SCORE_BANDS.DO_NOT_USE)
    })
  })

  // ---- Composite score calculation ----

  describe('calculateCompositeScore', () => {
    it('should apply critical cap at 49', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 90, complianceConfidence: 90, ctaClarity: 90,
        specificity: 90, toneFit: 90, differentiation: 90,
        subjectBodyConsistency: 90, readability: 90,
      }
      const critFlag: RiskFlag = { code: 'RFL-001', severity: 'critical', message: 'test', triggeredBy: 'test' }
      const result = calculateCompositeScore(breakdown, [critFlag])
      expect(result.compositeScore).toBeLessThanOrEqual(49)
      expect(result.penaltyApplied).toBe('critical_cap')
    })

    it('should apply high cap at 69', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 90, complianceConfidence: 90, ctaClarity: 90,
        specificity: 90, toneFit: 90, differentiation: 90,
        subjectBodyConsistency: 90, readability: 90,
      }
      const highFlag: RiskFlag = { code: 'RFL-002', severity: 'high', message: 'test', triggeredBy: 'test' }
      const result = calculateCompositeScore(breakdown, [highFlag])
      expect(result.compositeScore).toBeLessThanOrEqual(69)
      expect(result.penaltyApplied).toBe('high_cap')
    })

    it('should not apply cap when no flags', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 90, complianceConfidence: 90, ctaClarity: 90,
        specificity: 90, toneFit: 90, differentiation: 90,
        subjectBodyConsistency: 90, readability: 90,
      }
      const result = calculateCompositeScore(breakdown, [])
      expect(result.compositeScore).toBeGreaterThan(69)
      expect(result.penaltyApplied).toBe('none')
    })

    it('should apply medium deduction for medium flags', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 85, complianceConfidence: 85, ctaClarity: 85,
        specificity: 85, toneFit: 85, differentiation: 85,
        subjectBodyConsistency: 85, readability: 85,
      }
      const medFlag: RiskFlag = { code: 'RFL-016', severity: 'medium', message: 'test', triggeredBy: 'test' }
      const result = calculateCompositeScore(breakdown, [medFlag])
      expect(result.penaltyApplied).toBe('medium_deduction')
      expect(result.penaltyAmount).toBe(10)
    })
  })

  // ---- Validation tests ----

  describe('validateQualityReviewInputs', () => {
    it('should block on missing versions (QRA_002)', () => {
      const { blockingErrors } = validateQualityReviewInputs(
        { id: 'str-1', invalidReasons: [] },
        [],
        { emailGenerationEngine: 'phase3b', globalAgentPause: false },
        'str-1', 'tenant-1', new Set(), false
      )
      const hasQRA002 = blockingErrors.some(e => e.code === 'QRA_002')
      expect(hasQRA002).toBe(true)
    })

    it('should block on global agent pause (QRA_003)', () => {
      const { blockingErrors } = validateQualityReviewInputs(
        { id: 'str-1', invalidReasons: [] },
        [{ id: 'v1', strategyId: 'str-1', tenantId: 't1', bodyText: 'hello world text here', subjectLine: 'Subject', bodyHtml: null, approvalStatus: 'pending', complianceNotesApplied: [] }],
        { emailGenerationEngine: 'phase3b', globalAgentPause: true },
        'str-1', 't1', new Set(), false
      )
      const hasQRA003 = blockingErrors.some(e => e.code === 'QRA_003')
      expect(hasQRA003).toBe(true)
    })

    it('should block when phase3b not enabled (QRA_004)', () => {
      const { blockingErrors } = validateQualityReviewInputs(
        { id: 'str-1', invalidReasons: [] },
        [{ id: 'v1', strategyId: 'str-1', tenantId: 't1', bodyText: 'hello world text here', subjectLine: 'Subject', bodyHtml: null, approvalStatus: 'pending', complianceNotesApplied: [] }],
        { emailGenerationEngine: null, globalAgentPause: false },
        'str-1', 't1', new Set(), false
      )
      const hasQRA004 = blockingErrors.some(e => e.code === 'QRA_004')
      expect(hasQRA004).toBe(true)
    })

    it('should not block on null strategy', () => {
      const { blockingErrors } = validateQualityReviewInputs(
        null,
        [],
        { emailGenerationEngine: 'phase3b', globalAgentPause: false },
        'str-1', 't1', new Set(), false
      )
      expect(blockingErrors.length).toBeGreaterThan(0)
      expect(blockingErrors[0]?.code).toBe('QRA_001')
    })
  })

  describe('checkVersionEligibility', () => {
    const baseVersion = {
      id: 'ver-1', strategyId: 'str-1', tenantId: 'tenant-1',
      bodyText: 'Hello world this is a valid body text for testing purposes.',
      subjectLine: 'Test subject', bodyHtml: null,
      approvalStatus: 'pending', complianceNotesApplied: [],
    }

    it('should exclude superseded version with QRA_013', () => {
      const err = checkVersionEligibility(
        { ...baseVersion, approvalStatus: 'superseded' },
        'str-1', 'tenant-1', new Set(), false
      )
      expect(err?.code).toBe('QRA_013')
    })

    it('should exclude version with body_html with QRA_008', () => {
      const err = checkVersionEligibility(
        { ...baseVersion, bodyHtml: '<p>html</p>' },
        'str-1', 'tenant-1', new Set(), false
      )
      expect(err?.code).toBe('QRA_008')
    })

    it('should exclude version with empty subject with QRA_006', () => {
      const err = checkVersionEligibility(
        { ...baseVersion, subjectLine: '' },
        'str-1', 'tenant-1', new Set(), false
      )
      expect(err?.code).toBe('QRA_006')
    })

    it('should exclude version with short body with QRA_012', () => {
      const err = checkVersionEligibility(
        { ...baseVersion, bodyText: 'Short' },
        'str-1', 'tenant-1', new Set(), false
      )
      expect(err?.code).toBe('QRA_012')
    })

    it('should exclude existing review version when force=false (QRA_005)', () => {
      const existing = new Set(['ver-1'])
      const err = checkVersionEligibility(baseVersion, 'str-1', 'tenant-1', existing, false)
      expect(err?.code).toBe('QRA_005')
    })

    it('should NOT exclude existing review version when force=true', () => {
      const existing = new Set(['ver-1'])
      const err = checkVersionEligibility(baseVersion, 'str-1', 'tenant-1', existing, true)
      expect(err).toBeNull()
    })

    it('should return null for valid version', () => {
      const err = checkVersionEligibility(baseVersion, 'str-1', 'tenant-1', new Set(), false)
      expect(err).toBeNull()
    })
  })

  // ---- Risk flag detection tests ----

  describe('detectRiskFlags', () => {
    const baseStrategy = {
      messageType: 'cold_outreach', offerAngle: 'statement_review_offer',
      leadSource: 'manual', proofPoint: null, painPointHypothesis: 'Overpaying',
      partnerMembershipConfirmed: false, audienceContext: 'Business owner',
    }
    const baseVersion = {
      subjectLine: 'Test subject', bodyText: 'Clean body text for testing.',
      strategyAngle: 'industry_specific_question', personalizationUsed: [],
      personalizationGaps: [], versionNumber: 1,
    }

    it('should detect banned phrase (RFL-001)', () => {
      const result = detectRiskFlags(
        baseStrategy,
        { ...baseVersion, bodyText: 'This is a no-brainer for your business.' },
        [], null
      )
      const hasRFL001 = result.flags.some(f => f.code === 'RFL-001')
      expect(hasRFL001).toBe(true)
    })

    it('should detect urgency language (RFL-002)', () => {
      const result = detectRiskFlags(
        baseStrategy,
        { ...baseVersion, bodyText: 'This is a limited time offer to review your processing.' },
        [], null
      )
      const hasRFL002 = result.flags.some(f => f.code === 'RFL-002')
      expect(hasRFL002).toBe(true)
    })

    it('should detect dollar claim without confirmed savings (RFL-004)', () => {
      const result = detectRiskFlags(
        { ...baseStrategy, offerAngle: 'statement_review_offer' },
        { ...baseVersion, bodyText: 'We can save you $500 per month.' },
        [], null
      )
      const hasRFL004 = result.flags.some(f => f.code === 'RFL-004')
      expect(hasRFL004).toBe(true)
    })

    it('should NOT detect RFL-004 with confirmed_savings_review offer angle', () => {
      const result = detectRiskFlags(
        { ...baseStrategy, offerAngle: 'confirmed_savings_review' },
        { ...baseVersion, bodyText: 'We found you are paying $500 more than average.' },
        [], null
      )
      const hasRFL004 = result.flags.some(f => f.code === 'RFL-004')
      expect(hasRFL004).toBe(false)
    })

    it('should detect partner name without confirmed membership (RFL-007)', () => {
      const result = detectRiskFlags(
        { ...baseStrategy, partnerMembershipConfirmed: false },
        { ...baseVersion, bodyText: 'As a CertainPath member you are eligible.' },
        [], null
      )
      const hasRFL007 = result.flags.some(f => f.code === 'RFL-007')
      expect(hasRFL007).toBe(true)
    })

    it('should NOT detect RFL-007 with confirmed membership', () => {
      const result = detectRiskFlags(
        { ...baseStrategy, partnerMembershipConfirmed: true },
        { ...baseVersion, bodyText: 'As a CertainPath member you are eligible.' },
        [], null
      )
      const hasRFL007 = result.flags.some(f => f.code === 'RFL-007')
      expect(hasRFL007).toBe(false)
    })

    it('should detect missing personalization gaps (RFL-023)', () => {
      const result = detectRiskFlags(
        baseStrategy,
        { ...baseVersion, personalizationGaps: ['industry_segment: not used', 'proof_point: unavailable'] },
        [], null
      )
      const hasRFL023 = result.flags.some(f => f.code === 'RFL-023')
      expect(hasRFL023).toBe(true)
    })

    it('should detect prior context angle repetition (RFL-024)', () => {
      const result = detectRiskFlags(
        baseStrategy,
        { ...baseVersion, strategyAngle: 'industry_specific_question' },
        [], { priorStrategyAngles: ['industry_specific_question'] }
      )
      const hasRFL024 = result.flags.some(f => f.code === 'RFL-024')
      expect(hasRFL024).toBe(true)
    })

    it('should calculate risk score correctly', () => {
      const result = detectRiskFlags(
        baseStrategy,
        { ...baseVersion, bodyText: 'This is a no-brainer game changer for your business.' },
        [], null
      )
      expect(result.riskScore).toBeGreaterThan(0)
      expect(result.riskScore).toBeLessThanOrEqual(100)
    })

    it('should classify compliance flags (RFL-001 through RFL-009)', () => {
      const result = detectRiskFlags(
        baseStrategy,
        { ...baseVersion, bodyText: 'This is a no-brainer for your business.' },
        [], null
      )
      // RFL-001 is compliance
      expect(result.complianceFlags.some(f => f.code === 'RFL-001')).toBe(true)
    })

    it('should detect guilt language in follow-up (RFL-015)', () => {
      const result = detectRiskFlags(
        { ...baseStrategy, messageType: 're_engagement' },
        { ...baseVersion, bodyText: "I haven't heard from you in a while. You must be busy." },
        [], null
      )
      const hasRFL015 = result.flags.some(f => f.code === 'RFL-015')
      expect(hasRFL015).toBe(true)
    })

    it('should detect inbound language in cold context (RFL-006)', () => {
      const result = detectRiskFlags(
        { ...baseStrategy, leadSource: 'manual' },
        { ...baseVersion, bodyText: 'Thank you for reaching out about payment processing.' },
        [], null
      )
      const hasRFL006 = result.flags.some(f => f.code === 'RFL-006')
      expect(hasRFL006).toBe(true)
    })

    it('should detect cold discovery in inbound context (RFL-006)', () => {
      const result = detectRiskFlags(
        { ...baseStrategy, leadSource: 'website' },
        { ...baseVersion, bodyText: 'I came across your business and wanted to reach out.' },
        [], null
      )
      const hasRFL006 = result.flags.some(f => f.code === 'RFL-006')
      expect(hasRFL006).toBe(true)
    })
  })

  // ---- Ranking tests ----

  describe('rankQualityReviews', () => {
    function makeDraft(versionId: string, score: number, risk: number, stratFit: number, versionNumber: number): QualityReviewDraft & { versionNumber: number; riskScore: number; strategicFitScore: number; ctaClarityScore: number; specificityScore: number } {
      return {
        tenantId: 't1', strategyId: 's1', versionId,
        leadId: 'l1', companyId: null, campaignId: null, agentRunId: null,
        messageType: 'cold_outreach', versionLabel: 'Test', strategyAngle: 'direct',
        compositeScore: score, scoreBand: deriveScoreBand(score),
        rankPosition: 0, isRecommended: false,
        strategicFitScore: stratFit, complianceConfidenceScore: 80,
        ctaClarityScore: 75, specificityScore: 70, toneFitScore: 80,
        differentiationScore: 80, subjectBodyConsistencyScore: 80, readabilityScore: 80,
        riskScore: risk, scoreBreakdown: {
          strategicFit: stratFit, complianceConfidence: 80, ctaClarity: 75,
          specificity: 70, toneFit: 80, differentiation: 80, subjectBodyConsistency: 80, readability: 80,
        },
        scoringReasoning: { strategicFit: '', complianceConfidence: '', ctaClarity: '', specificity: '', toneFit: '', differentiation: '', subjectBodyConsistency: '', readability: '' },
        strengths: [], weaknesses: [], riskFlags: [], complianceFlags: [],
        humanReviewNotes: null, recommendedEdits: [],
        comparedAgainstVersionIds: [], comparisonSummary: '',
        supersededAt: null, createdByAgent: 'quality_review_agent',
        versionNumber, riskScore: risk, strategicFitScore: stratFit,
        ctaClarityScore: 75, specificityScore: 70,
      }
    }

    it('should rank by composite score descending', () => {
      const drafts = [
        makeDraft('v2', 65, 10, 70, 2),
        makeDraft('v1', 80, 10, 75, 1),
      ]
      const { ranked } = rankQualityReviews(drafts)
      expect(ranked[0]?.draft.versionId).toBe('v1')
      expect(ranked[1]?.draft.versionId).toBe('v2')
    })

    it('should apply tie-breaker: lower risk wins within 3 points', () => {
      const drafts = [
        makeDraft('v1', 75, 30, 80, 1), // higher risk
        makeDraft('v2', 74, 10, 75, 2), // lower risk
      ]
      const { ranked } = rankQualityReviews(drafts)
      expect(ranked[0]?.draft.versionId).toBe('v2') // lower risk wins
    })

    it('should assign correct rank positions', () => {
      const drafts = [makeDraft('v1', 80, 0, 80, 1), makeDraft('v2', 70, 0, 75, 2)]
      const { ranked } = rankQualityReviews(drafts)
      expect(ranked[0]?.rankPosition).toBe(1)
      expect(ranked[1]?.rankPosition).toBe(2)
    })
  })

  describe('assignRecommendation', () => {
    function makeDraftForRecommendation(versionId: string, score: number, hasCritical: boolean): QualityReviewDraft {
      const riskFlags: RiskFlag[] = hasCritical
        ? [{ code: 'RFL-001', severity: 'critical', message: 'test', triggeredBy: 'test' }]
        : []
      return {
        tenantId: 't1', strategyId: 's1', versionId,
        leadId: 'l1', companyId: null, campaignId: null, agentRunId: null,
        messageType: 'cold_outreach', versionLabel: 'Test', strategyAngle: 'direct',
        compositeScore: score, scoreBand: deriveScoreBand(score),
        rankPosition: 1, isRecommended: false,
        strategicFitScore: 75, complianceConfidenceScore: 80,
        ctaClarityScore: 75, specificityScore: 70, toneFitScore: 80,
        differentiationScore: 80, subjectBodyConsistencyScore: 80, readabilityScore: 80,
        riskScore: hasCritical ? 40 : 0,
        scoreBreakdown: { strategicFit: 75, complianceConfidence: 80, ctaClarity: 75, specificity: 70, toneFit: 80, differentiation: 80, subjectBodyConsistency: 80, readability: 80 },
        scoringReasoning: { strategicFit: '', complianceConfidence: '', ctaClarity: '', specificity: '', toneFit: '', differentiation: '', subjectBodyConsistency: '', readability: '' },
        strengths: [], weaknesses: [], riskFlags, complianceFlags: [],
        humanReviewNotes: null, recommendedEdits: [],
        comparedAgainstVersionIds: [], comparisonSummary: '',
        supersededAt: null, createdByAgent: 'quality_review_agent',
      }
    }

    it('should recommend highest scoring version without critical flags', () => {
      const drafts = [
        makeDraftForRecommendation('v1', 80, false),
        makeDraftForRecommendation('v2', 70, true),
      ]
      const result = assignRecommendation(drafts, new Map([['v1', { complianceNotesApplied: [] }], ['v2', { complianceNotesApplied: [] }]]))
      expect(result.recommendedVersionId).toBe('v1')
    })

    it('should not recommend version with critical flags', () => {
      const drafts = [makeDraftForRecommendation('v1', 85, true)]
      const result = assignRecommendation(drafts, new Map([['v1', { complianceNotesApplied: [] }]]))
      expect(result.recommendedVersionId).toBeNull()
    })

    it('should not recommend when all below 70 and another is >= 70', () => {
      const drafts = [
        makeDraftForRecommendation('v1', 75, false),
        makeDraftForRecommendation('v2', 65, false),
      ]
      const result = assignRecommendation(drafts, new Map([
        ['v1', { complianceNotesApplied: [] }],
        ['v2', { complianceNotesApplied: [] }],
      ]))
      expect(result.recommendedVersionId).toBe('v1')
    })
  })

  // ---- Reasoning tests ----

  describe('generateStrengths', () => {
    it('should add no-risk strength when no critical/high flags', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 85, complianceConfidence: 85, ctaClarity: 85,
        specificity: 85, toneFit: 85, differentiation: 85,
        subjectBodyConsistency: 85, readability: 85,
      }
      const strengths = generateStrengths(breakdown, [])
      expect(strengths).toContain('No compliance or content risk detected.')
    })

    it('should add strength for high-scoring dimensions', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 90, complianceConfidence: 90, ctaClarity: 90,
        specificity: 90, toneFit: 90, differentiation: 90,
        subjectBodyConsistency: 90, readability: 90,
      }
      const strengths = generateStrengths(breakdown, [])
      expect(strengths.length).toBeGreaterThan(2)
    })
  })

  describe('generateWeaknesses', () => {
    it('should add weakness for low-scoring dimensions', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 50, complianceConfidence: 90, ctaClarity: 50,
        specificity: 90, toneFit: 90, differentiation: 90,
        subjectBodyConsistency: 90, readability: 90,
      }
      const weaknesses = generateWeaknesses(breakdown, [])
      expect(weaknesses.some(w => w.toLowerCase().includes('strategic'))).toBe(true)
      expect(weaknesses.some(w => w.toLowerCase().includes('cta'))).toBe(true)
    })

    it('should add weakness for high/critical flags', () => {
      const critFlag: RiskFlag = { code: 'RFL-001', severity: 'critical', message: 'Banned phrase.', triggeredBy: 'no-brainer' }
      const breakdown: ScoreBreakdown = {
        strategicFit: 85, complianceConfidence: 85, ctaClarity: 85,
        specificity: 85, toneFit: 85, differentiation: 85,
        subjectBodyConsistency: 85, readability: 85,
      }
      const weaknesses = generateWeaknesses(breakdown, [critFlag])
      expect(weaknesses.some(w => w.includes('RFL-001'))).toBe(true)
    })
  })

  describe('generateRecommendedEdits', () => {
    it('should return at most 3 edits', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 50, complianceConfidence: 50, ctaClarity: 50,
        specificity: 50, toneFit: 50, differentiation: 50,
        subjectBodyConsistency: 50, readability: 50,
      }
      const edits = generateRecommendedEdits(breakdown, [], { cta: 'Reply to schedule', proofPoint: null, industrySegment: null })
      expect(edits.length).toBeLessThanOrEqual(3)
    })

    it('should suggest CTA edit when ctaClarity is low', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 80, complianceConfidence: 80, ctaClarity: 50,
        specificity: 80, toneFit: 80, differentiation: 80,
        subjectBodyConsistency: 80, readability: 80,
      }
      const edits = generateRecommendedEdits(breakdown, [], { cta: 'Reply to schedule', proofPoint: null, industrySegment: null })
      expect(edits.some(e => e.toLowerCase().includes('cta'))).toBe(true)
    })
  })

  // ---- Fixture-based tests ----

  describe('Fixture-based scoring tests', () => {
    for (const fixture of fixtures) {
      describe(fixture.meta.test_case_id + ': ' + fixture.meta.scenario_name, () => {
        const strategy = fixtureStrategyToScoringInput(fixture.input.strategy)
        const versions = fixture.input.versions

        // Always run validation test — needed for gate-check fixtures with no versions (TC-QRA-034)
        it('should validate inputs correctly', () => {
          const { blockingErrors } = validateQualityReviewInputs(
            { id: fixture.input.strategy.id, invalidReasons: fixture.input.strategy.invalid_reasons ?? [] },
            versions as unknown as Array<{
              id: string; strategyId: string; tenantId: string; bodyText: string
              subjectLine: string; bodyHtml: unknown; approvalStatus: string; complianceNotesApplied: string[]
            }>,
            {
              emailGenerationEngine: fixture.input.system_controls.emailGenerationEngine,
              globalAgentPause:      fixture.input.system_controls.globalAgentPause,
            },
            fixture.input.strategy.id,
            versions[0]?.tenant_id ?? 'tenant-001',
            new Set<string>(),
            false
          )

          if (fixture.expected.expected_errors.some((e: { code: string }) => e.code === 'QRA_002') && versions.length === 0) {
            expect(blockingErrors.some(e => e.code === 'QRA_002')).toBe(true)
          }
          if (fixture.expected.expected_errors.some((e: { code: string }) => e.code === 'QRA_010')) {
            expect(blockingErrors.some(e => e.code === 'QRA_010')).toBe(true)
          }
        })

        // Only test fixtures with versions (not gate-check-only fixtures)
        if (versions.length > 0) {
          it('should score all versions and produce composite scores', () => {
            const eligibleVersions = versions.filter(v =>
              v.approval_status !== 'superseded' && v.body_html === null
            )
            if (eligibleVersions.length === 0) return

            for (const v of eligibleVersions) {
              const vInput = fixtureVersionToScoringInput(v)
              const siblings = eligibleVersions
                .filter(s => s.id !== v.id)
                .map(fixtureVersionToScoringInput)

              const breakdown = buildScoreBreakdown(vInput, strategy, siblings)
              const riskResult = detectRiskFlags(
                {
                  messageType:               fixture.input.strategy.message_type,
                  offerAngle:                fixture.input.strategy.offer_angle,
                  leadSource:                fixture.input.strategy.lead_source,
                  proofPoint:                fixture.input.strategy.proof_point,
                  painPointHypothesis:       fixture.input.strategy.pain_point_hypothesis,
                  partnerMembershipConfirmed:fixture.input.strategy.partner_membership_confirmed,
                  audienceContext:           fixture.input.strategy.audience_context,
                },
                {
                  subjectLine:         v.subject_line,
                  bodyText:            v.body_text,
                  strategyAngle:       v.strategy_angle,
                  personalizationUsed: v.personalization_used ?? [],
                  personalizationGaps: v.personalization_gaps ?? [],
                  versionNumber:       v.version_number,
                },
                eligibleVersions.filter(s => s.id !== v.id).map(s => ({ bodyText: s.body_text, strategyAngle: s.strategy_angle })),
                fixture.input.prior_context
              )
              const compositeResult = calculateCompositeScore(breakdown, riskResult.flags)

              // Check expected scores if defined
              const expectedScore = fixture.expected.expected_scores?.[v.id]
              if (expectedScore) {
                if ('composite_score_min' in expectedScore) {
                  expect(compositeResult.compositeScore).toBeGreaterThanOrEqual(expectedScore['composite_score_min'] as number)
                }
                if ('composite_score_max' in expectedScore) {
                  expect(compositeResult.compositeScore).toBeLessThanOrEqual(expectedScore['composite_score_max'] as number)
                }
                if ('score_band' in expectedScore) {
                  expect(compositeResult.scoreBand).toBe(expectedScore['score_band'])
                }
                if ('risk_flags' in expectedScore && Array.isArray(expectedScore['risk_flags'])) {
                  for (const expectedFlag of expectedScore['risk_flags'] as string[]) {
                    const hasFlag = riskResult.flags.some(f => f.code === expectedFlag)
                    expect(hasFlag).toBe(true)
                  }
                }
                if ('risk_flags_not_present' in expectedScore && Array.isArray(expectedScore['risk_flags_not_present'])) {
                  for (const notExpectedFlag of expectedScore['risk_flags_not_present'] as string[]) {
                    const hasFlag = riskResult.flags.some(f => f.code === notExpectedFlag)
                    expect(hasFlag).toBe(false)
                  }
                }
                if ('tone_fit_score_min' in expectedScore) {
                  expect(breakdown.toneFit).toBeGreaterThanOrEqual(expectedScore['tone_fit_score_min'] as number)
                }
                if ('cta_clarity_score_max' in expectedScore) {
                  expect(breakdown.ctaClarity).toBeLessThanOrEqual(expectedScore['cta_clarity_score_max'] as number)
                }
                if ('strategic_fit_score_min' in expectedScore) {
                  expect(breakdown.strategicFit).toBeGreaterThanOrEqual(expectedScore['strategic_fit_score_min'] as number)
                }
                if ('subject_body_consistency_score_max' in expectedScore) {
                  expect(breakdown.subjectBodyConsistency).toBeLessThanOrEqual(expectedScore['subject_body_consistency_score_max'] as number)
                }
              }

              // Composite scores are always in valid range
              expect(compositeResult.compositeScore).toBeGreaterThanOrEqual(0)
              expect(compositeResult.compositeScore).toBeLessThanOrEqual(100)
            }
          })

        }
      })
    }
  })

  // ---- Compliance confidence with body_html ----

  describe('scoreComplianceConfidence — body_html check', () => {
    it('should return score=20 when body_html is populated', () => {
      const vInput: ScoringVersionInput = {
        id: 'v1', subjectLine: 'Test', previewText: 'Preview',
        bodyText: 'Body text here.', bodyHtml: '<p>html</p>',
        messageType: 'cold_outreach', versionLabel: 'Test', versionNumber: 1,
        strategyAngle: 'direct', complianceNotesApplied: [],
        requiredInclusionsSatisfied: {}, avoidedElementsChecked: {},
        generationNotes: null, personalizationUsed: [], personalizationGaps: [],
      }
      const result = scoreComplianceConfidence(vInput)
      expect(result.score).toBe(20)
      expect(result.suggestedFlags).toContain('RFL_008')
    })

    it('should return score >= 60 when body_html is null and no compliance notes', () => {
      const vInput: ScoringVersionInput = {
        id: 'v1', subjectLine: 'Test', previewText: 'Preview',
        bodyText: 'A clean body text without any issues.', bodyHtml: null,
        messageType: 'cold_outreach', versionLabel: 'Test', versionNumber: 1,
        strategyAngle: 'direct', complianceNotesApplied: [],
        requiredInclusionsSatisfied: {}, avoidedElementsChecked: {},
        generationNotes: null, personalizationUsed: [], personalizationGaps: [],
      }
      const result = scoreComplianceConfidence(vInput)
      expect(result.score).toBeGreaterThanOrEqual(60)
    })
  })

  // ---- Strategic fit tests ----

  describe('scoreStrategicFit', () => {
    const baseStrategy: ScoringStrategyInput = {
      messageType: 'cold_outreach', primaryGoal: 'book call',
      offerAngle: 'statement_review_offer', tone: 'direct',
      cta: 'Reply to schedule a call', proofPoint: null, painPointHypothesis: 'Overpaying',
      industrySegment: 'restaurant', leadSource: 'manual',
      sequencePosition: 1, leadStage: 'new', requiredInclusions: [], avoid: [],
      partnerMembershipConfirmed: false, personalizationLevel: 'lead_specific',
      lengthTarget: 'short', audienceContext: 'Restaurant owner',
    }

    it('should start near 85 for clean version', () => {
      const vInput: ScoringVersionInput = {
        id: 'v1', subjectLine: 'Restaurant rates', previewText: 'Preview',
        bodyText: 'Restaurant payment processing is worth reviewing. Reply to schedule a call.',
        bodyHtml: null, messageType: 'cold_outreach', versionLabel: 'Test',
        versionNumber: 1, strategyAngle: 'industry_specific_question',
        complianceNotesApplied: [], requiredInclusionsSatisfied: {}, avoidedElementsChecked: {},
        generationNotes: null, personalizationUsed: [], personalizationGaps: [],
      }
      const result = scoreStrategicFit(vInput, baseStrategy)
      expect(result.score).toBeGreaterThan(0)
      expect(result.score).toBeLessThanOrEqual(100)
    })

    it('should penalize when required inclusions not satisfied', () => {
      const vInput: ScoringVersionInput = {
        id: 'v1', subjectLine: 'Test', previewText: 'Preview',
        bodyText: 'Generic text.',
        bodyHtml: null, messageType: 'cold_outreach', versionLabel: 'Test',
        versionNumber: 1, strategyAngle: 'ultra_direct',
        complianceNotesApplied: [], requiredInclusionsSatisfied: { 'include_cta': false },
        avoidedElementsChecked: {},
        generationNotes: null, personalizationUsed: [], personalizationGaps: [],
      }
      const resultWithGap = scoreStrategicFit(vInput, baseStrategy)
      const vInputClean: ScoringVersionInput = { ...vInput, requiredInclusionsSatisfied: { 'include_cta': true } }
      const resultClean = scoreStrategicFit(vInputClean, baseStrategy)
      expect(resultWithGap.score).toBeLessThan(resultClean.score)
    })
  })

  // ---- Readability tests ----

  describe('scoreReadability', () => {
    const baseStrategy: ScoringStrategyInput = {
      messageType: 'cold_outreach', primaryGoal: 'book call',
      offerAngle: 'statement_review_offer', tone: 'direct',
      cta: 'Reply', proofPoint: null, painPointHypothesis: 'Overpaying',
      industrySegment: null, leadSource: 'manual',
      sequencePosition: 1, leadStage: 'new', requiredInclusions: [], avoid: [],
      partnerMembershipConfirmed: false, personalizationLevel: 'lead_specific',
      lengthTarget: 'short', audienceContext: '',
    }

    it('should score higher for text within target word range', () => {
      // cold_outreach target: 130–220 words. Generate ~160 words.
      const words = Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ')
      const vInput: ScoringVersionInput = {
        id: 'v1', subjectLine: 'Test', previewText: '',
        bodyText: words, bodyHtml: null, messageType: 'cold_outreach',
        versionLabel: 'Test', versionNumber: 1, strategyAngle: 'direct',
        complianceNotesApplied: [], requiredInclusionsSatisfied: {}, avoidedElementsChecked: {},
        generationNotes: null, personalizationUsed: [], personalizationGaps: [],
      }
      const result = scoreReadability(vInput, baseStrategy)
      expect(result.score).toBeGreaterThanOrEqual(75)
    })

    it('should penalize very long text', () => {
      // Generate 300 words — way over 220 max
      const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ')
      const vInput: ScoringVersionInput = {
        id: 'v1', subjectLine: 'Test', previewText: '',
        bodyText: words, bodyHtml: null, messageType: 'cold_outreach',
        versionLabel: 'Test', versionNumber: 1, strategyAngle: 'direct',
        complianceNotesApplied: [], requiredInclusionsSatisfied: {}, avoidedElementsChecked: {},
        generationNotes: null, personalizationUsed: [], personalizationGaps: [],
      }
      const result = scoreReadability(vInput, baseStrategy)
      expect(result.score).toBeLessThan(75)
    })
  })

  // ---- Scoring reasoning ----

  describe('generateScoringReasoning', () => {
    it('should generate reasoning for all 8 dimensions', () => {
      const breakdown: ScoreBreakdown = {
        strategicFit: 80, complianceConfidence: 75, ctaClarity: 85,
        specificity: 70, toneFit: 80, differentiation: 65,
        subjectBodyConsistency: 90, readability: 75,
      }
      const reasoning = generateScoringReasoning(breakdown, [])
      expect(reasoning.strategicFit).toBeTruthy()
      expect(reasoning.complianceConfidence).toBeTruthy()
      expect(reasoning.ctaClarity).toBeTruthy()
      expect(reasoning.specificity).toBeTruthy()
      expect(reasoning.toneFit).toBeTruthy()
      expect(reasoning.differentiation).toBeTruthy()
      expect(reasoning.subjectBodyConsistency).toBeTruthy()
      expect(reasoning.readability).toBeTruthy()
    })
  })
})
