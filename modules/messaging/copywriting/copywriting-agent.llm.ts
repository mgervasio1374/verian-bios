// Phase 3B — Copywriting Agent: LLM body adapter.
// The deterministic generator (copywriting-agent.body.ts) was always designed so a
// "future LLM adapter can replace this module without changing service contracts".
// This is that adapter: it produces a BodyGenerationResult from a real LLM call
// (OpenRouter gpt-4o-mini via the existing client), returning null on ANY failure so
// the caller falls back to deterministic generation. The body it returns is held to
// the SAME compliance/structural guardrails downstream — the LLM cannot bypass them.

import { chatComplete } from '@/lib/llm/client'
import { APPROVED_MERGE_FIELDS } from '@/modules/messaging/campaign-assets/campaign-asset.constants'
import { applyHouseStyle } from '@/modules/messaging/house-style'
import type { VersionAngle, CopywritingLeadContext } from './copywriting-agent.types'
import type { MessageStrategy } from '@/modules/messaging/strategy/message-strategy.types'
import type { BodyGenerationResult } from './copywriting-agent.body'

export interface LlmBodyOutcome {
  result:           BodyGenerationResult
  promptTokens:     number
  completionTokens: number
  modelName:        string
}

function buildPrompt(
  angle:    VersionAngle,
  strategy: MessageStrategy,
  ctx:      CopywritingLeadContext,
): { system: string; user: string } {
  const approved = Object.keys(APPROVED_MERGE_FIELDS).map(k => `{{${k}}}`).join(', ')
  const system = [
    'You are an expert B2B copywriter for 321 Swipe, a merchant payment-processing provider.',
    'Write ONLY the body of a short, professional outreach email (no subject line).',
    'Hard rules:',
    `- Personalization: use ONLY these merge field tokens where needed: ${approved}. Never invent tokens.`,
    '- Do NOT use em dashes or en dashes.',
    '- Exactly one clear call to action.',
    '- Do NOT fabricate savings figures, rates, percentages, or guarantees.',
    '- Keep it concise, specific, and human.',
    'Return STRICT JSON only, no prose and no code fences: {"bodyText": "<the email body>"}',
  ].join('\n')

  const brief = {
    message_type:        strategy.message_type,
    goal:                strategy.primary_goal,
    angle:               angle.strategyAngle,
    required_inclusions: strategy.required_inclusions ?? [],
    avoid:               strategy.avoid ?? [],
    company:             ctx.companyName ?? null,
  }
  const user = `Write the email body for this brief:\n${JSON.stringify(brief, null, 2)}`
  return { system, user }
}

// Tolerant JSON extraction — strips code fences, takes the first {...} block.
export function parseLlmBodyText(raw: string): string | null {
  const s = raw.trim()
  const start = s.indexOf('{')
  const end   = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const obj = JSON.parse(s.slice(start, end + 1)) as { bodyText?: unknown }
    return typeof obj.bodyText === 'string' && obj.bodyText.trim().length > 0
      ? obj.bodyText.trim()
      : null
  } catch {
    return null
  }
}

export async function generateBodyWithLlm(
  angle:    VersionAngle,
  strategy: MessageStrategy,
  ctx:      CopywritingLeadContext,
): Promise<LlmBodyOutcome | null> {
  try {
    const { system, user } = buildPrompt(angle, strategy, ctx)
    const res = await chatComplete({ system, user, maxTokens: 600, temperature: 0.7 })
    const body = parseLlmBodyText(res.text)
    if (!body) return null
    return {
      result: {
        bodyText:             applyHouseStyle(body),
        personalizationUsed:  [],
        personalizationGaps:  [],
        differentiationHints: {},
      },
      promptTokens:     res.promptTokens,
      completionTokens: res.completionTokens,
      modelName:        res.modelName,
    }
  } catch {
    // Any LLM/config/parse failure → null so the caller uses deterministic generation.
    return null
  }
}
