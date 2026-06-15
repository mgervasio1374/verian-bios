// Skill-grounded LLM rewrite candidate generator.
//
// The "Run Rewrite Loop" path historically produced variants from hardcoded
// templates and never touched the LLM. This module grounds a real LLM call in
// the Copywriting Agent's existing skill library (toneRules / messagingRules /
// required+forbidden elements / ctaGuidance / compliance / antiPatterns) so the
// rewrite path is skill-driven rather than generic prompting, and inherits any
// future learned skills behind the same getSkillDefinition() interface.
//
// It reuses the agent's decoupled plumbing primitives — chatComplete,
// getSkillDefinition, GLOBAL_BANNED_PHRASES, applyHouseStyle — without touching
// the strategy-row-centric Copywriting Agent service (no message_versions, no
// message_strategy needed). Fail-open: ANY disabled/missing/parse/zero-survivor
// condition returns null so the caller falls back to the template path.

import { chatComplete } from '@/lib/llm/client'
import { getSkillDefinition } from './copywriting-agent.skill-definitions'
import { GLOBAL_BANNED_PHRASES } from './copywriting-agent.types'
import { applyHouseStyle } from '@/modules/messaging/house-style'
import { violatesMessageTruth } from '@/modules/messaging/services/email-message-strategy.service'
import type { RelationshipContext } from '@/modules/messaging/services/email-message-strategy.service'

// Structurally identical to the loop's candidate shape, so an LLM candidate and
// a template candidate are interchangeable downstream.
export interface RewriteCandidate {
  subject:         string
  bodyText:        string
  strategyKey:     string
  strategyLabel:   string
  strategyPurpose: string
}

// Token telemetry from the single chatComplete call, written via out-param so the
// caller can record REAL usage. Left untouched on any fail-open path.
export interface RewriteLlmTelemetry {
  promptTokens:     number
  completionTokens: number
  modelName:        string
}

// Maps a loop relationship context to the matching context-category skill slug.
// Deterministic and exported for direct testing. Unmatched → 'cold_outreach'
// (the safest, no-prior-familiarity context).
export function mapRelationshipToSkillSlug(relationshipContext: string): string {
  switch (relationshipContext) {
    case 'cold_outreach':       return 'cold_outreach'
    case 'inbound_inquiry':     return 'new_inquiry_response'
    case 'statement_submitted': return 'statement_review_follow_up'
    case 'reengagement':        return 're_engagement'
    default:                    return 'cold_outreach'
  }
}

// Tolerant JSON-array parse, mirroring parseLlmBodyText: strip any prose/code
// fences and take the first [...] block. Returns the raw candidate objects or
// null on any failure.
function parseLlmRewriteArray(raw: string): Array<{ subject?: unknown; bodyText?: unknown }> | null {
  const s = raw.trim()
  const start = s.indexOf('[')
  const end   = s.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const arr = JSON.parse(s.slice(start, end + 1))
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
}

function containsBannedPhrase(text: string): boolean {
  const lower = text.toLowerCase()
  return GLOBAL_BANNED_PHRASES.some(p => lower.includes(p.toLowerCase()))
}

export async function generateLlmRewriteCandidates(
  params: {
    relationshipContext: string
    trigger:             string
    primaryAngle:        string
    currentSubject:      string
    currentBody:         string
    first:               string
    company:             string
    senderName:          string
    count?:              number
  },
  telemetry?: RewriteLlmTelemetry,
): Promise<RewriteCandidate[] | null> {
  try {
    const count = params.count ?? 4

    const skillSlug = mapRelationshipToSkillSlug(params.relationshipContext)
    const skill = getSkillDefinition(skillSlug, 1)
    if (!skill) return null

    // System prompt grounded in the resolved skill + the same hard rules the
    // Copywriting Agent's generateBodyWithLlm enforces + the global ban list.
    const system = [
      'You are an expert B2B copywriter for 321 Swipe, a merchant payment-processing provider.',
      `You are rewriting an outreach email that is in the "${skillSlug}" relationship context.`,
      '',
      'Skill guidance for this context (follow it precisely):',
      `- Tone: ${skill.toneRules}`,
      `- Messaging: ${skill.messagingRules}`,
      `- Required elements: ${skill.requiredElements.join('; ') || 'none'}`,
      `- Forbidden elements: ${skill.forbiddenElements.join('; ') || 'none'}`,
      `- CTA guidance: ${skill.ctaGuidance}`,
      `- Compliance: ${skill.complianceNotes}`,
      `- Anti-patterns to avoid: ${skill.antiPatterns.join('; ') || 'none'}`,
      '',
      'Hard rules (never violate):',
      '- Do NOT use em dashes or en dashes.',
      '- Exactly one clear call to action per variant.',
      '- Do NOT fabricate savings figures, rates, percentages, or guarantees.',
      '- Keep each variant concise, specific, and human.',
      `- Address the contact by the literal first name "${params.first}".`,
      `- Reference the literal company name "${params.company}" where natural.`,
      '- Do NOT use merge tokens or placeholders like {{first_name}}; write the real values.',
      `- Never use any of these banned phrases: ${GLOBAL_BANNED_PHRASES.join('; ')}.`,
      '',
      `Return STRICT JSON only, no prose and no code fences: an array of ${count} objects, each ` +
        '{"subject": "<subject line>", "bodyText": "<email body>"}.',
    ].join('\n')

    const user = [
      `Relationship context: ${params.relationshipContext} (trigger: ${params.trigger}, angle: ${params.primaryAngle}).`,
      `Sender name: ${params.senderName}.`,
      '',
      'Current email to improve:',
      `Subject: ${params.currentSubject}`,
      `Body:\n${params.currentBody}`,
      '',
      `Rewrite into ${count} DISTINCT improved variants that stay strictly in this relationship ` +
        'context. Do not introduce wrong-context language (for example, inbound "thanks for ' +
        'reaching out" phrasing on a cold email, or statement-review language when no statement ' +
        'was submitted). Each variant must be meaningfully different from the others.',
    ].join('\n')

    const res = await chatComplete({ system, user, maxTokens: 900, temperature: 0.7 })
    const parsed = parseLlmRewriteArray(res.text)
    if (!parsed) return null

    const ctx = params.relationshipContext as RelationshipContext
    const survivors: RewriteCandidate[] = []

    for (const raw of parsed) {
      if (typeof raw?.subject !== 'string' || typeof raw?.bodyText !== 'string') continue
      const subject  = raw.subject.trim()
      const bodyText = applyHouseStyle(raw.bodyText.trim())
      if (!subject || !bodyText) continue

      // Same guardrails the loop applies: global ban list + context-truth guard.
      if (containsBannedPhrase(`${subject} ${bodyText}`)) continue
      if (violatesMessageTruth(ctx, subject, bodyText)) continue

      survivors.push({
        subject,
        bodyText,
        strategyKey:     'llm_rewrite',
        strategyLabel:   `AI Rewrite · ${skillSlug}`,
        strategyPurpose: skill.messagingRules,
      })
    }

    if (survivors.length === 0) return null

    if (telemetry) {
      telemetry.promptTokens     = res.promptTokens
      telemetry.completionTokens = res.completionTokens
      telemetry.modelName        = res.modelName
    }

    return survivors
  } catch {
    // Any LLM/config/parse failure → null so the caller uses templates.
    return null
  }
}
