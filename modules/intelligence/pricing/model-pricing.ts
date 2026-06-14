// Model pricing — list-price per 1,000,000 tokens, in USD.
//
// SINGLE SOURCE OF TRUTH for AI cost math. These are provider/OpenRouter LIST
// prices and MUST be kept in sync if a model's pricing changes or a new model
// is adopted. The backfill migration (20240054_backfill_ai_usage_cost.sql)
// hardcodes the SAME per-1M numbers in a CASE — keep the two in lockstep.
//
// Out of scope (by design): per-tenant custom pricing, a pricing-admin UI, and
// real-time reconciliation against the provider's reported spend.

export interface ModelPrice {
  inputPerMillion:  number
  outputPerMillion: number
}

// Keys are NORMALIZED names (see normalizeModelName): lowercased, provider
// prefix stripped. Add models the codebase actually records here.
export const MODEL_PRICING: Record<string, ModelPrice> = {
  // OpenAI (via OpenRouter) — used by the LLM client for campaign asset/sequence generation.
  'gpt-4o-mini':                { inputPerMillion: 0.15,  outputPerMillion: 0.60  },
  // Anthropic — the Phase 3B agents (strategy, copywriting, quality review, rewrite).
  'claude-sonnet-4-6':          { inputPerMillion: 3.00,  outputPerMillion: 15.00 },
  'claude-haiku-4-5-20251001':  { inputPerMillion: 0.25,  outputPerMillion: 1.25  },
  'claude-opus-4-7':            { inputPerMillion: 15.00, outputPerMillion: 75.00 },
}

// Lowercase + strip a single provider prefix (e.g. "openai/gpt-4o-mini" and
// "gpt-4o-mini" both resolve), so either stored format prices the same.
export function normalizeModelName(name: string): string {
  const lower = (name ?? '').trim().toLowerCase()
  const slash = lower.indexOf('/')
  return slash >= 0 ? lower.slice(slash + 1) : lower
}

export function isPricedModel(name: string): boolean {
  return normalizeModelName(name) in MODEL_PRICING
}

const warnedModels = new Set<string>()

// Compute a dollar cost from token counts. Unknown model → 0 (never guess a
// price), warned once so the gap is visible without log spam.
export function estimateCostUsd(
  modelName:        string,
  promptTokens:     number,
  completionTokens: number,
): number {
  const normalized = normalizeModelName(modelName)
  const pricing = MODEL_PRICING[normalized]
  if (!pricing) {
    if (!warnedModels.has(normalized)) {
      warnedModels.add(normalized)
      console.warn(`[model-pricing] No price for model "${modelName}" (normalized "${normalized}") — cost recorded as 0.`)
    }
    return 0
  }

  const inputCost  = (promptTokens     / 1_000_000) * pricing.inputPerMillion
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillion
  return parseFloat((inputCost + outputCost).toFixed(6))
}
