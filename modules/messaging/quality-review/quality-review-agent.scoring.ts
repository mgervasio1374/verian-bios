// ============================================================
// Phase 3B — Quality Review Agent Scoring
// Pure functions for scoring each dimension.
// No I/O. All inputs are plain objects.
// ============================================================

import {
  QRA_AI_CORPORATE_PATTERNS,
  QRA_GUILT_LANGUAGE_PATTERNS,
  QRA_LENGTH_TARGETS,
} from './quality-review-agent.types'
import type { DimensionScoreResult } from './quality-review-agent.types'

// ---- Local input interfaces ----

export interface ScoringVersionInput {
  id:                           string
  subjectLine:                  string
  previewText:                  string
  bodyText:                     string
  bodyHtml:                     string | null
  messageType:                  string
  versionLabel:                 string
  versionNumber:                number
  strategyAngle:                string
  complianceNotesApplied:       string[]
  requiredInclusionsSatisfied:  Record<string, boolean>
  avoidedElementsChecked:       Record<string, string>
  generationNotes:              string | null
  personalizationUsed:          string[]
  personalizationGaps:          string[]
  differentiationProfile?:      Record<string, string>
}

export interface ScoringStrategyInput {
  messageType:               string
  primaryGoal:               string
  offerAngle:                string
  tone:                      string
  cta:                       string
  proofPoint:                string | null
  painPointHypothesis:       string
  industrySegment:           string | null
  leadSource:                string
  sequencePosition:          number
  leadStage:                 string
  requiredInclusions:        string[]
  avoid:                     string[]
  partnerMembershipConfirmed:boolean
  personalizationLevel:      string
  lengthTarget:              string
  audienceContext:           string
}

// ---- Utility ----

function containsPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase())
}

function containsAny(text: string, phrases: readonly string[]): string | null {
  for (const phrase of phrases) {
    if (containsPhrase(text, phrase)) return phrase
  }
  return null
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// ---- Offer angle keyword map ----

const OFFER_ANGLE_KEYWORDS: Record<string, string[]> = {
  confirmed_savings_review:      ['review', 'savings', 'statement', 'analysis', 'found'],
  statement_review_offer:        ['review', 'statement', 'take a look', 'assess'],
  payment_processing_audit:      ['audit', 'processing', 'rates', 'fees'],
  partner_co_sell:               ['partner', 'together', 'collaboration'],
  event_follow_up:               ['event', 'expo', 'show', 'conference', 'met'],
  referral_offer:                ['referral', 'introduction', 'connection'],
  seasonal_outreach:             ['seasonal', 'busy', 'quarter'],
  re_engagement_reason:          ['touching base', 'checking in', 'reaching out again'],
  general_value_proposition:     ['value', 'savings', 'processing', 'rates'],
}

// ---- 1. Strategic Fit ----

export function scoreStrategicFit(
  version:         ScoringVersionInput,
  strategy:        ScoringStrategyInput,
  siblingVersions: ScoringVersionInput[] = []
): DimensionScoreResult {
  void siblingVersions
  let score = 85
  const reasons: string[] = []

  // Required inclusions check
  for (const [key, satisfied] of Object.entries(version.requiredInclusionsSatisfied)) {
    if (!satisfied) {
      score -= 10
      reasons.push(`Required inclusion '${key}' not satisfied.`)
    }
  }

  // Avoided elements check
  for (const [key, val] of Object.entries(version.avoidedElementsChecked)) {
    if (val && val !== 'clear') {
      score -= 10
      reasons.push(`Avoided element '${key}' found in body.`)
    }
  }

  // CTA check: if strategy.cta is non-empty, check body
  if (strategy.cta && strategy.cta.trim().length > 0) {
    const ctaWords = strategy.cta.trim().split(/\s+/).slice(0, 5).join(' ')
    if (!containsPhrase(version.bodyText, ctaWords)) {
      score -= 15
      reasons.push('Strategy CTA not found in body text.')
    }
  }

  // Proof point check
  if (strategy.proofPoint && strategy.proofPoint.trim().length > 0) {
    const ppKeywords = strategy.proofPoint.trim().split(/\s+/).filter(w => w.length > 3)
    const foundKeyword = ppKeywords.some(kw => containsPhrase(version.bodyText, kw))
    if (!foundKeyword) {
      score -= 10
      reasons.push('Proof point keywords not found in body.')
    }
  }

  // Offer angle check
  if (strategy.offerAngle) {
    const keywords = OFFER_ANGLE_KEYWORDS[strategy.offerAngle] ?? ['value', 'help', 'review']
    const found = keywords.some(kw => containsPhrase(version.bodyText, kw))
    if (!found) {
      score -= 12
      reasons.push(`Offer angle '${strategy.offerAngle}' keywords not found in body.`)
    }
  }

  // AI corporate language check
  const aiMatch = containsAny(version.bodyText, QRA_AI_CORPORATE_PATTERNS)
  if (aiMatch) {
    score -= 10
    reasons.push(`AI/corporate language detected: "${aiMatch}"`)
  }

  const finalScore = clamp(score, 0, 100)
  const reasoning = finalScore >= 80
    ? 'Version aligns well with strategy goals and required content.'
    : reasons.join(' ') || 'Some strategy alignment gaps detected.'

  return {
    score: finalScore,
    reasoning,
    suggestedFlags: [],
  }
}

// ---- 2. Compliance Confidence ----

export function scoreComplianceConfidence(
  version: ScoringVersionInput
): DimensionScoreResult {
  // body_html invariant — always flag if set
  if (version.bodyHtml !== null) {
    return {
      score:         20,
      reasoning:     'body_html is populated — v1 invariant violated. Version should not have HTML body.',
      suggestedFlags:['RFL_008'],
    }
  }

  let score = 90
  const reasons: string[] = []

  // Compliance notes penalty
  const noteCount = version.complianceNotesApplied.length
  if (noteCount > 0) {
    const penalty = Math.min(noteCount * 5, 30)
    score -= penalty
    reasons.push(`${noteCount} compliance note(s) applied.`)
    score = Math.max(score, 60)
  }

  // Near-urgency scan
  const combinedText = `${version.subjectLine} ${version.bodyText}`
  const urgencyPhrases = ['limited time', 'expires soon', 'last chance', 'act now', "don't miss", 'time sensitive']
  for (const phrase of urgencyPhrases) {
    if (containsPhrase(combinedText, phrase)) {
      score -= 12
      reasons.push(`Near-urgency language detected: "${phrase}"`)
      break
    }
  }

  // Near-savings implication without explicit amount
  if (containsPhrase(combinedText, 'save') || containsPhrase(combinedText, 'savings')) {
    if (!/\$\s*\d+/.test(combinedText) && !/\d+\s*%/.test(combinedText)) {
      score -= 8
      reasons.push('Savings implied but no explicit amount cited.')
    }
  }

  // Partner-adjacent without naming
  if (containsPhrase(combinedText, 'our partnership') || containsPhrase(combinedText, 'our arrangement')) {
    score -= 8
    reasons.push('Partner-adjacent language used without naming partner.')
  }

  const finalScore = clamp(score, 0, 100)
  const reasoning = finalScore >= 80
    ? 'Version shows good compliance confidence — no major issues detected.'
    : reasons.join(' ') || 'Some compliance concerns detected.'

  return {
    score:         finalScore,
    reasoning,
    suggestedFlags:[],
  }
}

// ---- 3. CTA Clarity ----

const CTA_IMPERATIVE_PHRASES = [
  'share your', 'schedule', 'reply', 'let me know', 'call', 'email', 'send', 'submit', 'forward',
]
const VAGUE_CTA_PHRASES = ['let me know', 'reach out', 'feel free']
const FRICTION_MESSAGE_TYPES = new Set(['proposal_follow_up', 'statement_review_follow_up'])

export function scoreCTAClarity(
  version:  ScoringVersionInput,
  strategy: ScoringStrategyInput
): DimensionScoreResult {
  const bodyLower = version.bodyText.toLowerCase()
  const reasons: string[] = []
  const suggestedFlags: string[] = []

  // Count imperative phrases
  const detected = CTA_IMPERATIVE_PHRASES.filter(p => bodyLower.includes(p))
  const count = detected.length

  let score: number
  if (count === 0) {
    score = 20
    reasons.push('No CTA-like phrases detected.')
    suggestedFlags.push('RFL_016')
  } else if (count === 1) {
    score = 85
  } else {
    score = 40
    reasons.push('Multiple CTA phrases — may dilute focus.')
  }

  // Specificity check
  const hasOnlyVague = detected.length > 0 && detected.every(p => VAGUE_CTA_PHRASES.some(v => p.includes(v)))
  if (hasOnlyVague) {
    score -= 20
    reasons.push('Only vague CTA phrases used.')
    suggestedFlags.push('RFL_016')
  }

  // Strategy CTA match
  if (strategy.cta && strategy.cta.trim().length > 0) {
    const ctaWords = strategy.cta.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase()
    if (bodyLower.includes(ctaWords)) {
      score += 10
      reasons.push('Strategy CTA matched in body.')
    }
  }

  // Friction check for high-stakes types
  if (FRICTION_MESSAGE_TYPES.has(strategy.messageType)) {
    if (hasOnlyVague || count === 0) {
      score -= 15
      reasons.push('High-stakes message type requires specific CTA — vague or absent.')
    }
  }

  const finalScore = clamp(score, 0, 100)
  const reasoning = finalScore >= 75
    ? 'CTA is clear and appropriately specific.'
    : reasons.join(' ') || 'CTA clarity could be improved.'

  return { score: finalScore, reasoning, suggestedFlags }
}

// ---- 4. Specificity ----

const SIGNIFICANT_GAPS = ['industry_segment', 'proof_point', 'partner_context']

export function scoreSpecificity(
  version:  ScoringVersionInput,
  strategy: ScoringStrategyInput
): DimensionScoreResult {
  let score = 65
  const reasons: string[] = []

  // Company name used
  if (version.personalizationUsed.includes('company_name')) {
    score += 10
  }

  // Industry used
  if (version.personalizationUsed.includes('industry_segment')) {
    score += 12
  }

  // Proof point used
  const hasProofPointContext = version.personalizationUsed.includes('proof_point') ||
    (strategy.proofPoint ? version.bodyText.toLowerCase().includes(
      strategy.proofPoint.split(' ').slice(0, 3).join(' ').toLowerCase()
    ) : false)
  if (hasProofPointContext) {
    score += 12
  }

  // Partner used when confirmed
  if (strategy.partnerMembershipConfirmed && version.personalizationUsed.includes('partner_context')) {
    score += 8
  }

  // Personalization gaps penalty
  for (const gap of version.personalizationGaps) {
    const gapKey = gap.split(':')[0].trim()
    if (SIGNIFICANT_GAPS.includes(gapKey)) {
      score -= 8
      reasons.push(`Significant personalization gap: ${gapKey}`)
    }
  }

  // Generic language penalty
  if (
    (containsPhrase(version.bodyText, 'your business') || containsPhrase(version.bodyText, 'businesses like yours')) &&
    version.personalizationUsed.length < 2
  ) {
    score -= 10
    reasons.push('Generic language without specific personalization context.')
  }

  // Over-personalization: company name > 3 times
  if (version.personalizationUsed.filter(p => p === 'company_name').length > 3) {
    score -= 10
    reasons.push('Company name appears to be overused.')
  }

  const finalScore = clamp(score, 0, 100)
  const reasoning = finalScore >= 75
    ? 'Version demonstrates good use of lead-specific context.'
    : reasons.join(' ') || 'More personalization context could be incorporated.'

  return { score: finalScore, reasoning, suggestedFlags: [] }
}

// ---- 5. Tone Fit ----

const TONE_PARA_LIMIT: Record<string, number> = {
  executive_brevity: 4,
}
const TONE_WORD_LIMIT: Record<string, number> = {
  executive_brevity: 220,
}

export function scoreToneFit(
  version:  ScoringVersionInput,
  strategy: ScoringStrategyInput
): DimensionScoreResult {
  let score = 80
  const reasons: string[] = []

  // AI/corporate language penalty
  for (const pattern of QRA_AI_CORPORATE_PATTERNS) {
    if (containsPhrase(version.bodyText, pattern)) {
      score -= 15
      reasons.push(`AI/corporate phrase detected: "${pattern}"`)
      break // one penalty per scan
    }
  }

  // Guilt language for follow-up types
  const isFollowUp = [
    'statement_review_follow_up', 'statement_not_submitted_follow_up',
    'proposal_follow_up', 'no_response_follow_up', 're_engagement',
  ].includes(strategy.messageType)

  if (isFollowUp) {
    for (const pattern of QRA_GUILT_LANGUAGE_PATTERNS) {
      if (containsPhrase(version.bodyText, pattern)) {
        score -= 15
        reasons.push(`Guilt language detected: "${pattern}"`)
        break
      }
    }
  }

  // Tone-specific checks
  const tone = strategy.tone ?? ''

  if (tone === 'executive_brevity') {
    const paragraphs = version.bodyText.split('\n\n').filter(p => p.trim().length > 0)
    if (paragraphs.length > TONE_PARA_LIMIT.executive_brevity) {
      score -= 10
      reasons.push(`Executive brevity: too many paragraphs (${paragraphs.length}).`)
    }
    const wordCount = countWords(version.bodyText)
    if (wordCount > TONE_WORD_LIMIT.executive_brevity) {
      score -= 10
      reasons.push(`Executive brevity: word count too high (${wordCount}).`)
    }
  } else if (tone === 'warm_conversational') {
    const warmingPhrases = ['thank', 'appreciate', 'glad', 'happy to', 'look forward', 'hope']
    const hasWarming = warmingPhrases.some(p => containsPhrase(version.bodyText, p))
    if (!hasWarming && countWords(version.bodyText) < 50) {
      score -= 10
      reasons.push('Warm conversational tone appears flat or terse.')
    }
  }

  const finalScore = clamp(score, 0, 100)
  const reasoning = finalScore >= 75
    ? `Tone is well-matched to the "${strategy.tone}" target.`
    : reasons.join(' ') || 'Tone fit could be improved.'

  return { score: finalScore, reasoning, suggestedFlags: [] }
}

// ---- 6. Differentiation ----

export function scoreDifferentiation(
  version:         ScoringVersionInput,
  siblingVersions: ScoringVersionInput[]
): DimensionScoreResult {
  if (siblingVersions.length === 0) {
    return {
      score:         80,
      reasoning:     'No sibling versions available for comparison.',
      suggestedFlags:[],
    }
  }

  const reasons: string[] = []
  const suggestedFlags: string[] = []
  let score = 0

  // Count unique strategy angle
  const siblingAngles = siblingVersions.map(s => s.strategyAngle)
  const isUniqueAngle = !siblingAngles.includes(version.strategyAngle)
  if (isUniqueAngle) {
    score += 15
  } else {
    score -= 25
    reasons.push('Strategy angle is repeated from a sibling version.')
    suggestedFlags.push('RFL_020')
  }

  // Compare differentiation profiles if available
  if (version.differentiationProfile && siblingVersions.some(s => s.differentiationProfile)) {
    const vProf = version.differentiationProfile
    let minDimsFromAnySibling = Infinity
    for (const sibling of siblingVersions) {
      if (!sibling.differentiationProfile) continue
      const sProf = sibling.differentiationProfile
      let diffDims = 0
      for (const key of Object.keys(vProf)) {
        if (vProf[key] !== sProf[key]) diffDims++
      }
      minDimsFromAnySibling = Math.min(minDimsFromAnySibling, diffDims)
    }
    if (minDimsFromAnySibling === 0 || minDimsFromAnySibling === 1) {
      score += 40
      reasons.push('Low profile differentiation from some sibling.')
    } else if (minDimsFromAnySibling === 2) {
      score += 70
    } else {
      score += 85
      reasons.push('Strong profile differentiation from all siblings.')
    }
  } else {
    // No profiles available — use base
    score += 65
  }

  // Structural similarity heuristic
  const vFirstWords = version.bodyText.trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase()
  for (const sibling of siblingVersions) {
    const sFirstWords = sibling.bodyText.trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase()
    if (vFirstWords === sFirstWords && vFirstWords.length > 0) {
      score -= 20
      reasons.push('Body text starts with same words as a sibling version.')
      suggestedFlags.push('RFL_021')
      break
    }
  }

  const finalScore = clamp(score, 0, 100)
  const reasoning = finalScore >= 70
    ? 'Version is meaningfully differentiated from sibling versions.'
    : reasons.join(' ') || 'Version lacks sufficient differentiation.'

  return { score: finalScore, reasoning, suggestedFlags }
}

// ---- 7. Subject/Body Consistency ----

export function scoreSubjectBodyConsistency(
  version:  ScoringVersionInput,
  strategy: ScoringStrategyInput
): DimensionScoreResult {
  let score = 85
  const reasons: string[] = []
  const bodyLower = version.bodyText.toLowerCase()
  const subjectLower = version.subjectLine.toLowerCase()

  // Subject implies findings but body has none
  if (
    (subjectLower.includes('found') || subjectLower.includes('findings')) &&
    !containsPhrase(bodyLower, 'found') &&
    !containsPhrase(bodyLower, 'finding') &&
    !containsPhrase(bodyLower, 'statement') &&
    !(strategy.proofPoint && bodyLower.includes(strategy.proofPoint.split(' ')[0]?.toLowerCase() ?? ''))
  ) {
    score -= 30
    reasons.push('Subject implies findings but body lacks supporting content.')
  }

  // Subject implies savings but body doesn't
  if (subjectLower.includes('savings') && !containsPhrase(bodyLower, 'savings') && !containsPhrase(bodyLower, 'save')) {
    score -= 25
    reasons.push('Subject implies savings but body does not address this.')
  }

  // Subject mentions partner but body doesn't
  const partnerPatterns = ['partner', 'bcsg', 'certainpath', 'blue collar']
  const subjectMentionsPartner = partnerPatterns.some(p => subjectLower.includes(p))
  const bodyMentionsPartner    = partnerPatterns.some(p => bodyLower.includes(p))
  if (subjectMentionsPartner && !bodyMentionsPartner) {
    score -= 20
    reasons.push('Subject mentions partner but body does not reference this.')
  }

  // Subject says review complete but wrong message type
  const reviewCompletePatterns = ['review complete', 'review is complete', 'statement review complete']
  const subjectHasReviewComplete = reviewCompletePatterns.some(p => subjectLower.includes(p))
  if (subjectHasReviewComplete && strategy.messageType !== 'statement_review_follow_up') {
    score -= 30
    reasons.push('Subject claims review complete but message type is not statement_review_follow_up.')
  }

  // Generic subject check
  if (/^processing review\s*[—\-–]\s*.+$/.test(subjectLower)) {
    score -= 10
    reasons.push('Generic subject line detected.')
  }

  // Preview mismatch: first 15 words of body vs subject topic
  const bodyFirstWords = version.bodyText.trim().split(/\s+/).slice(0, 15).join(' ').toLowerCase()
  const subjectTopicWords = version.subjectLine.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  const hasTopicOverlap = subjectTopicWords.some(w => bodyFirstWords.includes(w))
  if (!hasTopicOverlap && subjectTopicWords.length > 0) {
    score -= 15
    reasons.push('Opening body text appears unrelated to subject line topic.')
  }

  const finalScore = clamp(score, 0, 100)
  const reasoning = finalScore >= 75
    ? 'Subject line and body text are topically consistent.'
    : reasons.join(' ') || 'Subject/body consistency issues detected.'

  return { score: finalScore, reasoning, suggestedFlags: [] }
}

// ---- 8. Readability ----

export function scoreReadability(
  version:  ScoringVersionInput,
  strategy: ScoringStrategyInput
): DimensionScoreResult {
  const wordCount = countWords(version.bodyText)
  const target = QRA_LENGTH_TARGETS[strategy.messageType] ?? { min: 80, max: 200 }
  const reasons: string[] = []
  let score: number

  // Within target
  if (wordCount >= target.min && wordCount <= target.max) {
    score = 85
  } else if (wordCount > target.max * 1.3) {
    score = 85 - 20
    reasons.push(`Body is too long (${wordCount} words; max ~${target.max}).`)
  } else if (wordCount < target.min * 0.7) {
    score = 85 - 10
    reasons.push(`Body may be too short (${wordCount} words; min ~${target.min}).`)
  } else {
    score = 75
    reasons.push(`Word count (${wordCount}) is slightly outside target range (${target.min}–${target.max}).`)
  }

  // Paragraph count
  const paragraphs = version.bodyText.split('\n\n').filter(p => p.trim().length > 0)
  if (paragraphs.length > 5) {
    score -= 10
    reasons.push(`Too many paragraphs (${paragraphs.length}).`)
  }

  // Long sentences
  const sentences = version.bodyText.split(/[.!?]/).filter(s => s.trim().length > 0)
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/)
    if (words.length > 35) {
      score -= 5
      reasons.push('Long sentence detected (>35 words).')
      break // one penalty
    }
  }

  const finalScore = clamp(score, 0, 100)
  const reasoning = finalScore >= 75
    ? `Readability is good — word count (${wordCount}) within target range.`
    : reasons.join(' ') || `Word count: ${wordCount}, target: ${target.min}–${target.max}.`

  return { score: finalScore, reasoning, suggestedFlags: [] }
}
