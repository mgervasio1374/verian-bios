// ---- Constants ----

export const RUBRIC_VERSION = 'email-quality-v1' as const

const GENERIC_OPENINGS = [
  'i came across',
  'i stumbled upon',
  'i noticed your',
  'wanted to reach out',
  'hope this finds you well',
  'hope you are doing well',
  'just reaching out',
  'just checking in',
]

const SPAM_PHRASES = [
  'save significantly',
  'reduce costs significantly',
  'guaranteed savings',
  'guaranteed results',
  'best rates in the industry',
  'lowest rates',
  'limited time offer',
  'act now',
  'act today',
  "don't miss out",
  'best in the industry',
]

const TRUST_RED_FLAGS = [
  'guaranteed savings',
  'save significantly',
  'save you money',
  'guaranteed results',
  'best rates',
  'lowest rates',
  'proven results',
]

const CONTEXT_PHRASES = [
  'statement',
  'processing statement',
  'merchant statement',
  'processing costs',
  'effective rate',
  'card mix',
  'statement review',
  'walk through',
  'fees',
  'funding',
]

const POSITIVE_CTA_PHRASES = [
  '15-minute',
  '15 minute',
  'quick call',
  'quick chat',
  'statement review',
  'schedule',
  'calendly',
  'this week',
  'short call',
  'would you be open',
  'would you like',
]

const ROBOTIC_PHRASES = [
  'i would like to take this opportunity',
  'as per our previous',
  'please do not hesitate',
  'it would be great if',
  'i am writing to inform you',
  'please be advised',
  'i hope this email finds you',
]

const PLACEHOLDER_RE = /\{\{[a-zA-Z_]+\}\}|\[[a-zA-Z\s]+\]/

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function includes(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase()
  return phrases.some(p => lower.includes(p))
}

// ---- Types ----

export interface EmailQualityContext {
  leadName?:    string
  companyName?: string
  industry?:    string
  source?:      string
  stage?:       string
}

export interface EmailQualityInput {
  tenantId:          string
  workspaceId?:      string
  leadId?:           string
  companyId?:        string
  emailDraftId:      string
  subject:           string
  bodyText:          string
  templateSlug?:     string
  recommendationRule?: string
  context?:          EmailQualityContext
}

export interface EmailQualityReview {
  overallScore:          number
  status:                'pass' | 'needs_revision' | 'blocked'
  subjectScore:          number
  openingScore:          number
  personalizationScore:  number
  valueClarityScore:     number
  ctaScore:              number
  trustScore:            number
  brevityScore:          number
  spamRiskScore:         number
  brandFitScore:         number
  humanToneScore:        number
  strengths:             string[]
  weaknesses:            string[]
  riskFlags:             string[]
  suggestedSubject?:     string
  suggestedBody?:        string
  reviewSummary:         string
  rubricVersion:         typeof RUBRIC_VERSION
  // Suggested rewrite scoring (no recursion — scored without generating another rewrite)
  suggestedOverallScore?:   number
  suggestedStatus?:         'pass' | 'needs_revision' | 'blocked'
  suggestedWeaknesses?:     string[]
  suggestedRiskFlags?:      string[]
  suggestedReviewSummary?:  string
}

// ---- Dimension scorers ----

function scoreSubject(subject: string): { score: number; strengths: string[]; weaknesses: string[] } {
  let score = 65
  const strengths: string[] = []
  const weaknesses: string[] = []
  const lower = subject.toLowerCase()

  // Length
  if (subject.length >= 25 && subject.length <= 60) {
    score += 10
    strengths.push('Subject length is appropriate')
  } else if (subject.length > 70) {
    score -= 15
    weaknesses.push('Subject is too long — aim for under 60 characters')
  } else if (subject.length < 15) {
    score -= 10
    weaknesses.push('Subject is too short to communicate value')
  }

  // Specific context
  if (/statement|processing|payment|fees|rates|proposal|review/.test(lower)) {
    score += 15
    strengths.push('Subject references specific payment processing context')
  } else {
    score -= 5
    weaknesses.push('Subject could be more specific to the payment processing situation')
  }

  // Generic subject phrases
  const genericPhrases = ['quick question', 'touching base', 'just checking in', 'following up with you']
  if (genericPhrases.some(p => lower.includes(p))) {
    score -= 20
    weaknesses.push('Subject uses a generic phrase that may be ignored')
  }

  // Salesy / spam-risk
  if (/free|guaranteed|limited time|act now|save money/.test(lower)) {
    score -= 20
    weaknesses.push('Subject contains salesy language that risks spam filters')
  }

  // ALL CAPS words
  if (/[A-Z]{4,}/.test(subject)) {
    score -= 10
    weaknesses.push('Subject contains all-caps words — soften the tone')
  }

  return { score: clamp(score), strengths, weaknesses }
}

function scoreOpening(bodyText: string): { score: number; strengths: string[]; weaknesses: string[] } {
  const firstPara = bodyText.split(/\n\n/)[0] ?? bodyText.slice(0, 200)
  const lower = firstPara.toLowerCase()
  let score = 55
  const strengths: string[] = []
  const weaknesses: string[] = []

  // Strong opening — references actual trigger
  if (/thanks for submitting|thanks for sending|thanks for reaching out|thank you for submitting/.test(lower)) {
    score += 30
    strengths.push('Opening references the prospect\'s actual action — feels relevant, not cold')
  } else if (/thanks for/.test(lower)) {
    score += 15
    strengths.push('Opening acknowledges the prospect')
  }

  // Weak openings
  if (includes(bodyText, ['i came across', 'i stumbled upon', 'i noticed your'])) {
    score -= 30
    weaknesses.push('"I came across" style openings feel stalker-ish and insincere — replace with a real trigger')
  }

  if (includes(bodyText, ['wanted to reach out'])) {
    score -= 20
    weaknesses.push('"Wanted to reach out" is a filler phrase — state the purpose directly instead')
  }

  // Generic greetings
  if (includes(bodyText, ['hope this finds you well', 'hope you are doing well'])) {
    score -= 15
    weaknesses.push('Generic greeting wastes the opening line — get to the point immediately')
  }

  // Context-specific content in opening
  if (includes(firstPara, ['statement', 'processing', 'fees'])) {
    score += 15
    strengths.push('Opening references payment processing context early')
  }

  return { score: clamp(score), strengths, weaknesses }
}

function scorePersonalization(
  bodyText: string,
  context?: EmailQualityContext
): { score: number; strengths: string[]; weaknesses: string[] } {
  let score = 55
  const strengths: string[] = []
  const weaknesses: string[] = []
  const lower = bodyText.toLowerCase()

  // Template placeholders not filled
  if (PLACEHOLDER_RE.test(bodyText)) {
    score -= 30
    weaknesses.push('Template placeholder not filled — draft contains unfilled variables like {{firstName}}')
  }

  // Company name present
  if (context?.companyName && lower.includes(context.companyName.toLowerCase())) {
    score += 15
    strengths.push('Email correctly references the company name')
  } else if (context?.companyName) {
    score -= 10
    weaknesses.push('Company name not referenced in body — add it for personalization')
  }

  // First name
  const firstName = context?.leadName?.split(' ')[0]
  if (firstName && lower.includes(firstName.toLowerCase())) {
    score += 10
    strengths.push('Email addresses the recipient by first name')
  }

  // Generic "businesses like yours"
  if (lower.includes('businesses like yours')) {
    score -= 25
    weaknesses.push('"Businesses like yours" is a mass-email phrase — replace with something specific to this company')
  }

  // Industry reference
  if (context?.industry && lower.includes(context.industry.toLowerCase())) {
    score += 10
    strengths.push('Email references the prospect\'s industry')
  }

  return { score: clamp(score), strengths, weaknesses }
}

function scoreValueClarity(bodyText: string): { score: number; strengths: string[]; weaknesses: string[] } {
  let score = 55
  const strengths: string[] = []
  const weaknesses: string[] = []
  const lower = bodyText.toLowerCase()

  // Specific payment processing value
  if (/processing statement|statement review|effective rate|card mix|processing costs|interchange/.test(lower)) {
    score += 25
    strengths.push('Email references specific payment processing concepts that establish expertise')
  } else if (/payment|processing|fees|rates/.test(lower)) {
    score += 10
    strengths.push('Email references payment processing context')
  }

  // Vague value props
  if (lower.includes('better reporting and support')) {
    score -= 25
    weaknesses.push('"Better reporting and support" is too vague — specify what 321 Swipe actually provides')
  }
  if (/help businesses.*like yours|help you grow|take your business/.test(lower)) {
    score -= 15
    weaknesses.push('Value proposition is too generic — connect it to the prospect\'s specific situation')
  }

  // 321 Swipe mentioned
  if (lower.includes('321 swipe')) {
    score += 10
    strengths.push('Email clearly identifies 321 Swipe as the sender/service')
  }

  // Statement review framing (good)
  if (/walk through|closer look|worth a look|worth reviewing/.test(lower)) {
    score += 10
    strengths.push('Framing the next step as "a closer look" is consultative and non-pushy')
  }

  return { score: clamp(score), strengths, weaknesses }
}

function scoreCta(bodyText: string): { score: number; strengths: string[]; weaknesses: string[] } {
  let score = 60
  const strengths: string[] = []
  const weaknesses: string[] = []
  const lower = bodyText.toLowerCase()

  const hasPositiveCta = includes(bodyText, POSITIVE_CTA_PHRASES)
  const hasCalendly = lower.includes('calendly')

  if (hasCalendly) {
    score += 15
    strengths.push('Calendly link provides a low-friction scheduling option')
  } else if (hasPositiveCta) {
    score += 20
    strengths.push('CTA is clear and low-friction')
  } else if (/call|chat|meeting|schedule/.test(lower)) {
    score += 5
  } else {
    score -= 15
    weaknesses.push('No clear next step found — add a specific, easy CTA')
  }

  // Aggressive CTAs
  if (/sign up now|get started today|limited time|act now|don't wait/.test(lower)) {
    score -= 25
    weaknesses.push('CTA is too aggressive for a first-touch email — soften to a question or invitation')
  }

  // Multiple CTAs (count Calendly-style links)
  const linkCount = (bodyText.match(/https?:\/\//g) ?? []).length
  if (linkCount > 2) {
    score -= 10
    weaknesses.push('Multiple links create choice overload — keep one clear next step')
  }

  return { score: clamp(score), strengths, weaknesses }
}

function scoreTrust(bodyText: string): { score: number; strengths: string[]; weaknesses: string[] } {
  let score = 70
  const strengths: string[] = []
  const weaknesses: string[] = []
  const lower = bodyText.toLowerCase()

  if (includes(bodyText, ['save significantly', 'guaranteed savings', 'save you money'])) {
    score -= 30
    weaknesses.push('Unsupported savings claim — state numbers only after reviewing the actual statement')
  }
  if (lower.includes('guaranteed')) {
    score -= 20
    weaknesses.push('"Guaranteed" is a strong claim that requires evidence to support')
  }
  if (/best rates|lowest rates|best in the industry/.test(lower)) {
    score -= 20
    weaknesses.push('"Best rates" claims are unverifiable without a statement comparison')
  }
  if (/worth a closer look|take a look together|before making any|after reviewing|pending review/.test(lower)) {
    score += 15
    strengths.push('Advisory framing sets appropriate expectations before any claims are made')
  }
  if (/based on.*review|based on.*analysis|preliminary/.test(lower)) {
    score += 10
    strengths.push('Cautious framing acknowledges that claims are preliminary')
  }

  return { score: clamp(score), strengths, weaknesses }
}

function scoreBrevity(bodyText: string): { score: number; strengths: string[]; weaknesses: string[] } {
  const words = bodyText.trim().split(/\s+/).length
  const paras = bodyText.split(/\n\n+/).length
  let score = 75
  const strengths: string[] = []
  const weaknesses: string[] = []

  if (words < 50) {
    score -= 20
    weaknesses.push('Email is too short to communicate value — add relevant context')
  } else if (words <= 150) {
    score += 15
    strengths.push('Email is concisely written — ideal length for a first-touch')
  } else if (words <= 250) {
    // acceptable
  } else if (words <= 350) {
    score -= 10
    weaknesses.push(`Email is ${words} words — trim to under 200 for better first-touch engagement`)
  } else {
    score -= 25
    weaknesses.push(`Email is ${words} words — too long for a first-touch. Aim for under 150 words`)
  }

  if (paras > 5) {
    score -= 10
    weaknesses.push('Too many paragraphs — consolidate to 3–4 focused blocks')
  }

  return { score: clamp(score), strengths, weaknesses }
}

function scoreSpamRisk(subject: string, bodyText: string): {
  score: number; strengths: string[]; weaknesses: string[]
} {
  let score = 80
  const strengths: string[] = []
  const weaknesses: string[] = []
  const fullText = `${subject} ${bodyText}`.toLowerCase()

  if (fullText.includes('save significantly')) score -= 25
  if (/(free|guaranteed|limited time|act now|act today|discount|winner|prize)/i.test(fullText)) score -= 20
  if (/click here|click below/i.test(fullText)) {
    score -= 10
    weaknesses.push('"Click here" is a spam-filter trigger — use descriptive link text')
  }

  const exclamations = (bodyText.match(/!/g) ?? []).length
  if (exclamations > 2) {
    score -= 5 * (exclamations - 2)
    weaknesses.push(`${exclamations} exclamation marks — reduce to 1 or fewer`)
  }
  if (/[A-Z]{5,}/.test(bodyText)) {
    score -= 10
    weaknesses.push('All-caps phrases detected — spam filters flag these')
  }
  if (score >= 75) strengths.push('Email avoids major spam trigger phrases')

  return { score: clamp(score), strengths, weaknesses }
}

// Risk flags are computed separately so they can be aggregated cleanly.
function computeRiskFlags(subject: string, bodyText: string): string[] {
  const flags: string[] = []
  const full = `${subject} ${bodyText}`.toLowerCase()
  if (full.includes('save significantly'))   flags.push('"Save significantly" is an unsupported claim and a known spam trigger')
  if (full.includes('guaranteed'))           flags.push('Guarantee language without supporting evidence')
  if (/best rates|lowest rates/.test(full))  flags.push('Comparative rate claim without analysis basis')
  if (full.includes('hidden fees') && !full.includes('statement'))
    flags.push('"Hidden fees" claim without statement analysis context')
  if (/(free|guaranteed|limited time|act now)/i.test(full))
    flags.push('Spam trigger words detected in subject or body')
  return flags
}

function scoreBrandFit(bodyText: string): { score: number; strengths: string[]; weaknesses: string[] } {
  let score = 55
  const strengths: string[] = []
  const weaknesses: string[] = []
  const lower = bodyText.toLowerCase()

  // 321 Swipe mentioned
  if (lower.includes('321 swipe')) {
    score += 20
    strengths.push('Email clearly identifies 321 Swipe')
  } else {
    score -= 10
    weaknesses.push('321 Swipe not mentioned — ensure brand is clearly represented')
  }

  // Statement review process (on-brand for 321 Swipe)
  if (/statement review|processing statement|walk through the|take a closer look/.test(lower)) {
    score += 15
    strengths.push('Email reflects 321 Swipe\'s advisory, analysis-first approach')
  }

  // Generic / off-brand
  if (/businesses like yours.*grow|unlock.*potential|transform your/.test(lower)) {
    score -= 20
    weaknesses.push('Marketing clichés make the email feel generic — not on-brand for 321 Swipe\'s advisory style')
  }

  // Overly formal
  if (/i am writing to inform|please be advised|pursuant to/.test(lower)) {
    score -= 15
    weaknesses.push('Overly formal language — 321 Swipe should sound direct and professional, not legal')
  }

  return { score: clamp(score), strengths, weaknesses }
}

function scoreHumanTone(bodyText: string): { score: number; strengths: string[]; weaknesses: string[] } {
  let score = 55
  const strengths: string[] = []
  const weaknesses: string[] = []

  // Unfilled placeholders
  if (PLACEHOLDER_RE.test(bodyText)) {
    score -= 30
    weaknesses.push('Unfilled template placeholders detected — resolve before sending')
  }

  // Robotic phrases
  if (includes(bodyText, ROBOTIC_PHRASES)) {
    score -= 20
    weaknesses.push('Robotic or overly formal phrasing makes the email feel automated')
  }

  // Conversational signals
  if (/worth a look|happy to|quick|let me know|i'd love|i would love/.test(bodyText.toLowerCase())) {
    score += 20
    strengths.push('Conversational language makes the email feel natural and human')
  }

  // First-person active voice
  if (/i reviewed|i looked|i checked|i noticed something/.test(bodyText.toLowerCase())) {
    score += 15
    strengths.push('First-person active voice sounds genuine, not robotic')
  }

  // Mass-blast feel
  if (includes(bodyText, ['businesses like yours', 'many businesses', 'countless businesses'])) {
    score -= 15
    weaknesses.push('Mass-email language detected — personalise to this specific prospect')
  }

  // "I came across"
  if (includes(bodyText, ['i came across', 'i stumbled upon'])) {
    score -= 15
    weaknesses.push('"I came across" phrasing sounds manufactured — reference the real reason for contact')
  }

  return { score: clamp(score), strengths, weaknesses }
}

// ---- Suggested rewrite ----

function extractFirstName(leadName?: string): string {
  if (!leadName) return 'there'
  return leadName.split(/[\s\-]/)[0] || 'there'
}

function generateSuggestedRewrite(input: EmailQualityInput): {
  subject: string; body: string
} {
  const firstName   = extractFirstName(input.context?.leadName)
  const companyName = input.context?.companyName ?? 'your business'
  const lowerBody   = input.bodyText.toLowerCase()

  // Statement received / proposal flow.
  // NOTE: intake_initial_contact is intentionally excluded — it fires for new_inquiry too.
  // Body text alone is not sufficient; require hard stage or template signal.
  const isStatementFlow =
    input.templateSlug === 'email_statement_proposal' ||
    input.context?.stage === 'statement_received' ||
    input.context?.stage === 'statement_review' ||
    input.context?.stage === 'proposal_sent' ||
    // Only trust body text if it contains phrases exclusive to actual statement submissions
    lowerBody.includes('thanks for sending over the processing statement') ||
    lowerBody.includes('thanks for submitting your processing statement')

  if (isStatementFlow) {
    return {
      subject: 'Quick follow-up on your processing statement',
      body:
        `Hi ${firstName},\n\n` +
        `Thanks for sending over the processing statement for ${companyName}.\n\n` +
        `I reviewed enough to see it is worth a closer look, but I would rather walk through ` +
        `the details with you than throw out a generic savings claim by email.\n\n` +
        `Would you be open to a quick statement review this week?\n\n` +
        `Best,\n321 Swipe`,
    }
  }

  // Initial contact / inquiry
  return {
    subject: 'Following up on your payment review request',
    body:
      `Hi ${firstName},\n\n` +
      `Thanks for reaching out to 321 Swipe.\n\n` +
      `The best next step is to take a quick look at your current processing setup and see ` +
      `whether there are any areas worth reviewing.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n321 Swipe`,
  }
}

// ---- Shared scorer (no suggested rewrite generation — safe to call twice) ----

interface ContentScores {
  overallScore:         number
  status:               'pass' | 'needs_revision' | 'blocked'
  subjectScore:         number
  openingScore:         number
  personalizationScore: number
  valueClarityScore:    number
  ctaScore:             number
  trustScore:           number
  brevityScore:         number
  spamRiskScore:        number
  brandFitScore:        number
  humanToneScore:       number
  strengths:            string[]
  weaknesses:           string[]
  riskFlags:            string[]
  reviewSummary:        string
}

function scoreEmailContent(
  subject: string,
  bodyText: string,
  context?: EmailQualityContext
): ContentScores {
  const subjectResult         = scoreSubject(subject)
  const openingResult         = scoreOpening(bodyText)
  const personalizationResult = scorePersonalization(bodyText, context)
  const valueClarityResult    = scoreValueClarity(bodyText)
  const ctaResult             = scoreCta(bodyText)
  const trustResult           = scoreTrust(bodyText)
  const brevityResult         = scoreBrevity(bodyText)
  const spamResult            = scoreSpamRisk(subject, bodyText)
  const brandResult           = scoreBrandFit(bodyText)
  const humanResult           = scoreHumanTone(bodyText)

  const overallScore = clamp(
    subjectResult.score         * 0.12 +
    openingResult.score         * 0.13 +
    personalizationResult.score * 0.12 +
    valueClarityResult.score    * 0.12 +
    ctaResult.score             * 0.10 +
    trustResult.score           * 0.12 +
    brevityResult.score         * 0.08 +
    spamResult.score            * 0.10 +
    brandResult.score           * 0.06 +
    humanResult.score           * 0.05
  )

  const strengths: string[] = [
    ...subjectResult.strengths, ...openingResult.strengths,
    ...personalizationResult.strengths, ...valueClarityResult.strengths,
    ...ctaResult.strengths, ...trustResult.strengths,
    ...brevityResult.strengths, ...spamResult.strengths,
    ...brandResult.strengths, ...humanResult.strengths,
  ]
  const weaknesses: string[] = [
    ...subjectResult.weaknesses, ...openingResult.weaknesses,
    ...personalizationResult.weaknesses, ...valueClarityResult.weaknesses,
    ...ctaResult.weaknesses, ...trustResult.weaknesses,
    ...brevityResult.weaknesses, ...spamResult.weaknesses,
    ...brandResult.weaknesses, ...humanResult.weaknesses,
  ]
  const riskFlags = computeRiskFlags(subject, bodyText)

  const status: 'pass' | 'needs_revision' | 'blocked' =
    overallScore >= 85 ? 'pass' : overallScore >= 70 ? 'needs_revision' : 'blocked'

  const problemCount = weaknesses.length + riskFlags.length
  const reviewSummary =
    status === 'pass'
      ? `Email scored ${overallScore}/100 and meets the quality threshold. ${strengths[0] ? strengths[0] + '.' : ''}`
      : status === 'needs_revision'
      ? `Email scored ${overallScore}/100. ${problemCount} issue(s) found. Review weaknesses before sending.`
      : `Email scored ${overallScore}/100 and is below the acceptable threshold. A rewrite is strongly recommended.`

  return {
    overallScore,
    status,
    subjectScore:         subjectResult.score,
    openingScore:         openingResult.score,
    personalizationScore: personalizationResult.score,
    valueClarityScore:    valueClarityResult.score,
    ctaScore:             ctaResult.score,
    trustScore:           trustResult.score,
    brevityScore:         brevityResult.score,
    spamRiskScore:        spamResult.score,
    brandFitScore:        brandResult.score,
    humanToneScore:       humanResult.score,
    strengths,
    weaknesses,
    riskFlags,
    reviewSummary,
  }
}

// ---- Main function ----

export function reviewEmailDraftQuality(input: EmailQualityInput): EmailQualityReview {
  // Score the original content
  const scores = scoreEmailContent(input.subject, input.bodyText, input.context)

  // Generate suggested rewrite
  const rewrite = generateSuggestedRewrite(input)

  // Score the suggested rewrite (no recursion — scoreEmailContent doesn't generate rewrites)
  const suggestedScores = scoreEmailContent(rewrite.subject, rewrite.body, input.context)

  return {
    ...scores,
    suggestedSubject:      rewrite.subject,
    suggestedBody:         rewrite.body,
    suggestedOverallScore: suggestedScores.overallScore,
    suggestedStatus:       suggestedScores.status,
    suggestedWeaknesses:   suggestedScores.weaknesses,
    suggestedRiskFlags:    suggestedScores.riskFlags,
    suggestedReviewSummary: suggestedScores.reviewSummary,
    rubricVersion: RUBRIC_VERSION,
  }
}
