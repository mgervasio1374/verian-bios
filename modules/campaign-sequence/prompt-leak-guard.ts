// Heuristic guard against the staging leak: a prompt-style asset linked to a
// manual sequence gets rendered literally by Manual Campaign Mode, so an AI
// prompt becomes the email body. These checks surface WARNINGS only — they
// are heuristics and must never hard-block an operator.

// Markers matched anywhere in the body (case-insensitive)
export const AI_PROMPT_MARKERS = [
  'you are an expert',
  'your task is',
  'copywriter for',
] as const

export function looksLikeAiPrompt(text: string): boolean {
  const trimmed = text.trim().toLowerCase()
  if (!trimmed) return false
  // Prompt bodies overwhelmingly open with a persona assignment ("You are ...").
  // Mid-sentence uses like "you are invited" do not trip this rule.
  if (trimmed.startsWith('you are')) return true
  return AI_PROMPT_MARKERS.some(marker => trimmed.includes(marker))
}
