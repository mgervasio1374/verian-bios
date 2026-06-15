// mcm-v2 — Proposal link redesign: split intelligence view + professional
// document + dual print. Behavioral tests for the pure cost→savings bridge
// (deriveCostSavingsBridge) plus a source-read test asserting the split layout,
// dual print buttons, and the intelligence-panel copy guard.
// TC-IV-01..12

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deriveCostSavingsBridge } from '@/lib/statement/cost-bridge'
import { buildCalculatedAnalysis, buildPlaceholderAnalysis, type StatementAnalysis } from '@/lib/statement/analysis'

// A "calculated" snapshot with a worked example: $100k volume, $3,200 fees,
// 2,000 txns, 1.8% interchange → proposed 2285, monthly savings 915.
function calculated(): StatementAnalysis {
  return buildCalculatedAnalysis({
    monthlyVolume:      100_000,
    currentMonthlyFees: 3_200,
    transactionCount:   2_000,
    companyName:        'Harbor Diner',
    statementPeriod:    'March 2026',
  })
}

// ---------------------------------------------------------------------------
// Pure bridge derivation
// ---------------------------------------------------------------------------

describe('TC-IV-01: deriveCostSavingsBridge — component reconciliation', () => {
  it('interchange + markup + perTxn + monthlyFee === proposedCost (within a cent)', () => {
    const b = deriveCostSavingsBridge(calculated())!
    expect(b).not.toBeNull()
    const sum = b.interchange + b.markup + b.perTxn + b.monthlyFee
    expect(sum).toBeCloseTo(b.proposedCost, 2)
  })

  it('decomposes into the single-sourced components', () => {
    const b = deriveCostSavingsBridge(calculated())!
    expect(b.markup).toBeCloseTo(250, 6)     // 100k × 0.0025
    expect(b.perTxn).toBeCloseTo(200, 6)     // 2000 × 0.10
    expect(b.monthlyFee).toBe(35)
    expect(b.interchange).toBeCloseTo(1_800, 6) // 2285 − 250 − 200 − 35
    expect(b.proposedCost).toBeCloseTo(2_285, 6)
  })
})

describe('TC-IV-02: deriveCostSavingsBridge — savings math', () => {
  it('monthlySavings = max(0, current − proposed); annual ×12; 3-year ×36', () => {
    const b = deriveCostSavingsBridge(calculated())!
    expect(b.monthlySavings).toBeCloseTo(915, 6)   // 3200 − 2285
    expect(b.annualSavings).toBeCloseTo(915 * 12, 6)
    expect(b.threeYearSavings).toBeCloseTo(915 * 36, 6)
  })

  it('rates and average ticket', () => {
    const b = deriveCostSavingsBridge(calculated())!
    expect(b.currentRate).toBeCloseTo(0.032, 6)            // 3200/100k
    expect(b.proposedRate).toBeCloseTo(2_285 / 100_000, 6)
    expect(b.savingsPctOfCurrent).toBeCloseTo(915 / 3_200, 6)
    expect(b.avgTicket).toBeCloseTo(50, 6)                 // 100k/2000
  })
})

describe('TC-IV-03: deriveCostSavingsBridge — never negative savings', () => {
  it('clamps to zero when repricing does not beat current cost', () => {
    const a = buildCalculatedAnalysis({
      monthlyVolume:      100_000,
      currentMonthlyFees: 1_000, // below proposed (~2285)
      transactionCount:   2_000,
    })
    const b = deriveCostSavingsBridge(a)!
    expect(b.monthlySavings).toBe(0)
    expect(b.annualSavings).toBe(0)
    expect(b.threeYearSavings).toBe(0)
    expect(b.savingsPctOfCurrent).toBe(0)
  })
})

describe('TC-IV-04: deriveCostSavingsBridge — honest degradation → null', () => {
  it('placeholder confidence → null (no fabricated bridge)', () => {
    const p = buildPlaceholderAnalysis({ metadata: {}, source: 'web' }, 'statement.pdf', 'Acme')
    expect(deriveCostSavingsBridge(p)).toBeNull()
  })

  it('null analysis → null', () => {
    expect(deriveCostSavingsBridge(null)).toBeNull()
    expect(deriveCostSavingsBridge(undefined)).toBeNull()
  })

  it('calculated but estimated_savings_monthly null → null', () => {
    const a = { ...calculated(), estimated_savings_monthly: null }
    expect(deriveCostSavingsBridge(a)).toBeNull()
  })

  it('zero / missing volume → null (no divide)', () => {
    const a = { ...calculated(), monthly_volume_estimate: 0 }
    expect(deriveCostSavingsBridge(a)).toBeNull()
    const b = { ...calculated(), monthly_volume_estimate: null }
    expect(deriveCostSavingsBridge(b)).toBeNull()
  })
})

describe('TC-IV-05: deriveCostSavingsBridge — proposed_monthly_cost fallback', () => {
  it('recomputes from the default-interchange model when the snapshot lacks proposed_monthly_cost', () => {
    const a = calculated()
    // Strip the stored proposed cost → forces the recompute path.
    const stripped: StatementAnalysis = {
      ...a,
      extracted_fields: { ...a.extracted_fields, proposed_monthly_cost: undefined },
    }
    const b = deriveCostSavingsBridge(stripped)!
    // recompute: 100k×0.018 + 250 + 200 + 35 = 2285 (matches the stored value)
    expect(b.proposedCost).toBeCloseTo(2_285, 6)
    // and it still reconciles
    expect(b.interchange + b.markup + b.perTxn + b.monthlyFee).toBeCloseTo(b.proposedCost, 2)
  })
})

// ---------------------------------------------------------------------------
// Source-read: split layout, dual print, copy guard
// ---------------------------------------------------------------------------

describe('TC-IV-06: hosted proposal page wiring', () => {
  const root = join(__dirname, '..')
  const page = readFileSync(join(root, 'app', 'p', '[token]', 'page.tsx'), 'utf8')
  const client = readFileSync(join(root, 'app', 'p', '[token]', 'ProposalClient.tsx'), 'utf8')

  it('renders a responsive 2-column split grid', () => {
    expect(page).toContain('lg:grid-cols-2')
    expect(page).toMatch(/data-print="proposal"/)
    expect(page).toMatch(/data-print="intelligence"/)
    expect(page).toMatch(/data-print="summary"/)
  })

  it('derives the bridge and renders the intelligence panel from it', () => {
    expect(page).toContain('deriveCostSavingsBridge')
  })

  it('exposes two print buttons (summary + full)', () => {
    expect(client).toContain('Print proposal')
    expect(client).toContain('Print full document')
    expect(client).toContain('print-summary')
    expect(client).toContain('print-full')
  })

  it('guards the intelligence panel with a casual-copy deterrent (select-none)', () => {
    expect(client).toContain('select-none')
    expect(client).toContain('onContextMenu')
    expect(client).toContain('IntelligenceGuard')
  })
})
