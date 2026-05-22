// ============================================================
// Phase 3B — Learning Agent Types
// All constants and interfaces for the Learning Agent.
// No I/O, no side effects. as const throughout — no enum.
// ============================================================

// ---- Signal name constants ----

export const LA_SIGNAL_NAMES = {
  SEND_SUCCESS_RATE:     'send_success_rate',
  SEND_FAILURE_RATE:     'send_failure_rate',
  DELIVERY_RATE:         'delivery_rate',
  BOUNCE_RATE:           'bounce_rate',
  COMPLAINT_RATE:        'complaint_rate',
  DELIVERY_FAILURE_RATE: 'delivery_failure_rate',
  OPEN_RATE:             'open_rate',
  CLICK_RATE:            'click_rate',
  APPROVAL_TO_SEND_RATE: 'approval_to_send_rate',
  UNKNOWN_OUTCOME_RATE:  'unknown_outcome_rate',
} as const
export type LaSignalName = typeof LA_SIGNAL_NAMES[keyof typeof LA_SIGNAL_NAMES]

// ---- Dimension constants ----

export const LA_DIMENSIONS = {
  TENANT_WIDE:     'tenant_wide',
  MESSAGE_TYPE:    'message_type',
  STRATEGY_ANGLE:  'strategy_angle',
  SCORE_BAND:      'score_band',
  QRA_RECOMMENDED: 'qra_recommended',
  VERSION_LABEL:   'version_label',
} as const
export type LaDimension = typeof LA_DIMENSIONS[keyof typeof LA_DIMENSIONS]

// ---- Confidence constants ----

export const LA_CONFIDENCE = {
  INSUFFICIENT: 'insufficient',
  LOW:          'low',
  MODERATE:     'moderate',
  HIGH:         'high',
} as const
export type LaConfidence = typeof LA_CONFIDENCE[keyof typeof LA_CONFIDENCE]

// ---- Action type constants ----

export const LA_ACTION_TYPES = {
  LA_SIGNALS_COMPUTED:           'LA_SIGNALS_COMPUTED',
  LA_SIGNALS_COMPUTATION_FAILED: 'LA_SIGNALS_COMPUTATION_FAILED',
} as const
export type LaActionType = typeof LA_ACTION_TYPES[keyof typeof LA_ACTION_TYPES]

// ---- Lookback window ----

export const LEARNING_AGENT_LOOKBACK_DAYS = 90

// ---- Confidence thresholds ----

export const STANDARD_THRESHOLDS = {
  insufficient: 5,
  low:          20,
  moderate:     50,
} as const

export const ENGAGEMENT_THRESHOLDS = {
  insufficient: 10,
  low:          30,
  moderate:     100,
} as const

// ---- Core interfaces ----

// One computed signal — maps to one learning_snapshots row
export interface LearningSignal {
  signalName:     LaSignalName
  dimension:      LaDimension
  dimensionValue: string
  numerator:      number
  denominator:    number
  rate:           number | null
  sampleN:        number
  confidence:     LaConfidence
  advisory:       true
  notes:          string | null
}

// Event record built from activity_events rows — used as input to pure signal functions
export interface Phase3bEventRecord {
  entityId:        string          // message_version_id (from activity_events.entity_id)
  eventType:       string          // e.g. 'ET_SEND_INITIATED', 'ET_EMAIL_DELIVERED'
  strategyId:      string | null
  qualityReviewId: string | null
  versionLabel:    string | null
  compositeScore:  number | null
  occurredAt:      string
}

// Dimension context loaded from message_versions + quality_reviews
export interface VersionDimensionContext {
  versionId:     string
  strategyAngle: string | null
  messageType:   string | null
  scoreBand:     string | null
  isRecommended: boolean | null
}

// Input to runLearningAnalysis
export interface LearningAnalysisInput {
  tenantId:     string
  workspaceId:  string
  triggeredBy:  string
  lookbackDays: number
}

// Result from runLearningAnalysis
export interface LearningAnalysisResult {
  ok:             boolean
  runId?:         string
  snapshotCount?: number
  totalSends?:    number
  errorReason?:   string
}

// Payload for LA_SIGNALS_COMPUTED activity event
export interface LaSignalsComputedPayload {
  action_type:      'LA_SIGNALS_COMPUTED'
  run_id:           string
  tenant_id:        string
  signals_computed: number
  total_sends:      number
  lookback_days:    number
  window_start:     string
  window_end:       string
  triggered_by:     string
  computed_at:      string
}

// Payload for LA_SIGNALS_COMPUTATION_FAILED activity event
export interface LaSignalsFailedPayload {
  action_type:  'LA_SIGNALS_COMPUTATION_FAILED'
  run_id:       string
  tenant_id:    string
  error_reason: string
  triggered_by: string
  timestamp:    string
}

// Row shape written to / read from learning_snapshots
export interface LearningSnapshotRow {
  id:              string
  tenant_id:       string
  workspace_id:    string | null
  run_id:          string
  signal_name:     string
  dimension:       string
  dimension_value: string
  numerator:       number
  denominator:     number
  rate:            number | null
  sample_n:        number
  confidence:      string
  lookback_days:   number
  window_start:    string
  window_end:      string
  advisory:        boolean
  computed_at:     string
  notes:           string | null
  deleted_at:      string | null
}
