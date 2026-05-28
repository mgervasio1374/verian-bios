// Phase 3C.1 — Structured Errors + System Intelligence Foundation
// Lifecycle constants for the extended automation_failures table.

export const SE_SEVERITY = {
  INFO:     'info',
  WARNING:  'warning',
  ERROR:    'error',
  CRITICAL: 'critical',
} as const
export type SeSeverity = typeof SE_SEVERITY[keyof typeof SE_SEVERITY]

export const SE_STATUS = {
  OPEN:          'open',
  INVESTIGATING: 'investigating',
  RESOLVED:      'resolved',
  IGNORED:       'ignored',
} as const
export type SeStatus = typeof SE_STATUS[keyof typeof SE_STATUS]

export const WORKFLOW_FAILURE_TYPE = {
  WORKFLOW_RUN_FAILED:          'WORKFLOW_RUN_FAILED',
  OUTBOX_EVENT_DISPATCH_FAILED: 'OUTBOX_EVENT_DISPATCH_FAILED',
} as const
export type WorkflowFailureType = typeof WORKFLOW_FAILURE_TYPE[keyof typeof WORKFLOW_FAILURE_TYPE]

// Phase 3H: Resend webhook delivery failure types
export const WEBHOOK_FAILURE_TYPE = {
  EMAIL_PERMANENT_BOUNCE:   'EMAIL_PERMANENT_BOUNCE',
  EMAIL_COMPLAINT_RECEIVED: 'EMAIL_COMPLAINT_RECEIVED',
  EMAIL_DELIVERY_DELAYED:   'EMAIL_DELIVERY_DELAYED',
} as const
export type WebhookFailureType = typeof WEBHOOK_FAILURE_TYPE[keyof typeof WEBHOOK_FAILURE_TYPE]

// Phase 3I: AI budget enforcement failure types
export const AI_BUDGET_FAILURE_TYPE = {
  AI_CALL_BLOCKED_BY_BUDGET:           'AI_CALL_BLOCKED_BY_BUDGET',
  AI_BUDGET_THRESHOLD_ALERT:           'AI_BUDGET_THRESHOLD_ALERT',
  AI_BUDGET_THRESHOLD_WARNING:         'AI_BUDGET_THRESHOLD_WARNING',
  AI_CALL_FAILED:                      'AI_CALL_FAILED',
  CAMPAIGN_ASSET_MISSING_FIELDS:       'CAMPAIGN_ASSET_MISSING_FIELDS',
  CAMPAIGN_ASSET_UNDERPERFORMING:      'CAMPAIGN_ASSET_UNDERPERFORMING',
  AGENT_DECISION_REPEATED_OVERRIDE:    'AGENT_DECISION_REPEATED_OVERRIDE',
} as const
export type AiBudgetFailureType = typeof AI_BUDGET_FAILURE_TYPE[keyof typeof AI_BUDGET_FAILURE_TYPE]

export interface CreateStructuredErrorInput {
  tenantId:       string
  workspaceId?:   string | null
  failureType:    string
  errorCode?:     string | null
  errorMessage?:  string | null
  stackTrace?:    string | null
  severity?:      SeSeverity
  module?:        string | null
  route?:         string | null
  correlationId?: string | null
  payloadSnapshot?: Record<string, unknown>
  context?:       Record<string, unknown>
  workflowRunId?: string | null
  jobExecutionId?: string | null
}

export interface StructuredErrorStats {
  total:              number
  criticalCount:      number
  errorCount:         number
  warningCount:       number
  infoCount:          number
  openCount:          number
  investigatingCount: number
}
