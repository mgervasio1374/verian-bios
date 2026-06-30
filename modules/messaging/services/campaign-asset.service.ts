// EMAIL_SENDING_ENABLED is controlled via system controls; campaign assets do not send emails.
// Preview is in-memory only — no DB writes, no LLM, no Resend.

import type { Database } from '@/types/database'
import type { PersonalizationFields } from '@/modules/messaging/services/campaign-personalization.service'
import type { AssetPreviewResult, AssetTemplateContent } from '@/modules/messaging/campaign-assets/campaign-asset.types'
import { APPROVED_MERGE_FIELDS } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { renderCampaignAsset } from '@/modules/messaging/services/campaign-personalization.service'
import * as repo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import {
  validateAssetTemplate,
  validateAssetBodies,
  validateAssetTransition,
  validateActivationReadiness,
  extractMergeFields,
} from '@/modules/messaging/services/campaign-asset-validation.service'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

export async function createHumanAsset(
  tenantId:    string,
  workspaceId: string,
  input: {
    campaignType:  string
    assetName:     string
  } & AssetTemplateContent
): Promise<CampaignEmailAssetRow> {
  const validation = validateAssetTemplate(input)
  if (!validation.valid) {
    throw new Error('createHumanAsset: ' + validation.errors.join('; '))
  }

  // Body-integrity guard: no empty HTML body, no HTML/text token mismatch.
  const bodies = validateAssetBodies(input)
  if (!bodies.ok) {
    throw new Error('createHumanAsset: ' + bodies.error)
  }

  return repo.createAsset({
    tenantId,
    workspaceId,
    campaignType:           input.campaignType,
    assetName:              input.assetName,
    subjectTemplate:        input.subjectTemplate,
    bodyTemplateHtml:       input.bodyTemplateHtml,
    bodyTemplateText:       input.bodyTemplateText,
    personalizationFields:  input.personalizationFields,
    requiredFields:         input.requiredFields,
    fallbackValues:         input.fallbackValues,
    llmGenerated:           false,
    aiUsageEventId:         null,
    decisionId:             null,
  })
}

export async function submitAssetForReview(
  tenantId: string,
  assetId:  string
): Promise<void> {
  const asset = await repo.getAssetById(tenantId, assetId)
  if (!asset) throw new Error('submitAssetForReview: asset not found')

  const transition = validateAssetTransition(asset.status as 'draft', 'under_review')
  if (!transition.valid) throw new Error('submitAssetForReview: ' + transition.reason)

  if (!asset.subject_template?.trim() || !asset.body_template_html?.trim() || !asset.body_template_text?.trim()) {
    throw new Error('submitAssetForReview: templates must be non-empty before review')
  }

  await repo.updateAssetStatus(tenantId, assetId, 'under_review')
}

export async function approveAsset(
  tenantId:   string,
  assetId:    string,
  approvedBy: string
): Promise<void> {
  if (!approvedBy) throw new Error('approveAsset: approvedBy is required')

  const asset = await repo.getAssetById(tenantId, assetId)
  if (!asset) throw new Error('approveAsset: asset not found')

  const transition = validateAssetTransition(asset.status as 'under_review', 'approved')
  if (!transition.valid) throw new Error('approveAsset: ' + transition.reason)

  await repo.updateAssetStatus(tenantId, assetId, 'approved', approvedBy)
}

export async function activateAsset(
  tenantId:   string,
  assetId:    string,
  approvedBy: string
): Promise<void> {
  if (!approvedBy) throw new Error('activateAsset: approvedBy is required')

  const asset = await repo.getAssetById(tenantId, assetId)
  if (!asset) throw new Error('activateAsset: asset not found')

  const transition = validateAssetTransition(asset.status as 'approved', 'active')
  if (!transition.valid) throw new Error('activateAsset: ' + transition.reason)

  const readiness = validateActivationReadiness({
    requiredFields: (asset.required_fields as string[]) ?? [],
    fallbackValues: (asset.fallback_values as Record<string, string>) ?? {},
  })
  if (!readiness.ready) {
    throw new Error(
      'activateAsset: missing required field fallbacks: ' + readiness.missingFields.join(', ')
    )
  }

  await repo.updateAssetStatus(tenantId, assetId, 'active', approvedBy)
}

export async function retireAsset(
  tenantId: string,
  assetId:  string
): Promise<void> {
  const asset = await repo.getAssetById(tenantId, assetId)
  if (!asset) throw new Error('retireAsset: asset not found')

  const transition = validateAssetTransition(asset.status as 'active', 'retired')
  if (!transition.valid) throw new Error('retireAsset: ' + transition.reason)

  await repo.updateAssetStatus(tenantId, assetId, 'retired')
}

export async function cloneAsset(
  tenantId:    string,
  workspaceId: string,
  sourceId:    string,
  newName:     string
): Promise<CampaignEmailAssetRow> {
  const source = await repo.getAssetById(tenantId, sourceId)
  if (!source) throw new Error('cloneAsset: source asset not found')

  return repo.createAsset({
    tenantId,
    workspaceId,
    campaignType:           source.campaign_type,
    assetName:              newName,
    subjectTemplate:        source.subject_template,
    bodyTemplateHtml:       source.body_template_html,
    bodyTemplateText:       source.body_template_text,
    personalizationFields:  (source.personalization_fields as string[]) ?? [],
    requiredFields:         (source.required_fields as string[]) ?? [],
    fallbackValues:         (source.fallback_values as Record<string, string>) ?? {},
    llmGenerated:           false,
    aiUsageEventId:         null,
    decisionId:             null,
  })
}

export function previewCampaignAsset(
  asset: {
    subjectTemplate:  string
    bodyTemplateHtml: string
    bodyTemplateText: string
    requiredFields:   string[]
    fallbackValues?:  Record<string, string>
  },
  fields: PersonalizationFields
): AssetPreviewResult {
  const renderResult = renderCampaignAsset(asset, fields)

  const allUsedFields = [
    ...extractMergeFields(asset.subjectTemplate),
    ...extractMergeFields(asset.bodyTemplateHtml),
    ...extractMergeFields(asset.bodyTemplateText),
  ]
  const unknownFields = [...new Set(allUsedFields)].filter((f) => !(f in APPROVED_MERGE_FIELDS))

  return {
    renderedSubject:         renderResult.renderedSubject,
    renderedBodyHtml:        renderResult.renderedBodyHtml,
    renderedBodyText:        renderResult.renderedBodyText,
    missingRequiredFields:   renderResult.missingRequiredFields,
    personalizationSnapshot: renderResult.personalizationSnapshot,
    unknownFields,
  }
}
