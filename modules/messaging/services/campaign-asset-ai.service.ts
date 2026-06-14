import type { Database } from '@/types/database'
import { preflightCheck } from '@/modules/intelligence/services/ai-budget-enforcer.service'
import { estimateCostUsd } from '@/modules/intelligence/services/ai-cost-estimator.service'
import * as usageRepo from '@/modules/intelligence/repositories/ai-usage-event.repo'
import * as decisionRepo from '@/modules/intelligence/repositories/agent-decision.repo'
import * as assetRepo from '@/modules/messaging/repositories/campaign-email-asset.repo'
import { APPROVED_MERGE_FIELDS, ASSET_CREATION_ESTIMATED_TOKENS } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { textToHtmlBody } from '@/modules/messaging/campaign-assets/template-html'
import { applyHouseStyle } from '@/modules/messaging/house-style'
import { extractMergeFields, validateAssetTemplate } from '@/modules/messaging/services/campaign-asset-validation.service'
import { isLlmConfigured, chatComplete } from '@/lib/llm/client'
import { getCampaignTypeById } from '@/modules/campaign-sequence/repositories/campaign-type.repo'
import { insertCampaignSequence } from '@/modules/campaign-sequence/repositories/campaign-sequence.repo'
import { insertCampaignSequenceStep } from '@/modules/campaign-sequence/repositories/campaign-sequence-step.repo'
import type { CampaignSequenceInsert } from '@/modules/campaign-sequence/types'

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
    '- 80 to 180 words, plain professional tone, no images.',
    `- Personalization may use ONLY these merge tokens (verbatim): ${approvedTokens}.`,
    '- Do not invent other tokens or placeholders.',
    '- Never use em dashes (—) or en dashes (–) as punctuation. Use commas, periods, or parentheses instead.',
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
  // Born-clean: scrub house-style (em/en dashes) off the LLM output before the
  // template is persisted, so the render chokepoint scrub is never load-bearing.
  const cleanSubject = applyHouseStyle(scrubUnapprovedMergeFields(subject))
  const cleanBody    = applyHouseStyle(scrubUnapprovedMergeFields(bodyText))
  const cleanHtml    = applyHouseStyle(textToHtmlBody(cleanBody), { html: true })

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

// ---------------------------------------------------------------------------
// MCM v2 Slice V6 — one-shot AI sequence generation.
// N touches generated sequentially with the previous emails in context (so
// touch 3 references and builds on 1–2), assets named `${name}_${i}`, then a
// manual sequence created linking them. Assets are created AS THE LOOP
// PROGRESSES: a mid-run failure leaves usable partial assets findable by the
// name prefix, and the sequence is NOT created on partial failure.
// ---------------------------------------------------------------------------

// Sensible default cadences by touch count (V5 schedule settings stay null —
// the operator sets send time/timezone in the builder).
export const DEFAULT_SEQUENCE_DAY_OFFSETS: Record<number, number[]> = {
  2: [0, 6],
  3: [0, 5, 10],
  4: [0, 5, 10, 15],
  5: [0, 4, 9, 14, 19],
}

export interface GenerateAiSequenceInput {
  tenantId:          string
  workspaceId:       string
  campaignTypeId:    string
  name:              string
  touches:           number // 2–5
  brief:             string
  senderIdentityId?: string | null
  dayOffsets?:       number[]
}

export interface GenerateAiSequenceResult {
  sequenceId:        string | null
  assetIds:          string[]
  blocked:           boolean
  blockReason?:      string
  preflightWarning?: string
}

// Persists one generated touch: asset row, usage event (real tokens), agent
// decision, FK backfill — the same audit shape as generateAiAssetDraft.
async function persistGeneratedTouch(input: {
  tenantId:         string
  workspaceId:      string
  campaignTypeSlug: string
  assetName:        string
  draft:            GeneratedDraftContent
  promptTokens:     number
  completionTokens: number
  modelName:        string
  inputSnapshot:    Record<string, unknown>
}): Promise<CampaignEmailAssetRow> {
  const asset = await assetRepo.createAsset({
    tenantId:              input.tenantId,
    workspaceId:           input.workspaceId,
    campaignType:          input.campaignTypeSlug,
    assetName:             input.assetName,
    subjectTemplate:       input.draft.subjectTemplate,
    bodyTemplateHtml:      input.draft.bodyTemplateHtml,
    bodyTemplateText:      input.draft.bodyTemplateText,
    personalizationFields: input.draft.personalizationFields,
    requiredFields:        input.draft.requiredFields,
    fallbackValues:        input.draft.fallbackValues,
    llmGenerated:          true,
    aiUsageEventId:        null,
    decisionId:            null,
  })

  const totalTokens      = input.promptTokens + input.completionTokens
  const estimatedCostUsd = estimateCostUsd(input.modelName, input.promptTokens, input.completionTokens)

  const usageEvent = await usageRepo.recordUsage({
    tenantId:          input.tenantId,
    workspaceId:       input.workspaceId,
    agentName:         'campaign_asset_creator',
    featureName:       'asset_generation',
    modelName:         input.modelName,
    promptTokens:      input.promptTokens,
    completionTokens:  input.completionTokens,
    totalTokens,
    estimatedCostUsd,
    campaignAssetId:   asset.id,
    success:           true,
  })

  const decision = await decisionRepo.createDecision({
    tenantId:       input.tenantId,
    workspaceId:    input.workspaceId,
    agentName:      'campaign_asset_creator',
    decisionType:   'campaign_asset_created',
    decisionStatus: 'completed',
    entityType:     'campaign_asset',
    entityId:       asset.id,
    aiUsageEventId: usageEvent.id,
    inputSnapshot:  input.inputSnapshot,
    outputSummary:  { asset_name: input.assetName, subject_preview: input.draft.subjectTemplate.slice(0, 80) },
  })

  await assetRepo.updateAssetContent(input.tenantId, asset.id, {
    subjectTemplate:       input.draft.subjectTemplate,
    bodyTemplateHtml:      input.draft.bodyTemplateHtml,
    bodyTemplateText:      input.draft.bodyTemplateText,
    personalizationFields: input.draft.personalizationFields,
    requiredFields:        input.draft.requiredFields,
    fallbackValues:        input.draft.fallbackValues,
    llmGenerated:          true,
    aiUsageEventId:        usageEvent.id,
    decisionId:            decision.id,
  })

  return asset
}

function touchRoleLine(touch: number, total: number): string {
  if (touch === 1)     return `This email is touch 1 of ${total} — the first outreach.`
  if (touch === total) return `This email is touch ${total} of ${total} — the final note before the event.`
  return `This email is touch ${touch} of ${total} — a follow-up that advances the story.`
}

// Thin orchestrator over the shared helpers below. The background Inngest
// function (inngest/functions/generate-ai-sequence.ts) drives the SAME helpers
// with one step.run per touch so each LLM round-trip is its own invocation.
// No request path calls this anymore — kept for non-request callers/tests.
export async function generateAiSequence(
  input: GenerateAiSequenceInput
): Promise<GenerateAiSequenceResult> {
  const prep = await prepareSequenceGeneration({
    tenantId:       input.tenantId,
    workspaceId:    input.workspaceId,
    campaignTypeId: input.campaignTypeId,
    touches:        input.touches,
  })
  if (!prep.ok) {
    return { sequenceId: null, assetIds: [], blocked: true, blockReason: prep.blockReason }
  }

  const previousTouches: { subject: string; bodyText: string }[] = []
  const assetIds: string[] = []

  for (let touch = 1; touch <= input.touches; touch++) {
    const result = await generateSequenceTouch({
      tenantId:         input.tenantId,
      workspaceId:      input.workspaceId,
      campaignTypeSlug: prep.campaignTypeSlug!,
      name:             input.name,
      brief:            input.brief,
      touch,
      total:            input.touches,
      previousTouches,
    })
    if (!result.ok) {
      // Partial failure: the sequence is NOT created. Already-created assets
      // remain (named `${name}_1..`) for manual completion.
      return {
        sequenceId:  null,
        assetIds,
        blocked:     true,
        blockReason: `${result.blockReason} (touch ${touch} of ${input.touches}; ${assetIds.length} asset(s) already created with prefix ${input.name}_)`,
      }
    }
    previousTouches.push({ subject: result.subject, bodyText: result.bodyText })
    assetIds.push(result.assetId)
  }

  const { sequenceId } = await assembleAiSequence({
    tenantId:         input.tenantId,
    workspaceId:      input.workspaceId,
    campaignTypeId:   input.campaignTypeId,
    name:             input.name,
    senderIdentityId: input.senderIdentityId ?? null,
    assetIds,
    touches:          input.touches,
    dayOffsets:       input.dayOffsets,
  })

  return { sequenceId, assetIds, blocked: false, preflightWarning: prep.preflightWarning }
}

// --- Shared helpers — single source for the sync wrapper and the Inngest job ---

export interface PrepareSequenceGenerationResult {
  ok:                boolean
  campaignTypeSlug?: string
  blockReason?:      string
  preflightWarning?: string
}

// LLM-config check, touch validation, ONE preflight scaled by touch count, and
// campaign-type resolution. Runs once up front, before any touch.
export async function prepareSequenceGeneration(input: {
  tenantId:       string
  workspaceId:    string
  campaignTypeId: string
  touches:        number
}): Promise<PrepareSequenceGenerationResult> {
  // Fail loud, never stub
  if (!isLlmConfigured()) {
    return { ok: false, blockReason: 'llm_not_configured' }
  }

  if (!Number.isInteger(input.touches) || input.touches < 2 || input.touches > 5) {
    return { ok: false, blockReason: 'invalid_touch_count' }
  }

  const configuredModel = process.env.LLM_MODEL_NAME!

  // ONE preflight scaled by touch count
  const preflight = await preflightCheck({
    tenantId:        input.tenantId,
    workspaceId:     input.workspaceId,
    agentName:       'campaign_asset_creator',
    estimatedTokens: ASSET_CREATION_ESTIMATED_TOKENS * input.touches,
    modelName:       configuredModel,
  })

  if (!preflight.allowed) {
    return { ok: false, blockReason: preflight.reason ?? 'budget_exhausted' }
  }

  const campaignType = await getCampaignTypeById(input.campaignTypeId, input.tenantId, input.workspaceId)
  if (!campaignType?.slug) {
    return { ok: false, blockReason: 'campaign_type_not_found' }
  }

  return { ok: true, campaignTypeSlug: campaignType.slug, preflightWarning: preflight.warning }
}

export type GenerateSequenceTouchResult =
  | { ok: true; assetId: string; subject: string; bodyText: string }
  | { ok: false; blockReason: string }

// One touch: build the chained prompt (carrying the previous emails), call the
// LLM, and persist the asset. The unit run inside each Inngest step.run.
export async function generateSequenceTouch(input: {
  tenantId:         string
  workspaceId:      string
  campaignTypeSlug: string
  name:             string
  brief:            string
  touch:            number
  total:            number
  previousTouches:  { subject: string; bodyText: string }[]
}): Promise<GenerateSequenceTouchResult> {
  const configuredModel = process.env.LLM_MODEL_NAME!

  const promptParts = [
    `Campaign type: ${input.campaignTypeSlug.replace(/_/g, ' ')}`,
    `Campaign: ${input.name}`,
    `Operator brief: ${input.brief}`,
    `${touchRoleLine(input.touch, input.total)} Assume no reply yet; keep it short and warm.`,
  ]

  if (input.previousTouches.length > 0) {
    promptParts.push('Previously generated emails in this sequence:')
    input.previousTouches.forEach((prev, idx) => {
      promptParts.push(`Touch ${idx + 1} subject: ${prev.subject}\nTouch ${idx + 1} body:\n${prev.bodyText}`)
    })
    promptParts.push('Do not repeat earlier emails; reference and progress from them.')
  }

  const generation = await generateDraftContent(promptParts.join('\n\n'))
  if (!generation.ok) {
    return { ok: false, blockReason: generation.blockReason }
  }

  const asset = await persistGeneratedTouch({
    tenantId:         input.tenantId,
    workspaceId:      input.workspaceId,
    campaignTypeSlug: input.campaignTypeSlug,
    assetName:        `${input.name}_${input.touch}`,
    draft:            generation.content,
    promptTokens:     generation.promptTokens,
    completionTokens: generation.completionTokens,
    modelName:        generation.modelName || configuredModel,
    inputSnapshot: {
      campaign_type: input.campaignTypeSlug,
      prompt_brief:  input.brief,
      sequence_name: input.name,
      touch_number:  input.touch,
      touch_count:   input.total,
    },
  })

  return {
    ok:       true,
    assetId:  asset.id,
    subject:  generation.content.subjectTemplate,
    bodyText: generation.content.bodyTemplateText,
  }
}

// All touches succeeded — create the sequence + steps through the same repo
// path createManualSequenceAction uses underneath. The shared assembly tail.
export async function assembleAiSequence(input: {
  tenantId:         string
  workspaceId:      string
  campaignTypeId:   string
  name:             string
  senderIdentityId: string | null
  assetIds:         string[]
  touches:          number
  dayOffsets?:      number[]
}): Promise<{ sequenceId: string }> {
  const dayOffsets = input.dayOffsets ?? DEFAULT_SEQUENCE_DAY_OFFSETS[input.touches]

  const sequencePayload: Record<string, unknown> = {
    tenant_id:          input.tenantId,
    workspace_id:       input.workspaceId,
    campaign_type_id:   input.campaignTypeId,
    name:               input.name,
    authoring_mode:     'manual',
    sender_identity_id: input.senderIdentityId ?? null,
    send_time:          null,
    timezone:           null,
    skip_weekends:      false,
  }
  const sequence = await insertCampaignSequence(sequencePayload as unknown as CampaignSequenceInsert)

  for (let index = 0; index < input.assetIds.length; index++) {
    await insertCampaignSequenceStep({
      tenant_id:               input.tenantId,
      workspace_id:            input.workspaceId,
      campaign_sequence_id:    sequence.id,
      step_number:             index + 1,
      day_offset:              dayOffsets[index] ?? index * 5,
      campaign_email_asset_id: input.assetIds[index],
      is_recurring:            false,
      recurring_interval_days: null,
    })
  }

  return { sequenceId: sequence.id }
}
