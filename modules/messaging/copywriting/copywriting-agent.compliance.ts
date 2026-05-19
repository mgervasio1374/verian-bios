// ============================================================
// Phase 3B — Compliance Validator
// Pure function. No I/O. No side effects.
// Checks a MessageVersionDraft against strategy compliance
// rules, banned phrases, context-specific prohibitions, and
// required inclusions.
// Does not assign quality scores. Does not rank versions.
// ============================================================

import {
  GLOBAL_BANNED_PHRASES,
  COPY_ERROR_CODES,
} from './copywriting-agent.types'
import type {
  MessageVersionDraft,
  ComplianceCheckResult,
  CopywritingLeadContext,
} from './copywriting-agent.types'
import type { MessageStrategy } from '@/modules/messaging/strategy/message-strategy.types'

// ---- Inbound sources (for cold-language check) ----

const INBOUND_SOURCES = new Set<string>([
  'website', 'tawk.to', 'calendly', 'app.321swipe.com', 'upload.321swipe.com',
])

const COLD_SOURCES = new Set<string>([
  'manual', 'import', 'cold_outreach', 'referral',
])

// ---- Context-specific additional banned patterns ----

const INBOUND_LANGUAGE_PATTERNS: readonly string[] = [
  'thanks for reaching out',
  'thank you for reaching out',
  'got your inquiry',
  'received your inquiry',
  'received your message',
]

const COLD_DISCOVERY_PATTERNS: readonly string[] = [
  'i came across your business',
  'i stumbled upon your company',
  'i came across',
  'i stumbled upon',
  'found your business',
  'discovered your company',
]

const URGENCY_PATTERNS: readonly string[] = [
  'limited time',
  'this offer expires',
  "don't miss out",
  'act now',
  'expires soon',
  'last chance',
]

const GUARANTEED_OUTCOME_PATTERNS: readonly string[] = [
  'guaranteed savings',
  'guaranteed results',
  'we guarantee',
  'you will save',
  'certain to reduce',
  'definitely save',
  'will definitely',
]

const EXCLUSIVE_PARTNER_PATTERNS: readonly string[] = [
  'exclusive partner',
  'preferred partner',
  'official partner of',
  'endorsed by',
  'authorized partner',
]

// ---- Helper: case-insensitive phrase check ----

function containsPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase())
}

function containsAnyPhrase(text: string, phrases: readonly string[]): string | null {
  for (const phrase of phrases) {
    if (containsPhrase(text, phrase)) return phrase
  }
  return null
}

function checkBannedPhrases(subjectLine: string, bodyText: string): string[] {
  const found: string[] = []
  const combined = `${subjectLine}\n${bodyText}`
  for (const phrase of GLOBAL_BANNED_PHRASES) {
    if (containsPhrase(combined, phrase)) {
      found.push(phrase)
    }
  }
  return found
}

function checkAvoidList(subjectLine: string, bodyText: string, avoidList: string[]): string[] {
  const combined = `${subjectLine}\n${bodyText}`
  return avoidList.filter(item => containsPhrase(combined, item))
}

function checkRequiredInclusions(bodyText: string, requiredInclusions: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const req of requiredInclusions) {
    // Check if a substantive portion of the requirement is present
    // Use first 30 chars as a key fragment for matching
    const fragment = req.slice(0, 40).toLowerCase()
    result[req] = bodyText.toLowerCase().includes(fragment.split(' ')[0] ?? req.slice(0, 10))
  }
  return result
}

// ---- Main compliance check ----

export function checkCompliance(
  draft:       MessageVersionDraft,
  strategy:    MessageStrategy,
  leadContext: CopywritingLeadContext
): ComplianceCheckResult {
  const errors:               string[] = []
  const bannedPhrasesFound:   string[] = []
  const unsupportedClaims:    string[] = []
  const avoidListViolations:  string[] = []
  const contextViolations:    string[] = []

  const subject = draft.subjectLine
  const body    = draft.bodyText
  const combined = `${subject}\n${body}`

  // ---- 1. Global banned phrases ----
  const banned = checkBannedPhrases(subject, body)
  bannedPhrasesFound.push(...banned)
  if (banned.length > 0) {
    errors.push(COPY_ERROR_CODES.COPY_019)
  }

  // ---- 2. Avoid list from strategy ----
  const avoidViolations = checkAvoidList(subject, body, strategy.avoid ?? [])
  avoidListViolations.push(...avoidViolations)
  if (avoidViolations.length > 0) {
    errors.push(COPY_ERROR_CODES.COPY_016)
  }

  // ---- 3. Context-specific: cold vs inbound framing ----
  const leadSource = strategy.lead_source ?? ''
  const isInbound  = INBOUND_SOURCES.has(leadSource)
  const isCold     = COLD_SOURCES.has(leadSource) || (!isInbound && leadSource !== '')

  if (isCold) {
    // Cold lead — must not use inbound acknowledgment language
    const inboundViolation = containsAnyPhrase(combined, INBOUND_LANGUAGE_PATTERNS)
    if (inboundViolation) {
      contextViolations.push(`Cold lead: inbound language detected — "${inboundViolation}"`)
      errors.push(COPY_ERROR_CODES.COPY_016)
    }
  }

  if (isInbound) {
    // Inbound lead — must not use cold-discovery language
    const coldViolation = containsAnyPhrase(combined, COLD_DISCOVERY_PATTERNS)
    if (coldViolation) {
      contextViolations.push(`Inbound lead: cold-discovery language detected — "${coldViolation}"`)
      errors.push(COPY_ERROR_CODES.COPY_016)
    }
  }

  // ---- 4. Deceptive urgency ----
  const urgencyViolation = containsAnyPhrase(combined, URGENCY_PATTERNS)
  if (urgencyViolation) {
    unsupportedClaims.push(`Deceptive urgency detected — "${urgencyViolation}"`)
    errors.push(COPY_ERROR_CODES.COPY_016)
  }

  // ---- 5. Guaranteed outcomes ----
  const guaranteeViolation = containsAnyPhrase(combined, GUARANTEED_OUTCOME_PATTERNS)
  if (guaranteeViolation) {
    unsupportedClaims.push(`Guaranteed outcome language detected — "${guaranteeViolation}"`)
    errors.push(COPY_ERROR_CODES.COPY_016)
  }

  // ---- 6. Savings claims: specific amounts without calculated data ----
  const hasSavingsAmount = strategy.offer_angle === 'confirmed_savings_review'
  // Look for dollar amounts ($XXX) or percentage claims (XX%)
  const dollarPattern  = /\$\s*\d+/
  const percentPattern = /\d+\s*%\s*(savings|reduction|less)/i
  if (!hasSavingsAmount) {
    if (dollarPattern.test(combined)) {
      unsupportedClaims.push('Specific dollar savings claim without calculated_savings_amount')
      errors.push(COPY_ERROR_CODES.COPY_016)
    }
    if (percentPattern.test(combined)) {
      unsupportedClaims.push('Specific percentage savings claim without calculated_savings_amount')
      errors.push(COPY_ERROR_CODES.COPY_016)
    }
  }

  // ---- 7. Statement review findings without findings context ----
  // review_summary is not a field on MessageStrategy.
  // The Message Strategy Agent stores findings context in proof_point (key finding)
  // or pain_point_hypothesis (hypothesis that was validated by the review).
  // We use the presence of proof_point as the primary indicator that findings exist.
  const hasFindingsContext = !!(strategy.proof_point || strategy.pain_point_hypothesis)
  const findingsLanguage = [
    'what we found in your statement',
    'the review found',
    'our analysis found',
    'your statement shows',
  ]
  if (strategy.message_type === 'statement_review_follow_up' && !hasFindingsContext) {
    const findingsViolation = containsAnyPhrase(combined, findingsLanguage)
    if (findingsViolation) {
      unsupportedClaims.push(`Statement findings language without findings context (proof_point/pain_point_hypothesis) — "${findingsViolation}"`)
      errors.push(COPY_ERROR_CODES.COPY_020)
    }
  }

  // ---- 8. Partner language without confirmed membership ----
  const partnerConfirmed = strategy.partner_membership?.confirmed ?? false
  if (!partnerConfirmed) {
    const partnerKeywords = ['certainpath', 'bcsg', 'blue collar success group']
    for (const kw of partnerKeywords) {
      if (containsPhrase(combined, kw)) {
        contextViolations.push(`Partner language without confirmed membership — "${kw}"`)
        errors.push(COPY_ERROR_CODES.COPY_016)
      }
    }
  }

  // ---- 9. Exclusivity/preferred partner claims ----
  if (partnerConfirmed) {
    const partnerClaimsAuthorized = false // no partner_claims_authorized in strategy schema; default false
    if (!partnerClaimsAuthorized) {
      const exclusivityViolation = containsAnyPhrase(combined, EXCLUSIVE_PARTNER_PATTERNS)
      if (exclusivityViolation) {
        contextViolations.push(`Exclusivity claim without partner_claims_authorized — "${exclusivityViolation}"`)
        errors.push(COPY_ERROR_CODES.COPY_016)
      }
    }
  }

  // ---- 10. Event conversation references without conversation_notes ----
  if (strategy.message_type === 'event_expo_follow_up') {
    // conversationNotes is a typed field on CopywritingLeadContext, populated from
    // strategy.proof_point when the message_type is event_expo_follow_up.
    const conversationNotes = leadContext.conversationNotes
    const discussionLanguage = ['as we discussed', 'based on our conversation', 'after our call', 'you mentioned']
    if (!conversationNotes) {
      const discussionViolation = containsAnyPhrase(combined, discussionLanguage)
      if (discussionViolation) {
        contextViolations.push(`Event conversation reference without conversation_notes — "${discussionViolation}"`)
        errors.push(COPY_ERROR_CODES.COPY_020)
      }
    }
  }

  // ---- 11. "Review complete" claims require statement_review_follow_up message type
  //     AND findings context in the strategy.
  //     has_statement_artifact = true only means a file was submitted — not that it was reviewed.
  //     Only statement_review_follow_up strategies with findings context (proof_point or
  //     pain_point_hypothesis) may make review-complete claims.
  const reviewCompleteAllowed =
    strategy.message_type === 'statement_review_follow_up' &&
    !!(strategy.proof_point || strategy.pain_point_hypothesis)
  const reviewCompleteText = ['review complete', 'review is complete', 'statement review complete', 'completed the review']
  if (!reviewCompleteAllowed) {
    const completeViolation = containsAnyPhrase(combined, reviewCompleteText)
    if (completeViolation) {
      contextViolations.push(
        `"Review complete" language requires statement_review_follow_up message type and findings context — "${completeViolation}"`
      )
      errors.push(COPY_ERROR_CODES.COPY_015)
    }
  }

  // ---- 12. Required inclusions ----
  const requiredInclusionsSatisfied = checkRequiredInclusions(body, strategy.required_inclusions ?? [])

  // ---- Deduplicate errors ----
  const uniqueErrors = [...new Set(errors)]

  return {
    passed:                      uniqueErrors.length === 0,
    errors:                      uniqueErrors as ReturnType<typeof checkCompliance>['errors'],
    bannedPhrasesFound,
    unsupportedClaimsFound:      unsupportedClaims,
    avoidListViolations,
    requiredInclusionsSatisfied,
    contextViolations,
  }
}
