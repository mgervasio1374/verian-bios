// ============================================================
// Phase 3B — Invalid Strategy Validator
// Detects all blocking errors and advisory warnings.
// Pure function — no I/O, no side effects.
// Called after strategy object is built; before persistence.
// ============================================================

import {
  STRATEGY_ERROR_CODES,
  STRATEGY_WARNING_CODES,
  MESSAGE_TYPES,
  SKILL_SLUGS,
} from './message-strategy.types'
import type {
  MessageStrategy,
  NormalizedStrategyInput,
  StrategyError,
  StrategyWarning,
} from './message-strategy.types'

export interface ValidationResult {
  errors:   StrategyError[]
  warnings: StrategyWarning[]
}

// ---- Error builders ----

function err(
  code:         typeof STRATEGY_ERROR_CODES[keyof typeof STRATEGY_ERROR_CODES],
  severity:     StrategyError['severity'],
  message:      string,
  suggested_fix:string,
  can_override: boolean,
  blocking:     boolean,
  affected_field?: string
): StrategyError {
  return { code, severity, message, suggested_fix, can_override, blocking, affected_field }
}

function warn(
  code:             typeof STRATEGY_WARNING_CODES[keyof typeof STRATEGY_WARNING_CODES],
  message:          string,
  confidence_impact:number,
  affected_field?:  string
): StrategyWarning {
  return { code, message, confidence_impact, affected_field }
}

// ---- Main validator ----

export function validateStrategy(
  strategy: Partial<MessageStrategy>,
  n:        NormalizedStrategyInput
): ValidationResult {
  const errors:   StrategyError[]   = []
  const warnings: StrategyWarning[] = []

  const slugs = new Set((strategy.selected_skills ?? []).map(s => s.skill_slug))
  const mt    = strategy.message_type

  // ---- STRAT_001 — opted_out ----
  if (n.lead.opted_out) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_001, 'critical',
      'This lead has opted out of communications. No strategy can be generated and no message can be sent.',
      'Remove this lead from all active campaigns. Honor the opt-out permanently.',
      false, true, 'lead.opted_out'
    ))
  }

  // ---- STRAT_002 — global_agent_pause ----
  if (n.systemControls.global_agent_pause) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_002, 'critical',
      'The global agent pause is active. All strategy generation is paused.',
      'Disable global_agent_pause in System Controls when ready to resume.',
      false, true
    ))
  }

  // ---- STRAT_003 — phase3b_not_enabled ----
  if (n.systemControls.email_generation_engine !== 'phase3b') {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_003, 'critical',
      `Phase 3B email generation is not enabled (engine = '${n.systemControls.email_generation_engine}').`,
      "Set email_generation_engine to 'phase3b' in System Controls.",
      false, true
    ))
  }

  // ---- STRAT_004 — statement_review_not_completed ----
  if (
    mt === MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP &&
    !n.statement.statement_review_completed
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_004, 'critical',
      'Statement Review Follow-Up requires a completed statement review. The review has not been completed for this lead.',
      'Complete the statement review and document findings, then regenerate the strategy.',
      false, true, 'statement.statement_review_completed'
    ))
  }

  // ---- STRAT_004B — statement_findings_not_available ----
  if (
    mt === MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP &&
    n.statement.statement_review_completed &&
    !n.statement.statement_findings_available
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_004B, 'critical',
      'Statement review is marked complete, but findings have not been documented.',
      'Document the review findings, then regenerate the strategy.',
      false, true, 'statement.statement_findings_available'
    ))
  }

  // ---- STRAT_004C — statement_artifact_missing ----
  if (
    mt === MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION &&
    !n.statement.has_statement_artifact
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_004C, 'critical',
      'Statement Submitted Confirmation requires a confirmed statement artifact. No statement has been received.',
      'Wait for the merchant to submit a statement, then regenerate.',
      false, true, 'statement.has_statement_artifact'
    ))
  }

  // ---- STRAT_004D — company_name_missing for cold outreach ----
  if (
    mt === MESSAGE_TYPES.COLD_OUTREACH &&
    !n.lead.company_name
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_004D, 'blocking',
      'Cold outreach requires a company name. No targeted message can be generated without one.',
      'Update the lead or company record with the correct company name, then regenerate.',
      true, true, 'lead.company_name'
    ))
  }

  // ---- STRAT_005 — partner_membership_unconfirmed ----
  if (
    (slugs.has(SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING) || slugs.has(SKILL_SLUGS.BLUE_COLLAR_SUCCESS_GROUP_MESSAGING)) &&
    !n.partner.partner_membership_confirmed
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_005, 'critical',
      'Partner messaging requires confirmed partner membership. Membership has not been confirmed for this lead.',
      'Verify and confirm partner membership in the lead source data.',
      false, true, 'partner.partner_membership_confirmed'
    ))
  }

  // ---- STRAT_006 — proposal_not_sent ----
  if (
    mt === MESSAGE_TYPES.PROPOSAL_FOLLOW_UP &&
    !n.proposal.proposal_sent
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_006, 'critical',
      'Proposal Follow-Up requires a sent proposal. No proposal has been sent for this lead.',
      'Send a proposal first, then regenerate the strategy.',
      false, true, 'proposal.proposal_sent'
    ))
  }

  // ---- STRAT_007 — not_existing_customer ----
  if (
    mt === MESSAGE_TYPES.CUSTOMER_NURTURE &&
    !n.customer.is_existing_customer
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_007, 'critical',
      'Customer Nurture is only for existing 321 Swipe customers. This lead is not a current customer.',
      'Use a different message type appropriate for a prospect.',
      false, true, 'customer.is_existing_customer'
    ))
  }

  // ---- STRAT_008 — compliance_skill_missing ----
  if (!slugs.has(SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS)) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_008, 'critical',
      'The Compliance / Forbidden Claims skill must be included in every strategy.',
      "Ensure compliance_forbidden_claims is active in the skills library, then regenerate.",
      false, true
    ))
  }

  // ---- STRAT_010 — referral_relationship_missing ----
  if (
    mt === MESSAGE_TYPES.REFERRAL_REQUEST &&
    !n.customer.is_existing_customer &&
    !(n.statement.has_statement_artifact && n.statement.statement_review_completed)
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_010, 'critical',
      'Referral Request requires an existing customer relationship or prior delivered value (completed statement review).',
      'Build a relationship first before requesting a referral.',
      false, true
    ))
  }

  // ---- STRAT_011 — savings_amount_without_calculation ----
  if (
    strategy.offer_angle === 'confirmed_savings_review' &&
    n.statement.calculated_savings_amount == null
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_011, 'critical',
      "The offer angle 'confirmed_savings_review' requires a calculated savings amount from a completed statement review.",
      "Change offer_angle to 'savings_review' (possible savings) or complete a review with calculated findings.",
      false, true, 'offer_angle'
    ))
  }

  // ---- STRAT_012 — confidence_too_low ----
  const confidence = strategy.confidence_score ?? 0
  if (confidence < 0.50) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_012, 'blocking',
      `Confidence score is too low to safely generate copy (score: ${confidence.toFixed(3)}). Significant input data is missing or signals conflict.`,
      'Review the confidence breakdown in the strategy reasoning. Provide missing inputs and regenerate.',
      true, true
    ))
  }

  // ---- STRAT_013 — sequence_pause_after_four_touches ----
  if (
    (n.lead.prior_touch_count ?? 0) >= 4 &&
    n.lead.last_engagement_signal === 'none'
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_013, 'blocking',
      'This sequence has reached 4 touches with no engagement. Continuing risks compliance and relationship damage.',
      'Pause this lead\'s sequence. Re-evaluate in 30 days. Consider a Re-Engagement strategy when revisiting.',
      false, true
    ))
  }

  // ---- Warnings ----

  if (!n.lead.company_name) {
    warnings.push(warn(
      STRATEGY_WARNING_CODES.STRAT_WARN_001,
      'Company name is missing. Personalization and targeting will be severely limited.',
      0.15, 'lead.company_name'
    ))
  }

  if (!n.statement.has_statement_artifact && n.statement.has_statement_artifact === undefined as unknown) {
    warnings.push(warn(
      STRATEGY_WARNING_CODES.STRAT_WARN_002,
      'Statement status is unknown. Treating as no statement on file.',
      0, 'statement.has_statement_artifact'
    ))
  }

  if ((n.lead.prior_touch_count ?? 0) > 0 && !n.lead.last_contacted_at) {
    warnings.push(warn(
      STRATEGY_WARNING_CODES.STRAT_WARN_003,
      'Prior touch count > 0 but last contact date is unknown.',
      0.10, 'lead.last_contacted_at'
    ))
  }

  if (!n.lead.contact_name) {
    warnings.push(warn(
      STRATEGY_WARNING_CODES.STRAT_WARN_004,
      'Contact name is missing. Message will use company-only personalization.',
      0.10, 'lead.contact_name'
    ))
  }

  if (!n.lead.industry_segment) {
    warnings.push(warn(
      STRATEGY_WARNING_CODES.STRAT_WARN_005,
      'Industry segment is unknown. No audience skill was selected; generic framing will be used.',
      0.10, 'lead.industry_segment'
    ))
  }

  if (n.lead.lead_source_normalized === 'unknown') {
    warnings.push(warn(
      STRATEGY_WARNING_CODES.STRAT_WARN_006,
      'Lead source is unknown or unrecognised. Inbound vs. cold classification is uncertain.',
      0.10, 'lead.lead_source'
    ))
  }

  if (
    mt === MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP &&
    !n.event.conversation_notes
  ) {
    warnings.push(warn(
      STRATEGY_WARNING_CODES.STRAT_WARN_007,
      'Event lead without conversation notes. Generated message cannot reference specific conversation details.',
      0.10, 'event.conversation_notes'
    ))
  }

  if (
    mt === MESSAGE_TYPES.PROPOSAL_FOLLOW_UP &&
    !n.proposal.proposal_sent_at
  ) {
    warnings.push(warn(
      STRATEGY_WARNING_CODES.STRAT_WARN_008,
      'Proposal is marked sent but proposal_sent_at is missing. Timing references must be avoided in the CTA.',
      0.10, 'proposal.proposal_sent_at'
    ))
  }

  return { errors, warnings }
}
