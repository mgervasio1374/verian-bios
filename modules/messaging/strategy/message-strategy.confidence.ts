// ============================================================
// Phase 3B — Confidence Scorer
// Calculates the confidence score for a given strategy based
// on the richness of available input data and signal quality.
// Pure function — no I/O, no side effects.
// ============================================================

import {
  MESSAGE_TYPES,
  INBOUND_SOURCES,
  COLD_SOURCES,
  PARTNER_SOURCES,
} from './message-strategy.types'
import type {
  MessageType,
  NormalizedStrategyInput,
  SelectedSkill,
  ConfidenceBreakdown,
} from './message-strategy.types'

// ---- Helpers ----

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

// ---- Main scorer ----

export function calculateConfidence(
  messageType: MessageType,
  selected:    SelectedSkill[],
  n:           NormalizedStrategyInput
): ConfidenceBreakdown {
  const bd: ConfidenceBreakdown = {
    trigger_match_bonus:            0,
    source_stage_agree_bonus:       0,
    required_inputs_present_bonus:  0,
    industry_known_bonus:           0,
    prior_touch_known_bonus:        0,
    campaign_context_bonus:         0,
    evidence_confirmed_bonus:       0,
    contact_name_penalty:           0,
    company_name_penalty:           0,
    industry_unknown_penalty:       0,
    ambiguous_source_penalty:       0,
    conflicting_signals_penalty:    0,
    event_notes_missing_penalty:    0,
    proposal_date_missing_penalty:  0,
    prior_messages_missing_penalty: 0,
    customer_status_ambiguous_penalty:0,
    hard_fail:                      false,
    raw_score:                      0,
    final_score:                    0,
  }

  const src   = n.lead.lead_source_normalized
  const stage = n.lead.lead_stage ?? ''

  // ---- Positive factors ----

  // Trigger match: all required conditions for the selected type are present
  const triggerMatch = checkTriggerMatch(messageType, n)
  bd.trigger_match_bonus = triggerMatch ? 0.40 : 0

  // Source and stage agreement
  const srcStageAgree = checkSourceStageAgreement(messageType, src, stage, n)
  bd.source_stage_agree_bonus = srcStageAgree ? 0.15 : 0

  // Required inputs present
  const reqInputsScore = calculateRequiredInputsScore(messageType, n)
  bd.required_inputs_present_bonus = reqInputsScore

  // Industry known
  if (n.lead.industry_segment) {
    bd.industry_known_bonus = 0.10
  }

  // Prior touch history available
  if (n.lead.last_contacted_at || (n.lead.prior_touch_count ?? 0) > 0) {
    bd.prior_touch_known_bonus = 0.10
  }

  // Campaign context available
  if (n.campaign.campaign_id && n.campaign.campaign_type) {
    bd.campaign_context_bonus = 0.05
  }

  // Partner/event/proposal evidence confirmed when relevant
  if (confirmEvidenceBonus(messageType, n)) {
    bd.evidence_confirmed_bonus = 0.05
  }

  // ---- Penalties ----

  if (!n.lead.contact_name) {
    bd.contact_name_penalty = -0.10
  }

  if (!n.lead.company_name) {
    bd.company_name_penalty = -0.15
  }

  if (!n.lead.industry_segment) {
    bd.industry_unknown_penalty = -0.10
  }

  if (src === 'unknown') {
    bd.ambiguous_source_penalty = -0.10
  }

  // Conflicting source/stage signal
  if (detectConflictingSignals(src, stage)) {
    bd.conflicting_signals_penalty = -0.20
  }

  // Event notes missing for event follow-up
  if (messageType === MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP && !n.event.conversation_notes) {
    bd.event_notes_missing_penalty = -0.10
  }

  // Proposal date missing for proposal follow-up
  if (messageType === MESSAGE_TYPES.PROPOSAL_FOLLOW_UP && !n.proposal.proposal_sent_at) {
    bd.proposal_date_missing_penalty = -0.10
  }

  // Prior campaign messages missing when sequence position >= 2
  const seqPos = n.campaign.sequence_position ?? 1
  if (seqPos >= 2 && (!n.campaign.prior_campaign_messages || n.campaign.prior_campaign_messages.length === 0)) {
    bd.prior_messages_missing_penalty = -0.15
  }

  // Customer status ambiguous for customer nurture
  if (messageType === MESSAGE_TYPES.CUSTOMER_NURTURE && !n.customer.account_status) {
    bd.customer_status_ambiguous_penalty = -0.20
  }

  // ---- Hard fail conditions ----
  // (Also enforced by validation, but captured here for completeness)
  if (n.lead.opted_out) {
    bd.hard_fail   = true
    bd.raw_score   = 0
    bd.final_score = 0
    return bd
  }

  // ---- Compute final score ----
  const positives = (
    bd.trigger_match_bonus +
    bd.source_stage_agree_bonus +
    bd.required_inputs_present_bonus +
    bd.industry_known_bonus +
    bd.prior_touch_known_bonus +
    bd.campaign_context_bonus +
    bd.evidence_confirmed_bonus
  )
  const penalties = (
    bd.contact_name_penalty +
    bd.company_name_penalty +
    bd.industry_unknown_penalty +
    bd.ambiguous_source_penalty +
    bd.conflicting_signals_penalty +
    bd.event_notes_missing_penalty +
    bd.proposal_date_missing_penalty +
    bd.prior_messages_missing_penalty +
    bd.customer_status_ambiguous_penalty
  )

  const raw   = positives + penalties
  const final = clamp(raw, 0, 1)

  bd.raw_score   = Math.round(raw   * 1000) / 1000
  bd.final_score = Math.round(final * 1000) / 1000

  return bd
}

// ---- Trigger match check ----

function checkTriggerMatch(messageType: MessageType, n: NormalizedStrategyInput): boolean {
  switch (messageType) {
    case MESSAGE_TYPES.COLD_OUTREACH:
      return !!n.lead.company_name && !n.statement.has_statement_artifact && (n.lead.prior_touch_count ?? 0) === 0
    case MESSAGE_TYPES.NEW_INQUIRY_RESPONSE:
      return (
        INBOUND_SOURCES.has(n.lead.lead_source_normalized) ||
        n.lead.lead_stage === 'new_inquiry' ||
        n.lead.lead_stage === 'analysis_requested'
      )
    case MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION:
      return n.statement.has_statement_artifact && !n.statement.statement_review_completed
    case MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP:
      return (
        n.statement.has_statement_artifact &&
        !!n.statement.statement_review_completed &&
        !!n.statement.statement_findings_available
      )
    case MESSAGE_TYPES.STATEMENT_NOT_SUBMITTED_FOLLOW_UP:
      return !n.statement.has_statement_artifact && (n.lead.prior_touch_count ?? 0) >= 1
    case MESSAGE_TYPES.PROPOSAL_FOLLOW_UP:
      return n.proposal.proposal_sent && n.lead.lead_stage !== 'closed_won' && n.lead.lead_stage !== 'closed_lost'
    case MESSAGE_TYPES.NO_RESPONSE_FOLLOW_UP:
      return (n.lead.prior_touch_count ?? 0) >= 1 && n.lead.last_engagement_signal !== 'replied'
    case MESSAGE_TYPES.RE_ENGAGEMENT: {
      const days = n.lead.days_since_last_contact
      return (n.lead.prior_touch_count ?? 0) >= 1 && (days != null ? days >= 30 : false)
    }
    case MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN:
      return n.partner.partner_membership_confirmed
    case MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP: {
      const evDays = n.event.days_since_event
      return (
        (n.lead.lead_source_normalized === 'event' || !!n.event.event_name) &&
        (evDays == null || evDays <= 60)
      )
    }
    case MESSAGE_TYPES.REFERRAL_REQUEST:
      return n.customer.is_existing_customer
    case MESSAGE_TYPES.CUSTOMER_NURTURE:
      return n.customer.is_existing_customer && n.customer.account_status !== 'churned'
    default:
      return false
  }
}

// ---- Source / stage agreement ----

function checkSourceStageAgreement(
  messageType: MessageType,
  src:         string,
  stage:       string,
  n:           NormalizedStrategyInput
): boolean {
  switch (messageType) {
    case MESSAGE_TYPES.COLD_OUTREACH:
      return COLD_SOURCES.has(src) && (stage === 'new' || stage === 'contacted' || stage === '')
    case MESSAGE_TYPES.NEW_INQUIRY_RESPONSE:
      return INBOUND_SOURCES.has(src) && (stage === 'new_inquiry' || stage === 'analysis_requested')
    case MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION:
    case MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP:
      return stage === 'statement_received' || stage === 'statement_review'
    case MESSAGE_TYPES.PROPOSAL_FOLLOW_UP:
      return stage === 'proposal_sent' || stage === 'proposal'
    case MESSAGE_TYPES.CUSTOMER_NURTURE:
      return stage === 'nurture' || n.customer.is_existing_customer
    case MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN:
      return PARTNER_SOURCES.has(src)
    case MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP:
      return src === 'event'
    default:
      return true  // neutral — no specific source/stage pairing expected
  }
}

// ---- Required inputs score (0 to 0.15 proportionally) ----

function calculateRequiredInputsScore(messageType: MessageType, n: NormalizedStrategyInput): number {
  const checks: boolean[] = [!!n.lead.lead_id, !!n.lead.company_name]

  switch (messageType) {
    case MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP:
      checks.push(!!n.statement.review_summary)
      checks.push(n.statement.statement_review_completed === true)
      checks.push(n.statement.statement_findings_available === true)
      break
    case MESSAGE_TYPES.PROPOSAL_FOLLOW_UP:
      checks.push(n.proposal.proposal_sent === true)
      checks.push(!!n.proposal.proposal_summary)
      break
    case MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP:
      checks.push(!!n.event.event_name)
      checks.push(!!n.event.event_date)
      break
    case MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN:
      checks.push(n.partner.partner_membership_confirmed === true)
      checks.push(!!n.partner.partner_name)
      break
    case MESSAGE_TYPES.CUSTOMER_NURTURE:
      checks.push(n.customer.is_existing_customer === true)
      break
    default:
      checks.push(!!n.lead.contact_name)
      break
  }

  const passed = checks.filter(Boolean).length
  const ratio  = passed / checks.length
  return Math.round(ratio * 0.15 * 1000) / 1000
}

// ---- Evidence bonus ----

function confirmEvidenceBonus(messageType: MessageType, n: NormalizedStrategyInput): boolean {
  switch (messageType) {
    case MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN:
      return n.partner.partner_membership_confirmed && !!n.partner.partner_name
    case MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP:
      return !!n.event.event_name && !!n.event.conversation_notes
    case MESSAGE_TYPES.PROPOSAL_FOLLOW_UP:
      return !!n.proposal.proposal_sent_at && !!n.proposal.proposal_summary
    case MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP:
      return !!n.statement.review_summary && n.statement.statement_findings_available === true
    default:
      return false
  }
}

// ---- Conflicting signal detection ----

function detectConflictingSignals(src: string, stage: string): boolean {
  return (
    (INBOUND_SOURCES.has(src) && stage === 'new') ||
    (COLD_SOURCES.has(src) && (stage === 'new_inquiry' || stage === 'analysis_requested'))
  )
}

// ---- Confidence band helper ----

export type ConfidenceBand =
  | 'high'
  | 'usable_review_recommended'
  | 'low_review_required'
  | 'insufficient'

export function getConfidenceBand(score: number): ConfidenceBand {
  if (score >= 0.85) return 'high'
  if (score >= 0.70) return 'usable_review_recommended'
  if (score >= 0.50) return 'low_review_required'
  return 'insufficient'
}
