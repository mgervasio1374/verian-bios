import { getPublicProposalByToken } from '@/modules/proposals/services/public-proposal.service'
import { PrintButton, ProposalContactForm } from './ProposalClient'
import { ShieldCheck, TrendingDown, AlertTriangle } from 'lucide-react'

interface PageProps {
  params: Promise<{ token: string }>
}

function usd(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}

function pct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(2)}%`
}

export default async function HostedProposalPage({ params }: PageProps) {
  const { token } = await params
  const proposal = await getPublicProposalByToken(token)

  if (!proposal) return <NotAvailable />

  const a = proposal.analysis
  const monthly = proposal.estimatedSavings ?? a?.estimated_savings_monthly ?? 0
  const annual  = proposal.annualSavings ?? a?.estimated_savings_annual ?? 0
  const hasSavings = monthly > 0

  const volume = a?.monthly_volume_estimate ?? null
  const currentRate = a?.effective_rate_estimate ?? null
  const proposedCost = typeof a?.extracted_fields?.proposed_monthly_cost === 'number'
    ? (a.extracted_fields.proposed_monthly_cost as number)
    : null
  const proposedRate = proposedCost != null && volume != null && volume > 0 ? proposedCost / volume : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print stylesheet — render cleanly to paper */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-card { box-shadow: none !important; border-color: #e5e7eb !important; break-inside: avoid; }
        }
      `}</style>

      {/* Brand header */}
      <header className="bg-[#1d4ed8] text-white">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold tracking-tight">321 SWIPE</p>
            <p className="text-sm text-blue-100">Merchant Processing Solutions</p>
          </div>
          <PrintButton />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Headline */}
        <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Savings Proposal
          </p>
          <h1 className="text-2xl font-bold mt-1">{proposal.companyName ?? 'Your Business'}</h1>

          {hasSavings ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                  <TrendingDown className="h-3.5 w-3.5" /> Estimated monthly savings
                </p>
                <p className="text-3xl font-bold text-emerald-700 mt-1">{usd(monthly)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                <p className="text-xs text-emerald-700 font-medium">Estimated annual savings</p>
                <p className="text-3xl font-bold text-emerald-700 mt-1">{usd(annual)}</p>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-lg bg-gray-50 border p-4 text-sm text-gray-700">
              At the figures provided, your current pricing is already competitive. A full
              statement review can surface fee categories and card-mix detail that may change this.
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Current effective rate: </span>
              <span className="font-semibold">{pct(currentRate)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Proposed effective rate: </span>
              <span className="font-semibold text-emerald-700">{pct(proposedRate)}</span>
            </div>
          </div>
        </section>

        {/* Plain-English explanations */}
        <section className="bg-white rounded-xl border shadow-sm p-6 space-y-5 print-card">
          <h2 className="text-lg font-semibold">How we calculated your savings</h2>

          <Explainer title="What is interchange?">
            Interchange is the wholesale fee that Visa and Mastercard charge on every transaction.
            Every processor pays the same interchange — it&apos;s not something anyone can discount.
            The difference between processors is the markup they add on top.
          </Explainer>

          <Explainer title="Why interchange-plus saves you money">
            Many processors bundle interchange and their markup into one blended rate, which hides
            how much margin they keep. With interchange-plus, you pay interchange (at cost) plus a
            small, fixed, fully transparent markup — so every dollar of interchange savings stays
            with you.
          </Explainer>

          <Explainer title="How we got to your number">
            Using your statement figures, we estimated your current effective rate
            ({pct(currentRate)} of {usd(volume, 0)} in monthly volume) and compared it against your
            cost under 321 Swipe&apos;s interchange-plus pricing. The difference is your estimated
            savings.
          </Explainer>
        </section>

        {/* Figures table */}
        {a && (
          <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
            <h2 className="text-lg font-semibold mb-4">Your statement figures</h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Figure label="Monthly volume" value={usd(volume, 0)} />
              <Figure label="Current monthly fees" value={usd(a.total_fees_estimate)} />
              <Figure label="Monthly transactions" value={a.transaction_count_estimate?.toLocaleString() ?? '—'} />
              <Figure label="Current effective rate" value={pct(currentRate)} />
              <Figure label="Proposed monthly cost" value={usd(proposedCost)} />
              <Figure label="Proposed effective rate" value={pct(proposedRate)} />
            </dl>
          </section>
        )}

        {/* Proposed pricing card */}
        {a && (
          <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" /> Proposed 321 Swipe pricing
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Interchange-plus — fully transparent.</p>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Figure label="Processing markup" value={`${a.proposed_basis_points} bps (${(a.proposed_basis_points / 100).toFixed(2)}%)`} />
              <Figure label="Per-transaction fee" value={`$${(a.proposed_per_txn_cents / 100).toFixed(2)}`} />
              <Figure label="Monthly account fee" value={usd(a.proposed_monthly_fee)} />
              <Figure label="Pricing model" value="Interchange-Plus" />
            </dl>
          </section>
        )}

        {/* What happens next */}
        <section className="bg-white rounded-xl border shadow-sm p-6 print-card">
          <h2 className="text-lg font-semibold mb-3">What happens next</h2>
          <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
            <li>Review this proposal — print or save a copy for your records.</li>
            <li>Have a question? Send us a message below and our team will follow up.</li>
            <li>We&apos;ll walk through your full statement, confirm your savings, and finalize pricing.</li>
            <li>If you&apos;re ready, we handle the switch — usually 1–2 business days.</li>
          </ol>
        </section>

        {/* Contact us */}
        <section className="bg-white rounded-xl border shadow-sm p-6 print-card no-print">
          <h2 className="text-lg font-semibold mb-1">Contact us</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Have a question about your proposal? We&apos;ll get back to you shortly.
          </p>
          <ProposalContactForm token={token} />
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

        <footer className="text-center text-xs text-muted-foreground py-4">
          321 Swipe · Merchant Processing Solutions
        </footer>
      </main>
    </div>
  )
}

// ---- Sub-components ----

function Explainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600 mt-1 leading-relaxed">{children}</p>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
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
