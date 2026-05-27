export const REC_THRESHOLD = {
  ERROR_COUNT_MIN: 3,
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
