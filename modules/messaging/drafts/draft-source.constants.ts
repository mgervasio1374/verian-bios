export const DRAFT_SOURCE_TYPE = {
  MANUAL:                     'manual',
  RULE_TEMPLATE:              'rule_template',
  MANUAL_CAMPAIGN_TEMPLATE:   'manual_campaign_template',
  AI_STRATEGY_COPYWRITING:    'ai_strategy_copywriting',
  CAMPAIGN_ASSET_RENDER:      'campaign_asset_render',
  AI_CAMPAIGN_ASSET_REVISION: 'ai_campaign_asset_revision',
  FUTURE_CAMPAIGN_STEP:       'future_campaign_step',
  FUTURE_FOLLOW_UP:           'future_follow_up',
} as const

export type DraftSourceType = typeof DRAFT_SOURCE_TYPE[keyof typeof DRAFT_SOURCE_TYPE]

export const DRAFT_SOURCE_BADGE: Record<string, { label: string; colorClass: string }> = {
  [DRAFT_SOURCE_TYPE.MANUAL]:                    { label: 'Manual',            colorClass: 'bg-gray-100 text-gray-700' },
  [DRAFT_SOURCE_TYPE.RULE_TEMPLATE]:             { label: 'Rule Template',     colorClass: 'bg-gray-100 text-gray-700' },
  [DRAFT_SOURCE_TYPE.MANUAL_CAMPAIGN_TEMPLATE]:  { label: 'Manual Campaign',   colorClass: 'bg-gray-100 text-gray-700' },
  [DRAFT_SOURCE_TYPE.AI_STRATEGY_COPYWRITING]:   { label: 'AI Pipeline',       colorClass: 'bg-blue-100 text-blue-700' },
  [DRAFT_SOURCE_TYPE.CAMPAIGN_ASSET_RENDER]:     { label: 'Campaign Asset',    colorClass: 'bg-green-100 text-green-700' },
  [DRAFT_SOURCE_TYPE.AI_CAMPAIGN_ASSET_REVISION]:{ label: 'AI Asset Revision', colorClass: 'bg-blue-100 text-blue-700' },
  [DRAFT_SOURCE_TYPE.FUTURE_FOLLOW_UP]:          { label: 'Follow-Up',         colorClass: 'bg-purple-100 text-purple-700' },
} as const

export const DRAFT_READINESS_REASON = {
  MISSING_RECIPIENT:               'missing_recipient',
  MISSING_SUBJECT:                 'missing_subject',
  MISSING_BODY:                    'missing_body',
  DRAFT_NOT_APPROVED:              'draft_not_approved',
  MISSING_APPROVAL_REQUEST:        'missing_approval_request',
  SOURCE_ASSET_NOT_ACTIVE:         'source_asset_not_active',
  SOURCE_ASSET_RETIRED:            'source_asset_retired',
  MISSING_PERSONALIZATION_FIELDS:  'missing_personalization_fields',
  EMAIL_SENDING_DISABLED:          'email_sending_disabled',
} as const
