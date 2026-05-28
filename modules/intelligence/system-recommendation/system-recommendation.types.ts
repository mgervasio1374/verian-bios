export const REC_THRESHOLD = {
  ERROR_COUNT_MIN:        3,
  OUTBOX_QUEUE_DEPTH_MIN: 10,
} as const

// Phase 3I recommendation types
export const REC_TYPE_3I = {
  AI_BUDGET_EXHAUSTED:                  'AI_BUDGET_EXHAUSTED',
  AI_COST_SPIKE_DETECTED:               'AI_COST_SPIKE_DETECTED',
  CAMPAIGN_ASSET_REVISION_RECOMMENDED:  'CAMPAIGN_ASSET_REVISION_RECOMMENDED',
  AGENT_OVERRIDE_PATTERN:               'AGENT_OVERRIDE_PATTERN',
} as const

export interface RecCheckResult {
  recommendationType: string
  title:              string
  body:               string
  severity:           string
  priority:           string
}

export interface SystemRecGeneratorResult {
  created:            number
  skippedDedup:       number
  skippedNoCondition: number
}
