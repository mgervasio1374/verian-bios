// ============================================================
// Phase 3B — Quality Review Agent Message Type Rules
// Per-message-type scoring adjustments and review notes.
// Pure functions. No I/O.
// ============================================================

import type { ScoreBreakdown, MessageTypeRuleResult } from './quality-review-agent.types'

// Helper
function containsPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase())
}

// ---- Main function ----

export function applyMessageTypeReviewRules(
  messageType: string,
  version: {
    bodyText:            string
    subjectLine:         string
    strategyAngle:       string
    personalizationUsed: string[]
    personalizationGaps: string[]
  },
  strategy: {
    proofPoint:                string | null
    painPointHypothesis:       string
    partnerMembershipConfirmed:boolean
    leadSource:                string
    conversationNotes?:        string | null
    sequencePosition:          number
  },
  scoreBreakdown: ScoreBreakdown
): MessageTypeRuleResult {
  const adjustedScores: Partial<ScoreBreakdown> = {}
  const suggestedFlags: string[] = []
  const reviewNotes:    string[] = []

  switch (messageType) {

    // ---- Cold outreach ----
    case 'cold_outreach': {
      // Industry specificity is critical for cold outreach
      if (!version.personalizationUsed.includes('industry_segment')) {
        adjustedScores.specificity = Math.max(0, scoreBreakdown.specificity - 10)
        suggestedFlags.push('RFL_023')
        reviewNotes.push('Cold outreach lacks industry-specific angle — recommend adding industry context.')
      }
      // Proof point usage boosts strategic fit
      if (strategy.proofPoint && containsPhrase(version.bodyText, strategy.proofPoint.split(' ')[0] ?? '')) {
        adjustedScores.strategicFit = Math.min(100, scoreBreakdown.strategicFit + 5)
      }
      break
    }

    // ---- New inquiry response ----
    case 'new_inquiry_response': {
      // Must acknowledge inbound nature
      const acknowledgesPhrases = ['thank', 'glad', 'appreciate', 'received', 'got your']
      const acknowledges = acknowledgesPhrases.some(p => containsPhrase(version.bodyText, p))
      if (!acknowledges) {
        adjustedScores.toneFit = Math.max(0, scoreBreakdown.toneFit - 10)
        reviewNotes.push('New inquiry response should acknowledge the inbound inquiry warmly.')
      }
      // Must have clear next step
      const hasNextStep = containsPhrase(version.bodyText, 'next step') ||
                          containsPhrase(version.bodyText, 'schedule') ||
                          containsPhrase(version.bodyText, 'reply')
      if (!hasNextStep) {
        adjustedScores.ctaClarity = Math.max(0, scoreBreakdown.ctaClarity - 10)
        reviewNotes.push('New inquiry response should include a clear next step.')
      }
      break
    }

    // ---- Statement submitted confirmation ----
    case 'statement_submitted_confirmation': {
      // Must confirm receipt
      const confirmsPhrases = ['received', 'got it', 'confirmed', 'on file', 'uploaded']
      const confirms = confirmsPhrases.some(p => containsPhrase(version.bodyText, p))
      if (!confirms) {
        adjustedScores.strategicFit = Math.max(0, scoreBreakdown.strategicFit - 10)
        reviewNotes.push('Statement confirmation should explicitly confirm receipt of the statement.')
      }
      // Should be concise — penalize if too long
      const wordCount = version.bodyText.split(/\s+/).filter(w => w.length > 0).length
      if (wordCount > 120) {
        adjustedScores.readability = Math.max(0, scoreBreakdown.readability - 5)
        reviewNotes.push('Statement confirmation is longer than recommended — keep it concise.')
      }
      break
    }

    // ---- Statement review follow-up ----
    case 'statement_review_follow_up': {
      // Must reference findings if proof point is available
      if (strategy.proofPoint) {
        const referencesProof = containsPhrase(version.bodyText, strategy.proofPoint.split(' ')[0] ?? '')
        if (!referencesProof) {
          adjustedScores.strategicFit = Math.max(0, scoreBreakdown.strategicFit - 10)
          reviewNotes.push('Statement review should reference the identified proof point or findings.')
        } else {
          adjustedScores.strategicFit = Math.min(100, scoreBreakdown.strategicFit + 5)
        }
      }
      // Findings-first angle gets specificity boost
      if (version.strategyAngle === 'findings_first') {
        adjustedScores.specificity = Math.min(100, scoreBreakdown.specificity + 5)
        reviewNotes.push('Findings-first angle is well-suited for statement review follow-up.')
      }
      break
    }

    // ---- Statement not submitted follow-up ----
    case 'statement_not_submitted_follow_up': {
      // Must have a clear upload/submit CTA
      const hasUploadCta = containsPhrase(version.bodyText, 'upload') ||
                           containsPhrase(version.bodyText, 'submit') ||
                           containsPhrase(version.bodyText, 'send') ||
                           containsPhrase(version.bodyText, 'share')
      if (!hasUploadCta) {
        adjustedScores.ctaClarity = Math.max(0, scoreBreakdown.ctaClarity - 10)
        suggestedFlags.push('RFL_016')
        reviewNotes.push('Statement follow-up needs a clear upload/submit CTA.')
      }
      break
    }

    // ---- Proposal follow-up ----
    case 'proposal_follow_up': {
      // Should be brief and direct
      const wordCount = version.bodyText.split(/\s+/).filter(w => w.length > 0).length
      if (wordCount > 100) {
        adjustedScores.readability = Math.max(0, scoreBreakdown.readability - 8)
        reviewNotes.push('Proposal follow-up should be concise — keep under 100 words.')
      }
      // Decision-oriented CTA
      const hasDecisionCta = containsPhrase(version.bodyText, 'decision') ||
                              containsPhrase(version.bodyText, 'questions') ||
                              containsPhrase(version.bodyText, 'move forward')
      if (!hasDecisionCta) {
        adjustedScores.ctaClarity = Math.max(0, scoreBreakdown.ctaClarity - 5)
        reviewNotes.push('Proposal follow-up should acknowledge pending decision.')
      }
      break
    }

    // ---- No-response follow-up ----
    case 'no_response_follow_up': {
      // Different angle is strongly preferred for no-response
      const isChangedAngle = version.strategyAngle === 'changed_angle' ||
                             version.strategyAngle === 'minimal_question' ||
                             version.strategyAngle === 'brief_reframe'
      if (isChangedAngle) {
        adjustedScores.differentiation = Math.min(100, scoreBreakdown.differentiation + 10)
        reviewNotes.push('Changed angle is appropriate for no-response follow-up.')
      }
      // Penalize long versions
      const wordCount = version.bodyText.split(/\s+/).filter(w => w.length > 0).length
      if (wordCount > 100) {
        adjustedScores.readability = Math.max(0, scoreBreakdown.readability - 8)
        reviewNotes.push('No-response follow-up should be brief — keep under 100 words.')
      }
      break
    }

    // ---- Re-engagement ----
    case 're_engagement': {
      // Must provide a fresh reason — not just "checking in"
      const hasReason = containsPhrase(version.bodyText, 'reason') ||
                        containsPhrase(version.bodyText, 'because') ||
                        containsPhrase(version.bodyText, 'noticed') ||
                        strategy.proofPoint !== null
      if (!hasReason) {
        adjustedScores.strategicFit = Math.max(0, scoreBreakdown.strategicFit - 10)
        reviewNotes.push('Re-engagement should provide a genuine reason for outreach — avoid "checking in" language.')
      }
      break
    }

    // ---- Partner member specific campaign ----
    case 'partner_member_specific_campaign': {
      if (!strategy.partnerMembershipConfirmed) {
        adjustedScores.complianceConfidence = Math.max(0, scoreBreakdown.complianceConfidence - 15)
        suggestedFlags.push('RFL_007')
        reviewNotes.push('Partner campaign without confirmed membership — high compliance risk.')
      } else {
        adjustedScores.complianceConfidence = Math.min(100, scoreBreakdown.complianceConfidence + 5)
        reviewNotes.push('Partner membership is confirmed — partner context is appropriate.')
      }
      break
    }

    // ---- Event/expo follow-up ----
    case 'event_expo_follow_up': {
      if (!strategy.conversationNotes) {
        adjustedScores.specificity = Math.max(0, scoreBreakdown.specificity - 10)
        suggestedFlags.push('RFL_011')
        reviewNotes.push('Event follow-up without conversation notes — specificity is reduced.')
      } else {
        // Check if body references conversation
        const refsConversation = containsPhrase(version.bodyText, 'conversation') ||
                                 containsPhrase(version.bodyText, 'discussed') ||
                                 containsPhrase(version.bodyText, 'mentioned') ||
                                 containsPhrase(version.bodyText, 'met')
        if (refsConversation) {
          adjustedScores.specificity = Math.min(100, scoreBreakdown.specificity + 8)
          reviewNotes.push('Body references the event conversation — good specificity.')
        }
      }
      break
    }

    // ---- Referral request ----
    case 'referral_request': {
      // Must have a specific referral ask
      const hasSpecificAsk = containsPhrase(version.bodyText, 'know anyone') ||
                             containsPhrase(version.bodyText, 'introduce') ||
                             containsPhrase(version.bodyText, 'referral') ||
                             containsPhrase(version.bodyText, 'connection')
      if (!hasSpecificAsk) {
        adjustedScores.ctaClarity = Math.max(0, scoreBreakdown.ctaClarity - 10)
        reviewNotes.push('Referral request needs a specific referral ask — who to refer and why.')
      }
      // Must not feel transactional
      const transactionalPhrases = ['incentive', 'reward', 'commission', 'payment for']
      if (transactionalPhrases.some(p => containsPhrase(version.bodyText, p))) {
        adjustedScores.toneFit = Math.max(0, scoreBreakdown.toneFit - 10)
        reviewNotes.push('Referral request uses transactional language — consider a relationship-first framing.')
      }
      break
    }

    // ---- Customer nurture ----
    case 'customer_nurture': {
      // Should not use prospecting tone
      const prospectingPhrases = ['i came across', 'i stumbled upon', 'have you considered', 'are you aware']
      if (prospectingPhrases.some(p => containsPhrase(version.bodyText, p))) {
        adjustedScores.toneFit = Math.max(0, scoreBreakdown.toneFit - 15)
        reviewNotes.push('Customer nurture should not use prospecting-style language.')
      }
      // Value/education orientation
      const hasValueContent = containsPhrase(version.bodyText, 'worth knowing') ||
                              containsPhrase(version.bodyText, 'wanted to share') ||
                              containsPhrase(version.bodyText, 'thought you') ||
                              containsPhrase(version.bodyText, 'might be useful')
      if (!hasValueContent) {
        adjustedScores.strategicFit = Math.max(0, scoreBreakdown.strategicFit - 5)
        reviewNotes.push('Customer nurture should provide value or education — not a sales push.')
      }
      break
    }

    default:
      reviewNotes.push(`No specific rules defined for message type: ${messageType}`)
  }

  return { adjustedScores, suggestedFlags, reviewNotes }
}
