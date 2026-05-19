// ============================================================
// Phase 3B — Message Strategy Normalizer
// Accepts raw StrategyInput and produces a fully-typed
// NormalizedStrategyInput. Computes derived fields, applies
// defaults, emits warnings for missing data. No strategic
// decisions — no message type selection, no skill selection.
// ============================================================

import {
  LEAD_SOURCES,
  SKILL_SLUGS,
  STRATEGY_WARNING_CODES,
} from './message-strategy.types'
import type {
  StrategyInput,
  NormalizedStrategyInput,
  StrategyWarning,
  SkillStrategyInput,
} from './message-strategy.types'

// ---- Helpers ----

function daysBetween(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null
  const then = new Date(isoDate).getTime()
  if (isNaN(then)) return null
  const now  = Date.now()
  return Math.floor((now - then) / 86_400_000)
}

function normalizeLeadSource(raw: string | null | undefined): string {
  const s = (raw ?? '').toLowerCase().trim()
  const valid = new Set<string>(Object.values(LEAD_SOURCES))
  return valid.has(s) ? s : LEAD_SOURCES.UNKNOWN
}

// All 20 skills from Phase 3B Skills & Playbooks Pack v1.0
const ALL_SKILLS: SkillStrategyInput['available_skills'][number][] = [
  SKILL_SLUGS.COLD_OUTREACH,
  SKILL_SLUGS.NEW_INQUIRY_RESPONSE,
  SKILL_SLUGS.STATEMENT_SUBMITTED_CONFIRMATION,
  SKILL_SLUGS.STATEMENT_REVIEW_FOLLOW_UP,
  SKILL_SLUGS.STATEMENT_NOT_SUBMITTED_FOLLOW_UP,
  SKILL_SLUGS.HOME_SERVICES_CONTRACTOR,
  SKILL_SLUGS.CERTAINPATH_MEMBER_MESSAGING,
  SKILL_SLUGS.BLUE_COLLAR_SUCCESS_GROUP_MESSAGING,
  SKILL_SLUGS.STATEMENT_ANALYSIS_POSITIONING,
  SKILL_SLUGS.SAVINGS_REVIEW_POSITIONING,
  SKILL_SLUGS.TRUST_BUILDING_ADVISOR,
  SKILL_SLUGS.EXECUTIVE_BREVITY,
  SKILL_SLUGS.WARM_CONVERSATIONAL,
  SKILL_SLUGS.NO_RESPONSE_FOLLOW_UP,
  SKILL_SLUGS.RE_ENGAGEMENT,
  SKILL_SLUGS.PROPOSAL_FOLLOW_UP,
  SKILL_SLUGS.EVENT_EXPO_FOLLOW_UP,
  SKILL_SLUGS.REFERRAL_REQUEST,
  SKILL_SLUGS.CUSTOMER_NURTURE,
  SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS,
]

function defaultSkillInput(): SkillStrategyInput {
  const versions: Record<string, number> = {}
  ALL_SKILLS.forEach(s => { versions[s] = 1 })
  return {
    available_skills:     ALL_SKILLS,
    active_skill_versions:versions,
  }
}

// ---- Main normalizer ----

export function normalizeStrategyInput(
  raw: StrategyInput
): NormalizedStrategyInput {
  const warnings: StrategyWarning[] = []

  // -- Lead --
  const l = raw.lead
  const leadSourceNorm = normalizeLeadSource(l.lead_source)
  if ((l.lead_source ?? '') !== '' && leadSourceNorm === LEAD_SOURCES.UNKNOWN) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_006,
      message:          `Lead source '${l.lead_source}' is not a recognised value and was normalised to 'unknown'.`,
      confidence_impact:0.10,
      affected_field:   'lead.lead_source',
    })
  }

  const daysContact = daysBetween(l.last_contacted_at)
  const priorTouches = l.prior_touch_count ?? 0

  if (!l.company_name) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_001,
      message:          'Company name is missing. Cold outreach cannot proceed without a company name; confidence will be reduced.',
      confidence_impact:0.15,
      affected_field:   'lead.company_name',
    })
  }

  if (!l.contact_name) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_004,
      message:          'Contact name is missing. Personalisation level will be limited to segment_specific at most.',
      confidence_impact:0.10,
      affected_field:   'lead.contact_name',
    })
  }

  if (!l.industry_segment && !raw.company?.industry) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_005,
      message:          'Industry segment is unknown. No audience skill will be selected; message will use generic framing.',
      confidence_impact:0.10,
      affected_field:   'lead.industry_segment',
    })
  }

  if (priorTouches > 0 && !l.last_contacted_at) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_003,
      message:          'Prior touch count is > 0 but last_contacted_at is missing. Sequence position cannot be confirmed.',
      confidence_impact:0.10,
      affected_field:   'lead.last_contacted_at',
    })
  }

  // -- Statement --
  const st = raw.statement
  let hasStatementArtifact = false
  let statementReviewCompleted = false
  let statementFindingsAvailable = false
  let calculatedSavingsAmount: number | null = null
  let calculationBasis: string | null = null
  let reviewSummary: string | null = null
  let statementReceivedAt: string | null = null

  if (st != null) {
    hasStatementArtifact       = st.has_statement_artifact
    statementReviewCompleted   = st.statement_review_completed  ?? false
    statementFindingsAvailable = st.statement_findings_available ?? false
    calculatedSavingsAmount    = st.calculated_savings_amount   ?? null
    calculationBasis           = st.calculation_basis           ?? null
    reviewSummary              = st.review_summary              ?? null
    statementReceivedAt        = st.statement_received_at       ?? null
  } else {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_002,
      message:          'Statement input is absent. Statement status treated as false (no artifact).',
      confidence_impact:0,
      affected_field:   'statement',
    })
  }

  // -- Partner --
  const pa = raw.partner
  const partnerMembershipConfirmed = pa?.partner_membership_confirmed ?? false
  const partnerName                = pa?.partner_name                 ?? null
  const partnerSource              = pa?.partner_source               ?? null
  const partnerTag                 = pa?.partner_tag                  ?? null
  const partnerClaimsAuthorized    = pa?.partner_claims_authorized    ?? false

  // -- Campaign --
  const ca = raw.campaign
  const campaignId       = ca?.campaign_id       ?? null
  const campaignType     = ca?.campaign_type     ?? null
  const campaignGoal     = ca?.campaign_goal     ?? null
  const sequencePosition = ca?.sequence_position ?? (priorTouches > 0 ? priorTouches + 1 : 1)
  const priorCampaignMessages = ca?.prior_campaign_messages ?? null

  if (
    sequencePosition >= 2 &&
    (!priorCampaignMessages || priorCampaignMessages.length === 0)
  ) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_003,
      message:          'Sequence position is ≥ 2 but no prior campaign messages are available. Cannot determine the prior angle.',
      confidence_impact:0.15,
      affected_field:   'campaign.prior_campaign_messages',
    })
  }

  // -- Event --
  const ev = raw.event
  const eventName         = ev?.event_name         ?? null
  const eventDate         = ev?.event_date         ?? null
  const conversationNotes = ev?.conversation_notes ?? null
  const daysSinceEvent    = ev?.days_since_event   ?? daysBetween(eventDate)

  if (
    leadSourceNorm === 'event' && !conversationNotes
  ) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_007,
      message:          'Event lead source detected but conversation_notes is empty. Message cannot reference specific conversation details.',
      confidence_impact:0.10,
      affected_field:   'event.conversation_notes',
    })
  }

  // -- Proposal --
  const pr = raw.proposal
  const proposalSent     = pr?.proposal_sent     ?? false
  const proposalSentAt   = pr?.proposal_sent_at  ?? null
  const proposalSummary  = pr?.proposal_summary  ?? null
  const daysSinceProposal = pr?.days_since_proposal ?? daysBetween(proposalSentAt)

  if (proposalSent && !proposalSentAt) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_008,
      message:          'Proposal is marked sent but proposal_sent_at is missing. Timing-based CTA language must be avoided.',
      confidence_impact:0.10,
      affected_field:   'proposal.proposal_sent_at',
    })
  }

  // -- Customer --
  const cu = raw.customer
  const isExistingCustomer    = cu?.is_existing_customer    ?? false
  const customerSince         = cu?.customer_since          ?? null
  const accountStatus         = cu?.account_status          ?? null
  const recentAccountActivity = cu?.recent_account_activity ?? null
  const nurtureTrigger        = cu?.nurture_trigger         ?? null

  // -- Company --
  const co = raw.company
  const companyId            = co?.company_id            ?? null
  const companyName          = co?.company_name          ?? l.company_name ?? null
  const industryFromCompany  = co?.industry              ?? null
  const website              = co?.website               ?? null
  const sizeProxy            = co?.size_proxy            ?? null
  const locationsCount       = co?.locations_count       ?? null
  const knownPaymentContext  = co?.known_payment_context ?? null
  const customerType         = co?.customer_type         ?? null
  const customerStatus       = co?.customer_status       ?? null

  const resolvedIndustry = l.industry_segment ?? industryFromCompany ?? null

  // -- Conflict detection: inbound source but cold-looking stage --
  const inboundSources = new Set<string>([
    'website', 'tawk.to', 'calendly', 'app.321swipe.com', 'upload.321swipe.com',
  ])
  const coldStages = new Set<string>(['new'])
  const coldSources = new Set<string>(['manual', 'import', 'cold_outreach', 'referral'])

  if (
    inboundSources.has(leadSourceNorm) && coldStages.has(l.lead_stage ?? '') ||
    coldSources.has(leadSourceNorm) && (l.lead_stage === 'new_inquiry' || l.lead_stage === 'analysis_requested')
  ) {
    warnings.push({
      code:             STRATEGY_WARNING_CODES.STRAT_WARN_006,
      message:          `Lead source (${leadSourceNorm}) and lead stage (${l.lead_stage}) appear to conflict. Confidence will be reduced; source takes precedence over stage for inbound/cold classification.`,
      confidence_impact:0.20,
      affected_field:   'lead.lead_stage',
    })
  }

  // -- Skills --
  const skills: SkillStrategyInput = raw.skills ?? defaultSkillInput()

  return {
    lead: {
      lead_id:                  l.lead_id,
      contact_name:             l.contact_name             ?? null,
      company_name:             companyName,
      lead_source:              l.lead_source              ?? null,
      lead_stage:               l.lead_stage               ?? null,
      lead_score:               l.lead_score               ?? null,
      lead_urgency_score:       l.lead_urgency_score       ?? null,
      industry_segment:         resolvedIndustry,
      business_type:            l.business_type            ?? null,
      city:                     l.city                     ?? null,
      state:                    l.state                    ?? null,
      processing_volume_tier:   l.processing_volume_tier   ?? null,
      estimated_monthly_volume: l.estimated_monthly_volume ?? null,
      current_processor:        l.current_processor        ?? null,
      prior_touch_count:        priorTouches,
      last_contacted_at:        l.last_contacted_at        ?? null,
      last_engagement_signal:   l.last_engagement_signal   ?? 'none',
      opted_out:                l.opted_out                ?? false,
      assigned_rep_id:          l.assigned_rep_id          ?? null,
      lead_source_normalized:   leadSourceNorm,
      days_since_last_contact:  daysContact,
    },
    company: {
      company_id:            companyId,
      company_name:          companyName,
      industry:              industryFromCompany,
      website:               website,
      size_proxy:            sizeProxy,
      locations_count:       locationsCount,
      known_payment_context: knownPaymentContext,
      customer_type:         customerType,
      customer_status:       customerStatus,
    },
    statement: {
      has_statement_artifact:       hasStatementArtifact,
      statement_received_at:        statementReceivedAt,
      statement_review_completed:   statementReviewCompleted,
      statement_findings_available: statementFindingsAvailable,
      calculated_savings_amount:    calculatedSavingsAmount,
      calculation_basis:            calculationBasis,
      review_summary:               reviewSummary,
    },
    campaign: {
      campaign_id:             campaignId,
      campaign_type:           campaignType,
      campaign_goal:           campaignGoal,
      sequence_position:       sequencePosition,
      sequence_definition:     ca?.sequence_definition     ?? null,
      prior_campaign_messages: priorCampaignMessages,
      target_segment:          ca?.target_segment          ?? null,
      next_scheduled_touch:    ca?.next_scheduled_touch    ?? null,
    },
    partner: {
      partner_membership_confirmed: partnerMembershipConfirmed,
      partner_name:                 partnerName,
      partner_source:               partnerSource,
      partner_tag:                  partnerTag,
      partner_claims_authorized:    partnerClaimsAuthorized,
    },
    event: {
      event_name:         eventName,
      event_date:         eventDate,
      conversation_notes: conversationNotes,
      days_since_event:   daysSinceEvent,
    },
    proposal: {
      proposal_sent:        proposalSent,
      proposal_sent_at:     proposalSentAt,
      proposal_summary:     proposalSummary,
      days_since_proposal:  daysSinceProposal,
    },
    customer: {
      is_existing_customer:    isExistingCustomer,
      customer_since:          customerSince,
      account_status:          accountStatus,
      recent_account_activity: recentAccountActivity,
      nurture_trigger:         nurtureTrigger,
    },
    skills,
    systemControls: raw.systemControls,
    warnings,
  }
}
