// ============================================================
// Phase 3B — Message Strategy Decision Tree
// Deterministic, priority-ordered message type selection.
// Pure functions — no database calls, no side effects.
// Implements the priority order from the approved design:
//   P0: pre-flight checks (handled by service)
//   P1: customer_nurture
//   P2: proposal_follow_up
//   P3: statement_review_follow_up
//   P4: statement_submitted_confirmation
//   P5: event_expo_follow_up
//   P6: new_inquiry_response
//   P7: partner_member_specific_campaign
//   P8: statement_not_submitted_follow_up
//   P9: no_response_follow_up
//  P10: re_engagement
//  P11: cold_outreach (fallback)
// Referral Request (MT-11) is explicit-request only.
// ============================================================

import {
  MESSAGE_TYPES,
  LEAD_SOURCES,
  STRATEGY_WARNING_CODES,
} from './message-strategy.types'
import type {
  NormalizedStrategyInput,
  MessageType,
  DecisionTreeResult,
  AlternativeAngle,
  StrategyWarning,
} from './message-strategy.types'

const INBOUND_SOURCES = new Set<string>([
  'website', 'tawk.to', 'calendly', 'app.321swipe.com', 'upload.321swipe.com',
])

function make(
  type: MessageType,
  reason: string,
  alternativesConsidered: AlternativeAngle[] = [],
  warnings: StrategyWarning[] = []
): DecisionTreeResult {
  return { message_type: type, reason, alternative_angles: alternativesConsidered, warnings }
}

// ---- Priority 1: Customer Nurture ----
// Wins over any campaign targeting if this is an existing customer.
function checkCustomerNurture(n: NormalizedStrategyInput): DecisionTreeResult | null {
  if (!n.customer.is_existing_customer) return null
  if (n.customer.account_status === 'churned' || n.customer.account_status === 'suspended') return null
  // Customer Nurture is P1 — it wins over proposal follow-up (P2).
  // An existing customer with a pending proposal still receives nurture messaging
  // (the proposal follow-up is a lower-priority concern).
  return make(
    MESSAGE_TYPES.CUSTOMER_NURTURE,
    'Lead is an existing active customer. Customer Nurture takes priority over any campaign targeting.',
    []
  )
}

// ---- Priority 2: Proposal Follow-Up ----
function checkProposalFollowUp(n: NormalizedStrategyInput): DecisionTreeResult | null {
  if (!n.proposal.proposal_sent) return null
  if (n.lead.lead_stage === 'closed_won' || n.lead.lead_stage === 'closed_lost') return null
  if (n.lead.lead_stage !== 'proposal_sent' && n.lead.lead_stage !== 'proposal') {
    // proposal_sent=true but stage doesn't match — still valid, just lower confidence
  }
  return make(
    MESSAGE_TYPES.PROPOSAL_FOLLOW_UP,
    'Proposal has been sent and the lead has not yet closed. Proposal Follow-Up is the active context.',
    []
  )
}

// ---- Priority 3: Statement Review Follow-Up ----
function checkStatementReviewFollowUp(n: NormalizedStrategyInput): DecisionTreeResult | null {
  if (!n.statement.has_statement_artifact)       return null
  if (!n.statement.statement_review_completed)   return null
  if (!n.statement.statement_findings_available) return null
  return make(
    MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP,
    'Statement artifact is confirmed, review is complete, and findings are documented. Statement Review Follow-Up is the appropriate type.',
    []
  )
}

// ---- Priority 4: Statement Submitted Confirmation ----
function checkStatementSubmittedConfirmation(
  n: NormalizedStrategyInput,
  alternatives: AlternativeAngle[]
): DecisionTreeResult | null {
  if (!n.statement.has_statement_artifact)     return null
  if (n.statement.statement_review_completed)  return null  // review done → P3 already handled

  // Deduplication: if a prior confirmation was already sent, don't send again
  const priorMessages = n.campaign.prior_campaign_messages ?? []
  const alreadySentConfirmation = priorMessages.some(
    m => (m['message_type'] as string) === MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION
  )
  if (alreadySentConfirmation) return null

  return make(
    MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION,
    'Statement artifact confirmed; review not yet complete; no prior confirmation sent. Statement Submitted Confirmation is appropriate.',
    alternatives
  )
}

// ---- Priority 5: Event / Expo Follow-Up ----
function checkEventExpoFollowUp(n: NormalizedStrategyInput): DecisionTreeResult | null {
  const src = n.lead.lead_source_normalized
  const hasEventSource = src === LEAD_SOURCES.EVENT || !!n.event.event_name
  if (!hasEventSource) return null

  const daysSince = n.event.days_since_event
  if (daysSince != null && daysSince > 60) return null  // too old → use re-engagement

  // Check deduplication
  const priorMessages = n.campaign.prior_campaign_messages ?? []
  const alreadySentEvent = priorMessages.some(
    m => (m['message_type'] as string) === MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP
  )
  if (alreadySentEvent) return null

  const warnings: StrategyWarning[] = []
  if (!n.event.conversation_notes) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_007,
      message:          'Event lead without conversation notes. Message cannot reference specific conversation details.',
      confidence_impact:0.10,
      affected_field:   'event.conversation_notes',
    })
  }

  return make(
    MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP,
    `Event lead source confirmed (${n.event.event_name ?? 'unnamed event'}) within 60 days. Event Follow-Up is appropriate.`,
    [],
    warnings
  )
}

// ---- Priority 6: New Inquiry Response ----
function checkNewInquiryResponse(n: NormalizedStrategyInput): DecisionTreeResult | null {
  // Statement beats inquiry: if statement was submitted, P4 handled it
  if (n.statement.has_statement_artifact) return null

  const src   = n.lead.lead_source_normalized
  const stage = n.lead.lead_stage ?? ''

  const isInbound = INBOUND_SOURCES.has(src)
  const isInboundStage = stage === 'new_inquiry' || stage === 'analysis_requested'

  if (!isInbound && !isInboundStage) return null

  // Check prior MT-2 sent
  const priorMessages = n.campaign.prior_campaign_messages ?? []
  const alreadySentInbound = priorMessages.some(
    m => (m['message_type'] as string) === MESSAGE_TYPES.NEW_INQUIRY_RESPONSE
  )
  if (alreadySentInbound) return null

  return make(
    MESSAGE_TYPES.NEW_INQUIRY_RESPONSE,
    `Inbound source (${src}) or inbound stage (${stage}) detected. New Inquiry Response is appropriate.`,
    []
  )
}

// ---- Priority 7: Partner / Member-Specific Campaign ----
function checkPartnerCampaign(n: NormalizedStrategyInput): DecisionTreeResult | null {
  if (!n.partner.partner_membership_confirmed) return null
  const pname = (n.partner.partner_name ?? '').toLowerCase()
  if (pname !== 'certainpath' && pname !== 'bcsg') return null
  // If statement just submitted → P4 handled; if inbound → P6 handled
  if (n.statement.has_statement_artifact) return null
  if (INBOUND_SOURCES.has(n.lead.lead_source_normalized)) return null

  return make(
    MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN,
    `Confirmed ${n.partner.partner_name} membership. Partner Member Campaign is appropriate for first contact.`,
    []
  )
}

// ---- Priority 8: Statement Not Submitted Follow-Up ----
function checkStatementNotSubmittedFollowUp(n: NormalizedStrategyInput): DecisionTreeResult | null {
  if (n.statement.has_statement_artifact) return null  // statement received → higher priority handled it
  if ((n.lead.prior_touch_count ?? 0) < 1) return null         // no prior touch → not a follow-up

  // Require prior_campaign_messages to be present and contain at least one message that
  // invited statement submission. Without this evidence we cannot confirm a statement
  // invitation was ever made — fall through to no-response or re-engagement instead.
  const priorMessages = n.campaign.prior_campaign_messages ?? []
  if (priorMessages.length === 0) return null  // no confirmed prior message context

  const statementInvitationTypes = new Set<string>([
    MESSAGE_TYPES.STATEMENT_NOT_SUBMITTED_FOLLOW_UP,
    MESSAGE_TYPES.NEW_INQUIRY_RESPONSE,
    MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN,
    MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP,
  ])
  const priorInvitedStatement = priorMessages.some(m => {
    const mt = m['message_type'] as string
    return statementInvitationTypes.has(mt)
  })

  if (!priorInvitedStatement) return null

  return make(
    MESSAGE_TYPES.STATEMENT_NOT_SUBMITTED_FOLLOW_UP,
    `Prior contact made (touch count: ${(n.lead.prior_touch_count ?? 0)}) but statement not yet received. Statement Not Submitted Follow-Up appropriate.`,
    []
  )
}

// ---- Priority 9: No-Response Follow-Up ----
function checkNoResponseFollowUp(n: NormalizedStrategyInput): DecisionTreeResult | null {
  if ((n.lead.prior_touch_count ?? 0) < 1) return null

  // Pause after 4 touches with no engagement — handled upstream as STRAT_013, but also guard here
  if ((n.lead.prior_touch_count ?? 0) >= 4 && n.lead.last_engagement_signal === 'none') return null

  const daysContact = n.lead.days_since_last_contact
  if (daysContact != null && daysContact >= 30) return null  // too long ago → re-engagement

  const lastSignal = n.lead.last_engagement_signal ?? 'none'
  if (lastSignal === 'replied') return null  // they replied → not a no-response follow-up

  return make(
    MESSAGE_TYPES.NO_RESPONSE_FOLLOW_UP,
    `Prior touch detected (count: ${(n.lead.prior_touch_count ?? 0)}), no reply received, last contact within 30 days. No-Response Follow-Up is appropriate.`,
    []
  )
}

// ---- Priority 10: Re-Engagement ----
function checkReEngagement(n: NormalizedStrategyInput): DecisionTreeResult | null {
  if ((n.lead.prior_touch_count ?? 0) < 1) return null

  const daysContact = n.lead.days_since_last_contact
  // Re-engagement when dormancy ≥ 30 days, or prior_touch_count ≥ 4 with no engagement
  const longDormancy = daysContact != null && daysContact >= 30
  const pausedSequence = (n.lead.prior_touch_count ?? 0) >= 4 && n.lead.last_engagement_signal === 'none'

  if (!longDormancy && !pausedSequence) return null

  return make(
    MESSAGE_TYPES.RE_ENGAGEMENT,
    `Lead had prior engagement but has been dormant for ${daysContact ?? 'unknown'} days. Re-Engagement is appropriate.`,
    []
  )
}

// ---- Priority 11: Cold Outreach (fallback) ----
function fallbackColdOutreach(alternatives: AlternativeAngle[]): DecisionTreeResult {
  return make(
    MESSAGE_TYPES.COLD_OUTREACH,
    'No higher-specificity context matched. Cold Outreach is the safe fallback for this lead.',
    alternatives
  )
}

// ---- Main decision tree entry point ----

export function selectMessageType(
  n: NormalizedStrategyInput
): DecisionTreeResult {
  const alternatives: AlternativeAngle[] = []
  const addAlt = (type: string, reason: string) => alternatives.push({ message_type: type, reason_not_selected: reason })

  // P1
  const nurture = checkCustomerNurture(n)
  if (nurture) return nurture
  addAlt(MESSAGE_TYPES.CUSTOMER_NURTURE, 'Lead is not an existing customer or is churned/suspended.')

  // P2
  const proposal = checkProposalFollowUp(n)
  if (proposal) return proposal
  addAlt(MESSAGE_TYPES.PROPOSAL_FOLLOW_UP, 'No proposal sent or lead is already closed.')

  // P3
  const reviewFollowUp = checkStatementReviewFollowUp(n)
  if (reviewFollowUp) return reviewFollowUp
  addAlt(MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP, 'Statement review not complete or findings not documented.')

  // P4
  const confirmation = checkStatementSubmittedConfirmation(n, [])
  if (confirmation) return confirmation
  addAlt(MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION, 'No statement artifact or prior confirmation already sent.')

  // P5
  const event = checkEventExpoFollowUp(n)
  if (event) return event
  addAlt(MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP, 'Lead source is not event or event is older than 60 days.')

  // P6
  const inquiry = checkNewInquiryResponse(n)
  if (inquiry) return inquiry
  addAlt(MESSAGE_TYPES.NEW_INQUIRY_RESPONSE, 'No inbound source or inbound stage detected.')

  // P7
  const partner = checkPartnerCampaign(n)
  if (partner) return partner
  addAlt(MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN, 'No confirmed partner membership or inbound/statement context took priority.')

  // P8
  const stmtFollowUp = checkStatementNotSubmittedFollowUp(n)
  if (stmtFollowUp) return stmtFollowUp
  addAlt(MESSAGE_TYPES.STATEMENT_NOT_SUBMITTED_FOLLOW_UP, 'No prior touch that invited statement submission, or statement already received.')

  // P9
  const noResponse = checkNoResponseFollowUp(n)
  if (noResponse) return noResponse
  addAlt(MESSAGE_TYPES.NO_RESPONSE_FOLLOW_UP, 'No prior touch within 30 days, or lead already replied, or 4+ touches with no engagement.')

  // P10
  const reEngagement = checkReEngagement(n)
  if (reEngagement) return reEngagement
  addAlt(MESSAGE_TYPES.RE_ENGAGEMENT, 'Less than 30 days dormancy and sequence is still active.')

  // P11 fallback
  return fallbackColdOutreach(alternatives)
}

// ---- Referral request gate (explicit only) ----

export function isReferralRequestAllowed(n: NormalizedStrategyInput): boolean {
  return n.customer.is_existing_customer || !!(n.statement.has_statement_artifact && n.statement.statement_review_completed)
}
