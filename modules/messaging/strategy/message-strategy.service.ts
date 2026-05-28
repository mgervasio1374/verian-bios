// ============================================================
// Phase 3B — Message Strategy Agent Service
// The public boundary of the Message Strategy Agent.
// All external callers import from this file only.
// Orchestrates: normalizer → system controls → pre-flight →
// decision tree → skill selector → strategy builder →
// confidence scorer → validator → persist → agent run trace.
// ============================================================

import * as repo from '@/modules/messaging/repositories/message-strategy.repo'
import { normalizeStrategyInput } from './message-strategy.normalizer'
import { selectMessageType } from './message-strategy.decision-tree'
import { selectSkills } from './message-strategy.skill-selector'
import { calculateConfidence, getConfidenceBand } from './message-strategy.confidence'
import { validateStrategy } from './message-strategy.validation'
import { applyOverride } from './message-strategy.override'
import * as agentLog from '@/modules/intelligence/services/agent-run-logging.service'
import * as activitySvc from '@/modules/intelligence/services/activity-event.service'
import * as systemControlRepo from '@/modules/intelligence/repositories/system-control.repo'
import {
  MESSAGE_TYPES,
  STRATEGY_ERROR_CODES,
  STRATEGY_STATUSES,
  SKILL_SLUGS,
  LENGTH_TARGETS,
  TONES,
  PERSONALIZATION_LEVELS,
  OFFER_ANGLES,
  PARTNER_NAMES,
} from './message-strategy.types'
import type {
  StrategyInput,
  MessageStrategy,
  StrategyResult,
  StrategyError,
  StrategyWarning,
  NormalizedStrategyInput,
  StrategyOverrideRequest,
  StrategyOverrideLogEntry,
  MessageType,
  OfferAngle,
  Tone,
  LengthTarget,
  PersonalizationLevel,
} from './message-strategy.types'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import * as agentDecisionRepo from '@/modules/intelligence/repositories/agent-decision.repo'
import * as aiUsageRepo from '@/modules/intelligence/repositories/ai-usage-event.repo'
import { preflightCheck } from '@/modules/intelligence/services/ai-budget-enforcer.service'

// ---- Constants ----

const AGENT_NAME = 'message_strategy_agent'
const RUN_TYPE   = 'generation'

// ---- Helpers ----

function makeStrategyError(
  code:          StrategyError['code'],
  severity:      StrategyError['severity'],
  message:       string,
  suggested_fix: string,
  can_override:  boolean,
  blocking       = true
): StrategyError {
  return { code, severity, message, suggested_fix, can_override, blocking }
}

function failResult(
  errors:       StrategyError[],
  warnings:     StrategyWarning[],
  agentRunId:   string | null,
  strategy?:    Partial<MessageStrategy>
): StrategyResult {
  return { success: false, errors, warnings, strategy: strategy ?? null, agent_run_id: agentRunId }
}

// ---- Main: generateMessageStrategy ----

export async function generateMessageStrategy(
  input:    StrategyInput,
  tenantId: string
): Promise<StrategyResult> {
  const allWarnings: StrategyWarning[] = []
  let agentRunId: string | null = null

  // Create agent_run record immediately (even pre-flight blocks get a run)
  let run: Awaited<ReturnType<typeof agentLog.startAgentRun>> | null = null
  try {
    run = await agentLog.startAgentRun({
      tenantId,
      agentName:   AGENT_NAME,
      runType:     RUN_TYPE as 'generation',
      triggerSource:'direct_call',
      subjectType: 'lead',
      subjectId:   input.lead.lead_id ?? undefined,
      inputSnapshot:{
        lead_id:              input.lead.lead_id,
        lead_source:          input.lead.lead_source,
        lead_stage:           input.lead.lead_stage,
        has_statement_artifact: input.statement?.has_statement_artifact ?? false,
        partner_membership_confirmed: input.partner?.partner_membership_confirmed ?? false,
        prior_touch_count:    input.lead.prior_touch_count ?? 0,
      },
    })
    agentRunId = run.id
  } catch {
    // Agent run creation failure should not block strategy generation, but log it
    agentRunId = null
  }

  const stepInputs = { lead_id: input.lead.lead_id, tenant_id: tenantId }

  // ---- Step 1: Input normalization ----
  const step1 = agentRunId ? await agentLog.logAgentRunStep({
    tenantId, agentRunId: agentRunId!, stepName: 'input_normalization', stepIndex: 1,
    input: { field_count: Object.keys(input).length },
  }).catch(() => null) : null

  let n: NormalizedStrategyInput
  try {
    n = normalizeStrategyInput(input)
    allWarnings.push(...n.warnings)
    if (step1) await agentLog.completeAgentRunStep(step1.id, {
      outputSummary: `Normalized. Warnings: ${n.warnings.length}`,
      output: { warning_codes: n.warnings.map(w => w.code) },
    }).catch(() => null)
  } catch (ex) {
    if (step1) await agentLog.failAgentRunStep(step1.id, String(ex)).catch(() => null)
    if (agentRunId) await agentLog.failAgentRun(agentRunId, String(ex)).catch(() => null)
    const e = makeStrategyError(STRATEGY_ERROR_CODES.STRAT_003, 'critical', `Input normalization failed: ${String(ex)}`, 'Check input data for malformed values.', false)
    return failResult([e], allWarnings, agentRunId)
  }

  // ---- Step 2: Pre-flight + System control checks ----
  const step2 = agentRunId ? await agentLog.logAgentRunStep({
    tenantId, agentRunId: agentRunId!, stepName: 'pre_flight_check', stepIndex: 2,
    input: { opted_out: n.lead.opted_out, global_agent_pause: n.systemControls.global_agent_pause, engine: n.systemControls.email_generation_engine },
  }).catch(() => null) : null

  const preflightErrors = runPreFlightChecks(n)
  if (preflightErrors.length > 0) {
    if (step2) await agentLog.failAgentRunStep(step2.id, preflightErrors.map(e => e.code).join(', ')).catch(() => null)
    if (agentRunId) await agentLog.failAgentRun(agentRunId, `Pre-flight blocked: ${preflightErrors[0].code}`).catch(() => null)
    return failResult(preflightErrors, allWarnings, agentRunId)
  }

  if (step2) await agentLog.completeAgentRunStep(step2.id, { outputSummary: 'Pre-flight passed.' }).catch(() => null)

  // ---- Step 3: Message type selection ----
  const step3 = agentRunId ? await agentLog.logAgentRunStep({
    tenantId, agentRunId: agentRunId!, stepName: 'message_type_selection', stepIndex: 3,
    input: stepInputs,
  }).catch(() => null) : null

  const dtResult = selectMessageType(n)
  allWarnings.push(...dtResult.warnings)
  const selectedType = dtResult.message_type

  if (step3) await agentLog.completeAgentRunStep(step3.id, {
    decisionSummary: `Selected: ${selectedType}. Reason: ${dtResult.reason}`,
    outputSummary:   selectedType,
    output: { message_type: selectedType, alternatives: dtResult.alternative_angles.length },
  }).catch(() => null)

  // ---- Step 4: Skill selection ----
  const step4 = agentRunId ? await agentLog.logAgentRunStep({
    tenantId, agentRunId: agentRunId!, stepName: 'skill_selection', stepIndex: 4,
    input: { message_type: selectedType },
  }).catch(() => null) : null

  const skillResult = selectSkills(selectedType, n)
  if (skillResult.errors.length > 0) {
    if (step4) await agentLog.failAgentRunStep(step4.id, skillResult.errors.map(e => e.code).join(', ')).catch(() => null)
    if (agentRunId) await agentLog.failAgentRun(agentRunId, `Skill selection error: ${skillResult.errors[0].code}`).catch(() => null)
    return failResult(skillResult.errors, allWarnings, agentRunId)
  }
  if (step4) await agentLog.completeAgentRunStep(step4.id, {
    outputSummary: `${skillResult.selected_skills.length} skills selected`,
    output: { skills: skillResult.selected_skills.map(s => s.skill_slug) },
  }).catch(() => null)

  // ---- Step 5: Strategy object population ----
  const step5 = agentRunId ? await agentLog.logAgentRunStep({
    tenantId, agentRunId: agentRunId!, stepName: 'strategy_object_population', stepIndex: 5,
    input: { message_type: selectedType, skill_count: skillResult.selected_skills.length },
  }).catch(() => null) : null

  const strategyObj = buildStrategyObject(tenantId, selectedType, dtResult.alternative_angles, skillResult, n)

  if (step5) await agentLog.completeAgentRunStep(step5.id, {
    outputSummary: `Strategy populated. Personalization: ${strategyObj.personalization_level}`,
  }).catch(() => null)

  // ---- Step 6: Confidence scoring ----
  const step6 = agentRunId ? await agentLog.logAgentRunStep({
    tenantId, agentRunId: agentRunId!, stepName: 'confidence_scoring', stepIndex: 6,
    input: { message_type: selectedType },
  }).catch(() => null) : null

  const breakdown = calculateConfidence(selectedType, skillResult.selected_skills, n)
  strategyObj.confidence_score = breakdown.final_score

  // Append breakdown to reasoning
  const band = getConfidenceBand(breakdown.final_score)
  strategyObj.reasoning += `\n\nConfidence score: ${breakdown.final_score.toFixed(3)} (${band}). ` +
    `Trigger match: +${breakdown.trigger_match_bonus}, Source/stage agree: +${breakdown.source_stage_agree_bonus}, ` +
    `Required inputs: +${breakdown.required_inputs_present_bonus}, Industry known: +${breakdown.industry_known_bonus}, ` +
    `Prior touch: +${breakdown.prior_touch_known_bonus}, Campaign: +${breakdown.campaign_context_bonus}, Evidence: +${breakdown.evidence_confirmed_bonus}. ` +
    `Penalties: contact_name: ${breakdown.contact_name_penalty}, company_name: ${breakdown.company_name_penalty}, ` +
    `industry: ${breakdown.industry_unknown_penalty}, source: ${breakdown.ambiguous_source_penalty}, ` +
    `signals: ${breakdown.conflicting_signals_penalty}.`

  if (step6) await agentLog.completeAgentRunStep(step6.id, {
    confidence:   breakdown.final_score,
    outputSummary:`Score: ${breakdown.final_score.toFixed(3)} (${band})`,
  }).catch(() => null)

  // ---- Step 7: Validation ----
  const step7 = agentRunId ? await agentLog.logAgentRunStep({
    tenantId, agentRunId: agentRunId!, stepName: 'invalid_strategy_validation', stepIndex: 7,
    input: { confidence: breakdown.final_score },
  }).catch(() => null) : null

  const validationResult = validateStrategy(strategyObj, n)
  allWarnings.push(...validationResult.warnings)
  strategyObj.invalid_reasons = validationResult.errors

  // Determine requires_human_review
  const hasBlockingErrors = validationResult.errors.some(e => e.blocking)
  strategyObj.status = hasBlockingErrors ? STRATEGY_STATUSES.ERROR : STRATEGY_STATUSES.DRAFT
  strategyObj.requires_human_review =
    hasBlockingErrors ||
    breakdown.final_score < 0.70 ||
    n.systemControls.require_strategy_review ||
    selectedType === MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP  // always review before copy references findings
      && !n.statement.review_summary

  if (step7) await agentLog.completeAgentRunStep(step7.id, {
    guardrailStatus: hasBlockingErrors ? 'blocked' : 'clear',
    outputSummary:   `Errors: ${validationResult.errors.length}, Warnings: ${validationResult.warnings.length}`,
  }).catch(() => null)

  // ---- Budget preflight (fail-open: outage must not silence agents) ----
  let _strategyPreflight = { allowed: true }
  try {
    _strategyPreflight = await preflightCheck({
      tenantId,
      agentName:       AGENT_NAME,
      leadId:          n.lead.lead_id ?? null,
      estimatedTokens: 0,
      modelName:       'claude-sonnet-4-6',
    })
  } catch (err) {
    console.error('[message-strategy-agent] Budget preflight failed — allowing call:', err)
  }
  if (!_strategyPreflight.allowed) {
    agentDecisionRepo.createDecision({
      tenantId,
      agentName:      AGENT_NAME,
      decisionType:   'budget_blocked',
      decisionStatus: 'blocked',
      leadId:         n.lead.lead_id ?? null,
      shortReason:    `Budget exhausted at level: ${(_strategyPreflight as { budgetLevel?: string }).budgetLevel}`,
    }).catch(() => {})
    const e = makeStrategyError(STRATEGY_ERROR_CODES.STRAT_003, 'critical', 'AI budget exhausted — strategy generation blocked.', 'Increase the AI budget limit or wait for the next period.', false)
    return failResult([e], allWarnings, agentRunId)
  }

  // ---- Supersede prior active strategies ----
  try {
    await repo.supersedeActiveStrategies(n.lead.lead_id, tenantId)
  } catch {
    // non-fatal — continue with persistence
  }

  // ---- Step 8: Persistence ----
  const step8 = agentRunId ? await agentLog.logAgentRunStep({
    tenantId, agentRunId: agentRunId!, stepName: 'persistence', stepIndex: 8,
    input: { status: strategyObj.status },
  }).catch(() => null) : null

  let persisted: MessageStrategy
  try {
    persisted = await repo.createMessageStrategy({
      ...strategyObj,
      agent_run_id: agentRunId,
    })
    if (step8) await agentLog.completeAgentRunStep(step8.id, {
      outputSummary: `Persisted as ${persisted.id}`,
      output: { strategy_id: persisted.id },
    }).catch(() => null)
  } catch (ex) {
    if (step8) await agentLog.failAgentRunStep(step8.id, String(ex)).catch(() => null)
    if (agentRunId) await agentLog.failAgentRun(agentRunId, String(ex)).catch(() => null)
    const e = makeStrategyError(STRATEGY_ERROR_CODES.STRAT_003, 'critical', `Persistence failed: ${String(ex)}`, 'Check database connectivity.', false)
    return failResult([e], allWarnings, agentRunId)
  }

  // ---- Record AI usage (rule-based v1: 0 tokens; update when LLM is wired in) ----
  aiUsageRepo.recordUsage({
    tenantId,
    agentName:   AGENT_NAME,
    featureName: 'strategy_generation',
    modelName:   'claude-sonnet-4-6',
    promptTokens:      0,
    completionTokens:  0,
    totalTokens:       0,
    estimatedCostUsd:  0,
    leadId:            n.lead.lead_id ?? null,
    success:           true,
  }).catch((err) => console.error('[message-strategy-agent] Failed to record AI usage event:', err))

  // ---- Step 9: Complete agent run ----
  const step9 = agentRunId ? await agentLog.logAgentRunStep({
    tenantId, agentRunId: agentRunId!, stepName: 'result_returned', stepIndex: 9,
    input: { strategy_id: persisted.id },
  }).catch(() => null) : null

  if (agentRunId) {
    await agentLog.completeAgentRun(agentRunId, {
      confidence:     breakdown.final_score,
      outputSnapshot: {
        strategy_id:          persisted.id,
        message_type:         persisted.message_type,
        selected_skills:      persisted.selected_skills.map(s => s.skill_slug),
        confidence_score:     persisted.confidence_score,
        requires_human_review:persisted.requires_human_review,
        status:               persisted.status,
        error_count:          persisted.invalid_reasons.length,
      },
    }).catch(() => null)
  }

  if (step9) await agentLog.completeAgentRunStep(step9.id, {
    outputSummary: 'Strategy result returned to caller.',
  }).catch(() => null)

  // ---- Activity event ----
  await activitySvc.recordActivity({
    tenantId,
    eventType:    ActivityEventType.AGENT_RUN_COMPLETED,
    eventSource:  'message_strategy_agent',
    entityType:   'lead',
    entityId:     n.lead.lead_id,
    leadId:       n.lead.lead_id,
    eventSummary: `Message strategy generated: ${selectedType} (confidence: ${breakdown.final_score.toFixed(2)})`,
    metadata:     {
      strategy_id:          persisted.id,
      message_type:         persisted.message_type,
      confidence_score:     persisted.confidence_score,
      requires_human_review:persisted.requires_human_review,
    },
  }).catch(() => null)

  agentDecisionRepo.createDecision({
    tenantId,
    agentName:      AGENT_NAME,
    agentVersion:   'rules-v1',
    decisionType:   'strategy_generated',
    decisionStatus: 'completed',
    leadId:         n.lead.lead_id,
    confidence:     breakdown.final_score,
    shortReason:    `Strategy: ${persisted.message_type} (confidence: ${breakdown.final_score.toFixed(2)})`,
    inputSnapshot:  { lead_state: n.lead.state, industry: n.company.industry, trigger: n.lead.lead_source },
    outputSummary:  { message_type: persisted.message_type, strategy_id: persisted.id, model_used: 'rules-v1' },
    learningTags:   [persisted.message_type, n.lead.state ?? 'unknown_state'],
  }).catch((err) => console.error('[message-strategy-agent] Failed to write agent decision:', err))

  if (hasBlockingErrors) {
    return failResult(validationResult.errors, allWarnings, agentRunId, persisted)
  }

  return { success: true, strategy: persisted, warnings: allWarnings, agent_run_id: agentRunId ?? '' }
}

// ---- Pre-flight checks ----

function runPreFlightChecks(n: NormalizedStrategyInput): StrategyError[] {
  const errors: StrategyError[] = []

  if (n.lead.opted_out) {
    errors.push(makeStrategyError(
      STRATEGY_ERROR_CODES.STRAT_001, 'critical',
      'This lead has opted out of communications. No strategy can be generated.',
      'Honor the opt-out permanently. Remove from all active campaigns.',
      false
    ))
    return errors  // stop immediately
  }

  if (n.systemControls.global_agent_pause) {
    errors.push(makeStrategyError(
      STRATEGY_ERROR_CODES.STRAT_002, 'critical',
      'The global agent pause is active. All strategy generation is paused.',
      'Disable global_agent_pause in System Controls.',
      false
    ))
    return errors
  }

  if (n.systemControls.email_generation_engine !== 'phase3b') {
    errors.push(makeStrategyError(
      STRATEGY_ERROR_CODES.STRAT_003, 'critical',
      `Phase 3B email generation is not enabled (engine='${n.systemControls.email_generation_engine}').`,
      "Set email_generation_engine to 'phase3b' in System Controls.",
      false
    ))
    return errors
  }

  return errors
}

// ---- Strategy object builder ----

function buildStrategyObject(
  tenantId:     string,
  messageType:  MessageType,
  alternatives: MessageStrategy['alternative_angles'],
  skillResult:  ReturnType<typeof selectSkills>,
  n:            NormalizedStrategyInput
): Omit<MessageStrategy, 'id' | 'created_at' | 'updated_at'> {
  const industry   = n.lead.industry_segment ?? null
  const isHomeServ = industry ? (
    ['home_services', 'hvac', 'plumbing', 'electrical', 'roofing', 'landscaping', 'pest', 'contractor'].some(
      kw => industry.toLowerCase().includes(kw)
    )
  ) : false

  const personalizationLevel: PersonalizationLevel = derivePersonalizationLevel(n)
  const tone: Tone = skillResult.selected_skills.some(s => s.skill_slug === SKILL_SLUGS.WARM_CONVERSATIONAL)
    ? TONES.WARM_CONVERSATIONAL
    : TONES.EXECUTIVE_BREVITY

  const { offerAngle, primaryGoal, secondaryGoal, cta, trustAngle, audienceContext, painPoint, complianceNotes, requiredInclusions, avoid, proofPoint, lengthTarget } =
    buildStrategyContent(messageType, tone, personalizationLevel, n, isHomeServ)

  const partnerMembership = n.partner.partner_membership_confirmed
    ? { confirmed: true, partner_name: (n.partner.partner_name ?? null) as (typeof PARTNER_NAMES[keyof typeof PARTNER_NAMES] | null) }
    : null

  const reasoning = buildReasoning(messageType, skillResult, n)

  return {
    tenant_id:              tenantId,
    lead_id:                n.lead.lead_id,
    company_id:             n.company.company_id ?? null,
    campaign_id:            n.campaign.campaign_id ?? null,
    agent_run_id:           null,  // set after agent_run is created
    created_by:             'agent',
    status:                 STRATEGY_STATUSES.DRAFT,
    message_type:           messageType,
    primary_goal:           primaryGoal,
    secondary_goal:         secondaryGoal,
    sequence_position:      n.campaign.sequence_position ?? 1,
    days_since_last_contact:n.lead.days_since_last_contact,
    lead_source:            n.lead.lead_source_normalized,
    lead_stage:             n.lead.lead_stage ?? 'new',
    lead_score:             n.lead.lead_score ?? null,
    lead_urgency_score:     n.lead.lead_urgency_score ?? null,
    industry_segment:       industry,
    processing_volume_tier: n.lead.processing_volume_tier ?? null,
    has_statement_artifact: n.statement.has_statement_artifact,
    prior_touch_count:      (n.lead.prior_touch_count ?? 0),
    last_engagement_signal: n.lead.last_engagement_signal ?? 'none',
    partner_membership:     partnerMembership,
    audience_context:       audienceContext,
    pain_point_hypothesis:  painPoint,
    offer_angle:            offerAngle,
    trust_angle:            trustAngle,
    proof_point:            proofPoint ?? null,
    cta,
    tone,
    length_target:          lengthTarget,
    personalization_level:  personalizationLevel,
    compliance_notes:       complianceNotes,
    required_inclusions:    requiredInclusions,
    avoid,
    selected_skills:        skillResult.selected_skills,
    skill_reasoning:        skillResult.skill_reasoning,
    confidence_score:       0,    // filled by scorer
    reasoning,
    alternative_angles:     alternatives,
    requires_human_review:  true, // default; updated after validation
    override_log:           [],
    invalid_reasons:        [],   // filled by validator
  }
}

// ---- Personalization level derivation ----

function derivePersonalizationLevel(n: NormalizedStrategyInput): PersonalizationLevel {
  const hasContact  = !!n.lead.contact_name
  const hasCompany  = !!n.lead.company_name
  const hasIndustry = !!n.lead.industry_segment
  const hasNotes    = !!n.event.conversation_notes || !!n.statement.review_summary || !!n.company.known_payment_context

  if (hasContact && hasCompany && hasIndustry && hasNotes) return PERSONALIZATION_LEVELS.HIGHLY_PERSONALIZED
  if (hasContact && hasCompany && hasIndustry)             return PERSONALIZATION_LEVELS.LEAD_SPECIFIC
  if ((hasCompany && hasIndustry) || (hasContact && hasIndustry)) return PERSONALIZATION_LEVELS.SEGMENT_SPECIFIC
  return PERSONALIZATION_LEVELS.GENERIC
}

// ---- Content builder ----

interface StrategyContent {
  offerAngle:        OfferAngle
  primaryGoal:       string
  secondaryGoal:     string | null
  cta:               string
  trustAngle:        string
  audienceContext:   string
  painPoint:         string
  complianceNotes:   string[]
  requiredInclusions:string[]
  avoid:             string[]
  proofPoint:        string | null
  lengthTarget:      LengthTarget
}

const GLOBAL_BANNED_PHRASES = [
  'I hope this email finds you well',
  'Just checking in',
  'I wanted to reach out',
  'Touching base',
  'Circling back',
  'Following up on my previous email',
  'I came across your business',
  'I stumbled upon your company',
  'We can save you money',
  'Guaranteed savings',
  'Best rates',
  'Lowest rates',
  'No-brainer',
  'Game changer',
]

function buildStrategyContent(
  messageType:          MessageType,
  tone:                 Tone,
  personalizationLevel: PersonalizationLevel,
  n:                    NormalizedStrategyInput,
  isHomeServices:       boolean
): StrategyContent {
  const industry    = n.lead.industry_segment ?? 'unknown industry'
  const avoid       = [...GLOBAL_BANNED_PHRASES]

  switch (messageType) {
    case MESSAGE_TYPES.COLD_OUTREACH:
      avoid.push(
        'inbound response language',
        'thanks for reaching out',
        'thanks for submitting',
        'savings claims without calculated data',
        'statement review references without a submitted statement',
      )
      return {
        offerAngle:       OFFER_ANGLES.COST_CLARITY,
        primaryGoal:      'request_statement_or_start_conversation',
        secondaryGoal:    'establish_credibility_through_specific_observation',
        cta:              isHomeServices
          ? 'Offer a statement review — ask if 15 minutes to review their processing structure makes sense'
          : 'Offer a processing cost review — ask if a statement review is worth 15 minutes',
        trustAngle:       isHomeServices
          ? 'Reference home services / contractor payment realities to demonstrate industry familiarity — no generic claims'
          : 'Lead with a specific observation relevant to their volume tier or business type — not a generic pitch',
        audienceContext:  isHomeServices
          ? `${industry} contractor; likely processes field payments across technicians, seasonal volume swings, mix of consumer and business card types. Owner-operator or small management team. Skeptical of generic processor outreach.`
          : `Business in ${industry} industry. No specific audience data available. Message should avoid industry-specific claims not supported by data.`,
        painPoint:        isHomeServices
          ? 'Possible interchange category inefficiency from mixed consumer/business card types in field transactions. Possible lack of clarity on fee structure.'
          : 'Possible lack of clarity around processing fee structure and card category costs. Specific pain point unknown.',
        complianceNotes:  [
          'Do not claim savings amounts — no calculated savings exists',
          'Do not claim knowledge of current processor or rates unless data is on file',
          'Do not use inbound response language — this is a cold lead',
          'Do not reference a statement review — no statement submitted',
        ],
        requiredInclusions:[
          'At least one specific observation relevant to this merchant or industry',
          'One low-friction CTA offering a statement review or cost review',
        ],
        proofPoint:       null,
        lengthTarget:     LENGTH_TARGETS.SHORT,
        avoid,
      }

    case MESSAGE_TYPES.NEW_INQUIRY_RESPONSE:
      avoid.push(
        'cold-outreach discovery language: "I came across your business"',
        'savings claims before any review',
        're-introducing 321 Swipe as if the merchant is unfamiliar — they reached out',
      )
      return {
        offerAngle:       OFFER_ANGLES.STATEMENT_REVIEW,
        primaryGoal:      'acknowledge_inquiry_and_advance_to_statement_or_call',
        secondaryGoal:    'establish_responsiveness_and_credibility',
        cta:              'Invite statement submission or offer a scheduling link; advance from inquiry to the next step',
        trustAngle:       'Acknowledge the inquiry specifically; demonstrate responsiveness — not a generic welcome message',
        audienceContext:  `Merchant submitted an inquiry or form. They raised their hand — this is not a cold contact. Response must acknowledge what they submitted.`,
        painPoint:        'Expressed interest in a processing review. Specific pain point unknown; message should not assume one.',
        complianceNotes:  [
          'Do not use cold-discovery language',
          'Do not claim savings before any review',
          'Do not re-introduce 321 Swipe as unknown — they reached out',
        ],
        requiredInclusions:['Specific acknowledgment of the form or inquiry submission', 'Clear next step: statement submission or call scheduling'],
        proofPoint:       null,
        lengthTarget:     LENGTH_TARGETS.SHORT,
        avoid,
      }

    case MESSAGE_TYPES.STATEMENT_SUBMITTED_CONFIRMATION:
      avoid.push(
        'claims about what the review will find',
        'savings promises before review is complete',
        'claiming review is in progress unless it actually is',
      )
      return {
        offerAngle:       OFFER_ANGLES.STATEMENT_REVIEW,
        primaryGoal:      'confirm_receipt_and_set_review_timeline',
        secondaryGoal:    'maintain_momentum_toward_review_discussion',
        cta:              'Set specific timeline for review completion; offer scheduling link for review discussion call',
        trustAngle:       'Professional, prompt acknowledgment signals competence; specific timeline sets honest expectations',
        audienceContext:  `Merchant submitted a processing statement. They are in a waiting state and took the most significant intake step. The confirmation must acknowledge this specifically.`,
        painPoint:        'Merchant demonstrated sufficient motivation to submit their statement. Specific issue unknown until review is complete.',
        complianceNotes:  [
          'CRITICAL: Do not reference any findings — statement has not been reviewed',
          'Do not claim savings or improvements at this stage',
          'Do not claim the review is in progress unless it actually is',
          'Set honest, achievable timeline — do not overpromise turnaround',
        ],
        requiredInclusions:['Explicit confirmation of statement receipt', 'Specific review timeline (day, not "soon")', 'One CTA: scheduling link or timeline confirmation'],
        proofPoint:       n.statement.statement_received_at ? `Statement received on ${n.statement.statement_received_at.split('T')[0]}` : null,
        lengthTarget:     LENGTH_TARGETS.SHORT,
        avoid,
      }

    case MESSAGE_TYPES.STATEMENT_REVIEW_FOLLOW_UP:
      avoid.push(
        'vague findings ("interesting things", "room for improvement") without specifics',
        'savings amounts not supported by calculated_savings_amount',
        'characterizing current processor as deceptive without factual basis',
      )
      return {
        offerAngle:       n.statement.calculated_savings_amount != null ? OFFER_ANGLES.CONFIRMED_SAVINGS_REVIEW : OFFER_ANGLES.STATEMENT_REVIEW,
        primaryGoal:      'present_findings_and_advance_to_proposal',
        secondaryGoal:    'establish_credibility_through_specificity_of_findings',
        cta:              'Book a 20-minute call to walk through findings; offer scheduling link; can share screen to go line by line',
        trustAngle:       'The findings are the trust signal — specificity of observations proves the review was real and thorough',
        audienceContext:  `Merchant who submitted statement; already past inquiry and submission stages. Has demonstrated significant commitment. Review is complete.`,
        painPoint:        n.statement.review_summary
          ? `CONFIRMED via review: ${n.statement.review_summary}`
          : 'Review complete — specific findings should be documented before generating copy.',
        complianceNotes:  [
          'Specific findings from review_summary may be referenced',
          n.statement.calculated_savings_amount != null
            ? `Calculated savings amount: ${n.statement.calculated_savings_amount}. Calculation basis: ${n.statement.calculation_basis ?? 'documented separately'}.`
            : 'Do not state a savings amount — calculated_savings_amount is null',
          'Do not characterize current processor as deceptive without factual basis from the review',
          'Findings must match review_summary — do not generalize beyond what was found',
        ],
        requiredInclusions:[
          'Reference to at least one specific finding from the review',
          'CTA for a findings review call',
        ],
        proofPoint:       n.statement.review_summary ? `Review complete: ${n.statement.review_summary.substring(0, 100)}...` : null,
        lengthTarget:     LENGTH_TARGETS.MEDIUM,
        avoid,
      }

    case MESSAGE_TYPES.STATEMENT_NOT_SUBMITTED_FOLLOW_UP: {
      const touchNum = (n.lead.prior_touch_count ?? 0) + 1
      avoid.push(
        '"Just following up on my previous message"',
        '"Circling back"',
        'manufactured urgency',
        'guilt language',
      )
      return {
        offerAngle:       OFFER_ANGLES.SAVINGS_REVIEW,
        primaryGoal:      'invite_statement_submission_with_reduced_friction',
        secondaryGoal:    'change_angle_to_maintain_interest',
        cta:              touchNum <= 2
          ? 'Offer to accept statement via direct email reply — remove upload barrier'
          : touchNum === 3
          ? 'Ask one question: does a statement review still make sense?'
          : 'Open door to "no" — offer to step back if timing is not right',
        trustAngle:       'Patient persistence; change the angle from the prior message — brevity and directness signal respect',
        audienceContext:  `Merchant expressed prior interest but has not yet submitted a statement. Touch ${touchNum} of the sequence.`,
        painPoint:        'Prior angle did not convert — timing may be wrong or friction of submission step is too high.',
        complianceNotes:  ['No savings claims without calculated data', 'No manufactured urgency', 'Touch 4: must offer graceful exit'],
        requiredInclusions:['Changed angle from prior touches', 'Reduced-friction statement submission option'],
        proofPoint:       null,
        lengthTarget:     touchNum >= 3 ? LENGTH_TARGETS.ULTRA_SHORT : LENGTH_TARGETS.SHORT,
        avoid,
      }
    }

    case MESSAGE_TYPES.PROPOSAL_FOLLOW_UP:
      avoid.push(
        '"Just checking in on the proposal"',
        're-pitching full proposal value proposition',
        'manufactured urgency about expiration',
      )
      return {
        offerAngle:       OFFER_ANGLES.PROPOSAL_REVIEW,
        primaryGoal:      'resolve_questions_and_advance_decision',
        secondaryGoal:    'maintain_confidence_without_pressure',
        cta:              'Ask one specific question: any questions on the numbers, or is there a decision timeline?',
        trustAngle:       'Confident, not needy — the proposal stands on its own; the rep is not chasing',
        audienceContext:  `Merchant received a specific proposal. Decision phase. Message should help them move forward without re-pitching.`,
        painPoint:        'Decision delay may indicate unresolved questions or competing priorities.',
        complianceNotes:  [
          'Do not add savings claims beyond those in the proposal',
          'Do not manufacture urgency about proposal expiration unless real',
          'Do not re-pitch the full proposal value proposition',
        ],
        requiredInclusions:['Specific reference to the proposal', 'One question about decision status or outstanding questions'],
        proofPoint:       n.proposal.proposal_summary ? `Proposal sent covering: ${n.proposal.proposal_summary.substring(0, 80)}` : null,
        lengthTarget:     LENGTH_TARGETS.ULTRA_SHORT,
        avoid,
      }

    case MESSAGE_TYPES.NO_RESPONSE_FOLLOW_UP: {
      const seq = n.campaign.sequence_position ?? 2
      avoid.push(
        '"Just following up"',
        '"Circling back"',
        'repeating the identical value proposition from the prior message',
      )
      return {
        offerAngle:       OFFER_ANGLES.STATEMENT_REVIEW,
        primaryGoal:      're_engage_with_changed_angle',
        secondaryGoal:    'reduce_friction_of_response',
        cta:              seq >= 4
          ? 'Open the door to "no" — step back offer; invite future contact when timing is better'
          : seq === 3
          ? 'Ask one direct yes/no question: does a review still make sense?'
          : 'Offer reduced-friction next step — different from what was offered before',
        trustAngle:       'Brevity and directness signal respect for the merchant\'s time',
        audienceContext:  `Merchant received ${(n.lead.prior_touch_count ?? 0)} prior message(s) with no reply. Touch ${seq}.`,
        painPoint:        'Prior angle did not resonate or timing was wrong.',
        complianceNotes:  ['No savings claims', 'No prior message references in banned ways', 'Do not repeat the prior angle unchanged'],
        requiredInclusions:['Changed angle from prior touches', 'Single direct question or exit offer as CTA'],
        proofPoint:       null,
        lengthTarget:     seq >= 3 ? LENGTH_TARGETS.ULTRA_SHORT : LENGTH_TARGETS.SHORT,
        avoid,
      }
    }

    case MESSAGE_TYPES.RE_ENGAGEMENT:
      avoid.push(
        '"Just circling back"',
        '"Wanted to follow up on our previous conversations"',
        'guilt language ("I\'ve been waiting")',
        'repeating the original pitch unchanged',
      )
      return {
        offerAngle:       OFFER_ANGLES.STATEMENT_REVIEW,
        primaryGoal:      'reopen_conversation_with_fresh_angle',
        secondaryGoal:    'acknowledge_gap_and_reduce_re_entry_friction',
        cta:              'Fresh invitation — one direct question or re-offer with lower friction than prior approach',
        trustAngle:       'Brief acknowledgment of the gap; fresh angle that differs from prior outreach',
        audienceContext:  `Merchant had prior engagement but has been dormant for ${n.lead.days_since_last_contact ?? 'unknown'} days. Re-opening the conversation.`,
        painPoint:        'Prior approach did not convert. Timing may now be better or a different angle may resonate.',
        complianceNotes:  ['Do not pretend prior conversation did not happen', 'Do not manufacture urgency about missed opportunities', 'Honor any prior opt-out or explicit decline'],
        requiredInclusions:['Light acknowledgment of time since prior contact', 'Fresh angle or reason to reconnect', 'One low-friction CTA'],
        proofPoint:       null,
        lengthTarget:     LENGTH_TARGETS.SHORT,
        avoid,
      }

    case MESSAGE_TYPES.PARTNER_MEMBER_SPECIFIC_CAMPAIGN: {
      const partnerName = n.partner.partner_name ?? 'the partner group'
      avoid.push(
        'Claiming exclusive or preferred partnership without authorization',
        'Member pricing claims unless documented',
        `Multiple references to ${partnerName} — one mention is enough`,
      )
      return {
        offerAngle:       OFFER_ANGLES.PARTNER_MEMBER_REVIEW,
        primaryGoal:      'leverage_partner_context_and_advance_to_statement',
        secondaryGoal:    'establish_credibility_through_shared_network',
        cta:              'Offer statement review with warm framing referencing shared partner context',
        trustAngle:       `Reference shared ${partnerName} context once to establish relevance; transition to statement review offer`,
        audienceContext:  `Confirmed ${partnerName} member. Improvement-oriented owner-operator. More receptive than a cold lead due to shared context. First contact with 321 Swipe.`,
        painPoint:        'Possible payment processing cost inefficiency typical for home services contractors.',
        complianceNotes:  [
          `${partnerName} name may be referenced once — membership is confirmed`,
          n.partner.partner_claims_authorized
            ? 'Partner endorsement or preferred partnership status is authorized.'
            : 'Do not claim exclusive or preferred partnership — this is not authorized.',
          'No savings claims — no calculated savings exists',
        ],
        requiredInclusions:[`One reference to ${partnerName} membership or shared network context`, 'Transition to statement review offer'],
        proofPoint:       `${partnerName} network shared context`,
        lengthTarget:     LENGTH_TARGETS.SHORT,
        avoid,
      }
    }

    case MESSAGE_TYPES.EVENT_EXPO_FOLLOW_UP:
      avoid.push(
        'Fabricated conversation details not in conversation_notes',
        '"It was great meeting you!" without specific follow-through',
        'Generic post-event blast language',
      )
      return {
        offerAngle:       OFFER_ANGLES.EVENT_FOLLOW_UP_REVIEW,
        primaryGoal:      'continue_event_conversation_and_advance_to_statement',
        secondaryGoal:    'establish_advisor_relationship',
        cta:              n.event.conversation_notes
          ? 'Continue the conversation from where it ended — offer a statement review based on what was discussed'
          : 'Reference the event; offer a statement review as the natural next step',
        trustAngle:       n.event.conversation_notes
          ? 'Reference the specific conversation — what they said; demonstrate the rep listened'
          : 'Reference the shared event context; demonstrate follow-through',
        audienceContext:  n.event.conversation_notes
          ? `Merchant met at ${n.event.event_name ?? 'event'}. Conversation: ${n.event.conversation_notes.substring(0, 200)}`
          : `Merchant met at ${n.event.event_name ?? 'event'} ${n.event.days_since_event ?? '?'} days ago. No conversation notes.`,
        painPoint:        n.event.conversation_notes
          ? 'Known from conversation: see conversation_notes for specific context'
          : 'Unknown — message should ask a relevant question rather than assume',
        complianceNotes:  [
          'Only reference conversation details documented in conversation_notes',
          'Do not fabricate or embellish conversation content',
          'No savings claims',
        ],
        requiredInclusions:n.event.conversation_notes
          ? [`Reference to ${n.event.event_name ?? 'the event'}`, 'At least one specific detail from conversation_notes']
          : [`Reference to ${n.event.event_name ?? 'the event'}`],
        proofPoint:       n.event.event_name ? `Met at ${n.event.event_name}` : null,
        lengthTarget:     LENGTH_TARGETS.SHORT,
        avoid,
      }

    case MESSAGE_TYPES.REFERRAL_REQUEST:
      avoid.push(
        'Referral incentive offers without a documented referral program',
        '"If you know anyone who might be interested" — too vague',
      )
      return {
        offerAngle:       OFFER_ANGLES.REFERRAL_REQUEST,
        primaryGoal:      'obtain_referral_introduction',
        secondaryGoal:    'deepen_existing_relationship',
        cta:              'Specific referral ask: who would benefit from a statement review; an email intro is all it takes',
        trustAngle:       'Grateful and genuine — the ask feels like a natural extension of the relationship',
        audienceContext:  n.customer.is_existing_customer
          ? `Existing 321 Swipe customer since ${n.customer.customer_since ?? 'onboarding'}. Relationship established.`
          : 'Warm contact with prior delivered value (completed statement review).',
        painPoint:        'No pain point — this is a relationship-building message.',
        complianceNotes:  ['Do not offer financial incentives without a documented referral program', 'Only ask after relationship is established'],
        requiredInclusions:['Reference to the existing relationship or delivered value', 'Specific referral ask with context about who would be a good fit', 'Easy introduction mechanism'],
        proofPoint:       null,
        lengthTarget:     LENGTH_TARGETS.SHORT,
        avoid,
      }

    case MESSAGE_TYPES.CUSTOMER_NURTURE:
      avoid.push(
        'Upsell as the primary purpose of the message',
        '"We value your business" without context',
        'Treating the existing customer like a prospect',
      )
      return {
        offerAngle:       OFFER_ANGLES.ACCOUNT_REVIEW,
        primaryGoal:      'maintain_relationship',
        secondaryGoal:    'surface_account_review_opportunity',
        cta:              n.customer.recent_account_activity
          ? `Offer a quick account review given ${n.customer.nurture_trigger ?? 'recent activity'}`
          : 'Low-pressure optional account review offer',
        trustAngle:       'Peer-like check-in from a knowledgeable advisor; value-first, not sales-first',
        audienceContext:  `Existing 321 Swipe customer${n.customer.customer_since ? ` since ${n.customer.customer_since}` : ''}. ${n.customer.account_status ? `Account status: ${n.customer.account_status}.` : ''} ${n.customer.recent_account_activity ?? ''}`,
        painPoint:        'No identified pain point. This is a relationship maintenance message.',
        complianceNotes:  ['No upsell as primary purpose', 'No false urgency', 'No savings claims unless account data supports them'],
        requiredInclusions:['Reference to the ongoing relationship or a relevant account detail', 'Low-pressure optional review offer'],
        proofPoint:       n.customer.recent_account_activity ?? null,
        lengthTarget:     LENGTH_TARGETS.SHORT,
        avoid,
      }

    default:
      return {
        offerAngle:       OFFER_ANGLES.COST_CLARITY,
        primaryGoal:      'start_conversation',
        secondaryGoal:    null,
        cta:              'Offer a statement review',
        trustAngle:       'Specific, honest, advisor-first',
        audienceContext:  'Context not available.',
        painPoint:        'Unknown — use general cost clarity framing.',
        complianceNotes:  ['No savings claims without calculated data', 'No statement review claims without artifact'],
        requiredInclusions:['One specific observation or question', 'One CTA'],
        proofPoint:       null,
        lengthTarget:     LENGTH_TARGETS.SHORT,
        avoid,
      }
  }
}

// ---- Reasoning builder ----

function buildReasoning(
  messageType: MessageType,
  skillResult: ReturnType<typeof selectSkills>,
  n:           NormalizedStrategyInput
): string {
  const parts: string[] = [
    `Message type selected: ${messageType}.`,
    `Lead source: ${n.lead.lead_source_normalized}. Lead stage: ${n.lead.lead_stage ?? 'unknown'}.`,
    `Industry: ${n.lead.industry_segment ?? 'unknown'}.`,
    `Statement artifact: ${n.statement.has_statement_artifact}. Review complete: ${n.statement.statement_review_completed ?? false}.`,
    `Partner membership: ${n.partner.partner_membership_confirmed ? n.partner.partner_name : 'none'}.`,
    `Prior touches: ${(n.lead.prior_touch_count ?? 0)}. Last engagement: ${n.lead.last_engagement_signal ?? 'none'}.`,
    `Selected skills: ${skillResult.selected_skills.map(s => s.skill_slug).join(', ')}.`,
  ]
  return parts.join(' ')
}

// ---- getMessageStrategy ----

export async function getMessageStrategy(
  strategyId: string,
  tenantId:   string
): Promise<MessageStrategy | null> {
  return repo.getMessageStrategyById(strategyId, tenantId)
}

// ---- updateMessageStrategyOverride ----

export async function updateMessageStrategyOverride(
  strategyId:      string,
  overrideRequest: StrategyOverrideRequest,
  tenantId:        string,
  n:               NormalizedStrategyInput
): Promise<StrategyResult> {
  const strategy = await repo.getMessageStrategyById(strategyId, tenantId)
  if (!strategy) {
    const e = makeStrategyError(STRATEGY_ERROR_CODES.STRAT_003, 'blocking', 'Strategy not found.', 'Check strategy_id and tenant.', false)
    return failResult([e], [], null)
  }

  if (strategy.status === 'superseded') {
    const e = makeStrategyError(STRATEGY_ERROR_CODES.STRAT_003, 'blocking', 'Strategy is superseded and cannot be modified.', 'Regenerate a new strategy.', false)
    return failResult([e], [], null, strategy)
  }

  const result = applyOverride(strategy, overrideRequest, n)

  if (result.errors.length > 0) {
    return failResult(result.errors, [], null, strategy)
  }

  // Append log entry to existing override_log
  const newLog = [...(strategy.override_log ?? []), result.logEntry]
  const patch  = { ...result.patch, override_log: newLog }

  const updated = await repo.updateMessageStrategy(strategyId, tenantId, patch)
  return { success: true, strategy: updated, warnings: [], agent_run_id: '' }
}

// ---- validateMessageStrategy ----

export { validateStrategy as validateMessageStrategy } from './message-strategy.validation'

// ---- canProceedToCopyGeneration ----

export async function canProceedToCopyGeneration(
  strategyId: string,
  tenantId:   string
): Promise<{ allowed: boolean; reason?: string }> {
  const strategy = await repo.getMessageStrategyById(strategyId, tenantId)
  if (!strategy) return { allowed: false, reason: 'Strategy not found.' }

  // Re-check global pause
  const paused = await systemControlRepo.getBooleanControl('global_agent_pause', tenantId, false)
  if (paused) return { allowed: false, reason: 'Global agent pause is active.' }

  const engine = await systemControlRepo.resolveSystemControl('email_generation_engine', tenantId)
  if (!engine || String(engine.value) !== 'phase3b') return { allowed: false, reason: 'Phase 3B not enabled.' }

  if (strategy.invalid_reasons.some(e => e.blocking)) {
    return { allowed: false, reason: `Blocking errors present: ${strategy.invalid_reasons.filter(e => e.blocking).map(e => e.code).join(', ')}` }
  }

  if (strategy.confidence_score < 0.50) {
    return { allowed: false, reason: `Confidence score too low: ${strategy.confidence_score.toFixed(3)}` }
  }

  if (strategy.requires_human_review && strategy.status !== 'approved') {
    return { allowed: false, reason: 'Strategy requires human review and has not been approved.' }
  }

  if (!strategy.selected_skills.some(s => s.skill_slug === SKILL_SLUGS.COMPLIANCE_FORBIDDEN_CLAIMS)) {
    return { allowed: false, reason: 'Compliance skill missing from selected skills.' }
  }

  // NOTE: Returns true for valid approved strategies but no Copywriting Agent exists yet.
  // No copy generation is triggered in Phase 3B foundation.
  return { allowed: true }
}

// ---- listStrategiesForLead ----

export async function listStrategiesForLead(
  leadId:   string,
  tenantId: string
): Promise<MessageStrategy[]> {
  return repo.listMessageStrategiesForLead(leadId, tenantId)
}

// ---- approveStrategy ----

export async function approveStrategy(
  strategyId: string,
  tenantId:   string,
  userId:     string
): Promise<MessageStrategy | null> {
  const strategy = await repo.getMessageStrategyById(strategyId, tenantId)
  if (!strategy) return null
  if (strategy.invalid_reasons.some(e => e.severity === 'critical')) return null

  return repo.updateMessageStrategy(strategyId, tenantId, {
    status:               'approved',
    requires_human_review:false,
    override_log:         [
      ...(strategy.override_log ?? []),
      {
        overridden_by:          userId,
        overridden_at:          new Date().toISOString(),
        original_value:         'draft',
        new_value:              'approved',
        override_reason:        'Human approval',
        affected_fields:        ['status', 'requires_human_review'],
        confidence_impact:      false,
        regeneration_required:  false,
        guardrail_blocked:      false,
      } satisfies StrategyOverrideLogEntry,
    ],
  })
}

// ---- supersedeStrategy ----

export async function supersedeStrategy(
  strategyId: string
): Promise<void> {
  const supabase = (await import('@/lib/supabase/service')).createSupabaseServiceClient()
  await supabase
    .from('message_strategies')
    .update({ status: 'superseded' } as never)
    .eq('id', strategyId)
}

// ---- loadSystemControls helper ----

export async function loadSystemControls(
  tenantId: string
): Promise<{ email_generation_engine: string; global_agent_pause: boolean; require_strategy_review: boolean; require_message_approval: boolean }> {
  const [engineRow, paused, requireReview] = await Promise.all([
    systemControlRepo.resolveSystemControl('email_generation_engine', tenantId),
    systemControlRepo.getBooleanControl('global_agent_pause', tenantId, false),
    systemControlRepo.getBooleanControl('require_strategy_review', tenantId, false),
  ])

  return {
    email_generation_engine: String(engineRow?.value ?? 'phase3a'),
    global_agent_pause:      paused,
    require_strategy_review: requireReview,
    require_message_approval:true,
  }
}
