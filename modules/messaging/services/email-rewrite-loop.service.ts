import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { reviewEmailDraftQuality } from '@/modules/messaging/services/email-quality.service'
import * as emailDraftVersionRepo from '@/modules/messaging/repositories/email-draft-version.repo'
import * as emailQualityRepo from '@/modules/messaging/repositories/email-quality.repo'
import * as activityEventService from '@/modules/intelligence/services/activity-event.service'
import * as agentDecisionRepo from '@/modules/intelligence/repositories/agent-decision.repo'
import * as aiUsageRepo from '@/modules/intelligence/repositories/ai-usage-event.repo'
import { preflightCheck } from '@/modules/intelligence/services/ai-budget-enforcer.service'
import { ActivityEventType } from '@/modules/intelligence/types.agent'
import {
  classifyEmailMessageStrategy,
  violatesMessageTruth,
} from '@/modules/messaging/services/email-message-strategy.service'
import type { MessageStrategyClassification } from '@/modules/messaging/services/email-message-strategy.service'
import type { EmailQualityInput } from '@/modules/messaging/services/email-quality.service'

// ---- Constants ----

const DEFAULT_TARGET_SCORE  = 85
const HIGH_RISK_THRESHOLD   = 2
const NEAR_DUPLICATE_RATIO  = 0.90
const MAX_CANDIDATES        = 5

// ---- Result types ----

export type RewriteLoopStatus =
  | 'passed_threshold'
  | 'improved_but_below_threshold'
  | 'no_improvement'
  | 'blocked_risk'
  | 'needs_human_review'

export interface RewriteLoopResult {
  success:             true
  emailDraftId:        string
  originalScore:       number
  bestScore:           number
  bestVersionId:       string
  bestVersionNumber:   number
  bestVersionSubject:  string | null
  bestVersionBody:     string | null
  iterations:          number
  duplicatesSkipped:   number
  status:              RewriteLoopStatus
  reachedThreshold:    boolean
}

export type RewriteLoopOutput = RewriteLoopResult | { success: false; error: string }

// ---- Candidate type ----

interface RewriteCandidate {
  subject:         string
  bodyText:        string
  strategyKey:     string
  strategyLabel:   string
  strategyPurpose: string
}

// ---- Text normalization + near-duplicate detection ----

function normalizeEmailText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function wordSet(text: string): Set<string> {
  return new Set(
    normalizeEmailText(text).replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean)
  )
}

function areEmailsNearDuplicate(a: string, b: string): boolean {
  const setA = wordSet(a)
  const setB = wordSet(b)
  const smaller = Math.min(setA.size, setB.size)
  if (smaller === 0) return false
  let overlap = 0
  for (const w of setA) { if (setB.has(w)) overlap++ }
  return (overlap / smaller) >= NEAR_DUPLICATE_RATIO
}

// ---- Context-specific template generators ----
// Each function returns an opening-correct body for its declared context.

// Cold outreach — no inbound or statement language
function coldProcessingCostReview(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: 'Reviewing your current processing setup',
    bodyText:
      `Hi ${first},\n\n` +
      `I'm reaching out from 321 Swipe.\n\n` +
      `A simple first step is to review how your current card processing is set up and see whether ` +
      `the costs, fees, or setup deserve a closer look.\n\n` +
      `No pressure and no generic savings claim — just a practical review of what is currently in place.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

function coldHighTrustAdvisory(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: 'A simple way to review your processing setup',
    bodyText:
      `Hi ${first},\n\n` +
      `I'm reaching out from 321 Swipe.\n\n` +
      `Rather than make a broad claim by email, I'd suggest a simple first step: review how ` +
      `${company}'s current processing is set up and identify whether anything is worth a closer look.\n\n` +
      `If there is nothing meaningful there, I will tell you that. If there is, we can walk through it together.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

function coldDirectIntro(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: `Payment review for ${company}`.slice(0, 70),
    bodyText:
      `Hi ${first},\n\n` +
      `I'm reaching out from 321 Swipe.\n\n` +
      `I'd be happy to take a closer look at ${company}'s processing costs and let you know ` +
      `whether anything is worth reviewing.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

function coldHomeServices(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: `Payment review for ${company}`.slice(0, 70),
    bodyText:
      `Hi ${first},\n\n` +
      `I'm reaching out from 321 Swipe.\n\n` +
      `We work with home service businesses that want a clearer view of their card processing costs ` +
      `and payment setup.\n\n` +
      `If it would be helpful, I can take a quick look at ${company}'s current setup and let you know ` +
      `whether anything deserves a closer review.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

// Inbound inquiry — "Thanks for reaching out" is correct
function inboundProcessingCost(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: `Payment review for ${company}`.slice(0, 70),
    bodyText:
      `Hi ${first},\n\n` +
      `Thanks for reaching out to 321 Swipe.\n\n` +
      `I'd be happy to take a closer look at ${company}'s processing costs and let you know ` +
      `whether anything is worth reviewing.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

function inboundHighTrust(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: 'A simple way to review your processing setup',
    bodyText:
      `Hi ${first},\n\n` +
      `Thanks for reaching out to 321 Swipe.\n\n` +
      `Rather than make a broad claim by email, I'd suggest a simple first step: take a closer look ` +
      `at ${company}'s processing costs and see whether anything stands out.\n\n` +
      `If there is nothing meaningful, I will tell you that. If there is, we can walk through it together.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

function inboundDirect(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: `Payment review for ${company}`.slice(0, 70),
    bodyText:
      `Hi ${first},\n\n` +
      `Thanks for reaching out to 321 Swipe.\n\n` +
      `We can take a quick look at your current processing setup and see whether anything ` +
      `deserves a closer review.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

// Statement submitted — "Thanks for sending the statement" is correct
function statementReviewFollowup(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: 'Quick follow-up on your processing statement',
    bodyText:
      `Hi ${first},\n\n` +
      `Thanks for sending over the processing statement for ${company}.\n\n` +
      `I reviewed enough to see it is worth a closer look, but I would rather walk through the details ` +
      `with you than throw out a generic estimate by email.\n\n` +
      `Would you be open to a quick statement review this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

function statementHighTrust(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: 'A simple way to review your processing setup',
    bodyText:
      `Hi ${first},\n\n` +
      `Thanks for sending over the processing statement for ${company}.\n\n` +
      `Rather than make a broad claim, I'd rather walk through the details with you and see whether ` +
      `anything in the current setup is worth a closer review.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

function statementConcise(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: 'Quick follow-up on your processing statement',
    bodyText:
      `Hi ${first},\n\n` +
      `Thanks for sending the statement for ${company}.\n\n` +
      `We can walk through it together and see what stands out.\n\n` +
      `Would you be open to a quick call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

// Reengagement — prior contact, follow-up tone
function reengagementSoft(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: 'Quick follow-up from 321 Swipe',
    bodyText:
      `Hi ${first},\n\n` +
      `I wanted to circle back in case reviewing ${company}'s payment setup is still on your radar.\n\n` +
      `If it would be useful, I can take a quick look at your current processing setup and let you ` +
      `know whether anything stands out.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

function reengagementDirect(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: `Payment review for ${company}`.slice(0, 70),
    bodyText:
      `Hi ${first},\n\n` +
      `I wanted to follow up to see if reviewing ${company}'s processing setup is something you're ` +
      `still considering.\n\n` +
      `I'd be happy to take a closer look and let you know whether anything is worth discussing.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

function reengagementHighTrust(first: string, company: string, sender: string): { subject: string; bodyText: string } {
  return {
    subject: 'A simple way to review your processing setup',
    bodyText:
      `Hi ${first},\n\n` +
      `I wanted to check back in from 321 Swipe.\n\n` +
      `If there has been any change on your end, I'm happy to take a quick look at ${company}'s ` +
      `processing costs and see whether anything deserves a closer review.\n\n` +
      `Would you be open to a short call this week?\n\n` +
      `Best,\n${sender}\n321 Swipe`,
  }
}

// ---- Context-based candidate pool ----

const GENERATORS: Record<string, (first: string, company: string, sender: string) => { subject: string; bodyText: string }> = {
  // Cold
  cold_processing:  coldProcessingCostReview,
  cold_high_trust:  coldHighTrustAdvisory,
  cold_direct:      coldDirectIntro,
  cold_home_services: coldHomeServices,
  // Inbound
  inbound_processing: inboundProcessingCost,
  inbound_high_trust: inboundHighTrust,
  inbound_direct:     inboundDirect,
  // Statement
  statement_review:       statementReviewFollowup,
  statement_high_trust:   statementHighTrust,
  statement_concise:      statementConcise,
  // Reengagement
  reengagement_soft:       reengagementSoft,
  reengagement_direct:     reengagementDirect,
  reengagement_high_trust: reengagementHighTrust,
}

const STRATEGY_LABELS: Record<string, { label: string; purpose: string }> = {
  cold_processing:    { label: 'Processing Cost Review',   purpose: 'Cold intro — soft review offer, no inbound language' },
  cold_high_trust:    { label: 'High-Trust Advisory',      purpose: 'Cold intro — advisory framing, avoids all claims' },
  cold_direct:        { label: 'Direct Intro',             purpose: 'Cold intro — short, direct, no claims' },
  cold_home_services: { label: 'Home Services Outreach',   purpose: 'Cold intro — industry-specific for home service businesses' },
  inbound_processing: { label: 'Inbound — Processing Review', purpose: 'Inbound follow-up — acknowledges their outreach' },
  inbound_high_trust: { label: 'Inbound — High-Trust Advisory', purpose: 'Inbound follow-up — advisory framing' },
  inbound_direct:     { label: 'Inbound — Direct',          purpose: 'Inbound follow-up — short, direct' },
  statement_review:       { label: 'Statement Review',           purpose: 'Statement follow-up — walks through what was reviewed' },
  statement_high_trust:   { label: 'Statement — Advisory',       purpose: 'Statement follow-up — advisory, walks through together' },
  statement_concise:      { label: 'Statement — Concise',        purpose: 'Statement follow-up — very brief, direct' },
  reengagement_soft:       { label: 'Re-Engagement — Soft',       purpose: 'Follow-up — circles back without pressure' },
  reengagement_direct:     { label: 'Re-Engagement — Direct',     purpose: 'Follow-up — direct check-in' },
  reengagement_high_trust: { label: 'Re-Engagement — Advisory',   purpose: 'Follow-up — advisory framing' },
  quality_suggestion:      { label: 'Quality Review Suggestion',  purpose: 'Auto-generated by the quality rubric as a starting-point improvement' },
}

function buildContextualCandidates(opts: {
  classification:    MessageStrategyClassification
  suggestedSubject?: string
  suggestedBody?:    string
  first:             string
  company:           string
  senderName:        string
}): RewriteCandidate[] {
  const { classification, first, company, senderName } = opts
  const candidates: RewriteCandidate[] = []

  // 1. Quality suggestion first — but only if it passes the truth guardrail
  if (opts.suggestedSubject && opts.suggestedBody) {
    const passes = !violatesMessageTruth(
      classification.relationshipContext,
      opts.suggestedSubject,
      opts.suggestedBody
    )
    if (passes) {
      candidates.push({
        subject:         opts.suggestedSubject,
        bodyText:        opts.suggestedBody,
        strategyKey:     'quality_suggestion',
        strategyLabel:   STRATEGY_LABELS.quality_suggestion.label,
        strategyPurpose: STRATEGY_LABELS.quality_suggestion.purpose,
      })
    }
  }

  // 2. Context-selected strategies from allowedStrategyKeys (skip quality_suggestion — handled above)
  let added = 0
  for (const key of classification.allowedStrategyKeys) {
    if (key === 'quality_suggestion') continue
    if (added >= MAX_CANDIDATES - 1) break  // reserve slot for quality suggestion
    const gen = GENERATORS[key]
    if (!gen) continue

    const { subject, bodyText } = gen(first, company, senderName)
    const meta = STRATEGY_LABELS[key] ?? { label: key, purpose: '' }

    // Truth guardrail — skip if violates context rules
    if (violatesMessageTruth(classification.relationshipContext, subject, bodyText)) continue

    candidates.push({
      subject,
      bodyText,
      strategyKey:     key,
      strategyLabel:   meta.label,
      strategyPurpose: meta.purpose,
    })
    added++
  }

  return candidates
}

// ---- Main loop ----

export async function runEmailRewriteLoop(input: {
  tenantId:      string
  workspaceId?:  string | null
  emailDraftId:  string
  targetScore?:  number
}): Promise<RewriteLoopOutput> {
  const target = input.targetScore ?? DEFAULT_TARGET_SCORE

  try {
    const supabase = createSupabaseServiceClient()

    // Load draft
    const { data: draft, error: draftErr } = await supabase
      .from('email_drafts')
      .select('id, subject, body_text, body_html, lead_id, company_id, workspace_id, ai_generation_metadata')
      .eq('id', input.emailDraftId)
      .eq('tenant_id', input.tenantId)
      .is('deleted_at', null)
      .single()

    if (draftErr || !draft) return { success: false, error: 'Email draft not found.' }
    if (!draft.body_text)   return { success: false, error: 'Draft has no body text.' }

    // Load lead/company context
    let context: EmailQualityInput['context'] = {}
    let leadSource: string | null = null
    let leadStage:  string | null = null

    if (draft.lead_id) {
      const { data: lead } = await supabase
        .from('leads').select('name, stage, source, company_id')
        .eq('id', draft.lead_id).single()
      if (lead) {
        leadSource = lead.source ?? null
        leadStage  = lead.stage  ?? null
        context = { leadName: lead.name, stage: lead.stage, source: lead.source ?? undefined }
        if (lead.company_id) {
          const { data: co } = await supabase
            .from('companies').select('name, industry')
            .eq('id', lead.company_id).single()
          if (co) { context.companyName = co.name; context.industry = co.industry ?? undefined }
        }
      }
    }

    // Load contact first name and sender name
    let contactFirstName: string | undefined
    let senderName = '321 Swipe'
    if (draft.lead_id) {
      const { data: leadContact } = await supabase
        .from('leads').select('contact_id').eq('id', draft.lead_id).single()
      if (leadContact?.contact_id) {
        const { data: contact } = await supabase
          .from('contacts').select('first_name').eq('id', leadContact.contact_id).single()
        if (contact?.first_name) contactFirstName = contact.first_name
      }
    }
    const { data: senderIdentity } = await supabase
      .from('sender_identities').select('name')
      .eq('tenant_id', input.tenantId).eq('is_default', true)
      .is('deleted_at', null).limit(1).single()
    if (senderIdentity?.name) senderName = senderIdentity.name

    const aiMeta             = (draft.ai_generation_metadata ?? {}) as Record<string, unknown>
    const templateSlug       = typeof aiMeta.template_slug       === 'string' ? aiMeta.template_slug       : undefined
    const recommendationRule = typeof aiMeta.recommendation_rule === 'string' ? aiMeta.recommendation_rule : undefined

    // Check for actual statement artifacts — authoritative evidence for statement classification
    let hasStatementArtifact = false
    const statementArtifactTypes = ['statement', 'merchant_statement', 'statement_analysis']
    if (draft.lead_id || draft.company_id) {
      const artifactQuery = supabase
        .from('artifacts')
        .select('id', { head: true, count: 'exact' })
        .eq('tenant_id', input.tenantId)
        .in('artifact_type', statementArtifactTypes)
        .is('deleted_at', null)

      const q = draft.lead_id
        ? artifactQuery.eq('lead_id', draft.lead_id)
        : artifactQuery.eq('company_id', draft.company_id!)

      const { count } = await q
      hasStatementArtifact = (count ?? 0) > 0
    }

    // ---- Classify the message strategy ----
    const classification = classifyEmailMessageStrategy({
      lead:    { source: leadSource, stage: leadStage },
      company: { industry: context.industry },
      emailDraft: {
        bodyText:             draft.body_text,
        aiGenerationMetadata: aiMeta,
      },
      evidence: { hasStatementArtifact },
    })

    // Load quality review + all existing versions
    const [existingReview, existingVersions] = await Promise.all([
      emailQualityRepo.getEmailQualityReview(input.emailDraftId, input.tenantId),
      emailDraftVersionRepo.listEmailDraftVersions(input.emailDraftId, input.tenantId),
    ])

    const buildInput = (sub: string, body: string): EmailQualityInput => ({
      tenantId:          input.tenantId,
      workspaceId:       input.workspaceId ?? undefined,
      leadId:            draft.lead_id    ?? undefined,
      companyId:         draft.company_id ?? undefined,
      emailDraftId:      input.emailDraftId,
      subject:           sub,
      bodyText:          body,
      templateSlug,
      recommendationRule,
      context,
    })

    // Score original
    const originalReview = existingReview
      ? {
          overallScore:     Number(existingReview.overall_score),
          status:           existingReview.status as 'pass' | 'needs_revision' | 'blocked',
          strengths:        (existingReview.strengths  ?? []) as string[],
          weaknesses:       (existingReview.weaknesses ?? []) as string[],
          riskFlags:        (existingReview.risk_flags ?? []) as string[],
          suggestedSubject: existingReview.suggested_subject ?? undefined,
          suggestedBody:    existingReview.suggested_body    ?? undefined,
        }
      : reviewEmailDraftQuality(buildInput(draft.subject, draft.body_text))

    const v1Score               = Math.round(originalReview.overallScore)
    const originalRiskFlagCount = originalReview.riskFlags.length

    // Get next version number
    const startVersionNumber = existingVersions.length > 0
      ? Math.max(...existingVersions.map(v => v.version_number)) + 1
      : 1

    // Store original snapshot only if draft has changed
    const lastOriginal = existingVersions
      .filter(v => v.version_type === 'original')
      .sort((a, b) => b.version_number - a.version_number)[0]

    const originalChanged = !lastOriginal ||
      !areEmailsNearDuplicate(draft.body_text, lastOriginal.body_text)

    let v1Row
    if (originalChanged) {
      v1Row = await emailDraftVersionRepo.createEmailDraftVersion({
        tenantId:        input.tenantId,
        workspaceId:     input.workspaceId ?? draft.workspace_id,
        emailDraftId:    input.emailDraftId,
        leadId:          draft.lead_id,
        companyId:       draft.company_id,
        versionNumber:   startVersionNumber,
        versionType:     'original',
        subject:         draft.subject,
        bodyText:        draft.body_text,
        bodyHtml:        draft.body_html,
        qualityScore:    v1Score,
        qualityStatus:   originalReview.status,
        qualityReviewId: existingReview?.id ?? null,
        strengths:       originalReview.strengths,
        weaknesses:      originalReview.weaknesses,
        riskFlags:       originalReview.riskFlags,
        metadata: {
          strategy_key:            'original',
          strategy_label:          'Original Draft',
          relationship_context:    classification.relationshipContext,
          trigger:                 classification.trigger,
          primary_angle:           classification.primaryAngle,
          generated_by:            'rewrite_loop_v1',
          run_at:                  new Date().toISOString(),
        },
      })
    } else {
      v1Row = lastOriginal
    }

    // Early exit: already passing
    if (v1Score >= target) {
      await persistLoopResult(input.emailDraftId, input.tenantId, {
        bestVersionId:     v1Row.id,
        bestVersionNumber: v1Row.version_number,
        bestVersionScore:  v1Score,
        loopStatus:        'passed_threshold',
        iterations:        0,
      })
      await recordLoopActivity(input, v1Score, v1Score, 0, 'passed_threshold', target)
      return {
        success: true, emailDraftId: input.emailDraftId,
        originalScore: v1Score, bestScore: v1Score,
        bestVersionId: v1Row.id, bestVersionNumber: v1Row.version_number,
        bestVersionSubject: draft.subject, bestVersionBody: draft.body_text,
        iterations: 0, duplicatesSkipped: 0, status: 'passed_threshold', reachedThreshold: true,
      }
    }

    // ---- Budget preflight (fail-open) ----
    let _rewritePreflight = { allowed: true }
    try {
      _rewritePreflight = await preflightCheck({
        tenantId:        input.tenantId,
        agentName:       'email_rewrite_agent',
        leadId:          draft.lead_id ?? null,
        draftId:         input.emailDraftId,
        estimatedTokens: 0,
        modelName:       'claude-sonnet-4-6',
      })
    } catch (err) {
      console.error('[email-rewrite-agent] Budget preflight failed — allowing call:', err)
    }
    if (!_rewritePreflight.allowed) {
      return { success: false, error: 'AI budget exhausted — rewrite loop blocked.' }
    }

    // Record AI usage (rule-based v1: 0 tokens; update when LLM is wired in)
    aiUsageRepo.recordUsage({
      tenantId:         input.tenantId,
      agentName:        'email_rewrite_agent',
      featureName:      'rewrite_loop',
      modelName:        'claude-sonnet-4-6',
      promptTokens:     0,
      completionTokens: 0,
      totalTokens:      0,
      estimatedCostUsd: 0,
      leadId:           draft.lead_id ?? null,
      draftId:          input.emailDraftId,
      success:          true,
    }).catch((err) => console.error('[email-rewrite-agent] Failed to record AI usage event:', err))

    // ---- Build context-appropriate candidate pool ----

    const first   = contactFirstName || 'there'
    const company = context.companyName ?? 'your business'

    const candidates = buildContextualCandidates({
      classification,
      suggestedSubject: originalReview.suggestedSubject,
      suggestedBody:    originalReview.suggestedBody,
      first,
      company,
      senderName,
    })

    // Historical bodies for global deduplication
    const historicalBodies: string[] = [
      draft.body_text,
      ...existingVersions.map(v => v.body_text),
    ]

    function isKnownContent(bodyText: string): boolean {
      return historicalBodies.some(h => areEmailsNearDuplicate(h, bodyText))
    }

    // ---- Score all distinct, truth-valid candidates ----

    let bestScore          = v1Score
    let bestVersionId      = v1Row.id
    let bestVersionNumber  = v1Row.version_number
    let bestVersionSubject: string | null = draft.subject
    let bestVersionBody:    string | null = draft.body_text
    let iterations         = 0
    let duplicatesSkipped  = 0
    let truthViolations    = 0
    let allBlocked         = true

    const seenThisRun = new Set<string>()
    let nextVersionNumber = originalChanged ? startVersionNumber + 1 : startVersionNumber

    for (const candidate of candidates) {
      // Exact dedup within this run
      const normBody = normalizeEmailText(candidate.bodyText)
      if (seenThisRun.has(normBody)) { duplicatesSkipped++; continue }
      seenThisRun.add(normBody)

      // Near-dup against historical versions
      if (isKnownContent(candidate.bodyText)) { duplicatesSkipped++; continue }

      // Truth guardrail — skip if wrong-context language
      if (violatesMessageTruth(classification.relationshipContext, candidate.subject, candidate.bodyText)) {
        truthViolations++
        continue
      }

      const candidateReview = reviewEmailDraftQuality(buildInput(candidate.subject, candidate.bodyText))
      const candidateScore  = Math.round(candidateReview.overallScore)
      const newRiskCount    = candidateReview.riskFlags.length

      if (newRiskCount > originalRiskFlagCount + HIGH_RISK_THRESHOLD) { duplicatesSkipped++; continue }

      allBlocked = false
      iterations++

      const vRow = await emailDraftVersionRepo.createEmailDraftVersion({
        tenantId:                input.tenantId,
        workspaceId:             input.workspaceId ?? draft.workspace_id,
        emailDraftId:            input.emailDraftId,
        leadId:                  draft.lead_id,
        companyId:               draft.company_id,
        versionNumber:           nextVersionNumber,
        versionType:             'rewrite',
        subject:                 candidate.subject,
        bodyText:                candidate.bodyText,
        bodyHtml:                candidate.bodyText
          .split('\n\n')
          .map((p: string) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
          .join(''),
        qualityScore:            candidateScore,
        qualityStatus:           candidateReview.status,
        improvementFromPrevious: candidateScore - bestScore,
        improvementFromOriginal: candidateScore - v1Score,
        rewriteReason:           candidate.strategyLabel,
        strengths:               candidateReview.strengths,
        weaknesses:              candidateReview.weaknesses,
        riskFlags:               candidateReview.riskFlags,
        metadata: {
          strategy_key:         candidate.strategyKey,
          strategy_label:       candidate.strategyLabel,
          strategy_purpose:     candidate.strategyPurpose,
          relationship_context: classification.relationshipContext,
          trigger:              classification.trigger,
          primary_angle:        classification.primaryAngle,
          truth_checked:        true,
          truth_violations:     truthViolations,
          generated_by:         'rewrite_loop_v1',
          run_at:               new Date().toISOString(),
        },
      })
      nextVersionNumber++
      historicalBodies.push(candidate.bodyText)

      if (candidateScore > bestScore) {
        bestScore          = candidateScore
        bestVersionId      = vRow.id
        bestVersionNumber  = vRow.version_number
        bestVersionSubject = candidate.subject
        bestVersionBody    = candidate.bodyText
      }

      if (candidateScore >= target) break
    }

    // ---- Final status ----

    let finalStatus: RewriteLoopStatus
    if (bestScore >= target) {
      finalStatus = 'passed_threshold'
    } else if (allBlocked && iterations === 0) {
      finalStatus = 'blocked_risk'
    } else if (bestScore > v1Score) {
      finalStatus = 'improved_but_below_threshold'
    } else {
      finalStatus = 'no_improvement'
    }

    await persistLoopResult(input.emailDraftId, input.tenantId, {
      bestVersionId,
      bestVersionNumber,
      bestVersionScore: bestScore,
      loopStatus:       finalStatus,
      iterations,
    })

    await recordLoopActivity(input, v1Score, bestScore, iterations, finalStatus, target)

    agentDecisionRepo.createDecision({
      tenantId:       input.tenantId,
      agentName:      'email_rewrite_agent',
      agentVersion:   'rules-v1',
      decisionType:   'rewrite_applied',
      decisionStatus: bestVersionId && finalStatus === 'passed_threshold' ? 'completed' : 'completed',
      leadId:         draft.lead_id ?? null,
      draftId:        input.emailDraftId,
      shortReason:    `Rewrite loop: ${iterations} iterations, best score ${bestScore}`,
      inputSnapshot:  { target_score: target, best_version_score: bestScore },
      outputSummary:  { iterations, final_version_id: bestVersionId, status: finalStatus },
      learningTags:   [`rewrite_iterations_${iterations}`, finalStatus === 'passed_threshold' ? 'rewrite_success' : 'rewrite_below_threshold'],
    }).catch((err) => console.error('[email-rewrite-agent] Failed to write agent decision:', err))

    return {
      success:            true,
      emailDraftId:       input.emailDraftId,
      originalScore:      v1Score,
      bestScore,
      bestVersionId,
      bestVersionNumber,
      bestVersionSubject,
      bestVersionBody,
      iterations,
      duplicatesSkipped:  duplicatesSkipped + truthViolations,
      status:             finalStatus,
      reachedThreshold:   finalStatus === 'passed_threshold',
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ---- Helpers ----

async function persistLoopResult(
  emailDraftId: string,
  tenantId:     string,
  result: {
    bestVersionId:     string | null
    bestVersionNumber: number
    bestVersionScore:  number
    loopStatus:        string
    iterations:        number
  }
): Promise<void> {
  await emailQualityRepo.updateEmailQualityReviewLoopResult(emailDraftId, tenantId, result)
}

async function recordLoopActivity(
  input: { tenantId: string; workspaceId?: string | null; emailDraftId: string },
  originalScore: number,
  bestScore: number,
  iterations: number,
  status: string,
  targetScore: number
): Promise<void> {
  await activityEventService.recordActivity({
    tenantId:     input.tenantId,
    workspaceId:  input.workspaceId ?? undefined,
    eventType:    ActivityEventType.EMAIL_REWRITE_LOOP_COMPLETED,
    eventSource:  'email_quality_agent',
    entityType:   'email_draft',
    entityId:     input.emailDraftId,
    eventSummary: `Email rewrite loop completed: best score ${bestScore}/100 (${status})`,
    metadata: {
      email_draft_id:    input.emailDraftId,
      original_score:    originalScore,
      best_score:        bestScore,
      improvement_delta: bestScore - originalScore,
      new_versions:      iterations,
      status,
      target_score:      targetScore,
    },
  }).catch(() => null)
}
