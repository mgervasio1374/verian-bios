// Model pricing rates — stored as constants.
// Update rates here if provider pricing changes.
// Historical rows retain their original computed cost; only forward estimates change.
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-sonnet-4-6':         { inputPer1M: 3.00,  outputPer1M: 15.00 },
  'claude-haiku-4-5-20251001': { inputPer1M: 0.25,  outputPer1M: 1.25  },
  'claude-opus-4-7':           { inputPer1M: 15.00, outputPer1M: 75.00 },
}

export function estimateCostUsd(
  modelName:        string,
  promptTokens:     number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[modelName]
  if (!pricing) return 0.000000

  const inputCost  = (promptTokens / 1_000_000)     * pricing.inputPer1M
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M
  return parseFloat((inputCost + outputCost).toFixed(6))
}
