// ============================================================
// Phase 3B — Message Strategy Skill Selector
// Selects the correct skill combination for a given message
// type and lead context. Validates against invalid combination
// rules. Pure functions — no I/O.
// ============================================================

import {
  MESSAGE_TYPES,
  SKILL_SLUGS,
  STRATEGY_ERROR_CODES,
} from './message-strategy.types'
import type {
  MessageType,
  NormalizedStrategyInput,
  SelectedSkill,
  SkillReasoning,
  StrategyError,
  SkillSelectionResult,
} from './message-strategy.types'

// ---- Helpers ----

function skill(slug: typeof SKILL_SLUGS[keyof typeof SKILL_SLUGS], version: number): SelectedSkill {
  return { skill_slug: slug, skill_version: version }
}

function reason(slug: typeof SKILL_SLUGS[keyof typeof SKILL_SLUGS], why: string): SkillReasoning {
  return { skill_slug: slug, reason: why }
}

function ver(n: NormalizedStrategyInput, slug: typeof SKILL_SLUGS[keyof typeof SKILL_SLUGS]): number {
  return n.skills.active_skill_versions[slug] ?? 1
}

// ---- Audience skill selector ----

function selectAudienceSkill(
  n: NormalizedStrategyInput,
  selected: SelectedSkill[],
  reasoning: SkillReasoning[]
): void {
  const industry   = (n.lead.industry_segment ?? '').toLowerCase()
  const partnerCfm = n.partner.partner_membership_confirmed
  const partnerNm  = (n.partner.partner_name ?? '').toLowerCase()

  if (partnerCfm && partnerNm === 'certainpath') {
    // CertainPath skill acts as both context AND audience for MT-9;
    // for other message types where this is called, add home_services as secondary
    selected.push(skill(SKILL_SLUGS.HOME_SERVICES_CONTRACTOR, ver(n, SKILL_SLUGS.HOME_SERVICES_CONTRACTOR)))
    reasoning.push(reason(SKILL_SLUGS.HOME_SERVICES_CONTRACTOR, 'CertainPath members are home services contractors — audience detail skill applied alongside partner skill.'))
    return
  }

  if (partnerCfm && partnerNm === 'bcsg') {
    // BCSG does not automatically add home_services; BCSG skill is the audience
    return
  }

  if (industry.includes('home') || industry.includes('hvac') || industry.includes('plumbing') ||
      industry.includes('electrical') || industry.includes('roofing') || industry.includes('landscaping') ||
      industry.includes('pest') || industry.includes('pool') || industry.includes('contractor')) {
    selected.push(skill(SKILL_SLUGS.HOME_SERVICES_CONTRACTOR, ver(n, SKILL_SLUGS.HOME_SERVICES_CONTRACTOR)))
    reasoning.push(reason(SKILL_SLUGS.HOME_SERVICES_CONTRACTOR, `Industry segment (${n.lead.industry_segment}) maps to home services contractor audience.`))
  }
  // Other industries: no audience skill available in v1.0 library
}

// ---- Positioning skill selector ----

function selectPositioningSkill(
  messageType: MessageType,
  n: NormalizedStrategyInput,
  selected: SelectedSkill[],
  reasoning: SkillReasoning[]
): void {
  const hasSavings = n.statement.calculated_savings_amount != null
  const reviewDone = n.statement.statement_review_completed && n.statement.statement_findings_available

  switch (messageType) {
    case MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP:
      selected.push(skill(SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING, ver(n, SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING)))
      reasoning.push(reason(SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING, 'Statement review follow-up always uses statement analysis positioning.'))
      if (hasSavings) {
        selected.push(skill(SKILL_SLUGS.SAVINGS_REVIEW_POSITIONING, ver(n, SKILL_SLUGS.SAVINGS_REVIEW_POSITIONING)))
        reasoning.push(reason(SKILL_SLUGS.SAVINGS_REVIEW_POSITIONING, 'Calculated savings are available — savings review positioning added.'))
      }
      break

    case MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN:
      selected.push(skill(SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING, ver(n, SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING)))
      reasoning.push(reason(SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING, 'Partner campaign leads with statement analysis offer.'))
      break

    case MESSAGE_TYPES.STATEMENT_NOT_SUBMITTED_FOLLOW_UP:
      selected.push(skill(SKILL_SLUGS.SAVINGS_REVIEW_POSITIONING, ver(n, SKILL_SLUGS.SAVINGS_REVIEW_POSITIONING)))
      reasoning.push(reason(SKILL_SLUGS.SAVINGS_REVIEW_POSITIONING, 'Statement not submitted — use savings review framing to communicate why the review matters.'))
      break

    case MESSAGE_TYPES.COLD_OUTREACH:
    case MESSAGE_TYPES.NEW_INQUIRY_RESPONSE:
    case MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP:
      if (reviewDone) {
        selected.push(skill(SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING, ver(n, SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING)))
        reasoning.push(reason(SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING, 'Statement review is complete; positioning should explain what the review found.'))
      }
      // otherwise no positioning skill for these types
      break

    default:
      break
  }
}

// ---- Tone skill selector ----

function selectToneSkill(
  messageType: MessageType,
  n: NormalizedStrategyInput,
  selected: SelectedSkill[],
  reasoning: SkillReasoning[]
): void {
  const warmTypes = new Set<MessageType>([
    MESSAGE_TYPES.NEW_INQUIRY_RESPONSE,
    MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION,
    MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP,
    MESSAGE_TYPES.REFERRAL_REQUEST,
    MESSAGE_TYPES.CUSTOMER_NURTURE,
    MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN,
  ])

  const briefTypes = new Set<MessageType>([
    MESSAGE_TYPES.COLD_OUTREACH,
    MESSAGE_TYPES.STATEMENT_NOT_SUBMITTED_FOLLOW_UP,
    MESSAGE_TYPES.PROPOSAL_FOLLOW_UP,
    MESSAGE_TYPES.NO_RESPONSE_FOLLOW_UP,
    MESSAGE_TYPES.RE_ENGAGEMENT,
  ])

  if (warmTypes.has(messageType)) {
    selected.push(skill(SKILL_SLUGS.WARM_CONVERSATIONAL, ver(n, SKILL_SLUGS.WARM_CONVERSATIONAL)))
    reasoning.push(reason(SKILL_SLUGS.WARM_CONVERSATIONAL, `${messageType} calls for a warm, relationship-oriented tone.`))
    return
  }

  if (briefTypes.has(messageType)) {
    selected.push(skill(SKILL_SLUGS.EXECUTIVE_BREVITY, ver(n, SKILL_SLUGS.EXECUTIVE_BREVITY)))
    reasoning.push(reason(SKILL_SLUGS.EXECUTIVE_BREVITY, `${messageType} calls for a direct, brief approach — executive brevity tone.`))
    return
  }

  // Statement Review Follow-Up: trust-building tone is primary; no dedicated tone skill
  if (messageType === MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP) {
    selected.push(skill(SKILL_SLUGS.WARM_CONVERSATIONAL, ver(n, SKILL_SLUGS.WARM_CONVERSATIONAL)))
    reasoning.push(reason(SKILL_SLUGS.WARM_CONVERSATIONAL, 'Statement review findings warrant a professional, warm tone to present observations without pressure.'))
    return
  }

  // Default
  selected.push(skill(SKILL_SLUGS.EXECUTIVE_BREVITY, ver(n, SKILL_SLUGS.EXECUTIVE_BREVITY)))
  reasoning.push(reason(SKILL_SLUGS.EXECUTIVE_BREVITY, 'Default brevity tone applied.'))
}

// ---- Trust-Building selector (always adds when beneficial) ----

function addTrustBuildingIfBeneficial(
  messageType: MessageType,
  n: NormalizedStrategyInput,
  selected: SelectedSkill[],
  reasoning: SkillReasoning[]
): void {
  const alwaysTrust = new Set<MessageType>([
    MESSAGE_TYPES.COLD_OUTREACH,
    MESSAGE_TYPES.NEW_INQUIRY_RESPONSE,
    MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION,
    MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP,
    MESSAGE_TYPES.PROPOSAL_FOLLOW_UP,
    MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN,
    MESSAGE_TYPES.CUSTOMER_NURTURE,
    MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP,
  ])

  if (alwaysTrust.has(messageType)) {
    selected.push(skill(SKILL_SLUGS.TRUST_BUILDING_ADVISOR, ver(n, SKILL_SLUGS.TRUST_BUILDING_ADVISOR)))
    reasoning.push(reason(SKILL_SLUGS.TRUST_BUILDING_ADVISOR, `${messageType} benefits from advisor-first positioning to build credibility.`))
  }
}

// ---- Main skill selection entry point ----

export function selectSkills(
  messageType: MessageType,
  n:           NormalizedStrategyInput
): SkillSelectionResult {
  const selected: SelectedSkill[] = []
  const reasoning: SkillReasoning[] = []
  const errors: StrategyError[] = []

  // ---- 1. Context skill (always first) ----
  const contextSkillMap: Partial<Record<MessageType, typeof SKILL_SLUGS[keyof typeof SKILL_SLUGS]>> = {
    [MESSAGE_TYPES.COLD_OUTREACH]:                    SKILL_SLUGS.COLD_OUTREACH,
    [MESSAGE_TYPES.NEW_INQUIRY_RESPONSE]:             SKILL_SLUGS.NEW_INQUIRY_RESPONSE,
    [MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION]: SKILL_SLUGS.STATEMENT_SUBMITTED_CONFIRMATION,
    [MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP]:       SKILL_SLUGS.STATEMENT_REVIEW_FOLLOW_UP,
    [MESSAGE_TYPES.STATEMENT_NOT_SUBMITTED_FOLLOW_UP]:SKILL_SLUGS.STATEMENT_NOT_SUBMITTED_FOLLOW_UP,
    [MESSAGE_TYPES.PROPOSAL_FOLLOW_UP]:               SKILL_SLUGS.PROPOSAL_FOLLOW_UP,
    [MESSAGE_TYPES.NO_RESPONSE_FOLLOW_UP]:            SKILL_SLUGS.NO_RESPONSE_FOLLOW_UP,
    [MESSAGE_TYPES.RE_ENGAGEMENT]:                    SKILL_SLUGS.RE_ENGAGEMENT,
    [MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP]:             SKILL_SLUGS.EVENT_EXPO_FOLLOW_UP,
    [MESSAGE_TYPES.REFERRAL_REQUEST]:                 SKILL_SLUGS.REFERRAL_REQUEST,
    [MESSAGE_TYPES.CUSTOMER_NURTURE]:                 SKILL_SLUGS.CUSTOMER_NURTURE,
  }

  if (messageType === MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN) {
    const partnerNm = (n.partner.partner_name ?? '').toLowerCase()
    if (partnerNm === 'certainpath') {
      selected.push(skill(SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING, ver(n, SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING)))
      reasoning.push(reason(SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING, 'Confirmed CertainPath membership — CertainPath context skill selected.'))
    } else if (partnerNm === 'bcsg') {
      selected.push(skill(SKILL_SLUGS.BLUE_COLLAR_SUCCESS_GROUP_MESSAGING, ver(n, SKILL_SLUGS.BLUE_COLLAR_SUCCESS_GROUP_MESSAGING)))
      reasoning.push(reason(SKILL_SLUGS.BLUE_COLLAR_SUCCESS_GROUP_MESSAGING, 'Confirmed BCSG membership — BCSG context skill selected.'))
    }
  } else {
    const contextSlug = contextSkillMap[messageType]
    if (contextSlug) {
      selected.push(skill(contextSlug, ver(n, contextSlug)))
      reasoning.push(reason(contextSlug, `Context skill for message type '${messageType}'.`))
    }
  }

  // ---- 2. Audience skill (when industry or partner context supports it) ----
  selectAudienceSkill(n, selected, reasoning)

  // ---- 3. Positioning skill (when offer angle requires it) ----
  selectPositioningSkill(messageType, n, selected, reasoning)

  // ---- 4. Trust-building (when beneficial for this message type) ----
  addTrustBuildingIfBeneficial(messageType, n, selected, reasoning)

  // ---- 5. Tone skill ----
  selectToneSkill(messageType, n, selected, reasoning)

  // ---- 6. Compliance skill (always last, always present) ----
  selected.push(skill(SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS, ver(n, SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS)))
  reasoning.push(reason(SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS, 'Compliance skill is always selected for every strategy.'))

  // ---- 7. Validate combination ----
  const comboErrors = validateSkillCombination(messageType, selected, n)
  errors.push(...comboErrors)

  return { selected_skills: selected, skill_reasoning: reasoning, errors }
}

// ---- Invalid combination validation ----

export function validateSkillCombination(
  messageType: MessageType,
  selected:    SelectedSkill[],
  n:           NormalizedStrategyInput
): StrategyError[] {
  const errors: StrategyError[] = []
  const slugs = new Set(selected.map(s => s.skill_slug))

  const err = (
    code:         typeof STRATEGY_ERROR_CODES[keyof typeof STRATEGY_ERROR_CODES],
    message:      string,
    suggested_fix:string,
    can_override: boolean
  ): StrategyError => ({
    code,
    severity:      'critical',
    message,
    suggested_fix,
    can_override,
    blocking:      true,
  })

  // SKILL_001: cold_outreach + statement_submitted_confirmation
  if (slugs.has(SKILL_SLUGS.COLD_OUTREACH) && slugs.has(SKILL_SLUGS.STATEMENT_SUBMITTED_CONFIRMATION)) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_009,
      'SKILL_001: cold_outreach and statement_submitted_confirmation cannot be combined. These are mutually exclusive contexts.',
      'Remove one of the conflicting context skills.',
      false
    ))
  }

  // SKILL_002: cold_outreach + statement_review_follow_up
  if (slugs.has(SKILL_SLUGS.COLD_OUTREACH) && slugs.has(SKILL_SLUGS.STATEMENT_REVIEW_FOLLOW_UP)) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_009,
      'SKILL_002: cold_outreach and statement_review_follow_up cannot be combined. A cold lead has not submitted a statement.',
      'Remove the statement_review_follow_up skill. Use cold_outreach context only.',
      false
    ))
  }

  // SKILL_003: statement_review_follow_up without completed review
  if (
    slugs.has(SKILL_SLUGS.STATEMENT_REVIEW_FOLLOW_UP) &&
    (!n.statement.statement_review_completed || !n.statement.statement_findings_available)
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_004,
      'SKILL_003: statement_review_follow_up requires a completed statement review with documented findings.',
      'Complete the statement review and document findings before using this skill.',
      false
    ))
  }

  // SKILL_004: certainpath_member_messaging without confirmed membership
  if (slugs.has(SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING) && !n.partner.partner_membership_confirmed) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_005,
      'SKILL_004: certainpath_member_messaging requires confirmed CertainPath membership.',
      'Verify and confirm CertainPath membership in the lead source data.',
      false
    ))
  }

  // SKILL_005: blue_collar_success_group_messaging without confirmed BCSG membership
  if (slugs.has(SKILL_SLUGS.BLUE_COLLAR_SUCCESS_GROUP_MESSAGING) && !n.partner.partner_membership_confirmed) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_005,
      'SKILL_005: blue_collar_success_group_messaging requires confirmed BCSG membership.',
      'Verify and confirm BCSG membership in the lead source data.',
      false
    ))
  }

  // SKILL_006: referral_request without relationship
  if (
    slugs.has(SKILL_SLUGS.REFERRAL_REQUEST) &&
    !n.customer.is_existing_customer &&
    !(n.statement.has_statement_artifact && n.statement.statement_review_completed)
  ) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_010,
      'SKILL_006: referral_request requires an existing customer relationship or completed statement review.',
      'Build a relationship first before requesting a referral.',
      false
    ))
  }

  // SKILL_007: customer_nurture for non-customer
  if (slugs.has(SKILL_SLUGS.CUSTOMER_NURTURE) && !n.customer.is_existing_customer) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_007,
      'SKILL_007: customer_nurture is only for existing customers.',
      'Use a different context skill for this prospect.',
      false
    ))
  }

  // SKILL_008: savings_review_positioning with specific savings amount without calculated data
  if (
    slugs.has(SKILL_SLUGS.SAVINGS_REVIEW_POSITIONING) &&
    messageType === MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP &&
    n.statement.calculated_savings_amount == null
  ) {
    // Only block if offer_angle would be confirmed_savings_review — the positioning skill itself is ok
    // This is a soft concern handled in validation, not a hard combination block here
  }

  // SKILL_009: warm_conversational + executive_brevity both as tone skills
  if (slugs.has(SKILL_SLUGS.WARM_CONVERSATIONAL) && slugs.has(SKILL_SLUGS.EXECUTIVE_BREVITY)) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_009,
      'SKILL_009: warm_conversational and executive_brevity cannot be used as co-primary tone skills.',
      'Select exactly one tone skill. Remove the conflicting tone skill.',
      true
    ))
  }

  // SKILL_010: compliance skill missing
  if (!slugs.has(SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS)) {
    errors.push(err(
      STRATEGY_ERROR_CODES.STRAT_008,
      'SKILL_010: compliance_forbidden_claims must always be included.',
      'Add compliance_forbidden_claims to the selected skills.',
      false
    ))
  }

  // SKILL_011: more than one context skill selected
  const contextSkills = [
    SKILL_SLUGS.COLD_OUTREACH,
    SKILL_SLUGS.NEW_INQUIRY_RESPONSE,
    SKILL_SLUGS.STATEMENT_SUBMITTED_CONFIRMATION,
    SKILL_SLUGS.STATEMENT_REVIEW_FOLLOW_UP,
    SKILL_SLUGS.STATEMENT_NOT_SUBMITTED_FOLLOW_UP,
    SKILL_SLUGS.PROPOSAL_FOLLOW_UP,
    SKILL_SLUGS.NO_RESPONSE_FOLLOW_UP,
    SKILL_SLUGS.RE_ENGAGEMENT,
    SKILL_SLUGS.EVENT_EXPO_FOLLOW_UP,
    SKILL_SLUGS.REFERRAL_REQUEST,
    SKILL_SLUGS.CUSTOMER_NURTURE,
    SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING,
    SKILL_SLUGS.BLUE_COLLAR_SUCCESS_GROUP_MESSAGING,
  ]
  const contextCount = contextSkills.filter(s => slugs.has(s)).length
  if (contextCount > 1) {
    // Partner context skills are intentionally selected as a pair; BCSG and CertainPath are exclusive
    // CertainPath + home_services_contractor is valid — home_services is an audience skill, not context
    // Only error if two actual context (message-type) skills are present
    const pureContextSkills = contextSkills.filter(s =>
      s !== SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING &&
      s !== SKILL_SLUGS.BLUE_COLLAR_SUCCESS_GROUP_MESSAGING
    )
    const pureContextCount = pureContextSkills.filter(s => slugs.has(s)).length
    const partnerContextCount = [SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING, SKILL_SLUGS.BLUE_COLLAR_SUCCESS_GROUP_MESSAGING]
      .filter(s => slugs.has(s)).length

    if (pureContextCount > 1 || (pureContextCount >= 1 && partnerContextCount >= 1)) {
      errors.push(err(
        STRATEGY_ERROR_CODES.STRAT_009,
        'SKILL_011: more than one context skill is selected. Only one context skill is permitted per strategy.',
        'Select exactly one context skill that matches the message type.',
        false
      ))
    }
  }

  return errors
}
