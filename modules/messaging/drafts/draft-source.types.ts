import type { DRAFT_SOURCE_TYPE, DRAFT_READINESS_REASON } from './draft-source.constants'

export type DraftSourceType = typeof DRAFT_SOURCE_TYPE[keyof typeof DRAFT_SOURCE_TYPE]
export type DraftReadinessReason = typeof DRAFT_READINESS_REASON[keyof typeof DRAFT_READINESS_REASON]

export interface DraftSendReadinessResult {
  ready:          boolean
  blockedReasons: string[]
  warnings:       string[]
}

export interface DraftReadinessContext {
  approvalRequestStatus:        string | null
  sourceAssetStatus?:           string | null
  emailSendingEnabled:          boolean
  missingPersonalizationFields: string[]
}
