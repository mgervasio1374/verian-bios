import { createSupabaseServiceClient } from '@/lib/supabase/service'
import * as companyRepo from '@/modules/crm/repositories/company.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as companyScoreRepo from '@/modules/intelligence/repositories/company-score.repo'
import * as recommendationRepo from '@/modules/intelligence/repositories/recommendation.repo'
import * as agentRunLogging from '@/modules/intelligence/services/agent-run-logging.service'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import * as systemControlService from '@/modules/intelligence/services/system-control.service'
import * as guardrailService from '@/modules/intelligence/services/guardrail.service'
import type { AgentRunRow } from '@/modules/intelligence/types.agent'
import { AgentRunType, GuardrailSeverity, ActivityEventType } from '@/modules/intelligence/types.agent'
import type { CompanyScoringDimensions } from '@/modules/intelligence/services/company-scoring.service'
import type { Database } from '@/types/database'

type CompanyRow  = Database['public']['Tables']['companies']['Row']
type ContactRow  = Database['public']['Tables']['contacts']['Row']
type CompanyScoreRow = Database['public']['Tables']['company_scores']['Row']

// ---- Constants ----

const AGENT_NAME    = 'recommendation_generation_v1'
const RULE_VERSION  = 'recommendation-rules-v1'
const ACTIONABLE_TYPES = new Set([
  'prioritize_outreach',
  'enrich_contact_data',
  'request_statement_review',
  'human_review_required',
])

// ---- Rule types ----

interface RuleResult {
  type:             string
  title:            string
  body:             string
  reason:           string
  priority:         string
  requiresApproval: boolean
}

// ---- Input / output ----

export interface CompanyRecommendationOptions {
  workflowRunId?:  string
  triggerSource?:  string
  triggerEvent?:   string
}

export interface CompanyRecommendationResult {
  success:            true
  recommendationId:   string
  agentRunId:         string
  recommendationType: string
  title:              string
  priority:           string
  confidence:         number
  duplicate:          false
}

export interface CompanyRecommendationDuplicate {
  success:                  false
  duplicate:                true
  existingRecommendationId: string
  error:                    string
}

export interface CompanyRecommendationFailure {
  success:     false
  duplicate:   false
  agentRunId?: string
  error:       string
}

export type CompanyRecommendationOutcome =
  | CompanyRecommendationResult
  | CompanyRecommendationDuplicate
  | CompanyRecommendationFailure

// ---- Priority helper ----

function derivePriority(overall: number): string {
  if (overall >= 85) return 'critical'
  if (overall >= 75) return 'high'
  if (overall >= 55) return 'medium'
  return 'low'
}

// ---- Rule engine ----

function evaluateRecommendationRules(
  score: number,
  dims: CompanyScoringDimensions
): RuleResult {
  const priority = derivePriority(score)

  // Rule 1: prioritize_outreach — strong score + contactable
  if (score >= 75 && dims.contactability >= 60) {
    return {
      type:             'prioritize_outreach',
      title:            'Prioritize outreach',
      body:             `This company has a strong composite score (${score}/100) and sufficient contact data to support immediate sales action. Confidence: ${dims.confidence}%.`,
      reason:           'This company has a strong fit and enough contact data to justify immediate sales action.',
      priority,
      requiresApproval: false,
    }
  }

  // Rule 2: request_statement_review — payment opportunity + contactable
  if (dims.payment_opportunity >= 70 && dims.contactability >= 50) {
    return {
      type:             'request_statement_review',
      title:            'Request processing statement review',
      body:             `This company shows strong payment opportunity signals (${dims.payment_opportunity}/100) with adequate contactability (${dims.contactability}/100). Requesting a processing statement is the logical next step.`,
      reason:           'This company shows payment opportunity signals and has enough contact data to ask for a statement review.',
      priority,
      requiresApproval: false,
    }
  }

  // Rule 3: enrich_contact_data — decent score but weak contact data
  if (score >= 60 && dims.contactability < 50) {
    return {
      type:             'enrich_contact_data',
      title:            'Enrich contact data before outreach',
      body:             `This company scores ${score}/100 overall but contactability is weak (${dims.contactability}/100). Outreach cannot be prioritized until contact information is enriched.`,
      reason:           'This company may be a fit, but contact information is incomplete.',
      priority:         'medium',
      requiresApproval: false,
    }
  }

  // Rule 4: human_review_required — low confidence
  if (dims.confidence < 50) {
    return {
      type:             'human_review_required',
      title:            'Human review required',
      body:             `Confidence in the scoring inputs is low (${dims.confidence}/100). Automated recommendation cannot be relied upon — human review is required before taking any action.`,
      reason:           'Verian does not have enough confidence to recommend automated next action.',
      priority:         'medium',
      requiresApproval: true,
    }
  }

  // Rule 5: monitor_only — mid-range score, no urgent signal
  if (score >= 40) {
    return {
      type:             'monitor_only',
      title:            'Monitor only',
      body:             `This company scores ${score}/100 — not a current priority for outreach. Continue monitoring for scoring changes or new lead activity before escalating.`,
      reason:           'This company does not currently justify priority outreach but may become relevant later.',
      priority:         'low',
      requiresApproval: false,
    }
  }

  // Rule 6: archive_due_to_poor_fit — low score + weak fit
  return {
    type:             'archive_due_to_poor_fit',
    title:            'Archive or deprioritize',
    body:             `This company scores ${score}/100 with weak fit signals. It does not currently meet the threshold for active pipeline attention. Consider archiving or revisiting in 90 days.`,
    reason:           'This company appears to be a low fit based on current scoring inputs.',
    priority:         'low',
    requiresApproval: true,
  }
}

// ---- Task creation ----

async function createTaskForRecommendation(
  company:          CompanyRow,
  tenantId:         string,
  recommendationId: string,
  rule:             RuleResult
): Promise<string | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      tenant_id:         tenantId,
      workspace_id:      company.workspace_id,
      company_id:        company.id,
      recommendation_id: recommendationId,
      title:             rule.title + ` — ${company.name}`,
      description:       rule.reason,
      priority:          rule.priority === 'critical' ? 'high' : rule.priority,
      status:            'open',
      created_by_agent:  true,
    })
    .select('id')
    .single()

  if (error) throw new Error(`createTaskForRecommendation: ${error.message}`)
  return data.id
}

// ---- Main entry point ----

export async function generateCompanyRecommendation(
  companyId: string,
  tenantId:  string,
  options:   CompanyRecommendationOptions = {}
): Promise<CompanyRecommendationOutcome> {
  // ---- Pre-run checks (no agent run started yet) ----

  // 1. Load company — must exist in this tenant
  const company = await companyRepo.getCompany(companyId, tenantId)
  if (!company) {
    return { success: false, duplicate: false, error: `Company not found: ${companyId}` }
  }

  // 2. Load current score — must exist before recommendation can be generated
  const score = await companyScoreRepo.getCurrentCompanyScore(companyId, tenantId, 'overall')
  if (!score) {
    return {
      success: false,
      duplicate: false,
      error: 'Company must be scored before recommendation generation. Run "Score Company" first.',
    }
  }

  // 3. Assert system controls — throws if agents are blocked
  try {
    await systemControlService.assertAgentsAllowed(tenantId)
    await systemControlService.assertRecommendationEngineAllowed(tenantId)
  } catch (err) {
    return {
      success: false,
      duplicate: false,
      error: err instanceof Error ? err.message : 'System controls blocked recommendation generation.',
    }
  }

  // ---- Evaluate rules early to get recommendation type for duplicate check ----
  const dims = (score.dimensions ?? {}) as unknown as CompanyScoringDimensions
  const overallScore = score.score
  const tentativeRule = evaluateRecommendationRules(overallScore, dims)

  // 4. Duplicate check — avoid redundant recommendation of the same active type
  const existing = await recommendationRepo.getActiveCompanyRecommendation(
    companyId, tenantId, tentativeRule.type
  )
  if (existing) {
    return {
      success:                  false,
      duplicate:                true,
      existingRecommendationId: existing.id,
      error: `An active "${tentativeRule.type}" recommendation already exists for this company (id: ${existing.id}). Resolve or supersede it before generating a new one.`,
    }
  }

  // ---- Start agent run ----
  const run: AgentRunRow = await agentRunLogging.startAgentRun({
    tenantId,
    workspaceId:   company.workspace_id,
    agentName:     AGENT_NAME,
    runType:       AgentRunType.ANALYSIS,
    triggerEvent:  options.triggerEvent  ?? 'company.recommendation_requested',
    triggerSource: options.triggerSource ?? 'manual_ui',
    triggerId:     companyId,
    subjectType:   'company',
    subjectId:     companyId,
    workflowRunId: options.workflowRunId ?? undefined,
    inputSnapshot: { companyId, tenantId, overallScore, scoreId: score.id },
  })

  await activityEventService.recordAgentActivity(tenantId, run.id, AGENT_NAME, 'started')

  let currentStepId: string | null = null

  try {
    // ---- Step 0: load_company_profile ----
    const t0 = Date.now()
    const step0 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'load_company_profile', stepIndex: 0,
      inputSummary: `Company: ${company.name} (${companyId})`,
    })
    currentStepId = step0.id

    const contacts: ContactRow[] = await contactRepo.listContacts({
      tenantId, workspaceId: company.workspace_id, companyId, limit: 10,
    })
    await agentRunLogging.completeAgentRunStep(step0.id, {
      outputSummary: `Loaded "${company.name}" — ${contacts.length} contact(s)`,
      durationMs: Date.now() - t0,
    })
    currentStepId = null

    // ---- Step 1: load_latest_company_score ----
    const t1 = Date.now()
    const step1 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'load_latest_company_score', stepIndex: 1,
    })
    currentStepId = step1.id
    await agentRunLogging.completeAgentRunStep(step1.id, {
      outputSummary:   `Overall score: ${overallScore}/100 (confidence: ${dims.confidence}/100)`,
      decisionSummary: `fit=${dims.fit} urgency=${dims.urgency} payment=${dims.payment_opportunity} contactability=${dims.contactability} digital=${dims.digital_maturity}`,
      confidence:      score.confidence ?? undefined,
      durationMs:      Date.now() - t1,
    })
    currentStepId = null

    // ---- Step 2: check_existing_recommendations ----
    const t2 = Date.now()
    const step2 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'check_existing_recommendations', stepIndex: 2,
    })
    currentStepId = step2.id
    await agentRunLogging.completeAgentRunStep(step2.id, {
      outputSummary: `No active duplicate found for type "${tentativeRule.type}". Proceeding.`,
      durationMs:    Date.now() - t2,
    })
    currentStepId = null

    // ---- Step 3: evaluate_recommendation_rules ----
    const t3 = Date.now()
    const step3 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'evaluate_recommendation_rules', stepIndex: 3,
    })
    currentStepId = step3.id

    // Rule is already evaluated above (tentativeRule); finalRule may be overridden by guardrail
    let finalRule = tentativeRule

    await agentRunLogging.completeAgentRunStep(step3.id, {
      outputSummary:   `Rule matched: "${finalRule.type}" → "${finalRule.title}"`,
      decisionSummary: `priority=${finalRule.priority} requiresApproval=${finalRule.requiresApproval} ruleVersion=${RULE_VERSION}`,
      durationMs:      Date.now() - t3,
    })
    currentStepId = null

    // ---- Step 4: check_guardrails ----
    const t4 = Date.now()
    const step4 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'check_guardrails', stepIndex: 4,
    })
    currentStepId = step4.id

    const confidenceDecimal = score.confidence ?? (dims.confidence / 100)
    const confidenceCheck = await guardrailService.checkLowConfidence(run.id, tenantId, confidenceDecimal)
    let guardrailNote = 'All guardrails passed.'
    let taskBlockedByGuardrail = false

    if (!confidenceCheck.allowed) {
      // Record the guardrail event and override recommendation to human_review_required
      await guardrailService.recordGuardrail({
        tenantId,
        agentRunId:    run.id,
        guardrailName: 'low_confidence_recommendation_override',
        guardrailType: 'confidence_threshold',
        severity:      GuardrailSeverity.MEDIUM,
        subjectType:   'company',
        subjectId:     companyId,
        controlKey:    'agent.confidence_threshold.min',
        actionTaken:   'overridden',
        reason:        confidenceCheck.reason,
        context:       { original_type: finalRule.type, confidence: confidenceDecimal },
      })

      finalRule = {
        type:             'human_review_required',
        title:            'Human review required',
        body:             `Scoring confidence is too low (${(confidenceDecimal * 100).toFixed(0)}%) to make a reliable automated recommendation. Human review is required before taking action on this company.`,
        reason:           `Confidence ${(confidenceDecimal * 100).toFixed(0)}% is below the minimum threshold. Original rule was "${tentativeRule.type}".`,
        priority:         'medium',
        requiresApproval: true,
      }
      guardrailNote   = `Low confidence guardrail fired — recommendation overridden to "human_review_required". Task auto-creation skipped.`
      taskBlockedByGuardrail = true
    }

    await agentRunLogging.completeAgentRunStep(step4.id, {
      outputSummary:   guardrailNote,
      guardrailStatus: confidenceCheck.allowed ? 'passed' : 'overridden',
      confidence:      confidenceDecimal,
      durationMs:      Date.now() - t4,
    })
    currentStepId = null

    // ---- Step 5: persist_recommendation ----
    const t5 = Date.now()
    const step5 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'persist_recommendation', stepIndex: 5,
    })
    currentStepId = step5.id

    const evidence = {
      company_id:    companyId,
      score_id:      score.id,
      overall_score: overallScore,
      dimensions:    dims,
      confidence:    confidenceDecimal,
      rule_version:  RULE_VERSION,
    }

    const rec = await recommendationRepo.persistRecommendation({
      tenantId,
      workspaceId:        company.workspace_id,
      subjectType:        'company',
      subjectId:          companyId,
      recommendationType: finalRule.type,
      title:              finalRule.title,
      body:               finalRule.body,
      priority:           finalRule.priority,
      workflowRunId:      options.workflowRunId ?? null,
      promptConfigId:     null,
      rawOutput:          { rule_version: RULE_VERSION, overall_score: overallScore, dims },
      agentRunId:         run.id,
      evidence,
      confidence:         confidenceDecimal,
      reason:             finalRule.reason,
      requiresApproval:   finalRule.requiresApproval,
      outcomeStatus:      'pending',
    })

    await agentRunLogging.completeAgentRunStep(step5.id, {
      outputSummary: `Recommendation persisted (id=${rec.id}) type="${finalRule.type}"`,
      durationMs:    Date.now() - t5,
    })
    currentStepId = null

    // ---- Step 6: create_task_if_allowed ----
    const t6 = Date.now()
    const step6 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'create_task_if_allowed', stepIndex: 6,
    })
    currentStepId = step6.id

    const autoTaskEnabled = await systemControlService.getBooleanControl(
      'auto_task_creation_enabled', tenantId, true
    )
    const isActionable = ACTIONABLE_TYPES.has(finalRule.type)
    let taskNote = ''

    if (!autoTaskEnabled) {
      taskNote = 'Skipped — auto_task_creation_enabled=false.'
    } else if (taskBlockedByGuardrail) {
      taskNote = 'Skipped — low confidence guardrail prevented auto task creation.'
    } else if (!isActionable) {
      taskNote = `Skipped — "${finalRule.type}" is not an actionable recommendation type.`
    } else {
      const taskId = await createTaskForRecommendation(company, tenantId, rec.id, finalRule)
      taskNote = `Task created (id=${taskId}).`

      await activityEventService.recordActivity({
        tenantId,
        eventType:   ActivityEventType.RECOMMENDATION_TASK_CREATED,
        eventSource: 'verian_agent',
        entityType:  'company',
        entityId:    companyId,
        companyId:   companyId,
        eventSummary: `Task created for recommendation "${finalRule.type}"`,
        metadata:    { recommendation_id: rec.id, task_id: taskId, agent_run_id: run.id },
      })
    }

    await agentRunLogging.completeAgentRunStep(step6.id, {
      outputSummary:   taskNote,
      decisionSummary: `autoTaskEnabled=${autoTaskEnabled} isActionable=${isActionable} guardBlocked=${taskBlockedByGuardrail}`,
      durationMs:      Date.now() - t6,
    })
    currentStepId = null

    // ---- Step 7: finalize_run ----
    const t7 = Date.now()
    const step7 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'finalize_run', stepIndex: 7,
    })
    currentStepId = step7.id

    await Promise.all([
      activityEventService.recordActivity({
        tenantId,
        eventType:    ActivityEventType.RECOMMENDATION_GENERATED,
        eventSource:  'verian_agent',
        entityType:   'company',
        entityId:     companyId,
        companyId:    companyId,
        eventSummary: `Recommendation "${finalRule.title}" generated (${finalRule.type}, ${finalRule.priority} priority)`,
        metadata:     { recommendation_id: rec.id, recommendation_type: finalRule.type, agent_run_id: run.id },
      }),
      agentRunLogging.completeAgentRun(run.id, {
        outputSnapshot: { recommendation_id: rec.id, type: finalRule.type, priority: finalRule.priority },
        confidence:     confidenceDecimal,
      }),
    ])

    await agentRunLogging.completeAgentRunStep(step7.id, {
      outputSummary: 'Run finalized.',
      durationMs:    Date.now() - t7,
    })
    await activityEventService.recordAgentActivity(tenantId, run.id, AGENT_NAME, 'completed')
    currentStepId = null

    return {
      success:            true,
      duplicate:          false,
      recommendationId:   rec.id,
      agentRunId:         run.id,
      recommendationType: finalRule.type,
      title:              finalRule.title,
      priority:           finalRule.priority,
      confidence:         confidenceDecimal,
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (currentStepId) {
      await agentRunLogging.failAgentRunStep(currentStepId, message).catch(() => null)
    }
    await agentRunLogging.failAgentRun(run.id, message).catch(() => null)
    await activityEventService.recordAgentActivity(tenantId, run.id, AGENT_NAME, 'failed', {
      error: message,
    }).catch(() => null)

    return { success: false, duplicate: false, agentRunId: run.id, error: message }
  }
}
