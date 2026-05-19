// ============================================================
// Phase 3B — Subject Line Generator
// Deterministic, rule-based generation for v1.
// No external LLM calls.
// Produces a subject line from the VersionAngle + strategy
// context + lead context.
// Designed for future LLM adapter replacement without
// changing service contracts.
// ============================================================

import type { VersionAngle } from './copywriting-agent.types'
import type { MessageStrategy } from '@/modules/messaging/strategy/message-strategy.types'
import type { CopywritingLeadContext } from './copywriting-agent.types'

// ---- Helpers ----

function company(ctx: CopywritingLeadContext): string {
  return ctx.companyName ?? 'your business'
}

function industryLabel(ctx: CopywritingLeadContext, strategy: MessageStrategy): string {
  const seg = ctx.industrySegment ?? strategy.industry_segment ?? ''
  const map: Record<string, string> = {
    home_services:    'home services',
    hvac:             'HVAC',
    plumbing:         'plumbing',
    electrical:       'electrical',
    roofing:          'roofing',
    landscaping:      'landscaping',
    pest_control:     'pest control',
    pool_services:    'pool services',
  }
  return map[seg.toLowerCase()] ?? seg.replace(/_/g, ' ')
}

function partnerName(strategy: MessageStrategy): string {
  return (strategy.partner_membership as unknown as Record<string, string> | null)?.partner_name ?? 'your group'
}

// ---- Subject builders by message type + angle ----

function buildColdOutreachSubject(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co = company(ctx)
  const ind = industryLabel(ctx, strategy)

  switch (angle.strategyAngle) {
    case 'industry_specific_question':
      return ind ? `${ind} processing structure question` : `Processing structure question — ${co}`
    case 'statement_review_offer':
      return `Processing review — ${co}`
    case 'skepticism_aware_advisor':
      return `${co} statement review`
    case 'ultra_direct':
      return ind ? `${ind} payment review — ${co}` : `Statement review — ${co}`
    default:
      return `Processing review — ${co}`
  }
}

function buildNewInquirySubject(angle: VersionAngle, _strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co = company(ctx)
  switch (angle.strategyAngle) {
    case 'warm_inquiry_response': return 'Your processing review request'
    case 'advance_next_step':     return `Got your request — ${co}`
    case 'advisor_education':     return 'Your processing review — what to expect'
    default:                      return 'Your processing review request'
  }
}

function buildStatementSubmittedSubject(angle: VersionAngle, _strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co = company(ctx)
  switch (angle.strategyAngle) {
    case 'professional_confirmation': return `Statement received — ${co}`
    case 'warm_reassurance':          return 'Got your processing statement'
    default:                          return `Statement received — ${co}`
  }
}

function buildStatementReviewSubject(angle: VersionAngle, _strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co = company(ctx)
  switch (angle.strategyAngle) {
    case 'findings_first':       return `What we found in your statement — ${co}`
    case 'advisor_explanation':  return `Statement review complete — ${co}`
    case 'proposal_next_step':   return 'Notes from your statement review'
    default:                     return `Statement review — ${co}`
  }
}

function buildStmtNotSubmittedSubject(angle: VersionAngle, _strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co = company(ctx)
  switch (angle.strategyAngle) {
    case 'reduced_friction':         return 'Still happy to take a look'
    case 'clarify_value':            return `Your statement — any questions?`
    case 'simple_direct_question':   return `One quick thing — ${co}`
    case 'direct_sequence_question': return `${co} — where are we?`
    case 'why_it_matters':           return `Still worth reviewing — ${co}`
    case 'graceful_sequence_exit':   return 'Happy to close this out if needed'
    case 'exit_cta':                 return 'Close out or continue?'
    default:                         return `Statement follow-up — ${co}`
  }
}

function buildProposalFollowUpSubject(angle: VersionAngle, _strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co = company(ctx)
  switch (angle.strategyAngle) {
    case 'decision_status':    return `${co} proposal — any questions?`
    case 'clarify_objection':  return 'Proposal next steps'
    default:                   return `Proposal — ${co}`
  }
}

function buildNoResponseSubject(angle: VersionAngle, _strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co = company(ctx)
  switch (angle.strategyAngle) {
    case 'changed_angle':          return `${co} — one quick question`
    case 'minimal_question':       return 'Still worth a look?'
    case 'brief_reframe':          return `Worth a closer look — ${co}`
    case 'graceful_sequence_exit': return 'Happy to close this out'
    default:                       return `${co} — still relevant?`
  }
}

function buildReEngagementSubject(angle: VersionAngle, _strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co = company(ctx)
  switch (angle.strategyAngle) {
    case 'time_gap_acknowledgment':  return `Worth revisiting — ${co}`
    case 'fresh_reconnect_reason':   return `Back on your radar — ${co}`
    default:                         return `Checking back in — ${co}`
  }
}

function buildPartnerCampaignSubject(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co  = company(ctx)
  const pn  = partnerName(strategy)
  switch (angle.strategyAngle) {
    case 'partner_shared_context':   return `Your ${pn} statement review`
    case 'home_services_operational':return `Processing review — ${co}`
    case 'statement_clarity_partner':return `${co} — free processing review`
    default:                          return `Statement review — ${co}`
  }
}

function buildEventFollowUpSubject(angle: VersionAngle, _strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co       = company(ctx)
  // eventName is a typed field on CopywritingLeadContext, sourced from strategy context.
  const eventName = ctx.eventName ?? 'the event'
  switch (angle.strategyAngle) {
    case 'event_conversation_reference': return `Good meeting you at ${eventName}`
    case 'event_topic_followup':         return `${eventName} conversation — ${co}`
    case 'event_direct_ask':             return `Next step from ${eventName}`
    case 'event_reference_only':         return `Good meeting you at ${eventName}`
    default:                              return `${eventName} follow-up — ${co}`
  }
}

function buildReferralSubject(): string {
  return 'A quick ask'
}

function buildCustomerNurtureSubject(angle: VersionAngle, _strategy: MessageStrategy, ctx: CopywritingLeadContext): string {
  const co = company(ctx)
  switch (angle.strategyAngle) {
    case 'account_review_offer':   return `Account review — ${co}`
    case 'relationship_maintenance':return `Account update — ${co}`
    case 'seasonal_operational':   return `Processing account review — ${co}`
    default:                        return `Account review — ${co}`
  }
}

// ---- Main subject generator ----

export function generateSubjectLine(
  angle:    VersionAngle,
  strategy: MessageStrategy,
  ctx:      CopywritingLeadContext
): string {
  switch (strategy.message_type) {
    case 'cold_outreach':
      return buildColdOutreachSubject(angle, strategy, ctx)
    case 'new_inquiry_response':
      return buildNewInquirySubject(angle, strategy, ctx)
    case 'statement_submitted_confirmation':
      return buildStatementSubmittedSubject(angle, strategy, ctx)
    case 'statement_review_follow_up':
      return buildStatementReviewSubject(angle, strategy, ctx)
    case 'statement_not_submitted_follow_up':
      return buildStmtNotSubmittedSubject(angle, strategy, ctx)
    case 'proposal_follow_up':
      return buildProposalFollowUpSubject(angle, strategy, ctx)
    case 'no_response_follow_up':
      return buildNoResponseSubject(angle, strategy, ctx)
    case 're_engagement':
      return buildReEngagementSubject(angle, strategy, ctx)
    case 'partner_member_specific_campaign':
      return buildPartnerCampaignSubject(angle, strategy, ctx)
    case 'event_expo_follow_up':
      return buildEventFollowUpSubject(angle, strategy, ctx)
    case 'referral_request':
      return buildReferralSubject()
    case 'customer_nurture':
      return buildCustomerNurtureSubject(angle, strategy, ctx)
    default:
      return `Processing review — ${company(ctx)}`
  }
}
