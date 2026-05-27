export interface LeadPipelineStats {
  total:            number
  newLast30Days:    number
  workflowEnabled:  number
  workflowDisabled: number
  byStage:    Record<string, number>
  byPriority: Record<string, number>
}

export interface EmailSendMetrics {
  windowDays:    number
  totalSends:    number
  delivered:     number
  bounced:       number
  complained:    number
  failed:        number
  openEvents:    number
  clickEvents:   number
  deliveryRate:  number | null
  bounceRate:    number | null
  complaintRate: number | null
  openRate:      number | null
  clickRate:     number | null
}

export interface LearningSignalRow {
  dimension:      string
  dimensionValue: string
  signalName:     string
  rate:           number | null
  sampleN:        number
  confidence:     string
  computedAt:     string
}

export interface LearningSignalSummary {
  latestRunId: string | null
  latestRunAt: string | null
  signals:     LearningSignalRow[]
}

export interface RevenueDashboard {
  pipeline:        LeadPipelineStats
  emailMetrics:    EmailSendMetrics
  learningSignals: LearningSignalSummary
  openErrorCount:  number
  generatedAt:     string
}
