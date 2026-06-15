// mcm-v2 — Proposal contact block + about-us + AI summary. Behavioral tests for
// the presentation config, the deterministic fallback, the AI summary's
// fallback-on-failure contract, plus a source-read that both first-page surfaces
// render the contact block (phone), about-us, and summary.
// TC-CS-01..07

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCalculatedAnalysis } from '@/lib/statement/analysis'
import { deriveCostSavingsBridge } from '@/lib/statement/cost-bridge'
import { buildProposalSummaryFallback } from '@/lib/statement/proposal-summary'

vi.mock('@/lib/llm/client', () => ({
  chatComplete: vi.fn(),
}))
import { chatComplete } from '@/lib/llm/client'
import { generateProposalSummary } from '@/lib/statement/proposal-summary'

function calculated() {
  return buildCalculatedAnalysis({
    monthlyVolume:      100_000,
    currentMonthlyFees: 3_200,
    transactionCount:   2_000,
    companyName:        'Harbor Diner',
    statementPeriod:    'March 2026',
  })
}

// ---------------------------------------------------------------------------
// Deterministic fallback
// ---------------------------------------------------------------------------

describe('TC-CS-01: buildProposalSummaryFallback — grounded in the real figures', () => {
  it('mentions the period, proposed rate, and savings figures; no em-dash', () => {
    const a = calculated()
    const bridge = deriveCostSavingsBridge(a)!
    const s = buildProposalSummaryFallback(a, bridge)

    expect(s).toContain('March 2026')
    expect(s).toContain('Harbor Diner')
    expect(s).toContain('$915.00')          // monthly savings
    expect(s).toContain('$10,980.00')       // annual savings
    expect(s).toContain('2.28%')            // proposed effective rate (2285/100000)
    // house style: no em-dash or en-dash anywhere
    expect(s).not.toMatch(/—|–/)
  })

  it('degrades honestly when there is no bridge / no savings', () => {
    const a = calculated()
    const s = buildProposalSummaryFallback(a, null)
    expect(s).toMatch(/no savings/i)
    expect(s).not.toMatch(/—|–/)
  })
})

// ---------------------------------------------------------------------------
// AI summary with fallback
// ---------------------------------------------------------------------------

describe('TC-CS-02: generateProposalSummary — fallback on failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('LLM throws → returns the deterministic fallback verbatim', async () => {
    vi.mocked(chatComplete).mockRejectedValueOnce(new Error('LLM not configured'))
    const a = calculated()
    const bridge = deriveCostSavingsBridge(a)
    const out = await generateProposalSummary(a, bridge)
    expect(out).toBe(buildProposalSummaryFallback(a, bridge))
  })

  it('empty / too-short text → returns the fallback', async () => {
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: 'ok', promptTokens: 1, completionTokens: 1, modelName: 'm' })
    const a = calculated()
    const bridge = deriveCostSavingsBridge(a)
    const out = await generateProposalSummary(a, bridge)
    expect(out).toBe(buildProposalSummaryFallback(a, bridge))
  })
})

describe('TC-CS-03: generateProposalSummary — clean text is used', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the model text (em-dashes normalized away)', async () => {
    const clean = 'Harbor Diner can save roughly $915 a month under interchange-plus pricing for the same processing volume.'
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: clean, promptTokens: 10, completionTokens: 20, modelName: 'm' })
    const a = calculated()
    const out = await generateProposalSummary(a, deriveCostSavingsBridge(a))
    expect(out).toBe(clean)
    expect(out).not.toMatch(/—|–/)
  })

  it('strips em-dashes from otherwise-clean model output', async () => {
    const withDash = 'Harbor Diner processes $100,000 monthly — saving about $915 each month under interchange-plus.'
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: withDash, promptTokens: 10, completionTokens: 20, modelName: 'm' })
    const a = calculated()
    const out = await generateProposalSummary(a, deriveCostSavingsBridge(a))
    expect(out).not.toMatch(/—|–/)
    expect(out).toContain('Harbor Diner')
  })
})

// ---------------------------------------------------------------------------
// Numeric grounding guard
// ---------------------------------------------------------------------------

describe('TC-CS-06: generateProposalSummary — numeric grounding guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('output using only in-figures numbers is used', async () => {
    const grounded =
      'For March 2026, Harbor Diner processes $100,000 monthly at 3.20% and reprices to 2.28%, ' +
      'an estimated $915.00 in monthly savings.'
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: grounded, promptTokens: 10, completionTokens: 20, modelName: 'm' })
    const a = calculated()
    const out = await generateProposalSummary(a, deriveCostSavingsBridge(a))
    expect(out).toBe(grounded)
  })

  it('a $ amount absent from the figures → fallback', async () => {
    const a = calculated()
    const bridge = deriveCostSavingsBridge(a)
    const hallucinated =
      'Harbor Diner could save an incredible $5,000 every single month with 321 Swipe pricing today.'
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: hallucinated, promptTokens: 10, completionTokens: 20, modelName: 'm' })
    const out = await generateProposalSummary(a, bridge)
    expect(out).toBe(buildProposalSummaryFallback(a, bridge))
  })

  it('a % value absent from the figures → fallback', async () => {
    const a = calculated()
    const bridge = deriveCostSavingsBridge(a)
    const hallucinated =
      'Harbor Diner can cut its effective rate to just 0.99% under 321 Swipe pricing for the same volume.'
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: hallucinated, promptTokens: 10, completionTokens: 20, modelName: 'm' })
    const out = await generateProposalSummary(a, bridge)
    expect(out).toBe(buildProposalSummaryFallback(a, bridge))
  })

  it('normal rounding of a real figure passes (tolerance, not exact-string)', async () => {
    // proposed cost is $2,285.00; "$2,285" (no cents) must still be grounded.
    const rounded =
      'For March 2026, Harbor Diner reprices to about $2,285 per month at roughly 2.28%, saving $915 monthly.'
    vi.mocked(chatComplete).mockResolvedValueOnce({ text: rounded, promptTokens: 10, completionTokens: 20, modelName: 'm' })
    const a = calculated()
    const out = await generateProposalSummary(a, deriveCostSavingsBridge(a))
    expect(out).toBe(rounded)
  })
})

// ---------------------------------------------------------------------------
// Presentation config
// ---------------------------------------------------------------------------

describe('TC-CS-04: getProposalPresentation — defaults + env override', () => {
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved } })

  it('safe 321 Swipe defaults (phone 941-552-0725, website default)', async () => {
    delete process.env.PROPOSAL_COMPANY_PHONE
    delete process.env.PROPOSAL_COMPANY_WEBSITE
    delete process.env.PROPOSAL_SENDER_EMAIL
    delete process.env.PROPOSAL_INQUIRY_EMAIL
    delete process.env.PROPOSAL_ABOUT_US
    delete process.env.PROPOSAL_SENDER_NAME
    delete process.env.PROPOSAL_SENDER_TITLE
    const { getProposalPresentation } = await import('@/lib/config/proposal-presentation')
    const p = getProposalPresentation()
    expect(p.senderName).toBe('Bruce Hughes')
    expect(p.senderTitle).toBe('Chief Information Officer')
    expect(p.companyPhone).toBe('941-552-0725')
    expect(p.companyWebsite).toBe('321swipe.com')
    expect(p.senderEmail).toBe('sales@321swipe.com')
    expect(p.aboutUs.length).toBeGreaterThan(20)
  })

  it('env overrides win', async () => {
    process.env.PROPOSAL_COMPANY_PHONE = '555-000-1111'
    process.env.PROPOSAL_SENDER_EMAIL = 'rep@321swipe.com'
    const { getProposalPresentation } = await import('@/lib/config/proposal-presentation')
    const p = getProposalPresentation()
    expect(p.companyPhone).toBe('555-000-1111')
    expect(p.senderEmail).toBe('rep@321swipe.com')
  })
})

// ---------------------------------------------------------------------------
// Source-read: both first-page surfaces render contact + about + summary
// ---------------------------------------------------------------------------

describe('TC-CS-05: web + PDF first pages render contact, about-us, and summary', () => {
  const root = join(__dirname, '..')

  it('web first-page (data-print="summary") renders the additions from the presentation config', () => {
    const page = readFileSync(join(root, 'app', 'p', '[token]', 'page.tsx'), 'utf8')
    expect(page).toContain('getProposalPresentation')
    expect(page).toContain('About 321 Swipe')
    expect(page).toContain('presentation.companyPhone')
    expect(page).toContain('proposal.proposalSummary')
  })

  it('web: the summary primer renders before the KPI row', () => {
    const page = readFileSync(join(root, 'app', 'p', '[token]', 'page.tsx'), 'utf8')
    const summaryIdx = page.indexOf('{summary && (')
    const kpiIdx     = page.indexOf("label=\"Monthly savings\"")
    expect(summaryIdx).toBeGreaterThan(-1)
    expect(kpiIdx).toBeGreaterThan(-1)
    expect(summaryIdx).toBeLessThan(kpiIdx)
  })

  it('PDF page 1 renders the contact block (phone), about-us, and summary', () => {
    const pdf = readFileSync(join(root, 'lib', 'pdf', 'proposal.ts'), 'utf8')
    expect(pdf).toContain('getProposalPresentation')
    expect(pdf).toContain('About 321 Swipe')
    expect(pdf).toContain('presentation.companyPhone')
    expect(pdf).toContain('buildProposalSummaryFallback')
  })

  it('PDF: the summary paragraph draw precedes the kpiRow call', () => {
    const pdf = readFileSync(join(root, 'lib', 'pdf', 'proposal.ts'), 'utf8')
    const summaryIdx = pdf.indexOf('paragraph(doc, summary')
    const kpiIdx     = pdf.indexOf('kpiRow(doc, [') // the call, not the fn definition
    expect(summaryIdx).toBeGreaterThan(-1)
    expect(kpiIdx).toBeGreaterThan(-1)
    expect(summaryIdx).toBeLessThan(kpiIdx)
  })

  it('public-proposal.service exposes proposalSummary (stored or live fallback)', () => {
    const svc = readFileSync(join(root, 'modules', 'proposals', 'services', 'public-proposal.service.ts'), 'utf8')
    expect(svc).toContain('proposalSummary')
    expect(svc).toContain('buildProposalSummaryFallback')
  })
})
