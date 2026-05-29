import type { Database } from '@/types/database'
import { preflightCheck } from '@/modules/intelligence/services/ai-budget-enforcer.service'
import { estimateCostUsd } from '@/modules/intelligence/services/ai-cost-estimator.service'
import * as usageRepo from '@/modules/intelligence/repositories/ai-usage-event.repo'
import * as decisionRepo from '@/modules/intelligence/repositories/agent-decision.repo'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { APPROVED_MERGE_FIELDS, ASSET_CREATION_ESTIMATED_TOKENS } from '@/modules/messaging/campaign-assets/campaign-asset.constants'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

const DEFAULT_MODEL = 'claude-sonnet-4-6'

export interface GenerateAiAssetDraftInput {
  tenantId:      string
  workspaceId:   string
  campaignType:  string
  promptBrief:   string
  modelName?:    string
}

export interface GenerateAiAssetDraftResult {
  asset:             CampaignEmailAssetRow | null
  blocked:           boolean
  blockReason?:      string
  preflightWarning?: string
}

function buildDraftContent(campaignType: string, promptBrief: string) {
  const approvedFields = Object.keys(APPROVED_MERGE_FIELDS)
  const commonFields   = ['first_name', 'company_name', 'sender_name', 'cta_text']
  const subject        = `{{first_name}}, a quick note about {{company_name}}`
  const bodyHtml       = `<p>Hi {{first_name}},</p>\n<p>${promptBrief.slice(0, 120)}</p>\n<p>Best,<br>{{sender_name}}</p>`
  const bodyText       = `Hi {{first_name}},\n\n${promptBrief.slice(0, 120)}\n\nBest,\n{{sender_name}}`

  return {
    subjectTemplate:       subject,
    bodyTemplateHtml:      bodyHtml,
    bodyTemplateText:      bodyText,
    personalizationFields: commonFields,
    requiredFields:        ['first_name'],
    fallbackValues:        Object.fromEntries(
      commonFields.map((f) => [f, APPROVED_MERGE_FIELDS[f]?.fallback ?? ''])
    ),
    assetName: `AI Draft — ${campaignType.replace(/_/g, ' ')} — ${new Date().toISOString().slice(0, 10)}`,
    approvedFieldCount: approvedFields.length,
  }
}

export async function generateAiAssetDraft(
  input: GenerateAiAssetDraftInput
): Promise<GenerateAiAssetDraftResult> {
  const modelName = input.modelName ?? DEFAULT_MODEL

  // 1. Preflight check — must pass before any generation
  const preflight = await preflightCheck({
    tenantId:        input.tenantId,
    workspaceId:     input.workspaceId,
    agentName:       'campaign_asset_creator',
    estimatedTokens: ASSET_CREATION_ESTIMATED_TOKENS,
    modelName,
  })

  if (!preflight.allowed) {
    return { asset: null, blocked: true, blockReason: preflight.reason ?? 'budget_exhausted' }
  }

  // 2. Generate deterministic draft content (no LLM SDK installed — follows project pattern)
  const draft = buildDraftContent(input.campaignType, input.promptBrief)

  // 3. Create asset first (status 'draft') so we have the ID for FK linkage
  const asset = await assetRepo.createAsset({
    tenantId:              input.tenantId,
    workspaceId:           input.workspaceId,
    campaignType:          input.campaignType,
    assetName:             draft.assetName,
    subjectTemplate:       draft.subjectTemplate,
    bodyTemplateHtml:      draft.bodyTemplateHtml,
    bodyTemplateText:      draft.bodyTemplateText,
    personalizationFields: draft.personalizationFields,
    requiredFields:        draft.requiredFields,
    fallbackValues:        draft.fallbackValues,
    llmGenerated:          true,
    aiUsageEventId:        null,
    decisionId:            null,
  })

  // 4. Record AI usage with campaignAssetId
  const promptTokens     = 0
  const completionTokens = 0
  const totalTokens      = 0
  const estimatedCostUsd = estimateCostUsd(modelName, promptTokens, completionTokens)

  const usageEvent = await usageRepo.recordUsage({
    tenantId:          input.tenantId,
    workspaceId:       input.workspaceId,
    agentName:         'campaign_asset_creator',
    featureName:       'asset_generation',
    modelName,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    campaignAssetId:   asset.id,
    success:           true,
  })

  // 5. Record agent decision
  const decision = await decisionRepo.createDecision({
    tenantId:       input.tenantId,
    workspaceId:    input.workspaceId,
    agentName:      'campaign_asset_creator',
    decisionType:   'campaign_asset_created',
    decisionStatus: 'completed',
    entityType:     'campaign_asset',
    entityId:       asset.id,
    aiUsageEventId: usageEvent.id,
    inputSnapshot:  { campaign_type: input.campaignType, prompt_brief: input.promptBrief },
    outputSummary:  { asset_name: draft.assetName, subject_preview: draft.subjectTemplate.slice(0, 80) },
  })

  // 6. Back-fill FK IDs on the asset
  await assetRepo.updateAssetContent(input.tenantId, asset.id, {
    subjectTemplate:       draft.subjectTemplate,
    bodyTemplateHtml:      draft.bodyTemplateHtml,
    bodyTemplateText:      draft.bodyTemplateText,
    personalizationFields: draft.personalizationFields,
    requiredFields:        draft.requiredFields,
    fallbackValues:        draft.fallbackValues,
    llmGenerated:          true,
    aiUsageEventId:        usageEvent.id,
    decisionId:            decision.id,
  })

  return { asset, blocked: false, preflightWarning: preflight.warning }
}

export interface ReviseAssetWithAiInput {
  tenantId:    string
  workspaceId: string
  assetId:     string
  changeBrief: string
  modelName?:  string
}

export interface ReviseAssetWithAiResult {
  updated:      boolean
  blocked:      boolean
  blockReason?: string
}

export async function reviseAssetWithAi(
  input: ReviseAssetWithAiInput
): Promise<ReviseAssetWithAiResult> {
  const modelName = input.modelName ?? DEFAULT_MODEL

  // 1. Preflight check
  const preflight = await preflightCheck({
    tenantId:        input.tenantId,
    workspaceId:     input.workspaceId,
    agentName:       'campaign_asset_creator',
    estimatedTokens: ASSET_CREATION_ESTIMATED_TOKENS,
    modelName,
  })

  if (!preflight.allowed) {
    return { updated: false, blocked: true, blockReason: preflight.reason ?? 'budget_exhausted' }
  }

  // 2. Load existing asset
  const existing = await assetRepo.getAssetById(input.tenantId, input.assetId)
  if (!existing) throw new Error('reviseAssetWithAi: asset not found')

  // 3. Generate revised content deterministically
  const draft = buildDraftContent(existing.campaign_type, input.changeBrief)

  // 4. Record AI usage
  const promptTokens     = 0
  const completionTokens = 0
  const totalTokens      = 0
  const estimatedCostUsd = estimateCostUsd(modelName, promptTokens, completionTokens)

  const usageEvent = await usageRepo.recordUsage({
    tenantId:          input.tenantId,
    workspaceId:       input.workspaceId,
    agentName:         'campaign_asset_creator',
    featureName:       'asset_revision',
    modelName,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    campaignAssetId:   input.assetId,
    success:           true,
  })

  // 5. Record agent decision
  const decision = await decisionRepo.createDecision({
    tenantId:       input.tenantId,
    workspaceId:    input.workspaceId,
    agentName:      'campaign_asset_creator',
    decisionType:   'campaign_asset_revised',
    decisionStatus: 'completed',
    entityType:     'campaign_asset',
    entityId:       input.assetId,
    aiUsageEventId: usageEvent.id,
    inputSnapshot:  { asset_id: input.assetId, change_brief: input.changeBrief },
    outputSummary:  { subject_preview: draft.subjectTemplate.slice(0, 80) },
  })

  // 6. Update asset content and reset status to 'draft'
  await assetRepo.updateAssetContent(input.tenantId, input.assetId, {
    subjectTemplate:       draft.subjectTemplate,
    bodyTemplateHtml:      draft.bodyTemplateHtml,
    bodyTemplateText:      draft.bodyTemplateText,
    personalizationFields: draft.personalizationFields,
    requiredFields:        draft.requiredFields,
    fallbackValues:        draft.fallbackValues,
    llmGenerated:          true,
    aiUsageEventId:        usageEvent.id,
    decisionId:            decision.id,
  }, true) // resetStatus = true → sets status back to 'draft'

  return { updated: true, blocked: false }
}
