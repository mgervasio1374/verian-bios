import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib'
import type { StatementAnalysis } from '@/lib/statement/analysis'

// ---- Brand colours (matches 321 Swipe / Verian palette) ----
const C_BLUE      = rgb(37 / 255,  99 / 255, 235 / 255)  // #2563eb
const C_BLUE_DARK = rgb(29 / 255,  78 / 255, 216 / 255)  // #1d4ed8
const C_DARK      = rgb(17 / 255,  24 / 255,  39 / 255)  // #111827
const C_GRAY      = rgb(107 / 255, 114 / 255, 128 / 255) // #6b7280
const C_LIGHT_BG  = rgb(249 / 255, 250 / 255, 251 / 255) // #f9fafb
const C_BORDER    = rgb(229 / 255, 231 / 255, 235 / 255) // #e5e7eb
const C_WHITE     = rgb(1, 1, 1)
const C_GREEN     = rgb(5 / 255, 150 / 255, 105 / 255)   // #059669

// US Letter: 612 × 792 pt
const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 48

export interface ProposalPdfParams {
  companyName:  string | null
  contactName:  string | null
  contactEmail: string | null
  analysis:     StatementAnalysis
  calendlyLink: string
  generatedAt:  string
}

// ---- Low-level draw helpers ----

function drawRect(
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  fillColor: ReturnType<typeof rgb>,
  borderColor?: ReturnType<typeof rgb>
) {
  page.drawRectangle({ x, y, width: w, height: h, color: fillColor })
  if (borderColor) {
    page.drawRectangle({ x, y, width: w, height: h, borderColor, borderWidth: 0.5, color: undefined })
  }
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: C_BORDER })
}

function textLine(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: {
    font:     Awaited<ReturnType<PDFDocument['embedFont']>>
    size:     number
    color?:   ReturnType<typeof rgb>
    maxWidth?: number
  }
): number {
  const color = opts.color ?? C_DARK
  if (opts.maxWidth) {
    // Naive word-wrap — split on spaces and push lines
    const words = text.split(' ')
    let line = ''
    let curY = y
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      const w = opts.font.widthOfTextAtSize(candidate, opts.size)
      if (w > opts.maxWidth && line) {
        page.drawText(line, { x, y: curY, size: opts.size, font: opts.font, color })
        curY -= opts.size * 1.35
        line = word
      } else {
        line = candidate
      }
    }
    if (line) {
      page.drawText(line, { x, y: curY, size: opts.size, font: opts.font, color })
      curY -= opts.size * 1.35
    }
    return y - curY
  }
  page.drawText(text, { x, y, size: opts.size, font: opts.font, color })
  return opts.size * 1.35
}

// ---- Section header ----

function sectionHeader(
  page: PDFPage,
  label: string,
  y: number,
  boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>
): number {
  drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 20, C_BLUE)
  page.drawText(label.toUpperCase(), {
    x: MARGIN + 8, y: y + 3,
    size: 8, font: boldFont, color: C_WHITE,
  })
  return 28 // space consumed
}

// ---- Data row ----

function dataRow(
  page: PDFPage,
  label: string,
  value: string,
  y: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
  tinted = false
): number {
  if (tinted) drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 16, C_LIGHT_BG)
  page.drawText(label, { x: MARGIN + 8, y, size: 9, font, color: C_GRAY })
  page.drawText(value, { x: MARGIN + 200, y, size: 9, font: boldFont, color: C_DARK })
  return 18
}

// ---- Main export ----

export async function generateProposalPdf(params: ProposalPdfParams): Promise<Uint8Array> {
  const { companyName, contactName, contactEmail, analysis, calendlyLink, generatedAt } = params

  const pdfDoc   = await PDFDocument.create()
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const page     = pdfDoc.addPage([PAGE_W, PAGE_H])

  let y = PAGE_H  // current Y (top → down, so we subtract)

  // ── Header bar ────────────────────────────────────────────────────────────
  drawRect(page, 0, PAGE_H - 72, PAGE_W, 72, C_BLUE_DARK)
  page.drawText('321 SWIPE', {
    x: MARGIN, y: PAGE_H - 30,
    size: 20, font: boldFont, color: C_WHITE,
  })
  page.drawText('Merchant Processing Solutions', {
    x: MARGIN, y: PAGE_H - 46,
    size: 10, font, color: rgb(191 / 255, 219 / 255, 254 / 255),
  })
  // Date top-right
  const dateStr = new Date(generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const dateW = font.widthOfTextAtSize(dateStr, 9)
  page.drawText(dateStr, {
    x: PAGE_W - MARGIN - dateW, y: PAGE_H - 46,
    size: 9, font, color: rgb(191 / 255, 219 / 255, 254 / 255),
  })

  y = PAGE_H - 88

  // ── Document title ────────────────────────────────────────────────────────
  page.drawText('MERCHANT PROCESSING ANALYSIS & PROPOSAL', {
    x: MARGIN, y,
    size: 13, font: boldFont, color: C_DARK,
  })
  y -= 14
  page.drawText('Statement Review Package', {
    x: MARGIN, y,
    size: 10, font, color: C_GRAY,
  })
  y -= 24

  drawLine(page, MARGIN, y, PAGE_W - MARGIN, y)
  y -= 16

  // ── Prepared For ─────────────────────────────────────────────────────────
  y -= sectionHeader(page, 'Prepared For', y, boldFont)
  y -= 4

  page.drawText(companyName ?? 'Your Business', {
    x: MARGIN + 8, y,
    size: 11, font: boldFont, color: C_DARK,
  })
  y -= 14
  if (contactName) {
    page.drawText(contactName, { x: MARGIN + 8, y, size: 9, font, color: C_GRAY })
    y -= 13
  }
  if (contactEmail) {
    page.drawText(contactEmail, { x: MARGIN + 8, y, size: 9, font, color: C_GRAY })
    y -= 13
  }
  y -= 12

  // ── Statement Analysis ────────────────────────────────────────────────────
  y -= sectionHeader(page, 'Statement Analysis Summary', y, boldFont)
  y -= 4

  // Confidence badge
  const confidenceLabel =
    analysis.confidence === 'placeholder' ? 'Preliminary — Pending Full Review' : 'Completed'
  const badgeColor = analysis.confidence === 'placeholder' ? rgb(217/255, 119/255, 6/255) : C_GREEN
  drawRect(page, MARGIN + 8, y - 2, 210, 16, rgb(255/255, 251/255, 235/255))
  page.drawRectangle({
    x: MARGIN + 8, y: y - 2, width: 210, height: 16,
    borderColor: rgb(253/255, 230/255, 138/255), borderWidth: 0.5, color: undefined,
  })
  page.drawText(`Confidence: ${confidenceLabel}`, {
    x: MARGIN + 12, y: y + 1,
    size: 8, font: boldFont, color: badgeColor,
  })
  y -= 22

  const rows: [string, string][] = [
    ['Current Processor', analysis.processor_name ?? 'Not yet identified'],
    ['Statement Period',  analysis.statement_period ?? 'Pending review'],
    ['Monthly Volume',    analysis.monthly_volume_estimate != null
      ? `$${analysis.monthly_volume_estimate.toLocaleString()}`
      : 'Pending review'],
    ['Total Fees',        analysis.total_fees_estimate != null
      ? `$${analysis.total_fees_estimate.toFixed(2)}`
      : 'Pending review'],
    ['Effective Rate',    analysis.effective_rate_estimate != null
      ? `${(analysis.effective_rate_estimate * 100).toFixed(3)}%`
      : 'Pending review'],
  ]

  for (let i = 0; i < rows.length; i++) {
    y -= dataRow(page, rows[i][0], rows[i][1], y, font, boldFont, i % 2 === 0)
  }
  y -= 12

  // ── Proposed 321 Swipe Pricing ────────────────────────────────────────────
  y -= sectionHeader(page, 'Proposed 321 Swipe Pricing', y, boldFont)
  y -= 4

  const pricingRows: [string, string][] = [
    ['Pricing Model',      'Interchange-Plus (fully transparent)'],
    ['Processing Markup',  `${analysis.proposed_basis_points} bps (${(analysis.proposed_basis_points / 100).toFixed(2)}%)`],
    ['Per-Transaction Fee', `$${(analysis.proposed_per_txn_cents / 100).toFixed(2)}`],
    ['Monthly Account Fee', `$${analysis.proposed_monthly_fee.toFixed(2)}`],
  ]

  for (let i = 0; i < pricingRows.length; i++) {
    y -= dataRow(page, pricingRows[i][0], pricingRows[i][1], y, font, boldFont, i % 2 === 0)
  }
  y -= 8

  // Why interchange-plus box
  drawRect(page, MARGIN, y - 44, PAGE_W - MARGIN * 2, 52, C_LIGHT_BG, C_BORDER)
  page.drawText('Why Interchange-Plus?', {
    x: MARGIN + 8, y: y - 6,
    size: 9, font: boldFont, color: C_DARK,
  })
  const why =
    'You pay exactly what Visa/Mastercard charge (interchange) plus our small fixed markup. ' +
    'Unlike flat-rate pricing, every dollar of interchange savings passes directly to you. ' +
    'Full transparency — no bundled or hidden fees.'
  textLine(page, why, MARGIN + 8, y - 18, { font, size: 8, color: C_GRAY, maxWidth: PAGE_W - MARGIN * 2 - 16 })
  y -= 60

  // ── Savings Potential ──────────────────────────────────────────────────────
  y -= sectionHeader(page, 'Savings Potential', y, boldFont)
  y -= 4

  // A "calculated" analysis carries a real, engine-computed savings figure.
  // A "placeholder" analysis (no operator-entered figures) falls back to the
  // pending-review language.
  const hasCalculatedSavings =
    analysis.confidence === 'calculated' && analysis.estimated_savings_monthly != null

  if (hasCalculatedSavings && (analysis.estimated_savings_monthly ?? 0) > 0) {
    // Real savings — show the headline numbers + current vs proposed rate.
    drawRect(page, MARGIN, y - 60, PAGE_W - MARGIN * 2, 68, rgb(240/255, 253/255, 244/255), rgb(167/255, 243/255, 208/255))

    const monthly = analysis.estimated_savings_monthly ?? 0
    const annual  = analysis.estimated_savings_annual ?? monthly * 12
    page.drawText(`Estimated Monthly Savings: $${monthly.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, {
      x: MARGIN + 8, y: y - 8,
      size: 11, font: boldFont, color: C_GREEN,
    })
    page.drawText(`Estimated Annual Savings: $${annual.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, {
      x: MARGIN + 8, y: y - 24,
      size: 9, font: boldFont, color: C_DARK,
    })

    const currentRate = analysis.effective_rate_estimate
    const volume      = analysis.monthly_volume_estimate
    const proposedCost = analysis.extracted_fields?.proposed_monthly_cost
    const proposedRate =
      typeof proposedCost === 'number' && typeof volume === 'number' && volume > 0
        ? proposedCost / volume
        : null
    const rateLine =
      (currentRate != null ? `Current effective rate: ${(currentRate * 100).toFixed(2)}%` : 'Current effective rate: —') +
      (proposedRate != null ? `   |   Proposed effective rate: ${(proposedRate * 100).toFixed(2)}%` : '')
    page.drawText(rateLine, {
      x: MARGIN + 8, y: y - 40,
      size: 8, font, color: C_GRAY,
    })
    page.drawText('Based on operator-entered figures — an estimate, not a binding quote.', {
      x: MARGIN + 8, y: y - 52,
      size: 7, font, color: C_GRAY,
    })
    y -= 76
  } else if (hasCalculatedSavings) {
    // Calculated, but no savings at the figures provided — stay honest.
    drawRect(page, MARGIN, y - 32, PAGE_W - MARGIN * 2, 40, C_LIGHT_BG, C_BORDER)
    page.drawText('No savings identified at the figures provided', {
      x: MARGIN + 8, y: y - 6,
      size: 9, font: boldFont, color: C_DARK,
    })
    const noSavingsText =
      'At the statement figures provided, 321 Swipe\'s proposed pricing does not beat your current cost. ' +
      'A full statement review can surface fee categories and card-mix detail that may change this.'
    textLine(page, noSavingsText, MARGIN + 8, y - 18, { font, size: 8, color: C_GRAY, maxWidth: PAGE_W - MARGIN * 2 - 16 })
    y -= 48
  } else {
    drawRect(page, MARGIN, y - 44, PAGE_W - MARGIN * 2, 52, rgb(240/255, 253/255, 244/255), rgb(167/255, 243/255, 208/255))
    page.drawText('Savings Estimate: Pending Statement Review', {
      x: MARGIN + 8, y: y - 6,
      size: 9, font: boldFont, color: C_GREEN,
    })
    const savingsText =
      'An accurate savings estimate requires reviewing your full statement. ' +
      'Our team will calculate your current effective rate, identify fee categories, ' +
      'and provide a specific dollar savings projection during your review call.'
    textLine(page, savingsText, MARGIN + 8, y - 18, { font, size: 8, color: C_GRAY, maxWidth: PAGE_W - MARGIN * 2 - 16 })
    y -= 60
  }

  // ── Next Steps ────────────────────────────────────────────────────────────
  y -= sectionHeader(page, 'Next Steps', y, boldFont)
  y -= 4

  const steps = [
    '1.  Review this proposal with your team.',
    '2.  Schedule your free 15-minute review call:',
    `     ${calendlyLink}`,
    '3.  We\'ll walk through your statement, confirm savings, and finalize pricing.',
    '4.  If you\'re ready to proceed, we handle the switch — usually 1–2 business days.',
  ]
  for (const step of steps) {
    page.drawText(step, { x: MARGIN + 8, y, size: 9, font, color: C_DARK })
    y -= 13
  }
  y -= 8

  // ── Assumptions & Disclaimer ───────────────────────────────────────────────
  y -= sectionHeader(page, 'Assumptions & Disclaimer', y, boldFont)
  y -= 4

  for (const assumption of analysis.assumptions) {
    page.drawText(`• ${assumption}`, { x: MARGIN + 8, y, size: 8, font, color: C_GRAY })
    y -= 12
  }
  y -= 4
  page.drawText(
    'This document is for informational purposes only. Rates and fees are subject to underwriting.',
    { x: MARGIN + 8, y, size: 7, font, color: C_GRAY }
  )
  y -= 12
  page.drawText(
    'Past savings achieved by other merchants are not a guarantee of future results.',
    { x: MARGIN + 8, y, size: 7, font, color: C_GRAY }
  )

  // ── Footer ────────────────────────────────────────────────────────────────
  drawLine(page, MARGIN, 36, PAGE_W - MARGIN, 36)
  page.drawText('321 Swipe · Merchant Processing Solutions · Confidential', {
    x: MARGIN, y: 22,
    size: 7, font, color: C_GRAY,
  })
  const pageNumW = font.widthOfTextAtSize('Page 1', 7)
  page.drawText('Page 1', {
    x: PAGE_W - MARGIN - pageNumW, y: 22,
    size: 7, font, color: C_GRAY,
  })

  return pdfDoc.save()
}
