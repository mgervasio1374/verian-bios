// ============================================================
// Phase 3B — Copywriting Agent Types
// All interfaces, constants, and type aliases for the
// Copywriting Agent. No imports from other copywriting modules.
// Everything else imports from this file.
// ============================================================

import type { MessageStrategy, SelectedSkill } from '@/modules/messaging/strategy/message-strategy.types'

// ---- COPY error codes ----

export const COPY_ERROR_CODES = {
  COPY_001: 'COPY_001',  // Strategy not found
  COPY_002: 'COPY_002',  // Strategy has blocking invalid_reasons
  COPY_003: 'COPY_003',  // Confidence score below threshold
  COPY_004: 'COPY_004',  // Strategy requires review and not approved
  COPY_005: 'COPY_005',  // Compliance skill missing
  COPY_006: 'COPY_006',  // Selected skill definition unavailable
  COPY_007: 'COPY_007',  // Strategy is superseded
  COPY_008: 'COPY_008',  // Global agent pause
  COPY_009: 'COPY_009',  // Phase 3B not enabled
  COPY_010: 'COPY_010',  // Message type unsupported
  COPY_011: 'COPY_011',  // Required strategy fields missing
  COPY_012: 'COPY_012',  // Statement review requires review_summary
  COPY_013: 'COPY_013',  // Partner copy requires confirmed membership
  COPY_014: 'COPY_014',  // Selected skills conflict
  COPY_015: 'COPY_015',  // Generated subject line violates compliance (per-version, retry eligible)
  COPY_016: 'COPY_016',  // Generated body copy violates compliance (per-version, retry eligible)
  COPY_017: 'COPY_017',  // Company name missing for cold outreach
  COPY_018: 'COPY_018',  // Required version count not met / differentiation failed
  COPY_019: 'COPY_019',  // Banned phrase detected (per-version, retry eligible)
  COPY_020: 'COPY_020',  // Invented fact detected (per-version, retry eligible)
} as const
export type CopyErrorCode = typeof COPY_ERROR_CODES[keyof typeof COPY_ERROR_CODES]

// ---- COPY warning codes ----

export const COPY_WARNING_CODES = {
  COPY_WARN_001: 'COPY_WARN_001',  // Body length exceeds target bounds
  COPY_WARN_002: 'COPY_WARN_002',  // Prior message context absent for follow-up
} as const
export type CopyWarningCode = typeof COPY_WARNING_CODES[keyof typeof COPY_WARNING_CODES]

// ---- Approval statuses ----

export const APPROVAL_STATUSES = {
  PENDING:    'pending',
  SELECTED:   'selected',
  REJECTED:   'rejected',
  APPROVED:   'approved',
  SUPERSEDED: 'superseded',
} as const
export type ApprovalStatus = typeof APPROVAL_STATUSES[keyof typeof APPROVAL_STATUSES]

// ---- Version labels ----

export const VERSION_LABELS = {
  INDUSTRY_QUESTION:          'Industry Question',
  STATEMENT_CLARITY:          'Statement Clarity',
  TRUST_BUILDER:              'Trust-Builder',
  DIRECT_EXECUTIVE_BREVITY:   'Direct Executive Brevity',
  WARM_ACKNOWLEDGMENT:        'Warm Acknowledgment',
  DIRECT_NEXT_STEP:           'Direct Next Step',
  ADVISOR_FIRST:              'Advisor-First',
  PROFESSIONAL_CONFIRMATION:  'Professional Confirmation',
  WARM_REASSURANCE:           'Warm Reassurance',
  FINDINGS_FIRST:             'Findings First',
  ADVISOR_EXPLANATION:        'Advisor Explanation',
  PROPOSAL_ORIENTED:          'Proposal-Oriented Next Step',
  REDUCED_FRICTION:           'Reduced Friction',
  CLARIFY_VALUE:              'Clarify Value',
  SIMPLE_QUESTION:            'Simple Question',
  DIRECT_QUESTION:            'Direct Question',
  WHY_IT_MATTERS:             'Why It Matters',
  GRACEFUL_EXIT:              'Graceful Exit',
  EXIT_CTA:                   'Exit CTA',
  DECISION_STATUS_QUESTION:   'Decision/Status Question',
  CLARIFY_OBJECTION:          'Clarify-Objection Invitation',
  DIFFERENT_ANGLE:            'Different Angle',
  QUESTION_ONLY:              'Question Only',
  BRIEF_REFRAME:              'Brief Reframe',
  TIME_GAP_ACKNOWLEDGMENT:    'Time-Gap Acknowledgment',
  FRESH_REASON:               'Fresh Reason',
  PARTNER_CONTEXT:            'Partner Context',
  HOME_SERVICES_ANGLE:        'Home Services / Operational Angle',
  STATEMENT_REVIEW_CLARITY:   'Statement Review Clarity',
  EVENT_CONVERSATION:         'Event Conversation',
  FOLLOW_UP_ON_TOPIC:         'Follow-Up on Topic',
  DIRECT_ASK_EVENT:           'Direct Next Step',
  EVENT_REFERENCE:            'Event Reference',
  DIRECT_ASK:                 'Direct Ask',
  GRATITUDE_FIRST:            'Gratitude First',
  SPECIFIC_REFERRAL_ASK:      'Specific Referral-Fit Ask',
  ACCOUNT_REVIEW_OFFER:       'Account Review Offer',
  RELATIONSHIP_MAINTENANCE:   'Relationship Maintenance',
  SEASONAL_CHECK_IN:          'Seasonal/Operational Check-In',
} as const
export type VersionLabel = typeof VERSION_LABELS[keyof typeof VERSION_LABELS]

// ---- Strategy angles (machine-readable) ----

export const STRATEGY_ANGLES = {
  INDUSTRY_SPECIFIC_QUESTION:      'industry_specific_question',
  STATEMENT_REVIEW_OFFER:          'statement_review_offer',
  SKEPTICISM_AWARE_ADVISOR:        'skepticism_aware_advisor',
  ULTRA_DIRECT:                    'ultra_direct',
  WARM_INQUIRY_RESPONSE:           'warm_inquiry_response',
  ADVANCE_NEXT_STEP:               'advance_next_step',
  ADVISOR_EDUCATION:               'advisor_education',
  PROFESSIONAL_CONFIRMATION:       'professional_confirmation',
  WARM_REASSURANCE:                'warm_reassurance',
  FINDINGS_FIRST:                  'findings_first',
  ADVISOR_EXPLANATION:             'advisor_explanation',
  PROPOSAL_NEXT_STEP:              'proposal_next_step',
  REDUCED_FRICTION:                'reduced_friction',
  CLARIFY_VALUE:                   'clarify_value',
  SIMPLE_DIRECT_QUESTION:          'simple_direct_question',
  DIRECT_SEQUENCE_QUESTION:        'direct_sequence_question',
  WHY_IT_MATTERS:                  'why_it_matters',
  GRACEFUL_SEQUENCE_EXIT:          'graceful_sequence_exit',
  EXIT_CTA:                        'exit_cta',
  DECISION_STATUS:                 'decision_status',
  CLARIFY_OBJECTION:               'clarify_objection',
  CHANGED_ANGLE:                   'changed_angle',
  MINIMAL_QUESTION:                'minimal_question',
  BRIEF_REFRAME:                   'brief_reframe',
  TIME_GAP_ACKNOWLEDGMENT:         'time_gap_acknowledgment',
  FRESH_RECONNECT_REASON:          'fresh_reconnect_reason',
  PARTNER_SHARED_CONTEXT:          'partner_shared_context',
  HOME_SERVICES_OPERATIONAL:       'home_services_operational',
  STATEMENT_CLARITY_PARTNER:       'statement_clarity_partner',
  EVENT_CONVERSATION_REFERENCE:    'event_conversation_reference',
  EVENT_TOPIC_FOLLOWUP:            'event_topic_followup',
  EVENT_DIRECT_ASK:                'event_direct_ask',
  EVENT_REFERENCE_ONLY:            'event_reference_only',
  GRATITUDE_FIRST:                 'gratitude_first',
  SPECIFIC_REFERRAL_ASK:           'specific_referral_ask',
  ACCOUNT_REVIEW_OFFER:            'account_review_offer',
  RELATIONSHIP_MAINTENANCE:        'relationship_maintenance',
  SEASONAL_OPERATIONAL:            'seasonal_operational',
} as const
export type StrategyAngle = typeof STRATEGY_ANGLES[keyof typeof STRATEGY_ANGLES]

// ---- Copywriting agent step names ----

export const COPY_AGENT_STEPS = {
  LOAD_STRATEGY:              'load_strategy',
  GATE_CHECK:                 'gate_check',
  LOAD_SELECTED_SKILLS:       'load_selected_skills',
  BUILD_VERSION_PLAN:         'build_version_plan',
  GENERATE_CANDIDATE_VERSIONS:'generate_candidate_versions',
  COMPLIANCE_VALIDATION:      'compliance_validation',
  STRUCTURAL_VALIDATION:      'structural_validation',
  REPAIR_RETRY:               'repair_retry',
  DIFFERENTIATION_VALIDATION: 'differentiation_validation',
  PERSISTENCE:                'persistence',
  RESULT_RETURNED:            'result_returned',
} as const

// ---- Differentiation dimensions ----

export const DIFF_DIMENSIONS = {
  OPENING_PREMISE:  'opening_premise',
  PRIMARY_ANGLE:    'primary_angle',
  TRUST_ANGLE:      'trust_angle',
  CTA_FRAMING:      'cta_framing',
  LENGTH:           'length',
  SPECIFICITY:      'specificity_level',
  STRUCTURE:        'structure',
  EVIDENCE:         'evidence_used',
} as const
export type DiffDimension = typeof DIFF_DIMENSIONS[keyof typeof DIFF_DIMENSIONS]

// ---- Skill categories ----

export const SKILL_CATEGORIES = {
  CONTEXT:    'context',
  AUDIENCE:   'audience',
  POSITIONING:'positioning',
  TONE:       'tone',
  COMPLIANCE: 'compliance',
} as const
export type SkillCategory = typeof SKILL_CATEGORIES[keyof typeof SKILL_CATEGORIES]

// ---- Banned phrases (global) ----

export const GLOBAL_BANNED_PHRASES: readonly string[] = [
  'I hope this email finds you well',
  'Just checking in',
  'I wanted to reach out',
  'Touching base',
  'Circling back',
  'Following up on my previous email',
  'I came across your business',
  'I stumbled upon your company',
  'We can save you money',
  'Guaranteed savings',
  'Best rates',
  'Lowest rates',
  'No-brainer',
  'Game changer',
] as const

// ---- Length target word ranges ----

export const LENGTH_WORD_RANGES = {
  ultra_short: { minWords: 25,  maxWords: 60,  minSentences: 1, maxSentences: 3 },
  short:       { minWords: 75,  maxWords: 140, minSentences: 4, maxSentences: 6 },
  medium:      { minWords: 150, maxWords: 250, minSentences: 7, maxSentences: 10 },
  long:        { minWords: 250, maxWords: 999, minSentences: 11, maxSentences: 99 },
} as const

// ============================================================
// Interfaces
// ============================================================

// ---- Inputs ----

export interface CopywritingSystemControls {
  emailGenerationEngine:  string
  globalAgentPause:       boolean
  requireMessageApproval: boolean
  requireStrategyReview:  boolean
}

export interface CopywritingLeadContext {
  leadId:                  string
  tenantId:                string
  contactName:             string | null
  companyName:             string | null
  businessType:            string | null
  city:                    string | null
  state:                   string | null
  website:                 string | null
  sizeProxy:               string | null
  knownPaymentContext:     string | null
  currentProcessor:        string | null
  estimatedMonthlyVolume:  string | null
  industrySegment:         string | null
  // Event context — populated for event_expo_follow_up strategies.
  // eventName: sourced from strategy.audience_context or null.
  // conversationNotes: sourced from strategy.proof_point (the key finding/note) or null.
  eventName:               string | null
  conversationNotes:       string | null
}

export interface PriorMessageContext {
  priorSentSubjectLines:  string[]
  priorBodySummaries:     string[]
  priorCtaUsed:           string | null
  priorStrategyAngle:     string | null
  priorEngagementSignal:  string | null
  sequencePosition:       number
}

export interface CopywritingSkillDefinition {
  skillSlug:        string
  skillVersion:     number
  category:         SkillCategory
  toneRules:        string
  messagingRules:   string
  requiredElements: string[]
  forbiddenElements:string[]
  ctaGuidance:      string
  complianceNotes:  string
  examples:         string[]
  antiPatterns:     string[]
}

export interface CopywritingInput {
  strategyId:          string
  tenantId:            string
  forceRegenerate?:    boolean
  requestedBy?:        string
}

// Re-export MessageStrategy as the strategy input type
export type CopywritingStrategyInput = MessageStrategy

// ---- Differentiation profile ----

export interface DifferentiationProfile {
  openingPremise:  string   // 'question' | 'observation' | 'acknowledgment' | 'statement' | 'offer'
  primaryAngle:    string
  trustAngle:      string   // 'industry_familiarity' | 'transparency' | 'skepticism_aware' | 'case_reference' | 'direct'
  ctaFraming:      string   // 'soft_ask' | 'direct_question' | 'specific_offer' | 'exit_offer' | 'binary_question'
  length:          string   // 'ultra_short' | 'short' | 'medium'
  specificity:     string   // from personalization_level
  structure:       string   // 'question_led' | 'observation_led' | 'offer_led' | 'problem_led' | 'acknowledgment_led'
  evidence:        string   // 'none' | 'proof_point' | 'specific_finding' | 'calculated_amount'
}

// ---- Version planning ----

export interface VersionAngle {
  versionNumber:        number
  versionLabel:         string
  strategyAngle:        string
  subjectLineIntent:    string
  bodyIntent:           string
  ctaFraming:           string
  differentiationProfile: Partial<DifferentiationProfile>
  requiredDimensions:   string[]
  lengthOverride?:      string
  personalizationNote?: string
}

export interface VersionPlan {
  messageType:          string
  sequencePosition:     number
  requiredVersionCount: number
  angles:               VersionAngle[]
}

// ---- Version drafts and results ----

export interface MessageVersionDraft {
  versionNumber:               number
  versionLabel:                string
  strategyAngle:               string
  subjectLine:                 string
  previewText:                 string
  bodyText:                    string
  bodyHtml:                    null           // always null in v1
  selectedSkills:              SelectedSkill[]
  skillVersions:               Record<string, number>
  complianceNotesApplied:      string[]
  requiredInclusionsSatisfied: Record<string, boolean>
  avoidedElementsChecked:      Record<string, string>
  generationNotes:             string
  copyConstraints:             Record<string, unknown>
  personalizationUsed:         string[]
  personalizationGaps:         string[]
  differentiationProfile:      DifferentiationProfile
  complianceCheckResult?:      ComplianceCheckResult
  structuralCheckResult?:      StructuralCheckResult
  isValid:                     boolean
  repairAttempts:              RepairAttempt[]
}

// ---- Persisted version ----

export interface MessageVersion {
  id:                          string
  tenantId:                    string
  strategyId:                  string
  leadId:                      string
  companyId:                   string | null
  campaignId:                  string | null
  agentRunId:                  string | null
  subjectLine:                 string
  previewText:                 string
  bodyText:                    string
  bodyHtml:                    null
  messageType:                 string
  versionLabel:                string
  versionNumber:               number
  strategyAngle:               string
  selectedSkills:              SelectedSkill[]
  skillVersions:               Record<string, number>
  sourceStrategySnapshot:      Record<string, unknown>
  complianceNotesApplied:      string[]
  requiredInclusionsSatisfied: Record<string, boolean>
  avoidedElementsChecked:      Record<string, string>
  generationNotes:             string | null
  copyConstraints:             Record<string, unknown>
  personalizationUsed:         string[]
  personalizationGaps:         string[]
  approvalStatus:              ApprovalStatus
  reviewedBy:                  string | null
  reviewedAt:                  string | null
  rejectionReason:             string | null
  userEdited:                  boolean
  userEditSummary:             string | null
  finalSubjectLine:            string | null
  finalBodyText:               string | null
  createdByAgent:              string
  createdAt:                   string
  updatedAt:                   string
}

// ---- Validation results ----

export interface ComplianceCheckResult {
  passed:                      boolean
  errors:                      CopyErrorCode[]
  bannedPhrasesFound:          string[]
  unsupportedClaimsFound:      string[]
  avoidListViolations:         string[]
  requiredInclusionsSatisfied: Record<string, boolean>
  contextViolations:           string[]
}

export interface StructuralCheckResult {
  passed:                boolean
  subjectLinePresent:    boolean
  previewTextPresent:    boolean
  bodyTextPresent:       boolean
  bodyHtmlIsNull:        boolean
  ctaCount:              number
  sentenceCount:         number
  estimatedWordCount:    number
  lengthTargetMet:       boolean
  subjectBodyConsistent: boolean
  selectedSkillsRecorded:boolean
  versionLabelPresent:   boolean
  strategyAnglePresent:  boolean
  errors:                CopyErrorCode[]
  warnings:              CopyWarningCode[]
}

export interface DifferentiationCheckResult {
  passed:          boolean
  pairwiseResults: Record<string, { dimensionsDifferent: number; differencesMet: boolean }>
  failingPairs:    string[]
  error?:          CopyErrorCode
}

// ---- Retry ----

export interface RepairAttempt {
  attemptNumber:               number
  versionNumber:               number
  originalFailureCode:         CopyErrorCode
  originalFailureDescription:  string
  outcome:                     'repaired' | 'discarded'
  repairedVersionSatisfied:    boolean
}

// ---- Errors and warnings ----

export interface CopywritingError {
  code:           CopyErrorCode
  severity:       'critical' | 'blocking'
  message:        string
  suggestedFix:   string
  canOverride:    boolean
  blocking:       boolean
  affectedVersionNumber?: number
  affectedAngle?:         string
}

export interface CopywritingWarning {
  code:                  CopyWarningCode
  message:               string
  affectedVersionNumber?: number
}

// ---- Service result ----

export type CopywritingResult =
  | {
      success:           true
      versions:          MessageVersion[]
      warnings:          CopywritingWarning[]
      agentRunId:        string
      generationSummary: string
    }
  | {
      success:          false
      errors:           CopywritingError[]
      warnings:         CopywritingWarning[]
      agentRunId:       string | null
    }

// ---- Version generation result (per-angle) ----

export interface VersionGenerationResult {
  versionNumber:  number
  draft:          MessageVersionDraft | null
  errors:         CopywritingError[]
  repairAttempts: RepairAttempt[]
}

// ---- canGenerate result ----

export interface CanGenerateResult {
  allowed:     boolean
  reason?:     string
  errorCode?:  CopyErrorCode
}
