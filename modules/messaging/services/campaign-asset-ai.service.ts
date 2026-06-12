import type { Database } from '@/types/database'
import { preflightCheck } from '@/modules/intelligence/services/ai-budget-enforcer.service'
import { estimateCostUsd } from '@/modules/intelligence/services/ai-cost-estimator.service'
import * as usageRepo from '@/modules/intelligence/repositories/ai-usage-event.repo'
import * as decisionRepo from '@/modules/intelligence/repositories/agent-decision.repo'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { APPROVED_MERGE_FIELDS, ASSET_CREATION_ESTIMATED_TOKENS } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { textToHtmlBody } from '@/modules/messaging/campaign-assets/template-html'
import { extractMergeFields, validateAssetTemplate } from '@/modules/messaging/services/campaign-asset-validation.service'
import { isLlmConfigured, chatComplete } from '@/lib/llm/client'

type CampaignEmailAssetRow = Database['public']['Tables']['campaign_email_assets']['Row']

// ---------------------------------------------------------------------------
// Real LLM generation (MCM v2 Slice V3). Fail loud, never stub: if the LLM is
// not configured or returns unusable output, NO asset is created. The budget
// preflight, usage recording, and decision-audit plumbing are unchanged.
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const approvedTokens = Object.keys(APPROVED_MERGE_FIELDS)
    .map(field => `{{${field}}}`)
    .join(', ')

  return [
    'You are an expert B2B email copywriter for a merchant-payments company.',
    "Write ONE email from the operator's brief.",
    'Requirements:',
    '- 80–180 words, plain professional tone, no images.',
    `- Personalization may use ONLY these merge tokens (verbatim): ${approvedTokens}.`,
    '- Do not invent other tokens or placeholders.',
    'Output STRICT JSON: {"subject": "...", "body_text": "..."} and nothing else.',
  ].join('\n')
}

// Tolerant JSON extraction: strip code fences, find the first {...} block.
function parseDraftJson(raw: string): { subject: string; bodyText: string } | null {
  const unfenced = raw.replace(/```(?:json)?/gi, '').trim()
  const start    = unfenced.indexOf('{')
  const end      = unfenced.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  try {
    const parsed = JSON.parse(unfenced.slice(start, end + 1)) as { subject?: unknown; body_text?: unknown }
    if (typeof parsed.subject !== 'string' || typeof parsed.body_text !== 'string') return null
    if (!parsed.subject.trim() || !parsed.body_text.trim()) return null
    return { subject: parsed.subject.trim(), bodyText: parsed.body_text.trim() }
  } catch {
    return null
  }
}

// Never store unapproved tokens: replace each with a plain-text guess
// (humanized field name) so the copy still reads.
function scrubUnapprovedMergeFields(template: string): string {
  let result = template
  for (const field of extractMergeFields(template)) {
    if (!(field in APPROVED_MERGE_FIELDS)) {
      result = result.split(`{{${field}}}`).join(field.replace(/[_-]+/g, ' ').trim())
    }
  }
  return result
}

interface GeneratedDraftContent {
  subjectTemplate:       string
  bodyTemplateHtml:      string
  bodyTemplateText:      string
  personalizationFields: string[]
  requiredFields:        string[]
  fallbackValues:        Record<string, string>
}

function postProcessDraft(subject: string, bodyText: string): GeneratedDraftContent | null {
  const cleanSubject = scrubUnapprovedMergeFields(subject)
  const cleanBody    = scrubUnapprovedMergeFields(bodyText)
  const cleanHtml    = textToHtmlBody(cleanBody)

  const personalizationFields = [
    ...extractMergeFields(cleanSubject),
    ...extractMergeFields(cleanHtml),
    ...extractMergeFields(cleanBody),
  ].filter((v, i, a) => a.indexOf(v) === i)

  const content: GeneratedDraftContent = {
    subjectTemplate:       cleanSubject,
    bodyTemplateHtml:      cleanHtml,
    bodyTemplateText:      cleanBody,
    personalizationFields,
    requiredFields:        personalizationFields.includes('first_name') ? ['first_name'] : [],
    fallbackValues:        Object.fromEntries(
      personalizationFields.map(f => [f, APPROVED_MERGE_FIELDS[f]?.fallback ?? ''])
    ),
  }

  const validation = validateAssetTemplate(content)
  if (!validation.valid) return null
  return content
}

// One LLM round trip with a single retry on unparseable output.
// Returns the content plus real token usage summed across attempts.
async function generateDraftContent(
  userPrompt: string,
): Promise<
  | { ok: true; content: GeneratedDraftContent; promptTokens: number; completionTokens: number; modelName: string }
  | { ok: false; blockReason: string }
> {
  const system = buildSystemPrompt()
  let promptTokens     = 0
  let completionTokens = 0
  let modelName        = ''

  for (let attempt = 0; attempt < 2; attempt++) {
    let response
    try {
      response = await chatComplete({ system, user: userPrompt, maxTokens: 1024, temperature: 0.7 })
    } catch (err) {
      return { ok: false, blockReason: `llm_error: ${err instanceof Error ? err.message : 'request failed'}` }
    }

    promptTokens     += response.promptTokens
    completionTokens += response.completionTokens
    modelName         = response.modelName

    const parsed = parseDraftJson(response.text)
    if (!parsed) continue // retry once on unparseable output

    const content = postProcessDraft(parsed.subject, parsed.bodyText)
    if (!content) continue

    return { ok: true, content, promptTokens, completionTokens, modelName }
  }

  return { ok: false, blockReason: 'llm_bad_output' }
}

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

export async function generateAiAssetDraft(
  input: GenerateAiAssetDraftInput
): Promise<GenerateAiAssetDraftResult> {
  // 0. Fail loud, never stub — without a configured LLM no asset is created
  if (!isLlmConfigured()) {
    return { asset: null, blocked: true, blockReason: 'llm_not_configured' }
  }

  const configuredModel = input.modelName ?? process.env.LLM_MODEL_NAME!

  // 1. Preflight check — must pass before any generation
  const preflight = await preflightCheck({
    tenantId:        input.tenantId,
    workspaceId:     input.workspaceId,
    agentName:       'campaign_asset_creator',
    estimatedTokens: ASSET_CREATION_ESTIMATED_TOKENS,
    modelName:       configuredModel,
  })

  if (!preflight.allowed) {
    return { asset: null, blocked: true, blockReason: preflight.reason ?? 'budget_exhausted' }
  }

  // 2. Call the LLM FIRST — the asset is only created on success, so a failed
  //    call never leaves a junk draft behind.
  const userPrompt = [
    `Campaign type: ${input.campaignType.replace(/_/g, ' ')}`,
    `Operator brief: ${input.promptBrief}`,
  ].join('\n')

  const generation = await generateDraftContent(userPrompt)
  if (!generation.ok) {
    return { asset: null, blocked: true, blockReason: generation.blockReason }
  }

  const draft     = generation.content
  const modelName = generation.modelName || configuredModel
  const assetName = `AI Draft — ${input.campaignType.replace(/_/g, ' ')} — ${new Date().toISOString().slice(0, 10)}`

  // 3. Create the asset (status 'draft') so we have the ID for FK linkage
  const asset = await assetRepo.createAsset({
    tenantId:              input.tenantId,
    workspaceId:           input.workspaceId,
    campaignType:          input.campaignType,
    assetName,
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

  // 4. Record AI usage with real token counts from the provider response
  const promptTokens     = generation.promptTokens
  const completionTokens = generation.completionTokens
  const totalTokens      = promptTokens + completionTokens
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
    outputSummary:  { asset_name: assetName, subject_preview: draft.subjectTemplate.slice(0, 80) },
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
  // 0. Fail loud, never stub
  if (!isLlmConfigured()) {
    return { updated: false, blocked: true, blockReason: 'llm_not_configured' }
  }

  const configuredModel = input.modelName ?? process.env.LLM_MODEL_NAME!

  // 1. Preflight check
  const preflight = await preflightCheck({
    tenantId:        input.tenantId,
    workspaceId:     input.workspaceId,
    agentName:       'campaign_asset_creator',
    estimatedTokens: ASSET_CREATION_ESTIMATED_TOKENS,
    modelName:       configuredModel,
  })

  if (!preflight.allowed) {
    return { updated: false, blocked: true, blockReason: preflight.reason ?? 'budget_exhausted' }
  }

  // 2. Load existing asset
  const existing = await assetRepo.getAssetById(input.tenantId, input.assetId)
  if (!existing) throw new Error('reviseAssetWithAi: asset not found')

  // 3. Revise (not regenerate): the current subject/body travel with the brief
  const userPrompt = [
    `Campaign type: ${existing.campaign_type.replace(/_/g, ' ')}`,
    'Revise the email below per the requested change. Keep what works; apply only the requested change.',
    `Current subject: ${existing.subject_template}`,
    `Current body:\n${existing.body_template_text}`,
    `Requested change: ${input.changeBrief}`,
  ].join('\n\n')

  const generation = await generateDraftContent(userPrompt)
  if (!generation.ok) {
    return { updated: false, blocked: true, blockReason: generation.blockReason }
  }

  const draft     = generation.content
  const modelName = generation.modelName || configuredModel

  // 4. Record AI usage with real token counts
  const promptTokens     = generation.promptTokens
  const completionTokens = generation.completionTokens
  const totalTokens      = promptTokens + completionTokens
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
