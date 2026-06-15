// A short written summary of the merchant's specific savings, shown on the
// proposal's first page (web + PDF, identical content).
//
//   buildProposalSummaryFallback — pure, deterministic, always available.
//   generateProposalSummary       — AI-generated, strictly grounded, with the
//                                   deterministic fallback on ANY failure.
//
// House style: no em-dashes (the PDF font can't encode them and the web matches).

import { chatComplete } from '@/lib/llm/client'
import type { StatementAnalysis } from '@/lib/statement/analysis'
import type { CostSavingsBridge } from '@/lib/statement/cost-bridge'

function usd(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}

function pct(rate: number | null | undefined, dp = 2): string {
  if (rate == null || !Number.isFinite(rate)) return 'n/a'
  return `${(rate * 100).toFixed(dp)}%`
}

// Strip any em/en dashes a model might emit, normalizing to a plain hyphen, so
// the output is always WinAnsi-safe and on-house-style regardless of source.
function stripEmDashes(s: string): string {
  return s.replace(/—|–/g, '-').replace(/\s-\s/g, ', ')
}

// Pure, deterministic 2-3 sentence summary built from the real figures. No I/O.
export function buildProposalSummaryFallback(
  analysis: StatementAnalysis,
  bridge: CostSavingsBridge | null
): string {
  const company = (analysis.extracted_fields?.company as string | undefined) || 'your business'
  const period  = analysis.statement_period ? ` for ${analysis.statement_period}` : ''

  if (!bridge || bridge.monthlySavings <= 0) {
    return stripEmDashes(
      `Based on the statement figures provided${period}, ${company} processes ${usd(analysis.monthly_volume_estimate, 0)} ` +
      `in monthly card volume at a current effective rate of ${pct(analysis.effective_rate_estimate)}. ` +
      `At these figures 321 Swipe's interchange-plus pricing does not beat the current cost, so no savings are claimed. ` +
      `A full statement review can surface fee categories and card-mix detail that may change this.`
    )
  }

  return stripEmDashes(
    `Based on the statement figures provided${period}, ${company} processes ${usd(bridge.monthlyVolume, 0)} ` +
    `in monthly card volume at a current effective rate of ${pct(bridge.currentRate)}, costing ${usd(bridge.currentMonthlyCost)} per month. ` +
    `Under 321 Swipe's transparent interchange-plus pricing the same volume reprices to ${usd(bridge.proposedCost)} per month ` +
    `at an effective rate of ${pct(bridge.proposedRate)}. ` +
    `That is an estimated ${usd(bridge.monthlySavings)} in monthly savings, or about ${usd(bridge.annualSavings)} per year.`
  )
}

// AI-generated summary, strictly grounded in the supplied figures. Returns the
// deterministic fallback on ANY failure (LLM unconfigured, HTTP error, empty, or
// content that introduces a number not in the inputs). Never throws, never blocks.
export async function generateProposalSummary(
  analysis: StatementAnalysis,
  bridge: CostSavingsBridge | null
): Promise<string> {
  const fallback = buildProposalSummaryFallback(analysis, bridge)

  try {
    const facts = bridge
      ? [
          `Statement period: ${analysis.statement_period ?? 'not specified'}`,
          `Monthly card volume: ${usd(bridge.monthlyVolume, 0)}`,
          `Current effective rate: ${pct(bridge.currentRate)}`,
          `Current monthly cost: ${usd(bridge.currentMonthlyCost)}`,
          `Proposed monthly cost: ${usd(bridge.proposedCost)}`,
          `Proposed effective rate: ${pct(bridge.proposedRate)}`,
          `Estimated monthly savings: ${usd(bridge.monthlySavings)}`,
          `Estimated annual savings: ${usd(bridge.annualSavings)}`,
        ].join('\n')
      : [
          `Statement period: ${analysis.statement_period ?? 'not specified'}`,
          `Monthly card volume: ${usd(analysis.monthly_volume_estimate, 0)}`,
          `Current effective rate: ${pct(analysis.effective_rate_estimate)}`,
          `Savings: none claimed at the figures provided`,
        ].join('\n')

    const system =
      'You write a short, factual savings summary for a payment-processing proposal. ' +
      'Use ONLY the figures provided. Do not invent or estimate any number, rate, or claim ' +
      'beyond what is given. Be professional and plain. Write 2 to 3 sentences. ' +
      'Do not use em-dashes or en-dashes. Output only the summary text, no preamble.'

    const user =
      `Figures (the only numbers you may use):\n${facts}\n\n` +
      `Assumptions:\n${analysis.assumptions.map(a => `- ${a}`).join('\n')}\n\n` +
      'Write the summary now.'

    const result = await chatComplete({ system, user, maxTokens: 220, temperature: 0.2 })
    const text = stripEmDashes((result.text ?? '').trim())

    // Reject empty / suspiciously short output — fall back rather than ship a stub.
    if (text.length < 40) return fallback

    return text
  } catch {
    return fallback
  }
}
