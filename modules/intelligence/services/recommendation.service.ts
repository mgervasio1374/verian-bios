import type { RequestContext } from '@/types/context'
import type {
  LeadRow, FitScoreDimensions, UrgencyScoreDimensions,
  RecommendationRuleContext, RecommendationResult, RecommendationRow,
} from '@/modules/intelligence/types'
import * as recommendationRepo from '@/modules/intelligence/repositories/recommendation.repo'
import * as leadRepo from '@/modules/crm/repositories/lead.repo'

// ---- Rule definitions ----

interface Rule {
  id: string
  check: (ctx: RecommendationRuleContext) => boolean
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: (ctx: RecommendationRuleContext) => string
  body: (ctx: RecommendationRuleContext) => string
  key_inputs: string[]
  reasoning: (ctx: RecommendationRuleContext) => string
}

const RULES: Rule[] = [
  {
    id: 'close_deal_now',
    check: ({ fitScore, urgencyScore, lead }) =>
      urgencyScore >= 72 && fitScore >= 60 &&
      ['negotiation', 'proposal'].includes(lead.stage),
    priority: 'critical',
    title: () => 'Close this deal — schedule final discussion',
    body: ({ lead, fitScore, urgencyScore }) =>
      `This lead has a strong fit (${fitScore}/100) and high urgency (${urgencyScore}/100) ` +
      `and is in the "${lead.stage.replace(/_/g, ' ')}" stage. ` +
      `Prioritize scheduling a closing conversation this week.`,
    key_inputs: ['fit_score', 'urgency_score', 'stage'],
    reasoning: ({ fitScore, urgencyScore }) =>
      `High fit (${fitScore}) + high urgency (${urgencyScore}) + advanced stage = strong close signal.`,
  },
  {
    id: 'push_through_negotiation',
    check: ({ urgencyScore, lead }) =>
      urgencyScore >= 60 && lead.stage === 'negotiation',
    priority: 'high',
    title: () => 'Address objections and push to close',
    body: ({ lead, urgencyScore }) =>
      `Lead is in negotiation with urgency score ${urgencyScore}/100. ` +
      `Identify remaining objections and offer solutions to move toward a signed agreement. ` +
      (lead.expected_close_date
        ? `Target close date is ${new Date(lead.expected_close_date).toLocaleDateString()}.`
        : 'Set a firm close date with the prospect.'),
    key_inputs: ['urgency_score', 'stage', 'expected_close_date'],
    reasoning: ({ urgencyScore }) =>
      `Negotiation stage + urgency ${urgencyScore} → objection removal is the next lever.`,
  },
  {
    id: 'send_proposal',
    check: ({ fitScore, lead }) =>
      fitScore >= 60 && lead.stage === 'statement_review',
    priority: 'high',
    title: () => 'Prepare and send a proposal',
    body: ({ lead, fitScore }) =>
      `This lead scores ${fitScore}/100 on fit and has been through statement review. ` +
      `They are ready for a formal proposal. Prepare pricing based on their processing volume ` +
      `and send within the next 48 hours.`,
    key_inputs: ['fit_score', 'stage', 'estimated_value'],
    reasoning: ({ fitScore }) =>
      `Fit ${fitScore} + statement_review stage = proposal is the natural next step.`,
  },
  {
    id: 'request_statement',
    check: ({ fitScore, lead }) =>
      fitScore >= 40 && lead.stage === 'statement_review',
    priority: 'high',
    title: () => 'Request merchant processing statement',
    body: ({ lead }) =>
      `This lead is in the statement review stage. ` +
      `Request their most recent merchant processing statement to evaluate current rates, ` +
      `volume, and chargeback ratio before preparing an offer.` +
      (lead.contact_id ? '' : ' No contact is linked — add a contact first.'),
    key_inputs: ['stage', 'fit_score', 'contact_id'],
    reasoning: () => 'Statement review stage requires statement before advancing.',
  },
  {
    id: 'urgent_early_outreach',
    check: ({ urgencyScore, fitScore, lead }) =>
      urgencyScore >= 65 && fitScore >= 40 &&
      ['new', 'contacted'].includes(lead.stage),
    priority: 'high',
    title: () => 'High urgency — reach out immediately',
    body: ({ lead, urgencyScore, fitScore }) =>
      `This lead shows strong urgency signals (${urgencyScore}/100) with decent fit (${fitScore}/100) ` +
      `but is still in the "${lead.stage}" stage. ` +
      `${lead.priority === 'critical' ? 'Marked critical priority. ' : ''}` +
      `Make direct contact today to avoid losing momentum.`,
    key_inputs: ['urgency_score', 'fit_score', 'stage', 'priority'],
    reasoning: ({ urgencyScore, fitScore }) =>
      `Urgency ${urgencyScore} + fit ${fitScore} + early stage = risk of opportunity loss without immediate action.`,
  },
  {
    id: 'initial_contact',
    check: ({ fitScore, lead }) => fitScore >= 50 && lead.stage === 'new',
    priority: 'medium',
    title: () => 'Qualified new lead — make initial contact',
    body: ({ lead, fitScore }) =>
      `This lead has a strong fit score (${fitScore}/100) and has not yet been contacted. ` +
      `Reach out to introduce your services and qualify their payment processing needs. ` +
      (lead.estimated_value
        ? `Estimated opportunity value: $${Number(lead.estimated_value).toLocaleString()}.`
        : ''),
    key_inputs: ['fit_score', 'stage', 'estimated_value', 'source'],
    reasoning: ({ fitScore }) =>
      `Fit ${fitScore} on a new lead — initial outreach is the first action.`,
  },
  {
    id: 'proposal_follow_up',
    check: ({ lead }) => lead.stage === 'proposal',
    priority: 'medium',
    title: () => 'Follow up on sent proposal',
    body: ({ lead }) =>
      `A proposal is outstanding for this lead. ` +
      `Follow up to confirm they received it, answer questions, and establish a decision timeline. ` +
      (lead.expected_close_date
        ? `Target close is ${new Date(lead.expected_close_date).toLocaleDateString()}.`
        : ''),
    key_inputs: ['stage', 'expected_close_date'],
    reasoning: () => 'Proposal stage — follow-up drives decision.',
  },
  {
    id: 'low_fit_qualify',
    check: ({ fitScore }) => fitScore < 35,
    priority: 'low',
    title: () => 'Low fit — qualify before investing time',
    body: ({ lead, fitScore }) =>
      `This lead scores ${fitScore}/100 on fit. ` +
      `Before investing significant sales effort, verify: ` +
      (!lead.company_id ? 'link a company; ' : '') +
      (!lead.contact_id ? 'add a contact; ' : '') +
      (!lead.estimated_value ? 'get a processing volume estimate; ' : '') +
      'confirm they are a viable prospect for merchant processing.',
    key_inputs: ['fit_score', 'company_id', 'contact_id', 'estimated_value'],
    reasoning: ({ fitScore }) => `Fit ${fitScore} < 35 → qualification needed before pipeline investment.`,
  },
  {
    id: 'standard_follow_up',
    check: ({ lead }) => lead.stage === 'contacted',
    priority: 'medium',
    title: () => 'Follow up on previous contact',
    body: ({ lead }) =>
      `You have previously contacted this lead. ` +
      `Follow up to check on their current payment processing situation and gauge readiness ` +
      `to move to statement review.` +
      (lead.estimated_value
        ? ` Potential value: $${Number(lead.estimated_value).toLocaleString()}.`
        : ''),
    key_inputs: ['stage', 'estimated_value'],
    reasoning: () => 'Contacted stage — next step is to advance to statement review.',
  },
  {
    // Default catch-all
    id: 'default_action',
    check: () => true,
    priority: 'low',
    title: ({ lead }) => `Review "${lead.stage.replace(/_/g, ' ')}" lead and plan next step`,
    body: ({ lead, fitScore, urgencyScore }) =>
      `Fit: ${fitScore}/100 · Urgency: ${urgencyScore}/100 · Stage: ${lead.stage.replace(/_/g, ' ')}. ` +
      `Review lead details and determine the appropriate next action.`,
    key_inputs: ['fit_score', 'urgency_score', 'stage'],
    reasoning: () => 'No specific rule matched — default review action.',
  },
]

/**
 * Evaluate rules and return the first matching recommendation.
 * Pure function — no side effects.
 */
export function evaluateRecommendationRules(
  lead: LeadRow,
  fitScore: number,
  urgencyScore: number,
  fitDimensions: FitScoreDimensions,
  urgencyDimensions: UrgencyScoreDimensions
): RecommendationResult {
  const ctx: RecommendationRuleContext = {
    lead, fitScore, urgencyScore, fitDimensions, urgencyDimensions,
  }

  for (const rule of RULES) {
    if (rule.check(ctx)) {
      return {
        ruleId: rule.id,
        recommendation_type: 'next_action',
        priority: rule.priority,
        title: rule.title(ctx),
        body: rule.body(ctx),
        key_inputs_used: rule.key_inputs,
        reasoning: rule.reasoning(ctx),
      }
    }
  }

  // Should never reach here due to default catch-all
  throw new Error('No recommendation rule matched — missing default rule')
}

/**
 * Generate and persist a recommendation for a lead.
 */
export async function generateRecommendation(
  ctx: RequestContext,
  leadId: string,
  fitScore: number,
  urgencyScore: number,
  fitDimensions: FitScoreDimensions,
  urgencyDimensions: UrgencyScoreDimensions,
  workflowRunId?: string | null
): Promise<RecommendationRow> {
  const lead = await leadRepo.getLead(leadId, ctx.tenantId)
  if (!lead) throw new Error(`Lead not found: ${leadId}`)

  const result = evaluateRecommendationRules(
    lead, fitScore, urgencyScore, fitDimensions, urgencyDimensions
  )

  const rawOutput: Record<string, unknown> = {
    rule_matched: result.ruleId,
    reasoning: result.reasoning,
    key_inputs_used: result.key_inputs_used,
    scores: { fit: fitScore, urgency: urgencyScore },
    fit_dimensions: fitDimensions,
    urgency_dimensions: urgencyDimensions,
    model_used: 'simple-rules-v1',
    generated_at: new Date().toISOString(),
  }

  return recommendationRepo.persistRecommendation({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    subjectType: 'lead',
    subjectId: leadId,
    recommendationType: result.recommendation_type,
    title: result.title,
    body: result.body,
    priority: result.priority,
    workflowRunId: workflowRunId ?? null,
    promptConfigId: null,
    rawOutput,
  })
}
