// ============================================================
// Phase 3B — Quality Review Agent Risk Flags
// Detects all 25 risk flags (RFL-001 through RFL-025).
// Pure functions. No I/O.
// ============================================================

import {
  QRA_BANNED_PHRASES,
  QRA_URGENCY_PATTERNS,
  QRA_GUARANTEED_OUTCOME_PATTERNS,
  QRA_INBOUND_LANGUAGE_PATTERNS,
  QRA_COLD_DISCOVERY_PATTERNS,
  QRA_PARTNER_NAME_PATTERNS,
  QRA_EXCLUSIVITY_CLAIM_PATTERNS,
  QRA_REVIEW_COMPLETE_PATTERNS,
  QRA_AI_CORPORATE_PATTERNS,
  QRA_GUILT_LANGUAGE_PATTERNS,
  QRA_CONVERSATION_REFERENCE_PATTERNS,
  QRA_RELATIONSHIP_RISK_PATTERNS,
  QRA_INBOUND_SOURCES,
  QRA_COLD_SOURCES,
  QRA_FOLLOW_UP_MESSAGE_TYPES,
  RISK_FLAG_CODES,
  RISK_SEVERITY,
} from './quality-review-agent.types'
import type { RiskFlag, RiskFlagResult } from './quality-review-agent.types'

// ---- Helpers ----

function containsPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase())
}

function containsAny(text: string, phrases: readonly string[]): string | null {
  for (const phrase of phrases) {
    if (containsPhrase(text, phrase)) return phrase
  }
  return null
}

// ---- Risk score calculation ----

function calculateRiskScore(flags: RiskFlag[]): number {
  let total = 0
  for (const flag of flags) {
    switch (flag.severity) {
      case RISK_SEVERITY.CRITICAL: total += 40; break
      case RISK_SEVERITY.HIGH:     total += 20; break
      case RISK_SEVERITY.MEDIUM:   total += 10; break
      case RISK_SEVERITY.LOW:      total +=  3; break
    }
  }
  return Math.min(total, 100)
}

// Compliance-related flags (RFL-001 through RFL-009)
const COMPLIANCE_CODES = new Set([
  RISK_FLAG_CODES.RFL_001,
  RISK_FLAG_CODES.RFL_002,
  RISK_FLAG_CODES.RFL_003,
  RISK_FLAG_CODES.RFL_004,
  RISK_FLAG_CODES.RFL_005,
  RISK_FLAG_CODES.RFL_006,
  RISK_FLAG_CODES.RFL_007,
  RISK_FLAG_CODES.RFL_008,
  RISK_FLAG_CODES.RFL_009,
])

// ---- Main function ----

export function detectRiskFlags(
  strategy: {
    messageType:               string
    offerAngle:                string
    leadSource:                string
    proofPoint:                string | null
    painPointHypothesis:       string
    partnerMembershipConfirmed:boolean
    audienceContext:           string
    conversationNotes?:        string | null
  },
  version: {
    subjectLine:        string
    bodyText:           string
    strategyAngle:      string
    personalizationUsed:string[]
    personalizationGaps:string[]
    versionNumber:      number
  },
  siblingVersions: Array<{ bodyText: string; strategyAngle: string }>,
  priorContext:    { priorStrategyAngles: string[] } | null,
  preComputedScores?: { toneFitScore?: number; differentiationScore?: number }
): RiskFlagResult {
  const flags: RiskFlag[] = []
  const combined = `${version.subjectLine} ${version.bodyText}`

  // ---- RFL-001: Banned phrase (critical) ----
  const banned = containsAny(combined, QRA_BANNED_PHRASES)
  if (banned) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_001,
      severity:    RISK_SEVERITY.CRITICAL,
      message:     `Globally banned phrase detected: "${banned}"`,
      triggeredBy: banned,
    })
  }

  // ---- RFL-002: Urgency language (high) ----
  const urgency = containsAny(combined, QRA_URGENCY_PATTERNS)
  if (urgency) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_002,
      severity:    RISK_SEVERITY.HIGH,
      message:     `Urgency language detected: "${urgency}"`,
      triggeredBy: urgency,
    })
  }

  // ---- RFL-003: Guaranteed outcome (high) ----
  const guaranteed = containsAny(combined, QRA_GUARANTEED_OUTCOME_PATTERNS)
  if (guaranteed) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_003,
      severity:    RISK_SEVERITY.HIGH,
      message:     `Guaranteed outcome language detected: "${guaranteed}"`,
      triggeredBy: guaranteed,
    })
  }

  // ---- RFL-004: Dollar claim without confirmed savings (critical) ----
  if (strategy.offerAngle !== 'confirmed_savings_review') {
    const dollarMatch = /\$\s*\d+/.exec(combined)
    if (dollarMatch) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_004,
        severity:    RISK_SEVERITY.CRITICAL,
        message:     `Dollar amount claim "${dollarMatch[0]}" without confirmed savings offer angle.`,
        triggeredBy: dollarMatch[0],
      })
    }
  }

  // ---- RFL-005: Percentage savings claim (high) ----
  if (strategy.offerAngle !== 'confirmed_savings_review') {
    const pctMatch = /\d+\s*%\s*(savings|reduction|less)/i.exec(combined)
    if (pctMatch) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_005,
        severity:    RISK_SEVERITY.HIGH,
        message:     `Percentage savings claim "${pctMatch[0]}" without confirmed savings offer angle.`,
        triggeredBy: pctMatch[0],
      })
    }
  }

  // ---- RFL-006: Cold/inbound context mismatch (high) ----
  const source = (strategy.leadSource ?? '').toLowerCase()
  const isInbound = QRA_INBOUND_SOURCES.has(source)
  const isCold    = QRA_COLD_SOURCES.has(source)

  if (isCold) {
    const inboundMatch = containsAny(combined, QRA_INBOUND_LANGUAGE_PATTERNS)
    if (inboundMatch) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_006,
        severity:    RISK_SEVERITY.HIGH,
        message:     `Inbound language "${inboundMatch}" used in cold-source context.`,
        triggeredBy: `lead_source=${source}, phrase="${inboundMatch}"`,
      })
    }
  }
  if (isInbound) {
    const coldMatch = containsAny(combined, QRA_COLD_DISCOVERY_PATTERNS)
    if (coldMatch) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_006,
        severity:    RISK_SEVERITY.HIGH,
        message:     `Cold discovery language "${coldMatch}" used in inbound-source context.`,
        triggeredBy: `lead_source=${source}, phrase="${coldMatch}"`,
      })
    }
  }

  // ---- RFL-007: Partner name without confirmed membership (critical) ----
  if (!strategy.partnerMembershipConfirmed) {
    const partnerMatch = containsAny(combined.toLowerCase(), QRA_PARTNER_NAME_PATTERNS)
    if (partnerMatch) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_007,
        severity:    RISK_SEVERITY.CRITICAL,
        message:     `Partner name "${partnerMatch}" used without confirmed membership.`,
        triggeredBy: partnerMatch,
      })
    }
  }

  // ---- RFL-008: Exclusivity claim (high) ----
  const exclusivity = containsAny(combined, QRA_EXCLUSIVITY_CLAIM_PATTERNS)
  if (exclusivity) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_008,
      severity:    RISK_SEVERITY.HIGH,
      message:     `Exclusivity claim detected: "${exclusivity}"`,
      triggeredBy: exclusivity,
    })
  }

  // ---- RFL-009: Review-complete language (critical) ----
  const noProofContext = !strategy.proofPoint && !strategy.painPointHypothesis
  const isStatementReview = strategy.messageType === 'statement_review_follow_up'
  if (!isStatementReview || noProofContext) {
    const reviewComplete = containsAny(combined, QRA_REVIEW_COMPLETE_PATTERNS)
    if (reviewComplete) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_009,
        severity:    RISK_SEVERITY.CRITICAL,
        message:     `"Review complete" language without appropriate context: "${reviewComplete}"`,
        triggeredBy: reviewComplete,
      })
    }
  }

  // ---- RFL-010: Invented dollar finding in statement review (critical) ----
  if (strategy.messageType === 'statement_review_follow_up') {
    const dollarMatch = /\$\s*\d+/.exec(version.bodyText)
    if (dollarMatch) {
      // Check if dollar amount is in proofPoint context
      const proofPoint = strategy.proofPoint ?? ''
      const amountInProof = proofPoint && /\$\s*\d+/.test(proofPoint)
      if (!amountInProof) {
        flags.push({
          code:        RISK_FLAG_CODES.RFL_010,
          severity:    RISK_SEVERITY.CRITICAL,
          message:     `Dollar finding "${dollarMatch[0]}" in statement review body not grounded in strategy proof point.`,
          triggeredBy: dollarMatch[0],
        })
      }
    }
  }

  // ---- RFL-011: Conversation reference without notes (critical) ----
  if (strategy.messageType === 'event_expo_follow_up' && !strategy.conversationNotes) {
    const convMatch = containsAny(combined, QRA_CONVERSATION_REFERENCE_PATTERNS)
    if (convMatch) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_011,
        severity:    RISK_SEVERITY.CRITICAL,
        message:     `Conversation reference "${convMatch}" without conversation notes in context.`,
        triggeredBy: convMatch,
      })
    }
  }

  // ---- RFL-012: Specific numeric claim not in strategy context (critical) ----
  // Only matches dollar amounts and 4+ digit numbers (volume claims).
  // Small numbers like "10" in "10-minute call" are intentionally excluded.
  const strategyContext = [
    strategy.proofPoint ?? '',
    strategy.painPointHypothesis ?? '',
    strategy.audienceContext ?? '',
  ].join(' ')
  const numericMatches = combined.match(/\$\s*\d+|\b\d{4,}\b/g) ?? []
  for (const numericMatch of numericMatches) {
    if (!containsPhrase(strategyContext, numericMatch.replace(/\s/g, ''))) {
      // Check if it's already caught by RFL-004 or RFL-010
      const alreadyFlagged = flags.some(f =>
        (f.code === RISK_FLAG_CODES.RFL_004 || f.code === RISK_FLAG_CODES.RFL_010) &&
        f.triggeredBy === numericMatch
      )
      if (!alreadyFlagged) {
        flags.push({
          code:        RISK_FLAG_CODES.RFL_012,
          severity:    RISK_SEVERITY.CRITICAL,
          message:     `Numeric claim "${numericMatch}" not found in strategy context — may be invented.`,
          triggeredBy: numericMatch,
        })
        break // one flag per version
      }
    }
  }

  // ---- RFL-013: Low tone fit (medium) ----
  const toneFitScore = preComputedScores?.toneFitScore
  if (toneFitScore !== undefined) {
    if (toneFitScore < 55) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_013,
        severity:    RISK_SEVERITY.MEDIUM,
        message:     `Tone fit score is low (${toneFitScore}) — version may not match the strategy tone target.`,
        triggeredBy: `tone_fit_score=${toneFitScore}`,
      })
    }
  } else {
    // Compute inline
    const aiCount = QRA_AI_CORPORATE_PATTERNS.filter(p => containsPhrase(combined, p)).length
    if (aiCount >= 2) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_013,
        severity:    RISK_SEVERITY.MEDIUM,
        message:     'Multiple AI/corporate patterns detected — tone fit may be low.',
        triggeredBy: `ai_corporate_pattern_count=${aiCount}`,
      })
    }
  }

  // ---- RFL-014: AI/corporate language (medium) ----
  const aiMatch = containsAny(combined, QRA_AI_CORPORATE_PATTERNS)
  if (aiMatch) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_014,
      severity:    RISK_SEVERITY.MEDIUM,
      message:     `AI/corporate language pattern: "${aiMatch}"`,
      triggeredBy: aiMatch,
    })
  }

  // ---- RFL-015: Guilt language in follow-up (medium) ----
  if (QRA_FOLLOW_UP_MESSAGE_TYPES.has(strategy.messageType)) {
    const guiltMatch = containsAny(combined, QRA_GUILT_LANGUAGE_PATTERNS)
    if (guiltMatch) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_015,
        severity:    RISK_SEVERITY.MEDIUM,
        message:     `Guilt language detected in follow-up: "${guiltMatch}"`,
        triggeredBy: guiltMatch,
      })
    }
  }

  // ---- RFL-016: Vague or missing CTA (medium) ----
  const nonExitTypes = new Set([
    'cold_outreach', 'new_inquiry_response', 'statement_review_follow_up',
    'proposal_follow_up', 'no_response_follow_up', 'partner_member_specific_campaign',
    'event_expo_follow_up', 'referral_request', 'customer_nurture',
  ])
  if (nonExitTypes.has(strategy.messageType)) {
    const ctaPhrases = [
      'share your', 'schedule', 'reply', 'let me know', 'call', 'email', 'send', 'submit', 'forward',
    ]
    const vagueCtaPhrases = ['let me know', 'reach out', 'feel free']
    const bodyLower = version.bodyText.toLowerCase()
    const detected = ctaPhrases.filter(p => bodyLower.includes(p))
    const onlyVague = detected.length > 0 && detected.every(p => vagueCtaPhrases.some(v => p.includes(v)))
    if (detected.length === 0 || onlyVague) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_016,
        severity:    RISK_SEVERITY.MEDIUM,
        message:     detected.length === 0 ? 'No CTA detected in body.' : 'CTA is vague — only soft ask phrases found.',
        triggeredBy: detected.join(', ') || 'none',
      })
    }
  }

  // ---- RFL-017: Subject/body mismatch (high) ----
  const subjectLower = version.subjectLine.toLowerCase()
  const bodyLower    = version.bodyText.toLowerCase()

  const subjectImpliesFindings = subjectLower.includes('found') || subjectLower.includes('findings')
  const subjectImpliesSavings  = subjectLower.includes('savings') || subjectLower.includes('save')
  const subjectImpliesPartner  = ['partner', 'bcsg', 'certainpath'].some(p => subjectLower.includes(p))
  const subjectImpliesReview   = QRA_REVIEW_COMPLETE_PATTERNS.some(p => subjectLower.includes(p))

  let mismatchReason: string | null = null
  if (subjectImpliesFindings && !containsPhrase(bodyLower, 'found') && !containsPhrase(bodyLower, 'statement')) {
    mismatchReason = 'Subject implies findings but body lacks supporting content.'
  } else if (subjectImpliesSavings && !containsPhrase(bodyLower, 'savings') && !containsPhrase(bodyLower, 'save')) {
    mismatchReason = 'Subject implies savings but body does not address this.'
  } else if (subjectImpliesPartner && !['partner', 'bcsg', 'certainpath'].some(p => bodyLower.includes(p))) {
    mismatchReason = 'Subject references partner but body does not.'
  } else if (subjectImpliesReview && strategy.messageType !== 'statement_review_follow_up') {
    mismatchReason = 'Subject claims review complete in wrong message type context.'
  }

  if (mismatchReason) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_017,
      severity:    RISK_SEVERITY.HIGH,
      message:     mismatchReason,
      triggeredBy: version.subjectLine,
    })
  }

  // ---- RFL-018: Generic subject line (low) ----
  if (/^processing review\s*[—\-–]\s*.+$/.test(subjectLower) || subjectLower.split(' ').length <= 3) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_018,
      severity:    RISK_SEVERITY.LOW,
      message:     'Subject line appears generic or minimal.',
      triggeredBy: version.subjectLine,
    })
  }

  // ---- RFL-019: Subject/body topical disconnect (medium) ----
  const bodyFirstWords = version.bodyText.trim().split(/\s+/).slice(0, 15).join(' ').toLowerCase()
  const subjectTopicWords = version.subjectLine.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  const hasTopicOverlap = subjectTopicWords.some(w => bodyFirstWords.includes(w))
  if (!hasTopicOverlap && subjectTopicWords.length > 0) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_019,
      severity:    RISK_SEVERITY.MEDIUM,
      message:     'Opening body text appears topically unrelated to the subject line.',
      triggeredBy: `subject="${version.subjectLine.slice(0, 40)}"`,
    })
  }

  // ---- RFL-020: Low differentiation score (medium) ----
  const diffScore = preComputedScores?.differentiationScore
  if (diffScore !== undefined) {
    if (diffScore < 55) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_020,
        severity:    RISK_SEVERITY.MEDIUM,
        message:     `Differentiation score is low (${diffScore}) — version may be too similar to siblings.`,
        triggeredBy: `differentiation_score=${diffScore}`,
      })
    }
  } else if (siblingVersions.length > 0) {
    // Compute inline
    const sameAngle = siblingVersions.some(s => s.strategyAngle === version.strategyAngle)
    if (sameAngle) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_020,
        severity:    RISK_SEVERITY.MEDIUM,
        message:     'Version strategy angle is not unique among siblings.',
        triggeredBy: version.strategyAngle,
      })
    }
  }

  // ---- RFL-021: Near-duplicate version (high) ----
  // Triggers when first 5 words of body match a sibling exactly.
  // Does not require pre-computed diff score — text similarity alone is sufficient.
  if (siblingVersions.length > 0) {
    const vFirstWords = version.bodyText.trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase()
    if (vFirstWords.length > 0) {
      for (const sibling of siblingVersions) {
        const sFirstWords = sibling.bodyText.trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase()
        if (vFirstWords === sFirstWords) {
          flags.push({
            code:        RISK_FLAG_CODES.RFL_021,
            severity:    RISK_SEVERITY.HIGH,
            message:     'Version body text starts identically to a sibling — near-duplicate detected.',
            triggeredBy: vFirstWords,
          })
          break
        }
      }
    }
  }

  // ---- RFL-022: Company name overuse (low) ----
  const companyNameUsageCount = version.personalizationUsed.filter(p => p === 'company_name').length
  if (companyNameUsageCount > 3) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_022,
      severity:    RISK_SEVERITY.LOW,
      message:     `Company name appears to be overused (${companyNameUsageCount} references).`,
      triggeredBy: `company_name_count=${companyNameUsageCount}`,
    })
  }

  // ---- RFL-023: Missing personalization fields (medium) ----
  const SIGNIFICANT_GAPS = ['proof_point', 'industry_segment']
  const significantGaps = version.personalizationGaps.filter(g => {
    const key = g.split(':')[0].trim()
    return SIGNIFICANT_GAPS.includes(key)
  })
  if (significantGaps.length > 0) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_023,
      severity:    RISK_SEVERITY.MEDIUM,
      message:     `Key personalization fields missing: ${significantGaps.join(', ')}`,
      triggeredBy: significantGaps.join(', '),
    })
  }

  // ---- RFL-024: Strategy angle repeated from prior context (medium) ----
  if (priorContext && priorContext.priorStrategyAngles.includes(version.strategyAngle)) {
    flags.push({
      code:        RISK_FLAG_CODES.RFL_024,
      severity:    RISK_SEVERITY.MEDIUM,
      message:     `Strategy angle "${version.strategyAngle}" was already used in a prior run.`,
      triggeredBy: version.strategyAngle,
    })
  }

  // ---- RFL-025: Relationship risk language in follow-up (medium) ----
  if (QRA_FOLLOW_UP_MESSAGE_TYPES.has(strategy.messageType)) {
    const relMatch = containsAny(combined, QRA_RELATIONSHIP_RISK_PATTERNS)
    if (relMatch) {
      flags.push({
        code:        RISK_FLAG_CODES.RFL_025,
        severity:    RISK_SEVERITY.MEDIUM,
        message:     `Relationship risk language detected: "${relMatch}"`,
        triggeredBy: relMatch,
      })
    }
  }

  // ---- Partition compliance vs content flags ----
  const complianceFlags = flags.filter(f => COMPLIANCE_CODES.has(f.code as Parameters<typeof COMPLIANCE_CODES.has>[0]))
  const riskScore = calculateRiskScore(flags)

  return { flags, complianceFlags, riskScore }
}
