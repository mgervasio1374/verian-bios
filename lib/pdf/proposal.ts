import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from 'pdf-lib'
import type { StatementAnalysis } from '@/lib/statement/analysis'
import { deriveCostSavingsBridge } from '@/lib/statement/cost-bridge'
import { buildProposalSummaryFallback } from '@/lib/statement/proposal-summary'
import { getProposalPresentation } from '@/lib/config/proposal-presentation'

// Multi-page proposal certificate. Mirrors the hosted web page at
// app/p/[token]/page.tsx section-for-section and is driven by the SAME pure
// helper (deriveCostSavingsBridge) so the PDF and the page can never disagree on
// a number. Manual pagination (explicit page breaks, not auto-flow); a footer is
// drawn on every page.
//
//   Page 1 — Proposal (the numbers): KPI row, Savings View, Statement Analysis,
//            Recommended Pricing Structure.
//   Page 2 — How we calculated this (intelligence): Cost Savings Bridge,
//            effective-rate compare, Logic followed.   [calculated only]
//   Then   — Assumptions & disclaimer + Next Steps (continuation / new page).
//
// When the bridge is null (placeholder / calculated-zero / no analysis) the
// intelligence page is omitted and page 1 degrades honestly — never a fabricated
// bridge — matching the web page's honesty exactly.

// ---- Brand colours (matches the web page palette) ----
const C_NAVY      = rgb(15 / 255,  30 / 255,  61 / 255)  // #0f1e3d  (web section band)
const C_DARK      = rgb(17 / 255,  24 / 255,  39 / 255)  // #111827
const C_GRAY      = rgb(107 / 255, 114 / 255, 128 / 255) // #6b7280
const C_LIGHT_BG  = rgb(249 / 255, 250 / 255, 251 / 255) // #f9fafb
const C_BORDER    = rgb(229 / 255, 231 / 255, 235 / 255) // #e5e7eb
const C_WHITE     = rgb(1, 1, 1)
const C_GREEN     = rgb(4 / 255,  120 / 255,  87 / 255)  // #047857  emerald-700
const C_GREEN_BG  = rgb(236 / 255, 253 / 255, 245 / 255) // emerald-50
const C_GREEN_BD  = rgb(167 / 255, 243 / 255, 208 / 255) // emerald-200
const C_BLUE_TEXT = rgb(191 / 255, 219 / 255, 254 / 255) // blue-100

// US Letter: 612 × 792 pt
const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 48
const CONTENT_W = PAGE_W - MARGIN * 2
const BOTTOM = 52 // anything below this y belongs to the footer band

export interface ProposalPdfParams {
  companyName:  string | null
  contactName:  string | null
  contactEmail: string | null
  analysis:     StatementAnalysis
  calendlyLink: string
  generatedAt:  string
  proposalSummary?: string
}

// ---- Formatting (mirrors the web page's usd()/pct()) ----

function usd(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return '-'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}

function pct(rate: number | null | undefined, dp = 2): string {
  if (rate == null || !Number.isFinite(rate)) return '-'
  return `${(rate * 100).toFixed(dp)}%`
}

// ---- Document cursor (manual pagination) ----

interface Doc {
  pdf:      PDFDocument
  font:     PDFFont
  bold:     PDFFont
  page:     PDFPage
  y:        number
  pageNo:   number
  dateStr:  string
}

function drawTopBand(doc: Doc) {
  const p = doc.page
  p.drawRectangle({ x: 0, y: PAGE_H - 56, width: PAGE_W, height: 56, color: C_NAVY })
  p.drawText('321 SWIPE', { x: MARGIN, y: PAGE_H - 28, size: 16, font: doc.bold, color: C_WHITE })
  p.drawText('Payment Intelligence Proposal', { x: MARGIN, y: PAGE_H - 44, size: 9, font: doc.font, color: C_BLUE_TEXT })
  const dw = doc.font.widthOfTextAtSize(doc.dateStr, 9)
  p.drawText(doc.dateStr, { x: PAGE_W - MARGIN - dw, y: PAGE_H - 44, size: 9, font: doc.font, color: C_BLUE_TEXT })
}

function drawFooter(doc: Doc) {
  const p = doc.page
  p.drawLine({ start: { x: MARGIN, y: 36 }, end: { x: PAGE_W - MARGIN, y: 36 }, thickness: 0.5, color: C_BORDER })
  const footer = `321 Swipe · Confidential · Page ${doc.pageNo}`
  const fw = doc.font.widthOfTextAtSize(footer, 7)
  p.drawText(footer, { x: (PAGE_W - fw) / 2, y: 22, size: 7, font: doc.font, color: C_GRAY })
}

function addPage(doc: Doc) {
  drawFooter(doc) // finalize the page we're leaving
  doc.page = doc.pdf.addPage([PAGE_W, PAGE_H])
  doc.pageNo += 1
  drawTopBand(doc)
  doc.y = PAGE_H - 76
}

// Ensure `needed` vertical points remain before the footer; otherwise break.
function ensure(doc: Doc, needed: number) {
  if (doc.y - needed < BOTTOM) addPage(doc)
}

// ---- Section / table helpers ----

function sectionBand(doc: Doc, title: string) {
  ensure(doc, 32)
  doc.page.drawRectangle({ x: MARGIN, y: doc.y - 16, width: CONTENT_W, height: 20, color: C_NAVY })
  doc.page.drawText(title.toUpperCase(), { x: MARGIN + 8, y: doc.y - 11, size: 8, font: doc.bold, color: C_WHITE })
  doc.y -= 30
}

function plainHeader(doc: Doc, title: string) {
  ensure(doc, 26)
  doc.page.drawText(title, { x: MARGIN, y: doc.y - 12, size: 12, font: doc.bold, color: C_DARK })
  doc.y -= 26
}

// A two-column data row (label left, value right). Optional formula sub-note and
// emphasis/green styling. Returns nothing; advances the cursor.
function row(
  doc: Doc,
  label: string,
  value: string,
  opts: { tint?: boolean; strong?: boolean; accent?: boolean; note?: string } = {}
) {
  const h = opts.note ? 28 : 18
  ensure(doc, h)
  const top = doc.y
  if (opts.tint) doc.page.drawRectangle({ x: MARGIN, y: top - h + 6, width: CONTENT_W, height: h, color: C_LIGHT_BG })

  const labelFont = opts.strong ? doc.bold : doc.font
  doc.page.drawText(label, { x: MARGIN + 8, y: top - 6, size: 9, font: labelFont, color: opts.strong ? C_DARK : C_GRAY })
  if (opts.note) {
    doc.page.drawText(opts.note, { x: MARGIN + 8, y: top - 18, size: 7, font: doc.font, color: C_GRAY })
  }

  const valFont  = opts.strong ? doc.bold : doc.font
  const valColor = opts.accent ? C_GREEN : C_DARK
  const vw = valFont.widthOfTextAtSize(value, 9)
  doc.page.drawText(value, { x: PAGE_W - MARGIN - 8 - vw, y: top - 6, size: 9, font: valFont, color: valColor })

  doc.y -= h
}

// Naive word-wrap paragraph. Advances the cursor.
function paragraph(doc: Doc, text: string, size = 8, color = C_GRAY) {
  const maxW = CONTENT_W - 16
  const words = text.split(' ')
  let line = ''
  const flush = () => {
    if (!line) return
    ensure(doc, size * 1.5)
    doc.page.drawText(line, { x: MARGIN + 8, y: doc.y - size, size, font: doc.font, color })
    doc.y -= size * 1.5
    line = ''
  }
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (doc.font.widthOfTextAtSize(candidate, size) > maxW && line) {
      flush()
      line = word
    } else {
      line = candidate
    }
  }
  flush()
}

// Four KPI cards across the content width.
function kpiRow(doc: Doc, cards: Array<{ label: string; value: string; accent?: boolean }>) {
  const n = cards.length
  const gap = 8
  const w = (CONTENT_W - gap * (n - 1)) / n
  const h = 46
  ensure(doc, h + 6)
  const top = doc.y
  cards.forEach((c, i) => {
    const x = MARGIN + i * (w + gap)
    doc.page.drawRectangle({
      x, y: top - h, width: w, height: h,
      color: c.accent ? C_GREEN_BG : C_LIGHT_BG,
      borderColor: c.accent ? C_GREEN_BD : C_BORDER, borderWidth: 0.5,
    })
    doc.page.drawText(c.label, { x: x + 6, y: top - 14, size: 7, font: doc.font, color: c.accent ? C_GREEN : C_GRAY })
    doc.page.drawText(c.value, { x: x + 6, y: top - 32, size: 13, font: doc.bold, color: c.accent ? C_GREEN : C_DARK })
  })
  doc.y -= h + 8
}

// ---- Main export (signature unchanged) ----

export async function generateProposalPdf(params: ProposalPdfParams): Promise<Uint8Array> {
  const { companyName, contactName, contactEmail, analysis, calendlyLink, generatedAt, proposalSummary } = params

  const pdf  = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const dateStr = new Date(generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const doc: Doc = {
    pdf, font, bold,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - 76,
    pageNo: 1,
    dateStr,
  }
  drawTopBand(doc)

  // Single source of truth for every calculation figure.
  const bridge = deriveCostSavingsBridge(analysis)
  const presentation = getProposalPresentation()
  // Prefer the immutable stored summary; fall back to the deterministic template
  // so the PDF always carries one even for older flows.
  const summary = (proposalSummary && proposalSummary.trim())
    ? proposalSummary.trim()
    : buildProposalSummaryFallback(analysis, bridge)

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Proposal (the numbers)
  // ════════════════════════════════════════════════════════════════════════

  plainHeader(doc, 'Merchant Services Proposal')
  doc.page.drawText(
    `Prepared for ${companyName ?? 'your business'}` +
      (analysis.statement_period ? `  ·  Statement period: ${analysis.statement_period}` : ''),
    { x: MARGIN, y: doc.y - 2, size: 9, font, color: C_GRAY }
  )
  doc.y -= 14
  if (contactName)  { doc.page.drawText(contactName,  { x: MARGIN, y: doc.y - 2, size: 9, font, color: C_GRAY }); doc.y -= 12 }
  if (contactEmail) { doc.page.drawText(contactEmail, { x: MARGIN, y: doc.y - 2, size: 9, font, color: C_GRAY }); doc.y -= 12 }
  doc.y -= 6

  // Summary paragraph — the primer, immediately after the prepared-for line and
  // before the KPI row, so it is the first substantive read.
  paragraph(doc, summary, 9, C_DARK)
  doc.y -= 8

  if (bridge) {
    // KPI row
    kpiRow(doc, [
      { label: 'Monthly savings',     value: usd(bridge.monthlySavings, 0), accent: bridge.monthlySavings > 0 },
      { label: 'Annual savings',      value: usd(bridge.annualSavings, 0),  accent: bridge.monthlySavings > 0 },
      { label: 'Current eff. rate',   value: pct(bridge.currentRate) },
      { label: 'Proposed eff. rate',  value: pct(bridge.proposedRate), accent: true },
    ])

    // Savings View
    sectionBand(doc, 'Savings View')
    row(doc, 'Monthly savings',            usd(bridge.monthlySavings),  { tint: true, strong: true, accent: bridge.monthlySavings > 0 })
    row(doc, 'Annual savings',             usd(bridge.annualSavings),   { strong: true, accent: bridge.monthlySavings > 0 })
    row(doc, '3-year savings',             usd(bridge.threeYearSavings),{ tint: true, accent: bridge.monthlySavings > 0 })
    row(doc, 'Savings as % of current',    pct(bridge.savingsPctOfCurrent))
    doc.y -= 8
  } else {
    // Honest degradation — no fabricated savings.
    doc.page.drawRectangle({ x: MARGIN, y: doc.y - 44, width: CONTENT_W, height: 50, color: C_GREEN_BG, borderColor: C_GREEN_BD, borderWidth: 0.5 })
    doc.page.drawText('Savings Estimate: Pending Statement Review', { x: MARGIN + 8, y: doc.y - 14, size: 10, font: bold, color: C_GREEN })
    doc.y -= 24
    paragraph(
      doc,
      'An accurate savings estimate requires reviewing your full statement. Our team will calculate ' +
        'your current effective rate, identify fee categories, and provide a specific dollar savings ' +
        'projection during your review call.',
    )
    doc.y -= 12
  }

  // Statement Analysis
  sectionBand(doc, 'Statement Analysis')
  row(doc, 'Merchant',               companyName ?? '-', { tint: true })
  row(doc, 'Processor',              analysis.processor_name ?? '-')
  row(doc, 'Statement period',       analysis.statement_period ?? '-', { tint: true })
  row(doc, 'Monthly volume',         usd(analysis.monthly_volume_estimate, 0))
  row(doc, 'Transactions / month',   analysis.transaction_count_estimate?.toLocaleString() ?? '-', { tint: true })
  row(doc, 'Average ticket',         usd(bridge?.avgTicket ?? null))
  row(doc, 'Total monthly fees',     usd(analysis.total_fees_estimate), { tint: true })
  row(doc, 'Current effective rate', pct(analysis.effective_rate_estimate), { strong: true })
  doc.y -= 8

  // Recommended Pricing Structure
  sectionBand(doc, 'Recommended Pricing Structure')
  row(doc, 'Pricing model',          'Interchange-Plus', { tint: true, strong: true })
  row(doc, 'Processing markup',      `${analysis.proposed_basis_points} bps (${(analysis.proposed_basis_points / 100).toFixed(2)}%)`)
  row(doc, 'Per-transaction fee',    `$${(analysis.proposed_per_txn_cents / 100).toFixed(2)}`, { tint: true })
  row(doc, 'Monthly account fee',    usd(analysis.proposed_monthly_fee))
  if (bridge) row(doc, 'Proposed monthly cost', usd(bridge.proposedCost), { tint: true, strong: true, accent: true })
  doc.y -= 8

  // About 321 Swipe + contact block — supporting context near the bottom of page 1.
  sectionBand(doc, 'About 321 Swipe')
  paragraph(doc, presentation.aboutUs, 8, C_GRAY)
  doc.y -= 8

  // Contact block (your 321 Swipe contact)
  sectionBand(doc, 'Your 321 Swipe Contact')
  row(doc, presentation.senderName, presentation.senderEmail, { tint: true, strong: true })
  row(doc, presentation.senderTitle, presentation.companyPhone)
  row(doc, 'Web', presentation.companyWebsite, { tint: true })

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 2 — How we calculated this (intelligence) — calculated only
  // ════════════════════════════════════════════════════════════════════════

  if (bridge) {
    addPage(doc)
    plainHeader(doc, 'How we calculated this')
    paragraph(
      doc,
      'Every figure below traces to your statement. Here is the line-by-line bridge from what you ' +
        'pay today to your cost under 321 Swipe.',
    )
    doc.y -= 6

    // Cost Savings Bridge — worked decomposition
    sectionBand(doc, 'Cost Savings Bridge')
    row(doc, 'Current amount deducted', usd(bridge.currentMonthlyCost), {
      tint: true, strong: true,
      note: `${pct(bridge.currentRate)} effective on ${usd(bridge.monthlyVolume, 0)}`,
    })
    row(doc, 'Interchange (pass-through, at cost)', usd(bridge.interchange), {
      note: `~ ${pct(bridge.assumedInterchangeRate)} of ${usd(bridge.monthlyVolume, 0)} volume`,
    })
    row(doc, '321 Swipe markup', usd(bridge.markup), {
      tint: true, note: `${bridge.markupBps} bps × ${usd(bridge.monthlyVolume, 0)}`,
    })
    row(doc, 'Per-transaction fee', usd(bridge.perTxn), {
      note: `${usd(bridge.perTxnDollars)} × ${bridge.transactionCount.toLocaleString()} txns`,
    })
    row(doc, 'Monthly account fee', usd(bridge.monthlyFee), { tint: true, note: 'flat' })
    row(doc, 'Proposed monthly cost', usd(bridge.proposedCost), {
      strong: true, note: 'interchange + markup + per-txn + monthly fee',
    })
    row(doc, 'Your monthly savings', usd(bridge.monthlySavings), {
      tint: true, strong: true, accent: true, note: `${usd(bridge.currentMonthlyCost)} - ${usd(bridge.proposedCost)}`,
    })
    doc.y -= 8

    // Effective rate — current vs proposed
    sectionBand(doc, 'Effective Rate: Current vs. Proposed')
    row(doc, 'Current effective rate',  pct(bridge.currentRate), { tint: true })
    row(doc, 'Proposed effective rate', pct(bridge.proposedRate), { strong: true, accent: true })
    doc.y -= 2
    paragraph(
      doc,
      `A ${pct(bridge.savingsPctOfCurrent)} reduction in what you pay to process the same ` +
        `${usd(bridge.monthlyVolume, 0)} in monthly volume.`,
    )
    doc.y -= 8

    // Logic followed — same five steps as the web page
    sectionBand(doc, 'Logic Followed')
    const steps = [
      `Anchored to your actual statement${analysis.statement_period ? ` (${analysis.statement_period})` : ''}: volume, fees, and transaction count are taken as entered.`,
      'Computed your current effective rate as total fees ÷ monthly volume.',
      `Repriced the same volume under interchange-plus: interchange at cost, plus a transparent ${bridge.markupBps} bps markup, ${usd(bridge.perTxnDollars)}/transaction, and a ${usd(bridge.monthlyFee)} monthly fee.`,
      "Held interchange constant (it's the wholesale cost every processor pays), so the savings come entirely from a lower, visible markup.",
      "Reported savings conservatively, clamped to zero if repricing didn't beat your current cost.",
    ]
    steps.forEach((s, i) => paragraph(doc, `${i + 1}.  ${s}`, 8, C_DARK))
    doc.y -= 8
  }

  // ════════════════════════════════════════════════════════════════════════
  // Assumptions & disclaimer + Next Steps (continuation / new page)
  // ════════════════════════════════════════════════════════════════════════

  sectionBand(doc, 'Assumptions & Disclaimer')
  for (const a of analysis.assumptions) paragraph(doc, `• ${a}`, 8, C_GRAY)
  doc.y -= 2
  paragraph(doc, 'This document is for informational purposes only and is an estimate, not a binding quote. Rates and fees are subject to underwriting.', 7, C_GRAY)
  paragraph(doc, 'Past savings achieved by other merchants are not a guarantee of future results.', 7, C_GRAY)
  doc.y -= 8

  sectionBand(doc, 'Next Steps')
  const nextSteps = [
    'Review this proposal: print or save a copy for your records.',
    `Schedule your free review call: ${calendlyLink}`,
    "We'll walk through your full statement, confirm your savings, and finalize pricing.",
    "If you're ready, we handle the switch, usually 1-2 business days.",
  ]
  nextSteps.forEach((s, i) => paragraph(doc, `${i + 1}.  ${s}`, 9, C_DARK))

  // Finalize the last page's footer.
  drawFooter(doc)

  return pdf.save()
}
