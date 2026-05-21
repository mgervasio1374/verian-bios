// ============================================================
// Phase 3B — Human Review / Approval Bridge Types
// All interfaces, error codes, action types, rejection reasons.
// No TypeScript enum keyword — uses as const throughout.
// No business logic — types and constants only.
// ============================================================

// ---- Error codes ----

export const HRB_ERROR_CODES = {
  VERSION_NOT_FOUND:          'HRB_001',
  TENANT_MISMATCH:            'HRB_002',
  STRATEGY_NOT_FOUND:         'HRB_003',
  STRATEGY_SUPERSEDED:        'HRB_004',
  STRATEGY_INVALID:           'HRB_005',
  VERSION_SUPERSEDED:         'HRB_006',
  VERSION_REJECTED:           'HRB_007',
  VERSION_ALREADY_APPROVED:   'HRB_008',
  QUALITY_REVIEW_MISSING:     'HRB_009',
  CRITICAL_RISK_PRESENT:      'HRB_010',
  HIGH_RISK_NOT_ACKNOWLEDGED: 'HRB_011',
  VERSION_CONTENT_MISSING:    'HRB_012',
  BODY_HTML_POPULATED:        'HRB_013',
  PERMISSION_DENIED:          'HRB_014',
  AGENT_PAUSED:               'HRB_015',
  LOW_SCORE_NO_OVERRIDE:      'HRB_016',
  NO_ACTIVE_STRATEGY:         'HRB_017',
  EXISTING_APPROVED_VERSION:  'HRB_018',
} as const

export type HrbErrorCode = typeof HRB_ERROR_CODES[keyof typeof HRB_ERROR_CODES]

// ---- Action types ----

export const HRB_ACTION_TYPES = {
  HRB_ACTION_SELECTED:               'HRB_ACTION_SELECTED',
  HRB_ACTION_DESELECTED:             'HRB_ACTION_DESELECTED',
  HRB_ACTION_REJECTED:               'HRB_ACTION_REJECTED',
  HRB_ACTION_APPROVED:               'HRB_ACTION_APPROVED',
  HRB_ACTION_REGENERATION_REQUESTED: 'HRB_ACTION_REGENERATION_REQUESTED',
  HRB_ACTION_RETURNED_TO_STRATEGY:   'HRB_ACTION_RETURNED_TO_STRATEGY',
} as const

export type HrbActionType = typeof HRB_ACTION_TYPES[keyof typeof HRB_ACTION_TYPES]

// ---- Rejection reasons ----

export const REJECTION_REASONS = {
  WRONG_TONE:         'wrong_tone',
  WEAK_CTA:           'weak_cta',
  TOO_GENERIC:        'too_generic',
  TOO_LONG:           'too_long',
  TOO_SHORT:          'too_short',
  INACCURATE:         'inaccurate',
  COMPLIANCE_CONCERN: 'compliance_concern',
  LOW_QUALITY:        'low_quality',
  NOT_RELEVANT:       'not_relevant',
  DUPLICATE_ANGLE:    'duplicate_angle',
  STRATEGIC_MISMATCH: 'strategic_mismatch',
  OTHER:              'other',
} as const

export type RejectionReason = typeof REJECTION_REASONS[keyof typeof REJECTION_REASONS]

// Set of valid rejection reason values for runtime validation
export const VALID_REJECTION_REASONS: ReadonlySet<string> = new Set(
  Object.values(REJECTION_REASONS)
)

// ---- Core interfaces ----

// Minimal strategy shape for bridge validation
export interface HumanReviewStrategy {
  id:                   string
  tenant_id:            string
  lead_id:              string
  message_type:         string
  status:               string   // 'draft' | 'approved' | 'in_use' | 'superseded' | 'error'
  invalid_reasons:      string[]
  requires_human_review:boolean
}

// Minimal version shape for bridge validation
export interface HumanReviewVersion {
  id:               string
  tenant_id:        string
  strategy_id:      string
  version_label:    string
  subject_line:     string | null
  body_text:        string | null
  body_html:        string | null
  approval_status:  string   // 'pending' | 'selected' | 'rejected' | 'approved' | 'superseded'
  reviewed_by:      string | null
  reviewed_at:      string | null
  rejection_reason: string | null
}

// Minimal QRA shape for bridge gating
export interface HumanReviewQualityReview {
  id:             string
  tenant_id:      string
  version_id:     string
  strategy_id:    string
  composite_score:number
  score_band:     string
  is_recommended: boolean
  risk_flags:     Array<{ code: string; severity: string; message: string }>
  superseded_at:  string | null
}

// Reviewer context
export interface HumanReviewer {
  user_id:   string
  tenant_id: string
}

// System control state relevant to bridge
export interface HumanReviewSystemControls {
  global_agent_pause: boolean
}

// Result type for eligibility check
export interface ApprovalEligibilityResult {
  allowed:      boolean
  error:        HrbErrorCode | null
  errorMessage: string | null
}

// Return type from bridge actions
export interface HumanReviewResult {
  success:      boolean
  versionId?:   string
  newStatus?:   string
  error?:       HrbErrorCode
  errorMessage?:string
}

// Input to selectVersion
export interface SelectVersionInput {
  versionId:    string
  strategyId:   string
  userId:       string
  tenantId:     string
  selectReason?:string
}

// Input to rejectVersion
export interface RejectVersionInput {
  versionId:      string
  strategyId:     string
  userId:         string
  tenantId:       string
  rejectionReason:string
  reviewerNote?:  string
}

// Input to approveVersionForNextStep
export interface ApproveVersionInput {
  versionId:       string
  strategyId:      string
  userId:          string
  tenantId:        string
  overrideReason?: string
  riskAcknowledged?:boolean
}

// Input to requestVersionRegeneration
export interface RegenerationRequestInput {
  strategyId:       string
  leadId:           string
  userId:           string
  tenantId:         string
  regenerationNote?:string
}

// Audit event payload (written to activity_events.metadata)
export interface HumanReviewEventPayload {
  action_type:                 HrbActionType
  version_id?:                 string
  strategy_id:                 string
  previous_status?:            string
  new_status?:                 string
  user_id:                     string
  rejection_reason?:           string
  reviewer_note?:              string
  override_reason?:            string
  risk_acknowledged?:          boolean
  composite_score_at_action?:  number
  score_band_at_action?:       string
  is_recommended_at_action?:   boolean
  risk_flags_at_action?:       Array<{ code: string; severity: string; message: string }>
  prior_selected_version_id?:  string
  new_selected_version_id?:    string
  regeneration_note?:          string
  timestamp:                   string
}
