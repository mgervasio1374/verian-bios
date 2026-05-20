// ---- Types ----

export type RelationshipContext =
  | 'cold_outreach'       // manual/cold — no prior interaction
  | 'inbound_inquiry'     // prospect reached out via web/form
  | 'statement_submitted' // prospect sent or discussed a processing statement
  | 'reengagement'        // prior contact, no conversion yet
  | 'unknown'             // cannot determine safely

export type MessageTrigger =
  | 'manual_lead_created'
  | 'web_inquiry'
  | 'statement_received'
  | 'manual_campaign_assignment'
  | 'unknown'

export type PrimaryAngle =
  | 'processing_cost_review'
  | 'statement_review'
  | 'high_trust_advisory'
  | 'direct_intro'
  | 'reengagement'
  | 'home_services_payment_review'

export interface MessageStrategyClassification {
  relationshipContext: RelationshipContext
  trigger:             MessageTrigger
  primaryAngle:        PrimaryAngle
  // Strategy keys that are ALLOWED for this context (passed to candidate pool selector)
  allowedStrategyKeys: string[]
  // Regex patterns that must NOT appear in generated copy for this context
  forbiddenPatterns:   RegExp[]
  strategyLabel:       string
  strategyReason:      string
}

export interface MessageStrategyInput {
  lead?: {
    source?: string | null
    stage?:  string | null
  }
  company?: {
    industry?: string | null
  }
  emailDraft?: {
    bodyText?: string | null
    aiGenerationMetadata?: Record<string, unknown>
  }
  // Direct artifact/statement evidence — highest authority for statement classification
  evidence?: {
    hasStatementArtifact?: boolean
  }
}

// ---- Forbidden pattern sets per context ----

const COLD_FORBIDDEN: RegExp[] = [
  /thanks for reaching out/i,
  /thanks for connecting/i,
  /thanks for sending/i,
  /thanks for submitting/i,
  /thank you for reaching/i,
  /thank you for sending/i,
  /i reviewed your statement/i,
  /processing statement for/i,
  /merchant statement/i,
]

const INBOUND_FORBIDDEN: RegExp[] = [
  /i came across/i,
  /i stumbled upon/i,
  /i noticed your/i,
  /wanted to reach out/i,
  /i reviewed your statement/i,
  /processing statement for/i,  // only allowed if actually statement_submitted
]

const STATEMENT_FORBIDDEN: RegExp[] = [
  /i came across/i,
  /i stumbled upon/i,
  /i noticed your/i,
  /wanted to reach out/i,
  // Allow statement language — no additional restrictions
]

const REENGAGEMENT_FORBIDDEN: RegExp[] = [
  /i came across/i,
  /i stumbled upon/i,
  /thanks for reaching out/i,  // they didn't reach out — this is a follow-up
  /thanks for submitting/i,
  /i reviewed your statement/i,
]

const UNKNOWN_FORBIDDEN: RegExp[] = [
  /i came across/i,
  /i stumbled upon/i,
  /thanks for submitting/i,
  /i reviewed your statement/i,
  /processing statement for/i,
]

// ---- Classification function ----

export function classifyEmailMessageStrategy(
  input: MessageStrategyInput
): MessageStrategyClassification {
  const source       = (input.lead?.source  ?? '').toLowerCase()
  const stage        = (input.lead?.stage   ?? '').toLowerCase()
  const industry     = (input.company?.industry ?? '').toLowerCase()
  const campaignType = String(input.emailDraft?.aiGenerationMetadata?.campaign_type ?? '').toLowerCase()
  const templateSlug = String(input.emailDraft?.aiGenerationMetadata?.template_slug ?? '').toLowerCase()
  // NOTE: recRule is NOT used for statement classification (intake_initial_contact fires for new_inquiry too)
  // It is used only as a weak inbound signal, blocked when cold signals exist.
  const recRule   = String(input.emailDraft?.aiGenerationMetadata?.recommendation_rule ?? '').toLowerCase()
  const lowerBody = (input.emailDraft?.bodyText ?? '').toLowerCase()

  // ---- Authority hierarchy ----

  // Hard statement signals — authoritative; cannot be overridden by cold signals
  const hardStatementSignal =
    stage === 'statement_received' ||
    stage === 'statement_review' ||
    stage === 'proposal_sent' ||
    campaignType === 'statement_review_followup' ||
    templateSlug === 'email_statement_proposal' ||
    input.evidence?.hasStatementArtifact === true

  // Hard cold signals — prevent statement classification even if body text suggests it
  const hardColdSignal =
    source === 'manual' ||
    source === 'import' ||
    source === 'cold_outreach' ||
    source === 'referral' ||
    source === 'partner' ||
    source === 'event' ||
    stage === 'new' ||
    campaignType === 'new_lead_outreach' ||
    campaignType === 'home_services_outreach'

  // Weak body text signal — only considered when no hard cold signal exists and no hard
  // statement signal (prevents re-classification after a bad rewrite was applied)
  const weakStatementBodySignal =
    lowerBody.includes('thanks for sending over the processing statement') ||
    lowerBody.includes('thanks for submitting your processing statement')

  // Final statement determination: hard signal OR (weak body AND no hard cold override)
  const isStatementContext =
    hardStatementSignal ||
    (weakStatementBodySignal && !hardColdSignal)

  // 1. Statement submitted context
  if (isStatementContext) {
    return {
      relationshipContext: 'statement_submitted',
      trigger:             'statement_received',
      primaryAngle:        'statement_review',
      allowedStrategyKeys: ['quality_suggestion', 'statement_review', 'statement_high_trust', 'statement_concise'],
      forbiddenPatterns:   STATEMENT_FORBIDDEN,
      strategyLabel:       'Statement Submitted',
      strategyReason:      'Lead has submitted or discussed a processing statement — statement review context applies',
    }
  }

  // 2. Inbound inquiry context — prospect reached out; NOT triggered by cold source signals
  const INBOUND_SOURCES = new Set(['website', 'tawk.to', 'calendly', 'app.321swipe.com', 'upload.321swipe.com'])
  const isInboundContext =
    INBOUND_SOURCES.has(source) ||
    stage === 'new_inquiry' ||
    stage === 'analysis_requested' ||
    // recRule signals only valid for inbound when NOT a cold source
    (!hardColdSignal && (recRule === 'urgent_early_outreach' || recRule === 'initial_contact')) ||
    campaignType === 'processing_cost_review'

  if (isInboundContext) {
    return {
      relationshipContext: 'inbound_inquiry',
      trigger:             'web_inquiry',
      primaryAngle:        'processing_cost_review',
      allowedStrategyKeys: ['quality_suggestion', 'inbound_processing', 'inbound_high_trust', 'inbound_direct'],
      forbiddenPatterns:   INBOUND_FORBIDDEN,
      strategyLabel:       'Inbound Inquiry',
      strategyReason:      'Lead arrived via web/form submission — inbound follow-up context applies',
    }
  }

  // 3. Reengagement context
  const isReengagement =
    campaignType === 'reengagement' ||
    stage === 'contacted' ||
    stage === 'proposal' ||
    stage === 'proposal_sent'

  if (isReengagement) {
    return {
      relationshipContext: 'reengagement',
      trigger:             'manual_campaign_assignment',
      primaryAngle:        'reengagement',
      allowedStrategyKeys: ['quality_suggestion', 'reengagement_soft', 'reengagement_direct', 'reengagement_high_trust'],
      forbiddenPatterns:   REENGAGEMENT_FORBIDDEN,
      strategyLabel:       'Re-Engagement',
      strategyReason:      'Lead was previously contacted — re-engagement context applies',
    }
  }

  // 4. Cold outreach — manual/new/unknown source
  const isColdContext =
    source === 'manual' ||
    source === 'import' ||
    source === 'referral' ||
    source === 'cold_outreach' ||
    source === 'partner' ||
    stage === 'new' ||
    stage === '' ||
    campaignType === 'new_lead_outreach' ||
    campaignType === 'home_services_outreach'

  if (isColdContext) {
    const isHomeServices = industry.includes('home') || campaignType === 'home_services_outreach'

    if (isHomeServices) {
      return {
        relationshipContext: 'cold_outreach',
        trigger:             'manual_lead_created',
        primaryAngle:        'home_services_payment_review',
        allowedStrategyKeys: ['quality_suggestion', 'cold_home_services', 'cold_processing', 'cold_high_trust'],
        forbiddenPatterns:   COLD_FORBIDDEN,
        strategyLabel:       'Cold Outreach — Home Services',
        strategyReason:      'Manually created lead in home services industry — cold outreach with home services angle',
      }
    }

    return {
      relationshipContext: 'cold_outreach',
      trigger:             'manual_lead_created',
      primaryAngle:        'direct_intro',
      allowedStrategyKeys: ['quality_suggestion', 'cold_processing', 'cold_high_trust', 'cold_direct'],
      forbiddenPatterns:   COLD_FORBIDDEN,
      strategyLabel:       'Cold Outreach',
      strategyReason:      'Manually created or cold lead — cold outreach context; no inbound or statement language permitted',
    }
  }

  // 5. Unknown — safe fallback
  return {
    relationshipContext: 'unknown',
    trigger:             'unknown',
    primaryAngle:        'high_trust_advisory',
    allowedStrategyKeys: ['quality_suggestion', 'cold_processing', 'cold_high_trust'],
    forbiddenPatterns:   UNKNOWN_FORBIDDEN,
    strategyLabel:       'Unknown Context',
    strategyReason:      'Context could not be determined — using safest high-trust advisory approach',
  }
}

// ---- Truth guardrail ----

export function violatesMessageTruth(
  context: RelationshipContext,
  subject: string,
  bodyText: string
): boolean {
  const MAP: Record<RelationshipContext, RegExp[]> = {
    cold_outreach:       COLD_FORBIDDEN,
    inbound_inquiry:     INBOUND_FORBIDDEN,
    statement_submitted: STATEMENT_FORBIDDEN,
    reengagement:        REENGAGEMENT_FORBIDDEN,
    unknown:             UNKNOWN_FORBIDDEN,
  }
  const patterns = MAP[context] ?? UNKNOWN_FORBIDDEN
  const combined = `${subject} ${bodyText}`
  return patterns.some(re => re.test(combined))
}
