import { getPublicProposalByToken } from '@/modules/proposals/services/public-proposal.service'
import { PrintButtons, ProposalContactForm, IntelligenceGuard } from './ProposalClient'
import { deriveCostSavingsBridge } from '@/lib/statement/cost-bridge'
import { ShieldCheck, TrendingDown, AlertTriangle, FlaskConical, ListChecks } from 'lucide-react'

interface PageProps {
  params:       Promise<{ token: string }>
  searchParams: Promise<{ preview?: string }>
}

function usd(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}

function pct(rate: number | null | undefined, dp = 2): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(dp)}%`
}

export default async function HostedProposalPage({ params, searchParams }: PageProps) {
  const { token } = await params
  const preview = (await searchParams).preview === '1'
  const proposal = await getPublicProposalByToken(token, { preview })

  if (!proposal) return <NotAvailable />

  const a = proposal.analysis
  const bridge = deriveCostSavingsBridge(a)

  const monthly = proposal.estimatedSavings ?? a?.estimated_savings_monthly ?? 0
  const annual  = proposal.annualSavings ?? a?.estimated_savings_annual ?? 0
  const hasSavings = monthly > 0

  const volume = a?.monthly_volume_estimate ?? null
  const currentRate = a?.effective_rate_estimate ?? null
  const proposedCost = bridge?.proposedCost
    ?? (typeof a?.extracted_fields?.proposed_monthly_cost === 'number'
      ? (a.extracted_fields.proposed_monthly_cost as number)
      : null)
  const proposedRate = bridge?.proposedRate
    ?? (proposedCost != null && volume != null && volume > 0 ? proposedCost / volume : null)
  const avgTicket = bridge?.avgTicket ?? null

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Print stylesheet — two modes, single-column on paper.
          summary = the proposal numbers page only; full = proposal + backing
          intelligence pages. The buttons toggle a body class. */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          /* collapse the split into a single column */
          .proposal-grid { display: block !important; }
          .print-card { box-shadow: none !important; border-color: #e5e7eb !important; }
          .print-card, table, .keep-together { break-inside: avoid; }
          /* proposal first, intelligence starts on a fresh page (full mode) */
          body.print-full [data-print="proposal"] { break-after: page; }
          /* summary mode: only the proposal "numbers" block prints */
          body.print-summary [data-print="intelligence"] { display: none !important; }
          body.print-summary [data-print="proposal"] > *:not([data-print="summary"]) { display: none !important; }
        }
      `}</style>

      {/* Operator preview banner — opening with ?preview=1 skips open-tracking,
          so the operator can review what the merchant will see without recording
          a view. Screen-only. */}
      {preview && (
        <div className="no-print bg-amber-100 text-amber-900 text-sm text-center px-4 py-2 border-b border-amber-300">
          Preview — opening this page did not record a view.
        </div>
      )}

      {/* Brand header */}
      <header className="bg-[#0f1e3d] text-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold tracking-tight">321 SWIPE</p>
            <p className="text-sm text-blue-100">Payment Intelligence Proposal</p>
          </div>
          <PrintButtons />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="proposal-grid grid gap-6 lg:grid-cols-2 items-start">

          {/* ============================================================== */}
          {/* LEFT — Professional proposal document                          */}
          {/* ============================================================== */}
          <div data-print="proposal" className="space-y-6">

            {/* "Page 1 / the numbers" — printed in summary mode */}
            <div data-print="summary" className="space-y-6">
              <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Savings Proposal
                </p>
                <h1 className="text-2xl font-bold mt-1">{proposal.companyName ?? 'Your Business'}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Prepared for {proposal.companyName ?? 'your business'}
                  {a?.statement_period ? ` · Statement period: ${a.statement_period}` : ''}
                </p>

                {/* KPI card row */}
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi
                    label="Monthly savings"
                    value={usd(monthly, 0)}
                    accent={hasSavings}
                    icon={<TrendingDown className="h-3.5 w-3.5" />}
                  />
                  <Kpi label="Annual savings" value={usd(annual, 0)} accent={hasSavings} />
                  <Kpi label="Current eff. rate" value={pct(currentRate)} />
                  <Kpi label="Proposed eff. rate" value={pct(proposedRate)} accent />
                </div>

                {!hasSavings && (
                  <div className="mt-4 rounded-lg bg-gray-50 border p-4 text-sm text-gray-700">
                    {a?.confidence === 'calculated' ? (
                      <>
                        At the figures provided, your current pricing is already competitive. A full
                        statement review can surface fee categories and card-mix detail that may change this.
                      </>
                    ) : (
                      <>
                        Contact us for a full statement review — we&apos;ll calculate your current
                        effective rate and a specific savings figure from your actual statement.
                      </>
                    )}
                  </div>
                )}
              </section>

              {/* Savings view table */}
              {bridge && (
                <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
                  <SectionHeader>Savings View</SectionHeader>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      <Row label="Monthly savings" value={usd(bridge.monthlySavings)} strong accent={hasSavings} />
                      <Row label="Annual savings" value={usd(bridge.annualSavings)} strong accent={hasSavings} />
                      <Row label="3-year savings" value={usd(bridge.threeYearSavings)} accent={hasSavings} />
                      <Row label="Savings as % of current cost" value={pct(bridge.savingsPctOfCurrent)} />
                    </tbody>
                  </table>
                </section>
              )}
            </div>

            {/* Statement Analysis table */}
            {a && (
              <section className="bg-white rounded-xl border shadow-sm overflow-hidden print-card">
                <SectionBand>Statement Analysis</SectionBand>
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    <Row label="Merchant" value={proposal.companyName ?? '—'} />
                    <Row label="Processor" value={a.processor_name ?? '—'} />
                    <Row label="Statement period" value={a.statement_period ?? '—'} />
                    <Row label="Monthly volume" value={usd(volume, 0)} />
                    <Row label="Transactions / month" value={a.transaction_count_estimate?.toLocaleString() ?? '—'} />
                    <Row label="Average ticket" value={usd(avgTicket)} />
                    <Row label="Total monthly fees" value={usd(a.total_fees_estimate)} />
                    <Row label="Current effective rate" value={pct(currentRate)} strong />
                  </tbody>
                </table>
              </section>
            )}

            {/* Recommended pricing structure */}
            {a && (
              <section className="bg-white rounded-xl border shadow-sm overflow-hidden print-card">
                <SectionBand>Recommended Pricing Structure</SectionBand>
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    <Row label="Pricing model" value="Interchange-Plus" strong />
                    <Row label="Processing markup" value={`${a.proposed_basis_points} bps (${(a.proposed_basis_points / 100).toFixed(2)}%)`} />
                    <Row label="Per-transaction fee" value={`$${(a.proposed_per_txn_cents / 100).toFixed(2)}`} />
                    <Row label="Monthly account fee" value={usd(a.proposed_monthly_fee)} />
                    {proposedCost != null && <Row label="Proposed monthly cost" value={usd(proposedCost)} strong accent />}
                  </tbody>
                </table>
              </section>
            )}

            {/* What happens next */}
            <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
              <SectionHeader>What happens next</SectionHeader>
              <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                <li>Review this proposal — print or save a copy for your records.</li>
                <li>Have a question? Send us a message and our team will follow up.</li>
                <li>We&apos;ll walk through your full statement, confirm your savings, and finalize pricing.</li>
                <li>If you&apos;re ready, we handle the switch — usually 1–2 business days.</li>
              </ol>
            </section>

            {/* Assumptions / disclaimer */}
            {a && a.assumptions.length > 0 && (
              <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
                <h2 className="text-sm font-semibold mb-2">Assumptions &amp; disclaimer</h2>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {a.assumptions.map((s, i) => (
                    <li key={i} className="flex gap-1.5"><span>•</span><span>{s}</span></li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground mt-3">
                  This document is for informational purposes only and is an estimate, not a binding
                  quote. Rates and fees are subject to underwriting. Past savings achieved by other
                  merchants are not a guarantee of future results.
                </p>
              </section>
            )}
          </div>

          {/* ============================================================== */}
          {/* RIGHT — "How we calculated this" intelligence panel            */}
          {/* ============================================================== */}
          <div data-print="intelligence">
            <IntelligenceGuard>
              {bridge ? (
                <div className="space-y-6">
                  {/* Cost savings bridge — the worked decomposition */}
                  <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
                    <div className="flex items-center justify-between mb-1">
                      <SectionHeader className="mb-0">How we calculated this</SectionHeader>
                      <ConfidenceBadge />
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Every figure below traces to your statement. Here is the line-by-line bridge
                      from what you pay today to your cost under 321 Swipe.
                    </p>

                    <table className="w-full text-sm">
                      <tbody className="divide-y">
                        <BridgeRow
                          label="Current amount deducted"
                          formula={`${pct(bridge.currentRate)} effective on ${usd(bridge.monthlyVolume, 0)}`}
                          value={usd(bridge.currentMonthlyCost)}
                          strong
                        />
                        <BridgeRow
                          label="Interchange (pass-through, at cost)"
                          formula={`≈ ${pct(bridge.assumedInterchangeRate)} of ${usd(bridge.monthlyVolume, 0)} volume`}
                          value={usd(bridge.interchange)}
                        />
                        <BridgeRow
                          label="321 Swipe markup"
                          formula={`${bridge.markupBps} bps × ${usd(bridge.monthlyVolume, 0)}`}
                          value={usd(bridge.markup)}
                        />
                        <BridgeRow
                          label="Per-transaction fee"
                          formula={`${usd(bridge.perTxnDollars)} × ${bridge.transactionCount.toLocaleString()} txns`}
                          value={usd(bridge.perTxn)}
                        />
                        <BridgeRow
                          label="Monthly account fee"
                          formula="flat"
                          value={usd(bridge.monthlyFee)}
                        />
                        <BridgeRow
                          label="Proposed monthly cost"
                          formula="interchange + markup + per-txn + monthly fee"
                          value={usd(bridge.proposedCost)}
                          strong
                        />
                        <BridgeRow
                          label="Your monthly savings"
                          formula={`${usd(bridge.currentMonthlyCost)} − ${usd(bridge.proposedCost)}`}
                          value={usd(bridge.monthlySavings)}
                          strong
                          accent
                        />
                      </tbody>
                    </table>
                  </section>

                  {/* Effective rate comparison */}
                  <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
                    <SectionHeader>Effective rate — current vs. proposed</SectionHeader>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg border bg-gray-50 p-4">
                        <p className="text-xs text-muted-foreground">Current</p>
                        <p className="text-2xl font-bold mt-1">{pct(bridge.currentRate)}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs text-emerald-700">Proposed</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">{pct(bridge.proposedRate)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      A {pct(bridge.savingsPctOfCurrent)} reduction in what you pay to process the same
                      {' '}{usd(bridge.monthlyVolume, 0)} in monthly volume.
                    </p>
                  </section>

                  {/* Methodology / logic followed */}
                  <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
                    <SectionHeader className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-blue-600" /> Logic followed
                    </SectionHeader>
                    <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                      <li>Anchored to your actual statement{a?.statement_period ? ` (${a.statement_period})` : ''} — volume, fees, and transaction count are taken as entered.</li>
                      <li>Computed your current effective rate as total fees ÷ monthly volume.</li>
                      <li>Repriced the same volume under interchange-plus: interchange at cost, plus a transparent {bridge.markupBps} bps markup, {usd(bridge.perTxnDollars)}/transaction, and a {usd(bridge.monthlyFee)} monthly fee.</li>
                      <li>Held interchange constant (it&apos;s the wholesale cost every processor pays), so the savings come entirely from a lower, visible markup.</li>
                      <li>Reported savings conservatively — clamped to zero if repricing didn&apos;t beat your current cost.</li>
                    </ol>
                  </section>

                  {/* Assumptions rationale */}
                  {a && a.assumptions.length > 0 && (
                    <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
                      <SectionHeader className="flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 text-blue-600" /> Assumptions behind these numbers
                      </SectionHeader>
                      <ul className="space-y-1.5 text-xs text-muted-foreground">
                        {a.assumptions.map((s, i) => (
                          <li key={i} className="flex gap-1.5"><span>•</span><span>{s}</span></li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              ) : (
                <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
                  <SectionHeader className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-blue-600" /> How we calculate your savings
                  </SectionHeader>
                  <p className="text-sm text-muted-foreground">
                    A full, worked cost-savings analysis — line by line — is available after we review
                    your statement. We don&apos;t estimate a savings figure until we&apos;ve confirmed
                    your actual volume, fees, and card mix.
                  </p>
                </section>
              )}
            </IntelligenceGuard>

            {/* Contact us (screen only) */}
            <section className="bg-white rounded-xl border shadow-sm p-6 mt-6 no-print">
              <h2 className="text-lg font-semibold mb-1">Contact us</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Have a question about your proposal? We&apos;ll get back to you shortly.
              </p>
              <ProposalContactForm token={token} />
            </section>
          </div>
        </div>

        <footer className="text-center text-xs text-muted-foreground py-6">
          321 Swipe · Payment Intelligence
        </footer>
      </main>
    </div>
  )
}

// ---- Sub-components ----

function Kpi({ label, value, accent, icon }: { label: string; value: string; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50'}`}>
      <p className={`text-xs font-medium flex items-center gap-1 ${accent ? 'text-emerald-700' : 'text-muted-foreground'}`}>
        {icon}{label}
      </p>
      <p className={`text-xl font-bold mt-1 ${accent ? 'text-emerald-700' : ''}`}>{value}</p>
    </div>
  )
}

function SectionBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0f1e3d] text-white px-6 py-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide">{children}</h2>
    </div>
  )
}

function SectionHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-lg font-semibold mb-4 ${className}`}>{children}</h2>
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <tr>
      <td className="py-2.5 px-6 text-muted-foreground">{label}</td>
      <td className={`py-2.5 px-6 text-right ${strong ? 'font-semibold' : ''} ${accent ? 'text-emerald-700' : ''}`}>{value}</td>
    </tr>
  )
}

function BridgeRow({ label, formula, value, strong, accent }: { label: string; formula: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <tr>
      <td className="py-2.5 pr-3">
        <span className={`block ${strong ? 'font-semibold' : ''}`}>{label}</span>
        <span className="block text-xs text-muted-foreground">{formula}</span>
      </td>
      <td className={`py-2.5 text-right align-top whitespace-nowrap ${strong ? 'font-semibold' : ''} ${accent ? 'text-emerald-700' : ''}`}>{value}</td>
    </tr>
  )
}

function ConfidenceBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <ShieldCheck className="h-3.5 w-3.5" /> Calculated
    </span>
  )
}

function NotAvailable() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm text-center space-y-3 bg-white rounded-xl border shadow-sm p-8">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">321 Swipe</p>
        <h1 className="text-lg font-semibold">This proposal isn&apos;t available</h1>
        <p className="text-sm text-muted-foreground">
          This proposal link is invalid or has been removed. If you believe this is a mistake,
          please contact the person who shared it with you.
        </p>
      </div>
    </div>
  )
}
