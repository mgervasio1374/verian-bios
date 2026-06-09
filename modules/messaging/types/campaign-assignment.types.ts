// ---- Assignment status ----

export const ASSIGNMENT_STATUS = {
  PROPOSED:  'proposed',
  ASSIGNED:  'assigned',
  PAUSED:    'paused',
  COMPLETED: 'completed',
  RETIRED:   'retired',
  REJECTED:  'rejected',
} as const
export type AssignmentStatus = typeof ASSIGNMENT_STATUS[keyof typeof ASSIGNMENT_STATUS]

// ---- Assignment source ----

export const ASSIGNMENT_SOURCE = {
  MANUAL:          'manual',
  IMPORT:          'import',
  AGENT_SUGGESTED: 'agent_suggested',
  AGENT_ASSISTED:  'agent_assisted',
  SYSTEM_RULE:     'system_rule',
} as const
export type AssignmentSource = typeof ASSIGNMENT_SOURCE[keyof typeof ASSIGNMENT_SOURCE]

// ---- Valid campaign types for assignment ----

export const VALID_CAMPAIGN_TYPES_FOR_ASSIGNMENT = new Set([
  'initial_contact',
  'statement_follow_up',
  'proposal_follow_up',
  'savings_opportunity',
  'check_in',
  'reactivation',
  'close_push',
  'post_analysis_follow_up',
])

// ---- Domain type ----

export interface CampaignAssignment {
  id:                    string
  tenant_id:             string
  workspace_id:          string
  lead_id:               string | null
  contact_id:            string | null
  campaign_asset_id:     string | null
  campaign_sequence_id:  string | null
  campaign_type:         string
  assignment_status:     AssignmentStatus
  assignment_source:     AssignmentSource
  assigned_by_user_id:   string | null
  assigned_by_agent_name: string | null
  assignment_reason:     string | null
  confidence:            number | null
  eligibility_snapshot:  Record<string, unknown>
  created_at:            string
  updated_at:            string
  retired_at:            string | null
}

// ---- Insert payload ----

export interface InsertCampaignAssignment {
  tenant_id:             string
  workspace_id:          string
  lead_id?:              string | null
  contact_id?:           string | null
  campaign_asset_id?:    string | null
  campaign_sequence_id?: string | null
  campaign_type:         string
  assignment_status:     AssignmentStatus
  assignment_source:     AssignmentSource
  assigned_by_user_id?:  string | null
  assigned_by_agent_name?: string | null
  assignment_reason?:    string | null
  confidence?:           number | null
  eligibility_snapshot:  Record<string, unknown>
}

// ---- Update patch ----

export interface UpdateAssignmentStatusPatch {
  assignment_status:    AssignmentStatus
  assigned_by_user_id?: string | null
  retired_at?:          string | null
}

// ---- Service input/result types ----

export interface CreateAssignmentInput {
  tenantId:              string
  workspaceId:           string
  leadId?:               string
  contactId?:            string
  campaignAssetId?:      string
  campaignSequenceId?:   string
  campaignType:          string
  assignmentSource:      AssignmentSource
  assignedByUserId?:     string
  assignedByAgentName?:  string
  assignmentReason?:     string
  confidence?:           number
}

export type CreateAssignmentResult =
  | { ok: true;  assignmentId: string }
  | { ok: false; reason: string; existingAssignmentId?: string }
