// mcm — Quality Review scorers wired to a structured skill (length bands, phrase
// lists, recommendation threshold) with PER-KEY fallback to today's constants.
// TC-QRW-01..07

import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  scoreComplianceConfidence,
  scoreCTAClarity,
  scoreSpecificity,
  scoreToneFit,
  scoreSubjectBodyConsistency,
  scoreReadability,
} from '@/modules/messaging/quality-review/quality-review-agent.scoring'
import type { QualityReviewScoringParams } from '@/modules/messaging/quality-review/quality-review-agent.types'
import { assignRecommendation } from '@/modules/messaging/quality-review/quality-review-agent.ranking'
import { generateHumanReviewNotes } from '@/modules/messaging/quality-review/quality-review-agent.reasoning'
import { deriveScoreBand } from '@/modules/messaging/quality-review/quality-review-agent.composite'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function version(over: Record<string, unknown> = {}): any {
  return {
    id: 'v1', subjectLine: 'A look at your processing costs', previewText: '',
    bodyText: 'Hi there, worth a quick review of your processing setup. Reply when you have a moment.',
    bodyHtml: null, messageType: 'cold_outreach', versionLabel: 'V1', versionNumber: 1,
    strategyAngle: 'statement_review_offer', complianceNotesApplied: [],
    requiredInclusionsSatisfied: {}, avoidedElementsChecked: {}, generationNotes: null,
    personalizationUsed: [], personalizationGaps: [], differentiationProfile: undefined,
    ...over,
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function strat(over: Record<string, unknown> = {}): any {
  return {
    messageType: 'cold_outreach', primaryGoal: '', offerAngle: 'statement_review_offer', tone: '',
    cta: '', proofPoint: null, painPointHypothesis: '', industrySegment: null, leadSource: '',
    sequencePosition: 1, leadStage: '', requiredInclusions: [], avoid: [],
    partnerMembershipConfirmed: false, personalizationLevel: '', lengthTarget: '', audienceContext: '',
    ...over,
  }
}

describe('TC-QRW-01: fallback parity — no params == undefined behaves like the constant', () => {
  it('compliance/cta/specificity/tone/consistency/readability identical with undefined vs {}', () => {
    const v = version()
    const s = strat()
    expect(scoreComplianceConfidence(v).score).toBe(scoreComplianceConfidence(v, {}).score)
    expect(scoreCTAClarity(v, s).score).toBe(scoreCTAClarity(v, s, {}).score)
    expect(scoreSpecificity(v, s).score).toBe(scoreSpecificity(v, s, {}).score)
    expect(scoreToneFit(v, s).score).toBe(scoreToneFit(v, s, {}).score)
    expect(scoreSubjectBodyConsistency(v, s).score).toBe(scoreSubjectBodyConsistency(v, s, {}).score)
    expect(scoreReadability(v, s).score).toBe(scoreReadability(v, s, {}).score)
  })
})

describe('TC-QRW-02: skill overrides win', () => {
  it('(a) a custom urgency phrase flags a draft that otherwise passes compliance', () => {
    const v = version({ bodyText: 'Our flux capacitor special is great. Reply to learn more.' })
    const clean = scoreComplianceConfidence(v).score
    const params: QualityReviewScoringParams = { phrases: { urgency: ['flux capacitor special'] } }
    const flagged = scoreComplianceConfidence(v, params).score
    expect(flagged).toBeLessThan(clean)
  })

  it('(b) a tighter lengthTargets band changes the readability score', () => {
    // ~17-word body: passes the default cold_outreach band {130,220} as "slightly
    // outside" but a tight {1,5} band makes it "too long" -> lower score.
    const v = version()
    const baseScore = scoreReadability(v, strat()).score
    const params: QualityReviewScoringParams = { lengthTargets: { cold_outreach: { min: 1, max: 5 } } }
    const tightScore = scoreReadability(v, strat(), params).score
    expect(tightScore).not.toBe(baseScore)
  })

  it('(c) recommendationMinScore=80 makes a 75-composite version NOT recommended', () => {
    // The gate blocks a sub-threshold version only when a passing sibling exists.
    // Top version (85) is critical-flagged (skipped), leaving the 75 as the only
    // candidate: recommendable at the 70 bar, dropped at the 80 bar.
    const drafts = [draft('v0', 85, true), draft('v1', 75)]
    const map = new Map([['v0', { complianceNotesApplied: [] }], ['v1', { complianceNotesApplied: [] }]])
    expect(assignRecommendation(drafts, map).recommendedVersionId).toBe('v1')      // default 70
    expect(assignRecommendation(drafts, map, 80).recommendedVersionId).toBeNull()   // raised bar
  })
})

describe('TC-QRW-03: per-key fallback — only phrases.urgency provided', () => {
  it('other scorers stay on their constants', () => {
    const v = version()
    const s = strat()
    const params: QualityReviewScoringParams = { phrases: { urgency: ['totally-not-present-phrase'] } }
    // urgency override present but not in the body -> compliance unchanged here,
    // and every other scorer must equal its no-params output.
    expect(scoreCTAClarity(v, s, params).score).toBe(scoreCTAClarity(v, s).score)
    expect(scoreSpecificity(v, s, params).score).toBe(scoreSpecificity(v, s).score)
    expect(scoreToneFit(v, s, params).score).toBe(scoreToneFit(v, s).score)
    expect(scoreSubjectBodyConsistency(v, s, params).score).toBe(scoreSubjectBodyConsistency(v, s).score)
    expect(scoreReadability(v, s, params).score).toBe(scoreReadability(v, s).score)
  })
})

describe('TC-QRW-04: threshold no-drift — ranking AND reasoning honor recommendationMinScore=80', () => {
  it('ranking does not recommend a 75 and reasoning reflects the bar', () => {
    const drafts = [draft('v0', 85, true), draft('v1', 75)]
    const map = new Map([['v0', { complianceNotesApplied: [] }], ['v1', { complianceNotesApplied: [] }]])
    expect(assignRecommendation(drafts, map, 80).recommendedVersionId).toBeNull()

    // reasoning: a 75 with minScore=80 is below threshold -> the note appears;
    // with the default 70 it does not.
    const d = { compositeScore: 75, scoreBand: deriveScoreBand(75), rankPosition: 1, isRecommended: false, versionLabel: 'V1' }
    const note80 = generateHumanReviewNotes(d, [], [], [], 80)
    const note70 = generateHumanReviewNotes(d, [], [], [], 70)
    expect(note80).toContain('does not meet the minimum quality threshold')
    expect(note70).not.toContain('does not meet the minimum quality threshold')
  })
})

// ---------------------------------------------------------------------------
// Resolver: malformed jsonb falls through to the seed (no throw).
// ---------------------------------------------------------------------------

const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }))
vi.mock('@/modules/messaging/skills/learned-skill.repo', () => ({
  getLearnedSkill: vi.fn(async () => db.row),
}))

import { resolveQualityReviewSkill, QR_SCORING_SKILL_SLUG, getQualityReviewScoringSeed } from '@/modules/messaging/quality-review/quality-review-skill.resolver'

beforeEach(() => { vi.clearAllMocks(); db.row = null })

describe('TC-QRW-05: no DB row -> static seed (reproduces today\'s constants)', () => {
  it('returns the scoring-parameters seed with the full scoring block', async () => {
    const res = await resolveQualityReviewSkill('t-1', QR_SCORING_SKILL_SLUG, 1)
    expect(res?.skillSlug).toBe(QR_SCORING_SKILL_SLUG)
    expect(res?.scoring?.recommendationMinScore).toBe(70)
    // seed mirrors the same object the off-path fallback uses
    expect(res?.scoring).toEqual(getQualityReviewScoringSeed().scoring)
    expect(res?.scoring?.phrases?.urgency).toContain('act now')
  })
})

describe('TC-QRW-06: active DB row with custom scoring overrides the seed', () => {
  it('parses recommendationMinScore + a phrase override from the row', async () => {
    db.row = {
      status: 'active',
      category: 'scoring',
      definition: { scoring: { recommendationMinScore: 80, phrases: { urgency: ['custom urgent'] } } },
    }
    const res = await resolveQualityReviewSkill('t-1', QR_SCORING_SKILL_SLUG, 1)
    expect(res?.scoring?.recommendationMinScore).toBe(80)
    expect(res?.scoring?.phrases?.urgency).toEqual(['custom urgent'])
  })
})

describe('TC-QRW-07: malformed scoring jsonb falls through to the seed (no throw)', () => {
  it('scoring of the wrong type -> seed values, never throws', async () => {
    db.row = { status: 'active', category: 'scoring', definition: { scoring: 'not-an-object' } }
    const res = await resolveQualityReviewSkill('t-1', QR_SCORING_SKILL_SLUG, 1)
    expect(res?.scoring?.recommendationMinScore).toBe(70) // seed
  })
})

// ---- local helper: a rankable draft shaped enough for assignRecommendation ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function draft(versionId: string, compositeScore: number, critical = false): any {
  return {
    versionId, compositeScore, scoreBand: deriveScoreBand(compositeScore),
    riskFlags: critical ? [{ code: 'RFL_X', severity: 'critical', message: 'x', triggeredBy: 'test' }] : [],
    rankPosition: 1,
  }
}
