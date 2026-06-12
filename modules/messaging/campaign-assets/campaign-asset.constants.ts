export const CAMPAIGN_TYPE = {
  INITIAL_CONTACT:         'initial_contact',
  STATEMENT_FOLLOW_UP:     'statement_follow_up',
  PROPOSAL_FOLLOW_UP:      'proposal_follow_up',
  SAVINGS_OPPORTUNITY:     'savings_opportunity',
  CHECK_IN:                'check_in',
  REACTIVATION:            'reactivation',
  CLOSE_PUSH:              'close_push',
  POST_ANALYSIS_FOLLOW_UP: 'post_analysis_follow_up',
} as const

export const APPROVED_MERGE_FIELDS: Record<string, { fallback: string }> = {
  first_name:          { fallback: 'there' },
  company_name:        { fallback: 'your company' },
  industry:            { fallback: 'your industry' },
  city:                { fallback: '' },
  state:               { fallback: '' },
  estimated_savings:   { fallback: '' },
  service_category:    { fallback: '' },
  sender_name:         { fallback: 'The Verian Team' },
  sender_email:        { fallback: '' },
  cta_text:            { fallback: 'Learn More' },
  cta_url:             { fallback: '' },
  pain_point_tag:      { fallback: '' },
  campaign_type_label: { fallback: '' },
}

export const ASSET_CREATION_ESTIMATED_TOKENS = 3000
