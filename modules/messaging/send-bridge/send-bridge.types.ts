// ============================================================
// Phase 3B — Send / Email Draft Bridge Types
// All types, constants, and interfaces for the Send Bridge.
// Uses `as const` throughout — no TypeScript enum keyword.
// ============================================================

export const SEB_ERROR_CODES = {
  VERSION_NOT_APPROVED:    'SEB_001',
  VERSION_REJECTED:        'SEB_002',
  VERSION_SUPERSEDED:      'SEB_003',
  CONTACT_NOT_LINKED:      'SEB_004',
  CONTACT_EMAIL_MISSING:   'SEB_005',
  CONTACT_DO_NOT_CONTACT:  'SEB_006',
  EMAIL_SUPPRESSED:        'SEB_007',
  STRATEGY_NOT_ACTIVE:     'SEB_008',
  VERSION_CONTENT_MISSING: 'SEB_009',
  BODY_HTML_POPULATED:     'SEB_010',
  DUPLICATE_DRAFT:         'SEB_011',
  SENDER_IDENTITY_MISSING: 'SEB_012',
  TENANT_MISMATCH:         'SEB_013',
  PERMISSION_DENIED:       'SEB_014',
} as const

export type SebErrorCode = typeof SEB_ERROR_CODES[keyof typeof SEB_ERROR_CODES]

export const VALID_SEB_ERROR_CODES = new Set(Object.values(SEB_ERROR_CODES))

export const SEB_ACTION_TYPES = {
  SEB_ACTION_DRAFT_CREATED:          'SEB_ACTION_DRAFT_CREATED',
  SEB_ACTION_DRAFT_CREATION_BLOCKED: 'SEB_ACTION_DRAFT_CREATION_BLOCKED',
} as const

export type SebActionType = typeof SEB_ACTION_TYPES[keyof typeof SEB_ACTION_TYPES]

// ---- Input interfaces loaded from DB before validation ----

export interface SendBridgeVersion {
  id:              string
  tenant_id:       string
  strategy_id:     string
  version_label:   string
  subject_line:    string | null
  body_text:       string | null
  body_html:       string | null
  approval_status: string
  reviewed_by:     string | null
  reviewed_at:     string | null
}

export interface SendBridgeStrategy {
  id:           string
  tenant_id:    string
  lead_id:      string
  message_type: string
  status:       string
}

export interface SendBridgeQualityReview {
  id:              string
  composite_score: number
  score_band:      string
  is_recommended:  boolean
  risk_flags:      Array<{ code: string; severity: string; message: string }>
}

export interface SendBridgeLead {
  id:         string
  tenant_id:  string
  contact_id: string | null
  company_id: string | null
}

export interface SendBridgeContact {
  id:             string
  email:          string | null
  first_name:     string | null
  last_name:      string | null
  do_not_contact: boolean
}

export interface SendBridgeSenderIdentity {
  id:    string
  name:  string
  email: string
}

// Draft lookup result for duplicate guard
export interface ExistingDraftCheck {
  id:     string
  status: string
}

// ---- Result interfaces ----

export interface DraftCreationEligibilityResult {
  allowed:      boolean
  error:        SebErrorCode | null
  errorMessage: string | null
}

export interface SendBridgeResult {
  ok:            boolean
  draftId?:      string
  error?:        SebErrorCode
  errorMessage?: string
}

export interface CreateDraftInput {
  versionId:   string
  strategyId:  string
  leadId:      string
  userId:      string
  tenantId:    string
  workspaceId: string
}

export interface DraftStatusResult {
  draftId: string
  status:  string
}

// ---- Audit event payload ----

export interface SebEventPayload {
  action_type:           SebActionType
  draft_id?:             string
  message_version_id:    string
  strategy_id:           string
  quality_review_id?:    string | null
  lead_id:               string
  contact_id?:           string | null
  user_id:               string
  superseded_draft_ids?: string[]
  error_code?:           SebErrorCode
  error_reason?:         string
  timestamp:             string
}
