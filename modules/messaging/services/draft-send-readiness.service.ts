import type { DraftSendReadinessResult, DraftReadinessContext } from '@/modules/messaging/drafts/draft-source.types'
import { DRAFT_SOURCE_TYPE } from '@/modules/messaging/drafts/draft-source.constants'

interface DraftReadinessInput {
  status:               string
  toEmail:              string | null
  subject:              string | null
  bodyHtml:             string | null
  bodyText:             string | null
  approvalRequestId:    string | null
  sourceType:           string | null
  sourceAssetId:        string | null
  aiGenerationMetadata: Record<string, unknown>
}

export function checkDraftSendReadiness(
  draft:   DraftReadinessInput,
  context: DraftReadinessContext
): DraftSendReadinessResult {
  const blockedReasons: string[] = []
  const warnings: string[] = []

  if (!draft.toEmail)  blockedReasons.push('missing_recipient')
  if (!draft.subject)  blockedReasons.push('missing_subject')
  if (!draft.bodyHtml && !draft.bodyText) blockedReasons.push('missing_body')
  if (draft.status !== 'approved') blockedReasons.push('draft_not_approved')
  if (!draft.approvalRequestId) blockedReasons.push('missing_approval_request')

  if (draft.sourceType === DRAFT_SOURCE_TYPE.CAMPAIGN_ASSET_RENDER) {
    if (context.approvalRequestStatus && context.approvalRequestStatus !== 'approved') {
      if (!blockedReasons.includes('draft_not_approved')) {
        blockedReasons.push('draft_not_approved')
      }
    }
    if (context.sourceAssetStatus != null) {
      if (context.sourceAssetStatus === 'retired') {
        blockedReasons.push('source_asset_retired')
      } else if (
        context.sourceAssetStatus !== 'approved' &&
        context.sourceAssetStatus !== 'active'
      ) {
        blockedReasons.push('source_asset_not_active')
      }
    }
  }

  if (context.missingPersonalizationFields.length > 0) {
    warnings.push('missing_personalization_fields')
  }

  if (!context.emailSendingEnabled) {
    warnings.push('email_sending_disabled')
  }

  return {
    ready: blockedReasons.length === 0,
    blockedReasons,
    warnings,
  }
}
