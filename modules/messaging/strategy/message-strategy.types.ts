// ============================================================
// Phase 3B — Message Strategy Agent Types
// All interfaces, constants, and type aliases for the Message
// Strategy Agent. No imports from other strategy sub-modules.
// Everything else imports from this file.
// ============================================================

// ---- Message types ----

export const MESSAGE_TYPES = {
  COLD_OUTREACH:                    'cold_outreach',
  NEW_INQUIRY_RESPONSE:             'new_inquiry_response',
  STATEMENT_SUBMITTED_CONFIRMATION: 'statement_submitted_confirmation',
  STATEMENT_REVIEW_FOLLOW_UP:       'statement_review_follow_up',
  STATEMENT_NOT_SUBMITTED_FOLLOW_UP:'statement_not_submitted_follow_up',
  PROPOSAL_FOLLOW_UP:               'proposal_follow_up',
  NO_RESPONSE_FOLLOW_UP:            'no_response_follow_up',
  RE_ENGAGEMENT:                    're_engagement',
  PARTNER_MEMBER_SPECIFIC_CAMPAIGN: 'partner_member_specific_campaign',
  EVENT_EXPO_FOLLOW_UP:             'event_expo_follow_up',
  REFERRAL_REQUEST:                 'referral_request',
  CUSTOMER_NURTURE:                 'customer_nurture',
} as const
export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES]

// ---- Strategy statuses ----

export const STRATEGY_STATUSES = {
  DRAFT:      'draft',
  APPROVED:   'approved',
  IN_USE:     'in_use',
  SUPERSEDED: 'superseded',
  ERROR:      'error',
} as const
export type StrategyStatus = typeof STRATEGY_STATUSES[keyof typeof STRATEGY_STATUSES]

// ---- Tones ----

export const TONES = {
  EXECUTIVE_BREVITY:  'executive_brevity',
  WARM_CONVERSATIONAL:'warm_conversational',
} as const
export type Tone = typeof TONES[keyof typeof TONES]

// ---- Length targets ----

export const LENGTH_TARGETS = {
  ULTRA_SHORT: 'ultra_short',
  SHORT:       'short',
  MEDIUM:      'medium',
  LONG:        'long',
} as const
export type LengthTarget = typeof LENGTH_TARGETS[keyof typeof LENGTH_TARGETS]

// ---- Personalization levels ----

export const PERSONALIZATION_LEVELS = {
  GENERIC:            'generic',
  SEGMENT_SPECIFIC:   'segment_specific',
  LEAD_SPECIFIC:      'lead_specific',
  HIGHLY_PERSONALIZED:'highly_personalized',
} as const
export type PersonalizationLevel = typeof PERSONALIZATION_LEVELS[keyof typeof PERSONALIZATION_LEVELS]

// ---- Offer angles ----

export const OFFER_ANGLES = {
  STATEMENT_REVIEW:       'statement_review',
  COST_CLARITY:           'cost_clarity',
  SAVINGS_REVIEW:         'savings_review',
  CONFIRMED_SAVINGS_REVIEW:'confirmed_savings_review',
  PROPOSAL_REVIEW:        'proposal_review',
  ACCOUNT_REVIEW:         'account_review',
  PARTNER_MEMBER_REVIEW:  'partner_member_review',
  EVENT_FOLLOW_UP_REVIEW: 'event_follow_up_review',
  REFERRAL_REQUEST:       'referral_request',
  CUSTOMER_NURTURE_CHECK: 'customer_nurture_check',
} as const
export type OfferAngle = typeof OFFER_ANGLES[keyof typeof OFFER_ANGLES]

// ---- Skill slugs ----

export const SKILL_SLUGS = {
  COLD_OUTREACH:                      'cold_outreach',
  NEW_INQUIRY_RESPONSE:               'new_inquiry_response',
  STATEMENT_SUBMITTED_CONFIRMATION:   'statement_submitted_confirmation',
  STATEMENT_REVIEW_FOLLOW_UP:         'statement_review_follow_up',
  STATEMENT_NOT_SUBMITTED_FOLLOW_UP:  'statement_not_submitted_follow_up',
  HOME_SERVICES_CONTRACTOR:           'home_services_contractor',
  CERTAINPATH_MEMBER_MESSAGING:       'certainpath_member_messaging',
  BLUE_COLLAR_SUCCESS_GROUP_MESSAGING:'blue_collar_success_group_messaging',
  STATEMENT_ANALYSIS_POSITIONING:     'statement_analysis_positioning',
  SAVINGS_REVIEW_POSITIONING:         'savings_review_positioning',
  TRUST_BUILDING_ADVISOR:             'trust_building_advisor',
  EXECUTIVE_BREVITY:                  'executive_brevity',
  WARM_CONVERSATIONAL:                'warm_conversational',
  NO_RESPONSE_FOLLOW_UP:              'no_response_follow_up',
  RE_ENGAGEMENT:                      're_engagement',
  PROPOSAL_FOLLOW_UP:                 'proposal_follow_up',
  EVENT_EXPO_FOLLOW_UP:               'event_expo_follow_up',
  REFERRAL_REQUEST:                   'referral_request',
  CUSTOMER_NURTURE:                   'customer_nurture',
  COMPLIANCE_FORBIDDEN_CLAIMS:        'compliance_forbidden_claims',
} as const
export type SkillSlug = typeof SKILL_SLUGS[keyof typeof SKILL_SLUGS]

// ---- Lead sources ----

export const LEAD_SOURCES = {
  MANUAL:          'manual',
  IMPORT:          'import',
  COLD_OUTREACH:   'cold_outreach',
  REFERRAL:        'referral',
  PARTNER:         'partner',
  WEBSITE:         'website',
  TAWKTO:          'tawk.to',
  CALENDLY:        'calendly',
  APP_321SWIPE:    'app.321swipe.com',
  UPLOAD_321SWIPE: 'upload.321swipe.com',
  EVENT:           'event',
  CERTAINPATH:     'certainpath',
  BCSG:            'bcsg',
  UNKNOWN:         'unknown',
} as const
export type LeadSource = typeof LEAD_SOURCES[keyof typeof LEAD_SOURCES]

export const INBOUND_SOURCES = new Set<string>([
  LEAD_SOURCES.WEBSITE,
  LEAD_SOURCES.TAWKTO,
  LEAD_SOURCES.CALENDLY,
  LEAD_SOURCES.APP_321SWIPE,
  LEAD_SOURCES.UPLOAD_321SWIPE,
])

export const COLD_SOURCES = new Set<string>([
  LEAD_SOURCES.MANUAL,
  LEAD_SOURCES.IMPORT,
  LEAD_SOURCES.COLD_OUTREACH,
  LEAD_SOURCES.REFERRAL,
])

export const PARTNER_SOURCES = new Set<string>([
  LEAD_SOURCES.CERTAINPATH,
  LEAD_SOURCES.BCSG,
])

// ---- Lead stages ----

export const LEAD_STAGES = {
  NEW:               'new',
  NEW_INQUIRY:       'new_inquiry',
  ANALYSIS_REQUESTED:'analysis_requested',
  CONTACTED:         'contacted',
  STATEMENT_RECEIVED:'statement_received',
  STATEMENT_REVIEW:  'statement_review',
  PROPOSAL_SENT:     'proposal_sent',
  PROPOSAL:          'proposal',
  CLOSED_WON:        'closed_won',
  CLOSED_LOST:       'closed_lost',
  NURTURE:           'nurture',
  OPTED_OUT:         'opted_out',
} as const
export type LeadStage = typeof LEAD_STAGES[keyof typeof LEAD_STAGES]

// ---- Partner names ----

export const PARTNER_NAMES = {
  CERTAINPATH: 'certainpath',
  BCSG:        'bcsg',
} as const
export type PartnerName = typeof PARTNER_NAMES[keyof typeof PARTNER_NAMES]

// ---- Processing volume tiers ----

export const PROCESSING_VOLUME_TIERS = {
  LOW:     'low',
  MEDIUM:  'medium',
  HIGH:    'high',
  UNKNOWN: 'unknown',
} as const
export type ProcessingVolumeTier = typeof PROCESSING_VOLUME_TIERS[keyof typeof PROCESSING_VOLUME_TIERS]

// ---- Engagement signals ----

export const ENGAGEMENT_SIGNALS = {
  NONE:                'none',
  OPENED:              'opened',
  CLICKED:             'clicked',
  REPLIED:             'replied',
  MEETING_BOOKED:      'meeting_booked',
  STATEMENT_SUBMITTED: 'statement_submitted',
} as const
export type EngagementSignal = typeof ENGAGEMENT_SIGNALS[keyof typeof ENGAGEMENT_SIGNALS]

// ---- Error codes ----

export const STRATEGY_ERROR_CODES = {
  STRAT_001:  'STRAT_001',   // opted_out
  STRAT_002:  'STRAT_002',   // global_agent_pause
  STRAT_003:  'STRAT_003',   // phase3b_not_enabled
  STRAT_004:  'STRAT_004',   // statement_review_not_completed
  STRAT_004B: 'STRAT_004B',  // statement_findings_not_available
  STRAT_004C: 'STRAT_004C',  // statement_artifact_missing
  STRAT_004D: 'STRAT_004D',  // company_name_missing_for_cold_outreach
  STRAT_005:  'STRAT_005',   // partner_membership_unconfirmed
  STRAT_006:  'STRAT_006',   // proposal_not_sent
  STRAT_007:  'STRAT_007',   // not_existing_customer
  STRAT_008:  'STRAT_008',   // compliance_skill_missing
  STRAT_009:  'STRAT_009',   // invalid_skill_combination
  STRAT_010:  'STRAT_010',   // referral_relationship_missing
  STRAT_011:  'STRAT_011',   // savings_amount_without_calculation
  STRAT_012:  'STRAT_012',   // confidence_too_low
  STRAT_013:  'STRAT_013',   // sequence_pause_after_four_touches
} as const
export type StrategyErrorCode = typeof STRATEGY_ERROR_CODES[keyof typeof STRATEGY_ERROR_CODES]

// ---- Warning codes ----

export const STRATEGY_WARNING_CODES = {
  STRAT_WARN_001: 'STRAT_WARN_001', // missing_company_name
  STRAT_WARN_002: 'STRAT_WARN_002', // statement_status_unknown
  STRAT_WARN_003: 'STRAT_WARN_003', // prior_touch_history_unavailable
  STRAT_WARN_004: 'STRAT_WARN_004', // missing_contact_name
  STRAT_WARN_005: 'STRAT_WARN_005', // unknown_industry
  STRAT_WARN_006: 'STRAT_WARN_006', // conflicting_source_and_stage
  STRAT_WARN_007: 'STRAT_WARN_007', // event_notes_missing
  STRAT_WARN_008: 'STRAT_WARN_008', // proposal_date_missing
} as const
export type StrategyWarningCode = typeof STRATEGY_WARNING_CODES[keyof typeof STRATEGY_WARNING_CODES]

// ---- Data-object interfaces ----

export interface SelectedSkill {
  skill_slug:    SkillSlug
  skill_version: number
}

export interface SkillReasoning {
  skill_slug: SkillSlug
  reason:     string
}

export interface AlternativeAngle {
  message_type:       string
  reason_not_selected:string
}

export interface PartnerMembership {
  confirmed:    boolean
  partner_name: PartnerName | null
}

export interface StrategyError {
  code:          StrategyErrorCode
  severity:      'critical' | 'blocking' | 'high' | 'medium' | 'low'
  message:       string
  suggested_fix: string
  can_override:  boolean
  blocking:      boolean
  affected_field?: string
}

export interface StrategyWarning {
  code:             StrategyWarningCode
  message:          string
  confidence_impact:number
  affected_field?:  string
}

export interface ConfidenceBreakdown {
  trigger_match_bonus:           number
  source_stage_agree_bonus:      number
  required_inputs_present_bonus: number
  industry_known_bonus:          number
  prior_touch_known_bonus:       number
  campaign_context_bonus:        number
  evidence_confirmed_bonus:      number
  contact_name_penalty:          number
  company_name_penalty:          number
  industry_unknown_penalty:      number
  ambiguous_source_penalty:      number
  conflicting_signals_penalty:   number
  event_notes_missing_penalty:   number
  proposal_date_missing_penalty: number
  prior_messages_missing_penalty:number
  customer_status_ambiguous_penalty: number
  hard_fail:   boolean
  raw_score:   number
  final_score: number
}

export interface StrategyOverrideLogEntry {
  overridden_by:           string
  overridden_at:           string
  original_value:          unknown
  new_value:               unknown
  override_reason:         string
  affected_fields:         string[]
  confidence_impact:       boolean
  regeneration_required:   boolean
  guardrail_blocked:       boolean
  guardrail_blocked_fields?:string[]
}

// ---- Input interfaces ----

export interface LeadStrategyInput {
  lead_id:                string
  contact_name?:          string | null
  company_name?:          string | null
  lead_source?:           string | null
  lead_stage?:            string | null
  lead_score?:            number | null
  lead_urgency_score?:    number | null
  industry_segment?:      string | null
  business_type?:         string | null
  city?:                  string | null
  state?:                 string | null
  processing_volume_tier?:string | null
  estimated_monthly_volume?:number | null
  current_processor?:     string | null
  prior_touch_count?:     number | null
  last_contacted_at?:     string | null
  last_engagement_signal?:string | null
  opted_out?:             boolean | null
  assigned_rep_id?:       string | null
}

export interface CompanyStrategyInput {
  company_id?:           string | null
  company_name?:         string | null
  industry?:             string | null
  website?:              string | null
  size_proxy?:           string | null
  locations_count?:      number | null
  known_payment_context?:string | null
  customer_type?:        string | null
  customer_status?:      string | null
}

export interface StatementStrategyInput {
  has_statement_artifact:       boolean
  statement_received_at?:       string | null
  statement_review_completed?:  boolean | null
  statement_findings_available?:boolean | null
  calculated_savings_amount?:   number | null
  calculation_basis?:           string | null
  review_summary?:              string | null
}

export interface CampaignStrategyInput {
  campaign_id?:            string | null
  campaign_type?:          string | null
  campaign_goal?:          string | null
  sequence_position?:      number | null
  sequence_definition?:    Record<string, unknown> | null
  prior_campaign_messages?:Array<Record<string, unknown>> | null
  target_segment?:         string | null
  next_scheduled_touch?:   string | null
}

export interface PartnerStrategyInput {
  partner_membership_confirmed: boolean
  partner_name?:               string | null
  partner_source?:             string | null
  partner_tag?:                string | null
  partner_claims_authorized?:  boolean | null
}

export interface EventStrategyInput {
  event_name?:        string | null
  event_date?:        string | null
  conversation_notes?:string | null
  days_since_event?:  number | null
}

export interface ProposalStrategyInput {
  proposal_sent:        boolean
  proposal_sent_at?:    string | null
  proposal_summary?:    string | null
  days_since_proposal?: number | null
}

export interface CustomerStrategyInput {
  is_existing_customer:      boolean
  customer_since?:           string | null
  account_status?:           string | null
  recent_account_activity?:  string | null
  nurture_trigger?:          string | null
}

export interface SkillStrategyInput {
  available_skills:     SkillSlug[]
  active_skill_versions:Record<string, number>
  skill_status?:        Record<string, string>
  skill_conflicts?:     Record<string, string[]>
  skill_required_inputs?:Record<string, string[]>
}

export interface SystemControlStrategyInput {
  email_generation_engine: string
  global_agent_pause:      boolean
  require_strategy_review: boolean
  require_message_approval:boolean
  email_sending_enabled?:  boolean
  campaign_sending_enabled?:boolean
}

export interface StrategyInput {
  lead:          LeadStrategyInput
  company?:      CompanyStrategyInput | null
  statement?:    StatementStrategyInput | null
  campaign?:     CampaignStrategyInput | null
  partner?:      PartnerStrategyInput | null
  event?:        EventStrategyInput | null
  proposal?:     ProposalStrategyInput | null
  customer?:     CustomerStrategyInput | null
  skills?:       SkillStrategyInput | null
  systemControls:SystemControlStrategyInput
}

// ---- Normalized input ----
// Produced by the normalizer; every optional field is resolved to a concrete value.

export interface NormalizedStrategyInput {
  lead: Required<LeadStrategyInput> & {
    lead_source_normalized: string
    days_since_last_contact: number | null
  }
  company:       Required<CompanyStrategyInput>
  statement:     Required<StatementStrategyInput>
  campaign:      Required<CampaignStrategyInput>
  partner:       Required<PartnerStrategyInput>
  event:         Required<EventStrategyInput> & { days_since_event: number | null }
  proposal:      Required<ProposalStrategyInput> & { days_since_proposal: number | null }
  customer:      Required<CustomerStrategyInput>
  skills:        SkillStrategyInput
  systemControls:SystemControlStrategyInput
  warnings:      StrategyWarning[]
}

// ---- MessageStrategy (the stored object) ----

export interface MessageStrategy {
  id:                   string
  tenant_id:            string
  lead_id:              string
  company_id:           string | null
  campaign_id:          string | null
  agent_run_id:         string | null
  created_by:           'agent' | 'human'
  status:               StrategyStatus

  message_type:         MessageType
  primary_goal:         string
  secondary_goal:       string | null
  sequence_position:    number
  days_since_last_contact: number | null

  lead_source:          string
  lead_stage:           string
  lead_score:           number | null
  lead_urgency_score:   number | null
  industry_segment:     string | null
  processing_volume_tier:string | null
  has_statement_artifact:boolean
  prior_touch_count:    number
  last_engagement_signal:string | null
  partner_membership:   PartnerMembership | null

  audience_context:     string
  pain_point_hypothesis:string
  offer_angle:          OfferAngle
  trust_angle:          string
  proof_point:          string | null
  cta:                  string
  tone:                 Tone
  length_target:        LengthTarget
  personalization_level:PersonalizationLevel

  compliance_notes:     string[]
  required_inclusions:  string[]
  avoid:                string[]

  selected_skills:      SelectedSkill[]
  skill_reasoning:      SkillReasoning[]

  confidence_score:     number
  reasoning:            string
  alternative_angles:   AlternativeAngle[]
  requires_human_review:boolean

  override_log:         StrategyOverrideLogEntry[]
  invalid_reasons:      StrategyError[]

  created_at:           string
  updated_at:           string
}

// ---- Result type ----

export type StrategyResult =
  | { success: true;  strategy: MessageStrategy; warnings: StrategyWarning[]; agent_run_id: string }
  | { success: false; errors: StrategyError[];    warnings: StrategyWarning[]; strategy: Partial<MessageStrategy> | null; agent_run_id: string | null }

// ---- Override request ----

export interface StrategyOverrideRequest {
  strategy_id:          string
  overriding_user_id:   string
  override_reason:      string
  // all editable fields — omit to leave unchanged
  message_type?:        MessageType
  primary_goal?:        string
  secondary_goal?:      string | null
  audience_context?:    string
  pain_point_hypothesis?:string
  offer_angle?:         OfferAngle
  trust_angle?:         string
  proof_point?:         string | null
  cta?:                 string
  tone?:                Tone
  length_target?:       LengthTarget
  personalization_level?:PersonalizationLevel
  selected_skills?:     SelectedSkill[]
  required_inclusions?: string[]
  avoid?:               string[]
}

// ---- Decision tree result (internal) ----

export interface DecisionTreeResult {
  message_type:      MessageType
  reason:            string
  alternative_angles:AlternativeAngle[]
  warnings:          StrategyWarning[]
}

// ---- Skill selection result (internal) ----

export interface SkillSelectionResult {
  selected_skills: SelectedSkill[]
  skill_reasoning: SkillReasoning[]
  errors:          StrategyError[]
}
