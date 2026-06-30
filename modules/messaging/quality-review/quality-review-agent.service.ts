// ============================================================
// Phase 3B — Quality Review Agent Service
// Public boundary of the Quality Review Agent.
// Evaluation-only — no LLMs, no sending, no approval,
// no copy modification. Advisory signals only.
// ============================================================

import * as stratRepo   from '@/modules/messaging/repositories/message-strategy.repo'
import * as versionRepo from '@/modules/messaging/repositories/message-version.repo'
import * as qrRepo      from '@/modules/messaging/repositories/quality-review.repo'
import * as agentLog    from '@/modules/intelligence/services/agent-run-logging.service'
import * as activitySvc from '@/modules/intelligence/services/activity-event.service'
import * as sysCtrlRepo from '@/modules/intelligence/repositories/system-control.repo'
import * as agentDecisionRepo from '@/modules/intelligence/repositories/agent-decision.repo'
import * as aiUsageRepo from '@/modules/intelligence/repositories/ai-usage-event.repo'
import { preflightCheck } from '@/modules/intelligence/services/ai-budget-enforcer.service'
import { ActivityEventType, SystemControlKey } from '@/modules/intelligence/types.agent'

import { validateQualityReviewInputs } from './quality-review-agent.validation'
import {
  resolveQualityReviewSkill,
  getQualityReviewScoringSeed,
  QR_SCORING_SKILL_SLUG,
} from './quality-review-skill.resolver'
import {
  scoreStrategicFit,
  scoreComplianceConfidence,
  scoreCTAClarity,
  scoreSpecificity,
  scoreToneFit,
  scoreDifferentiation,
  scoreSubjectBodyConsistency,
  scoreReadability,
}                                      from './quality-review-agent.scoring'
import { detectRiskFlags }             from './quality-review-agent.risk-flags'
import { calculateCompositeScore }     from './quality-review-agent.composite'
import { rankQualityReviews, assignRecommendation } from './quality-review-agent.ranking'
import {
  generateScoringReasoning,
  generateStrengths,
  generateWeaknesses,
  generateHumanReviewNotes,
  generateComparisonSummary,
  generateRecommendedEdits,
}                                      from './quality-review-agent.reasoning'
import { applyMessageTypeReviewRules } from './quality-review-agent.message-type-rules'

import { QRA_AGENT_STEPS, QRA_ERROR_CODES } from './quality-review-agent.types'
import type {
  QualityReview,
  QualityReviewDraft,
  QualityReviewResult,
  QualityReviewError,
  ScoreBreakdown,
} from './quality-review-agent.types'
import type { MessageVersion } from '@/modules/messaging/copywriting/copywriting-agent.types'
import type { MessageStrategy } from '@/modules/messaging/strategy/message-strategy.types'

// ---- Constants ----

const AGENT_NAME = 'quality_review_agent'
const RUN_TYPE   = 'scoring'

// ---- Error builder ----

function makeError(
  code:         string,
  message:      string,
  suggestedFix: string,
  blocking      = true
): QualityReviewError {
  return { code, message, blocking, suggestedFix }
}

// ---- Strategy to scoring input adapter ----

function strategyToScoringInput(strategy: MessageStrategy) {
  return {
    messageType:               strategy.message_type,
    primaryGoal:               strategy.primary_goal        ?? '',
    offerAngle:                strategy.offer_angle         ?? '',
    tone:                      strategy.tone                ?? '',
    cta:                       strategy.cta                 ?? '',
    proofPoint:                strategy.proof_point         ?? null,
    painPointHypothesis:       strategy.pain_point_hypothesis ?? '',
    industrySegment:           strategy.industry_segment    ?? null,
    leadSource:                strategy.lead_source         ?? '',
    sequencePosition:          strategy.sequence_position   ?? 1,
    leadStage:                 strategy.lead_stage          ?? '',
    requiredInclusions:        strategy.required_inclusions ?? [],
    avoid:                     strategy.avoid               ?? [],
    partnerMembershipConfirmed:strategy.partner_membership?.confirmed ?? false,
    personalizationLevel:      strategy.personalization_level ?? '',
    lengthTarget:              strategy.length_target       ?? '',
    audienceContext:           strategy.audience_context    ?? '',
    conversationNotes:         (strategy as unknown as Record<string, unknown>)['conversation_notes'] as string | null ?? null,
  }
}

// ---- Version to scoring input adapter ----

function versionToScoringInput(version: MessageVersion) {
  return {
    id:                          version.id,
    subjectLine:                 version.subjectLine,
    previewText:                 version.previewText,
    bodyText:                    version.bodyText,
    bodyHtml:                    version.bodyHtml,
    messageType:                 version.messageType,
    versionLabel:                version.versionLabel,
    versionNumber:               version.versionNumber,
    strategyAngle:               version.strategyAngle,
    complianceNotesApplied:      version.complianceNotesApplied,
    requiredInclusionsSatisfied: version.requiredInclusionsSatisfied,
    avoidedElementsChecked:      version.avoidedElementsChecked,
    generationNotes:             version.generationNotes,
    personalizationUsed:         version.personalizationUsed,
    personalizationGaps:         version.personalizationGaps,
    differentiationProfile:      undefined,
  }
}

// ---- Main: runQualityReview ----

export async function runQualityReview(input: {
  strategyId: string
  tenantId:   string
  force?:     boolean
}): Promise<QualityReviewResult> {
  const { strategyId, tenantId, force = false } = input
  let agentRunId: string | null = null

  // ---- Create agent run ----
  try {
    const run = await agentLog.startAgentRun({
      tenantId,
      agentName:    AGENT_NAME,
      runType:      RUN_TYPE as 'scoring',
      triggerSource:'direct_call',
      subjectType:  'strategy',
      subjectId:    strategyId,
      inputSnapshot:{ strategy_id: strategyId, force },
    })
    agentRunId = run.id
  } catch {
    agentRunId = null
  }

  async function logStep(stepName: string, stepIndex: number, stepInput: Record<string, unknown> = {}) {
    if (!agentRunId) return null
    return agentLog.logAgentRunStep({ tenantId, agentRunId, stepName, stepIndex, input: stepInput }).catch(() => null)
  }

  function failResult(error: QualityReviewError): QualityReviewResult {
    if (agentRunId) agentLog.failAgentRun(agentRunId, error.message).catch(() => null)
    return { success: false, error, agentRunId }
  }

  // ---- Step 1: Load strategy ----
  const step1 = await logStep(QRA_AGENT_STEPS.LOAD_STRATEGY, 1, { strategy_id: strategyId })

  const strategy = await stratRepo.getMessageStrategyById(strategyId, tenantId)
  if (!strategy) {
    if (step1) await agentLog.failAgentRunStep(step1.id, 'Strategy not found').catch(() => null)
    return failResult(makeError(QRA_ERROR_CODES.QRA_001, 'Strategy not found.', 'Check strategy_id and tenant.'))
  }
  if (step1) await agentLog.completeAgentRunStep(step1.id, {
    outputSummary: `Strategy loaded: ${strategy.message_type}`,
    output: { status: strategy.status, message_type: strategy.message_type },
  }).catch(() => null)

  // ---- Step 2: Load versions ----
  const step2 = await logStep(QRA_AGENT_STEPS.LOAD_VERSIONS, 2, { strategy_id: strategyId })

  const versions = await versionRepo.listMessageVersionsForStrategy(strategyId, tenantId)
  if (step2) await agentLog.completeAgentRunStep(step2.id, {
    outputSummary: `${versions.length} versions loaded`,
    output: { version_count: versions.length, version_ids: versions.map(v => v.id) },
  }).catch(() => null)

  // ---- Step 3: Gate check ----
  const step3 = await logStep(QRA_AGENT_STEPS.GATE_CHECK, 3, { version_count: versions.length })

  // Load system controls
  const [globalAgentPause, engineValue] = await Promise.all([
    sysCtrlRepo.getBooleanControl('global_agent_pause', tenantId, false),
    sysCtrlRepo.getControlValue('email_generation_engine', tenantId),
  ])
  const emailGenerationEngine = engineValue ? String(engineValue) : null

  // Load existing review IDs for force check
  const existingReviews  = await qrRepo.listQualityReviewsForStrategy(strategyId, tenantId).catch(() => [] as QualityReview[])
  const existingVersionIds = new Set(existingReviews.filter(r => !r.supersededAt).map(r => r.versionId))

  // Validate inputs
  const { blockingErrors, versionErrors } = validateQualityReviewInputs(
    strategy as unknown as { invalidReasons: unknown[]; id: string },
    versions as unknown as Array<{
      id: string; strategyId: string; tenantId: string; bodyText: string
      subjectLine: string; bodyHtml: unknown; approvalStatus: string; complianceNotesApplied: string[]
    }>,
    { emailGenerationEngine, globalAgentPause },
    strategyId,
    tenantId,
    existingVersionIds,
    force
  )

  if (blockingErrors.length > 0) {
    if (step3) await agentLog.failAgentRunStep(step3.id, blockingErrors[0]?.message ?? 'Gate check failed').catch(() => null)
    return failResult(blockingErrors[0]!)
  }
  if (step3) await agentLog.completeAgentRunStep(step3.id, {
    outputSummary: 'Gate check passed.',
    output: { excluded_count: versionErrors.size },
  }).catch(() => null)

  // Partition eligible vs excluded versions
  const eligibleVersions = versions.filter(v => !versionErrors.has(v.id))
  const excludedVersions = versions
    .filter(v => versionErrors.has(v.id))
    .map(v => ({
      versionId: v.id,
      reason:    versionErrors.get(v.id)?.message ?? 'Excluded',
    }))

  if (eligibleVersions.length === 0) {
    if (agentRunId) await agentLog.failAgentRun(agentRunId, 'No eligible versions after gate check').catch(() => null)
    return failResult(makeError(
      QRA_ERROR_CODES.QRA_002,
      'No eligible versions to review.',
      'Check version eligibility and resolve errors.'
    ))
  }

  // If force=true, supersede existing reviews
  if (force) {
    await qrRepo.supersedeForStrategy(strategyId, tenantId).catch(() => null)
  }

  // ---- Prior context (simplified — no external load in v1) ----
  const priorContext: { priorStrategyAngles: string[] } | null = null

  // ---- Build strategy scoring input ----
  const strategyScoringInput = strategyToScoringInput(strategy)

  // ---- Resolve structured scoring params ONCE (Slice 2-style, gated on
  // LEARNED_SKILLS_ENABLED exactly like copywriting): off -> static seed; on ->
  // resolveQualityReviewSkill ?? seed; resolve error -> seed. The seed reproduces
  // today's constants, so the off-path is byte-identical to pre-wiring behavior.
  // scoringParams + recommendationMinScore are sourced here and threaded into the
  // scoring loop AND the ranking/reasoning threshold so the gate cannot drift.
  const learnedOn = await sysCtrlRepo
    .getBooleanControl(SystemControlKey.LEARNED_SKILLS_ENABLED, tenantId, false)
    .catch(() => false)
  const qrSkill = learnedOn
    ? (await resolveQualityReviewSkill(tenantId, QR_SCORING_SKILL_SLUG, 1).catch(() => null)) ?? getQualityReviewScoringSeed()
    : getQualityReviewScoringSeed()
  const scoringParams = qrSkill?.scoring
  const recommendationMinScore = scoringParams?.recommendationMinScore ?? 70

  // ---- Budget preflight (fail-open) ----
  let _qraPreflight = { allowed: true }
  try {
    _qraPreflight = await preflightCheck({
      tenantId,
      agentName:       AGENT_NAME,
      estimatedTokens: 0,
      modelName:       'claude-sonnet-4-6',
    })
  } catch (err) {
    console.error('[quality-review-agent] Budget preflight failed — allowing call:', err)
  }
  if (!_qraPreflight.allowed) {
    if (agentRunId) await agentLog.failAgentRun(agentRunId, 'AI budget exhausted').catch(() => null)
    return {
      success: false,
      error:   makeError(QRA_ERROR_CODES.QRA_001, 'AI budget exhausted — quality review blocked.', 'Increase the AI budget limit.'),
      agentRunId,
    }
  }

  // Record AI usage (rule-based v1: 0 tokens; update when LLM scoring path is wired in)
  aiUsageRepo.recordUsage({
    tenantId,
    agentName:       AGENT_NAME,
    featureName:     'qra_scoring',
    modelName:       'claude-sonnet-4-6',
    promptTokens:    0,
    completionTokens: 0,
    totalTokens:     0,
    estimatedCostUsd: 0,
    success:         true,
  }).catch((err) => console.error('[quality-review-agent] Failed to record AI usage event:', err))

  // ---- Steps 6–10: Score, flag, compose, rank, reason ----

  // Step 6: Score versions
  const step6 = await logStep(QRA_AGENT_STEPS.SCORE_VERSIONS, 6, {
    eligible_count: eligibleVersions.length,
  })

  // Convert versions to scoring input
  const versionScoringInputs = eligibleVersions.map(versionToScoringInput)
  const siblingInputs = versionScoringInputs.map(v => ({
    bodyText: v.bodyText, strategyAngle: v.strategyAngle, id: v.id,
  }))

  // Score each version across all 8 dimensions
  const rawScores = versionScoringInputs.map(vInput => {
    const siblings = siblingInputs.filter(s => s.id !== vInput.id)

    const strategicFitResult    = scoreStrategicFit(vInput, strategyScoringInput, siblings as Parameters<typeof scoreStrategicFit>[2])
    const complianceResult      = scoreComplianceConfidence(vInput, scoringParams)
    const ctaClarityResult      = scoreCTAClarity(vInput, strategyScoringInput, scoringParams)
    const specificityResult     = scoreSpecificity(vInput, strategyScoringInput, scoringParams)
    const toneFitResult         = scoreToneFit(vInput, strategyScoringInput, scoringParams)
    const differentiationResult = scoreDifferentiation(vInput, siblings as Parameters<typeof scoreDifferentiation>[1])
    const subjectBodyResult     = scoreSubjectBodyConsistency(vInput, strategyScoringInput, scoringParams)
    const readabilityResult     = scoreReadability(vInput, strategyScoringInput, scoringParams)

    const rawBreakdown: ScoreBreakdown = {
      strategicFit:           strategicFitResult.score,
      complianceConfidence:   complianceResult.score,
      ctaClarity:             ctaClarityResult.score,
      specificity:            specificityResult.score,
      toneFit:                toneFitResult.score,
      differentiation:        differentiationResult.score,
      subjectBodyConsistency: subjectBodyResult.score,
      readability:            readabilityResult.score,
    }

    return { vInput, rawBreakdown, toneFitScore: toneFitResult.score, differentiationScore: differentiationResult.score }
  })

  if (step6) await agentLog.completeAgentRunStep(step6.id, {
    outputSummary: `Scored ${rawScores.length} versions across 8 dimensions`,
    output: { scored_count: rawScores.length },
  }).catch(() => null)

  // Step 7: Generate risk flags
  const step7 = await logStep(QRA_AGENT_STEPS.GENERATE_RISK_FLAGS, 7, {
    version_count: rawScores.length,
  })

  const scoredVersions = rawScores.map(({ vInput, rawBreakdown, toneFitScore, differentiationScore }) => {
    // Apply message type rules
    const ruleResult = applyMessageTypeReviewRules(
      strategy.message_type,
      {
        bodyText:            vInput.bodyText,
        subjectLine:         vInput.subjectLine,
        strategyAngle:       vInput.strategyAngle,
        personalizationUsed: vInput.personalizationUsed,
        personalizationGaps: vInput.personalizationGaps,
      },
      {
        proofPoint:                strategyScoringInput.proofPoint,
        painPointHypothesis:       strategyScoringInput.painPointHypothesis,
        partnerMembershipConfirmed:strategyScoringInput.partnerMembershipConfirmed,
        leadSource:                strategyScoringInput.leadSource,
        conversationNotes:         strategyScoringInput.conversationNotes,
        sequencePosition:          strategyScoringInput.sequencePosition,
      },
      rawBreakdown
    )

    // Apply adjusted scores
    const finalBreakdown: ScoreBreakdown = {
      ...rawBreakdown,
      ...ruleResult.adjustedScores,
    }

    // Sibling versions for risk flag context
    const siblingForFlags = eligibleVersions
      .filter(v => v.id !== vInput.id)
      .map(v => ({ bodyText: v.bodyText, strategyAngle: v.strategyAngle }))

    // Detect risk flags
    const riskFlagResult = detectRiskFlags(
      {
        messageType:               strategy.message_type,
        offerAngle:                strategyScoringInput.offerAngle,
        leadSource:                strategyScoringInput.leadSource,
        proofPoint:                strategyScoringInput.proofPoint,
        painPointHypothesis:       strategyScoringInput.painPointHypothesis,
        partnerMembershipConfirmed:strategyScoringInput.partnerMembershipConfirmed,
        audienceContext:            strategyScoringInput.audienceContext,
        conversationNotes:          strategyScoringInput.conversationNotes,
      },
      {
        subjectLine:         vInput.subjectLine,
        bodyText:            vInput.bodyText,
        strategyAngle:       vInput.strategyAngle,
        personalizationUsed: vInput.personalizationUsed,
        personalizationGaps: vInput.personalizationGaps,
        versionNumber:       vInput.versionNumber,
      },
      siblingForFlags,
      priorContext,
      { toneFitScore, differentiationScore }
    )

    return {
      vInput,
      finalBreakdown,
      riskFlagResult,
      ruleResult,
    }
  })

  if (step7) await agentLog.completeAgentRunStep(step7.id, {
    outputSummary: `Risk flags generated for ${scoredVersions.length} versions`,
    output: {
      total_flags: scoredVersions.reduce((sum, sv) => sum + sv.riskFlagResult.flags.length, 0),
    },
  }).catch(() => null)

  // Step 8: Calculate composite scores
  const step8 = await logStep(QRA_AGENT_STEPS.CALCULATE_COMPOSITE_SCORES, 8, {
    version_count: scoredVersions.length,
  })

  const compositeResults = scoredVersions.map(sv => {
    const compositeResult = calculateCompositeScore(sv.finalBreakdown, sv.riskFlagResult.flags)
    return { ...sv, compositeResult }
  })

  if (step8) await agentLog.completeAgentRunStep(step8.id, {
    outputSummary: `Composite scores: ${compositeResults.map(r => r.compositeResult.compositeScore).join(', ')}`,
    output: { scores: compositeResults.map(r => ({ id: r.vInput.id, score: r.compositeResult.compositeScore })) },
  }).catch(() => null)

  // Step 9: Rank versions
  const step9 = await logStep(QRA_AGENT_STEPS.RANK_VERSIONS, 9, {
    version_count: compositeResults.length,
  })

  // Build rankable drafts (partial — we'll fill in the full draft after recommendation)
  const rankableDrafts = compositeResults.map(cr => ({
    tenantId,
    strategyId,
    versionId:                   cr.vInput.id,
    leadId:                      eligibleVersions.find(v => v.id === cr.vInput.id)?.leadId ?? '',
    companyId:                   eligibleVersions.find(v => v.id === cr.vInput.id)?.companyId ?? null,
    campaignId:                  eligibleVersions.find(v => v.id === cr.vInput.id)?.campaignId ?? null,
    agentRunId:                  agentRunId,
    messageType:                 strategy.message_type,
    versionLabel:                cr.vInput.versionLabel,
    strategyAngle:               cr.vInput.strategyAngle,
    compositeScore:              cr.compositeResult.compositeScore,
    scoreBand:                   cr.compositeResult.scoreBand,
    rankPosition:                0,  // filled below
    isRecommended:               false,
    strategicFitScore:           cr.finalBreakdown.strategicFit,
    complianceConfidenceScore:   cr.finalBreakdown.complianceConfidence,
    ctaClarityScore:             cr.finalBreakdown.ctaClarity,
    specificityScore:            cr.finalBreakdown.specificity,
    toneFitScore:                cr.finalBreakdown.toneFit,
    differentiationScore:        cr.finalBreakdown.differentiation,
    subjectBodyConsistencyScore: cr.finalBreakdown.subjectBodyConsistency,
    readabilityScore:            cr.finalBreakdown.readability,
    riskScore:                   cr.riskFlagResult.riskScore,
    scoreBreakdown:              cr.finalBreakdown,
    scoringReasoning:            generateScoringReasoning(cr.finalBreakdown, cr.riskFlagResult.flags),
    strengths:                   generateStrengths(cr.finalBreakdown, cr.riskFlagResult.flags),
    weaknesses:                  generateWeaknesses(cr.finalBreakdown, cr.riskFlagResult.flags),
    riskFlags:                   cr.riskFlagResult.flags,
    complianceFlags:             cr.riskFlagResult.complianceFlags,
    humanReviewNotes:            null,
    recommendedEdits:            [] as string[],
    comparedAgainstVersionIds:   [] as string[],
    comparisonSummary:           '',
    supersededAt:                null,
    createdByAgent:              AGENT_NAME,
    // Extra fields for ranking
    versionNumber:               cr.vInput.versionNumber,
  }))

  const rankingResult = rankQualityReviews(rankableDrafts)

  if (step9) await agentLog.completeAgentRunStep(step9.id, {
    outputSummary: `Ranked ${rankingResult.ranked.length} versions`,
    output: { ranking: rankingResult.ranked.map(r => ({ versionId: r.draft.versionId, rank: r.rankPosition })) },
  }).catch(() => null)

  // Assign recommendation
  const versionDataMap = new Map(
    eligibleVersions.map(v => [v.id, { complianceNotesApplied: v.complianceNotesApplied }])
  )
  const rankedDraftsSorted = rankingResult.ranked.map(r => ({ ...r.draft, rankPosition: r.rankPosition }))
  const recommendationResult = assignRecommendation(rankedDraftsSorted, versionDataMap, recommendationMinScore)

  // Step 10: Generate reasoning
  const step10 = await logStep(QRA_AGENT_STEPS.GENERATE_REASONING, 10, {
    version_count: rankedDraftsSorted.length,
  })

  // Build final drafts with all fields populated
  const siblingPickList = rankedDraftsSorted.map(d => ({
    versionLabel:  d.versionLabel,
    compositeScore:d.compositeScore,
    rankPosition:  d.rankPosition,
    isRecommended: d.versionId === recommendationResult.recommendedVersionId,
  }))

  const finalDrafts: QualityReviewDraft[] = rankedDraftsSorted.map(d => {
    const isRecommended = d.versionId === recommendationResult.recommendedVersionId
    const siblings = siblingPickList.filter(s => s.versionLabel !== d.versionLabel)

    const humanReviewNotes = generateHumanReviewNotes(
      { compositeScore: d.compositeScore, scoreBand: d.scoreBand, rankPosition: d.rankPosition, isRecommended, versionLabel: d.versionLabel },
      d.strengths,
      d.weaknesses,
      d.riskFlags,
      recommendationMinScore
    )

    const comparisonSummary = generateComparisonSummary(
      { versionLabel: d.versionLabel, compositeScore: d.compositeScore, rankPosition: d.rankPosition, isRecommended },
      siblings
    )

    // The CR for this version
    const cr = compositeResults.find(c => c.vInput.id === d.versionId)

    const recommendedEdits = generateRecommendedEdits(
      d.scoreBreakdown,
      d.riskFlags,
      {
        cta:             strategyScoringInput.cta,
        proofPoint:      strategyScoringInput.proofPoint,
        industrySegment: strategyScoringInput.industrySegment,
      }
    )

    // comparedAgainstVersionIds = all other eligible version IDs
    const comparedAgainstVersionIds = eligibleVersions
      .filter(v => v.id !== d.versionId)
      .map(v => v.id)

    void cr  // used above for scoring — just ensuring no unused warning

    return {
      ...d,
      isRecommended,
      humanReviewNotes,
      comparisonSummary,
      recommendedEdits,
      comparedAgainstVersionIds,
      scoringReasoning: d.scoringReasoning,
    }
  })

  if (step10) await agentLog.completeAgentRunStep(step10.id, {
    outputSummary: `Reasoning generated for ${finalDrafts.length} versions`,
  }).catch(() => null)

  // Step 11: Persistence
  const step11 = await logStep(QRA_AGENT_STEPS.PERSISTENCE, 11, { draft_count: finalDrafts.length })

  let persistedReviews: QualityReview[] = []
  try {
    persistedReviews = await qrRepo.insertManyQualityReviews(finalDrafts)
    if (step11) await agentLog.completeAgentRunStep(step11.id, {
      outputSummary: `Persisted ${persistedReviews.length} quality reviews`,
      output: { review_ids: persistedReviews.map(r => r.id) },
    }).catch(() => null)
  } catch (ex) {
    if (step11) await agentLog.failAgentRunStep(step11.id, String(ex)).catch(() => null)
    if (agentRunId) await agentLog.failAgentRun(agentRunId, String(ex)).catch(() => null)
    return {
      success: false,
      error:   makeError(QRA_ERROR_CODES.QRA_002, `Persistence failed: ${String(ex)}`, 'Check database connectivity.'),
      agentRunId,
    }
  }

  // Complete agent run
  if (agentRunId) {
    await agentLog.completeAgentRun(agentRunId, {
      outputSnapshot: {
        strategy_id:   strategyId,
        review_count:  persistedReviews.length,
        review_ids:    persistedReviews.map(r => r.id),
        message_type:  strategy.message_type,
      },
    }).catch(() => null)

    await agentLog.logAgentRunStep({
      tenantId, agentRunId, stepName: QRA_AGENT_STEPS.RESULT_RETURNED, stepIndex: 12,
      input: { strategy_id: strategyId },
    }).catch(() => null)
  }

  // Emit activity event
  const recommended = persistedReviews.find(r => r.isRecommended) ?? null
  const eventType = recommended
    ? ActivityEventType.QUALITY_REVIEW_COMPLETED
    : ActivityEventType.QUALITY_REVIEW_NO_RECOMMENDATION

  await activitySvc.recordActivity({
    tenantId,
    eventType,
    eventSource:  AGENT_NAME,
    entityType:   'strategy',
    entityId:     strategyId,
    leadId:       eligibleVersions[0]?.leadId ?? strategyId,
    eventSummary: recommended
      ? `Quality review completed — ${persistedReviews.length} versions reviewed, "${recommended.versionLabel}" recommended (score: ${recommended.compositeScore}).`
      : `Quality review completed — ${persistedReviews.length} versions reviewed, no version recommended.`,
    metadata: {
      strategy_id:   strategyId,
      review_count:  persistedReviews.length,
      review_ids:    persistedReviews.map(r => r.id),
      recommended_id:recommended?.id ?? null,
      agent_run_id:  agentRunId,
    },
  }).catch(() => null)

  // Return result
  const topVersion = recommended ?? persistedReviews[0] ?? null
  agentDecisionRepo.createDecision({
    tenantId,
    agentName:         'quality_review_agent',
    agentVersion:      'claude-sonnet-4-6',
    decisionType:      'version_ranked',
    decisionStatus:    'completed',
    leadId:            eligibleVersions[0]?.leadId ?? null,
    draftId:           null,
    confidence:        topVersion?.compositeScore ?? null,
    recommendedAction: topVersion ? `version:${topVersion.versionLabel}` : null,
    shortReason:       topVersion
      ? `Version "${topVersion.versionLabel}" ranked top with composite score ${topVersion.compositeScore}`
      : 'No version recommended',
    inputSnapshot:  { version_count: persistedReviews.length, scoring_rubric: 'rubric-v1' },
    outputSummary:  {
      top_version_id:        topVersion?.id ?? null,
      top_label:             topVersion?.versionLabel ?? null,
      top_composite_score:   topVersion?.compositeScore ?? null,
      recommended_version_id: topVersion?.id ?? null,
    },
    learningTags: [`version_count_${persistedReviews.length}`, topVersion?.versionLabel ?? 'unknown'],
  }).catch((err) => console.error('[quality-review-agent] Failed to write agent decision:', err))

  if (excludedVersions.length > 0) {
    return {
      success:     'partial',
      reviews:     persistedReviews,
      excluded:    excludedVersions,
      recommended,
      agentRunId:  agentRunId ?? '',
    }
  }

  return {
    success:    true,
    reviews:    persistedReviews,
    recommended,
    agentRunId: agentRunId ?? '',
  }
}

// ---- Public read functions ----

export async function listMessageVersionsForStrategy(
  strategyId: string,
  tenantId:   string
): Promise<MessageVersion[]> {
  return versionRepo.listMessageVersionsForStrategy(strategyId, tenantId)
}

export async function listQualityReviewsForStrategy(
  strategyId: string,
  tenantId:   string
): Promise<QualityReview[]> {
  return qrRepo.listQualityReviewsForStrategy(strategyId, tenantId)
}

export async function getRecommendedVersionForStrategy(
  strategyId: string,
  tenantId:   string
): Promise<QualityReview | null> {
  return qrRepo.getRecommendedForStrategy(strategyId, tenantId)
}

export async function canRunQualityReview(
  strategyId: string,
  tenantId:   string
): Promise<{ canRun: boolean; reason: string | null }> {
  const [globalAgentPause, engineValue] = await Promise.all([
    sysCtrlRepo.getBooleanControl('global_agent_pause', tenantId, false),
    sysCtrlRepo.getControlValue('email_generation_engine', tenantId),
  ])
  const emailGenerationEngine = engineValue ? String(engineValue) : null

  if (globalAgentPause) {
    return { canRun: false, reason: 'Global agent pause is active.' }
  }
  if (emailGenerationEngine !== 'phase3b') {
    return { canRun: false, reason: 'Phase 3B is not enabled.' }
  }

  const strategy = await stratRepo.getMessageStrategyById(strategyId, tenantId)
  if (!strategy) {
    return { canRun: false, reason: 'Strategy not found.' }
  }

  const versions = await versionRepo.listMessageVersionsForStrategy(strategyId, tenantId)
  if (versions.length === 0) {
    return { canRun: false, reason: 'No message versions found — generate versions first.' }
  }

  return { canRun: true, reason: null }
}
