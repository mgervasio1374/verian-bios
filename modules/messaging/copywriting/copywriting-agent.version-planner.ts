// ============================================================
// Phase 3B — Version Planner
// Pure function. No I/O. No side effects.
// Returns a VersionPlan for a given message_type and
// sequence_position. All version counts and angles are
// derived from the approved Phase 3B Design specification.
// ============================================================

import { VERSION_LABELS, STRATEGY_ANGLES } from './copywriting-agent.types'
import type { VersionPlan, VersionAngle } from './copywriting-agent.types'

interface VersionPlanOptions {
  sequencePosition:     number
  hasConversationNotes: boolean
  hasNurtureTrigger:    boolean
}

// ---- Angle builders ----

function angle(
  versionNumber:      number,
  versionLabel:       string,
  strategyAngle:      string,
  subjectLineIntent:  string,
  bodyIntent:         string,
  ctaFraming:         string,
  diffProfile:        { openingPremise: string; primaryAngle: string; trustAngle: string; ctaFraming: string; structure: string; evidence: string },
  opts: { lengthOverride?: string; personalizationNote?: string } = {}
): VersionAngle {
  return {
    versionNumber,
    versionLabel,
    strategyAngle,
    subjectLineIntent,
    bodyIntent,
    ctaFraming,
    differentiationProfile: {
      openingPremise: diffProfile.openingPremise,
      primaryAngle:   diffProfile.primaryAngle,
      trustAngle:     diffProfile.trustAngle,
      ctaFraming:     diffProfile.ctaFraming,
      structure:      diffProfile.structure,
      evidence:       diffProfile.evidence,
    },
    requiredDimensions: ['opening_premise', 'primary_angle', 'structure'],
    lengthOverride:     opts.lengthOverride,
    personalizationNote:opts.personalizationNote,
  }
}

// ============================================================
// MT-1: Cold Outreach — 4 versions
// ============================================================

function planColdOutreach(): VersionAngle[] {
  return [
    angle(1,
      VERSION_LABELS.INDUSTRY_QUESTION, STRATEGY_ANGLES.INDUSTRY_SPECIFIC_QUESTION,
      'Reference company name or industry type; frame around a specific industry question',
      'Open with an industry-specific observation or question relevant to the merchant type. Establish context before the offer. Use audience_context to ground the opening.',
      'Soft ask for a statement review framed as a question',
      { openingPremise: 'question', primaryAngle: 'industry_observation', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'question_led', evidence: 'none' }
    ),
    angle(2,
      VERSION_LABELS.STATEMENT_CLARITY, STRATEGY_ANGLES.STATEMENT_REVIEW_OFFER,
      'Reference company name and offer type directly; no urgency',
      'Lead directly with the statement review offer and what it finds. Use offer_angle framing. Do not bury the offer behind setup.',
      'Direct offer for a processing statement review',
      { openingPremise: 'offer', primaryAngle: 'cost_clarity', trustAngle: 'transparency', ctaFraming: 'specific_offer', structure: 'offer_led', evidence: 'none' }
    ),
    angle(3,
      VERSION_LABELS.TRUST_BUILDER, STRATEGY_ANGLES.SKEPTICISM_AWARE_ADVISOR,
      'Reference industry or offer type; avoid urgency language',
      'Acknowledge that processor outreach is common and often hollow. Differentiate by explaining what makes a statement review different from a generic pitch. Use trust_angle from strategy.',
      'Invite the merchant to see what the review actually shows',
      { openingPremise: 'acknowledgment', primaryAngle: 'advisor_credibility', trustAngle: 'skepticism_aware', ctaFraming: 'soft_ask', structure: 'acknowledgment_led', evidence: 'none' }
    ),
    angle(4,
      VERSION_LABELS.DIRECT_EXECUTIVE_BREVITY, STRATEGY_ANGLES.ULTRA_DIRECT,
      'One short specific subject line referencing company name',
      'Maximum brevity. One observation from audience_context. One direct ask. No setup, no explanation, no feature listing.',
      'Ultra-short direct CTA',
      { openingPremise: 'observation', primaryAngle: 'direct_efficiency', trustAngle: 'direct', ctaFraming: 'direct_question', structure: 'observation_led', evidence: 'none' },
      { lengthOverride: 'ultra_short' }
    ),
  ]
}

// ============================================================
// MT-2: New Inquiry Response — 3 versions
// ============================================================

function planNewInquiryResponse(): VersionAngle[] {
  return [
    angle(1,
      VERSION_LABELS.WARM_ACKNOWLEDGMENT, STRATEGY_ANGLES.WARM_INQUIRY_RESPONSE,
      'Reference the inquiry or request specifically',
      'Acknowledge the inquiry explicitly and warmly. Confirm that the merchant reached out. Advance to the statement submission link or scheduling offer.',
      'Warm CTA to the next step — statement submission or call scheduling',
      { openingPremise: 'acknowledgment', primaryAngle: 'responsive_service', trustAngle: 'industry_familiarity', ctaFraming: 'specific_offer', structure: 'acknowledgment_led', evidence: 'none' }
    ),
    angle(2,
      VERSION_LABELS.DIRECT_NEXT_STEP, STRATEGY_ANGLES.ADVANCE_NEXT_STEP,
      'Reference the request; advance immediately to next step',
      'Brief. Acknowledge the form submission in one sentence. Advance immediately to the statement submission link with minimal framing.',
      'Direct link to next step — no extended setup',
      { openingPremise: 'statement', primaryAngle: 'direct_next_step', trustAngle: 'direct', ctaFraming: 'specific_offer', structure: 'offer_led', evidence: 'none' },
      { lengthOverride: 'short' }
    ),
    angle(3,
      VERSION_LABELS.ADVISOR_FIRST, STRATEGY_ANGLES.ADVISOR_EDUCATION,
      'Reference what the review process reveals',
      'Acknowledge the inquiry. Explain what the review process reveals and why it matters for the merchant. Educate before asking. Use audience_context and pain_point_hypothesis.',
      'CTA comes after education — scheduling or statement submission',
      { openingPremise: 'acknowledgment', primaryAngle: 'educational_advisor', trustAngle: 'transparency', ctaFraming: 'soft_ask', structure: 'acknowledgment_led', evidence: 'none' }
    ),
  ]
}

// ============================================================
// MT-3: Statement Submitted Confirmation — 2 versions
// ============================================================

function planStatementSubmittedConfirmation(): VersionAngle[] {
  return [
    angle(1,
      VERSION_LABELS.PROFESSIONAL_CONFIRMATION, STRATEGY_ANGLES.PROFESSIONAL_CONFIRMATION,
      'Confirm receipt specifically; include timeline',
      'Confirm receipt explicitly. State specific review timeline. Offer scheduling link or specific callback date. Professional and structured.',
      'Set specific next step — scheduling link or specific date',
      { openingPremise: 'statement', primaryAngle: 'professional_confirmation', trustAngle: 'transparency', ctaFraming: 'specific_offer', structure: 'offer_led', evidence: 'none' }
    ),
    angle(2,
      VERSION_LABELS.WARM_REASSURANCE, STRATEGY_ANGLES.WARM_REASSURANCE,
      'Confirm receipt warmly; acknowledge the submission as a meaningful step',
      'Warmer acknowledgment of the submission. Note that the merchant took an important step. Set the same timeline in a relationship-oriented framing.',
      'Scheduling offer framed warmly',
      { openingPremise: 'acknowledgment', primaryAngle: 'relationship_confirmation', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'acknowledgment_led', evidence: 'none' }
    ),
  ]
}

// ============================================================
// MT-4: Statement Review Follow-Up — 3 versions
// ============================================================

function planStatementReviewFollowUp(): VersionAngle[] {
  return [
    angle(1,
      VERSION_LABELS.FINDINGS_FIRST, STRATEGY_ANGLES.FINDINGS_FIRST,
      'Reference the completed review and what it found',
      'Open directly with the key finding from review_summary. Explain what it means. Advance to a call to discuss.',
      'Schedule a call to walk through the findings',
      { openingPremise: 'observation', primaryAngle: 'findings_forward', trustAngle: 'specific_finding', ctaFraming: 'specific_offer', structure: 'observation_led', evidence: 'specific_finding' }
    ),
    angle(2,
      VERSION_LABELS.ADVISOR_EXPLANATION, STRATEGY_ANGLES.ADVISOR_EXPLANATION,
      'Reference the completed review; explain in operational terms',
      'Open by acknowledging the review is complete. Explain the finding in operational terms the merchant can understand. Frame the calculated amount as a starting point if present. Less technical, more conversational.',
      'Offer a call to contextualize the findings',
      { openingPremise: 'acknowledgment', primaryAngle: 'operational_explanation', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'acknowledgment_led', evidence: 'specific_finding' }
    ),
    angle(3,
      VERSION_LABELS.PROPOSAL_ORIENTED, STRATEGY_ANGLES.PROPOSAL_NEXT_STEP,
      'Lead with the review and translate to next step',
      'Brief summary of the finding. Immediately translate it into a logical next step: a proposal conversation. Less explanation; more forward motion.',
      'Direct ask for a proposal call or next step conversation',
      { openingPremise: 'statement', primaryAngle: 'proposal_transition', trustAngle: 'direct', ctaFraming: 'direct_question', structure: 'offer_led', evidence: 'specific_finding' }
    ),
  ]
}

// ============================================================
// MT-5: Statement Not Submitted Follow-Up — varies by sequence
// ============================================================

function planStatementNotSubmittedFollowUp(seq: number): VersionAngle[] {
  if (seq <= 2) {
    return [
      angle(1,
        VERSION_LABELS.REDUCED_FRICTION, STRATEGY_ANGLES.REDUCED_FRICTION,
        'Make the next step easy; low-pressure',
        'Make the statement submission easy and low-friction. Explain the process briefly. Offer the link.',
        'Submission link with low-friction framing',
        { openingPremise: 'offer', primaryAngle: 'ease_of_submission', trustAngle: 'transparency', ctaFraming: 'specific_offer', structure: 'offer_led', evidence: 'none' }
      ),
      angle(2,
        VERSION_LABELS.CLARIFY_VALUE, STRATEGY_ANGLES.CLARIFY_VALUE,
        'Re-explain what the review finds for them',
        'Re-explain what a review reveals and why it matters for the merchant specifically. Use pain_point_hypothesis. Frame the submission as unlocking value.',
        'Value-framed CTA to submit statement',
        { openingPremise: 'observation', primaryAngle: 'value_clarification', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'observation_led', evidence: 'none' }
      ),
      angle(3,
        VERSION_LABELS.SIMPLE_QUESTION, STRATEGY_ANGLES.SIMPLE_DIRECT_QUESTION,
        'One direct question about the statement',
        'One direct, simple question: did they have a chance to pull the statement? No explanation. No re-sell.',
        'Binary CTA — did they get a chance?',
        { openingPremise: 'question', primaryAngle: 'direct_follow_through', trustAngle: 'direct', ctaFraming: 'binary_question', structure: 'question_led', evidence: 'none' },
        { lengthOverride: 'ultra_short' }
      ),
    ]
  }
  if (seq === 3) {
    return [
      angle(1,
        VERSION_LABELS.DIRECT_QUESTION, STRATEGY_ANGLES.DIRECT_SEQUENCE_QUESTION,
        'Ask whether to continue or pause',
        'Short. Ask if they want to continue or pause. No re-selling. Acknowledge the sequence has been going.',
        'Binary CTA — continue or pause?',
        { openingPremise: 'question', primaryAngle: 'sequence_clarity', trustAngle: 'direct', ctaFraming: 'binary_question', structure: 'question_led', evidence: 'none' },
        { lengthOverride: 'short' }
      ),
      angle(2,
        VERSION_LABELS.WHY_IT_MATTERS, STRATEGY_ANGLES.WHY_IT_MATTERS,
        'Brief context on timing and value',
        'Brief context on what waiting costs. Frame around pain_point_hypothesis. Not a guilt trip — factual and brief.',
        'Submit now CTA with time framing',
        { openingPremise: 'observation', primaryAngle: 'opportunity_cost', trustAngle: 'industry_familiarity', ctaFraming: 'direct_question', structure: 'observation_led', evidence: 'none' }
      ),
    ]
  }
  // seq 4+: graceful exit
  return [
    angle(1,
      VERSION_LABELS.GRACEFUL_EXIT, STRATEGY_ANGLES.GRACEFUL_SEQUENCE_EXIT,
      'Acknowledge timing may not be right; leave door open',
      'Acknowledge the sequence may have run its course. Leave the door open. Non-guilt, non-pressure. Offer to close out the sequence.',
      'Exit offer — close out the sequence or continue',
      { openingPremise: 'acknowledgment', primaryAngle: 'graceful_close', trustAngle: 'direct', ctaFraming: 'exit_offer', structure: 'acknowledgment_led', evidence: 'none' },
      { lengthOverride: 'ultra_short' }
    ),
    angle(2,
      VERSION_LABELS.EXIT_CTA, STRATEGY_ANGLES.EXIT_CTA,
      'Offer to close out explicitly',
      'Explicit exit CTA. One sentence. Offer to close this out unless the merchant wants to continue.',
      'Explicit close-out offer',
      { openingPremise: 'statement', primaryAngle: 'sequence_exit', trustAngle: 'direct', ctaFraming: 'exit_offer', structure: 'offer_led', evidence: 'none' },
      { lengthOverride: 'ultra_short' }
    ),
  ]
}

// ============================================================
// MT-6: Proposal Follow-Up — 2 versions
// ============================================================

function planProposalFollowUp(): VersionAngle[] {
  return [
    angle(1,
      VERSION_LABELS.DECISION_STATUS_QUESTION, STRATEGY_ANGLES.DECISION_STATUS,
      'Reference the proposal; ask about status',
      'Reference the sent proposal briefly. Ask where they are in the decision process. No pressure.',
      'Status question CTA',
      { openingPremise: 'question', primaryAngle: 'decision_status', trustAngle: 'direct', ctaFraming: 'soft_ask', structure: 'question_led', evidence: 'none' }
    ),
    angle(2,
      VERSION_LABELS.CLARIFY_OBJECTION, STRATEGY_ANGLES.CLARIFY_OBJECTION,
      'Invite questions or hesitations about the proposal',
      'Invite the merchant to share any hesitations or questions about the proposal. Remove friction from engaging. Do not pressure a timeline.',
      'Invitation to share questions or concerns',
      { openingPremise: 'offer', primaryAngle: 'objection_clearing', trustAngle: 'transparency', ctaFraming: 'soft_ask', structure: 'offer_led', evidence: 'none' }
    ),
  ]
}

// ============================================================
// MT-7: No-Response Follow-Up — varies by sequence
// ============================================================

function planNoResponseFollowUp(seq: number): VersionAngle[] {
  if (seq <= 2) {
    return [
      angle(1,
        VERSION_LABELS.DIFFERENT_ANGLE, STRATEGY_ANGLES.CHANGED_ANGLE,
        'Different angle from prior; reference company',
        'Use a different opening angle than the prior message. Must differ in opening premise from the prior strategy angle.',
        'Soft ask — different framing than prior',
        { openingPremise: 'observation', primaryAngle: 'reframe_offer', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'observation_led', evidence: 'none' }
      ),
      angle(2,
        VERSION_LABELS.QUESTION_ONLY, STRATEGY_ANGLES.MINIMAL_QUESTION,
        'One short question — no explanation',
        'One line. One question. No explanation. No recap of prior messages.',
        'Binary soft question',
        { openingPremise: 'question', primaryAngle: 'minimal_ask', trustAngle: 'direct', ctaFraming: 'binary_question', structure: 'question_led', evidence: 'none' },
        { lengthOverride: 'ultra_short' }
      ),
      angle(3,
        VERSION_LABELS.BRIEF_REFRAME, STRATEGY_ANGLES.BRIEF_REFRAME,
        'Reframe the core offer in different terms',
        'Reframe the core offer in different terms. Different from the prior message and from version 1. New observation or new framing of offer_angle.',
        'Reframed offer CTA',
        { openingPremise: 'statement', primaryAngle: 'reframed_offer', trustAngle: 'transparency', ctaFraming: 'direct_question', structure: 'observation_led', evidence: 'none' }
      ),
    ]
  }
  if (seq === 3) {
    return [
      angle(1,
        VERSION_LABELS.DIFFERENT_ANGLE, STRATEGY_ANGLES.CHANGED_ANGLE,
        'Different angle; shorter than prior sequence',
        'Different angle and shorter than the sequence 2 message. New perspective on the offer.',
        'Short soft ask',
        { openingPremise: 'observation', primaryAngle: 'reframe_offer', trustAngle: 'direct', ctaFraming: 'soft_ask', structure: 'observation_led', evidence: 'none' },
        { lengthOverride: 'short' }
      ),
      angle(2,
        VERSION_LABELS.QUESTION_ONLY, STRATEGY_ANGLES.MINIMAL_QUESTION,
        'One line question only',
        'Ultra-short. One question. No explanation.',
        'Binary question',
        { openingPremise: 'question', primaryAngle: 'minimal_ask', trustAngle: 'direct', ctaFraming: 'binary_question', structure: 'question_led', evidence: 'none' },
        { lengthOverride: 'ultra_short' }
      ),
    ]
  }
  // seq 4: exit-aware
  return [
    angle(1,
      VERSION_LABELS.DIFFERENT_ANGLE, STRATEGY_ANGLES.CHANGED_ANGLE,
      'Final angle; exit-aware',
      'Different angle. Acknowledge this may not be the right time. Leave door open.',
      'Exit-aware soft ask',
      { openingPremise: 'acknowledgment', primaryAngle: 'exit_aware', trustAngle: 'direct', ctaFraming: 'exit_offer', structure: 'acknowledgment_led', evidence: 'none' },
      { lengthOverride: 'ultra_short' }
    ),
    angle(2,
      VERSION_LABELS.GRACEFUL_EXIT, STRATEGY_ANGLES.GRACEFUL_SEQUENCE_EXIT,
      'Graceful close-out',
      'Graceful exit. Offer to close this sequence.',
      'Close-out offer',
      { openingPremise: 'statement', primaryAngle: 'sequence_exit', trustAngle: 'direct', ctaFraming: 'exit_offer', structure: 'offer_led', evidence: 'none' },
      { lengthOverride: 'ultra_short' }
    ),
  ]
}

// ============================================================
// MT-8: Re-Engagement — 2 versions
// ============================================================

function planReEngagement(): VersionAngle[] {
  return [
    angle(1,
      VERSION_LABELS.TIME_GAP_ACKNOWLEDGMENT, STRATEGY_ANGLES.TIME_GAP_ACKNOWLEDGMENT,
      'Neutral subject; fresh framing',
      'Lightly acknowledge that time has passed. Non-apologetic, non-guilt-inducing. Still relevant framing.',
      'Low-pressure reconnect CTA',
      { openingPremise: 'acknowledgment', primaryAngle: 'time_aware_reconnect', trustAngle: 'direct', ctaFraming: 'soft_ask', structure: 'acknowledgment_led', evidence: 'none' }
    ),
    angle(2,
      VERSION_LABELS.FRESH_REASON, STRATEGY_ANGLES.FRESH_RECONNECT_REASON,
      'Present a fresh or updated reason to reconnect',
      'Present a new or updated reason to reconnect without referencing the prior failed sequence explicitly. Use a different framing from version 1.',
      'Fresh offer CTA',
      { openingPremise: 'observation', primaryAngle: 'fresh_context', trustAngle: 'industry_familiarity', ctaFraming: 'direct_question', structure: 'observation_led', evidence: 'none' }
    ),
  ]
}

// ============================================================
// MT-9: Partner / Member Campaign — 3 versions
// ============================================================

function planPartnerMemberCampaign(): VersionAngle[] {
  return [
    angle(1,
      VERSION_LABELS.PARTNER_CONTEXT, STRATEGY_ANGLES.PARTNER_SHARED_CONTEXT,
      'May include partner name in subject; natural reference',
      'Open with a natural reference to the shared partner connection. Transition quickly to the review offer. Reference partner once in the body.',
      'Statement review CTA with light partner context',
      { openingPremise: 'acknowledgment', primaryAngle: 'partner_connection', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'acknowledgment_led', evidence: 'none' }
    ),
    angle(2,
      VERSION_LABELS.HOME_SERVICES_ANGLE, STRATEGY_ANGLES.HOME_SERVICES_OPERATIONAL,
      'Reference company name; no explicit partner reference needed',
      'Lead with home services or operational industry context appropriate to the partner profile. No explicit partner reference required for this version — industry angle is primary.',
      'Industry-grounded CTA for statement review',
      { openingPremise: 'observation', primaryAngle: 'operational_context', trustAngle: 'industry_familiarity', ctaFraming: 'specific_offer', structure: 'observation_led', evidence: 'none' }
    ),
    angle(3,
      VERSION_LABELS.STATEMENT_REVIEW_CLARITY, STRATEGY_ANGLES.STATEMENT_CLARITY_PARTNER,
      'Lead with the review offer directly',
      'Lead with the core offer: a free review of their processing statement. Light partner reference as context. Direct CTA.',
      'Direct statement review CTA',
      { openingPremise: 'offer', primaryAngle: 'cost_clarity', trustAngle: 'transparency', ctaFraming: 'specific_offer', structure: 'offer_led', evidence: 'none' }
    ),
  ]
}

// ============================================================
// MT-10: Event / Expo Follow-Up — 2 or 3 versions
// ============================================================

function planEventExpoFollowUp(hasNotes: boolean): VersionAngle[] {
  if (hasNotes) {
    return [
      angle(1,
        VERSION_LABELS.EVENT_CONVERSATION, STRATEGY_ANGLES.EVENT_CONVERSATION_REFERENCE,
        'Reference the event and a specific discussion point',
        'Open by referencing the meeting at the event. Reference a specific detail from conversation_notes. Tie it to the offer.',
        'Statement review or call CTA tied to the conversation',
        { openingPremise: 'acknowledgment', primaryAngle: 'conversation_followup', trustAngle: 'specific_finding', ctaFraming: 'specific_offer', structure: 'acknowledgment_led', evidence: 'specific_finding' }
      ),
      angle(2,
        VERSION_LABELS.FOLLOW_UP_ON_TOPIC, STRATEGY_ANGLES.EVENT_TOPIC_FOLLOWUP,
        'Reference the event; advance the conversation thread',
        'Reference the conversation topic specifically. Advance the thread from the event to the next step.',
        'Advance-the-conversation CTA',
        { openingPremise: 'observation', primaryAngle: 'topic_continuation', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'observation_led', evidence: 'specific_finding' }
      ),
      angle(3,
        VERSION_LABELS.DIRECT_ASK_EVENT, STRATEGY_ANGLES.EVENT_DIRECT_ASK,
        'Reference event meeting; immediate CTA',
        'Brief reference to meeting at the event. Immediate CTA: would a review make sense as the next step?',
        'Direct ask for next step',
        { openingPremise: 'acknowledgment', primaryAngle: 'direct_next_step', trustAngle: 'direct', ctaFraming: 'direct_question', structure: 'acknowledgment_led', evidence: 'none' },
        { lengthOverride: 'short' }
      ),
    ]
  }
  return [
    angle(1,
      VERSION_LABELS.EVENT_REFERENCE, STRATEGY_ANGLES.EVENT_REFERENCE_ONLY,
      'Reference the event; no conversation details',
      'Reference the event by name. Do not fabricate any conversation details. Keep to event-level acknowledgment.',
      'Statement review offer CTA',
      { openingPremise: 'acknowledgment', primaryAngle: 'event_meeting', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'acknowledgment_led', evidence: 'none' }
    ),
    angle(2,
      VERSION_LABELS.DIRECT_ASK, STRATEGY_ANGLES.EVENT_DIRECT_ASK,
      'Reference event meeting briefly; direct ask',
      'Brief event reference. Direct ask: would a review make sense?',
      'Direct review offer CTA',
      { openingPremise: 'question', primaryAngle: 'direct_offer', trustAngle: 'direct', ctaFraming: 'direct_question', structure: 'question_led', evidence: 'none' },
      { lengthOverride: 'short' }
    ),
  ]
}

// ============================================================
// MT-11: Referral Request — 2 versions
// ============================================================

function planReferralRequest(): VersionAngle[] {
  return [
    angle(1,
      VERSION_LABELS.GRATITUDE_FIRST, STRATEGY_ANGLES.GRATITUDE_FIRST,
      'Warm subject; not transactional',
      'Open with genuine acknowledgment of delivered value. Natural transition to the referral ask.',
      'Natural referral ask CTA',
      { openingPremise: 'acknowledgment', primaryAngle: 'delivered_value', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'acknowledgment_led', evidence: 'none' }
    ),
    angle(2,
      VERSION_LABELS.SPECIFIC_REFERRAL_ASK, STRATEGY_ANGLES.SPECIFIC_REFERRAL_ASK,
      'Describe the type of referral fit specifically',
      'Describe who would benefit from the referral. Make the ask concrete and specific. Different structure from version 1.',
      'Specific referral-fit ask',
      { openingPremise: 'offer', primaryAngle: 'referral_targeting', trustAngle: 'transparency', ctaFraming: 'specific_offer', structure: 'offer_led', evidence: 'none' }
    ),
  ]
}

// ============================================================
// MT-12: Customer Nurture — 2 or 3 versions
// ============================================================

function planCustomerNurture(hasNurtureTrigger: boolean): VersionAngle[] {
  const base = [
    angle(1,
      VERSION_LABELS.ACCOUNT_REVIEW_OFFER, STRATEGY_ANGLES.ACCOUNT_REVIEW_OFFER,
      'Account review framing; not cold',
      'Offer a periodic review of their account structure. Relationship-first. Must not sound like prospecting.',
      'Account review offer CTA',
      { openingPremise: 'offer', primaryAngle: 'account_review', trustAngle: 'industry_familiarity', ctaFraming: 'soft_ask', structure: 'offer_led', evidence: 'none' }
    ),
    angle(2,
      VERSION_LABELS.RELATIONSHIP_MAINTENANCE, STRATEGY_ANGLES.RELATIONSHIP_MAINTENANCE,
      'Check-in framing; no specific ask required',
      'Check-in without a hard ask. Relationship-first. Different structure from version 1.',
      'Soft check-in CTA',
      { openingPremise: 'acknowledgment', primaryAngle: 'relationship_check', trustAngle: 'transparency', ctaFraming: 'soft_ask', structure: 'acknowledgment_led', evidence: 'none' }
    ),
  ]
  if (hasNurtureTrigger) {
    base.push(
      angle(3,
        VERSION_LABELS.SEASONAL_CHECK_IN, STRATEGY_ANGLES.SEASONAL_OPERATIONAL,
        'Seasonal or operational moment reference',
        'Reference a relevant operational or seasonal moment for the merchant. Offer a timely review framed around that moment.',
        'Seasonal or operational review CTA',
        { openingPremise: 'observation', primaryAngle: 'seasonal_relevance', trustAngle: 'industry_familiarity', ctaFraming: 'specific_offer', structure: 'observation_led', evidence: 'none' }
      )
    )
  }
  return base
}

// ============================================================
// Main entry point
// ============================================================

export function buildVersionPlan(
  messageType: string,
  opts:        VersionPlanOptions
): VersionPlan {
  const { sequencePosition, hasConversationNotes, hasNurtureTrigger } = opts
  let angles: VersionAngle[] = []

  switch (messageType) {
    case 'cold_outreach':
      angles = planColdOutreach()
      break
    case 'new_inquiry_response':
      angles = planNewInquiryResponse()
      break
    case 'statement_submitted_confirmation':
      angles = planStatementSubmittedConfirmation()
      break
    case 'statement_review_follow_up':
      angles = planStatementReviewFollowUp()
      break
    case 'statement_not_submitted_follow_up':
      angles = planStatementNotSubmittedFollowUp(sequencePosition)
      break
    case 'proposal_follow_up':
      angles = planProposalFollowUp()
      break
    case 'no_response_follow_up':
      angles = planNoResponseFollowUp(sequencePosition)
      break
    case 're_engagement':
      angles = planReEngagement()
      break
    case 'partner_member_specific_campaign':
      angles = planPartnerMemberCampaign()
      break
    case 'event_expo_follow_up':
      angles = planEventExpoFollowUp(hasConversationNotes)
      break
    case 'referral_request':
      angles = planReferralRequest()
      break
    case 'customer_nurture':
      angles = planCustomerNurture(hasNurtureTrigger)
      break
    default:
      angles = []
  }

  return {
    messageType,
    sequencePosition,
    requiredVersionCount: angles.length,
    angles,
  }
}
