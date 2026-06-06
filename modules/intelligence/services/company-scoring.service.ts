import { createSupabaseServiceClient } from '@/lib/supabase/service'
import * as companyRepo from '@/modules/crm/repositories/company.repo'
import * as contactRepo from '@/modules/crm/repositories/contact.repo'
import * as companyScoreRepo from '@/modules/intelligence/repositories/company-score.repo'
import * as agentRunLogging from '@/modules/intelligence/services/agent-run-logging.service'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import * as systemControlService from '@/modules/intelligence/services/system-control.service'
import type { Database } from '@/types/database'
import type { AgentRunRow } from '@/modules/intelligence/types.agent'
import { AgentRunType } from '@/modules/intelligence/types.agent'

type CompanyRow = Database['public']['Tables']['companies']['Row']
type ContactRow = Database['public']['Tables']['contacts']['Row']
type LeadRow    = Database['public']['Tables']['leads']['Row']

// ---- Constants ----

const AGENT_NAME    = 'company_scoring_v1'
const SCORE_VERSION = 'v1'
const MODEL_ID      = 'simple-rules-v1'

// ---- Dimension types ----

export interface CompanyFitDimensions {
  data_completeness: number  // 0-40
  revenue_signal:    number  // 0-30
  profile_depth:     number  // 0-30
}

export interface UrgencyDimensions {
  active_lead_signals: number  // 0-40
  stage_advancement:   number  // 0-30
  time_signals:        number  // 0-30
}

export interface PaymentOpportunityDimensions {
  lead_value:        number  // 0-50
  revenue_proxy:     number  // 0-30
  industry_affinity: number  // 0-20
}

export interface ContactabilityDimensions {
  contact_channels: number  // 0-60
  contact_quality:  number  // 0-40
}

export interface DigitalMaturityDimensions {
  web_presence:    number  // 0-70
  digital_signals: number  // 0-30
}

export interface CompanyScoringDimensions {
  fit:                 number
  urgency:             number
  payment_opportunity: number
  contactability:      number
  digital_maturity:    number
  confidence:          number
  overall:             number
}

// ---- Input / output ----

export interface ScoreCompanyOptions {
  workflowRunId?: string
  triggerSource?: string
  triggerEvent?:  string
}

export interface CompanyScoringResult {
  success:         true
  companyScoreId:  string
  agentRunId:      string
  overallScore:    number
  dimensions:      CompanyScoringDimensions
}

export interface CompanyScoringFailure {
  success:     false
  agentRunId?: string
  error:       string
}

// ---- Pure scoring functions ----

function scoreFit(company: CompanyRow, contacts: ContactRow[]): number {
  let dataCompleteness = 0
  if (company.website)        dataCompleteness += 8
  if (company.phone)          dataCompleteness += 8
  if (company.industry)       dataCompleteness += 8
  if (company.employee_count) dataCompleteness += 8
  if (company.annual_revenue) dataCompleteness += 8

  const revenue = Number(company.annual_revenue ?? 0)
  let revenueSignal = 0
  if (revenue >= 5_000_000)      revenueSignal = 30
  else if (revenue >= 2_000_000) revenueSignal = 24
  else if (revenue >= 1_000_000) revenueSignal = 18
  else if (revenue >= 500_000)   revenueSignal = 12
  else if (revenue >= 100_000)   revenueSignal = 6

  let profileDepth = 0
  if (company.domain) profileDepth += 10
  if (company.city)   profileDepth += 5
  if (company.state)  profileDepth += 5
  if (contacts.length > 0) profileDepth += 10

  return Math.min(100, dataCompleteness + revenueSignal + profileDepth)
}

function scoreUrgency(leads: LeadRow[]): number {
  const active = leads.filter(l => l.status === 'open')

  let activeLeadSignals = 0
  if (active.length > 0) activeLeadSignals += 15
  if (active.some(l => l.priority === 'critical')) activeLeadSignals += 25

  let stageAdvancement = 0
  if (active.some(l => ['negotiation', 'proposal_sent'].includes(l.stage))) stageAdvancement = 30
  else if (active.some(l => l.stage === 'statement_received'))              stageAdvancement = 20
  else if (active.some(l => l.stage === 'contacted'))                       stageAdvancement = 10

  const now = Date.now()
  let timeSignals = 0

  const closeSoonDays = active
    .filter(l => l.expected_close_date)
    .map(l => (new Date(l.expected_close_date!).getTime() - now) / 86_400_000)

  if (closeSoonDays.some(d => d <= 14))       timeSignals += 30
  else if (closeSoonDays.some(d => d <= 30))   timeSignals += 20

  const ageDays = active.map(l => (now - new Date(l.created_at).getTime()) / 86_400_000)
  if (ageDays.some(d => d <= 7))              timeSignals += 20
  else if (ageDays.some(d => d <= 30))        timeSignals += 10

  return Math.min(100, activeLeadSignals + stageAdvancement + timeSignals)
}

const HIGH_OPPORTUNITY_INDUSTRIES = new Set([
  'retail', 'restaurant', 'hospitality', 'food_service', 'ecommerce',
  'food & beverage', 'hotel', 'grocery',
])
const MEDIUM_OPPORTUNITY_INDUSTRIES = new Set([
  'professional_services', 'healthcare', 'automotive', 'beauty', 'fitness',
])

function scorePaymentOpportunity(company: CompanyRow, leads: LeadRow[]): number {
  const maxLeadValue = leads
    .filter(l => l.status === 'open' && l.estimated_value)
    .reduce((max, l) => Math.max(max, Number(l.estimated_value ?? 0)), 0)

  let leadValue = 0
  if (maxLeadValue >= 20_000)      leadValue = 50
  else if (maxLeadValue >= 15_000) leadValue = 40
  else if (maxLeadValue >= 10_000) leadValue = 30
  else if (maxLeadValue >= 5_000)  leadValue = 20
  else if (maxLeadValue >= 1_000)  leadValue = 10

  const revenue = Number(company.annual_revenue ?? 0)
  let revenueProxy = 0
  if (revenue >= 2_000_000)      revenueProxy = 30
  else if (revenue >= 1_000_000) revenueProxy = 24
  else if (revenue >= 500_000)   revenueProxy = 18
  else if (revenue >= 100_000)   revenueProxy = 12

  const industry = (company.industry ?? '').toLowerCase()
  let industryAffinity = 5
  if (HIGH_OPPORTUNITY_INDUSTRIES.has(industry))   industryAffinity = 20
  else if (MEDIUM_OPPORTUNITY_INDUSTRIES.has(industry)) industryAffinity = 15

  return Math.min(100, leadValue + revenueProxy + industryAffinity)
}

function scoreContactability(company: CompanyRow, contacts: ContactRow[]): number {
  let contactChannels = 0
  if (company.phone)   contactChannels += 20
  if (company.website) contactChannels += 20

  const primaryContact = contacts.find(c => c.is_primary_contact)
  const anyContact     = contacts[0]
  const emailContact   = contacts.find(c => c.email)

  if (emailContact) contactChannels += 20

  let contactQuality = 0
  if (contacts.length > 0)  contactQuality += 15
  if (primaryContact)        contactQuality += 15
  if (emailContact)          contactQuality += 10

  return Math.min(100, contactChannels + contactQuality)
}

function scoreDigitalMaturity(company: CompanyRow): number {
  let webPresence = 0
  if (company.website) webPresence += 40
  if (company.domain)  webPresence += 30

  const revenue = Number(company.annual_revenue ?? 0)
  let digitalSignals = 0
  if (revenue >= 500_000) digitalSignals += 15

  const industry = (company.industry ?? '').toLowerCase()
  if (['ecommerce', 'saas', 'technology', 'software'].includes(industry)) digitalSignals += 15
  else if (HIGH_OPPORTUNITY_INDUSTRIES.has(industry)) digitalSignals += 10

  return Math.min(100, webPresence + digitalSignals)
}

function scoreConfidence(company: CompanyRow, contacts: ContactRow[], leads: LeadRow[]): number {
  const checks = [
    !!company.website,
    !!company.phone,
    !!company.industry,
    !!company.employee_count,
    !!company.annual_revenue,
    !!company.domain,
    contacts.length > 0,
    leads.filter(l => l.status === 'open').length > 0,
    contacts.some(c => !!c.email),
    !!company.city,
  ]
  const filled = checks.filter(Boolean).length
  return Math.round((filled / checks.length) * 100)
}

function calcOverall(d: CompanyScoringDimensions): number {
  return Math.round(
    d.fit                 * 0.30 +
    d.urgency             * 0.20 +
    d.payment_opportunity * 0.25 +
    d.digital_maturity    * 0.10 +
    d.contactability      * 0.10 +
    d.confidence          * 0.05
  )
}

// ---- Loads leads by company_id directly (lead.repo.ts has no companyId filter) ----

async function loadLeadsForCompany(companyId: string, tenantId: string): Promise<LeadRow[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`loadLeadsForCompany: ${error.message}`)
  return data ?? []
}

// ---- Main entry point ----

export async function scoreCompany(
  companyId: string,
  tenantId: string,
  options: ScoreCompanyOptions = {}
): Promise<CompanyScoringResult | CompanyScoringFailure> {
  // Gate check — throws if agents are blocked
  await systemControlService.assertAgentsAllowed(tenantId)

  // Start agent run
  const run: AgentRunRow = await agentRunLogging.startAgentRun({
    tenantId,
    agentName:     AGENT_NAME,
    runType:       AgentRunType.SCORING,
    triggerEvent:  options.triggerEvent  ?? 'company.score_requested',
    triggerSource: options.triggerSource ?? 'internal',
    triggerId:     companyId,
    subjectType:   'company',
    subjectId:     companyId,
    workflowRunId: options.workflowRunId ?? undefined,
    inputSnapshot: { companyId, tenantId },
  })

  await activityEventService.recordAgentActivity(tenantId, run.id, AGENT_NAME, 'started')

  let currentStepId: string | null = null

  try {
    // ---- Step 0: load_company_profile ----
    const t0 = Date.now()
    const step0 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'load_company_profile', stepIndex: 0,
      inputSummary: `Loading company ${companyId}`,
    })
    currentStepId = step0.id

    const company = await companyRepo.getCompanyByTenant(companyId, tenantId)
    if (!company) {
      await agentRunLogging.failAgentRunStep(step0.id, `Company not found: ${companyId}`)
      throw new Error(`Company not found: ${companyId}`)
    }

    const [contacts, leads] = await Promise.all([
      contactRepo.listContacts({ tenantId, workspaceId: company.workspace_id, companyId, limit: 20 }),
      loadLeadsForCompany(companyId, tenantId),
    ])

    await agentRunLogging.completeAgentRunStep(step0.id, {
      outputSummary: `Loaded "${company.name}" — ${contacts.length} contacts, ${leads.length} leads`,
      durationMs: Date.now() - t0,
    })
    currentStepId = null

    // ---- Step 1: calculate_fit_score ----
    const t1 = Date.now()
    const step1 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'calculate_fit_score', stepIndex: 1,
    })
    currentStepId = step1.id
    const fitScore = scoreFit(company, contacts)
    await agentRunLogging.completeAgentRunStep(step1.id, {
      outputSummary: `Fit score: ${fitScore}/100`,
      confidence: fitScore / 100,
      durationMs: Date.now() - t1,
    })
    currentStepId = null

    // ---- Step 2: calculate_urgency_score ----
    const t2 = Date.now()
    const step2 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'calculate_urgency_score', stepIndex: 2,
    })
    currentStepId = step2.id
    const urgencyScore = scoreUrgency(leads)
    await agentRunLogging.completeAgentRunStep(step2.id, {
      outputSummary: `Urgency score: ${urgencyScore}/100`,
      durationMs: Date.now() - t2,
    })
    currentStepId = null

    // ---- Step 3: calculate_payment_opportunity_score ----
    const t3 = Date.now()
    const step3 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'calculate_payment_opportunity_score', stepIndex: 3,
    })
    currentStepId = step3.id
    const paymentOpportunityScore = scorePaymentOpportunity(company, leads)
    await agentRunLogging.completeAgentRunStep(step3.id, {
      outputSummary: `Payment opportunity score: ${paymentOpportunityScore}/100`,
      durationMs: Date.now() - t3,
    })
    currentStepId = null

    // ---- Step 4: calculate_contactability_score ----
    const t4 = Date.now()
    const step4 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'calculate_contactability_score', stepIndex: 4,
    })
    currentStepId = step4.id
    const contactabilityScore = scoreContactability(company, contacts)
    await agentRunLogging.completeAgentRunStep(step4.id, {
      outputSummary: `Contactability score: ${contactabilityScore}/100`,
      durationMs: Date.now() - t4,
    })
    currentStepId = null

    // ---- Step 5: calculate_digital_maturity_score ----
    const t5 = Date.now()
    const step5 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'calculate_digital_maturity_score', stepIndex: 5,
    })
    currentStepId = step5.id
    const digitalMaturityScore = scoreDigitalMaturity(company)
    await agentRunLogging.completeAgentRunStep(step5.id, {
      outputSummary: `Digital maturity score: ${digitalMaturityScore}/100`,
      durationMs: Date.now() - t5,
    })
    currentStepId = null

    // ---- Step 6: calculate_confidence_score ----
    const t6 = Date.now()
    const step6 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'calculate_confidence_score', stepIndex: 6,
    })
    currentStepId = step6.id
    const confidenceScore = scoreConfidence(company, contacts, leads)
    await agentRunLogging.completeAgentRunStep(step6.id, {
      outputSummary: `Confidence score: ${confidenceScore}/100`,
      durationMs: Date.now() - t6,
    })
    currentStepId = null

    // ---- Step 7: calculate_overall_score ----
    const t7 = Date.now()
    const step7 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'calculate_overall_score', stepIndex: 7,
    })
    currentStepId = step7.id

    const dimensions: CompanyScoringDimensions = {
      fit:                 fitScore,
      urgency:             urgencyScore,
      payment_opportunity: paymentOpportunityScore,
      contactability:      contactabilityScore,
      digital_maturity:    digitalMaturityScore,
      confidence:          confidenceScore,
      overall:             0,
    }
    dimensions.overall = calcOverall(dimensions)

    await agentRunLogging.completeAgentRunStep(step7.id, {
      outputSummary:   `Overall score: ${dimensions.overall}/100`,
      decisionSummary: `fit=${fitScore} urgency=${urgencyScore} payment=${paymentOpportunityScore} contactability=${contactabilityScore} digital=${digitalMaturityScore} confidence=${confidenceScore}`,
      confidence:      confidenceScore / 100,
      durationMs:      Date.now() - t7,
    })
    currentStepId = null

    // ---- Step 8: persist_company_score ----
    const t8 = Date.now()
    const step8 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'persist_company_score', stepIndex: 8,
    })
    currentStepId = step8.id

    const scoreRow = await companyScoreRepo.upsertCompanyScore({
      tenantId,
      workspaceId:  company.workspace_id,
      companyId,
      scoreType:    'overall',
      score:        dimensions.overall,
      scoreVersion: SCORE_VERSION,
      dimensions:   dimensions as unknown as Record<string, unknown>,
      reasoning:    `V1 rules-based composite score. fit=${fitScore} urgency=${urgencyScore} payment=${paymentOpportunityScore} contactability=${contactabilityScore} digital=${digitalMaturityScore} confidence=${confidenceScore}`,
      modelUsed:    MODEL_ID,
      confidence:   confidenceScore / 100,
      agentRunId:   run.id,
    })

    await agentRunLogging.completeAgentRunStep(step8.id, {
      outputSummary: `Score ${dimensions.overall}/100 persisted (id=${scoreRow.id})`,
      durationMs: Date.now() - t8,
    })
    currentStepId = null

    // ---- Step 9: finalize_run ----
    const t9 = Date.now()
    const step9 = await agentRunLogging.logAgentRunStep({
      tenantId, agentRunId: run.id, stepName: 'finalize_run', stepIndex: 9,
    })
    currentStepId = step9.id

    await Promise.all([
      activityEventService.recordScoringActivity(
        tenantId, companyId, 'overall', dimensions.overall, run.id
      ),
      agentRunLogging.completeAgentRun(run.id, {
        outputSnapshot: { overall: dimensions.overall, dimensions },
        confidence:     confidenceScore / 100,
      }),
    ])

    await agentRunLogging.completeAgentRunStep(step9.id, {
      outputSummary: 'Run finalized.',
      durationMs: Date.now() - t9,
    })
    await activityEventService.recordAgentActivity(tenantId, run.id, AGENT_NAME, 'completed')
    currentStepId = null

    return {
      success:        true,
      companyScoreId: scoreRow.id,
      agentRunId:     run.id,
      overallScore:   dimensions.overall,
      dimensions,
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Fail the active step if one was open
    if (currentStepId) {
      await agentRunLogging.failAgentRunStep(currentStepId, message).catch(() => null)
    }

    await agentRunLogging.failAgentRun(run.id, message).catch(() => null)
    await activityEventService.recordAgentActivity(tenantId, run.id, AGENT_NAME, 'failed', {
      error: message,
    }).catch(() => null)

    return { success: false, agentRunId: run.id, error: message }
  }
}
