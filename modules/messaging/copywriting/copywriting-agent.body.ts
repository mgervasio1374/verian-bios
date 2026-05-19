// ============================================================
// Phase 3B — Body Text Generator
// Deterministic, rule-based generation for v1.
// No external LLM calls.
// Designed so a future LLM adapter can replace this module
// without changing service contracts.
//
// Each angle gets a genuinely different structural pattern.
// Content comes from strategy fields — not hardcoded templates.
// body_html is always null (v1 rule).
// Exactly one CTA per version.
// ============================================================

import type { VersionAngle, CopywritingLeadContext, DifferentiationProfile } from './copywriting-agent.types'
import type { MessageStrategy } from '@/modules/messaging/strategy/message-strategy.types'

export interface BodyGenerationResult {
  bodyText:             string
  personalizationUsed:  string[]
  personalizationGaps:  string[]
  differentiationHints: Partial<DifferentiationProfile>
}

// ---- Helpers ----

function co(ctx: CopywritingLeadContext): string {
  return ctx.companyName ?? 'your business'
}

function contact(ctx: CopywritingLeadContext): string | null {
  return ctx.contactName
}

function salutation(ctx: CopywritingLeadContext): string {
  const name = contact(ctx)
  return name ? `Hi ${name.split(' ')[0]},` : 'Hi,'
}

function industryPhrase(ctx: CopywritingLeadContext, strategy: MessageStrategy): string {
  const seg = ctx.industrySegment ?? strategy.industry_segment ?? ''
  if (!seg) return 'businesses like yours'
  const map: Record<string, string> = {
    home_services: 'home services businesses',
    hvac:          'HVAC contractors',
    plumbing:      'plumbing contractors',
    electrical:    'electrical contractors',
    roofing:       'roofing contractors',
    landscaping:   'landscaping businesses',
  }
  return map[seg.toLowerCase()] ?? `${seg.replace(/_/g, ' ')} businesses`
}

function ctaSentence(strategy: MessageStrategy): string {
  const cta = strategy.cta ?? 'Worth a 15-minute review of your statement?'
  // Use as-is from strategy — strategy controls CTA direction
  return cta.endsWith('?') || cta.endsWith('.') ? cta : `${cta}.`
}

function audienceContextSentence(strategy: MessageStrategy): string {
  const ac = strategy.audience_context ?? ''
  if (!ac) return ''
  // Use the first meaningful sentence of audience_context
  const firstSentence = ac.split(/[.!?]/)[0]?.trim() ?? ac
  return firstSentence.length > 20 ? firstSentence : ac
}

function painPointSentence(strategy: MessageStrategy): string {
  const pp = strategy.pain_point_hypothesis ?? ''
  if (!pp) return ''
  const firstSentence = pp.split(/[.!?]/)[0]?.trim() ?? pp
  return firstSentence.length > 10 ? firstSentence : pp
}

function trustAngleSentence(strategy: MessageStrategy): string {
  const ta = strategy.trust_angle ?? ''
  if (!ta) return ''
  const firstSentence = ta.split(/[.!?]/)[0]?.trim() ?? ta
  return firstSentence
}

function offerSentence(strategy: MessageStrategy): string {
  const oa = strategy.offer_angle ?? 'cost_clarity'
  const offerMap: Record<string, string> = {
    cost_clarity:              'Our review looks at how transactions are categorized and whether the current fee structure makes sense for your business.',
    statement_review:          'Our free statement review looks at what the data actually shows — no pitch, just a clear look at your processing structure.',
    savings_review:            'A statement review can reveal whether there is a savings opportunity in how your transactions are currently categorized.',
    confirmed_savings_review:  'The review found a concrete savings opportunity in your processing structure worth discussing.',
    proposal_review:           'The proposal outlines what a restructured processing arrangement would look like for your business.',
    account_review:            'A periodic account review makes sure your processing setup still matches how your business operates.',
    partner_member_review:     'As a member, a processing review can confirm whether your current setup is working as well as it should.',
    event_follow_up_review:    'Based on what we discussed, a statement review would be the natural next step.',
    referral_request:          'The review we completed together gave us a clear picture of your processing structure.',
    customer_nurture_check:    'A quick account review can flag any changes worth discussing.',
  }
  return offerMap[oa] ?? offerMap.cost_clarity
}

function trackPersonalization(ctx: CopywritingLeadContext, strategy: MessageStrategy): { used: string[]; gaps: string[] } {
  const used: string[] = []
  const gaps: string[] = []

  if (ctx.contactName)      used.push('contact_name')
  else                      gaps.push('contact_name: name-free opener used')

  if (ctx.companyName)      used.push('company_name')
  else                      gaps.push('company_name: generic reference used')

  if (ctx.industrySegment || strategy.industry_segment) used.push('industry_segment')
  else                      gaps.push('industry_segment: no industry framing')

  if (ctx.knownPaymentContext)      used.push('known_payment_context')
  if (ctx.currentProcessor)        used.push('current_processor')
  if (ctx.estimatedMonthlyVolume)  used.push('estimated_monthly_volume')

  return { used, gaps }
}

// ============================================================
// MT-1: Cold Outreach
// ============================================================

function buildColdOutreachBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal = salutation(ctx)
  const ind = industryPhrase(ctx, strategy)
  const cta = ctaSentence(strategy)
  const audience = audienceContextSentence(strategy)
  const pain     = painPointSentence(strategy)
  const trust    = trustAngleSentence(strategy)
  const offer    = offerSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'industry_specific_question':
      // Opens with an industry-specific question/observation
      bodyText = [
        sal,
        '',
        audience || `${ind} often process a mix of card types that can affect interchange category assignments in ways that are easy to overlook.`,
        '',
        pain || `The specific breakdown of how those transactions are categorized is not always visible from a standard merchant statement.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'question', primaryAngle: 'industry_observation', structure: 'question_led', evidence: 'none' }
      break

    case 'statement_review_offer':
      // Leads directly with the offer
      bodyText = [
        sal,
        '',
        offer,
        '',
        audience || `${co(ctx)} processes payments, and there is a reasonable chance the current fee structure has not been reviewed recently.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'offer', primaryAngle: 'cost_clarity', structure: 'offer_led', evidence: 'none' }
      break

    case 'skepticism_aware_advisor':
      // Acknowledges typical skepticism, differentiates
      bodyText = [
        sal,
        '',
        trust || `Processor outreach is common enough that it is easy to tune out.`,
        '',
        `What makes a processing statement review different is that it is based on ${co(ctx)}'s actual statement — not a general pitch about switching processors.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'advisor_credibility', trustAngle: 'skepticism_aware', structure: 'acknowledgment_led', evidence: 'none' }
      break

    case 'ultra_direct':
    default:
      // Maximum brevity
      bodyText = [
        sal,
        '',
        audience || `${ind} processing structures are worth a periodic review.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'observation', primaryAngle: 'direct_efficiency', structure: 'observation_led', evidence: 'none', ctaFraming: 'direct_question' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-2: New Inquiry Response
// ============================================================

function buildNewInquiryBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal   = salutation(ctx)
  const cta   = ctaSentence(strategy)
  const offer = offerSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'warm_inquiry_response':
      bodyText = [
        sal,
        '',
        `Your processing review request came through — happy to take a look at ${co(ctx)}'s current setup.`,
        '',
        offer,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'responsive_service', structure: 'acknowledgment_led' }
      break

    case 'advance_next_step':
      bodyText = [
        sal,
        '',
        `Got your request.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'statement', primaryAngle: 'direct_next_step', structure: 'offer_led', ctaFraming: 'specific_offer' }
      break

    case 'advisor_education':
    default:
      bodyText = [
        sal,
        '',
        `Your inquiry came through — before we take a look at your statement, here is what the review process covers.`,
        '',
        offer,
        '',
        `The review is based on ${co(ctx)}'s actual processing statement, not a generic comparison.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'educational_advisor', structure: 'acknowledgment_led', evidence: 'none' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-3: Statement Submitted Confirmation
// ============================================================

function buildStatementConfirmationBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal = salutation(ctx)
  const cta = ctaSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'professional_confirmation':
      bodyText = [
        sal,
        '',
        `Statement received for ${co(ctx)} — thank you for sending that over.`,
        '',
        `I will have a review ready within two business days and will share what we find.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'statement', primaryAngle: 'professional_confirmation', structure: 'offer_led', ctaFraming: 'specific_offer' }
      break

    case 'warm_reassurance':
    default:
      bodyText = [
        sal,
        '',
        `Got your processing statement — that is the most useful thing for getting a clear picture of ${co(ctx)}'s current setup.`,
        '',
        `I will review it and come back with what I find, typically within two business days.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'relationship_confirmation', structure: 'acknowledgment_led', ctaFraming: 'soft_ask' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-4: Statement Review Follow-Up
// ============================================================

function buildStatementReviewBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal    = salutation(ctx)
  const cta    = ctaSentence(strategy)
  // Findings context: review_summary is not a column on message_strategies.
  // The Message Strategy Agent stores the key finding in proof_point when the review
  // is complete. pain_point_hypothesis serves as the secondary source.
  const findingsContext = strategy.proof_point ?? strategy.pain_point_hypothesis ?? ''
  const firstFinding    = findingsContext
    ? findingsContext.split(/[.!?]/)[0]?.trim() ?? findingsContext
    : 'There is something in your processing statement worth discussing'
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'findings_first':
      bodyText = [
        sal,
        '',
        `Completed the review of ${co(ctx)}'s statement.`,
        '',
        firstFinding + '.',
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'observation', primaryAngle: 'findings_forward', structure: 'observation_led', evidence: 'specific_finding' }
      break

    case 'advisor_explanation':
      bodyText = [
        sal,
        '',
        `The review of ${co(ctx)}'s processing statement is complete.`,
        '',
        `Here is what I found in plain terms: ${firstFinding.toLowerCase()}.`,
        '',
        `That is worth a conversation to understand what it means for your setup specifically.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'operational_explanation', structure: 'acknowledgment_led', evidence: 'specific_finding' }
      break

    case 'proposal_next_step':
    default:
      bodyText = [
        sal,
        '',
        `${firstFinding} — based on ${co(ctx)}'s statement.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'statement', primaryAngle: 'proposal_transition', structure: 'offer_led', evidence: 'specific_finding', ctaFraming: 'direct_question' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-5: Statement Not Submitted Follow-Up
// ============================================================

function buildStmtNotSubmittedBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal  = salutation(ctx)
  const cta  = ctaSentence(strategy)
  const pain = painPointSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'reduced_friction':
      bodyText = [
        sal,
        '',
        `The statement review is still available for ${co(ctx)} when the timing is right — the process is straightforward.`,
        '',
        `You can pull the statement directly from your processor portal, and most businesses have it in a few minutes.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'offer', primaryAngle: 'ease_of_submission', structure: 'offer_led' }
      break

    case 'clarify_value':
      bodyText = [
        sal,
        '',
        pain || `Understanding your processing structure is worth the time — it affects what your business pays on every transaction.`,
        '',
        `The review is based on your actual statement, not a general estimate.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'observation', primaryAngle: 'value_clarification', structure: 'observation_led' }
      break

    case 'simple_direct_question':
    case 'direct_sequence_question':
    case 'why_it_matters':
      bodyText = [
        sal,
        '',
        `Did ${co(ctx)} get a chance to pull the processing statement?`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'question', primaryAngle: 'direct_follow_through', structure: 'question_led', ctaFraming: 'binary_question' }
      break

    case 'graceful_sequence_exit':
      bodyText = [
        sal,
        '',
        `Happy to close this out if the timing is not right — no pressure either way.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'graceful_close', structure: 'acknowledgment_led', ctaFraming: 'exit_offer' }
      break

    case 'exit_cta':
      bodyText = [
        sal,
        '',
        `Wanted to make this easy — if you would like to close out the sequence, just say the word. If you want to continue, the option is still open.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'offer', primaryAngle: 'sequence_exit', structure: 'offer_led', ctaFraming: 'exit_offer' }
      break

    default:
      bodyText = [
        sal, '',
        `Still happy to take a look when the timing works.`, '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'offer', primaryAngle: 'ease_of_submission', structure: 'offer_led' }
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-6: Proposal Follow-Up
// ============================================================

function buildProposalFollowUpBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal = salutation(ctx)
  const cta = ctaSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'decision_status':
      bodyText = [
        sal,
        '',
        `Wanted to see where the proposal stands for ${co(ctx)} — where are you in the process?`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'question', primaryAngle: 'decision_status', structure: 'question_led', ctaFraming: 'soft_ask' }
      break

    case 'clarify_objection':
    default:
      bodyText = [
        sal,
        '',
        `Happy to answer any questions on the proposal for ${co(ctx)} — or walk through any of the numbers if that would help.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'offer', primaryAngle: 'objection_clearing', structure: 'offer_led', ctaFraming: 'soft_ask' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-7: No-Response Follow-Up
// ============================================================

function buildNoResponseBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal     = salutation(ctx)
  const cta     = ctaSentence(strategy)
  const audience = audienceContextSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'changed_angle':
    case 'reframe_offer':
    case 'exit_aware':
      bodyText = [
        sal,
        '',
        audience || `Processing fee structures for ${industryPhrase(ctx, strategy)} are worth a periodic look.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'observation', primaryAngle: 'reframe_offer', structure: 'observation_led' }
      break

    case 'minimal_question':
      bodyText = [
        sal,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'question', primaryAngle: 'minimal_ask', structure: 'question_led', ctaFraming: 'binary_question' }
      break

    case 'brief_reframe':
      bodyText = [
        sal,
        '',
        `Different angle on the statement review for ${co(ctx)}: it is less about switching processors and more about understanding what ${co(ctx)} is currently paying and why.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'statement', primaryAngle: 'reframed_offer', structure: 'observation_led', trustAngle: 'transparency' }
      break

    case 'graceful_sequence_exit':
    case 'sequence_exit':
      bodyText = [
        sal,
        '',
        `Happy to close this out if the timing is not right for ${co(ctx)}.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'exit_aware', structure: 'acknowledgment_led', ctaFraming: 'exit_offer' }
      break

    default:
      bodyText = [sal, '', audience || `Still relevant?`, '', cta].join('\n')
      diffHints = { openingPremise: 'question', primaryAngle: 'minimal_ask', structure: 'question_led' }
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-8: Re-Engagement
// ============================================================

function buildReEngagementBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal    = salutation(ctx)
  const cta    = ctaSentence(strategy)
  const audience = audienceContextSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'time_gap_acknowledgment':
      bodyText = [
        sal,
        '',
        `It has been a while since we last connected — wanted to check if a statement review is still relevant for ${co(ctx)}.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'time_aware_reconnect', structure: 'acknowledgment_led' }
      break

    case 'fresh_reconnect_reason':
    default:
      bodyText = [
        sal,
        '',
        audience || `Processing fee structures tend to change over time — worth a fresh look at how ${co(ctx)}'s statement reads now.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'observation', primaryAngle: 'fresh_context', structure: 'observation_led' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-9: Partner / Member Campaign
// ============================================================

function buildPartnerCampaignBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal       = salutation(ctx)
  const cta       = ctaSentence(strategy)
  const partnerNm = (strategy.partner_membership as unknown as Record<string, string> | null)?.partner_name ?? 'your group'
  const audience  = audienceContextSentence(strategy)
  const offer     = offerSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'partner_shared_context':
      bodyText = [
        sal,
        '',
        `A lot of ${partnerNm} members have found the statement review useful — happy to do the same for ${co(ctx)}.`,
        '',
        offer,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'partner_connection', structure: 'acknowledgment_led' }
      break

    case 'home_services_operational':
      bodyText = [
        sal,
        '',
        audience || `Home services contractors often process a mix of card types across technicians — the interchange implications are worth reviewing.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'observation', primaryAngle: 'operational_context', structure: 'observation_led', trustAngle: 'industry_familiarity' }
      break

    case 'statement_clarity_partner':
    default:
      bodyText = [
        sal,
        '',
        `Offering ${co(ctx)} a free review of your processing statement — as a ${partnerNm} member, the review is straightforward and based on your actual statement data.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'offer', primaryAngle: 'cost_clarity', structure: 'offer_led', ctaFraming: 'specific_offer' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-10: Event / Expo Follow-Up
// ============================================================

function buildEventFollowUpBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal       = salutation(ctx)
  const cta       = ctaSentence(strategy)
  // eventName and conversationNotes are typed fields on CopywritingLeadContext,
  // populated from strategy context by loadLeadContext.
  const eventName = ctx.eventName ?? 'the event'
  const notes     = ctx.conversationNotes ?? ''
  const firstNote = notes ? notes.split(/[.!?]/)[0]?.trim() ?? notes : ''
  const offer     = offerSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'event_conversation_reference':
      bodyText = [
        sal,
        '',
        `Good meeting you at ${eventName}.`,
        '',
        firstNote ? `Wanted to follow up on what you mentioned — ${firstNote.toLowerCase()}.` : offer,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'conversation_followup', structure: 'acknowledgment_led', evidence: firstNote ? 'specific_finding' : 'none' }
      break

    case 'event_topic_followup':
      bodyText = [
        sal,
        '',
        `Good to connect at ${eventName} — ${firstNote ? `the point you raised about ${firstNote.toLowerCase()} is exactly what the review looks at.` : offer}`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'observation', primaryAngle: 'topic_continuation', structure: 'observation_led', evidence: firstNote ? 'specific_finding' : 'none' }
      break

    case 'event_reference_only':
      bodyText = [
        sal,
        '',
        `Good to meet you at ${eventName}.`,
        '',
        offer,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'event_meeting', structure: 'acknowledgment_led', ctaFraming: 'soft_ask' }
      break

    case 'event_direct_ask':
    default:
      bodyText = [
        sal,
        '',
        `Following up from ${eventName} — worth a review of your processing statement?`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'question', primaryAngle: 'direct_offer', structure: 'question_led', ctaFraming: 'direct_question' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-11: Referral Request
// ============================================================

function buildReferralBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal = salutation(ctx)
  const cta = ctaSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'gratitude_first':
      bodyText = [
        sal,
        '',
        `Enjoyed working through ${co(ctx)}'s statement review — glad we could find something useful there.`,
        '',
        `Wanted to ask: if you know other business owners who might benefit from the same kind of review, I would genuinely appreciate an introduction.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'acknowledgment', primaryAngle: 'delivered_value', structure: 'acknowledgment_led', ctaFraming: 'soft_ask' }
      break

    case 'specific_referral_ask':
    default:
      bodyText = [
        sal,
        '',
        `The businesses that tend to get the most out of a statement review are owner-operated, typically processing $300K+ annually, and have not had their fee structure reviewed in a while.`,
        '',
        `If anyone at ${co(ctx)}'s network fits that description, I would be grateful for an introduction.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'offer', primaryAngle: 'referral_targeting', structure: 'offer_led', ctaFraming: 'specific_offer' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// MT-12: Customer Nurture
// ============================================================

function buildCustomerNurtureBody(angle: VersionAngle, strategy: MessageStrategy, ctx: CopywritingLeadContext): BodyGenerationResult {
  const sal = salutation(ctx)
  const cta = ctaSentence(strategy)
  const personalization = trackPersonalization(ctx, strategy)

  let bodyText: string
  let diffHints: Partial<DifferentiationProfile>

  switch (angle.strategyAngle) {
    case 'account_review_offer':
      bodyText = [
        sal,
        '',
        `Wanted to check in on ${co(ctx)}'s account — worth doing a periodic review to make sure the processing setup still matches how the business is operating.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'offer', primaryAngle: 'account_review', structure: 'offer_led', ctaFraming: 'soft_ask' }
      break

    case 'relationship_maintenance':
      bodyText = [
        sal,
        '',
        `Wanted to ask about ${co(ctx)}'s processing volume — any changes in the business structure worth reviewing?`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'question', primaryAngle: 'relationship_check', structure: 'question_led', ctaFraming: 'soft_ask' }
      break

    case 'seasonal_operational':
    default:
      bodyText = [
        sal,
        '',
        `As the season changes, it is worth checking whether ${co(ctx)}'s processing structure still makes sense for your current volume patterns.`,
        '',
        cta,
      ].join('\n')
      diffHints = { openingPremise: 'observation', primaryAngle: 'seasonal_relevance', structure: 'observation_led', ctaFraming: 'specific_offer' }
      break
  }

  return { bodyText, personalizationUsed: personalization.used, personalizationGaps: personalization.gaps, differentiationHints: diffHints }
}

// ============================================================
// Main body generator
// ============================================================

export function generateBodyText(
  angle:           VersionAngle,
  strategy:        MessageStrategy,
  ctx:             CopywritingLeadContext,
): BodyGenerationResult {
  switch (strategy.message_type) {
    case 'cold_outreach':
      return buildColdOutreachBody(angle, strategy, ctx)
    case 'new_inquiry_response':
      return buildNewInquiryBody(angle, strategy, ctx)
    case 'statement_submitted_confirmation':
      return buildStatementConfirmationBody(angle, strategy, ctx)
    case 'statement_review_follow_up':
      return buildStatementReviewBody(angle, strategy, ctx)
    case 'statement_not_submitted_follow_up':
      return buildStmtNotSubmittedBody(angle, strategy, ctx)
    case 'proposal_follow_up':
      return buildProposalFollowUpBody(angle, strategy, ctx)
    case 'no_response_follow_up':
      return buildNoResponseBody(angle, strategy, ctx)
    case 're_engagement':
      return buildReEngagementBody(angle, strategy, ctx)
    case 'partner_member_specific_campaign':
      return buildPartnerCampaignBody(angle, strategy, ctx)
    case 'event_expo_follow_up':
      return buildEventFollowUpBody(angle, strategy, ctx)
    case 'referral_request':
      return buildReferralBody(angle, strategy, ctx)
    case 'customer_nurture':
      return buildCustomerNurtureBody(angle, strategy, ctx)
    default:
      return buildColdOutreachBody(angle, strategy, ctx)
  }
}

export { industryPhrase }
