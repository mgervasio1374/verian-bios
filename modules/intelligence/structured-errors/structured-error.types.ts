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
