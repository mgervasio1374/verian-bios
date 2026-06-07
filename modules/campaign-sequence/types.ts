import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']

// ---------------------------------------------------------------------------
// Row / Insert / Update aliases
// ---------------------------------------------------------------------------

export type CampaignTypeRow    = Tables['campaign_types']['Row']
export type CampaignTypeInsert = Tables['campaign_types']['Insert']
export type CampaignTypeUpdate = Tables['campaign_types']['Update']

export type CampaignSequenceRow    = Tables['campaign_sequences']['Row']
export type CampaignSequenceInsert = Tables['campaign_sequences']['Insert']
export type CampaignSequenceUpdate = Tables['campaign_sequences']['Update']

export type CampaignSequenceStepRow    = Tables['campaign_sequence_steps']['Row']
export type CampaignSequenceStepInsert = Tables['campaign_sequence_steps']['Insert']
export type CampaignSequenceStepUpdate = Tables['campaign_sequence_steps']['Update']

export type CampaignScheduleItemRow    = Tables['campaign_schedule_items']['Row']
export type CampaignScheduleItemInsert = Tables['campaign_schedule_items']['Insert']
export type CampaignScheduleItemUpdate = Tables['campaign_schedule_items']['Update']

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

export const CAMPAIGN_TYPE_STATUS = {
  DRAFT:   'draft',
  ACTIVE:  'active',
  RETIRED: 'retired',
} as const

export const CAMPAIGN_SEQUENCE_STATUS = {
  DRAFT:   'draft',
  ACTIVE:  'active',
  RETIRED: 'retired',
} as const

export const CAMPAIGN_SEQUENCE_STEP_STATUS = {
  DRAFT:   'draft',
  ACTIVE:  'active',
  RETIRED: 'retired',
} as const

export const CAMPAIGN_SCHEDULE_ITEM_STATUS = {
  PLANNED:           'planned',
  DRAFT_NEEDED:      'draft_needed',
  DRAFT_READY:       'draft_ready',
  AWAITING_APPROVAL: 'awaiting_approval',
  APPROVED:          'approved',
  SCHEDULED:         'scheduled',
  SENT:              'sent',
  BLOCKED:           'blocked',
  STOPPED_RESPONDED: 'stopped_responded',
  STOPPED_MANUAL:    'stopped_manual',
  SKIPPED:           'skipped',
  FAILED:            'failed',
} as const

export const CAMPAIGN_STOP_CONDITION = {
  RESPONSE_DETECTED: 'response_detected',
  MANUAL_STOP_ONLY:  'manual_stop_only',
} as const

export const CAMPAIGN_RESPONSE_TRIGGER_BEHAVIOR = {
  STOP_FUTURE_TOUCHES: 'stop_future_touches',
  NOTIFY_OPERATOR:     'notify_operator',
  CREATE_TASK:         'create_task',
} as const

// ---------------------------------------------------------------------------
// Union types derived from constants
// ---------------------------------------------------------------------------

export type CampaignTypeStatus =
  (typeof CAMPAIGN_TYPE_STATUS)[keyof typeof CAMPAIGN_TYPE_STATUS]

export type CampaignSequenceStatus =
  (typeof CAMPAIGN_SEQUENCE_STATUS)[keyof typeof CAMPAIGN_SEQUENCE_STATUS]

export type CampaignSequenceStepStatus =
  (typeof CAMPAIGN_SEQUENCE_STEP_STATUS)[keyof typeof CAMPAIGN_SEQUENCE_STEP_STATUS]

export type CampaignScheduleItemStatus =
  (typeof CAMPAIGN_SCHEDULE_ITEM_STATUS)[keyof typeof CAMPAIGN_SCHEDULE_ITEM_STATUS]

export type CampaignStopCondition =
  (typeof CAMPAIGN_STOP_CONDITION)[keyof typeof CAMPAIGN_STOP_CONDITION]

export type CampaignResponseTriggerBehavior =
  (typeof CAMPAIGN_RESPONSE_TRIGGER_BEHAVIOR)[keyof typeof CAMPAIGN_RESPONSE_TRIGGER_BEHAVIOR]

// ---------------------------------------------------------------------------
// Service input interfaces
// ---------------------------------------------------------------------------

export interface CreateCampaignTypeInput {
  name: string
  slug: string
  description?: string | null
  defaultStopCondition?: CampaignStopCondition
  defaultRequiresApproval?: boolean
}

export interface CreateCampaignSequenceInput {
  campaignTypeId: string
  name: string
  description?: string | null
  version?: number
  isDefault?: boolean
  requiresApproval?: boolean
  stopOnResponse?: boolean
  responseTriggerBehavior?: CampaignResponseTriggerBehavior
}

export interface AddCampaignSequenceStepInput {
  stepNumber: number
  touchLabel?: string | null
  dayOffset?: number | null
  recurringIntervalDays?: number | null
  isRecurring?: boolean
  campaignEmailAssetId?: string | null
  channel?: string
  requiresApproval?: boolean
  status?: CampaignSequenceStepStatus
}

export interface ListCampaignTypesOptions {
  tenantId: string
  workspaceId: string
  status?: CampaignTypeStatus
  limit?: number
}

export interface ListCampaignScheduleItemsOptions {
  tenantId: string
  workspaceId: string
  status?: CampaignScheduleItemStatus
  limit?: number
}
