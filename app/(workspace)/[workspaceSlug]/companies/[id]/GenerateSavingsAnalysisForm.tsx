'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calculator, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateSavingsCertificateAction } from '@/modules/proposals/actions/savings-certificate.actions'

interface Props {
  companyId: string
}

interface SuccessState {
  downloadUrl:    string
  monthlySavings: number
  annualSavings:  number
  hasSavings:     boolean
}

function usd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function GenerateSavingsAnalysisForm({ companyId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [monthlyVolume, setMonthlyVolume] = useState('')
  const [currentMonthlyFees, setCurrentMonthlyFees] = useState('')
  const [transactionCount, setTransactionCount] = useState('')
  const [interchangePct, setInterchangePct] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SuccessState | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.set('companyId', companyId)
    formData.set('monthlyVolume', monthlyVolume)
    formData.set('currentMonthlyFees', currentMonthlyFees)
    formData.set('transactionCount', transactionCount)
    if (interchangePct.trim()) formData.set('assumedInterchangePct', interchangePct.trim())

    startTransition(async () => {
      const res = await generateSavingsCertificateAction(formData)
      if (res.success) {
        setResult(res.data)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Calculator className="h-3.5 w-3.5 mr-1" />
        Generate Savings Analysis
      </Button>
    )
  }

  return (
    <div className="rounded-md border p-3 space-y-3 w-full max-w-md">
      <p className="text-xs text-muted-foreground">
        Enter the prospect&apos;s key statement figures. Savings are computed against 321 Swipe&apos;s
        interchange-plus pricing — an estimate, not a binding quote.
      </p>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs font-medium">
          Monthly processing volume ($)
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={monthlyVolume}
            onChange={e => setMonthlyVolume(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="100000"
          />
        </label>
        <label className="text-xs font-medium">
          Current monthly fees ($)
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={currentMonthlyFees}
            onChange={e => setCurrentMonthlyFees(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="3200"
          />
        </label>
        <label className="text-xs font-medium">
          Monthly transaction count
          <input
            type="number" min="0" step="1" inputMode="numeric"
            value={transactionCount}
            onChange={e => setTransactionCount(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="2000"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Assumed interchange rate (%) — optional, defaults to 1.8%
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={interchangePct}
            onChange={e => setInterchangePct(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="1.8"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={pending}>
          {pending
            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            : <Calculator className="h-3.5 w-3.5 mr-1" />}
          {pending ? 'Generating…' : 'Generate Certificate'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm space-y-1">
          {result.hasSavings ? (
            <>
              <p className="font-semibold text-emerald-700">
                Estimated savings: {usd(result.monthlySavings)}/mo · {usd(result.annualSavings)}/yr
              </p>
            </>
          ) : (
            <p className="font-medium text-gray-700">
              No savings identified at the figures provided. The certificate was still generated.
            </p>
          )}
          <a
            href={result.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Download savings certificate <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  )
}
