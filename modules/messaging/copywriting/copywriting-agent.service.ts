// ============================================================
// Phase 3B — Copywriting Agent Service
// Public boundary of the Copywriting Agent.
// Orchestrates: load → gate check → skills → version plan →
// generate → validate → retry → differentiate → persist →
// activity event → return result.
// ============================================================

import * as repo       from '@/modules/messaging/repositories/message-version.repo'
import * as stratRepo  from '@/modules/messaging/repositories/message-strategy.repo'
import * as agentLog   from '@/modules/intelligence/services/agent-run-logging.service'
import * as activitySvc from '@/modules/intelligence/services/activity-event.service'
import * as sysCtrlRepo from '@/modules/intelligence/repositories/system-control.repo'
import * as agentDecisionRepo from '@/modules/intelligence/repositories/agent-decision.repo'
import * as aiUsageRepo from '@/modules/intelligence/repositories/ai-usage-event.repo'
import { preflightCheck } from '@/modules/intelligence/services/ai-budget-enforcer.service'
import { ActivityEventType, SystemControlKey }  from '@/modules/intelligence/types.agent'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

import { getSkillDefinition }       from './copywriting-agent.skill-definitions'
import { buildVersionPlan }         from './copywriting-agent.version-planner'
import { generateSubjectLine }      from './copywriting-agent.subjects'
import { generateBodyText }         from './copywriting-agent.body'
import type { BodyGenerationResult } from './copywriting-agent.body'
import { generateBodyWithLlm }      from './copywriting-agent.llm'
import { generatePreviewText }      from './copywriting-agent.preview'
import { applyHouseStyle }          from '@/modules/messaging/house-style'
import { checkCompliance }          from './copywriting-agent.compliance'
import { checkStructure }           from './copywriting-agent.validation'
import {
  checkDifferentiation,
  identifyWeakerVersionInPair,
}                                   from './copywriting-agent.differentiation'
import {
  createRetryState,
  canRetry,
  recordRetryAttempt,
  getPrimaryError,
  buildRepairNote,
  MAX_RETRY_ATTEMPTS,
}                                   from './copywriting-agent.retry'

import {
  COPY_ERROR_CODES,
  COPY_AGENT_STEPS,
} from './copywriting-agent.types'
import type {
  CopywritingInput,
  CopywritingResult,
  CopywritingError,
  CopywritingWarning,
  CopywritingLeadContext,
  CopywritingSkillDefinition,
  MessageVersionDraft,
  MessageVersion,
  VersionPlan,
  CanGenerateResult,
  DifferentiationProfile,
} from './copywriting-agent.types'
import type { MessageStrategy, SelectedSkill } from '@/modules/messaging/strategy/message-strategy.types'

// ---- Constants ----

const AGENT_NAME = 'copywriting_agent'
const RUN_TYPE   = 'generation'

// ---- Error builders ----

function makeError(
  code:         CopywritingError['code'],
  severity:     CopywritingError['severity'],
  message:      string,
  suggestedFix: string,
  canOverride   = false,
  blocking      = true
): CopywritingError {
  return { code, severity, message, suggestedFix, canOverride, blocking }
}

function failResult(
  errors:     CopywritingError[],
  warnings:   CopywritingWarning[],
  agentRunId: string | null
): CopywritingResult {
  return { success: false, errors, warnings, agentRunId }
}

// ---- Extract event name from audience_context heuristically ----
// event_name is not a standard column on message_strategies.
// The Message Strategy Agent may embed the event name in audience_context.
// This is a best-effort extraction; null is the safe default.

function extractEventName(audienceContext: string): string | null {
  // Look for patterns like "Event lead: [Name]" or "at [Event Name]"
  const match = audienceContext.match(/at ([A-Z][^.;,\n]{3,60}(?:Summit|Expo|Show|Conference|Trade Show|Fair|Forum|Convention))/i)
  return match?.[1]?.trim() ?? null
}

// ---- Load lead/company context ----

async function loadLeadContext(
  leadId:   string,
  tenantId: string,
  strategy: MessageStrategy
): Promise<CopywritingLeadContext> {
  const supabase = createSupabaseServiceClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('id, contact_id, company_id, source, stage')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const { data: contact } = lead?.contact_id
    ? await supabase.from('contacts').select('first_name, last_name, email').eq('id', lead.contact_id).maybeSingle()
    : { data: null }

  const { data: company } = lead?.company_id
    ? await supabase.from('companies').select('id, name, industry, website').eq('id', lead.company_id).maybeSingle()
    : { data: null }

  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null
    : null

  // Event context: for event_expo_follow_up, conversation notes are the key finding
  // the Message Strategy Agent captured. proof_point holds that context when present.
  // event_name is not a standard schema field; extract from audience_context if possible,
  // otherwise null. Both default to null for non-event message types.
  const isEventType       = strategy.message_type === 'event_expo_follow_up'
  const conversationNotes = isEventType ? (strategy.proof_point ?? null) : null
  const eventName         = isEventType
    ? extractEventName(strategy.audience_context ?? '')
    : null

  return {
    leadId,
    tenantId,
    contactName,
    companyName:            company?.name                    ?? null,
    businessType:           null,
    city:                   null,
    state:                  null,
    website:                company?.website                  ?? null,
    sizeProxy:              null,
    knownPaymentContext:    null,
    currentProcessor:       null,
    estimatedMonthlyVolume: null,
    industrySegment:        company?.industry ?? strategy.industry_segment ?? null,
    eventName,
    conversationNotes,
  }
}

// ---- Build a single version candidate ----

export function buildCandidate(
  versionNumber: number,
  plan:          VersionPlan,
  strategy:      MessageStrategy,
  ctx:           CopywritingLeadContext,
  skills:        CopywritingSkillDefinition[],
  repairNote:    string,
  llmBody?:      BodyGenerationResult
): MessageVersionDraft {
  const angle = plan.angles[versionNumber - 1]
  if (!angle) throw new Error(`No angle for version number ${versionNumber}`)

  // Determine effective length target
  const lengthTarget = angle.lengthOverride ?? strategy.length_target ?? 'short'

  // Generate content. When an LLM body is supplied (gated path) use it; otherwise
  // fall back to deterministic generation. Either way the SAME validators run below.
  const subjectLine = applyHouseStyle(generateSubjectLine(angle, strategy, ctx))
  const bodyResult  = llmBody ?? generateBodyText(angle, strategy, ctx)
  bodyResult.bodyText = applyHouseStyle(bodyResult.bodyText)
  const previewText = applyHouseStyle(generatePreviewText(subjectLine, bodyResult.bodyText))

  // Build skill version map
  const skillVersions: Record<string, number> = {}
  for (const sk of strategy.selected_skills ?? []) {
    skillVersions[sk.skill_slug] = sk.skill_version
  }

  // Build required inclusions satisfied map
  const requiredInclusionsSatisfied: Record<string, boolean> = {}
  for (const req of strategy.required_inclusions ?? []) {
    requiredInclusionsSatisfied[req] = bodyResult.bodyText.toLowerCase().includes(
      req.split(' ').slice(0, 3).join(' ').toLowerCase()
    )
  }

  // Build avoided elements map
  const avoidedElementsChecked: Record<string, string> = {}
  for (const avoidItem of strategy.avoid ?? []) {
    avoidedElementsChecked[avoidItem] = bodyResult.bodyText.toLowerCase().includes(avoidItem.toLowerCase())
      ? 'blocked'
      : 'clear'
  }

  // Compute differentiation profile
  const diffProfile: DifferentiationProfile = {
    openingPremise: bodyResult.differentiationHints.openingPremise ?? angle.differentiationProfile.openingPremise ?? 'observation',
    primaryAngle:   bodyResult.differentiationHints.primaryAngle   ?? angle.strategyAngle,
    trustAngle:     bodyResult.differentiationHints.trustAngle      ?? angle.differentiationProfile.trustAngle ?? 'direct',
    ctaFraming:     bodyResult.differentiationHints.ctaFraming      ?? angle.differentiationProfile.ctaFraming ?? 'soft_ask',
    length:         lengthTarget,
    specificity:    strategy.personalization_level ?? 'lead_specific',
    structure:      bodyResult.differentiationHints.structure        ?? angle.differentiationProfile.structure  ?? 'observation_led',
    evidence:       bodyResult.differentiationHints.evidence         ?? angle.differentiationProfile.evidence   ?? 'none',
  }

  const generationNotes = [
    `Angle: ${angle.versionLabel}. ${angle.bodyIntent}`,
    repairNote || '',
  ].filter(Boolean).join(' ')

  return {
    versionNumber,
    versionLabel:                angle.versionLabel,
    strategyAngle:               angle.strategyAngle,
    subjectLine,
    previewText,
    bodyText:                    bodyResult.bodyText,
    bodyHtml:                    null,
    selectedSkills:              strategy.selected_skills ?? [],
    skillVersions,
    complianceNotesApplied:      strategy.compliance_notes ?? [],
    requiredInclusionsSatisfied,
    avoidedElementsChecked,
    generationNotes,
    copyConstraints: {
      lengthTarget,
      tone:                strategy.tone,
      personalizationLevel:strategy.personalization_level,
      offerAngle:          strategy.offer_angle,
    },
    personalizationUsed:         bodyResult.personalizationUsed,
    personalizationGaps:         bodyResult.personalizationGaps,
    differentiationProfile:      diffProfile,
    isValid:                     true,
    repairAttempts:              [],
  }
}

// ---- Gate check ----

export async function canGenerateMessageVersions(
  strategyId: string,
  tenantId:   string
): Promise<CanGenerateResult> {
  // Check system controls first
  const [paused, engine] = await Promise.all([
    sysCtrlRepo.getBooleanControl('global_agent_pause', tenantId, false),
    sysCtrlRepo.resolveSystemControl('email_generation_engine', tenantId),
  ])

  if (paused) {
    return { allowed: false, reason: 'Global agent pause is active.', errorCode: COPY_ERROR_CODES.COPY_008 }
  }
  if (!engine || String(engine.value) !== 'phase3b') {
    return { allowed: false, reason: 'Phase 3B email generation is not enabled.', errorCode: COPY_ERROR_CODES.COPY_009 }
  }

  // Load strategy
  const strategy = await stratRepo.getMessageStrategyById(strategyId, tenantId)
  if (!strategy) {
    return { allowed: false, reason: 'Strategy not found.', errorCode: COPY_ERROR_CODES.COPY_001 }
  }
  if (strategy.status === 'superseded') {
    return { allowed: false, reason: 'Strategy is superseded — regenerate a new strategy first.', errorCode: COPY_ERROR_CODES.COPY_007 }
  }
  if (strategy.status === 'error') {
    return { allowed: false, reason: 'Strategy has blocking errors — resolve strategy errors first.', errorCode: COPY_ERROR_CODES.COPY_002 }
  }
  if (strategy.confidence_score < 0.50) {
    return { allowed: false, reason: `Confidence score too low: ${strategy.confidence_score.toFixed(3)} (minimum 0.50).`, errorCode: COPY_ERROR_CODES.COPY_003 }
  }
  if (strategy.requires_human_review && strategy.status !== 'approved') {
    return { allowed: false, reason: 'Strategy requires human review and has not been approved.', errorCode: COPY_ERROR_CODES.COPY_004 }
  }
  if ((strategy.invalid_reasons ?? []).some((e: { blocking: boolean }) => e.blocking)) {
    return { allowed: false, reason: 'Strategy has blocking invalid reasons.', errorCode: COPY_ERROR_CODES.COPY_002 }
  }
  const hasComplianceSkill = (strategy.selected_skills ?? []).some(
    (s: SelectedSkill) => s.skill_slug === 'compliance_forbidden_claims'
  )
  if (!hasComplianceSkill) {
    return { allowed: false, reason: 'Compliance skill (compliance_forbidden_claims) is missing from strategy.', errorCode: COPY_ERROR_CODES.COPY_005 }
  }
  // Company name required for cold outreach
  if (strategy.message_type === 'cold_outreach' && !strategy.lead_source) {
    // Check via strategy's own company info — we check lead_source as a proxy if company_name is stored
    // The actual company name check happens in the service during generation
  }

  return { allowed: true }
}

// ---- Main: generateMessageVersions ----

export async function generateMessageVersions(
  input: CopywritingInput
): Promise<CopywritingResult> {
  const { strategyId, tenantId, forceRegenerate = false } = input
  const allWarnings: CopywritingWarning[] = []
  let agentRunId: string | null = null

  // ---- Create agent run ----
  let run: Awaited<ReturnType<typeof agentLog.startAgentRun>> | null = null
  try {
    run = await agentLog.startAgentRun({
      tenantId,
      agentName:    AGENT_NAME,
      runType:      RUN_TYPE as 'generation',
      triggerSource:'direct_call',
      subjectType:  'lead',
      inputSnapshot:{ strategy_id: strategyId },
    })
    agentRunId = run.id
  } catch {
    agentRunId = null
  }

  async function logStep(stepName: string, stepIndex: number, input: Record<string, unknown> = {}) {
    if (!agentRunId) return null
    return agentLog.logAgentRunStep({ tenantId, agentRunId, stepName, stepIndex, input }).catch(() => null)
  }

  // ---- Step 1: Load strategy ----
  const step1 = await logStep(COPY_AGENT_STEPS.LOAD_STRATEGY, 1, { strategy_id: strategyId })

  const strategy = await stratRepo.getMessageStrategyById(strategyId, tenantId)
  if (!strategy) {
    if (step1) await agentLog.failAgentRunStep(step1.id, 'Strategy not found').catch(() => null)
    if (agentRunId) await agentLog.failAgentRun(agentRunId, 'Strategy not found').catch(() => null)
    return failResult([makeError(COPY_ERROR_CODES.COPY_001, 'critical', 'Strategy not found.', 'Check strategy_id and tenant.')], allWarnings, agentRunId)
  }
  if (step1) await agentLog.completeAgentRunStep(step1.id, {
    outputSummary: `Strategy loaded: ${strategy.message_type}`,
    output: { status: strategy.status, message_type: strategy.message_type, confidence_score: strategy.confidence_score },
  }).catch(() => null)

  // ---- Step 2: Gate check ----
  const step2 = await logStep(COPY_AGENT_STEPS.GATE_CHECK, 2, {
    status: strategy.status, confidence: strategy.confidence_score, requires_human_review: strategy.requires_human_review,
  })

  const gate = await canGenerateMessageVersions(strategyId, tenantId)
  if (!gate.allowed) {
    if (step2) await agentLog.failAgentRunStep(step2.id, gate.reason ?? 'Gate check failed').catch(() => null)
    if (agentRunId) await agentLog.failAgentRun(agentRunId, gate.reason ?? 'Gate check failed').catch(() => null)
    const errCode = gate.errorCode ?? COPY_ERROR_CODES.COPY_002
    return failResult([makeError(errCode, 'critical', gate.reason ?? 'Gate check failed', 'Resolve the gate condition before generating versions.')], allWarnings, agentRunId)
  }

  // Company name gate for cold outreach
  if (strategy.message_type === 'cold_outreach') {
    const supabase = createSupabaseServiceClient()
    const { data: leadRow } = await supabase.from('leads').select('company_id').eq('id', strategy.lead_id).eq('tenant_id', tenantId).maybeSingle()
    if (leadRow?.company_id) {
      const { data: companyRow } = await supabase.from('companies').select('name').eq('id', leadRow.company_id).maybeSingle()
      if (!companyRow?.name) {
        if (step2) await agentLog.failAgentRunStep(step2.id, 'Company name missing for cold outreach').catch(() => null)
        if (agentRunId) await agentLog.failAgentRun(agentRunId, 'Company name missing for cold outreach').catch(() => null)
        return failResult([makeError(COPY_ERROR_CODES.COPY_017, 'critical', 'Cold outreach requires a company name.', 'Update the lead company record.')], allWarnings, agentRunId)
      }
    }
  }

  if (step2) await agentLog.completeAgentRunStep(step2.id, { outputSummary: 'Gate check passed.' }).catch(() => null)

  // ---- Load lead context ----
  const ctx = await loadLeadContext(strategy.lead_id, tenantId, strategy)

  // ---- Step 3: Load selected skill definitions ----
  const step3 = await logStep(COPY_AGENT_STEPS.LOAD_SELECTED_SKILLS, 3, {
    skill_slugs: (strategy.selected_skills ?? []).map((s: SelectedSkill) => s.skill_slug),
  })

  const loadedSkills: CopywritingSkillDefinition[] = []
  for (const sk of (strategy.selected_skills ?? [])) {
    const def = getSkillDefinition(sk.skill_slug, sk.skill_version)
    if (!def) {
      if (step3) await agentLog.failAgentRunStep(step3.id, `Skill missing: ${sk.skill_slug} v${sk.skill_version}`).catch(() => null)
      if (agentRunId) await agentLog.failAgentRun(agentRunId, `Skill definition missing: ${sk.skill_slug}`).catch(() => null)
      return failResult([makeError(COPY_ERROR_CODES.COPY_006, 'critical', `Skill definition not found: ${sk.skill_slug} v${sk.skill_version}`, 'Ensure all selected skills are present in the skill definitions module.')], allWarnings, agentRunId)
    }
    loadedSkills.push(def)
  }
  if (step3) await agentLog.completeAgentRunStep(step3.id, {
    outputSummary: `${loadedSkills.length} skills loaded`,
    output: { skills_loaded: loadedSkills.length },
  }).catch(() => null)

  // ---- Step 4: Build version plan ----
  const step4 = await logStep(COPY_AGENT_STEPS.BUILD_VERSION_PLAN, 4, {
    message_type: strategy.message_type,
    sequence_position: strategy.sequence_position,
  })

  const hasConversationNotes = !!(strategy as unknown as Record<string, unknown>)['conversation_notes']
  const hasNurtureTrigger    = !!(strategy as unknown as Record<string, unknown>)['nurture_trigger']

  const plan = buildVersionPlan(strategy.message_type, {
    sequencePosition:     strategy.sequence_position ?? 1,
    hasConversationNotes,
    hasNurtureTrigger,
  })

  if (plan.angles.length === 0) {
    if (step4) await agentLog.failAgentRunStep(step4.id, `Unsupported message type: ${strategy.message_type}`).catch(() => null)
    if (agentRunId) await agentLog.failAgentRun(agentRunId, 'Unsupported message type').catch(() => null)
    return failResult([makeError(COPY_ERROR_CODES.COPY_010, 'critical', `Message type '${strategy.message_type}' is not supported.`, 'Check the strategy message_type.')], allWarnings, agentRunId)
  }

  if (step4) await agentLog.completeAgentRunStep(step4.id, {
    outputSummary: `Version plan: ${plan.requiredVersionCount} versions for ${plan.messageType}`,
    output: { required_count: plan.requiredVersionCount, angles: plan.angles.map(a => a.versionLabel) },
  }).catch(() => null)

  // ---- Supersede prior pending versions if regeneration ----
  if (forceRegenerate) {
    await repo.supersedeVersionsForStrategy(strategyId, tenantId).catch(() => null)
  } else {
    const existing = await repo.listMessageVersionsForStrategy(strategyId, tenantId, { limit: 1 })
    if (existing.length > 0) {
      await repo.supersedeVersionsForStrategy(strategyId, tenantId).catch(() => null)
    }
  }

  // ---- Budget preflight (fail-open) ----
  let _copywritingPreflight = { allowed: true }
  try {
    _copywritingPreflight = await preflightCheck({
      tenantId,
      agentName:       AGENT_NAME,
      leadId:          strategy.lead_id ?? null,
      estimatedTokens: 0,
      modelName:       'claude-sonnet-4-6',
    })
  } catch (err) {
    console.error('[copywriting-agent] Budget preflight failed — allowing call:', err)
  }
  if (!_copywritingPreflight.allowed) {
    agentDecisionRepo.createDecision({
      tenantId,
      agentName:      AGENT_NAME,
      decisionType:   'budget_blocked',
      decisionStatus: 'blocked',
      leadId:         strategy.lead_id ?? null,
      shortReason:    `Budget exhausted at level: ${(_copywritingPreflight as { budgetLevel?: string }).budgetLevel}`,
    }).catch(() => {})
    if (agentRunId) await agentLog.failAgentRun(agentRunId, 'AI budget exhausted').catch(() => null)
    return failResult([makeError(COPY_ERROR_CODES.COPY_002, 'critical', 'AI budget exhausted — copywriting blocked.', 'Increase the AI budget limit.')], allWarnings, agentRunId)
  }

  // ---- Step 5: Generate candidate versions ----
  const step5 = await logStep(COPY_AGENT_STEPS.GENERATE_CANDIDATE_VERSIONS, 5, {
    angle_count: plan.angles.length,
  })

  const retryState = createRetryState()
  const validDrafts: MessageVersionDraft[] = []

  // Gated LLM body generation (default off → deterministic, unchanged). When on, each
  // candidate's body comes from the LLM; it still passes the same validators below.
  const llmEnabled = await sysCtrlRepo.getBooleanControl(
    SystemControlKey.COPYWRITING_AGENT_LLM_ENABLED, tenantId, false,
  )
  let llmPromptTokens = 0
  let llmCompletionTokens = 0
  let llmModelUsed: string | null = null

  for (let vn = 1; vn <= plan.requiredVersionCount; vn++) {
    let draft: MessageVersionDraft | null = null
    let attemptsDone = 0

    while (attemptsDone <= MAX_RETRY_ATTEMPTS) {
      // Try the LLM body when enabled; null result → deterministic fallback.
      let llmBody: BodyGenerationResult | undefined
      if (llmEnabled) {
        const angle = plan.angles[vn - 1]
        const out = angle ? await generateBodyWithLlm(angle, strategy, ctx) : null
        if (out) {
          llmBody = out.result
          llmPromptTokens     += out.promptTokens
          llmCompletionTokens += out.completionTokens
          llmModelUsed         = out.modelName
        }
      }

      try {
        draft = buildCandidate(vn, plan, strategy, ctx, loadedSkills, '', llmBody)
      } catch {
        draft = null
        break
      }

      // ---- Steps 6 & 7: Compliance + Structural validation ----
      const complianceResult  = checkCompliance(draft, strategy, ctx)
      const structuralResult  = checkStructure(draft)
      draft.complianceCheckResult = complianceResult
      draft.structuralCheckResult = structuralResult
      draft.isValid = complianceResult.passed && structuralResult.passed

      // Collect warnings
      for (const w of structuralResult.warnings) {
        allWarnings.push({ code: w, message: `Version ${vn}: ${w}`, affectedVersionNumber: vn })
      }

      if (draft.isValid) break

      // Determine primary error for retry eligibility
      const allErrors = [...complianceResult.errors, ...structuralResult.errors]
      const primaryError = getPrimaryError(allErrors)

      if (!primaryError || !canRetry(retryState, vn, primaryError)) {
        // Cannot retry — discard
        recordRetryAttempt(retryState, vn, primaryError ?? COPY_ERROR_CODES.COPY_016, allErrors.join(', '), 'discarded')
        draft = null
        break
      }

      // Record retry attempt and try again
      recordRetryAttempt(retryState, vn, primaryError, allErrors.join(', '), 'repaired')
      attemptsDone++
      draft = null
    }

    if (draft && draft.isValid) {
      // Attach repair notes
      const myAttempts = retryState.repairs.filter(r => r.versionNumber === vn)
      if (myAttempts.length > 0) {
        draft.generationNotes += ' ' + buildRepairNote(myAttempts)
        draft.repairAttempts = myAttempts
      }
      validDrafts.push(draft)
    }
  }

  if (step5) await agentLog.completeAgentRunStep(step5.id, {
    outputSummary: `${validDrafts.length}/${plan.requiredVersionCount} candidates generated`,
    output: { candidates_generated: validDrafts.length },
  }).catch(() => null)

  // Log compliance and structural steps
  await agentLog.logAgentRunStep({ tenantId, agentRunId: agentRunId ?? '', stepName: COPY_AGENT_STEPS.COMPLIANCE_VALIDATION, stepIndex: 6, input: { candidate_count: validDrafts.length } }).catch(() => null)
  await agentLog.logAgentRunStep({ tenantId, agentRunId: agentRunId ?? '', stepName: COPY_AGENT_STEPS.STRUCTURAL_VALIDATION, stepIndex: 7, input: { candidate_count: validDrafts.length } }).catch(() => null)

  // ---- Step 8: Repair/retry summary ----
  const step8 = await logStep(COPY_AGENT_STEPS.REPAIR_RETRY, 8, {
    failed_count: plan.requiredVersionCount - validDrafts.length,
    repair_attempts: retryState.repairs.length,
  })
  if (step8) await agentLog.completeAgentRunStep(step8.id, {
    outputSummary: `${validDrafts.length} valid after retries`,
    output: { repaired: retryState.repairs.filter(r => r.outcome === 'repaired').length, discarded: retryState.repairs.filter(r => r.outcome === 'discarded').length, valid_count: validDrafts.length },
  }).catch(() => null)

  // Check if required count is met
  if (validDrafts.length < plan.requiredVersionCount) {
    if (agentRunId) await agentLog.failAgentRun(agentRunId, `Required version count not met: ${validDrafts.length}/${plan.requiredVersionCount}`).catch(() => null)
    return failResult([makeError(COPY_ERROR_CODES.COPY_018, 'blocking', `Could not produce ${plan.requiredVersionCount} compliant versions. Got ${validDrafts.length}.`, 'Retry generation or adjust the strategy.')], allWarnings, agentRunId)
  }

  // ---- Step 9: Differentiation validation ----
  const step9 = await logStep(COPY_AGENT_STEPS.DIFFERENTIATION_VALIDATION, 9, {
    version_count: validDrafts.length,
  })

  let diffResult = checkDifferentiation(validDrafts)

  if (!diffResult.passed) {
    // Try to repair failing pairs
    for (const failingPair of diffResult.failingPairs) {
      const weakerVersion = identifyWeakerVersionInPair(validDrafts, failingPair)
      if (weakerVersion !== null && canRetry(retryState, weakerVersion, COPY_ERROR_CODES.COPY_018)) {
        const idx = validDrafts.findIndex(d => d.versionNumber === weakerVersion)
        if (idx !== -1) {
          try {
            const repaired = buildCandidate(weakerVersion, plan, strategy, ctx, loadedSkills, 'Regenerated for differentiation improvement.')
            const cResult  = checkCompliance(repaired, strategy, ctx)
            const sResult  = checkStructure(repaired)
            if (cResult.passed && sResult.passed) {
              validDrafts[idx] = repaired
              recordRetryAttempt(retryState, weakerVersion, COPY_ERROR_CODES.COPY_018, 'Differentiation failed', 'repaired')
            }
          } catch {
            // skip
          }
        }
      }
    }

    diffResult = checkDifferentiation(validDrafts)

    if (!diffResult.passed) {
      if (step9) await agentLog.completeAgentRunStep(step9.id, {
        guardrailStatus: 'blocked',
        outputSummary:   `Differentiation failed: ${diffResult.failingPairs.join(', ')}`,
      }).catch(() => null)
      if (agentRunId) await agentLog.failAgentRun(agentRunId, 'Differentiation validation failed').catch(() => null)
      return failResult([makeError(COPY_ERROR_CODES.COPY_018, 'blocking', 'Generated versions are not meaningfully differentiated.', 'Retry generation.')], allWarnings, agentRunId)
    }
  }

  if (step9) await agentLog.completeAgentRunStep(step9.id, {
    outputSummary: `Differentiation passed: ${validDrafts.length} versions`,
    output: { pairs_checked: Object.keys(diffResult.pairwiseResults).length },
  }).catch(() => null)

  // ---- Step 10: Persistence ----
  const step10 = await logStep(COPY_AGENT_STEPS.PERSISTENCE, 10, { status: 'pending' })

  const persistedVersions: MessageVersion[] = []
  try {
    for (const draft of validDrafts) {
      const persisted = await repo.createMessageVersion({
        tenant_id:                     tenantId,
        strategy_id:                   strategyId,
        lead_id:                       strategy.lead_id,
        company_id:                    strategy.company_id ?? null,
        campaign_id:                   strategy.campaign_id ?? null,
        agent_run_id:                  agentRunId,
        subject_line:                  draft.subjectLine,
        preview_text:                  draft.previewText,
        body_text:                     draft.bodyText,
        body_html:                     null,
        message_type:                  strategy.message_type,
        version_label:                 draft.versionLabel,
        version_number:                draft.versionNumber,
        strategy_angle:                draft.strategyAngle,
        selected_skills:               draft.selectedSkills,
        skill_versions:                draft.skillVersions,
        source_strategy_snapshot:      strategy as unknown as Record<string, unknown>,
        compliance_notes_applied:      draft.complianceNotesApplied,
        required_inclusions_satisfied: draft.requiredInclusionsSatisfied,
        avoided_elements_checked:      draft.avoidedElementsChecked,
        generation_notes:              draft.generationNotes,
        copy_constraints:              draft.copyConstraints,
        personalization_used:          draft.personalizationUsed,
        personalization_gaps:          draft.personalizationGaps,
      })
      persistedVersions.push(persisted)
    }
    if (step10) await agentLog.completeAgentRunStep(step10.id, {
      outputSummary: `Persisted ${persistedVersions.length} versions`,
      output: { versions_stored: persistedVersions.length, version_ids: persistedVersions.map(v => v.id) },
    }).catch(() => null)
  } catch (ex) {
    if (step10) await agentLog.failAgentRunStep(step10.id, String(ex)).catch(() => null)
    if (agentRunId) await agentLog.failAgentRun(agentRunId, String(ex)).catch(() => null)
    return failResult([makeError(COPY_ERROR_CODES.COPY_016, 'critical', `Persistence failed: ${String(ex)}`, 'Check database connectivity.')], allWarnings, agentRunId)
  }

  // ---- Step 11: Complete agent run ----
  if (agentRunId) {
    await agentLog.completeAgentRun(agentRunId, {
      outputSnapshot: {
        strategy_id:         strategyId,
        versions_generated:  persistedVersions.length,
        version_ids:         persistedVersions.map(v => v.id),
        message_type:        strategy.message_type,
      },
    }).catch(() => null)

    await agentLog.logAgentRunStep({
      tenantId, agentRunId, stepName: COPY_AGENT_STEPS.RESULT_RETURNED, stepIndex: 11,
      input: { strategy_id: strategyId },
    }).catch(() => null)
  }

  // ---- Activity event ----
  await activitySvc.recordActivity({
    tenantId,
    eventType:    ActivityEventType.MESSAGE_VERSIONS_GENERATED,
    eventSource:  'copywriting_agent',
    entityType:   'lead',
    entityId:     strategy.lead_id,
    leadId:       strategy.lead_id,
    eventSummary: `Generated ${persistedVersions.length} message versions for ${strategy.message_type}`,
    metadata: {
      strategy_id:             strategyId,
      generated_version_count: persistedVersions.length,
      version_ids:             persistedVersions.map(v => v.id),
      message_type:            strategy.message_type,
      agent_run_id:            agentRunId,
    },
  }).catch(() => null)

  // ---- Record AI usage ----
  // Real token counts + model when the gated LLM path generated the bodies; the
  // deterministic path records a zero-token row (cost computed by recordUsage).
  const usedLlm = llmModelUsed !== null
  aiUsageRepo.recordUsage({
    tenantId,
    agentName:    AGENT_NAME,
    featureName:  'version_copywriting',
    modelName:    usedLlm ? llmModelUsed! : 'claude-sonnet-4-6',
    promptTokens: usedLlm ? llmPromptTokens : 0,
    completionTokens: usedLlm ? llmCompletionTokens : 0,
    totalTokens:  usedLlm ? llmPromptTokens + llmCompletionTokens : 0,
    estimatedCostUsd: usedLlm ? undefined : 0,
    leadId:       strategy.lead_id ?? null,
    success:      true,
  }).catch((err) => console.error('[copywriting-agent] Failed to record AI usage event:', err))

  const skillsSelected = (strategy.selected_skills ?? []).map((s: SelectedSkill) => s.skill_slug)
  agentDecisionRepo.createDecision({
    tenantId,
    agentName:      AGENT_NAME,
    agentVersion:   'rules-v1',
    decisionType:   'versions_generated',
    decisionStatus: 'completed',
    leadId:         strategy.lead_id,
    shortReason:    `${persistedVersions.length} versions generated via ${skillsSelected.join(', ')}`,
    inputSnapshot:  { strategy_id: strategyId, version_count_requested: plan.requiredVersionCount, skills_selected: skillsSelected },
    outputSummary:  { version_count_produced: persistedVersions.length, top_label: persistedVersions[0]?.versionLabel ?? null },
    learningTags:   skillsSelected,
  }).catch((err) => console.error('[copywriting-agent] Failed to write agent decision:', err))

  return {
    success: true,
    versions: persistedVersions,
    warnings: allWarnings,
    agentRunId: agentRunId ?? '',
    generationSummary: `${persistedVersions.length} versions generated for ${strategy.message_type}. Labels: ${persistedVersions.map(v => v.versionLabel).join(', ')}.`,
  }
}

// ---- Public read functions ----

export async function getMessageVersion(
  versionId: string,
  tenantId:  string
): Promise<MessageVersion | null> {
  return repo.getMessageVersionById(versionId, tenantId)
}

export async function listMessageVersionsForStrategy(
  strategyId: string,
  tenantId:   string,
  opts:       { limit?: number; includeSuperseded?: boolean } = {}
): Promise<MessageVersion[]> {
  return repo.listMessageVersionsForStrategy(strategyId, tenantId, opts)
}

export async function listMessageVersionsForLead(
  leadId:   string,
  tenantId: string,
  opts:     { limit?: number } = {}
): Promise<MessageVersion[]> {
  return repo.listMessageVersionsForLead(leadId, tenantId, opts)
}

export async function supersedeVersionsForStrategy(
  strategyId: string,
  tenantId:   string
): Promise<void> {
  return repo.supersedeVersionsForStrategy(strategyId, tenantId)
}

export async function selectMessageVersion(
  versionId: string,
  tenantId:  string,
  userId:    string
): Promise<MessageVersion | null> {
  return repo.selectMessageVersion(versionId, tenantId, userId)
}

export async function rejectMessageVersion(
  versionId:        string,
  tenantId:         string,
  userId:           string,
  rejectionReason?: string
): Promise<MessageVersion | null> {
  return repo.rejectMessageVersion(versionId, tenantId, userId, rejectionReason)
}
