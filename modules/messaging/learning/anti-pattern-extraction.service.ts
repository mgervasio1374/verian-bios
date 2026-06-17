// MCM v2 Learning Loop P1 — Anti-Pattern Lab extraction service.
//
// An operator pastes known-bad emails; the LLM extracts TRANSFERABLE structural /
// tactical failure patterns (never the sample's domain/product/industry) phrased as
// domain-neutral rules for 321 Swipe's payment-processing copy. Each pattern carries
// a visible `rationale` (the glass-box reasoning). Fail-safe: any LLM/parse error →
// { error }; empty samples → { patterns: [] }. Never throws.

import { chatComplete } from '@/lib/llm/client'

export interface ExtractedPattern {
  flaggedSnippet:  string
  patternName:     string
  antiPatternRule: string
  rationale:       string
  confidence:      'low' | 'medium' | 'high'
}

export interface ExtractAntiPatternsParams {
  tenantId:   string
  targetSlug: string
  samples:    string[]
}

export type ExtractAntiPatternsResult =
  | { patterns: ExtractedPattern[] }
  | { error: string }

// The canonical copywriting slugs the rewrite loop actually resolves (the 4
// relationship contexts mapRelationshipToSkillSlug maps). Default target first.
export const CANONICAL_COPYWRITING_SLUGS = [
  'cold_outreach',
  'new_inquiry_response',
  'statement_review_follow_up',
  're_engagement',
] as const

const VALID_CONFIDENCE = new Set(['low', 'medium', 'high'])

export const ANTI_PATTERN_SYSTEM_PROMPT = [
  'You are a copy-quality analyst for 321 Swipe, a merchant payment-processing provider.',
  'You are given one or more sample emails that are known to be BAD (junk / spammy / low-quality).',
  'Your job: extract TRANSFERABLE failure patterns — tactics and structure only.',
  '',
  'DOMAIN-LEAK GUARD (critical — follow exactly):',
  "- Extract ONLY transferable structural or tactical failure patterns (tone, structure, manipulation tactics, formatting, CTA shape).",
  "- NEVER reference the sample's industry, product, company, or domain. The samples may be about anything; the lessons must be domain-neutral.",
  '- Phrase each antiPatternRule as a domain-neutral rule for 321 Swipe payment-processing copy, beginning with "Avoid ".',
  '- Do NOT carry over any concrete subject matter, offers, or vocabulary from the samples.',
  '',
  'For each distinct failure pattern return:',
  '- flaggedSnippet: a short quote from a sample that exemplifies the pattern (verbatim).',
  '- patternName: a short label for the pattern.',
  '- antiPatternRule: the domain-neutral "Avoid ..." rule.',
  '- rationale: what you flagged and WHY it is a transferable failure (this is shown to the operator).',
  '- confidence: one of "low", "medium", "high".',
  '',
  'Return STRICT JSON only, no prose and no code fences: an array of objects with exactly those five keys.',
].join('\n')

// Tolerant JSON-array parse mirroring parseLlmRewriteArray.
function parseArray(raw: string): unknown[] | null {
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

export async function extractAntiPatterns(
  params: ExtractAntiPatternsParams,
): Promise<ExtractAntiPatternsResult> {
  const samples = params.samples.map(s => s.trim()).filter(Boolean)
  if (samples.length === 0) return { patterns: [] }

  try {
    const user = [
      `Target copywriting context (for your awareness only — do NOT mention it): ${params.targetSlug}.`,
      '',
      'Sample bad emails:',
      ...samples.map((s, i) => `--- Sample ${i + 1} ---\n${s}`),
    ].join('\n')

    const res = await chatComplete({ system: ANTI_PATTERN_SYSTEM_PROMPT, user, maxTokens: 1200, temperature: 0.2 })
    const parsed = parseArray(res.text)
    if (!parsed) return { error: 'The model returned unusable output. Try again or rephrase the samples.' }

    const patterns: ExtractedPattern[] = []
    for (const raw of parsed) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as Record<string, unknown>
      const flaggedSnippet  = typeof r.flaggedSnippet === 'string' ? r.flaggedSnippet.trim() : ''
      const patternName     = typeof r.patternName === 'string' ? r.patternName.trim() : ''
      const antiPatternRule = typeof r.antiPatternRule === 'string' ? r.antiPatternRule.trim() : ''
      const rationale       = typeof r.rationale === 'string' ? r.rationale.trim() : ''
      const confidence      = typeof r.confidence === 'string' && VALID_CONFIDENCE.has(r.confidence)
        ? (r.confidence as ExtractedPattern['confidence'])
        : 'low'
      if (!antiPatternRule) continue // a pattern with no rule is useless
      patterns.push({ flaggedSnippet, patternName, antiPatternRule, rationale, confidence })
    }

    return { patterns }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Extraction failed.' }
  }
}
